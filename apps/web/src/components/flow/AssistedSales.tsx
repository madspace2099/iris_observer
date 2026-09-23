import type { AssistedSales as AssistedSalesView, PeriodPreset } from "@observer/readmodels";

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
 * claim — and the unit itself where no meeting did.
 */
export function AssistedSales({
  assisted,
  period,
}: {
  readonly assisted: Extract<AssistedSalesView, { readonly source: "crm" }>;
  readonly period: PeriodPreset;
}) {
  return (
    <div>
      <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".875rem" }}>
        IRIS-assisted sales
      </h2>
      <p className="iris-lede" style={{ marginBottom: "1rem" }}>
        {assisted.headline}
      </p>
      {assisted.sales.length === 0 ? null : (
        <RankedBars
          period={period}
          rows={assisted.sales.map((sale) => {
            const href = sale.meetingHref ?? sale.unitHref;
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
        />
      )}
      <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
        {assisted.note}
      </p>
      <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"]} measured />
    </div>
  );
}
