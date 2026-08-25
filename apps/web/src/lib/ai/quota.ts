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
      readonly reason: "rate_limited" | "hourly_limit" | "client_limit" | "daily_budget";
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
 * The request is allowed, and the in-process limiter still applies.
 *
 * That is a deliberate choice and worth stating. Failing closed would mean a
 * Supabase outage silently disables Ask Observer during a client consultation,
 * with a refusal the reader cannot distinguish from a broken product. Failing
 * open degrades the ceiling to per-instance — which is exactly where it was
 * before this module — while the vendor-side spend limit configured on the
 * OpenAI project remains untouched underneath. Neither ceiling replaces the
 * other, and this one is not the last line.
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
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Accept-Profile": "observer",
        "Content-Profile": "observer",
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

    if (!response.ok) return { allowed: true };

    const rows = (await response.json()) as readonly {
      allowed: boolean;
      reason: string | null;
      retry_after_seconds: number | null;
    }[];

    const verdict = rows[0];
    if (verdict === undefined || verdict.allowed) return { allowed: true };

    const reason = verdict.reason;
    return {
      allowed: false,
      reason:
        reason === "hourly_limit" || reason === "client_limit" || reason === "daily_budget"
          ? reason
          : "rate_limited",
      retryAfterSeconds: verdict.retry_after_seconds ?? 60,
    };
  } catch {
    // Unreachable, timed out, or malformed. See the note above.
    return { allowed: true };
  }
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
    await fetch(`${config.url}/rest/v1/ai_requests`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Content-Profile": "observer",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        subject: record.subject,
        client_hash: record.clientHash,
        tenant_slug: record.tenantSlug,
        project_slug: record.projectSlug,
        viewer_role: record.viewerRole,
        outcome: record.outcome,
        model: record.model,
        tools: record.tools,
        tool_calls: record.toolCalls,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        latency_ms: record.latencyMs,
        question_chars: record.questionChars,
      }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Deliberately silent.
  }
}
