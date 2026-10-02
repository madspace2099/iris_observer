import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  TABLE_PREFERENCES_PREFIX,
  preferencesOrDefault,
  readPreferences,
  writePreferences,
  type PreferenceStore,
} from "@/lib/table-preferences";

/**
 * A REGISTER'S SETTINGS IN THE BROWSER, AND WHAT HAPPENS WHEN THE BROWSER WON'T (P2-20).
 *
 * Browser storage throws in a private window or with cookies blocked, rather
 * than returning nothing. The wrapper must turn that into "nothing stored",
 * and the register must then be exactly the register it always was.
 */

const COLUMNS = ["code", "status", "floor", "views"];

function memory(): PreferenceStore & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const throwing: PreferenceStore = {
  getItem: () => {
    throw new Error("SecurityError: the operation is insecure");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("the table-preferences wrapper", () => {
  it("keeps and returns a column list and a density, under the product's own key", () => {
    const store = memory();
    expect(writePreferences("units", { hidden: ["floor"], density: "compact" }, store)).toBe(true);
    expect([...store.map.keys()]).toEqual([`${TABLE_PREFERENCES_PREFIX}units`]);
    expect(JSON.parse(store.map.get(`${TABLE_PREFERENCES_PREFIX}units`) ?? "")).toEqual({
      hidden: ["floor"],
      density: "compact",
    });
    expect(readPreferences("units", COLUMNS, store)).toEqual({
      hidden: ["floor"],
      density: "compact",
    });
  });

  it("reads nothing and keeps nothing when the browser's storage throws", () => {
    expect(readPreferences("units", COLUMNS, throwing)).toBeNull();
    expect(writePreferences("units", { hidden: ["floor"], density: "compact" }, throwing)).toBe(
      false,
    );
  });

  it("reads nothing where there is no storage at all", () => {
    expect(readPreferences("units", COLUMNS, null)).toBeNull();
    expect(writePreferences("units", DEFAULT_PREFERENCES, null)).toBe(false);
  });

  it("trusts nothing malformed, and drops a column the register no longer has", () => {
    const store = memory();
    store.setItem(`${TABLE_PREFERENCES_PREFIX}units`, "{not json");
    expect(readPreferences("units", COLUMNS, store)).toBeNull();
    store.setItem(
      `${TABLE_PREFERENCES_PREFIX}units`,
      JSON.stringify({ hidden: "floor", density: "x" }),
    );
    expect(readPreferences("units", COLUMNS, store)).toBeNull();
    store.setItem(
      `${TABLE_PREFERENCES_PREFIX}units`,
      JSON.stringify({ hidden: ["floor", "gone", 3], density: "comfortable" }),
    );
    expect(readPreferences("units", COLUMNS, store)).toEqual({
      hidden: ["floor"],
      density: "comfortable",
    });
  });
});

describe("the register with nothing stored", () => {
  it("is the register as it always rendered: every column, comfortable rows", () => {
    expect(preferencesOrDefault(readPreferences("units", COLUMNS, null))).toEqual({
      hidden: [],
      density: "comfortable",
    });
    expect(preferencesOrDefault(readPreferences("units", COLUMNS, throwing))).toBe(
      DEFAULT_PREFERENCES,
    );
  });
});
