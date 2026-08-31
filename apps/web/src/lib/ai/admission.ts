import "server-only";

import type { ModelAccess, ModelBlocked } from "./provider";
import { resolveApiKey } from "@/lib/credentials/service";
import type { ConnectionFailure } from "@/lib/credentials/failure";
import { classifyProviderFailure } from "@/lib/credentials/failure";
import {
  CATALOGUE,
  modelEntry,
  isModelId,
  PROVIDER_IDS,
  type ModelId,
  type ProviderId,
} from "@/lib/models/catalogue";
import { preferencesFor, preferenceStore, resolveModelChoice } from "@/lib/models/preferences";
import {
  beginRequest,
  budgetFor,
  completeRequest,
  dispatchRequest,
  failRequest,
  nextQuestionMicros,
  type BudgetState,
} from "@/lib/budget/service";
import type { Reservation } from "@/lib/budget/ledger";

/**
 * EVERYTHING THAT MUST BE TRUE BEFORE A MODEL IS CALLED, IN ORDER.
 *
 * Four questions, and the first that answers no ends it:
 *
 *   1. Which model? The reader's per-question choice, then the account's
 *      preference for this depth, then their default.
 *   2. Is its provider connected, and has it worked for this account before?
 *   3. Is there a credential to decrypt?
 *   4. Is there room in this month's budget?
 *
 * Only after all four does a request leave the building. That ordering is the
 * point: a budget checked after the call is a report, not a limit, and a model
 * chosen after the key is resolved is a model chosen from the wrong menu.
 *
 * ## The account is never a request field
 *
 * `accountId` comes from `requireAccount()` in the caller. Nothing here reads a
 * header, a form field or a query parameter — and the only thing the browser
 * may influence is `override`, which is validated against the catalogue and
 * then checked against what the account actually holds.
 */

export type AdmissionRefusal =
  /** No credential for the chosen model's provider. */
  | { readonly kind: "no_connection"; readonly model: ModelId; readonly provider: ProviderId }
  /** The provider told this account it cannot reach this model. */
  | {
      readonly kind: "model_unavailable";
      readonly model: ModelId;
      readonly fallback: ModelId | null;
    }
  /** A stored credential that will not decrypt. */
  | { readonly kind: "unreadable" }
  /** No budget set, or none left. */
  | {
      readonly kind: "budget";
      readonly reason: "exhausted" | "no_budget";
      readonly state: BudgetState | null;
    }
  /**
   * The question is bigger than Observer will send.
   *
   * The catalogue prices one band; past the vendor's long-context boundary a
   * different set of rates applies and this one would under-reserve. Refused
   * before any money is held rather than priced with figures that do not apply.
   */
  | { readonly kind: "too_large" }
  /** Storage or the ledger is unreachable. Fail closed. */
  | { readonly kind: "unavailable" };

export type AdmissionResult =
  | {
      readonly ok: true;
      readonly access: ModelAccess;
      readonly reservation: Reservation;
      readonly budget: BudgetState | null;
    }
  | { readonly ok: false; readonly refusal: AdmissionRefusal };

/**
 * A refusal, in the one word the answer sheet is allowed to see.
 *
 * The refusals above carry a model id and a provider name; this reduces them to
 * a member of a closed set, which is what may cross to a browser. Without it
 * every refusal arrived as "no connection" and an account that had simply spent
 * its budget was told to add the key it was already using.
 */
export function blockFor(refusal: AdmissionRefusal): ModelBlocked {
  switch (refusal.kind) {
    case "no_connection":
      return { blocked: "no_connection" };
    case "model_unavailable":
      return { blocked: "model_unavailable" };
    case "unreadable":
      return { blocked: "unreadable" };
    case "budget":
      return { blocked: refusal.reason === "exhausted" ? "budget_exhausted" : "no_budget" };
    case "too_large":
      return { blocked: "too_large" };
    case "unavailable":
      return { blocked: "unavailable" };
  }
}

/** Which providers this account currently holds a credential for. */
export async function connectedProviders(accountId: string): Promise<readonly ProviderId[]> {
  const held: ProviderId[] = [];
  for (const provider of PROVIDER_IDS) {
    const resolution = await resolveApiKey(accountId, provider);
    if (resolution.ok) held.push(provider);
  }
  return held;
}

/** The model this account would use for a question, without admitting one. */
export async function activeModelFor(
  accountId: string,
  depth: "standard" | "deep",
): Promise<{ readonly model: ModelId; readonly usable: boolean }> {
  const preferences = await preferencesFor(accountId);
  const connected = await connectedProviders(accountId);
  const choice = resolveModelChoice(preferences, connected, depth, null);
  return choice.ok
    ? { model: choice.model, usable: true }
    : { model: choice.wanted, usable: false };
}

export function parseOverride(value: unknown): ModelId | null {
  return typeof value === "string" && isModelId(value) ? value : null;
}

/**
 * Admits one request, or refuses it with a reason a reader can act on.
 *
 * On success the caller MUST end with `settleAdmission` or `abandonAdmission`.
 * A reservation left dangling holds a slice of somebody's monthly budget until
 * it expires, which is the one failure mode this design trades for correctness
 * under concurrency.
 */
