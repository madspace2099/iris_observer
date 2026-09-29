import { describe, expect, it } from "vitest";
import { KPI_WINDOWS, DEFAULT_LANGUAGE } from "@observer/readmodels";
import type { OverviewQuery, Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * Every summary figure names the window it answers to, on the card.
 *
 * ## Why this is a test and not a convention
 *
 * Sales Flow carries two kinds of figure at once. The summary row answers to a
 * window the reader picks — today, last seven days, last thirty — and
 * everything below it answers to the page period. So "Presentations 41" sits a
 * few centimetres above an outcome ring whose centre reads 74, both counting
 * presentations, neither wrong.
 *
 * "Progressing" has named its own window since somebody worked out why it had
 * to, and said so in a comment: the chip row that sets the window is several
 * lines away, and a reader comparing two figures needs the span on the card
 * rather than up the page. The reasoning was right and it reached one figure
 * out of four. Three shipped with a qualifier that gave a comparison — "36
 * before" — and never said before *what*.
 *
 * A rule applied to one of four places is not a rule yet, and the three that
 * missed it were not visibly broken; they were only unexplainable. That is the
 * kind of gap a convention cannot hold shut.
 */

const repo = new SyntheticObserverRepository();

const PROJECTS = ["ister-tower", "northgate", "riverside"] as const;

function query(projectSlug: string): OverviewQuery {
  return {
    viewer: VIEWERS.developer as Viewer,
    tenantSlug: "alpha",
    projectSlug,
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  };
}

describe("a summary figure says which window it is counting", () => {
  it("has windows and projects to check, so the assertions below examine something", () => {
    expect(KPI_WINDOWS.length).toBeGreaterThan(1);
    expect(PROJECTS.length).toBeGreaterThan(0);
  });

  it.each(PROJECTS)("%s", async (projectSlug) => {
    for (const window of KPI_WINDOWS) {
      const charts = await repo.getFlowCharts(query(projectSlug), window.id);
      const { figures, windowLabel } = charts.kpis;

      expect(figures.length, `${projectSlug}/${window.id} drew no figures`).toBeGreaterThan(0);

      const silent = figures
        .filter((figure) => {
          const said = figure.qualifier ?? "";
          return !said.toLowerCase().includes(windowLabel.toLowerCase());
        })
        .map((figure) => `${figure.id} ("${figure.qualifier ?? "no qualifier"}")`);

      expect(
        silent,
        silent.length === 0
          ? ""
          : [
              ``,
              `These summary figures do not name their own window on the card:`,
              `  ${silent.join("\n  ")}`,
              ``,
              `The window is "${windowLabel}", and it is set by a chip row several lines`,
              `above. Everything lower on Sales Flow counts over the page period instead,`,
              `so a reader comparing the two has no way to tell why the numbers differ`,
              `unless each card says what it counted.`,
              ``,
            ].join("\n"),
      ).toEqual([]);
    }
  });
});
