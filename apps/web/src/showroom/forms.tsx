import type { ReactNode } from "react";

import { DrawIn } from "./DrawIn";

/**
 * THE HYPER KIT'S FORMS, SHARED BY THE PRODUCT AND THE DESIGN LAB (ADR-0041).
 *
 * The journey as one narrowing path, and the attention × conversion frame as a
 * scatter: the two forms the owner chose for the Project page from gallery D,
 * where they were drawn first. They draw; they never count. Every figure
 * arrives composed — the product's from `ProjectCharts.journey.funnel` and
 * `ProjectView.scatter`, the lab's from `lab-data.ts` — and what happens here
 * is geometry: a share to a length, an index to a position.
 *
 * Also here, once: the paint servers the D sheet names (`url(#dld-line)`,
 * `#dld-dots`, `#dld-glow`), which the project shell renders a single time so
 * every chart on every product page can reach them.
 */

/* --- the attention × conversion frame's four cells -------------------------- */

/**
 * docs/02-views.md §4.2's frame: each cell a marketing instruction. High
 * attention is above parity; high conversion is at or above the project's own
 * share. The placement arrives from the read model; this only names it.
 */
export const QUADRANTS = [
  { id: "hero", title: "Hero", instruction: "Sell more of this; lead the campaign with it." },
  {
    id: "mispriced",
    title: "Mispriced or oversold",
    instruction: "They look, they don't buy: check the price, check the promise.",
  },
  {
    id: "hidden_gem",
    title: "Hidden gem",
    instruction: "Converts when seen; agents aren't showing it. Fixable today.",
  },
  {
    id: "dead_stock",
    title: "Dead stock",
    instruction: "Neither seen nor sold: reposition, bundle, or discount.",
  },
] as const;

export const QUADRANT_NAME: Readonly<Record<string, string>> = Object.fromEntries(
  QUADRANTS.map((q) => [q.id, q.title]),
);

/* --- the paint servers ------------------------------------------------------ */

/**
 * Three of the kit's treatments cannot be written as a CSS colour: a gradient
 * along a stroke, the dot-matrix area, and a glow that follows a mark's own
 * shape. SVG reaches a paint server anywhere in the document, so they are
 * declared once and every rule names them with `url(#…)`.
 *
 * The glow is the kit's six stacked shadows in the mark's own colour, as three
 * blurs of `SourceGraphic`, so one filter serves every series. Its region is
 * in user space: a level line has a box of no height, and a filter sized to
 * that box draws nothing.
 */
export function ChartPaint() {
  return (
    <>
      {/* The kit's "Caribbean green": the lead series' stroke. */}
      <linearGradient id="dld-line" x1="0" y1="0" x2="1" y2="0.08">
        <stop offset="0" stopColor="#01f1e3" />
        <stop offset="1" stopColor="#5cf101" />
      </linearGradient>

      {/* The area chart's dot matrix: a 1px dot on a 5px pitch. */}
      <pattern id="dld-dots" width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="1.2" height="1.2" fill="#15ffab" />
      </pattern>

      <filter
        id="dld-glow"
        filterUnits="userSpaceOnUse"
        x="-400"
        y="-400"
        width="1600"
        height="1600"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="near" />
        <feOffset in="near" dy="1.5" result="nearDown" />
        <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="mid" />
        <feOffset in="mid" dy="7" result="midDown" />
        <feComponentTransfer in="midDown" result="midSoft">
          <feFuncA type="linear" slope="0.6" />
        </feComponentTransfer>
        <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="far" />
        <feOffset in="far" dy="16" result="farDown" />
        <feComponentTransfer in="farDown" result="farSoft">
          <feFuncA type="linear" slope="0.4" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="farSoft" />
          <feMergeNode in="midSoft" />
          <feMergeNode in="nearDown" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </>
  );
}

/** The paint servers in a hidden SVG of no size, for the project shell. */
export function ChartDefs() {
  return (
    <svg className="dld-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <ChartPaint />
      </defs>
    </svg>
  );
}

/* --- two geometries rather than one scaled ---------------------------------- */

/**
 * The kit draws each chart twice, at XL (800×486) and at Large (375×556), and
 * the second is not the first shrunk: an SVG scaled from 752 to 327 units
 * would print its 12px labels at five. Both are rendered, and a container
 * query on the card shows the one its width can hold.
 */
export function Sized({ xl, l }: { readonly xl: ReactNode; readonly l: ReactNode }) {
  return (
    <>
      <div className="dld-size" data-size="xl">
        {xl}
      </div>
      <div className="dld-size" data-size="l">
        {l}
      </div>
    </>
  );
}

function f(v: number): string {
  return v.toFixed(2);
}

/* --- the scatter: attention against conversion, one point per segment ------- */

export interface ScatterData {
  readonly points: readonly {
    readonly id: string;
    readonly label: string;
    readonly index: number;
    readonly share: number;
    readonly quadrant: string;
    readonly display: string;
    /** Where the point opens; the key carries the same link for a keyboard and a screen reader. */
    readonly href?: string;
  }[];
  readonly projectShare: number | null;
  readonly indexMax: number;
}

