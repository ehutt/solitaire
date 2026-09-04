import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: /(layout|computed-styles|controls|persistence)\.spec\.mjs/,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    deviceScaleFactor: 2,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      // Computed values differ slightly by rendering engine. The targeted
      // geometry suite still runs in WebKit, which is the engine iOS ships.
      testIgnore: /computed-styles\.spec\.mjs/,
    },
  ],
  webServer: {
    command: "node scripts/static-server.cjs",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
