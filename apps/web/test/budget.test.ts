import { beforeEach, describe, expect, it } from "vitest";

import {
  CATALOGUE,
  CATALOGUE_VERSION,
  LONG_CONTEXT_BOUNDARY_TOKENS,
  MAX_REQUEST_INPUT_TOKENS,
  MICROS_PER_DOLLAR,
  PRICES_VERIFIED,
  PRICES_VERIFIED_AT,
  PRICE_RECHECK_AFTER_DAYS,
  PRICE_SOURCE_URL,
  PROVIDERS,
  RECOMMENDED_DEFAULT,
  catalogue,
  catalogueReadyForProduction,
  costMicros,
  costOf,
  dollarsToMicros,
  formatMicros,
  isModelId,
  modelEntry,
  modelsForProviders,
  pricesNeedRechecking,
  probeModelFor,
  rateSnapshot,
  reservationMicros,
  withinInputCeiling,
  worstCaseTokens,
  type ModelId,
} from "../src/lib/models/catalogue";
import { ledger, periodOf, type Reservation } from "../src/lib/budget/ledger";
import { resetTestLedger } from "../src/lib/budget/test-ledger";
import {
  abandonRequest,
  beginRequest,
  budgetFor,
  completeRequest,
  costAtRates,
  dispatchRequest,
  failRequest,
  markRequestUncertain,
  nextQuestionMicros,
  reclaimExpired,
  setBudget,
  shapeForQuestion,
  stateOf,
  thresholdFor,
  typicalQuestionMicros,
} from "../src/lib/budget/service";
import { resetTestPreferences } from "../src/lib/models/test-preferences";
import {
  defaultPreferences,
  preferenceStore,
  resolveModelChoice,
  type Preferences,
} from "../src/lib/models/preferences";

/**
 * THE MODEL CATALOGUE AND THE USAGE BUDGET.
 *
 * Money is the subject, so the arithmetic is the test: integers throughout, a
 * ceiling that holds under concurrency, a hold that becomes a charge or comes
 * back — and, above all, a hold that comes back ONLY when nothing was sent.
 *
 * Nothing here reaches a provider. `OPENAI_API_KEY` is deleted before the first
 * test, exactly as in the credential suite.
 */

const DOLLAR = MICROS_PER_DOLLAR;

const ALICE = "acct_budget_alice";
const BOB = "acct_budget_bob";

const QUESTION = "What changed this month?";

const HARNESS: Readonly<Record<string, string>> = Object.freeze({
  OBSERVER_CREDENTIAL_KEY: "0".repeat(64),
  OBSERVER_CREDENTIAL_TEST_STORE: "browser-tests-only",
  OBSERVER_SYNTHETIC_HARNESS: "1",
  OBSERVER_ENVIRONMENT: "development",
});

beforeEach(() => {
  delete process.env["OPENAI_API_KEY"];
  delete process.env["SUPABASE_URL"];
  delete process.env["SUPABASE_SECRET_KEY"];
  for (const [k, v] of Object.entries(HARNESS)) process.env[k] = v;
  resetTestLedger();
  resetTestPreferences();
});

/* ================================================================ catalogue */

