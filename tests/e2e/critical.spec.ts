import { expect, test } from "@playwright/test";
import { liveAIConfigured, runE2E } from "./e2e-env";

// The E2E runner is intentionally opt-in because it requires real local
// PostgreSQL, Redis, and a running application.
test.describe("NEURA V1 critical browser smoke", () => {
  test.setTimeout(60_000);
  test.skip(
    !runE2E,
    "Set RUN_E2E=1 with PostgreSQL, Redis, and a running app to run browser smoke tests.",
  );

  test("registers, reaches protected routes, and can sign out", async ({
    page,
  }) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await page.context().setExtraHTTPHeaders({
      "x-forwarded-for": `192.0.2.${(Date.now() % 253) + 1}`,
    });
    await page.goto("/register");
    await page.getByLabel("Display name").fill("NEURA E2E User");
    await page.getByLabel("Username").fill(`e2e-${suffix}`);
    await page.getByLabel("Email").fill(`e2e-${suffix}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("LaunchTest123!");
    await page.getByLabel("Confirm password").fill("LaunchTest123!");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/app$/);

    // The account menu is rendered from two responsive anchors: the global
    // rail on desktop and the header on mobile. In both modes it must stay
    // fully inside the viewport instead of being clipped by the left rail.
    const assertUserMenuFitsViewport = async () => {
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    };

    await page.locator('button[aria-haspopup="menu"]:visible').click();
    await assertUserMenuFitsViewport();
    await page.getByRole("menuitem", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await page.locator('button[aria-haspopup="menu"]:visible').click();
    await assertUserMenuFitsViewport();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await page.setViewportSize({ width: 1280, height: 720 });

    await page
      .getByRole("button", { name: "Create workspace" })
      .first()
      .click();
    const workspaceDialog = page.getByRole("dialog");
    await workspaceDialog
      .getByLabel("Workspace name")
      .fill(`E2E Workspace ${suffix}`);
    await workspaceDialog
      .getByRole("button", { name: "Create workspace" })
      .click();
    await expect(page).toHaveURL(/\/app\/workspaces\//);

    // The global sidebar must route channel creation to the first workspace
    // the current user can manage, even while the user is on /app.
    await page.goto("/app");
    await page.getByRole("link", { name: "Create channel" }).click();
    const channelDialog = page.getByRole("dialog");
    await expect(channelDialog).toBeVisible();
    await channelDialog.getByLabel("Channel name").fill(`e2e-${suffix}`);
    await channelDialog.getByRole("button", { name: "Create channel" }).click();
    await expect(page).toHaveURL(/\/channels\//);
    await page
      .getByRole("textbox", { name: /^Message #/ })
      .fill("V1 smoke message");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("V1 smoke message")).toBeVisible();
    await page
      .getByRole("button", { name: "Add channel to favorites" })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove channel from favorites" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Remove channel from favorites" }),
    ).toBeVisible();

    for (const route of [
      "/app/messages",
      "/app/activity",
      "/app/search",
      "/app/notifications",
      "/app/ai",
      "/app/agents",
      "/app/profile",
      "/app/settings",
    ]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
    }

    await page.goto("/app");
    await page
      .getByRole("button", { name: /^Notifications(?:, \d+ unread)?$/ })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Notification center" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open notification history/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close notifications" }).click();

    // Conversation-only context exercises the authenticated AI request path
    // without requiring indexed knowledge. With no provider key, the real
    // application must show its safe configuration error rather than fake a
    // successful response; with a configured key, it must render a response.
    await page.goto("/app/ai");
    await page.getByLabel("Context mode").selectOption("conversation");
    await page
      .getByRole("textbox", { name: "Ask NEURA" })
      .fill("What can you help me find?");
    await page.getByRole("button", { name: "Send question" }).click();
    if (liveAIConfigured) {
      await expect(page.getByLabel("NEURA response")).toHaveText(/\S+/, {
        timeout: 60_000,
      });
      await expect(page.getByRole("alert")).toHaveCount(0);
    } else {
      await expect(
        page.getByText(
          "NEURA AI is not configured yet. Add an OpenAI API key on the server.",
          { exact: true },
        ),
      ).toBeVisible({
        timeout: 60_000,
      });
    }

    // Exercise the no-provider action path through the real workflow UI:
    // read steps execute immediately, write steps pause for confirmation,
    // then the confirmed task persists across a fresh server render.
    await page.goto("/app/agents");
    const workflowName = `E2E action ${suffix}`;
    await page.getByLabel("Workflow name").fill(workflowName);
    await page.getByLabel("Message search").fill("V1 smoke");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await expect(
      page.getByText(`E2E action ${suffix}`, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(
      page.getByText("Confirmation required before the next workflow step", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm and continue" }).click();
    await expect(
      page.getByText("Confirmation required before the next workflow step", {
        exact: true,
      }),
    ).toBeHidden({ timeout: 30_000 });
    await expect(
      page.getByText(/Completed all 2 workflow steps\./),
    ).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(
      page.getByText("Completed all 2 workflow steps.", { exact: true }),
    ).toBeVisible();
    const taskSearch = await page.request.get(
      "/api/search?q=Review%20unresolved%20workspace%20item&type=tasks",
    );
    expect(taskSearch.status()).toBe(200);
    const taskSearchBody = (await taskSearch.json()) as {
      items: Array<{ title: string }>;
    };
    expect(
      taskSearchBody.items.some(
        (item) => item.title === "Review unresolved workspace item",
      ),
    ).toBe(true);
    await page.goto("/app/search");
    await page
      .getByRole("textbox", { name: "Search NEURA" })
      .fill("Review unresolved workspace item");
    const taskResult = page
      .getByRole("link")
      .filter({ hasText: "Review unresolved workspace item" })
      .first();
    await expect(taskResult).toBeVisible({ timeout: 15_000 });
    await taskResult.click();
    await expect(
      page.getByRole("region", { name: "Task details" }),
    ).toContainText("Review unresolved workspace item");

    // Profile edits are saved through the authenticated server action and
    // must survive a fresh server render.
    await page.goto("/app/profile");
    const updatedDisplayName = `NEURA Profile ${suffix}`;
    await page.getByLabel("Display name").fill(updatedDisplayName);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText("Profile saved.");
    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue(
      updatedDisplayName,
    );

    // Avatar bytes are validated and stored privately under the authenticated
    // user's opaque avatar route. Exercise upload, persistence, replacement,
    // rejection, and explicit removal through the real application.
    const avatarRegion = page.getByRole("region", { name: "Profile avatar" });
    const avatarInput = page.getByLabel("Avatar image");
    await avatarInput.setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    await expect(page.getByRole("status")).toContainText("Avatar updated.");
    const avatarImage = avatarRegion.locator("img");
    await expect(avatarImage).toHaveAttribute(
      "src",
      /(?:api\/account\/avatar|api%2Faccount%2Favatar).*\.png/,
    );
    const firstAvatarSrc = await avatarImage.getAttribute("src");
    expect(firstAvatarSrc).toMatch(/^\/api\/account\/avatar\/.*\.png$/);
    const avatarResponse = await page.request.get(firstAvatarSrc ?? "");
    expect(avatarResponse.status()).toBe(200);
    expect(avatarResponse.headers()["content-type"]).toBe("image/png");
    await page.reload();
    await expect(avatarRegion.locator("img")).toHaveAttribute(
      "src",
      firstAvatarSrc ?? "",
    );
    await avatarInput.setInputFiles({
      name: "avatar.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    await expect(page.getByRole("status")).toContainText("Avatar updated.");
    await expect(avatarRegion.locator("img")).toHaveAttribute(
      "src",
      /(?:api\/account\/avatar|api%2Faccount%2Favatar).*\.jpg/,
    );
    await avatarInput.setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.getByRole("status")).toContainText(
      "The avatar could not be updated.",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("status")).toContainText("Avatar removed.");
    await expect(avatarRegion.locator("img")).toHaveCount(0);

    // Notification preferences are the implemented per-user setting exposed
    // by the settings page. Wait for each server action before reloading.
    await page.goto("/app/settings");
    await page
      .getByRole("button", { name: "Notification preferences" })
      .click();
    const reactions = page.getByLabel("Reactions", { exact: true });
    const originalReactions = await reactions.isChecked();
    const saveReactions = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/app/settings"),
    );
    await reactions.setChecked(!originalReactions);
    await saveReactions;
    await page.reload();
    await page
      .getByRole("button", { name: "Notification preferences" })
      .click();
    await expect(page.getByLabel("Reactions", { exact: true })).toBeChecked({
      checked: !originalReactions,
    });

    // Restore the test user's original preference so the run leaves no
    // behavioural state behind beyond its temporary account data.
    const restoreReactions = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/app/settings"),
    );
    await page
      .getByLabel("Reactions", { exact: true })
      .setChecked(originalReactions);
    await restoreReactions;

    await page.goto("/app/profile");
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // A logged-out browser must not retain access to the protected app shell.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
    await page.goto("/app/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fprofile$/);
    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fsettings$/);

    // Wrong credentials must fail without creating a session and without
    // revealing whether the account exists.
    await page.getByLabel("Email").fill(`e2e-${suffix}@example.com`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("WrongPassword123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("Incorrect email or password.", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);

    // The original credentials must still establish a fresh session.
    await page.getByLabel("Email").fill(`e2e-${suffix}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("LaunchTest123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app$/);

    // Password-reset requests for unknown addresses stay generic, so the
    // browser cannot use this flow to enumerate accounts.
    await page.goto("/app/profile");
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(`e2e-${suffix}@example.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "If an account exists, you will receive a reset link when email delivery is available.",
    );
    await page.getByLabel("Email").fill(`unknown-${suffix}@example.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "If an account exists, you will receive a reset link when email delivery is available.",
    );

    // A token that was not issued must not change a password.
    await page.goto("/reset-password/not-a-real-token");
    await page
      .getByLabel("New password", { exact: true })
      .fill("AnotherPassword123!");
    await page.getByLabel("Confirm new password").fill("AnotherPassword123!");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(
      page.getByText(
        "This reset link is invalid or expired. Request a new one.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();

    // Account deactivation is intentionally a V1 soft lifecycle operation:
    // it revokes all sessions and preserves authored workspace history.
    await page.goto("/login");
    await page.getByLabel("Email").fill(`e2e-${suffix}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("LaunchTest123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.goto("/app/settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Deactivate account" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
  });
});
