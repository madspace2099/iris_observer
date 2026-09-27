import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildStorytelling } from "../src/showroom/project";

/**
 * A PAIR OF FEATURES IS STATED AS TRAVELLING TOGETHER ONLY ABOVE THE FLOOR.
 *
 * Features holds its pair table to twenty presentations ("Co-occurrence between
 * features is not reported at this sample"), and the same association used to
 * stand under "What stands out" below it: one screen, two answers. Constructed
 * sessions, so the pair is as strong as it gets on both sides of the floor:
 * half the meetings open Compare and Shortlist together and half open neither,
 * which is twice what independent use would produce.
 */
const PROJECT_ID = "prj_test_pairing_floor"; // never a real project

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

function session(meetingId: string, steps: readonly ShowroomStep[]): ShowroomSession {
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
    steps,
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
  project: {
    id: PROJECT_ID,
    slug: "test-project",
    locale: "en-GB",
    timeZone: "Europe/Bratislava",
    connectedSources: [],
  },
  period: { to: "9999-01-01T00:00:00.000Z", label: "This quarter", baselineLabel: "last quarter" },
} as unknown as ViewContext;

/* Half of `n` meetings open Compare and Shortlist together; the other half open neither. */
const paired = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    i % 2 === 0
      ? session(`mtg_b${String(i)}`, [step(1, "home"), step(2, "compare"), step(3, "shortlist")])
      : session(`mtg_n${String(i)}`, [step(1, "home"), step(2, "residences")]),
  );

const pairingIn = (n: number) =>
  buildStorytelling(CONTEXT, paired(n)).findings.find((f) => f.id === "pairing");

describe("the pairing finding on Features", () => {
  it("is not stated below the floor the pair table is held to", () => {
    /* Twelve meetings, six of them with both: a pair the table would list, from a sample it does not report. */
    expect(pairingIn(12), "an association stated from twelve meetings").toBeUndefined();
  });

  it("is not stated one meeting under the floor either", () => {
    expect(pairingIn(AGENT_MIN_SAMPLE - 1)).toBeUndefined();
  });

  it("is stated at the floor, where the table reports it too", () => {
    expect(pairingIn(AGENT_MIN_SAMPLE)?.statement).toMatch(
      /^Compare and Shortlist appear together/,
    );
  });
});
