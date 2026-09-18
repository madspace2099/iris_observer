import Link from "next/link";
import type { AskAnswer, AskFigure, PeriodPreset } from "@observer/readmodels";
import type { InsightSource } from "@observer/contracts";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { Evidence, Sources, Tier } from "@/components/product";
import { isAnswerable } from "./questions";

/**
 * ONE ANSWER, WITH EVERYTHING IT RESTS ON.
 *
 * The anatomy is the one this product has already accepted: the statement, the
 * measurements behind it, what it does not cover, and where to go next. It is
 * rendered here from the read model's own `AskAnswer` — the prose, the figures,
 * the evidence reference, the caveat and the next questions are all written by
 * `packages/synthetic`, and this component adds no sentence of its own to any
 * of them.
 *
 * ## The seam runs through the middle of the answer, on purpose
 *
 * ADR-0034 divides the two grounds by CONTENT rather than by page: graphite is
 * what we conclude and what a reader may do, paper is what was measured. An
 * answer is both things at once, so it straddles the seam — the sentence, the
 * provenance and the next questions stay on graphite, and the figures the
 * sentence rests on sit on a paper plate. That is the clearest statement this
 * system can make about which half of an answer is a reading and which half is
 * a claim, and it is made without a label.
 *
 * ## Provenance is two axes and they are not merged
 *
 * TIER comes from the read model's own `EvidenceRef.tier` — how strong the
 * claim is. SOURCE is what kind of fact it rests on, and it is stated here
 * rather than read from the answer because `AskAnswer` carries no source list;
 * the gap is reported. What is stated is narrow and checkable: these answers
 * are assembled from what the showroom observed and what Observer calculated
 * from it. `AI_INTERPRETATION` is deliberately absent and that absence is the
 * point — nothing on this screen was written by a model, and a reader must be
 * able to see that rather than be told it once in a notice and left to
 * remember.
 *
 * ## No causal claim, at any sample size
 *
 * The answers this renders state sequence and association. Nothing here adds a
 * connective that would turn two facts into a cause, and there is no fourth
 * tier to draw — `causal_claim` is a tier the product refuses to produce, so
 * `Tier` renders nothing for it rather than inventing a chip.
 */

/**
 * What an Ask IRIS answer rests on.
 *
 * Two sources, and the omission is as deliberate as the inclusion. The figures
 * are counts and durations the showroom recorded (`IRIS observed`) turned into
 * shares, medians and rankings by the read models (`IRIS calculated`). Where an
 * answer touches a CRM outcome the read model says so in its own prose and in
 * its caveat, which is the honest place for a fact that is true of one answer
 * and not of the six.
 */
const ANSWER_SOURCES: readonly InsightSource[] = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
];

/**
 * The sentinel a read model uses for a figure it cannot supply.
 *
 * `buildAskHistory` emits `{ value: "—", note: "no CRM connected" }` for a
 * count that does not exist on a project with no CRM. Printed as written, that
 * em dash would appear at figure size and figure weight in a row of real
 * numbers — which is precisely the punctuation-standing-in-for-a-value that
 * `observer-product.css` §8 exists to prevent, and a reader scanning the row
 * would read it as a small number or as a formatting slip.
 *
 * So the sentinel is recognised and given the system's missing treatment
 * instead: four changes at once — size, weight, colour and the bar mark — with
 * the read model's own note carried beside it as the reason. Nothing is
 * invented; the same fact is told in the vocabulary the rest of the product
 * uses for it.
 *
 * This is a display-layer normalisation of a known sentinel and not a
 * substitute for the proper fix, which is `AskFigure` carrying a `MetricValue`
 * so that empty, insufficient, unavailable and error stay four different
 * answers. That is reported as a read-model gap.
 */
const ABSENT = new Set(["—", "-", "–", "n/a", ""]);

function isAbsent(figure: AskFigure): boolean {
  return ABSENT.has(figure.value.trim().toLowerCase());
}

function Figures({
  figures,
  periodLabel,
}: {
  readonly figures: readonly AskFigure[];
  readonly periodLabel: string;
}) {
  if (figures.length === 0) return null;

  return (
    <div className="ox-plate ox-paper">
      <div className="ox-plate-inner">
        <p className="ox-subhead">What was measured</p>

        {/*
         * A `<dl>` of `<div>` groups. The sheet's grid puts one figure per
         * cell and divides them with clipped box-shadows rather than gaps,
         * because a gap paints its ground wherever the row does not divide
         * evenly and turns a short last row into a block of border colour.
         */}
        <dl className="ox-answer-figures">
          {figures.map((figure) => (
            <div className="ox-answer-figure" key={`${figure.label}:${figure.value}`}>
              <dt>{figure.label}</dt>
              {isAbsent(figure) ? (
                <dd>
                  <span
                    className="ox-value"
                    data-missing="true"
                    {...(figure.note === null ? {} : { title: figure.note })}
                  >
                    {figure.note ?? "Not recorded"}
                  </span>
                </dd>
              ) : (
                <dd>
                  {figure.value}
                  {figure.note === null ? null : (
                    <>
                      {" "}
                      {/*
                       * A qualifier may dim and may never be dropped: "12" and
                       * "of 48" are one figure, not a figure and a footnote.
                       */}
                      <span className="ox-of">{figure.note}</span>
                    </>
                  )}
                </dd>
              )}
            </div>
          ))}
        </dl>

        <p className="ox-chart-note">
          Every figure above is read from {periodLabel.toLowerCase()} on this project. None of them
          was written by a model; a question asked twice over the same period returns the same
          numbers.
        </p>
      </div>
    </div>
  );
}

