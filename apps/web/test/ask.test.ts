import { beforeAll, describe, expect, it } from "vitest";
import { VIEWERS } from "@observer/synthetic";
import { ask } from "../src/lib/ai/agent";
import { TOOL_NAMES } from "../src/lib/ai/tools";
import { resetEnvironmentCache } from "../src/lib/env";

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

const CONTEXT = {
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  projectLabel: "Northgate",
  periodLabel: "Quarter to date",
  period: "quarter_to_date" as const,
  agentIds: ["agt_monika", "agt_akhilesh", "agt_jan", "agt_lucia"],
  unitCode: null,
  meetingId: null,
  safetyIdentifier: "obs_test",
  depth: "standard" as const,
};

const CAUSAL =
  /\b(because|caused|causes|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;

/** The ten questions from the brief, with the tool each must reach. */
const QUESTIONS: readonly { question: string; tool: string; context?: Partial<typeof CONTEXT> }[] =
  [
    { question: "Compare Monika and Akhilesh's presentation flows.", tool: "compare_agent_flows" },
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
      context: { meetingId: "mtg_ng0100" },
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
      const outcome = await ask(question, { ...CONTEXT, ...context });

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
    const outcome = await ask("Prepare me for the meeting with Viktória.", {
      ...CONTEXT,
      meetingId: "mtg_viktoria0827",
    });
    expect(outcome.answer).toBeNull();
    expect(outcome.refusal).toMatch(/not permitted/i);
  });

  it("refuses a question it has no registered analysis for", async () => {
    const outcome = await ask("What is the weather in Bratislava tomorrow?", CONTEXT);
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
    const outcome = await ask("   ", CONTEXT);
    expect(outcome.answer).toBeNull();
    expect(outcome.refusal).not.toBeNull();
  });

  it("carries a traceable evidence bundle on every answer", async () => {
    const outcome = await ask(
      "Summarize the most important showroom behavior changes this month.",
      CONTEXT,
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
    const outcome = await ask("Which IRIS sections are being skipped most frequently?", CONTEXT);
    expect(outcome.status.provider).toBe("evidence-only");
    expect(outcome.status.live).toBe(false);
    // Without a live model, no interpretation source is claimed — the prose is
    // the tool's own draft, and saying otherwise would misattribute it.
    expect(outcome.sources).not.toContain("AI_INTERPRETATION");
  });

  it("states that this deployment runs on demonstration data", async () => {
    const outcome = await ask("Which IRIS sections are being skipped most frequently?", CONTEXT);
    expect(outcome.demoData).toBe(true);
  });

  it("exposes exactly the tools the product specified", () => {
    expect([...TOOL_NAMES].sort()).toEqual(
      [
        "analyze_environment_usage",
        "analyze_feature_usage",
        "analyze_unit_attention",
        "compare_agent_flows",
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
