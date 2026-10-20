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
 * month. Below `AGENT_MIN_SAMPLE` recorded meetings, the set the rate stands
 * on, a row states the shortfall instead. Every expected string is written out by hand from the sessions below,
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
 * Akhilesh, 8 held, all in August: 12 short of the 20 recorded a rate needs.
 * Iva, 21 held, past 20, but 3 never recorded: 6 purchase and 12 not
 * interested are 18 recorded, 2 short of the 20.
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
const IVA = [
  ...many(6, "agt_iva", "purchase", AUGUST),
  ...many(12, "agt_iva", "not_interested", AUGUST),
  ...many(3, "agt_iva", "skipped", AUGUST),
];

const CONTEXT = viewContext({ project: { id: PROJECT_ID, locale: "en-GB" } });
const flow = buildSalesFlow(
  CONTEXT,
  [...MONIKA, ...AKHILESH, ...IVA],
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
      display: "No rate yet: 12 short of the 20 recorded meetings needed",
      belowMinimum: true,
    });
  });

  it("counts the floor on the recorded meetings, not the meetings held", () => {
    expect(ring("agt_iva")?.figure).toEqual({
      meetingsDisplay: "21 meetings",
      display: "No rate yet: 2 short of the 20 recorded meetings needed",
      belowMinimum: true,
    });
  });
});

describe("the team's outcome row", () => {
  it("states every meeting of the period", () => {
    // 25 + 8 + 21 = 54 held; 22 + 8 + 18 = 48 recorded; 16 + 2 + 6 = 24 progressed.
    expect(flow.team).toEqual({
      meetingsDisplay: "54 meetings",
      display: "50% progressed · 24 of 48 recorded",
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

  it("states each month's own rate over its own recorded meetings, from 20 recorded", () => {
    // July: 10 held, all recorded, 10 short. August: 23 held, 20 recorded, 8 progressed.
    expect(columns.map((c) => [c.label, c.figure.meetingsDisplay, c.figure.display])).toEqual([
      ["Jul", "10 meetings", "No rate yet: 10 short of the 20 recorded meetings needed"],
      ["Aug", "23 meetings", "40% progressed · 8 of 20 recorded"],
      ["Sept", "2 meetings", "No outcome recorded, so no rate"],
    ]);
    expect(columns.map((c) => c.figure.belowMinimum)).toEqual([true, false, true]);
  });
});
