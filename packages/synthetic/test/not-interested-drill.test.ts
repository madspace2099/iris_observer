import { describe, expect, it } from "vitest";
import type { MeetingOutcome, SectionId, ShowroomSession, ShowroomStep } from "@observer/contracts";
import {
  DEFAULT_LANGUAGE,
  type OverviewQuery,
  type PeriodPreset,
  type ProjectAddress,
  type Viewer,
} from "@observer/readmodels";
import { AGENT_MIN_SAMPLE, getMetric } from "@observer/metrics";
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

const step = (ordinal: number, sectionId: SectionId, isReturn = false): ShowroomStep => ({
  ordinal,
  sectionId,
  itemId: null,
  itemLabel: null,
  enteredAt: null,
  dwellSeconds: 30,
  isReturn,
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
  {
    timed = true,
    returns = 0,
    units = 3,
    like = outcome === "not_interested" ? "group" : "others",
  }: {
    readonly timed?: boolean;
    /** Returns to Residences after the sections shown: each is one more opening. */
    readonly returns?: number;
    readonly units?: number;
    /** Whose habits the meeting has, whatever its outcome. */
    readonly like?: "group" | "others";
  } = {},
): ShowroomSession {
  id += 1;
  const shown = like === "group" ? GROUP_STEPS : OTHER_STEPS;
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
    steps: [
      ...shown.map((s, i) => step(i + 1, s)),
      ...Array.from({ length: returns }, (_, i) => step(shown.length + i + 1, "residences", true)),
    ],
    units: Array.from({ length: units }, (_, i) => {
      const unitCode = `A-${i + 1}`;
      return {
        unitId: unitCode,
        unitCode,
        views: 1,
        dwellSeconds: 60,
        longestViewSeconds: 60,
        favourited: like === "others",
        pdfOpened: false,
        balconyViews: 0,
        floorCutViews: 0,
        screenshots: 0,
        comparedWith: [],
        keptFromComparison: null,
        shared: false,
      };
    }),
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
 * The group, twenty, skewed so that a mean and a median part (a regression to
 * a mean fails every figure below): Lena's two (300s, 300s), Marek's one (360s)
 * and Oliver's seventeen (360s, 420s twice, 480s twice … 720s twice, 780s,
 * 840s, then 1800s and 3600s, the two long ones also returning to a section
 * sixteen times and opening ten apartments).
 *
 *   Length, sorted: 300 300 360 360 420 420 480 480 540 540 | 600 600 660 660
 *   720 720 780 840 1800 3600. Median (540 + 600) / 2 = 570s = 9m 30s; the mean
 *   would be 15180 / 20 = 759s. 25th percentile by nearest rank, the
 *   ceil(5) = 5th: 420s = 7m 00s; 75th, the ceil(15) = 15th: 720s = 12m 00s.
 *   Features opened: eighteen 4s and two 20s, median 4 (mean 5.6).
 *   Apartments opened: eighteen 3s and two 10s, median 3 (mean 3.7).
 *
 * The others, 27 recorded: Lena's twenty follow-ups (900s, eight openings,
 * three apartments), Oliver's four presentations (3600s, eight openings and
 * eight returns, six apartments), Marek's three "interested", two of which the
 * source could not time (60s each, which must not count).
 *
 *   Length, the 25 timed: twenty-one 900s and four 3600s; median, the 13th,
 *   900s = 15m 00s (mean 33300 / 25 = 1332s); middle half, the 7th and 19th,
 *   900s–900s.
 *   Features opened: twenty-three 8s and four 16s, median 8 (mean 9.2).
 *   Apartments opened: twenty-three 3s and four 6s, median 3 (mean 3.4).
 *
 * Lena's one skipped meeting is on neither side.
 */
