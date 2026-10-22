import Link from "next/link";
import {
  ATTENTION_KIND_DEFINITIONS,
  type AttentionCheck,
  type AttentionCheckState,
  type AttentionState,
  type PeriodPreset,
} from "@observer/readmodels";

import { Empty } from "@/components/product";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * EVERY QUESTION THIS SCREEN ASKED, AND THE ANSWER TO EACH.
 *
 * The counterpart to the raised list, and the reason this screen can be trusted
 * when it is quiet. A panel that shows only what was raised renders two very
 * different situations identically — as empty space:
 *
 *   "we asked every question and none of them came back raised"
 *   "we could not ask most of them, and the few we could came back clean"
 *
 * The second is the more urgent, and the reader has no way to tell them apart
 * from an empty panel. `AttentionView.checks` returns every answer in
 * declaration order — deliberately not in the order things were raised, so the
 * register does not reshuffle itself between periods — and this renders every
 * one of them with the sentence that says why it is what it is.
 *
 * ## A list, not a table (the owner, 2026-10-22, ADR-0058)
 *
 * It was a four-column `DataTable` with each check's question under its name
 * and a caption over the head; on a phone every row repeated the four column
 * names. The owner could not take the page in. A row is now the answer, the
 * check's name, what it found and the next step, in that order at every
 * width; the questions stand behind the `i` beside the register's title
 * (`CheckQuestions`), and a refusal — a check that could not be asked — still
 * says why in its own row.
 *
 * ## Every check names its next step (R04-7)
 *
 * A raised check's step is its state's own action, the same words and the same
 * place the raised card sends the reader. A clear check needs nothing; a check
 * that could not be asked, or a raised state with no permitted list to open,
 * has nothing a reader can do from here, and says so rather than leaving a
 * blank that reads as a missing value.
 */

/**
 * The answer, in a word. A state never reaches the screen as a colour alone.
 *
 * "Not evaluated" rather than "unavailable": the check did not fail and no
 * source is broken — the question could not honestly be asked of this period,
 * and the reason beside it says which.
 */
export const STATE_WORDS: Readonly<Record<AttentionCheckState, string>> = {
  raised: "Raised",
  clear: "Clear",
  unavailable: "Not evaluated",
};

/**
 * The chip tone, and the one thing it deliberately does not carry.
 *
 * A raised check takes `watch` whatever its severity is. The severity of the
 * state belongs to the state, which is drawn above with its own rail; repeating
 * it here would give the register a second, quieter opinion about how loud each
 * row is, and two disagreeing volume controls on one screen is worse than none.
 */
const STATE_TONES: Readonly<Record<AttentionCheckState, string>> = {
  raised: "watch",
  clear: "good",
  unavailable: "none",
};

const NO_STEP: Readonly<Record<AttentionCheckState, string>> = {
  raised: "None on this screen",
  clear: "None needed",
  unavailable: "None on this screen",
};

export function ChecksRegister({
  checks,
  states,
  period,
}: {
  readonly checks: readonly AttentionCheck[];
  /** The raised states, whose actions are the register's next steps. */
  readonly states: readonly AttentionState[];
  readonly period: PeriodPreset;
}) {
  if (checks.length === 0) {
    return (
      <Empty
        title="No check ran"
        note="The attention read model returned no questions for this period. That is a defect in the read model rather than a quiet project, and nothing on this screen should be read as an all-clear."
      />
    );
  }

  return (
    <ul className="sheet-checks" aria-label="Every check, and what it found">
      {checks.map((check) => {
        const alert =
          check.state === "raised" ? states.find((s) => s.kind === check.kind)?.alert : undefined;
        return (
          <li className="sheet-check" key={check.kind} data-state={check.state}>
            <span className="ox-chip" data-tone={STATE_TONES[check.state]} data-part="answer">
              <span className="ox-chip-mark" aria-hidden="true" />
              {STATE_WORDS[check.state]}
            </span>
            <div>
              <p className="sheet-check-name">{check.label}</p>
              {/*
               * A raised check's sentence is its card's, word for word; the
               * row names the card instead, so the page says each raised
               * thing once and the reader sees that the two names are one.
               */}
              <p className="sheet-check-found" data-part="found">
                {alert === undefined ? check.reason : `Above: ${alert.title}`}
              </p>
            </div>
            <p className="sheet-check-step" data-part="step">
              {alert === undefined || alert.actionHref === null || alert.actionLabel === null ? (
                NO_STEP[check.state]
              ) : (
                <Link className="ox-link" href={dynamicRoute(withPeriod(alert.actionHref, period))}>
                  {alert.actionLabel}
                </Link>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** What each check asks, from the definitions the read model publishes: the register's `i`. */
export function CheckQuestions({ checks }: { readonly checks: readonly AttentionCheck[] }) {
  return (
    <>
      {checks.map((check) => {
        const question = ATTENTION_KIND_DEFINITIONS.find((d) => d.kind === check.kind)?.question;
        return question === undefined ? null : (
          <p key={check.kind}>
            <b>{check.label}.</b> {question}
          </p>
        );
      })}
    </>
  );
}
