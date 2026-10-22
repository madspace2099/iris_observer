import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { RoomTypesView } from "@observer/readmodels";
import { InfoTip } from "@/components/iris/InfoTip";
import { dynamicRoute } from "@/lib/href";
import "./rooms.css";

/**
 * THE ROOM TYPES SIDE BY SIDE (ADR-0056).
 *
 * The owner, on the tabs that held one room type at a time: "when I click
 * these the page should not reload", and "better to see them next to each
 * other — like this I cannot compare the room types". So the types are
 * columns of one table, and nothing navigates: what one tab showed against
 * "every other unit" is now read against the other types directly. The
 * highest rate of a row is the read model's mark, given only among the types
 * with enough openings to rank. On a phone each row's name takes its own line
 * and the types stay columns, so the comparison survives the width.
 */
export function RoomCompare({
  view,
  hrefFor,
  children,
}: {
  readonly view: RoomTypesView;
  /** The page's period, laid on a read model's link. */
  readonly hrefFor: (href: string) => string;
  /** The source line, at the card's foot. */
  readonly children?: ReactNode;
}) {
  return (
    <div
      className="d-card pr-compare"
      style={{ "--pr-cols": view.columns.length } as CSSProperties}
    >
      <header className="iris-titled">
        <h2 className="iris-kicker iris-kicker-measured">The room types side by side</h2>
        <InfoTip id="room-compare" label="the room types side by side">
          {view.comparisonDefinition}
        </InfoTip>
      </header>
      <p className="pr-sub">What buyers did once they opened a flat, in this period.</p>
      <div className="pr-grid" role="table" aria-label="What buyers did with each room type">
        <div className="pr-grid-row pr-grid-head" role="row">
          <span className="pr-grid-corner" role="columnheader">
            Of its openings
          </span>
          {view.columns.map((c) => (
            <span
              key={c.id}
              id={`pr-col-${c.id}`}
              role="columnheader"
              data-short={c.belowMinimum ? "true" : undefined}
            >
              <b>{c.label}</b>
              <small>{c.openingsDisplay}</small>
              {c.shortNote === null ? null : <small className="pr-short">{c.shortNote}</small>}
            </span>
          ))}
        </div>
        {view.rows.map((row) => (
          <div className="pr-grid-row" role="row" key={row.id}>
            <span role="rowheader">{row.label}</span>
            {row.cells.map((cell, i) => (
              <span
                key={cell.id}
                role="cell"
                data-highest={cell.highest ? "true" : undefined}
                data-short={view.columns[i]?.belowMinimum ? "true" : undefined}
              >
                <b>{cell.display}</b>
                {cell.highest ? <span className="iris-sr"> highest</span> : null}
                <i aria-hidden="true" style={{ width: `${String((cell.rate ?? 0) * 100)}%` }} />
              </span>
            ))}
          </div>
        ))}
        <div className="pr-grid-row pr-grid-foot" role="row">
          <span role="cell" className="pr-grid-corner" />
          {view.columns.map((c) => (
            <span role="cell" key={c.id}>
              <Link className="iris-action" href={dynamicRoute(hrefFor(c.audienceHref))}>
                Build an audience
                <span className="pr-for"> of {c.label.toLowerCase()} buyers</span>
              </Link>
            </span>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