export function Scatter({ data, size }: { readonly data: ScatterData; readonly size: "xl" | "l" }) {
  const width = size === "xl" ? 752 : 327;
  const height = size === "xl" ? 290 : 244;
  const pad = { top: 12, right: 12, bottom: 30, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (Math.min(index, data.indexMax) / data.indexMax) * plotW;
  const y = (share: number) => pad.top + (1 - share) * plotH;
  const xTicks = Array.from({ length: Math.round(data.indexMax / 0.5) + 1 }, (_, i) => i * 0.5);

  return (
    <DrawIn kind="bloom">
      <svg
        className="dld-scatter"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Segments by attention index and conversion: ${data.points
          .map((p) => `${p.label} ${p.display}`)
          .join("; ")}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              className="dld-gridline"
              x1={pad.left}
              x2={width - pad.right}
              y1={f(y(t))}
              y2={f(y(t))}
            />
            <text
              x={pad.left - 8}
              y={f(y(t))}
              textAnchor="end"
              dominantBaseline="middle"
              className="dld-axis-label"
            >
              {`${Math.round(t * 100)}%`}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={f(x(t))} y={height - 8} textAnchor="middle" className="dld-axis-label">
            {size === "l" && t % 1 !== 0 ? "" : `${t.toFixed(t % 1 === 0 ? 0 : 1)}×`}
          </text>
        ))}
        <line className="dld-parity" x1={f(x(1))} x2={f(x(1))} y1={pad.top} y2={pad.top + plotH} />
        {data.projectShare === null ? null : (
          <line
            className="dld-parity"
            x1={pad.left}
            x2={width - pad.right}
            y1={f(y(data.projectShare))}
            y2={f(y(data.projectShare))}
          />
        )}
        <text x={width - pad.right} y={pad.top + 12} textAnchor="end" className="dld-quadrant">
          {QUADRANT_NAME.hero}
        </text>
        <text x={pad.left + 6} y={pad.top + 12} className="dld-quadrant">
          {QUADRANT_NAME.hidden_gem}
        </text>
        <text
          x={width - pad.right}
          y={pad.top + plotH - 6}
          textAnchor="end"
          className="dld-quadrant"
        >
          {QUADRANT_NAME.mispriced}
        </text>
        <text x={pad.left + 6} y={pad.top + plotH - 6} className="dld-quadrant">
          {QUADRANT_NAME.dead_stock}
        </text>
        {data.points.map((p, i) => {
          const mark = (
            <g className="dld-scatter-point" data-quadrant={p.quadrant}>
              <circle cx={f(x(p.index))} cy={f(y(p.share))} r={size === "xl" ? 6 : 5}>
                <title>{`${p.label}: ${p.display}`}</title>
              </circle>
              <text
                x={f(x(p.index) + 10)}
                y={f(y(p.share))}
                dominantBaseline="middle"
                className="dld-point-label"
              >
                {i + 1}
              </text>
            </g>
          );
          /*
           * A pointer opens the segment from its point. The image is one named
           * picture to a screen reader, so the point is out of the tab order
           * and the key below is the route for a keyboard and a screen reader.
           */
          return p.href === undefined ? (
            <g key={p.id}>{mark}</g>
          ) : (
            <a key={p.id} href={p.href} tabIndex={-1}>
              {mark}
            </a>
          );
        })}
      </svg>
    </DrawIn>
  );
}

/**
 * The scatter's key: each point's number, its segment and its reading, under
 * the name of the cell it falls in and that cell's instruction — the action
 * the frame exists for. A cell with no segment is not listed: the plot names
 * all four in its corners.
 */
export function ScatterKey({ data }: { readonly data: ScatterData }) {
  const numbered = data.points.map((p, i) => ({ ...p, n: i + 1 }));
  return (
    <div className="dld-scatter-key">
      {QUADRANTS.map((q) => {
        const inCell = numbered.filter((p) => p.quadrant === q.id);
        return inCell.length === 0 ? null : (
          <section key={q.id} className="dld-scatter-cell" data-quadrant={q.id}>
            {/* Not a heading: the cards it sits in title themselves with a kicker, and an h4 under the page's h1 would skip two levels. */}
            <p className="dld-scatter-name">{q.title}</p>
            <p className="dld-scatter-instruction">{q.instruction}</p>
            <ol>
              {inCell.map((p) => (
                <li key={p.id}>
                  <b>{p.n}</b>
                  {p.href === undefined ? <span>{p.label}</span> : <a href={p.href}>{p.label}</a>}
                  <em>{p.display}</em>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/* --- the journey: one path, narrowing ----------------------------------------- */

/** A band centred on its track, its width the step's share of the first; the count sits on it. */
export function Band({ share, count }: { readonly share: number; readonly count: string }) {
  return (
    <span className="dld-band">
      <i style={{ width: `${share * 100}%` }} />
      <b>{count}</b>
    </span>
  );
}

export interface JourneyFunnelData {
  readonly steps: readonly {
    readonly id: string;
    readonly label: string;
    readonly countDisplay: string;
    readonly share: number;
    readonly shareDisplay: string;
  }[];
  /** Every stage named rather than drawn, and why; null when every stage is drawn. */
  readonly merged: string | null;
}

export function JourneyFunnel({ data }: { readonly data: JourneyFunnelData }) {
  return (
    <DrawIn kind="bloom">
      <div className="dld-jf">
        <ol>
          {data.steps.map((step) => (
            <li key={step.id}>
              <span className="dld-jf-label">{step.label}</span>
              <Band share={step.share} count={step.countDisplay} />
              <em>{step.shareDisplay}</em>
            </li>
          ))}
        </ol>
        {data.merged === null ? null : <p className="dld-note">{data.merged}</p>}
      </div>
    </DrawIn>
  );
}
