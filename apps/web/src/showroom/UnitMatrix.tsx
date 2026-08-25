"use client";

import { useState } from "react";
import Link from "next/link";
import type { UnitAttentionRow } from "@observer/readmodels";
import { dynamicRoute } from "@/lib/href";
import { Measure } from "./Measure";

/**
 * The unit list.
 *
 * Rebuilt after review: the first version had eight abbreviated columns and all
 * forty-eight units, which is a spreadsheet rather than an answer. Three
 * changes follow from that.
 *
 * **Fewer rows.** Only the units buyers actually opened, and only the top of
 * that list until the reader asks for more. A unit nobody looked at is a real
 * fact, but it is one sentence, not thirty rows.
 *
 * **Fewer columns, none abbreviated.** Six measurements, each with a glyph, its
 * full name, and an info control explaining what is behind the number. Screenshot,
 * share, balcony and floor-cut counts move into the detail panel, where they
 * belong to one unit rather than competing for width across all of them.
 *
 * **Nothing silently dropped.** The rows that are hidden are counted and named
 * beneath the table.
 */

const VISIBLE = 12;

export function UnitMatrix({
  rows,
  selectedCode,
  hrefFor,
}: {
  rows: readonly UnitAttentionRow[];
  selectedCode: string | null;
  /** Resolved on the server: a function cannot cross the boundary. */
  hrefFor: readonly { readonly code: string; readonly href: string }[];
}) {
  const [showAll, setShowAll] = useState(false);

  const opened = rows.filter((r) => r.meetings > 0);
  const untouched = rows.length - opened.length;
  const shown = showAll ? opened : opened.slice(0, VISIBLE);
  const href = (code: string) => hrefFor.find((h) => h.code === code)?.href ?? "#";

  return (
    <>
      <div className="iris-matrix" data-columns="6">
        <div className="iris-matrix-head">
          <span>Unit</span>
          <span>
            <Measure id="unit.attention" />
          </span>
          <span>
            <Measure id="unit.meetings" align="right" />
          </span>
          <span>
            <Measure id="unit.median_dwell" align="right" />
          </span>
          <span>
            <Measure id="unit.favourites" align="right" />
          </span>
          <span>
            <Measure id="unit.trend" align="right" />
          </span>
        </div>

        {shown.map((row) => (
          <Link
            key={row.unitId}
            className="iris-matrix-row"
            href={dynamicRoute(href(row.unitCode))}
            data-status={row.status}
            /*
             * aria-current, not aria-pressed.
             *
             * These rows are links, and aria-pressed belongs to toggle buttons —
             * axe rejects it here, and a screen reader would announce a control
             * that does not exist.
             */
            aria-current={selectedCode === row.unitCode ? "true" : undefined}
            scroll={false}
          >
            <span className="iris-matrix-code">
              {row.unitCode}
              <em>
                {row.rooms} rooms · {row.areaSqm} m²
              </em>
            </span>
            {/*
              * Every cell carries its own label.
              *
              * The header row disappears when the panel is too narrow for six
              * columns, and a stack of bare numbers is unreadable without it.
              * `data-label` is what the CSS prints in front of each figure, and
              * the visually-hidden copy is what a screen reader hears in both
              * layouts.
              */}
            <span
              className="iris-matrix-attention"
              data-label="Attention"
              style={{ "--a": row.attention.toFixed(3) } as React.CSSProperties}
            >
              <i />
              <span className="iris-sr">
                {Math.round(row.attention * 100)}% of the attention on the busiest unit
              </span>
            </span>
            <span className="iris-matrix-num" data-label="Meetings">
              {row.meetings}
            </span>
            <span className="iris-matrix-num" data-label="Typical look">
              {row.medianDwellSeconds >= 60
                ? `${Math.floor(row.medianDwellSeconds / 60)}m ${String(row.medianDwellSeconds % 60).padStart(2, "0")}s`
                : `${row.medianDwellSeconds}s`}
            </span>
            <span
              className="iris-matrix-num"
              data-label="Shortlisted"
              data-zero={row.favourites === 0 ? "true" : undefined}
            >
              {row.favourites}
            </span>
            <span className="iris-matrix-num" data-label="Trend" data-trend={row.trend}>
              {row.trendDisplay}
            </span>
          </Link>
        ))}
      </div>

      <div className="iris-matrix-foot">
        {opened.length > VISIBLE ? (
          <button type="button" className="iris-action" onClick={() => setShowAll(!showAll)}>
            {showAll ? `Show the busiest ${VISIBLE}` : `Show all ${opened.length} opened units`}
          </button>
        ) : null}
        {untouched === 0 ? null : (
          <p className="iris-meta" style={{ margin: 0 }}>
            {untouched} of {rows.length} units were never opened in front of a buyer this period.
            That is an observation about the presentation, not a gap in the data.
          </p>
        )}
      </div>
    </>
  );
}
