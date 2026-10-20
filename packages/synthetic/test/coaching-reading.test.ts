import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ShowroomSession } from "@observer/contracts";
import {
  DEFAULT_LANGUAGE,
  type CoachingReading,
  type OverviewQuery,
  type Viewer,
} from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src";
import { buildAgentCharts } from "../src/showroom/charts";

/**
 * IRIS'S READING OF COACHING'S ONE CHART.
 *
 * The owner asked for the system to say what it sees between the agents
 * (2026-10-20). It may describe and associate, never explain or rank a person,
 * and every figure stands beside its denominator. Measured on Shark Residence,
 * the recorded demo project, and on hand-built meetings where the floor bites.
 */

const SHARK: OverviewQuery = {
  viewer: VIEWERS.developerShark as Viewer,
  tenantSlug: "shark",
  projectSlug: "shark-residence",
  period: "quarter_to_date",
  language: DEFAULT_LANGUAGE,
};
const repo = new SyntheticObserverRepository();

/* The causal words `assisted-sales.test.ts` refuses, and a verdict on a person. */
const CAUSAL =
  /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;
const VERDICT = /\b(better|worse|best|worst|stronger agent|weaker)\b/i;

const sentences = (r: CoachingReading) => [
  ...r.differences.map((d) => d.text),
  ...r.habits.map((h) => h.text),
  ...r.outcomes.map((o) => o.text),
  ...(r.note === null ? [] : [r.note]),
];

describe("Shark Residence, quarter to date", () => {
  it("names where the five differ most first: Compare, from Oliver Grant to Marek Dvořák", async () => {
    const { radar } = await repo.getAgentCharts(SHARK);
    expect(radar.reading.differences).toHaveLength(3);
    expect(radar.reading.differences[0]?.text).toBe(
      "Compare: Oliver Grant, 19% of 26 meetings reached Compare; Marek Dvořák, 76% of 33.",
    );
  });

  it("reads one distinctive habit for each of the five drawn agents", async () => {
    const { radar, featureUsage } = await repo.getAgentCharts(SHARK);
    expect(radar.reading.habits.map((h) => h.name)).toEqual([
      "Lena Fischer",
      "Marek Dvořák",
      "Oliver Grant",
      "Zsófia Bárány",
      "Iva Horváth",
    ]);
    expect(featureUsage.reading.habits).toHaveLength(5);
    /* The reading wears the chart's colours. */
    expect(radar.reading.habits.map((h) => h.tone)).toEqual(radar.profiles.map((p) => p.tone));
  });

  it("sets what Compare's meetings came to beside both sample sizes", async () => {
    const { radar } = await repo.getAgentCharts(SHARK);
    expect(radar.reading.outcomes.find((o) => o.id === "compare")?.text).toBe(
      "Meetings that reached Compare progressed further in 72% of 67 with an outcome recorded; those that did not, 38% of 64.",
    );
  });

  it("draws those figures from the cohort comparison's own cohorts", async () => {
    /*
     * Presentation DNA's cohorts split the meetings by progress and count the
     * behaviour in each; the reading splits by the behaviour and counts the
     * progress. Same meetings: 48 of the 67 that reached Compare progressed, so
     * the progressed cohort holds 48 that used it.
     */
    const cohorts = await repo.getPresentationIntelligence(SHARK, {
      mode: "cohorts",
      left: null,
      right: null,
    });
    const compare = cohorts.comparison?.differences.find((d) => d.id === "compare_used");
    const progressed = cohorts.comparison?.left.meetingCount ?? 0;
    expect(compare?.leftDisplay).toBe(`${Math.round((48 / progressed) * 100)}%`);
  });

  it("refuses an outcome comparison where a side is under the floor, and says so", async () => {
    const { featureUsage } = await repo.getAgentCharts(SHARK);
    expect(featureUsage.reading.outcomes.find((o) => o.id === "locating")?.text).toBe(
      `Meetings that stopped on a named place in Amenities, and those that did not, are not set beside their outcomes: 113 and 18 have an outcome recorded, and each side needs ${AGENT_MIN_SAMPLE}.`,
    );
  });

  it("never names a cause or ranks a person, in either lens", async () => {
    const { radar, featureUsage } = await repo.getAgentCharts(SHARK);
    for (const text of [...sentences(radar.reading), ...sentences(featureUsage.reading)]) {
      expect(text, text).not.toMatch(CAUSAL);
      expect(text, text).not.toMatch(VERDICT);
    }
  });

  it("closes on the comparison's own words: an association at these sample sizes", async () => {
    const { radar } = await repo.getAgentCharts(SHARK);
    expect(radar.reading.caveat).toContain("They are associations");
  });
});

describe("Shark Residence, the last 28 days: one agent over the floor", () => {
  it("compares no two agents, says why, and reads Marek against everyone else", async () => {
    const { radar } = await repo.getAgentCharts({ ...SHARK, period: "last_28_days" });
    expect(radar.reading.differences).toEqual([]);
    expect(radar.reading.note).toContain("Only Marek Dvořák reached 20 meetings");
    expect(radar.reading.habits.map((h) => h.name)).toEqual(["Marek Dvořák"]);
  });
});

describe("the floor, on hand-built meetings", () => {
  const session = (i: number, agentId: string): ShowroomSession => ({
    sessionId: `s-${agentId}-${i}`,
    meetingId: `m-${agentId}-${i}`,
    projectId: "prj_test_coaching_reading",
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt: "2026-03-12T14:30:00.000Z",
    endedAt: "2026-03-12T15:00:00.000Z",
    durationSeconds: 1_800,
    outcome: i % 2 === 0 ? "interested" : "not_interested",
    steps: [],
    units: [],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  });
  const many = (n: number, agentId: string) =>
    Array.from({ length: n }, (_, i) => session(i, agentId));
  const read = (sessions: readonly ShowroomSession[]) =>
    buildAgentCharts(sessions, { tenantSlug: "t", projectSlug: "p" }, "en-GB", "en").radar.reading;

  it("describes nobody when nobody clears it", () => {
    const reading = read([...many(5, "agt_monika"), ...many(5, "agt_akhilesh")]);
    expect(reading.habits).toEqual([]);
    expect(reading.note).toContain("No agent reached 20 meetings");
  });

  it("sets nothing beside an agent whose colleagues held too few meetings to stand as a team", () => {
    const reading = read([...many(AGENT_MIN_SAMPLE, "agt_monika"), ...many(5, "agt_akhilesh")]);
    expect(reading.habits[0]?.text).toContain("everyone else held 5 meetings, under 20");
    expect(reading.outcomes).toEqual([]);
  });

  it("names an agent sitting at the team's own figure, rather than inventing a habit", () => {
    const reading = read([
      ...many(AGENT_MIN_SAMPLE, "agt_monika"),
      ...many(AGENT_MIN_SAMPLE, "agt_akhilesh"),
    ]);
    expect(reading.differences).toEqual([]);
    expect(reading.habits.every((h) => h.text.includes("own figure on every measure"))).toBe(true);
  });
});
