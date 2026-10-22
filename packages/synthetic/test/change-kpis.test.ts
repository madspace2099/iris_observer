import { describe, expect, it } from "vitest";
import type { SectionId, ShowroomSession, ShowroomStep } from "@observer/contracts";
import { AGENT_MIN_SAMPLE, CHANGE_FIGURES } from "@observer/metrics";
import {
  buildChangeKpis,
  changeWindows,
  directionOf,
  interactionsOf,
  topSection,
} from "../src/showroom/change-kpis";
import { SyntheticObserverRepository, VIEWERS, sessionsInPeriod } from "../src/index";
import { viewContext } from "./view-context";

/**
 * SALES FLOW'S SCREEN OF FIGURES (ADR-0060), hand-computed.
 *
 * Constructed sessions, so every expected figure can be worked out on paper:
 * the medians are chosen where a mean would say something else, the windows
 * are placed across a daylight-saving change, and the floor, the threshold and
 * the top feature's tie rule are each met exactly and missed by one.
 */

const PROJECT_ID = "prj_testchangekpis";

function step(sectionId: SectionId, dwellSeconds: number | null = 30): ShowroomStep {
  return {
    ordinal: 1,
    sectionId,
    itemId: null,
    itemLabel: null,
    enteredAt: null,
    dwellSeconds,
    isReturn: false,
    availability: "legacy_available",
  };
}

function session(over: Partial<ShowroomSession> = {}): ShowroomSession {
  return {
    sessionId: "s",
    meetingId: "m",
    projectId: PROJECT_ID,
    agentId: "agt_test",
    channel: "showroom",
    contactId: null,
    startedAt: "2026-10-20T10:00:00.000Z",
    endedAt: "2026-10-20T10:20:00.000Z",
    durationSeconds: 600,
    outcome: "presentation_only",
    steps: [step("home"), step("residences")],
    units: [],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
    ...over,
  };
}

const times = <T>(n: number, make: () => T): T[] => Array.from({ length: n }, make);

const CONTEXT = viewContext({ project: { id: PROJECT_ID } });

