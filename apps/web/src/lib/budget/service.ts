import "server-only";

import { randomUUID } from "node:crypto";

import {
  CATALOGUE_VERSION,
  costOf,
  MAX_REQUEST_INPUT_TOKENS,
  modelEntry,
  rateSnapshot,
  reservationMicros,
  worstCaseTokens,
  type ModelId,
  type RequestShape,
  type TokenUsage,
} from "@/lib/models/catalogue";
import { LIMITS } from "@/lib/ai/limits";
import {
  ledger,
  periodOf,
  type AccountUsage,
  type Micros,
  type Period,
  type Reservation,
} from "./ledger";

/**
 * THE OBSERVER BUDGET, AROUND EVERY MODEL CALL.
 *
 * A reader sets a monthly ceiling in dollars. Observer holds the worst case
 * against it before calling OpenAI, replaces the hold with the real cost
 * afterwards, and refuses to call at all once the ceiling is reached.
 *
 * ## What this is, and what it is emphatically not
 *
 * It is Observer's own estimate of Observer's own usage, priced from a
 * committed catalogue whose figures were checked against OpenAI's published
 * list on the date the catalogue records. It is **not** an invoice, not a
 * reading of the vendor's meter, and not a hard limit anybody but Observer will
 * honour: OpenAI bills the account that owns the API key, on its own figures,
 * whatever this says. A reader who wants a limit the vendor enforces sets one
 * in the vendor's console, and the settings page says so next to this one.
 *
 * ## The account is a parameter, never a request field
 *
 * Every function here takes the account id first, and the callers get it from
 * `requireAccount()`. Nothing in this module reads a header, a form field or a
 * query string.
 *
 * ## Nothing here chooses a model
 *
 * Every function that needs to know what a request costs is TOLD which model,
 * by the caller that resolved the reader's choice. There is deliberately no
 * fallback, no default and no "cheapest that fits": substituting a model is
 * spending somebody's money on an answer they did not ask for, and doing it
 * silently — inside a cost calculation, of all places — would be worse.
 */

/** Where a reader stands against their own ceiling. */
export type Threshold = "none" | "ok" | "half" | "most" | "exhausted";

export interface BudgetState {
  readonly usage: AccountUsage;
  readonly threshold: Threshold;
  /** Spent plus held, as a percentage of the ceiling. Zero when none is set. */
  readonly usedPercent: number;
  readonly remainingMicros: Micros;
  /**
   * What the NEXT question would cost this account, and therefore what
   * "exhausted" was judged against. Carried so the page can say so.
   */
  readonly nextQuestionMicros: Micros;
}

/* ============================================================ what a request is */

/**
 * THE SHAPE OF AN OBSERVER QUESTION, FROM THE LIMITS THAT BOUND IT.
 *
 * Not a guess at a typical request: the largest one this deployment permits,
 * given what is actually being sent. Three bounds, all real:
 *
 *   turns             the agent plans, runs tools locally, then composes. Two
 *                     model turns, and `LIMITS.maxToolCalls` bounds how much
 *                     work the middle stage may do.
 *   maxOutputTokens   the per-turn cap this deployment sends upstream.
 *   promptTokens      MEASURED from the question and the fixed allowance for
 *                     instructions, tool schemas and project context.
 *
 * The tool-result allowance scales with how many tools may run, because that is
 * what lands in the composing turn's input.
 */

/** Model turns one question may take: one to plan, one to compose. */
export const TURNS_PER_QUESTION = 2;

/**
 * Characters per token, for measuring a question before it is tokenised.
 *
 * Three, not the usual four. This number's only job is to make a reservation
 * large enough, and erring low means erring large.
 */
const CHARS_PER_TOKEN = 3;

/**
 * What the instructions, tool schemas and project context add.
 *
 * Fixed per turn and independent of the question. Measured once from the
 * assembled prompt and rounded up hard; `MAX_REQUEST_INPUT_TOKENS` is the
 * backstop that makes it a bound rather than a hope, because the transport
 * refuses anything larger before it is sent.
 */
export const CONTEXT_TOKEN_ALLOWANCE = 6_000;

/** What one tool's results may add to the composing turn. */
export const TOOL_RESULT_TOKEN_ALLOWANCE = 2_500;

