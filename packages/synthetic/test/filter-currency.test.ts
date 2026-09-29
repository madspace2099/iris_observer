import { describe, expect, it } from "vitest";
import { PROJECT_DATASETS, sessionsForProject } from "../src/showroom/sessions";

/**
 * A PRICE A BUYER FILTERED BY IS WRITTEN IN ITS PROJECT'S OWN MONEY.
 *
 * The demonstration's price filters read "under €…" on every project, and
 * Kingsford Yard is priced in pounds. The currency is the project's
 * configuration (non-negotiable 6), so the generator reads it from there. The
 * symbols below are written out, not derived from the code under test.
 */
const SYMBOL: Readonly<Record<string, string>> = {
  prj_northgate01: "€",
  prj_riversidew1: "€",
  prj_beta0000001: "£",
  prj_istertower1: "€",
};

describe("a price a buyer filtered by", () => {
  it("is in the project's own currency, on every project that has one", () => {
    let prices = 0;
    for (const { projectId } of PROJECT_DATASETS) {
      const symbol = SYMBOL[projectId];
      if (symbol === undefined) throw new Error(`no expected currency for ${projectId}`);
      for (const session of sessionsForProject(projectId)) {
        for (const filter of session.filters) {
          if (filter.field !== "price") continue;
          prices += 1;
          expect(filter.value, projectId).toMatch(new RegExp(`^under ${symbol}\\d{3},000$`));
        }
      }
    }
    expect(prices, "no price filter was generated at all").toBeGreaterThan(0);
  });

  it("names pounds on Kingsford Yard, where it used to name euros", () => {
    const kingsford = sessionsForProject("prj_beta0000001").flatMap((s) =>
      s.filters.filter((f) => f.field === "price").map((f) => f.value),
    );
    expect(kingsford.length).toBeGreaterThan(0);
    expect(kingsford.some((value) => value.includes("€"))).toBe(false);
  });
});
