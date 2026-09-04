import Link from "next/link";
import type {
  AlertSeverity,
  AttentionKind,
  AttentionState,
  PeriodPreset,
} from "@observer/readmodels";

import { Evidence, Sample, Sources, Tier } from "@/components/product";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * THE RAISED STATES, WITH EVERYTHING NEEDED TO ARGUE WITH ONE.
 *
 * `AttentionList` in `components/product` renders an `AlertItem`: a title, a
 * detail, an evidence reference and an action. That is the right shape for the
 * alerts an overview carries, and it is not the shape of this screen.
 *
 * An `AttentionState` is an `AlertItem` **plus four facts the operational
 * surface cannot drop**, and dropping any one of them would break a rule the
 * product is built on:
 *
 *   subjects            what the state is actually about — the units, the
 *                       meetings, the installations. Without them the reader is
 *                       told a number and given nowhere to go with it, and the
 *                       screen stops reading as a building and starts reading
 *                       as a monitoring console.
 *   tier and sources    provenance is two axes and they never merge. A state
 *                       drawn from an observed sequence and a state drawn from
 *                       a statistical association are different claims, and the
 *                       second one is the one a reader is entitled to doubt.
 *   sampleSize          no verdict without a sample size.
 *   belowMinimum        below the minimum there is no verdict, NO RANK and no
 *                       trend. This component is the one place that rule can be
 *                       broken on this screen, since a ranked list of units is
 *                       the most persuasive thing the product can draw and the
 *                       easiest one to draw from four meetings. So the rank is
 *                       printed only when the state carries the sample to
 *                       support it, and the shortfall is printed in its place
 *                       when it does not.
 *
 * So this is a sibling of `AttentionList` rather than a replacement for it, and
 * the empty case is deliberately NOT handled here: a screen with nothing raised
 * renders `AttentionList` with an empty array, which draws the result panel the
 * design system reserves for "nothing needs attention". Two components drawing
 * two different empty states is how a product ends up with two answers to the
 * same question.
 */

/**
 * Two vocabularies for three levels, met in one place.
 *
 * `ALERT_SEVERITIES` is `critical | warning | info`; `observer-product.css` §12
 * draws `data-severity="critical" | "attention" | "info"`. `Attention.tsx` in
 * the product layer holds the same map and does not export it, so it is
 * repeated here rather than reached into — and the repetition is reported
 * upward rather than resolved by exporting it from a file this brief does not
 * own.
 *
 * The severity itself is never chosen here. `ATTENTION_KIND_DEFINITIONS` caps
 * each kind at the loudest it may ever reach, the read model clamps to that
 * ceiling, and red is left for a fact going missing from the record right now.
 */
const SEVERITY: Readonly<Record<AlertSeverity, string>> = {
  critical: "critical",
  warning: "attention",
  info: "info",
};

/**
 * WHAT EACH STATE'S SAMPLE SIZE IS A SAMPLE OF.
 *
 * `Sample` takes a noun and has no default, on the reasoning that the
 * denominator of a rate over meetings and the denominator of a rate over units
 * are different questions. `AttentionState` carries `sampleSize` and
 * `minimumSampleSize` and no noun for them, so the six words live here, keyed
 * by kind so that adding a seventh check is a type error rather than a silently
 * unlabelled figure.
 *
 * Each one is the denominator the read model actually counted, not a guess:
 * the follow-up state counts the meetings that shortlisted something, the two
 * unit states count observations, the verification state counts presentations,
 * and the source state counts the installations listed on the project. Printing
 * "meetings" against all six would be a false denominator on four of them,
 * which is worse than a verbose map.
 *
 * This is reported as a gap: `AttentionState` should carry its own noun, the
 * way `MetricValue` carries its own `qualifier`, so that a change to what a
 * check counts cannot leave this file describing the old thing.
 */
const SAMPLE_NOUNS: Readonly<Record<AttentionKind, string>> = {
  high_interest_no_follow_up: "meetings that shortlisted a unit",
  demand_dropping: "baseline observations",
  crm_verification_missing: "presentations",
  source_offline: "sources on this project",
  analytics_queue_pressure: "observations",
  viewed_never_shortlisted: "observations",
};

export function StateList({
  states,
  period,
  label = "States raised in this period",
}: {
  /** Already ranked by the read model: severity first, then size. */
  readonly states: readonly AttentionState[];
  readonly period: PeriodPreset;
  readonly label?: string;
}) {
  return (
    <ul className="ox-attention" aria-label={label}>
      {states.map((state) => (
        <li
          className="ox-alert"
          key={state.alert.id}
          data-severity={SEVERITY[state.alert.severity]}
        >
          <div>
            <h3 className="ox-alert-title">{state.alert.title}</h3>
            <p className="ox-alert-detail">{state.alert.detail}</p>

            {/*
             * WHAT IT IS ABOUT, NAMED.
             *
             * The read model caps this at five, and the cap is not restated as
             * "and more" — there is no count of the remainder on the state, and
             * inventing one would be a figure with nothing behind it. Each
             * subject that has a route is a link, and each that does not is
             * plain text: a chip that looks identical to its neighbours and
             * does nothing when pressed is the control-that-does-nothing the
             * doctrine forbids, and it is worst in a row where the others move.
             */}
            {state.subjects.length === 0 ? null : (
              <div className="ox-alert-foot">
                <ul className="ox-chipset" aria-label={`What this is about: ${state.alert.title}`}>
                  {state.subjects.map((subject) => (
                    <li key={subject.id}>
                      {subject.href === null ? (
                        <span className="ox-n">{subject.label}</span>
                      ) : (
                        <Link
                          className="ox-toggle"
                          href={dynamicRoute(withPeriod(subject.href, period))}
                        >
                          {subject.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="ox-alert-foot">
              <Tier tier={state.tier} />
              <Sources sources={state.sources} />
              <Evidence evidence={state.alert.evidence} period={period} />

              {state.belowMinimum ? (
                /*
                 * The raw figure and how far short it falls, and no rank beside
                 * it. A state worth naming from eleven observations is still
                 * worth naming; calling it the second most important thing on
                 * the project is the part that is not supported.
                 */
                <span className="ox-shortfall">
                  {state.sampleSize} of {state.minimumSampleSize} {SAMPLE_NOUNS[state.kind]} —
                  stated, not ranked
                </span>
              ) : (
                <>
                  <Sample n={state.sampleSize} noun={SAMPLE_NOUNS[state.kind]} />
                  <span className="ox-n">
                    Rank {state.rank} of {states.length}
                  </span>
                </>
              )}
            </div>
          </div>

          {/*
           * The action, where the read model has a surface to send the reader
           * to. `actionLabel` and `actionHref` are independently nullable, and a
           * label with no route is drawn as nothing rather than as a control:
           * the sentence in `detail` has already said what needs doing.
           *
           * Only a critical state takes the filled treatment. There is one loud
           * control on this screen at most, and it belongs to the state that is
           * losing data while the reader looks at it.
           */}
          {state.alert.actionHref === null || state.alert.actionLabel === null ? null : (
            <Link
              className="ox-btn"
              {...(state.alert.severity === "critical" ? { "data-weight": "primary" } : {})}
              href={dynamicRoute(withPeriod(state.alert.actionHref, period))}
            >
              {state.alert.actionLabel}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
