import { afterEach, describe, expect, it } from "vitest";
import type { ShowroomSession, ShowroomUnitInteraction } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildMeetingReplay } from "../src/showroom/project";
import { provideCatalogue, type RawUnit } from "../src/pulse";

/**
 * Which way the looking time leaned, in every shape the answer takes.
 *
 * ## One measured assertion per test
 *
 * Several of these cases exist to be mutated — the qualification dropped, a
 * band dropped, the denominator dropped — and a mutation is read by WHICH
 * assertion fails. Two assertions guarding one mutation in one test means only
 * the first can ever speak. So each `it` below makes one claim, and a second
 * claim about the same case is a second `it`.
 *
 * ## Why every case is constructed
 *
 * The fixtures never put six units of one aspect beside one of another with a
 * heavy dwell on the one — which is the exact shape the denominator exists
 * for — and they hold no code the catalogue lacks. The sessions are hand-built
 * against a catalogue this file provides and takes away again, in the shape
 * `replay-units.test.ts` and `views3.test.ts` established.
 */

const PROJECT_ID = "prj_test_replay_aspect"; // never a real project: isolation is provable, not coincidental

function unit(unitCode: string, dwellSeconds: number): ShowroomUnitInteraction {
  return {
    unitId: `u-${unitCode}`,
    unitCode,
    views: 1,
    dwellSeconds,
    longestViewSeconds: dwellSeconds,
    favourited: false,
    pdfOpened: false,
    balconyViews: 0,
    floorCutViews: 0,
    screenshots: 0,
    comparedWith: [],
    keptFromComparison: null,
    shared: false,
  };
}

function session(units: readonly ShowroomUnitInteraction[]): ShowroomSession {
  return {
    sessionId: "s-1",
    meetingId: "mtg_test",
    projectId: PROJECT_ID,
    agentId: "agent_test",
    channel: "showroom",
    contactId: null,
    startedAt: "2026-03-12T14:30:00.000Z",
    endedAt: "2026-03-12T15:00:00.000Z",
    durationSeconds: 1800,
    outcome: "presentation_only",
    steps: [],
    units,
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

function raw(code: string, orientation: RawUnit["orientation"]): RawUnit {
  return {
    code,
    block: "A",
    floor: 1,
    rooms: 2,
    areaSqm: 60,
    orientation,
    price: 200_000,
    status: "available",
  };
}

const CONTEXT = {
  tenant: { slug: "test-tenant" },
  project: { id: PROJECT_ID, slug: "test-project", locale: "en-GB", timeZone: "Europe/Bratislava" },
} as unknown as ViewContext;

/** Three south, three west, one north, one with no stated aspect. */
const CATALOGUE: readonly RawUnit[] = [
  raw("S-1", "S"),
  raw("S-2", "S"),
  raw("S-3", "S"),
  raw("W-1", "W"),
  raw("W-2", "W"),
  raw("W-3", "W"),
  raw("N-1", "N"),
  raw("X-1", null),
];

const interestOf = (units: readonly ShowroomUnitInteraction[]) =>
  buildMeetingReplay(CONTEXT, session(units)).unitsViewed.interest;

describe("two groups", () => {
  afterEach(() => {
    provideCatalogue(PROJECT_ID, null);
  });

  it("names a leader when the first group beats the second by the band", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /* S: 200/240 ÷ 2/4 = 1.67 · W: 40/240 ÷ 2/4 = 0.33 · gap 80% */
    const interest = interestOf([
      unit("S-1", 100),
      unit("S-2", 100),
      unit("W-1", 20),
      unit("W-2", 20),
    ]);
    expect(interest.shape).toBe("leader");
  });

  it("reads a near-tie as split, not as a leader", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /* S: 200/380 ÷ 0.5 = 1.05 · W: 180/380 ÷ 0.5 = 0.95 · gap 10%, inside the band */
    const interest = interestOf([
      unit("S-1", 100),
      unit("S-2", 100),
      unit("W-1", 90),
      unit("W-2", 90),
    ]);
    expect(interest.shape, "a near-tie was named as a leader").toBe("split");
  });

  it("picks the leader by share of what was opened, not by raw seconds", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /*
     * Three south at 30s each (90s), two west at 40s each (80s). Raw dwell says
     * south. Against supply: S 90/170 ÷ 3/5 = 0.88, W 80/170 ÷ 2/5 = 1.18, and
     * the gap is 25%. West leads, because two units held nearly as much time
     * as three.
     */
    const interest = interestOf([
      unit("S-1", 30),
      unit("S-2", 30),
      unit("S-3", 30),
      unit("W-1", 40),
      unit("W-2", 40),
    ]);
    expect(
      interest.groups[0]?.orientation,
      "the leader was picked by raw dwell rather than by share of what was opened",
    ).toBe("W");
  });

  it("carries the index the sentence is built from", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const interest = interestOf([
      unit("S-1", 100),
      unit("S-2", 100),
      unit("W-1", 20),
      unit("W-2", 20),
    ]);
    expect(interest.groups[0]?.index).toBeCloseTo(200 / 240 / (2 / 4), 5);
  });
});

