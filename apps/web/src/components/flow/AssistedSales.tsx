import Link from "next/link";
import type { AssistedSales as AssistedSalesView, PeriodPreset } from "@observer/readmodels";

import { InfoTip } from "@/components/iris/InfoTip";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { SourceChips } from "@/showroom/parts";
import { RankedBars } from "@/showroom/charts2";

/**
 * IRIS-ASSISTED SALES, on Sales Flow (ADR-0039).
 *
 * Which of the CRM's dated sales followed a showing of the unit, by a versioned
 * rule about order and elapsed time. The rule this file holds: EVERY WORD IS
 * THE READ MODEL'S. The headline, the row labels and the note are printed as
 * they arrive, because the causal-language guard runs over the read models and
 * a sentence composed here would be prose nothing checks — and this is the one
 * section of the product most tempted to say "because".
 *
 * A row's bar is the read model's `windowShare`, against a fixed scale of one:
 * how much of the window was left when the unit was shown. A sale outside the
 * window has no bar rather than a short one, so the eye separates the two groups
 * the rule separates.
 *
 * Each row opens the meeting that showed the unit — the evidence for the row's
 * claim — and the unit itself where no meeting did, or where the reader's role
 * may not open a replay (R08-6).
 */
export function AssistedSales({
  assisted,
  period,
  canOpen,
  irisLedHref,
}: {
  readonly assisted: Extract<AssistedSalesView, { readonly source: "crm" }>;
  readonly period: PeriodPreset;
  /** Whether the reader's role may open a meeting replay. */
  readonly canOpen: boolean;
  /** The drill-down beneath this card (ADR-0049): every showing before every sale. */
  readonly irisLedHref?: string;
}) {
  return (
    <div className="d-card">
      {/*
       * The rule and what it does not say stand behind the `i` (the owner,
       * 2026-10-20); the headline below keeps the count and its denominator,
       * and the sales it cannot place stay beside the rows.
       */}
      <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
        <h2 className="iris-kicker iris-kicker-measured">IRIS-assisted sales</h2>
        <InfoTip id="assisted-sales" label="IRIS-assisted sales">
          {assisted.note}
        </InfoTip>
      </header>
      <p className="iris-lede" style={{ marginBottom: "1rem" }}>
        {assisted.headline}
      </p>
      {assisted.sales.length === 0 ? null : (
        <RankedBars
          period={period}
          rows={assisted.sales.map((sale) => {
            const href = (canOpen ? sale.meetingHref : null) ?? sale.unitHref;
            return {
              id: sale.externalId,
              label: `${sale.unitCode} · ${sale.stageLabel} ${sale.stageDateDisplay}`,
              sub: sale.verdictLabel,
              value: sale.windowShare,
              display: sale.lagShort,
              href: href === null ? null : withPeriod(href, period),
            };
          })}
          peak={1}
          measured
          // R05 item 8. The denominator, "N of M dated sales", is in the headline.
          collapseAfter={5}
        />
      )}
      {/* What the denominator leaves out stays in view (ADR-0039 §6). */}
      {assisted.unplacedNote === null ? null : (
        <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
          {assisted.unplacedNote}
        </p>
      )}
      <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"]} measured />
      {irisLedHref === undefined ? null : (
        <p style={{ marginTop: ".875rem" }}>
          <Link className="iris-action" href={dynamicRoute(withPeriod(irisLedHref, period))}>
            Open IRIS-led sales
          </Link>
        </p>
      )}
    </div>
  );
}
