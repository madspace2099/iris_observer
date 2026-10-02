/**
 * A REGISTER'S CONVENIENCE SETTINGS, KEPT IN THIS BROWSER ONLY (P2-20, ZARAS1, 2026-10-02).
 *
 * Which columns a reader hid and how dense the rows are: comfort, not data.
 * Máté decided on 2026-10-01 that these live in the browser and nowhere else —
 * no migration, no table, no account setting. This file is the one place the
 * application touches browser storage, and `credentials.test.ts` names it as
 * the single exception to the rule that it touches none.
 *
 * What is stored is a column key list and a density word, under this
 * product's own prefix; never a record, an identifier, a name or a figure.
 * Browser storage throws rather than returning nothing in a private window,
 * with cookies blocked and in some embedded frames, so every read and write is
 * caught, and a register with no storage at all renders exactly as it always
 * did.
 */

export const TABLE_PREFERENCES_PREFIX = "iris-observer.table.v1.";

export type Density = "comfortable" | "compact";

export interface TablePreferences {
  /** Keys of the columns the reader hid. */
  readonly hidden: readonly string[];
  readonly density: Density;
}

/** The register as it renders with nothing stored: every column, comfortable rows. */
export const DEFAULT_PREFERENCES: TablePreferences = { hidden: [], density: "comfortable" };

/** The part of `Storage` this reads and writes, so a test can hand it one that throws. */
export type PreferenceStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's storage, or null where reaching it throws or there is none. */
export function browserStore(): PreferenceStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored settings for register `id`, cut to the columns it has today, or
 * null where nothing is stored, storage cannot be read, or what is there is
 * not ours to trust.
 */
export function readPreferences(
  id: string,
  columns: readonly string[],
  store: PreferenceStore | null = browserStore(),
): TablePreferences | null {
  if (store === null) return null;
  try {
    const raw = store.getItem(`${TABLE_PREFERENCES_PREFIX}${id}`);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const { hidden, density } = parsed as { hidden?: unknown; density?: unknown };
    if (!Array.isArray(hidden) || (density !== "comfortable" && density !== "compact")) return null;
    return {
      hidden: hidden.filter(
        (key): key is string => typeof key === "string" && columns.includes(key),
      ),
      density,
    };
  } catch {
    return null;
  }
}

/** The settings with nothing stored: the register as it always rendered. */
export function preferencesOrDefault(stored: TablePreferences | null): TablePreferences {
  return stored ?? DEFAULT_PREFERENCES;
}

/** Keeps the settings for register `id`; false where the browser would not. */
export function writePreferences(
  id: string,
  preferences: TablePreferences,
  store: PreferenceStore | null = browserStore(),
): boolean {
  if (store === null) return false;
  try {
    store.setItem(
      `${TABLE_PREFERENCES_PREFIX}${id}`,
      JSON.stringify({ hidden: preferences.hidden, density: preferences.density }),
    );
    return true;
  } catch {
    return false;
  }
}
