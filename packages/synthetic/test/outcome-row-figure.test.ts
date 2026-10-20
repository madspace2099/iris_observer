import { describe, expect, it } from "vitest";
import type { MeetingOutcome, ShowroomSession } from "@observer/contracts";
import { buildComposition } from "../src/showroom/charts";
import { buildSalesFlow } from "../src/showroom/views3";
import { viewContext } from "./view-context";

/**
 * THE OUTCOME ROW PRINTS ITS FIGURE; THE READ MODEL WRITES IT (ADR-0041).
 *
 * Sales Flow's outcome rows state, beside each bar, the progressed share of
 * the recorded meetings with that denominator: for a presenter, the team and a
 * month. Every expected string is written out by hand from the sessions below,
 * never built by the code under test.
 */

const PROJECT_ID = "prj_testoutcomerow"; // never a real project

function session(
  meetingId: string,
  agentId: string,
  outcome: MeetingOutcome,
  startedAt: string,
): ShowroomSession {
  return {
    sessionId: `s-${meetingId}`,
    meetingId,
    projectId: PROJECT_ID,
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt,
    endedAt: startedAt,
    durationSeconds: 1_800,
    outcome,
    steps: [],
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

const many = (n: number, agentId: string, outcome: MeetingOutcome, startedAt: string) =>
  Array.from({ length: n }, (_, i) =>
    session(`${agentId}-${outcome}-${startedAt}-${i}`, agentId, outcome, startedAt),
  );

const JULY = "2026-07-14T10:00:00.000Z";
const AUGUST = "2026-08-11T10:00:00.000Z";

/*
 * Monika, 25 held: 7 purchase, 3 reservation, 6 interested (16 progressed),
 * 4 presentation only, 2 not interested (22 recorded), 3 never recorded.
 * Akhilesh, 8 held, all in August: 12 short of the 20 a presenter's rate needs.
 */
const MONIKA = [
  ...many(7, "agt_monika", "purchase", JULY),
  ...many(3, "agt_monika", "reservation", JULY),
  ...many(6, "agt_monika", "interested", AUGUST),
  ...many(4, "agt_monika", "presentation_only", AUGUST),
  ...many(2, "agt_monika", "not_interested", AUGUST),
  ...many(3, "agt_monika", "skipped", AUGUST),
];
const AKHILESH = [
  ...many(2, "agt_akhilesh", "follow_up_needed", AUGUST),
  ...many(6, "agt_akhilesh", "not_interested", AUGUST),
];

const CONTEXT = viewContext({ project: { id: PROJECT_ID, locale: "en-GB" } });
const flow = buildSalesFlow(
  CONTEXT,
  [...MONIKA, ...AKHILESH],
  new Date("2026-08-24T12:00:00.000Z"),
  [],
);
const ring = (agentId: string) => flow.rings.find((r) => r.agentId === agentId);

describe("a presenter's outcome row", () => {
  it("states the rate over the recorded meetings, with that count", () => {
    expect(ring("agt_monika")?.figure).toEqual({
      meetingsDisplay: "25 meetings",
      display: "73% progressed · 16 of 22 recorded",
      belowMinimum: false,
    });
  });

  it("states how far short it is below the floor, and no rate", () => {
    expect(ring("agt_akhilesh")?.figure).toEqual({
      meetingsDisplay: "8 meetings",
      display: "No rate yet: 12 short of the 20 meetings needed",
      belowMinimum: true,
    });
  });
});

describe("the team's outcome row", () => {
  it("states every meeting of the period, with no floor", () => {
    // 33 held; 22 + 8 = 30 recorded; 16 + 2 = 18 progressed.
    expect(flow.team).toEqual({
      meetingsDisplay: "33 meetings",
      display: "60% progressed · 18 of 30 recorded",
      belowMinimum: false,
    });
  });
});

describe("a month's outcome row", () => {
  const columns = buildComposition(
    [...MONIKA, ...AKHILESH, ...many(2, "agt_monika", "skipped", "2026-09-02T10:00:00.000Z")],
    "en-GB",
    "Europe/Bratislava",
  ).columns;

  it("states each month's own rate over its own recorded meetings", () => {
    // July: 10 held, all recorded, all progressed. August: 23 held, 20 recorded, 8 progressed.
    expect(columns.map((c) => [c.label, c.figure.meetingsDisplay, c.figure.display])).toEqual([
      ["Jul", "10 meetings", "100% progressed · 10 of 10 recorded"],
      ["Aug", "23 meetings", "40% progressed · 8 of 20 recorded"],
      ["Sept", "2 meetings", "No outcome recorded, so no rate"],
    ]);
  });

  it("holds a month to no presenter floor", () => {
    expect(columns.every((c) => !c.figure.belowMinimum)).toBe(true);
  });
});
