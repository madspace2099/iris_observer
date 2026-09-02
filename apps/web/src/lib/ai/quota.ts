import "server-only";

import { createHmac } from "node:crypto";
import { resolveServerSupabase } from "@/lib/supabase-env";
import type { FallbackReason } from "./agent";
import { pseudonymKey, type CurrentPseudonymVersion } from "./identity";
import { LIMITS } from "./limits";

/**
 * The shared ceiling.
 *
 * `limits.ts` counts in the process, which on a serverless platform means one
 * counter per warm instance — a real brake on a single client hitting a single
 * lambda, and no global ceiling at all. A public demonstration needs a number
 * every instance can see, so the authoritative counters live in Postgres and
 * the in-process ones stay as a cheap first line.
 *
 * Both run. The local check refuses the obvious cases without a round trip; the
 * database decides everything that matters, including the daily budget that
 * actually bounds the bill.
 *
 * **Server-only.** `SUPABASE_SECRET_KEY` is read here and never leaves. Nothing
 * in this module is importable from a client component, and a test asserts it.
 */

/* --- who is asking ----------------------------------------------------------- */

/**
 * A stable, opaque identifier for the caller — never an IP address.
 *
 * An address identifies a building, not a person: a sales office behind one
 * connection is one address and a dozen readers, and rate-limiting them as a
 * single caller punishes the busiest customer. It is also personal data this
 * product has no reason to hold.
 *
 * The fingerprint is a keyed HMAC over coarse request properties. It survives
 * a cleared cookie well enough to slow an abusive client, and it cannot be
 * reversed into an address by anybody who does not hold the key.
 */
export function clientFingerprint(request: Request): string {
  return fingerprint(request, "client");
}

/**
 * The client identifier that is written to the durable audit — tenant-scoped.
 *
 * Two values rather than one, because they answer different questions and only
 * one of them may be kept.
 *
 * The GLOBAL fingerprint above keys the per-client hourly ceiling. Catching a
 * single browser hammering two tenants is that ceiling's entire purpose, and a
 * tenant-scoped value cannot do it. It lives only in `ai_rate_buckets`, never
 * in the durable audit.
 *
 * How long it lives there is an operational property, and it is worth stating
 * precisely because two earlier versions of this comment got it wrong.
 *
 * The first said the table "is pruned". `prune_ai_rate_buckets` existed and
 * *nothing called it*: not the ceiling, not admission, no `pg_cron` job, no
 * trigger. Retention was a property of a function nobody invoked.
 *
 * The second said the table was "bounded" because admission had been made to
 * prune. That is opportunistic cleanup, not retention: with no traffic nothing
 * runs, and a fingerprint written on Friday is still there on Monday. Once an
 * hour bounds how often a delete may happen, not how old a row may get.
 *
 * What migration `20260826140000` actually establishes, once applied:
 *
 *   deletion threshold        48 hours
 *   scheduled frequency       hourly, via one `pg_cron` job
 *   expected maximum age      ~49 hours WHILE THE SCHEDULER IS HEALTHY
 *   monitoring                separate, and required
 *   guarantee                 none — a stopped scheduler stops deleting
 *
 * Nothing in this module depends on any of it. Cleanup is not in the request
 * path, so an answer's latency and availability are independent of it.
 *
 * This one goes in `ai_requests`, which is durable. A global value there would
 * let anybody holding the table follow one browser between customers — the same
 * cross-tenant linkability the subject had, arriving by a different column.
 *
 * The tenant argument is the canonical id the repository returned after
 * authorisation, for the same reason it is there: a caller who chooses the
 * scoping input chooses not to be scoped.
 */
export function auditClientFingerprint(request: Request, tenantId: string): string {
  return fingerprint(request, `audit\u0000v2\u0000${tenantId}`);
}

