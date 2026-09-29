import { describe, expect, it } from "vitest";

import type {
  ShowroomFilterApplication,
  ShowroomPlaceInteraction,
  ShowroomSession,
  ShowroomUnitInteraction,
} from "@observer/contracts";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";

import { buildAgentCharts, buildFeatureUsage } from "../src/showroom/charts";

/**
 * WHICH OF THE SHOWROOM'S TOOLS AN AGENT REACHES FOR.
 *
 * Every expectation is counted by hand from the sessions built below: one
 * agent, four meetings, and exactly one of the four uses the tool under test.
 * So every measured axis must read one meeting in four, 0.25. The three axes
 * the current build cannot answer must read no value at all — not a nought —
 * and carry their own reason, even when a session holds something shaped like
 * them.
 */

const AGENT = "agt_feature";
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

function place(section: ShowroomPlaceInteraction["section"]): ShowroomPlaceInteraction {
  return {
    placeId: `plc_${section}`,
    placeName: section === "amenities" ? "Rooftop terrace" : "Riverside park",
    category: "leisure",
    section,
    dwellSeconds: 30,
    availability: section === "amenities" ? "legacy_available" : "requires_ue5_v2_event",
  };
}

const FILTER: ShowroomFilterApplication = {
  field: "rooms",
  value: "3",
  matches: 4,
  availability: "requires_ue5_v2_event",
};

function meeting(
  id: string,
  parts: Partial<Pick<ShowroomSession, "units" | "places" | "filters" | "screenshots">> = {},
): ShowroomSession {
  return {
    sessionId: `ses_${id}`,
    meetingId: `mtg_${id}`,
    projectId: "prj_feature",
    agentId: AGENT,
    channel: "showroom",
    contactId: null,
    startedAt: "2026-06-01T10:00:00+02:00",
    endedAt: "2026-06-01T10:30:00+02:00",
    durationSeconds: 1800,
    outcome: "interested",
    steps: [],
    units: [unit()],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
    ...parts,
  };
}

/** Four meetings, the first carrying `parts`; the agent's value on one axis, and the axis itself. */
function readAxis(
  id: string,
  parts: Parameters<typeof meeting>[1],
): { value: number | null | undefined; missing: string | null | undefined } {
  const sessions = [meeting("1", parts), meeting("2"), meeting("3"), meeting("4")];
  const usage = buildFeatureUsage(sessions, LOCALE);
  const at = usage.axes.findIndex((axis) => axis.id === id);
  const profile = usage.profiles.find((p) => p.id === AGENT);
  return { value: at < 0 ? undefined : profile?.values[at], missing: usage.axes[at]?.missing };
}

describe("buildFeatureUsage: the seven axes the current build can answer", () => {
  it("Locating counts a meeting that stopped on a named place in Amenities", () => {
    expect(readAxis("locating", { places: [place("amenities")] }).value).toBe(0.25);
    /* A Surroundings place is Exploring's, which is not measured: it must not count here. */
    expect(readAxis("locating", { places: [place("surroundings")] }).value).toBe(0);
  });

  it("Comparing counts a meeting that placed an apartment beside another in Compare", () => {
    expect(
      readAxis("comparing", { units: [unit({ comparedWith: ["B-2"], keptFromComparison: true })] })
        .value,
    ).toBe(0.25);
    expect(readAxis("comparing", { units: [unit({ comparedWith: [] })] }).value).toBe(0);
  });

  it("Shortlisting counts a meeting that favourited an apartment, once however many", () => {
    expect(readAxis("shortlisting", { units: [unit({ favourited: true })] }).value).toBe(0.25);
    expect(
      readAxis("shortlisting", {
        units: [
          unit({ favourited: true }),
          unit({ unitId: "unt_b2", unitCode: "B-2", favourited: true }),
        ],
      }).value,
    ).toBe(0.25);
  });

  it("Capturing counts a meeting that took a screenshot of an apartment", () => {
    expect(readAxis("capturing", { units: [unit({ screenshots: 2 })] }).value).toBe(0.25);
    /* The axis reads the apartment's own screenshots, as it is defined; a session total alone does not count. */
    expect(readAxis("capturing", { screenshots: 3 }).value).toBe(0);
  });

  it("Slicing counts a meeting that opened an apartment's floor cut", () => {
    expect(readAxis("slicing", { units: [unit({ floorCutViews: 1 })] }).value).toBe(0.25);
  });

  it("Reading counts a meeting that opened an apartment's PDF", () => {
    expect(readAxis("reading", { units: [unit({ pdfOpened: true })] }).value).toBe(0.25);
  });

  it("Sharing counts a meeting that shared an apartment", () => {
    expect(readAxis("sharing", { units: [unit({ shared: true })] }).value).toBe(0.25);
  });

  it("a meeting that used nothing reads nought on every measured axis, not no value", () => {
    const usage = buildFeatureUsage([meeting("1"), meeting("2")], LOCALE);
    const profile = usage.profiles.find((p) => p.id === AGENT);
    usage.axes.forEach((axis, i) => {
      if (axis.missing === null) expect(profile?.values[i]).toBe(0);
    });
  });
});

