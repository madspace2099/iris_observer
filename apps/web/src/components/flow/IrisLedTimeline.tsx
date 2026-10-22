import type { CSSProperties } from "react";
import Link from "next/link";
import type { IrisLedAgent, IrisLedSalesView, PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * IRIS-LED SALES, ONE ROW PER SALE (ADR-0049).
 *
 * Each row ends at the status change, on the right; every meeting that opened
 * the flat before it is a dot, coloured by who presented, placed by how long
 * before the change it started. The empty run from the last dot to the change
 * is the gap the page is about, and the shaded end is the IRIS-assisted window.
 * Every position, word and colour index is the read model's; this draws them.
 *
 * Hand-built in HTML rather than SVG: the rows reflow to a phone's width, and
 * the tooltip is a plain element that hover and keyboard focus both reveal.
 *
 * A row can hold forty showings, and forty tab stops a row is a page nobody can
 * leave. So only a row's LAST showing — the one that sets the gap — is a link in
 * the tab order, named in full; the others are links for a pointer and hidden
 * from assistive technology, whose reader has every meeting, linked, in the
 * table beneath. A reader whose role may not open a replay gets no links at all.
 */

const colour = (index: number): CSSProperties =>
  ({ "--ir-c": `var(--d-series-${String((index % 6) + 1)})` }) as CSSProperties;

const at = (position: number): string => `${(position * 100).toFixed(2)}%`;

/*
 * The narrowest track the axis is drawn on (a 360px phone's card), and a
 * label's width on it: 7px a character at the axis's 12px, with 6px between
 * two labels. ponytail: an estimate, not a measurement; a wider face would
 * need it raised.
 */
const NARROW_TRACK = 200;
const TICK_CHAR = 7;
const TICK_GAP = 6;

/**
 * The stretched scale crowds its far end ("3 months" beside "1 month", "72 h"
 * against "Change"). Reading from the change leftwards, a tick whose label
 * would touch the last one kept on the narrowest track is marked crowded and
 * steps aside on a narrow track (`iris-led.css`). The change's label ends at
 * its tick, the leftmost starts at its tick, and the rest are centred, as
 * drawn. A sixth of the track, the rule before, was 36px at 360: narrower than
 * "3 months".
 */
export function axisTicks<T extends { readonly label: string; readonly position: number }>(
  ticks: readonly T[],
): (T & { readonly crowded: boolean; readonly edge: boolean })[] {
  let kept = Number.POSITIVE_INFINITY;
  return ticks.map((tick, index) => {
    const edge = tick.position < 0.08;
    const width = tick.label.length * TICK_CHAR;
    const x = tick.position * NARROW_TRACK;
    const left = index === 0 ? x - width : edge ? x : x - width / 2;
    const crowded = left + width + TICK_GAP > kept;
    if (!crowded) kept = left;
    return { ...tick, crowded, edge };
  });
}

export function IrisLedLegend({
  agents,
  period,
}: {
  readonly agents: readonly IrisLedAgent[];
  readonly period: PeriodPreset;
}) {
  return (
    <ul className="ir-led-legend" aria-label="Who presented, by colour">
      {agents.map((agent) => (
        <li key={agent.id} style={colour(agent.index)}>
          <i aria-hidden="true" />
          {agent.href === null ? (
            agent.name
          ) : (
            <Link href={dynamicRoute(withPeriod(agent.href, period))}>{agent.name}</Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function IrisLedTimeline({
  view,
  period,
  canOpen,
}: {
  readonly view: IrisLedSalesView;
  readonly period: PeriodPreset;
  /** Whether the reader's role may open a meeting replay. */
  readonly canOpen: boolean;
}) {
  const { axis } = view;
  const ticks = axisTicks(axis.ticks);
  return (
    <figure className="ir-led-figure">
      <ol className="ir-led-rows" aria-label="Sales shown in IRIS before their status changed">
        {view.sales.map((sale) => {
          const lastIndex = sale.showings.length - 1;
          return (
            <li className="ir-led-row" key={sale.id}>
              <div className="ir-led-head">
                <span className="ir-led-unit">
                  {sale.unitHref === null ? (
                    sale.unitCode
                  ) : (
                    <Link href={dynamicRoute(withPeriod(sale.unitHref, period))}>
                      {sale.unitCode}
                    </Link>
                  )}
                </span>
                <span className="ir-led-change">
                  {sale.changeLabel} · {sale.changeDisplay}
                </span>
                <span className="ir-led-meta">
                  {sale.showings.length} shown · last {sale.gapDisplay} before · {sale.verdictLabel}
                </span>
              </div>
              <div className="ir-led-track">
                <i
                  className="ir-led-window"
                  style={{ left: at(axis.windowStart) }}
                  aria-hidden="true"
                />
                {sale.lastPosition === null ? null : (
                  <i
                    className="ir-led-gap"
                    style={{ left: at(sale.lastPosition) }}
                    aria-hidden="true"
                  />
                )}
                {sale.showings.map((showing, index) => {
                  const last = index === lastIndex;
                  const style = { ...colour(showing.agentIndex), left: at(showing.position) };
                  const side =
                    showing.position > 0.6 ? "end" : showing.position < 0.4 ? "start" : undefined;
                  const tip = (
                    <span className="ir-led-tip" aria-hidden="true">
                      <b>{showing.dateDisplay}</b> {showing.agentName}
                      <br />
                      {showing.beforeDisplay}
                    </span>
                  );
                  return canOpen ? (
                    <Link
                      key={showing.meetingId}
                      className="ir-led-dot"
                      data-last={last ? "true" : undefined}
                      data-side={side}
                      style={style}
                      href={dynamicRoute(withPeriod(showing.meetingHref, period))}
                      {...(last
                        ? { "aria-label": `${showing.label} Open the meeting.` }
                        : { tabIndex: -1, "aria-hidden": true })}
                    >
                      {tip}
                    </Link>
                  ) : (
                    <span
                      key={showing.meetingId}
                      className="ir-led-dot"
                      data-last={last ? "true" : undefined}
                      data-side={side}
                      style={style}
                      aria-hidden="true"
                    >
                      {tip}
                    </span>
                  );
                })}
                <span className="ir-led-mark" aria-hidden="true" />
              </div>
            </li>
          );
        })}
      </ol>
      {/* The rows' own grid, so the ticks stand under the tracks at every width. */}
      <div className="ir-led-row ir-led-axis-row" aria-hidden="true">
        <span />
        <div className="ir-led-axis">
          {ticks.map((tick) => (
            <span
              key={tick.label}
              style={{ left: at(tick.position) }}
              data-crowded={tick.crowded ? "true" : undefined}
              data-edge={tick.edge ? "start" : undefined}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="iris-meta iris-meta-measured">{axis.caption}</figcaption>
    </figure>
  );
}
