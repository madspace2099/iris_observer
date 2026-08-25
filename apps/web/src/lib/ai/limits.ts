import "server-only";

/**
 * What a demo is allowed to spend.
 *
 * Every ceiling here is configurable, and every one has a default that a public
 * demonstration can survive being found by a crawler. The model is the only
 * part of this product that costs money per request, so it is the only part
 * that needs a meter.
 *
 * **On the honesty of this control.** The counters live in the process. On a
 * serverless platform each lambda has its own, so a per-minute ceiling of ten
 * is ten *per running instance*, not ten globally — this codebase already
 * shipped an in-memory session table and watched it fail exactly that way. It
 * is a real brake on a single abusive client hitting a warm instance, and it is
 * not a global spend cap. The global cap is the spending limit configured on
 * the OpenAI project itself, which is the only ceiling that cannot be bypassed
 * by starting another instance. Both are required; neither replaces the other.
 */

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface Limits {
  /** Characters. Longer questions are rejected before any model is called. */
  readonly maxQuestionChars: number;
  /** Tokens the model may produce for one answer. */
  readonly maxOutputTokens: number;
  /** Tool calls the planner may request in one turn. */
  readonly maxToolCalls: number;
  /** Milliseconds before an upstream call is abandoned. */
  readonly requestTimeoutMs: number;
  /** Requests one viewer may make in a rolling minute. */
  readonly perMinute: number;
  /** Requests one viewer may make in one session-day. */
  readonly perViewerPerDay: number;
  /** Requests this instance will make in a day, across all viewers. */
  readonly perInstancePerDay: number;
  /** Consecutive upstream failures before the breaker opens. */
  readonly breakerThreshold: number;
  /** How long the breaker stays open. */
  readonly breakerCooldownMs: number;
  /** Models this deployment will call, whatever the environment asks for. */
  readonly allowedModels: readonly string[];
}

export const LIMITS: Limits = {
  maxQuestionChars: number("OBSERVER_MAX_QUESTION_CHARS", 500),
  maxOutputTokens: number("OBSERVER_MAX_OUTPUT_TOKENS", 700),
  maxToolCalls: number("OBSERVER_MAX_TOOL_CALLS", 3),
  requestTimeoutMs: number("OBSERVER_LLM_TIMEOUT_MS", 30_000),
  perMinute: number("OBSERVER_ASK_PER_MINUTE", 10),
  perViewerPerDay: number("OBSERVER_ASK_PER_VIEWER_PER_DAY", 200),
  perInstancePerDay: number("OBSERVER_ASK_PER_INSTANCE_PER_DAY", 2_000),
  breakerThreshold: number("OBSERVER_BREAKER_THRESHOLD", 5),
  breakerCooldownMs: number("OBSERVER_BREAKER_COOLDOWN_MS", 60_000),
  allowedModels: (
    process.env["OBSERVER_ALLOWED_MODELS"] ?? "gpt-5.6-sol,gpt-5.6-luna,gpt-realtime-2.1"
  )
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0),
};

/**
 * A model this deployment is willing to call.
 *
 * An environment variable is configuration, not authorisation: someone who can
 * set `OBSERVER_LLM_MODEL` should not thereby be able to point a public demo at
 * the most expensive model on the account.
 */
export function modelIsAllowed(model: string): boolean {
  return LIMITS.allowedModels.includes(model);
}

/* --- the meters -------------------------------------------------------------- */

interface Meter {
  minute: { at: number; count: number };
  day: { at: number; count: number };
}

interface Breaker {
  failures: number;
  openedAt: number;
}

/*
 * Kept on globalThis for the same reason the session table once was: route
 * handlers and server actions are separate module instances, and a counter that
 * resets between them is not a counter. Unlike the session table, being
 * per-instance is a stated limitation here rather than a bug.
 */
interface Store {
  viewers: Map<string, Meter>;
  instance: { at: number; count: number };
  breaker: Breaker;
}

const globalStore = globalThis as unknown as { __observerAskLimits?: Store };