describe("the catalogue is the one source", () => {
  it("names one provider, and it is the one that was checked", () => {
    /*
     * An earlier draft carried five vendors and seven models. Four of those
     * vendors had never been reached by any request and every price attached to
     * them was a placeholder. Offering a reader a model whose cost nobody has
     * verified, against a budget computed from that cost, is a way of being
     * confidently wrong about money.
     */
    expect(PROVIDERS.map((p) => p.id)).toEqual(["openai"]);
    expect(PROVIDERS[0]?.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("carries the three models, with the published rates", () => {
    expect(catalogue().map((entry) => entry.id)).toEqual([
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
    ]);

    /* Dollars per million tokens, as read from the vendor's own list. */
    const expected: Record<ModelId, [number, number, number]> = {
      "gpt-5.6-luna": [200_000, 20_000, 1_200_000],
      "gpt-5.6-terra": [2_000_000, 200_000, 12_000_000],
      "gpt-5.6-sol": [4_000_000, 400_000, 20_000_000],
    };

    for (const entry of CATALOGUE) {
      const [input, cached, output] = expected[entry.id];
      expect(entry.inputMicrosPerMillion, entry.id).toBe(input);
      expect(entry.cachedInputMicrosPerMillion, entry.id).toBe(cached);
      expect(entry.outputMicrosPerMillion, entry.id).toBe(output);
    }
  });

  it("records when the prices were checked, and against what", () => {
    expect(PRICES_VERIFIED).toBe(true);
    expect(PRICES_VERIFIED_AT).toBe("2026-08-31");
    expect(PRICE_SOURCE_URL).toBe("https://developers.openai.com/api/docs/models");
    expect(CATALOGUE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("treats a verified price as dated rather than permanent", () => {
    /*
     * A vendor can change a price the afternoon after somebody checks it. The
     * date is recorded so "we verified" cannot quietly become "we verified
     * once, years ago", and the readiness gate closes when it ages out.
     */
    const checked = new Date("2026-08-31T12:00:00Z");
    expect(pricesNeedRechecking(checked)).toBe(false);
    expect(catalogueReadyForProduction(checked)).toBe(true);

    const later = new Date(checked.getTime() + (PRICE_RECHECK_AFTER_DAYS + 1) * 86_400_000);
    expect(pricesNeedRechecking(later), "the check has aged out").toBe(true);
    expect(catalogueReadyForProduction(later), "and so has the readiness").toBe(false);
  });

  it("gives every model a wire identifier of its own", () => {
    for (const entry of catalogue()) {
      expect(entry.apiIdentifier.length, entry.id).toBeGreaterThan(0);
      expect(entry.label, entry.id).not.toBe(entry.apiIdentifier);
    }
  });

  it("recommends Terra, and lists cheapest first", () => {
    expect(RECOMMENDED_DEFAULT).toBe("gpt-5.6-terra");
    const ranks = catalogue().map((entry) => entry.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("prices cached input at the cached rate, not the fresh one", () => {
    /*
     * A tenth of the fresh rate. Charging a reader list price for tokens the
     * vendor discounted is simply wrong, and the arithmetic is easy to get
     * backwards: cached tokens are a SUBSET of the input count, not an extra.
     */
    const fresh = costOf("gpt-5.6-terra", { inputTokens: 1_000_000, outputTokens: 0 });
    const allCached = costOf("gpt-5.6-terra", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 1_000_000,
    });

    expect(fresh).toBe(2_000_000);
    expect(allCached).toBe(200_000);

    const half = costOf("gpt-5.6-terra", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 500_000,
    });
    expect(half, "half at each rate").toBe(1_000_000 + 100_000);
  });

  it("never counts more cached tokens than were sent", () => {
    const absurd = costOf("gpt-5.6-luna", {
      inputTokens: 1_000,
      outputTokens: 0,
      cachedInputTokens: 999_999,
    });
    /* Clamped to the input count: 1,000 tokens at the cached rate, rounded up. */
    expect(absurd).toBe(Math.ceil((1_000 * 20_000) / 1_000_000));
  });

  it("prices in integers, and never rounds a cost down", () => {
    for (const entry of catalogue()) {
      for (const tokens of [1, 7, 999, 1_001, 123_457]) {
        const cost = costMicros(entry.id, tokens, tokens);
        expect(Number.isInteger(cost), `${entry.id} @ ${tokens}`).toBe(true);
        const exact =
          (tokens * entry.inputMicrosPerMillion + tokens * entry.outputMicrosPerMillion) /
          1_000_000;
        expect(cost, `${entry.id} @ ${tokens}`).toBeGreaterThanOrEqual(exact);
      }
    }
  });

  it("converts dollars to integer micro-dollars", () => {
    expect(dollarsToMicros(1)).toBe(1_000_000);
    expect(dollarsToMicros(0.01)).toBe(10_000);
    expect(Number.isInteger(dollarsToMicros(2.345))).toBe(true);
  });

  it("shows a real charge rather than a rounded zero", () => {
    expect(formatMicros(500)).toMatch(/0\.0005/);
    expect(formatMicros(2_500_000)).toMatch(/2\.50/);
  });

  it("offers only the models whose provider an account has connected", () => {
    expect(modelsForProviders([]).length).toBe(0);
    expect(modelsForProviders(["openai"]).length).toBe(3);
  });

  it("names a probe model that is the cheapest, and never a fallback", () => {
    /*
     * The probe model is for TESTING A KEY, and the cheapest is the right
     * choice: a probe should cost as little as possible. Nothing in the ask
     * path may use it — a question is answered by the model the reader chose or
     * it is refused.
     */
    expect(probeModelFor("openai")).toBe("gpt-5.6-luna");
  });

  it("refuses a model id that is not in the catalogue", () => {
    expect(isModelId("gpt-5.6-terra")).toBe(true);
    expect(isModelId("claude-opus-5-max")).toBe(false);
    expect(isModelId("kimi-k3")).toBe(false);
    expect(() => modelEntry("kimi-k3" as ModelId)).toThrow(/No catalogue entry/);
  });
});

/* ====================================================== the long-context band */

describe("the long-context band is refused rather than mispriced", () => {
  it("keeps the ceiling below the boundary it is protecting", () => {
    /*
     * The vendor prices input above 272,000 tokens differently. This catalogue
     * carries the ordinary band only, so a request past the boundary would be
     * reserved and settled at rates that do not apply to it. The ceiling sits
     * below the boundary with room to spare, and the transport enforces it.
     */
    expect(LONG_CONTEXT_BOUNDARY_TOKENS).toBe(272_000);
    expect(MAX_REQUEST_INPUT_TOKENS).toBeLessThan(LONG_CONTEXT_BOUNDARY_TOKENS);
    expect(withinInputCeiling(MAX_REQUEST_INPUT_TOKENS)).toBe(true);
    expect(withinInputCeiling(MAX_REQUEST_INPUT_TOKENS + 1)).toBe(false);
    expect(withinInputCeiling(LONG_CONTEXT_BOUNDARY_TOKENS)).toBe(false);
  });

  it("refuses an enormous question before any money is held", async () => {
    await setBudget(ALICE, 100 * DOLLAR);

    /* Far past the ceiling once the shape is expanded across turns. */
    const enormous = "x".repeat(MAX_REQUEST_INPUT_TOKENS * 4);
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", enormous, "standard");

    expect(admission.ok).toBe(false);
    if (!admission.ok) expect(admission.reason).toBe("too_large");

    const after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.reservedMicros, "nothing was held for it").toBe(0);
  });
});

/* ============================================== what a reservation is made of */

describe("a reservation is the worst case for the actual request", () => {
  it("counts every turn, the tool results and the output cap", () => {
    const shape = shapeForQuestion(QUESTION, "standard");
    const worst = worstCaseTokens(shape);

    /* Prompt on every turn; tool results on every turn after the first. */
    expect(worst.inputTokens).toBe(
      shape.promptTokens * shape.turns + shape.toolResultTokens * (shape.turns - 1),
    );
    expect(worst.outputTokens).toBe(shape.maxOutputTokens * shape.turns);
  });

  it("grows with the question, because the question is measured", () => {
    const small = nextQuestionMicros("gpt-5.6-terra", "Why?", "standard");
    const large = nextQuestionMicros("gpt-5.6-terra", "Why? ".repeat(2_000), "standard");
    expect(large, "a longer question reserves more").toBeGreaterThan(small);
  });

  it("reserves more for a deep report than for a question", () => {
    const standard = nextQuestionMicros("gpt-5.6-terra", QUESTION, "standard");
    const deep = nextQuestionMicros("gpt-5.6-terra", QUESTION, "deep");
    expect(deep).toBeGreaterThan(standard);
  });

  it("never assumes a cache hit", () => {
    /*
     * A cache hit makes a request cheaper than reserved, which corrects itself
     * at settlement. Assuming one makes the reservation too small, which does
     * not — so the worst case is priced entirely at the fresh rate.
     */
    const shape = shapeForQuestion(QUESTION, "standard");
    const worst = worstCaseTokens(shape);
    expect(reservationMicros("gpt-5.6-terra", shape)).toBe(
      costOf("gpt-5.6-terra", { inputTokens: worst.inputTokens, outputTokens: worst.outputTokens }),
    );
  });

  it("prices the same request differently for different models", () => {
    const shape = shapeForQuestion(QUESTION, "standard");
    const luna = reservationMicros("gpt-5.6-luna", shape);
    const terra = reservationMicros("gpt-5.6-terra", shape);
    const sol = reservationMicros("gpt-5.6-sol", shape);
    expect(luna).toBeLessThan(terra);
    expect(terra).toBeLessThan(sol);
  });
});

/* ============================================================== the ledger */

describe("the usage ledger", () => {
  const period = periodOf(new Date("2026-08-15T00:00:00Z"));

  const store = () => {
    const available = ledger();
    if (!available.available) throw new Error("the harness ledger should be available");
    return available.ledger;
  };

  const reservation = (id: string, account: string, micros: number): Reservation => ({
    id,
    accountId: account,
    period,
    model: "gpt-5.6-terra",
    amountMicros: micros,
    catalogueVersion: CATALOGUE_VERSION,
    rates: {
      inputMicrosPerMillion: 2_000_000,
      cachedInputMicrosPerMillion: 200_000,
      outputMicrosPerMillion: 12_000_000,
    },
    expiresAt: new Date("2026-08-15T01:00:00Z").toISOString(),
  });

  it("refuses everything until a budget is set", async () => {
    const outcome = await store().reserve(reservation("a", ALICE, DOLLAR));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("no_budget");
  });

  it("holds, then settles for what it actually cost", async () => {
    await store().setBudget(ALICE, period, 10 * DOLLAR);
    await store().reserve(reservation("b", ALICE, 3 * DOLLAR));

    const held = await store().usage(ALICE, period);
    expect(held.reservedMicros).toBe(3 * DOLLAR);
    expect(held.spentMicros).toBe(0);

    await store().settle("b", DOLLAR);

    const settled = await store().usage(ALICE, period);
    expect(settled.reservedMicros, "the hold is gone").toBe(0);
    expect(settled.spentMicros, "and the real cost is recorded").toBe(DOLLAR);
    expect(settled.requests).toBe(1);
  });

  it("settles and releases idempotently", async () => {
    await store().setBudget(ALICE, period, 10 * DOLLAR);
    await store().reserve(reservation("c", ALICE, 2 * DOLLAR));
    await store().settle("c", DOLLAR);
    await store().settle("c", DOLLAR);
    expect((await store().usage(ALICE, period)).spentMicros).toBe(DOLLAR);
  });

  it("stops at the ceiling rather than past it", async () => {
    await store().setBudget(ALICE, period, 5 * DOLLAR);
    expect((await store().reserve(reservation("d1", ALICE, 4 * DOLLAR))).ok).toBe(true);

    const overflow = await store().reserve(reservation("d2", ALICE, 2 * DOLLAR));
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.reason).toBe("exhausted");
  });

  it("holds the line under concurrent reservations", async () => {
    /*
     * Twenty at once against room for ten. A read-then-write would let every
     * one of them see the same balance and pass; the harness ledger does its
     * check and its write in one synchronous stretch, for the same reason the
     * database does it in one statement.
     */
    await store().setBudget(ALICE, period, 10 * DOLLAR);
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, i) => store().reserve(reservation(`e${i}`, ALICE, DOLLAR))),
    );
    expect(outcomes.filter((o) => o.ok)).toHaveLength(10);
    expect((await store().usage(ALICE, period)).reservedMicros).toBe(10 * DOLLAR);
  });

  it("keeps one account's ledger out of another's", async () => {
    await store().setBudget(ALICE, period, 10 * DOLLAR);
    await store().setBudget(BOB, period, 2 * DOLLAR);
    await store().reserve(reservation("f", ALICE, 5 * DOLLAR));

    expect((await store().usage(BOB, period)).reservedMicros).toBe(0);
    expect((await store().usage(BOB, period)).budgetMicros).toBe(2 * DOLLAR);
  });

  it("starts a new month at zero and keeps the ceiling", async () => {
    const august = periodOf(new Date("2026-08-31T23:59:59Z"));
    const september = periodOf(new Date("2026-09-01T00:00:00Z"));
    expect(august).toBe("2026-08");
    expect(september).toBe("2026-09");

    await store().setBudget(ALICE, august, 10 * DOLLAR);
    await store().reserve(reservation("aug", ALICE, 8 * DOLLAR));
    await store().settle("aug", 8 * DOLLAR);

    const next = await store().usage(ALICE, september);
    expect(next.spentMicros, "September has spent nothing").toBe(0);
    expect(next.budgetMicros, "the ceiling carries").toBe(10 * DOLLAR);
    expect(next.reservedMicros).toBe(0);
    expect(next.requests).toBe(0);

    const previous = await store().usage(ALICE, august);
    expect(previous.spentMicros, "and August is left alone").toBe(8 * DOLLAR);
  });

  it("carries nothing for an account that never set a ceiling", async () => {
    const usage = await store().usage("acct_nobody", periodOf(new Date("2026-09-01T00:00:00Z")));
    expect(usage.budgetMicros).toBe(0);
    expect(usage.spentMicros).toBe(0);
  });

  it("computes the period from UTC, not from the local clock", () => {
    expect(periodOf(new Date("2026-08-31T23:30:00Z"))).toBe("2026-08");
    expect(periodOf(new Date("2026-09-01T00:30:00Z"))).toBe("2026-09");
  });
});

/* =============================================== the five states of a hold */

describe("a dispatched request is never refunded", () => {
  const period = periodOf(new Date("2026-08-15T00:00:00Z"));

  const store = () => {
    const available = ledger();
    if (!available.available) throw new Error("the harness ledger should be available");
    return available.ledger;
  };

  const held = (id: string, micros: number): Reservation => ({
    id,
    accountId: ALICE,
    period,
    model: "gpt-5.6-terra",
    amountMicros: micros,
    catalogueVersion: CATALOGUE_VERSION,
    rates: {
      inputMicrosPerMillion: 2_000_000,
      cachedInputMicrosPerMillion: 200_000,
      outputMicrosPerMillion: 12_000_000,
    },
    expiresAt: new Date("2026-08-15T01:00:00Z").toISOString(),
  });

  it("releases a hold that was never dispatched, in full", async () => {
    await store().setBudget(ALICE, period, 10 * DOLLAR);
    await store().reserve(held("r1", 3 * DOLLAR));

    expect(await store().release("r1")).toBe("released");

    const after = await store().usage(ALICE, period);
    expect(after.reservedMicros).toBe(0);
    expect(after.spentMicros, "nothing was sent, so nothing is charged").toBe(0);
  });

  it("refuses to release a dispatched hold, and says what it found", async () => {
    /*
     * THE INVARIANT THE WHOLE LIFECYCLE EXISTS FOR.
     *
     * From inside a `catch` block, "never sent" and "sent and never heard from"
     * look identical. They are opposite in what they mean for money: the vendor
     * may have completed and billed the second one. The ledger records which
     * happened rather than guessing, and refuses the refund it cannot justify.
     */
    await store().setBudget(ALICE, period, 10 * DOLLAR);
    await store().reserve(held("r2", 4 * DOLLAR));
    expect(await store().dispatch("r2", new Date().toISOString())).toBe("dispatched");

    expect(await store().release("r2"), "declined, and named the state").toBe("dispatched");
    expect((await store().usage(ALICE, period)).reservedMicros).toBe(4 * DOLLAR);
  });

  it("charges an unresolved dispatched hold and flags it", async () => {
    await store().setBudget(ALICE, period, 10 * DOLLAR);
    await store().reserve(held("r3", 4 * DOLLAR));
    await store().dispatch("r3", new Date().toISOString());

    expect(await store().markUncertain("r3")).toBe("uncertain");

    const after = await store().usage(ALICE, period);
    expect(after.reservedMicros).toBe(0);
    expect(after.spentMicros, "charged in full").toBe(4 * DOLLAR);
    expect(after.uncertainMicros, "and marked unconfirmed").toBe(4 * DOLLAR);
  });

  it("corrects an uncertain charge when the real cost is finally known", async () => {
    await store().setBudget(ALICE, period, 10 * DOLLAR);
    await store().reserve(held("r4", 4 * DOLLAR));
    await store().dispatch("r4", new Date().toISOString());
    await store().markUncertain("r4");

    await store().settle("r4", DOLLAR);

    const after = await store().usage(ALICE, period);
    expect(after.spentMicros, "corrected, not charged twice").toBe(DOLLAR);
    expect(after.uncertainMicros).toBe(0);
    expect(after.requests).toBe(1);
  });

  it("expiry refunds what was never sent and charges what was", async () => {
    await store().setBudget(ALICE, period, 20 * DOLLAR);

    const stale = (id: string, micros: number): Reservation => ({
      ...held(id, micros),
      expiresAt: new Date("2026-08-15T00:00:00Z").toISOString(),
    });

    await store().reserve(stale("sent", 3 * DOLLAR));
    await store().reserve(stale("idle", 2 * DOLLAR));
    await store().dispatch("sent", new Date().toISOString());

    const reclaimed = await store().expire(new Date("2026-08-15T00:30:00Z").toISOString());
    expect(reclaimed).toBe(2);

    const after = await store().usage(ALICE, period);
    expect(after.reservedMicros, "both resolved").toBe(0);
    expect(after.spentMicros, "only the one that left is charged").toBe(3 * DOLLAR);
    expect(after.uncertainMicros).toBe(3 * DOLLAR);
  });

  it("cannot dispatch a hold that does not exist", async () => {
    expect(await store().dispatch("no-such-hold", new Date().toISOString())).toBe("unknown");
  });

  it("resolves a failure by what was actually sent", async () => {
    await setBudget(ALICE, 10 * DOLLAR);

    /* Never dispatched: refunded. */
    const first = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!first.ok) throw new Error("should have been admitted");
    await failRequest(first.reservation, false);
    let after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.spentMicros, "nothing left, nothing charged").toBe(0);

    /* Dispatched: charged and flagged. */
    const second = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!second.ok) throw new Error("should have been admitted");
    expect(await dispatchRequest(second.reservation)).toBe(true);
    await failRequest(second.reservation, true);

    after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.spentMicros).toBe(second.reservation.amountMicros);
    expect(after?.usage.uncertainMicros).toBe(second.reservation.amountMicros);
  });

  it("charges even when the caller wrongly claims nothing was sent", async () => {
    /*
     * The ledger is the authority, not the flag. A caller that lost track and
     * asks for a refund on a dispatched hold gets an uncertain charge instead.
     */
    await setBudget(ALICE, 10 * DOLLAR);
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");
    await dispatchRequest(admission.reservation);

    await failRequest(admission.reservation, false);

    const after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.uncertainMicros).toBe(admission.reservation.amountMicros);
  });
});

