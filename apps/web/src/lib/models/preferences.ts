import "server-only";

import { resolveServerSupabase, type EnvSource } from "@/lib/supabase-env";
import { testStorePermitted } from "@/lib/credentials/test-store";
import {
  RECOMMENDED_DEFAULT,
  isModelId,
  modelEntry,
  type ModelId,
  type ProviderId,
} from "./catalogue";
import { testPreferences } from "./test-preferences";

/**
 * WHICH MODEL AN ACCOUNT USES, AND WHICH IT HAS BEEN TOLD IT CANNOT.
 *
 * Two facts per account, and one per account and model:
 *
 *   defaultModel     what an ordinary question uses
 *   deepModel        what Deep Report uses, when it differs
 *   availability     what the provider said last time this account tried
 *
 * ## Availability is remembered, never assumed
 *
 * Discovering what a key may reach needs the provider to say so, and the only
 * time it says so is when a request is made. So availability is recorded from
 * what already happened: a `model_not_found` while testing a connection or
 * answering a question marks that model unreachable FOR THAT ACCOUNT, with the
 * date. A model nobody has tried is "not checked" rather than "available" —
 * claiming otherwise would put an option in a menu that fails when chosen.
 *
 * It is per account because entitlement is: two accounts with keys from
 * different projects can reach different models, and one reader's 404 says
 * nothing about another's.
 */

export type Availability = "available" | "unavailable" | "unknown";

export interface ModelAvailability {
  readonly model: ModelId;
  readonly state: Availability;
  readonly checkedAt: string | null;
}

export interface Preferences {
  readonly accountId: string;
  readonly defaultModel: ModelId;
  readonly deepModel: ModelId | null;
  readonly availability: readonly ModelAvailability[];
}

export interface PreferenceStore {
  readonly kind: "supabase" | "test";
  read(accountId: string): Promise<Preferences>;
  setModels(accountId: string, defaultModel: ModelId, deepModel: ModelId | null): Promise<void>;
  recordAvailability(
    accountId: string,
    model: ModelId,
    state: Exclude<Availability, "unknown">,
    at: string,
  ): Promise<void>;
}

export type PreferenceAvailability =
  { readonly available: true; readonly store: PreferenceStore } | { readonly available: false };

/** The preferences an account has before it has expressed any. */
export function defaultPreferences(accountId: string): Preferences {
  return {
    accountId,
    defaultModel: RECOMMENDED_DEFAULT,
    deepModel: null,
    availability: [],
  };
}

export function parseModelId(value: unknown): ModelId | null {
  return typeof value === "string" && isModelId(value) ? value : null;
}

/**
 * The model a question should use, given what the account chose and holds.
 *
 * Four things have to agree, and the first that disagrees decides:
 *
 *   1. a per-question override, if the reader picked one;
 *   2. the account's deep model, for a Deep Report;
 *   3. the account's default;
 *   4. the recommended default, if none of the above is usable.
 *
 * "Usable" means the account has connected the model's provider AND the model
 * is not recorded unavailable. A choice that fails either is not silently
 * substituted — the caller is told which model was asked for and why it could
 * not be used, because a reader who selected Sol and quietly got Luna has been
 * lied to about what wrote their answer.
 */
export type Resolution =
  | { readonly ok: true; readonly model: ModelId; readonly substituted: false }
  | {
      readonly ok: false;
      readonly wanted: ModelId;
      readonly reason: "no_connection" | "unavailable";
      /** What could be used instead, if anything. The caller decides. */
      readonly fallback: ModelId | null;
    };

export function resolveModelChoice(
  preferences: Preferences,
  connected: readonly ProviderId[],
  depth: "standard" | "deep",
  override: ModelId | null,
): Resolution {
  const held = new Set(connected);
  const unavailable = new Set(
    preferences.availability.filter((a) => a.state === "unavailable").map((a) => a.model),
  );

  /* Connected provider, and not recorded unreachable for this account. */
  const usable = (model: ModelId): boolean =>
    held.has(modelEntry(model).provider) && !unavailable.has(model);

  const wanted =
    override ??
    (depth === "deep"
      ? (preferences.deepModel ?? preferences.defaultModel)
      : preferences.defaultModel);

  if (usable(wanted)) return { ok: true, model: wanted, substituted: false };

  /* Something the account can actually use, if there is one. */
  const fallback =
    [preferences.defaultModel, RECOMMENDED_DEFAULT].find((candidate) => usable(candidate)) ?? null;

  return {
    ok: false,
    wanted,
    reason: held.has(modelEntry(wanted).provider) ? "unavailable" : "no_connection",
    fallback: fallback === wanted ? null : fallback,
  };
}

/* ==================================================================== storage */

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

function supabasePreferences(url: string, key: string): PreferenceStore {
  return {
    kind: "supabase",

    async read(accountId) {
      const response = await post(url, key, "observer_preferences_read", { p_account: accountId });
      if (!response.ok) return defaultPreferences(accountId);

      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) return defaultPreferences(accountId);

      const row = rows[0] as Record<string, unknown>;
      const availability = Array.isArray(row["availability"])
        ? (row["availability"] as Record<string, unknown>[]).flatMap((a) => {
            const model = parseModelId(a["model"]);
            const state = a["state"];
            if (model === null || (state !== "available" && state !== "unavailable")) return [];
            return [
              {
                model,
                state,
                checkedAt: typeof a["checked_at"] === "string" ? a["checked_at"] : null,
              } satisfies ModelAvailability,
            ];
          })
        : [];

      return {
        accountId,
        defaultModel: parseModelId(row["default_model"]) ?? RECOMMENDED_DEFAULT,
        deepModel: parseModelId(row["deep_model"]),
        availability,
      };
    },

    async setModels(accountId, defaultModel, deepModel) {
      await post(url, key, "observer_preferences_set_models", {
        p_account: accountId,
        p_default_model: defaultModel,
        p_deep_model: deepModel,
      });
    },

    async recordAvailability(accountId, model, state, at) {
      await post(url, key, "observer_preferences_record_availability", {
        p_account: accountId,
        p_model: model,
        p_state: state,
        p_at: at,
      });
    },
  };
}

/**
 * Which preference store this server has.
 *
 * The same selection the credential store and the ledger make, for the same
 * reason: one predicate decides, so all three are present together or absent
 * together and a server cannot end up half-configured.
 */
export function preferenceStore(source: EnvSource = process.env): PreferenceAvailability {
  const supabase = resolveServerSupabase(source);
  if (supabase !== null) {
    return { available: true, store: supabasePreferences(supabase.url, supabase.key) };
  }
  if (testStorePermitted(source)) return { available: true, store: testPreferences() };
  return { available: false };
}

/** Preferences for one account, or the defaults when nothing is stored. */
export async function preferencesFor(accountId: string): Promise<Preferences> {
  const store = preferenceStore();
  if (!store.available) return defaultPreferences(accountId);
  try {
    return await store.store.read(accountId);
  } catch {
    return defaultPreferences(accountId);
  }
}
