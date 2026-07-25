import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: /(layout|computed-styles|controls)\.spec\.mjs/,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    deviceScaleFactor: 2
  },
  webServer: {
    command: "node scripts/static-server.cjs",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: !process.env.CI
  }
});
