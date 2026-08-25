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
  },
});
