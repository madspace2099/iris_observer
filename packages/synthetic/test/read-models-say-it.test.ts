import { describe, expect, it } from "vitest";
import type { ShowroomSession } from "@observer/contracts";
import { DEFAULT_LANGUAGE, type OverviewQuery, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src";
import { buildActivity, buildKpis, buildTrend } from "../src/showroom/charts";
import { catalogueFor } from "../src/pulse";
import { dealsFor } from "../src/deals";

/**
 * THE READ MODELS SAY IT RIGHT (R9, 2026-10-23).
 *
 * The page sweep before the marketing video found figures that were right and
 * words that were not, and figures the read model got wrong on its own: a tie
 * named as one, a change with no sign, a difference of two shares in per cent,
 * a red verdict on two meetings, more matching flats than there were flats, a
 * legend's denominator from a scenario stand-in, a meeting named by its id.
 * Each is held here where the page reads it, on Shark Residence as Clara
 * Weiss reads it, or on a fixture whose answer is worked out by hand.
 */

const SHARK: OverviewQuery = {
  viewer: VIEWERS.developerShark as Viewer,
  tenantSlug: "shark",
  projectSlug: "shark-residence",
  period: "quarter_to_date",
  language: DEFAULT_LANGUAGE,
};
const repo = new SyntheticObserverRepository();

const session = (meetingId: string, startedAt: string): ShowroomSession => ({
  sessionId: `s-${meetingId}`,
  meetingId,
  projectId: "prj_test_say_it",
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

describe("the weekday grid names every tie", () => {
  it("names two tied slots whole, so 'weekday at hour' reads both", () => {
    // 12 Mar 2026 is a Thursday, 15 Mar a Sunday, 16 Mar a Monday (UTC).
    const activity = buildActivity(
      [
        session("a", "2026-03-12T13:05:00.000Z"),
        session("b", "2026-03-12T13:40:00.000Z"),
        session("c", "2026-03-15T15:10:00.000Z"),
        session("d", "2026-03-15T15:50:00.000Z"),
        session("e", "2026-03-16T10:00:00.000Z"),
      ],
      "UTC",
    );
    // Two meetings in EACH of the two slots: four together, never "2" read as the total.
    expect(activity.busiest).toEqual({
      weekday: "Thu at 13:00 and Sun",
      hour: "15:00",
      meetings: 2,
      slots: 2,
    });
    // Tue, Wed, Fri and Sat hold none: four tie, more than three, so no day is named.
    expect(activity.quietest).toBeNull();
  });

  it("joins the days of a tie at one hour, and the quietest days", () => {
    // Tue 10 and Thu 12 Mar at 14:00, Mon 9 and Wed 11 and Fri 13 at 09:00 once each.
    const activity = buildActivity(
      [
        session("a", "2026-03-10T14:00:00.000Z"),
        session("b", "2026-03-10T14:20:00.000Z"),
        session("c", "2026-03-12T14:00:00.000Z"),
        session("d", "2026-03-12T14:30:00.000Z"),
        session("e", "2026-03-09T09:00:00.000Z"),
        session("f", "2026-03-11T09:00:00.000Z"),
        session("g", "2026-03-13T09:00:00.000Z"),
      ],
      "UTC",
    );
    expect(activity.busiest).toEqual({
      weekday: "Tue and Thu",
      hour: "14:00",
      meetings: 2,
      slots: 2,
    });
    expect(activity.quietest).toEqual({ weekday: "Sat and Sun", meetings: 0, days: 2 });
  });

  it("names both of Shark Residence's busiest slots, quarter to date", async () => {
    const { activity } = await repo.getFlowCharts(SHARK, "month");
    const six = Object.entries(activity.cells).filter(([, n]) => n === activity.busiest?.meetings);
    expect(six.map(([key]) => key).sort()).toEqual(["Sun|15:00", "Thu|13:00"]);
    expect(`${activity.busiest?.weekday} at ${activity.busiest?.hour}`).toBe(
      "Thu at 13:00 and Sun at 15:00",
    );
    expect(activity.busiest?.slots).toBe(six.length);
  });
});

describe("the weekly line's change has a sign", () => {
  it("reads 10 then 3 as −7, never ±7", () => {
    // Monday 2 March and Monday 9 March 2026, UTC.
    const trend = buildTrend(
      [
        ...Array.from({ length: 10 }, (_, i) =>
          session(`w1-${i}`, `2026-03-0${2 + (i % 5)}T10:00:00.000Z`),
        ),
        ...Array.from({ length: 3 }, (_, i) => session(`w2-${i}`, `2026-03-1${i}T10:00:00.000Z`)),
      ],
      "en-GB",
      "UTC",
    );
    expect(trend.points.map((p) => p.value)).toEqual([10, 3]);
    expect(trend.annotation).toEqual({ index: 1, text: "−7 against the week before" });
  });
});

describe("the summary figures", () => {
  it("print a change of two shares in points, and judge nothing under five meetings", async () => {
    for (const window of ["today", "week", "month", "quarter"] as const) {
      const { kpis } = await repo.getFlowCharts(SHARK, window);
      const progressed = kpis.figures.find((f) => f.id === "progressed");
      expect(progressed?.delta ?? "no change", window).toMatch(/^(no change|[+−]\d+ pts?)$/);
      if (kpis.caveat !== null && /too few/.test(kpis.caveat)) {
        for (const f of kpis.figures) expect(f.tone, `${window} ${f.id}`).toBe("flat");
      }
    }
    // Today: 2 meetings against 3. Red was a verdict on two meetings.
    const today = (await repo.getFlowCharts(SHARK, "today")).kpis;
    expect(today.figures.find((f) => f.id === "presentations")).toMatchObject({
      value: "2",
      delta: "−33%",
      tone: "flat",
    });
  });

  it("draws no colour for a change the card prints as no change", () => {
    // The week to Sun 15 Mar 2026 (UTC): 11 of 19 progressed, 57.9%; the week
    // before, 7 of 12, 58.3%. −0.44 points rounds to "no change", so no red.
    const make = (n: number, progressed: number, at: string) =>
      Array.from({ length: n }, (_, i) => ({
        ...session(`${at}-${i}`, at),
        outcome: i < progressed ? ("interested" as const) : ("not_interested" as const),
      }));
    const kpis = buildKpis(
      [...make(19, 11, "2026-03-10T10:00:00.000Z"), ...make(12, 7, "2026-03-03T10:00:00.000Z")],
      new Date("2026-03-15T12:00:00.000Z"),
      "week",
      "en-GB",
      "UTC",
      "en",
    );
    expect(kpis.figures.find((f) => f.id === "progressed")).toMatchObject({
      value: "58%",
      delta: "no change",
      tone: "flat",
    });
    // 19 against 12 is +58%, over the floor on both sides: a verdict stands.
    expect(kpis.figures.find((f) => f.id === "presentations")).toMatchObject({
      delta: "+58%",
      tone: "good",
    });
  });

  it("says a sales cycle with no median is too few sales, with the counts beside it", async () => {
    const { kpis } = await repo.getFlowCharts(SHARK, "month");
    expect(kpis.figures.find((f) => f.id === "sale_cycle")).toMatchObject({
      value: "Too few sales",
      qualifier: "7 measured, 10 needed · last 30 days",
    });
  });
});

describe("Sales Flow's findings", () => {
  it("source the showroom's outcomes to the showroom, and repeat no figure in the baseline", async () => {
    for (const period of ["quarter_to_date", "year_to_date"] as const) {
      const flow = await repo.getSalesFlow({ ...SHARK, period });
      for (const f of flow.findings) {
        expect(f.sources, f.id).not.toContain("CRM_OUTCOME_CONTEXT");
        if (f.baseline !== null) expect(f.statement, f.id).not.toContain(f.baseline);
      }
      expect(flow.findings.find((f) => f.id === "flow-unrecorded")?.baseline).toBeNull();
    }
  });
});

describe("Project's searches against the stock as it stands", () => {
  it("never count more matching flats than are available now", async () => {
    const project = await repo.getProjectView(SHARK, null);
    expect(project.availableUnits).toBe(28);
    for (const d of project.demand) {
      expect(d.matches, `${d.label} ${d.value}`).toBeLessThanOrEqual(project.availableUnits);
    }
    // Two-room: 27 flats in the catalogue, 11 sold and 8 reserved, so 8 available.
    const twoRoom = catalogueFor("prj_sharkres001").filter((u) => u.rooms === 2);
    expect(twoRoom.length).toBe(27);
    expect(project.demand.find((d) => d.field === "rooms" && d.value === "2")?.matches).toBe(8);
  });
});

describe("the building Clara Weiss reads", () => {
  it("is lit by its own meetings, so the legend's busiest unit is the register's", async () => {
    const [pulse, patterns] = await Promise.all([
      repo.getProjectPulse(SHARK),
      repo.getUnitAttentionPatterns(SHARK),
    ]);
    const units = pulse.floors.flatMap((f) => f.units);
    const brightest = [...units].sort((a, b) => b.meaningfulViews - a.meaningfulViews)[0];
    expect(pulse.peakViews).toBe(brightest?.meaningfulViews);
    expect(brightest?.code).toBe(patterns.top[0]?.unitCode);
    // S-503: opened in 29 of the quarter's meetings, each look past the threshold.
    expect(pulse.peakViews).toBe(29);
  });

  it("dates its sales in the period by the CRM's purchases", async () => {
    const [pulse, led] = await Promise.all([
      repo.getProjectPulse(SHARK),
      repo.getIrisLedSales(SHARK),
    ]);
    const bought = new Set(
      [...led.sales, ...led.neverShown]
        .filter((s) => s.changeLabel === "Purchase")
        .map((s) => s.unitCode),
    );
    expect(pulse.totals.soldInPeriod).toBe(bought.size);
    expect(pulse.totals.soldInPeriod).toBeLessThanOrEqual(pulse.totals.sold);
  });
});

describe("the stalled list", () => {
  it("ranks no deal on a flat another deal has reserved or bought", async () => {
    const flow = await repo.getSalesFlow(SHARK);
    if (flow.ladder.source !== "crm") throw new Error("Shark Residence has a CRM");
    const deals = dealsFor("prj_sharkres001")?.deals ?? [];
    const taken = new Set(
      deals.flatMap((d) =>
        d.unitCode !== null && (d.stage === "reservation" || d.stage === "purchase")
          ? [d.unitCode]
          : [],
      ),
    );
    const open = flow.ladder.stalled.filter(
      (d) => d.stage !== "reservation" && d.stage !== "purchase",
    );
    expect(open.length).toBeGreaterThan(0);
    for (const d of open) expect(taken.has(d.unitCode ?? ""), d.externalId).toBe(false);
    expect(flow.ladder.note).toMatch(/27 lost deals are in the total but on no rung\.$/);
  });
});

describe("names a reader can read", () => {
  it("names a meeting on What needs attention by when and who, never by its id", async () => {
    const view = await repo.getAttention(SHARK);
    const labels = view.states.flatMap((s) => s.subjects.map((x) => x.label));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toMatch(/mtg_/);
    expect(labels).toContain("3 Jul · 16:06 · Oliver Grant");
  });

  it("titles the report's table of recent meetings as one", async () => {
    const report = await repo.getReportScope(SHARK);
    expect(report.sections.find((s) => s.id === "meeting-summary")?.label).toBe("Recent meetings");
  });

  it("gives the Briefing's Project door both shares, and its alert its own action", async () => {
    const home = await repo.getHome(SHARK);
    expect(home.doors.find((d) => d.id === "project")?.headline).toBe(
      "Four-room units · 12% of unsold stock, 6% of looking time",
    );
    expect(home.alert?.actionLabel).toBe("See the meetings");
  });
});

describe("an agent's page counts one window", () => {
  it("counts the same meetings in 'where they present' as in the activity above it", async () => {
    const agents = await repo.getAgentsView(SHARK);
    for (const a of agents.agents) {
      const detail = await repo.getAgentDetail(SHARK, a.agentId);
      const here = detail.projects.find((p) => p.isCurrent);
      expect(here?.meetings, a.name).toBe(a.ring.meetings);
    }
  });

  it("says the unrecorded meetings once, with no share of the same count beside them", async () => {
    const agents = await repo.getAgentsView(SHARK);
    let said = 0;
    for (const a of agents.agents) {
      const detail = await repo.getAgentDetail(SHARK, a.agentId);
      const f = detail.findings.find((x) => x.id === `agent-${a.agentId}-unrecorded`);
      if (f === undefined) continue;
      said += 1;
      expect(f.statement, a.name).toMatch(
        /^\d+ of their \d+ meetings ended with no outcome recorded\.$/,
      );
      expect(f.baseline, a.name).toBeNull();
    }
    expect(said).toBeGreaterThan(0);
  });
});

describe("IRIS-led and IRIS-assisted", () => {
  it("give the two adjacent cards one denominator in the same words, and a short how-counted", async () => {
    const led = await repo.getIrisLedSales(SHARK);
    expect(led.figures.find((f) => f.id === "led")?.of).toMatch(/^\d+% of the period's sales$/);
    expect(led.figures.find((f) => f.id === "window")?.of).toMatch(
      /^\d+% of the period's sales, the IRIS-assisted rule$/,
    );
    const words = (s: string) => s.split(/\s+/).length;
    // "How it is counted" printed 236 words; the rule and its limits fit in about a hundred.
    expect(words(led.definition)).toBeLessThanOrEqual(50);
    expect(words(led.caveat)).toBeLessThanOrEqual(60);
  });

  it("calls the sales it places dated, so the one it cannot place reads as beside them", async () => {
    const { assisted } = await repo.getSalesFlow(SHARK);
    if (assisted.source !== "crm") throw new Error("Shark Residence has a CRM");
    expect(assisted.unplaced).toBe(1);
    expect(assisted.headline).toMatch(
      new RegExp(`^\\d+ of ${String(assisted.datedSales)} dated sales so far \\(\\d+%\\) `),
    );
  });
});

describe("Ask's prepared answers", () => {
  it("order a tie as the units answer does, and list every presenter and outcome", async () => {
    const [ask, patterns] = await Promise.all([
      repo.getAskSession(SHARK, null),
      repo.getUnitAttentionPatterns(SHARK),
    ]);
    const opened = ask.answers.find((a) => a.question === "Which apartments were opened most?");
    // S-603 and S-501 were each opened in 22 meetings; S-603 was shortlisted more.
    expect(opened?.figures.map((f) => f.label)).toEqual(
      patterns.top.slice(0, 3).map((f) => f.unitCode),
    );
    expect(opened?.figures.map((f) => f.label)).toEqual(["S-503", "S-403", "S-603"]);
    const who = ask.answers.find(
      (a) => a.question === "Who presented, and how many meetings each?",
    );
    expect(who?.figures).toHaveLength(5);
    const ended = ask.answers.find((a) => a.question.startsWith("How many presentations"));
    expect(ended?.figures.map((f) => f.label)).toEqual([
      "Purchase",
      "Reservation",
      "Interested",
      "Follow-up needed",
      "Presentation only",
      "Not interested",
    ]);
  });
});
