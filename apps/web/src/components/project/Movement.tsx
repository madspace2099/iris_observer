import Link from "next/link";
import { UNIT_MIN_SAMPLE, insufficient } from "@observer/metrics";
import type {
  EvidenceRef,
  PeriodPreset,
  ProjectPulse,
  PulseUnit,
  UnitChange,
  UnitStatus,
} from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { DataTable, Evidence } from "@/components/product";
import { TrendMark } from "./Reading";
import { Plate } from "./Section";

/**
 * WHAT MOVED IN THIS PERIOD — and the honest reason it is not a trend line.
 *
 * The brief asks this screen for a trend of recent engagement. **None of the
 * three read models it reads returns a time series.** `ProjectPulse` is a
 * position at one instant, `ProjectView` is a set of shares over the whole
 * period, and `ProjectCharts` returns targets and a journey, neither of which
 * is indexed by time. `TrendSeries` exists in `packages/readmodels/src/charts.ts`
 * and is returned only by `getFlowCharts`, which belongs to a different surface
 * and a different reader-chosen window.
 *
 * A line could have been assembled here by bucketing something by date. That
 * would be a metric computed in a page — no registry entry, no denominator, no
 * sample size, nothing to check it against — which ADR-0012 forbids and which
 * this file will not do. The gap is reported.
 *
 * What the Pulse *does* carry is the second channel `PulseUnit.change` was
 * built for: a value that is null on most cells and set only where something
 * happened inside the period. That is a change register, and a register is a
 * better answer for a stacking plan than a line anyway — "which apartments
 * moved, and which way" is the question an executive asks of a building.
 * `trend` sits beside it because a unit that gained interest and a unit that
 * lost it are the two rows a reader is looking for.
 *
 * ## Nothing here is aggregated
 *
 * The rows are `floors[].units[]` flattened and filtered on `change !== null`.
 * That selects rows the read model already marked; it derives no value, adds
 * nothing up and ranks nothing. Every figure printed in a cell — the views, the
 * people, the price, the status, the trend — arrived on the unit whole.
 *
 * ## The per-row sample floor, which is the reason `trend` is sometimes absent
 *
 * "Below the minimum sample there is no verdict, no rank and no trend" applies
 * per unit here, not per screen: `UNIT_MIN_SAMPLE` is the observation floor and
 * `PulseUnit.meaningfulViews` is the observation count. A unit under it prints
 * its raw view count and the policy's shortfall sentence in place of the trend
 * mark, which is exactly the treatment the rule asks for — the figure stands,
 * the verdict does not.
 */
