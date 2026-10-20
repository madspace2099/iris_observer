import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { VIEWERS } from "@observer/synthetic";
import { ask, namedAgents, routeQuestion, type AskContextInput } from "../src/lib/ai/agent";
import { LIVE_QUESTIONS } from "../src/components/ask-iris/live-questions";
import { rosterOf } from "./support/roster";
import type { ModelGrant } from "../src/lib/ai/provider";
import { TOOLS, TOOL_NAMES } from "../src/lib/ai/tools";
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

  it("reads the sections reached beside how the meetings that did not progress differ", () => {
    expect(routes(LIVE_QUESTIONS[2] as string)).toEqual([
      "compare_meeting_cohorts",
      "analyze_feature_usage",
    ]);
  });

  it("reads unit attention beside the sales that followed a showing", () => {
    expect(routes(LIVE_QUESTIONS[3] as string)).toEqual([
      "analyze_unit_attention",
      "analyze_iris_assisted_sales",
    ]);
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
  });

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
    expect(result.draft).toMatch(/same share of their meetings, 50% each/);
    expect(result.draft).not.toMatch(/most often|least/);
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
    /* Asked beside unit attention, the sales are said to be the project's, not a unit's. */
    expect(sales.caveats.join(" ")).toMatch(/whole project's dated sales/);
  });
});
