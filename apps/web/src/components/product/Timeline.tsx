import type { EvidenceRef, PeriodPreset, SourceKind } from "@observer/readmodels";
import type { InsightSource } from "@observer/contracts";

import { Evidence, Sources } from "./Provenance";

export interface TimelineStep {
  readonly id: string;
  /**
   * When it happened, already formatted. Null where the source cannot say.
   *
   * `ReplayStep.atDisplay` is nullable for a real reason: the legacy showroom
   * data records the ORDER of a presentation without recording its clock, so a
   * replay built from it has a true sequence and no times. That is a gap in the
   * source, and it is stated rather than filled.
   */
  readonly when: string | null;
  readonly label: string;
  readonly detail?: string | null;
  /**
   * Which feed this step came from. `webiris` is the one the sheet draws
   * differently — a hollow mark on the spine — because online behaviour before
   * anybody was identified is a weaker kind of fact than something the showroom
   * watched happen in the room.
   */
  readonly channel?: SourceKind | null;
  readonly evidence?: EvidenceRef | null;
  readonly sources?: readonly InsightSource[];
}

/**
 * THE TIMELINE — a journey, step by step, on the measured ground.
 *
 * A sequence and nothing more. Every step says what was recorded and when; no
 * step says that one step produced the next. That restraint is the entire
 * reason the product can show a buyer's journey at all: "the buyer opened the
 * floor plan, then shortlisted the unit" is an observed sequence and is
 * publishable; the same two facts joined by "so" would be a causal claim, which
 * Observer does not produce at any sample size (ADR-0010).
 *
 * This belongs inside a `.ox-paper` plate. It is a row of readings — times,
 * labels, what a source recorded — and §3 of the stylesheet puts exactly that
 * kind of dense measured body on paper. The conclusion drawn FROM the timeline
 * stays on graphite above it.
 *
 * ## The spine is one rule, not one border per step
 *
 * The middle grid column is an empty element whose background IS the line, with
 * the mark drawn as a pseudo-element on it. Drawn instead as a left border on
 * each step it would break at every gap and would double at the first and last,
 * which is what the sheet's first-child and last-child gradients exist to
 * prevent. It carries no text, so it is hidden from assistive technology.
 *
 * ## A missing time is empty, not a dash
 *
 * The system's rule is that an absence changes several things at once and is
 * never a punctuation mark standing in for a value. In a column this narrow
 * there is no room for the full missing treatment, so the cell is simply left
 * blank and the fact is stated to a screen reader. A blank is honest; an em
 * dash in a time column reads as a time nobody bothered to fill in.
 */
export function Timeline({
  steps,
  period,
  label = "Sequence",
}: {
  readonly steps: readonly TimelineStep[];
  readonly period: PeriodPreset;
  /** The accessible name of the list. */
  readonly label?: string;
}) {
  if (steps.length === 0) return null;

  return (
    <ol className="ox-time" aria-label={label}>
      {steps.map((step) => {
        const sources = step.sources ?? [];
        const evidence = step.evidence ?? null;
        const detail = step.detail ?? null;
        const channel = step.channel ?? null;

        return (
          <li
            className="ox-time-step"
            key={step.id}
            {...(channel === null ? {} : { "data-channel": channel })}
          >
            <span className="ox-time-when">
              {step.when === null ? <span className="ox-sr">Time not recorded</span> : step.when}
            </span>

            <span className="ox-time-spine" aria-hidden="true" />

            <div className="ox-time-body">
              <p className="ox-time-label">{step.label}</p>
              {detail === null ? null : <p className="ox-time-detail">{detail}</p>}
              {sources.length === 0 && evidence === null ? null : (
                <div className="ox-time-foot">
                  <Sources sources={sources} />
                  {evidence === null ? null : <Evidence evidence={evidence} period={period} />}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
