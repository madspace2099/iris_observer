import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PERIOD_PRESETS } from "@observer/readmodels";
import { VIEWERS } from "@observer/synthetic";
import {
  CAUSAL_PATTERNS,
  ask,
  bundlesFor,
  composeDeterministic,
  containsCausalClaim,
  isEnglishQuestion,
  namedAgents,
  routeQuestion,
  type AskContextInput,
} from "../src/lib/ai/agent";
import { LIVE_QUESTIONS } from "../src/components/ask-iris/live-questions";
import { rosterOf } from "./support/roster";
import type { ModelGrant } from "../src/lib/ai/provider";
import { ANSWER_CEILING, TOOLS, TOOL_NAMES, type ToolResult } from "../src/lib/ai/tools";
import { resetEnvironmentCache } from "../src/lib/env";
import { repository } from "../src/lib/repository";

/**
 * Ask Observer, against the ten questions the product must answer.
 *
 * Run in evidence-only mode so the suite is offline, reproducible and free. A
 * test that spends money on every run is a test people delete, and a test that
 * depends on a model's mood is one they stop trusting.
 *
 * What is asserted is the part that must never vary: which tool ran, that the
 * answer is rooted in showroom evidence, that every figure came from a tool
 * rather than from prose, and that no causal claim survives. The live path adds
 * wording on top of exactly this; it cannot add a number.
 */

beforeAll(() => {
  // Evidence-only: no key, no network, the tools' own prose. A supported mode
  // rather than a degraded one, which is why the whole suite can run in it.
  process.env["OBSERVER_AI_ENABLED"] = "false";
  delete process.env["OPENAI_API_KEY"];
  resetEnvironmentCache();
});

/** Northgate's presenters, read from the repository the gate reads them from. */
const NORTHGATE_ROSTER = await rosterOf("alpha", "northgate");

const CONTEXT: AskContextInput = {
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  projectLabel: "Northgate",
  periodLabel: "Quarter to date",
  period: "quarter_to_date",
  roster: NORTHGATE_ROSTER,
  unitCode: null,
  meetingId: null,
  safetyIdentifier: "obs_test",
  depth: "standard",
};

/**
 * What a route hands `ask` for an account with no key: a named refusal, never
 * nothing (`api/ask/route.ts`, `blockFor`). The suite runs with no model.
 */
const NO_KEY: ModelGrant = { blocked: "no_connection" };