/* ============================================================== thresholds */

describe("what a reader is told about their budget", () => {
  const base = {
    accountId: ALICE,
    period: "2026-08",
    reservedMicros: 0,
    uncertainMicros: 0,
    requests: 0,
  };

  const BUDGET = DOLLAR;
  const NEXT = typicalQuestionMicros("gpt-5.6-terra");

  it("names the three thresholds the brief asks for", () => {
    expect(thresholdFor({ ...base, budgetMicros: 0, spentMicros: 0 }, NEXT)).toBe("none");
    expect(thresholdFor({ ...base, budgetMicros: BUDGET, spentMicros: BUDGET / 10 }, NEXT)).toBe(
      "ok",
    );
    expect(thresholdFor({ ...base, budgetMicros: BUDGET, spentMicros: BUDGET / 2 }, NEXT)).toBe(
      "half",
    );
    expect(thresholdFor({ ...base, budgetMicros: BUDGET, spentMicros: BUDGET * 0.8 }, NEXT)).toBe(
      "most",
    );
    expect(thresholdFor({ ...base, budgetMicros: BUDGET, spentMicros: BUDGET }, NEXT)).toBe(
      "exhausted",
    );
  });

  it("calls it exhausted while there is money left but not enough for a question", () => {
    /*
     * The state a screenshot caught: 82% used, and nothing more could be asked.
     * The percentage was true and the label was misleading, which is the worse
     * of the two failures — a reader plans around the label.
     */
    const state = stateOf(
      { ...base, budgetMicros: BUDGET, spentMicros: BUDGET - (NEXT - 1) },
      NEXT,
    );
    expect(state.remainingMicros, "there is money left").toBeGreaterThan(0);
    expect(state.threshold, "and it cannot buy anything").toBe("exhausted");
  });

  it("judges the ceiling against the model the reader actually uses", () => {
    /*
     * Sol costs several times what Luna does. An account with room for Luna and
     * not for Sol is, for a reader who asks with Sol, out of budget — and an
     * earlier version called that "80% or more" because SOME model still fitted.
     */
    const luna = typicalQuestionMicros("gpt-5.6-luna");
    const sol = typicalQuestionMicros("gpt-5.6-sol");
    expect(sol).toBeGreaterThan(luna);

    const usage = {
      ...base,
      budgetMicros: BUDGET,
      spentMicros: BUDGET - Math.round((luna + sol) / 2),
    };

    expect(thresholdFor(usage, luna), "a Luna reader still has room").not.toBe("exhausted");
    expect(thresholdFor(usage, sol), "a Sol reader has none").toBe("exhausted");
  });

  it("carries what it judged against, so the page need not guess", () => {
    const state = stateOf({ ...base, budgetMicros: BUDGET, spentMicros: 0 }, NEXT);
    expect(state.nextQuestionMicros).toBe(NEXT);
    expect(state.threshold).toBe("ok");
  });

  it("counts money held as money committed", () => {
    const state = stateOf(
      {
        ...base,
        budgetMicros: BUDGET,
        spentMicros: BUDGET * 0.4,
        reservedMicros: BUDGET * 0.45,
      },
      NEXT,
    );
    expect(state.threshold).toBe("most");
    expect(state.usedPercent).toBe(85);
    expect(state.remainingMicros).toBe(BUDGET * 0.15);
  });
});

