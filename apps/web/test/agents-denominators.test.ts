import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every share on the agent surfaces says what it is a share of.
 *
 * The roster's "% progressed" was rounded in the component with a percent
 * sign appended — the figure ADR-0012 forbids a component to compute, the
 * exact line the Flow page's docblock named when it removed it — beside a
 * centre count that was not its denominator. "Leans on … × the team's share"
 * stood on the timed meetings and did not say so, on the roster and on the
 * agent page. The report's table printed the rate under a header that named
 * no denominator.
 *
 * Source assertions on the JSX, comments stripped, as the other page-claim
 * tests do it.
 */

const web = resolve(import.meta.dirname, "..");
const markup = (path: string): string =>
  readFileSync(resolve(web, path), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const ROSTER = markup("src/app/(app)/[tenantSlug]/[projectSlug]/agents/page.tsx");
/* The head's sentence lives in `agentAnswer`, shared with the printed summary; the page calls it. */
const ANSWER = markup("src/components/agents/answer.ts");
const REPORT = markup("src/app/(app)/[tenantSlug]/[projectSlug]/report/page.tsx");

describe("the roster", () => {
  it("draws the rate through ShareFigure, with its denominator in words", () => {
    expect(ROSTER, "the rate is drawn without the component that carries its denominator").toMatch(
      /<ShareFigure[\s\S]*?share=\{a\.ring\.progressedShare\}[\s\S]*?qualifier=\{`progressed, of \$\{a\.ring\.decidedMeetings\} meetings with an outcome`\}/,
    );
  });

  it("rounds no share itself", () => {
    expect(ROSTER, "a component computes a figure (ADR-0012)").not.toMatch(
      /Math\.round\(a\.ring\.progressedShare/,
    );
  });

  it("names the set 'leans on' stands on", () => {
    expect(ROSTER, "the two shares' set is not on the card").toMatch(
      /across the \{a\.timedMeetings\} of\{" "\}\s*\{a\.meetings\} meetings the source could time end to end/,
    );
  });
});

describe("the agent page", () => {
  it("names the set the head's habit stands on", () => {
    expect(ANSWER).toContain(
      "across the ${view.profile.timedMeetings} of ${view.sampleSize} meetings the source could time end to end",
    );
  });
});

describe("the report's agents table", () => {
  it("names the rate's denominator in the header", () => {
    expect(REPORT, "the rate stands under a header that names no denominator").toContain(
      'label: "Progressed, of meetings with an outcome"',
    );
  });
});
