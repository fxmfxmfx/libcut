import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 30_000,
  use: {
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: "client", use: { baseURL: "http://127.0.0.1:3201" } },
    { name: "local", use: { baseURL: "http://127.0.0.1:3200" } },
  ],
  webServer: [
    { command: "node scripts/e2e-server.mjs client 3201", url: "http://127.0.0.1:3201/api/tiktok/status", timeout: 30_000 },
    { command: "node scripts/e2e-server.mjs local 3200", url: "http://127.0.0.1:3200/api/tiktok/status", timeout: 30_000 },
  ],
});
