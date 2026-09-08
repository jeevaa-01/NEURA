import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { runE2E } from "./e2e-env";

// Realtime E2E is intentionally opt-in because it requires the running app
// plus real PostgreSQL and Redis services.
type Identity = {
  displayName: string;
  username: string;
  email: string;
};

test.describe("NEURA realtime browser flows", () => {
  test.skip(
    !runE2E,
    "Set RUN_E2E=1 with PostgreSQL, Redis, and a running app to run realtime browser tests.",
  );
  test.setTimeout(180_000);

  test("delivers channels, reactions, DMs, and reconnect resync exactly once", async ({
    browser,
  }) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const userA: Identity = {
      displayName: "NEURA Realtime A",
      username: `realtime-a-${suffix}`,
      email: `realtime-a-${suffix}@example.com`,
    };
    const userB: Identity = {
      displayName: "NEURA Realtime B",
      username: `realtime-b-${suffix}`,
      email: `realtime-b-${suffix}@example.com`,
    };

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    await contextA.setExtraHTTPHeaders({
      "x-forwarded-for": `203.0.113.${(Date.now() % 253) + 1}`,
    });
    await contextB.setExtraHTTPHeaders({
      "x-forwarded-for": `203.0.114.${(Date.now() % 253) + 1}`,
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await Promise.all([register(pageA, userA), register(pageB, userB)]);

      const workspaceSlug = await createWorkspace(pageA, suffix);
      const invitationUrl = await inviteUser(pageA, workspaceSlug, userB.email);
      await acceptInvitation(pageB, invitationUrl);

      const channelUrl = await createChannel(pageA, workspaceSlug, suffix);
      await createPrivateChannel(pageA, workspaceSlug, suffix);
      await pageA.goto("/app/ai");
      const aiWorkspaceId = await pageA.locator("#ai-workspace").inputValue();
      await pageA.getByLabel("Context mode").selectOption("channel");
      await pageA
        .locator("#ai-channel")
        .selectOption({ label: `#private-${suffix}` });
      const privateChannelId = await pageA.locator("#ai-channel").inputValue();

      const knowledgeSecret = `private-neura-policy-${suffix}`;
      await pageA.goto(`/app/workspaces/${workspaceSlug}/knowledge`);
      await pageA.getByLabel("Name").fill(`private-${suffix}.md`);
      await pageA
        .getByLabel("Scope")
        .selectOption({ label: `#private-${suffix}` });
      await pageA
        .getByLabel("Content")
        .fill(`Confidential implementation detail: ${knowledgeSecret}.`);
      await pageA.getByRole("button", { name: "Index source" }).click();
      await expect(pageA.getByRole("status")).toHaveText(
        "Source indexed and ready.",
      );
      const ownerKnowledgeSearch = await pageA.request.get(
        `/api/search?q=${encodeURIComponent(knowledgeSecret)}&type=knowledge&workspaceId=${aiWorkspaceId}`,
      );
      expect(ownerKnowledgeSearch.status()).toBe(200);
      const ownerKnowledgeBody = (await ownerKnowledgeSearch.json()) as {
        items: Array<{ snippet: string }>;
      };
      expect(ownerKnowledgeBody.items).toHaveLength(1);
      expect(ownerKnowledgeBody.items[0]?.snippet).toContain(knowledgeSecret);

      const unauthorizedKnowledgeSearch = await pageB.request.get(
        `/api/search?q=${encodeURIComponent(knowledgeSecret)}&type=knowledge&workspaceId=${aiWorkspaceId}`,
      );
      expect(unauthorizedKnowledgeSearch.status()).toBe(200);
      expect(
        ((await unauthorizedKnowledgeSearch.json()) as { items: unknown[] })
          .items,
      ).toEqual([]);
      const unauthorizedChannelKnowledgeSearch = await pageB.request.get(
        `/api/search?q=${encodeURIComponent(knowledgeSecret)}&type=knowledge&workspaceId=${aiWorkspaceId}&channelId=${privateChannelId}`,
      );
      expect(unauthorizedChannelKnowledgeSearch.status()).toBe(403);

      const privateContextAttempt = await pageB.request.post("/api/ai/chat", {
        data: {
          workspaceId: aiWorkspaceId,
          channelId: privateChannelId,
          contextMode: "channel",
          content: "Read the private channel messages.",
        },
      });
      expect(privateContextAttempt.status()).toBe(403);
      await pageA.goto(channelUrl);
      await pageB.goto(channelUrl);
      await waitForRealtime(pageA, "channel");
      await waitForRealtime(pageB, "channel");

      const notificationStream = pageB.waitForRequest(
        (request) =>
          request.url().endsWith("/api/realtime/notifications") &&
          request.method() === "GET",
      );
      await pageB.goto("/app/notifications");
      await notificationStream;
      await expect(
        pageB.getByRole("heading", { name: "Notifications", exact: true }),
      ).toBeVisible();

      const mentionMessage = `Realtime mention ${suffix} @${userB.username}`;
      await messageInput(pageA, "channel").fill(mentionMessage);
      await pageA.getByRole("button", { name: "Send" }).click();
      await expect(
        pageA.getByText(mentionMessage, { exact: true }),
      ).toBeVisible();

      const mentionTitle = `${userA.displayName} mentioned you`;
      const mention = pageB.getByText(mentionTitle, { exact: true });
      await expect(mention).toBeVisible({ timeout: 15_000 });
      await expect(mention).toHaveCount(1);
      const mentionRow = mention.locator(
        "xpath=ancestor::div[contains(@class, 'group')][1]",
      );
      await expect(
        mentionRow.getByText("Unread", { exact: true }),
      ).toBeVisible();
      const mentionLink = mentionRow.getByRole("link");
      await expect(mentionLink).toHaveAttribute(
        "href",
        new RegExp(
          `/app/workspaces/${workspaceSlug}/channels/realtime-${suffix}\\?messageId=`,
        ),
      );
      await mentionLink.click();
      await expect(pageB).toHaveURL(
        new RegExp(
          `/app/workspaces/${workspaceSlug}/channels/realtime-${suffix}\\?messageId=`,
        ),
      );
      await expect(
        pageB.getByText(mentionMessage, { exact: true }).first(),
      ).toBeVisible();

      await pageB.goto("/app/notifications");
      await expect(pageB.getByText(mentionTitle, { exact: true })).toHaveCount(
        1,
      );
      await pageB.reload();
      await expect(pageB.getByText(mentionTitle, { exact: true })).toHaveCount(
        1,
      );
      const readMention = pageB
        .getByText(mentionTitle, { exact: true })
        .locator("xpath=ancestor::div[contains(@class, 'group')][1]");
      await expect(
        readMention.getByText("Unread", { exact: true }),
      ).toHaveCount(0);

      // A disabled category suppresses the corresponding notification while
      // the underlying message and activity event still persist.
      await pageB.goto("/app/settings");
      await pageB
        .getByRole("button", { name: "Notification preferences" })
        .click();
      const mentionsPreference = pageB.getByLabel("Mentions", { exact: true });
      const originalMentions = await mentionsPreference.isChecked();
      if (originalMentions) {
        const disableMentions = pageB.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            /\/app\/(?:settings|notifications)$/.test(response.url()),
        );
        await mentionsPreference.setChecked(false);
        await disableMentions;
      }

      const suppressedMention = `Suppressed mention ${suffix} @${userB.username}`;
      await pageA.goto(channelUrl);
      await waitForRealtime(pageA, "channel");
      await messageInput(pageA, "channel").fill(suppressedMention);
      await pageA.getByRole("button", { name: "Send" }).click();
      await expect(
        pageA.getByText(suppressedMention, { exact: true }),
      ).toBeVisible();
      await pageB.goto("/app/notifications");
      await expect(pageB.getByText(mentionTitle, { exact: true })).toHaveCount(
        1,
      );

      await pageB
        .getByRole("button", { name: "Notification preferences" })
        .click();
      const currentMentions = pageB.getByLabel("Mentions", { exact: true });
      if ((await currentMentions.isChecked()) !== originalMentions) {
        const restoreMentions = pageB.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            /\/app\/(?:settings|notifications)$/.test(response.url()),
        );
        await currentMentions.setChecked(originalMentions);
        await restoreMentions;
      }

      const channelMessage = `Realtime channel ${suffix}`;
      await pageA.goto(channelUrl);
      await waitForRealtime(pageA, "channel");
      await pageB.goto(channelUrl);
      await waitForRealtime(pageB, "channel");
      await messageInput(pageA, "channel").fill(channelMessage);
      await pageA.getByRole("button", { name: "Send" }).click();
      await expect(
        pageA.getByText(channelMessage, { exact: true }),
      ).toBeVisible();
      await expect(
        pageB.getByText(channelMessage, { exact: true }),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        pageB.getByText(channelMessage, { exact: true }),
      ).toHaveCount(1);

      const messageCardA = pageA
        .locator("article")
        .filter({ hasText: channelMessage })
        .first();
      const messageCardB = pageB
        .locator("article")
        .filter({ hasText: channelMessage })
        .first();
      const threadReply = `Realtime thread ${suffix}`;
      await messageCardA
        .getByRole("button", { name: "Reply", exact: true })
        .click();
      const threadPanel = pageA.getByRole("complementary", {
        name: "Message thread",
      });
      await expect(threadPanel).toBeVisible();
      await threadPanel
        .getByRole("textbox", { name: "Reply to this thread..." })
        .fill(threadReply);
      await threadPanel.locator('button[aria-busy="false"]').click();
      await expect(
        threadPanel.getByText(threadReply, { exact: true }),
      ).toBeVisible();
      await threadPanel.getByRole("button", { name: "Close thread" }).click();

      await pageB.goto("/app/search");
      const searchInput = pageB.locator("main").getByLabel("Search NEURA");
      await searchInput.fill(`Realtime mention ${suffix}`);
      await expect(
        pageB.getByText(mentionMessage, { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      const messageSearchResult = pageB
        .locator(
          `a[href^="/app/workspaces/${workspaceSlug}/channels/realtime-${suffix}?messageId="]`,
        )
        .filter({ hasText: mentionMessage });
      await expect(messageSearchResult).toHaveCount(1);

      await searchInput.fill(threadReply);
      await pageB.getByLabel("Type").selectOption("threads");
      const threadSearchResult = pageB
        .locator(
          `a[href^="/app/workspaces/${workspaceSlug}/channels/realtime-${suffix}?messageId="]`,
        )
        .filter({ hasText: threadReply });
      await expect(threadSearchResult).toBeVisible({ timeout: 15_000 });
      await expect(threadSearchResult).toHaveCount(1);
      await expect(threadSearchResult).toContainText(
        `Reply in #realtime-${suffix}`,
      );

      await searchInput.fill(`realtime-${suffix}`);
      await pageB.getByLabel("Type").selectOption("channels");
      await expect(
        pageB.locator(
          `a[href="/app/workspaces/${workspaceSlug}/channels/realtime-${suffix}"]`,
        ),
      ).toHaveCount(1);

      await searchInput.fill(`private-${suffix}`);
      await expect(pageB.getByText(/No results for/)).toBeVisible({
        timeout: 15_000,
      });
      const privateSearchResponse = await pageB.request.get(
        `/api/search?q=private-${suffix}&type=channels`,
      );
      expect(privateSearchResponse.ok()).toBe(true);
      const privateSearchBody = (await privateSearchResponse.json()) as {
        items: Array<{ title: string }>;
      };
      expect(privateSearchBody.items).toEqual([]);

      await searchInput.fill(userA.displayName);
      await pageB.getByLabel("Type").selectOption("people");
      await expect(
        pageB
          .locator('a[href^="/app/profile?userId="]')
          .filter({ hasText: userA.displayName }),
      ).toBeVisible({ timeout: 15_000 });

      const firstSearchResponse = await pageB.request.get(
        "/api/search?q=Realtime&type=messages&limit=1",
      );
      expect(firstSearchResponse.ok()).toBe(true);
      const firstSearchPage = (await firstSearchResponse.json()) as {
        items: Array<{ id: string }>;
        hasMore: boolean;
        nextCursor: string | null;
      };
      expect(firstSearchPage.items).toHaveLength(1);
      expect(firstSearchPage.hasMore).toBe(true);
      const secondSearchResponse = await pageB.request.get(
        `/api/search?q=Realtime&type=messages&limit=1&cursor=${encodeURIComponent(firstSearchPage.nextCursor!)}`,
      );
      expect(secondSearchResponse.ok()).toBe(true);
      const secondSearchPage = (await secondSearchResponse.json()) as {
        items: Array<{ id: string }>;
      };
      expect(secondSearchPage.items).toHaveLength(1);
      expect(secondSearchPage.items[0]?.id).not.toBe(
        firstSearchPage.items[0]?.id,
      );

      await pageB.goto("/app/search");
      await expect(
        pageB.getByRole("button", {
          name: `Realtime mention ${suffix}`,
          exact: true,
        }),
      ).toBeVisible();
      await pageB.reload();
      await expect(
        pageB.getByRole("button", {
          name: `Realtime mention ${suffix}`,
          exact: true,
        }),
      ).toBeVisible();

      await pageB.goto(channelUrl);
      await waitForRealtime(pageB, "channel");

      const reactionEmoji = String.fromCodePoint(0x1f44d);
      const reactionLabel = `${reactionEmoji} 1`;
      await messageCardA.hover();
      await messageCardA
        .getByRole("button", { name: reactionEmoji, exact: true })
        .click();
      await expect(messageCardA).toContainText(reactionLabel);
      await expect(messageCardB).toContainText(reactionLabel, {
        timeout: 15_000,
      });

      const realtimeRoute = "**/api/realtime**";
      await pageB.route(realtimeRoute, (route) => route.abort());
      await pageB.reload({ waitUntil: "domcontentloaded" });
      await expect(
        pageB.getByText("Reconnecting...", { exact: true }),
      ).toBeVisible({
        timeout: 15_000,
      });

      const resyncMessage = `Realtime resync ${suffix}`;
      await messageInput(pageA, "channel").fill(resyncMessage);
      await pageA.getByRole("button", { name: "Send" }).click();
      await expect(
        pageA.getByText(resyncMessage, { exact: true }),
      ).toBeVisible();

      await pageB.unroute(realtimeRoute);
      await expect(pageB.getByText("Connected", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(pageB.getByText(resyncMessage, { exact: true })).toBeVisible(
        {
          timeout: 15_000,
        },
      );
      await expect(pageB.getByText(resyncMessage, { exact: true })).toHaveCount(
        1,
      );

      await pageB.goto("/app/activity");
      await expect(
        pageB
          .getByText(`${userA.displayName} posted in #realtime-${suffix}.`, {
            exact: true,
          })
          .first(),
      ).toBeVisible();
      await pageB.reload();
      await expect(
        pageB
          .getByText(`${userA.displayName} posted in #realtime-${suffix}.`, {
            exact: true,
          })
          .first(),
      ).toBeVisible();

      await pageA.goto("/app/messages");
      await expect(pageA.getByLabel("Start a direct message")).toBeVisible();
      await pageA
        .getByLabel("Start a direct message")
        .selectOption({ label: `@${userB.username}` });
      await pageA.getByRole("button", { name: "New DM" }).click();
      await expect(pageA).toHaveURL(/\/app\/messages\/[^/]+$/);
      const conversationUrl = pageA.url();

      await pageB.goto(conversationUrl);
      await waitForRealtime(pageA, "conversation");
      await waitForRealtime(pageB, "conversation");

      const directMessage = `Realtime DM ${suffix}`;
      await messageInput(pageA, "conversation").fill(directMessage);
      await pageA.getByRole("button", { name: "Send" }).click();
      await expect(
        pageA.getByText(directMessage, { exact: true }),
      ).toBeVisible();
      await expect(pageB.getByText(directMessage, { exact: true })).toBeVisible(
        {
          timeout: 15_000,
        },
      );
      await expect(pageB.getByText(directMessage, { exact: true })).toHaveCount(
        1,
      );
    } finally {
      await closeContext(contextA);
      await closeContext(contextB);
    }
  });
});

async function register(page: Page, identity: Identity) {
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
    .fill(`Realtime Workspace ${suffix}`);
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app\/workspaces\/[^/]+$/);
  return new URL(page.url()).pathname.split("/").filter(Boolean)[2]!;
}

async function inviteUser(page: Page, workspaceSlug: string, email: string) {
  await page.goto(`/app/workspaces/${workspaceSlug}/invitations`);
  await page.getByLabel("Invitee email").fill(email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  const inviteUrl = page.getByRole("textbox", { name: "Invitation URL" });
  await expect(inviteUrl).toHaveValue(/\/invite\//);
  return inviteUrl.inputValue();
}

async function acceptInvitation(page: Page, invitationUrl: string) {
  await page.goto(invitationUrl);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL(/\/app\/workspaces\//);
}

async function createChannel(
  page: Page,
  workspaceSlug: string,
  suffix: string,
) {
  await page.goto(`/app/workspaces/${workspaceSlug}`);
  await page.getByRole("button", { name: "Create channel" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Channel name").fill(`realtime-${suffix}`);
  await dialog.getByRole("button", { name: "Create channel" }).click();
  await expect(page).toHaveURL(/\/channels\/[^/]+$/);
  return page.url();
}

async function createPrivateChannel(
  page: Page,
  workspaceSlug: string,
  suffix: string,
) {
  await page.goto(`/app/workspaces/${workspaceSlug}`);
  await page.getByRole("button", { name: "Create channel" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Channel name").fill(`private-${suffix}`);
  await dialog.locator('input[type="radio"][value="PRIVATE"]').check({
    force: true,
  });
  await dialog.getByRole("button", { name: "Create channel" }).click();
  await expect(page).toHaveURL(/\/channels\/[^/]+$/);
}

function messageInput(page: Page, kind: "channel" | "conversation") {
  return page.getByRole("textbox", {
    name: kind === "channel" ? /^Message #/ : /^Message /,
  });
}

async function waitForRealtime(page: Page, kind: "channel" | "conversation") {
  await expect(messageInput(page, kind)).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

async function closeContext(context: BrowserContext) {
  await context.close().catch(() => undefined);
}
