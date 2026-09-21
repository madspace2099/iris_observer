import {
  ATTENTION_KIND_DEFINITIONS,
  type AttentionCheck,
  type AttentionCheckState,
  type AttentionKind,
  type PeriodPreset,
} from "@observer/readmodels";

import { DataTable, type DataColumn, type DataRow } from "@/components/product";

/**
 * EVERY QUESTION THIS SCREEN ASKED, AND THE ANSWER TO EACH.
 *
 * The counterpart to the raised list, and the reason this screen can be trusted
 * when it is quiet. A panel that shows only what was raised renders two very
 * different situations identically — as empty space:
 *
 *   "we asked six questions and none of them came back raised"
 *   "we could not ask four of them, and the two we could came back clean"
 *
 * The second is the more urgent, and the reader has no way to tell them apart
 * from an empty panel. `AttentionView.checks` returns all six answers in
 * declaration order — deliberately not in the order things were raised, so the
 * register does not reshuffle itself between periods — and this renders every
 * one of them with the sentence that says why it is what it is.
 *
 * ## Why a real table, and why it is the paper region of the screen
 *
 * Six rows of three short columns is a register, and ADR-0034 puts a register
 * on paper: above the seam what we conclude, below it what we measured. The
 * raised states are a conclusion and stay on graphite; this is the working out.
 *
 * Below 48rem the sheet turns each row into a stacked record and prints the
 * column name in front of every cell, which is what `DataTable` writes
 * `data-label` for. Nothing here has to do anything about that.
 *
 * ## No column is sortable, on purpose
 *
 * `DataColumn.sort` is left absent rather than set to `none`. Six rows in a
 * fixed declaration order is the whole content, and a sort control on it would
 * be a control whose only effect is to make the reader lose their place.
 */

/**
 * The answer, in a word. A state never reaches the screen as a colour alone.
 *
 * "Not evaluated" rather than "unavailable": the check did not fail and no
 * source is broken — the question could not honestly be asked of this period,
 * and the reason beside it says which.
 */
const STATE_WORDS: Readonly<Record<AttentionCheckState, string>> = {
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

/** The question a kind asks, from the definitions the read model publishes. */
function questionOf(kind: AttentionKind): string | null {
  return (
    ATTENTION_KIND_DEFINITIONS.find((definition) => definition.kind === kind)?.question ?? null
  );
}

const COLUMNS: readonly DataColumn[] = [
  { key: "check", label: "Check" },
  { key: "answer", label: "Answer" },
  { key: "found", label: "What it found" },
];

export function ChecksRegister({
  checks,
  period,
}: {
  readonly checks: readonly AttentionCheck[];
  readonly period: PeriodPreset;
}) {
  const rows: readonly DataRow[] = checks.map((check) => {
    const question = questionOf(check.kind);
    return {
      key: check.kind,
      cells: {
        check: (
          <>
            {check.label}
            {question === null ? null : <div className="ox-section-note">{question}</div>}
          </>
        ),
        answer: (
          <span className="ox-chip" data-tone={STATE_TONES[check.state]}>
            <span className="ox-chip-mark" aria-hidden="true" />
            {STATE_WORDS[check.state]}
          </span>
        ),
        found: check.reason,
      },
    };
  });

  return (
    <DataTable
      caption="Every question this screen asks of the period, and the answer to each — including the ones that came back clean and the ones that could not be asked."
      columns={COLUMNS}
      rows={rows}
      period={period}
      empty={{
        title: "No check ran",
        note: "The attention read model returned no questions for this period. That is a defect in the read model rather than a quiet project, and nothing on this screen should be read as an all-clear.",
      }}
    />
  );
}
