import { viewContext } from "./view-context";
import { describe, expect, it } from "vitest";
import type { ShowroomSession } from "@observer/contracts";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { buildSalesFlow } from "../src/showroom/views3";

/**
 * A FLAGGED AGENT IS SET AGAINST THE TEAM'S FIGURE FOR THE SAME THING.
 *
 * Sales Flow's finding for a flagged agent always printed the team's
 * progression beside it. On Riverside and Kingsford, which record no outcome,
 * that read "Monika Kováčová: 10 of 10 meetings ended with no outcome recorded
 * … against 0% for the team": a rate over no decided meeting printed as a
 * zero, beside a count of a different kind. Constructed sessions; the
 * expected shares are counted by hand.
 */
const PROJECT_ID = "prj_testflagbaseline"; // never a real project

let seq = 0;
function meeting(agentId: string, outcome: ShowroomSession["outcome"]): ShowroomSession {
  seq += 1;
  return {
    sessionId: `s${String(seq)}`,
    meetingId: `m${String(seq)}`,
    projectId: PROJECT_ID,
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt: "2027-06-14T09:00:00.000Z",
    endedAt: "2027-06-14T09:30:00.000Z",
    durationSeconds: 1_800,
    outcome,
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

const times = (n: number, agentId: string, outcome: ShowroomSession["outcome"]) =>
  Array.from({ length: n }, () => meeting(agentId, outcome));

const CONTEXT = viewContext({
  tenant: { slug: "test-tenant" },
  project: { id: PROJECT_ID, slug: "test-project", locale: "en-GB", timeZone: "UTC" },
  period: {
    from: "1970-01-01T00:00:00.000Z",
    to: "9999-01-01T00:00:00.000Z",
    label: "the period",
    baselineLabel: "before",
  },
  language: DEFAULT_LANGUAGE,
});

const flagFinding = (sessions: readonly ShowroomSession[]) =>
  buildSalesFlow(CONTEXT, sessions, new Date("2027-06-15T12:00:00.000Z"), []).findings.find((f) =>
    f.id.startsWith("flow-flag-"),
  );

describe("the flagged agent's finding", () => {
  it("sets unrecorded outcomes against the team's unrecorded share, not a 0% progression", () => {
    // Nobody on the project records an outcome: 20 and 24 meetings, all skipped.
    const finding = flagFinding([
      ...times(20, "agent_a", "skipped"),
      ...times(24, "agent_b", "skipped"),
    ]);
    expect(finding?.statement).toMatch(/20 of 20 meetings ended with no outcome recorded/);
    expect(finding?.baseline).toBe("100% for the team");
  });

  it("sets 'not interested' against the team's 'not interested' share", () => {
    // A: 10 of 20 not interested (50%, over the 35% line). B: 20 purchases.
    // Team: 10 of 40 not interested = 25%; its progression, 30 of 40 = 75%, is another figure.
    const finding = flagFinding([
      ...times(10, "agent_a", "not_interested"),
      ...times(10, "agent_a", "purchase"),
      ...times(20, "agent_b", "purchase"),
    ]);
    expect(finding?.statement).toMatch(/10 of 20 recorded meetings ended "not interested"/);
    expect(finding?.baseline).toBe("25% for the team");
  });

  it("keeps a progression flag against the team's progression", () => {
    // A: 4 of 20 progressed (20%). B: 20 of 20. Team: 24 of 40 = 60%; 20% is under three quarters of it.
    const finding = flagFinding([
      ...times(4, "agent_a", "purchase"),
      ...times(6, "agent_a", "not_interested"),
      ...times(10, "agent_a", "presentation_only"),
      ...times(20, "agent_b", "purchase"),
    ]);
    expect(finding?.statement).toMatch(/20% progressed against 60% for the team/);
    expect(finding?.baseline).toBe("60% for the team");
  });

  /* EJJEL1: below the 20-meeting floor a comparison with the team is a verdict, and none is drawn. */
  it("draws no flag and no finding for an agent below the floor, however far off the team", () => {
    const finding = flagFinding([
      ...times(19, "agent_a", "not_interested"),
      ...times(20, "agent_b", "purchase"),
    ]);
    expect(finding).toBeUndefined();
  });
});
