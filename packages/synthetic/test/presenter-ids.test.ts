import { describe, expect, it } from "vitest";
import type { MeetingId } from "@observer/contracts";

import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * EVERY ROW THAT NAMES A PRESENTER CARRIES THEIR ID (ADR-0054, 2026-10-23).
 *
 * A page puts a face beside a presenter's name by the id, so the id must be
 * the presenter the row's own words name. An id, never a face: no read model
 * carries a picture or its address.
 */

const query = {
  viewer: VIEWERS.developerShark,
  tenantSlug: "shark",
  projectSlug: "shark-residence",
  period: "quarter_to_date" as const,
  language: "en" as const,
};
const repository = new SyntheticObserverRepository();

describe("on Shark Residence, quarter to date", () => {
  it("names the presenter of each longest presentation and each nearest meeting", async () => {
    const charts = await repository.getFlowCharts(query, "month");
    const name = new Map(charts.lens.agents.map((a) => [a.id, a.label]));
    expect(charts.longestMeetings.length).toBeGreaterThan(0);
    /* The name in the row's own line, after its date; steps and outcome alone under it (the owner, 2026-10-23). */
    for (const row of charts.longestMeetings) {
      expect(row.label.endsWith(` · ${name.get(row.agentId ?? "")}`)).toBe(true);
      expect(row.sub).toMatch(/^\d+ steps · [^·]+$/);
    }
    expect(charts.lens.nearest.length).toBeGreaterThan(0);
    for (const row of charts.lens.nearest) {
      expect(row.label.endsWith(` · ${name.get(row.agentId ?? "")}`)).toBe(true);
    }
    // A list of agents keeps its own ids as the row's id, and names no other.
    expect(charts.rankedAgents.every((row) => row.agentId === undefined)).toBe(true);
  });

  /*
   * Sales Flow shows ten and the rest behind "Show all" (the owner,
   * 2026-10-23), so the read model hands it more than ten where the period
   * has them: up to the twenty longest, longest first. The bounds, not the
   * scenario's count, so a regenerated quarter keeps the test honest.
   */
  it("lists up to the twenty longest presentations, longest first, so ten leave a rest", async () => {
    const charts = await repository.getFlowCharts(query, "month");
    const lengths = charts.longestMeetings.map((row) => row.value);
    expect(lengths.length).toBeGreaterThan(10);
    expect(lengths.length).toBeLessThanOrEqual(20);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
  });

  it("names the presenter of every register row and of the replay it opens", async () => {
    const view = await repository.getMeetings(query, {
      agentId: null,
      channel: null,
      outcome: null,
      features: null,
    });
    const roster = await repository.listAgents(query);
    const name = new Map(roster.map((a) => [a.agentId as string, a.name]));
    expect(view.rows.length).toBeGreaterThan(0);
    for (const row of view.rows) expect(name.get(row.agentId)).toBe(row.agentName);

    const first = view.rows[0];
    if (first === undefined) throw new Error("no meeting");
    const replay = await repository.getMeetingReplay({
      ...query,
      meetingId: first.meetingId as MeetingId,
    });
    expect(replay.agentId).toBe(first.agentId);
    expect(JSON.stringify(replay)).not.toMatch(/portraits/);
  });
});
