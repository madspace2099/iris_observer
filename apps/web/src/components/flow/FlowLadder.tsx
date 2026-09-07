/**
 * THE LADDER — what survived each step, and what it is not allowed to claim.
 *
 * `observer-product.css` §15 owns the shape: a stage is a label, a bar whose
 * width is its count against the first stage, and a figure group carrying the
 * drop. This component is the only thing in the Sales Flow surface that draws
 * on `.ox-funnel`, and it exists to hold three rules that a page would have to
 * remember every time it laid out a row of stages.
 *
 * ## 1. Only a stage a system of record states may look verified
 *
 * `.ox-stage[data-verified="true"]` paints the fill with `--ox-human-mark`, the
 * blue that in this system means *a person decided this, and a person can change
 * it*. `docs/adr/0021` and `readmodels/screens.ts` (`FUNNEL_VERIFICATIONS`) draw
 * the line the attribute has to respect: IRIS observing a unit being opened is
 * `observed`; a meeting outcome assigned to one unit among five is `attributed`;
 * only a system of record stating the thing itself is `verified`. So `verified`
 * is a required field on {@link LadderStage} rather than an optional one with a
 * friendly default — a caller has to answer the question, and on the surfaces
 * this ships with the honest answer is `false` everywhere, which is why no stage
 * on Sales Flow currently carries the mark.
 *
 * ## 2. Nothing here computes a measurement
 *
 * Two numbers are derived and both are drawing rather than measurement, and the
 * distinction matters enough to name. The bar's width is `count / first`, which
 * is the geometry of a bar and not a figure the reader is given. The drop is
 * `previous.count - count`, a difference between two counts the read model
 * supplied, printed so that "where they stopped" is a number rather than an
 * angle the reader has to estimate. Every RATE on the ladder — the share of the
 * group that did a thing, and the same share among everybody else — arrives
 * pre-formatted from the read model, so this file never divides to produce a
 * percentage and never touches a locale. ADR-0012 holds.
 *
 * ## 3. A ladder is a sequence and never a cause
 *
 * The stages narrow. That is survival, not consequence, and no string this
 * component writes says otherwise: the drop is stated as a count leaving between
 * two named stages. The sentence explaining what a group had in common belongs
 * to the read model's own disclaimer, which the page prints on graphite beneath
 * the plate.
 *
 * The inline `width` is the one style declaration here, and it is a value being
 * fed to the sheet rather than a rule being written around it — the same shape
 * as `--ox-heat` on a stacking-plan cell. `.ox-stage-fill` declares no width
 * hook, so the proportion has nowhere else to arrive; that gap is reported.
 */

export interface LadderStage {
  readonly id: string;
  readonly label: string;
  /** Meetings that reached this stage and every stage above it. */
  readonly count: number;
  /**
   * True only where a system of record states this stage about this cohort.
   * Never inferred from an outcome an agent typed at the end of a meeting.
   */
  readonly verified: boolean;
  /** This step on its own, already formatted by the read model. */
  readonly rate: string | null;
  /** The same step among the comparison group, already formatted. */
  readonly comparisonRate: string | null;
  /**
   * One more line the read model wrote for this rung — time in stage, on the
   * deal ladder — printed under the drop. Optional, because the behaviour
   * funnel has no such figure and must not show an empty line for it.
   */
  readonly meta?: string | null;
}

export function FlowLadder({
  stages,
  noun,
  comparisonLabel = null,
}: {
  readonly stages: readonly LadderStage[];
  /** What the counts count — "meetings", "units". Never guessed. */
  readonly noun: string;
  /**
   * Present when the stages carry a comparison rate, so that the word
   * "elsewhere" beside each one has something to mean. The page prints the
   * group's own name and count beneath the ladder rather than repeating it on
   * every line, which is the same argument the primitive layer makes for
   * stating a baseline once instead of beside twelve figures.
   */
  readonly comparisonLabel?: string | null;
}) {
  const top = stages[0];
  if (top === undefined) return null;

  /*
   * The denominator, and the guard on it.
   *
   * A cohort of zero is a real answer, and dividing by it is not. The floor of
   * one leaves every bar at zero width, which is what a group with nothing in
   * it should look like.
   */
  const first = Math.max(1, top.count);

  const summary = stages.map((stage) => `${stage.label}: ${stage.count}`).join("; ");

  return (
    <div className="ox-funnel">
      {/*
       * The whole ladder as one sentence, for a reader who is not looking at
       * the bars. Six bars walked one at a time teach a screen-reader user the
       * shape of nothing; the counts in order are the finding.
       */}
      <p className="ox-sr">
        {noun} at each step, in order. {summary}.
      </p>

      {stages.map((stage, index) => {
        const previous = stages[index - 1];
        const lost = previous === undefined ? null : previous.count - stage.count;

        return (
          <div
            className="ox-stage"
            key={stage.id}
            {...(stage.verified ? { "data-verified": "true" } : {})}
          >
            <span className="ox-stage-label">{stage.label}</span>

            <span className="ox-stage-bar">
              <span
                className="ox-stage-fill"
                style={{ width: `${((stage.count / first) * 100).toFixed(1)}%` }}
              />
            </span>

            <span className="ox-stage-figures">
              <span className="ox-figure">{stage.count}</span>
              <span className="ox-of">
                of {top.count} {noun}
              </span>

              {stage.rate === null ? null : (
                <span className="ox-stage-drop">
                  {stage.rate} on its own
                  {stage.comparisonRate === null || comparisonLabel === null
                    ? null
                    : ` · ${stage.comparisonRate} elsewhere`}
                </span>
              )}

              {previous === undefined || lost === null ? null : (
                <span className="ox-stage-drop">
                  {lost === 0
                    ? `none left after ${previous.label}`
                    : `−${lost} after ${previous.label}`}
                </span>
              )}

              {stage.meta === undefined || stage.meta === null ? null : (
                <span className="ox-stage-drop">{stage.meta}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