function fingerprint(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const address = forwarded.split(",")[0]?.trim() ?? "";
  const agent = request.headers.get("user-agent") ?? "";
  const language = request.headers.get("accept-language") ?? "";

  /*
   * Keyed, not merely salted — and by the same key the subject uses.
   *
   * A salt prepended to the input of a plain digest is a keyed construction
   * only by accident: it is the length-extension shape, it invites the mistake
   * of logging the salt beside the digest, and it made the *stability* of the
   * key a separate question from its secrecy. `OBSERVER_SESSION_SECRET` was
   * usually unset, so the salt was a per-process UUID — every lambda produced a
   * different fingerprint for the same device, and the per-client hourly
   * ceiling counted a browser once per instance.
   *
   * `pseudonymKey()` answers both: HMAC rather than prefix-and-hash, and a key
   * that is identical across every instance of a deployment. An address is
   * still never stored, and still cannot be recovered from what is.
   */
  /*
   * NUL-separated, not space-separated.
   *
   * A user-agent contains spaces. Joining three fields with one made the input
   * ambiguous: a crafted agent header could produce the same joined string as a
   * different address-agent-language triple, and two distinct clients would
   * share a bucket. A header value cannot contain a NUL, so it cannot be forged
   * into an ambiguity — and it is written as an escape here rather than as a
   * raw byte, because a raw one is invisible in an editor and makes git treat
   * the file as binary. That is not hypothetical; it happened in this codebase.
   */
  return createHmac("sha256", pseudonymKey())
    .update(`${scope}\u0000${address}\u0000${agent}\u0000${language}`)
    .digest("hex")
    .slice(0, 32);
}

/* --- the ceilings ------------------------------------------------------------ */

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const SHARED_LIMITS = {
  /** Per demo session, per rolling minute. */
  perMinute: number("OBSERVER_ASK_PER_MINUTE", 10),
  /** Per demo session, per hour. Catches a slow drip the minute window misses. */
  perHour: number("OBSERVER_ASK_PER_HOUR", 60),
  /** Per client fingerprint, per hour. A new session is not a new person. */
  clientPerHour: number("OBSERVER_ASK_CLIENT_PER_HOUR", 120),
  /**
   * Every question the whole demonstration will answer in a day.
   *
   * The only ceiling that bounds the bill, and the reason this module exists.
   * A per-instance counter cannot express it.
   */
  projectPerDay: number("OBSERVER_ASK_PROJECT_PER_DAY", 500),
} as const;

/* --- the gate ---------------------------------------------------------------- */

export type SharedVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason:
        | "rate_limited"
        | "hourly_limit"
        | "client_limit"
        | "daily_budget"
        /** Configured, and the database could not be reached. See below. */
        | "ceiling_unavailable"
        /**
         * The pseudonym scheme and the audit hash disagreed.
         *
         * Not a ceiling and not a duplicate: the database refused a request
         * whose two halves described different things — a scoped version
         * beside no scoped hash, or a scoped hash identical to the global one.
         * It should be unreachable from this codebase, which is exactly why it
         * is worth hearing about rather than mapping onto a rate limit.
         */
        | "invalid_admission"
        /**
         * This request id has already been admitted.
         *
         * Neither allowed nor refused by a ceiling: it is the same request
         * arriving twice. Nothing is consumed, no second row is written, and
         * no second model call may start.
         */
        | "duplicate_request";
      readonly retryAfterSeconds: number;
    };

/*
 * Which variable holds what is decided in one place, and not here.
 *
 * This module read `SUPABASE_URL` and `SUPABASE_SECRET_KEY` directly while
 * `env.ts` decided separately whether Supabase was "configured". Two lists of
 * names in two files drift, and when they drift a deployment that *is*
 * configured reports that it is not.
 */
function configured(): { readonly url: string; readonly key: string } | null {
  return resolveServerSupabase();
}

/** Whether the shared ceiling is available at all. Reported, never guessed at. */
export function sharedQuotaConfigured(): boolean {
  return configured() !== null;
}

/**
 * Everything the audit needs at the moment a request is let through.
 *
 * All of it is known before any work happens, which is what makes the row
 * writable at admission. Nothing here is content: `questionChars` is the
 * question's *length*, `session` and `clientHash` are keyed pseudonyms,
 * and the two slugs are the tenancy the request named.
 */
