import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildPresentationIntelligence } from "../src/showroom/project";

/**
 * A session the source could not time cannot answer a question about time.
 *
 * "Spends over a minute on Home" carried a note promising that timing-blind
 * sessions are excluded from both sides, while the code counted each of them
 * as "did not" — in the denominator, out of the numerator — so the rate fell
 * with every legacy session in the period. Ten timed meetings, five over a
 * minute, beside ten the source could not time: the note said 50%, the code
 * printed 25%. The exclusion now happens, on the one definition of "the source
 * could time it" (`fullyTimed`, the agent lane's), and a row whose answerable
 * sample falls under the floor on a side is withheld by name rather than drawn
 * from five meetings — or from none, as 0%.
 *
 * ## Why constructed
 *
 * Every fixture meeting on the synthetic projects is timed end to end, so no
 * fixture can tell the two readings apart. The shape that can is built here.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_dna_timing"; // never a real project: isolation is provable, not coincidental

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
  steps: readonly ShowroomStep[],
  timingUnavailable = false,
): ShowroomSession {
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
    timingUnavailable,
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

/** Home for `homeSeconds`, then Residences; the source timed every step. */
const timed = (id: string, homeSeconds: number) =>
  session(id, [step(1, "home", homeSeconds), step(2, "residences", 30)]);
/** The same order, and the source could not time any of it. */
const blind = (id: string) =>
  session(id, [step(1, "home", null), step(2, "residences", null)], true);
const many = (n: number, make: (i: number) => ShowroomSession) =>
  Array.from({ length: n }, (_, i) => make(i));

/** Ten over a minute, ten under, ten the source could not time. */
const LEFT = [
  ...many(10, (i) => timed(`l-long-${i}`, 90)),
  ...many(10, (i) => timed(`l-short-${i}`, 30)),
  ...many(10, (i) => blind(`l-blind-${i}`)),
];
/** Twenty under a minute, every one of them timed. */
const RIGHT = many(AGENT_MIN_SAMPLE, (i) => timed(`r-${i}`, 30));

const compare = (left: readonly ShowroomSession[], right: readonly ShowroomSession[]) =>
  buildPresentationIntelligence(CONTEXT, left, right, "periods", null, null);
const longOpening = (view: ReturnType<typeof compare>) =>
  view.comparison?.differences.find((d) => d.id === "long_opening");

describe("a session the source could not time is outside the rate on both sides", () => {
  const view = compare(LEFT, RIGHT);

  it("rates 'over a minute on Home' over the meetings the source could time", () => {
    expect(
      longOpening(view)?.leftDisplay,
      "a timing-blind session was counted as 'did not' in the denominator",
    ).toBe("50%");
  });

  it("counts only those meetings as the row's sample", () => {
    expect(longOpening(view)?.sampleLeft).toBe(20);
  });

  it("keeps the lane's count as the lane's", () => {
    /* Guards the guard: the row's sample and the lane's count must differ here, or nothing was excluded. */
    expect(view.comparison?.left.meetingCount).toBe(30);
  });
});

describe("a behaviour too few could answer is withheld by name", () => {
  /* Twenty-five meetings on the right, five of them timed: over the lane's floor, under the row's. */
  const FEW = [...many(5, (i) => timed(`f-${i}`, 30)), ...many(20, (i) => blind(`f-blind-${i}`))];
  const view = compare(LEFT, FEW);

  it("does not draw the row", () => {
    expect(longOpening(view), "a rate was drawn from five meetings").toBeUndefined();
  });

  it("says which behaviour, and both counts", () => {
    expect(view.comparison?.withheld, "the row went silent without a stated reason").toEqual([
      expect.stringMatching(/over a minute on Home.*20 and 5/),
    ]);
  });

  it("is the row's floor, not the comparison's", () => {
    expect(view.comparison?.verdictRefusal).toBeNull();
  });
});
