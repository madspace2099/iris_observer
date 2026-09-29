import { describe, expect, it } from "vitest";
import type { MeetingOutcome, ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildAgentsView } from "../src/showroom/views3";

/**
 * The outcome ring carries the denominator of its own rate.
 *
 * `progressedShare` stands on the meetings with an outcome recorded; the ring's
 * centre says every meeting. The roster card printed the rate beside the
 * centre, so "41%" stood over 21 where it was 7 of 17. The read model states
 * the decided count now and the screen prints it in words.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_ring_denominator"; // never a real project

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

function session(meetingId: string, outcome: MeetingOutcome): ShowroomSession {
  return {
    sessionId: `s-${meetingId}`,
    meetingId,
    projectId: PROJECT_ID,
    agentId: "agt_monika",
    channel: "showroom",
    contactId: null,
    startedAt: "2026-03-12T14:30:00.000Z",
    endedAt: "2026-03-12T15:00:00.000Z",
    durationSeconds: 1_800,
    outcome,
    steps: [step(1, "home"), step(2, "residences")],
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

const CONTEXT = {
  tenant: { slug: "test-tenant" },
  project: { id: PROJECT_ID, slug: "test-project", locale: "en-GB", timeZone: "Europe/Bratislava" },
  period: { to: "9999-01-01T00:00:00.000Z", label: "the period", baselineLabel: "before" },
} as unknown as ViewContext;

const many = (n: number, outcome: MeetingOutcome, prefix: string) =>
  Array.from({ length: n }, (_, i) => session(`${prefix}${i}`, outcome));

/* Seven progressed, ten did not, four were never given an outcome: 21 held, 17 decided. */
const ring = buildAgentsView(
  CONTEXT,
  [...many(7, "purchase", "p"), ...many(10, "presentation_only", "o"), ...many(4, "skipped", "s")],
  false,
).agents.find((a) => a.agentId === "agt_monika")?.ring;

describe("the ring's rate and its denominator", () => {
  it("states the meetings the rate is counted over", () => {
    expect(
      ring?.decidedMeetings,
      "the denominator of the rate is not on the read model, or is the meetings held",
    ).toBe(17);
  });

  it("keeps the meetings held as the centre", () => {
    expect(ring?.meetings).toBe(21);
  });

  it("is that fraction", () => {
    expect(ring?.progressedShare).toBeCloseTo(7 / 17, 5);
  });
});
