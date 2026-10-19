/**
 * THE QUESTIONS ASK IRIS OFFERS TO ANSWER THROUGH THE ANALYSIS PIPELINE.
 *
 * The computed openings are prepared answers: the read models compose them
 * before anybody asks, and a click shows one. These are different in kind — each
 * runs the read-only analysis tools against the project in view, through
 * `/api/ask/stream`, and is worded by a language model only where one is
 * connected. They are generic on purpose: nothing here names a project, a unit
 * or a person, so every project is asked the same four things of its own data.
 *
 * The keyword router in `lib/ai/agent.ts` sends each of them to its analyses
 * without a model; `apps/web/test/ask.test.ts` holds that routing in place.
 */
export const LIVE_QUESTIONS: readonly string[] = Object.freeze([
  "What separates meetings that progressed from those that did not?",
  "Which agent's presentations progressed most, and how did they present?",
  "Where do presentations lose buyers?",
  "Which units draw the most attention, and do they convert?",
]);
