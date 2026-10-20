import Link from "next/link";
import type { PeriodPreset, UnitAttentionPatterns } from "@observer/readmodels";

import { InfoTip } from "@/components/iris/InfoTip";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/** Two columns where the card is wide, one where it is not. */
const COLUMNS = {
  display: "grid",
  gap: "1.25rem 2.5rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
} as const;
const STACK = { display: "grid", gap: ".5rem", alignContent: "start" } as const;

/**
 * WHAT THE MOST-OPENED FLATS SHARE (ADR-0050).
 *
 * The owner's question of the most-opened flats is what they have in common —
 * aspect, floors, rooms, price — and the list only as its evidence. Every
 * finding is the read model's sentence, printed as it arrives: the causal guard
 * reads the read models, and a finding composed here is one nothing checks.
 * What they share stands first; the spans the flats cover under it, quieter;
 * whether they sold, and the flats themselves as links to their own pages, in
 * the second column. How a tie was ordered and what the comparison cannot say
 * stand behind the `i`.
 */
export function UnitPatterns({
  view,
  period,
}: {
  readonly view: UnitAttentionPatterns;
  readonly period: PeriodPreset;
}) {
  const lines =
    view.patterns.length > 0
      ? view.patterns.map((p) => p.statement)
      : view.note === null
        ? []
        : [view.note];
  const about = [view.tieNote, ...view.caveats].filter((c): c is string => c !== null);
  return (
    <div className="d-card">
      <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
        <h2 className="iris-kicker iris-kicker-measured">What the most-opened flats share</h2>
        {about.length === 0 ? null : (
          <InfoTip id="unit-patterns" label="what the most-opened flats share">
            {about.join(" ")}
          </InfoTip>
        )}
      </header>
      <div style={COLUMNS}>
        <div style={STACK}>
          {lines.map((line) => (
            <p key={line} className="iris-body">
              {line}
            </p>
          ))}
          {view.ranges.map((line) => (
            <p key={line} className="iris-meta" style={{ margin: 0 }}>
              {line}
            </p>
          ))}
        </div>
        {view.top.length === 0 ? null : (
          <div style={STACK}>
            {view.conversion.map((line) => (
              <p key={line} className="iris-body">
                {line}
              </p>
            ))}
            <p className="iris-meta" style={{ margin: ".5rem 0 0" }}>
              The most-opened flats, with how many of the period&apos;s {view.meetings} meetings
              opened each
            </p>
            <div className="iris-chips">
              {view.top.map((flat) => (
                <Link
                  key={flat.unitCode}
                  className="iris-chip"
                  href={dynamicRoute(withPeriod(flat.href, period))}
                  aria-label={`${flat.unitCode}, opened in ${String(flat.meetings)} of ${String(view.meetings)} meetings`}
                >
                  {flat.unitCode} <b>{flat.meetings}</b>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