export interface Admission {
  /** Generated by the route, stable across a retry, unique in the table. */
  readonly requestId: string;
  /**
   * Which pseudonym key produced the subject and the client hash.
   *
   * Sixteen hex characters of an HMAC of that key — not the key. Stored on the
   * row so a rotation leaves a durable trace: subjects written under a
   * different key cannot be compared with these, and a bucket that "reset for
   * no reason" is explained by a column rather than by a boot line that has
   * since aged out of the platform's log retention.
   */
  readonly keyId: string;
  readonly session: string;
  /** Global. Keys the per-client ceiling; never stored in the audit. */
  readonly clientHash: string;
  /** Tenant-scoped. This is the one the durable row keeps. */
  readonly auditClientHash: string;
  /**
   * Which derivation produced the subject and the scoped hash.
   *
   * `typeof PSEUDONYM_VERSION` — the literal `2`, not `PseudonymVersion`.
   * Version 1 is a fact about rows the database already holds and about the
   * deployed build that keeps writing them; it is not something code written
   * now may emit. Widening this field to `1 | 2` would let a future caller
   * admit under the superseded, cross-tenant linkable derivation and find out
   * at the audit table rather than at the keyboard.
   */
  readonly pseudonymVersion: CurrentPseudonymVersion;
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly viewerRole: string;
  /** The question's length. Never the question. */
  readonly questionChars: number;
}

/**
 * Consumes one unit of every applicable ceiling, atomically.
 *
 * The database runs the check and the increment inside one transaction behind
 * an advisory lock, so two lambdas cannot both read "nine of ten" and both
 * proceed. Counters move only when the request is allowed: a refused request
 * that still spent quota would let somebody exhaust a ceiling they were never
 * permitted to use.
 *
 * ## When the database cannot be reached
 *
 * **The request is refused, and no model is called.** This reversed a decision,
 * so both sides are recorded.
 *
 * It used to fail open: the request proceeded and the in-process limiter still
 * applied. The argument was that a Supabase outage should not disable Ask
 * Observer mid-consultation, and that the vendor-side spend limit sits
 * underneath anyway.
 *
 * The argument against won, and it is the stronger one for a public
 * demonstration. This ceiling exists to bound a bill. A ceiling that removes
 * itself precisely when its enforcement mechanism breaks is not a ceiling — it
 * is a ceiling-shaped assumption, and the outage that disables it is exactly
 * the moment nobody is watching. Failing open also has no *visible* symptom, so
 * a deployment could spend a month unbounded and look identical to one that
 * was fine.
 *
 * The cost is real and stated: an unreachable database now stops Ask Observer
 * answering in a model's words. The reader is told to try again shortly, and
 * **every measured figure on every screen is untouched** — none of them needed
 * the network, which is the property that makes this affordable.
 *
 * A deployment with **no** Supabase configured is a different case and is left
 * alone: nothing promised it a shared ceiling, so nothing is taken away. That
 * is local development and the test suite, not a demonstration URL.
 *
 * ## Why this also writes the audit row
 *
 * Because otherwise the two facts drift, and they did: 153 requests were
 * admitted on the Preview and 133 were recorded. The audit write used to be a
 * separate, unawaited call after the answer, and a serverless route can freeze
 * once it has responded.
 *
 * The database now inserts the `started` row inside the same transaction that
 * consumes the quota, so "admitted" and "audited" are one event rather than two
 * that usually coincide. There is no ordering to get wrong and no promise to
 * lose. What can still happen is that the request is interrupted before its
 * terminal result is written — and that leaves a row reading `started`, which
 * is a fact worth having rather than a silence.
 */
