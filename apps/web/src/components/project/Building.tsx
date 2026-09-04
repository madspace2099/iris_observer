import { AGENT_MIN_SAMPLE, insufficient } from "@observer/metrics";
import type { PeriodPreset, ProjectPulse } from "@observer/readmodels";

import { Evidence, StackPlan, Tally, TallyItem } from "@/components/product";
import { Count } from "./Reading";
import { Plate } from "./Section";

/**
 * THE BUILDING — the region that makes this a real-estate product.
 *
 * The doctrine's final test is that with the logo hidden the screen still reads
 * as real-estate spatial sales intelligence rather than as a generic analytics
 * dashboard. Charts do not pass that test. A stacking plan does: a floor is a
 * row, top floor first because that is how the building stands, a unit is a
 * cell as wide as its floor area, and its fill is how much attention buyers gave
 * it in the period. This is the one place the building itself appears, and it is
 * the reason this region is the first thing under the head.
 *
 * It sits on PAPER. `ProjectPulse` is a register of readings — a catalogue of
 * apartments and what was observed against each of them — which is exactly the
 * dense measured body ADR-0034 says paper is earned by. The graphite above it
 * carries the conclusion; this carries what the conclusion was drawn from.
 *
 * ## The tally is the stock position, not a row of KPI cards
 *
 * Six figures on one plane divided by hairlines, with no elevation, no icon
 * beside a label and no card between them. Every one of them is a catalogue
 * fact — how many apartments exist, how many are still for sale, how many are
 * reserved, how many have sold, how many sold inside the period — plus the one
 * behavioural figure the region rests on, the number of presentations.
 *
 * Each carries its denominator, because a count without one is the first of the
 * three page rules broken. `pulse.totals.units` is the denominator of the stock
 * figures and is itself qualified by the shape of the building, which is a
 * description of the read model's own rows rather than a derived metric.
 *
 * ## What is NOT here, and why it is absent rather than approximated
 *
 * The brief asks this region for engaged visitors, units explored, favourites
 * and offers. None of the three read models this screen reads returns any of
 * them: `ProjectPulse.totals` has five stock counts and `soldInPeriod`, and
 * nothing on `ProjectView` or `ProjectCharts` counts a visitor, an exploration,
 * a shortlisting or an offer as a figure. They could each be assembled by
 * walking `floors[].units[]` and adding numbers up, and that is exactly the
 * `.reduce()` in a page ADR-0012 forbids — a metric with no registry entry, no
 * denominator, no sample size and nothing to check it against. They are
 * reported as missing read models instead of being invented here.
 *
 * ## The sample floor applies to the meeting count and to nothing else
 *
 * A stock count is a fact about the catalogue: forty-eight apartments is
 * forty-eight apartments whether one meeting happened or a hundred did, so no
 * floor applies to it. The presentation count is the sample every behavioural
 * reading on this screen rests on, so below `AGENT_MIN_SAMPLE` it is shown at
 * full size with the policy's own shortfall sentence beside it, and the screen
 * withholds every verdict, rank and trend that stands on it.
 */
export function Building({
  pulse,
  meetingCount,
  root,
  period,
}: {
  readonly pulse: ProjectPulse;
  /** Presentations in this period. The denominator of everything behavioural. */
  readonly meetingCount: number;
  /** `/{tenantSlug}/{projectSlug}`. Every unit link is built from it. */
  readonly root: string;
  readonly period: PeriodPreset;
}) {
  /*
   * Where each cell goes, resolved to a map rather than a function.
   *
   * `StackPlan` takes `Record<unitId, href>` because a function prop cannot
   * cross into a client component, and a unit missing from the map is drawn as
   * a plain cell rather than as a link to nowhere. The code is encoded because
   * a scheme may spell one with more than one hyphen — `IT-A-12-07` — and a
   * route segment is not the place to find that out.
   */
  const unitHrefs: Record<string, string> = {};
  for (const floor of pulse.floors) {
    for (const unit of floor.units) {
      unitHrefs[unit.unitId] = `${root}/units/${encodeURIComponent(unit.code)}`;
    }
  }

  const belowFloor = meetingCount < AGENT_MIN_SAMPLE;

  return (
    <Plate
      id="project-building"
      title="The building, floor by floor"
      note={`Every apartment in the catalogue, in the position it occupies. A cell is one unit, its width is its floor area, and its fill is meaningful views in this period against ${pulse.peakViews} on the busiest unit. Sold units are hatched and carry no fill.`}
      aside={<Evidence evidence={pulse.evidence} period={period} />}
    >
      <Tally>
        <TallyItem
          label="Apartments"
          value={
            <Count
              value={pulse.totals.units}
              of={`in ${pulse.blocks.length} blocks over ${pulse.floors.length} floors`}
              note="no unit catalogue has reached this project"
            />
          }
        />
        <TallyItem
          label="Still available"
          value={
            <Count
              value={pulse.totals.available}
              of={`of ${pulse.totals.units}`}
              note={`of ${pulse.totals.units} — every apartment has been reserved or sold`}
            />
          }
        />
        <TallyItem
          label="Reserved"
          value={
            <Count
              value={pulse.totals.reserved}
              of={`of ${pulse.totals.units}`}
              note={`of ${pulse.totals.units} — nothing is held`}
            />
          }
        />
        <TallyItem
          label="Sold"
          value={
            <Count
              value={pulse.totals.sold}
              of={`of ${pulse.totals.units}`}
              note={`of ${pulse.totals.units} — nothing has completed yet`}
            />
          }
        />
        <TallyItem
          label="Sold in this period"
          value={
            <Count
              value={pulse.totals.soldInPeriod}
              of={`of ${pulse.totals.sold} sold in all`}
              note={`of ${pulse.totals.sold} sold in all — none of them inside this period`}
            />
          }
        />
        <TallyItem
          label="Presentations"
          value={
            <Count
              value={meetingCount}
              of="in this period"
              note="in this period — no presentation has been recorded"
              shortfall={belowFloor ? insufficient(AGENT_MIN_SAMPLE, "meetings") : null}
            />
          }
        />
      </Tally>

      <StackPlan
        floors={pulse.floors}
        unitHrefs={unitHrefs}
        period={period}
        buildingLabel={pulse.buildingLabel}
        peakViews={pulse.peakViews}
      />
    </Plate>
  );
}
