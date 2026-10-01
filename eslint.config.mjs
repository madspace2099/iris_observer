import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/drizzle/**",
      "**/*.config.mjs",
      /*
       * THE DELIVERED EXPORT IS EVIDENCE, NOT SOURCE.
       *
       * `_ask-reference/` and `artifacts/ask-reference/` hold the design ZIP
       * unpacked byte for byte, so the compare spec can photograph the
       * reference and the implementation side by side. Both are ignored by git.
       * Linting them reported 264 errors in code this repository must not
       * change — the moment it were reformatted it would stop being the thing
       * under comparison — and drowned the report for the code it can.
       */
      "**/_ask-reference/**",
      "artifacts/**",
      /*
       * The same for a collaborator's delivered analytics panel, read as a
       * specification of the live data and never changed: browser code this
       * repository must not lint into a failing gate. Only that folder — the
       * rest of `_review/` stays linted, so a script left there still fails.
       */
      "_review/ad-panel/**",
      /*
       * Agent tooling beside the code, not the code: the Impeccable skill's
       * scripts ship minified browser bundles, and its live mode writes state
       * directories. Neither is this repository's to lint.
       */
      ".claude/**",
      "**/.impeccable/**",
      /*
       * THE SAME RULE, FOR THE DELIVERIES THAT ARRIVED SINCE.
       *
       * `_planning/` holds the v3 task package and an onboarding-wizard
       * reference, both unpacked as delivered; `Claude outputs/` holds the
       * reviewer's own progress document. Neither is this repository's to lint,
       * and the wizard reference alone reports 228 errors in a file nobody here
       * may change — which is the same drowning the `_ask-reference` note above
       * describes. Both are excluded from git in `.git/info/exclude`.
       */
      "_planning/**",
      "Claude outputs/**",
      /*
       * Playwright's HTML report, written by a run with CI set (NIGHT2 Q2). It
       * is gitignored, and its bundled viewer failed `pnpm lint` after a local
       * CI=1 run on 2026-09-30: a run's by-product, not this repository's code.
       */
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    /*
     * A CONDITION THE TYPES ALREADY DECIDED (LANG1, 2026-09-30).
     *
     * Fourteen `context.language ?? DEFAULT_LANGUAGE` fallbacks sat on a field
     * the type required, and nothing said so: this lint was not type-aware. The
     * rule needs the type checker, so it runs on the live sources only, and not
     * on the frozen contract and sources packages, whose content this repository
     * must not change.
     */
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    ignores: ["packages/contracts/**", "packages/sources/**"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      /*
       * `warn`, not `error`. All 27 older findings were reviewed one by one on
       * 2026-10-01 with one question: can the source produce the input the
       * check guards against? Ten were dead and went, five were casts that
       * said too little and were corrected. Twelve remain, and they stay, by
       * decision (2026-10-01, MERES1):
       *
       * - Eight are foresight, not dead code. Six compare a `ProviderId` that
       *   today has one member, written for the second provider P2-01 plans
       *   (Claude): `settings/ai/actions.ts:86` (two), `settings/ai/page.tsx:635`,
       *   `lib/ai/admission.ts:312`, `lib/models/catalogue.ts:279`,
       *   `lib/providers/transport.ts:251`. One is the last member of the CRM
       *   connector list (`api/observer/connectors/sync/route.ts:59`), and one
       *   the verified-prices switch (`lib/models/catalogue.ts:61`). Removing
       *   them means putting them back when the second provider arrives:
       *   movement, risk, and nothing gained.
       * - Four guard what a DOM type or the control-flow analysis cannot see,
       *   and stay whatever else is decided: a lost WebGL context
       *   (`ask-iris/prompt-glow.ts:225`, `:274`), an insecure page without
       *   mediaDevices (`showroom/observer/useObserverVoice.ts:123`), and a
       *   flag a context-loss listener clears (`showroom/orb/particleField.ts:344`).
       *
       * Silencing a finding is not allowed, and these four cannot be expressed
       * without one, so this rule stays a warning. Do not re-open the question
       * unless one of the twelve changes.
       */
      "@typescript-eslint/no-unnecessary-condition": "warn",
    },
  },
  {
    /*
     * Repository scripts run in Node, not in a browser or a bundler.
     *
     * `console` and `process` are the whole point of a command-line tool, and
     * the base config's browser assumption reports both as undefined.
     */
    files: ["scripts/**/*.mjs", "scripts/**/*.ts"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        // Node 22+ ships these on the global object. The base config's browser
        // assumption does not know that, and reports every one as undefined.
        fetch: "readonly",
        AbortSignal: "readonly",
        URL: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
  },
);
