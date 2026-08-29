import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  /*
   * The automatic JSX runtime, so a component can be rendered in a test.
   *
   * The application never needs this — Next compiles its own JSX — but the
   * suite renders the loading and failure screens with react-dom/server to
   * assert their wording, and esbuild's default classic transform emits
   * React.createElement against an import the source correctly does not make.
   */
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      // Next's server-only marker does not resolve outside a Next build.
      // See test-support/server-only.ts for why it is stubbed rather than removed.
      "server-only": resolve(import.meta.dirname, "test-support/server-only.ts"),
      "@": resolve(import.meta.dirname, "apps/web/src"),
    },
  },
  test: {
    include: [
      "packages/**/test/**/*.test.ts",
      "apps/**/test/**/*.test.ts",
      // The migrations are tested against a real Postgres, beside what they change.
      "supabase/test/**/*.test.ts",
    ],
    /*
     * The mandatory pepper, injected once, explicitly.
     *
     * Nothing in the source falls back to a default any more, so the suite must
     * provide one. It is set in a setup file rather than in a helper so that it
     * cannot quietly become the thing production also relies on.
     */
    setupFiles: ["test-support/pepper.ts"],
    // Playwright owns e2e/. Vitest must not try to collect it.
    exclude: ["e2e/**", "**/node_modules/**"],
    passWithNoTests: true,
    /*
     * The database tests each boot a WASM Postgres and apply every migration —
     * roughly a second per case in isolation, and more when three such files
     * run in parallel. Vitest's 5s default started timing out as `supabase/test`
     * grew from one file to three, which is a fact about start-up cost rather
     * than about the code under test.
     *
     * Raised rather than narrowed to a `describe`, because the cost is in the
     * fixture and every one of those files pays it. Nothing here loops or
     * retries, so a genuinely hung test still fails; it just takes longer to
     * say so.
     */
    testTimeout: 30_000,
    /*
     * The same reasoning, for `beforeAll`. `audit-contract` builds its fixture
     * in a hook — every migration against a fresh WASM Postgres — and hooks are
     * governed by their own budget, which stayed at Vitest's 10s default and
     * started timing out as `supabase/test` grew to five PGlite files. It
     * passed alone and failed in the suite, which is the signature of a
     * fixture-cost limit rather than a defect.
     */
    hookTimeout: 30_000,
    /*
     * FOUR WORKERS, and this number was measured rather than chosen.
     *
     * ## What it fixes
     *
     * Vitest's forks pool sizes itself from `availableParallelism()` — sixteen
     * here — and each worker running a PGlite suite holds a WASM Postgres of
     * roughly a quarter of a gigabyte. Six such suites exist, so the default
     * put eighteen of them alive at once and left the machine with a megabyte
     * free. Every one of those workers reports progress to the parent over an
     * RPC with a deadline, and when the parent could not answer inside it,
     * Vitest recorded `[vitest-worker]: Timeout calling "onTaskUpdate"` as an
     * UNHANDLED ERROR and exited 1 — beside a JSON report saying 1265 passed,
     * because that reporter discards the unhandled-error list it is handed.
     *
     * ## Why four and not eight
     *
     * A bounded matrix ran the reproducing sequence three times at each of
     * default, 8, 4, 2 and 1, measuring the parent's worst event-loop stall:
     *
     *     default   527ms, 643ms, 656ms      1 runner-level exit in 3
     *     8         251ms, 728ms, 238ms      0 in 3
     *     4          75ms,  84ms, 112ms      0 in 3, then 0 in 6 more
     *     2          51ms,  37ms,  59ms      0 in 3, but 45% slower
     *     1         359ms, 127ms,  40ms      0 in 3, and 2.5x slower
     *
     * Eight is the highest count with no failures, and it is NOT the answer:
     * one of its three runs stalled for 728ms, worse than every default run.
     * Four is the highest bound where every run is far below every default
     * run, and it is also the FASTEST configuration measured — 132.8s against
     * the default's 141.3s, because thirteen workers on sixteen cores spend
     * more time contending than working.
     *
     * ## What it is not
     *
     * Not serialisation: four files still run at once. Not a suppressed error,
     * not a retry, not a raised RPC timeout — the gate still fails on a single
     * unhandled error, and `pglite-lifecycle.test.ts` still proves every
     * database is closed. `minWorkers` is set too because the forks pool keeps
     * that many processes alive independently of the maximum.
     */
    maxWorkers: 4,
    minWorkers: 4,
  },
});