/* ========================================================== the admission */

describe("a request against a budget", () => {
  it("refuses before a provider is called when there is no room", async () => {
    const one = nextQuestionMicros("gpt-5.6-terra", QUESTION, "standard");
    await setBudget(ALICE, Math.floor(one / 2));

    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    expect(admission.ok).toBe(false);
    if (!admission.ok) expect(admission.reason).toBe("exhausted");
  });

  it("admits the same request when the ceiling is raised to fit", async () => {
    const one = nextQuestionMicros("gpt-5.6-terra", QUESTION, "standard");
    await setBudget(ALICE, one * 2);
    expect((await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard")).ok).toBe(true);
  });

  it("reserves for the model it was given, never a cheaper one", async () => {
    /*
     * No function in this system may substitute a model to make a question fit.
     * The reader chose; a budget that quietly downgrades the answer is not a
     * budget, it is a surprise.
     */
    await setBudget(ALICE, 100 * DOLLAR);
    const admission = await beginRequest(ALICE, "gpt-5.6-sol", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");

    expect(admission.reservation.model).toBe("gpt-5.6-sol");
    expect(admission.reservation.amountMicros).toBe(
      nextQuestionMicros("gpt-5.6-sol", QUESTION, "standard"),
    );
  });

  it("records the rates on the reservation, and settles with them", async () => {
    await setBudget(ALICE, 100 * DOLLAR);
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");

    const snapshot = rateSnapshot("gpt-5.6-terra");
    expect(admission.reservation.rates.inputMicrosPerMillion).toBe(snapshot.inputMicrosPerMillion);
    expect(admission.reservation.catalogueVersion).toBe(CATALOGUE_VERSION);

    /*
     * A price change must not rewrite what this request cost. The settlement
     * uses the numbers on the row, so a reservation carrying stale rates is
     * priced at those rates and not at today's.
     */
    const stale: Reservation = {
      ...admission.reservation,
      rates: {
        inputMicrosPerMillion: 1_000_000,
        cachedInputMicrosPerMillion: 100_000,
        outputMicrosPerMillion: 2_000_000,
      },
    };
    expect(costAtRates(stale, { inputTokens: 1_000_000, outputTokens: 0 })).toBe(1_000_000);
    expect(costAtRates(stale, { inputTokens: 0, outputTokens: 1_000_000 })).toBe(2_000_000);
  });

  it("returns the headroom when the answer was cheaper than the worst case", async () => {
    await setBudget(ALICE, 100 * DOLLAR);
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");
    await dispatchRequest(admission.reservation);

    await completeRequest(admission.reservation, { inputTokens: 9_000, outputTokens: 700 });

    const after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.reservedMicros).toBe(0);
    expect(after?.usage.spentMicros).toBeLessThan(admission.reservation.amountMicros);
    expect(after?.usage.spentMicros).toBe(
      costOf("gpt-5.6-terra", { inputTokens: 9_000, outputTokens: 700 }),
    );
  });

  it("prices a settlement with the cached rate when the vendor reports one", async () => {
    await setBudget(ALICE, 100 * DOLLAR);
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");
    await dispatchRequest(admission.reservation);

    await completeRequest(admission.reservation, {
      inputTokens: 10_000,
      outputTokens: 500,
      cachedInputTokens: 8_000,
    });

    const after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.spentMicros).toBe(
      costOf("gpt-5.6-terra", {
        inputTokens: 10_000,
        outputTokens: 500,
        cachedInputTokens: 8_000,
      }),
    );
  });

  it("keeps the reserved amount when a provider reported no usage", async () => {
    await setBudget(ALICE, 100 * DOLLAR);
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");
    await dispatchRequest(admission.reservation);

    await completeRequest(admission.reservation, null);

    const after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.spentMicros, "not recorded as free").toBe(
      admission.reservation.amountMicros,
    );
  });

  it("charges nothing for a request that never left", async () => {
    await setBudget(ALICE, 100 * DOLLAR);
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");

    expect(await abandonRequest(admission.reservation)).toBe(true);

    const after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.spentMicros).toBe(0);
    expect(after?.usage.reservedMicros).toBe(0);
  });

  it("will not refund a request that did leave", async () => {
    await setBudget(ALICE, 100 * DOLLAR);
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");
    await dispatchRequest(admission.reservation);

    expect(await abandonRequest(admission.reservation), "the ledger declines").toBe(false);

    await markRequestUncertain(admission.reservation);
    const after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-terra"));
    expect(after?.usage.uncertainMicros).toBe(admission.reservation.amountMicros);
  });

  it("reclaims what a dead process left behind", async () => {
    await setBudget(ALICE, 100 * DOLLAR);
    const admission = await beginRequest(
      ALICE,
      "gpt-5.6-terra",
      QUESTION,
      "standard",
      new Date("2026-08-15T00:00:00Z"),
    );
    if (!admission.ok) throw new Error("should have been admitted");

    /* An hour past its ten-minute life, and never dispatched. */
    const reclaimed = await reclaimExpired(new Date("2026-08-15T01:00:00Z"));
    expect(reclaimed).toBe(1);
  });

  it("fails closed when there is no ledger at all", async () => {
    for (const key of Object.keys(HARNESS)) delete process.env[key];
    const admission = await beginRequest(ALICE, "gpt-5.6-terra", QUESTION, "standard");
    expect(admission.ok).toBe(false);
    if (!admission.ok) expect(admission.reason).toBe("unavailable");
  });
});

