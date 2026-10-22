"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";

import { sampleWords, toolOfBundle } from "@/lib/ai/sample-units";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { useObserver } from "@/showroom/observer/useObserver";
import type { ObserverContext } from "@/showroom/observer/types";
import { askLink } from "./ask-link";
import { Info, Sparkle } from "./icons";

/**
 * A TYPED QUESTION, ANSWERED THROUGH THE ANALYSIS PIPELINE.
 *
 * The computed openings have prepared answers; a question in the reader's own
 * words does not. It goes to `/api/ask/stream` (through `useObserver`), which
 * chooses among the read-only analysis tools, runs them against the project in
 * view, and words the result — in a language model's words where one is
 * connected and the read models' own where none is. The stages and analyses are
 * shown as they actually happen; the answer that stays is the validated one.
 *
 * ## One request per question
 *
 * The page keys this component by the question, so a new question is a new
 * instance. React's development double-mount runs the effect twice on the same
 * instance; the ref below survives that and lets exactly one request through.
 * Leaving the page aborts the request (`useObserver`), after a tick, so the
 * double-mount's rehearsal unmount does not abort the one request it let through.
 *
 * ## Who wrote it, said in words (ADR-0024, ADR-0033, Gate 1)
 *
 * The note carries `data-ai-notice` from before the request is sent. The model
 * is named only when the outcome says a model wrote the words (`status.live`);
 * otherwise the answer is attributed to the read models, which is true of every
 * figure either way.
 */

/** What each analysis is called on screen. The tool's own name is an identifier. */
const ANALYSIS_WORDS: Readonly<Record<string, string>> = {
  summarize_showroom_period: "Period summary",
  compare_agent_flows: "Presenter comparison",
  compare_meeting_cohorts: "Progressed against not progressed",
  compare_agent_outcomes: "Presenters' recorded outcomes",
  explain_meeting_journey: "Meeting replay",
  analyze_feature_usage: "Section reach and dwell",
  analyze_unit_attention: "Unit attention",
  detect_showroom_behavior_changes: "Change against the previous period",
  analyze_environment_usage: "Environment presets",
  prepare_meeting: "Meeting brief",
  get_metric_evidence: "Metric evidence",
  analyze_iris_assisted_sales: "Sales after a showing",
  get_sales_plan: "Sold against the plan",
};

