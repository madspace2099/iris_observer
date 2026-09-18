import { describe, expect, it } from "vitest";
import { ATTENTION_KIND_DEFINITIONS, NotFoundError } from "@observer/readmodels";
import type { AlertSeverity, MeetingFilters, OverviewQuery, Viewer } from "@observer/readmodels";
import { AGENT_MIN_SAMPLE, UNIT_MIN_SAMPLE } from "@observer/metrics";
import { SyntheticObserverRepository, SYNTHETIC_AGENTS, VIEWERS } from "../src/index";
import { catalogueFor } from "../src/pulse";

/**
 * The drill-down surfaces.
 *
 * These guard the properties that are easy to break silently and expensive to
 * discover on screen: a name reaching a visitor label, an absent figure
 * rendering as a zero, a verdict surviving a thin sample, a demonstration
 * conversation losing the label that says it is one.
 *
 * Every assertion is about a *state* rather than a figure wherever it can be.
 * A test that pins the count of meetings in a period fails when the dataset
 * grows, which teaches whoever is next to update the number rather than to read
 * the assertion.
 */

const repo = new SyntheticObserverRepository();

const NO_FILTERS: MeetingFilters = { agentId: null, channel: null, outcome: null };

function query(viewer: Viewer, tenantSlug: string, projectSlug: string): OverviewQuery {
  return { viewer, tenantSlug, projectSlug, period: "quarter_to_date" };
}

const ISTER = query(VIEWERS.developer as Viewer, "alpha", "ister-tower");
const NORTHGATE = query(VIEWERS.developer as Viewer, "alpha", "northgate");
const RIVERSIDE = query(VIEWERS.developer as Viewer, "alpha", "riverside");
const KINGSFORD = query(VIEWERS.agencyManager as Viewer, "beta", "kingsford");
const EVERY_PROJECT = [ISTER, NORTHGATE, RIVERSIDE, KINGSFORD];

/* --- the meeting list ------------------------------------------------------- */

describe("the register's unit references", () => {
  /*
   * A session records whatever code the showroom showed. Only the catalogue
   * knows whether that code has a page, so the read model decides the link
   * and the register never draws a door with no room behind it: the QA sweep
   * found chips on a project without a catalogue leading to the product's own
   * "this isn't here".
   */
  it("links a unit only when the catalogue has a page for it", async () => {
    let linked = 0;
    for (const project of EVERY_PROJECT) {
      const view = await repo.getMeetings(project, NO_FILTERS);
      const codes = new Set(catalogueFor(view.context.project.id as string).map((u) => u.code));
      for (const row of view.rows) {
        for (const unit of row.unitsViewed) {
          if (codes.has(unit.code)) {
            linked += 1;
            expect(unit.href).toBe(
              `/${project.tenantSlug}/${project.projectSlug}/units/${encodeURIComponent(unit.code)}`,
            );
          } else {
            expect(unit.href).toBeNull();
          }
        }
      }
    }
    // Not vacuous: Northgate's sessions open catalogue units by construction.
    expect(linked).toBeGreaterThan(0);
  });
});

