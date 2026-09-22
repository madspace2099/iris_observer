import { describe, expect, it } from "vitest";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildAgentsView } from "../src/showroom/views3";

/**
 * The team's section list is the team's.
 *
 * The report's "where the team's presentation time goes" table read the first
 * agent's `sections`. The fields on those rows are the team's, but the ARRAY
 * had passed that agent's own `reachRate > 0` filter: a section they never
 * opened was missing from the team's table. On the fixtures the first agent
 * happens to reach every section anyone reaches — measured last round, zero
 * rows carried — so the fixtures could not show it. Here the first presenter
 * never opens Compare and the second does.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const PROJECT_ID = "prj_test_team_sections"; // never a real project

function step(ordinal: number, sectionId: ShowroomStep["sectionId"]): ShowroomStep {
  return {
    ordinal,
    sectionId,
    itemId: null,
    itemLabel: null,
    enteredAt: null,
    dwellSeconds: 60,
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

/* Monika is first on the roster and never opens Compare; Akhilesh does. */
const view = buildAgentsView(
  CONTEXT,
  [
    session("m1", "agt_monika", [step(1, "home"), step(2, "residences")]),
    session("m2", "agt_monika", [step(1, "home"), step(2, "residences")]),
    session("a1", "agt_akhilesh", [step(1, "home"), step(2, "compare")]),
  ],
  false,
);
const ids = (rows: readonly { readonly sectionId: string }[]) => rows.map((s) => s.sectionId);

describe("the team's section list", () => {
  it("is built from a first presenter whose own rows lack the section", () => {
    /* The premise, stated as a test: if the first agent reached Compare, the next test proves nothing. */
    expect(ids(view.agents[0]?.sections ?? [])).not.toContain("compare");
  });

  it("holds a section the first presenter never opened", () => {
    expect(
      ids(view.teamSections),
      "the team's list is the first agent's list: a section they never opened is missing from the team's table",
    ).toContain("compare");
  });
});
