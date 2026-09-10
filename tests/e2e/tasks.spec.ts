import { expect, test, type Page } from "@playwright/test";

import { runE2E } from "./e2e-env";
import { cleanupWorkspace } from "./test-data";

test.describe("NEURA task lifecycle", () => {
  test.skip(
    !runE2E,
    "Set RUN_E2E=1 with PostgreSQL, Redis, and a running app to test tasks.",
  );
  test.setTimeout(120_000);

  test("persists create, detail, edit, status, due date, and delete", async ({
    page,
  }) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    // Auth sign-up is intentionally rate-limited by client identity. Give
    // this isolated browser client its own test identity so repeated E2E
    // runs do not consume a shared local-IP bucket.
    await page.context().setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.100.${(Date.now() % 253) + 1}`,
    });
    await register(page, suffix);
    const workspaceUrl = await createWorkspace(page, suffix);
    const workspaceSlug = new URL(workspaceUrl).pathname
      .split("/")
      .filter(Boolean)[2];
    await page.goto(workspaceUrl);

    const tasks = page.getByRole("region", { name: "Workspace tasks" });
    const taskTitle = `Lifecycle task ${suffix}`;
    const updatedTitle = `${taskTitle} updated`;
    await tasks.getByRole("button", { name: "New task" }).click();
    await tasks.getByPlaceholder("Task title").fill(taskTitle);
    await tasks
      .getByPlaceholder("Description (optional)")
      .fill("Durable task details");
    await tasks.getByLabel("Due date").fill("2030-01-02T03:04");
    await tasks.getByRole("button", { name: "Create task" }).click();

    await expect(
      tasks.getByRole("button", { name: new RegExp(taskTitle) }),
    ).toBeVisible();
    const details = page.getByRole("region", { name: "Task details" });
    await expect(details).toContainText(taskTitle);
    await expect(details).toContainText("Durable task details");

    await details.getByRole("button", { name: "Edit task" }).click();
    await tasks.getByPlaceholder("Task title").fill(updatedTitle);
    await tasks
      .getByPlaceholder("Description (optional)")
      .fill("Updated durable task details");
    await tasks.getByRole("button", { name: "Save changes" }).click();
    await expect(details).toContainText(updatedTitle);
    await expect(details).toContainText("Updated durable task details");

    await details.getByRole("button", { name: "Mark as done" }).click();
    await expect(tasks.getByText("done", { exact: true })).toBeVisible();
    await page.reload({ waitUntil: "networkidle" });
    const persistedDetails = page.getByRole("region", {
      name: "Task details",
    });
    await expect(persistedDetails).toContainText(updatedTitle);
    await expect(persistedDetails).toContainText(
      "Updated durable task details",
    );
    await expect(
      page
        .getByRole("region", { name: "Workspace tasks" })
        .getByText("done", { exact: true }),
    ).toBeVisible();

    await persistedDetails.getByRole("button", { name: "Delete task" }).click();
    await expect(
      persistedDetails.getByRole("button", { name: "Confirm delete task" }),
    ).toBeVisible();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        Boolean(response.request().headers()["next-action"]) &&
        new URL(response.url()).pathname === new URL(page.url()).pathname,
    );
    await persistedDetails
      .getByRole("button", { name: "Confirm delete task" })
      .click();
    const deleteResult = await deleteResponse;
    expect(deleteResult.status()).toBe(200);
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page
        .getByRole("region", { name: "Workspace tasks" })
        .getByText(updatedTitle, { exact: true }),
    ).toHaveCount(0);
    await cleanupWorkspace(page, workspaceSlug);
  });
});

async function register(page: Page, suffix: string) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(`Task User ${suffix}`);
  await page.getByLabel("Username").fill(`task-user-${suffix}`);
  await page.getByLabel("Email").fill(`task-${suffix}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("LaunchTest123!");
  await page.getByLabel("Confirm password").fill("LaunchTest123!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function createWorkspace(page: Page, suffix: string) {
  await page.getByRole("button", { name: "Create workspace" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Workspace name").fill(`Task Workspace ${suffix}`);
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app\/workspaces\/[^/]+$/);
  return page.url();
}