function fixture(groupTimed = true): ShowroomSession[] {
  id = 0;
  return [
    meeting(LENA, "not_interested", 300),
    meeting(LENA, "not_interested", 300),
    meeting(MAREK, "not_interested", 360),
    ...[360, 420, 420, 480, 480, 540, 540, 600, 600, 660, 660, 720, 720, 780, 840].map((d, i) =>
      meeting(OLIVER, "not_interested", d, { timed: groupTimed || i > 0 }),
    ),
    meeting(OLIVER, "not_interested", 1800, { returns: 16, units: 10 }),
    meeting(OLIVER, "not_interested", 3600, { returns: 16, units: 10 }),
    ...times(20, () => meeting(LENA, "follow_up_needed", 900)),
    meeting(LENA, "skipped", 900),
    ...times(4, () => meeting(OLIVER, "presentation_only", 3600, { returns: 8, units: 6 })),
    meeting(MAREK, "interested", 900),
    meeting(MAREK, "interested", 60, { timed: false }),
    meeting(MAREK, "interested", 60, { timed: false }),
  ];
}

const funnel = buildBehaviourFunnel(fixture(), "en-GB", "en", AT, "Quarter to date");
/* Marek's one meeting of the group left out: nineteen, one short of the floor. */
const nineteen = buildBehaviourFunnel(
  fixture().filter((_, i) => i !== 2),
  "en-GB",
  "en",
  AT,
  "Quarter to date",
);

describe("whose they were", () => {
  it("lists every presenter of the period in the roster's order, never by count", () => {
    expect(funnel.byAgent.map((a) => a.agentId)).toEqual([LENA, MAREK, OLIVER]);
    expect(funnel.byAgent.map((a) => a.count)).toEqual([2, 1, 17]);
  });

  it("states each count against the presenter's own recorded meetings, a rate only from 20", () => {
    // Lena: 2 of 22 recorded (her skipped one is not recorded), 2 / 22 = 9.09%.
    expect(funnel.byAgent[0]).toMatchObject({
      recordedDisplay: "22 recorded",
      display: "2 of 22 · 9%",
      share: 2 / 22,
      belowMinimum: false,
    });
    // Marek: 1 of 4, which is 16 short of 20: no rate, and no bar.
    expect(funnel.byAgent[1]).toMatchObject({
      recordedDisplay: "4 recorded",
      display: "1 of 4 · no rate, 16 short of 20",
      share: null,
      belowMinimum: true,
    });
    // Oliver: 17 of 21 = 80.95%. The bar is this rate, not his 17 of the group's 20.
    expect(funnel.byAgent[2]).toMatchObject({ display: "17 of 21 · 81%", share: 17 / 21 });
  });

  it("never prints a share of something that happened as 0%", () => {
    // Lena's one of 210 recorded is 0.48%, which a whole percent would round to nought.
    const rare = buildBehaviourFunnel(
      [
        meeting(LENA, "not_interested", 600),
        ...times(209, () => meeting(LENA, "follow_up_needed", 900)),
        ...times(19, () => meeting(OLIVER, "not_interested", 600)),
      ],
      "en-GB",
      "en",
      AT,
      "Quarter to date",
    );
    expect(rare.byAgent.map((a) => a.display)).toEqual([
      "1 of 210 · <1%",
      "19 of 19 · no rate, 1 short of 20",
    ]);
  });

  it("opens each presenter's meetings of the group in the register, and none where there are none", () => {
    expect(funnel.byAgent[0]?.href).toBe(
      "/t/p/meetings?agent=agt_sharklena01&outcome=not_interested",
    );
    expect(nineteen.byAgent[1]).toMatchObject({ count: 0, href: null });
  });
});

