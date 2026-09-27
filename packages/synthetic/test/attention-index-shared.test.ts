import { describe, expect, it } from "vitest";
import { attentionIndexDisplay } from "@observer/metrics";
import type { PeriodPreset } from "@observer/readmodels";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS, catalogueFor, showroomSessions } from "../src/index";

/**
 * ONE ATTENTION INDEX, ON EVERY SURFACE THAT STATES IT.
 *
 * Decided 2026-09-27: one population in both shares — the stock the period ends
 * with unsold — and one implementation in the metric registry, read by
 * `/project`, `/units`, the Ask pulse and the executive overview. Northgate's
 * two-room units used to read 1.41× on `/project`, 1.39× on `/units`, a third
 * figure in Ask and a fixed 2.1 on the overview.
 */
const repo = new SyntheticObserverRepository();
const PERIODS: readonly PeriodPreset[] = [
  "last_28_days",
  "quarter_to_date",
  "last_quarter",
  "year_to_date",
];
const query = (period: PeriodPreset, projectSlug = "northgate") =>
  ({
    viewer: VIEWERS.developer,
    tenantSlug: "alpha",
    projectSlug,
    period,
    language: DEFAULT_LANGUAGE,
  }) as const;

describe("Northgate's two-room index", () => {
  for (const period of PERIODS) {
    it(`reads one number on /project, in Ask, on /units and on the overview: ${period}`, async () => {
      const project = await repo.getProjectView(query(period), null);
      const index = project.segments.find((s) => s.rooms === 2)?.index ?? null;
      expect(index, "the /project segment has an index").not.toBeNull();
      if (index === null) return;
      const shown = attentionIndexDisplay(index);

      const pulse = await repo.getProjectPulse(query(period));
      expect(pulse.segments.find((s) => s.id === "rooms-2")?.attentionIndex).toBeCloseTo(index, 10);

      const units = await repo.getUnitAttention(query(period), null);
      expect(units.findings.find((f) => f.id === "unit-segment-attention")?.baseline).toContain(
        shown,
      );

      const overview = await repo.getExecutiveOverview(query(period));
      expect(overview.verdict.supporting).toContain(shown);
      expect(overview.briefing.statements.map((s) => s.text).join(" ")).toContain(shown);
    });
  }

  it("is the unsold stock's, counted here by hand for the quarter to date", async () => {
    /*
     * Counted without the function: the catalogue's unsold units, and the
     * looking time on them in Northgate's meetings from 1 July in Bratislava to
     * the end of the synthetic day, 24 August (the slice's UTC end of today).
     */
    const unsold = catalogueFor("prj_northgate01").filter((u) => u.status !== "sold");
    const rooms = new Map(unsold.map((u) => [u.code, u.rooms]));
    const from = Date.parse("2026-07-01T00:00:00+02:00");
    const to = Date.parse("2026-08-24T23:59:59.999Z");
    let all = 0;
    let twoRoom = 0;
    for (const s of showroomSessions()) {
      const at = Date.parse(s.startedAt);
      if (s.projectId !== "prj_northgate01" || at < from || at > to) continue;
      for (const look of s.units) {
        const r = rooms.get(look.unitCode);
        if (r === undefined) continue;
        all += look.dwellSeconds;
        if (r === 2) twoRoom += look.dwellSeconds;
      }
    }
    const stockShare = unsold.filter((u) => u.rooms === 2).length / unsold.length;
    const expected = twoRoom / all / stockShare;

    const project = await repo.getProjectView(query("quarter_to_date"), null);
    expect(project.segments.find((s) => s.rooms === 2)?.index).toBeCloseTo(expected, 10);
  });
});

describe("Riverside's south-facing units above the third floor", () => {
  /*
   * The scenario was written with "1.7×" for them, and the catalogue has none:
   * every Riverside unit faces east or north. So the overview must say there is
   * nothing to index, not print a figure for flats that do not exist.
   */
  it("are not given an index the catalogue cannot support", async () => {
    const southHigh = catalogueFor("prj_riversidew1").filter(
      (u) => u.orientation === "S" && u.floor !== null && u.floor >= 4,
    );
    expect(southHigh, "the Riverside catalogue has no such unit").toHaveLength(0);

    const overview = await repo.getExecutiveOverview(query("quarter_to_date", "riverside"));
    const statements = overview.briefing.statements.map((s) => s.text).join(" ");
    expect(statements).not.toMatch(/\d×/);
    expect(statements).toContain(
      "No unsold unit faces south above the third floor, so there is no attention index to state for them.",
    );
  });
});
