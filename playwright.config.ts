import { defineConfig, devices } from "@playwright/test";
import {
  ASK_PER_INSTANCE_PER_DAY,
  ASK_PER_MINUTE,
  ASK_PER_VIEWER_PER_DAY,
  BREAKER_THRESHOLD,
} from "./e2e/limits";

/**
 * End-to-end checks.
 *
 * Playwright starts and stops the application itself, so the suite is a single
 * command with no server to remember. Two viewports only — a desktop the
 * developer reads the overview on, and a phone the agent reads the brief on
 * while walking to the room. Those are the two real contexts; anything between
 * them is covered by the CSS, not by a third screenshot.
 */

/**
 * A PAGE THAT REFUSES, OR FINDS NOTHING, ANSWERS 200 — ASSERT WHAT IT RENDERS.
 *
 * Pages stream, so by the time a page calls `notFound()`, or the project
 * layout draws its refusal, the status line has already gone out as 200:
 * measured on 2026-09-23 on an unknown unit, on another project's meeting
 * report and on a project the account does not hold — each answered 200 with
 * the not-found or refusal boundary and `robots=noindex`. A status assertion
 * is therefore as green on "This isn't here" as on a leak. A refusal on a page
 * is asserted by the boundary it renders — "This isn't here", "This project is
 * not available to your account.", a surface's own refusal sentence — together
 * with the absence of what must not be there. Route handlers under `/api` are
 * the exception: they answer with real status codes, and asserting those is
 * right.
 */
const PORT = 3210;

/**
 * THE DESIGN LAB'S OWN SERVER.
 *
 * `/design-lab` answers `notFound()` unless `localControlPlaneEnabled()`, which
 * needs a non-production `NODE_ENV` and `OBSERVER_LOCAL_CONTROL_PLANE=1` — by
 * design: a deployment should not have a route there at all. The suite's
 * server is `next start`, so under it the lab is a 404 and its three specs,
 * a hundred and thirty tests, could never pass on any machine. Measured on
 * 2026-09-23: under `next dev` with the flag the lab renders in about three
 * seconds, the dev server is ready in four. So the lab gets its own project
 * and its own server, on its own port.
 *
 * THE LINE THAT COMES WITH IT: the lab's green says nothing about the
 * product. Its three specs photograph and test three prototypes of the
 * MADSPACE screens — one h1, no overflow, keyboard reach, focus visibility,
 * reading order, a focus trap, an announcement — and no product surface is
 * behind any of those sixty accessibility assertions. A green lab proves the
 * prototypes; the product's accessibility is not measured by it.
 */
const LAB_PORT = 3211;

/**
 * A deployment to test against, instead of a local server.
 *
 * Set OBSERVER_BASE_URL to point the suite at a Vercel deployment. The same
 * assertions then verify the thing that was actually shipped rather than a
 * build that only ever existed on this machine — which is the difference
 * between a green suite and a working deployment.
 */
const EXTERNAL = process.env["OBSERVER_BASE_URL"];

/**
 * Off by default, so a suite run always proves the production build. Set
 * OBSERVER_REUSE=1 while iterating to skip the rebuild between runs — and read
 * `e2e/reuse-guard.ts` before you do: a reused server is asked whether it
 * carries the environment below, and the run is refused if it does not.
 */
const REUSE = process.env["OBSERVER_REUSE"] === "1";

/**
 * THE HARNESS ENVIRONMENT, GIVEN TO EVERY SERVER THIS CONFIG STARTS.
 *
 * It is what a server started by hand does not have. Three whole runs of this
 * suite measured such a server before 2026-09-23 and reported thirteen
 * failures that were the server, not the product; `e2e/reuse-guard.ts` is
 * what now refuses that.
 *
 * The demonstration ceilings, raised for the suite: one server process serves
 * all three viewport projects, and the Ask limiter and breaker are
 * per-instance by design (ADR-0026). A burst test in one project therefore
 * starved the other two: every project passed alone and seventeen tests
 * failed together, which looks like flakiness and is actually the control
 * working. Raised rather than disabled — `ask-security.spec.ts` still proves a
 * burst is stopped and a breaker opens, just with room for four hundred
 * honest requests alongside them.
 */
