import { describe, expect, it } from "vitest";
import type { ShowroomSession } from "@observer/contracts";
import { countMeetingsBeforeSale, firstOpeningOf } from "../src/showroom/sale-cycles";

/**
 * THE MEETINGS BEFORE A SALE ARE COUNTED OUT OF THE MEETINGS THAT OPENED THE
 * UNIT, AND NOTHING OBSERVED IS AN ABSENCE, NOT A ZERO (R07-4).
 *
 * Constructed sessions with the instants chosen by hand, so the expected
 * figures do not come from the function under test.
 */
function session(meetingId: string, startedAt: string, units: readonly string[]): ShowroomSession {
  return {
    sessionId: `s-${meetingId}`,
    meetingId,
    projectId: "prj_testcyclecount",
    agentId: "agent_test",
    channel: "showroom",
    contactId: null,
    startedAt,
    endedAt: startedAt,
    durationSeconds: 600,
    outcome: "presentation_only",
    steps: [],
    units: units.map((unitCode) => ({
      unitId: `unit_${unitCode}`,
      unitCode,
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
    })),
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

const HISTORY = [
  session("m1", "2026-04-01T09:00:00.000Z", ["A-1", "B-2"]),
  session("m2", "2026-04-10T09:00:00.000Z", ["A-1"]),
  session("m3", "2026-05-02T09:00:00.000Z", ["A-1"]), // on the Sold day, before the instant
  session("m4", "2026-05-02T15:00:00.000Z", ["A-1"]), // on the Sold day, after the instant
  session("m5", "2026-06-01T09:00:00.000Z", ["A-1", "B-2"]),
];
const SOLD = "2026-05-02T12:00:00.000Z";

describe("the meetings before a sale", () => {
  it("counts, out of every meeting that opened the unit, those by the Sold instant", () => {
    expect(countMeetingsBeforeSale(HISTORY, "A-1", SOLD)).toEqual({ count: 3, of: 5 });
    expect(countMeetingsBeforeSale(HISTORY, "B-2", SOLD)).toEqual({ count: 1, of: 2 });
  });

  it("is null with no Sold date, and null when no meeting opened the unit", () => {
    expect(countMeetingsBeforeSale(HISTORY, "A-1", null)).toBeNull();
    expect(countMeetingsBeforeSale(HISTORY, "C-9", SOLD)).toBeNull();
    expect(countMeetingsBeforeSale([], "A-1", SOLD)).toBeNull();
  });

  it("finds the unit's first opening, or none", () => {
    expect(firstOpeningOf(HISTORY, "B-2")).toBe(Date.parse("2026-04-01T09:00:00.000Z"));
    expect(firstOpeningOf(HISTORY, "C-9")).toBe(Infinity);
  });
});
