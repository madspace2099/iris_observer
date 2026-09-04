import type { ReactNode } from "react";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { Empty } from "./Absence";

/**
 * How a column is currently sorted, and where to go to change it.
 *
 * The href is built by the SCREEN, not by this component, because the screen is
 * the only thing that knows the rest of the query string — which filters are
 * applied, which unit is selected, which tab is open. A table that rebuilt the
 * URL from the column alone would silently drop all of it, which is the same
 * class of bug as navigation dropping the period.
 */
export interface ColumnSort {
  /** Where the header links to. Applying this is what changes the order. */
  readonly href: string;
  /** How the column is sorted right now. `none` means sortable, not sorted. */
  readonly direction: "ascending" | "descending" | "none";
}

export interface DataColumn {
  readonly key: string;
  readonly label: string;
  /** Right-aligned and tabular. A column of figures, not a column of words. */
  readonly numeric?: boolean;
  /** Present makes the header a link; absent makes it plain text. */
  readonly sort?: ColumnSort | null;
}

export interface DataRow {
  readonly key: string;
  /** Keyed by `DataColumn.key`. A column with no cell renders an empty cell. */
  readonly cells: Readonly<Record<string, ReactNode>>;
}

/**
 * THE TABLE — a real `<table>`, because a register of units is tabular.
 *
 * The design lab argued that a five-column table looks broken with one row and
 * does not survive 390px, and both are true of a table pretending to be a grid.
 * `observer-product.css` §14 answers each, and this component is the half of
 * that answer which lives in markup.
 *
 * ## Every cell carries its own column name
 *
 * Below 48rem the sheet hides `thead`, turns each row into a stacked record and
 * prints `attr(data-label)` in front of every cell. A `<td>` without
 * `data-label` becomes an unlabelled number in a list of unlabelled numbers,
 * which is exactly what a table with its header scrolled out of view already
 * is. So `data-label` is written unconditionally from the column's own label
 * rather than passed per cell — a per-cell prop is a per-cell chance to forget.
 *
 * ## Sorting is a link, and that is a decision about sharing
 *
 * The sort a reader chose is part of what they were looking at. Client state
 * would lose it the moment they sent the URL to a colleague, and the colleague
 * would open a differently ordered table and answer a different question. So
 * the header is an anchor to the same page with a different query, it works
 * with JavaScript disabled, and it goes through `withPeriod` for the same
 * reason every other link in this layer does.
 *
 * ## `aria-sort` is on the header cell, and the arrow is drawn as text
 *
 * ARIA permits `aria-sort` on `columnheader` and `rowheader` and nowhere else,
 * so it goes on the `<th>`. The sheet keys its arrow off `.ox-sort[aria-sort]`
 * — the attribute on the control itself — which would put an unpermitted
 * attribute on a link and fail an accessibility audit. Rather than choose
 * between a valid table and a visible sort indicator, the arrow is written as a
 * hidden-from-AT text glyph inside the control, and the mismatch is reported as
 * a gap in the design system rather than worked around in CSS.
 */
export function DataTable({
  caption,
  columns,
  rows,
  codeColumn = null,
  period,
  empty = null,
}: {
  /**
   * What this table lists, in a sentence. Required: a register with no caption
   * is a grid of numbers whose subject the reader has to infer from the page
   * around it, and a screen reader gets nothing at all.
   */
  readonly caption: string;
  readonly columns: readonly DataColumn[];
  readonly rows: readonly DataRow[];
  /**
   * Which column is the record's identity — the unit code, the meeting. That
   * cell takes `.ox-table-code`, which is what promotes it to the record's
   * title once the row has become a stacked record on a narrow screen.
   */
  readonly codeColumn?: string | null;
  readonly period: PeriodPreset;
  /**
   * What to say instead of an empty table. A five-column head over no rows
   * reads as a broken screen, so an empty register states itself in words.
   */
  readonly empty?: { readonly title: string; readonly note: string } | null;
}) {
  if (rows.length === 0 && empty !== null) {
    return <Empty title={empty.title} note={empty.note} />;
  }

  return (
    <div className="ox-table-wrap">
      <div className="ox-table-scroll">
        <table className="ox-table">
          <caption>{caption}</caption>

          <thead>
            <tr>
              {columns.map((column) => {
                const sort = column.sort ?? null;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    {...(column.numeric === true ? { "data-numeric": "true" } : {})}
                    {...(sort === null ? {} : { "aria-sort": sort.direction })}
                  >
                    {sort === null ? (
                      column.label
                    ) : (
                      <Link className="ox-sort" href={dynamicRoute(withPeriod(sort.href, period))}>
                        {column.label}
                        {sort.direction === "none" ? null : (
                          <span aria-hidden="true">
                            {sort.direction === "ascending" ? "▲" : "▼"}
                          </span>
                        )}
                      </Link>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-label={column.label}
                    {...(column.numeric === true ? { "data-numeric": "true" } : {})}
                    {...(column.key === codeColumn ? { className: "ox-table-code" } : {})}
                  >
                    {row.cells[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
