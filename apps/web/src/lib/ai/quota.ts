import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { resolveServerSupabase } from "@/lib/supabase-env";
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
 * The fingerprint is a salted hash of coarse request properties. It survives a
 * cleared cookie well enough to slow an abusive client, and it cannot be
 * reversed into an address.
 */
export function clientFingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const address = forwarded.split(",")[0]?.trim() ?? "";
  const agent = request.headers.get("user-agent") ?? "";
  const language = request.headers.get("accept-language") ?? "";

  /*
   * Salted with a server secret, so the hash cannot be recomputed from a
   * guessed address. Without a configured secret the salt is per-process,
   * which degrades the fingerprint to "this instance" rather than leaking
   * anything — the safe direction.
   */
  const salt = process.env["OBSERVER_SESSION_SECRET"] ?? processSalt();

  return createHash("sha256")
    .update(`${salt}|${address}|${agent}|${language}`)
    .digest("hex")
    .slice(0, 32);
}

let cachedSalt: string | null = null;
function processSalt(): string {
  cachedSalt ??= randomUUID();
  return cachedSalt;
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
        | "ceiling_unavailable";
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
 */
export async function consumeSharedQuota(
  session: string,
  clientHash: string,
  projectKey: string,
): Promise<SharedVerdict> {
  const config = configured();
  if (config === null) return { allowed: true };

  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/consume_ai_quota`, {
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
        p_session: session,
        p_client_hash: clientHash,
        p_project: projectKey,
        p_per_minute: SHARED_LIMITS.perMinute,
        p_per_hour: SHARED_LIMITS.perHour,
        p_client_per_hour: SHARED_LIMITS.clientPerHour,
        p_project_per_day: SHARED_LIMITS.projectPerDay,
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
      const role = await callerRole();
      return `PostgREST was reached but matched no such function for role "${role}" — the URL is right, and this key is not a service-role key`;
    }
    if (typeof parsed?.code === "string") {
      return `PostgREST answered ${parsed.code} — the URL reaches a project, but not this function`;
    }
  } catch {
    // Not PostgREST's JSON at all.
  }
  return "nothing at that address answered like PostgREST — SUPABASE_URL is not this project's REST endpoint";
}

/**
 * The role the configured key actually authenticates as.
 *
 * Asked only when the ceiling has already failed, so it costs nothing on the
 * path that works. `observer_whoami` runs as the caller and returns nothing but
 * the caller's own name — no data, no schema, no configuration.
 */
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

export interface AuditRecord {
  readonly subject: string;
  readonly clientHash: string;
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly viewerRole: string;
  readonly outcome: "answered" | "refused" | "unavailable" | "rate_limited" | "rejected";
  readonly model: string | null;
  readonly tools: readonly string[];
  readonly toolCalls: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly latencyMs: number | null;
  /** The question's *length*. Never the question. */
  readonly questionChars: number;
}

/**
 * Records that a question happened. Never what it said.
 *
 * No prompt, no answer, no contact name, no unit code, no IP address, no
 * provider payload. Those are the fields that turn a useful operational log
 * into a disclosure, and a demonstration has no need for any of them: the
 * questions worth asking of this table are "how many", "how fast", "how often
 * refused" and "what did it cost".
 *
 * Failures are swallowed. An audit write must never be the reason a reader
 * does not get their answer.
 */
export async function recordAudit(record: AuditRecord): Promise<void> {
  const config = configured();
  if (config === null) return;

  try {
    /*
     * Through a function, not into the table.
     *
     * A table something needs to write to does not have to become a table
     * anything can read. `observer.ai_requests` stays unexposed and the insert
     * goes through a `security definer` façade in `public` — the same reason,
     * and the same shape, as the ceiling above.
     */
    await fetch(`${config.url}/rest/v1/rpc/record_ai_request`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_subject: record.subject,
        p_client_hash: record.clientHash,
        p_tenant_slug: record.tenantSlug,
        p_project_slug: record.projectSlug,
        p_viewer_role: record.viewerRole,
        p_outcome: record.outcome,
        p_model: record.model,
        p_tools: record.tools,
        p_tool_calls: record.toolCalls,
        p_input_tokens: record.inputTokens,
        p_output_tokens: record.outputTokens,
        p_latency_ms: record.latencyMs,
        p_question_chars: record.questionChars,
      }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Deliberately silent.
  }
}
