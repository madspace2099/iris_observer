/**
 * The rest of the chart vocabulary.
 *
 * `charts.tsx` holds the four shapes the three views needed first. These are the
 * nine that answer questions the earlier set could not, each chosen because a
 * bar could not carry it:
 *
 *   Sparkline   a figure with its own recent history attached
 *   TrendLine   a series with the moment something changed marked on it
 *   StackedBars composition, and how the composition itself moved
 *   OutcomeRows an outcome mix per group, one row each, every row its own whole
 *   Bullet      one value against a target and the pace needed to reach it
 *   Heatmap     two dimensions at once — weekday against hour
 *   Funnel      why a group of meetings ended where it did, against the rest
 *   Radar       one profile across several dimensions, overlaid on another
 *   RankedBars  an ordered list where the order is the finding
 *   Sankey      where journeys go, and where they stop
 *
 * All hand-drawn SVG. A chart library's defaults are how a product ends up
 * looking like every other dashboard, and none of these is a default shape.
 */

import * as React from "react";
import Link from "next/link";
import { MEETING_OUTCOMES, type MeetingOutcome } from "@observer/contracts";
import type { BehaviourFunnel, PeriodPreset, StackedColumn } from "@observer/readmodels";
import { withMeetingFilters } from "@/components/meetings/filters";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { PairedRates } from "./charts";
import { DrawIn } from "./DrawIn";
import { Sized } from "./forms";

/* --- a figure with its history -------------------------------------------- */

/*
 * A level series draws a path with a box of no height, and a gradient sized to
 * its box paints nothing there (SVG's objectBoundingBox): the line vanished.
 * The mark says so, and a stylesheet that strokes with a gradient gives a
 * level line a plain colour instead.
 */
function level(values: readonly number[]): "true" | undefined {
  return values.every((v) => v === values[0]) ? "true" : undefined;
}

export function Sparkline({
  points,
  width = 96,
  height = 28,
  label,
}: {
  points: readonly number[];
  width?: number;
  height?: number;
  label?: string;
}) {
  if (points.length < 2) return null;
  const peak = Math.max(1, ...points);
  const step = width / (points.length - 1);
  const y = (v: number) => height - 2 - (v / peak) * (height - 4);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1] ?? 0;

  return (
    <DrawIn kind="sweep">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="iris-spark"
        role="img"
        aria-label={label ?? `Recent trend, latest ${last}`}
      >
        <path d={`${d} L ${width} ${height} L 0 ${height} Z`} className="iris-spark-fill" />
        <path d={d} className="iris-spark-line" data-level={level(points)} />
        <circle cx={width} cy={y(last)} r="2.5" className="iris-spark-tip" />
      </svg>
    </DrawIn>
  );
}

/**
 * A metric card.
 *
 * Not a chart — a summary figure with its comparison and its own recent shape.
 * The period it covers is the reader's choice, which is the point: "how many
 * presentations" is a different question this week and this year.
 */
export function KpiCard({
  label,
  value,
  qualifier,
  delta,
  tone,
  points,
  measurementId,
  info,
}: {
  label: React.ReactNode;
  value: string;
  qualifier: string | null;
  delta: string | null;
  tone: "good" | "bad" | "flat";
  points?: readonly number[];
  measurementId?: string;
  info?: React.ReactNode;
}) {
  void measurementId;
  /*
   * A figure that is a sentence ("7 of 7 sales measured", a median the
   * minimum sample withholds): a phone sets it at the body size across the
   * card rather than in the figure face beside the name. ponytail: words
   * counted, not a field of the read model; "13m 51s" and "12 days" stay figures.
   */
  const statement = value.trim().split(/\s+/).length > 2;
  return (
    <DrawIn kind="bloom">
      <article className="iris-kpi">
        <p className="iris-kpi-label">{info ?? label}</p>
        <p className="iris-kpi-value" data-statement={statement ? "true" : undefined}>
          {value}
        </p>
        <div className="iris-kpi-foot">
          <div>
            {delta === null ? null : (
              <span className="iris-kpi-delta" data-tone={tone}>
                {delta}
              </span>
            )}
            {qualifier === null ? null : <span className="iris-code">{qualifier}</span>}
          </div>
          {points === undefined ? null : (
            <Sparkline points={points} label={`${value} over recent weeks`} />
          )}
        </div>
      </article>
    </DrawIn>
  );
}

/* --- a series with its turning point marked -------------------------------- */

interface TrendProps {
  points: readonly { readonly label: string; readonly value: number }[];
  /** The moment worth pointing at, by index. */
  annotation?: { readonly index: number; readonly text: string } | null;
  height?: number;
  /**
   * The XL drawing's height, where a card gives it more room than a phone's
   * drawing has (Sales Flow's screen of its own, ADR-0059); the middle drawing
   * keeps the XL's proportions, so at the card width it takes over (544 to
   * 720px) it is no taller than the XL at 720. Omitted, every drawing takes
   * `height`.
   */
  wideHeight?: number;
  valueLabel: string;
  /** Opt-in: raises the 9px axis ticks to the 12px floor. Sales Flow only — see `charts.css`. */
  measured?: boolean;
}

