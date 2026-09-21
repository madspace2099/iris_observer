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
