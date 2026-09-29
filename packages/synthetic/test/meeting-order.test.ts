import { describe, expect, it } from "vitest";
import type { ShowroomSession } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildMeetingList } from "../src/showroom/project";

/**
 * The meetings register is totally ordered, including when two meetings start
 * in the same millisecond.
 *
 * ## Why the collision is manufactured here
 *
 * `packages/synthetic/src/showroom/project.ts` sorts the register newest first.
 * Measured across every project and every period, today's fixtures contain no
 * two meetings sharing a start — checked at minute granularity, which is
 * coarser than the millisecond key, so the instants cannot collide either.
 *
 * That makes a fixture-driven test useless for this: it would pass against a
 * sort with no tiebreaker at all, and report that the order is total when
 * nothing had tested it. So these sessions are hand-built with deliberately
 * equal `startedAt` values, in the shape `views3.test.ts` established for the
 * same reason — the point under test is this function's ordering, not whatever
 * ISTER TOWER's dataset happens to hold today.
 *
 * Two agents presenting at once, or a second installation in the same showroom,
 * produce the same instant without anything unusual happening. The register is
 * the one surface where the reader's position in the list IS the order.
 */

function session(meetingId: string, startedAt: string): ShowroomSession {
  return {
    sessionId: `s-${meetingId}`,
    meetingId,
    projectId: "prj_test",
    agentId: "agent_test",
    channel: "showroom",
    contactId: null,
    startedAt,
    endedAt: startedAt,
    durationSeconds: 600,
    outcome: "presentation_only",
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

/* `tenant.slug`, `project.slug`, `project.locale` and `project.timeZone` are what
 * `buildMeetingList` reads; the rest is a type-satisfying stand-in. */
const CONTEXT = {
  tenant: { slug: "test-tenant" },
  project: { slug: "test-project", locale: "en-GB", timeZone: "Europe/Bratislava" },
  period: { to: "9999-01-01T00:00:00.000Z", label: "the period", baselineLabel: "before" },
} as unknown as ViewContext;

/** One instant, four meetings. The identifiers are deliberately not in order. */
const SAME = "2026-03-12T14:30:00.000Z";
const COLLIDING = [
  session("mtg_c", SAME),
  session("mtg_a", SAME),
  session("mtg_d", SAME),
  session("mtg_b", SAME),
];

describe("the register's order is total", () => {
  it("orders meetings that share an instant, rather than leaving them as they arrived", () => {
    const order = buildMeetingList(CONTEXT, COLLIDING).map((m) => m.meetingId);

    /*
     * The input order is c, a, d, b. A sort with no tiebreaker is stable in V8,
     * so it would return exactly that — which is why this asserts the sorted
     * order and not merely "some order".
     */
    expect(order, "meetings sharing an instant are left in the order they arrived").toEqual([
      "mtg_a",
      "mtg_b",
      "mtg_c",
      "mtg_d",
    ]);
  });

  it("returns the same order however the colliding meetings arrive", () => {
    const forwards = buildMeetingList(CONTEXT, COLLIDING).map((m) => m.meetingId);
    const backwards = buildMeetingList(CONTEXT, [...COLLIDING].reverse()).map((m) => m.meetingId);
    const shuffled = buildMeetingList(CONTEXT, [
      COLLIDING[2]!,
      COLLIDING[0]!,
      COLLIDING[3]!,
      COLLIDING[1]!,
    ]).map((m) => m.meetingId);

    expect(backwards, "reversing the input changed the register").toEqual(forwards);
    expect(shuffled, "reordering the input changed the register").toEqual(forwards);
  });

  it("still puts the newest first when the instants differ", () => {
    /*
     * Guards the guard. A tiebreaker that had quietly become the primary key
     * would satisfy both assertions above and get the register backwards.
     */
    const order = buildMeetingList(CONTEXT, [
      session("mtg_z", "2026-03-10T09:00:00.000Z"),
      session("mtg_a", "2026-03-12T09:00:00.000Z"),
    ]).map((m) => m.meetingId);

    expect(order, "the identifier has taken over from the instant").toEqual(["mtg_a", "mtg_z"]);
  });
});
