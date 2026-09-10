import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { runE2E } from "./e2e-env";
import { cleanupWorkspace } from "./test-data";

// File E2E is intentionally opt-in because it requires the running app,
// PostgreSQL, Redis, and the private storage volume.
type Identity = {
  displayName: string;
  username: string;
  email: string;
};

test.describe("NEURA private file flows", () => {
  test.skip(
    !runE2E,
    "Set RUN_E2E=1 with PostgreSQL, Redis, and a running app to test private files.",
  );
  test.setTimeout(180_000);

  test("uploads, persists, authorizes, and protects a private attachment", async ({
    browser,
    request,
  }) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const userA: Identity = {
      displayName: "NEURA Files A",
      username: `files-a-${suffix}`,
      email: `files-a-${suffix}@example.com`,
    };
    const userB: Identity = {
      displayName: "NEURA Files B",
      username: `files-b-${suffix}`,
      email: `files-b-${suffix}@example.com`,
    };
    const fileName = `neura-private-${suffix}.png`;
    const fileBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x4e, 0x45, 0x55, 0x52,
      0x41, 0x2d, 0x46, 0x49, 0x4c, 0x45,
    ]);

    let workspaceSlug: string | undefined;
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    await contextA.setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.100.${(Date.now() % 253) + 1}`,
    });
    await contextB.setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.101.${(Date.now() % 253) + 1}`,
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await Promise.all([register(pageA, userA), register(pageB, userB)]);

      workspaceSlug = await createWorkspace(pageA, suffix);
      await createChannel(pageA, workspaceSlug, suffix);
      const channelId = await channelIdFromPage(pageA);

      await pageA.getByLabel("Attach").setInputFiles({
        name: fileName,
        mimeType: "image/png",
        buffer: fileBytes,
      });
      await expect(pageA.getByText(fileName, { exact: true })).toBeVisible();
      const message = `Private file ${suffix}`;
      await messageInput(pageA).fill(message);
      await pageA.getByRole("button", { name: "Send", exact: true }).click();

      const attachmentLink = pageA
        .locator('a[href^="/api/files/"]')
        .filter({ hasText: fileName });
      await expect(attachmentLink).toBeVisible({ timeout: 15_000 });
      await expect(
        pageA.locator("article").getByText(message, { exact: true }),
      ).toBeVisible();

      const downloadPath = await attachmentLink.getAttribute("href");
      expect(downloadPath).toMatch(/^\/api\/files\/[0-9a-f-]+$/i);
      const attachmentId = downloadPath!.split("/").at(-1)!;

      const authorizedDownload = await pageA.request.get(downloadPath!);
      expect(authorizedDownload.status()).toBe(200);
      expect(authorizedDownload.headers()["content-type"]).toBe("image/png");
      expect(Buffer.compare(await authorizedDownload.body(), fileBytes)).toBe(
        0,
      );

      await pageA.reload();
      await expect(
        pageA.locator('a[href^="/api/files/"]').filter({ hasText: fileName }),
      ).toBeVisible();
      const persistedDownload = await pageA.request.get(downloadPath!);
      expect(persistedDownload.status()).toBe(200);
      expect(Buffer.compare(await persistedDownload.body(), fileBytes)).toBe(0);

      const unauthorizedDownload = await pageB.request.get(downloadPath!);
      expect(unauthorizedDownload.status()).toBe(404);

      const unauthenticatedDownload = await request.get(downloadPath!);
      expect(unauthenticatedDownload.status()).toBe(401);

      const traversal = await pageA.request.get(
        `/api/files/${encodeURIComponent("../private/secret")}`,
      );
      expect(traversal.status()).toBe(404);

      const invalidType = await pageA.request.post("/api/files/upload", {
        multipart: {
          channelId,
          files: {
            name: `neura-invalid-${suffix}.exe`,
            mimeType: "application/octet-stream",
            buffer: Buffer.from("not an allowed attachment"),
          },
        },
      });
      expect(invalidType.status()).toBe(400);

      const oversized = await pageA.request.post("/api/files/upload", {
        multipart: {
          channelId,
          files: {
            name: `neura-oversized-${suffix}.png`,
            mimeType: "image/png",
            buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
          },
        },
      });
      expect(oversized.status()).toBe(400);

      const unauthorizedRetry = await pageB.request.post(
        `/api/files/${attachmentId}/retry`,
      );
      expect(unauthorizedRetry.status()).toBe(400);
    } finally {
      await cleanupWorkspace(pageA, workspaceSlug);
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
    .fill(`Private Files Workspace ${suffix}`);
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app\/workspaces\/[^/]+$/);
  return new URL(page.url()).pathname.split("/").filter(Boolean)[2]!;
}

async function createChannel(
  page: Page,
  workspaceSlug: string,
  suffix: string,
) {
  await page.goto(`/app/workspaces/${workspaceSlug}`);
  await page.getByRole("button", { name: "Create channel" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Channel name").fill(`private-files-${suffix}`);
  await dialog.getByRole("button", { name: "Create channel" }).click();
  await expect(page).toHaveURL(/\/channels\/[^/]+$/);
  return page.url();
}

async function channelIdFromPage(page: Page) {
  const askHref = await page
    .locator("main")
    .getByRole("link", { name: "Ask NEURA", exact: true })
    .getAttribute("href");
  const channelId = new URL(askHref!, page.url()).searchParams.get("channelId");
  expect(channelId).toMatch(/^[0-9a-f-]{36}$/i);
  return channelId!;
}

function messageInput(page: Page) {
  return page.getByRole("textbox", { name: /^Message #/ });
}

async function closeContext(context: BrowserContext) {
  await context.close().catch(() => undefined);
}
