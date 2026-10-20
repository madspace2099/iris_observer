import { describe, expect, it } from "vitest";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { ShowroomSession, ShowroomStep } from "@observer/contracts";
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

  it("sets no outcome beside a showroom part the cohort comparison does not read", async () => {
    /*
     * "Shared an apartment" and "stopped on a named place" are not Presentation
     * DNA behaviours, so a figure for them here would be one the link beside it
     * cannot show.
     */
    const { featureUsage } = await repo.getAgentCharts(SHARK);
    expect(featureUsage.reading.outcomes.find((o) => o.id === "locating")?.text).toBe(
      "Locating is not one of the behaviours Presentation DNA compares, so no outcome is set beside it.",
    );
    expect(featureUsage.reading.outcomes.map((o) => o.text).join(" ")).not.toMatch(/progressed/);
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
    expect(radar.reading.note).toContain("read against everyone else's meetings instead");
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
    /* Nor does the note promise the comparison the habit line then refuses. */
    expect(reading.note).not.toContain("read against everyone else");
  });

  /* Meetings whose steps are these sections, in order; the rest of the session as above. */
  const walked = (
    n: number,
    agentId: string,
    sections: readonly ShowroomStep["sectionId"][],
    outcome: (i: number) => ShowroomSession["outcome"] = (i) =>
      i % 2 === 0 ? "interested" : "not_interested",
  ) =>
    many(n, agentId).map((s, i) => ({
      ...s,
      outcome: outcome(i),
      steps: sections.map((sectionId, k) => ({
        ordinal: k + 1,
        sectionId,
        itemId: null,
        itemLabel: null,
        enteredAt: null,
        dwellSeconds: 30,
        isReturn: false,
        availability: "legacy_available" as const,
      })),
    }));

  it("names every agent tied at an end, not the first of them in seat order", () => {
    const reading = read([
      ...walked(AGENT_MIN_SAMPLE, "agt_monika", ["home", "home"]),
      ...walked(AGENT_MIN_SAMPLE, "agt_akhilesh", ["home", "home", "home", "home"]),
      ...walked(AGENT_MIN_SAMPLE, "agt_martin", ["home", "home", "home", "home"]),
    ]);
    /* The habits are in seat order, as the reading names a tie. */
    const few = reading.habits.find((h) => h.agentId === "agt_monika")?.name;
    const [tiedA, tiedB] = reading.habits
      .filter((h) => h.agentId !== "agt_monika")
      .map((h) => h.name);
    expect(reading.differences.map((d) => d.text)).toEqual([
      `Depth: ${few}, a typical meeting took 2 steps, across 20 meetings; ${tiedA} and ${tiedB}, 4 across 20 and 20 meetings.`,
    ]);
  });

  it("refuses an outcome comparison where a side is under the floor, and says so", () => {
    /* Ten of the meetings that reached Compare have no outcome recorded: 15 stand on that side. */
    const reading = read([
      ...walked(25, "agt_monika", ["home", "compare"], (i) => (i < 10 ? "skipped" : "interested")),
      ...walked(25, "agt_akhilesh", ["home", "home"]),
    ]);
    expect(reading.outcomes.find((o) => o.id === "compare")?.text).toBe(
      `Meetings that reached Compare, and those that did not, are not set beside their outcomes: 15 and 25 have an outcome recorded, and each side needs ${AGENT_MIN_SAMPLE}.`,
    );
  });

  it("refuses it too where Presentation DNA's own cohorts are under the floor", () => {
    /* Both sides clear 20, but only 10 of the 60 progressed: the cohorts view refuses them. */
    const reading = read([
      ...walked(30, "agt_monika", ["home", "compare"], (i) =>
        i < 5 ? "interested" : "not_interested",
      ),
      ...walked(30, "agt_akhilesh", ["home", "home"], (i) =>
        i < 5 ? "interested" : "not_interested",
      ),
    ]);
    expect(reading.outcomes.find((o) => o.id === "compare")?.text).toBe(
      `Meetings that reached Compare are not set beside their outcomes: of 60 with an outcome recorded, 10 progressed further and 50 did not, and each needs ${AGENT_MIN_SAMPLE}.`,
    );
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
