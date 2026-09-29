import { describe, expect, it } from "vitest";
import type { PeriodPreset } from "@observer/readmodels";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * THE EXECUTIVE OVERVIEW SAYS WHAT ANOTHER SCREEN CAN CONFIRM.
 *
 * Measured 2026-09-29: the overview was typed. Kingsford "held 7 meetings"
 * while `/meetings` listed 41, Riverside "38 meetings" matched no period, and
 * Northgate's two-room units "convert at half the project average" while
 * `/project` read 41% against 40%. Each figure is checked here against a
 * different read model than the one that printed it.
 */
const repo = new SyntheticObserverRepository();
const PERIODS: readonly PeriodPreset[] = [
  "last_28_days",
  "quarter_to_date",
  "last_quarter",
  "year_to_date",
];
const query = (projectSlug: string, tenantSlug: string, period: PeriodPreset, manager = false) =>
  ({
    viewer: manager ? VIEWERS.agencyManager : VIEWERS.developer,
    tenantSlug,
    projectSlug,
    period,
    language: DEFAULT_LANGUAGE,
  }) as const;

describe("the executive overview's figures", () => {
  for (const period of PERIODS) {
    it(`states Kingsford's and Riverside's meeting counts as /meetings lists them: ${period}`, async () => {
      for (const [slug, tenant, manager] of [
        ["kingsford", "beta", true],
        ["riverside", "alpha", false],
      ] as const) {
        const q = query(slug, tenant, period, manager);
        const held = (await repo.listMeetings(q)).length;
        const overview = await repo.getExecutiveOverview(q);
        const stated = [overview.verdict.headline, overview.verdict.supporting].join(" ");
        expect(stated, slug).toMatch(new RegExp(`\\b${String(held)} meetings?\\b`));
        expect(overview.funnel[0]?.fromCount, slug).toBe(held);
      }
    });

    it(`states Northgate's two-room conversion as /project reads it: ${period}`, async () => {
      const q = query("northgate", "alpha", period);
      const conversion = (await repo.getProjectView(q, "rooms-2")).selectedSegment?.conversion;
      const overview = await repo.getExecutiveOverview(q);
      expect(overview.verdict.supporting).not.toContain("half the project average");
      if (conversion?.share == null || conversion.projectShare == null || conversion.decided < 20) {
        return;
      }
      const pct = (x: number) => `${String(Math.round(x * 100))}%`;
      expect(overview.verdict.supporting).toContain(
        `progress at ${pct(conversion.share)} against the project's ${pct(conversion.projectShare)}`,
      );
      /* The reading "the price probably is not" stands only on a segment converting below the project. */
      expect(overview.verdict.supporting.includes("the price probably is not")).toBe(
        conversion.share < conversion.projectShare,
      );
    });

    it(`names the period it describes, not always "this quarter": ${period}`, async () => {
      const overview = await repo.getExecutiveOverview(query("northgate", "alpha", period));
      expect(overview.verdict.headline.includes("this quarter")).toBe(period === "quarter_to_date");
    });
  }
});
