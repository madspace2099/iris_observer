import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
  },
});
