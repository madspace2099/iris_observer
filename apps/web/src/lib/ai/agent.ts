import "server-only";
import { z } from "zod";
import {
  isShowroomRooted,
  isUngroundedInterpretation,
  type InsightSource,
} from "@observer/contracts";
import { NotPermittedError, type EvidenceRef } from "@observer/readmodels";
import { resolveProvider, type ProviderStatus } from "./provider";
import { TOOL_NAMES, TOOLS, toolByName, toolCatalogue, type ToolContext, type ToolFact, type ToolResult } from "./tools";

/**
 * Ask Observer.
 *
 * The controlled architecture the product requires, in five stages:
 *
 *   1. the model picks one or more approved tools and their arguments;
 *   2. the server validates that choice against a schema;
 *   3. deterministic tools compute the result from Observer read models;
 *   4. the model explains what came back, and only what came back;
 *   5. the application renders the evidence itself, beside the prose.
 *
 * The model never sees a database, never writes a figure, and never decides
 * what counts as evidence. If every stage but the last fails, the reader still
 * gets facts with their provenance; if the last fails, they get the draft the
 * tool wrote. There is no path on which prose appears without evidence under it.
 */

/* --- the answer ------------------------------------------------------------- */

export interface AskAnswerSection {
  readonly observed: readonly ToolFact[];
  readonly interpretation: string;
  readonly recommendation: string | null;
  readonly limitations: readonly string[];
  readonly confidence: "high" | "moderate" | "low";
  readonly dataCompleteness: string;
  readonly evidence: readonly EvidenceRef[];
  readonly sources: readonly InsightSource[];
  readonly action: { readonly label: string; readonly href: string } | null;
}

export interface AskOutcome {
  readonly question: string;
  readonly answer: AskAnswerSection | null;
  readonly refusal: string | null;
  readonly toolsUsed: readonly string[];
  readonly status: ProviderStatus;
}

/* --- stage 1: planning ------------------------------------------------------ */

