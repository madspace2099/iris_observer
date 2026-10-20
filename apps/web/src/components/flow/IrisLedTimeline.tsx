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
          {axis.ticks.map((tick) => (
            <span key={tick.label} style={{ left: at(tick.position) }}>
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="iris-meta iris-meta-measured">{axis.caption}</figcaption>
    </figure>
  );
}
