import type { DScatterCard } from "../../lab-data";

/**
 * VARIANT D'S DRAWINGS OF ITS OWN: THE ONE OLD QUESTION WITH NO FORM.
 *
 * The attention-against-conversion frame, as a scatter. The product draws that
 * frame as four quadrant lists (`QuadrantMatrix`) and has no scatter component
 * at all, so this one is drawn here, from the same rows the lists place.
 *
 * ## This file draws; it does not count
 *
 * Every figure arrives from `labChartsD()` already counted, divided and
 * ordered, with its display string. What happens here is geometry: a share to
 * a height, an index to a distance along the axis the loader bounded.
 *
 * ## Two geometries rather than one scaled
 *
 * The kit draws each chart twice, at XL (800×486) and at Large (375×556), and
 * the second is not the first shrunk: type stays at its size and the plot gets
 * fewer, larger marks. An SVG scaled from 752 to 327 units would print its 12px
 * labels at five. So the scatter takes a `size`, the card renders both, and a
 * container query shows the one whose geometry the card's width can hold.
 */

export type DSize = "xl" | "l";

/** The agent colours: the kit's series order, first two as its multiply radar pairs them. */
export function seriesTone(index: number): string {
  return `var(--d-series-${(index % 6) + 1})`;
}

function f(v: number): string {
  return v.toFixed(2);
}

/* --- the scatter: attention against conversion, one point per segment ------------ */

const QUADRANT_NAME: Readonly<Record<string, string>> = {
  hero: "Hero",
  mispriced: "Mispriced",
  hidden_gem: "Hidden gem",
  dead_stock: "Dead stock",
};

export function Scatter({ data, size }: { readonly data: DScatterCard; readonly size: DSize }) {
  const width = size === "xl" ? 752 : 327;
  const height = size === "xl" ? 290 : 244;
  const pad = { top: 12, right: 12, bottom: 30, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (Math.min(index, data.indexMax) / data.indexMax) * plotW;
  const y = (share: number) => pad.top + (1 - share) * plotH;
  const xTicks = Array.from({ length: Math.round(data.indexMax / 0.5) + 1 }, (_, i) => i * 0.5);

  return (
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
      <text x={width - pad.right} y={pad.top + plotH - 6} textAnchor="end" className="dld-quadrant">
        {QUADRANT_NAME.mispriced}
      </text>
      <text x={pad.left + 6} y={pad.top + plotH - 6} className="dld-quadrant">
        {QUADRANT_NAME.dead_stock}
      </text>
      {data.points.map((p, i) => (
        <g key={p.id} className="dld-scatter-point" data-quadrant={p.quadrant}>
          <circle cx={f(x(p.index))} cy={f(y(p.share))} r={size === "xl" ? 6 : 5}>
            <title>{`${p.label}: ${p.display} decided meetings progressed`}</title>
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
      ))}
    </svg>
  );
}

export function ScatterKey({ data }: { readonly data: DScatterCard }) {
  return (
    <ol className="dld-scatter-key">
      {data.points.map((p, i) => (
        <li key={p.id}>
          <b>{i + 1}</b>
          <span>{p.label}</span>
          <em>{p.display}</em>
        </li>
      ))}
    </ol>
  );
}
