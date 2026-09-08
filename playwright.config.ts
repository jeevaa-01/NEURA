import { defineConfig, devices } from "@playwright/test";

// Playwright is a Node-side test tool, so it reads its own optional runner
// settings directly rather than loading application runtime configuration.
// eslint-disable-next-line no-restricted-syntax
const e2eBaseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  // The real Docker target has shared state and an intentional in-memory
  // credential limiter. Serial workers keep the opt-in suite deterministic.
  workers: 1,
  fullyParallel: false,
  // eslint-disable-next-line no-restricted-syntax
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: e2eBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
