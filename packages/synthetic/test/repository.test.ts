import { describe, expect, it } from "vitest";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import type { MeetingId } from "@observer/contracts";
import { SyntheticObserverRepository, VIEWERS, VIKTORIA_MEETING_ID } from "../src/index";

const repo = new SyntheticObserverRepository();
const NORTHGATE = { tenantSlug: "alpha", projectSlug: "northgate" } as const;
const KINGSFORD = { tenantSlug: "beta", projectSlug: "kingsford" } as const;
const RIVERSIDE = { tenantSlug: "alpha", projectSlug: "riverside" } as const;

describe("tenant and project scoping", () => {
  it("lists only the tenants a viewer holds", async () => {
    const forDeveloper = await repo.listTenants(VIEWERS.developer);
    expect(forDeveloper.map((t) => t.slug)).toEqual(["alpha"]);

    // The agency sells for two competing developers, which is the ordinary
    // commercial arrangement and the sharpest isolation test the product has.
    const forAgency = await repo.listTenants(VIEWERS.agencyManager);
    expect(forAgency.map((t) => t.slug)).toEqual(["alpha", "beta"]);
  });

  it("lists only the projects a viewer holds within a tenant", async () => {
    const projects = await repo.listProjects(
      VIEWERS.agencyManager,
      VIEWERS.developer.tenantIds[0]!,
    );
    // The agency works Northgate for Alpha, but not Riverside.
    expect(projects.map((p) => p.slug)).toEqual(["northgate"]);
  });

  it("refuses a tenant the viewer does not hold", async () => {
    await expect(
      repo.listProjects(VIEWERS.developer, VIEWERS.agencyManager.tenantIds[1]!),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });

  it("refuses a project inside a tenant the viewer does hold", async () => {
    // A tenant grant is not a project grant. This is exactly how an agency is
    // scoped, and collapsing the two checks is how the leak would happen.
    await expect(
      repo.resolveProject(VIEWERS.agencyManager, "alpha", "riverside"),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });

  it("keeps two developers' data apart even for a shared agency", async () => {
    const alpha = await repo.getExecutiveOverview({
      viewer: VIEWERS.agencyManager,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    const beta = await repo.getExecutiveOverview({
      viewer: VIEWERS.agencyManager,
      ...KINGSFORD,
      period: "quarter_to_date",
    });

    expect(alpha.context.tenant.id).not.toBe(beta.context.tenant.id);
    expect(alpha.context.project.currency).toBe("EUR");
    expect(beta.context.project.currency).toBe("GBP");
    // No figure from one may appear in the other.
    expect(alpha.verdict.headline).not.toBe(beta.verdict.headline);
  });

  it("does not reveal that an inaccessible project exists", async () => {
    // Both are rejections the caller renders identically; the distinction that
    // matters is that neither returns data.
    const missing = repo.resolveProject(VIEWERS.developer, "alpha", "does-not-exist");
    await expect(missing).rejects.toBeInstanceOf(NotFoundError);
  });

  it("switches project without carrying context across", async () => {
    const first = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    const second = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...RIVERSIDE,
      period: "quarter_to_date",
    });
    expect(first.context.project.slug).toBe("northgate");
    expect(second.context.project.slug).toBe("riverside");
    expect(second.headline.every((m) => m.state === "unavailable")).toBe(true);
  });

  it("clips the baseline when the current period is still running", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    // Comparing a part-quarter with a whole one is the commonest false alarm a
    // dashboard raises, so the baseline says how it was clipped.
    expect(overview.context.period.baselineClipped).toBe(true);
    expect(overview.context.period.baselineLabel).toContain("54 days");
  });
});

describe("role-appropriate content", () => {
  it("gives the agent their own overview, not a filtered executive one", async () => {
    await expect(
      repo.getExecutiveOverview({
        viewer: VIEWERS.salesAgent,
        ...NORTHGATE,
        period: "quarter_to_date",
      }),
    ).rejects.toBeInstanceOf(NotPermittedError);

    const agent = await repo.getAgentOverview({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    expect(agent.upcoming.length).toBeGreaterThan(0);
  });

  it("never turns the agent's overview into a scoreboard", async () => {
    const agent = await repo.getAgentOverview({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    // Every personal figure compares the agent with themselves. The moment one
    // compares them with a colleague, outcomes stop being logged.
    for (const metric of agent.personal) {
      if (metric.comparison === null) continue;
      expect(metric.comparison.baselineLabel).toContain("your");
    }
  });

  it("suppresses a rate the agent has too few meetings for", async () => {
    const agent = await repo.getAgentOverview({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    const conversion = agent.personal.find((m) => m.metricId === "people.agent_conversion");
    expect(conversion?.state).toBe("unavailable");
    expect(conversion?.message).toContain("20");
  });

  it("refuses the agent overview to somebody who runs no meetings", async () => {
    await expect(
      repo.getAgentOverview({ viewer: VIEWERS.developer, ...NORTHGATE, period: "quarter_to_date" }),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });
});

describe("evidence integrity", () => {
  it("attaches evidence to the verdict and to every generated statement", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    expect(overview.verdict.evidence).not.toBeNull();
    for (const statement of overview.briefing.statements) {
      expect(statement.evidence, statement.text).not.toBeNull();
      expect(statement.evidence?.href.length ?? 0).toBeGreaterThan(1);
      expect(statement.evidence?.observationCount ?? 0).toBeGreaterThan(0);
    }
  });

  it("never produces a causal claim", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    for (const statement of overview.briefing.statements) {
      expect(statement.tier).not.toBe("causal_claim");
    }
  });

  it("resolves every evidence id the brief references", async () => {
    const view = await repo.getPreMeetingBrief({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    });

    const referenced = [
      ...view.brief.observed.statements,
      ...view.brief.interpretation.statements,
      ...view.brief.recommended.statements,
      ...view.brief.recommended.changesSinceLastVisit,
      ...view.brief.recommended.unitsToPrepare.map((u) => u.reason),
      ...view.brief.recommended.clarificationQuestions.map((q) => q.rationale),
    ];

    expect(referenced.length).toBeGreaterThan(5);
    for (const statement of referenced) {
      // A dangling evidence id renders as "no evidence", which is exactly the
      // confident-sentence-with-nothing-behind-it failure this product exists
      // to avoid. It must fail here instead.
      expect(view.evidence[statement.evidenceId], statement.text).toBeDefined();
    }
  });

  it("resolves every unit the brief mentions", async () => {
    const view = await repo.getPreMeetingBrief({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    });
    const mentioned = [
      ...view.brief.observed.unitInterest.map((u) => u.unitId),
      ...view.brief.recommended.unitsToPrepare.map((u) => u.unitId),
      ...view.brief.recommended.previouslyInterestedNowUnavailable,
    ];
    for (const unitId of mentioned) {
      expect(view.units[unitId], unitId).toBeDefined();
    }
  });

  it("produces stable evidence ids across runs", async () => {
    const query = {
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    };
    const a = await repo.getPreMeetingBrief(query);
    const b = await repo.getPreMeetingBrief(query);
    expect(Object.keys(a.evidence).sort()).toEqual(Object.keys(b.evidence).sort());
  });
});

describe("the brief itself", () => {
  it("tells the agent the shortlisted unit has sold", async () => {
    const view = await repo.getPreMeetingBrief({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    });

    // The finding that justifies the product: she favourited A-505 and it sold
    // four days after her last visit. The agent must learn it here.
    const gone = view.brief.recommended.previouslyInterestedNowUnavailable;
    expect(gone.length).toBe(1);
    expect(view.units[gone[0]!]?.code).toBe("A-505");
    expect(view.units[gone[0]!]?.available).toBe(false);
    expect(view.brief.recommended.changesSinceLastVisit[0]?.text).toContain("A-505");
  });

  it("claims no price range she never stated", async () => {
    const view = await repo.getPreMeetingBrief({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    });
    // A range guessed from the units she happened to open is an inference, and
    // an agent told "her budget is 210-230" will negotiate on it.
    expect(view.brief.observed.priceRange).toBeNull();
  });

  it("marks history she never volunteered", async () => {
    const view = await repo.getPreMeetingBrief({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    });
    expect(view.brief.observed.onlineActivity.includesBackLinkedActivity).toBe(true);
  });

  it("says what it could not see", async () => {
    const view = await repo.getPreMeetingBrief({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    });
    expect(view.brief.dataHealth.completeness).toBeLessThan(1);
    expect(view.brief.dataHealth.missing.length).toBeGreaterThan(0);
  });

  it("keeps interpretation out of the observed section", async () => {
    const view = await repo.getPreMeetingBrief({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    });
    for (const statement of view.brief.observed.statements) {
      expect(statement.tier).toBe("observed_sequence");
    }
  });

  it("refuses the brief to a developer", async () => {
    // Buyer behaviour at this resolution belongs to the people running the
    // meeting, not to the developer who commissioned the project.
    await expect(
      repo.getPreMeetingBrief({
        viewer: VIEWERS.developer,
        ...NORTHGATE,
        meetingId: VIKTORIA_MEETING_ID,
      }),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });

  it("reports an unknown meeting as missing rather than empty", async () => {
    await expect(
      repo.getPreMeetingBrief({
        viewer: VIEWERS.salesAgent,
        ...NORTHGATE,
        meetingId: "mtg_doesnotexist1" as MeetingId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("missing and partial data", () => {
  it("renders unavailable, not zero, when the CRM is disconnected", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...RIVERSIDE,
      period: "quarter_to_date",
    });

    expect(overview.context.project.connectedSources).not.toContain("crm");
    for (const metric of overview.headline) {
      expect(metric.state).toBe("unavailable");
      expect(metric.raw).toBeNull();
      expect(metric.message).toContain("CRM");
    }
    expect(overview.verdict.state).toBe("unknown");
    expect(overview.dataHealth.sourcesMissing).toContain("CRM");
  });

  it("suppresses verdicts on a project with too little history", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.agencyManager,
      ...KINGSFORD,
      period: "quarter_to_date",
    });
    expect(overview.verdict.state).toBe("unknown");
    for (const step of overview.funnel) {
      expect(["insufficient", "unavailable"]).toContain(step.metric.state);
    }
  });

  it("shows the figure but withholds the trend below the minimum sample", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    const last = overview.funnel.at(-1);
    expect(last?.metric.state).toBe("insufficient");
    // The number is still shown — hiding it would be patronising — but there
    // is no comparison to read it as a trend.
    expect(last?.metric.display).not.toBeNull();
    expect(last?.metric.comparison).toBeNull();
    expect(last?.metric.message).toContain("verdict");
  });

  it("states the caveat on a summary written with a source missing", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...RIVERSIDE,
      period: "quarter_to_date",
    });
    expect(overview.briefing.caveat).not.toBeNull();
    expect(overview.briefing.caveat).toContain("CRM");
  });
});
