"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  preferencesOrDefault,
  readPreferences,
  writePreferences,
  type Density,
  type TablePreferences as Preferences,
} from "@/lib/table-preferences";

/**
 * THE REGISTER'S COLUMNS AND DENSITY, CHOSEN BY THE READER (P2-20, ZARAS1, 2026-10-02).
 *
 * Drawn above a `DataTable` that asks for it, and nowhere else. Hiding a
 * column is a display choice made in the page: every cell is still sent, so a
 * field the server withholds stays withheld — nothing here can reveal one.
 * The record's own column cannot be hidden, or a row would lose its name.
 *
 * Whether the choice is kept is said in words, after the page knows: kept in
 * this browser, or not kept because this browser would not allow it. Nothing
 * is claimed before the first read. The labels are the screen's, English by
 * the scope decision of 2026-10-02; no printed report draws this control.
 */
export function TablePreferences({
  id,
  columns,
  locked,
}: {
  /** Which register, in the storage key: "units", "meetings". */
  readonly id: string;
  readonly columns: readonly { readonly key: string; readonly label: string }[];
  /** The record's own column, which stays. */
  readonly locked: string | null;
}) {
  const keys = columns.map((column) => column.key);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [kept, setKept] = useState<boolean | null>(null);

  useEffect(() => {
    setPreferences(preferencesOrDefault(readPreferences(id, keys)));
    /* Asking the browser once whether it keeps anything at all: a write of what is there. */
    setKept(writePreferences(id, preferencesOrDefault(readPreferences(id, keys))));
    /* The columns are the register's and do not change while it is open, so the id is the whole key. */
  }, [id]);

  const change = (next: Preferences) => {
    setPreferences(next);
    setKept(writePreferences(id, next));
  };

  const toggle = (key: string) =>
    change({
      ...preferences,
      hidden: preferences.hidden.includes(key)
        ? preferences.hidden.filter((k) => k !== key)
        : [...preferences.hidden, key],
    });
  const density = (next: Density) => change({ ...preferences, density: next });

  /* Keys come from the register's own columns, never from storage: a stored key that is not one is dropped on read. */
  const scope = `[data-prefs-scope="${id}"]`;
  const css = [
    ...preferences.hidden.map((key) => `${scope} [data-col="${key}"] { display: none; }`),
    ...(preferences.density === "compact"
      ? [`${scope} .ox-table td, ${scope} .ox-table th { padding-block: .3rem; }`]
      : []),
  ].join("\n");

  return (
    <div className="ox-table-prefs">
      <details className="ox-table-prefs-columns">
        <summary className="ox-toggle">Columns</summary>
        <fieldset>
          <legend className="ox-sr">Columns shown</legend>
          {columns.map((column) => (
            <label key={column.key}>
              {/* Its own name, never the column's alone: a filter on the same page is called "Status" too. */}
              <input
                aria-label={`Show column ${column.label}`}
                type="checkbox"
                checked={!preferences.hidden.includes(column.key)}
                disabled={column.key === locked}
                onChange={() => toggle(column.key)}
              />{" "}
              {column.label}
            </label>
          ))}
        </fieldset>
      </details>
      <div role="group" aria-label="Density" className="ox-chipset">
        {(["comfortable", "compact"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="ox-toggle"
            aria-pressed={preferences.density === value}
            onClick={() => density(value)}
          >
            {value === "comfortable" ? "Comfortable" : "Compact"}
          </button>
        ))}
      </div>
      {kept === null ? null : (
        <p className="ox-section-note" data-kept={kept ? "true" : "false"}>
          {kept
            ? "Kept in this browser only."
            : "Not kept: this browser does not allow it, so the register returns to every column on the next visit."}
        </p>
      )}
      {css.length === 0 ? null : <style>{css}</style>}
    </div>
  );
}
