import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildAgentsView } from "../src/showroom/views3";

/**
 * The habit's gate reads the set the habit stands on.
 *
 * "Leans on" and the signature finding are shares of the TIMED meetings. The
 * gate counted the meetings held, so a presenter with twenty-one held and
 * fifteen timed was read as a verdict with "n = 15" under it — the gate one
 * population, the claim another, the ring's defect a fourth time. And with the
 * gate on the timed set, the withheld branch had to follow: everyone clearing
 * twenty held and nobody twenty timed fell through both branches with nothing
 * said, which quietly withdrew "0 cells are left without a finding".
 *
 * ## Why constructed
 *
 * The fixtures hold the shape on every last-quarter cell (Akhilesh, Northgate:
 * 20 held, 16 timed), but a fixture moves. Here a presenter leans hardest on
 * twenty-five held of which fifteen are timed, beside one with twenty-five of
 * twenty-five.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_signature_timed_gate"; // never a real project

function step(
  ordinal: number,
  sectionId: ShowroomStep["sectionId"],
  dwellSeconds: number | null,
): ShowroomStep {
  return {
    ordinal,
    sectionId,
    itemId: null,
    itemLabel: null,
    enteredAt: null,
    dwellSeconds,
    isReturn: false,
    availability: dwellSeconds === null ? "requires_ue5_v2_event" : "legacy_available",
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

/** Timed end to end, spread across three sections. */
const spread = (i: number, agentId: string) =>
  session(`s${agentId}${i}`, agentId, [
    step(1, "home", 60),
    step(2, "residences", 120),
    step(3, "compare", 20),
  ]);
/** Timed end to end, every second in Compare — the harder lean. */
const compareOnly = (i: number, agentId: string) =>
  session(`c${agentId}${i}`, agentId, [step(1, "compare", 200)]);
/** One step the source could not time: held, not in the timed set. */
const blind = (i: number, agentId: string) =>
  session(`b${agentId}${i}`, agentId, [step(1, "compare", null), step(2, "home", 30)]);
const many = (n: number, make: (i: number) => ShowroomSession) =>
  Array.from({ length: n }, (_, i) => make(i));

describe("a habit on fewer timed meetings than the floor", () => {
  /* Akhilesh: 25 held, 15 timed, leaning hardest. Monika: 25 of 25. */
  const view = buildAgentsView(
    CONTEXT,
    [
      ...many(25, (i) => spread(i, "agt_monika")),
      ...many(15, (i) => compareOnly(i, "agt_akhilesh")),
      ...many(10, (i) => blind(i, "agt_akhilesh")),
    ],
    false,
  );
  const akhilesh = view.agents.find((a) => a.agentId === "agt_akhilesh");

  it("is not read as the finding, though the meetings held clear the floor", () => {
    expect(
      view.findings.find((f) => f.id === "agents-signature")?.statement,
      "a habit on fifteen timed meetings was read as the finding under a gate that counted twenty-five held",
    ).toMatch(/^Monika/);
  });

  it("is named on the card as the set it stands on, not as a habit", () => {
    expect(String(akhilesh?.signatureNote)).toContain(
      `15 meetings of the 25 held could be timed end to end, 5 short of the ${AGENT_MIN_SAMPLE}`,
    );
  });

  it("carries no note above the timed floor", () => {
    /* Guards the guard: the note is about the timed set, not a fixed sentence. */
    expect(view.agents.find((a) => a.agentId === "agt_monika")?.signatureNote).toBeNull();
  });
});

describe("where everyone clears twenty held and nobody twenty timed", () => {
  /* Both presenters: 25 held, 15 timed. Today this case said nothing at all. */
  const view = buildAgentsView(
    CONTEXT,
    [
      ...many(15, (i) => spread(i, "agt_monika")),
      ...many(10, (i) => blind(i, "agt_monika")),
      ...many(15, (i) => compareOnly(i, "agt_akhilesh")),
      ...many(10, (i) => blind(i, "agt_akhilesh")),
    ],
    false,
  );

  it("draws no signature finding", () => {
    expect(view.findings.map((f) => f.id)).not.toContain("agents-signature");
  });

  it("says so, naming the timed set", () => {
    expect(
      String(view.findings.find((f) => f.id === "agents-signature-withheld")?.statement),
      "the case fell through both branches with nothing said",
    ).toContain("was 15 meetings of 25 held, 5 short of the 20");
  });
});
