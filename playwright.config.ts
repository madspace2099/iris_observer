import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks.
 *
 * Playwright starts and stops the application itself, so the suite is a single
 * command with no server to remember. Two viewports only — a desktop the
 * developer reads the overview on, and a phone the agent reads the brief on
 * while walking to the room. Those are the two real contexts; anything between
 * them is covered by the CSS, not by a third screenshot.
 */
const PORT = 3210;

/**
 * A deployment to test against, instead of a local server.
 *
 * Set OBSERVER_BASE_URL to point the suite at a Vercel deployment. The same
 * assertions then verify the thing that was actually shipped rather than a
 * build that only ever existed on this machine — which is the difference
 * between a green suite and a working deployment.
 */
const EXTERNAL = process.env["OBSERVER_BASE_URL"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // One worker. The suite is small, and a shared Next server under parallel
  // load turns a slow first render into a timeout that looks like a bug in the
  // page rather than in the harness.
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] === undefined ? 0 : 1,
  reporter: process.env["CI"] === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: EXTERNAL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    colorScheme: "dark",
  },
  projects: [
    // 1920×1080 is the showroom-adjacent desktop the developer reviews on;
    // 1440×900 is the commonest laptop; Pixel 7 is the agent walking to a
    // meeting. Three real contexts, no arbitrary in-between breakpoints.
    {
      name: "wide",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  /**
   * Against a production build, not the dev server.
   *
   * The dev server compiles routes on demand, and under parallel load that
   * turns every first hit on a route into a timeout. It is also not what
   * anybody will run: an end-to-end suite that passes only against a
   * development build proves less than it appears to.
   */
  // No local server when testing a deployment: there is nothing to start.
  ...(EXTERNAL === undefined
    ? {
        webServer: {
          command: `pnpm --filter @observer/web build && pnpm --filter @observer/web start --port ${PORT}`,
          url: `http://localhost:${PORT}/sign-in`,
    // Off by default, so a suite run always proves the production build. Set
    // OBSERVER_REUSE=1 while iterating to skip the rebuild between runs.
          reuseExistingServer: process.env["OBSERVER_REUSE"] === "1",
          timeout: 240_000,
        },
      }
    : {}),
});
