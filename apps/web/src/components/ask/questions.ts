import type { AskAnswer } from "@observer/readmodels";

/**
 * MATCHING A TYPED QUESTION TO A PREPARED ANSWER.
 *
 * The whole of Ask IRIS rests on one fact that the screen has to state rather
 * than hide: **no model answers here.** ADR-0030 makes a model connection
 * something an account brings, ADR-0033 records that no account on this
 * deployment holds one, and `docs/PROJECT-STATE.md` records that the configured
 * key is refused outright. So the answers come from
 * `repository.getAskSession`, which composes them from the same read models
 * every other surface draws — deterministically, with the same figures for the
 * same question over the same period.
 *
 * A deterministic answer path needs a way to get from what a reader typed to
 * one of the answers the read model prepared, and this file is that way and
 * nothing more. It matches strings. It computes no metric, reads no repository,
 * joins nothing and invents nothing (ADR-0012): every figure a reader sees
 * still comes from the `AskAnswer` the read model built.
 *
 * ## Why the match is exact rather than clever
 *
 * A fuzzy matcher would be the screen guessing at intent, and a wrong guess
 * here is worse than no answer at all: it would put a real, correctly computed
 * figure under a question it does not answer, which is the one failure mode
 * this product cannot recover from. So the comparison is exact after
 * normalisation, and anything that does not match is told plainly that there is
 * no prepared answer for it — with the list of questions that do have one.
 *
 * Normalisation is deliberately shallow: case, punctuation and runs of
 * whitespace, and no stemming, no synonyms, no word dropping. It exists so that
 * "What changed this month?" typed without the question mark still reaches its
 * answer, not so that a paraphrase does.
 */

/**
 * Case, punctuation and spacing removed; nothing else.
 *
 * The character class keeps digits because unit codes and floor numbers appear
 * inside questions, and it collapses everything else to single spaces so that
 * "A-402" and "a 402" compare equal — which is what a reader retyping a code
 * from a previous answer will produce.
 */
export function normaliseQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The prepared answer for this question, or null.
 *
 * Returns the read model's own `AskAnswer` unchanged. A caller never builds one
 * and never edits one: the prose, the figures, the evidence reference, the
 * caveat and the next questions are all the read model's words.
 */
export function findAnswer(answers: readonly AskAnswer[], question: string): AskAnswer | undefined {
  const wanted = normaliseQuestion(question);
  if (wanted.length === 0) return undefined;
  return answers.find((answer) => normaliseQuestion(answer.question) === wanted);
}

/**
 * Every question this project has a prepared answer for, normalised.
 *
 * Used to decide whether a follow-up may be offered as a control. A follow-up
 * with no prepared answer is not drawn as a button: the doctrine forbids a
 * control that looks ready and does nothing, and a chip that silently lands on
 * "there is no answer for this" is exactly that. Those questions are listed in
 * prose instead, which is honest about what the surface can and cannot do.
 */
export function answerableQuestions(answers: readonly AskAnswer[]): ReadonlySet<string> {
  return new Set(answers.map((answer) => normaliseQuestion(answer.question)));
}

/** Whether a question has a prepared answer on this project, in this period. */
export function isAnswerable(answerable: ReadonlySet<string>, question: string): boolean {
  return answerable.has(normaliseQuestion(question));
}

/**
 * The five marks the approved design draws beside an opening.
 *
 * The artefact gives each suggestion row an icon in a 44px column —
 * `.irs-suggestion` in `iris-shell.css` reserves the column, so a row without
 * one is a row with a hole in it. They are chosen from the question's own
 * subject rather than cycled, because an ornament that changes with the text is
 * at least a weak index and a cycled one is pure decoration.
 *
 * This is not the "icon beside every label" the doctrine forbids. That rule is
 * about labels in dense readings; these are five large one-line invitations in
 * a composition that was designed and approved with them.
 */
export type OpeningGlyph = "trend" | "units" | "period" | "people" | "next";

export function glyphFor(question: string): OpeningGlyph {
  const text = normaliseQuestion(question);
  if (/\b(unit|units|apartment|apartments|two room|bedroom|floor|a \d+)\b/.test(text)) {
    return "units";
  }
  if (/\b(agent|agents|team|buyer|buyers|prospect|prospects|people|who)\b/.test(text)) {
    return "people";
  }
  if (/\b(compare|previous|quarter|month|period|since|report)\b/.test(text)) {
    return "period";
  }
  if (/\b(demand|attention|changed|change|gaining|falling|interest)\b/.test(text)) {
    return "trend";
  }
  return "next";
}