const kpi = (view: ReturnType<typeof buildChangeKpis>, id: string) => {
  const found = view.kpis.find((k) => k.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};

describe("the windows: the period as it was computed seven days earlier", () => {
  /*
   * Bratislava leaves summer time on 25 October 2026. A shift of 168 hours
   * would put the earlier window's end at 00:59 on the 24th; seven calendar
   * days puts it at the same wall-clock reading, the last moment of the 23rd.
   */
  const rolling = viewContext({
    period: {
      preset: "last_28_days",
      from: "2026-10-02T00:00:00.000+02:00",
      to: "2026-10-30T00:00:00.000+01:00",
    },
    generatedAt: "2026-10-30T09:00:00.000+01:00",
  });

  it("reads the period through the end of today", () => {
    const { current } = changeWindows(rolling);
    expect(current.from).toBe(Date.parse("2026-10-02T00:00:00.000+02:00"));
    expect(current.to).toBe(Date.parse("2026-10-30T23:59:59.999+01:00"));
  });

  it("moves the last 28 days back seven calendar days, across the clock change", () => {
    const { earlier, same } = changeWindows(rolling);
    expect(earlier.from).toBe(Date.parse("2026-09-25T00:00:00.000+02:00"));
    expect(earlier.to).toBe(Date.parse("2026-10-23T23:59:59.999+02:00"));
    expect(same).toBe(false);
  });

  it("ends quarter to date seven days earlier, from the same first day", () => {
    const { earlier } = changeWindows(
      viewContext({
        period: {
          preset: "quarter_to_date",
          from: "2026-07-01T00:00:00.000+02:00",
          to: "2026-08-24T00:00:00.000+02:00",
        },
      }),
    );
    expect(earlier.from).toBe(Date.parse("2026-07-01T00:00:00.000+02:00"));
    expect(earlier.to).toBe(Date.parse("2026-08-17T23:59:59.999+02:00"));
  });

  it("reads the quarter before, in the first week of a quarter, as quarter to date then was", () => {
    const { earlier } = changeWindows(
      viewContext({
        period: {
          preset: "quarter_to_date",
          from: "2026-10-01T00:00:00.000+02:00",
          to: "2026-10-03T00:00:00.000+02:00",
        },
        generatedAt: "2026-10-03T09:00:00.000+02:00",
      }),
    );
    expect(earlier.from).toBe(Date.parse("2026-07-01T00:00:00.000+02:00"));
    expect(earlier.to).toBe(Date.parse("2026-09-26T23:59:59.999+02:00"));
  });

  const lastQuarter = (generatedAt: string, from: string, to: string) =>
    viewContext({
      project: { id: PROJECT_ID },
      period: { preset: "last_quarter", from, to },
      generatedAt,
    });

  it("draws no arrow on a completed quarter that was the same quarter seven days ago", () => {
    const closed = lastQuarter(
      "2026-08-24T09:00:00.000+02:00",
      "2026-04-01T00:00:00.000+02:00",
      "2026-07-01T00:00:00.000+02:00",
    );
    expect(changeWindows(closed).same).toBe(true);
    const view = buildChangeKpis(
      closed,
      times(20, () => session()),
      times(20, () => session()),
    );
    expect(view.withheld).toBe(
      "No arrows: 1 Apr – 30 Jun had already ended 7 days ago, so its figures read then as they do now.",
    );
    expect(view.kpis.every((k) => k.trend === null)).toBe(true);
  });

  it("sets a quarter completed this week against the one before it, ending on its last day", () => {
    const fresh = lastQuarter(
      "2026-07-03T09:00:00.000+02:00",
      "2026-04-01T00:00:00.000+02:00",
      "2026-07-01T00:00:00.000+02:00",
    );
    const { earlier, same } = changeWindows(fresh);
    expect(same).toBe(false);
    expect(earlier.from).toBe(Date.parse("2026-01-01T00:00:00.000+01:00"));
    expect(earlier.to).toBe(Date.parse("2026-04-01T00:00:00.000+02:00"));
    // The exclusive midnight is not a day of the window: 31 March is its last.
    const view = buildChangeKpis(
      fresh,
      times(20, () => session()),
      times(20, () => session()),
    );
    expect(view.basis).toContain("7 days ago: 1 Jan – 31 Mar, 20 meetings.");
  });
});

describe("medians, not means", () => {
  it("states the middle meeting, where one long meeting would drag a mean", () => {
    // Nineteen meetings of two openings and one of a hundred: the mean is 6.9.
    const current = [
      ...times(19, () => session()),
      session({ steps: times(100, () => step("home")) }),
    ];
    const earlier = times(20, () => session());
    const view = buildChangeKpis(CONTEXT, current, earlier);
    expect(kpi(view, "interactions_per_meeting").display).toBe("2");
    // Against the same median seven days earlier there is no movement; a mean would have risen.
    expect(kpi(view, "interactions_per_meeting").trend?.direction).toBe("flat");
  });

  it("takes the mean of the two middle meetings of an even count, and calls half a count no move", () => {
    const current = [
      ...times(10, () => session({ screenshots: 1 })),
      ...times(10, () => session({ screenshots: 2 })),
    ];
    const view = buildChangeKpis(
      CONTEXT,
      current,
      times(20, () => session({ screenshots: 1 })),
    );
    const shots = kpi(view, "screenshots_per_meeting");
    expect(shots.display).toBe("1.5");
    // 1 to 1.5 is 50%, but half a count is the middle pair changing places, not a move.
    expect(shots.trend).toEqual({
      direction: "flat",
      tone: "neutral",
      display: "about the same as 1, 7 days ago",
      spoken: "About the same as 1, 7 days ago.",
    });
    const doubled = buildChangeKpis(
      CONTEXT,
      times(20, () => session({ screenshots: 2 })),
      times(20, () => session({ screenshots: 1 })),
    );
    expect(kpi(doubled, "screenshots_per_meeting").trend).toEqual({
      direction: "up",
      tone: "good",
      display: "from 1, 7 days ago",
      spoken: "Up from 1, 7 days ago.",
    });
  });

  it("counts every recorded opening and action, and nothing else, as an interaction", () => {
    const one = session({
      steps: [step("home"), step("residences"), { ...step("residences"), isReturn: true }],
      screenshots: 2,
      units: [
        {
          unitId: "u1",
          unitCode: "A-101",
          views: 3,
          dwellSeconds: 90,
          longestViewSeconds: 60,
          favourited: true,
          pdfOpened: true,
          balconyViews: 1,
          floorCutViews: 2,
          screenshots: 2,
          comparedWith: ["A-102"],
          keptFromComparison: true,
          shared: true,
        },
      ],
    });
    // 2 sections (the return left out) + 2 screenshots + 3 views + 1 plan + 2 floor cuts + 1 balcony + 1 favourite.
    expect(interactionsOf(one)).toBe(12);
  });
});

describe("the threshold", () => {
  const compare = [step("home"), step("compare")];
  const share = (n: number, used: number) => [
    ...times(used, () => session({ steps: compare })),
    ...times(n - used, () => session()),
  ];

  it("reads a share that moved under two points as about the same, and says the earlier one", () => {
    const view = buildChangeKpis(CONTEXT, share(100, 50), share(100, 49));
    expect(kpi(view, "compare_use").trend).toEqual({
      direction: "flat",
      tone: "neutral",
      // Not "unchanged": 50% and 49% differ, inside the threshold.
      display: "about the same as 49%, 7 days ago",
      spoken: "About the same as 49%, 7 days ago.",
    });
    // 1.9 points: a step of anything between 1 and 2 points would call this a move.
    expect(
      kpi(buildChangeKpis(CONTEXT, share(1000, 500), share(1000, 481)), "compare_use").trend
        ?.direction,
    ).toBe("flat");
  });

  it("reads two points as a movement, and a rise in Compare as good", () => {
    const view = buildChangeKpis(CONTEXT, share(100, 50), share(100, 48));
    expect(kpi(view, "compare_use").trend).toMatchObject({ direction: "up", tone: "good" });
  });

  it("moves a median of counts only by a whole count, and by 5% of where it stood", () => {
    expect(directionOf(0.5, 1, 0.05, true, 1)).toBe("flat");
    expect(directionOf(19.5, 20, 0.05, true, 1)).toBe("flat");
    expect(directionOf(0.5, 0, 0.05, true, 1)).toBe("flat");
    // A whole count at 20 is 5% exactly: on the line, and the line is a move.
    expect(directionOf(19, 20, 0.05, true, 1)).toBe("down");
    // A whole count at 21 is 4.8%: under the line.
    expect(directionOf(20, 21, 0.05, true, 1)).toBe("flat");
    expect(directionOf(2, 1, 0.05, true, 1)).toBe("up");
  });

  it("reads a median that moved under five per cent as no change, and five as a movement", () => {
    const now = times(20, () => session({ durationSeconds: 600 }));
    // 28 / 572 is 4.9%; 29 / 571 is 5.1%.
    expect(
      kpi(
        buildChangeKpis(
          CONTEXT,
          now,
          times(20, () => session({ durationSeconds: 572 })),
        ),
        "presentation_length",
      ).trend?.direction,
    ).toBe("flat");
    expect(
      kpi(
        buildChangeKpis(
          CONTEXT,
          now,
          times(20, () => session({ durationSeconds: 571 })),
        ),
        "presentation_length",
      ).trend,
    ).toMatchObject({ direction: "up", tone: "neutral", display: "from 9m 31s, 7 days ago" });
  });

  it("moves off nought whatever the step", () => {
    expect(directionOf(0.5, 0, 0.05, true)).toBe("up");
    expect(directionOf(0, 0, 0.05, true)).toBe("flat");
  });

  it("colours a fall in interactions bad, and a rise in an order of telling neutral", () => {
    const early = [step("surroundings"), step("home"), step("residences")];
    const current = [
      ...times(10, () => session({ steps: early })),
      ...times(10, () => session({ steps: [step("home")] })),
    ];
    const view = buildChangeKpis(
      CONTEXT,
      current,
      times(20, () => session()),
    );
    expect(kpi(view, "surroundings_early").trend).toMatchObject({
      direction: "up",
      tone: "neutral",
    });
    // Ten meetings of three openings and ten of one: the middle two are 1 and 3, so 2.
    expect(kpi(view, "interactions_per_meeting").display).toBe("2");
    const fewer = buildChangeKpis(
      CONTEXT,
      times(20, () => session({ steps: [step("home")] })),
      times(20, () => session()),
    );
    expect(kpi(fewer, "interactions_per_meeting").trend).toMatchObject({
      direction: "down",
      tone: "bad",
      display: "from 2, 7 days ago",
    });
  });
});

describe("the floor", () => {
  it(`draws no arrow when either window has fewer than ${String(AGENT_MIN_SAMPLE)} meetings, and says so once`, () => {
    const view = buildChangeKpis(
      CONTEXT,
      times(20, () => session()),
      times(19, () => session()),
    );
    expect(view.withheld).toBe(
      "No arrows below 20 meetings a window: 19 meetings 7 days ago, 1 short of 20.",
    );
    expect(view.kpis.every((k) => k.trend === null)).toBe(true);
  });

  it("says once that a short window's figures are raw, not under each of them", () => {
    const view = buildChangeKpis(
      CONTEXT,
      times(19, () => session()),
      times(20, () => session()),
    );
    expect([kpi(view, "presentation_depth").display, kpi(view, "presentation_depth").unit]).toEqual(
      ["2", "steps"],
    );
    expect(view.withheld).toBe(
      "No arrows below 20 meetings a window, and this window's figures are raw: 19 meetings in this window, 1 short of 20.",
    );
    // Only the withheld rank says its own reason, in place of the name it withholds.
    expect(view.kpis.filter((k) => k.short !== null).map((k) => [k.id, k.short])).toEqual([
      ["top_feature", "1 short of the 20 a rank needs"],
    ]);
  });

  it("marks a figure raw when only its own meetings, the timed ones, are short", () => {
    const current = [
      ...times(15, () => session()),
      ...times(5, () => session({ timingUnavailable: true })),
    ];
    const length = kpi(
      buildChangeKpis(
        CONTEXT,
        current,
        times(20, () => session()),
      ),
      "presentation_length",
    );
    expect(length.sample).toBe("median of 15 of 20 meetings, timed");
    expect(length.short).toBe("raw figure, 5 short of 20");
  });

  it("states no figure, raw or otherwise, when no meeting could be timed", () => {
    const length = kpi(
      buildChangeKpis(
        CONTEXT,
        times(25, () => session({ timingUnavailable: true })),
        times(25, () => session()),
      ),
      "presentation_length",
    );
    expect([length.display, length.sample, length.short]).toEqual([
      "—",
      "none of 25 meetings timed",
      null,
    ]);
  });

  it("states the earlier figure's own sample when it is part of that window", () => {
    const earlier = [
      ...times(22, () => session()),
      ...times(3, () => session({ timingUnavailable: true })),
    ];
    const length = kpi(
      buildChangeKpis(
        CONTEXT,
        times(25, () => session()),
        earlier,
      ),
      "presentation_length",
    );
    expect(length.trend).toEqual({
      direction: "flat",
      tone: "neutral",
      display: "about the same as 10m 00s over 22 timed meetings, 7 days ago",
      spoken: "About the same as 10m 00s over 22 timed meetings, 7 days ago.",
    });
  });

  it("withholds one figure's arrow when only that figure's meetings are short", () => {
    const earlier = [
      ...times(15, () => session()),
      ...times(5, () => session({ timingUnavailable: true })),
    ];
    const view = buildChangeKpis(
      CONTEXT,
      times(20, () => session()),
      earlier,
    );
    expect(kpi(view, "presentation_length").trend).toEqual({
      direction: null,
      tone: "neutral",
      display: "no arrow: 15 of the 20 meetings needed, 7 days ago",
      spoken: "No arrow: 15 of the 20 meetings needed, 7 days ago.",
    });
    expect(kpi(view, "presentation_depth").trend?.direction).toBe("flat");
  });

  it("names no top feature below the floor, and withholds its share with the name", () => {
    const current = [...times(19, () => session()), session({ steps: [step("home", null)] })];
    const view = buildChangeKpis(
      CONTEXT,
      current,
      times(20, () => session()),
    );
    const top = kpi(view, "top_feature");
    expect([top.display, top.isName, top.sample, top.short]).toEqual([
      "Not ranked",
      true,
      "19 of 20 meetings timed",
      "1 short of the 20 a rank needs",
    ]);
  });
});

describe("the top feature", () => {
  it("goes to the section with the most timed seconds, with its share", () => {
    const sessions = times(4, () => session({ steps: [step("home", 10), step("amenities", 30)] }));
    expect(topSection(sessions)).toEqual({ sectionId: "amenities", share: 0.75, timed: 4 });
  });

  it("breaks a tie on seconds by how many meetings opened it", () => {
    const sessions = [
      session({ steps: [step("residences", 60)] }),
      session({ steps: [step("amenities", 30)] }),
      session({ steps: [step("amenities", 30)] }),
    ];
    expect(topSection(sessions)?.sectionId).toBe("amenities");
  });

  it("breaks a tie on both by the inventory's order", () => {
    const sessions = [session({ steps: [step("amenities", 30), step("residences", 30)] })];
    expect(topSection(sessions)?.sectionId).toBe("residences");
  });

  it("says whether it was the top seven days earlier, with no arrow when it was not", () => {
    const amenities = () => session({ steps: [step("amenities", 60), step("residences", 30)] });
    const residences = () => session({ steps: [step("home", 30), step("residences", 60)] });
    const view = buildChangeKpis(CONTEXT, times(20, amenities), times(20, residences));
    expect(kpi(view, "top_feature").display).toBe("Amenities");
    expect(kpi(view, "top_feature").trend).toEqual({
      direction: null,
      tone: "neutral",
      display: "Residences 7 days ago",
      spoken: "Residences was the top feature 7 days ago.",
    });
  });

  it("says it was the top seven days earlier too, without an arrow's colour", () => {
    const residences = () => session({ steps: [step("home", 30), step("residences", 60)] });
    const view = buildChangeKpis(CONTEXT, times(20, residences), times(20, residences));
    expect(kpi(view, "top_feature").trend).toEqual({
      direction: "flat",
      tone: "neutral",
      display: "the top 7 days ago too",
      spoken: "Also the top feature 7 days ago.",
    });
  });
});

describe("absence", () => {
  it("states a period with no meeting in one sentence, and draws no nought", () => {
    const view = buildChangeKpis(
      CONTEXT,
      [],
      times(20, () => session()),
    );
    expect(view.kpis).toEqual([]);
    expect(view.empty).toBe("the period holds no meeting, so there is no figure to show.");
  });
});

describe("the registry", () => {
  it("declares every figure on the screen, in the screen's order", () => {
    const view = buildChangeKpis(
      CONTEXT,
      times(20, () => session()),
      times(20, () => session()),
    );
    expect(view.kpis.map((k) => k.metricId)).toEqual(CHANGE_FIGURES.map((m) => m.id));
    for (const m of CHANGE_FIGURES) {
      expect(m.denominator).not.toBeNull();
      expect(m.minimumSampleSize).toBe(AGENT_MIN_SAMPLE);
      expect(m.comparison).toBe("seven_days_earlier");
    }
  });
});

describe("on Shark Residence, quarter to date", () => {
  it("reads the period's meetings and quarter to date as it was seven days earlier", async () => {
    const query = {
      viewer: VIEWERS.developerShark,
      tenantSlug: "shark",
      projectSlug: "shark-residence",
      period: "quarter_to_date" as const,
      language: "en" as const,
    };
    const overview = await new SyntheticObserverRepository().getShowroomOverview(query);
    const earlier = sessionsInPeriod(
      "prj_sharkres001",
      "2026-07-01T00:00:00.000+02:00",
      "2026-08-17T23:59:59.999+02:00",
    );
    expect(overview.kpis.meetings).toBe(overview.meetingCount);
    expect(overview.kpis.earlierMeetings).toBe(earlier.length);
    expect(overview.kpis.title).toBe("What changed since 7 days ago");
    expect(overview.kpis.basis).toContain("1 Jul – 17 Aug");
    expect(overview.kpis.kpis).toHaveLength(8);
  });
});
