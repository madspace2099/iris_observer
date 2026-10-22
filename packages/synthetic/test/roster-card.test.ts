import { viewContext } from "./view-context";
import { describe, expect, it } from "vitest";
import type { MeetingOutcome, ShowroomSession } from "@observer/contracts";
import { buildAgentsView } from "../src/showroom/views3";

/**
 * THE ROSTER CARD AND THE REPEAT CHART, IN THE READ MODEL'S WORDS (ADR-0057).
 *
 * The owner, 2026-10-22: the same seven outcomes on every card, a zero
 * printed as 0; one headline figure; the repeat chart understood in seconds,
 * its share's base stated. Every expected value below is counted by hand from
 * the meetings built here, never read back from the builder.
 */

const PROJECT_ID = "prj_testrostercard"; // never a real project

function session(
  id: string,
  agentId: string,
  outcome: MeetingOutcome,
  contact: { readonly id: string; readonly prior: number } | null = null,
): ShowroomSession {
  return {
    sessionId: `s-${id}`,
    meetingId: id,
    projectId: PROJECT_ID,
    agentId,
    channel: "showroom",
    contactId: contact?.id ?? null,
    startedAt: "2026-03-12T14:30:00.000Z",
    endedAt: "2026-03-12T15:00:00.000Z",
    durationSeconds: 1_800,
    outcome,
    steps: [],
    units: [],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: contact?.prior ?? 0,
    timingUnavailable: false,
  };
}

const CONTEXT = viewContext({
  tenant: { slug: "test-tenant" },
  project: { id: PROJECT_ID, slug: "test-project", locale: "en-GB", timeZone: "Europe/Bratislava" },
  period: { to: "9999-01-01T00:00:00.000Z", label: "Quarter to date", baselineLabel: "before" },
});

const many = (n: number, agentId: string, outcome: MeetingOutcome, prefix: string) =>
  Array.from({ length: n }, (_, i) => session(`${prefix}${i}`, agentId, outcome));

/*
 * Monika: 6 purchases, 9 follow-ups, 7 presentation only, 3 with none recorded.
 * 25 held, 22 recorded, 15 progressed (6 + 9): 15 / 22 = 68.18% -> "68%".
 * No reservation, no "interested", no "not interested": three measured zeros.
 */
const MONIKA = [
  ...many(6, "agt_monika", "purchase", "mp"),
  ...many(9, "agt_monika", "follow_up_needed", "mf"),
  ...many(7, "agt_monika", "presentation_only", "mo"),
  ...many(3, "agt_monika", "skipped", "ms"),
];
/* Akhilesh: 12 recorded (4 interested, 8 not interested), under the floor of 20. */
const AKHILESH = [
  ...many(4, "agt_akhilesh", "interested", "ai"),
  ...many(8, "agt_akhilesh", "not_interested", "an"),
];

const view = buildAgentsView(CONTEXT, [...MONIKA, ...AKHILESH], false);
const card = (agentId: string) => view.agents.find((a) => a.agentId === agentId);

describe("the card's seven outcome rows", () => {
  it("are the same seven, in ladder order, on every card", () => {
    const order = [
      "purchase",
      "reservation",
      "interested",
      "follow_up_needed",
      "presentation_only",
      "not_interested",
      "skipped",
    ];
    expect(card("agt_monika")?.outcomes.map((o) => o.outcome)).toEqual(order);
    expect(card("agt_akhilesh")?.outcomes.map((o) => o.outcome)).toEqual(order);
  });

  it("count an outcome nobody ended in as 0, not as absent", () => {
    expect(card("agt_monika")?.outcomes.map((o) => o.count)).toEqual([6, 0, 0, 9, 7, 0, 3]);
    expect(card("agt_akhilesh")?.outcomes.map((o) => o.count)).toEqual([0, 0, 4, 0, 0, 8, 0]);
  });

  it("leave the ring's own slices as they were: only what is drawn", () => {
    expect(card("agt_monika")?.ring.slices.map((s) => s.count)).toEqual([6, 9, 7, 3]);
  });
});

describe("the card's headline figure", () => {
  it("is the rate alone, and what it is of beside it", () => {
    expect(card("agt_monika")?.headline).toEqual({
      figure: "68%",
      caption: "progressed · 15 of 22 recorded",
    });
  });

  it("is no rate under the floor of recorded meetings, and says how far short", () => {
    /* 12 recorded, 8 short of 20. */
    expect(card("agt_akhilesh")?.headline).toEqual({
      figure: null,
      caption: "No rate yet: 8 short of the 20 recorded meetings needed",
    });
  });

  it("says the same as the outcome row's one line, split in two", () => {
    expect(card("agt_monika")?.ring.figure.display).toBe("68% progressed · 15 of 22 recorded");
  });
});

describe("the repeat chart", () => {
  /*
   * Seven meetings: two first meetings, one second, one fourth-or-later (prior
   * 5), three with no contact. Shares of all seven: 29%, 14%, 14%, 43%.
   */
  const repeats = buildAgentsView(
    CONTEXT,
    [
      session("r1", "agt_monika", "purchase", { id: "c1", prior: 0 }),
      session("r2", "agt_monika", "purchase", { id: "c2", prior: 0 }),
      session("r3", "agt_monika", "purchase", { id: "c3", prior: 1 }),
      session("r4", "agt_monika", "purchase", { id: "c4", prior: 5 }),
      session("r5", "agt_monika", "purchase"),
      session("r6", "agt_monika", "purchase"),
      session("r7", "agt_monika", "purchase"),
    ],
    false,
  );

  it("names its rows in plain words, every one, a row nobody fell in at 0", () => {
    expect(repeats.repeats.map((r) => [r.label, r.meetings, r.shareDisplay])).toEqual([
      ["First meeting", 2, "29%"],
      ["Second meeting", 1, "14%"],
      ["Third meeting", 0, "0%"],
      ["Fourth or later", 1, "14%"],
      ["Buyer not identified", 3, "43%"],
    ]);
  });

  it("has no row at all with no meeting, where a share would be of nothing", () => {
    expect(buildAgentsView(CONTEXT, [], false).repeats).toEqual([]);
  });

  it("states what every share is of", () => {
    expect(repeats.repeatsOf).toBe("Share of all 7 meetings, quarter to date.");
  });

  it("says there is nothing to share out with no meeting", () => {
    expect(buildAgentsView(CONTEXT, [], false).repeatsOf).toBe("No meeting in quarter to date.");
  });
});
