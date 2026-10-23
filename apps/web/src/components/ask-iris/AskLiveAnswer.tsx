"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { sampleWords, toolOfBundle } from "@/lib/ai/sample-units";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { useObserver } from "@/showroom/observer/useObserver";
import type { ObserverContext } from "@/showroom/observer/types";
import { InfoTip } from "@/components/iris/InfoTip";
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
 * ## Who wrote it (ADR-0024, ADR-0033, Gate 1)
 *
 * The answer's author carries `data-ai-notice`: the model's name when the
 * outcome says a model wrote the words (`status.live`), otherwise the read
 * models, which is true of every figure either way. The sentences that said so
 * at length, above a model's answer and under the prompt, were removed by the
 * owner on 2026-10-23; the note now speaks only where no model wrote anything.
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
  detect_showroom_behavior_changes: "Change against 7 days ago",
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
  modelMayAnswer,
  nextQuestions,
}: {
  readonly question: string;
  readonly context: ObserverContext;
  readonly root: string;
  readonly periodParam: string;
  readonly viewerName: string;
  readonly periodLabel: string;
  /** Whether a language model may word this answer here. */
  readonly modelMayAnswer: boolean;
  /** Other questions worth asking next, when the answer offers none of its own. */
  readonly nextQuestions: readonly string[];
}) {
  const session = useObserver(context);
  /* Whether a model may word this question, fixed when it was sent (keyed by question). */
  const [mayAnswer] = useState(modelMayAnswer);
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
   * Said only where no model wrote the answer: a fallback, or a server with no
   * model at all. A model's answer is named by its author line alone.
   */
  const note =
    settled && answer !== null
      ? live
        ? null
        : /* One line: the pill names the project, the stamp the period (the owner's review, 2026-10-23). */
          "Composed by Observer's read models. No language model wrote any of this."
      : mayAnswer
        ? null
        : "Answered by Observer's analysis tools from this project's read models. No language model is connected here, so the wording is the read models' own.";

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

  /* The read models' own interpretation and limits, for the headline's `i`. */
  const behind =
    answer === null || live
      ? []
      : [
          ...(answer.interpretation.length > 0 ? [answer.interpretation] : []),
          ...answer.limitations,
        ];

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
      {note === null ? null : (
        <p className="ask-note">
          <span className="ask-note-mark" aria-hidden="true">
            <Info />
          </span>
          <span>{note}</span>
        </p>
      )}

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
              <span className="ask-msg-who" data-ai-notice="">
                {settled ? author : "Observer"}
              </span>

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
                              prefetch={false}
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
                    {/*
                     * What the read models' own answer cannot say, and how it
                     * was composed, stand behind the headline's `i` (the
                     * owner's review, 2026-10-23: five lines said "no model"
                     * and the caveats ran to four phone screens). The sample
                     * and its evidence tier stay in sight on the chips below.
                     * A model's own interpretation and limits stay in sight:
                     * they are its answer.
                     */}
                    <div className="ask-headline-row">
                      <p className="ask-headline">{answer.headline}</p>
                      {behind.length === 0 ? null : (
                        <InfoTip id="ask-answer-limits" label="what this answer cannot say">
                          {behind.map((note) => (
                            <p key={note}>{note}</p>
                          ))}
                        </InfoTip>
                      )}
                    </div>
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

                    {live && answer.interpretation.length > 0 ? (
                      <p className="ask-msg-text ask-interpretation">{answer.interpretation}</p>
                    ) : null}

                    {live && answer.limitations.length > 0 ? (
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
                                  prefetch={false}
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
                                prefetch={false}
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
                              prefetch={false}
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