export async function admitAiRequest(admission: Admission): Promise<SharedVerdict> {
  const config = configured();
  if (config === null) return { allowed: true };

  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/admit_ai_request`, {
      method: "POST",
      /*
       * No schema profile header, deliberately.
       *
       * These headers said `observer`, and PostgREST answered 406 on every
       * call — "Invalid schema: observer. Only the following schemas are
       * exposed: public, graphql_public" — so the shared ceiling was never once
       * consumed over the transport the application actually uses. Direct SQL
       * had verified the function and skipped the path entirely.
       *
       * The reachable function is now a `security definer` façade in `public`
       * that does its work inside `observer`. The counters and the audit stay
       * unexposed; only the door is public, and only the secret key opens it.
       */
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_request_id: admission.requestId,
        p_session: admission.session,
        p_client_hash: admission.clientHash,
        p_project: `${admission.tenantSlug}/${admission.projectSlug}`,
        p_per_minute: SHARED_LIMITS.perMinute,
        p_per_hour: SHARED_LIMITS.perHour,
        p_client_per_hour: SHARED_LIMITS.clientPerHour,
        p_project_per_day: SHARED_LIMITS.projectPerDay,
        p_tenant_slug: admission.tenantSlug,
        p_project_slug: admission.projectSlug,
        p_viewer_role: admission.viewerRole,
        p_question_chars: admission.questionChars,
        p_key_id: admission.keyId,
        p_audit_client_hash: admission.auditClientHash,
        p_pseudonym_version: admission.pseudonymVersion,
      }),
      signal: AbortSignal.timeout(Math.min(5_000, LIMITS.requestTimeoutMs)),
    });

    /*
     * A database that answers with an error is a database that did not count
     * this request. Same treatment as one that did not answer at all — and it
     * says so now, because a silent ceiling failure is precisely what hid a 406
     * on every request for as long as this code existed.
     *
     * The status code only. A PostgREST error body can quote the statement
     * back, and this is a log line.
     */
    if (!response.ok) {
      /*
       * The status is the diagnosis, so it is spelled out rather than left as
       * a number to look up. These three have each cost real time on this
       * deployment already: 406 was an unexposed schema, 404 was the wrong
       * project, 401 was a key the project would not accept.
       */
      const meaning =
        response.status === 401 || response.status === 403
          ? ` — ${await describeRejection(response)}`
          : response.status === 404
            ? ` — ${await describeNotFound(response)}`
            : response.status === 406
              ? " — the schema is not exposed to PostgREST"
              : "";
      console.warn(
        `[observer.quota] the shared ceiling refused to count — HTTP ${response.status}${meaning}`,
      );
      return unavailable();
    }

    const rows = (await response.json()) as readonly {
      allowed: boolean;
      reason: string | null;
      retry_after_seconds: number | null;
    }[];

    const verdict = rows[0];
    if (verdict === undefined) return unavailable();
    if (verdict.allowed) return { allowed: true };

    const reason = verdict.reason;

    /*
     * A duplicate is not a ceiling, and must not be answered like one.
     *
     * Falling through to `rate_limited` here would tell the reader to try again
     * in a moment — inviting exactly the retry that produced the duplicate —
     * and would hide the one condition that means two executions believe they
     * own the same request.
     */
    if (reason === "duplicate_request") {
      return { allowed: false, reason: "duplicate_request", retryAfterSeconds: 0 };
    }

    /*
     * A refusal nobody should ever see, said plainly rather than disguised.
     *
     * Retrying cannot fix an incoherent admission, so answering it with a rate
     * limit would invite exactly the wrong response and hide a bug in this
     * process behind a sentence about traffic.
     */
    if (reason === "invalid_admission") {
      console.warn(
        "[observer.quota] the database refused an incoherent admission — the pseudonym scheme and the audit hash disagreed",
      );
      return { allowed: false, reason: "invalid_admission", retryAfterSeconds: 0 };
    }

    return {
      allowed: false,
      reason:
        reason === "hourly_limit" || reason === "client_limit" || reason === "daily_budget"
          ? reason
          : "rate_limited",
      retryAfterSeconds: verdict.retry_after_seconds ?? 60,
    };
  } catch (error) {
    // Unreachable, timed out, or malformed. See the note above. The error's
    // class, never its message: a fetch failure can carry the URL.
    const name = error instanceof Error ? error.constructor.name : typeof error;
    console.warn(`[observer.quota] the shared ceiling could not be reached — ${name}`);
    return unavailable();
  }
}

/**
 * The refusal used when the ceiling itself is the thing that failed.
 *
 * Short retry: an outage is usually brief, and a reader who waits twenty
 * seconds and succeeds has lost almost nothing.
 */
function unavailable(): SharedVerdict {
  return { allowed: false, reason: "ceiling_unavailable", retryAfterSeconds: 20 };
}

/**
 * Which kind of 401 this is, in words, from one field.
 *
 * Two very different mistakes arrive as the same status:
 *
 *   - a key the project does not recognise at all — the wrong project's key, or
 *     one since rotated. PostgREST answers "Invalid API key";
 *   - a key the project *does* recognise, authenticating as a role the function
 *     is not granted to. That is what pasting the **publishable** key into
 *     `SUPABASE_SECRET_KEY` produces, and it is the likeliest next mistake
 *     after the first one is fixed. Postgres answers SQLSTATE 42501.
 *
 * Only the classification is returned. The body itself is never logged: a
 * PostgREST error can quote the statement that failed, and the statement
 * carries the session and client identifiers.
 */
/**
 * Which kind of 404 this is.
 *
 * A 404 has meant three different things on this deployment already, and the
 * status alone cannot separate them:
 *
 *   - `PGRST202` — PostgREST was reached and could not match the function *for
 *     the calling role*. So the URL is right and either the arguments or the
 *     role's grants are not;
 *   - anything else, or a body that is not PostgREST's — the request never
 *     reached PostgREST at all, which means the URL is not this project's REST
 *     endpoint.
 *
 * The code is a machine identifier, never content.
 */
async function describeNotFound(response: Response): Promise<string> {
  try {
    const parsed = (await response.clone().json()) as { code?: unknown };
    if (parsed?.code === "PGRST202") {
      /*
       * PostgREST can assume exactly three roles — anon, authenticated and
       * service_role — and they are indistinguishable in this response. Asking
       * the database which one it is, is the only way to tell a secret key from
       * a publishable one that happens to be in the right variable.
       */
      /*
       * The host, on the failure path only.
       *
       * A Supabase project ref is not a credential — it is in the URL of every
       * browser request any Supabase application makes, and it is the one fact
       * that separates "the key is wrong" from "you are talking to a different
       * project". Four rounds were spent inferring it from response codes.
       */
      const role = await callerRole();
      return `PostgREST at ${hostOf()} matched no such function for role "${role}" — check that host is the intended project, then that the key is a service-role key for it`;
    }
    if (typeof parsed?.code === "string") {
      return `PostgREST answered ${parsed.code} — the URL reaches a project, but not this function`;
    }
  } catch {
    // Not PostgREST's JSON at all.
  }
  return `nothing at ${hostOf()} answered like PostgREST — that host is not a Supabase REST endpoint`;
}

/**
 * The role the configured key actually authenticates as.
 *
 * Asked only when the ceiling has already failed, so it costs nothing on the
 * path that works. `observer_whoami` runs as the caller and returns nothing but
 * the caller's own name — no data, no schema, no configuration.
 */
/** The configured host, never the key beside it. */
function hostOf(): string {
  const config = configured();
  if (config === null) return "(unconfigured)";
  try {
    return new URL(config.url).host;
  } catch {
    return "(unparseable)";
  }
}

async function callerRole(): Promise<string> {
  const config = configured();
  if (config === null) return "unknown";
  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/observer_whoami`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return `unknown (HTTP ${response.status})`;
    const rows = (await response.json()) as readonly { effective_role?: unknown }[];
    const role = rows[0]?.effective_role;
    return typeof role === "string" ? role : "unknown";
  } catch {
    return "unknown";
  }
}

