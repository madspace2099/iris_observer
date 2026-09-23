import type { PeriodPreset, SectionUsage } from "@observer/readmodels";

import { ChartFrame, Empty } from "@/components/product";
import { RankedBars } from "@/showroom/charts2";
import { shareDisplay } from "./vocabulary";

/**
 * THE RUNNING ORDER — where each feature falls in a presentation.
 *
 * `meanPosition` is a feature's average place in the run, on a scale where 0 is
 * the first stop and 1 the last. It is the one figure on this screen that is
 * about the SHAPE of a presentation rather than about how much of it was used,
 * and it is the reason this chart exists beside a register that already carries
 * every other column: a table of positions is nine numbers, and the same nine
 * numbers as an ordered run is the answer to "what does a presentation of this
 * building actually look like".
 *
 * ## A mean position is not a path
 *
 * Nobody presents the same way twice. This is the average place each feature
 * took across every presentation in the period, and drawing it as one running
 * order is a summary of many runs rather than the route any single meeting
 * took. The note says so, and the chart draws no arrows between rows for the
 * same reason: an arrow is a sequence claim about two specific features, and
 * this figure cannot carry one. Transitions are a different read model.
 *
 * ## Features nobody opened are not at the front
 *
 * `meanPosition` is built from the presentations that reached the feature, and
 * the read model returns `0` where there were none. Zero is the value that
 * means "first". So a feature nobody opened would be drawn as the opening stop
 * of every presentation in the period, which is both false and the single most
 * misleading thing this chart could do. Those rows are excluded here and the
 * exclusion is stated in the note — they are still in the register above, where
 * their reach reads as the zero it honestly is.
 *
 * ## Why this is not `SectionSequence`
 *
 * `SectionSequence` in `@/showroom/charts2` draws exactly this idea and is the
 * better component for it. It requires `teamDwellDisplay` on every row — each
 * stop compared against the team's median — and `StorytellingIntelligence`
 * carries no benchmark. The one that exists, `PresentationIntelligence.
 * teamBenchmark`, is a different read model, and a screen may not join two
 * (ADR-0012). Passing a placeholder into a column labelled "team" would print a
 * comparison that was never made, so this draws the ordered bars it can support
 * instead, and the gap is reported.
 */
export function RunningOrder({
  sections,
  meetingsTotal,
  periodLabel,
  period,
}: {
  readonly sections: readonly SectionUsage[];
  readonly meetingsTotal: number;
  readonly periodLabel: string;
  /** For `RankedBars`, which requires it; these rows link nowhere today. */
  readonly period: PeriodPreset;
}) {
  const reached = sections.filter((section) => section.meetings > 0);
  const ordered = [...reached].sort((a, b) => a.meanPosition - b.meanPosition);

  if (ordered.length === 0) {
    return (
      <Empty
        title="No feature was opened in this period"
        note="A running order is the average place each feature took across the presentations that reached it, and no presentation reached one."
      />
    );
  }

  return (
    <ChartFrame
      title="Where each feature falls in a presentation"
      period={periodLabel}
      note="The average place each feature took across the presentations that reached it, on a scale where 0% is the first stop and 100% the last. A longer bar is a later stop. This is a summary of many presentations, not the path any one of them took, and it says nothing about what a presenter did next. Features no presentation opened are not shown here; they are in the register below, where their reach reads as zero."
      summary={`Typical running order across ${meetingsTotal} presentations, first stop to last: ${ordered
        .map((section) => `${section.label} at ${shareDisplay(section.meanPosition)}`)
        .join(", ")}.`}
    >
      <RankedBars
        period={period}
        rows={ordered.map((section) => ({
          id: section.sectionId,
          label: section.label,
          sub: `reached in ${section.meetings} of ${meetingsTotal} presentations`,
          value: section.meanPosition,
          display: shareDisplay(section.meanPosition),
        }))}
      />
    </ChartFrame>
  );
}
