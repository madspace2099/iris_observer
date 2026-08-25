"use client";

import { INSIGHT_SOURCE_LABELS } from "@observer/contracts";

import type { AskOutcome } from "./types";

/**
 * What Observer said, and what it is standing on.
 *
 * Observer speaks in the first person because it is the thing that did the
 * reading. It never claims to feel anything about what it found, and where it
 * cannot answer it says so rather than producing prose that sounds like an
 * answer.
 *
 * The parts stay separate and always in this order: the headline that explains,
 * the sentence that answers, the figures a tool computed, the interpretation a
 * model may have written, what to do, what this does not cover, and what it all
 * rests on. Separate because the reader must be able to tell which part came
 * from a measurement and which from a model — and because an interpretation
 * folded into the same paragraph as a figure borrows the figure's authority.
 *
 * Nothing here is a card. Planes separated by hairlines, per the design system.
 */

const EVIDENCE_LEVEL_LABELS: Readonly<Record<string, string>> = {
  observed_sequence: "observed sequence",
  attributed_conversion: "attributed conversion",
  statistical_association: "statistical association",
};

/** The state's own word, for the reader rather than for the machine. */
const STATE_LABELS: Readonly<Record<string, string>> = {
  insight: "Observation",
  contradictory_evidence: "The evidence disagrees",
  waiting_for_human: "Not answerable from the data",
  error: "Could not answer",
};

export function ObserverAnswerPanel({
  outcome,
  draft,
  onFollowUp,
  onRetry,
  followUps,
}: {
  outcome: AskOutcome;
  /** Provisional streamed prose, shown only while a request is in flight. */
  draft: { readonly answer: string; readonly interpretation: string } | null;
  onFollowUp: (question: string) => void;
  onRetry: () => void;
  followUps: readonly string[];
}) {
  const answer = outcome.answer;

  return (
    <div className="obs-answer">
      <p className="obs-answer-question">{outcome.question}</p>

      {outcome.refusal !== null ? (
        <>
          <p className="obs-answer-said" data-tone="refusal">
            {outcome.refusal}
          </p>
          <button className="obs-retry" type="button" onClick={onRetry}>
            Ask again
          </button>
        </>
      ) : answer === null ? null : (
        <>
          <p className="obs-answer-state" data-state={answer.orbState}>
            {STATE_LABELS[answer.orbState] ?? "Observation"}
          </p>
          <h3 className="obs-answer-headline">{answer.headline}</h3>
          <p className="obs-answer-said">{answer.answer}</p>

          {answer.findings.length === 0 ? null : (
            <>
              <p className="obs-answer-role">Measured</p>
              <dl className="obs-answer-facts">
                {answer.findings.map((finding, i) => (
                  <div key={`${finding.statement}-${i}`}>
                    <dt>{finding.statement}</dt>
                    <dd>
                      {finding.value === null ? null : <b>{finding.value}</b>}
                      <span className="iris-code obs-answer-cite">
                        {finding.evidenceRefs.length}{" "}
                        {finding.evidenceRefs.length === 1 ? "source" : "sources"}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {/*
           * Labelled, quietly and permanently.
           *
           * Which part a model may have written and which a tool computed is
           * the honesty the whole architecture is built on, so it is not the
           * kind of explanation that gets folded away — only set small enough
           * not to shout over the sentence it describes.
           */}
          <p className="obs-answer-role">
            Observer&rsquo;s reading{outcome.status.live ? "" : " · written by the tools"}
          </p>
          <p className="obs-answer-said">{answer.interpretation}</p>

          {answer.recommendedActions.length === 0 ? null : (
            <>
              <p className="obs-answer-role">What to do</p>
              <ol className="obs-answer-actions">
                {answer.recommendedActions.map((action) => (
                  <li key={action.label}>
                    {action.href === null ? (
                      <b>{action.label}</b>
                    ) : (
                      <a className="iris-action" href={action.href}>
                        {action.label}
                      </a>
                    )}
                    <span>{action.rationale}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {/*
           * Everything that qualifies the answer folds away.
           *
           * It has to be present — an interpretation without its limits is a
           * claim — but open by default it buried the sentence the reader came
           * for.
           */}
          <details className="obs-answer-basis">
            <summary>
              Evidence and limits · {answer.evidence.length}{" "}
              {answer.evidence.length === 1 ? "reference" : "references"}
              {answer.limitations.length === 0
                ? ""
                : ` · ${answer.limitations.length} limitation${answer.limitations.length === 1 ? "" : "s"}`}
            </summary>

            {answer.limitations.length === 0 ? null : (
              <ul className="obs-answer-limits">
                {answer.limitations.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            )}

            <span className="iris-srcs">
              {outcome.sources.map((source) => (
                <span className="iris-src" key={source} data-src={source}>
                  {INSIGHT_SOURCE_LABELS[source]}
                </span>
              ))}
            </span>

            <div className="obs-answer-refs">
              {answer.evidence.map((bundle) => {
                const label = `${bundle.factId} · n=${bundle.sampleSize} · ${
                  EVIDENCE_LEVEL_LABELS[bundle.evidenceLevel] ?? bundle.evidenceLevel
                } · ${bundle.period}`;
                return bundle.href === null ? (
                  <span className="iris-evidence" key={bundle.bundleId}>
                    <i />
                    {label}
                  </span>
                ) : (
                  <a className="iris-evidence" key={bundle.bundleId} href={bundle.href}>
                    <i />
                    {label}
                  </a>
                );
              })}
            </div>

            <p className="iris-code obs-answer-provenance">
              {outcome.toolsUsed.join(", ") || "no tool"} ·{" "}
              {outcome.status.live
                ? `${outcome.status.provider} · ${outcome.status.model}`
                : `evidence only · ${outcome.status.reason ?? "no model configured"}`}
              {outcome.demoData ? " · demonstration data" : ""}
            </p>
          </details>
        </>
      )}

      {/*
       * The provisional draft.
       *
       * Only ever on screen while a request is in flight, and marked as
       * unverified while it is — because it has not been through the schema,
       * the causal guard or the evidence check yet. It is replaced by the
       * validated answer, or discarded.
       */}
      {draft === null || draft.answer.length + draft.interpretation.length === 0 ? null : (
        <div className="obs-answer-draft" aria-live="polite" aria-busy="true">
          <p className="obs-answer-role">Composing · not yet checked</p>
          <p className="obs-answer-said">{draft.answer || draft.interpretation}</p>
        </div>
      )}

      {answer !== null && answer.followUpQuestions.length > 0 ? (
        <div className="obs-followups">
          {answer.followUpQuestions.slice(0, 3).map((question) => (
            <button
              key={question}
              type="button"
              className="obs-chip"
              onClick={() => onFollowUp(question)}
            >
              {question}
            </button>
          ))}
        </div>
      ) : followUps.length === 0 ? null : (
        <div className="obs-followups">
          {followUps
            .filter((s) => s !== outcome.question)
            .slice(0, 3)
            .map((s) => (
              <button key={s} type="button" className="obs-chip" onClick={() => onFollowUp(s)}>
                {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
