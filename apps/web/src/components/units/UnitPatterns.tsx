import Link from "next/link";
import type { PeriodPreset, UnitAttentionPatterns } from "@observer/readmodels";

import { InfoTip } from "@/components/iris/InfoTip";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import "@/components/sheet/sheet.css";
import "@/components/units/titled.css";

/** Two columns where the plane is wide, one where it is not. */
const COLUMNS = {
  display: "grid",
  gap: "1.25rem 2.5rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
} as const;
const STACK = { display: "grid", gap: ".5rem", alignContent: "start" } as const;

/**
 * WHAT THE MOST-OPENED FLATS SHARE (ADR-0051).
 *
 * The owner's question of the most-opened flats is what they have in common —
 * aspect, floors, rooms, price — and the list only as its evidence. Every
 * finding is the read model's sentence, printed as it arrives: the causal guard
 * reads the read models, and a finding composed here is one nothing checks.
 *
 * A text section on an `ox-` page, so it wears the page's own section head and
 * no card (`.d-card` is a chart region's). What they share stands first, the
 * spans the flats cover under it, quieter; whether they sold, what those lines
 * cannot say, and the flats themselves as links in the second column. What
 * the comparison cannot say about cause is the section's note.
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
  /*
   * What the lines cannot say — the method, the demonstration CRM, how a tie
   * was ordered — stands behind the title's `i` (Máté's video review,
   * 2026-10-23). The lines, their spans and the flats stay in view.
   */
  const behind = [
    ...view.caveats,
    ...(view.salesNote === null ? [] : [view.salesNote]),
    ...(view.tieNote === null ? [] : [view.tieNote]),
  ];
  return (
    <>
      <div className="ox-section-head">
        <div className="sheet-titled">
          <h2 className="ox-section-title">What the most-opened flats share</h2>
          {behind.length === 0 ? null : (
            <InfoTip id="most-opened" label="what the most-opened flats share">
              {behind.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </InfoTip>
          )}
        </div>
      </div>
      <div style={COLUMNS}>
        <div style={STACK}>
          {lines.map((line) => (
            <p key={line} className="ox-lede" style={{ margin: 0 }}>
              {line}
            </p>
          ))}
          {view.ranges.map((line) => (
            <p key={line} className="ox-section-note">
              {line}
            </p>
          ))}
        </div>
        {view.top.length === 0 ? null : (
          <div style={STACK}>
            {view.conversion.map((line) => (
              <p key={line} className="ox-lede" style={{ margin: 0 }}>
                {line}
              </p>
            ))}
            <p className="ox-subhead" style={{ marginTop: ".5rem" }}>
              Most opened, of the period&apos;s {view.meetings} meetings
            </p>
            <ul className="ox-chipset">
              {view.top.map((flat) => (
                <li key={flat.unitCode}>
                  <Link
                    prefetch={false}
                    className="ox-toggle"
                    href={dynamicRoute(withPeriod(flat.href, period))}
                    aria-label={`${flat.unitCode}, opened in ${String(flat.meetings)} of ${String(view.meetings)} meetings`}
                  >
                    {flat.unitCode} · {flat.meetings}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
