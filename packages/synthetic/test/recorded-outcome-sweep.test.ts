import { describe, expect, it } from "vitest";
import type {
  MeetingOutcome,
  ShowroomSession,
  ShowroomStep,
  ShowroomUnitInteraction,
} from "@observer/contracts";
import { DEFAULT_LANGUAGE, type ViewContext } from "@observer/readmodels";
import { provideCatalogue } from "../src/pulse";
import { buildAgentDetail, buildMeetingRows, buildUnitDetail } from "../src/showroom/screens";

/**
 * The recorded outcome is the room's own record, on every project.
 *
 * One claim stood in five shapes: the outcome the agent recorded at the end of
 * the meeting — a showroom fact (`docs/06-ownership.md`) — was gated on a CRM
 * as though the CRM had made it, or credited to the CRM by the attributed tier
 * and its chip. The follow-up figure, the funnel's outcome stages, the
 * registers' "No CRM" state, the unit page's timeline and its follow-up stage.
 * Each is measured here on a project whose `connectedSources` name no CRM.
 *
 * ## Why constructed
 *
 * The fixtures' projects without a CRM record no outcomes at all (every
 * meeting `skipped`), so no fixture can show a recorded outcome standing
 * without a CRM. The shape that can is built here.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_outcome_sweep"; // never a real project
const UNIT = "T-1";

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

function opened(favourited: boolean): ShowroomUnitInteraction {
  return {
    unitId: `unit_${UNIT}`,
    unitCode: UNIT,
    views: 1,
    dwellSeconds: 90,
    longestViewSeconds: 90,
    favourited,
    pdfOpened: false,
    balconyViews: 0,
    floorCutViews: 0,
    screenshots: 0,
    comparedWith: [],
    keptFromComparison: null,
    shared: false,
  };
}

function session(
  meetingId: string,
  outcome: MeetingOutcome,
  units: readonly ShowroomUnitInteraction[] = [],
): ShowroomSession {
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
    units,
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

/** No CRM among the connected sources: the case every one of these used to refuse. */
const NO_CRM = {
  viewer: { role: "developer" },
  tenant: { slug: "test-tenant" },
  project: {
    id: PROJECT_ID,
    slug: "test-project",
    name: "Test project",
    locale: "en-GB",
    timeZone: "Europe/Bratislava",
    currency: "EUR",
    connectedSources: ["showroom", "catalogue"],
  },
  period: {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-04-01T00:00:00.000Z",
    label: "This quarter",
    baselineLabel: "last quarter",
  },
  ownDataOnly: false,
  language: DEFAULT_LANGUAGE,
} as unknown as ViewContext;

const many = (
  n: number,
  outcome: MeetingOutcome,
  prefix: string,
  units?: ShowroomUnitInteraction[],
) => Array.from({ length: n }, (_, i) => session(`${prefix}${i}`, outcome, units));

/* Twenty-five meetings: six owe a follow-up, three were never given an outcome. */
const SESSIONS = [
  ...many(4, "follow_up_needed", "f"),
  ...many(2, "interested", "i"),
  ...many(16, "presentation_only", "o"),
  ...many(3, "skipped", "s"),
];

describe("1. the follow-up figure", () => {
  const view = buildAgentDetail(NO_CRM, SESSIONS, [], "agt_monika");

  it("counts the follow-ups the agent recorded, without a CRM", () => {
    expect(
      view?.followUp.recorded.display,
      "the room's own record was withheld as though a CRM had made it",
    ).toBe("6");
  });
});

describe("2. the funnel's outcome stages", () => {
  const view = buildAgentDetail(NO_CRM, SESSIONS, [], "agt_monika");
  const stage = (label: string) => view?.funnel.find((s) => s.label === label);

  it("counts the outcomes recorded, without a CRM", () => {
    expect(
      stage("Outcome recorded")?.metric.display,
      "the outcome stage was withheld as though a CRM had made it",
    ).toBe("22");
  });

  it("counts them out of the meetings held", () => {
    expect(stage("Outcome recorded")?.metric.qualifier).toBe("of 25");
  });

  it("names the meetings with no outcome as a finding, without a CRM", () => {
    expect(
      view?.findings.map((f) => f.id),
      "the unrecorded-outcome finding was withheld as though it were the CRM's to make",
    ).toContain("agent-agt_monika-unrecorded");
  });
});

describe("3. the registers' follow-up state", () => {
  const rows = buildMeetingRows(NO_CRM, SESSIONS);

  it("reads 'needed' off a recorded outcome that asks for one", () => {
    expect(
      rows.find((r) => r.meetingId === "f0")?.followUp,
      "a recorded follow-up was drawn as 'No CRM'",
    ).toBe("required");
  });

  it("reads 'not recorded' off a meeting given no outcome", () => {
    expect(rows.find((r) => r.meetingId === "s0")?.followUp).toBe("not_recorded");
  });
});

describe("4. the unit page", () => {
  provideCatalogue(PROJECT_ID, [
    {
      code: UNIT,
      block: "T",
      floor: 1,
      rooms: 2,
      areaSqm: 55,
      orientation: "S",
      price: 200_000,
      status: "available",
    },
  ]);
  /* Twelve meetings opened the unit; ten shortlisted it; none recorded a follow-up. */
  const opening = [
    ...many(10, "presentation_only", "u", [opened(true)]),
    ...many(2, "not_interested", "v", [opened(false)]),
  ];
  const view = buildUnitDetail(NO_CRM, opening, [], UNIT);
  const ended = view?.timeline.find((e) => e.kind === "outcome_recorded");
  const followUp = view?.funnel.find((s) => s.id === "follow_up");

  it("puts the recorded outcome on the timeline, without a CRM", () => {
    expect(
      ended,
      "the meeting's recorded outcome was left off the timeline for want of a CRM",
    ).toBeDefined();
  });

  it("claims only the record for it", () => {
    expect(ended?.tier, "a recorded outcome was presented as an attributed conversion").toBe(
      "observed_sequence",
    );
  });

  it("credits it to the showroom, not the CRM", () => {
    expect(ended?.sources).not.toContain("CRM_OUTCOME_CONTEXT");
  });

  it("draws the follow-up stage from the record, without a CRM", () => {
    expect(
      followUp?.step.metric.state,
      "the follow-up stage was withheld as though a CRM had made it",
    ).toBe("empty");
  });

  it("claims only the record for the stage", () => {
    expect(followUp?.tier).toBe("observed_sequence");
  });

  it("raises the shortlist-without-follow-up finding, without a CRM", () => {
    expect(
      view?.findings.map((f) => f.id),
      "the finding was withheld as though it were the CRM's to make",
    ).toContain(`unit-${UNIT}-shortlist-no-follow-up`);
  });
});
