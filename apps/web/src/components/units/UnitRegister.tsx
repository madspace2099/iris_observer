import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { PeriodPreset, UnitAttentionRow } from "@observer/readmodels";
import { NOT_STATED, roomsWord } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import {
  DataTable,
  FilterBar,
  type DataColumn,
  type DataRow,
  type FilterField,
} from "@/components/product";
import { StatusChip } from "./UnitStatus";
import {
  REGISTER_PAGE,
  ROOMS_UNSTATED,
  SCOPE_OPTIONS,
  STATUS_OPTIONS,
  filterRows,
  registerHref,
  sortRows,
  sortStateFor,
  type RegisterQuery,
  type UnitSortKey,
} from "./register";

/**
 * THE UNIT DEMAND REGISTER — the densest table in the product.
 *
 * Twelve columns of one flat each, on the paper ground, and the ground is the
 * argument. ADR-0034 divides the product by CONTENT rather than by page: above
 * the seam is what we conclude and what a reader may do about it, below it is
 * what was measured. A register is nothing but measurement — a code, a floor, a
 * price, four counts and a share — so it is the surface the paper plate was
 * written for, and it is the one place in Observer where a reader is expected
 * to work down a column rather than read a sentence.
 *
 * ## Why a real table, with all twelve columns
 *
 * The surface this replaces was cut to six columns after review, on the correct
 * ground that eight abbreviated ones are a spreadsheet rather than an answer.
 * The correction here is not to add columns back but to give them somewhere to
 * be: a reader can now narrow the register to the rows they care about and
 * order it by the column they are asking about, which is what makes width
 * useful instead of merely present. The answer to the screen's question is
 * stated above it in one sentence, on graphite; this is the evidence underneath
 * it.
 *
 * Below 48rem the stylesheet turns each row into a stacked record and prints
 * every cell's own column name in front of it, which is why `DataTable` writes
 * `data-label` from the column unconditionally. A twelve-column table is not
 * a twelve-column table on a phone; it is forty-eight records.
 *
 * ## The order is the reader's, and it is not a ranking
 *
 * Every sortable header is a link, so the order survives being sent to somebody
 * else. What it is not is a verdict: `docs/10-policies.md` §6 refuses a rank
 * below the minimum sample, and a table sorted by views would hand the reader
 * one anyway if nothing said otherwise. The note beneath the table says
 * otherwise, in words, next to the definition of every measured column.
 *
 * ## Demand is derived and says so in its own heading
 *
 * `UnitAttentionRow.attention` is normalised against the busiest unit in the
 * project — the read model computes it, this component only draws it — and it
 * is the one column here that is not a count of something that happened. So the
 * heading carries the word DERIVED, the note carries the definition, and the
 * bar is drawn in the quiet ink `.ox-track-fill` gives every proportion in this
 * system. A proportion is never coloured: a green bar tells a reader the number
 * is good before they have read what it measures.
 */

/** One column, its heading, and the sentence that says what is behind it. */
interface RegisterColumn {
  readonly key: UnitSortKey;
  readonly label: string;
  readonly numeric: boolean;
  /** Null for the columns whose heading is already the whole definition. */
  readonly note: string | null;
}

/**
 * The register's columns, in the order a flat is described in.
 *
 * Catalogue attributes first — what the flat IS — then what buyers did with it,
 * then the derived share, then the one column a system of record stands behind.
 * That order is why the table can be read left to right as a sentence about one
 * apartment rather than as a grid whose columns happen to be adjacent.
 */