export function AnswerSheet({
  answer,
  period,
  periodLabel,
  askAction,
  selection,
  answerable,
  when = null,
  showFollowUps = true,
}: {
  readonly answer: AskAnswer;
  readonly period: PeriodPreset;
  /** The span every figure below is qualified by, in the reader's words. */
  readonly periodLabel: string;
  /** Where a next question is asked. The Ask IRIS path. */
  readonly askAction: string;
  readonly selection: string | null;
  /**
   * Questions with a prepared answer, normalised. A next question outside this
   * set is listed in prose rather than drawn as a control that would land on
   * "there is no answer for this".
   *
   * Null means the caller cannot tell — the thread surface reads one stored
   * conversation and never sees the session's answer list — and every next
   * question is then offered as a link to Ask IRIS, which answers honestly
   * either way.
   */
  readonly answerable: ReadonlySet<string> | null;
  /** When it was asked, on a stored conversation. Null on a live answer. */
  readonly when?: string | null;
  /**
   * Whether this turn offers its own next questions.
   *
   * True on a live answer, and on the LAST turn of a stored conversation. False
   * on the earlier turns of one, because a next question that was already asked
   * is the turn below it: offering it again would invite the reader to leave a
   * thread in order to re-ask something they can read two inches further down.
   */
  readonly showFollowUps?: boolean;
}) {
  const offered = showFollowUps ? answer.followUps : [];
  const live =
    answerable === null
      ? offered
      : offered.filter((question) => isAnswerable(answerable, question));
  const unprepared =
    answerable === null ? [] : offered.filter((question) => !isAnswerable(answerable, question));

  return (
    <article className="ox-turn">
      {when === null ? null : <p className="ox-turn-when">{when}</p>}

      {/*
       * The question is set as a question: quieter than the answer, and set off
       * by a rail rather than by a bubble. Bubbles would make this a chat
       * product; it is an analytical surface where the answer is the subject.
       */}
      <p className="ox-turn-question">{answer.question}</p>

      <div className="ox-answer-body">
        <p>{answer.answer}</p>
      </div>

      <Figures figures={answer.figures} periodLabel={periodLabel} />

      {answer.caveat === null ? null : <p className="ox-finding-caveat">{answer.caveat}</p>}

      <div className="ox-finding-foot">
        {answer.evidence === null ? null : <Tier tier={answer.evidence.tier} />}
        <Sources sources={ANSWER_SOURCES} />
        <Evidence evidence={answer.evidence} period={period} />

        {/*
         * A LABEL WITH NO ROUTE IS NOT A BUTTON. `actionLabel` and
         * `actionHref` are independently nullable on the read model, so a
         * named next step with nowhere to send the reader is drawn as the
         * sentence it is rather than as a control that looks ready.
         */}
        {answer.actionLabel !== null && answer.actionHref === null ? (
          <span className="ox-n">{answer.actionLabel} — no surface for this yet</span>
        ) : null}

        {answer.actionHref === null || answer.actionLabel === null ? null : (
          <Link
            className="ox-btn"
            data-weight="primary"
            href={dynamicRoute(withPeriod(answer.actionHref, period))}
          >
            {answer.actionLabel}
          </Link>
        )}
      </div>

      {live.length === 0 && unprepared.length === 0 ? null : (
        <div>
          <p className="ox-subhead">Next questions</p>

          {live.length === 0 ? null : (
            <form method="get" action={askAction} aria-label="Ask a follow-up question">
              <input type="hidden" name="period" defaultValue={period} />
              {selection === null ? null : (
                <input type="hidden" name="selection" defaultValue={selection} />
              )}
              <ul className="ox-follow-ups">
                {live.map((question) => (
                  <li key={question}>
                    <button className="ox-toggle" type="submit" name="q" value={question}>
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            </form>
          )}

          {unprepared.length === 0 ? null : (
            <p className="ox-section-note">
              No prepared answer yet on this project for: {unprepared.join("; ")}.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
