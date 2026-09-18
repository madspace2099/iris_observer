import "server-only";

import { resolveServerSupabase, type EnvSource } from "@/lib/supabase-env";
import { testStorePermitted } from "@/lib/credentials/test-store";
import type { ModelId } from "@/lib/models/catalogue";
import { testLedger } from "./test-ledger";

/**
 * THE USAGE LEDGER, BEHIND ONE PORT.
 *
 * What an account has spent this month, what it has reserved against requests
 * still in flight, and the budget it set. Every amount is an integer number of
 * micro-dollars; no float touches money anywhere in this feature.
 *
 * ADR-0031 records why this shape rather than a check after the fact.
 *
 * ## Reserve, then settle — never the other way round
 *
 * A model call is metered AFTER it happens. If Observer waited for the bill it
 * would learn a budget was blown by discovering it had already been blown, and
 * a burst of concurrent questions would each pass a check that none of them had
 * yet affected.
 *
 * So spending is claimed in advance:
 *
 *   reserve    a worst-case amount is taken out of the remaining budget,
 *              atomically, before anything is sent. If it does not fit, no
 *              request is made at all.
 *   dispatch   recorded the instant before the request leaves. This is the
 *              moment the money stops being refundable.
 *   settle     the hold is replaced by the real cost once the tokens are known.
 *              Usually smaller, so headroom comes back.
 *   release    the hold is dropped and nothing is charged — ONLY legal for a
 *              request that was never dispatched.
 *   uncertain  dispatched, and the outcome never came back. The money stays
 *              charged and is flagged, because a vendor that completed the work
 *              will bill for it whatever this process managed to observe.
 *
 * ## Why "released" and "uncertain" are different states
 *
 * A request that failed before it was sent cost nothing, and refusing to give
 * the headroom back would be theft of a kind. A request that WAS sent and then
 * timed out may have run to completion and been billed, and giving the headroom
 * back would tell a reader they have money they have already spent. The two
 * cases look identical from inside a `catch` block and are opposite in what
 * they mean, so the ledger records which one happened rather than guessing.
 *
 * A reservation that is never resolved would silently consume a budget forever,
 * so it carries an expiry — and expiry respects the same distinction: a
 * reserved row is released, a dispatched one becomes uncertain.
 *
 * ## The period is a UTC month
 *
 * `2026-08`, computed from UTC and stored on the row. Not the reader's local
 * month: two people in one account in different time zones would otherwise
 * disagree about which month a question belonged to, and the disagreement would
 * be invisible until a budget reset at a surprising moment.
 */

/** An amount of money. Integer micro-dollars, always. */
export type Micros = number;

/** `YYYY-MM`, in UTC. */
export type Period = string;