describe("how long they ran and what was opened in them", () => {
  const figure = (id: string) => funnel.figures.find((f) => f.id === id);

  /* The middle half is no longer printed: a figure, the others' and both samples (the owner: "SIMPLIFY"). */
  it("sets the group's median length beside the others', untimed meetings left out", () => {
    expect(figure("length")).toMatchObject({
      metricId: "flow.not_interested_length",
      value: "9m 30s",
      qualifier: "others 15m 00s · 20 and 25 timed",
    });
  });

  it("counts features opened as section openings, and apartments as units, per meeting", () => {
    expect(figure("features_opened")).toMatchObject({
      value: "4",
      qualifier: "others 8 · 20 and 27 meetings",
    });
    expect(figure("apartments_opened")).toMatchObject({
      value: "3",
      qualifier: "others 3 · 20 and 27 meetings",
    });
  });

  it("under the floor, states the group's own median alone, with its sample and the shortfall", () => {
    // One of Oliver's untimed: 19 timed in the group. Without its 360s: the 10th of 19, 600s.
    const short = buildBehaviourFunnel(fixture(false), "en-GB", "en", AT, "Quarter to date");
    expect(short.figures.find((f) => f.id === "length")).toMatchObject({
      value: "10m 00s",
      /* 19 timed of 20 in the group: its own sample is short of the lead's, so it says by how much. */
      qualifier: "of 19 timed · not compared, 1 short of 20",
    });
    expect(short.figures.find((f) => f.id === "features_opened")?.qualifier).toBe(
      "others 8 · 20 and 27 meetings",
    );
  });

  it("names the others when they are the short side", () => {
    // 25 in the group, all timed at 900s; 20 others, 5 of them untimed: 15 timed, 5 short of 20.
    const othersShort = buildBehaviourFunnel(
      [
        ...times(25, () => meeting(LENA, "not_interested", 900)),
        ...times(15, () => meeting(OLIVER, "follow_up_needed", 1_200)),
        ...times(5, () => meeting(OLIVER, "follow_up_needed", 1_200, { timed: false })),
      ],
      "en-GB",
      "en",
      AT,
      "Quarter to date",
    );
    expect(othersShort.figures.find((f) => f.id === "length")).toMatchObject({
      value: "15m 00s",
      qualifier: "of 25 timed · not compared, the others' 15 are 5 short of 20",
    });
  });
});

describe("what they did, against the others", () => {
  it("states each behaviour on its own in both groups, the widest gap first", () => {
    // Shortlisting and Compare: 0 of 20 against 27 of 27. Returning: 2 of 20 against 4 of 27.
    expect(funnel.reach.map((r) => [r.id, r.share, r.comparisonShare])).toEqual([
      ["shortlisted", 0, 1],
      ["used_compare", 0, 1],
      ["returned", 2 / 20, 4 / 27],
      ["reached_surroundings", 1, 1],
      ["opened_amenities", 1, 1],
      ["three_units", 1, 1],
    ]);
  });

  it("says what a pair of rates is, where the old band said 'on its own · elsewhere'", () => {
    expect(funnel.reach[2]?.text).toBe(
      "Returned to a section before closing: 10% of the not-interested meetings, against 15% of the others.",
    );
    expect(funnel.reachOf).toBe(
      "Of the 20 not-interested meetings and the 27 others; the widest gap first.",
    );
  });
});