export function shapeForQuestion(question: string, depth: "standard" | "deep"): RequestShape {
  const questionTokens = Math.ceil(question.length / CHARS_PER_TOKEN);
  /* A deep report plans harder and carries more of the project into the turn. */
  const contextTokens = depth === "deep" ? CONTEXT_TOKEN_ALLOWANCE * 2 : CONTEXT_TOKEN_ALLOWANCE;

  return {
    promptTokens: questionTokens + contextTokens,
    toolResultTokens: TOOL_RESULT_TOKEN_ALLOWANCE * Math.max(1, LIMITS.maxToolCalls),
    maxOutputTokens: LIMITS.maxOutputTokens,
    turns: TURNS_PER_QUESTION,
  };
}

/**
 * What one more question would cost this account, at worst.
 *
 * The model is a parameter with no default, on purpose: see the module note.
 */
export function nextQuestionMicros(
  model: ModelId,
  question: string,
  depth: "standard" | "deep",
): Micros {
  return reservationMicros(model, shapeForQuestion(question, depth));
}

/**
 * The worst case for a question nobody has typed yet.
 *
 * Used by the settings page, which has to say whether there is room for another
 * question before knowing what it will be. An empty question is the smallest
 * one, so this is the most generous honest figure for a given model.
 */
export function typicalQuestionMicros(model: ModelId): Micros {
  return nextQuestionMicros(model, "", "standard");
}

/**
 * Whether a shape can be sent at all.
 *
 * The catalogue prices one band; a request past the vendor's long-context
 * boundary is priced differently and would be reserved at rates that do not
 * apply. The transport refuses such a request, and this is the same check made
 * early enough to refuse before any money is held.
 */
export function withinRequestCeiling(shape: RequestShape): boolean {
  return worstCaseTokens(shape).inputTokens <= MAX_REQUEST_INPUT_TOKENS;
}

/* ================================================================= thresholds */

/**
 * The three thresholds the brief names, and the two that bracket them.
 *
 * Computed from spent PLUS reserved, because a reader with three questions in
 * flight has committed that money whether or not the answers have arrived.
 *
 * ## Exhausted means "nothing more can be asked", not "the bar is full"
 *
 * `nextMicros` is what one more question would cost for the model this account
 * actually uses. A ceiling with less than that left will refuse the next
 * question, so calling it anything short of exhausted is a true percentage and
 * a false impression: the screenshot that caught this read 82%, with nine
 * tenths of a cent left, on an account whose every question was being refused.
 *
 * No default. The caller resolved the reader's model; this must not quietly
 * price the question with a cheaper one.
 */
export function thresholdFor(usage: AccountUsage, nextMicros: Micros): Threshold {
  if (usage.budgetMicros <= 0) return "none";

  const committed = usage.spentMicros + usage.reservedMicros;
  if (usage.budgetMicros - committed < nextMicros) return "exhausted";

  const ratio = committed / usage.budgetMicros;
  if (ratio >= 0.8) return "most";
  if (ratio >= 0.5) return "half";
  return "ok";
}

export function stateOf(usage: AccountUsage, nextMicros: Micros): BudgetState {
  const committed = usage.spentMicros + usage.reservedMicros;
  return {
    usage,
    threshold: thresholdFor(usage, nextMicros),
    /*
     * A PERCENTAGE, WHICH IS NOT MONEY.
     *
     * The only division in this module, and the only rounding that is not
     * upward. It produces a number for a meter and a sentence; nothing is
     * charged, compared against a ceiling or stored from it. Every monetary
     * value on this object is an integer count of micro-dollars.
     */
    usedPercent:
      usage.budgetMicros <= 0
        ? 0
        : Math.min(999, Math.round((committed / usage.budgetMicros) * 100)),
    remainingMicros: Math.max(0, usage.budgetMicros - committed),
    nextQuestionMicros: nextMicros,
  };
}

/**
 * This account's standing, this UTC month.
 *
 * `nextMicros` is what the caller knows and this module does not: which model
 * this reader asks with. Judging their ceiling against anything else would tell
 * somebody on Sol that they have room for a question Sol cannot afford.
 */
export async function budgetFor(
  accountId: string,
  nextMicros: Micros,
  when = new Date(),
): Promise<BudgetState | null> {
  const store = ledger();
  if (!store.available) return null;
  try {
    return stateOf(await store.ledger.usage(accountId, periodOf(when)), nextMicros);
  } catch {
    return null;
  }
}

