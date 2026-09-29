import { describe, expect, it } from "vitest";
import type { ShowroomSession } from "@observer/contracts";
import { DEFAULT_LANGUAGE, type ViewContext } from "@observer/readmodels";
import { VIEWERS, showroomSessions, syntheticRepository } from "../src";
import { buildSalesFlow } from "../src/showroom/views3";

/**
 * A BUCKET THE PERIOD DOES NOT HOLD HAS NO COUNT.
 *
 * Sales Flow's six windows count back from today, and they were counted from
 * the period's meetings — so a window before the period began counted nothing
 * and printed "0". Inside the last 28 days, last month read 0 and the verdict
 * said "there's no earlier comparable period yet" above 28 days of baseline;
 * the Briefing read "32 meetings this month against 0 last month" and called
 * the showroom on course. Inside a completed quarter all six read 0.
 *
 * Expected counts come from the fixture itself between dates written out here,
 * not from the slicing under test.
 */
const query = (period: "last_28_days" | "quarter_to_date" | "last_quarter") => ({
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period,
  language: DEFAULT_LANGUAGE,
});

/** Northgate's meetings from `from` to `to`, both ends included as the repository's slice does. */
const northgate = (from: string, to: string) =>
  showroomSessions().filter(
    (s) =>
      s.projectId === "prj_northgate01" &&
      Date.parse(s.startedAt) >= Date.parse(from) &&
      Date.parse(s.startedAt) <= Date.parse(to),
  ).length;

/* The synthetic world's day is Monday 24 August 2026, in Bratislava (UTC+2). */
const PREVIOUS_28_DAYS = northgate("2026-06-29T00:00:00+02:00", "2026-07-27T00:00:00+02:00");
const LAST_QUARTER = northgate("2026-04-01T00:00:00+02:00", "2026-07-01T00:00:00+02:00");
/* Last month clipped to the 24 days this month has run: 1 July up to 25 July. */
const JULY_FIRST_24_DAYS = northgate("2026-07-01T00:00:00+02:00", "2026-07-24T23:59:59.999+02:00");

describe("Sales Flow's windows inside the last 28 days", () => {
  it("leaves last month out rather than counting it as nothing", async () => {
    const flow = await syntheticRepository.getSalesFlow(query("last_28_days"));
    const inPeriod = Object.fromEntries(flow.periods.map((p) => [p.id, p.inPeriod]));
    expect(inPeriod).toEqual({
      today: true,
      yesterday: true,
      this_week: true,
      last_week: true,
      this_month: true,
      last_month: false,
    });
  });

  it("compares the period with the 28 days before it, which hold meetings", async () => {
    expect(PREVIOUS_28_DAYS, "the fixture's own baseline").toBeGreaterThan(0);
    const flow = await syntheticRepository.getSalesFlow(query("last_28_days"));
    expect(flow.verdict).not.toMatch(/no earlier comparable period/);
    expect(flow.verdict).toContain(`against ${String(PREVIOUS_28_DAYS)} the previous 28 days`);
  });

  it("gives the Briefing the same comparison instead of 'against 0 last month'", async () => {
    const home = await syntheticRepository.getHome(query("last_28_days"));
    const figure = home.figures.find((f) => f.id === "meetings");
    expect(home.because).not.toMatch(/against 0 last month/);
    expect(figure?.label).toBe("Meetings in last 28 days");
    expect(figure?.against).toBe(`${String(PREVIOUS_28_DAYS)} in the previous 28 days`);
  });
});

describe("Sales Flow's windows inside a completed quarter", () => {
  it("holds none of them", async () => {
    const flow = await syntheticRepository.getSalesFlow(query("last_quarter"));
    expect(flow.periods.every((p) => !p.inPeriod)).toBe(true);
  });

  it("gives the Briefing the quarter's meetings, not 'this month' outside it", async () => {
    const home = await syntheticRepository.getHome(query("last_quarter"));
    const figure = home.figures.find((f) => f.id === "meetings");
    expect(figure?.label).toBe("Meetings in last completed quarter");
    expect(figure?.value).toBe(String(LAST_QUARTER));
    expect(home.because).not.toMatch(/this (week|month)/);
  });
});

describe("Sales Flow's windows inside the quarter to date", () => {
  it("holds all six and counts them as before", async () => {
    const flow = await syntheticRepository.getSalesFlow(query("quarter_to_date"));
    expect(flow.periods.every((p) => p.inPeriod)).toBe(true);
    expect(flow.periods.find((p) => p.id === "last_month")?.meetings).toBe(JULY_FIRST_24_DAYS);
    expect(flow.verdict).toMatch(/this month against \d+ last month, first 24 days/);
  });

  it("leaves the Briefing on this month against last", async () => {
    const home = await syntheticRepository.getHome(query("quarter_to_date"));
    const figure = home.figures.find((f) => f.id === "meetings");
    expect(figure?.label).toBe("Meetings this month");
    expect(figure?.against).toBe(`${String(JULY_FIRST_24_DAYS)} last month`);
  });
});

/*
 * The same rule for "Presentations week by week". The week still running was a
 * point — one day old on the synthetic Monday — and was marked "±9 against the
 * week before"; a quarter ending on a Wednesday ended on a two-day week marked
 * "±4". Weeks are Monday to Monday in Bratislava; the labels are written out.
 */
