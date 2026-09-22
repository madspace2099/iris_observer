import { describe, expect, it } from "vitest";
import type { MeetingOutcome, ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildPresentationIntelligence } from "../src/showroom/project";

/**
 * One half-set, one number.
 *
 * The cohorts finding read "74 records" beside "n = 65 meetings": the evidence
 * counted the whole period's slice and the sample counted the two cohorts, and
 * the nine meetings with no recorded outcome — in neither cohort — were the
 * difference nobody could see. Periods read "74 records" beside "n = 109",
 * evidence smaller than the sample. The evidence behind a comparison is now
 * the meetings on its two sides, in every mode, and what stands on neither
 * side is named beside the n rather than left as arithmetic.
 *
 * ## Why constructed
 *
 * The shape is the fixture's — 26, 39 and 9 on Northgate this quarter — but a
 * fixture moves, and a test that reads "9" from one cannot say why 9 matters.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_dna_evidence"; // never a real project

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

function session(
  meetingId: string,
  outcome: MeetingOutcome,
  compares: boolean,
  agentId = "agent_test",
): ShowroomSession {
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
    outcome,
    steps: compares
      ? [step(1, "home"), step(2, "compare"), step(3, "residences")]
      : [step(1, "home"), step(2, "residences")],
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

const many = (n: number, make: (i: number) => ShowroomSession) =>
  Array.from({ length: n }, (_, i) => make(i));

/* Northgate's shape this quarter: 26 progressed, 39 did not, 9 never recorded an outcome. */
const PROGRESSED = many(26, (i) => session(`p${i}`, "purchase", true));
const DID_NOT = many(39, (i) => session(`d${i}`, "presentation_only", false));
const UNKNOWN = many(9, (i) => session(`u${i}`, "skipped", false));
const SLICE = [...PROGRESSED, ...DID_NOT, ...UNKNOWN];

describe("the evidence behind a cohort comparison is the two cohorts", () => {
  const view = buildPresentationIntelligence(CONTEXT, SLICE, [], "cohorts", null, null);

  it("counts the meetings on the two sides as the comparison's records", () => {
    expect(
      view.comparison?.evidence.observationCount,
      "the records counted the whole slice, not the two cohorts",
    ).toBe(65);
  });

  it("draws the finding's records and its n from the same count", () => {
    const finding = view.findings[0];
    expect(finding?.evidence.observationCount).toBe(finding?.sampleSize);
  });

  it("names the meetings that stand in neither cohort", () => {
    expect(
      String(view.comparison?.excluded),
      "nine meetings left the comparison without being named",
    ).toMatch(/9 meetings in the period have no recorded outcome/);
  });

  it("carries that sentence on the finding", () => {
    expect(String(view.findings[0]?.caveat)).toContain("no recorded outcome");
  });

  it("names nothing when every meeting has an outcome", () => {
    /* Guards the guard: the sentence is about the nine, not a fixed caveat. */
    const every = buildPresentationIntelligence(
      CONTEXT,
      [...PROGRESSED, ...DID_NOT],
      [],
      "cohorts",
      null,
      null,
    );
    expect(every.comparison?.excluded).toBeNull();
  });
});

describe("the same count in the other modes", () => {
  it("counts both periods' meetings as the comparison's records", () => {
    const previous = many(35, (i) => session(`q${i}`, "presentation_only", false));
    const view = buildPresentationIntelligence(CONTEXT, SLICE, previous, "periods", null, null);
    expect(
      view.comparison?.evidence.observationCount,
      "the records counted the current period alone, beside a sample of both",
    ).toBe(74 + 35);
  });

  it("counts the two agents' meetings, as before", () => {
    const monika = many(25, (i) => session(`m${i}`, "presentation_only", true, "agt_monika"));
    const akhilesh = many(25, (i) => session(`a${i}`, "presentation_only", false, "agt_akhilesh"));
    const view = buildPresentationIntelligence(
      CONTEXT,
      [...monika, ...akhilesh],
      [],
      "agents",
      "agt_monika",
      "agt_akhilesh",
    );
    expect(view.comparison?.evidence.observationCount).toBe(50);
  });
});