const COLUMNS: readonly RegisterColumn[] = [
  { key: "code", label: "Unit", numeric: false, note: null },
  {
    key: "status",
    label: "Status",
    numeric: false,
    note: "Whether the flat can still be sold. Stated by the unit catalogue.",
  },
  { key: "rooms", label: "Rooms", numeric: true, note: null },
  { key: "floor", label: "Floor", numeric: true, note: null },
  { key: "area", label: "Area m²", numeric: true, note: null },
  { key: "price", label: "Price", numeric: true, note: null },
  {
    key: "meetings",
    label: "Meetings",
    numeric: true,
    note: "Distinct meetings in which the unit was opened. People, not events — a flat opened four times in one meeting is one meeting.",
  },
  {
    key: "views",
    label: "Views",
    numeric: true,
    note: "Every time the unit was opened inside a presentation, returns included.",
  },
  {
    key: "favourites",
    label: "Shortlisted",
    numeric: true,
    note: "Meetings in which the shortlist action was recorded against this unit. The strongest interest signal the showroom produces.",
  },
  {
    key: "plans",
    label: "Plans opened",
    numeric: true,
    note: "Times the floor plan document was opened for this unit.",
  },
  {
    key: "comparisons",
    label: "Comparisons",
    numeric: true,
    note: "Times the unit was placed in Compare beside another, and how often it was the one kept.",
  },
  {
    key: "demand",
    label: "Demand · derived",
    numeric: false,
    note: "DERIVED. This unit's share of the looking time the busiest unit in the project drew, over the same period. It is an ordering aid and not a verdict: below the minimum sample the unit's own page states the shortfall instead of a direction.",
  },
  /*
   * A THIRTEENTH COLUMN USED TO SIT HERE, AND WHY IT DOES NOT.
   *
   * "Verified outcome" was drawn from `row.status` — the same field the
   * Status column two places from the left already draws. It was never a
   * second source agreeing with the first; it was the first source, printed
   * again eleven columns away, wearing the tone this system reserves for
   * "a person decided this". In two of the three states the two cells printed
   * the same word, and a `pre_reserved` unit, which the contract layer folds
   * into `reserved` (`packages/contracts/src/catalogue.ts:152-157`), arrived
   * in it as a confirmed reservation.
   *
   * The argument that removed it is not that it was redundant. It is that a
   * reader who meets Status=Sold and Verified=Sold is entitled to conclude
   * that two systems agree, and no two systems did. An empty space makes no
   * claim; that column made a false one.
   *
   * A real verified sale exists and is not this. `AssistedSale`
   * (`packages/readmodels/src/deal-source.ts:133-151`) is keyed by
   * `unitCode` and carries the CRM's stage, its stage date and its
   * `dateBasis`. Putting it in a column is wanted and is not free: it runs on
   * a second clock, it does not exist for every flat, and its coverage is
   * partial, so it needs both clocks named, a denominator, and the missing
   * rows told apart from the zeroes. That is its own piece of work and half of
   * it would be worse than none.
   */
];

/**
 * The comparison cell, and the difference between nought and nothing.
 *
 * A unit that was never placed in Compare has a real zero, and the words beside
 * it are what stop the reader wondering whether the feature was recorded at
 * all. That is the same shape `Figure` draws for an `empty` metric — the figure
 * and the sentence together — rather than the missing mark, which would claim a
 * source had failed to answer.
 */
function Comparisons({ row }: { readonly row: UnitAttentionRow }) {
  if (row.comparisonAppearances === 0) {
    return (
      <span className="ox-value">
        <span className="ox-figure">0</span>
        <span className="ox-of">never compared</span>
      </span>
    );
  }

  return (
    <span className="ox-value">
      <span className="ox-figure">{row.comparisonAppearances}</span>
      {row.comparisonWins === null ? null : (
        <span className="ox-of">kept {row.comparisonWins}</span>
      )}
    </span>
  );
}

/**
 * The derived share, as a proportion with its denominator in words.
 *
 * The width is inline because `.ox-track-fill` declares no width and no custom
 * property to feed one; that is a value going into the system rather than a
 * style routing around it, and it is reported as a gap all the same — a
 * `--ox-fill` consumed by the sheet would say the same thing without an inline
 * declaration.
 */
function Demand({ row }: { readonly row: UnitAttentionRow }) {
  const share = Math.round(row.attention * 100);
  return (
    <>
      <span className="ox-of">{share}% of the busiest unit</span>
      <div className="ox-track" aria-hidden="true">
        <div className="ox-track-fill" style={{ width: `${share}%` } as CSSProperties} />
      </div>
    </>
  );
}