export async function admitModelRequest(
  accountId: string,
  question: string,
  depth: "standard" | "deep",
  override: ModelId | null,
): Promise<AdmissionResult> {
  const preferences = await preferencesFor(accountId);
  const connected = await connectedProviders(accountId);

  const choice = resolveModelChoice(preferences, connected, depth, override);
  if (!choice.ok) {
    return {
      ok: false,
      refusal:
        choice.reason === "no_connection"
          ? {
              kind: "no_connection",
              model: choice.wanted,
              provider: modelEntry(choice.wanted).provider,
            }
          : { kind: "model_unavailable", model: choice.wanted, fallback: choice.fallback },
    };
  }

  const provider = modelEntry(choice.model).provider;
  const credential = await resolveApiKey(accountId, provider);
  if (!credential.ok) {
    return {
      ok: false,
      refusal:
        credential.reason === "unreadable"
          ? { kind: "unreadable" }
          : { kind: "no_connection", model: choice.model, provider },
    };
  }

  /*
   * The budget last, and before the call rather than after it. A refusal here
   * means no request is made at all — which is what "no OpenAI request after
   * the budget is exhausted" has to mean to be worth writing down.
   */
  /*
   * Reserved for THIS request, with THIS model.
   *
   * The question travels down so the hold is sized from what is actually being
   * sent rather than from an average. Nothing here substitutes a cheaper model
   * to make a question fit: the reader chose, and a budget that quietly
   * downgrades the answer is not a budget, it is a surprise.
   */
  const admission = await beginRequest(accountId, choice.model, question, depth);
  if (!admission.ok) {
    if (admission.reason === "unavailable") return { ok: false, refusal: { kind: "unavailable" } };
    if (admission.reason === "too_large") return { ok: false, refusal: { kind: "too_large" } };
    return {
      ok: false,
      refusal: { kind: "budget", reason: admission.reason, state: admission.state },
    };
  }

  return {
    ok: true,
    access: { model: choice.model, apiKey: credential.apiKey },
    reservation: admission.reservation,
    budget: await budgetFor(accountId, nextQuestionMicros(choice.model, question, depth)),
  };
}

/**
 * THE LAST STEP BEFORE ANYTHING IS SENT.
 *
 * Returns false when the hold is gone or already spoken for, and the caller
 * must then send nothing: a request made on the strength of a hold that does
 * not exist is spending nobody is metering.
 */
export async function dispatchAdmission(reservation: Reservation): Promise<boolean> {
  return dispatchRequest(reservation);
}

/** Records what the request actually cost, at the rates it was reserved with. */
export async function settleAdmission(
  reservation: Reservation,
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens?: number | null;
  } | null,
): Promise<void> {
  await completeRequest(
    reservation,
    usage === null
      ? null
      : {
          inputTokens: usage.inputTokens ?? undefined,
          outputTokens: usage.outputTokens ?? undefined,
          cachedInputTokens: usage.cachedInputTokens ?? undefined,
        },
  );
}

/**
 * Resolves a request that produced no answer, WITHOUT guessing what it cost.
 *
 * `dispatched` is the whole question. A request that never left is refunded in
 * full; one that left and vanished is charged and flagged uncertain, because
 * the vendor may have completed it and will bill for it either way.
 */
export async function abandonAdmission(
  reservation: Reservation,
  dispatched: boolean,
): Promise<void> {
  await failRequest(reservation, dispatched);
}

/**
 * Remembers what a provider said about a model, for this account.
 *
 * Called after a failure so a second attempt does not repeat a request the
 * provider has already refused. Only `model_unavailable` is recorded: a rate
 * limit or an outage says nothing about entitlement, and marking a model
 * unreachable because the vendor was briefly down would hide it from a reader
 * who is entitled to it.
 */
export async function noteFailure(
  accountId: string,
  model: ModelId,
  status: number,
  code: string | null,
): Promise<ConnectionFailure> {
  const failure = classifyProviderFailure(status, code);
  if (failure !== "model_unavailable") return failure;
  await recordModelUnavailable(accountId, model);
  return failure;
}

/**
 * Writes down that this account cannot reach this model.
 *
 * Called from the ask route when a request has just proved it. The classifying
 * happens where the status and the code still exist — inside the agent, which
 * saw the transport throw — so this takes the conclusion rather than re-deriving
 * it from evidence that no longer reaches here.
 *
 * A record per account, never per deployment: entitlement is a property of the
 * key, and one account's 404 says nothing about anybody else's.
 */
/**
 * FORGETS WHAT THE PREVIOUS KEY TAUGHT US ABOUT ONE PROVIDER.
 *
 * A new key is a new entitlement. Everything recorded about which models could
 * not be reached was learned from a credential that is now gone, and keeping it
 * makes the new key look broken: an account that swapped a limited key for a
 * full one still saw its models greyed out, and every question was refused
 * before a request was made — a refusal based on evidence about somebody else's
 * key.
 *
 * Called on save, before whatever the new key's own probe learned is recorded.
 */
export async function forgetProviderAvailability(
  accountId: string,
  provider: ProviderId,
): Promise<void> {
  const store = preferenceStore();
  if (!store.available) return;

  const at = new Date().toISOString();
  for (const entry of CATALOGUE.filter((model) => model.provider === provider)) {
    try {
      await store.store.recordAvailability(accountId, entry.id, "available", at);
    } catch {
      /* Losing this costs a stale refusal the reader can clear by testing. */
    }
  }
}

export async function recordModelUnavailable(accountId: string, model: ModelId): Promise<void> {
  const store = preferenceStore();
  if (store.available) {
    try {
      await store.store.recordAvailability(
        accountId,
        model,
        "unavailable",
        new Date().toISOString(),
      );
    } catch {
      /* Losing the note costs a repeated 404, not correctness. */
    }
  }
}
