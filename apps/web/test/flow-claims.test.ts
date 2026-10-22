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

describe("Sales Flow's bubble lens", () => {
  /*
   * Its lead stands behind the `i` now. InfoTip may hide a definition, never a
   * figure's denominator: how many of the period's meetings are drawn, and how
   * many are not and why, stays a visible line.
   */
  it("keeps what it draws, and what it leaves out, in view", () => {
    const lens = block("Which meetings are nearest a purchase, and whose");
    expect(lens).toMatch(
      /\{charts\.lens\.meetings\.length\} of \{charts\.lens\.total\} meetings drawn/,
    );
    for (const part of ["purchase", "presentationOnly", "unrecorded"]) {
      expect(lens).toContain(`{charts.lens.notDrawn.${part}}`);
    }
  });
});