export function Movement({
  pulse,
  root,
  period,
}: {
  readonly pulse: ProjectPulse;
  readonly root: string;
  readonly period: PeriodPreset;
}) {
  /*
   * The change is carried out of the loop beside its unit rather than read back
   * off the unit inside the row builder. `PulseUnit.change` is `UnitChange |
   * null` and narrowing it here is what keeps the cell from needing a fallback
   * word — a fallback would be this component inventing a change for a unit
   * that did not have one, which is the whole thing the null is protecting.
   */
  const moved: { readonly unit: PulseUnit; readonly change: UnitChange }[] = [];
  for (const floor of pulse.floors) {
    for (const unit of floor.units) {
      if (unit.change !== null) moved.push({ unit, change: unit.change });
    }
  }

  const evidence: EvidenceRef = pulse.evidence;

  return (
    <Plate
      id="project-movement"
      title="What moved in this period"
      note="Every apartment the Pulse marked with a change inside this period. Most cells carry no change at all, which is what makes these worth reading. There is no engagement time series behind this screen; this register is the period's news, unit by unit."
      aside={<Evidence evidence={evidence} period={period} />}
    >
      <DataTable
        caption="Apartments the Pulse recorded a change against inside this period, in stacking-plan order."
        period={period}
        codeColumn="unit"
        columns={[
          { key: "unit", label: "Unit" },
          /*
           * Position and plan in one cell rather than two columns.
           *
           * This register is usually short — most periods change two or three
           * apartments — and a nine-column head over three rows is the "table
           * pretending to be a grid" the design lab objected to. Where a flat is
           * and what it is are one thought to a reader anyway: nobody asks which
           * floor without also asking how many rooms.
           */
          { key: "apartment", label: "Apartment" },
          { key: "price", label: "Price", numeric: true },
          { key: "status", label: "Status" },
          { key: "change", label: "What changed" },
          { key: "views", label: "Meaningful views", numeric: true },
          { key: "people", label: "People", numeric: true },
          { key: "trend", label: "Demand" },
        ]}
        rows={moved.map(({ unit, change }) => ({
          key: unit.unitId,
          cells: {
            unit: (
              <Link
                href={dynamicRoute(
                  withPeriod(`${root}/units/${encodeURIComponent(unit.code)}`, period),
                )}
              >
                {unit.code}
              </Link>
            ),
            apartment: `Floor ${unit.floor}, block ${unit.block} · ${unit.rooms} rooms · ${unit.areaSqm} m² · facing ${unit.orientation}`,
            price: <span className="ox-figure">{unit.priceDisplay}</span>,
            status: (
              <span className="ox-chip" data-tone={STATUS_TONES[unit.status]}>
                <span className="ox-chip-mark" aria-hidden="true" />
                {STATUS_WORDS[unit.status]}
              </span>
            ),
            change: CHANGE_WORDS[change],
            views: <span className="ox-figure">{unit.meaningfulViews}</span>,
            people: (
              <span className="ox-value">
                <span className="ox-figure">{unit.uniqueContacts}</span>
                {unit.uniqueContacts === 0 ? (
                  <span className="ox-of">nobody identified</span>
                ) : null}
              </span>
            ),
            trend:
              unit.meaningfulViews < UNIT_MIN_SAMPLE ? (
                <span className="ox-shortfall">{insufficient(UNIT_MIN_SAMPLE, "views")}</span>
              ) : (
                <TrendMark trend={unit.trend} />
              ),
          },
        }))}
        empty={{
          title: "Nothing moved in this period",
          note: "No apartment was sold, reserved, repriced, or gained or lost interest inside this period. The stacking plan above is the same building it was at the start of it.",
        }}
      />
    </Plate>
  );
}

/**
 * `UnitChange`, in the reader's words.
 *
 * `observer-product.css` §23 gives `.ox-stack-unit` a hook for status and one
 * for heat and none at all for change, so the words are the only channel this
 * value has. `StackPlan` in the shared primitive layer carries its own private
 * copy of exactly this map for exactly that reason, which is the evidence that
 * the map belongs beside the `UNIT_CHANGES` union rather than in each surface
 * that renders it. Reported as a gap, in both halves: no `data-change`
 * treatment, and no shared labels.
 *
 * Two of the five are stated in the past tense and three describe a movement,
 * and none of them is a verdict: "fewer views than the period before" is a
 * sequence of observations, and what to do about it is the unit's own page.
 */
const CHANGE_WORDS: Readonly<Record<UnitChange, string>> = {
  sold: "Sold in this period",
  reserved: "Reserved in this period",
  price_cut: "Price reduced in this period",
  demand_drop: "Fewer views than the period before",
  new_interest: "First views in this period",
};

/**
 * The status, as a word and a shape rather than as a colour.
 *
 * The tones are the sheet's six and the shape is what survives greyscale and a
 * reader who cannot separate the hues: a circle for a unit still on sale, the
 * human diamond for one somebody has decided to hold — blue means "a person
 * decided this, and a person can change it" throughout this system — and a
 * closed square for one that has completed.
 */
const STATUS_TONES: Readonly<Record<UnitStatus, string>> = {
  available: "good",
  reserved: "human",
  sold: "settled",
};

const STATUS_WORDS: Readonly<Record<UnitStatus, string>> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};