export function UnitRegister({
  rows,
  base,
  query,
  period,
  caption,
  periodLabel,
}: {
  /** Every unit the projection returned, unfiltered and in its own order. */
  readonly rows: readonly UnitAttentionRow[];
  /** The register's own path, with no query string. */
  readonly base: string;
  readonly query: RegisterQuery;
  readonly period: PeriodPreset;
  /** What this table lists, in a sentence. Required by `DataTable`. */
  readonly caption: string;
  readonly periodLabel: string;
}) {
  const matching = filterRows(rows, query);
  const ordered = sortRows(matching, query);

  /*
   * A marked unit is always drawn.
   *
   * An attention state names a flat and links here with `?unit=…`. If that flat
   * happened to fall past the first twenty rows, the reader would arrive at a
   * register that does not contain the thing they were sent to look at, which
   * is worse than a long table. So a marked register is not truncated at all,
   * and the foot says why.
   */
  const truncate = !query.more && query.unit === null && ordered.length > REGISTER_PAGE;
  const shown = truncate ? ordered.slice(0, REGISTER_PAGE) : ordered;

  /*
   * Counting the rows about to be drawn is not a measurement of the project.
   * `FilterBar` requires it for a reason the meeting list learned the hard way:
   * a filter with no count leaves a reader unable to tell an empty result from
   * a filter that did not apply.
   */
  const neverOpened = rows.filter((row) => row.meetings === 0).length;

  const fields: readonly FilterField[] = [
    {
      kind: "search",
      name: "q",
      label: "Unit or aspect",
      value: query.q,
      placeholder: "A-402, or SW",
    },
    {
      kind: "select",
      name: "status",
      label: "Status",
      value: query.status,
      options: STATUS_OPTIONS,
    },
    {
      kind: "select",
      name: "rooms",
      label: "Rooms",
      value: query.rooms,
      options: [
        { value: "all", label: "Any" },
        /*
         * The options come from the catalogue rather than from a hard-coded
         * one-to-five. Nothing project-specific belongs in application logic:
         * a scheme of studios and a scheme of six-room penthouses are the same
         * product with different configuration.
         */
        ...[...new Set(rows.map((row) => row.rooms))]
          .filter((rooms): rooms is number => rooms !== null)
          .sort((a, b) => a - b)
          .map((rooms) => ({
            value: String(rooms),
            label: roomsWord(rooms),
          })),
        /* Units whose count is not stated are their own choice, never hidden in "Any". */
        ...(rows.some((row) => row.rooms === null)
          ? [{ value: ROOMS_UNSTATED, label: roomsWord(null) }]
          : []),
      ],
    },
    {
      kind: "select",
      name: "shown",
      label: "Register",
      value: query.scope,
      options: SCOPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    },
  ];

  const columns: readonly DataColumn[] = COLUMNS.map((column) => {
    const state = sortStateFor(column.key, base, query);
    return {
      key: column.key,
      label: column.label,
      numeric: column.numeric,
      sort: { href: state.href, direction: state.direction },
    };
  });

  const tableRows: readonly DataRow[] = shown.map((row) => {
    const marked = query.unit === row.unitCode;
    const cells: Readonly<Record<string, ReactNode>> = {
      code: (
        <Link
          /*
           * The register the reader built travels with them.
           *
           * This file's own folder states the rule — "the query string is the
           * register's whole state" — and a link that leaves without it hands
           * the unit page no way to send the reader back to the register they
           * were reading. `registerHref` omits the period deliberately, because
           * `withPeriod` adds it at the point of render; the two compose.
           *
           * The same argument the period already won here: a link that quietly
           * resets the reader's scope is the defect whether or not the
           * destination cares about the scope.
           */
          href={dynamicRoute(withPeriod(registerHref(`${base}/${row.unitCode}`, query), period))}
          /*
           * `aria-current="true"`, not `"page"` and not `aria-pressed`.
           *
           * These are links, and `aria-pressed` belongs to toggle buttons — axe
           * rejects it here and a screen reader would announce a control that
           * does not exist. The generic value is the right one: this row is the
           * current item within the register, which is a different statement
           * from being the current page, since following it leaves this screen.
           */
          {...(marked ? { "aria-current": "true" as const } : {})}
        >
          {row.unitCode}
        </Link>
      ),
      status: <StatusChip status={row.status} />,
      /* A count, a floor or an area the catalogue did not state is the word, not an empty cell. */
      rooms: row.rooms ?? NOT_STATED,
      floor: row.floor ?? NOT_STATED,
      area: row.areaSqm ?? NOT_STATED,
      price: row.priceDisplay,
      meetings: row.meetings,
      views: row.views,
      favourites: row.favourites,
      plans: row.pdfOpens,
      comparisons: <Comparisons row={row} />,
      demand: <Demand row={row} />,
    };
    return { key: row.unitId, cells };
  });

  return (
    <>
      <FilterBar
        action={base}
        fields={fields}
        period={period}
        label="Narrow the register"
        submitLabel="Apply"
        /*
         * A GET submit replaces the whole query string, so the order the reader
         * chose has to travel as hidden fields or it is lost the moment they
         * narrow the list. `more` deliberately does not travel: a new filter is
         * a new question and starts at the first page of it.
         */
        carry={{
          sort: query.sort,
          dir: query.dir === "ascending" ? "asc" : "desc",
          ...(query.unit === null ? {} : { unit: query.unit }),
        }}
        resultCount={
          <>
            {matching.length} of {rows.length} units
          </>
        }
      />

      <DataTable
        caption={caption}
        columns={columns}
        rows={tableRows}
        codeColumn="code"
        period={period}
        empty={{
          title: "No unit matches this filter.",
          note: `The register holds ${rows.length} units in ${periodLabel}. Widen the filter, or switch it to every unit in the catalogue.`,
        }}
      />

      {/*
       * The row is drawn only when it has something in it. An empty flex row
       * inside a plate whose gap is 28px is 28px of nothing, which reads on a
       * screenshot as a missing control rather than as an absent one.
       */}
      {!truncate && query.unit === null ? null : (
        <div className="ox-btn-row">
          {truncate ? (
            <Link
              className="ox-btn"
              href={dynamicRoute(withPeriod(registerHref(base, query, { more: true }), period))}
            >
              Show the remaining {ordered.length - shown.length} units
            </Link>
          ) : null}
          {query.unit === null ? null : (
            <Link
              className="ox-btn"
              data-weight="quiet"
              href={dynamicRoute(withPeriod(registerHref(base, query, { unit: null }), period))}
            >
              Clear the mark on {query.unit}
            </Link>
          )}
        </div>
      )}

      {/*
       * WHAT EVERY COLUMN MEASURES, AND WHAT THE ORDER IS NOT.
       *
       * The surface this replaces put an info control beside each heading, and
       * that property is worth keeping: a register whose columns are
       * unexplained is a register a reader will interpret rather than read.
       * `DataColumn.label` is a string and cannot hold a control, so the
       * definitions are stated once beneath the table instead — reported as a
       * gap in the shared layer rather than worked around by hand-rolling a
       * second table.
       */}
      <div>
        <p className="ox-subhead">How to read this register</p>
        <ul className="ox-scope">
          {/*
           * A `<p>` for the definition and a `<span>` for the term. The sheet
           * gives `.ox-n` `white-space: nowrap`, which is right for a sample
           * size and wrong for a sentence, and `.ox-section-note` is the
           * caption-sized ink this system already uses for a definition.
           */}
          <li className="ox-scope-item">
            <span>Order</span>
            <p className="ox-section-note">
              The reader&rsquo;s own arrangement, carried in the address. It is not a ranking, and
              no column here is a verdict about a flat.
            </p>
          </li>
          {COLUMNS.filter((column) => column.note !== null).map((column) => (
            <li className="ox-scope-item" key={column.key}>
              <span>{column.label}</span>
              <p className="ox-section-note">{column.note}</p>
            </li>
          ))}
          {neverOpened === 0 ? null : (
            <li className="ox-scope-item">
              <span>Not opened</span>
              <p className="ox-section-note">
                {neverOpened} of {rows.length} units were never opened in front of a buyer in{" "}
                {periodLabel}. That is an observation about the presentation, not a gap in the data;
                switch the register to every unit in the catalogue to see them.
              </p>
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
