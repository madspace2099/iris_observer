import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildAgentsView } from "../src/showroom/views3";

/**
 * The roster's lead finding does not say what its cards refuse to.
 *
 * `agents-signature` picked the largest over-index across every agent, so it
 * named a four-meeting habit as the page's first sentence while the same
 * agent's card had withheld "leans on" under the floor. An agent under
 * `AGENT_MIN_SAMPLE` is not a candidate; where nobody clears it, the refusal
 * is a finding in the card's own words, not a missing one.
 *
 * ## Why constructed
 *
 * The presenter under the floor must lean harder than the one over it, or the
 * floor is never the reason the finding names who it names. Built so: one
 * presenter spends every second in Compare over a handful of meetings, the
 * other spreads twenty-five meetings across three sections.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_signature_floor"; // never a real project

function step(
  ordinal: number,
  sectionId: ShowroomStep["sectionId"],
  dwellSeconds: number,
): ShowroomStep {
  return {
    ordinal,
    sectionId,
    itemId: null,
    itemLabel: null,
    enteredAt: null,
    dwellSeconds,
    isReturn: false,
    availability: "legacy_available",
  };
}

function session(
  meetingId: string,
  agentId: string,
  steps: readonly ShowroomStep[],
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

/** Spread across three sections. */
const spread = (i: number, agentId: string) =>
  session(`s${agentId}${i}`, agentId, [
    step(1, "home", 60),
    step(2, "residences", 120),
    step(3, "compare", 20),
  ]);
/** Every second in Compare — the harder lean. */
const compareOnly = (i: number, agentId: string) =>
  session(`c${agentId}${i}`, agentId, [step(1, "compare", 200)]);
const many = (n: number, make: (i: number) => ShowroomSession) =>
  Array.from({ length: n }, (_, i) => make(i));

const roster = (monika: number, akhilesh: number) =>
  buildAgentsView(
    CONTEXT,
    [
      ...many(monika, (i) => spread(i, "agt_monika")),
      ...many(akhilesh, (i) => compareOnly(i, "agt_akhilesh")),
    ],
    false,
  );

describe("the lead finding names nobody under the floor", () => {
  /* Akhilesh leans harder, over five meetings; Monika clears the floor. */
  const view = roster(AGENT_MIN_SAMPLE + 5, 5);

  it("names the presenter who clears the floor, not the one who leans hardest", () => {
    expect(
      view.findings.find((f) => f.id === "agents-signature")?.statement,
      "a habit under the floor was read as the page's finding",
    ).toMatch(/^Monika/);
  });

  it("withholds nothing when somebody clears it", () => {
    expect(view.findings.map((f) => f.id)).not.toContain("agents-signature-withheld");
  });

  it("names the set the share stands on, not the meetings held", () => {
    /* Every constructed meeting is timed end to end, so the two counts agree here; the form is the claim. */
    expect(
      String(view.findings.find((f) => f.id === "agents-signature")?.baseline),
      "the finding cites the meetings held where the share stands on the timed ones",
    ).toMatch(/^25 of 25 meetings the source could time end to end/);
  });
});

describe("where nobody clears the floor", () => {
  const view = roster(10, 5);

  it("draws no signature finding", () => {
    expect(
      view.findings.map((f) => f.id),
      "a verdict was drawn under the floor",
    ).not.toContain("agents-signature");
  });

  it("says so in the card's own words rather than saying nothing", () => {
    expect(
      String(view.findings.find((f) => f.id === "agents-signature-withheld")?.statement),
      "the signature finding went silent without a stated reason",
    ).toContain(`10 short of the ${AGENT_MIN_SAMPLE} needed for a verdict`);
  });
});
