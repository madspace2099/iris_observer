import type { MeetingReplay, PeriodPreset, ReplayStep } from "@observer/readmodels";

import { Tally, TallyItem, Timeline, type TimelineStep } from "@/components/product";
import { STEP_EVENTS, STEP_LABEL_NAMES_ENTITY } from "./vocabulary";

/**
 * THE VISITOR JOURNEY — one meeting, in the order it happened.
 *
 * The chronology the product exists to be able to show: the presentation
 * entered a section, a unit was opened inside it, a floor plan came up, the
 * unit was shortlisted, two units were compared, a screenshot was taken, and at
 * the end an outcome was recorded. Every row states what was recorded, and no
 * row states that one step produced the next. That restraint is the whole
 * reason a buyer's journey is publishable at all: "the floor plan was opened,
 * then the unit was shortlisted" is an observed sequence, and the same two
 * facts joined by a causal word would be a claim Observer does not make at any
 * sample size (ADR-0010).
 *
 * ## What this returns, and why it is not wrapped
 *
 * The inside of a paper plate and nothing else. Every line of it is a reading —
 * a time, a section name, a unit code, a count of sections entered — which is
 * precisely what ADR-0034 puts on the measured ground. What is CONCLUDED from
 * the journey, including the statement that its timing was never captured,
 * stays on graphite above it, and the page owns that seam.
 *
 * ## The honest branch: a sequence that is real and a pacing that is not
 *
 * `MeetingReplay.timingAvailable` is false for a legacy import, which recorded
 * the order of a presentation without recording its clock. The old replay
 * surface handled that well and the handling is preserved rather than
 * reinvented: the steps are still drawn, in their true order, and the times are
 * simply absent. `Timeline` leaves a blank where a time would be and says "Time
 * not recorded" to a screen reader, which is the treatment the design system
 * asks for — an em dash in a time column reads as a time somebody forgot to
 * fill in, and this is not that.
 *
 * Even on a fully timed session most rows carry no time. Only section entries
 * are timestamped; the interactions inside a section are recorded as having
 * happened during it, and the replay's own `gaps` say so in words on the page.
 * That is the source's limit, stated once, rather than eleven repetitions of
 * "time not recorded" beside eleven rows.
 *
 * ## Nothing here is counted
 *
 * Every figure below arrives resolved from the read model: `sectionsReached`,
 * `sectionsTotal` and `medianDepth` are `PresentationCoverage` computed over
 * this one session, and `durationDisplay` is already formatted for the
 * project's locale. No step is filtered, summed or measured in this file
 * (ADR-0012); a number this screen wants and the read model does not return is
 * reported as a missing read model rather than produced with a `.reduce()`.
 */

/**
 * One replay step, in the shape the timeline draws.
 *
 * The label is the EVENT and the ENTITY together — "Unit opened · A-0304",
 * "Section entered · Residences" — which is what turns a list of records into a
 * journey a reader can follow without a legend. Where the read model's own
 * label already names the act, it is used verbatim; see
 * {@link STEP_LABEL_NAMES_ENTITY} for why that is a table and not a rule.
 *
 * `channel` is deliberately not set. `Timeline` draws a hollow mark on the
 * spine for a WEB IRIS step, and `ReplayStep` carries no channel — the whole
 * meeting ran on one surface and the replay read model does not say which. It
 * is left unset rather than guessed, and reported.
 */
function toTimelineStep(step: ReplayStep): TimelineStep {
  const label = STEP_LABEL_NAMES_ENTITY[step.kind]
    ? `${STEP_EVENTS[step.kind]} · ${step.label}`
    : step.label;

  /*
   * `dwellDisplay` means a slightly different span on a section step and on a
   * unit step — time in the section, and the longest single view — so it is
   * given the one word that is true of both rather than a precise label that
   * would be wrong on one of them.
   *
   * It is dropped entirely when the read model has already written the same
   * figure into `detail`, which happens on any unit opened exactly once: its
   * total dwell and its longest single view are then the same span, and
   * "1 view · 3m 28s · 3m 28s recorded" reads as a rendering fault rather than
   * as two measurements that happen to agree. Nothing is recomputed to decide
   * that — the two strings are compared as strings, and the figure survives
   * wherever they differ.
   */
  const dwell =
    step.dwellDisplay === null || (step.detail ?? "").includes(step.dwellDisplay)
      ? null
      : `${step.dwellDisplay} recorded`;

  const parts = [
    step.isReturn ? "Returned to a section already shown" : null,
    step.detail,
    dwell,
  ].filter((part): part is string => part !== null && part.length > 0);

  return {
    id: `${step.ordinal}`,
    when: step.atDisplay,
    label,
    detail: parts.length === 0 ? null : parts.join(" · "),
    evidence: step.evidence,
    sources: step.sources,
  };
}

export function MeetingJourney({
  replay,
  period,
}: {
  readonly replay: MeetingReplay;
  readonly period: PeriodPreset;
}) {
  const { coverage } = replay;

  /*
   * Every element below is a DIRECT child of the plate, rather than grouped
   * into a wrapper per subhead.
   *
   * `.ox-plate-inner` is a flex column on the system's 28px rhythm and a plain
   * wrapper `div` is not: children of a bare div have no margins in this sheet
   * and would touch. The design system has no "a label and the block it labels"
   * grouping class, and inventing one here is not this file's to do, so the
   * whole plate sits on one rhythm and every subhead is a sibling of the thing
   * it heads. The gap is reported.
   */
  return (
    <>
      <p className="ox-subhead">How much of the story was told</p>

      <Tally>
        {/*
         * A denominator may dim and may never be dropped. "7 of 12" is one
         * figure, not a figure beside a footnote, which is why the count and
         * its total are one `.ox-value` rather than two cells.
         */}
        <TallyItem
          label="Sections entered"
          value={
            <span className="ox-value">
              <span className="ox-figure">{coverage.sectionsReached}</span>
              <span className="ox-of">of {coverage.sectionsTotal} in the story</span>
            </span>
          }
        />
        <TallyItem
          label="Steps in the running order"
          value={
            <span className="ox-value">
              <span className="ox-figure">{coverage.medianDepth}</span>
              <span className="ox-of">entries, returns included</span>
            </span>
          }
        />
        <TallyItem
          label="Length"
          value={
            <span className="ox-value">
              <span className="ox-figure">{replay.durationDisplay}</span>
              {replay.timingAvailable ? null : (
                <span className="ox-of">the session&rsquo;s own, not a sum of steps</span>
              )}
            </span>
          }
        />
      </Tally>

      {coverage.routinelySkipped.length === 0 ? null : (
        <p className="ox-section-note">
          Never opened in this meeting:{" "}
          {coverage.routinelySkipped.map((section) => section.label).join(" · ")}.
        </p>
      )}

      <p className="ox-subhead">The journey, in the order it was recorded</p>

      <Timeline steps={replay.steps.map(toTimelineStep)} period={period} label="Meeting journey" />
    </>
  );
}
