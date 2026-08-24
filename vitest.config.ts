import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
    // Playwright owns e2e/. Vitest must not try to collect it.
    exclude: ["e2e/**", "**/node_modules/**"],
    passWithNoTests: true,
  },
});