describe("getMeetings", () => {
  it("returns a context-bearing view, not a bare array", async () => {
    const view = await repo.getMeetings(ISTER, NO_FILTERS);
    expect(view.context.project.slug).toBe("ister-tower");
    expect(view.total).toBe(view.rows.length);
    expect(view.periodTotal).toBe(view.rows.length);
    expect(view.emptyState.length).toBeGreaterThan(0);
  });

  it("never puts a person in a visitor label", async () => {
    /*
     * The one rule this surface exists to keep. `docs/05-identity.md` §2 rule 3
     * keeps names, emails and phone numbers out of behavioural records, and a
     * meeting list is the surface most likely to grow a name column.
     *
     * Checked against every staff name the world holds and against the contact
     * identifier itself, because a pseudonymous id is still linkable to a
     * person (`docs/10-policies.md` §3).
     */
    const slice = await repo.getSessionSlice(ISTER);
    const view = await repo.getMeetings(ISTER, NO_FILTERS);
    const forbidden = [
      ...SYNTHETIC_AGENTS.map((a) => a.name),
      ...Object.values(VIEWERS).map((v) => v.displayName),
      ...slice.sessions.map((s) => s.contactId).filter((id): id is string => id !== null),
    ];

    for (const row of view.rows) {
      for (const name of forbidden) {
        expect(row.visitor.display).not.toContain(name);
      }
      expect(row.visitor.display).toMatch(/^(Not linked to a contact|First meeting|Returning · )/);
    }
  });

  it("counts the filter options over the period rather than over the result", async () => {
    const unfiltered = await repo.getMeetings(ISTER, NO_FILTERS);
    const webiris = unfiltered.options.channels.find((o) => o.id === "webiris");
    const showroom = unfiltered.options.channels.find((o) => o.id === "showroom");
    // ISTER TOWER is the only project with a genuine mix, which is what makes
    // the channel filter demonstrable at all.
    expect(webiris?.count).toBeGreaterThan(0);
    expect(showroom?.count).toBeGreaterThan(0);

    const filtered = await repo.getMeetings(ISTER, { ...NO_FILTERS, channel: "webiris" });
    expect(filtered.total).toBe(webiris?.count);
    expect(filtered.periodTotal).toBe(unfiltered.periodTotal);
    // The option the reader did not choose is still offered, with its count.
    expect(filtered.options.channels.find((o) => o.id === "showroom")?.count).toBe(showroom?.count);
  });

  it("states the absence of a CRM instead of showing a meeting with no follow-up", async () => {
    const view = await repo.getMeetings(RIVERSIDE, NO_FILTERS);
    expect(view.rows.length).toBeGreaterThan(0);
    for (const row of view.rows) {
      expect(row.followUp).toBe("unavailable");
    }
  });

  it("writes the empty sentence for the filter that emptied the list", async () => {
    const view = await repo.getMeetings(NORTHGATE, { ...NO_FILTERS, channel: "webiris" });
    expect(view.rows).toHaveLength(0);
    expect(view.emptyState).toContain("WEB IRIS");
  });
});

/* --- one unit --------------------------------------------------------------- */