const HARNESS_ENV = {
  /*
   * A PEPPER THE SUITE CAN USE AND NO DEPLOYMENT CAN.
   *
   * Ask Observer refuses every question without a subject pepper, by design
   * and with no fallback — so a browser suite could not reach an answer at
   * all, and three cases that assert on one failed for a missing variable
   * rather than for anything about the product.
   *
   * What is passed here is sixty-four identical characters and a flag saying
   * who is asking. It is not a secret, it is not derived from one, it is not
   * read from the environment, it is not written to any file, and it never
   * leaves the server process. Preview and Production carry neither line, and
   * `describePepper` refuses this value wherever the flag is absent — so
   * copying this block into a deployment yields a deployment that answers
   * nothing, not one running on a published key.
   */
  /*
   * The synthetic account directory, so the suite can pass through the
   * visible sign-in. Its own switch, not the pepper harness: one flag that
   * unlocks two unrelated things is a flag nobody can reason about. Absent on
   * every deployment, where sign-in then has no directory to check a
   * credential against and refuses.
   */
  OBSERVER_DEMO_ACCOUNTS: "1",
  OBSERVER_SYNTHETIC_HARNESS: "1",
  OBSERVER_SUBJECT_PEPPER: "a".repeat(64),

  /*
   * Declared in e2e/limits.ts, beside the burst that has to exceed them.
   * Raising a ceiling here without raising the burst there is how the burst
   * test came to fire fifteen requests at a limit of thirty and pass none of
   * them.
   */
  OBSERVER_ASK_PER_MINUTE: String(ASK_PER_MINUTE),
  OBSERVER_ASK_PER_VIEWER_PER_DAY: String(ASK_PER_VIEWER_PER_DAY),
  OBSERVER_ASK_PER_INSTANCE_PER_DAY: String(ASK_PER_INSTANCE_PER_DAY),
  OBSERVER_BREAKER_THRESHOLD: String(BREAKER_THRESHOLD),

  /*
   * NO PROVIDER CREDENTIAL REACHES THE SERVER THIS SUITE STARTS.
   *
   * Blanked rather than merely unset, because `env` here is merged over the
   * parent process and this workstation has had a live key exported before —
   * a suite run inherited it and billed real requests against it. An empty
   * string is not a key, so the model layer refuses in exactly the way a
   * production deployment does.
   *
   * The credential store is left unconfigured too: no master key, no
   * Supabase, no memory-store flag. That is the fail-closed posture, and
   * `e2e/settings-ai.spec.ts` asserts what a reader meets on it. The
   * configured side is covered by the unit suite, against a synthetic master
   * key and an in-memory store.
   */
  OPENAI_API_KEY: "",

  /*
   * THE CREDENTIAL HARNESS, WITH ALL FOUR OF ITS CONDITIONS.
   *
   * The store in `lib/credentials/test-store.ts` needs this exact flag value,
   * the synthetic harness above, `OBSERVER_ENVIRONMENT` of exactly
   * "development", and no deployment marker anywhere in the environment.
   * Copying these four lines into Vercel yields a deployment with no
   * credential store, because `VERCEL` is set there and cannot be unset by an
   * .env file.
   *
   * It holds only `sk-observer-test-…` values and its probe makes no network
   * call, so the browser suite exercises connect, test, replace and remove for
   * real without a credential or a request.
   *
   * The master key is thirty-two zero bytes: valid hex, correct length, and
   * unmistakably not a secret.
   */
  OBSERVER_CREDENTIAL_TEST_STORE: "browser-tests-only",
  OBSERVER_ENVIRONMENT: "development",
  OBSERVER_CREDENTIAL_KEY: "0".repeat(64),
};

/* The three design-lab specs run on the lab project alone; see LAB_PORT. */
const LAB_SPECS = /design-lab/;

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
  // Runs after the servers are started (or reused): the reused ones are asked
  // what they carry. Without OBSERVER_REUSE it does nothing.
  globalSetup: "./e2e/reuse-guard.ts",
  use: {
    baseURL: EXTERNAL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    colorScheme: "dark",
  },
  /**
   * THE EVIDENCE OF ONE RUN SURVIVES THE NEXT.
   *
   * Playwright clears each project's `outputDir` when a run of that project
   * starts, and with one shared directory the run of one project clears the
   * traces and error contexts of every other. On 2026-09-23 the desktop
   * run's two failures — `ask-iris-compare.spec.ts` "implementation at 1280"
   * and `showroom.spec.ts` "the audience builder returns meetings, not
   * people", both a navigation to /sign-in that aborted before any assertion
   * — could not be classified, because the lab run that followed had already
   * removed their traces before anybody opened them. A directory per project
   * keeps a run's evidence until that same project runs again.
   */
  projects: [
    // 1920×1080 is the showroom-adjacent desktop the developer reviews on;
    // 1440×900 is the commonest laptop; Pixel 7 is the agent walking to a
    // meeting. Three real contexts, no arbitrary in-between breakpoints.
    {
      name: "wide",
      testIgnore: LAB_SPECS,
      outputDir: "test-results/wide",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "desktop",
      testIgnore: LAB_SPECS,
      outputDir: "test-results/desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testIgnore: LAB_SPECS,
      outputDir: "test-results/mobile",
      use: { ...devices["Pixel 7"] },
    },
    // No lab against a deployment: the route does not exist there, by design.
    ...(EXTERNAL === undefined
      ? [
          {
            name: "lab",
            testMatch: LAB_SPECS,
            outputDir: "test-results/lab",
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 1440, height: 900 },
              baseURL: `http://localhost:${LAB_PORT}`,
            },
          },
        ]
      : []),
  ],
  /**
   * Against a production build, not the dev server.
   *
   * The dev server compiles routes on demand, and under parallel load that
   * turns every first hit on a route into a timeout. It is also not what
   * anybody will run: an end-to-end suite that passes only against a
   * development build proves less than it appears to.
   *
   * The one exception is the lab's server, which has to be `next dev` because
   * the route exists only under a non-production `NODE_ENV` — see LAB_PORT.
   */
  // No local server when testing a deployment: there is nothing to start.
  ...(EXTERNAL === undefined
    ? {
        webServer: [
          {
            command: `pnpm --filter @observer/web build && pnpm --filter @observer/web start --port ${PORT}`,
            url: `http://localhost:${PORT}/sign-in`,
            reuseExistingServer: REUSE,
            timeout: 240_000,
            env: HARNESS_ENV,
          },
          {
            command: `pnpm --filter @observer/web dev --port ${LAB_PORT}`,
            url: `http://localhost:${LAB_PORT}/sign-in`,
            reuseExistingServer: REUSE,
            timeout: 120_000,
            env: { ...HARNESS_ENV, OBSERVER_LOCAL_CONTROL_PLANE: "1" },
          },
        ],
      }
    : {}),
});
