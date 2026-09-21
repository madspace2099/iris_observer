import type { DemandTrend } from "@observer/readmodels";

/**
 * READINGS THAT ARE NOT `MetricValue`, AND THE HONESTY THEY STILL OWE.
 *
 * `Figure` in `components/product/Metric.tsx` is the figure of record for this
 * product: it takes a `MetricValue` and renders whichever of the five states it
 * arrived in. Every screen that can use it must.
 *
 * This screen cannot use it for most of what it shows, and that is a property of
 * the read models rather than a preference. `ProjectView`, `ProjectCharts` and
 * `ProjectPulse` return no `MetricValue` anywhere: `ProjectPulse.totals` is six
 * bare numbers, `ProjectView.meetingCount` is a bare number, and
 * `SegmentInterest` carries five bare 0–1 ratios. So there is no `state`, no
 * `comparison`, no `sampleSize`, no per-figure `evidence` and no `display` on
 * any of them. That gap is REPORTED rather than papered over, and until it
 * closes the figures on this screen still owe the reader the same three things
 * a `MetricValue` would have carried, which is what this file supplies:
 *
 *   a denominator     — `of`, rendered in `.ox-of`, which may dim and may never
 *                       be dropped. A count with nothing to divide it by is the
 *                       thing the page rules forbid outright.
 *   a real zero       — `note`, shown beside the figure when the count is zero,
 *                       because "0" alone is exactly the ambiguity the four
 *                       absence states exist to remove. A zero here is always
 *                       genuine: it is a catalogue count or a meeting count, so
 *                       it is `empty` and never `unavailable`.
 *   a sample floor    — `shortfall`, which switches the whole figure to the
 *                       `.ox-insufficient` treatment: the raw number in
 *                       secondary ink with how far short it falls beside it, and
 *                       no verdict, no rank and no trend anywhere near it.
 *
 * NOTHING HERE COMPUTES ANYTHING. Every number passed in came off a read model
 * whole; this file chooses a shape for it and formats it, which is the one thing
 * a component is allowed to do with a figure (ADR-0012).
 */

/**
 * One count, with the denominator it is not allowed to appear without.
 *
 * The three shapes are mutually exclusive and are chosen in the order of how
 * badly the reader would be misled without them: an insufficient sample first,
 * because a number below its floor must never be read as a verdict; then a
 * genuine zero, because a bare zero is unreadable; then the ordinary reading.
 */
export function Count({
  value,
  of = null,
  note = null,
  shortfall = null,
}: {
  readonly value: number;
  /** The denominator, in words. "of 48 apartments", "of 132 meetings". */
  readonly of?: string | null;
  /** What a zero means here. Shown only when the count is genuinely zero. */
  readonly note?: string | null;
  /** How far short of the sample floor this figure falls, in the policy's words. */
  readonly shortfall?: string | null;
}) {
  if (shortfall !== null) {
    return (
      <span className="ox-insufficient">
        <span className="ox-figure">{value}</span>
        <span className="ox-shortfall">{shortfall}</span>
      </span>
    );
  }

  /*
   * A zero states itself. `.ox-value` at full size and full weight, because a
   * real zero is an answer and the missing treatment would say the opposite —
   * that the number could not be produced.
   */
  const qualifier = value === 0 && note !== null ? note : of;

  return (
    <span className="ox-value">
      <span className="ox-figure">{value}</span>
      {qualifier === null ? null : <span className="ox-of">{qualifier}</span>}
    </span>
  );
}

/**
 * One share of a whole, with the whole named beside it.
 *
 * The same discipline as {@link Count} and for the same reason: `of` is not
 * optional in practice, because "38%" with no statement of what the hundred
 * per cent was is the shape a reader silently supplies their own denominator
 * for. `SegmentInterest` carries five of these ratios and no words for any of
 * them, so the words are the caller's and they are required at the call site.
 */
export function Ratio({
  value,
  of,
  locale,
}: {
  readonly value: number;
  /** What the whole is. "of every shortlisting in the period." */
  readonly of: string;
  readonly locale: string;
}) {
  return (
    <span className="ox-value">
      <span className="ox-figure">{shareText(value, locale)}</span>
      <span className="ox-of">{of}</span>
    </span>
  );
}

/**
 * A 0–1 ratio, formatted in the project's own locale.
 *
 * The locale is required and there is no default. `MetricValue.display` exists
 * precisely because currency, percentages and separators depend on the
 * project's locale and currency, and a component that reached for `toFixed` or
 * a bare `%` would format one way here and another way on the next screen. The
 * read models this screen draws on hand over raw ratios instead, so the
 * formatting happens once, here, against the locale the project carries.
 *
 * ## A present value never rounds to zero
 *
 * Whole percentages are the right resolution for a share of attention, and they
 * have one failure this product cannot accept: 0.004 formats as "0%", which
 * renders something that was observed as something that was not. That is the
 * absent-value-as-zero rule broken by a rounding mode. A share that is real but
 * below the resolution is therefore printed as "less than 1%", which is both
 * true and visibly a different statement from a genuine zero — and a genuine
 * zero still prints as "0%", because a real zero is a real answer.
 */
export function shareText(value: number, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  if (value > 0 && value < 0.005) return `<${format.format(0.01)}`;
  return format.format(value);
}

/**
 * A count and the noun it counts, agreeing in number.
 *
 * "1 meetings" is the kind of detail that makes a reader trust the figure
 * beside it slightly less, and it is written in enough places on this screen —
 * every chart summary, every ranked row's subtitle — that spelling it inline
 * each time would eventually get one of them wrong.
 */
export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The three words `DemandTrend` can take, so no caller spells one for itself. */
const TREND_WORDS: Readonly<Record<DemandTrend, string>> = {
  rising: "rising",
  flat: "flat",
  falling: "falling",
};

/**
 * WHICH WAY A UNIT'S DEMAND IS MOVING — and the one case where the sheet's
 * hard-coded direction is right.
 *
 * `.ox-delta[data-direction]` paints up in the good ink and down in the poor
 * one, with a triangle in front so the direction survives greyscale and the one
 * man in twelve who cannot separate the two hues. `Metric.tsx` reports that
 * mapping as a gap because it is wrong wherever `better === "down"`.
 *
 * Here it is right, and unambiguously so: more buyer attention on a unit that
 * is still for sale is better, less is worse. So the attribute is emitted, the
 * glyph and the hue are both correct, and nothing false reaches the screen.
 *
 * `flat` gets no attribute and no glyph, because a flat reading is neither and
 * drawing it in a status colour would invent a verdict.
 *
 * ## The sample floor is enforced by the caller, not here
 *
 * "Below the minimum sample there is no verdict, no rank and no TREND" is the
 * third page rule, and a trend arrow is the purest form of the thing it
 * forbids. The observation count that clears or fails that floor is
 * `PulseUnit.meaningfulViews`, which this component does not receive — the
 * caller checks it against `UNIT_MIN_SAMPLE` and renders the shortfall instead
 * of calling this at all.
 */
export function TrendMark({ trend }: { readonly trend: DemandTrend }) {
  if (trend === "flat") {
    return <span className="ox-delta">flat</span>;
  }
  return (
    <span className="ox-delta" data-direction={trend === "rising" ? "up" : "down"}>
      {TREND_WORDS[trend]}
    </span>
  );
}
