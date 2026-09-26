import type * as React from "react";

import {
  D_QUADRANT_NAME,
  type DBubbleCard,
  type DDumbbellCard,
  type DJourneyCard,
  type DOutcomeFunnelsCard,
  type DParallelCard,
  type DPunchCard,
  type DRadialCard,
  type DScatterCard,
} from "../../lab-data";

/**
 * VARIANT D'S NEW FORMS, AND THE ONE OLD QUESTION WITH NO FORM OF ITS OWN.
 *
 * Drawings the product does not have: parallel coordinates, a radial histogram,
 * a punch card, a dumbbell, the journey as a funnel (the product draws it as a
 * flow), a funnel per outcome (the product draws one group's), and a scatter of
 * the attention-against-conversion frame (the product draws that frame as four
 * quadrant lists, `QuadrantMatrix`, and has no scatter component at all).
 *
 * ## These files draw; they do not count
 *
 * Every figure arrives from `labChartsD()` already counted, divided and ordered.
 * What happens here is geometry: an hour to an angle, a share to a length, a
 * count to a radius against the peak the loader stated. No sum, no grouping, no
 * ordering, no rate.
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

/* --- parallel coordinates: which parts of the showroom each agent uses ------------- */

/** A line's measured stretches: an axis the build cannot answer breaks it, so no line claims a value there. */
function measuredRuns(values: readonly (number | null)[]): (readonly [number, number])[][] {
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

export function Parallel({ data, size }: { readonly data: DParallelCard; readonly size: DSize }) {
  const width = size === "xl" ? 752 : 327;
  const height = size === "xl" ? 260 : 220;
  const pad = { top: 14, bottom: 14, left: size === "xl" ? 40 : 34 };
  const axes = data.axes.length;
  const pitch = (width - pad.left) / axes;
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
        <ellipse
          className="dld-haze"
          cx={(width + pad.left) / 2}
          cy={height / 2}
          rx={width * 0.34}
          ry={height * 0.32}
        />
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
        {data.lines.map((line, i) =>
          measuredRuns(line.values).map((run) => (
            <polyline
              key={`${line.id}-${run[0]?.[0] ?? 0}`}
              className="dld-parallel-line"
              style={{ "--d-tone": seriesTone(i) } as React.CSSProperties}
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
        {D_QUADRANT_NAME.hero}
      </text>
      <text x={pad.left + 6} y={pad.top + 12} className="dld-quadrant">
        {D_QUADRANT_NAME.hidden_gem}
      </text>
      <text x={width - pad.right} y={pad.top + plotH - 6} textAnchor="end" className="dld-quadrant">
        {D_QUADRANT_NAME.mispriced}
      </text>
      <text x={pad.left + 6} y={pad.top + plotH - 6} className="dld-quadrant">
        {D_QUADRANT_NAME.dead_stock}
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

/* --- funnels: the journey's one path, and one funnel per outcome ------------------- */

/** A band centred on its track, its width the step's share of the first; the count sits on it. */
function Band({ share, count }: { readonly share: number; readonly count: string }) {
  return (
    <span className="dld-band">
      <i style={{ width: `${share * 100}%` }} />
      <b>{count}</b>
    </span>
  );
}

export function JourneyFunnel({ data }: { readonly data: DJourneyCard }) {
  return (
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
  );
}

/**
 * The outcomes side by side, the bands' names once down the left. Each column
 * keeps its own names too, for a screen reader and for the narrow card, where
 * the columns stack and every funnel reads on its own.
 */
export function OutcomeFunnels({ data }: { readonly data: DOutcomeFunnelsCard }) {
  return (
    <div
      className="dld-of"
      style={
        {
          "--groups": data.groups.length,
          "--steps": data.stepLabels.length,
        } as React.CSSProperties
      }
    >
      <div className="dld-of-names" aria-hidden="true">
        <span />
        {data.stepLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {data.groups.map((group) => (
        <section
          key={group.id}
          className="dld-of-group"
          data-drawn={group.steps === null ? "false" : "true"}
          style={{ "--d-tone": group.colour } as React.CSSProperties}
        >
          <h4>
            {group.label}
            <span>{group.meetingsDisplay}</span>
          </h4>
          {group.steps === null ? (
            <p>{group.withheld}</p>
          ) : (
            <ol>
              {group.steps.map((step) => (
                <li key={step.id}>
                  <span className="dld-of-name">{step.label}</span>
                  <Band share={step.share} count={step.countDisplay} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

/* --- bubbles: one per meeting still open to a purchase ----------------------------- */

interface PlacedBubble {
  readonly bubble: DBubbleCard["bubbles"][number];
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/**
 * One agent's row. Each bubble sits over the day it happened and moves up or
 * down its row until it no longer covers one already placed — the largest
 * first, so the smaller ones find room round them. Where the row has none left
 * the bubble keeps the row's line and overlaps; the fill is translucent, so
 * both still read. Geometry only: nothing here counts or orders the meetings.
 */
function placeRow(
  bubbles: DBubbleCard["bubbles"],
  x: (day: number) => number,
  centre: number,
  rowH: number,
  scale: number,
): PlacedBubble[] {
  const placed: PlacedBubble[] = [];
  const bySize = [...bubbles].sort((a, b) => b.diameter - a.diameter || a.day - b.day);
  for (const bubble of bySize) {
    const r = (bubble.diameter * scale) / 2;
    const cx = x(bubble.day);
    const room = Math.max(0, rowH / 2 - r - 1);
    const clear = (cy: number) =>
      placed.every((p) => Math.hypot(p.cx - cx, p.cy - cy) >= p.r + r + 1);
    let cy = centre;
    for (let step = 0; step <= room; step += 2) {
      const free = [centre - step, centre + step].find(clear);
      if (free !== undefined) {
        cy = free;
        break;
      }
    }
    placed.push({ bubble, cx, cy, r });
  }
  return placed;
}

export function BubbleChart({ data, size }: { readonly data: DBubbleCard; readonly size: DSize }) {
  const scale = size === "xl" ? 1 : 0.45;
  const width = size === "xl" ? 752 : 327;
  const labelW = size === "xl" ? 132 : 112;
  const biggest = Math.max(1, ...data.sizes.map((s) => s.diameter)) * scale;
  const rowH = biggest + 12;
  const top = 4;
  const foot = 26;
  const height = top + data.agents.length * rowH + foot;
  const left = labelW + biggest / 2;
  const right = width - biggest / 2;
  const x = (day: number) =>
    left + ((day - data.from) / Math.max(1, data.to - data.from)) * (right - left);
  const rows = data.agents.map((agent, i) => ({ agent, centre: top + rowH * (i + 0.5) }));
  const placed = rows.flatMap(({ agent, centre }) =>
    placeRow(
      data.bubbles.filter((b) => b.agentId === agent.id),
      x,
      centre,
      rowH,
      scale,
    ),
  );

  return (
    <svg
      className="dld-bubbles"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${data.bubbles.length} meetings still open to a purchase, one bubble each, by the day they were held and the agent who presented them`}
    >
      {data.months.map((m) => (
        <g key={m.day}>
          <line
            className="dld-guide"
            x1={f(x(m.day))}
            x2={f(x(m.day))}
            y1={top}
            y2={top + data.agents.length * rowH}
          />
          <text x={f(x(m.day) + 4)} y={height - 8} className="dld-axis-label">
            {m.label}
          </text>
        </g>
      ))}
      {rows.map(({ agent, centre }) => (
        <g key={agent.id}>
          <line className="dld-bubble-row" x1={labelW} x2={width} y1={f(centre)} y2={f(centre)} />
          <text x={0} y={f(centre)} dominantBaseline="middle" className="dld-row-label">
            {agent.label}
          </text>
        </g>
      ))}
      {placed.map((p) => (
        <circle
          key={p.bubble.id}
          className="dld-bubble"
          data-outcome={p.bubble.outcome}
          cx={f(p.cx)}
          cy={f(p.cy)}
          r={f(p.r)}
          style={{ "--d-tone": p.bubble.colour } as React.CSSProperties}
        >
          <title>{p.bubble.title}</title>
        </circle>
      ))}
    </svg>
  );
}

/** The sizes, each with its outcome and how many bubbles it has; the swatch is the bubble at two-fifths. */
export function BubbleKey({ data }: { readonly data: DBubbleCard }) {
  return (
    <ul className="dld-bubble-key">
      {data.sizes.map((s) => (
        <li key={s.outcome}>
          <i
            style={{ "--d-tone": s.colour, "--d-size": `${s.diameter}px` } as React.CSSProperties}
          />
          <span>
            {s.label} · {s.diameter} px
          </span>
          <b>{s.count}</b>
        </li>
      ))}
    </ul>
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