/*
 * Three drawings of one series, each shown where its card holds it at 1:1 or
 * more (`Sized`): one 720-unit drawing on a 252px phone card printed its 12px
 * ticks at four. The phone's drawing labels every other week or fewer, and its
 * note stands under the plot as text, where it has the card's width.
 */
const TREND_SIZE = {
  xl: { width: 720, ticks: 8 },
  m: { width: 544, ticks: 6 },
  l: { width: 240, ticks: 4 },
} as const;

/*
 * A week label's width in the drawing's own units: every sheet sets the ticks
 * at 9 to 13 (the D card's phone drawing), so 8 a character is wide enough for
 * any of them. ponytail: an estimate, not a measurement; a wider tick face
 * would need it raised (or `getComputedTextLength` after mount).
 */
const TICK_CHAR = 8;
const TICK_GAP = 6;

/**
 * The weeks that carry a label: one in `ticks`, as before, then thinned from
 * the latest backwards so no label overlaps its neighbour by the width it
 * draws. The last week's label ends at its point, so it reaches a full width
 * to the left; on a phone that put "3 Aug" against it ("3 Aug17 Aug").
 */
export function trendTicks(
  labels: readonly string[],
  x: (i: number) => number,
  ticks: number,
): number[] {
  const stride = Math.ceil(labels.length / ticks);
  const shown: number[] = [];
  let edge = Infinity;
  for (let i = labels.length - 1; i >= 0; i--) {
    if (i % stride !== 0) continue;
    const width = (labels[i]?.length ?? 0) * TICK_CHAR;
    const right = i === labels.length - 1 ? x(i) : x(i) + width / 2;
    if (right + TICK_GAP > edge) continue;
    shown.push(i);
    edge = right - width;
  }
  return shown.reverse();
}

export function TrendLine(props: TrendProps) {
  if (props.points.length < 2) return null;
  /*
   * The phone's drawing labels one week in four, so the dashed mark can stand
   * at a week with no label: the caption names the marked week itself.
   */
  const marked = props.annotation == null ? undefined : props.points[props.annotation.index];
  const note =
    props.annotation == null || marked === undefined
      ? null
      : `${marked.label} · ${props.annotation.text}`;
  return (
    <DrawIn kind="sweep">
      <Sized
        xl={<TrendPlot {...props} height={props.wideHeight ?? props.height} size="xl" />}
        m={
          <TrendPlot
            {...props}
            height={
              props.wideHeight === undefined
                ? props.height
                : Math.round((props.wideHeight * TREND_SIZE.m.width) / TREND_SIZE.xl.width)
            }
            size="m"
          />
        }
        l={
          <>
            <TrendPlot {...props} size="l" />
            {note === null ? null : <p className="iris-trend-caption">{note}</p>}
          </>
        }
      />
    </DrawIn>
  );
}

function TrendPlot({
  points,
  annotation,
  height = 150,
  valueLabel,
  measured = false,
  size,
}: TrendProps & { readonly size: keyof typeof TREND_SIZE }) {
  const { width, ticks } = TREND_SIZE[size];
  const pad = { top: 14, right: 16, bottom: 26, left: 34 };
  const peak = Math.max(1, ...points.map((p) => p.value));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - (v / peak) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const marked = annotation === undefined || annotation === null ? null : points[annotation.index];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`iris-trend${measured ? " iris-trend-measured" : ""}`}
      role="img"
      aria-label={`${valueLabel}: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}`}
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(peak * t)}
            y2={y(peak * t)}
            className="iris-trend-grid"
          />
          <text x={pad.left - 6} y={y(peak * t) + 3} className="iris-trend-tick" textAnchor="end">
            {Math.round(peak * t)}
          </text>
        </g>
      ))}

      <path
        d={`${line} L ${x(points.length - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`}
        className="iris-trend-fill"
      />
      <path d={line} className="iris-trend-line" data-level={level(points.map((p) => p.value))} />

      {points.map((p, i) => (
        <circle key={p.label} cx={x(i)} cy={y(p.value)} r="2.5" className="iris-trend-dot">
          <title>{`${p.label}: ${p.value}`}</title>
        </circle>
      ))}

      {/* The annotation is the reason a line beats a table: it points at when. */}
      {marked === undefined || marked === null || annotation == null ? null : (
        <g>
          <line
            x1={x(annotation.index)}
            x2={x(annotation.index)}
            y1={pad.top}
            y2={pad.top + innerH}
            className="iris-trend-mark"
          />
          {/*
           * Flipped to the left once the mark is past the midpoint, so a note
           * on the last week is readable rather than clipped by the frame.
           * The phone's drawing has no room for it: `TrendLine` sets it under.
           */}
          {size === "l" ? null : (
            <text
              x={x(annotation.index) + (annotation.index > points.length / 2 ? -6 : 6)}
              y={pad.top + 10}
              textAnchor={annotation.index > points.length / 2 ? "end" : "start"}
              className="iris-trend-note"
            >
              {annotation.text}
            </text>
          )}
        </g>
      )}

      {trendTicks(
        points.map((p) => p.label),
        x,
        ticks,
      ).map((i) => (
        <text
          key={`${points[i]?.label ?? i}-x`}
          x={x(i)}
          y={height - 8}
          className="iris-trend-tick"
          /* The last week ends at its point, as the note above flips: centred it ran past the frame ("17 Au"). */
          textAnchor={i === points.length - 1 ? "end" : "middle"}
        >
          {points[i]?.label}
        </text>
      ))}
    </svg>
  );
}

