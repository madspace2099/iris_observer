import type * as React from "react";

import type {
  DArc,
  DDumbbellCard,
  DParallelCard,
  DPunchCard,
  DRadialCard,
  DScatterCard,
  DSunburstCard,
} from "../../lab-data";

/**
 * VARIANT D'S NEW FORMS, AND THE ONE OLD QUESTION WITH NO FORM OF ITS OWN.
 *
 * Six drawings the product does not have: parallel coordinates, a two-level
 * sunburst, a radial histogram, a punch card, a dumbbell, and a scatter of the
 * attention-against-conversion frame (the product draws that frame as four
 * quadrant lists, `QuadrantMatrix`, and has no scatter component at all).
 *
 * ## These files draw; they do not count
 *
 * Every figure arrives from `labChartsD()` already counted, divided and ordered,
 * and every arc arrives as fractions of a turn. What happens here is geometry:
 * a fraction to an angle, a share to a length, a count to a radius against the
 * peak the loader stated. No sum, no grouping, no ordering, no rate.
 *
 * ## Two geometries rather than one scaled
 *
 * The kit draws each chart twice, at XL (800×486) and at Large (375×556), and
 * the second is not the first shrunk: type stays at its size and the plot gets
 * fewer, larger marks. An SVG scaled from 752 to 327 units would print its 12px
 * labels at five. So each SVG form takes a `size`, the card renders both, and a
 * container query shows the one whose geometry the card's width can hold.
 */

export type DSize = "xl" | "l";

const TAU = Math.PI * 2;

/** The agent colours: the kit's series order, first two as its multiply radar pairs them. */
export function seriesTone(index: number): string {
  return `var(--d-series-${(index % 6) + 1})`;
}

