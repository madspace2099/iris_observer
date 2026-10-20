import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  type OverviewQuery,
  type PeriodPreset,
  type Viewer,
} from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src";

/**
 * THE BUBBLE LENS DRAWS THE PERIOD'S RECORDED MEETINGS, AND ONLY THEM.
 *
 * The gallery drew a rehearsal at showroom pace; the product draws what was
 * recorded in the period the reader chose. So every bubble is a meeting the
 * port's own session slice holds, every meeting the rule does not size is
 * counted beside it, and a month the period starts inside says how many of
 * its days come first. Measured on Shark Residence, for every preset.
 */

const SHARK: OverviewQuery = {
  viewer: VIEWERS.developerShark as Viewer,
  tenantSlug: "shark",
  projectSlug: "shark-residence",
  period: "quarter_to_date",
  language: DEFAULT_LANGUAGE,
};
const repo = new SyntheticObserverRepository();
const CAUSAL =
  /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;

const DAYS: Readonly<Record<PeriodPreset, number>> = {
  quarter_to_date: 55,
  year_to_date: 236,
  last_28_days: 29,
  last_quarter: 91,
};

for (const period of Object.keys(DAYS) as PeriodPreset[]) {
  describe(`Shark Residence's lens, ${period}`, () => {
    const query = { ...SHARK, period };
    const read = async () => {
      const [charts, flow, radar] = await Promise.all([
        repo.getFlowCharts(query, "month"),
        repo.getSalesFlow(query),
        repo.getAgentCharts(query),
      ]);
      return { lens: charts.lens, flow, radar };
    };

    it("draws or names every meeting on the page", async () => {
      const { lens, flow } = await read();
      const { purchase, presentationOnly, unrecorded } = lens.notDrawn;
      expect(lens.meetings.length + purchase + presentationOnly + unrecorded).toBe(
        flow.meetingCount,
      );
      expect(lens.total).toBe(flow.meetingCount);
    });

    it("counts each size as the flow counts that outcome", async () => {
      const { lens, flow } = await read();
      for (const o of lens.outcomes) {
        const slice = flow.outcomes.find((s) => s.outcome === o.id);
        expect(o.count, o.id).toBe(slice?.count ?? 0);
      }
    });

    it(`has a column for each of the period's ${DAYS[period]} days, and every bubble in one`, async () => {
      const { lens } = await read();
      expect(lens.days).toHaveLength(DAYS[period]);
      for (const m of lens.meetings) {
        expect(m.d).toBeGreaterThanOrEqual(0);
        expect(m.d).toBeLessThan(lens.days.length);
      }
    });

    it("seats the agents as the radar does, so the colours agree", async () => {
      const { lens, radar } = await read();
      expect(lens.agents.map((a) => a.id)).toEqual(radar.radar.profiles.map((p) => p.id));
    });

    it("draws only recorded meetings of the period, each opening its own replay", async () => {
      const { lens } = await read();
      const slice = new Set((await repo.getSessionSlice(query)).sessions.map((s) => s.meetingId));
      for (const m of lens.meetings) {
        expect(slice.has(m.id), m.id).toBe(true);
        expect(m.href).toBe(`/shark/shark-residence/meetings/${m.id}`);
      }
    });

    it("lists at most three of the nearest, all the largest size, latest first", async () => {
      const { lens } = await read();
      const largest = lens.outcomes[0]?.id;
      const byId = new Map(lens.meetings.map((m) => [m.id, m]));
      expect(lens.nearest.length).toBeLessThanOrEqual(3);
      const order = lens.nearest.map((row) => {
        const m = byId.get(row.id);
        expect(lens.outcomes[m?.o ?? -1]?.id).toBe(largest);
        return (m?.d ?? 0) * 10_000 + Number((m?.t ?? "00:00").replace(":", ""));
      });
      expect(order).toEqual([...order].sort((a, b) => b - a));
    });

    it("says nothing causal", async () => {
      const { lens } = await read();
      for (const text of [lens.lead, lens.note, lens.summary]) expect(text).not.toMatch(CAUSAL);
    });
  });
}

describe("the months the lens steps through", () => {
  it("shades the July days before the last 28 days start", async () => {
    const { lens } = await repo.getFlowCharts({ ...SHARK, period: "last_28_days" }, "month");
    expect(lens.months[0]).toMatchObject({ label: "Jul", lead: 26, held: 5, length: 31 });
  });

  it("holds August to today in the quarter, the rest to come", async () => {
    const { lens } = await repo.getFlowCharts(SHARK, "month");
    expect(lens.months.at(-1)).toMatchObject({ label: "Aug", lead: 0, held: 24, length: 31 });
  });

  it("holds every day of a completed quarter's months", async () => {
    const { lens } = await repo.getFlowCharts({ ...SHARK, period: "last_quarter" }, "month");
    for (const m of lens.months) expect(m.held, m.long).toBe(m.length);
  });
});