/* --- composition, and how it moved ----------------------------------------- */

export function StackedBars({
  columns,
  keys,
  keyTotals,
}: {
  columns: readonly {
    readonly label: string;
    readonly parts: Readonly<Record<string, number>>;
    readonly total: number;
  }[];
  keys: readonly { readonly id: string; readonly label: string; readonly colour: string }[];
  /**
   * Overrides the key's own per-category counts, which otherwise sum every
   * column's `parts` together. That sum is only correct when columns are
   * disjoint (the month-composition case this component was built for); a
   * column that is an aggregate of the others (Sales Flow's "Team", beside
   * each agent) would otherwise be counted twice. Pass the aggregate
   * column's own `parts` here when one is present among `columns`.
   */
  keyTotals?: Readonly<Record<string, number>>;
}) {
  const peak = Math.max(1, ...columns.map((c) => c.total));

  return (
    <DrawIn kind="rise">
      <div className="iris-stacks">
        <div className="iris-stacks-plot">
          {columns.map((col) => (
            <div className="iris-stacks-item" key={col.label}>
              <span
                className="iris-stacks-column"
                style={{ height: `${(col.total / peak) * 100}%` }}
              >
                {keys.map((k) => {
                  const v = col.parts[k.id] ?? 0;
                  if (v === 0) return null;
                  return (
                    <span
                      key={k.id}
                      style={{ height: `${(v / col.total) * 100}%`, background: k.colour }}
                      title={`${col.label} · ${k.label}: ${v}`}
                    />
                  );
                })}
              </span>
              <span className="iris-stacks-total">{col.total}</span>
              <span className="iris-stacks-label">{col.label}</span>
            </div>
          ))}
        </div>
        <ul className="iris-ring-key iris-stacks-key">
          {keys.map((k) => (
            <li key={k.id}>
              <i style={{ background: k.colour }} />
              {k.label}
              <b>{keyTotals?.[k.id] ?? columns.reduce((a, c) => a + (c.parts[k.id] ?? 0), 0)}</b>
            </li>
          ))}
        </ul>
      </div>
    </DrawIn>
  );
}

/* --- an outcome mix per group, as rows --------------------------------------- */

/**
 * One row per group, each its own whole, so a share in one row compares with
 * the same share in any other (ADR-0041, outcome-rows amendment).
 *
 * The owner could not read `StackedBars` here: columns a few pixels wide, a
 * one-meeting part a 3px sliver, names wrapping under them, a presenter's
 * column dwarfed beside the team's, and a key whose colours came in pairs.
 * A row gives the bar the card's width and the name a line of its own.
 *
 * Parts run in the order of `keys` (the ladder, the unrecorded outcome last)
 * and a part with none is not drawn. The figure beside each bar is the read
 * model's (`ProgressedFigure`); widths are geometry, and nothing here counts.
 * The key states `keyCounts`, the team's own counts, never a sum of rows that
 * already include the team.
 *
 * With `open`, every part opens its meetings in the register (ADR-0053): the
 * register narrowed to the part's outcome, and to the row's presenter where the
 * row names one. The bar is then the pointer's (its parts are links out of the
 * tab order, as the scatter's points are), and a line of counts under it is the
 * keyboard's, the screen reader's and the phone's: a one-meeting part is a
 * sliver no finger can hit, and its count stood in a tooltip alone.
 */
type OutcomeRow = StackedColumn & {
  /** The presenter the row is, where it is one: the register narrows to them too. */
  readonly agentId?: string;
};