export async function setBudget(
  accountId: string,
  budgetMicros: Micros,
  when = new Date(),
): Promise<boolean> {
  const store = ledger();
  if (!store.available) return false;
  try {
    await store.ledger.setBudget(accountId, periodOf(when), Math.max(0, Math.round(budgetMicros)));
    return true;
  } catch {
    return false;
  }
}

/* ============================================================ around a request */

export type Admission =
  | { readonly ok: true; readonly reservation: Reservation }
  | {
      readonly ok: false;
      readonly reason: "exhausted" | "no_budget" | "unavailable" | "too_large";
      readonly state: BudgetState | null;
    };

/**
 * How long a hold survives without being resolved.
 *
 * Generous against the request timeout, because the failure this guards is a
 * process that died mid-request — and a hold that outlives its request by a few
 * minutes costs a reader a little headroom, while one that expires early lets
 * the same request be paid for twice.
 */
const RESERVATION_TTL_MS = 10 * 60 * 1000;

/**
 * Claims budget for a request that has not happened yet.
 *
 * The amount is the WORST case for this exact request — this model, this
 * question, this deployment's output cap and tool budget — and the claim is
 * atomic: the ledger compares the ceiling against spent + reserved + this
 * amount and writes the hold in one statement, so two concurrent questions
 * cannot both find room only one of them can have.
 *
 * A refusal here means **no request is made**. That is the whole point:
 * discovering a budget was exceeded after spending the money is not
 * enforcement, it is reporting.
 */
export async function beginRequest(
  accountId: string,
  model: ModelId,
  question: string,
  depth: "standard" | "deep",
  when = new Date(),
): Promise<Admission> {
  const store = ledger();
  if (!store.available) return { ok: false, reason: "unavailable", state: null };

  const shape = shapeForQuestion(question, depth);

  /*
   * Refused before a hold is taken, not after.
   *
   * A request past the vendor's long-context boundary is priced by rates this
   * catalogue does not carry, so reserving for it would hold an amount that
   * bears no relation to what it costs.
   */
  if (!withinRequestCeiling(shape)) {
    return { ok: false, reason: "too_large", state: null };
  }

  const period = periodOf(when);
  const amountMicros = reservationMicros(model, shape);
  const snapshot = rateSnapshot(model);

  const reservation: Reservation = {
    id: randomUUID(),
    accountId,
    period,
    model,
    amountMicros,
    catalogueVersion: CATALOGUE_VERSION,
    rates: {
      inputMicrosPerMillion: snapshot.inputMicrosPerMillion,
      cachedInputMicrosPerMillion: snapshot.cachedInputMicrosPerMillion,
      outputMicrosPerMillion: snapshot.outputMicrosPerMillion,
    },
    expiresAt: new Date(when.getTime() + RESERVATION_TTL_MS).toISOString(),
  };

  try {
    const outcome = await store.ledger.reserve(reservation);
    if (outcome.ok) return { ok: true, reservation: outcome.reservation };
    return outcome.reason === "unavailable"
      ? { ok: false, reason: "unavailable", state: null }
      : {
          ok: false,
          reason: outcome.reason,
          state: stateOf(outcome.usage, amountMicros),
        };
  } catch {
    /*
     * Fail closed. A ledger that cannot answer cannot enforce, and spending
     * money because the meter is broken is the wrong direction to fail in.
     */
    return { ok: false, reason: "unavailable", state: null };
  }
}

/**
 * THE LAST THING BEFORE THE REQUEST LEAVES.
 *
 * Records that the money is no longer refundable. The caller must not send
 * anything unless this returns true: any other answer means the hold is gone or
 * already spoken for, and sending on the strength of a hold that does not exist
 * is spending unmetered money.
 */
export async function dispatchRequest(reservation: Reservation): Promise<boolean> {
  const store = ledger();
  if (!store.available) return false;
  try {
    const outcome = await store.ledger.dispatch(reservation.id, new Date().toISOString());
    return outcome === "dispatched";
  } catch {
    return false;
  }
}

