/**
 * THE MODEL CATALOGUE. ONE SOURCE, SERVER-OWNED, VERSIONED.
 *
 * Every price, label, endpoint and capability in the product comes from here.
 * Before this file the same facts were scattered: `gpt-5.6-sol` was an env
 * default, `gpt-5.6-luna` was another, the allowlist was a comma-separated
 * string, and nothing anywhere said what either cost. A price written into a
 * component is a price that goes stale silently, and a cost estimate built from
 * a stale price is worse than no estimate because a reader believes it.
 *
 * This module is NOT `server-only`: labels and prices render in a page and the
 * tests import all of it. It holds no secret.
 *
 * ## OpenAI, and only OpenAI
 *
 * An earlier draft of this file carried five providers and seven models. Four
 * of those providers had never been reached by any request, and every figure
 * attached to them — price, base URL, model identifier — was a considered
 * placeholder rather than a checked fact. Offering a reader a model whose cost
 * nobody has verified, against a budget the same file computes, is a way of
 * being confidently wrong about money.
 *
 * So the surface is one vendor, and the figures below are the published ones,
 * checked on the date recorded in `PRICES_VERIFIED_AT` against
 * `PRICE_SOURCE_URL`.
 *
 * The *interface* stays provider-neutral — `ProviderId`, `Transport` and the
 * provider record all remain — because the cost of adding a second vendor later
 * should be a catalogue entry and a transport, not a refactor. What is gone is
 * any vendor that can be selected or routed to without somebody first checking
 * its numbers.
 *
 * ## Versioned, because prices change
 *
 * `CATALOGUE_VERSION` moves whenever a price does, and every ledger entry
 * records both the version AND the exact rates it was priced under — so a
 * month's spending is explained by the numbers in force when it happened rather
 * than by today's. Verified is not permanent: a vendor can change a price the
 * afternoon after somebody checked it, which is why the date is recorded next
 * to the figures and `pricesNeedRechecking()` says when it has aged.
 */

/** Bumped whenever any price, endpoint or model in this file changes. */
export const CATALOGUE_VERSION = "2026-08-31.1";

/* The catalogue, its prices and their provenance: ADR-0031. */

/**
 * When these figures were last checked against the vendor's published list.
 *
 * A date, not a boolean, because "verified" decays. The rates below were read
 * from `PRICE_SOURCE_URL` on this date; OpenAI can change them tomorrow without
 * telling this repository, and a figure nobody has looked at for a year is not
 * meaningfully verified however true it was when written.
 */
export const PRICES_VERIFIED_AT: string | null = "2026-08-31";

/** Where the figures came from. The address makes rechecking a finite task. */
export const PRICE_SOURCE_URL = "https://developers.openai.com/api/docs/models";

export const PRICES_VERIFIED = PRICES_VERIFIED_AT !== null;

/**
 * How long a price check stands before it should be repeated.
 *
 * Ninety days is a judgement, not a vendor promise. It exists so that "we
 * checked" cannot quietly become "we checked once, years ago".
 */
export const PRICE_RECHECK_AFTER_DAYS = 90;

export function pricesNeedRechecking(now: Date = new Date()): boolean {
  if (PRICES_VERIFIED_AT === null) return true;
  const checked = Date.parse(`${PRICES_VERIFIED_AT}T00:00:00Z`);
  if (Number.isNaN(checked)) return true;
  const days = Math.floor((now.getTime() - checked) / 86_400_000);
  return days > PRICE_RECHECK_AFTER_DAYS;
}

/**
 * Money is integers. Always.
 *
 * Micro-dollars: one millionth of a US dollar. Small enough that a single token
 * of the cheapest model is a whole number, large enough that a year of a busy
 * account fits in a double with room to spare. No float ever touches a currency
 * amount in this system — `0.1 + 0.2` is the oldest bug in billing software.
 */
export const MICROS_PER_DOLLAR = 1_000_000;

/* ================================================================= providers */

/**
 * The providers Observer can route to.
 *
 * One member, deliberately. The type exists so the ledger, the credential store
 * and the settings page are already written for more than one — adding a second
 * is a row here plus a transport, with no signature changes anywhere.
 */
export type ProviderId = "openai";

/**
 * How Observer talks to a provider.
 *
 * One shape today. Named rather than assumed so a second vendor with a
 * different request shape has somewhere to declare itself.
 */
