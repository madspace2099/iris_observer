import { describe, expect, it } from "vitest";
import type { ShowroomSession, ShowroomUnitInteraction } from "@observer/contracts";
import { DEFAULT_LANGUAGE, type ViewContext } from "@observer/readmodels";
import { buildMeetingReplay } from "../src/showroom/project";

/**
 * The replay's headline says what nothing else on the screen says, and not what
 * the sentence beneath it says again.
 *
 * "18m 53s, 5 steps, 5 units opened." sat two lines above "5 units opened:
 * 4 with 2 rooms, …" — one fact, printed twice, the unit register's thirteenth
 * column in prose. The count belongs to the sentence that breaks it down; the
 * headline keeps the length and the step count.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

function unit(unitCode: string): ShowroomUnitInteraction {
  return {
    unitId: `u-${unitCode}`,
    unitCode,
    views: 1,
    dwellSeconds: 60,
    longestViewSeconds: 60,
    favourited: false,
    pdfOpened: false,
    balconyViews: 0,
    floorCutViews: 0,
    screenshots: 0,
    comparedWith: [],
    keptFromComparison: null,
    shared: false,
  };
}

const SESSION: ShowroomSession = {
  sessionId: "s-1",
  meetingId: "mtg_test",
  projectId: "prj_test_replay_headline", // never a real project: isolation is provable, not coincidental
  agentId: "agent_test",
  channel: "showroom",
  contactId: null,
  startedAt: "2026-03-12T14:30:00.000Z",
  endedAt: "2026-03-12T15:00:00.000Z",
  durationSeconds: 1133,
  outcome: "presentation_only",
  steps: [],
  units: [unit("A-1"), unit("A-2"), unit("A-3"), unit("A-4"), unit("A-5")],
  environment: [],
  filters: [],
  places: [],
  screenshots: 0,
  irisRating: null,
  priorMeetings: 0,
  timingUnavailable: false,
};

const CONTEXT = {
  tenant: { slug: "test-tenant" },
  project: {
    id: "prj_test_replay_headline",
    slug: "test-project",
    locale: "en-GB",
    timeZone: "Europe/Bratislava",
  },
  language: DEFAULT_LANGUAGE,
} as unknown as ViewContext;

describe("the replay's headline", () => {
  it("does not carry the unit count, which the sentence beneath it carries", () => {
    const { headline } = buildMeetingReplay(CONTEXT, SESSION);
    expect(headline, "the headline still says how many units were opened").not.toMatch(/unit/i);
  });

  it("still carries the length and the step count", () => {
    /* Guards the guard: dropping the whole headline would satisfy the assertion above. */
    const { headline } = buildMeetingReplay(CONTEXT, SESSION);
    expect(headline, "the headline lost the length or the step count").toBe("18m 53s, 0 steps.");
  });

  it("leaves the unit count to the sentence beneath, where it is broken down", () => {
    const { unitsViewed } = buildMeetingReplay(CONTEXT, SESSION);
    expect(unitsViewed.sentence, "the count left the headline and reached nowhere").toMatch(
      /^5 units opened/,
    );
  });
});