/* ========================================================= which model answers */

describe("which model answers", () => {
  const withDefault = (model: ModelId, deep: ModelId | null = null): Preferences => ({
    ...defaultPreferences(ALICE),
    defaultModel: model,
    deepModel: deep,
  });

  it("uses the account's default when its provider is connected", () => {
    const choice = resolveModelChoice(withDefault("gpt-5.6-luna"), ["openai"], "standard", null);
    expect(choice.ok).toBe(true);
    if (choice.ok) expect(choice.model).toBe("gpt-5.6-luna");
  });

  it("uses the deep model only for a deep report", () => {
    const preferences = withDefault("gpt-5.6-luna", "gpt-5.6-sol");
    const standard = resolveModelChoice(preferences, ["openai"], "standard", null);
    const deep = resolveModelChoice(preferences, ["openai"], "deep", null);
    if (standard.ok) expect(standard.model).toBe("gpt-5.6-luna");
    if (deep.ok) expect(deep.model).toBe("gpt-5.6-sol");
  });

  it("lets a per-question choice win", () => {
    const choice = resolveModelChoice(
      withDefault("gpt-5.6-luna"),
      ["openai"],
      "standard",
      "gpt-5.6-sol",
    );
    if (choice.ok) expect(choice.model).toBe("gpt-5.6-sol");
  });

  it("refuses a model whose provider is not connected, and says which", () => {
    const choice = resolveModelChoice(withDefault("gpt-5.6-terra"), [], "standard", null);
    expect(choice.ok).toBe(false);
    if (!choice.ok) {
      expect(choice.reason).toBe("no_connection");
      expect(choice.wanted).toBe("gpt-5.6-terra");
    }
  });

  it("never substitutes silently", () => {
    /*
     * The whole contract in one case. A refusal names what was wanted and why;
     * it does not hand back a different model that happens to be available and
     * let a reader believe they got what they asked for.
     */
    const choice = resolveModelChoice(withDefault("gpt-5.6-sol"), [], "standard", null);
    expect(choice.ok).toBe(false);
    if (!choice.ok) expect(choice.wanted).toBe("gpt-5.6-sol");
  });

  it("refuses a model the provider already said this account cannot reach", () => {
    const preferences: Preferences = {
      ...withDefault("gpt-5.6-sol"),
      availability: [
        { model: "gpt-5.6-sol", state: "unavailable", checkedAt: new Date().toISOString() },
      ],
    };
    const choice = resolveModelChoice(preferences, ["openai"], "standard", null);
    expect(choice.ok).toBe(false);
    if (!choice.ok) expect(choice.reason).toBe("unavailable");
  });

  it("keeps one account's model choice out of another's", async () => {
    const store = preferenceStore();
    if (!store.available) throw new Error("the harness preference store should be available");

    await store.store.setModels(ALICE, "gpt-5.6-sol", null);
    const bob = await store.store.read(BOB);
    expect(bob.defaultModel).toBe(RECOMMENDED_DEFAULT);
  });

  it("keeps one account's availability record out of another's", async () => {
    const store = preferenceStore();
    if (!store.available) throw new Error("the harness preference store should be available");

    await store.store.recordAvailability(
      ALICE,
      "gpt-5.6-sol",
      "unavailable",
      new Date().toISOString(),
    );
    expect((await store.store.read(BOB)).availability).toHaveLength(0);
  });
});

