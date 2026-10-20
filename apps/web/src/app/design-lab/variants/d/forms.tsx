import type * as React from "react";

import { Band } from "@/showroom/forms";

import type { DDumbbellCard, DOutcomeFunnelsCard, DPunchCard } from "../../lab-data";

/**
 * VARIANT D'S NEW FORMS.
 *
 * Drawings the product does not have: a punch card, a dumbbell, and a funnel
 * per outcome (the product draws one group's). The journey funnel, the
 * attention × conversion scatter, the parallel coordinates and the radial day
 * were drawn here first and the product adopted them (ADR-0041): they live in
 * `@/showroom/forms` now, and the gallery imports them from there.
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

function f(v: number): string {
  return v.toFixed(2);
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