function store(): Store {
  globalStore.__observerAskLimits ??= {
    viewers: new Map(),
    instance: { at: 0, count: 0 },
    breaker: { failures: 0, openedAt: 0 },
  };
  return globalStore.__observerAskLimits;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * 60 * 1000;

function windowed(slot: { at: number; count: number }, span: number, now: number): void {
  if (now - slot.at >= span) {
    slot.at = now;
    slot.count = 0;
  }
}

export type RefusalReason =
  "rate_limited" | "daily_limit" | "instance_limit" | "question_too_long" | "model_not_allowed";

export interface Verdict {
  readonly allowed: boolean;
  readonly reason: RefusalReason | null;
  /** Seconds until the same request would be allowed, where that is knowable. */
  readonly retryAfterSeconds: number | null;
}

const ALLOW: Verdict = { allowed: true, reason: null, retryAfterSeconds: null };

function deny(reason: RefusalReason, retryAfterSeconds: number | null): Verdict {
  return { allowed: false, reason, retryAfterSeconds };
}

/**
 * Whether this viewer may make this call right now.
 *
 * Checked before the question reaches a tool or a model, so a refused request
 * costs nothing. The viewer key is the session's own key — never an IP address,
 * which on a shared office connection would rate-limit a whole sales team as
 * one person.
 */
export function checkAllowance(
  viewerKey: string,
  questionLength: number,
  model: string,
  now = Date.now(),
): Verdict {
  if (questionLength > LIMITS.maxQuestionChars) return deny("question_too_long", null);
  if (!modelIsAllowed(model)) return deny("model_not_allowed", null);

  const s = store();
  windowed(s.instance, DAY, now);
  if (s.instance.count >= LIMITS.perInstancePerDay) {
    return deny("instance_limit", Math.ceil((DAY - (now - s.instance.at)) / 1000));
  }

  let meter = s.viewers.get(viewerKey);
  if (meter === undefined) {
    meter = { minute: { at: now, count: 0 }, day: { at: now, count: 0 } };
    s.viewers.set(viewerKey, meter);
  }

  windowed(meter.minute, MINUTE, now);
  windowed(meter.day, DAY, now);

  if (meter.minute.count >= LIMITS.perMinute) {
    return deny("rate_limited", Math.ceil((MINUTE - (now - meter.minute.at)) / 1000));
  }
  if (meter.day.count >= LIMITS.perViewerPerDay) {
    return deny("daily_limit", Math.ceil((DAY - (now - meter.day.at)) / 1000));
  }

  return ALLOW;
}

/** Records a call that is about to be made. Separate from the check so a
 * refused request never moves a counter. */
export function recordAttempt(viewerKey: string, now = Date.now()): void {
  const s = store();
  windowed(s.instance, DAY, now);
  s.instance.count += 1;

  /*
   * Create the meter if it is missing rather than returning.
   *
   * The first version only incremented a meter `checkAllowance` had already
   * created, so any path that recorded an attempt without checking first —
   * or any check that happened on a different instance — left the viewer with
   * an untouched allowance. A counter that silently declines to count is worse
   * than no counter, because it reports success.
   */
  let meter = s.viewers.get(viewerKey);
  if (meter === undefined) {
    meter = { minute: { at: now, count: 0 }, day: { at: now, count: 0 } };
    s.viewers.set(viewerKey, meter);
  }
  windowed(meter.minute, MINUTE, now);
  windowed(meter.day, DAY, now);
  meter.minute.count += 1;
  meter.day.count += 1;
}

/**
 * The breaker.
 *
 * A key with no billing fails every call in exactly the same way, and retrying
 * it a thousand times is a thousand round trips to be told the same thing. The
 * breaker turns a repeated upstream failure into one refusal per cooldown, and
 * the reader sees the same unavailable state either way.
 */
export function recordUpstreamFailure(now = Date.now()): void {
  const s = store();
  s.breaker.failures += 1;
  if (s.breaker.failures >= LIMITS.breakerThreshold) {
    s.breaker.openedAt = now;
  }
}

export function recordUpstreamSuccess(): void {
  const s = store();
  s.breaker = { failures: 0, openedAt: 0 };
}

/**
 * Whether the vendor should be called at all right now.
 *
 * The breaker suppresses the *upstream call*, never the request. An open
 * breaker means the interpretation will be missing; it must not mean the
 * measured evidence is missing too, and an earlier version refused the whole
 * request and threw away an answer that needed no network at all.
 */
export function breakerIsOpen(now = Date.now()): boolean {
  const s = store();
  if (s.breaker.openedAt === 0) return false;
  if (now - s.breaker.openedAt >= LIMITS.breakerCooldownMs) {
    s.breaker = { failures: 0, openedAt: 0 };
    return false;
  }
  return true;
}

/** Test seam. Never called from application code. */
export function resetLimits(): void {
  globalStore.__observerAskLimits = {
    viewers: new Map(),
    instance: { at: 0, count: 0 },
    breaker: { failures: 0, openedAt: 0 },
  };
}