export type Transport = "openai-compatible";

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly transport: Transport;
  /** Verified against `PRICE_SOURCE_URL` on `PRICES_VERIFIED_AT`. */
  readonly baseUrl: string;
  /** Where a reader creates a key. Shown as a link, never fetched. */
  readonly consoleUrl: string;
  /** Where the figures below came from, so rechecking has an address. */
  readonly pricingUrl: string;
  /** A shape check only, and deliberately loose. Never a vendor prefix rule. */
  readonly keyHint: string;
}

export const PROVIDERS: readonly Provider[] = Object.freeze([
  {
    id: "openai",
    label: "OpenAI",
    transport: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    consoleUrl: "https://platform.openai.com/api-keys",
    pricingUrl: PRICE_SOURCE_URL,
    keyHint: "From the OpenAI console.",
  },
]);

const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function providerFor(id: ProviderId): Provider {
  const provider = PROVIDER_BY_ID.get(id);
  if (provider === undefined) throw new Error(`No provider "${id}"`);
  return provider;
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_BY_ID.has(value as ProviderId);
}

export const PROVIDER_IDS: readonly ProviderId[] = PROVIDERS.map((p) => p.id);

/* ==================================================================== models */

export type ModelId = "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";

export interface CatalogueEntry {
  /**
   * OBSERVER'S OWN NAME FOR THE MODEL.
   *
   * Stored on preferences, reservations and audit rows, so it is a key in this
   * system's data and must outlive whatever a vendor calls things this quarter.
   */
  readonly id: ModelId;
  /**
   * THE EXACT STRING SENT TO THE VENDOR.
   *
   * Separate from `id` deliberately. They match today, and treating them as one
   * thing would mean that a vendor renaming a model requires rewriting every
   * stored preference and every reservation ever recorded. One field changes
   * instead.
   */
  readonly apiIdentifier: string;
  readonly provider: ProviderId;
  readonly label: string;
  /** One line, in the reader's terms rather than the vendor's. */
  readonly summary: string;
  /** Micro-dollars per one million input tokens. */
  readonly inputMicrosPerMillion: number;
  /**
   * Micro-dollars per one million CACHED input tokens.
   *
   * A tenth of the fresh rate across the range. Observer never assumes it when
   * reserving — a reservation that counted on a cache hit would under-hold on
   * the first question of every session — but it prices a settlement with it
   * when the vendor reports cached tokens, because charging a reader the fresh
   * rate for something they were billed a tenth for is simply wrong.
   */
  readonly cachedInputMicrosPerMillion: number;
  /** Micro-dollars per one million output tokens. */
  readonly outputMicrosPerMillion: number;
  readonly selectableAsDefault: boolean;
  readonly selectableForDeepReport: boolean;
  /** Ordering in every list. Cheapest first, which is the useful order. */
  readonly rank: number;
}

/**
 * Every model Observer offers.
 *
 * Three, one vendor, with the published rates read from `PRICE_SOURCE_URL` on
 * `PRICES_VERIFIED_AT`:
 *
 *   Luna    $0.20 in · $0.02 cached · $1.20 out, per million tokens
 *   Terra   $2.00 in · $0.20 cached · $12.00 out
 *   Sol     $4.00 in · $0.40 cached · $20.00 out
 */
export const CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  {
    id: "gpt-5.6-luna",
    apiIdentifier: "gpt-5.6-luna",
    provider: "openai",
    label: "GPT-5.6 Luna",
    summary: "Economical and fast. Good for a straightforward question about one period.",
    inputMicrosPerMillion: 200_000,
    cachedInputMicrosPerMillion: 20_000,
    outputMicrosPerMillion: 1_200_000,
    selectableAsDefault: true,
    selectableForDeepReport: false,
    rank: 1,
  },
  {
    id: "gpt-5.6-terra",
    apiIdentifier: "gpt-5.6-terra",
    provider: "openai",
    label: "GPT-5.6 Terra",
    summary: "Balanced. The recommended default for everyday Observer questions.",
    inputMicrosPerMillion: 2_000_000,
    cachedInputMicrosPerMillion: 200_000,
    outputMicrosPerMillion: 12_000_000,
    selectableAsDefault: true,
    selectableForDeepReport: true,
    rank: 2,
  },
  {
    id: "gpt-5.6-sol",
    apiIdentifier: "gpt-5.6-sol",
    provider: "openai",
    label: "GPT-5.6 Sol",
    summary: "Deepest analysis. Slower and dearer; worth it for a report acted on.",
    inputMicrosPerMillion: 4_000_000,
    cachedInputMicrosPerMillion: 400_000,
    outputMicrosPerMillion: 20_000_000,
    selectableAsDefault: true,
    selectableForDeepReport: true,
    rank: 3,
  },
]);

