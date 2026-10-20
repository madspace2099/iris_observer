import type { CSSProperties, ReactNode } from "react";

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

      {/* The parallel lines' own shadow: black, 2 down, 85%, as the kit sets every polyline. */}
      <filter
        id="dld-lift"
        filterUnits="userSpaceOnUse"
        x="-400"
        y="-400"
        width="1600"
        height="1600"
        colorInterpolationFilters="sRGB"
      >
        <feDropShadow dx="0" dy="2" stdDeviation="1" floodColor="#000000" floodOpacity="0.85" />
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
 *
 * A product chart also passes `m`, a middle drawing for a card between the
 * two (a tablet, a band's main column), which the XL would scale under the
 * 12px floor and the Large would leave half empty.
 */
export function Sized({
  xl,
  m,
  l,
}: {
  readonly xl: ReactNode;
  readonly m?: ReactNode;
  readonly l: ReactNode;
}) {
  return (
    <>
      <div className="dld-size" data-size="xl">
        {xl}
      </div>
      {m === undefined ? null : (
        <div className="dld-size" data-size="m">
          {m}
        </div>
      )}
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
  /** What each axis measures, in words, from the read model. */
  readonly axes: { readonly attention: string; readonly conversion: string };
}

/*
 * Three drawings, each shown only where it renders at 1:1 or larger (the CSS
 * switches at 45rem and 34rem), so no label is scaled under 12px. The Large
 * one fits a 390px phone's 252px card; its type is set a point up for the 8%
 * a 360px phone still scales it down by.
 */
const SCATTER_SIZE = {
  xl: { width: 720, height: 308 },
  m: { width: 544, height: 300 },
  l: { width: 240, height: 300 },
} as const;

/* The cells' names on the plot: short enough for a cell, with the key's full title below. */
const ON_PLOT: Readonly<Record<string, string>> = {
  hero: "Hero",
  mispriced: "Mispriced",
  hidden_gem: "Hidden gem",
  dead_stock: "Dead stock",
};

/**
 * Where each point's number goes, in drawing units: right of its point, unless
 * that lands on another point, an earlier number or the frame's edge; then
 * left, above or below, whichever touches least. Geometry only, no figure. A
 * number is taken as 8 units a digit and 13 high, the largest it is set in.
 */
export function pointLabels(
  points: readonly { readonly x: number; readonly y: number }[],
  r: number,
  frame: { readonly width: number; readonly height: number },
): { x: number; y: number; anchor: "start" | "end" | "middle" }[] {
  interface Box {
    l: number;
    r: number;
    t: number;
    b: number;
  }
  const h = 13;
  const placed: Box[] = [];
  return points.map((p, i) => {
    const w = String(i + 1).length * 8;
    const v = r + 3 + h / 2;
    const options = [
      { x: p.x + 10, y: p.y, anchor: "start" as const, box: { l: p.x + 10, r: p.x + 10 + w } },
      { x: p.x - 10, y: p.y, anchor: "end" as const, box: { l: p.x - 10 - w, r: p.x - 10 } },
      { x: p.x, y: p.y - v, anchor: "middle" as const, box: { l: p.x - w / 2, r: p.x + w / 2 } },
      { x: p.x, y: p.y + v, anchor: "middle" as const, box: { l: p.x - w / 2, r: p.x + w / 2 } },
    ].map((o) => ({ ...o, box: { ...o.box, t: o.y - h / 2, b: o.y + h / 2 } }));
    const touches = (b: Box) =>
      points.filter(
        (q, j) =>
          j !== i &&
          Math.max(b.l - q.x, 0, q.x - b.r) ** 2 + Math.max(b.t - q.y, 0, q.y - b.b) ** 2 <
            (r + 1) ** 2,
      ).length +
      placed.filter((o) => b.l < o.r + 2 && o.l < b.r + 2 && b.t < o.b && o.t < b.b).length +
      (b.l < 0 || b.t < 0 || b.r > frame.width || b.b > frame.height ? 1 : 0);
    const best = options.reduce((a, o) => (touches(o.box) < touches(a.box) ? o : a));
    placed.push(best.box);
    return { x: best.x, y: best.y, anchor: best.anchor };
  });
}

export function Scatter({
  data,
  size,
}: {
  readonly data: ScatterData;
  readonly size: keyof typeof SCATTER_SIZE;
}) {
  const { width, height } = SCATTER_SIZE[size];
  const pad = { top: 12, right: 12, bottom: 48, left: 60 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (Math.min(index, data.indexMax) / data.indexMax) * plotW;
  const y = (share: number) => pad.top + (1 - share) * plotH;
  const xTicks = Array.from({ length: Math.round(data.indexMax / 0.5) + 1 }, (_, i) => i * 0.5);
  const radius = size === "l" ? 5 : 6;
  const labels = pointLabels(
    data.points.map((p) => ({ x: x(p.index), y: y(p.share) })),
    radius,
    { width, height },
  );

  /*
   * Each cell's name sits in its own cell, against the parity line, at the
   * cell's outer edge: right of x = 1 for high attention, left of it for low.
   * A left cell narrower than its name (a large index stretches the axis)
   * leaves the name to the key rather than spill into the next cell; the
   * width is the name's length at the largest size it is set in (13px,
   * about 0.6em a letter).
   */
  const parity = x(1);
  const leftRoom = parity - pad.left - 6;
  const name = (id: string, side: "left" | "right", row: "top" | "bottom") => {
    const text = ON_PLOT[id] ?? "";
    if (side === "left" && text.length * 13 * 0.6 > leftRoom) return null;
    return (
      <text
        x={f(side === "right" ? parity + 6 : parity - 6)}
        y={row === "top" ? pad.top + 14 : pad.top + plotH - 6}
        textAnchor={side === "right" ? "start" : "end"}
        className="dld-quadrant"
      >
        {text}
      </text>
    );
  };

  return (
    <DrawIn kind="bloom">
      {/*
       * The drawing is a picture of the key below it, so assistive technology
       * reads the sentence instead, and the key's links are the route for a
       * keyboard and a screen reader. The points stay links for a pointer, out
       * of the tab order; inside an image (`role="img"`) they were interactive
       * content where none may be (axe: nested-interactive).
       */}
      <p className="ox-sr">{`Segments by attention index and conversion: ${data.points
        .map((p) => `${p.label} ${p.display}`)
        .join("; ")}`}</p>
      <svg
        className="dld-scatter"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
        focusable="false"
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
          <text
            key={t}
            x={f(x(t))}
            y={pad.top + plotH + 20}
            textAnchor="middle"
            className="dld-axis-label"
          >
            {size === "l" && t % 1 !== 0 ? "" : `${t.toFixed(t % 1 === 0 ? 0 : 1)}×`}
          </text>
        ))}
        <text x={f(width / 2)} y={height - 6} textAnchor="middle" className="dld-axis-title">
          {data.axes.attention}
        </text>
        <text
          x={10}
          y={f(pad.top + plotH / 2)}
          transform={`rotate(-90 10 ${f(pad.top + plotH / 2)})`}
          textAnchor="middle"
          dominantBaseline="middle"
          className="dld-axis-title"
        >
          {data.axes.conversion}
        </text>
        <line
          className="dld-parity"
          x1={f(parity)}
          x2={f(parity)}
          y1={pad.top}
          y2={pad.top + plotH}
        />
        {data.projectShare === null ? null : (
          <line
            className="dld-parity"
            x1={pad.left}
            x2={width - pad.right}
            y1={f(y(data.projectShare))}
            y2={f(y(data.projectShare))}
          />
        )}
        {name("hero", "right", "top")}
        {name("hidden_gem", "left", "top")}
        {name("mispriced", "right", "bottom")}
        {name("dead_stock", "left", "bottom")}
        {data.points.map((p, i) => {
          const at = labels[i];
          const mark = (
            <g className="dld-scatter-point" data-quadrant={p.quadrant}>
              <circle cx={f(x(p.index))} cy={f(y(p.share))} r={radius}>
                <title>{`${p.label}: ${p.display}`}</title>
              </circle>
              <text
                x={f(at?.x ?? x(p.index) + 10)}
                y={f(at?.y ?? y(p.share))}
                textAnchor={at?.anchor ?? "start"}
                dominantBaseline="middle"
                className="dld-point-label"
              >
                {i + 1}
              </text>
            </g>
          );
          /* A pointer opens the segment from its point; the key below is the keyboard's route. */
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
 * the cells against its parity lines.
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

/* --- parallel coordinates: which parts of the showroom each agent uses ------- */

export interface ParallelData {
  readonly axes: readonly {
    readonly id: string;
    readonly label: string;
    /** Why the build cannot answer this axis; null when it is measured. */
    readonly missing: string | null;
  }[];
  readonly lines: readonly {
    readonly id: string;
    readonly label: string;
    /** 0 to 1 on a measured axis; null on one the build cannot answer, which no line crosses. */
    readonly values: readonly (number | null)[];
    /** The agent's own colour, from the read model. */
    readonly tone: string;
  }[];
}

/* Each shown only where it renders at 1:1 or larger, as the scatter's: the Large one fits a phone's card. */
const PARALLEL_SIZE = {
  xl: { width: 720, height: 360 },
  m: { width: 544, height: 300 },
  l: { width: 248, height: 240 },
} as const;

/** A line's measured stretches: an axis the build cannot answer breaks it, so no line claims a value there. */
export function measuredRuns(values: readonly (number | null)[]): (readonly [number, number])[][] {
  const runs: (readonly [number, number])[][] = [];
  let run: (readonly [number, number])[] = [];
  values.forEach((v, axis) => {
    if (v === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push([axis, v]);
    }
  });
  if (run.length > 0) runs.push(run);
  return runs;
}

/**
 * One line per agent across the showroom's tools, each at the share of their
 * meetings that used it. The axes are shares already, so nothing is scaled to
 * a strongest agent. No key: the caller draws the one that names and links.
 */
export function Parallel({
  data,
  size,
}: {
  readonly data: ParallelData;
  readonly size: keyof typeof PARALLEL_SIZE;
}) {
  const { width, height } = PARALLEL_SIZE[size];
  const pad = { top: 14, bottom: 14, left: size === "l" ? 34 : 40 };
  const axes = data.axes.length;
  const pitch = (width - pad.left) / Math.max(1, axes);
  const x = (i: number) => pad.left + pitch * (i + 0.5);
  const y = (v: number) =>
    pad.top + (1 - Math.max(0, Math.min(1, v))) * (height - pad.top - pad.bottom);

  return (
    <div className="dld-parallel" style={{ maxWidth: width }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${data.lines.length} agents across ${data.axes.map((a) => a.label).join(", ")}`}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="dld-gridline" x1={pad.left} x2={width} y1={f(y(t))} y2={f(y(t))} />
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
        {data.axes.map((axis, i) => (
          <line
            key={axis.id}
            className="dld-parallel-axis"
            data-missing={axis.missing === null ? undefined : "true"}
            x1={f(x(i))}
            x2={f(x(i))}
            y1={pad.top}
            y2={height - pad.bottom}
          />
        ))}
        {data.lines.map((line) =>
          measuredRuns(line.values).map((run) => (
            <polyline
              key={`${line.id}-${run[0]?.[0] ?? 0}`}
              className="dld-parallel-line"
              style={{ "--d-tone": line.tone } as CSSProperties}
              points={run.map(([axis, v]) => `${f(x(axis))},${f(y(v))}`).join(" ")}
            >
              <title>{line.label}</title>
            </polyline>
          )),
        )}
      </svg>
      <ol
        className="dld-parallel-axes"
        style={{
          gridTemplateColumns: `repeat(${axes}, minmax(0, 1fr))`,
          paddingLeft: `${((pad.left / width) * 100).toFixed(3)}%`,
        }}
      >
        {data.axes.map((axis) => (
          <li key={axis.id} data-missing={axis.missing === null ? undefined : "true"}>
            {axis.label}
            {axis.missing === null ? null : <em>not measured</em>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * What each axis counts, in plain words: a shape with no definitions is a
 * decoration. An axis the build cannot answer prints why, in the product's
 * words for it, where its definition would have been the whole story.
 */
export function AxisNotes({
  items,
}: {
  readonly items: readonly {
    readonly label: string;
    readonly note: string;
    readonly missing: string | null;
  }[];
}) {
  return (
    <dl className="dld-axis-notes">
      {items.map((item) => (
        <div key={item.label} data-missing={item.missing === null ? undefined : "true"}>
          <dt>{item.label}</dt>
          <dd>{item.note}</dd>
          {item.missing === null ? null : <dd className="dld-axis-missing">{item.missing}</dd>}
        </div>
      ))}
    </dl>
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