/**
 * Replaces the hold with what the request actually cost.
 *
 * Priced with the rates recorded ON THE RESERVATION, not with today's
 * catalogue: a price that changed between the reservation and the settlement
 * must not rewrite what this request cost. Cached input is priced at the cached
 * rate when the vendor reports it.
 *
 * A model that answered without reporting tokens keeps the reserved amount
 * rather than being recorded as free.
 */
export async function completeRequest(
  reservation: Reservation,
  usage: Partial<TokenUsage> | null,
): Promise<void> {
  const store = ledger();
  if (!store.available) return;

  const actual =
    usage == null || usage.inputTokens == null || usage.outputTokens == null
      ? reservation.amountMicros
      : costAtRates(reservation, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens ?? 0,
        });

  try {
    await store.ledger.settle(reservation.id, actual);
  } catch {
    /* The hold expires on its own. Losing a settlement must not fail a reply. */
  }
}

/**
 * What a request cost, at the rates its reservation recorded.
 *
 * Integer arithmetic, multiply-then-divide, rounded up — the same rules as the
 * catalogue, applied to the snapshot rather than to today's prices.
 */
export function costAtRates(reservation: Reservation, usage: TokenUsage): Micros {
  const cached = Math.min(Math.max(0, Math.ceil(usage.cachedInputTokens ?? 0)), usage.inputTokens);
  const fresh = Math.max(0, usage.inputTokens - cached);
  const at = (tokens: number, rate: number): number =>
    tokens <= 0 ? 0 : Math.ceil((Math.ceil(tokens) * rate) / 1_000_000);

  /*
   * The snapshot, not the catalogue. If it is somehow empty — a row written
   * before rates were recorded — today's catalogue is a better answer than
   * zero, and zero is the one answer that would silently give away money.
   */
  const rates =
    reservation.rates.inputMicrosPerMillion > 0
      ? reservation.rates
      : rateSnapshot(reservation.model);

  return (
    at(fresh, rates.inputMicrosPerMillion) +
    at(cached, rates.cachedInputMicrosPerMillion) +
    at(usage.outputTokens, rates.outputMicrosPerMillion)
  );
}

/**
 * Drops the hold and charges nothing — ONLY when nothing was sent.
 *
 * Returns whether the money actually came back. A dispatched request cannot be
 * refunded: the ledger refuses, and the caller's job is then to record it as
 * uncertain rather than to pretend the reader was not charged.
 */
export async function abandonRequest(reservation: Reservation): Promise<boolean> {
  const store = ledger();
  if (!store.available) return false;
  try {
    return (await store.ledger.release(reservation.id)) === "released";
  } catch {
    return false;
  }
}

/**
 * A DISPATCHED REQUEST WHOSE OUTCOME NOBODY LEARNED.
 *
 * Charged in full and flagged. This is the deliberate opposite of a release:
 * the vendor may have completed and billed the work, and giving the headroom
 * back would tell a reader they have money they have already spent.
 */
export async function markRequestUncertain(reservation: Reservation): Promise<void> {
  const store = ledger();
  if (!store.available) return;
  try {
    await store.ledger.markUncertain(reservation.id);
  } catch {
    /* Expiry reaches the same conclusion. */
  }
}

/**
 * Resolves a request that failed, without guessing what it cost.
 *
 * The distinction the whole lifecycle exists for: `dispatched` says whether
 * anything was sent. Not sent means release; sent means uncertain.
 */
export async function failRequest(reservation: Reservation, dispatched: boolean): Promise<void> {
  if (!dispatched) {
    const released = await abandonRequest(reservation);
    /*
     * The ledger is the authority on what happened, not this flag. If it
     * refuses the release, the hold had already been dispatched by somebody and
     * the honest record is uncertain.
     */
    if (released) return;
  }
  await markRequestUncertain(reservation);
}

/** Reclaims holds nobody resolved. Safe to call at any time. */
export async function reclaimExpired(when = new Date()): Promise<number> {
  const store = ledger();
  if (!store.available) return 0;
  try {
    return await store.ledger.expire(when.toISOString());
  } catch {
    return 0;
  }
}

/** What one request would cost at a given usage, today. For display only. */
export function costToday(model: ModelId, usage: TokenUsage): Micros {
  return costOf(model, usage);
}

/** The label for a model, without importing the catalogue at every call site. */
export function labelFor(model: ModelId): string {
  return modelEntry(model).label;
}

export type { AccountUsage, Period, Reservation };
