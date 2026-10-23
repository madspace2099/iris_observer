import type { CSSProperties, ReactNode } from "react";
import type { RoomTypesView } from "@observer/readmodels";
import { InfoTip } from "@/components/iris/InfoTip";
import "./rooms.css";

/**
 * INTEREST AGAINST SALES, IN A LINE PER TYPE (ADR-0056).
 *
 * It replaces the attention × conversion scatter, which the owner — an
 * architect — could not read: "Simplify!". Each room type gets one reading in
 * words ("More time on it, and selling well"), the action it suggests, and
 * the two facts it rests on, each drawn against its own reference: the time
 * buyers spent on it against its share of the unsold flats (1.00× is its fair
 * share), and how much of it has sold against the project. It is time, not
 * how often a type is opened, and the head says so: "looked at" beside the
 * block above's openings told an architect opposite things about one type.
 * The period is named, because the window switch above does not move it.
 * Under the sample floor the line
 * says why there is no reading; with no CRM to say what sold, no type has
 * one, and the card says so once instead of once a row.
 */

/** The parity scale runs from nought to twice the type's share; past that the mark stops at the end. */
const PARITY_SPAN = 2;

export function RoomReadings({
  view,
  children,
}: {
  readonly view: RoomTypesView;
  /** The source line, at the card's foot. */
  readonly children?: ReactNode;
}) {
  return (
    <div className="d-card pr-readings">
      <header className="iris-titled">
        <h2 className="iris-kicker iris-kicker-measured">Interest against sales</h2>
        <InfoTip id="room-readings" label="interest against sales">
          {view.readingDefinition}
        </InfoTip>
      </header>
      <p className="pr-sub">{view.periodDisplay}</p>
      {/* With no CRM every type would say the same "no reading": it is said once. */}
      {view.soldUnavailable === null ? (
        <Rows view={view} />
      ) : (
        <p className="pr-sub">No reading for any type. {view.soldUnavailable}</p>
      )}
      {children}
    </div>
  );
}

function Rows({ view }: { readonly view: RoomTypesView }) {
  return (
    <>
      <div className="pr-read-head" aria-hidden="true">
        <span />
        <span>Reading</span>
        <span>Time spent, against its share of the unsold flats</span>
        <span>{view.soldAgainst}</span>
      </div>
      <ul className="pr-read-rows">
        {view.readings.map((r, i) => {
          const look = r.lookedAt === null ? null : Math.min(r.lookedAt, PARITY_SPAN);
          return (
            <li
              key={r.id}
              data-type={r.id}
              data-verdict={r.verdict ?? "none"}
              style={{ "--i": i } as CSSProperties}
            >
              <span className="pr-read-type">
                <b>{r.label}</b>
                <small>{r.basis}</small>
              </span>
              <span className="pr-read-say">
                <b>{r.headline}</b>
                {r.action === null ? null : <small>{r.action}</small>}
              </span>
              <span className="pr-meter" data-kind="look">
                <span className="pr-meter-figure">
                  <small className="pr-narrow">Time spent </small>
                  {r.lookedAtDisplay}
                </span>
                <span className="pr-meter-track" aria-hidden="true">
                  <b style={{ left: "50%" }} />
                  {look === null ? null : (
                    <i
                      data-side={look >= 1 ? "above" : "below"}
                      style={{
                        left: `${String((Math.min(look, 1) / PARITY_SPAN) * 100)}%`,
                        width: `${String((Math.abs(look - 1) / PARITY_SPAN) * 100)}%`,
                      }}
                    />
                  )}
                </span>
              </span>
              <span className="pr-meter" data-kind="sold">
                <span className="pr-meter-figure">
                  <small className="pr-narrow">Sold </small>
                  {r.soldDisplay}
                </span>
                <span className="pr-meter-track" aria-hidden="true">
                  {r.soldShare === null ? null : (
                    <i style={{ left: 0, width: `${String(r.soldShare * 100)}%` }} />
                  )}
                  {view.projectSoldShare === null ? null : (
                    <b
                      style={{ left: `${String(view.projectSoldShare * 100)}%` } as CSSProperties}
                    />
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="pr-note">{view.readingMarks}</p>
    </>
  );
}