describe("the lead", () => {
  it("names the two widest typical differences and the widest behaviour, each at its own samples, as association", () => {
    // Features 4 against 8 is a gap of 0.5; length 570 against 900 one of 0.37, over
    // 20 and 25 timed rather than the 20 and 27 recorded; apartments none.
    expect(funnel.lead).toBe(
      'The 20 meetings that ended "not interested" opened fewer features (4 against 8), ran shorter (9m 30s against 15m 00s, 20 and 25 timed) and shortlisted anything less often (0% against 100%) than the 27 other recorded meetings, quarter to date: what they had in common, not why.',
    );
  });

  it("says no difference in the units each test uses: percent for a median, points for a share", () => {
    const alike = buildBehaviourFunnel(
      [
        ...times(20, () => meeting(LENA, "not_interested", 900, { like: "others" })),
        ...times(20, () => meeting(OLIVER, "follow_up_needed", 900)),
      ],
      "en-GB",
      "en",
      AT,
      "Quarter to date",
    );
    expect(alike.lead).toBe(
      'The 20 meetings that ended "not interested" looked much like the 20 other recorded meetings, quarter to date: no median differs by 15% or more, no share by 15 points.',
    );
  });

  it("makes no comparison under the floor, and says how far short", () => {
    /* The shortfall is said here once; the figures and the behaviours only say "not compared". */
    expect(nineteen.lead).toBe(
      '19 meetings ended "not interested", quarter to date. A comparison with the 27 other recorded meetings needs 20 on each side: this group is 1 short.',
    );
    expect(nineteen.reach).toEqual([]);
    expect(nineteen.reachOf).toBe("Not compared at this sample.");
    // The group's own medians still stand: length the 10th of 19, 600s; features 4; apartments 3.
    // Each is short by the lead's 1 (20 - 19), so none says it again.
    expect(nineteen.figures.map((f) => [f.value, f.qualifier])).toEqual([
      ["10m 00s", "of 19 timed · not compared"],
      ["4", "of 19 meetings · not compared"],
      ["3", "of 19 meetings · not compared"],
    ]);
    expect(nineteen.byAgent.map((a) => a.count)).toEqual([2, 0, 17]);
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
  it("with a denominator, and the floor Presentation DNA keeps on its outcome cohorts", () => {
    for (const id of [
      "flow.not_interested_by_agent",
      "flow.not_interested_length",
      "flow.not_interested_interactions",
      "flow.not_interested_reach",
    ]) {
      const metric = getMetric(id);
      expect(metric?.denominator, id).toBeTruthy();
      expect(metric?.minimumSampleSize, id).toBe(AGENT_MIN_SAMPLE);
      expect(metric?.evidenceTier, id).not.toBe("causal_claim");
    }
  });
});

/*
 * SHARK RESIDENCE. Read off Sales Flow's own outcome rows (`getSalesFlow`, the
 * rings) on 2026-10-22: quarter to date, 150 meetings, 19 "not interested",
 * 131 recorded. Lena 2 of 36, Marek 1 of 28, Oliver 8 of 22, Zsófia 5 of 26,
 * Iva 3 of 19. Year to date, 29 "not interested" against 214 others.
 */
describe("Shark Residence", () => {
  const query = (period: PeriodPreset): OverviewQuery => ({
    viewer: VIEWERS.developerShark as Viewer,
    tenantSlug: "shark",
    projectSlug: "shark-residence",
    period,
    language: DEFAULT_LANGUAGE,
  });
  const repo = new SyntheticObserverRepository();
  const read = (period: PeriodPreset = "quarter_to_date") =>
    repo.getFlowCharts(query(period), "month").then((c) => c.funnel);
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
    const [shark, flow] = await Promise.all([read(), repo.getSalesFlow(query("quarter_to_date"))]);
    expect(shark.byAgent.map((a) => a.agentId)).toEqual(flow.rings.map((r) => r.agentId));
    for (const ring of flow.rings) {
      const row = shark.byAgent.find((a) => a.agentId === ring.agentId);
      const slice = ring.slices.find((s) => s.outcome === "not_interested");
      expect(row?.count, ring.name).toBe(slice?.count ?? 0);
      expect(row?.recordedDisplay, ring.name).toBe(`${ring.decidedMeetings} recorded`);
    }
  });

  it("quarter to date, compares nothing: the 19 are one short of the cohort floor", async () => {
    const shark = await read();
    expect(shark.lead).toBe(
      '19 meetings ended "not interested", quarter to date. A comparison with the 112 other recorded meetings needs 20 on each side: this group is 1 short.',
    );
    expect(shark.reach).toEqual([]);
    expect(shark.figures.map((f) => f.id)).toEqual([
      "length",
      "features_opened",
      "apartments_opened",
    ]);
    /* Once, in the lead: it was stated five times on one screen (review, 2026-10-23). */
    const said = [shark.lead, ...shark.figures.map((f) => f.qualifier), shark.reachOf];
    expect(said.filter((s) => s?.includes("short")).length).toBe(1);
    for (const f of shark.figures) expect(f.qualifier, f.id).toMatch(/^of 19 \w+ · not compared$/);
  });

  it("year to date, prints each behaviour's pair as the design lab's bands print it, widest gap first", async () => {
    const shark = await read("year_to_date");
    expect(shark.reach).toHaveLength(6);
    const gaps = shark.reach.map((r) => Math.abs(r.share - r.comparisonShare));
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
    for (const r of shark.reach) {
      const band = shark.steps.find((s) => s.id === r.id);
      expect(r.text, r.id).toContain(`${band?.note ?? "?"} of the not-interested meetings`);
      expect(r.text, r.id).toContain(`against ${band?.comparisonNote ?? "?"} of the others`);
    }
  });

  it("year to date, leads with both sample sizes and claims no cause", async () => {
    const shark = await read("year_to_date");
    expect(shark.lead).toContain('The 29 meetings that ended "not interested"');
    expect(shark.lead).toContain("than the 214 other recorded meetings, year to date");
    expect(shark.lead).not.toMatch(CAUSAL);
    expect(shark.disclaimer).not.toMatch(CAUSAL);
  });
});
