import { describe, expect, it } from "vitest";
import type { AgentId } from "@observer/contracts";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS, VIKTORIA_MEETING_ID } from "../src/index";

/**
 * THE AGENT'S OWN FIGURES ARE THE AGENT'S OWN MEETINGS.
 *
 * Measured 2026-09-29: the agent overview typed "14 meetings", "9 of 14" and
 * "13 of 14", and the brief said A-505 "sold on 25 August" and "on Monday"
 * while the view's today was 24 August — and 25 August 2026 is a Tuesday.
 */
const repo = new SyntheticObserverRepository();
const query = (viewer: typeof VIEWERS.salesAgent) =>
  ({
    viewer,
    tenantSlug: "alpha",
    projectSlug: "northgate",
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  }) as const;

describe("the agent overview's own figures", () => {
  it("are unavailable where the account's agent id presents nothing, rather than typed", async () => {
    /* Monika's account is agt_monika0001; the showroom records agt_monika. Nothing joins them. */
    const overview = await repo.getAgentOverview(query(VIEWERS.salesAgent));
    for (const metric of overview.personal) {
      expect(metric.state, metric.metricId).toBe("unavailable");
      expect(metric.raw, metric.metricId).toBeNull();
    }
    expect(overview.dataHealth.completeness.state).toBe("unavailable");
  });

  it("count the meetings /meetings lists for that presenter, where the id does present", async () => {
    /* The showroom's presenter id, which the contract's AgentId pattern does not even admit. */
    const linked = { ...VIEWERS.salesAgent, agentId: "agt_monika" as AgentId };
    const overview = await repo.getAgentOverview(query(linked));
    const listed = (await repo.listMeetings(query(linked))).filter(
      (m) => m.agentName === "Monika Kováčová",
    ).length;
    expect(listed).toBeGreaterThan(0);
    const meetings = overview.personal.find((m) => m.metricId === "people.meetings_by_agent");
    expect(meetings?.raw).toBe(listed);
    expect(meetings?.comparison?.baselineLabel).toContain("your");
  });
});

describe("A-505 in the brief", () => {
  it("is sold, with no date the synthetic world does not hold", async () => {
    const brief = await repo.getPreMeetingBrief({
      ...query(VIEWERS.salesAgent),
      meetingId: VIKTORIA_MEETING_ID,
    });
    const overview = await repo.getAgentOverview(query(VIEWERS.salesAgent));
    const said = JSON.stringify([brief, overview]);
    expect(said).toContain("A-505");
    expect(said).not.toMatch(/25 August|on Monday|four days after/);
  });
});
