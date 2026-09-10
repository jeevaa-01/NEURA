import { expect, type Page } from "@playwright/test";

/**
 * Removes only the workspace created by the current E2E test. This is
 * intentionally UI-driven: it exercises the same owner authorization as a
 * real user and cannot touch unrelated development data.
 */
export async function cleanupWorkspace(page: Page, workspaceSlug?: string) {
  if (!workspaceSlug) return;

  try {
    await page.goto(`/app/workspaces/${workspaceSlug}/settings`);
    const deleteButton = page.getByRole("button", {
      name: "Delete workspace",
    });
    if (!(await deleteButton.isVisible())) return;
    page.once("dialog", (dialog) => void dialog.accept());
    await deleteButton.click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
  } catch {
    // Cleanup must never mask the original test failure. The unique workspace
    // identifier still prevents a later run from depending on this data.
  }
}