describe("buildFeatureUsage: the three axes the current build cannot answer", () => {
  /*
   * Each session below holds what looks like the missing measurement: a
   * Surroundings place, a filter. Neither is read. The value is absent and the
   * axis says why, in its own words.
   */
  const everything = {
    places: [place("surroundings"), place("amenities")],
    filters: [FILTER],
  };

  it("Exploring returns no value and its own reason: Surroundings is recorded only as a section", () => {
    const { value, missing } = readAxis("exploring", everything);
    expect(value).toBeNull();
    expect(missing).toMatch(/^Not measured yet\. /);
    expect(missing).toContain("requires_ue5_v2_event");
  });

  it("Filtering returns no value and its own reason: the build sends no filter event", () => {
    const { value, missing } = readAxis("filtering", everything);
    expect(value).toBeNull();
    expect(missing).toMatch(/^Not measured yet\. /);
    expect(missing).toContain("sends no filter event");
  });

  it("Walking returns no value and its own reason: spaceman mode is not modelled", () => {
    const { value, missing } = readAxis("walking", everything);
    expect(value).toBeNull();
    expect(missing).toMatch(/^Not measured yet\. /);
    expect(missing).toContain("Spaceman mode is not modelled");
  });

  it("the three reasons are three different sentences, and no measured axis carries one", () => {
    const usage = buildFeatureUsage([meeting("1")], LOCALE);
    const reasons = usage.axes.flatMap((axis) => (axis.missing === null ? [] : [axis.missing]));
    expect(new Set(reasons).size).toBe(3);
    expect(usage.axes.map((axis) => axis.id)).toEqual([
      "locating",
      "comparing",
      "shortlisting",
      "capturing",
      "slicing",
      "reading",
      "sharing",
      "exploring",
      "filtering",
      "walking",
    ]);
    expect(usage.axes.slice(0, 7).every((axis) => axis.missing === null)).toBe(true);
  });
});

describe("the feature-usage model rides on the agent charts, under the same floor", () => {
  it("is carried by buildAgentCharts, and an agent under the floor is flagged with the floor's sentence", () => {
    const few = Array.from({ length: AGENT_MIN_SAMPLE - 1 }, (_, i) => meeting(String(i)));
    const [profile] = buildAgentCharts(few, "/alpha/prj", LOCALE).featureUsage.profiles;
    expect(profile?.meetings).toBe(AGENT_MIN_SAMPLE - 1);
    expect(profile?.belowMinimum).toBe(true);
    expect(profile?.note).toContain(`short of the ${String(AGENT_MIN_SAMPLE)}`);

    const enough = Array.from({ length: AGENT_MIN_SAMPLE }, (_, i) => meeting(String(i)));
    const [cleared] = buildAgentCharts(enough, "/alpha/prj", LOCALE).featureUsage.profiles;
    expect(cleared?.belowMinimum).toBe(false);
    expect(cleared?.note).toBeNull();
  });
});
