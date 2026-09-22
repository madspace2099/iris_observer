import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import { buildAgentCharts } from "../src/showroom/charts";

/**
 * The roster's charts keep the floor the roster's cards keep.
 *
 * The radar scales every axis against the strongest colleague — a ranking
 * without numbers — and the workload list printed a median under every name;
 * both were drawn from four meetings while the card beside them printed the
 * suppression note. Below `AGENT_MIN_SAMPLE` the radar profile is flagged and
 * carries the note in place of a shape, and the list's sub line is the note
 * rather than a median. One sentence, one builder: `suppressionNoteFor`.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_agent_charts_floor"; // never a real project

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

function session(meetingId: string, agentId: string): ShowroomSession {
  return {
    sessionId: `s-${meetingId}`,
    meetingId,
    projectId: PROJECT_ID,
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt: "2026-03-12T14:30:00.000Z",
    endedAt: "2026-03-12T15:00:00.000Z",
    durationSeconds: 1_800,
    outcome: "presentation_only",
    steps: [step(1, "home"), step(2, "residences"), step(3, "compare")],
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

const many = (n: number, agentId: string) =>
  Array.from({ length: n }, (_, i) => session(`${agentId}-${i}`, agentId));

/* Monika clears the floor with five to spare; Akhilesh is fifteen short. */
const charts = buildAgentCharts(
  [...many(AGENT_MIN_SAMPLE + 5, "agt_monika"), ...many(5, "agt_akhilesh")],
  "/test-tenant/test-project",
  "en-GB",
);
const profile = (id: string) => charts.radar.profiles.find((p) => p.id === id);
const row = (id: string) => charts.ranked.find((r) => r.id === id);

describe("the radar under the floor", () => {
  it("flags the presenter under the floor", () => {
    expect(
      profile("agt_akhilesh")?.belowMinimum,
      "a shape scaled against the strongest colleague was drawn from five meetings",
    ).toBe(true);
  });

  it("says why, in the card's own words", () => {
    expect(String(profile("agt_akhilesh")?.note)).toContain(`short of the ${AGENT_MIN_SAMPLE}`);
  });

  it("flags nobody who clears it", () => {
    /* Guards the guard: a floor that flagged everyone would pass the two above. */
    expect(profile("agt_monika")?.belowMinimum).toBe(false);
  });

  it("keeps the count out of the label under the floor, where the note carries it", () => {
    expect(
      profile("agt_akhilesh")?.label,
      "the card read the count twice: in the label and again in the note",
    ).toBe("Akhilesh Undev");
  });

  it("keeps the count in the label above the floor, beside the shape", () => {
    expect(profile("agt_monika")?.label).toBe("Monika Kováčová · 25 meetings");
  });
});

describe("the workload list under the floor", () => {
  it("prints the short form, not a median and not the sentence", () => {
    /*
     * The slot is one line wide; the sentence truncated there to "5 meetings
     * in this period, 15 short o…", a withholding the reader never received.
     */
    expect(
      row("agt_akhilesh")?.sub,
      "the sub line carries a median, or a sentence the slot cannot hold",
    ).toBe(`5 of ${AGENT_MIN_SAMPLE} meetings`);
  });

  it("prints the median where the floor is cleared", () => {
    expect(row("agt_monika")?.sub).toMatch(/^median /);
  });
});
