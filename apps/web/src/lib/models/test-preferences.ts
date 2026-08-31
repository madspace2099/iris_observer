import "server-only";

import type { ModelId } from "./catalogue";
import {
  defaultPreferences,
  type Availability,
  type ModelAvailability,
  type PreferenceStore,
  type Preferences,
} from "./preferences";

/**
 * THE BROWSER SUITE'S PREFERENCE STORE.
 *
 * The third of the harness triplet — credentials, ledger, preferences — behind
 * the same predicate and isolated for the same reason: one file, one
 * `globalThis` backing, deleted in one piece when the harness is no longer
 * wanted.
 */

const BACKING = Symbol.for("observer.models.test-preferences");

function backing(): Map<string, Preferences> {
  const host = globalThis as unknown as Record<symbol, Map<string, Preferences> | undefined>;
  const existing = host[BACKING];
  if (existing !== undefined) return existing;
  const created = new Map<string, Preferences>();
  host[BACKING] = created;
  return created;
}

export function testPreferences(): PreferenceStore {
  return {
    kind: "test",

    read: (accountId) => Promise.resolve(backing().get(accountId) ?? defaultPreferences(accountId)),

    setModels: (accountId, defaultModel, deepModel) => {
      const current = backing().get(accountId) ?? defaultPreferences(accountId);
      backing().set(accountId, { ...current, defaultModel, deepModel });
      return Promise.resolve();
    },

    recordAvailability: (
      accountId: string,
      model: ModelId,
      state: Exclude<Availability, "unknown">,
      at: string,
    ) => {
      const current = backing().get(accountId) ?? defaultPreferences(accountId);
      const others = current.availability.filter((a) => a.model !== model);
      const updated: ModelAvailability = { model, state, checkedAt: at };
      backing().set(accountId, { ...current, availability: [...others, updated] });
      return Promise.resolve();
    },
  };
}

/** Wipes the harness preferences. For test setup only. */
export function resetTestPreferences(): void {
  backing().clear();
}