const PlanSchema = z.object({
  calls: z
    .array(
      z.object({
        tool: z.string(),
        args: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(3),
});

const PLANNER_SYSTEM = `You route questions about a real-estate showroom analytics product to typed analysis tools.

You do not answer questions. You do not calculate anything. You return JSON only.

Return exactly: {"calls":[{"tool":"<name>","args":{...}}]}

Rules:
- Use only tools from the catalogue. At most three calls.
- Arguments must match the named parameters exactly. Omit any you do not know.
- If no tool fits, return {"calls":[]}.
- Never invent a tool, an argument name, an id or a figure.`;

function planPrompt(question: string, context: AskContextInput): string {
  const fallback = fallbackPlan(question, context);
  return `Tool catalogue:
${toolCatalogue()}

Known agent ids: ${context.agentIds.join(", ")}
Selected unit: ${context.unitCode ?? "none"}
Selected meeting: ${context.meetingId ?? "none"}

Question: ${question}

<plan>${JSON.stringify(fallback)}</plan>

Return the JSON object now.`;
}

export interface AskContextInput extends ToolContext {
  readonly agentIds: readonly string[];
  readonly unitCode: string | null;
  readonly meetingId: string | null;
}

/**
 * The plan used when there is no live model, and the hint given to one that is.
 *
 * Keyword routing rather than a model call, so the assistant answers the ten
 * required questions with or without a provider. It is deliberately visible in
 * the prompt: a live model that agrees simply confirms it, and one that
 * disagrees has to produce a valid alternative that survives validation.
 */
function fallbackPlan(question: string, context: AskContextInput): z.infer<typeof PlanSchema> {
  const q = question.toLowerCase();
  const [first = "agt_monika", second = "agt_akhilesh"] = context.agentIds;

  const named = context.agentIds.filter((id) => q.includes(id.replace("agt_", "")));

  /*
   * Order matters. These patterns overlap, and the specific reading has to be
   * tested before the broad one: "what should this agent change in the next
   * meeting" contains "change", and "which functions appear before visitors
   * shortlist an apartment" contains "apartment". A router that checks the
   * broad pattern first answers a different question from the one asked.
   */
  if (/should .* change|coach|improve|advice|do differently|next meeting/.test(q)) {
    return {
      calls: [
        { tool: "compare_agent_flows", args: { leftAgentId: named[0] ?? first, rightAgentId: named[1] ?? second } },
        { tool: "compare_meeting_cohorts", args: {} },
      ],
    };
  }
  if (/before .*(shortlist|favourit|favorit)|shortlist before|precede/.test(q)) {
    return { calls: [{ tool: "analyze_feature_usage", args: {} }] };
  }
  if (/prepare|brief|meeting with|ahead of the meeting/.test(q)) {
    return context.meetingId === null
      ? { calls: [{ tool: "summarize_showroom_period", args: {} }] }
      : { calls: [{ tool: "prepare_meeting", args: { meetingId: context.meetingId } }] };
  }
  if (/compare|versus| vs |difference|differ/.test(q) && /agent|monika|akhilesh|ján|jan|lucia|present/.test(q)) {
    return {
      calls: [
        {
          tool: "compare_agent_flows",
          args: { leftAgentId: named[0] ?? first, rightAgentId: named[1] ?? second },
        },
      ],
    };
  }
  if (/successful|progress|common|closed|convert|cohort|went further/.test(q)) {
    return { calls: [{ tool: "compare_meeting_cohorts", args: {} }] };
  }
  if (/step by step|this meeting|develop|replay|journey/.test(q)) {
    return context.meetingId === null
      ? { calls: [{ tool: "summarize_showroom_period", args: {} }] }
      : { calls: [{ tool: "explain_meeting_journey", args: { meetingId: context.meetingId } }] };
  }
  if (/weather|time of day|golden|evening|environment|preset/.test(q)) {
    return { calls: [{ tool: "analyze_environment_usage", args: {} }] };
  }
  if (/skip|skipped|never opened|coverage|section|feature|shortlist before/.test(q)) {
    return { calls: [{ tool: "analyze_feature_usage", args: {} }] };
  }
  if (/apartment|unit|a-\d|b-\d|c-\d|interest in/.test(q)) {
    const match = /\b([abc]-\d{3})\b/i.exec(question);
    return {
      calls: [
        {
          tool: "analyze_unit_attention",
          args: match?.[1] === undefined ? {} : { unitCode: match[1].toUpperCase() },
        },
      ],
    };
  }
  if (/change|changed|month|this month|trend|moved/.test(q)) {
    return { calls: [{ tool: "detect_showroom_behavior_changes", args: {} }] };
  }
  return { calls: [{ tool: "summarize_showroom_period", args: {} }] };
}

/* --- stage 4: composition ---------------------------------------------------- */

const WRITER_SYSTEM = `You write one short paragraph explaining analytics evidence for a real-estate sales team.

Absolute rules:
- Use ONLY the figures given to you. Never add, round, estimate or invent a number.
- Never claim causation. Never write "because", "caused", "drives", "leads to", "results in" or "due to" about a relationship between behaviours and outcomes. Say "associated with", "alongside", or "in this sample".
- Always keep the sample size in the sentence when you state a comparison.
- Never infer anything about a person's income, family, health, ethnicity or intent beyond what the evidence states.
- Two to four sentences. Plain language. No headings, no bullet points, no preamble.`;

/** Words that would turn an association into a claim the product must not make. */
const CAUSAL_PATTERNS =
  /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves|proving)\b/i;

function writerPrompt(question: string, results: readonly ToolResult[]): string {
  const evidence = results
    .map(
      (r) =>
        `Tool ${r.tool} (n = ${r.sampleSize}):\n` +
        r.facts.map((f) => `  ${f.label}: ${f.value}${f.note === null ? "" : ` (${f.note})`}`).join("\n"),
    )
    .join("\n\n");

  const draft = results.map((r) => r.draft).filter((d) => d.length > 0).join(" ");

  return `Question: ${question}

Evidence:
${evidence}

Limitations that must not be contradicted:
${results.flatMap((r) => r.caveats).map((c) => `- ${c}`).join("\n") || "- none"}

<draft>${draft}</draft>

Write the paragraph now.`;
}

/* --- the loop ---------------------------------------------------------------- */

export async function ask(question: string, context: AskContextInput): Promise<AskOutcome> {
  const trimmed = question.trim();
  const { provider, status } = resolveProvider();

  if (trimmed.length === 0) {
    return { question, answer: null, refusal: "Ask a question about what happened inside IRIS.", toolsUsed: [], status };
  }

  /* 1. plan */
  let plan = fallbackPlan(trimmed, context);
  if (status.live) {
    try {
      const raw = await provider.complete({
        system: PLANNER_SYSTEM,
        prompt: planPrompt(trimmed, context),
        temperature: 0,
        maxTokens: 300,
      });
      const json = /\{[\s\S]*\}/.exec(raw.text)?.[0];
      if (json !== undefined) {
        const parsed = PlanSchema.safeParse(JSON.parse(json));
        // 2. validate. An unknown tool name is discarded rather than trusted;
        // the model does not get to widen its own surface.
        if (parsed.success) {
          const calls = parsed.data.calls.filter((c) => TOOL_NAMES.includes(c.tool));
          if (calls.length > 0) plan = { calls };
        }
      }
    } catch {
      // A planner that fails falls back to routing. The reader still gets an
      // answer, and the status tells them which path produced it.
    }
  }

  /* 3. execute — deterministic, server-side, read-only */
  const results: ToolResult[] = [];
  let forbidden = false;
  for (const call of plan.calls) {
    const tool = toolByName(call.tool);
    if (tool === undefined) continue;
    const args = tool.input.safeParse(call.args);
    if (!args.success) continue;
    try {
      results.push(await tool.run(context, args.data));
    } catch (error) {
      // A tool the viewer may not run is a different answer from no such tool,
      // and telling a sales agent that no analysis exists when the real reason
      // is that the brief is not theirs to read would be a lie of convenience.
      if (error instanceof NotPermittedError) forbidden = true;
      // Anything else contributes nothing rather than a guess.
    }
  }

  if (results.length === 0) {
    return {
      question: trimmed,
      answer: null,
      refusal: forbidden
        ? "That analysis exists, but this account is not permitted to read it. Pre-meeting briefs are visible to the agent running the meeting and to their manager (ADR-0018)."
        : "Observer has no registered analysis that answers this. It reports on what happened inside the IRIS presentation — sections, units, interactions and how those differ between agents, meetings and periods.",
      toolsUsed: [],
      status,
    };
  }

  const sources = [...new Set(results.flatMap((r) => r.sources))];

  /*
   * ADR-0023, enforced at the boundary.
   *
   * An answer assembled only from CRM outcomes is a CRM report, and an answer
   * that is only interpretation has nothing under it. Both are refused here
   * rather than left to the wording of the prompt.
   */
  if (!isShowroomRooted(sources) || isUngroundedInterpretation(sources)) {
    return {
      question: trimmed,
      answer: null,
      refusal:
        "That can be answered only from CRM outcome data, which Observer treats as context rather than as a subject. Ask about what happened inside the presentation, and the outcome can be used to split it.",
      toolsUsed: results.map((r) => r.tool),
      status,
    };
  }

  /* 4. compose */
  const drafted = results.map((r) => r.draft).filter((d) => d.length > 0).join(" ");
  let interpretation = drafted;

  if (status.live) {
    try {
      const written = await provider.complete({
        system: WRITER_SYSTEM,
        prompt: writerPrompt(trimmed, results),
        temperature: 0.2,
        maxTokens: 400,
      });
      const text = written.text.trim();
      // The model's prose is checked before it is shown. Causal language is
      // rejected outright and the deterministic draft is used instead — a
      // guard, not a request.
      if (text.length > 0 && !CAUSAL_PATTERNS.test(text)) {
        interpretation = text;
      }
    } catch {
      // Keep the draft.
    }
  }

  const totalSample = Math.max(...results.map((r) => r.sampleSize), 0);
  const caveats = [...new Set(results.flatMap((r) => r.caveats))];

  return {
    question: trimmed,
    answer: {
      observed: results.flatMap((r) => r.facts),
      interpretation,
      recommendation: results.find((r) => r.action !== null)?.action?.label ?? null,
      limitations: caveats,
      confidence: totalSample >= 30 ? "high" : totalSample >= 10 ? "moderate" : "low",
      dataCompleteness:
        totalSample === 0
          ? "no meetings in this period"
          : `${totalSample} meeting${totalSample === 1 ? "" : "s"} in ${results.length} analysis${results.length === 1 ? "" : "es"}`,
      evidence: results.flatMap((r) => (r.evidence === null ? [] : [r.evidence])),
      sources: status.live ? [...sources, "AI_INTERPRETATION" as const] : sources,
      action: results.find((r) => r.action !== null)?.action ?? null,
    },
    refusal: null,
    toolsUsed: results.map((r) => r.tool),
    status,
  };
}

export { TOOLS, TOOL_NAMES, CAUSAL_PATTERNS };