function polar(cx: number, cy: number, r: number, turn: number): readonly [number, number] {
  const a = turn * TAU - Math.PI / 2;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function f(v: number): string {
  return v.toFixed(2);
}

/** An annular sector between two turns, split in two when it is the whole ring (an arc cannot close on itself). */
function annulus(cx: number, cy: number, r0: number, r1: number, t0: number, t1: number): string {
  if (t1 - t0 >= 0.9999) {
    return `${annulus(cx, cy, r0, r1, t0, t0 + 0.5)} ${annulus(cx, cy, r0, r1, t0 + 0.5, t1)}`;
  }
  const large = t1 - t0 > 0.5 ? 1 : 0;
  const [ax, ay] = polar(cx, cy, r1, t0);
  const [bx, by] = polar(cx, cy, r1, t1);
  const [cx2, cy2] = polar(cx, cy, r0, t1);
  const [dx, dy] = polar(cx, cy, r0, t0);
  return [
    `M ${f(ax)} ${f(ay)}`,
    `A ${f(r1)} ${f(r1)} 0 ${large} 1 ${f(bx)} ${f(by)}`,
    `L ${f(cx2)} ${f(cy2)}`,
    `A ${f(r0)} ${f(r0)} 0 ${large} 0 ${f(dx)} ${f(dy)}`,
    "Z",
  ].join(" ");
}

/** The kit's angular gap between segments, about 1.1°, taken from both ends of anything wide enough to lose it. */
function gapped(arc: DArc): readonly [number, number] {
  const gap = 0.0015;
  return arc.to - arc.from > gap * 4 ? [arc.from + gap, arc.to - gap] : [arc.from, arc.to];
}

/* --- the sunburst: agents inside, each agent's outcomes around them ------------- */

export function Sunburst({ data, size }: { readonly data: DSunburstCard; readonly size: DSize }) {
  const box = size === "xl" ? 330 : 280;
  const c = box / 2;
  const k = box / 330;
  const inner = { r0: 58 * k, r1: 104 * k };
  const outer = { r0: 112 * k, r1: 158 * k };
  const agentIndex = new Map(data.inner.map((a, i) => [a.id, i]));

  return (
    <svg
      className="dld-sunburst"
      viewBox={`0 0 ${box} ${box}`}
      width={box}
      height={box}
      role="img"
      aria-label={`${data.total} meetings: ${data.inner.map((a) => `${a.label} ${a.count}`).join(", ")}`}
    >
      <g className="dld-sunburst-inner">
        {data.inner.map((arc, i) => {
          const [t0, t1] = gapped(arc);
          return (
            <path
              key={arc.id}
              d={annulus(c, c, inner.r0, inner.r1, t0, t1)}
              style={{ "--d-tone": seriesTone(i) } as React.CSSProperties}
            >
              <title>{`${arc.label}: ${arc.count} of ${data.total} meetings`}</title>
            </path>
          );
        })}
      </g>
      <g className="dld-sunburst-outer">
        {data.outer.map((arc) => {
          const [t0, t1] = gapped(arc);
          const parent = data.inner[agentIndex.get(arc.parent ?? "") ?? -1];
          return (
            <path
              key={arc.id}
              d={annulus(c, c, outer.r0, outer.r1, t0, t1)}
              style={{ "--d-tone": arc.colour ?? "var(--d-ink-4)" } as React.CSSProperties}
            >
              <title>{`${parent?.label ?? ""} · ${arc.label}: ${arc.count} of ${parent?.count ?? 0}`}</title>
            </path>
          );
        })}
      </g>
      <text x={c} y={c + 2} textAnchor="middle" className="dld-centre-figure">
        {data.total}
      </text>
      <text x={c} y={c + 20 * k + 6} textAnchor="middle" className="dld-centre-caption">
        MEETINGS
      </text>
    </svg>
  );
}

export function SunburstKey({ data }: { readonly data: DSunburstCard }) {
  const outcomes = data.outcomes.map((o) => [o.label, o.colour] as const);
  return (
    <div className="dld-key">
      <ul>
        {data.inner.map((a, i) => (
          <li key={a.id}>
            <i style={{ background: seriesTone(i) }} />
            {a.label}
          </li>
        ))}
      </ul>
      <ul>
        {outcomes.map(([label, colour]) => (
          <li key={label}>
            <i style={{ background: colour ?? "var(--d-ink-4)" }} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --- the radial histogram: the day as a clock face -------------------------------- */

export function RadialHistogram({
  data,
  size,
}: {
  readonly data: DRadialCard;
  readonly size: DSize;
}) {
  // Room outside the bars for the hour labels: the conic mask the entry uses clips at the SVG box.
  const box = size === "xl" ? 430 : 326;
  const c = box / 2;
  const r0 = size === "xl" ? 60 : 44;
  const r1 = size === "xl" ? 164 : 124;
  const peak = Math.max(1, data.peak);

  return (
    <svg
      className="dld-radial"
      viewBox={`0 0 ${box} ${box}`}
      width={box}
      height={box}
      role="img"
      aria-label={`Meetings by starting hour: ${data.hours
        .filter((h) => h.count > 0)
        .map((h) => `${h.label} ${h.count}`)
        .join(", ")}`}
    >
      {data.hours.map((h) => {
        const t = h.hour / 24;
        const [sx, sy] = polar(c, c, r0, t);
        const [ex, ey] = polar(c, c, r1, t);
        return (
          <line
            key={`s${h.hour}`}
            className="dld-radial-spoke"
            x1={f(sx)}
            y1={f(sy)}
            x2={f(ex)}
            y2={f(ey)}
          />
        );
      })}
      {data.hours.map((h) => {
        if (h.count === 0) return null;
        const t = h.hour / 24;
        const v = h.count / peak;
        const [sx, sy] = polar(c, c, r0, t);
        const [ex, ey] = polar(c, c, r0 + (r1 - r0) * v, t);
        return (
          <line
            key={`b${h.hour}`}
            className="dld-radial-bar"
            data-long={v >= 0.5 ? "true" : undefined}
            x1={f(sx)}
            y1={f(sy)}
            x2={f(ex)}
            y2={f(ey)}
            style={{ "--v": v.toFixed(3) } as React.CSSProperties}
          >
            <title>{`${h.label}: ${h.count}`}</title>
          </line>
        );
      })}
      {[0, 6, 12, 18].map((hour) => {
        const [x, y] = polar(c, c, r1 + (size === "xl" ? 16 : 13), hour / 24);
        return (
          <text
            key={hour}
            x={f(x)}
            y={f(y)}
            className="dld-axis-label"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {`${String(hour).padStart(2, "0")}:00`}
          </text>
        );
      })}
      <text x={c} y={c + 2} textAnchor="middle" className="dld-centre-figure">
        {data.total}
      </text>
      <text x={c} y={c + 20} textAnchor="middle" className="dld-centre-caption">
        MEETINGS
      </text>
    </svg>
  );
}

/* --- the punch card: who presents at which hour ---------------------------------- */

export function PunchCard({ data, size }: { readonly data: DPunchCard; readonly size: DSize }) {
  const labelW = size === "xl" ? 132 : 112;
  const width = size === "xl" ? 752 : 327;
  const rowH = size === "xl" ? 40 : 32;
  const top = 8;
  const foot = 26;
  const pitch = (width - labelW) / Math.max(1, data.hours.length);
  const maxR = Math.min(pitch, rowH) / 2 - 2;
  const height = top + data.agents.length * rowH + foot;
  const peak = Math.max(1, data.peak);
  const cellOf = new Map(data.cells.map((cell) => [`${cell.agentId}|${cell.hour}`, cell.count]));

  return (
    <svg
      className="dld-punch"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Meetings by agent and starting hour, ${data.hours[0]?.label ?? ""} to ${data.hours[data.hours.length - 1]?.label ?? ""}`}
    >
      {data.hours.map((h, i) => {
        const x = labelW + pitch * (i + 0.5);
        return (
          <g key={h.hour}>
            <line
              className="dld-guide"
              x1={f(x)}
              x2={f(x)}
              y1={top}
              y2={top + data.agents.length * rowH}
            />
            {i % (size === "xl" ? 1 : 2) === 0 ? (
              <text x={f(x)} y={height - 6} textAnchor="middle" className="dld-axis-label">
                {h.label.slice(0, 2)}
              </text>
            ) : null}
          </g>
        );
      })}
      {data.agents.map((agent, row) => {
        const y = top + rowH * (row + 0.5);
        return (
          <g key={agent.id}>
            <text x={0} y={f(y)} dominantBaseline="middle" className="dld-row-label">
              {agent.label}
            </text>
            {data.hours.map((h, i) => {
              const count = cellOf.get(`${agent.id}|${h.hour}`) ?? 0;
              const x = labelW + pitch * (i + 0.5);
              return count === 0 ? (
                <circle key={h.hour} className="dld-punch-zero" cx={f(x)} cy={f(y)} r={1.5} />
              ) : (
                <circle
                  key={h.hour}
                  className="dld-punch-dot"
                  data-long={count / peak >= 0.5 ? "true" : undefined}
                  cx={f(x)}
                  cy={f(y)}
                  r={f(Math.max(2.5, maxR * Math.sqrt(count / peak)))}
                  style={{ "--v": (count / peak).toFixed(3) } as React.CSSProperties}
                >
                  <title>{`${agent.label}, ${h.label}: ${count}`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* --- parallel coordinates: every agent across the six axes ------------------------ */

export function Parallel({ data, size }: { readonly data: DParallelCard; readonly size: DSize }) {
  const width = size === "xl" ? 752 : 327;
  const height = size === "xl" ? 260 : 220;
  const pad = { top: 14, bottom: 14 };
  const axes = data.axes.length;
  const x = (i: number) => (width / axes) * (i + 0.5);
  const y = (v: number) =>
    pad.top + (1 - Math.max(0, Math.min(1, v))) * (height - pad.top - pad.bottom);

  return (
    <div className="dld-parallel" style={{ maxWidth: width }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${data.lines.length} agents across ${data.axes.join(", ")}`}
      >
        <ellipse
          className="dld-haze"
          cx={width / 2}
          cy={height / 2}
          rx={width * 0.34}
          ry={height * 0.32}
        />
        {data.axes.map((axis, i) => (
          <line
            key={axis}
            className="dld-parallel-axis"
            x1={f(x(i))}
            x2={f(x(i))}
            y1={pad.top}
            y2={height - pad.bottom}
          />
        ))}
        {data.lines.map((line, i) => (
          <polyline
            key={line.id}
            className="dld-parallel-line"
            style={{ "--d-tone": seriesTone(i) } as React.CSSProperties}
            points={line.values.map((v, a) => `${f(x(a))},${f(y(v))}`).join(" ")}
          >
            <title>{line.label}</title>
          </polyline>
        ))}
      </svg>
      <ol
        className="dld-parallel-axes"
        style={{ gridTemplateColumns: `repeat(${axes}, minmax(0, 1fr))` }}
      >
        {data.axes.map((axis) => (
          <li key={axis}>{axis}</li>
        ))}
      </ol>
      <ul className="dld-key">
        {data.lines.map((line, i) => (
          <li key={line.id}>
            <i style={{ background: seriesTone(i) }} />
            {line.label}
          </li>
        ))}
      </ul>
    </div>
  );
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

/* --- the dumbbell: each behaviour in the group, against everyone else ------------- */

export function Dumbbell({ data }: { readonly data: DDumbbellCard }) {
  if (data.rows.length === 0) {
    return (
      <p className="dld-empty">{data.empty ?? "There is no group to describe in this period."}</p>
    );
  }
  return (
    <div className="dld-dumbbell">
      <p className="dld-dumbbell-legend">
        <span data-end="group">{data.cohortLabel}</span>
        <span data-end="rest">Every other recorded meeting</span>
      </p>
      <div className="dld-dumbbell-scale" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((t) => (
          <em key={t} style={{ left: `${t}%` }}>
            {t}%
          </em>
        ))}
      </div>
      <ul className="dld-dumbbell-rows">
        {data.rows.map((row) => {
          const lo = Math.min(row.share, row.comparisonShare);
          const hi = Math.max(row.share, row.comparisonShare);
          return (
            <li key={row.id}>
              <span className="dld-dumbbell-label">{row.label}</span>
              <span className="dld-dumbbell-track">
                <i style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
                <b
                  data-end="rest"
                  style={{ left: `${row.comparisonShare * 100}%` }}
                  title={`Every other recorded meeting: ${row.comparisonDisplay}`}
                />
                <b
                  data-end="group"
                  style={{ left: `${row.share * 100}%` }}
                  title={`In the group: ${row.shareDisplay}`}
                />
              </span>
              <span className="dld-dumbbell-values">
                <em data-end="group">{row.shareDisplay}</em>
                <em data-end="rest">{row.comparisonDisplay}</em>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
