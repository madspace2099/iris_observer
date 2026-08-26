import { NextResponse } from "next/server";

import { ask, type ObserverOutcome } from "@/lib/ai/agent";
import { admittedHeaders, gate, redactStatus, type Admitted } from "@/lib/ai/gate";
import { LIMITS } from "@/lib/ai/limits";
import { completeAiRequest, type ResponseSource } from "@/lib/ai/quota";
import { recordAsk } from "@/lib/ai/telemetry";

/**
 * Ask Observer — the single-response route.
 *
 * Server-only by construction: the key, the tools and the read models all live
 * here, and the browser sends a question and a context rather than anything the
 * model could act on. There is no unauthenticated path — a question is answered
 * against the viewer's own grants, exactly like every screen.
 *
 * The streaming route beside this one is what the interface uses. This one
 * stays because a JSON endpoint is far easier to test and to call from
 * somewhere with no `EventSource`, and because both run the same gate and the
 * same pipeline — there is no second implementation to drift.
 */

export const runtime = "nodejs";

/**
 * Who wrote what the reader received — the same fact the answer sheet renders.
 *
 * Four shapes, and the first two were one for as long as this audit existed:
 * `answered` was recorded whenever an answer existed, so prose the deterministic
 * composer wrote was filed under the configured model's name. The screen was
 * already honest about it ("written by the tools"); the durable record was not,
 * and the durable record is the one an operator reads a week later.
 *
 * `modelAuthored` is derived from the same `status.live` the interface reads, so
 * the two cannot disagree by construction. A test asserts it for every branch.
 */
export function classify(outcome: ObserverOutcome): {
  readonly responseSource: ResponseSource;
  readonly modelAuthored: boolean;
} {
  if (outcome.answer !== null) {
    return outcome.status.live
      ? { responseSource: "model", modelAuthored: true }
      : { responseSource: "deterministic_composer", modelAuthored: false };
  }

  /*
   * No answer at all. A refusal is a decision the pipeline made; a failure is
   * one it suffered.
   *
   * Not separated by `status.live`, which was the obvious move and the wrong
   * one: a deployment running evidence-only reports `live: false` for every
   * request, so a policy refusal on it — the CRM-only guard, say — would have
   * been filed as a provider failure and sent an operator hunting an outage
   * that never happened. The misconfiguration is the thing that is genuinely
   * an operator's, and it is the one case that says so in the reason code.
   */
  return outcome.diagnostics.fallbackReason === "provider_misconfigured" || outcome.refusal === null
    ? { responseSource: "failure", modelAuthored: false }
    : { responseSource: "refusal", modelAuthored: false };
}

/** Telemetry, without the answer, the question or anything a person said. */
export async function reportOutcome(
  outcome: ObserverOutcome,
  admitted: Admitted,
  startedAt: number,
): Promise<void> {
  const outcomeKind =
    outcome.answer !== null
      ? "answered"
      : outcome.status.live
        ? "refused"
        : outcome.status.provider === "openai"
          ? "misconfigured"
          : "unavailable";

  const { responseSource, modelAuthored } = classify(outcome);

  recordAsk({
    subject: admitted.subject,
    outcome: outcomeKind,
    provider: outcome.status.provider,
    model: outcome.status.model,
    reasoningEffort: outcome.diagnostics.reasoningEffort,
    tools: outcome.toolsUsed,
    toolCalls: outcome.toolsUsed.length,
    turns: outcome.diagnostics.turns,
    latencyMs: Date.now() - startedAt,
    inputTokens: outcome.diagnostics.usage?.inputTokens ?? null,
    outputTokens: outcome.diagnostics.usage?.outputTokens ?? null,
    reasoningTokens: outcome.diagnostics.usage?.reasoningTokens ?? null,
    truncated: outcome.diagnostics.truncated,
    schemaRejected: outcome.diagnostics.schemaRejected,
  });

  /*
   * The durable half of the same record, and it is awaited.
   *
   * `recordAsk` is in-process and dies with the instance, which is fine for a
   * log line and useless for "how many questions has this demonstration
   * answered today". This one outlives the lambda and carries no content —
   * codes, counts and timings, never a question or an answer.
   *
   * It used to be `void`. A serverless runtime may freeze the instance the
   * moment the response is sent, and an unawaited promise dies with it: the
   * Preview admitted 153 requests and recorded 133. The row itself is no longer
   * at risk — admission writes it inside the quota transaction — but its
   * terminal result is, so the route waits for this before it finishes.
   */
  await completeAiRequest({
    requestId: admitted.requestId,
    // `misconfigured` is an operator's word; the audit table records what the
    // reader got, and they got no model either way.
    outcome: outcomeKind === "misconfigured" ? "unavailable" : outcomeKind,
    responseSource,
    attemptedProvider: outcome.status.provider,
    attemptedModel: outcome.diagnostics.modelAttempted ? outcome.status.model : null,
    modelAttempted: outcome.diagnostics.modelAttempted,
    modelAuthored,
    // Null unless a model wrote the prose. Recording the configured name here
    // is precisely the defect this replaced.
    authorModel: modelAuthored ? outcome.status.model : null,
    fallbackReason: outcome.diagnostics.fallbackReason,
    tools: outcome.toolsUsed,
    toolCalls: outcome.toolsUsed.length,
    inputTokens: outcome.diagnostics.usage?.inputTokens ?? null,
    outputTokens: outcome.diagnostics.usage?.outputTokens ?? null,
    latencyMs: Date.now() - startedAt,
  });
}

/**
 * What the browser is allowed to receive.
 *
 * Built by naming fields rather than by deleting them: a payload assembled by
 * removal grows a leak the first time somebody adds a field upstream.
 */
export function publicOutcome(outcome: ObserverOutcome) {
  return {
    question: outcome.question,
    answer: outcome.answer,
    refusal: outcome.refusal,
    toolsUsed: outcome.toolsUsed,
    sources: outcome.sources,
    demoData: outcome.demoData,
    status: redactStatus(outcome.status),
  };
}

export async function POST(request: Request) {
  const started = Date.now();
  const admitted = await gate(await request.json().catch(() => null), request);

  if (!admitted.ok) {
    return NextResponse.json(
      { error: admitted.message },
      {
        status: admitted.httpStatus,
        headers: {
          "Cache-Control": "no-store",
          ...(admitted.retryAfterSeconds === null
            ? {}
            : { "Retry-After": String(admitted.retryAfterSeconds) }),
        },
      },
    );
  }

  /*
   * The whole question is bounded, not only the upstream call.
   *
   * A planning turn and a composition turn can each sit inside their own
   * timeout and still leave a reader waiting a minute. This ceiling covers the
   * lot, and the client can abort sooner.
   */
  const outcome = await ask(
    admitted.question,
    admitted.context,
    AbortSignal.timeout(LIMITS.requestTimeoutMs * 2),
  );

  await reportOutcome(outcome, admitted, started);

  return NextResponse.json(publicOutcome(outcome), {
    // An answer is a function of the question, the viewer and the period. None
    // of that survives a shared cache.
    //
    // `X-Observer-Request-Id` names the audit row this answer closed — the same
    // UUID admission wrote, on every admitted outcome, model-authored and
    // deterministic fallback alike. The body contract is untouched.
    headers: { "Cache-Control": "no-store", ...admittedHeaders(admitted) },
  });
}
