import { defineConfig } from "vitest/config";
import base from "./vitest.config";

/**
 * THE RELEASE GATE: `supabase/test/release/`, and nothing else.
 *
 * These suites build the review package and check the delivered archives, and
 * both need the prepared release workspace — the gate records in `.release/`
 * and the delivered archives in `_review/`, gitignored and present on the one
 * machine that packages releases. They are kept out of `pnpm test` and CI by
 * their location (`vitest.config.ts`), and run here, by `pnpm test:release`, on
 * a clean tree with `unzip` and `sha256sum` on the path.
 *
 * Its result is a second number, reported beside the portable suite's and never
 * folded into it: a green CI says the portable tests pass, not that a release
 * may be merged. See `docs/23-phase2-acceptance.md` and the pull request
 * template.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["supabase/test/release/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