/** The recommended default, named once. */
export const RECOMMENDED_DEFAULT: ModelId = "gpt-5.6-terra";

const BY_ID = new Map(CATALOGUE.map((entry) => [entry.id, entry]));

export function isModelId(value: string): value is ModelId {
  return BY_ID.has(value as ModelId);
}

export function modelEntry(id: ModelId): CatalogueEntry {
  const entry = BY_ID.get(id);
  if (entry === undefined) throw new Error(`No catalogue entry for "${id}"`);
  return entry;
}

/** Everything, cheapest first. The list every selector renders. */
export function catalogue(): readonly CatalogueEntry[] {
  return [...CATALOGUE].sort((a, b) => a.rank - b.rank);
}

/**
 * The model a connection test uses for one provider.
 *
 * The cheapest of that vendor's models, because a probe should cost as little
 * as a probe can cost, and because the cheapest model is the one an account is
 * most likely to be entitled to — a test that fails on the dearest model tells
 * a reader their key is broken when it is merely modest.
 *
 * This is a PROBE model, never a fallback for a question. Nothing in the ask
 * path may call it: a question is answered by the model the reader chose or it
 * is refused, and quietly substituting something cheaper would spend their
 * money on an answer they did not ask for.
 */
export function probeModelFor(provider: ProviderId): ModelId {
  const first = catalogue().find((entry) => entry.provider === provider);
  if (first === undefined) throw new Error(`No catalogue model for provider "${provider}"`);
  return first.id;
}

/** The models belonging to providers this account has connected. */
export function modelsForProviders(connected: readonly ProviderId[]): readonly CatalogueEntry[] {
  const held = new Set(connected);
  return catalogue().filter((entry) => held.has(entry.provider));
}

/* =========================================================== the long context */

/**
 * WHERE THE PUBLISHED RATES STOP APPLYING.
 *
 * The vendor documents a second, higher price band for requests whose input
 * exceeds 272,000 tokens. The rates in this file are the ordinary band only, so
 * a request past that boundary would be reserved and settled at prices that do
 * not apply to it — an under-charge in Observer's ledger against a real charge
 * in the reader's OpenAI bill, which is the exact failure a budget exists to
 * prevent.
 *
 * Rather than carry a second untested rate table, Observer refuses to send a
 * request that large. `MAX_REQUEST_INPUT_TOKENS` sits well below the boundary,
 * the transport enforces it before any request leaves, and a test proves both
 * the ceiling and its distance from the band it is protecting.
 *
 * Supporting the long-context band is a catalogue change plus a settlement
 * branch, and it is deliberately not being guessed at here.
 */
export const LONG_CONTEXT_BOUNDARY_TOKENS = 272_000;

/** The largest input Observer will send. Enforced in `providers/transport.ts`. */
export const MAX_REQUEST_INPUT_TOKENS = 200_000;

export function withinInputCeiling(inputTokens: number): boolean {
  return inputTokens <= MAX_REQUEST_INPUT_TOKENS;
}

/* ==================================================================== pricing */

/**
 * The rates a specific amount of money was computed with.
 *
 * Copied onto every ledger entry rather than looked up when the entry is read.
 * A price that changes must not retroactively rewrite what last month cost, and
 * a catalogue version alone would only tell a reader which file to go and read.
 */
export interface RateSnapshot {
  readonly catalogueVersion: string;
  readonly model: ModelId;
  readonly inputMicrosPerMillion: number;
  readonly cachedInputMicrosPerMillion: number;
  readonly outputMicrosPerMillion: number;
}

export function rateSnapshot(id: ModelId): RateSnapshot {
  const entry = modelEntry(id);
  return {
    catalogueVersion: CATALOGUE_VERSION,
    model: entry.id,
    inputMicrosPerMillion: entry.inputMicrosPerMillion,
    cachedInputMicrosPerMillion: entry.cachedInputMicrosPerMillion,
    outputMicrosPerMillion: entry.outputMicrosPerMillion,
  };
}

/** Tokens at a per-million rate, as an integer, never rounded down. */
function atRate(tokens: number, microsPerMillion: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  /*
   * Multiply first, divide once, ceil.
   *
   * Both operands are integers and the product of a plausible token count and a
   * per-million rate is far inside the safe integer range, so this is exact
   * integer arithmetic with a single deliberate rounding at the end — upward,
   * because a rounding that favours the ledger over the reader is the direction
   * that lets an account overspend a fraction on every request.
   */
  return Math.ceil((Math.ceil(tokens) * microsPerMillion) / 1_000_000);
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Of `inputTokens`, how many the vendor reported as cache hits. */
  readonly cachedInputTokens?: number;
}

