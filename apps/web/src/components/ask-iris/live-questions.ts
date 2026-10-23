import type { CompanyKeyState } from "@/lib/credentials/company-keys";

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

/** The composer's lines, from what this request could actually spend. */
export interface ComposerNotices {
  /** The model a demonstration key answers with here, or null where none does. */
  readonly model: string | null;
  /** Gate 1, in view before the first question, wherever a model may word an answer. */
  readonly modelNotice: string | null;
  /** One quiet line about the company's key, only where no model answers. */
  readonly keyNote: string | null;
}

/**
 * WHICH MODEL THE COMPOSER NAMES, AND WHAT IT SAYS AROUND IT.
 *
 * A demonstration key, the company's (ADR-0043) before the owner's (ADR-0040),
 * is named only where the stream route would spend it: the language model on
 * and the request addressed to the loopback. An account's own connection is
 * named by the answer it writes. Where no model answers, a company with a key
 * this request cannot spend says so in one line, and a company without one
 * says so to its admin, the one reader who can add it. A member was told
 * another person had not added a key (review round 8): a line about someone
 * else, with nothing for the reader to do.
 */
export function composerNotices(input: {
  readonly aiEnabled: boolean;
  /** Whether the request was addressed to the loopback (`loopbackHost`). */
  readonly local: boolean;
  readonly companyModel: string | null;
  readonly demoModel: string | null;
  /** Whether the account has a connection of its own. */
  readonly connected: boolean;
  /** Null where the company key store is closed. */
  readonly company: CompanyKeyState | null;
}): ComposerNotices {
  const model = input.aiEnabled && input.local ? (input.companyModel ?? input.demoModel) : null;
  const asked = MODEL_WORDED.charAt(0).toUpperCase() + MODEL_WORDED.slice(1);
  const modelNotice = !input.aiEnabled
    ? null
    : model !== null
      ? `${asked} are worded by ${model}, a language model, from the figures Observer's read models compute. Every figure it writes in digits is checked against those results before it is shown.`
      : input.connected
        ? `${asked} may be worded by the language model connected to this account, from the figures Observer's read models compute. Every figure it writes in digits is checked against those results before it is shown.`
        : null;

  const company = modelNotice === null ? input.company : null;
  const keyNote =
    company === null
      ? null
      : company.key !== null
        ? `The OpenAI key for ${company.company} is used only on requests to localhost while this server's language model is on; answers here come from the read models.`
        : company.role === "admin"
          ? `You have not added an OpenAI key for ${company.company} yet; answers come from the read models. Add it in Settings.`
          : null;

  return { model, modelNotice, keyNote };
}
