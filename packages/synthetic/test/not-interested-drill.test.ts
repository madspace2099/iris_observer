import { describe, expect, it } from "vitest";
import type { MeetingOutcome, SectionId, ShowroomSession, ShowroomStep } from "@observer/contracts";
import {
  DEFAULT_LANGUAGE,
  type OverviewQuery,
  type ProjectAddress,
  type Viewer,
} from "@observer/readmodels";
import { getMetric } from "@observer/metrics";
import { SyntheticObserverRepository, VIEWERS } from "../src";
import { buildBehaviourFunnel } from "../src/showroom/charts";

/**
 * WHY THE "NOT INTERESTED" MEETINGS FAILED, AS FIGURES (ADR-0053).
 *
 * The owner, 2026-10-22: which feature was opened how often is not enough; he
 * wants whose the meetings were, how long they ran and how much was opened in
 * them, and "68% on its own · 80% elsewhere" said so it can be read. Every
 * expected value below is worked out by hand from the fixture, never by the
 * function under test.
 */

const AT: ProjectAddress = { tenantSlug: "t", projectSlug: "p" };
const LENA = "agt_sharklena01";
const MAREK = "agt_sharkmarek01";
const OLIVER = "agt_sharkoliver01";

const step = (ordinal: number, sectionId: SectionId): ShowroomStep => ({
  ordinal,
  sectionId,
  itemId: null,
  itemLabel: null,
  enteredAt: null,
  dwellSeconds: 30,
  isReturn: false,
  availability: "legacy_available",
});

/* The group shows four sections and shortlists nothing; everyone else eight, Compare and a shortlist among them. */
const GROUP_STEPS: readonly SectionId[] = ["home", "residences", "amenities", "surroundings"];
const OTHER_STEPS: readonly SectionId[] = [
  ...GROUP_STEPS,
  "compare",
  "gallery",
  "maps",
  "shortlist",
];

let id = 0;
function meeting(
  agentId: string,
  outcome: MeetingOutcome,
  durationSeconds: number,
  timed = true,
): ShowroomSession {
  id += 1;
  const group = outcome === "not_interested";
  return {
    sessionId: `s-${id}`,
    meetingId: `m-${id}`,
    projectId: "prj_test_not_interested_drill",
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt: "2026-09-01T10:00:00.000Z",
    endedAt: "2026-09-01T11:00:00.000Z",
    durationSeconds,
    outcome,
    steps: (group ? GROUP_STEPS : OTHER_STEPS).map((s, i) => step(i + 1, s)),
    units: ["A-1", "A-2", "A-3"].map((unitCode) => ({
      unitId: unitCode,
      unitCode,
      views: 1,
      dwellSeconds: 60,
      longestViewSeconds: 60,
      favourited: !group,
      pdfOpened: false,
      balconyViews: 0,
      floorCutViews: 0,
      screenshots: 0,
      comparedWith: [],
      keptFromComparison: null,
      shared: false,
    })),
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: !timed,
  };
}

const times = (n: number, make: () => ShowroomSession) => Array.from({ length: n }, make);

/*
 * The group, ten: Lena's two (300s, 360s) and Oliver's eight (420s to 840s,
 * 60s apart). Sorted, 300…840: median (540 + 600) / 2 = 570s = 9m 30s; the
 * 25th percentile by nearest rank is the ceil(2.5) = 3rd, 420s = 7m 00s; the
 * 75th the ceil(7.5) = 8th, 720s = 12m 00s.
 *
 * The others, 27 recorded: Lena's twenty follow-ups, Oliver's four
 * presentations, Marek's three "interested" — two of which the source could
 * not time (60s each, which must not count). Timed: 25, all 900s = 15m 00s.
 * Lena's one skipped meeting is on neither side.
 */
function fixture(groupTimed = true): ShowroomSession[] {
  id = 0;
  return [
    meeting(LENA, "not_interested", 300),
    meeting(LENA, "not_interested", 360),
    ...[420, 480, 540, 600, 660, 720, 780, 840].map((d, i) =>
      meeting(OLIVER, "not_interested", d, groupTimed || i > 0),
    ),
    ...times(20, () => meeting(LENA, "follow_up_needed", 900)),
    meeting(LENA, "skipped", 900),
    ...times(4, () => meeting(OLIVER, "presentation_only", 900)),
    meeting(MAREK, "interested", 900),
    meeting(MAREK, "interested", 60, false),
    meeting(MAREK, "interested", 60, false),
  ];
}

const funnel = buildBehaviourFunnel(fixture(), "en-GB", "en", AT, "Quarter to date");

