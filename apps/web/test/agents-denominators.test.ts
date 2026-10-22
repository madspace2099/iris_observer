import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { REPORT_WORDS } from "@/components/report/words";

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
  /*
   * Since ADR-0057 the card's one figure is the read model's headline: the
   * rate set large, and beside it, always, what it is of ("progressed · 29 of
   * 36 recorded") or why there is none. The page prints both and counts nothing.
   */
  it("prints the rate with its denominator, both the read model's", () => {
    expect(ROSTER, "the rate is drawn without the caption that carries its denominator").toMatch(
      /<b className="ag-card-figure">\{a\.headline\.figure\}<\/b>[\s\S]*?<span className="ag-card-caption">\{a\.headline\.caption\}<\/span>/,
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
  /* The header's words live in the report's own table, one per language; the page reads them. */
  it("names the rate's denominator in the header, in every language", () => {
    expect(REPORT, "the rate is not drawn under the table's fourth header").toContain(
      '{ key: "progressed", label: words.agentsColumns[3], numeric: true }',
    );
    expect(REPORT_WORDS.en.agentsColumns[3], "the English header names no denominator").toBe(
      "Progressed, of meetings with an outcome",
    );
    expect(REPORT_WORDS.sk.agentsColumns[3]).toBe("Pokročilo, zo stretnutí s výsledkom");
    expect(REPORT_WORDS.hu.agentsColumns[3]).toBe(
      "Továbblépett, az eredménnyel zárult találkozókból",
    );
  });
});
