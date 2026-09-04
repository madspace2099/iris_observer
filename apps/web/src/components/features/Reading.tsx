import { shareDisplay, stayDisplay } from "./vocabulary";

/**
 * READINGS — one measured figure, at the weight its surroundings call for.
 *
 * `Figure` in `@/components/product/Metric` is the component every number on
 * every screen should pass through, and it takes a `MetricValue`: a state, a
 * formatted display, a sample size, a minimum, a comparison. `SectionUsage`
 * carries none of that. It publishes raw counts, raw shares and a raw duration,
 * so a features screen has a choice between building a `MetricValue` in the
 * page — fabricating a read-model shape, and formatting inside a component in
 * exactly the way `Metric.tsx` argues against — or composing the stylesheet's
 * own treatments directly. It composes them.
 *
 * That is reported as a gap rather than treated as a licence. What is NOT given
 * up in the trade is the treatment itself: {@link Absent} renders
 * `.ox-value[data-missing="true"]`, which is the sheet's four-changes-at-once
 * missing mark — size, weight, ink and a bar in front — and it is the same mark
 * `Figure` draws for `unavailable` and `error`. An absent reading on this
 * screen and an absent metric on any other look identical, which is the only
 * property that actually had to survive.
 *
 * ## Two weights, and why
 *
 * A register cell is body text. `.ox-value` sets 19px semibold, which is right
 * for a tally at the top of a screen and wrong for the fifth column of a
 * nine-row table — sixty-three figures at 19px is a wall. So a present reading
 * inside the register is plain text in the cell's own size, and only the ABSENT
 * one takes `.ox-value`, whose `data-missing` rule drops it back to body size
 * anyway. The result is that an absence is the loudest thing in the column,
 * which is precisely the intent.
 *
 * {@link KeyCount} is the other weight, for the figures in the head plane.
 */

/**
 * A count, and the denominator it is a count out of.
 *
 * `of` is optional and its absence is a statement: `opens` is a count of
 * entries into a feature and there is no total number of entries to be a
 * fraction of, whereas `meetings` is 34 OF 74 presentations and printing the 34
 * alone would be a figure the reader cannot size. Where a denominator exists it
 * is passed, and the sheet dims it rather than dropping it.
 */
export function Count({ n, of = null }: { readonly n: number; readonly of?: number | null }) {
  return (
    <>
      {n}
      {of === null ? null : <span className="ox-of"> of {of}</span>}
    </>
  );
}

/** The same count at tally weight, for the figures above the register. */
export function KeyCount({ n, of = null }: { readonly n: number; readonly of?: number | null }) {
  return (
    <span className="ox-value">
      <span className="ox-figure">{n}</span>
      {of === null ? null : <span className="ox-of">of {of}</span>}
    </span>
  );
}

/**
 * A share, as whole percent.
 *
 * It carries no denominator of its own on purpose. Every share on this screen
 * sits in a row whose reach column states what it is a share of, and the table
 * caption states it again in words. A percentage that has absorbed its own
 * denominator is a figure nobody can check.
 */
export function Rate({ share }: { readonly share: number }) {
  return <>{shareDisplay(share)}</>;
}

/** A median stay, in the read model's own duration convention. */
export function Stay({ seconds }: { readonly seconds: number }) {
  return <>{stayDisplay(seconds)}</>;
}

/**
 * THERE IS NO READING HERE, AND WHICH KIND OF NOTHING IT IS.
 *
 * `word` is what the reader sees — "Not reached", "Not timed" — and it is
 * required rather than defaulted, because the two absences on this screen lead
 * to opposite conclusions: one says the presentation never went there, the
 * other says the instrument cannot see it. A component that guessed would
 * guess wrong on exactly the rows where the distinction is the finding.
 *
 * `reason` reaches a sighted reader on hover and a screen-reader user in the
 * cell itself. It is short because the full statement belongs to the region:
 * `Unavailable` from the product layer states it ONCE with one action, which is
 * the shape `docs/12-visual-autopsy.md` §9 records after four panels in one
 * viewport each repeated "The CRM is not connected".
 */
export function Absent({ word, reason }: { readonly word: string; readonly reason: string }) {
  return (
    <span className="ox-value" data-missing="true" title={reason}>
      {word}
      <span className="ox-sr"> — {reason}</span>
    </span>
  );
}
