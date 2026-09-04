import { OUTCOME_LABELS, type MeetingOutcome } from "@observer/contracts";
import type { OutcomeSlice } from "@observer/readmodels";

import { Tally, TallyItem } from "@/components/product";

/**
 * WHAT THE MEETINGS BECAME, AS FIGURES — and the one inference this file makes
 * openly rather than quietly.
 *
 * `SalesFlowView.outcomes` is the outcome mix over the page period. It is built
 * by `outcomeSlices`, which filters out every outcome whose count is zero, so
 * the array is not a row per outcome — it is a row per outcome that HAPPENED.
 *
 * That omission carries meaning, and reading it is the only derivation on this
 * surface. `outcomeSlices` is computed over exactly the sessions that produce
 * `SalesFlowView.meetingCount`, so an outcome absent from the array occurred in
 * none of those meetings. The absence is an EMPTY, in the strict sense
 * the doctrine gives that word: a real answer, not a missing source and not a
 * failed read. It is drawn at full size and weight with the sentence that says
 * so, and never with the missing bar mark, which would state that something
 * could not be measured.
 *
 * The alternative — leaving the cell out — is worse in the exact way the four
 * absences exist to prevent: a reader who does not see "Reservation" on the
 * screen cannot tell whether nothing was reserved or whether the surface forgot
 * to ask.
 *
 * ## No label is written here
 *
 * The words come from `OUTCOME_LABELS` in `@observer/contracts`, the same map
 * the read model uses to fill `OutcomeSlice.label`. A present slice and an
 * absent one carry identical wording, which they would not if this
 * file spelled "Follow-up needed" itself.
 *
 * ## No percentage is written here either
 *
 * `OutcomeSlice.share` is a raw fraction and formatting it needs the project's
 * locale, which this layer does not hold (ADR-0012, and the note in
 * `Metric.tsx` about why nothing in the primitive layer formats). Each figure
 * carries its count and the denominator in words instead, which is what the
 * three page rules ask for: no metric without a denominator.
 */

/** A lookup into the mix. Not a filter over facts — the read model already did that. */
export function sliceOf(
  slices: readonly OutcomeSlice[],
  outcome: MeetingOutcome,
): OutcomeSlice | undefined {
  return slices.find((slice) => slice.outcome === outcome);
}

/**
 * One outcome as a figure, present or absent.
 *
 * `denominator` is the phrase that goes beside the count — the read model's own
 * meeting total, in words the reader can check against the ring beneath.
 */
export function OutcomeFigure({
  slice,
  denominator,
}: {
  readonly slice: OutcomeSlice | undefined;
  readonly denominator: string;
}) {
  if (slice === undefined) {
    return (
      <span className="ox-value">
        <span className="ox-figure">0</span>
        <span className="ox-of">{denominator} — none ended this way</span>
      </span>
    );
  }

  return (
    <span className="ox-value">
      <span className="ox-figure">{slice.count}</span>
      <span className="ox-of">{denominator}</span>
    </span>
  );
}

/**
 * The commercial end of the mix: what a meeting turned into.
 *
 * Deliberately not every outcome — the ring below carries all seven and their
 * counts. These are the four the sales question turns on, in the order a
 * meeting moves through them, with the unrecorded outcomes last so that the
 * denominator every rate on this screen quietly depends on is visible rather
 * than implied.
 */
const SHOWN: readonly MeetingOutcome[] = ["follow_up_needed", "reservation", "purchase", "skipped"];

export function OutcomeTally({
  outcomes,
  meetingCount,
  periodLabel,
}: {
  readonly outcomes: readonly OutcomeSlice[];
  readonly meetingCount: number;
  readonly periodLabel: string;
}) {
  const denominator = `of ${meetingCount} meetings in ${periodLabel}`;

  return (
    <Tally>
      {SHOWN.map((outcome) => (
        <TallyItem
          key={outcome}
          label={OUTCOME_LABELS[outcome]}
          value={<OutcomeFigure slice={sliceOf(outcomes, outcome)} denominator={denominator} />}
        />
      ))}
    </Tally>
  );
}
