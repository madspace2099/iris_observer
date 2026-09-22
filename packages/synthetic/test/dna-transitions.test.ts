import { describe, expect, it } from "vitest";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import { buildTransitions } from "../src/showroom/project";

/**
 * A transition's share carries the denominator it was divided by.
 *
 * The share is of the moves out of the row's own starting section, so two
 * rows on one list have two denominators. The read model said so in a
 * docblock and the screen showed two percentages side by side; a reader
 * comparing them compared two fractions of different wholes without knowing.
 * The whole now travels with the share.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_dna_transitions"; // never a real project

function step(ordinal: number, sectionId: ShowroomStep["sectionId"]): ShowroomStep {
  return {
    ordinal,
    sectionId,
    itemId: null,
    itemLabel: null,
    enteredAt: null,
    dwellSeconds: 30,
    isReturn: false,
    availability: "legacy_available",
  };
}

function session(meetingId: string, order: readonly ShowroomStep["sectionId"][]): ShowroomSession {
  return {
    sessionId: `s-${meetingId}`,
    meetingId,
    projectId: PROJECT_ID,
    agentId: "agent_test",
    channel: "showroom",
    contactId: null,
    startedAt: "2026-03-12T14:30:00.000Z",
    endedAt: "2026-03-12T15:00:00.000Z",
    durationSeconds: 1_800,
    outcome: "presentation_only",
    steps: order.map((sectionId, i) => step(i + 1, sectionId)),
    units: [],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

/* Two moves out of Home, one out of Residences: three moves in all. */
const rows = buildTransitions([
  session("a", ["home", "residences", "gallery"]),
  session("b", ["home", "gallery"]),
]);
const move = (from: string, to: string) => rows.find((r) => r.from === from && r.to === to);

describe("a transition carries the denominator of its share", () => {
  it("counts every move out of the starting section", () => {
    expect(
      move("home", "residences")?.outOf,
      "the denominator is not the moves out of the row's own `from`",
    ).toBe(2);
  });

  it("is that fraction", () => {
    expect(move("home", "residences")?.share).toBeCloseTo(0.5, 5);
  });

  it("is per starting section, not the whole set", () => {
    expect(move("residences", "gallery")?.outOf, "one denominator was used for every row").toBe(1);
  });
});