/**
 * What a request cost, in micro-dollars.
 *
 * Cached input is priced at the cached rate and removed from the fresh count,
 * so a reader is charged what the vendor charged rather than the list price of
 * tokens the vendor discounted.
 */
export function costOf(id: ModelId, usage: TokenUsage): number {
  const entry = modelEntry(id);
  const cached = Math.min(Math.max(0, Math.ceil(usage.cachedInputTokens ?? 0)), usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  return (
    atRate(fresh, entry.inputMicrosPerMillion) +
    atRate(cached, entry.cachedInputMicrosPerMillion) +
    atRate(usage.outputTokens, entry.outputMicrosPerMillion)
  );
}

/** The two-argument form, for a settlement with no cache report. */
export function costMicros(id: ModelId, inputTokens: number, outputTokens: number): number {
  return costOf(id, { inputTokens, outputTokens });
}

/* ================================================================ reservation */

/**
 * WHAT A REQUEST MAY COST AT WORST, BEFORE IT IS MADE.
 *
 * Not a typical figure and not an average: the most this request can cost if
 * every bound it is allowed is reached. A reservation is a promise that the
 * budget cannot be exceeded, and a promise built on a typical case is not one.
 *
 * Three things bound an Observer request, and all three are inputs here rather
 * than constants, because two of them vary per request:
 *
 *   promptTokens      the measured size of what is actually being sent
 *   maxOutputTokens   the cap this deployment puts on each answer
 *   turns             how many model turns the agent may take (plan, compose)
 *
 * Tool results are the fourth: they are computed locally and land in the input
 * of the composing turn, so they are counted once, at their allowed ceiling.
 *
 * Cached input is deliberately NOT assumed. A cache hit makes a request cheaper
 * than reserved, which corrects itself at settlement; assuming one makes the
 * reservation too small, which does not.
 */
export interface RequestShape {
  /** Measured, not guessed. What the caller is about to send. */
  readonly promptTokens: number;
  /** The ceiling on what locally computed tool results may add. */
  readonly toolResultTokens: number;
  /** The per-turn output cap this deployment sends. */
  readonly maxOutputTokens: number;
  /** Model turns permitted for this request. */
  readonly turns: number;
}

export function worstCaseTokens(shape: RequestShape): TokenUsage {
  const turns = Math.max(1, Math.ceil(shape.turns));
  /*
   * Every turn re-sends the conversation, and the tool results join it once the
   * tools have run — so the prompt is counted per turn and the results are
   * counted for every turn after the first.
   */
  const inputTokens =
    Math.ceil(shape.promptTokens) * turns + Math.ceil(shape.toolResultTokens) * (turns - 1);
  return { inputTokens, outputTokens: Math.ceil(shape.maxOutputTokens) * turns };
}

export function reservationMicros(id: ModelId, shape: RequestShape): number {
  return costOf(id, worstCaseTokens(shape));
}

/**
 * Micro-dollars as money a person reads.
 *
 * `Intl`, never hand-rolled: the reader's grouping and the currency symbol, and
 * four decimal places for the small amounts a single question costs — "$0.00"
 * for a real charge is worse than no figure at all.
 */
export function formatMicros(micros: number, locale = "en-GB"): string {
  const dollars = micros / MICROS_PER_DOLLAR;
  const fractionDigits = dollars !== 0 && Math.abs(dollars) < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(dollars);
}

/** Whole dollars to micro-dollars, for a budget a person typed. */
export function dollarsToMicros(dollars: number): number {
  return Math.round(dollars * MICROS_PER_DOLLAR);
}

/**
 * Whether this catalogue may price a production deployment.
 *
 * Verified figures AND a check recent enough to mean something. A test asserts
 * a production environment does not run on prices nobody has looked at, so an
 * ageing catalogue becomes a failing gate rather than a wrong number on
 * somebody's screen.
 */
export function catalogueReadyForProduction(now: Date = new Date()): boolean {
  return PRICES_VERIFIED && !pricesNeedRechecking(now);
}

/** The sentence every surface showing money must carry. */
export const ESTIMATE_CAVEAT =
  "Observer's estimate, priced from OpenAI's published rates checked on 2026-08-31. OpenAI bills the account that owns the API key separately, on its own figures, and this budget is not an invoice or a guaranteed hard limit.";
