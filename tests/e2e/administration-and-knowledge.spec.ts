import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { runE2E } from "./e2e-env";
import { cleanupWorkspace } from "./test-data";

test.describe("NEURA administration and knowledge journey", () => {
  test.setTimeout(90_000);
  test.skip(
    !runE2E,
    "Set RUN_E2E=1 with PostgreSQL, Redis, and a running app to run browser tests.",
  );

  test("manages membership, private access, and indexed knowledge", async ({
    browser,
    page,
  }) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const owner = {
      displayName: `NEURA Owner ${suffix}`,
      username: `owner-${suffix}`,
      email: `owner-${suffix}@example.com`,
    };
    const member = {
      displayName: `NEURA Member ${suffix}`,
      username: `member-${suffix}`,
      email: `member-${suffix}@example.com`,
    };
    const pendingEmail = `pending-${suffix}@example.com`;
    let workspaceSlug: string | undefined;
    let contextB: BrowserContext | undefined;

    try {
      await page.context().setExtraHTTPHeaders({
        "x-forwarded-for": `192.0.2.${(Date.now() % 253) + 1}`,
      });
      await register(page, owner);
      workspaceSlug = await createWorkspace(page, suffix);

      await page.goto(`/app/workspaces/${workspaceSlug}/invitations`);
      await page.getByLabel("Invitee email").fill(member.email);
      await page.getByRole("button", { name: "Send invitation" }).click();
      await expect(page.getByRole("status")).toContainText(member.email);
      const memberInviteUrl = await page
        .getByRole("textbox", { name: "Invitation URL" })
        .inputValue();

      contextB = await browser.newContext({
        extraHTTPHeaders: {
          "x-forwarded-for": `198.51.100.${(Date.now() % 253) + 1}`,
        },
      });
      const pageB = await contextB.newPage();
      await register(pageB, member);
      await pageB.goto(memberInviteUrl);
      await pageB.getByRole("button", { name: "Accept invitation" }).click();
      await expect(pageB).toHaveURL(/\/app\/workspaces\//);

      // Exercise the pending invitation lifecycle independently of acceptance.
      await page.goto(`/app/workspaces/${workspaceSlug}/invitations`);
      await page.getByLabel("Invitee email").fill(pendingEmail);
      await page.getByRole("button", { name: "Send invitation" }).click();
      await expect(page.getByRole("status")).toContainText(pendingEmail);
      const pendingRow = page
        .getByText(pendingEmail, { exact: true })
        .locator("../..");
      await pendingRow.getByRole("button", { name: "Resend" }).click();
      await expect(page.getByRole("status")).toContainText(
        `Invitation refreshed for ${pendingEmail}.`,
      );
      await pendingRow.getByRole("button", { name: "Revoke" }).click();
      await expect(page.getByRole("status")).toHaveText("Invitation revoked.");
      await expect(page.getByText(pendingEmail, { exact: true })).toHaveCount(
        0,
      );

      await page.goto(`/app/workspaces/${workspaceSlug}/members`);
      await expect(
        page.getByText(member.displayName, { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel(`Role for ${member.displayName}`)
        .selectOption("ADMIN");
      await expect(page.getByRole("status")).toHaveText("Member role updated.");

      await page.goto(`/app/workspaces/${workspaceSlug}/settings`);
      const renamedWorkspace = `Admin Workspace ${suffix}`;
      await page.getByLabel("Name").fill(renamedWorkspace);
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status")).toHaveText(
        "Workspace settings saved.",
      );
      await page.reload();
      await expect(page.getByLabel("Name")).toHaveValue(renamedWorkspace);

      // Create a private channel with the invited member and verify the member
      // can resolve its protected route in a separate authenticated session.
      await page.goto(`/app/workspaces/${workspaceSlug}`);
      await page.getByRole("button", { name: "Create channel" }).click();
      const channelDialog = page.getByRole("dialog");
      const privateChannelName = `private-${suffix}`;
      await channelDialog.getByLabel("Channel name").fill(privateChannelName);
      await channelDialog
        .locator('input[type="radio"][value="PRIVATE"]')
        .check({ force: true });
      await channelDialog
        .locator("label")
        .filter({ hasText: member.displayName })
        .locator('input[type="checkbox"]')
        .check({ force: true });
      await channelDialog
        .getByRole("button", { name: "Create channel" })
        .click();
      await expect(page).toHaveURL(/\/channels\/[^/]+$/);
      const privateChannelUrl = page.url();

      await page.goto(`${privateChannelUrl}/settings`);
      const membersPanel = page
        .locator("section")
        .filter({ hasText: "Private channel members" });
      await expect(membersPanel).toContainText(member.displayName);
      await pageB.goto(privateChannelUrl);
      await expect(
        pageB.getByRole("textbox", { name: /^Message #/ }),
      ).toBeVisible();

      const knowledgeName = `QA knowledge ${suffix}.md`;
      await page.goto(`/app/workspaces/${workspaceSlug}/knowledge`);
      await page.getByLabel("Name").fill(knowledgeName);
      await page
        .getByLabel("Content")
        .fill(`NEURA QA isolation marker ${suffix}`);
      await page.getByRole("button", { name: "Index source" }).click();
      await expect(page.getByRole("status")).toHaveText(
        "Source indexed and ready.",
        { timeout: 30_000 },
      );
      await expect(
        page.getByText(knowledgeName, { exact: true }),
      ).toBeVisible();
      page.once("dialog", (dialog) => void dialog.accept());
      await page
        .getByRole("button", { name: `Delete ${knowledgeName}` })
        .click();
      await expect(page.getByRole("status")).toHaveText(
        "Knowledge source deleted.",
      );
      await expect(page.getByText(knowledgeName, { exact: true })).toHaveCount(
        0,
      );
    } finally {
      await cleanupWorkspace(page, workspaceSlug);
      await contextB?.close().catch(() => undefined);
    }
  });
});

async function register(
  page: Page,
  identity: { displayName: string; username: string; email: string },
) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(identity.displayName);
  await page.getByLabel("Username").fill(identity.username);
  await page.getByLabel("Email").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill("LaunchTest123!");
  await page.getByLabel("Confirm password").fill("LaunchTest123!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function createWorkspace(page: Page, suffix: string) {
  await page.getByRole("button", { name: "Create workspace" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Workspace name")
    .fill(`Administration Workspace ${suffix}`);
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app\/workspaces\/[^/]+$/);
  return new URL(page.url()).pathname.split("/").filter(Boolean)[2]!;
}
