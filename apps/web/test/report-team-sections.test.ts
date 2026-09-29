import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The report's team table reads the team's own rows.
 *
 * `agents.agents[0]?.sections` was the team's table: the team's fields, on an
 * array the first agent's reach filter had already thinned. The read model
 * now carries `teamSections`, built on every meeting (`team-sections.test.ts`
 * in `packages/synthetic` proves what that holds); this is the print site.
 *
 * A source assertion, comments stripped, as the other page-claim tests do it.
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const web = resolve(import.meta.dirname, "..");
const REPORT = readFileSync(
  resolve(web, "src/app/(app)/[tenantSlug]/[projectSlug]/report/page.tsx"),
  "utf8",
)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("the report's presentation-coverage table", () => {
  it("reads the team's rows", () => {
    expect(REPORT, "the team's table does not read the read model's team rows").toMatch(
      /agents\.teamSections\.map\(/,
    );
  });

  it("no longer reads the first agent's", () => {
    expect(REPORT, "the first agent's section list still stands in for the team's").not.toMatch(
      /agents\.agents\[0\]/,
    );
  });
});
