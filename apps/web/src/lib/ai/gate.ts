import "server-only";
import { z } from "zod";

import { NotPermittedError } from "@observer/readmodels";

import { currentViewer } from "@/lib/session";
import { repository } from "@/lib/repository";
import { LIMITS, checkAllowance, recordAttempt, type RefusalReason } from "./limits";
import { clientFingerprint, consumeSharedQuota } from "./quota";
import { safetyIdentifier, telemetrySubject } from "./identity";
import type { AskContextInput } from "./agent";

/**
 * The gate every Ask Observer request passes through, whichever route it took.
 *
 * One implementation, because the streaming and non-streaming routes must not
 * be able to disagree about who is allowed to ask what. A security control that
 * exists in two places is a security control that exists in one place and a
 * copy that will drift.
 *
 * **The order matters and is asserted by a test.** Authentication, then shape,
 * then authorisation, then allowance, then the meter — so a refused request
 * never costs a tool call, a token or a counter, and an anonymous caller cannot
 * move anybody else's quota.
 */

export const AskBodySchema = z.object({
  question: z.string().min(1).max(LIMITS.maxQuestionChars),
  tenantSlug: z.string().min(1).max(64),
  projectSlug: z.string().min(1).max(64),
  period: z.enum(["quarter_to_date", "last_28_days", "last_quarter", "year_to_date"]),
  unitCode: z.string().max(32).nullable().default(null),
  meetingId: z.string().max(64).nullable().default(null),
  /**
   * The only way to reach high reasoning effort.
   *
   * Explicit, per request, and defaulting to standard — so a deep report is a
   * decision somebody made rather than a side effect of how a question was
   * phrased.
   */
  depth: z.enum(["standard", "deep"]).default("standard"),
});

export type AskBody = z.infer<typeof AskBodySchema>;

/**
 * The one sentence a refused or failed request shows the reader.
 *
 * Deliberately identical whatever went wrong upstream. A quota ceiling, a
 * revoked key and a rate limit are the operator's problem to tell apart, and
 * the server log keeps them apart; to the reader they are the same fact — the
 * interpretation is missing and the measured evidence is not.
 */
export const UNAVAILABLE =
  "AI explanation is temporarily unavailable. Showing computed Observer evidence instead.";

/**
 * What the reader is told when they are asking faster than the demo allows.
 *
 * The open circuit is deliberately absent from this table. A tripped breaker
 * suppresses the *vendor call*, never the request: the tools, the read models
 * and the evidence never needed the network, so the reader still gets an answer
 * — in the tools' own prose — rather than a refusal.
 */
export const REFUSAL_TEXT: Readonly<Record<RefusalReason, string>> = {
  rate_limited: "You are asking faster than this demonstration allows. Try again in a moment.",
  daily_limit: "This account has reached today's question limit for the demonstration.",
  instance_limit: "The demonstration has reached today's question limit.",
  question_too_long: `Questions are limited to ${LIMITS.maxQuestionChars} characters.`,
  model_not_allowed: UNAVAILABLE,
};

/**
 * What the reader is told when a *shared* ceiling stops them.
 *
 * Named for the reader's situation, not for the counter that fired. "The
 * demonstration has answered its questions for today" is a fact somebody can
 * act on; "project daily bucket exhausted" is an implementation detail wearing
 * a sentence.
 */
export const SHARED_REFUSAL_TEXT = {
  rate_limited: "You are asking faster than this demonstration allows. Try again in a moment.",
  hourly_limit: "You have reached this hour's question limit for the demonstration.",
  client_limit: "This device has reached its hourly question limit for the demonstration.",
  daily_budget:
    "The demonstration has answered its questions for today. The measured evidence on every screen is unaffected.",
} as const;

/** A request that passed every check. The audit and telemetry both read it. */
export type Admitted = Extract<GateResult, { readonly ok: true }>;

export type GateResult =
  | {
      readonly ok: true;
      readonly question: string;
      readonly context: AskContextInput;
      readonly subject: string;
      /** Opaque, salted, never an address. Carried for the audit record. */
      readonly clientHash: string;
    }
  | {
      readonly ok: false;
      readonly httpStatus: number;
      readonly message: string;
      readonly retryAfterSeconds: number | null;
    };

