import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  PERIOD_PRESETS,
  type OverviewQuery,
  type ShowroomFinding,
  type Viewer,
} from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

import { Finding } from "@/showroom/parts";

/**
 * SALES FLOW'S FINDINGS: ONE SENTENCE, ITS COUNT IN IT (the owner, 2026-10-23).
 *
 * The findings screen printed three lines and a citation per finding ("22
 * records · statistical association · n = 22 meetings") and only two fit the
 * screen. A finding on Sales Flow and Sales Agents (`measured`) is now its
 * sentence, one short line and its way on. With the citation gone, the page
 * rule "no verdict without a sample size" is held here: every finding those
 * two routes draw carries its own sample size in the words on screen.
 */

const repo = new SyntheticObserverRepository();
const at = (viewer: unknown, tenantSlug: string, projectSlug: string) =>
  PERIOD_PRESETS.map((period): OverviewQuery => ({
    viewer: viewer as Viewer,
    tenantSlug,
    projectSlug,
    period,
    language: DEFAULT_LANGUAGE,
  }));
const CELLS = [
  ...at(VIEWERS.developerShark, "shark", "shark-residence"),
  ...at(VIEWERS.developer, "alpha", "northgate"),
  ...at(VIEWERS.developer, "alpha", "riverside"),
  ...at(VIEWERS.developer, "alpha", "ister-tower"),
  ...at(VIEWERS.agencyManager, "beta", "kingsford"),
];

/** The one line `Finding` prints under the sentence. */
const subLine = (f: ShowroomFinding) => (f.baseline === null ? f.soWhat : `against ${f.baseline}`);
/** What `Finding` prints: the sentence and its one line. */
const onScreen = (f: ShowroomFinding) => `${f.statement} ${subLine(f)}`;
/** A count as written, thousands separators and all. */
const carries = (text: string, n: number) =>
  new RegExp(`(^|\\D)${String(n)}(\\D|$)`).test(text.replace(/(\d)[\s,.](?=\d{3})/g, "$1"));
/** Words, not tokens: the "&" in "Time & weather" is not one. */
const words = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

describe("a finding on Sales Flow and Sales Agents", () => {
  it("prints its own sample size in the sentence or its one line", async () => {
    let seen = 0;
    for (const query of CELLS) {
      const findings = [
        ...(await repo.getSalesFlow(query)).findings,
        ...(await repo.getAgentsView(query)).findings,
      ];
      for (const finding of findings) {
        seen += 1;
        expect(carries(onScreen(finding), finding.sampleSize), onScreen(finding)).toBe(true);
      }
    }
    expect(seen, "the cells draw findings at all").toBeGreaterThan(0);
  });

  it("is short on Sales Flow: a sentence of fourteen words at most, a line of ten", async () => {
    for (const query of CELLS) {
      for (const finding of (await repo.getSalesFlow(query)).findings) {
        expect(words(finding.statement), finding.statement).toBeLessThanOrEqual(14);
        expect(words(finding.soWhat), finding.soWhat).toBeLessThanOrEqual(10);
        expect(finding.statement).not.toMatch(/worth watching|not only the pipeline/);
      }
    }
  });

  it("draws no citation line, and keeps its way on", async () => {
    const [query] = CELLS;
    if (query === undefined) throw new Error("no cell");
    const finding = (await repo.getSalesFlow(query)).findings.find((f) => f.nextStep !== null);
    if (finding === undefined) throw new Error("Shark draws no finding with a way on");
    const html = renderToStaticMarkup(
      createElement(Finding, { finding, period: "quarter_to_date", measured: true }),
    );
    expect(html).not.toMatch(/records ·|n = \d|iris-evidence/);
    expect(html).toContain(`>${finding.nextStep?.label ?? ""}</a>`);
    expect(html.match(/<p /g)).toHaveLength(finding.caveat === null ? 2 : 3);
  });
});

describe("a finding wherever the shared Finding draws it", () => {
  /*
   * Sales Agents, Project and Presentation print the same sentence and one
   * line. A baseline that was a count read "against 59 meetings reached them"
   * there, and replaced why the finding matters (review, 2026-10-23).
   */
  it("is short, and its line is a comparison or why it matters, never a bare count", async () => {
    let seen = 0;
    for (const query of CELLS) {
      const findings = [
        ...(await repo.getSalesFlow(query)).findings,
        ...(await repo.getAgentsView(query)).findings,
        ...(await repo.getProjectView(query, null)).findings,
        ...(
          await repo.getPresentationIntelligence(query, {
            mode: "cohorts",
            left: null,
            right: null,
          })
        ).findings,
      ];
      for (const finding of findings) {
        seen += 1;
        expect(words(finding.statement), finding.statement).toBeLessThanOrEqual(14);
        expect(words(subLine(finding)), subLine(finding)).toBeLessThanOrEqual(10);
        expect(subLine(finding)).not.toMatch(/^against [\d\s,.]+(and [\d\s,.]+)?(meetings|agents)/);
      }
    }
    expect(seen, "the cells draw findings at all").toBeGreaterThan(10);
  });
});
