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
 * The parts stay separate and always in this order: the figures a tool
 * computed, the interpretation a model may have written, what to do, what this
 * does not cover, and what it rests on.
 */
export function ObserverAnswer({
  outcome,
  onFollowUp,
  followUps,
}: {
  outcome: AskOutcome;
  onFollowUp: (question: string) => void;
  followUps: readonly string[];
}) {
  return (
    <div className="obs-answer">
      <p className="obs-answer-question">{outcome.question}</p>

      {outcome.refusal !== null ? (
        <p className="obs-answer-said">{outcome.refusal}</p>
      ) : outcome.answer === null ? null : (
        <>
          {/*
           * The label stays, quietly.
           *
           * Which part a model may have written and which part a tool computed
           * is the honesty the whole architecture is built on (ADR-0024), so it
           * is not the kind of explanation that gets folded away — it is just
           * set small enough not to shout over the sentence it describes.
           */}
          <p className="obs-answer-role">Observer&rsquo;s reading</p>
          <p className="obs-answer-said">{outcome.answer.interpretation}</p>

          <p className="obs-answer-role">Measured</p>
          <dl className="obs-answer-facts">
            {outcome.answer.observed.map((fact, i) => (
              <div key={`${fact.label}-${i}`}>
                <dt>{fact.label}</dt>
                <dd>
                  <b>{fact.value}</b>
                  {fact.note === null ? null : <span>{fact.note}</span>}
                </dd>
              </div>
            ))}
          </dl>

          {outcome.answer.action === null ? null : (
            <a className="iris-action" data-emphasis="primary" href={outcome.answer.action.href}>
              {outcome.answer.action.label}
            </a>
          )}

          {/*
           * Everything that qualifies the answer folds away.
           *
           * It has to be here — an interpretation without its limits is a claim
           * — but open by default it buried the sentence the reader came for.
           */}
          <details className="obs-answer-basis">
            <summary>
              Confidence and evidence · {outcome.answer.confidence} ·{" "}
              {outcome.answer.evidence.length}{" "}
              {outcome.answer.evidence.length === 1 ? "reference" : "references"}
            </summary>

            {outcome.answer.limitations.length === 0 ? null : (
              <ul className="obs-answer-limits">
                {outcome.answer.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}

            <p className="iris-meta">{outcome.answer.dataCompleteness}</p>

            <span className="iris-srcs">
              {outcome.answer.sources.map((s) => (
                <span className="iris-src" key={s} data-src={s}>
                  {INSIGHT_SOURCE_LABELS[s]}
                </span>
              ))}
            </span>

            <div className="obs-answer-refs">
              {outcome.answer.evidence.map((e) => (
                <a className="iris-evidence" key={e.evidenceId} href={e.href}>
                  <i />
                  {e.observationCount} records · {e.tier.replace(/_/g, " ")}
                </a>
              ))}
            </div>

            <p className="iris-code obs-answer-provenance">
              {outcome.toolsUsed.join(", ") || "no tool"} ·{" "}
              {outcome.status.live
                ? `${outcome.status.provider} · ${outcome.status.model}`
                : `deterministic · ${outcome.status.reason ?? "no model configured"}`}
            </p>
          </details>
        </>
      )}

      {followUps.length === 0 ? null : (
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
