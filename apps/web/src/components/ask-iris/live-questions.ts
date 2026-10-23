/**
 * THE QUESTIONS ASK IRIS OFFERS TO ANSWER THROUGH THE ANALYSIS PIPELINE.
 *
 * The computed openings are prepared answers: the read models compose them
 * before anybody asks, and a click shows one. These are different in kind — each
 * runs the read-only analysis tools against the project in view, through
 * `/api/ask/stream`, and is worded by a language model only where one is
 * connected. They are generic on purpose: nothing here names a project, a unit
 * or a person, so every project is asked the same four things of its own data.
 * Nor does any carry a cause in its premise: "where do presentations lose
 * buyers" assumed the presentation lost them, which nothing measured can say.
 *
 * The keyword router in `lib/ai/agent.ts` sends each of them to its analyses
 * without a model; `apps/web/test/ask.test.ts` holds that routing in place.
 */
export const LIVE_QUESTIONS: readonly string[] = Object.freeze([
  "What separates meetings that progressed from those that did not?",
  "Which agent's presentations progressed most, and how did they present?",
  "Which sections do presentations reach, and which do they skip?",
  "Which units draw the most attention, and do they convert?",
]);

/**
 * What a language model words wherever one answers in Ask IRIS: typed questions
 * and the openings above, which go to the same route. Every Gate 1 sentence
 * that names a model, or asks for a key, says this much (ADR-0043).
 */
export const MODEL_WORDED = `typed questions and the first ${LIVE_QUESTIONS.length} openings`;

/**
 * WHETHER A LANGUAGE MODEL MAY WORD A TYPED QUESTION HERE.
 *
 * A demonstration key, the company's (ADR-0043) or the owner's (ADR-0040),
 * where the stream route would spend it: the language model on and the request
 * addressed to the loopback. Or the account's own connection. It decides only
 * whether the pre-answer "No language model is connected here" line shows: the
 * sentences that named the model under the prompt and above its answer were
 * removed by the owner on 2026-10-23 (docs/11, Gate 1).
 */
export function mayModelAnswer(input: {
  readonly aiEnabled: boolean;
  /** Whether the request was addressed to the loopback (`loopbackHost`). */
  readonly local: boolean;
  /** Whether a demonstration key exists for this account. */
  readonly demoKey: boolean;
  /** Whether the account has a connection of its own. */
  readonly connected: boolean;
}): boolean {
  return input.aiEnabled && ((input.local && input.demoKey) || input.connected);
}