const LEVEL_WORDS: Readonly<Record<string, string>> = {
  observed_sequence: "observed sequence",
  attributed_conversion: "attributed conversion",
  statistical_association: "statistical association",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export function AskLiveAnswer({
  question,
  context,
  root,
  periodParam,
  viewerName,
  periodLabel,
  modelNotice,
  nextQuestions,
}: {
  readonly question: string;
  readonly context: ObserverContext;
  readonly root: string;
  readonly periodParam: string;
  readonly viewerName: string;
  readonly periodLabel: string;
  /** The sentence that says a language model may word the answer, or null when none can. */
  readonly modelNotice: string | null;
  /** Other questions worth asking next, when the answer offers none of its own. */
  readonly nextQuestions: readonly string[];
}) {
  const session = useObserver(context);
  const asked = useRef<string | null>(null);
  const { ask } = session;

  useEffect(() => {
    if (asked.current === question) return;
    asked.current = question;
    void ask(question);
  }, [ask, question]);

  const outcome = session.outcome;
  const answer = outcome?.answer ?? null;
  const live = outcome?.status.live === true;
  /* The model is named only when it wrote the words; otherwise the read models did. */
  const author = outcome !== null && live ? outcome.status.model : "Read models";
  const settled = outcome !== null && !session.busy;

  /*
   * The trace: every stage the server named and every analysis that ran, in
   * the one order they arrived, so the stage that words the answer follows the
   * analyses it words. While a request is open the last row is the one in
   * progress; once the outcome is in, every row is done, including the lone
   * "Sending the question" of a request refused before any stage.
   */
  const arrived = session.steps.map((step) =>
    step.kind === "stage"
      ? { key: `s:${step.name}`, label: step.name }
      : { key: `t:${step.name}`, label: ANALYSIS_WORDS[step.name] ?? step.name },
  );
  const trace = arrived.length > 0 ? arrived : [{ key: "send", label: "Sending the question" }];

  const followUps =
    answer !== null && answer.followUpQuestions.length > 0
      ? answer.followUpQuestions
      : nextQuestions.filter((next) => next !== question).slice(0, 3);

  const evidence = useMemo(() => {
    if (answer === null) return [];
    const seen = new Set<string>();
    return answer.evidence.filter((bundle) => {
      const key = `${bundle.href ?? ""}|${bundle.factId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [answer]);

  return (
    <>
      <p className="ask-note" data-ai-notice="">
        <span className="ask-note-mark" aria-hidden="true">
          <Info />
        </span>
        <span>
          {settled && answer !== null
            ? live
              ? `Worded by ${author}, a language model, from figures Observer's read models computed for ${context.projectLabel}, ${periodLabel.toLowerCase()}. Each figure it gives in digits was matched to one the read models returned before it was shown.`
              : `Composed by Observer's read models for ${context.projectLabel}, ${periodLabel.toLowerCase()}. No language model wrote any of this.`
            : (modelNotice ??
              "Answered by Observer's analysis tools from this project's read models. No language model is connected here, so the wording is the read models' own.")}
        </span>
      </p>

      <div className="ask-panel" data-kind="chat">
        <ol
          className="ask-log"
          aria-label={`Conversation about ${context.projectLabel}`}
          aria-busy={session.busy}
        >
          <li className="ask-msg" data-who="you">
            <span className="ask-avatar" aria-hidden="true">
              {initialsOf(viewerName)}
            </span>
            <div className="ask-msg-body">
              <span className="ask-msg-who">{viewerName}</span>
              <p className="ask-msg-text" data-announce="">
                {question}
              </p>
            </div>
            <span className="ask-msg-when">{periodLabel}</span>
          </li>

          <li className="ask-msg" data-who="iris">
            <span className="ask-avatar" data-who="iris" aria-hidden="true">
              <Sparkle />
            </span>
            <div className="ask-msg-body">
              <span className="ask-msg-who">{settled ? author : "Observer"}</span>

              <ol className="ask-trace" aria-label="What Observer did" data-settled={settled}>
                {trace.map((step, index) => (
                  <li
                    key={step.key}
                    className="ask-trace-step"
                    data-state={!settled && index === trace.length - 1 ? "active" : "done"}
                  >
                    <span className="ask-trace-mark" aria-hidden="true">
                      <svg viewBox="0 0 12 12" width="12" height="12">
                        <path d="M2.5 6.4 5 8.8 9.6 3.6" />
                      </svg>
                    </span>
                    {step.label}
                  </li>
                ))}
              </ol>

              {session.draft !== null && session.draft.answer.length > 0 ? (
                <p className="ask-msg-text ask-draft" aria-hidden="true">
                  {session.draft.answer}
                </p>
              ) : null}

              <div aria-live="polite">
                {!settled ? null : answer === null ? (
                  <>
                    <p className="ask-msg-text">
                      {outcome.refusal ?? "Observer could not answer this from the read models."}
                    </p>
                    {followUps.length > 0 ? (
                      <ul className="ask-follow">
                        {followUps.map((next) => (
                          <li key={next}>
                            <Link
                              className="ask-follow-item"
                              href={dynamicRoute(askLink(root, periodParam, { q: next }))}
                            >
                              {next}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <div className="ask-live-answer">
                    <p className="ask-headline">{answer.headline}</p>
                    <p className="ask-msg-text">{answer.answer}</p>

                    {answer.findings.length > 0 ? (
                      <dl className="ask-figures">
                        {answer.findings.map((finding) => (
                          <div className="ask-figure" key={`${finding.statement}|${finding.value}`}>
                            <dt>{finding.statement}</dt>
                            <dd>{finding.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    {answer.interpretation.length > 0 ? (
                      <p className="ask-msg-text ask-interpretation">{answer.interpretation}</p>
                    ) : null}

                    {answer.limitations.length > 0 ? (
                      <ul className="ask-limits" aria-label="What this cannot say">
                        {answer.limitations.map((limit) => (
                          <li key={limit}>{limit}</li>
                        ))}
                      </ul>
                    ) : null}

                    {evidence.length > 0 || answer.recommendedActions.length > 0 ? (
                      <ul className="ask-evidence">
                        {evidence.map((bundle) => {
                          /* In the unit the bundle's own analysis counts: dated sales, not meetings. */
                          const words = `${sampleWords(
                            toolOfBundle(bundle.bundleId),
                            bundle.sampleSize,
                          )} · ${LEVEL_WORDS[bundle.evidenceLevel] ?? bundle.evidenceLevel}`;
                          return (
                            <li key={bundle.bundleId}>
                              {bundle.href === null ? (
                                <span className="ask-evidence-link">{words}</span>
                              ) : (
                                <Link
                                  className="ask-evidence-link"
                                  href={dynamicRoute(
                                    withPeriod(bundle.href, presetFrom(periodParam)),
                                  )}
                                >
                                  {words}
                                </Link>
                              )}
                            </li>
                          );
                        })}
                        {answer.recommendedActions.map((action) => (
                          <li key={action.label}>
                            {action.href === null ? (
                              <span className="ask-figure-note">{action.label}</span>
                            ) : (
                              <Link
                                className="ask-evidence-link"
                                href={dynamicRoute(
                                  withPeriod(action.href, presetFrom(periodParam)),
                                )}
                              >
                                {action.label}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {followUps.length > 0 ? (
                      <ul className="ask-follow" aria-label="Ask next">
                        {followUps.map((next) => (
                          <li key={next}>
                            <Link
                              className="ask-follow-item"
                              href={dynamicRoute(askLink(root, periodParam, { q: next }))}
                            >
                              {next}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <span className="ask-msg-when">{periodLabel}</span>
          </li>
        </ol>
      </div>
    </>
  );
}