export function OutcomeRows({
  label,
  lead,
  rows,
  keys,
  keyCounts,
  open,
}: {
  /** The list's accessible name. */
  readonly label: string;
  /** The team, drawn first and set apart; left out where the rows are disjoint. */
  readonly lead?: OutcomeRow;
  /** In the read model's order: never re-sorted on a figure. */
  readonly rows: readonly OutcomeRow[];
  readonly keys: readonly { readonly id: string; readonly label: string }[];
  readonly keyCounts: Readonly<Record<string, number>>;
  /**
   * The register's path and the reader's period, for a reader the register
   * admits. Absent, nothing links: so the months, which the register has no
   * date range to narrow to.
   */
  readonly open?: { readonly register: string; readonly period: PeriodPreset };
}) {
  const all = lead === undefined ? rows : [lead, ...rows];
  /* Only an outcome the register's own vocabulary holds: anything else would open it unfiltered. */
  const hrefOf = (row: OutcomeRow, outcome: string) =>
    open === undefined || !(MEETING_OUTCOMES as readonly string[]).includes(outcome)
      ? null
      : dynamicRoute(
          withPeriod(
            withMeetingFilters(open.register, {
              agentId: row.agentId ?? null,
              channel: null,
              outcome: outcome as MeetingOutcome,
              features: null,
            }),
            open.period,
          ),
        );
  /* "Lena Fischer: 7 meetings ended Purchase — open them", the name the task gives a part's link. */
  const openLabel = (row: OutcomeRow, k: { readonly id: string; readonly label: string }) => {
    const n = row.parts[k.id] ?? 0;
    const what = k.id === "skipped" ? "with no outcome recorded" : `ended ${k.label}`;
    return `${row.label}: ${n} ${n === 1 ? "meeting" : "meetings"} ${what} — open ${n === 1 ? "it" : "them"}`;
  };
  return (
    <DrawIn kind="grow">
      <div className="iris-orows">
        <ul className="iris-orows-key" aria-label="Outcomes, with the count for the whole period">
          {keys.map((k) => (
            <li key={k.id}>
              <i className="iris-outcome-mark" data-outcome={k.id} aria-hidden="true" />
              {k.label}
              {keyCounts[k.id] === undefined ? null : <b>{keyCounts[k.id]}</b>}
            </li>
          ))}
        </ul>
        <ul className="iris-orows-list" aria-label={label}>
          {all.map((row, index) => {
            const drawn = keys
              .filter((k) => (row.parts[k.id] ?? 0) > 0)
              .map((k) => ({ ...k, href: hrefOf(row, k.id) }));
            const linked = drawn.flatMap((k) => (k.href === null ? [] : [{ ...k, href: k.href }]));
            const part = ({ href, ...k }: (typeof drawn)[number]) => {
              const title = `${row.label} · ${k.label}: ${row.parts[k.id]} of ${row.total}`;
              return href === null ? (
                <span
                  key={k.id}
                  className="iris-orow-part iris-outcome-mark"
                  data-outcome={k.id}
                  style={{ flexGrow: row.parts[k.id] }}
                  title={title}
                >
                  <b>{row.parts[k.id]}</b>
                </span>
              ) : (
                <Link
                  key={k.id}
                  href={href}
                  tabIndex={-1}
                  className="iris-orow-part iris-outcome-mark"
                  data-outcome={k.id}
                  style={{ flexGrow: row.parts[k.id] }}
                  title={`${title} — open them`}
                >
                  <b>{row.parts[k.id]}</b>
                </Link>
              );
            };
            /*
             * A row with no part is no image: the item's own name already says
             * so. A row whose parts link is none either: its count line below
             * names every part, and an image may not hold links.
             */
            const bar = (
              <span
                className="iris-orow-bar"
                {...(drawn.length === 0 || linked.length > 0
                  ? { "aria-hidden": true }
                  : {
                      role: "img",
                      "aria-label": drawn
                        .map((k) => `${k.label}: ${row.parts[k.id]} of ${row.total}`)
                        .join(", "),
                    })}
              >
                {drawn.map(part)}
              </span>
            );
            return (
              <li
                key={`${index}-${row.label}`}
                className="iris-orow"
                data-lead={row === lead ? "true" : undefined}
                data-below={row.figure.belowMinimum ? "true" : undefined}
                aria-label={`${row.label}: ${row.figure.meetingsDisplay}, ${row.figure.display}`}
                style={{ "--i": index } as React.CSSProperties}
              >
                <span className="iris-orow-who">
                  <span className="iris-orow-name">{row.label}</span>
                  <span className="iris-orow-total">{row.figure.meetingsDisplay}</span>
                </span>
                {linked.length === 0 ? (
                  bar
                ) : (
                  <span className="iris-orow-plot">
                    {bar}
                    <span className="iris-orow-open">
                      {linked.map((k) => (
                        <Link
                          key={k.id}
                          href={k.href}
                          className="iris-orow-count"
                          data-outcome={k.id}
                          aria-label={openLabel(row, k)}
                          title={openLabel(row, k)}
                        >
                          {/* Named in words as the key names it: a swatch alone is colour alone. */}
                          <i className="iris-outcome-mark" data-outcome={k.id} aria-hidden="true" />
                          {k.label}
                          <b>{row.parts[k.id]}</b>
                        </Link>
                      ))}
                    </span>
                  </span>
                )}
                <span className="iris-orow-figure">{row.figure.display}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </DrawIn>
  );
}

/* --- one value against a target -------------------------------------------- */

/**
 * Progress against a target, with the pace needed to reach it.
 *
 * A bullet rather than a percentage: the figure that matters is not "33% sold"
 * but "33% sold where the schedule wanted 41%", and only a marker on the same
 * axis makes that difference visible.
 */
export function BulletChart({
  rows,
}: {
  rows: readonly {
    readonly id: string;
    readonly label: string;
    /** Null when the source this counts from is not connected on this project. */
    readonly actual: number | null;
    readonly target: number;
    readonly pace: number;
    readonly total: number;
    readonly note: string;
  }[];
}) {
  return (
    <DrawIn kind="sweep">
      <div className="iris-bullets">
        {rows.map((row) => {
          const pct = (v: number) => `${Math.min(100, Math.max(0, (v / row.total) * 100))}%`;
          const unavailable = row.actual === null;
          const behind = !unavailable && row.actual < row.pace;
          return (
            <div className="iris-bullet" key={row.id}>
              <span className="iris-bullet-label">{row.label}</span>
              <span
                className="iris-bullet-track"
                title={row.note}
                data-unavailable={unavailable ? "true" : undefined}
              >
                {/* The qualitative bands: behind, on pace, ahead. */}
                <em
                  className="iris-bullet-band"
                  style={{ width: pct(row.pace * 0.8) }}
                  data-band="behind"
                />
                <em
                  className="iris-bullet-band"
                  style={{ width: pct(row.pace * 1.1) }}
                  data-band="near"
                />
                {/*
                No fill drawn when the source is not connected — an
                unmeasured actual gets no track at all, the same rule Unit
                Detail's evidence ladder applies, rather than a bar reading
                as a real, measured zero.
              */}
                {unavailable ? null : (
                  <i style={{ width: pct(row.actual) }} data-behind={behind ? "true" : undefined} />
                )}
                <b
                  style={{ "--pos": pct(row.pace) } as React.CSSProperties}
                  title={`Needed by now: ${Math.round(row.pace)}`}
                />
                <u
                  style={{ "--pos": pct(row.target) } as React.CSSProperties}
                  title={`Target: ${row.target}`}
                />
              </span>
              <span
                className="iris-bullet-value"
                data-behind={behind ? "true" : undefined}
                data-unavailable={unavailable ? "true" : undefined}
              >
                {unavailable ? "Unavailable" : `${row.actual} / ${row.target}`}
              </span>
            </div>
          );
        })}
        <p className="iris-code" style={{ color: "var(--ink-3)" }}>
          The vertical mark is where the schedule wanted this to be by now; the outline is the
          target.
        </p>
      </div>
    </DrawIn>
  );
}

/* --- two dimensions at once ------------------------------------------------ */

/**
 * Weekday against hour.
 *
 * A heatmap because the question has two dimensions and a bar chart has one.
 * The cell is the count; luminance carries it, and the figure is written in
 * where it fits so the grid is readable without a legend lookup.
 */
export function Heatmap({
  rows,
  columns,
  cells,
  caption,
}: {
  rows: readonly string[];
  columns: readonly string[];
  /** Indexed `${row}|${column}`. */
  cells: Readonly<Record<string, number>>;
  caption: string;
}) {
  const peak = Math.max(1, ...Object.values(cells));

  /*
   * "09:00" and "10:00" run into each other at 390px.
   *
   * The hour alone is enough on a column header — the caption says these are
   * hours, and the cell's own tooltip and the prose beneath both carry the full
   * time. Only a `HH:MM` label is shortened; anything else is left alone.
   */
  const short = (label: string) => (/^\d\d:\d\d$/.test(label) ? label.slice(0, 2) : label);

  return (
    <DrawIn kind="bloom">
      <figure className="iris-heat" style={{ margin: 0 }}>
        {/*
         * One image with a stated summary, not 70 unlabelled squares.
         *
         * A screen reader walking a grid of numbers learns nothing a sentence
         * could not have told it, so the caption carries the finding and the
         * squares carry the shape.
         */}
        <div
          className="iris-heat-grid"
          role="img"
          aria-label={caption}
          style={{ gridTemplateColumns: `4.5rem repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          <span />
          {columns.map((c) => (
            <span className="iris-heat-col" key={c}>
              {short(c)}
            </span>
          ))}
          {rows.map((r) => (
            <React.Fragment key={r}>
              <span className="iris-heat-row">{r}</span>
              {columns.map((c) => {
                const v = cells[`${r}|${c}`] ?? 0;
                return (
                  <span
                    key={`${r}-${c}`}
                    className="iris-heat-cell"
                    style={{ "--v": (v / peak).toFixed(3) } as React.CSSProperties}
                    title={`${r} ${c}: ${v}`}
                    data-empty={v === 0 ? "true" : undefined}
                  >
                    {v === 0 ? "" : v}
                  </span>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <figcaption className="iris-meta iris-meta-measured" style={{ marginTop: ".625rem" }}>
          {caption}
        </figcaption>
      </figure>
    </DrawIn>
  );
}

/* --- why a group of meetings ended where it did ------------------------------ */

/**
 * The meetings that ended "not interested", against every other recorded
 * meeting (ADR-0053).
 *
 * Named for the shape it replaced: nested bands of behaviours whose "68% on its
 * own · 80% elsewhere" the owner could not read, and which told him which
 * feature was opened how often and nothing about why the meetings failed
 * (2026-10-22). Four parts now, every figure and word the read model's:
 *
 *   the lead        the clearest difference, both sample sizes, as association
 *   the figures     median length, features and apartments opened, the others' beside
 *   whose they were each presenter's count against their own, opening their meetings
 *   what they did   each behaviour in the group against the others, widest gap first
 *
 * A presenter's name opens their meetings of the group in the register, for a
 * reader the register admits. Their bar is the rate printed beside it, their
 * count over their own recorded meetings, and is drawn only where that rate is
 * stated: a bar of their part of the group beside a rate of their own meetings
 * drew one proportion next to another (review, 2026-10-22).
 */
export function Funnel({
  data,
  period,
  canOpen,
}: {
  readonly data: BehaviourFunnel;
  /** The reader's period, carried by every link. */
  readonly period: PeriodPreset;
  /** Whether this reader may open the register; never a link that leads to a refusal. */
  readonly canOpen: boolean;
}) {
  return (
    <div className="iris-cohort">
      {data.lead === null ? null : <p className="iris-cohort-lead">{data.lead}</p>}
      {data.figures.length === 0 ? null : (
        <div className="iris-kpis">
          {data.figures.map((f) => (
            <KpiCard
              key={f.id}
              label={f.label}
              value={f.value}
              qualifier={f.qualifier}
              delta={null}
              tone="flat"
            />
          ))}
        </div>
      )}
      <div className="iris-cohort-parts">
        <section className="iris-cohort-part" aria-labelledby="cohort-whose">
          <h3 id="cohort-whose">Whose they were</h3>
          <DrawIn kind="grow">
            <ul className="iris-orows-list" aria-labelledby="cohort-whose">
              {data.byAgent.map((a, index) => (
                <li
                  key={a.agentId}
                  className="iris-orow"
                  data-below={a.belowMinimum ? "true" : undefined}
                  style={{ "--i": index } as React.CSSProperties}
                >
                  <span className="iris-orow-who">
                    {canOpen && a.href !== null ? (
                      <Link
                        className="iris-orow-name iris-orow-link"
                        href={dynamicRoute(withPeriod(a.href, period))}
                        aria-label={`${a.name}: ${a.count} ${a.count === 1 ? "meeting" : "meetings"} ended "not interested" — open ${a.count === 1 ? "it" : "them"}`}
                      >
                        {a.name}
                      </Link>
                    ) : (
                      <span className="iris-orow-name">{a.name}</span>
                    )}
                    <span className="iris-orow-total">{a.recordedDisplay}</span>
                  </span>
                  {/* The bar is the rate beside it, the read model's; under the floor neither is stated. */}
                  <span className="iris-orow-bar" aria-hidden="true">
                    {a.share === null || a.count === 0 ? null : (
                      <>
                        <span
                          className="iris-orow-part iris-outcome-mark"
                          data-outcome="not_interested"
                          style={{ flexGrow: a.share }}
                        >
                          <b>{a.count}</b>
                        </span>
                        <span className="iris-orow-rest" style={{ flexGrow: 1 - a.share }} />
                      </>
                    )}
                  </span>
                  <span className="iris-orow-figure">{a.display}</span>
                </li>
              ))}
            </ul>
          </DrawIn>
        </section>
        <section className="iris-cohort-part" aria-labelledby="cohort-did">
          <h3 id="cohort-did">What they did, against the others</h3>
          {data.reach.length === 0 ? (
            <p className="iris-meta iris-meta-measured">{data.reachOf}</p>
          ) : (
            <PairedRates
              rows={data.reach.map((r) => ({
                id: r.id,
                label: r.label,
                left: r.share,
                right: r.comparisonShare,
                note: r.text,
              }))}
              leftLabel="This group"
              rightLabel="Others"
              of={data.reachOf}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/* --- one profile against another -------------------------------------------- */

/**
 * Several dimensions at once, overlaid.
 *
 * A radar earns its place only when the *shape* is the finding — an agent who
 * is strong on three axes and absent on a fourth reads instantly, where six
 * paired bars do not. Axes are always the same order and the same scale, so two
 * profiles can be laid over each other.
 */
export function Radar({
  axes,
  series,
  size = 240,
}: {
  axes: readonly string[];
  series: readonly {
    readonly id: string;
    readonly label: string;
    readonly values: readonly number[];
    readonly tone: string;
  }[];
  size?: number;
}) {
  const c = size / 2;
  const r = c - 30;
  /*
   * Room outside the square for the axis names.
   *
   * A radar drawn to a square viewBox clips its own left and right labels —
   * "Returns" became "eturns" — so the box is widened rather than the words
   * shortened. An axis nobody can read is an axis that is not there.
   */
  const padX = 48;
  const point = (i: number, v: number) => {
    const a = (i / axes.length) * 2 * Math.PI - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };

  return (
    <DrawIn kind="bloom">
      <div className="iris-radar">
        <svg
          width={size + padX * 2}
          height={size}
          viewBox={`${-padX} 0 ${size + padX * 2} ${size}`}
          role="img"
          aria-label={`Profile across ${axes.join(", ")}`}
        >
          {[0.25, 0.5, 0.75, 1].map((ring) => (
            <polygon
              key={ring}
              className="iris-radar-web"
              points={axes.map((_, i) => point(i, ring).join(",")).join(" ")}
            />
          ))}
          {axes.map((_, i) => {
            const [x, y] = point(i, 1);
            return <line key={i} x1={c} y1={c} x2={x} y2={y} className="iris-radar-spoke" />;
          })}
          {series.map((s) => (
            <polygon
              key={s.id}
              className="iris-radar-shape"
              style={{ "--tone": s.tone } as React.CSSProperties}
              points={s.values
                .map((v, i) => point(i, Math.max(0.02, Math.min(1, v))).join(","))
                .join(" ")}
            />
          ))}
          {axes.map((axis, i) => {
            const [x, y] = point(i, 1.16);
            return (
              <text
                key={axis}
                x={x}
                y={y}
                className="iris-radar-axis"
                textAnchor={x < c - 4 ? "end" : x > c + 4 ? "start" : "middle"}
                dominantBaseline="middle"
              >
                {axis}
              </text>
            );
          })}
        </svg>
        {/*
         * A key tells shapes apart. One shape has nothing to tell apart, and
         * its label is the card's caption, drawn by the card under the shape.
         * The roster hands one profile per cell, and each cell was getting a
         * key for one shape — a swatch beside the one name — standing where
         * the caption belongs.
         */}
        {series.length > 1 ? (
          <ul className="iris-ring-key">
            {series.map((s) => (
              <li key={s.id}>
                <i style={{ background: s.tone }} />
                {s.label}
                <b />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </DrawIn>
  );
}

/* --- an ordered list where the order is the finding -------------------------- */

export function RankedBars({
  rows,
  period,
  valueSuffix = "",
  measured = false,
  peak: scale,
  collapseAfter,
  tone,
  marks,
}: {
  rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly sub: string | null;
    readonly value: number;
    readonly display: string;
    readonly href?: string | null;
  }[];
  /**
   * The reader's period, carried by every row that links. Required, not
   * optional: six of ten callers handed read-model routes through raw, and a
   * reader on "Last 28 days" who opened a ranked agent or meeting was
   * returned to the quarter (P2-16).
   */
  period: PeriodPreset;
  valueSuffix?: string;
  /**
   * Opt-in only: Sales Flow's two lists pass this, Sales Agents' does not.
   * `.iris-ranked-name em` is a shared rule (`charts.css`) with one consumer
   * per route; this keeps a Flow-scoped size correction from silently
   * changing Agents' own list too. See `charts.css` for the rule this class
   * enables.
   */
  measured?: boolean;
  /**
   * What a full bar stands for, when that is not the largest row: a list whose
   * bars are read against a fixed scale (a window of hours) rather than against
   * each other. Absent, the longest row fills the track as before.
   */
  peak?: number;
  /**
   * Opt-in, and Sales Flow's only (R05 item 8): show this many rows and the
   * rest behind "Show all". The hidden rows keep their places and the shared
   * scale, so opening the list changes nothing a row says. A list whose rows
   * carry their own denominator must not pass this: a denominator stays on
   * screen. Absent, every row is drawn as before.
   */
  collapseAfter?: number;
  /**
   * The bars' colour in a chart card, when it says something (design-lab-d.css):
   * "volume" for a plain count of work, "late" for time stalled, a verdict.
   * Absent, the bars are neutral.
   */
  tone?: "volume" | "late";
  /**
   * A mark to stand before a row's name, keyed by row id: an agent's portrait
   * (ADR-0054). Rows without one are drawn as before.
   */
  marks?: Readonly<Record<string, React.ReactNode>>;
}) {
  const peak = scale ?? Math.max(1, ...rows.map((r) => r.value));
  const className = `iris-ranked${measured ? " iris-ranked-measured" : ""}`;
  const cut =
    collapseAfter !== undefined && rows.length > collapseAfter ? collapseAfter : rows.length;

  const item = (row: (typeof rows)[number], place: number) => (
    <li key={row.id}>
      <span className="iris-ranked-place">{place}</span>
      <span
        className="iris-ranked-name"
        data-marked={marks?.[row.id] === undefined ? undefined : ""}
      >
        {marks?.[row.id]}
        {row.href === undefined || row.href === null ? (
          row.label
        ) : (
          <Link href={dynamicRoute(withPeriod(row.href, period))}>{row.label}</Link>
        )}
        {/* Truncated visibly, and never unreachable: the full line is the
            element's own title. */}
        {row.sub === null ? null : <em title={row.sub}>{row.sub}</em>}
      </span>
      <span className="iris-ranked-track">
        <i style={{ width: `${(row.value / peak) * 100}%` }} />
      </span>
      <span className="iris-ranked-value">
        {row.display}
        {valueSuffix}
      </span>
    </li>
  );

  return (
    <DrawIn kind="sweep">
      <ol className={className} data-tone={tone}>
        {rows.slice(0, cut).map((r, i) => item(r, i + 1))}
      </ol>
      {cut === rows.length ? null : (
        <details className="iris-ranked-more">
          <summary className="iris-action">Show all</summary>
          <ol className={className} data-tone={tone} start={cut + 1}>
            {rows.slice(cut).map((r, i) => item(r, cut + i + 1))}
          </ol>
        </details>
      )}
    </DrawIn>
  );
}

/* --- a running order, with the time spent at each stop ---------------------- */

/**
 * What one presenter opens, in what order, and for how long.
 *
 * The order is a mean position across their meetings, not one meeting's
 * sequence — nobody presents the same way twice, and a single path shown as
 * "the" path would claim more than the data says. The team's median sits beside
 * each row because a section time on its own is a number without a scale.
 *
 * One table rather than a running order here and a share-of-time chart
 * elsewhere: the same measurement drawn twice invites the reader to compare a
 * chart against itself.
 */
export function SectionSequence({
  rows,
  agentLabel,
  showTeam,
}: {
  rows: readonly {
    readonly sectionId: string;
    readonly label: string;
    readonly order: number;
    readonly dwellDisplay: string;
    readonly medianDwellSeconds: number | null;
    readonly teamDwellDisplay: string;
    readonly reachRate: number;
    readonly returnRate: number;
    readonly availability: string;
  }[];
  agentLabel: string;
  /**
   * Whether the team's median is printed beside each stop. The page decides,
   * from the sample floor: the team's figure is a comparison, and below the
   * floor no comparison is made — the same rule the page applies to the
   * project's rate two charts up.
   */
  showTeam: boolean;
}) {
  const peak = Math.max(1, ...rows.map((r) => r.medianDwellSeconds ?? 0));

  return (
    <DrawIn kind="sweep">
      <ol className="iris-sequence">
        {rows.map((row) => (
          <li key={row.sectionId}>
            <span className="iris-sequence-step">{row.order}</span>
            <span className="iris-sequence-name">
              {row.label}
              <em>
                reached in {Math.round(row.reachRate * 100)}% of their meetings
                {row.returnRate < 0.05
                  ? null
                  : ` · came back in ${Math.round(row.returnRate * 100)}%`}
              </em>
            </span>
            <span className="iris-sequence-track">
              {/*
               * Scaled against this agent's own longest stop, so the bar shows
               * where their time went. The comparison to the team is the number
               * beside it, not a second bar — two scales in one row is how a
               * reader reads the wrong one.
               */}
              <i style={{ width: `${((row.medianDwellSeconds ?? 0) / peak) * 100}%` }} />
            </span>
            <span className="iris-sequence-time">
              {row.dwellDisplay}
              {showTeam ? <em>team {row.teamDwellDisplay}</em> : null}
            </span>
          </li>
        ))}
        <li className="iris-sequence-foot">
          <span />
          <span className="iris-sequence-name">
            <em>
              {agentLabel} typically opens these in this order. Times are the median stay in each
              section, not the total.
            </em>
          </span>
        </li>
      </ol>
    </DrawIn>
  );
}

/* --- where journeys go, and where they stop ---------------------------------- */

export interface FlowLink {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

/**
 * A journey flow, in bands.
 *
 * Two columns of nodes with ribbons between them, sized by how many
 * presentations took that step. The dropped-out band is drawn as its own
 * terminal node rather than left implicit — the whole reason to draw a flow is
 * to see where people stop.
 */
export function JourneyFlow({
  stages,
  links,
  height = 260,
}: {
  stages: readonly { readonly id: string; readonly label: string; readonly count: number }[];
  links: readonly FlowLink[];
  height?: number;
}) {
  if (stages.length < 2) return null;

  const width = 760;
  const pad = { top: 34, bottom: 34 };
  const nodeW = 22;
  const plot = height - pad.top - pad.bottom;
  const total = Math.max(1, stages[0]?.count ?? 1);

  /*
   * Every stage hangs from the same line at the top.
   *
   * With both ends of a band aligned that way the band tapers downwards only,
   * and the taper *is* the drop-out — nothing has to be drawn twice or
   * explained in a key. The number in the gap says how many stopped there.
   */
  const gap = (width - nodeW) / (stages.length - 1);
  const placed = stages.map((s, i) => ({
    ...s,
    x: i * gap,
    h: Math.max(2, (s.count / total) * plot),
  }));

  const survivors = new Map(links.map((l) => [`${l.from}|${l.to}`, l.count]));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="iris-flow"
      role="img"
      aria-label={`Journey: ${stages.map((s) => `${s.label} ${s.count}`).join(", ")}`}
      preserveAspectRatio="xMinYMid meet"
    >
      {placed.slice(0, -1).map((from, i) => {
        const to = placed[i + 1];
        if (to === undefined) return null;
        const carried = survivors.get(`${from.id}|${to.id}`) ?? to.count;
        const bandH = Math.max(1, (carried / total) * plot);
        const x0 = from.x + nodeW;
        const x1 = to.x;
        const c0 = x0 + (x1 - x0) * 0.45;
        const c1 = x1 - (x1 - x0) * 0.45;
        const lost = from.count - carried;

        return (
          <g key={`${from.id}-${to.id}`}>
            <path
              className="iris-flow-ribbon"
              d={[
                `M ${x0} ${pad.top}`,
                `L ${x1} ${pad.top}`,
                `L ${x1} ${pad.top + bandH}`,
                `C ${c1} ${pad.top + bandH}, ${c0} ${pad.top + from.h}, ${x0} ${pad.top + from.h}`,
                "Z",
              ].join(" ")}
            >
              <title>{`${from.label} → ${to.label}: ${carried}`}</title>
            </path>
            {lost <= 0 ? null : (
              <text
                x={(x0 + x1) / 2}
                y={pad.top + from.h + 14}
                textAnchor="middle"
                className="iris-flow-drop"
              >
                −{lost}
              </text>
            )}
          </g>
        );
      })}

      {placed.map((node, i) => {
        /*
         * The first and last labels hang off their node's OUTER edge rather
         * than its centre. Centred on a 22px node at x=0 or x=738, "Presented"
         * and "Progressed" ran 13-15px past the viewBox on both sides and the
         * SVG clipped them — measured at every width, "esented" / "Progres".
         * Anchoring the ends keeps every label inside the drawing without
         * shrinking, shortening or hiding any of them.
         */
        const anchor = i === 0 ? "start" : i === placed.length - 1 ? "end" : "middle";
        const labelX =
          i === 0 ? node.x : i === placed.length - 1 ? node.x + nodeW : node.x + nodeW / 2;
        return (
          <g key={node.id}>
            <rect
              x={node.x}
              y={pad.top}
              width={nodeW}
              height={node.h}
              rx="2"
              className="iris-flow-node"
            />
            <text x={labelX} y={pad.top - 18} textAnchor={anchor} className="iris-flow-label">
              {node.label}
            </text>
            <text
              x={node.x + nodeW / 2}
              y={pad.top - 6}
              textAnchor="middle"
              className="iris-flow-count"
            >
              {node.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