/* ================================================ money never becomes a float */

describe("money never becomes a float", () => {
  it("keeps every ledger amount an integer through a whole lifecycle", async () => {
    await setBudget(ALICE, dollarsToMicros(2.37));

    const admission = await beginRequest(ALICE, "gpt-5.6-luna", QUESTION, "standard");
    if (!admission.ok) throw new Error("should have been admitted");
    expect(Number.isInteger(admission.reservation.amountMicros)).toBe(true);

    await dispatchRequest(admission.reservation);
    await completeRequest(admission.reservation, { inputTokens: 8_123, outputTokens: 777 });

    const after = await budgetFor(ALICE, typicalQuestionMicros("gpt-5.6-luna"));
    for (const amount of [
      after?.usage.budgetMicros,
      after?.usage.spentMicros,
      after?.usage.reservedMicros,
      after?.usage.uncertainMicros,
      after?.remainingMicros,
      after?.nextQuestionMicros,
    ]) {
      expect(Number.isInteger(amount ?? 0)).toBe(true);
    }
  });

  it("prices every model without a fractional micro-dollar", () => {
    for (const entry of catalogue()) {
      for (const depth of ["standard", "deep"] as const) {
        const micros = nextQuestionMicros(entry.id, QUESTION, depth);
        expect(Number.isInteger(micros), `${entry.id} ${depth}`).toBe(true);
        expect(micros, `${entry.id} ${depth}`).toBeGreaterThan(0);
      }
    }
  });

  it("names a provider for every model, and a model for every provider", () => {
    const providers = new Set(PROVIDERS.map((p) => p.id));
    for (const entry of CATALOGUE) expect(providers.has(entry.provider), entry.id).toBe(true);
    for (const provider of providers) {
      expect(
        CATALOGUE.some((entry) => entry.provider === provider),
        provider,
      ).toBe(true);
    }
  });
});
