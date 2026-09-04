import type { PeriodPreset, SectionUsage } from "@observer/readmodels";

import { DataTable, type DataColumn, type DataRow } from "@/components/product";
import { Absent, Count, Rate, Stay } from "./Reading";
import type { RegisterOrder } from "./order";
import { glanceIsMeasured, kindLabel, returnIsMeasured, stayOf } from "./vocabulary";

/**
 * How the register is currently ordered, and where each column links to.
 *
 * The hrefs are built by the SCREEN and handed over already assembled, because
 * the screen is the only thing that knows the rest of the query string — which
 * cut is open, which period is set. A register that rebuilt the URL from a
 * column name alone would silently drop the reader's cut, which is the same
 * class of defect as navigation dropping the period.
 *
 * `null` for the whole object means the register offers no ordering at all.
 * That is not a styling choice: below the minimum sample there is no rank, so
 * the screen passes `null` and the headers become plain text rather than dead
 * links. A disabled sort control would be a control that looks ready and does
 * nothing; no control at all, with the reason stated in the caption, is the
 * honest form of the same refusal.
 */
export interface RegisterSort {
  readonly order: RegisterOrder | null;
  readonly direction: "ascending" | "descending";
  /** Column key to the href that applies that column's order. */
  readonly hrefs: Readonly<Record<string, string>>;
}

/**
 * THE FEATURE REGISTER — what each part of the presentation did, per feature.
 *
 * A real `<table>`, on the paper ground, because this is the measured body of
 * the screen: nine rows of readings with a shared set of columns is the
 * definition of tabular, and `observer-product.css` §14 built the register
 * treatment for exactly this. Everything above it on graphite is what we
 * concluded; this is what was counted.
 *
 * ## The distinction the whole screen turns on
 *
 * REACHED is not PRESENTED. The legacy dashboard collapsed the two and graded
 * one click as "High" engagement, and the columns here are arranged so that the
 * collapse is impossible to make by accident:
 *
 *   Opened in      presentations that reached the feature at all, out of every
 *                  presentation in the period. The denominator is in the cell.
 *   Opens          entries into the feature, returns included. A presentation
 *                  that came back to Residences four times is one presentation
 *                  and four opens, and "most used" answers a different question
 *                  depending on which of the two it counts. Both are shown.
 *   Median stay    how long a stop lasted, at the median rather than the mean,
 *                  because one twenty-minute pause moves a mean and tells the
 *                  reader nothing about a typical presentation.
 *   Opened, left   the share of timed opens that ended under the showroom's
 *                  meaningful-dwell threshold. This is the column that stops
 *                  reach being read as engagement.
 *   Came back      the share of the presentations that reached it and returned
 *                  to it later.
 *
 * There is no completion column and there is no abandonment column, because the
 * showroom emits no completion event. "Opened, left" is what the instrument can
 * actually say, and it is labelled as what it is rather than dressed as a
 * funnel step.
 *
 * ## Every absence is drawn as an absence
 *
 * Three of the five figures arrive as `0` when there is nothing to measure —
 * the read model divides by `max(1, …)` so its own arithmetic cannot produce a
 * `NaN`, and the price of that is a zero standing where a measurement is
 * missing. `stayOf`, `glanceIsMeasured` and `returnIsMeasured` in
 * `./vocabulary` decide which zeros are readings and which are placeholders,
 * and the placeholders render as the sheet's missing mark with their reason. A
 * feature nobody opened and a feature the build cannot time say different
 * words, because they call for different decisions.
 */
export function FeatureRegister({
  sections,
  meetingsTotal,
  period,
  caption,
  sort,
  empty,
}: {
  readonly sections: readonly SectionUsage[];
  /** Presentations recorded in the period. The denominator of every reach. */
  readonly meetingsTotal: number;
  readonly period: PeriodPreset;
  readonly caption: string;
  readonly sort: RegisterSort | null;
  readonly empty: { readonly title: string; readonly note: string };
}) {
  /**
   * A column's sort state, or `null` where the register offers no ordering.
   *
   * `"none"` means sortable and not currently sorted, which is what the header
   * needs in order to be a link without claiming an order it is not in.
   */
  const sortOf = (key: RegisterOrder) => {
    if (sort === null) return null;
    const href = sort.hrefs[key];
    if (href === undefined) return null;
    return { href, direction: sort.order === key ? sort.direction : ("none" as const) };
  };

  const columns: readonly DataColumn[] = [
    { key: "feature", label: "Feature", sort: sortOf("feature") },
    { key: "kind", label: "Role in the presentation" },
    { key: "reach", label: "Opened in", numeric: true, sort: sortOf("reach") },
    { key: "opens", label: "Opens", numeric: true, sort: sortOf("opens") },
    { key: "stay", label: "Median stay", numeric: true, sort: sortOf("stay") },
    { key: "glance", label: "Opened, left", numeric: true, sort: sortOf("glance") },
    { key: "returns", label: "Came back", numeric: true, sort: sortOf("returns") },
  ];

  const rows: readonly DataRow[] = sections.map((section) => {
    const stay = stayOf(section);

    return {
      key: section.sectionId,
      cells: {
        feature: (
          <>
            {section.label}
            {/*
             * The chip appears ONLY where adoption says something.
             *
             * `established` is the unremarkable answer for eight rows out of
             * nine, and a chip on every row saying so is the excessive-pills
             * failure the doctrine names outright — nine identical badges that
             * carry no information and train the reader to stop reading badges.
             * `no_baseline` is not marked per row either: it is true of every
             * row at once whenever it is true at all, so the screen states it
             * once above the table.
             *
             * `data-tone="settled"` is the sheet's neutral chip. Newly adopted
             * is a fact about change and not a verdict, and the tones that
             * carry a judgement — good, watch, poor — would all make it one.
             */}
            {section.adoption === "new_in_period" ? (
              <>
                {" "}
                <span className="ox-chip" data-tone="settled">
                  <span className="ox-chip-mark" aria-hidden="true" />
                  New this period
                </span>
              </>
            ) : null}
          </>
        ),
        kind: kindLabel(section.kind),
        reach: <Count n={section.meetings} of={meetingsTotal} />,
        opens: <Count n={section.opens} />,
        stay:
          stay.kind === "present" ? (
            <Stay seconds={stay.seconds} />
          ) : stay.kind === "not_reached" ? (
            <Absent word="Not reached" reason="no presentation opened this feature in the period" />
          ) : (
            <Absent word="Not timed" reason={stay.reason} />
          ),
        glance: glanceIsMeasured(section) ? (
          <Rate share={section.glanceRate} />
        ) : section.meetings === 0 ? (
          <Absent word="Not reached" reason="no presentation opened this feature in the period" />
        ) : (
          <Absent
            word="Not timed"
            reason="a stay under the threshold cannot be counted where no stay was recorded"
          />
        ),
        returns: returnIsMeasured(section) ? (
          <Rate share={section.returnRate} />
        ) : (
          <Absent word="Not reached" reason="no presentation opened this feature in the period" />
        ),
      },
    };
  });

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      codeColumn="feature"
      period={period}
      empty={empty}
    />
  );
}