describe("one group", () => {
  afterEach(() => {
    provideCatalogue(PROJECT_ID, null);
  });

  it("leans toward the group when it drew more than its share by the band", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /* S: 200/240 ÷ 2/4 = 1.67 — the lone west and north units are supply, not groups */
    const interest = interestOf([
      unit("S-1", 100),
      unit("S-2", 100),
      unit("W-1", 20),
      unit("N-1", 20),
    ]);
    expect(interest.shape).toBe("above_share");
  });

  it("says attention followed supply inside the band, rather than leaning either way", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /* S: 105/200 ÷ 2/4 = 1.05 — above 1.0, inside the band */
    const interest = interestOf([
      unit("S-1", 52),
      unit("S-2", 53),
      unit("W-1", 50),
      unit("N-1", 45),
    ]);
    expect(interest.shape, "a group inside the band was read as leaning").toBe("followed");
  });

  it("leans away from the group when it drew less than its share by the band", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /* S: 20/220 ÷ 2/4 = 0.18 */
    const interest = interestOf([
      unit("S-1", 10),
      unit("S-2", 10),
      unit("W-1", 100),
      unit("N-1", 100),
    ]);
    expect(interest.shape).toBe("below_share");
  });

  it("does not count a single opened unit as a group, however long it was looked at", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /*
     * Two south at 100s, one west at 500s. With two units a group, only south
     * qualifies: 200/700 ÷ 2/3 = 0.43, leaning away. If one unit were a group,
     * west would qualify at 500/700 ÷ 1/3 = 2.14 and lead — a different shape.
     */
    const interest = interestOf([unit("S-1", 100), unit("S-2", 100), unit("W-1", 500)]);
    expect(interest.shape, "a single opened unit was counted as a group").toBe("below_share");
  });
});

describe("no group, one aspect, none known", () => {
  afterEach(() => {
    provideCatalogue(PROJECT_ID, null);
  });

  it("has no group to speak of when no aspect was opened twice", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const interest = interestOf([unit("S-1", 100), unit("W-1", 100), unit("N-1", 100)]);
    expect(interest.shape).toBe("no_group");
  });

  it("names one aspect when every opened unit shares it", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const interest = interestOf([unit("S-1", 100), unit("S-2", 100), unit("S-3", 100)]);
    expect(interest.shape).toBe("one_orientation");
  });

  it("treats a single opened unit as one aspect, not as a shortfall", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const interest = interestOf([unit("S-1", 100)]);
    expect(interest.shape).toBe("one_orientation");
  });

  it("says so when no opened unit has a stated aspect", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /* One held without an aspect, one the catalogue does not hold at all. */
    const interest = interestOf([unit("X-1", 100), unit("Z-99", 100)]);
    expect(interest.shape).toBe("unknown");
  });

  it("leaves a unit with no stated aspect out of the supply it measures against", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /*
     * Guards the denominator. X-1 has no aspect, so it is neither a group nor
     * supply: S is 200/240 ÷ 2/4 = 1.67 over the four with an aspect, not
     * 200/340 ÷ 2/5 over five.
     */
    const interest = interestOf([
      unit("S-1", 100),
      unit("S-2", 100),
      unit("W-1", 20),
      unit("N-1", 20),
      unit("X-1", 100),
    ]);
    expect(interest.groups[0]?.index).toBeCloseTo(200 / 240 / (2 / 4), 5);
  });
});
