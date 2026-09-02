import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { NotPermittedError } from "@observer/readmodels";

import { currentAccount, currentViewer } from "@/lib/session";
import { repository } from "@/lib/repository";
import { LIMITS, checkAllowance, recordAttempt, type RefusalReason } from "./limits";
import { admitAiRequest, auditClientFingerprint, clientFingerprint } from "./quota";
import {
  PSEUDONYM_VERSION,
  describePepper,
  pseudonymKeyId,
  safetyIdentifier,
  telemetrySubject,
} from "./identity";
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
  /**
   * A model for THIS question only, overriding the account's preference.
   *
   * A string here is a request, not a permission: it is validated against the
   * catalogue and then checked against what this account actually holds, so a
   * reader cannot name a model whose provider they have not connected — or one
   * the provider has already told them they cannot reach.
   */
  model: z.string().max(64).nullable().default(null),
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
  /*
   * The ceiling itself failed, and the reader is told the truth about it
   * without being handed an operator's diagnosis: no database name, no
   * variable, no status code. What they need is that it is brief, that it is
   * not their fault, and that the figures they came for are still there.
   */
  ceiling_unavailable:
    "Observer cannot take questions for a moment. Every measured figure on this screen is unaffected — try the question again shortly.",
  /*
   * Not a ceiling, and deliberately not phrased like one.
   *
   * "Try again in a moment" is the wrong instruction here: retrying is what
   * produced the second arrival. This request already has an answer on its way
   * or already delivered, and the reader is told that rather than being invited
   * to duplicate it again.
   */
  duplicate_request: "Observer is already answering this question.",
  /*
   * Unreachable from this codebase, and therefore worth a sentence of its own
   * rather than a shrug. The database refused an admission whose pseudonym
   * scheme and audit hash described different things; retrying cannot fix it.
   */
  invalid_admission:
    "Observer cannot take this question. Every measured figure on this screen is unaffected.",
} as const;

/**
 * A repeat is a conflict, not a rate limit.
 *
 * 429 tells a client to back off and retry, which is precisely wrong for a
 * request the server has already accepted once — and any sensible client
 * library will act on it. 409 says what actually happened.
 */
function sharedRefusalStatus(reason: keyof typeof SHARED_REFUSAL_TEXT): number {
  if (reason === "duplicate_request") return 409;
  // Nothing the caller sends can fix it, and nothing about the request was
  // wrong. 500 is the honest code for a server that refused itself.
  if (reason === "invalid_admission") return 500;
  return 429;
}

/** A request that passed every check. The audit and telemetry both read it. */
export type Admitted = Extract<GateResult, { readonly ok: true }>;

