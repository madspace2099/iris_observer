import { defineConfig, devices } from "@playwright/test";
import base from "../../playwright.config";

/**
 * The P2-17 dump runs on the end-to-end suite's own production server, with
 * the same harness environment, so what it reads is what the suite reads. Only
 * the first web server (the production build) is started: the lab's `next dev`
 * has nothing to do with the report.
 */
const servers = Array.isArray(base.webServer) ? base.webServer : [];

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "dump.p217.ts",
  globalSetup: undefined,
  retries: 0,
  reporter: "list",
  projects: [
    {
      name: "p217",
      outputDir: "../../test-results/p217",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: servers.slice(0, 1),
});
