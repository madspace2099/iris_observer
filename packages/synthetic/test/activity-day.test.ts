import { describe, expect, it } from "vitest";
import type { ShowroomSession } from "@observer/contracts";
import { DEFAULT_LANGUAGE, type OverviewQuery, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src";
import { buildActivity } from "../src/showroom/charts";

/**
 * THE DAY, HOUR BY HOUR: THE SAME MEETINGS AS THE WEEKDAY GRID.
 *
 * Sales Flow's radial dial counts the period's meetings by the hour each
 * started, in the project's own zone. It is counted in the grid's own pass,
 * so its total is the page's meeting count and each hour is the grid's column
 * summed over the weekdays; a meeting outside the grid's hours is counted on
 * the dial only, and said to be.
 */

const SHARK: OverviewQuery = {
  viewer: VIEWERS.developerShark as Viewer,
  tenantSlug: "shark",
  projectSlug: "shark-residence",
  period: "quarter_to_date",
  language: DEFAULT_LANGUAGE,
};
const repo = new SyntheticObserverRepository();

describe("Shark Residence's day, quarter to date", () => {
  it("has twenty-four hours, which hold every meeting on the page and none outside the grid", async () => {
    const [{ activity }, flow] = await Promise.all([
      repo.getFlowCharts(SHARK, "month"),
      repo.getSalesFlow(SHARK),
    ]);
    expect(activity.day.hours).toHaveLength(24);
    expect(activity.day.hours.reduce((n, h) => n + h.count, 0)).toBe(activity.day.total);
    expect(activity.day.total).toBe(flow.meetingCount);
    expect(activity.day.outsideGrid).toBe(0);
  });

  it("agrees with the weekday grid hour by hour", async () => {
    const { activity } = await repo.getFlowCharts(SHARK, "month");
    for (const column of activity.columns) {
      const grid = activity.rows.reduce(
        (n, row) => n + (activity.cells[`${row}|${column}`] ?? 0),
        0,
      );
      expect(activity.day.hours.find((h) => h.label === column)?.count, column).toBe(grid);
    }
  });

  it("names the busiest hour as a span with its count", async () => {
    const { activity } = await repo.getFlowCharts(SHARK, "month");
    expect(activity.day.busiest).toEqual({ display: "09:00–10:00", count: 24, hours: 1 });
  });

  it("names every hour tied for the busiest, year to date", async () => {
    const { activity } = await repo.getFlowCharts({ ...SHARK, period: "year_to_date" }, "month");
    expect(activity.day.busiest?.display).toBe("09:00–10:00 and 13:00–14:00");
  });
});

describe("buildActivity, outside the grid's hours", () => {
  const at = (meetingId: string, startedAt: string): ShowroomSession => ({
    sessionId: `s-${meetingId}`,
    meetingId,
    projectId: "prj_test_activity_day",
    agentId: "agt_test",
    channel: "showroom",
    contactId: null,
    startedAt,
    endedAt: startedAt,
    durationSeconds: 1_800,
    outcome: "interested",
    steps: [],
    units: [],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  });

  /* 07:30 and 20:15 in Bratislava in March (UTC+1): the generator never draws these, a showroom can. */
  const activity = buildActivity(
    [at("early", "2026-03-12T06:30:00.000Z"), at("late", "2026-03-12T19:15:00.000Z")],
    "Europe/Bratislava",
  );

  it("counts each on the dial at its own hour", () => {
    expect(activity.day.hours[7]?.count).toBe(1);
    expect(activity.day.hours[20]?.count).toBe(1);
  });

  it("leaves both out of the grid, and says how many the grid does not hold", () => {
    expect(activity.meetingsCounted).toBe(0);
    expect(activity.day.outsideGrid).toBe(2);
  });
});