function deny(httpStatus: number, message: string, retryAfterSeconds: number | null): GateResult {
  return { ok: false, httpStatus, message, retryAfterSeconds };
}

/**
 * Authenticates, validates, authorises and meters one request.
 *
 * Returns either a fully-resolved context — with the project and period already
 * resolved *through the repository port*, which is what makes tenant and
 * project authorisation a property of the data layer rather than a check
 * somebody remembered to write — or a refusal with the status to send.
 */
export async function gate(rawBody: unknown, request?: Request): Promise<GateResult> {
  /* 1. authentication */
  const viewer = await currentViewer();
  if (viewer === null) return deny(401, "Not signed in.", null);

  /* 2. shape */
  const body = AskBodySchema.safeParse(rawBody);
  // The schema's own message can echo the input back. A fixed string cannot.
  if (!body.success) return deny(400, "Malformed request.", null);

  /* 3. authorisation — tenant, project and role, enforced by the port */
  let projectLabel: string;
  let periodLabel: string;
  let agentIds: readonly string[];
  try {
    const resolved = await repository.resolveProject(
      viewer,
      body.data.tenantSlug,
      body.data.projectSlug,
    );
    projectLabel = resolved.project.name;

    const period = await repository.resolvePeriod(resolved.project.id, body.data.period);
    periodLabel = period.label;

    // The roster comes through the port like everything a surface reads, so it
    // is already scoped to this viewer's grants on this tenant and project.
    const agents = await repository.listAgents({
      viewer,
      tenantSlug: body.data.tenantSlug,
      projectSlug: body.data.projectSlug,
      period: body.data.period,
    });
    agentIds = agents.map((a) => a.agentId);
  } catch (error) {
    /*
     * Forbidden and absent are answered identically.
     *
     * Telling an unauthorised caller that a project exists is telling them
     * something, and a 404-versus-403 difference is an enumeration oracle for
     * tenant slugs.
     */
    if (error instanceof NotPermittedError) return deny(404, "Not found.", null);
    return deny(404, "Not found.", null);
  }

  /* 4. allowance — before a tool, a token or a counter */
  const verdict = checkAllowance(
    viewer.userId,
    body.data.question.length,
    LIMITS.allowedModels[0] ?? "",
  );
  if (!verdict.allowed && verdict.reason !== null) {
    return deny(429, REFUSAL_TEXT[verdict.reason], verdict.retryAfterSeconds);
  }

  /*
   * 5. the shared ceiling
   *
   * The in-process check above refuses the obvious cases without a round trip.
   * This one is the ceiling that actually bounds the bill: every instance of
   * this deployment counts into the same buckets, atomically, so a serverless
   * platform cannot hand each lambda its own budget.
   *
   * Runs last of the checks and before the meter, so a request refused by
   * anything earlier never touches it.
   */
  const clientHash = request === undefined ? "unknown" : clientFingerprint(request);
  const shared = await consumeSharedQuota(
    viewer.userId,
    clientHash,
    `${body.data.tenantSlug}/${body.data.projectSlug}`,
  );
  if (!shared.allowed) {
    return deny(429, SHARED_REFUSAL_TEXT[shared.reason], shared.retryAfterSeconds);
  }

  /* 6. the meter, only once the request is going to happen */
  recordAttempt(viewer.userId);

  return {
    ok: true,
    question: body.data.question,
    subject: telemetrySubject(viewer.userId),
    clientHash,
    context: {
      viewer,
      tenantSlug: body.data.tenantSlug,
      projectSlug: body.data.projectSlug,
      period: body.data.period,
      projectLabel,
      periodLabel,
      agentIds,
      unitCode: body.data.unitCode,
      meetingId: body.data.meetingId,
      depth: body.data.depth,
      safetyIdentifier: safetyIdentifier(viewer.userId, body.data.tenantSlug),
    },
  };
}

/**
 * Strips the operator's sentence out of a status before it is serialised.
 *
 * `status.reason` names the vendor and the failure. An upstream message can
 * quote part of a request back, and the request carries project evidence — so
 * the detail stays in the log and the reader gets the fixed sentence.
 */
export function redactStatus<T extends { live: boolean; reason: string | null }>(status: T): T {
  return { ...status, reason: status.live || status.reason === null ? null : UNAVAILABLE };
}
