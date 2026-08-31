"use server";

import { redirect } from "next/navigation";

import { dynamicRoute } from "@/lib/href";
import { requireAccount } from "@/lib/session";
import { probeFor } from "@/lib/credentials/probe";
import { removeConnection, saveConnection, testConnection } from "@/lib/credentials/service";
import {
  probeModelFor,
  dollarsToMicros,
  isModelId,
  isProviderId,
  modelEntry,
  type ModelId,
  type ProviderId,
} from "@/lib/models/catalogue";
import { forgetProviderAvailability, recordModelUnavailable } from "@/lib/ai/admission";
import { preferencesFor, preferenceStore } from "@/lib/models/preferences";
import { setBudget } from "@/lib/budget/service";

/**
 * WHAT A READER MAY DO TO THEIR OWN ACCOUNT.
 *
 * Server actions, which is what makes any of this possible: a raw key travels
 * from the form to this process in the request body and stops here. It is never
 * in a URL, never in a cookie, never in browser storage, never in the client
 * bundle, and never in the HTML that comes back.
 *
 * ## Every action re-authorises, and none takes an account
 *
 * `requireAccount()` runs first in all six, on every call. The account is never
 * a parameter and never read from a field — an account id that arrives from the
 * browser is an account id the browser chose. What the browser MAY choose is
 * which provider or which model, and both are validated against the catalogue
 * before they are used for anything.
 *
 * ## Why they redirect rather than return
 *
 * The page is a server component and the forms are plain HTML: uncontrolled
 * inputs whose values exist in the DOM until submit and nowhere else. Holding a
 * key in React state to render a result would put it in client memory and in a
 * component's props. So the outcome travels as one word in the query string.
 */

const PATH = "/settings/ai";

function providerFrom(formData: FormData): ProviderId {
  const raw = String(formData.get("provider") ?? "openai");
  return isProviderId(raw) ? raw : "openai";
}

/**
 * WHICH MODEL A CONNECTION TEST SHOULD USE.
 *
 * The one this account will actually ask with, when it belongs to the provider
 * being tested; otherwise that provider's cheapest. Testing every key against
 * one fixed model is how a reader with an Anthropic key was told their key was
 * rejected — it had been sent to OpenAI.
 */
async function probeModelForAccount(accountId: string, provider: ProviderId): Promise<ModelId> {
  const preferences = await preferencesFor(accountId);
  const chosen = preferences.defaultModel;
  return chosen !== null && modelEntry(chosen).provider === provider
    ? chosen
    : probeModelFor(provider);
}

/** Saves a key for one provider, after proving it works. */
export async function connect(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const provider = providerFrom(formData);
  const model = await probeModelForAccount(account.accountId, provider);

  /* Read, used, and out of scope when this returns. Never logged or echoed. */
  const raw = String(formData.get("apiKey") ?? "");

  const result = await saveConnection(account.accountId, raw, probeFor(), provider, model);

  if (!result.ok) {
    redirect(dynamicRoute(`${PATH}?failed=${result.failure}&p=${provider}`));
  }

  /*
   * A NEW KEY STARTS WITH A CLEAN SLATE.
   *
   * Whatever was recorded about this provider was learned from the credential
   * that has just been replaced, and a new key may reach models the old one
   * could not. Cleared first, then whatever this key's own probe learned is
   * written on top.
   */
  await forgetProviderAvailability(account.accountId, provider);

  /*
   * The key is stored either way. What the probe learned about the MODEL is
   * kept separately, so the settings page can show it as out of reach and the
   * reader is asked to pick another one rather than to doubt a key that just
   * authenticated.
   */
  if (result.unreachableModel !== null) {
    await recordModelUnavailable(account.accountId, result.unreachableModel);
    redirect(dynamicRoute(`${PATH}?done=connected_no_model&p=${provider}`));
  }

  redirect(
    dynamicRoute(`${PATH}?done=${result.replaced ? "replaced" : "connected"}&p=${provider}`),
  );
}

/** Tests the key already stored for one provider. */
export async function test(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const provider = providerFrom(formData);
  const model = await probeModelForAccount(account.accountId, provider);

  const result = await testConnection(account.accountId, probeFor(), provider, model);

  /* Same as connecting: a model this account cannot reach is remembered. */
  if (!result.ok && result.failure === "model_unavailable") {
    await recordModelUnavailable(account.accountId, model);
  }

  redirect(
    dynamicRoute(
      result.ok
        ? `${PATH}?done=tested&p=${provider}`
        : `${PATH}?failed=${result.failure}&p=${provider}`,
    ),
  );
}

/** Deletes the stored credential for one provider. */
export async function remove(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const provider = providerFrom(formData);
  const removed = await removeConnection(account.accountId, provider);
  redirect(
    dynamicRoute(
      removed
        ? `${PATH}?done=removed&p=${provider}`
        : `${PATH}?failed=provider_unavailable&p=${provider}`,
    ),
  );
}

/**
 * Chooses the model an account asks with.
 *
 * Both values are checked against the catalogue rather than trusted. A model
 * whose provider is not connected can still be SELECTED — the settings page
 * shows it as needing a key — because forbidding the choice would leave a
 * reader unable to express an intention they are one paste away from.
 */
export async function chooseModels(formData: FormData): Promise<void> {
  const account = await requireAccount();

  const wanted = String(formData.get("defaultModel") ?? "");
  const deepWanted = String(formData.get("deepModel") ?? "");

  const store = preferenceStore();
  if (!store.available || !isModelId(wanted)) {
    redirect(dynamicRoute(`${PATH}?failed=storage_unavailable`));
  }

  await store.store.setModels(account.accountId, wanted, isModelId(deepWanted) ? deepWanted : null);
  redirect(dynamicRoute(`${PATH}?done=models`));
}

/**
 * Sets the monthly ceiling, in whole dollars.
 *
 * Converted to integer micro-dollars at the boundary, so the float a browser
 * sends is the last float in the system. Zero is a legitimate value and means
 * "spend nothing" — Observer then answers from evidence rather than refusing to
 * work, which is a different thing from having no budget set.
 */
export async function chooseBudget(formData: FormData): Promise<void> {
  const account = await requireAccount();

  const raw = Number.parseFloat(String(formData.get("budget") ?? "0"));
  const dollars = Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 100_000) : 0;

  const saved = await setBudget(account.accountId, dollarsToMicros(dollars));
  redirect(dynamicRoute(saved ? `${PATH}?done=budget` : `${PATH}?failed=storage_unavailable`));
}
