import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Source assertions on Sales Flow's JSX, comments stripped, as the other
 * page-claim tests do it (ADR-0052, the review round).
 */
const FLOW = readFileSync(
  resolve(import.meta.dirname, "../src/app/(app)/[tenantSlug]/[projectSlug]/flow/page.tsx"),
  "utf8",
)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** One block of the page: from its title to the rule that ends it. */
function block(title: string): string {
  const start = FLOW.indexOf(title);
  expect(start, title).toBeGreaterThan(-1);
  const end = FLOW.indexOf('<hr className="iris-rule iris-section-rule" />', start);
  expect(end, title).toBeGreaterThan(start);
  return FLOW.slice(start, end);
}

describe("Sales Flow's agents block", () => {
  /*
   * The rows, the rates and the flags read the outcome the agent recorded in
   * the room. With the sources said in words, the CRM's place under them read
   * "deal stages from your CRM" on every CRM-connected project — a false
   * sentence, which the Sales Agents roster had already been cleared of.
   */
  it("names the showroom as its source, and never the CRM", () => {
    const agents = block("How each agent&rsquo;s meetings end");
    expect(agents).not.toContain("CRM_OUTCOME_CONTEXT");
    expect(agents).toMatch(
      /<SourceChips\s+sources=\{\["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"\]\}/,
    );
  });
});
