import type { FunnelStep, PeriodPreset } from "@observer/readmodels";

import { Evidence, Figure } from "@/components/product";

/**
 * THE FUNNEL, DRAWN AS THE STYLESHEET DEFINES IT AND CLAIMING NOTHING.
 *
 * `observer-product.css` §15 owns this shape — `.ox-funnel`, `.ox-stage`, and
 * the bar whose width is a stage's count against the first stage. It is used
 * here rather than the older `Funnel` in `@/showroom/charts2` for two reasons:
 * that component draws `.iris-*` classes from a different stylesheet, which
 * would put two dialects on one screen, and it takes a plain `count` where this
 * takes the `MetricValue` the read model actually returns.
 *
 * The `MetricValue` is the whole point. `AgentDetailView.funnel` returns five
 * `FunnelStep`s and the last two need a CRM; on a project with none they arrive
 * `unavailable`, and `Figure` renders the missing treatment rather than a
 * smaller number. A funnel that quietly drew zero for the two stages nobody can
 * see would show a team whose meetings all die at shortlisting.
 *
 * ## The bar is not drawn when the count is absent
 *
 * A track at zero standing in for an unmeasured quantity is the exact lie the
 * missing treatment exists to prevent, and the stylesheet's own consequence
 * list says a track is not drawn at all when the value is absent. `toCount` is
 * null on every stage the CRM would have had to answer, so those stages have a
 * label, a figure that says "Unavailable", and no bar.
 *
 * ## Nothing here says one stage produced the next
 *
 * The drop between two stages is printed as a count rather than left to be read
 * off an angle, and the word beside it is "of", which is a fraction. A funnel
 * is a sequence of observed states, and Observer produces no causal claim at
 * any sample size (ADR-0010). `data-verified` is deliberately never set: the
 * stylesheet reserves it for a stage a system of record stands behind, and
 * `FunnelStep` carries no verification axis to read that from — which is
 * reported as a gap rather than guessed at from whether a CRM happens to be
 * connected.
 */
export function StageFunnel({
  steps,
  period,
  label,
}: {
  readonly steps: readonly FunnelStep[];
  readonly period: PeriodPreset;
  /** The accessible name of the list of stages. */
  readonly label: string;
}) {
  if (steps.length === 0) return null;

  /*
   * The scale is the first stage's own count, which is what the sheet
   * specifies. It can be null — a project whose first stage cannot be measured
   * has no scale — and every bar is then withheld rather than drawn against an
   * invented one.
   */
  const base = steps[0]?.toCount ?? null;

  /*
   * A div with an explicit list role rather than an `<ol>`.
   *
   * `.ox-funnel` declares no `list-style`, no margin reset and no padding
   * reset, so an `<ol>` wearing it arrives with the user agent's 40px indent
   * and a column of numbers down the left — and a numbered funnel is a ranking
   * of its own stages. The roles keep the semantics a list gives assistive
   * technology without the markers, which is the same trade `.ox-findings`
   * makes one section earlier in the stylesheet.
   */
  return (
    <div className="ox-funnel" role="list" aria-label={label}>
      {steps.map((step) => {
        const drawable = base !== null && base > 0 && step.toCount !== null;
        const width = drawable ? Math.min(100, ((step.toCount ?? 0) / base) * 100) : 0;

        return (
          <div className="ox-stage" role="listitem" key={step.metric.metricId}>
            <span className="ox-stage-label">{step.label}</span>

            {drawable ? (
              <span className="ox-stage-bar">
                {/*
                 * An inline width, and the one place this screen writes a
                 * geometric value into markup. `.ox-stage-fill` declares its
                 * height, radius and ink and no width, so a proportion has
                 * nowhere else to arrive; a `--ox-share` custom property
                 * consumed by the sheet would feed it the way `--ox-heat` feeds
                 * the stacking plan, and the absence of one is reported.
                 */}
                <span className="ox-stage-fill" style={{ width: `${width.toFixed(1)}%` }} />
              </span>
            ) : (
              <span />
            )}

            <span className="ox-stage-figures">
              <Figure value={step.metric} />

              {/*
               * The denominator is printed ONCE.
               *
               * `MetricValue.qualifier` already reads "of 14" on every stage the
               * read model could measure, and `Figure` draws it as part of the
               * figure — a denominator may dim and may never be dropped, so the
               * two are one figure rather than a figure and a footnote. Printing
               * `fromCount` beside that produced "14 of 14 of 14" on the first
               * screen this was rendered on. The count is drawn here only where
               * the figure carries no qualifier of its own, which is where the
               * metric came back empty.
               */}
              {step.metric.qualifier === null && step.fromCount !== null ? (
                <span className="ox-stage-drop">of {step.fromCount}</span>
              ) : null}

              {/*
               * And the evidence line only where there is a reference. `Evidence`
               * states "No evidence" for a null, which is right beside a single
               * claim and wrong five times down one column: a repeated absence
               * is stated once for its region, which is the surface's job.
               */}
              {step.metric.evidence === null ? null : (
                <Evidence evidence={step.metric.evidence} period={period} />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
