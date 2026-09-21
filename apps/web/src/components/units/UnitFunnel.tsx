import type { CSSProperties } from "react";
import type { FunnelVerification, UnitFunnelStage } from "@observer/readmodels";

import { Figure, Sources, Tier } from "@/components/product";

/**
 * ONE UNIT'S FUNNEL, AND THE ONE THING IT IS FORBIDDEN TO SAY.
 *
 * Viewed → shortlisted → follow-up → offer → reservation → purchase, for a
 * single apartment. Six stages, four of which this product can only partly
 * answer, and the whole design of the component is about making that visible
 * rather than smoothing it over.
 *
 * ## Only a verified stage may look verified
 *
 * `FunnelVerification` separates four things a screen would otherwise draw
 * identically:
 *
 *   observed     IRIS watched the act itself happen to this unit.
 *   attributed   joined to a meeting outcome, in which four other flats were
 *                also open. It is an association with this unit, not a result
 *                of it.
 *   verified     a system of record states it about this unit.
 *   unavailable  no source in this product can answer the stage at all.
 *
 * `observer-product.css` §15 gives exactly one of them a treatment —
 * `.ox-stage[data-verified="true"] .ox-stage-fill` takes the human mark — and
 * this component sets that attribute for `verified` and for nothing else. A
 * shortlist is the strongest signal the showroom produces and it is still not a
 * sale; drawing the two the same way is how a presentation record ends up
 * standing in for a contract, which ADR-0021 refuses from the other direction.
 *
 * ## No stage claims the next one
 *
 * The label under a pair is a sequence and never a mechanism. `basis` is the
 * read model's own sentence about how far each stage may be trusted, rendered
 * verbatim — the causal-language guard runs over the read models, so a
 * component that composed its own explanation would be prose nothing checks.
 *
 * ## A track is not drawn when there is nothing to draw
 *
 * `FunnelStep.toCount` is null for the stages no source can answer. The
 * stylesheet's rule is that a proportion is never drawn at zero to stand in for
 * an unmeasured quantity, so those stages get no bar at all rather than an
 * empty one: an empty track and a track at zero look identical, and only one of
 * them is true.
 *
 * ## Why the widths are inline
 *
 * `.ox-stage-fill` declares no width and no custom property to feed one, so the
 * proportion arrives as an inline width. That is a value going into the system
 * rather than a style routing around it — the same shape as `--ox-heat` on the
 * stacking plan — and it is reported as a gap: a `--ox-fill` consumed by the
 * sheet would say the same thing without an inline declaration.
 */

/**
 * How well the stage is known, in the reader's words.
 *
 * Deliberately worded so that none of these can be mistaken for the tier chip
 * beside it. The tier says how strong the CLAIM is — Observed, Attributed,
 * Pattern — and this says which SOURCE stands behind this particular stage for
 * this particular flat. Two axes, kept apart, exactly as the provenance layer
 * keeps tier and source apart.
 */
const VERIFICATION_WORDS: Readonly<Record<FunnelVerification, string>> = {
  observed: "IRIS saw it",
  attributed: "assigned to the meeting",
  verified: "stated by the catalogue",
  unavailable: "no source",
};

export function UnitFunnel({
  stages,
  label = "From opened to sold",
}: {
  readonly stages: readonly UnitFunnelStage[];
  /** The accessible name of the funnel. */
  readonly label?: string;
}) {
  if (stages.length === 0) return null;

  /*
   * The denominator is the first stage, as §15 requires, and it is read off the
   * read model rather than derived from the rows: `fromCount`/`toCount` are
   * counts the projection already produced. Nothing here computes a rate — the
   * rate is inside `step.metric`, already formatted, and this component draws a
   * width from two integers so the six bars share one scale.
   */
  const first = stages[0]?.step.toCount ?? null;

  return (
    <div className="ox-funnel" role="group" aria-label={label}>
      {stages.map((stage) => {
        const { step } = stage;
        const drawable = first !== null && first > 0 && step.toCount !== null;
        const width = drawable ? `${Math.min(100, ((step.toCount ?? 0) / first) * 100)}%` : null;

        return (
          <div
            className="ox-stage"
            key={stage.id}
            {...(stage.verification === "verified" ? { "data-verified": "true" } : {})}
          >
            <span className="ox-stage-label">{step.label}</span>

            <div>
              {width === null ? null : (
                <div className="ox-stage-bar">
                  <div className="ox-stage-fill" style={{ width } as CSSProperties} />
                </div>
              )}
              {/*
               * `.ox-time-detail` and `.ox-time-foot` rather than a pair of
               * funnel-specific classes, which the sheet does not have: a
               * funnel stage IS a step in a sequence, the two classes carry the
               * quiet caption ink and the rhythm this needs, and inventing
               * `.ox-stage-basis` would be one author adding a dialect to a
               * design system with one owner.
               */}
              <p className="ox-time-detail">{stage.basis}</p>
              {/*
               * Tier and source, and no evidence line.
               *
               * `UnitFunnelStage.step.metric` carries no `EvidenceRef` on any
               * of the six stages, and `Evidence` says "No evidence" in words
               * rather than rendering nothing — which is right beside a single
               * claim and wrong six times in one panel, where it would read as
               * six failures rather than as one shape of read model. The
               * screen states the view's own reference once for the region
               * instead, and the missing per-stage reference is reported.
               */}
              <div className="ox-time-foot">
                <Tier tier={stage.tier} />
                <Sources sources={stage.sources} />
              </div>
            </div>

            <div className="ox-stage-figures">
              <Figure value={step.metric} />
              <span className="ox-stage-drop">{VERIFICATION_WORDS[stage.verification]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
