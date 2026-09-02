import "server-only";

import type { ModelUsage } from "./provider";

/**
 * What a question cost, and how long it took.
 *
 * Deliberately anaemic. Telemetry about a language model is the easiest place
 * in a product to accumulate a transcript nobody meant to keep: log the prompt
 * "for debugging", log the answer "for quality", and a year later there is a
 * searchable archive of what every sales team asked about every buyer.
 *
 * So this records numbers and identifiers and nothing else. **No prompt, no
 * answer, no question, no tool arguments, no tool output, no viewer name, no
 * project name.** A test asserts the shape, because the pressure to add "just
 * the first line of the question" arrives eventually and should fail a build.
 */

export interface AskTelemetry {
  /** Hashed. See identity.ts — never a user id. */
  readonly subject: string;
  readonly outcome: "answered" | "refused" | "unavailable" | "misconfigured";
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort: string;
  /** Names only. Arguments are not recorded. */
  readonly tools: readonly string[];
  readonly toolCalls: number;
  readonly turns: number;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly truncated: boolean;
  /** Set when the answer failed its own validation. A quality signal. */
  readonly schemaRejected: boolean;
}

/**
 * Adds two usage readings.
 *
 * A question can take several turns — one per tool round — and the interesting
 * number is what the whole question cost, not what its last turn cost.
 */
export function addUsage(left: ModelUsage | null, right: ModelUsage | null): ModelUsage | null {
  if (left === null) return right;
  if (right === null) return left;
  const sum = (a: number | null, b: number | null): number | null =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  return {
    inputTokens: sum(left.inputTokens, right.inputTokens),
    outputTokens: sum(left.outputTokens, right.outputTokens),
    reasoningTokens: sum(left.reasoningTokens, right.reasoningTokens),
  };
}

/**
 * Emits one line per question.
 *
 * `console.info` rather than a telemetry vendor, because this milestone has no
 * observability platform and inventing one here would be scope nobody asked
 * for. The shape is what matters: whatever collector arrives later reads these
 * fields, and none of them is sensitive.
 */
export function recordAsk(telemetry: AskTelemetry): void {
  console.info(
    `[observer.ask] ${JSON.stringify({
      subject: telemetry.subject,
      outcome: telemetry.outcome,
      provider: telemetry.provider,
      model: telemetry.model,
      effort: telemetry.reasoningEffort,
      tools: telemetry.tools,
      toolCalls: telemetry.toolCalls,
      turns: telemetry.turns,
      latencyMs: telemetry.latencyMs,
      inputTokens: telemetry.inputTokens,
      outputTokens: telemetry.outputTokens,
      reasoningTokens: telemetry.reasoningTokens,
      truncated: telemetry.truncated,
      schemaRejected: telemetry.schemaRejected,
    })}`,
  );
}