async function describeRejection(response: Response): Promise<string> {
  try {
    const parsed = (await response.clone().json()) as { code?: unknown };
    if (parsed?.code === "42501") {
      return "the key is valid for this project but the function is not granted to its role — that is the publishable key, not the secret key";
    }
  } catch {
    // A body that is not JSON tells us nothing, which is its own answer.
  }
  return "the project does not recognise SUPABASE_SECRET_KEY — wrong project, or the key has been rotated";
}

/* --- the audit --------------------------------------------------------------- */

/**
 * Who wrote what the reader received.
 *
 * Four terminal shapes, and the distinction that matters most is the first two.
 * The audit recorded `answered` for both of them and named the configured model
 * either way, so a deterministic fallback — which the answer sheet honestly
 * labels "written by the tools" — was filed as prose a model had written. The
 * single question worth asking of an AI feature's audit was the one it answered
 * wrongly.
 */
export type ResponseSource =
  /** A model wrote the final prose. `authorModel` names it. */
  | "model"
  /** Observer's own composition. `authorModel` is null, and `fallbackReason` says why. */
  | "deterministic_composer"
  /** The pipeline declined. No prose was composed by anything. */
  | "refusal"
  /** No answer reached the reader at all. */
  | "failure";

/**
 * The terminal result of a request that was already admitted and already has a
 * row. Everything here is a code, a count or a duration.
 */