const CAUSAL =
  /\b(because|caused|causes|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;

/** The ten questions from the brief, with the tool each must reach. */
const QUESTIONS: readonly { question: string; tool: string; context?: Partial<AskContextInput> }[] =
  [
    { question: "Compare Monika and Akhilesh's presentation flows.", tool: "compare_agent_flows" },
    /* The founder's question, 2026-09-17. Answered as an order of events, never as a cause (ADR-0039). */
    {
      question: "Did IRIS assist the sales on this project?",
      tool: "analyze_iris_assisted_sales",
    },
    {
      question: "Which apartments were sold after a showing in IRIS?",
      tool: "analyze_iris_assisted_sales",
    },
    {
      question: "What do the more successful showroom meetings have in common?",
      tool: "compare_meeting_cohorts",
    },
    {
      question: "Which IRIS sections are being skipped most frequently?",
      tool: "analyze_feature_usage",
    },
    {
      question: "Show me how this meeting developed step by step.",
      tool: "explain_meeting_journey",
      // Asked by an agent, for the same reason `prepare_meeting` below is:
      // `/meetings/[meetingId]` declares three roles and the developer is not
      // one of them, so the replay is not theirs to read in prose either.
      context: { meetingId: "mtg_ng0100", viewer: VIEWERS.salesAgent },
    },
    { question: "Why is interest in apartment A-402 changing?", tool: "analyze_unit_attention" },
    {
      question: "Which IRIS functions appear before visitors shortlist an apartment?",
      tool: "analyze_feature_usage",
    },
    {
      question: "How are weather and time-of-day presets used during presentations?",
      tool: "analyze_environment_usage",
    },
    {
      question: "What should this sales agent change in the next meeting?",
      tool: "compare_agent_flows",
    },
    {
      question: "Summarize the most important showroom behavior changes this month.",
      tool: "detect_showroom_behavior_changes",
    },
    {
      question: "Prepare me for the meeting with Viktória using WEBIRIS context.",
      tool: "prepare_meeting",
      // Asked by the agent running the meeting: a brief is not a developer's to
      // read (ADR-0018), and the router correctly refuses it for one.
      context: { meetingId: "mtg_viktoria0827", viewer: VIEWERS.salesAgent },
    },
  ];

describe("the ten questions", () => {
  for (const { question, tool, context } of QUESTIONS) {
    it(`answers: ${question}`, async () => {
      const outcome = await ask(question, { ...CONTEXT, ...context }, NO_KEY);

      expect(outcome.refusal, `refused: ${outcome.refusal}`).toBeNull();
      expect(outcome.answer).not.toBeNull();
      expect(outcome.toolsUsed, `routed to ${outcome.toolsUsed.join(", ")}`).toContain(tool);

      const answer = outcome.answer;
      if (answer === null) return;

      // Every figure came from a tool, so there is always something measured.
      expect(answer.findings.length).toBeGreaterThan(0);
      // Prose exists, and says something.
      expect(answer.interpretation.length).toBeGreaterThan(20);
      // Rooted in the showroom, per ADR-0023.
      expect(
        outcome.sources.some(
          (s) => s === "IRIS_SHOWROOM_OBSERVED" || s === "IRIS_SHOWROOM_DERIVED",
        ),
      ).toBe(true);
      // And never a causal claim.
      expect(CAUSAL.test(answer.interpretation), answer.interpretation).toBe(false);
      expect(CAUSAL.test(answer.answer), answer.answer).toBe(false);
    });
  }
});

describe("the boundary holds", () => {
  it("says a brief is forbidden rather than pretending it does not exist", async () => {
    const outcome = await ask(
      "Prepare me for the meeting with Viktória.",
      {
        ...CONTEXT,
        meetingId: "mtg_viktoria0827",
      },
      NO_KEY,
    );
    expect(outcome.answer).toBeNull();
    expect(outcome.refusal).toMatch(/not permitted/i);
  });

  it("refuses a question it has no registered analysis for", async () => {
    const outcome = await ask("What is the weather in Bratislava tomorrow?", CONTEXT, NO_KEY);
    // It routes to the period summary rather than inventing an answer; either a
    // refusal or a showroom-rooted answer is acceptable, an invented forecast is
    // not.
    if (outcome.answer !== null) {
      expect(outcome.answer.interpretation.toLowerCase()).not.toMatch(/forecast|rain tomorrow|°c/);
      expect(
        outcome.sources.some(
          (s) => s === "IRIS_SHOWROOM_OBSERVED" || s === "IRIS_SHOWROOM_DERIVED",
        ),
      ).toBe(true);
    }
  });

  it("returns an empty question to the reader rather than guessing", async () => {
    const outcome = await ask("   ", CONTEXT, NO_KEY);
    expect(outcome.answer).toBeNull();
    expect(outcome.refusal).not.toBeNull();
  });

  it("carries a traceable evidence bundle on every answer", async () => {
    const outcome = await ask(
      "Summarize the most important showroom behavior changes this month.",
      CONTEXT,
      NO_KEY,
    );
    const answer = outcome.answer;
    expect(answer).not.toBeNull();
    if (answer === null) return;

    expect(answer.evidence.length).toBeGreaterThan(0);
    const known = new Set(answer.evidence.map((bundle) => bundle.bundleId));

    for (const bundle of answer.evidence) {
      // Project, period, fact, source, sample size and level — the six things
      // that make a figure checkable by somebody who does not trust it.
      expect(bundle.projectSlug).toBe("northgate");
      expect(bundle.period.length).toBeGreaterThan(0);
      expect(bundle.factId.length).toBeGreaterThan(0);
      expect(bundle.sampleSize).toBeGreaterThanOrEqual(0);
      expect(["observed_sequence", "attributed_conversion", "statistical_association"]).toContain(
        bundle.evidenceLevel,
      );
    }

    // And no finding cites a bundle that was never supplied.
    for (const finding of answer.findings) {
      expect(finding.evidenceRefs.length).toBeGreaterThan(0);
      for (const ref of finding.evidenceRefs) expect(known.has(ref)).toBe(true);
    }
  });

  it("reports that the tools wrote the prose when no model is configured", async () => {
    const outcome = await ask(
      "Which IRIS sections are being skipped most frequently?",
      CONTEXT,
      NO_KEY,
    );
    expect(outcome.status.provider).toBe("evidence-only");
    expect(outcome.status.live).toBe(false);
    // Without a live model, no interpretation source is claimed — the prose is
    // the tool's own draft, and saying otherwise would misattribute it.
    expect(outcome.sources).not.toContain("AI_INTERPRETATION");
  });

  it("states that this deployment runs on demonstration data", async () => {
    const outcome = await ask(
      "Which IRIS sections are being skipped most frequently?",
      CONTEXT,
      NO_KEY,
    );
    expect(outcome.demoData).toBe(true);
  });

  it("exposes exactly the tools the product specified", () => {
    expect([...TOOL_NAMES].sort()).toEqual(
      [
        "analyze_environment_usage",
        "analyze_feature_usage",
        "analyze_iris_assisted_sales",
        "analyze_unit_attention",
        "compare_agent_flows",
        "compare_agent_outcomes",
        "compare_meeting_cohorts",
        "detect_showroom_behavior_changes",
        "explain_meeting_journey",
        "get_metric_evidence",
        /* The owner, 2026-10-22: the AI reads the flats and the sales from the CRM (ADR-0055). */
        "get_sales_plan",
        "prepare_meeting",
        "summarize_showroom_period",
      ].sort(),
    );
  });
});

describe("the live questions reach their analyses without a model", () => {
  const routes = (question: string) => routeQuestion(question, CONTEXT).map((call) => call.tool);

  it("offers exactly four, each a different question", () => {
    expect(LIVE_QUESTIONS).toHaveLength(4);
    expect(new Set(LIVE_QUESTIONS).size).toBe(4);
  });

  it("splits progressed meetings from the rest", () => {
    expect(routes(LIVE_QUESTIONS[0] as string)).toEqual(["compare_meeting_cohorts"]);
  });

  it("reads who progressed most, and how they presented, in one analysis", () => {
    expect(routes(LIVE_QUESTIONS[1] as string)).toEqual(["compare_agent_outcomes"]);
  });

  it("reads the sections reached and skipped from the section coverage alone", () => {
    expect(routes(LIVE_QUESTIONS[2] as string)).toEqual(["analyze_feature_usage"]);
  });

  it("still reads where presentations lose buyers from the cohorts and the sections", () => {
    expect(routes("Where do presentations lose buyers?")).toEqual([
      "compare_meeting_cohorts",
      "analyze_feature_usage",
    ]);
  });

  it("reads what the most-opened flats share, and their own sales, in one analysis", () => {
    expect(routes(LIVE_QUESTIONS[3] as string)).toEqual(["analyze_unit_attention"]);
  });

  it("reads whether the project will sell out by its date from the plan", () => {
    expect(routes("Are we on track to sell out?")).toEqual(["get_sales_plan"]);
    expect(routes("How many flats are sold?")).toEqual(["get_sales_plan"]);
  });

  /*
   * ADR-0051, the owner on 2026-10-20: not "The units drawing most attention
   * are S-503 (29 meetings), S-603 (22 meetings), S-403 (23 meetings)…" — out of
   * order, and a list rather than an answer — but what those flats share.
   */
  it("leads with a pattern, then the sales, then the ranking in descending order", async () => {
    const shark: AskContextInput = {
      ...CONTEXT,
      viewer: VIEWERS.developerShark,
      tenantSlug: "shark",
      projectSlug: "shark-residence",
      projectLabel: "Shark Residence",
      roster: await rosterOf("shark", "shark-residence"),
    };
    const outcome = await ask(LIVE_QUESTIONS[3] as string, shark, NO_KEY);
    const answer = outcome.answer;
    expect(outcome.toolsUsed).toEqual(["analyze_unit_attention"]);
    expect(answer).not.toBeNull();
    if (answer === null) return;

    const text = answer.answer;
    const pattern = text.indexOf("All 5 most-opened flats ");
    /* The owner's own example, "all in this price range": the price the five share. */
    const price = text.indexOf("They are priced €191,000 to €218,000");
    const sales = text.indexOf("4 of the 5 are reserved or sold now");
    const ranking = text.indexOf("Most opened: ");
    expect(pattern, text).toBe(0);
    expect(price, text).toBeGreaterThan(pattern);
    expect(sales, text).toBeGreaterThan(price);
    expect(ranking, text).toBeGreaterThan(sales);

    const counts = [...text.slice(ranking).matchAll(/[A-Z]-\d+ \((\d+)/g)].map((m) => Number(m[1]));
    expect(counts).toHaveLength(5);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    /* No project-wide share, no list for an answer, no cause, in any language the guard reads. */
    expect(text).not.toMatch(/units drawing most attention|dated sales \(/);
    expect(containsCausalClaim(answer)).toBe(false);
    expect(CAUSAL_PATTERNS.test(answer.limitations.join(" "))).toBe(false);
  });

  /*
   * The composer keeps whole sentences up to the ceiling and drops the rest, so
   * a long run of patterns once pushed the ranking out and the answer to
   * "which units" named none. Every project, every period.
   */
  it("names the most-opened flats within the ceiling in every project and period", async () => {
    const projects = [
      ["alpha", "northgate"],
      ["alpha", "riverside"],
      ["beta", "kingsford"],
      ["alpha", "ister-tower"],
      ["shark", "shark-residence"],
    ] as const;
    for (const [tenantSlug, projectSlug] of projects) {
      for (const period of PERIOD_PRESETS) {
        const query = {
          viewer: VIEWERS.madspace,
          tenantSlug,
          projectSlug,
          period,
          language: "en" as const,
        };
        const view = await repository.getUnitAttentionPatterns(query);
        const outcome = await ask(
          LIVE_QUESTIONS[3] as string,
          {
            ...CONTEXT,
            ...query,
            projectLabel: projectSlug,
            roster: await rosterOf(tenantSlug, projectSlug),
          },
          NO_KEY,
        );
        const text = outcome.answer?.answer ?? "";
        const where = `${projectSlug} ${period}: ${text}`;
        expect(text.length, where).toBeLessThanOrEqual(ANSWER_CEILING);
        if (view.top.length > 0) expect(text, where).toContain(`Most opened: ${view.ranking}.`);
        expect(CAUSAL.test(text), where).toBe(false);
      }
    }
  });

  it.each(LIVE_QUESTIONS)("answers from showroom evidence, with no causal claim: %s", async (q) => {
    const outcome = await ask(q, CONTEXT, NO_KEY);
    expect(outcome.refusal, `refused: ${outcome.refusal}`).toBeNull();
    const answer = outcome.answer;
    expect(answer).not.toBeNull();
    if (answer === null) return;
    expect(answer.findings.length).toBeGreaterThan(0);
    expect(CAUSAL.test(answer.answer), answer.answer).toBe(false);
    expect(CAUSAL.test(answer.interpretation), answer.interpretation).toBe(false);
  });
});

describe("the router names presenters from the project's own roster", () => {
  const ROSTER = [
    { agentId: "agt_a", name: "Zsófia Bárány" },
    { agentId: "agt_b", name: "Marek Dvořák" },
    { agentId: "agt_c", name: "Lena Fischer" },
  ];

  it("matches a first name, with or without its accents, in the order asked", () => {
    expect(namedAgents("Compare Lena and Zsofia", ROSTER)).toEqual(["agt_c", "agt_a"]);
    expect(namedAgents("compare zsófia with marek", ROSTER)).toEqual(["agt_a", "agt_b"]);
  });

  it("matches a whole word only, never a name inside another word", () => {
    expect(namedAgents("How did Magdalena present?", ROSTER)).toEqual([]);
  });

  it("names nobody who is not on the roster", () => {
    expect(namedAgents("Compare Monika and Ján", ROSTER)).toEqual([]);
  });

  it("compares the two presenters a question names", () => {
    const calls = routeQuestion("Compare Marek and Lena's presentations", {
      ...CONTEXT,
      roster: ROSTER,
    });
    expect(calls).toEqual([
      { tool: "compare_agent_flows", args: { leftAgentId: "agt_b", rightAgentId: "agt_c" } },
    ]);
  });

  it("falls back to the roster's order, never to an id written into the code", () => {
    const calls = routeQuestion("Compare the agents' presentations", {
      ...CONTEXT,
      roster: ROSTER,
    });
    expect(calls).toEqual([
      { tool: "compare_agent_flows", args: { leftAgentId: "agt_a", rightAgentId: "agt_b" } },
    ]);
  });

  it("offers no comparison of presenters when the roster holds fewer than two", () => {
    const calls = routeQuestion("What should this agent do differently?", {
      ...CONTEXT,
      roster: ROSTER.slice(0, 1),
    });
    expect(calls.map((c) => c.tool)).toEqual(["compare_meeting_cohorts"]);
  });

  it("reads a unit code whole, however the catalogue spells it", () => {
    for (const [question, unitCode] of [
      ["Why is interest in apartment A-402 changing?", "A-402"],
      ["How much attention did it-a-12-07 draw?", "IT-A-12-07"],
    ] as const) {
      expect(routeQuestion(question, CONTEXT)).toEqual([
        { tool: "analyze_unit_attention", args: { unitCode } },
      ]);
    }
  });

  it("names no project's presenter in the router itself", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/lib/ai/agent.ts"), "utf8");
    expect(source).not.toMatch(/agt_monika|agt_akhilesh|monika\|/i);
  });
});

/*
 * Every rate in a tool's answer stands on a stated count.
 *
 * The outcomes tool read "progressed most often (83% of 36)" and then "in 85%
 * of their meetings", a second share over a different total (every meeting the
 * presenter held) with no total at all; its fact rows dropped the read model's
 * note on a timing-blind behaviour; and two presenters at the same share were
 * called "most" and "least".
 */
describe("the tools state each figure's own denominator", () => {
  const SHARK = {
    viewer: VIEWERS.developerShark,
    tenantSlug: "shark",
    projectSlug: "shark-residence",
    period: "quarter_to_date" as const,
  };
  const run = async (name: string) => {
    const tool = TOOLS.find((t) => t.name === name);
    if (tool === undefined) throw new Error(`no tool ${name}`);
    return tool.run(SHARK, {});
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /*
   * A model is shown the facts and the limitations, never the draft
   * (`evidenceBlock`), and an answer with a digit it was not shown is
   * discarded (`figuresAreGiven`). So a model rewording the patterns draft must
   * find every figure of it among the facts: the catalogue's share included.
   */
  it("hands a model every figure the most-opened flats' draft states", async () => {
    const result = await run("analyze_unit_attention");
    const shown = [
      ...result.facts.map((f) => `${f.label} ${f.value} ${f.note ?? ""}`),
      ...result.caveats,
    ].join(" ");
    const digits = (text: string) => new Set(text.match(/\d+/g) ?? []);
    const given = digits(shown);
    expect([...digits(result.draft)].filter((run) => !given.has(run))).toEqual([]);
    expect(result.facts[0]?.value).toMatch(/^(All \d+|\d+ of \d+)$/);
    expect(result.facts[0]?.note).toMatch(/^\d+ of the \d+ flats in the catalogue \(\d+%\)$/);
  });

  /*
   * ADR-0060: what changed is Sales Flow's screen of figures, read from the
   * screen's own read model — every figure, its sample and its arrow's words —
   * and every figure the draft states is among the facts a model is shown.
   */
  it("answers what changed with the screen's figures, against 7 days ago", async () => {
    const result = await run("detect_showroom_behavior_changes");
    const { kpis } = (await repository.getShowroomOverview({ ...SHARK, language: "en" })).kpis;
    expect(result.facts.map((f) => [f.label, f.value])).toEqual(
      kpis.map((k) => [k.label, k.display]),
    );
    expect(result.facts[0]?.note).toMatch(/^\d+ of \d+ meetings · /);
    const shown = [
      ...result.facts.map((f) => `${f.label} ${f.value} ${f.note ?? ""}`),
      ...result.caveats,
    ].join(" ");
    const digits = (text: string) => new Set(text.match(/\d+/g) ?? []);
    const given = digits(shown);
    expect([...digits(result.draft)].filter((run) => !given.has(run))).toEqual([]);
  });

  /*
   * ADR-0055: the plan's own figures, the CRM's deal stages, as the Project
   * page states them on the demonstration's day, and every figure of the draft
   * among the facts a model is shown.
   */
  it("answers the sell-out question with the Project page's plan, figure for figure", async () => {
    const result = await run("get_sales_plan");
    const value = (label: string) => result.facts.find((f) => f.label === label)?.value;
    expect([value("Flats"), value("Sold"), value("Reserved"), value("Available")]).toEqual([
      "60",
      "19",
      "13",
      "28",
    ]);
    expect([value("Selling a month"), value("Needed a month"), value("Verdict")]).toEqual([
      "4.7",
      "4.0",
      "On pace",
    ]);
    expect(result.sampleSize).toBe(14);
    expect(result.sources).toEqual(["CRM_OUTCOME_CONTEXT"]);
    const shown = [
      ...result.facts.map((f) => `${f.label} ${f.value} ${f.note ?? ""}`),
      ...result.caveats,
    ].join(" ");
    const digits = (text: string) => new Set(text.match(/\d+/g) ?? []);
    const given = digits(shown);
    expect([...digits(result.draft)].filter((d) => !given.has(d))).toEqual([]);
  });

  it("gives each behaviour rate in the outcomes comparison its own sample", async () => {
    const result = await run("compare_agent_outcomes");
    expect(result.draft).toMatch(/progressed most often \(\d+% of \d+ with an outcome\)/);
    expect(result.draft, result.draft).toMatch(/ in \d+% of their \d+ meetings?, where /);
    expect(result.draft).not.toMatch(/of their meetings/);
    const rates = result.facts.filter((f) => / vs /.test(f.value));
    expect(rates.length).toBeGreaterThan(0);
    for (const fact of rates) expect(fact.note ?? "").toMatch(/, of \d+ and \d+ meetings/);
  });

  it("keeps the read model's own note on a behaviour row", async () => {
    const original = repository.getPresentationIntelligence.bind(repository);
    vi.spyOn(repository, "getPresentationIntelligence").mockImplementation(async (q, pair) => {
      const view = await original(q, pair);
      if (view.comparison === null) return view;
      const differences = view.comparison.differences.map((d, i) =>
        i === 0 ? { ...d, note: "Timed meetings only." } : d,
      );
      return { ...view, comparison: { ...view.comparison, differences } };
    });
    const result = await run("compare_agent_outcomes");
    expect(result.facts.some((f) => (f.note ?? "").endsWith("· Timed meetings only."))).toBe(true);
    /* The narrowed count is not the presenter's meetings, and the sentence says so. */
    expect(result.draft).toMatch(
      / in \d+% of the \d+ of their meetings that could answer it, where /,
    );
  });

  it.each(["compare_agent_flows", "compare_meeting_cohorts"])(
    "gives every behaviour row in %s its own two counts",
    async (name) => {
      const tool = TOOLS.find((t) => t.name === name);
      const roster = await rosterOf("shark", "shark-residence");
      const args =
        name === "compare_agent_flows"
          ? { leftAgentId: roster[0]?.agentId, rightAgentId: roster[1]?.agentId }
          : {};
      if (tool === undefined) throw new Error(`no tool ${name}`);
      const result = await tool.run(SHARK, args);
      const rates = result.facts.filter((f) => / vs /.test(f.value));
      expect(rates.length).toBeGreaterThan(0);
      for (const fact of rates) expect(fact.note ?? "").toMatch(/^of \d+ and \d+ meetings/);
    },
  );

  it("calls presenters at the same share a tie, not a most and a least", async () => {
    const original = repository.getAgentsView.bind(repository);
    vi.spyOn(repository, "getAgentsView").mockImplementation(async (q) => {
      const view = await original(q);
      return {
        ...view,
        agents: view.agents.map((a) => ({ ...a, ring: { ...a.ring, progressedShare: 0.5 } })),
      };
    });
    const result = await run("compare_agent_outcomes");
    expect(result.draft).toMatch(
      /same share of their meetings with a recorded outcome: [^.]+ 50% of \d+(, [^.]+ 50% of \d+)+\. None ranks/,
    );
    expect(result.draft).not.toMatch(/most often|least/);
  });

  it("names whoever shares the top share beside the presenter called most", async () => {
    const original = repository.getAgentsView.bind(repository);
    vi.spyOn(repository, "getAgentsView").mockImplementation(async (q) => {
      const view = await original(q);
      return {
        ...view,
        agents: view.agents.map((a, i) => ({
          ...a,
          ring: { ...a.ring, progressedShare: i < 2 ? 0.8 : 0.3 + i * 0.05 },
        })),
      };
    });
    const result = await run("compare_agent_outcomes");
    expect(result.draft).toMatch(/most often \(80% of \d+ with an outcome, level with [^)]+\)/);
  });

  it("states the cohorts and the placed sales against their totals", async () => {
    const cohorts = await run("compare_meeting_cohorts");
    for (const label of ["Progressed further", "Did not progress"]) {
      const fact = cohorts.facts.find((f) => f.label === label);
      expect(fact?.value).toMatch(new RegExp(`^\\d+ of ${cohorts.sampleSize} with an outcome$`));
    }
    const sales = await run("analyze_iris_assisted_sales");
    for (const label of ["Shown earlier than the window", "Not opened in IRIS before the date"]) {
      const fact = sales.facts.find((f) => f.label === label);
      expect(fact?.value).toMatch(new RegExp(`^\\d+ of ${sales.sampleSize} dated sales$`));
    }
    /* The unplaced sales are counted beside the dated ones, so against both together. */
    const unplaced = sales.facts.find((f) => f.label === "Sales that cannot be placed");
    if (unplaced !== undefined) expect(unplaced.value).toMatch(/^\d+ of \d+ sales$/);
    /* Asked beside unit attention, the sales are said to be the project's, not a unit's. */
    expect(sales.caveats.join(" ")).toMatch(/whole project's dated sales/);
  });
});

/*
 * WITHOUT A MODEL THE ANSWER IS ENGLISH, AND SAYS SO TO A READER WHO ASKED IN ANOTHER LANGUAGE.
 *
 * It used to answer a Slovak question in English without a word, which reads
 * as answering a different question. Language is told by the question's words,
 * never by its letters alone: an English question names Viktória and Zsófia.
 */
describe("a question asked in another language, without a model", () => {
  const NOTE = "Answered in English; typed answers in other languages need a language model. ";
  const ROSTER = [
    { agentId: "agt_a", name: "Zsófia Bárány" },
    { agentId: "agt_b", name: "Marek Dvořák" },
  ];

  const UNREAD =
    "This question was not read: a question in another language needs a language model. The period summary follows. ";

  /*
   * Nothing in these reaches an analysis without a model, and the period
   * summary they fall to is not their answer: they are told it was not read.
   */
  it.each([
    "Ktorý agent mal najviac stretnutí?",
    "Ktory agent mal najviac stretnuti?",
    "Melyik egység kapja a legtöbb figyelmet?",
    "Welche Einheiten bekommen die größte Aufmerksamkeit?",
  ])("says first that it did not read the question: %s", async (question) => {
    expect(isEnglishQuestion(question, ROSTER)).toBe(false);
    const outcome = await ask(question, CONTEXT, NO_KEY);
    expect(outcome.answer?.answer.startsWith(UNREAD), outcome.answer?.answer).toBe(true);
  });

  it("says first that it answered in English where the router read the question", async () => {
    const question = "Ktoré byty majú najväčšiu attention?";
    expect(isEnglishQuestion(question, ROSTER)).toBe(false);
    const outcome = await ask(question, CONTEXT, NO_KEY);
    expect(outcome.toolsUsed).toEqual(["analyze_unit_attention"]);
    expect(outcome.answer?.answer.startsWith(NOTE), outcome.answer?.answer).toBe(true);
  });

  it.each([
    "Prepare me for Viktória's meeting.",
    "Compare Zsófia Bárány and Marek Dvořák.",
    "Which units draw the most attention, and do they convert?",
    "Lena vs Iva?",
    /* A buyer or a place with accents is a name, not another language. */
    "Brief me on Viktória Halász",
    "Show Viktória Halász's journey",
    "How is Ľubomíra Ďuricová doing?",
    "Brief me on Ľubomíra Ďuricová",
    "Is A-101 at Želiezovce popular?",
  ])("reads as English, and adds no note: %s", async (question) => {
    expect(isEnglishQuestion(question, ROSTER)).toBe(true);
    const outcome = await ask(question, { ...CONTEXT, roster: ROSTER }, NO_KEY);
    expect(outcome.answer?.answer ?? "").not.toMatch(/Answered in English|was not read/);
  });

  it.each(["Prečo klesol záujem o porovnanie?", "Miért csökkent az érdeklődés?"])(
    "answers a why in another language as a why: %s",
    async (question) => {
      const outcome = await ask(question, CONTEXT, NO_KEY);
      expect(outcome.answer?.interpretation).toMatch(/cannot establish why/i);
    },
  );
});

/*
 * THE COMPOSED ANSWER IS THE READ MODELS' SENTENCES, NOT A CHATBOT'S.
 *
 * It opened "Here is what I found." under a "Read models" byline, said "I
 * could not find measured evidence" when empty, and was cut at character 600,
 * mid-figure if need be.
 */
describe("the composed answer speaks as the read models", () => {
  const draftOf = (sentences: number): ToolResult => ({
    tool: "summarize_showroom_period",
    facts: [],
    sources: ["IRIS_SHOWROOM_OBSERVED"],
    evidence: null,
    sampleSize: 40,
    caveats: [],
    action: null,
    draft: Array.from(
      { length: sentences },
      (_, i) => `Section ${i + 1} was reached in ${i + 10} meetings.`,
    ).join(" "),
  });

  it("starts with the measured sentences", async () => {
    const outcome = await ask(
      "Which IRIS sections are being skipped most frequently?",
      CONTEXT,
      NO_KEY,
    );
    expect(outcome.answer?.answer).not.toMatch(/here is what i found|^I /i);
    const one = draftOf(2);
    expect(composeDeterministic([one], bundlesFor([one], CONTEXT), CONTEXT).answer).toBe(one.draft);
  });

  it("says plainly when nothing was measured", () => {
    expect(composeDeterministic([], [], CONTEXT).answer).toBe(
      "No measured evidence for this in Northgate, quarter to date.",
    );
  });

  it("stops at a sentence boundary under the ceiling", () => {
    const long = draftOf(40);
    const { answer } = composeDeterministic([long], bundlesFor([long], CONTEXT), CONTEXT);
    expect(answer.length).toBeLessThanOrEqual(600);
    expect(answer.endsWith("meetings.")).toBe(true);
    expect(long.draft.startsWith(answer)).toBe(true);
  });

  it("names the sample in the unit its analysis counts", async () => {
    const outcome = await ask("Did IRIS assist the sales on this project?", CONTEXT, NO_KEY);
    expect(outcome.answer?.headline).toMatch(/^Measured across \d+ dated sales?$/);
  });
});