describe("whose they were", () => {
  it("lists every presenter of the period in the roster's order, never by count", () => {
    expect(funnel.byAgent.map((a) => a.agentId)).toEqual([LENA, MAREK, OLIVER]);
    expect(funnel.byAgent.map((a) => a.count)).toEqual([2, 0, 8]);
  });

  it("states each count against the presenter's own recorded meetings, a rate only from 20", () => {
    // Lena: 2 of 22 recorded (her skipped one is not recorded), 2 / 22 = 9.09%.
    expect(funnel.byAgent[0]).toMatchObject({
      recordedDisplay: "22 recorded",
      display: "2 of 22 · 9%",
      belowMinimum: false,
    });
    // Oliver: 8 of 12, which is 8 short of 20: no rate.
    expect(funnel.byAgent[2]).toMatchObject({
      recordedDisplay: "12 recorded",
      display: "8 of 12 · no rate, 8 short of 20",
      belowMinimum: true,
    });
  });

  it("opens each presenter's meetings of the group in the register, and none where there are none", () => {
    expect(funnel.byAgent[0]?.href).toBe(
      "/t/p/meetings?agent=agt_sharklena01&outcome=not_interested",
    );
    expect(funnel.byAgent[1]?.href).toBeNull();
  });
});

describe("how long they ran and what was opened in them", () => {
  const figure = (id: string) => funnel.figures.find((f) => f.id === id);

  it("sets the group's median length and middle half beside the others', untimed meetings left out", () => {
    expect(figure("length")).toMatchObject({
      metricId: "flow.not_interested_length",
      value: "9m 30s",
      qualifier:
        "others 15m 00s · middle half 7m 00s–12m 00s against 15m 00s–15m 00s · 10 and 25 timed",
    });
  });

  it("counts features opened as section openings, and apartments as units, per meeting", () => {
    expect(figure("features_opened")).toMatchObject({
      value: "4",
      qualifier: "others 8 · 10 and 27 meetings",
    });
    expect(figure("apartments_opened")).toMatchObject({
      value: "3",
      qualifier: "others 3 · 10 and 27 meetings",
    });
  });

  it("states no median for a side under the registry's floor, and says by how much", () => {
    // One of Oliver's eight untimed: 9 timed in the group, one short of 10.
    const short = buildBehaviourFunnel(fixture(false), "en-GB", "en", AT, "Quarter to date");
    expect(short.figures.find((f) => f.id === "length")).toMatchObject({
      value: "No median",
      qualifier: "a side needs 10 timed · 9 and 25 timed",
    });
    expect(short.figures.find((f) => f.id === "features_opened")?.value).toBe("4");
  });
});

describe("what they did, against the others", () => {
  it("states each behaviour on its own in both groups, the widest gap first", () => {
    // Shortlisting and Compare: 0 of 10 against 27 of 27, a gap of 1, in the list's own order.
    expect(funnel.reach.map((r) => [r.id, r.share, r.comparisonShare])).toEqual([
      ["shortlisted", 0, 1],
      ["used_compare", 0, 1],
      ["reached_surroundings", 1, 1],
      ["opened_amenities", 1, 1],
      ["three_units", 1, 1],
      ["returned", 0, 0],
    ]);
  });

  it("says what a pair of rates is, where the old band said 'on its own · elsewhere'", () => {
    expect(funnel.reach[1]?.text).toBe(
      "Used Compare: 0% of the not-interested meetings, against 100% of the others.",
    );
    expect(funnel.reachOf).toBe(
      'The share of meetings that did each: of the 10 meetings that ended "not interested", and of the 27 other recorded meetings. Each on its own; the widest gap first.',
    );
  });
});

describe("the lead", () => {
  it("names the two widest typical differences and the widest behaviour, with both samples, as association", () => {
    // Features 4 against 8 is a gap of 0.5; length 570 against 900 one of 0.37; apartments none.
    expect(funnel.lead).toBe(
      'The 10 meetings that ended "not interested" opened fewer features (median 4 against 8), ran shorter (median 9m 30s against 15m 00s) and shortlisted anything less often (0% against 100%) than the 27 other recorded meetings, quarter to date. That is what they had in common, not why they ended so.',
    );
  });

  it("makes no comparison under the floor, and says why instead of drawing nothing", () => {
    // Drop one of Lena's: nine in the group.
    const nine = buildBehaviourFunnel(fixture().slice(1), "en-GB", "en", AT, "Quarter to date");
    expect(nine.lead).toBe(
      '9 meetings ended "not interested", quarter to date, against 27 other recorded meetings: a comparison needs 10 meetings on each side, so none is made.',
    );
    expect(nine.figures).toEqual([]);
    expect(nine.reach).toEqual([]);
    expect(nine.reachOf).toBe(
      "Not compared: a side needs 10 meetings, and the group has 9 against 27.",
    );
    expect(nine.byAgent.map((a) => a.count)).toEqual([1, 0, 8]);
  });

  it("describes nothing for a period with no such meeting", () => {
    const none = buildBehaviourFunnel(
      fixture().filter((s) => s.outcome !== "not_interested"),
      "en-GB",
      "en",
      AT,
      "Quarter to date",
    );
    expect(none.empty).not.toBeNull();
    expect([none.lead, none.figures, none.byAgent, none.reach]).toEqual([null, [], [], []]);
  });
});

