import { describe, expect, it } from "vitest";
import type { MeetingOutcome, ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildAgentDetail } from "../src/showroom/screens";

/**
 * The region says what it is: the agent's own recorded outcome.
 *
 * "Verified outcomes" counted `session.outcome` — what the agent tapped at the
 * end of the meeting — withheld it without a CRM as though the CRM produced
 * it, and carried the attributed tier and `CRM_OUTCOME_CONTEXT` as though a
 * system of record stood behind it. No deal is linked to a meeting
 * (ADR-0039), so none can. The count stands on every project, at the observed
 * tier, from the showroom alone.
 *
 * ## Why constructed
 *
 * The projects with no CRM in the fixtures record no outcomes at all (every
 * meeting `skipped`), so no fixture can show a number standing without a CRM.
 * The shape that can is built here: a presenter with recorded purchases on a
 * project whose `connectedSources` name no CRM.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_recorded_outcomes"; // never a real project

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

/** No CRM among the connected sources: the case the region used to refuse. */
const NO_CRM_CONTEXT = {
  viewer: { role: "developer" },
  tenant: { slug: "test-tenant" },
  project: {
    id: PROJECT_ID,
    slug: "test-project",
    name: "Test project",
    locale: "en-GB",
    timeZone: "Europe/Bratislava",
    connectedSources: ["showroom"],
  },
  period: {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-04-01T00:00:00.000Z",
    label: "This quarter",
    baselineLabel: "last quarter",
  },
  ownDataOnly: false,
} as unknown as ViewContext;

const many = (n: number, outcome: MeetingOutcome, prefix: string) =>
  Array.from({ length: n }, (_, i) => session(`${prefix}${i}`, outcome));

/* Three purchases and two reservations among twenty-five meetings. */
const SESSIONS = [
  ...many(3, "purchase", "p"),
  ...many(2, "reservation", "r"),
  ...many(20, "presentation_only", "o"),
];

const view = buildAgentDetail(NO_CRM_CONTEXT, SESSIONS, [], "agt_monika");
const purchase = view?.recordedOutcomes.find((o) => o.outcome === "purchase");

describe("the outcomes an agent recorded stand on their own", () => {
  it("stand as a number where no CRM is connected", () => {
    expect(
      purchase?.metric.display,
      "the agent's own entry was withheld as though a CRM produced it",
    ).toBe("3");
  });

  it("carry the meetings they are counted out of", () => {
    expect(purchase?.metric.qualifier).toBe("of 25 meetings");
  });

  it("claim only the record", () => {
    expect(
      purchase?.tier,
      "a recorded outcome was presented as a conversion attributed under a rule",
    ).toBe("observed_sequence");
  });

  it("name no system of record as their source", () => {
    expect(purchase?.sources, "the showroom's own record was credited to the CRM").not.toContain(
      "CRM_OUTCOME_CONTEXT",
    );
  });
});