export type GateResult =
  | {
      readonly ok: true;
      readonly question: string;
      readonly context: AskContextInput;
      /** The hashed telemetry subject. Also the shared ceiling's bucket key. */
      readonly subject: string;
      /** Opaque, salted, never an address. Carried for the audit record. */
      readonly clientHash: string;
      /**
       * The audit row this request already has.
       *
       * Admission wrote it. The route closes it with a terminal result, and a
       * request that never gets that far stays visible as `started` — which is
       * the whole reason the id is minted before the database is called rather
       * than handed back by it.
       */
      readonly requestId: string;
      /**
       * WHOSE OPENAI CONNECTION THIS REQUEST MAY USE.
       *
       * The account identifier, not a key. It is not a secret — it is the
       * cookie's own subject — and it is carried so the route can ask the
       * credential service for that account's key at the last possible moment,
       * on the server, immediately before the model is built.
       *
       * The key itself is deliberately NOT on this object. `admittedHeaders`
       * takes the whole `Admitted` and turns it into response headers; a
       * secret sitting on the same record is one careless spread away from the
       * wire.
       */
      readonly accountId: string;
      /** The per-question model the caller asked for, unvalidated. */
      readonly modelOverride: string | null;
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
 * The header that names the audit row this response belongs to.
 *
 * ## Why it exists
 *
 * Verifying that a deployment writes the audit row it is supposed to write
 * means finding that row afterwards. The deployed `3f298a6` build returns its
 * request id nowhere, so its verification has to correlate on a time window
 * plus properties the operator controlled — which establishes that exactly one
 * matching row exists and nothing else was written, but is not the same claim
 * as *this row came from that request*.
 *
 * This closes the gap for every build from here on. One header, the same UUID
 * admission already wrote, and the row is found by primary key.
 *
 * ## What it is safe to expose
 *
 * A v4 UUID minted by `randomUUID()` in this process. It is not derived from
 * the viewer, the tenant, the pepper or any key; it is not a session token and
 * grants nothing. The caller cannot influence it — admission mints it — so
 * echoing it back tells the caller only which row its own request created.
 *
 * ## When it must and must not appear
 *
 * Only after admission has succeeded, because only then does a row exist. A
 * refusal — unauthenticated, malformed, over the ceiling, misconfigured
 * pepper — writes nothing, and a header pointing at a row that does not exist
 * would be worse than no header at all.
 */
export const REQUEST_ID_HEADER = "X-Observer-Request-Id";

/**
 * Response headers for an admitted request.
 *
 * Takes the whole `Admitted` rather than a string, so the header cannot be
 * attached to a response that has no admission behind it — the type is the
 * enforcement.
 */
export function admittedHeaders(admitted: Admitted): Record<string, string> {
  return { [REQUEST_ID_HEADER]: admitted.requestId };
}

/**
 * Authenticates, validates, authorises and meters one request.
 *
 * Returns either a fully-resolved context — with the project and period already
 * resolved *through the repository port*, which is what makes tenant and
 * project authorisation a property of the data layer rather than a check
 * somebody remembered to write — or a refusal with the status to send.
 */
/*
 * The request is mandatory, and that is a privacy fix rather than tidiness.
 *
 * It was optional, and the absent branch stored the literal string "unknown" as
 * the durable audit client hash. That value is identical in every tenant, which
 * is precisely the cross-tenant linkable identifier the scoping work exists to
 * remove — reintroduced by a fallback nobody looked at. Both production callers
 * always had a `Request`; only the parameter's type said otherwise.
 */
export async function gate(rawBody: unknown, request: Request): Promise<GateResult> {
  /* 1. authentication */
  const viewer = await currentViewer();
  if (viewer === null) return deny(401, "Not signed in.", null);

  /*
   * 1a. who is asking, as an account.
   *
   * The viewer says what may be seen; the account says whose OpenAI connection
   * pays for the answer. They are resolved from the same signed cookie and are
   * still two different questions — which is the distinction M0.1 introduced
   * and this milestone spends.
   */
  const account = await currentAccount();
  if (account === null) return deny(401, "Not signed in.", null);

  /*
   * 1b. the pseudonym key, before anything is spent.
   *
   * Every subject and client fingerprint is an HMAC under this key, and there
   * is no fallback: a deployment without 32 bytes of random secret in
   * `OBSERVER_SUBJECT_PEPPER` cannot produce a bucket key that means anything.
   *
   * It is checked *here*, third statement of the gate, so that a misconfigured
   * deployment refuses before the quota is consulted, before an audit row is
   * written and before any model is called. Discovering it further down would
   * mean an exception somewhere between those three, and a request that had
   * already spent something.
   *
   * The reader gets the same sentence as any other unavailability. The
   * operator gets the reason, by name, in the server log — and the log line
   * carries the problem, never the value.
   */
  const pepper = describePepper();
  if (!pepper.ok) {
    console.warn(
      `[observer.gate] refusing every question — OBSERVER_SUBJECT_PEPPER ${pepper.problem}`,
    );
    return deny(503, SHARED_REFUSAL_TEXT.ceiling_unavailable, 30);
  }

  /* 2. shape */
  const body = AskBodySchema.safeParse(rawBody);
  // The schema's own message can echo the input back. A fixed string cannot.
  if (!body.success) return deny(400, "Malformed request.", null);

  /* 3. authorisation — tenant, project and role, enforced by the port */
  let projectLabel: string;
  let periodLabel: string;
  /**
   * The canonical tenant, from the port that authorised it.
   *
   * Not `body.data.tenantSlug`. The pseudonyms below are scoped by this value,
   * and a caller who chooses the scoping input chooses not to be scoped — two
   * spellings of one slug would be two namespaces, and a slug the viewer has no
   * grant on would be a namespace they picked. The repository has already
   * refused anything they may not see by the time this is assigned.
   */
  let tenantId: string;
  let agentIds: readonly string[];
  try {
    const resolved = await repository.resolveProject(
      viewer,
      body.data.tenantSlug,
      body.data.projectSlug,
    );
    projectLabel = resolved.project.name;
    tenantId = String(resolved.tenant.id);

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
  /*
   * Two client identifiers, and only one of them is kept.
   *
   * The global one keys the per-client hourly ceiling — catching one browser
   * across two tenants is that ceiling's whole purpose. The tenant-scoped one
   * is what the durable audit row stores, so the table cannot be used to follow
   * a browser between customers.
   */
  const clientHash = clientFingerprint(request);
  const auditClientHash = auditClientFingerprint(request, tenantId);

  /*
   * One id, generated here, carried to the end.
   *
   * Admission and the terminal result are two calls to the database, and
   * without a shared key the second cannot find what the first wrote. It is
   * generated before the call rather than returned by it so that a retried
   * admission is recognisably the same request instead of a second one.
   */
  const requestId = randomUUID();

  /*
   * The keyed, tenant-scoped subject — not the user id, and not a viewer-only
   * hash either.
   *
   * These buckets were keyed by `viewer.userId` while the audit recorded a
   * digest of it, so the two could not be joined and the raw id sat in a table
   * meant to hold nothing identifying. Then the digest was viewer-only, so one
   * agent working for two developers wrote the same subject into both tenants'
   * rows. It is now an HMAC over the canonical tenant *and* the viewer: stable
   * across instances, which the shared ceiling needs, and different in every
   * tenant, which the audit needs.
   */
  const subject = telemetrySubject(viewer.userId, tenantId);

  const shared = await admitAiRequest({
    requestId,
    keyId: pseudonymKeyId(),
    pseudonymVersion: PSEUDONYM_VERSION,
    session: subject,
    clientHash,
    auditClientHash,
    tenantSlug: body.data.tenantSlug,
    projectSlug: body.data.projectSlug,
    viewerRole: viewer.role,
    questionChars: body.data.question.length,
  });
  if (!shared.allowed) {
    return deny(
      sharedRefusalStatus(shared.reason),
      SHARED_REFUSAL_TEXT[shared.reason],
      // A duplicate has nothing to wait for; a ceiling does.
      shared.reason === "duplicate_request" || shared.reason === "invalid_admission"
        ? null
        : shared.retryAfterSeconds,
    );
  }

  /* 6. the meter, only once the request is going to happen */
  recordAttempt(viewer.userId);

  return {
    ok: true,
    question: body.data.question,
    subject,
    requestId,
    clientHash,
    accountId: account.accountId,
    modelOverride: body.data.model,
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
