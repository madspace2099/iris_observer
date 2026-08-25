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
 *   Bullet      one value against a target and the pace needed to reach it
 *   Heatmap     two dimensions at once — weekday against hour
 *   Funnel      what survives each step, and what falls out
 *   Radar       one profile across several dimensions, overlaid on another
 *   RankedBars  an ordered list where the order is the finding
 *   Sankey      where journeys go, and where they stop
 *
 * All hand-drawn SVG. A chart library's defaults are how a product ends up
 * looking like every other dashboard, and none of these is a default shape.
 */

import * as React from "react";
import Link from "next/link";
import { dynamicRoute } from "@/lib/href";

/* --- a figure with its history -------------------------------------------- */

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
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="iris-spark"
      role="img"
      aria-label={label ?? `Recent trend, latest ${last}`}
    >
      <path d={`${d} L ${width} ${height} L 0 ${height} Z`} className="iris-spark-fill" />
      <path d={d} className="iris-spark-line" />
      <circle cx={width} cy={y(last)} r="2.5" className="iris-spark-tip" />
    </svg>
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
  return (
    <article className="iris-kpi">
      <p className="iris-kpi-label">{info ?? label}</p>
      <p className="iris-kpi-value">{value}</p>
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
  );
}

/* --- a series with its turning point marked -------------------------------- */

export function TrendLine({
  points,
  annotation,
  height = 150,
  valueLabel,
}: {
  points: readonly { readonly label: string; readonly value: number }[];
  /** The moment worth pointing at, by index. */
  annotation?: { readonly index: number; readonly text: string } | null;
  height?: number;
  valueLabel: string;
}) {
  if (points.length < 2) return null;
  const width = 720;
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
      className="iris-trend"
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
      <path d={line} className="iris-trend-line" />

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
           */}
          <text
            x={x(annotation.index) + (annotation.index > points.length / 2 ? -6 : 6)}
            y={pad.top + 10}
            textAnchor={annotation.index > points.length / 2 ? "end" : "start"}
            className="iris-trend-note"
          >
            {annotation.text}
          </text>
        </g>
      )}

      {points.map((p, i) =>
        i % Math.ceil(points.length / 8) === 0 ? (
          <text
            key={`${p.label}-x`}
            x={x(i)}
            y={height - 8}
            className="iris-trend-tick"
            textAnchor="middle"
          >
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* --- composition, and how it moved ----------------------------------------- */

export function StackedBars({
  columns,
  keys,
}: {
  columns: readonly {
    readonly label: string;
    readonly parts: Readonly<Record<string, number>>;
    readonly total: number;
  }[];
  keys: readonly { readonly id: string; readonly label: string; readonly colour: string }[];
}) {
  const peak = Math.max(1, ...columns.map((c) => c.total));

  return (
    <div className="iris-stacks">
      <div className="iris-stacks-plot">
        {columns.map((col) => (
          <div className="iris-stacks-item" key={col.label}>
            <span className="iris-stacks-column" style={{ height: `${(col.total / peak) * 100}%` }}>
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
            <b>{columns.reduce((a, c) => a + (c.parts[k.id] ?? 0), 0)}</b>
          </li>
        ))}
      </ul>
    </div>
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
    readonly actual: number;
    readonly target: number;
    readonly pace: number;
    readonly total: number;
    readonly note: string;
  }[];
}) {
  return (
    <div className="iris-bullets">
      {rows.map((row) => {
        const pct = (v: number) => `${Math.min(100, Math.max(0, (v / row.total) * 100))}%`;
        const behind = row.actual < row.pace;
        return (
          <div className="iris-bullet" key={row.id}>
            <span className="iris-bullet-label">{row.label}</span>
            <span className="iris-bullet-track" title={row.note}>
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
              <i style={{ width: pct(row.actual) }} data-behind={behind ? "true" : undefined} />
              <b style={{ left: pct(row.pace) }} title={`Needed by now: ${Math.round(row.pace)}`} />
              <u style={{ left: pct(row.target) }} title={`Target: ${row.target}`} />
            </span>
            <span className="iris-bullet-value" data-behind={behind ? "true" : undefined}>
              {row.actual} / {row.target}
            </span>
          </div>
        );
      })}
      <p className="iris-code" style={{ color: "var(--ink-3)" }}>
        The vertical mark is where the schedule wanted this to be by now; the outline is the target.
      </p>
    </div>
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
      <figcaption className="iris-meta" style={{ marginTop: ".625rem" }}>
        {caption}
      </figcaption>
    </figure>
  );
}

/* --- what survives each step ------------------------------------------------ */

export function Funnel({
  steps,
  totalLabel,
}: {
  steps: readonly {
    readonly id: string;
    readonly label: string;
    readonly count: number;
    readonly note: string | null;
    readonly comparisonNote?: string | null;
  }[];
  /** Names the group the comparison figures are measured against. */
  totalLabel: string;
}) {
  const first = steps[0]?.count ?? 1;

  return (
    <div className="iris-funnel">
      {steps.map((step, i) => {
        const previous = steps[i - 1]?.count ?? step.count;
        const lost = previous - step.count;
        return (
          <div className="iris-funnel-step" key={step.id}>
            <span className="iris-funnel-bar" style={{ width: `${(step.count / first) * 100}%` }}>
              <b>{step.count}</b>
            </span>
            <span className="iris-funnel-label">
              {step.label}
              {step.note === null ? null : (
                <em>
                  {step.note} on its own
                  {step.comparisonNote === null || step.comparisonNote === undefined
                    ? null
                    : ` · ${step.comparisonNote} elsewhere`}
                </em>
              )}
            </span>
            <span className="iris-funnel-drop">
              {i === 0
                ? `${Math.round((step.count / first) * 100)}%`
                : lost === 0
                  ? "—"
                  : `−${lost}`}
            </span>
          </div>
        );
      })}
      <p className="iris-code" style={{ color: "var(--ink-3)" }}>
        Compared against {totalLabel}
      </p>
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
      <ul className="iris-ring-key">
        {series.map((s) => (
          <li key={s.id}>
            <i style={{ background: s.tone }} />
            {s.label}
            <b />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --- an ordered list where the order is the finding -------------------------- */

export function RankedBars({
  rows,
  valueSuffix = "",
}: {
  rows: readonly {
    readonly id: string;
    readonly label: string;
    readonly sub: string | null;
    readonly value: number;
    readonly display: string;
    readonly href?: string | null;
  }[];
  valueSuffix?: string;
}) {
  const peak = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ol className="iris-ranked">
      {rows.map((row, i) => (
        <li key={row.id}>
          <span className="iris-ranked-place">{i + 1}</span>
          <span className="iris-ranked-name">
            {row.href === undefined || row.href === null ? (
              row.label
            ) : (
              <Link href={dynamicRoute(row.href)}>{row.label}</Link>
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
      ))}
    </ol>
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
}) {
  const peak = Math.max(1, ...rows.map((r) => r.medianDwellSeconds ?? 0));

  return (
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
            <em>team {row.teamDwellDisplay}</em>
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

      {placed.map((node) => (
        <g key={node.id}>
          <rect
            x={node.x}
            y={pad.top}
            width={nodeW}
            height={node.h}
            rx="2"
            className="iris-flow-node"
          />
          <text
            x={node.x + nodeW / 2}
            y={pad.top - 18}
            textAnchor="middle"
            className="iris-flow-label"
          >
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
      ))}
    </svg>
  );
}