export function periodOf(when: Date = new Date()): Period {
  const year = when.getUTCFullYear();
  const month = String(when.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** What an account has decided, and what it has used. */
export interface AccountUsage {
  readonly accountId: string;
  readonly period: Period;
  /** The monthly ceiling this account set. Zero means none has been set. */
  readonly budgetMicros: Micros;
  /** Settled spending, plus anything charged as uncertain. */
  readonly spentMicros: Micros;
  /** Held against requests not yet resolved. */
  readonly reservedMicros: Micros;
  /**
   * Of `spentMicros`, how much was charged for requests whose outcome never
   * came back. A subset, not a separate pot — kept so a reader can be told
   * plainly that part of their month is an unconfirmed charge.
   */
  readonly uncertainMicros: Micros;
  /** How many requests were settled this period. Context for the figure. */
  readonly requests: number;
}

/** Where a reservation is in its life. See the header. */
export type ReservationStatus = "reserved" | "dispatched" | "uncertain";

/**
 * The rates an amount was computed with, carried on the row.
 *
 * Copied rather than referenced: a price change must not retroactively rewrite
 * what last month cost.
 */
export interface Rates {
  readonly inputMicrosPerMillion: number;
  readonly cachedInputMicrosPerMillion: number;
  readonly outputMicrosPerMillion: number;
}

export interface Reservation {
  readonly id: string;
  readonly accountId: string;
  readonly period: Period;
  readonly model: ModelId;
  readonly amountMicros: Micros;
  readonly catalogueVersion: string;
  readonly rates: Rates;
  readonly expiresAt: string;
}

/** What `release` actually did. Never assumed — a dispatched hold is not free. */
export type ReleaseOutcome = "released" | "dispatched" | "uncertain" | "unknown";

/** What `dispatch` found. Anything but these two means: do not send. */
export type DispatchOutcome = "dispatched" | "uncertain" | "unknown";

export type ReserveOutcome =
  | { readonly ok: true; readonly reservation: Reservation }
  /** The budget would be exceeded. No provider call may be made. */
  | { readonly ok: false; readonly reason: "exhausted"; readonly usage: AccountUsage }
  /** No budget has been set, so nothing may be spent. */
  | { readonly ok: false; readonly reason: "no_budget"; readonly usage: AccountUsage }
  /** The ledger itself is unreachable. Fail closed: no call. */
  | { readonly ok: false; readonly reason: "unavailable" };

export interface Ledger {
  readonly kind: "supabase" | "test";
  usage(accountId: string, period: Period): Promise<AccountUsage>;
  setBudget(accountId: string, period: Period, budgetMicros: Micros): Promise<void>;
  /** Atomic. Either the whole amount is held, or nothing is. */
  reserve(reservation: Reservation): Promise<ReserveOutcome>;
  /**
   * Marks a hold as sent, immediately before it is.
   *
   * The caller MUST NOT send anything unless this answers `dispatched`: any
   * other answer means the hold is gone or already spoken for, and sending on
   * the strength of a hold that does not exist is spending unmetered money.
   */
  dispatch(reservationId: string, at: string): Promise<DispatchOutcome>;
  /** Replaces the hold with the real cost. Idempotent by reservation id. */
  settle(reservationId: string, actualMicros: Micros): Promise<void>;
  /**
   * Drops the hold and charges nothing — only for a hold never dispatched.
   *
   * Returns what it actually did rather than nothing, because "I asked for a
   * refund" and "a refund happened" are different facts and the caller has to
   * know which one it has.
   */
  release(reservationId: string): Promise<ReleaseOutcome>;
  /** Charges a dispatched hold in full and flags it as unconfirmed. */
  markUncertain(reservationId: string): Promise<"uncertain" | "unknown">;
  /** Reclaims holds nobody resolved: released if never sent, uncertain if sent. */
  expire(now: string): Promise<number>;
}

export type LedgerAvailability =
  { readonly available: true; readonly ledger: Ledger } | { readonly available: false };

export class LedgerUnavailableError extends Error {
  constructor(what: string) {
    super(`The usage ledger did not answer: ${what}`);
    this.name = "LedgerUnavailableError";
  }
}

/* ============================================================ the Supabase one */

function post(
  url: string,
  key: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

function rowToUsage(accountId: string, period: Period, row: Record<string, unknown>): AccountUsage {
  const int = (k: string): number => {
    const v = row[k];
    return typeof v === "number" ? v : Number.parseInt(String(v ?? "0"), 10);
  };
  return {
    accountId,
    period,
    budgetMicros: int("budget_micros"),
    spentMicros: int("spent_micros"),
    reservedMicros: int("reserved_micros"),
    uncertainMicros: int("uncertain_micros"),
    requests: int("requests"),
  };
}

function supabaseLedger(url: string, key: string): Ledger {
  return {
    kind: "supabase",

    async usage(accountId, period) {
      const response = await post(url, key, "observer_usage_read", {
        p_account: accountId,
        p_period: period,
      });
      if (!response.ok) throw new LedgerUnavailableError(`read returned ${response.status}`);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return {
          accountId,
          period,
          budgetMicros: 0,
          spentMicros: 0,
          reservedMicros: 0,
          uncertainMicros: 0,
          requests: 0,
        };
      }
      return rowToUsage(accountId, period, rows[0] as Record<string, unknown>);
    },

    async setBudget(accountId, period, budgetMicros) {
      const response = await post(url, key, "observer_usage_set_budget", {
        p_account: accountId,
        p_period: period,
        p_budget_micros: budgetMicros,
      });
      if (!response.ok) throw new LedgerUnavailableError(`set budget returned ${response.status}`);
    },

    async reserve(reservation) {
      /*
       * ONE STATEMENT DECIDES. The database compares the budget against
       * spent + reserved + this amount and writes the hold in the same
       * statement, so two concurrent requests cannot both see room that only
       * one of them can have.
       */
      const response = await post(url, key, "observer_usage_reserve", {
        p_reservation: reservation.id,
        p_account: reservation.accountId,
        p_period: reservation.period,
        p_model: reservation.model,
        p_amount_micros: reservation.amountMicros,
        p_catalogue_version: reservation.catalogueVersion,
        p_input_rate_micros: reservation.rates.inputMicrosPerMillion,
        p_cached_input_rate_micros: reservation.rates.cachedInputMicrosPerMillion,
        p_output_rate_micros: reservation.rates.outputMicrosPerMillion,
        p_expires_at: reservation.expiresAt,
      });
      if (!response.ok) return { ok: false, reason: "unavailable" };

      const verdict: unknown = await response.json();
      const row = Array.isArray(verdict) ? verdict[0] : verdict;
      const decision = (row as { outcome?: string } | null)?.outcome;

      if (decision === "reserved") return { ok: true, reservation };
      const usage = await this.usage(reservation.accountId, reservation.period);
      return decision === "no_budget"
        ? { ok: false, reason: "no_budget", usage }
        : { ok: false, reason: "exhausted", usage };
    },

    async settle(reservationId, actualMicros) {
      const response = await post(url, key, "observer_usage_settle", {
        p_reservation: reservationId,
        p_actual_micros: actualMicros,
      });
      if (!response.ok) throw new LedgerUnavailableError(`settle returned ${response.status}`);
    },

    async dispatch(reservationId, at) {
      const response = await post(url, key, "observer_usage_dispatch", {
        p_reservation: reservationId,
        p_at: at,
      });
      if (!response.ok) throw new LedgerUnavailableError(`dispatch returned ${response.status}`);
      const verdict: unknown = await response.json();
      const word = typeof verdict === "string" ? verdict : String(verdict);
      return word === "dispatched" || word === "uncertain" ? word : "unknown";
    },

    async release(reservationId) {
      const response = await post(url, key, "observer_usage_release", {
        p_reservation: reservationId,
      });
      if (!response.ok) throw new LedgerUnavailableError(`release returned ${response.status}`);
      const verdict: unknown = await response.json();
      const word = typeof verdict === "string" ? verdict : String(verdict);
      return word === "released" || word === "dispatched" || word === "uncertain"
        ? word
        : "unknown";
    },

    async markUncertain(reservationId) {
      const response = await post(url, key, "observer_usage_uncertain", {
        p_reservation: reservationId,
      });
      if (!response.ok) throw new LedgerUnavailableError(`uncertain returned ${response.status}`);
      const verdict: unknown = await response.json();
      return verdict === "uncertain" ? "uncertain" : "unknown";
    },

    async expire(now) {
      const response = await post(url, key, "observer_usage_expire", { p_now: now });
      if (!response.ok) throw new LedgerUnavailableError(`expire returned ${response.status}`);
      const count: unknown = await response.json();
      return typeof count === "number" ? count : 0;
    },
  };
}

/* ==================================================================== selection */

/**
 * Which ledger this server has, if any.
 *
 * Supabase first, always. The in-process one is the credential harness's twin
 * and answers to exactly the same four conditions — one predicate, so a server
 * that can hold a test credential can hold a test ledger and no other server
 * can hold either.
 *
 * Neither available means no budget can be enforced, and a budget that cannot
 * be enforced must not be pretended: the service refuses the model call rather
 * than letting spending go unmetered.
 */
export function ledger(source: EnvSource = process.env): LedgerAvailability {
  const supabase = resolveServerSupabase(source);
  if (supabase !== null) {
    return { available: true, ledger: supabaseLedger(supabase.url, supabase.key) };
  }
  if (testStorePermitted(source)) return { available: true, ledger: testLedger() };
  return { available: false };
}
