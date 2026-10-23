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

/** One block of the page: from its title to the next screen (ADR-0059). */
function block(title: string): string {
  const start = FLOW.indexOf(title);
  expect(start, title).toBeGreaterThan(-1);
  const end = FLOW.indexOf('className="flow-screen', start);
  expect(end, title).toBeGreaterThan(start);
  return FLOW.slice(start, end);
}

describe("Sales Flow's agents block", () => {
  /*
   * The rows, the rates and the flags read the outcome the agent recorded in
   * the room; the CRM was once named under them, a false sentence. Since the
   * owner took the source line off every screen (2026-10-23) no block names one.
   */
  it("names no source, and never the CRM", () => {
    const agents = block("How each agent&rsquo;s meetings end");
    expect(agents).not.toContain("CRM_OUTCOME_CONTEXT");
    expect(agents).not.toContain("SourceChips");
  });
});

describe("Sales Flow's bubble lens", () => {
  /*
   * The owner asked for the lead — counts and all — behind the `i` beside the
   * title (2026-10-22); his word decides over InfoTip's denominator rule here,
   * and the lens still says what it holds in view. The lead and the note are
   * the InfoTip; with nothing drawn the lead stays the card's one sentence.
   */
  it("puts its lead and note behind the i, and no count line beneath the title", () => {
    const lens = block("Which meetings are nearest a purchase, and whose");
    expect(lens).toMatch(
      /<InfoTip id="lens"[\s\S]*\{charts\.lens\.lead\}[\s\S]*\{charts\.lens\.note\}/,
    );
    expect(lens).not.toMatch(/meetings drawn/);
  });
});