export interface TerminalResult {
  readonly requestId: string;
  readonly outcome: "answered" | "refused" | "unavailable" | "rate_limited" | "rejected";
  readonly responseSource: ResponseSource;
  /** What was configured and tried, whatever happened next. */
  readonly attemptedProvider: string | null;
  readonly attemptedModel: string | null;
  readonly modelAttempted: boolean;
  /**
   * Must equal the `live` flag the answer sheet renders.
   *
   * Same fact in two places, which is a drift risk taken deliberately: the
   * screen has to show it and the audit has to record it. A test asserts they
   * agree for every branch rather than trusting that they will.
   */
  readonly modelAuthored: boolean;
  /** Null unless a model wrote the prose. Never the configured name. */
  readonly authorModel: string | null;
  /** A fixed code, never a provider message. */
  readonly fallbackReason: FallbackReason | null;
  readonly tools: readonly string[];
  readonly toolCalls: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly latencyMs: number | null;
}

/**
 * Closes the row that admission opened. Never what the question said.
 *
 * No prompt, no answer, no contact name, no unit code, no IP address, no
 * provider payload. Those are the fields that turn a useful operational log
 * into a disclosure, and a demonstration has no need for any of them: the
 * questions worth asking of this table are "how many", "how fast", "how often
 * refused", "who wrote it" and "what did it cost".
 *
 * ## Awaited, and its failure is visible
 *
 * This used to be `void recordAudit(...)` — fired and forgotten after the
 * response. A serverless runtime may freeze the moment the response is sent,
 * and an unawaited promise dies with it; the Preview lost 20 of 153 records
 * that way. The route now waits for this before it finishes.
 *
 * That costs a round trip on every answer, and it buys the only property that
 * makes the table worth reading. A failure here still does not cost the reader
 * their answer — it is caught, logged with a status and no body, and the row
 * simply stays `started`, which is exactly what an interrupted request should
 * look like.
 *
 * Returns whether a row matched, so a miss is reported rather than assumed
 * successful.
 */
/**
 * What became of the write.
 *
 * `completed` and `duplicate_ignored` are both success: the record says what
 * happened and says it once. `conflict` means two executions disagreed about
 * one request and the stored row stood. `not_found` should be impossible.
 * `unconfigured` is a deployment that was never promised an audit.
 */
export type CompletionOutcome =
  "completed" | "duplicate_ignored" | "conflict" | "not_found" | "unreachable" | "unconfigured";

export async function completeAiRequest(result: TerminalResult): Promise<CompletionOutcome> {
  const config = configured();
  if (config === null) return "unconfigured";

  try {
    /*
     * Through a function, not into the table.
     *
     * A table something needs to write to does not have to become a table
     * anything can read. `observer.ai_requests` stays unexposed and the update
     * goes through a `security definer` façade in `public` — the same reason,
     * and the same shape, as the ceiling above.
     */
    const response = await fetch(`${config.url}/rest/v1/rpc/complete_ai_request`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_request_id: result.requestId,
        p_outcome: result.outcome,
        p_response_source: result.responseSource,
        p_attempted_provider: result.attemptedProvider,
        p_attempted_model: result.attemptedModel,
        p_model_attempted: result.modelAttempted,
        p_model_authored: result.modelAuthored,
        p_author_model: result.authorModel,
        p_fallback_reason: result.fallbackReason,
        p_tools: result.tools,
        p_tool_calls: result.toolCalls,
        p_input_tokens: result.inputTokens,
        p_output_tokens: result.outputTokens,
        p_latency_ms: result.latencyMs,
      }),
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      // The status only. A PostgREST error body can quote the statement back.
      console.warn(`[observer.audit] the terminal result was not stored — HTTP ${response.status}`);
      return "unreachable";
    }

    const outcome = (await response.json()) as string | null;
    switch (outcome) {
      case "completed":
      case "duplicate_ignored":
        return outcome;

      /*
       * Two executions believed they owned one request, and disagreed about
       * what happened. The stored row wins — it was written first and a
       * completed record is not rewritten — and this is said loudly, because
       * the alternative is a silent divergence between the audit and reality.
       */
      case "conflict":
        console.warn(
          "[observer.audit] a second, different result arrived for a completed request — the stored record stands",
        );
        return "conflict";

      // The admission row is missing, which should be impossible: admission
      // writes it in the same transaction that consumes the quota.
      case "not_found":
        console.warn("[observer.audit] no admitted request matched this result");
        return "not_found";

      default:
        console.warn(`[observer.audit] unrecognised completion outcome — ${String(outcome)}`);
        return "unreachable";
    }
  } catch (error) {
    const name = error instanceof Error ? error.constructor.name : typeof error;
    console.warn(`[observer.audit] the terminal result could not be stored — ${name}`);
    return "unreachable";
  }
}
