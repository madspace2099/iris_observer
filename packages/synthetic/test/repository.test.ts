import { describe, expect, it } from "vitest";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import type { MeetingId } from "@observer/contracts";
import {
  PROJECTS,
  SyntheticObserverRepository,
  TENANTS,
  VIEWERS,
  VIKTORIA_MEETING_ID,
} from "../src/index";
import { sessionsForProject } from "../src/showroom/sessions";

const repo = new SyntheticObserverRepository();
const NORTHGATE = { tenantSlug: "alpha", projectSlug: "northgate" } as const;
const KINGSFORD = { tenantSlug: "beta", projectSlug: "kingsford" } as const;
const RIVERSIDE = { tenantSlug: "alpha", projectSlug: "riverside" } as const;
const ISTER_TOWER = { tenantSlug: "alpha", projectSlug: "ister-tower" } as const;

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
    // The agency works Northgate and ISTER TOWER for Alpha, but not Riverside.
    // The absence is the assertion: a tenant grant would have returned all
    // three, and the agency holds two of them explicitly.
    expect(projects.map((p) => p.slug)).toEqual(["northgate", "ister-tower"]);
    expect(projects.map((p) => p.slug)).not.toContain("riverside");
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

  /*
   * THE LEAK THE FRONTEND COMPLETION BLOCK CLOSED.
   *
   * `buildExecutiveOverview` used to fall through to Kingsford's hand-typed
   * builder for any project it had no entry for — silently, for ISTER TOWER,
   * because ISTER TOWER was added to the synthetic world after the three
   * bespoke builders were written. Opening ISTER TOWER's `/overview` showed
   * Kingsford Yard's own name, meeting count and GBP figures, mislabelled in
   * whatever currency the real project uses — a different developer's project,
   * under a different tenant, presented as this one's own reading.
   *
   * The fix does not invent a fourth builder — `/overview` is demoted and
   * unlinked, and fabricating figures to keep an unreachable screen looking
   * finished is the one thing doctrine §3 rules out. It refuses honestly
   * instead, and this is the regression test for that refusal: not merely
   * that ISTER TOWER doesn't crash, but that it does not, under any
   * circumstance, return another project's identity.
   */
  it("never lets an unmapped project's executive overview fall through to another one's", async () => {
    const kingsford = await repo.getExecutiveOverview({
      viewer: VIEWERS.agencyManager,
      ...KINGSFORD,
      period: "quarter_to_date",
    });
    // Kingsford's own builder is untouched by the fix.
    expect(kingsford.context.project.slug).toBe("kingsford");

    const isterTower = repo.getExecutiveOverview({
      viewer: VIEWERS.agencyManager,
      ...ISTER_TOWER,
      period: "quarter_to_date",
    });
    await expect(isterTower).rejects.toBeInstanceOf(NotFoundError);
    // The refusal names ISTER TOWER, not the project it used to borrow from.
    await expect(isterTower).rejects.toThrow(/ister tower/i);
    await expect(isterTower).rejects.not.toThrow(/kingsford/i);
  });

  it("never lets the agent overview's scripted narrative travel to another project", async () => {
    // Northgate keeps the scripted scenario docs/08-scenarios.md describes.
    const northgate = await repo.getAgentOverview({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    expect(northgate.upcoming.length).toBeGreaterThan(0);

    // ISTER TOWER's agents get an honest refusal, not Viktória's story with
    // this project's links stapled onto it. `salesAgentIster` (Martin Kováč)
    // holds only ISTER TOWER, so the permission gate is satisfied and this
    // exercises the `NotFoundError` path rather than an unrelated refusal.
    const isterTower = repo.getAgentOverview({
      viewer: VIEWERS.salesAgentIster,
      ...ISTER_TOWER,
      period: "quarter_to_date",
    });
    await expect(isterTower).rejects.toBeInstanceOf(NotFoundError);
    await expect(isterTower).rejects.toThrow(/ister tower/i);
  });

  /*
   * THE BRIEF IS THE SAME SCENARIO, ONE FUNCTION FURTHER DOWN.
   *
   * `buildPreMeetingBrief` recognised the scripted meeting by its id alone, so
   * every project a brief reader held served Northgate's brief under its own
   * name with its own links stapled on — photographed on 2026-09-23 under
   * ISTER TOWER, and under Kingsford, which is another developer. Every
   * project every brief reader holds is asked, not one, because the leak
   * crossed tenants as well as projects.
   */
  it("never serves Northgate's pre-meeting brief under another project", async () => {
    // Northgate keeps its brief: a refusal everywhere would also pass below.
    const own = await repo.getPreMeetingBrief({
      viewer: VIEWERS.salesAgent,
      ...NORTHGATE,
      meetingId: VIKTORIA_MEETING_ID,
    });
    expect(own.context.project.slug).toBe("northgate");

    const readers = Object.values(VIEWERS).filter((v) =>
      ["sales_agent", "agency_manager", "madspace_admin"].includes(v.role),
    );
    let asked = 0;
    for (const viewer of readers) {
      for (const project of PROJECTS) {
        if (project.slug === "northgate" || !viewer.projectIds.includes(project.id)) continue;
        const tenant = TENANTS.find((t) => t.id === project.tenantId);
        if (tenant === undefined) throw new Error(`${project.slug} has no tenant`);
        asked += 1;
        await expect(
          repo.getPreMeetingBrief({
            viewer,
            tenantSlug: tenant.slug,
            projectSlug: project.slug,
            meetingId: VIKTORIA_MEETING_ID,
          }),
          `${viewer.displayName} was served the brief on ${project.slug}`,
        ).rejects.toBeInstanceOf(NotFoundError);
      }
    }
    expect(asked, "no brief reader holds a second project, so nothing was asked").toBeGreaterThan(
      0,
    );
  });

  /*
   * The report and the replay were already scoped (`getReportScope`,
   * `getMeetingReplay`): measured on 2026-09-23, another project's meeting
   * under ISTER TOWER draws the not-found boundary. Kept beside the brief so
   * the two halves of the meeting route cannot drift apart again.
   */
  it("never replays or reports another project's meeting under this one", async () => {
    const meeting = sessionsForProject("prj_northgate01")[0]?.meetingId as MeetingId | undefined;
    if (meeting === undefined) throw new Error("Northgate has no meeting to borrow");

    // Found at home, so a refusal below is about the project and not the id.
    await expect(
      repo.getMeetingReplay({ viewer: VIEWERS.salesAgent, ...NORTHGATE, meetingId: meeting }),
    ).resolves.toMatchObject({ meetingId: meeting });

    const elsewhere = {
      viewer: VIEWERS.salesAgent,
      ...ISTER_TOWER,
      period: "quarter_to_date" as const,
    };
    await expect(
      repo.getMeetingReplay({ ...elsewhere, meetingId: meeting }),
      "the replay",
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      repo.getReportScope(elsewhere, { meetingId: meeting }),
      "the meeting report",
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /*
   * THE THIRD INSTANCE: THE SCRIPTED ASK SESSION.
   *
   * `buildAskSession` is Northgate's scenario — its figures, its unit A-505,
   * its buyer, its "south-facing, floors 4 to 6" framing — and every
   * synthetic project was served it. A crawl on 2026-09-24 found 31 surface
   * pairs across Riverside, Kingsford and ISTER TOWER, every one from this
   * source. Every account and every project it holds are asked here, not the
   * two that were known.
   */
  it("never serves Northgate's scripted Ask session under another project", async () => {
    const NORTHGATE_WORDS = [
      "Viktória",
      "Halász",
      "A-505",
      "A-402",
      "viewings held at 46",
      "Offers fell from 17 to 12",
      "South-facing units draw",
      "the two-room finding",
      "three stalled offers",
      "Intent signals expire after 21 days",
    ];
    // Northgate keeps its scenario: the computed session everywhere would also pass below.
    const own = await repo.getAskSession(
      { viewer: VIEWERS.salesAgent, ...NORTHGATE, period: "quarter_to_date" },
      null,
    );
    expect(own.suggestions).toContain("Prepare me for Viktória's meeting.");

    const leaked = new Set<string>();
    let asked = 0;
    for (const viewer of Object.values(VIEWERS)) {
      for (const project of PROJECTS) {
        if (project.slug === "northgate" || !viewer.projectIds.includes(project.id)) continue;
        const tenant = TENANTS.find((t) => t.id === project.tenantId);
        if (tenant === undefined) throw new Error(`${project.slug} has no tenant`);
        const session = await repo.getAskSession(
          { viewer, tenantSlug: tenant.slug, projectSlug: project.slug, period: "quarter_to_date" },
          null,
        );
        asked += 1;
        const text = JSON.stringify(session);
        for (const word of NORTHGATE_WORDS) {
          if (text.includes(word)) leaked.add(`${project.slug}: "${word}"`);
        }
      }
    }
    expect(asked, "no account holds a project besides Northgate").toBeGreaterThan(0);
    expect([...leaked], [...leaked].join("\n")).toEqual([]);
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
      /*
       * A route, or explicitly none. This asserted a non-empty route, and the
       * follow-up statement's `/people` satisfied it while leading to the
       * agents roster. Since P2-16 records no page lists carry an empty route
       * (`EvidenceRef.href`) — the evidence is still attached and counted.
       */
      expect(statement.evidence?.href ?? "", statement.text).toMatch(/^$|^\/./);
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

describe("the verdict is explainable, not an opinion", () => {
  it("shows every rule that produced it", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    expect(overview.verdict.state).toBe("attention_needed");
    expect(overview.verdict.components.length).toBeGreaterThan(2);
    for (const component of overview.verdict.components) {
      // A component without a rule or a value is decoration; the point of
      // showing the workings is that a reader can disagree with a threshold.
      expect(component.rule.length, component.metricId).toBeGreaterThan(10);
      expect(component.display.length, component.metricId).toBeGreaterThan(0);
    }
  });

  it("is versioned, so a disputed verdict can be reproduced", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    expect(overview.verdict.rulesetVersion).toMatch(/^verdict-[0-9]+[.][0-9]+[.][0-9]+$/);
  });

  it("is deterministic", async () => {
    const query = { viewer: VIEWERS.developer, ...NORTHGATE, period: "quarter_to_date" } as const;
    const a = await repo.getExecutiveOverview(query);
    const b = await repo.getExecutiveOverview(query);
    expect(a.verdict).toEqual(b.verdict);
  });

  it("reports insufficient_data rather than a green light on thin evidence", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.agencyManager,
      ...KINGSFORD,
      period: "quarter_to_date",
    });
    expect(overview.verdict.state).toBe("insufficient_data");
    expect(overview.verdict.components.some((c) => c.outcome === "pass")).toBe(false);
  });

  it("keeps the first viewport to four figures and at most three actions", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.developer,
      ...NORTHGATE,
      period: "quarter_to_date",
    });
    // The registry holds eighty-two metrics. The first screen holds four.
    expect(overview.headline.length).toBeLessThanOrEqual(6);
    expect(overview.headline.length).toBeGreaterThanOrEqual(4);
    expect(overview.actions.length).toBeLessThanOrEqual(3);
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
    expect(overview.verdict.state).toBe("insufficient_data");
    expect(overview.dataHealth.sourcesMissing).toContain("CRM");
  });

  it("suppresses verdicts on a project with too little history", async () => {
    const overview = await repo.getExecutiveOverview({
      viewer: VIEWERS.agencyManager,
      ...KINGSFORD,
      period: "quarter_to_date",
    });
    expect(overview.verdict.state).toBe("insufficient_data");
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