describe("the weekly series inside a period", () => {
  /** Northgate's meetings in the seven days from `monday`, midnight in Bratislava (UTC+2 all summer). */
  const week = (monday: string) => {
    const from = Date.parse(`${monday}T00:00:00+02:00`);
    return showroomSessions().filter(
      (s) =>
        s.projectId === "prj_northgate01" &&
        Date.parse(s.startedAt) >= from &&
        Date.parse(s.startedAt) < from + 7 * 24 * 60 * 60 * 1000,
    ).length;
  };
  const trendOf = async (period: Parameters<typeof query>[0]) =>
    (await syntheticRepository.getFlowCharts(query(period), "month")).trend;

  it("draws only the weeks the quarter to date holds whole", async () => {
    const trend = await trendOf("quarter_to_date");
    // Not 29 June (the quarter began on the Wednesday) and not 24 August (one day old).
    expect(trend.points.map((p) => p.label)).toEqual([
      "6 Jul",
      "13 Jul",
      "20 Jul",
      "27 Jul",
      "3 Aug",
      "10 Aug",
      "17 Aug",
    ]);
    expect(trend.points.map((p) => p.value)).toEqual(
      [
        "2026-07-06",
        "2026-07-13",
        "2026-07-20",
        "2026-07-27",
        "2026-08-03",
        "2026-08-10",
        "2026-08-17",
      ].map(week),
    );
  });

  it("draws only the weeks a completed quarter holds whole", async () => {
    const trend = await trendOf("last_quarter");
    // Not 30 March (1 April was a Wednesday) and not 29 June (the quarter ended on 1 July).
    expect(trend.points[0]?.label).toBe("6 Apr");
    expect(trend.points.at(-1)?.label).toBe("22 Jun");
    expect(trend.points).toHaveLength(12);
  });
});

/*
 * And for "What those meetings became": a month the period cuts names the days
 * it holds. August on the 24th stood beside a whole July as "Aug", and its
 * shorter column read as a falling month.
 */
describe("the monthly composition inside a period", () => {
  const labels = async (period: Parameters<typeof query>[0]) =>
    (await syntheticRepository.getFlowCharts(query(period), "month")).composition.columns.map(
      (c) => c.label,
    );

  it("names the days of the month still running", async () => {
    expect(await labels("quarter_to_date")).toEqual(["Jul", "Aug 1–24"]);
  });

  it("names the days of both months the last 28 days cut", async () => {
    expect(await labels("last_28_days")).toEqual(["Jul 27–31", "Aug 1–24"]);
  });

  it("leaves the whole months of a completed quarter as they are", async () => {
    expect(await labels("last_quarter")).toEqual(["Apr", "May", "Jun"]);
  });
});

/*
 * A period that cuts a window in two. Friday 13 March 2026 in Bratislava
 * (UTC+1), a period that began on the Wednesday: this week ran from Monday, so
 * the period holds three of its days. Counting those three as "this week"
 * would be a part-week drawn as a whole one.
 */
describe("a window the period cuts across", () => {
  const session = (meetingId: string, startedAt: string): ShowroomSession =>
    ({
      sessionId: `s-${meetingId}`,
      meetingId,
      projectId: "prj_test_period_buckets", // never a real project
      agentId: "agent_test",
      channel: "showroom",
      contactId: null,
      startedAt,
      endedAt: startedAt,
      durationSeconds: 1_200,
      outcome: "follow_up_needed",
      steps: [],
      units: [],
      environment: [],
      filters: [],
      places: [],
      screenshots: 0,
      irisRating: null,
      priorMeetings: 0,
      timingUnavailable: false,
    }) as ShowroomSession;

  const context = {
    tenant: { slug: "test-tenant" },
    project: {
      id: "prj_test_period_buckets",
      slug: "test-project",
      locale: "en-GB",
      timeZone: "Europe/Bratislava",
      connectedSources: [],
    },
    period: {
      from: "2026-03-11T00:00:00+01:00",
      to: "2026-03-13T00:00:00+01:00",
      label: "Since Wednesday",
      baselineLabel: "the days before",
    },
    ownDataOnly: false,
    sessionsDelivered: true,
    language: DEFAULT_LANGUAGE,
  } as unknown as ViewContext;

  const today = new Date("2026-03-13T11:00:00Z");
  const flow = buildSalesFlow(
    context,
    [
      session("mtg_wed", "2026-03-11T10:00:00+01:00"),
      session("mtg_thu", "2026-03-12T10:00:00+01:00"),
      session("mtg_fri", "2026-03-13T09:00:00+01:00"),
    ],
    today,
    [],
  );
  const bucket = (id: string) => flow.periods.find((p) => p.id === id);

  it("counts today and yesterday, which it holds whole", () => {
    expect(bucket("today")).toMatchObject({ inPeriod: true, meetings: 1 });
    expect(bucket("yesterday")).toMatchObject({ inPeriod: true, meetings: 1 });
  });

  it("leaves this week out rather than counting three of its days", () => {
    expect(bucket("this_week")).toMatchObject({ inPeriod: false, meetings: 0 });
    expect(bucket("this_month")?.inPeriod).toBe(false);
  });

  it("reads the period whole in the verdict", () => {
    expect(flow.verdict).toMatch(/^Too early to call: 3 meetings since wednesday/);
  });
});
