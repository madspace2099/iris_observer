import type { EvidenceRef, PeriodPreset, StatedDemand } from "@observer/readmodels";

import { DataTable, Evidence } from "@/components/product";
import { AVAILABILITY_WORDS } from "@/showroom/parts";
import { Plate } from "./Section";

/**
 * WHAT BUYERS ASKED FOR — including the things the building does not have.
 *
 * Every other reading on this screen is about the stock that exists. This one
 * is the only surface in the product that can name something the scheme LACKS:
 * a filter a buyer applied in the showroom that returned no available unit. A
 * search with no answer is the sharpest demand signal a project gets, and it is
 * the one that feeds the next phase rather than the next campaign.
 *
 * It is a register, so it is a real `<table>` on paper. Five columns and one
 * row per filter, each cell carrying its own column name from `data-label` so
 * that below 48rem the row becomes a stacked record rather than a list of
 * unlabelled numbers.
 *
 * ## Zero is the finding here, so zero is drawn as an answer
 *
 * `matches === 0` is a genuine zero — the catalogue was searched and nothing in
 * it satisfied the filter — so it takes the full-size `.ox-value` treatment
 * with the sentence beside it, never the missing mark and never a blank cell.
 * The four absences are four different situations and this is `empty`, which is
 * the one that is a real answer. A dash here would say "we could not tell",
 * which is the opposite of what the row means.
 *
 * ## The availability column is not decoration
 *
 * Filter state is not emitted by the current showroom build. Every row in this
 * register therefore arrives marked `requires_ue5_v2_event`, and printing that
 * against each row is the difference between a demonstration of what the UE5 v2
 * event would answer and a table of measurements that were never taken. It is a
 * column rather than a footnote because a scheme that later gains the event
 * will have rows of both kinds in the same table, and a footnote cannot say
 * which row is which.
 */
export function StatedDemandRegister({
  demand,
  evidence,
  period,
}: {
  readonly demand: readonly StatedDemand[];
  readonly evidence: EvidenceRef | null;
  readonly period: PeriodPreset;
}) {
  const unmatched = demand.filter((entry) => entry.matches === 0);

  return (
    <Plate
      id="project-searched"
      title="What buyers searched for"
      note={
        unmatched.length === 0
          ? "Every filter applied inside the showroom, how often it was applied, and how many available units satisfied it."
          : `Every filter applied inside the showroom, how often it was applied, and how many available units satisfied it. ${unmatched.length} of these searches matched no available unit at all.`
      }
      aside={<Evidence evidence={evidence} period={period} />}
    >
      <DataTable
        caption="Filters buyers applied in the showroom, ordered by how often they were applied."
        period={period}
        codeColumn="filter"
        columns={[
          { key: "filter", label: "Filter" },
          { key: "value", label: "Value" },
          { key: "applications", label: "Times applied", numeric: true },
          { key: "matches", label: "Units matching", numeric: true },
          { key: "availability", label: "Can this be measured today" },
        ]}
        rows={demand.slice(0, 12).map((entry) => ({
          key: `${entry.field}:${entry.value}`,
          cells: {
            filter: entry.label,
            value: entry.value,
            applications: <span className="ox-figure">{entry.applications}</span>,
            matches:
              entry.matches === 0 ? (
                <span className="ox-value">
                  <span className="ox-figure">0</span>
                  <span className="ox-of">nothing available matched</span>
                </span>
              ) : (
                <span className="ox-figure">{entry.matches}</span>
              ),
            availability: <span className="ox-n">{AVAILABILITY_WORDS[entry.availability]}</span>,
          },
        }))}
        empty={{
          title: "No filter was applied in this period",
          note: "Buyers browsed the scheme without narrowing it. That is a real answer about how these presentations ran, not a gap in the recording.",
        }}
      />
    </Plate>
  );
}
