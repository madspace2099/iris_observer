import { describe, expect, it } from "vitest";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildStorytelling } from "../src/showroom/project";

/**
 * Time & weather's share of presentation time: one definition, the set stated,
 * a null dwell outside it on both sides.
 *
 * ## Why constructed
 *
 * The fixtures' untimed meetings are whole meetings and the share is unmoved by
 * them either way — measured, nought — so a fixture-driven test could not tell
 * a share of "the time the source could time" from a share of everything with
 * unknowns zeroed. The shapes that tell them apart are built here: a meeting
 * with one untimed step, and a set with nothing timed at all.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_environment_share"; // never a real project: isolation is provable, not coincidental

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
    durationSeconds: 9_999,
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
  period: { to: "9999-01-01T00:00:00.000Z", label: "the period", baselineLabel: "before" },
} as unknown as ViewContext;

/** 100 of 400 timed seconds in Time & weather. */
const A = session("mtg_a", [
  step(1, "residences", 200),
  step(2, "environment", 100),
  step(3, "gallery", 100),
]);
/** 50 of 200. Together with A: 150 of 600 = 25%. */
const B = session("mtg_b", [step(1, "residences", 150), step(2, "environment", 50)]);
/** Reaches Time & weather, but one step the source could not time. */
const PARTLY = session("mtg_partly", [step(1, "residences", null), step(2, "environment", 500)]);
/** No step timed. */
const UNTIMED = session("mtg_untimed", [step(1, "residences", null), step(2, "environment", null)]);

const shareOf = (sessions: readonly ShowroomSession[]) =>
  buildStorytelling(CONTEXT, sessions).environment.timeShare;

describe("what the share is a share of", () => {
  it("is environment seconds over every section's seconds, across the timed meetings", () => {
    expect(
      shareOf([A, B])?.share,
      "the share is not of the seconds the source could time",
    ).toBeCloseTo(150 / 600, 5);
  });

  it("carries the denominator it was divided by", () => {
    expect(shareOf([A, B])?.timedSeconds).toBe(600);
  });

  it("carries the numerator too, so a reader can check the division", () => {
    expect(shareOf([A, B])?.environmentSeconds).toBe(150);
  });
});

describe("the set the share stands on", () => {
  it("leaves a meeting with an untimed step out of the numerator", () => {
    /* PARTLY has 500 environment seconds the source timed, beside a step it could not. */
    expect(
      shareOf([A, B, PARTLY])?.environmentSeconds,
      "a partly timed meeting's seconds entered the numerator",
    ).toBe(150);
  });

  it("leaves a meeting with an untimed step out of the denominator", () => {
    expect(
      shareOf([A, B, PARTLY])?.timedSeconds,
      "a partly timed meeting's seconds entered the denominator",
    ).toBe(600);
  });

  it("does not count a meeting the source could not time in the set", () => {
    expect(
      shareOf([A, B, PARTLY, UNTIMED])?.timedMeetings,
      "a meeting the source could not time was counted in the set",
    ).toBe(2);
  });

  it("still counts every meeting in the total, timed or not", () => {
    /* Guards the guard: the two counts must differ, or the set is not being stated. */
    expect(shareOf([A, B, PARTLY, UNTIMED])?.meetingsTotal).toBe(4);
  });

  it("is null, not nought, when no meeting was fully timed", () => {
    expect(shareOf([PARTLY, UNTIMED]), "nothing to stand on was reported as a share").toBeNull();
  });
});
