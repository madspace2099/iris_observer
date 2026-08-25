import { NextResponse } from "next/server";

import { ask, type ObserverOutcome } from "@/lib/ai/agent";
import { gate, redactStatus } from "@/lib/ai/gate";
import { LIMITS } from "@/lib/ai/limits";
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

/** Telemetry, without the answer, the question or anything a person said. */
export function reportOutcome(outcome: ObserverOutcome, subject: string, startedAt: number): void {
  recordAsk({
    subject,
    outcome:
      outcome.answer !== null
        ? "answered"
        : outcome.status.live
          ? "refused"
          : outcome.status.provider === "openai"
            ? "misconfigured"
            : "unavailable",
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
  const admitted = await gate(await request.json().catch(() => null));

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

  reportOutcome(outcome, admitted.subject, started);

  return NextResponse.json(publicOutcome(outcome), {
    // An answer is a function of the question, the viewer and the period. None
    // of that survives a shared cache.
    headers: { "Cache-Control": "no-store" },
  });
}
