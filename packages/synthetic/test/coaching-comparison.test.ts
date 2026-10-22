import { describe, expect, it } from "vitest";
import type { ShowroomSession, ShowroomUnitInteraction } from "@observer/contracts";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { DEFAULT_LANGUAGE, type OverviewQuery, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src";
import { buildFeatureUsage } from "../src/showroom/charts";

/**
 * COACHING'S ONE QUESTION: HOW DO THE AGENTS DIFFER? (ADR-0057)
 *
 * The owner, 2026-10-22: the two Coaching panels were a mess. One chart now,
 * one sentence for the widest gap, at most three differences, each with the
 * meetings it is of. Every expected figure below is counted by hand from the
 * meetings built here; Shark Residence is checked against the figures its old
 * reading printed for the same meetings (76% of 33, 19% of 26).
 */

const LOCALE = "en-GB";

function unit(overrides: Partial<ShowroomUnitInteraction> = {}): ShowroomUnitInteraction {
  return {
    unitId: "unt_a1",
    unitCode: "A-1",
    views: 1,
    dwellSeconds: 60,
    longestViewSeconds: 60,
    favourited: false,
    pdfOpened: false,
    balconyViews: 0,
    floorCutViews: 0,
    screenshots: 0,
    comparedWith: [],
    keptFromComparison: null,
    shared: false,
    ...overrides,
  };
}

function meeting(
  agentId: string,
  i: number,
  used: Partial<ShowroomUnitInteraction>,
): ShowroomSession {
  return {
    sessionId: `ses_${agentId}_${i}`,
    meetingId: `mtg_${agentId}_${i}`,
    projectId: "prj_coaching_comparison",
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt: "2026-06-01T10:00:00+02:00",
    endedAt: "2026-06-01T10:30:00+02:00",
    durationSeconds: 1800,
    outcome: "interested",
    steps: [],
    units: [unit(used)],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

/** `n` meetings by one agent; meeting i uses whatever `pick(i)` returns. */
const agent = (id: string, n: number, pick: (i: number) => Partial<ShowroomUnitInteraction>) =>
  Array.from({ length: n }, (_, i) => meeting(id, i, pick(i)));

/*
 * Three agents at the floor, twenty meetings each, and one under it with five.
 *
 *              compare        favourite      screenshot     share
 *   A          15/20 = 75%    10/20 = 50%    20/20 = 100%   2/20 = 10%
 *   B           5/20 = 25%    12/20 = 60%    14/20 =  70%   2/20 = 10%
 *   C          15/20 = 75%     8/20 = 40%    18/20 =  90%   2/20 = 10%
 *   spread          50 pts         20 pts         30 pts         0
 *
 * Every other part is used by nobody: 0% each, no gap.
 */
const A = "agt_monika";
const B = "agt_akhilesh";
const C = "agt_martin";
const D = "agt_tomas";
const pick =
  (compare: number, favourite: number, screenshot: number) =>
  (i: number): Partial<ShowroomUnitInteraction> => ({
    comparedWith: i < compare ? ["unt_b2"] : [],
    favourited: i < favourite,
    screenshots: i < screenshot ? 1 : 0,
    shared: i < 2,
  });
const SESSIONS = [
  ...agent(A, AGENT_MIN_SAMPLE, pick(15, 10, 20)),
  ...agent(B, AGENT_MIN_SAMPLE, pick(5, 12, 14)),
  ...agent(C, AGENT_MIN_SAMPLE, pick(15, 8, 18)),
  ...agent(D, 5, pick(5, 5, 5)),
];

const usage = buildFeatureUsage(SESSIONS, LOCALE, "en");
const { comparison } = usage;
const name = (id: string) => usage.profiles.find((p) => p.id === id)?.label ?? id;
/* The seat order the chart and every list of names keep. */
const seat = (ids: readonly string[]) =>
  [...ids].sort(
    (x, y) =>
      usage.profiles.findIndex((p) => p.id === x) - usage.profiles.findIndex((p) => p.id === y),
  );

describe("the rows", () => {
  it("run from the widest gap to the narrowest, a tie in the parts' own order", () => {
    expect(comparison.rows.map((r) => r.id)).toEqual([
      "comparing",
      "capturing",
      "shortlisting",
      "locating",
      "slicing",
      "reading",
      "sharing",
    ]);
  });

  it("name each part as something a meeting did", () => {
    expect(comparison.rows[0]?.label).toBe("Compare two apartments side by side");
  });

  it("draw the agents at the floor only, each at the share of their own meetings", () => {
    const compare = comparison.rows[0]?.marks;
    expect(compare?.map((m) => m.agentId).sort()).toEqual([A, B, C].sort());
    expect(Object.fromEntries((compare ?? []).map((m) => [m.agentId, m.display]))).toEqual({
      [A]: "75%",
      [B]: "25%",
      [C]: "75%",
    });
  });

  it("say who sits at each end on the three widest, with the meetings each figure is of", () => {
    expect(comparison.rows[0]?.ends).toEqual({
      high: {
        agentIds: seat([A, C]),
        names: seat([A, C]).map(name).join(" and "),
        share: "75%",
        of: "of 20 and 20 meetings",
      },
      low: { agentIds: [B], names: name(B), share: "25%", of: "of 20 meetings" },
    });
    expect(comparison.rows[1]?.ends?.high.share).toBe("100%");
    expect(comparison.rows[1]?.ends?.low).toMatchObject({ names: name(B), share: "70%" });
    expect(comparison.rows[2]?.ends?.high).toMatchObject({ names: name(B), share: "60%" });
    expect(comparison.rows[2]?.ends?.low).toMatchObject({ names: name(C), share: "40%" });
  });

  it("name nobody on a row with no gap, or past the third", () => {
    expect(comparison.rows.slice(3).map((r) => r.ends)).toEqual([null, null, null, null]);
  });
});

describe("the headline", () => {
  it("is the widest gap in plain words, both ends with their meetings", () => {
    const high = seat([A, C]).map(name).join(" and ");
    expect(comparison.headline).toBe(
      `They differ most in comparing two apartments side by side: ${high} did it in 75% of 20 and 20 meetings, ${name(B)} in 25% of 20 meetings.`,
    );
  });

  it("compares no two agents when only one is at the floor, and says so", () => {
    const one = buildFeatureUsage(
      [...agent(A, AGENT_MIN_SAMPLE, pick(1, 1, 1)), ...agent(D, 5, pick(5, 5, 5))],
      LOCALE,
      "en",
    ).comparison;
    expect(one.headline).toBe(
      `Only ${name(A)} reached 20 meetings in this period, so no two agents are compared.`,
    );
    expect(one.rows.every((r) => r.ends === null)).toBe(true);
  });

  it("draws nobody when nobody is at the floor", () => {
    const none = buildFeatureUsage(agent(D, 5, pick(5, 5, 5)), LOCALE, "en").comparison;
    expect(none.headline).toBe(
      "No agent reached 20 meetings in this period, so nobody is compared.",
    );
    expect(none.rows).toEqual([]);
  });
});

describe("the i", () => {
  it("names the parts not measured, and closes on the comparison's own words", () => {
    expect(comparison.method).toContain(
      "Not measured yet, so not drawn: stopping at a named place in Surroundings, filtering the apartments on show and walking the site in spaceman mode.",
    );
    expect(comparison.method).toContain("They are associations");
  });

  it("names no cause and ranks no person", () => {
    const words = [comparison.headline, comparison.method].join(" ");
    expect(words).not.toMatch(/\b(because|caused|drives|leads to|results in|due to|proves)\b/i);
    expect(words).not.toMatch(/\b(better|worse|best|worst)\b(?! one\.)/i);
  });
});

describe("Shark Residence, quarter to date", () => {
  const SHARK: OverviewQuery = {
    viewer: VIEWERS.developerShark as Viewer,
    tenantSlug: "shark",
    projectSlug: "shark-residence",
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  };

  it("says the five differ most in comparing apartments, Marek Dvořák to Oliver Grant", async () => {
    const { featureUsage } = await new SyntheticObserverRepository().getAgentCharts(SHARK);
    expect(featureUsage.comparison.headline).toBe(
      "They differ most in comparing two apartments side by side: Marek Dvořák did it in 76% of 33 meetings, Oliver Grant in 19% of 26 meetings.",
    );
  });
});