describe("the registry declares every figure", () => {
  it("with a denominator and a minimum sample", () => {
    for (const id of [
      "flow.not_interested_by_agent",
      "flow.not_interested_length",
      "flow.not_interested_interactions",
      "flow.not_interested_reach",
    ]) {
      const metric = getMetric(id);
      expect(metric?.denominator, id).toBeTruthy();
      expect(metric?.minimumSampleSize, id).toBeGreaterThanOrEqual(10);
      expect(metric?.evidenceTier, id).not.toBe("causal_claim");
    }
  });
});

/*
 * SHARK RESIDENCE, QUARTER TO DATE. Read off Sales Flow's own outcome rows
 * (`getSalesFlow`, the rings) on 2026-10-22: 150 meetings, 19 "not interested",
 * 131 recorded. Lena 2 of 36, Marek 1 of 28, Oliver 8 of 22, Zsófia 5 of 26,
 * Iva 3 of 19.
 */
describe("Shark Residence, quarter to date", () => {
  const SHARK: OverviewQuery = {
    viewer: VIEWERS.developerShark as Viewer,
    tenantSlug: "shark",
    projectSlug: "shark-residence",
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  };
  const repo = new SyntheticObserverRepository();
  const read = () => repo.getFlowCharts(SHARK, "month").then((c) => c.funnel);
  const CAUSAL =
    /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;

  it("names the 19 and whose they were, as the outcome rows count them", async () => {
    const shark = await read();
    expect(shark.cohortLabel).toBe('Ended "not interested" · 19 meetings');
    expect(shark.byAgent.map((a) => [a.name, a.display])).toEqual([
      ["Lena Fischer", "2 of 36 · 6%"],
      ["Marek Dvořák", "1 of 28 · 4%"],
      ["Oliver Grant", "8 of 22 · 36%"],
      ["Zsófia Bárány", "5 of 26 · 19%"],
      ["Iva Horváth", "3 of 19 · no rate, 1 short of 20"],
    ]);
  });

  it("agrees with the rings it stands under, presenter by presenter", async () => {
    const [shark, flow] = await Promise.all([read(), repo.getSalesFlow(SHARK)]);
    expect(shark.byAgent.map((a) => a.agentId)).toEqual(flow.rings.map((r) => r.agentId));
    for (const ring of flow.rings) {
      const row = shark.byAgent.find((a) => a.agentId === ring.agentId);
      const slice = ring.slices.find((s) => s.outcome === "not_interested");
      expect(row?.count, ring.name).toBe(slice?.count ?? 0);
      expect(row?.recordedDisplay, ring.name).toBe(`${ring.decidedMeetings} recorded`);
    }
  });

  it("prints each behaviour's pair as the design lab's bands print it, widest gap first", async () => {
    const shark = await read();
    expect(shark.reach).toHaveLength(6);
    const gaps = shark.reach.map((r) => Math.abs(r.share - r.comparisonShare));
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
    for (const r of shark.reach) {
      const band = shark.steps.find((s) => s.id === r.id);
      expect(r.text, r.id).toContain(`${band?.note ?? "?"} of the not-interested meetings`);
      expect(r.text, r.id).toContain(`against ${band?.comparisonNote ?? "?"} of the others`);
    }
  });

  it("leads with both sample sizes and claims no cause", async () => {
    const shark = await read();
    expect(shark.lead).toContain('The 19 meetings that ended "not interested"');
    expect(shark.lead).toContain("than the 112 other recorded meetings, quarter to date");
    expect(shark.lead).not.toMatch(CAUSAL);
    expect(shark.disclaimer).not.toMatch(CAUSAL);
    expect(shark.figures.map((f) => f.id)).toEqual([
      "length",
      "features_opened",
      "apartments_opened",
    ]);
  });
});
