import { expect, test, type Page } from "@playwright/test";

import { runE2E } from "./e2e-env";
import { cleanupWorkspace } from "./test-data";

test.describe("NEURA workflow lifecycle", () => {
  test.skip(
    !runE2E,
    "Set RUN_E2E=1 with PostgreSQL, Redis, and a running app to test workflows.",
  );
  test.setTimeout(150_000);

  test("edits, disables, enables, executes with confirmation, and archives", async ({
    page,
  }) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    // Keep this browser client's authentication bucket independent from other
    // serialized E2E flows and from earlier local runs.
    await page.context().setExtraHTTPHeaders({
      "x-forwarded-for": `203.0.113.${(Date.now() % 253) + 1}`,
    });
    await register(page, suffix);
    await createWorkspace(page, suffix);
    const workspaceSlug = new URL(page.url()).pathname
      .split("/")
      .filter(Boolean)[2];
    await page.goto("/app/agents");

    const originalName = `Lifecycle workflow ${suffix}`;
    const updatedName = `${originalName} updated`;
    await page.getByLabel("Workflow name").fill(originalName);
    await page.getByRole("button", { name: "Create workflow" }).click();
    await expect(page.getByText(originalName, { exact: true })).toBeVisible();

    let workflowRow = workflowRowFor(page, originalName);
    await workflowRow
      .getByRole("button", { name: `Edit ${originalName}` })
      .click();
    await page.getByLabel("Workflow name").fill(updatedName);
    await page.getByRole("button", { name: "Save workflow" }).click();
    await expect(page.getByText(updatedName, { exact: true })).toBeVisible();

    workflowRow = workflowRowFor(page, updatedName);
    await workflowRow.getByRole("button", { name: "Disable" }).click();
    await expect(workflowRow).toContainText("disabled");
    await expect(
      workflowRow.getByRole("button", { name: "Run", exact: true }),
    ).toBeDisabled();

    await workflowRow.getByRole("button", { name: "Enable" }).click();
    await expect(workflowRow).toContainText("ready");
    await workflowRow.getByRole("button", { name: "Run", exact: true }).click();
    await expect(
      page.getByText("Confirmation required before the next workflow step", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm and continue" }).click();
    await expect(
      page.getByText("Completed all 2 workflow steps.", { exact: false }),
    ).toBeVisible({ timeout: 45_000 });

    await page.reload();
    await expect(
      page.getByRole("button", { name: new RegExp(updatedName) }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Completed all 2 workflow steps.", { exact: false }),
    ).toBeVisible();

    workflowRow = workflowRowFor(page, updatedName);
    page.once("dialog", (dialog) => dialog.accept());
    await workflowRow
      .getByRole("button", { name: `Archive ${updatedName}` })
      .click();
    await expect(workflowRowFor(page, updatedName)).toContainText("disabled");
    await expect(
      workflowRowFor(page, updatedName).getByRole("button", {
        name: "Run",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByText("Completed all 2 workflow steps.", { exact: false }),
    ).toBeVisible();
    await cleanupWorkspace(page, workspaceSlug);
  });
});

function workflowRowFor(page: Page, name: string) {
  return page
    .locator("div")
    .filter({
      has: page.getByText(name, { exact: true }),
    })
    .filter({
      has: page.getByRole("button", { name: "Run", exact: true }),
    })
    .last();
}

async function register(page: Page, suffix: string) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(`Workflow User ${suffix}`);
  await page.getByLabel("Username").fill(`workflow-user-${suffix}`);
  await page.getByLabel("Email").fill(`workflow-${suffix}@example.com`);
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
    .fill(`Workflow Workspace ${suffix}`);
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app\/workspaces\/[^/]+$/);
}