describe("getUnitDetail", () => {
  it("refuses a unit the catalogue does not hold", async () => {
    await expect(repo.getUnitDetail(ISTER, "IT-Z-99-99")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("agrees with the attention table it was reached from", async () => {
    const table = await repo.getUnitAttention(ISTER, null);
    const busiest = table.rows[0];
    expect(busiest).toBeDefined();
    const detail = await repo.getUnitDetail(ISTER, busiest?.unitCode ?? "");
    expect(detail.attention.views).toBe(busiest?.views);
    expect(detail.attention.meetings).toBe(busiest?.meetings);
  });

  it("styles only the catalogue-stated stages as verified", async () => {
    const detail = await repo.getUnitDetail(ISTER, "IT-A-12-07");
    const verified = detail.funnel.filter((s) => s.verification === "verified").map((s) => s.id);
    expect(verified).toEqual(["reservation", "purchase"]);

    // An outcome belongs to the meeting, in which several units were open, so
    // the follow-up stage is an association and must never read as verified.
    expect(detail.funnel.find((s) => s.id === "follow_up")?.verification).toBe("attributed");
  });

  it("returns the offer stage as unavailable on every project", async () => {
    // Observer holds no offer fact. ADR-0021 puts the deal ladder in the CRM,
    // and a zero here would be a claim that no offer was made.
    for (const project of EVERY_PROJECT) {
      const table = await repo.getUnitAttention(project, null);
      const code = table.rows[0]?.unitCode ?? "";
      const detail = await repo.getUnitDetail(project, code);
      const offer = detail.funnel.find((s) => s.id === "offer");
      expect(offer?.verification, project.projectSlug).toBe("unavailable");
      expect(offer?.step.metric.state, project.projectSlug).toBe("unavailable");
      expect(offer?.step.metric.raw, project.projectSlug).toBeNull();
    }
  });

  it("draws no direction from a sample too thin to carry one", async () => {
    const table = await repo.getUnitAttention(ISTER, null);
    const thin = [...table.rows].sort((a, b) => a.views - b.views)[0];
    expect(thin).toBeDefined();
    expect(thin?.views).toBeLessThan(UNIT_MIN_SAMPLE);

    const detail = await repo.getUnitDetail(ISTER, thin?.unitCode ?? "");
    expect(detail.trend.direction).toBe("unknown");
    expect(detail.trend.verdict.state).toBe("insufficient");
    // The figure is still shown. Hiding it would be patronising; ranking on it
    // would be the legacy dashboard's mistake.
    expect(detail.trend.verdict.display).not.toBeNull();
  });

  it("says nothing opened it rather than showing a row of zeros", async () => {
    const table = await repo.getUnitAttention(KINGSFORD, null);
    const untouched = table.rows.find((r) => r.meetings === 0);
    if (untouched === undefined) return;

    const detail = await repo.getUnitDetail(KINGSFORD, untouched.unitCode);
    expect(detail.emptyState).not.toBeNull();
    expect(detail.signals.views.state).toBe("empty");
    expect(detail.timeline).toHaveLength(0);
  });

  it("never reports an absent signal as an ordinary figure", async () => {
    const detail = await repo.getUnitDetail(ISTER, "IT-A-12-07");
    for (const signal of Object.values(detail.signals)) {
      if (signal.state === "ok") expect(signal.raw).not.toBe(0);
      if (signal.state === "empty") expect(signal.message).not.toBeNull();
    }
  });
});

/* --- one agent -------------------------------------------------------------- */

describe("getAgentDetail", () => {
  it("refuses a presenter who does not work this project", async () => {
    // Beta Development's people never appear on an Alpha project, and the
    // refusal says "not on this project" without confirming they exist.
    await expect(repo.getAgentDetail(ISTER, "agt_eva")).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.getAgentDetail(ISTER, "agt_nobody")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("suppresses every verdict below the minimum sample", async () => {
    const thin = await repo.getAgentDetail(ISTER, "agt_luciahorvath");
    expect(thin.sampleSize).toBeLessThan(AGENT_MIN_SAMPLE);
    expect(thin.belowMinimum).toBe(true);
    expect(thin.suppressionNote).not.toBeNull();

    // A count stays a count; a rate becomes an insufficient figure with the
    // number still in it (`docs/10-policies.md` §6).
    const meetings = thin.activity.find((m) => m.metricId === "agent.meetings");
    const perMeeting = thin.activity.find((m) => m.metricId === "agent.units");
    expect(meetings?.state).toBe("ok");
    expect(perMeeting?.state).toBe("insufficient");
    expect(perMeeting?.display).not.toBeNull();
  });

  it("reads a full sample as a full sample", async () => {
    const martin = await repo.getAgentDetail(ISTER, "agt_martinkovac");
    expect(martin.sampleSize).toBeGreaterThanOrEqual(AGENT_MIN_SAMPLE);
    expect(martin.belowMinimum).toBe(false);
    expect(martin.suppressionNote).toBeNull();
    expect(martin.activity.find((m) => m.metricId === "agent.units")?.state).toBe("ok");
  });

  it("never claims a follow-up happened", async () => {
    // Recorded as needed and actually done are two questions, and no source in
    // this phase answers the second one.
    for (const project of [ISTER, RIVERSIDE]) {
      const agentId = project === RIVERSIDE ? "agt_lucia" : "agt_martinkovac";
      const view = await repo.getAgentDetail(project, agentId);
      expect(view.followUp.completed.state).toBe("unavailable");
      expect(view.followUp.completed.raw).toBeNull();
    }
  });

  it("shows outcomes as unavailable where no CRM can verify them", async () => {
    const view = await repo.getAgentDetail(RIVERSIDE, "agt_lucia");
    for (const outcome of view.verifiedOutcomes) {
      expect(outcome.metric.state).toBe("unavailable");
    }
    expect(view.funnel.find((s) => s.label === "Outcome recorded")?.metric.state).toBe(
      "unavailable",
    );
  });

  it("lists other projects only within the reader's own grants", async () => {
    // Monika presents on Northgate and ISTER TOWER for the same developer.
    const forDeveloper = await repo.getAgentDetail(ISTER, "agt_monika");
    expect(forDeveloper.projects.map((p) => p.projectName).sort()).toContain(
      "Northgate Residences",
    );

    // The agency manager holds Kingsford as well, and Kingsford is a different
    // developer — but it is not Monika's, so it is absent for a different
    // reason. What must never appear is a project the reader does not hold.
    const held = new Set(VIEWERS.developer.projectIds as readonly string[]);
    for (const project of forDeveloper.projects) {
      expect(held.has(project.projectId)).toBe(true);
    }
  });
});

/* --- attention -------------------------------------------------------------- */

describe("getAttention", () => {
  it("answers every check on every project, raised or not", async () => {
    for (const project of EVERY_PROJECT) {
      const view = await repo.getAttention(project);
      expect(
        view.checks.map((c) => c.kind),
        project.projectSlug,
      ).toEqual(ATTENTION_KIND_DEFINITIONS.map((d) => d.kind));
      for (const check of view.checks) {
        expect(check.reason.length, `${project.projectSlug} ${check.kind}`).toBeGreaterThan(0);
      }
    }
  });

  it("declares the check it cannot answer instead of dropping it", async () => {
    // Observer holds no ingestion telemetry, and a plausible lag figure would
    // be indistinguishable from a measured one.
    for (const project of EVERY_PROJECT) {
      const view = await repo.getAttention(project);
      const queue = view.checks.find((c) => c.kind === "analytics_queue_pressure");
      expect(queue?.state, project.projectSlug).toBe("unavailable");
    }
  });

  it("keeps every state inside its own severity ceiling", async () => {
    const rank: Record<AlertSeverity, number> = { info: 0, warning: 1, critical: 2 };
    for (const project of EVERY_PROJECT) {
      const view = await repo.getAttention(project);
      for (const state of view.states) {
        const ceiling = ATTENTION_KIND_DEFINITIONS.find((d) => d.kind === state.kind)?.maxSeverity;
        expect(ceiling, state.kind).toBeDefined();
        expect(
          rank[state.alert.severity],
          `${project.projectSlug} ${state.kind}`,
        ).toBeLessThanOrEqual(rank[ceiling ?? "info"]);
      }
    }
  });

  it("ranks the raised states and numbers them from one", async () => {
    const view = await repo.getAttention(ISTER);
    expect(view.states.length).toBeGreaterThan(0);
    expect(view.states.map((s) => s.rank)).toEqual(view.states.map((_, i) => i + 1));
  });

  it("does not paint a missing CRM red", async () => {
    // A project with no CRM is a configuration state every surface already
    // says out loud. Red is reserved for a record that was arriving and stopped.
    const view = await repo.getAttention(RIVERSIDE);
    const verification = view.states.find((s) => s.kind === "crm_verification_missing");
    expect(verification?.alert.severity).toBe("warning");
    expect(view.checks.find((c) => c.kind === "high_interest_no_follow_up")?.state).toBe(
      "unavailable",
    );
  });

  it("cannot ask about falling demand on a project with no baseline", async () => {
    const view = await repo.getAttention(KINGSFORD);
    expect(view.checks.find((c) => c.kind === "demand_dropping")?.state).toBe("unavailable");
  });
});

/* --- Ask Observer history --------------------------------------------------- */

describe("getAskHistory and getAskThread", () => {
  it("marks every stored conversation as a demonstration", async () => {
    const history = await repo.getAskHistory(ISTER);
    expect(history.threads.length).toBeGreaterThan(0);
    expect(history.origin).toBe("demonstration");
    expect(history.demonstrationNotice.length).toBeGreaterThan(0);
    for (const thread of history.threads) {
      expect(thread.origin).toBe("demonstration");
    }
  });

  it("titles a thread with the question that opened it", async () => {
    const history = await repo.getAskHistory(ISTER);
    for (const summary of history.threads) {
      const thread = await repo.getAskThread(ISTER, summary.threadId);
      expect(thread.origin).toBe("demonstration");
      expect(thread.turns).toHaveLength(summary.turnCount);
      expect(thread.turns[0]?.answer.question).toBe(summary.title);
    }
  });

  it("answers each project with its own figures", async () => {
    const ister = await repo.getAskHistory(ISTER);
    const northgate = await repo.getAskHistory(NORTHGATE);
    expect(ister.threads.map((t) => t.threadId)).not.toEqual(
      northgate.threads.map((t) => t.threadId),
    );

    // Riverside has no CRM, and the outcome thread has to say so rather than
    // report nil outcomes.
    const riverside = await repo.getAskHistory(RIVERSIDE);
    const outcomes = riverside.threads.find((t) => t.threadId.endsWith("_outcomes"));
    expect(outcomes).toBeDefined();
    const thread = await repo.getAskThread(RIVERSIDE, outcomes?.threadId ?? "");
    expect(thread.turns[0]?.answer.answer).toContain("no CRM");
  });

  it("refuses a conversation that does not exist", async () => {
    await expect(repo.getAskThread(ISTER, "ask_nothing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

/* --- report scope ----------------------------------------------------------- */

describe("getReportScope", () => {
  it("states that nothing generates a document, on every project", async () => {
    for (const project of EVERY_PROJECT) {
      const view = await repo.getReportScope(project);
      expect(view.generation.state, project.projectSlug).toBe("preview_only");
      expect(view.generation.statement.length).toBeGreaterThan(0);
      expect(view.sections.length).toBeGreaterThan(0);
      for (const section of view.sections) {
        // A section that is not ready always says why. A blank reason on a
        // blank section is the failure this field exists to prevent.
        if (section.availability !== "ready") expect(section.reason).not.toBeNull();
      }
    }
  });

  it("names the sections a project cannot fill before it is asked for one", async () => {
    const riverside = await repo.getReportScope(RIVERSIDE);
    expect(riverside.sections.find((s) => s.id === "outcomes")?.availability).toBe("unavailable");
    expect(riverside.unavailableCount).toBeGreaterThan(0);

    const ister = await repo.getReportScope(ISTER);
    expect(ister.sections.find((s) => s.id === "channel-split")?.availability).toBe("ready");
    // Northgate runs entirely on the installation, so there is no split to
    // report — which is a different answer from "we could not measure it".
    const northgate = await repo.getReportScope(NORTHGATE);
    expect(northgate.sections.find((s) => s.id === "channel-split")?.availability).toBe(
      "unavailable",
    );
  });
});

/* --- no causal language ----------------------------------------------------- */

const CAUSAL =
  /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;

describe("association, never cause", () => {
  it("emits no causal wording on any of the new surfaces", async () => {
    for (const project of EVERY_PROJECT) {
      const meetings = await repo.getMeetings(project, NO_FILTERS);
      const attention = await repo.getAttention(project);
      const report = await repo.getReportScope(project);
      const history = await repo.getAskHistory(project);
      const table = await repo.getUnitAttention(project, null);
      const unit = await repo.getUnitDetail(project, table.rows[0]?.unitCode ?? "");

      const prose = [
        meetings.emptyState,
        ...meetings.findings.flatMap((f) => [
          f.statement,
          f.soWhat,
          f.baseline ?? "",
          f.caveat ?? "",
        ]),
        ...attention.states.flatMap((s) => [s.alert.title, s.alert.detail]),
        ...attention.checks.map((c) => c.reason),
        attention.emptyState,
        ...report.sections.flatMap((s) => [s.summary, s.reason ?? ""]),
        report.generation.statement,
        history.demonstrationNotice,
        unit.headline,
        unit.timelineNote,
        unit.emptyState ?? "",
        ...unit.funnel.map((s) => s.basis),
        ...unit.findings.flatMap((f) => [f.statement, f.soWhat, f.caveat ?? ""]),
      ];

      for (const sentence of prose) {
        expect(CAUSAL.test(sentence), `causal wording: "${sentence}"`).toBe(false);
      }
    }
  });

  it("keeps the agent surfaces clear of it too", async () => {
    for (const agentId of ["agt_martinkovac", "agt_luciahorvath", "agt_monika"]) {
      const view = await repo.getAgentDetail(ISTER, agentId);
      const prose = [
        view.suppressionNote ?? "",
        view.followUp.note,
        ...view.findings.flatMap((f) => [f.statement, f.soWhat, f.baseline ?? "", f.caveat ?? ""]),
      ];
      for (const sentence of prose) {
        expect(CAUSAL.test(sentence), `causal wording: "${sentence}"`).toBe(false);
      }
    }
  });
});
