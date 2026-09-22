import { describe, expect, it } from "vitest";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildAgentsView } from "../src/showroom/views3";

/**
 * A share of presentation time is a share of the time the source could time —
 * and the reader is told how many meetings that is.
 *
 * ## What the arithmetic does and does not change
 *
 * `sectionSeconds` and `totalSeconds` used to read `?? 0` on a null dwell. A
 * null contributes nought to a sum whether it is zeroed or skipped, so the
 * refactor to skipping changes no number — measured across every fixture:
 * none. What it changes is what the code SAYS it does, and what the read model
 * now states beside the share: `timedMeetings` and `timedMeetingCount`, the
 * set the share stands on. Those are what these tests guard. A mutation that
 * restores `?? 0` fails nothing here, and that is the finding, not a gap.
 *
 * ## The rule the share follows now: a partly timed meeting moves no share
 *
 * The docblocks said the shares stood on the fully timed meetings; the builder
 * summed every meeting's timed steps. A test here asserted that `MIXED` alone
 * gave residences a share of 0.25 — and the same profile's `timedMeetings` was
 * 0: a 25% share on a stated set of nothing. The Features page's
 * `environmentTimeShare` already filtered on `fullyTimed`; the agent lane now
 * follows it, one definition at two scopes. A meeting the source could not time
 * end to end is outside the share on both sides; on its own it yields nought
 * with `timedMeetings` 0, and a renderer reads the set, not the nought.
 *
 * ## Why the sessions are constructed
 *
 * The fixtures' nulls are whole sessions. A session with SOME steps timed —
 * which the ingest path can deliver — never occurs there, and it is the case
 * where "every step timed" and "not flagged timingUnavailable" part company.
 *
 * One measured assertion per test.
 */

const PROJECT_ID = "prj_test_section_time"; // never a real project: isolation is provable, not coincidental

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
  project: { id: PROJECT_ID, slug: "test-project", locale: "en-GB", timeZone: "Europe/Bratislava" },
  period: { to: "9999-01-01T00:00:00.000Z", label: "the period", baselineLabel: "before" },
} as unknown as ViewContext;

/** Every step timed. */
const TIMED = session("mtg_timed", [
  step(1, "residences", 100),
  step(2, "amenities", 100),
  step(3, "gallery", 200),
]);
/** No step timed: the fixtures' shape. */
const UNTIMED = session("mtg_untimed", [step(1, "residences", null), step(2, "amenities", null)]);
/** Some steps timed: the ingest path's shape. */
const MIXED = session("mtg_mixed", [
  step(1, "residences", 100),
  step(2, "amenities", null),
  step(3, "gallery", 300),
]);

const profileOf = (sessions: readonly ShowroomSession[]) =>
  buildAgentsView(CONTEXT, sessions, false).agents.find((a) => a.agentId === "agent_test");

describe("the set a share of time stands on", () => {
  it("counts a meeting with every step timed", () => {
    expect(profileOf([TIMED])?.timedMeetings).toBe(1);
  });

  it("does not count a meeting no step of which was timed", () => {
    expect(
      profileOf([TIMED, UNTIMED])?.timedMeetings,
      "an untimed meeting was counted as timed",
    ).toBe(1);
  });

  it("does not count a meeting only some steps of which were timed", () => {
    expect(
      profileOf([TIMED, MIXED])?.timedMeetings,
      "a partly timed meeting was counted as timed",
    ).toBe(1);
  });

  it("states the team's timed set on the view, apart from its meeting count", () => {
    const view = buildAgentsView(CONTEXT, [TIMED, UNTIMED, MIXED], false);
    expect(view.timedMeetingCount, "the team's timed set was not stated").toBe(1);
  });

  it("keeps the meeting count itself as every meeting, timed or not", () => {
    /* Guards the guard: the two counts must be different numbers, or one is redundant. */
    const view = buildAgentsView(CONTEXT, [TIMED, UNTIMED, MIXED], false);
    expect(view.meetingCount).toBe(3);
  });
});

describe("what the share is a share of", () => {
  it("is nought, on a set of nought, for a meeting only some steps of which were timed", () => {
    /*
     * MIXED: 100 in residences, 300 in gallery, one step untimed. This used
     * to assert 0.25 — 100 of 400 timed seconds — beside a `timedMeetings` of
     * 0, a share on a set the read model said was empty. The meeting is
     * outside the share now, and alone it leaves nothing to share.
     */
    const residences = profileOf([MIXED])?.sections.find((s) => s.sectionId === "residences");
    expect(
      residences?.timeShare,
      "a partly timed meeting was given a share of time on a set of no timed meetings",
    ).toBe(0);
  });

  it("is unmoved by a meeting only some steps of which were timed", () => {
    /*
     * TIMED gives gallery 200 of 400. Summing MIXED's timed steps in would
     * make it 500 of 800 — a different share, on a set the docblocks said it
     * did not stand on.
     */
    const alone = profileOf([TIMED])?.sections.find((s) => s.sectionId === "gallery")?.timeShare;
    const withMixed = profileOf([TIMED, MIXED])?.sections.find(
      (s) => s.sectionId === "gallery",
    )?.timeShare;
    expect(withMixed, "a partly timed meeting moved a share of time").toBeCloseTo(alone ?? -1, 5);
  });

  it("reads no habit from a set of no timed meetings", () => {
    expect(
      profileOf([MIXED])?.signature,
      "a section was named as leaned on with nothing timed to lean on",
    ).toBeNull();
  });

  it("is unmoved by a meeting the source could not time at all", () => {
    const alone = profileOf([TIMED])?.sections.find((s) => s.sectionId === "gallery")?.timeShare;
    const withUntimed = profileOf([TIMED, UNTIMED])?.sections.find(
      (s) => s.sectionId === "gallery",
    )?.timeShare;
    expect(withUntimed, "an untimed meeting moved a share of time").toBeCloseTo(alone ?? -1, 5);
  });
});
