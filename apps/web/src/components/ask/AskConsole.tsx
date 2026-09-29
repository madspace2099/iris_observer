import {
  DEFAULT_LANGUAGE,
  plural,
  type AskSession,
  type Language,
  type PeriodPreset,
  type PluralForms,
  type Viewer,
} from "@observer/readmodels";

import { repository } from "@/lib/repository";
import { Empty, Failure } from "@/components/product";
import { AnswerSheet } from "./AnswerSheet";
import { AskComposer } from "./AskComposer";
import { AskOpenings } from "./AskOpenings";
import { answerableQuestions, findAnswer } from "./questions";

/** The questions offered. The Slovak and Hungarian forms are the ones a count takes standing alone. */
export const ASK_CONSOLE_PREPARED: PluralForms = {
  en: { one: "prepared question", other: "prepared questions" },
  sk: { one: "pripravená otázka", few: "pripravené otázky", other: "pripravených otázok" },
  hu: { one: "előkészített kérdés", other: "előkészített kérdés" },
};

/**
 * THE ASK IRIS CONSOLE — the prompt, the openings, and whatever was asked.
 *
 * Everything on this surface that depends on reading the project lives here,
 * and the page above it holds only what can be answered from the URL and the
 * project record. That split is what makes the composing state real: this
 * component is `async`, the page wraps it in a `<Suspense>` boundary with
 * `AskPending` as the fallback, and the fallback is therefore shown exactly
 * while `getAskSession` is outstanding.
 *
 * ## Every state this surface can be in, and where each one is decided
 *
 *   the read failed      `Failure`. A failure to load is stated as a failure,
 *                        never as an answer of nothing.
 *   nothing prepared     `Empty`. The read succeeded and returned no answers,
 *                        which is a real answer about a project with nothing in
 *                        the period.
 *   nothing asked yet    the openings, under a heading that says what they are.
 *                        This is the empty conversation, and it is not blank.
 *   asked and prepared   `AnswerSheet`, then the openings again so the next
 *                        question is one click away.
 *   asked and unprepared a plain statement that there is no prepared answer for
 *                        that question, and the list of questions that do have
 *                        one. Never a plausible answer to a question nobody
 *                        prepared: a correctly computed figure under the wrong
 *                        question is the one failure this product cannot
 *                        recover from.
 *
 * ## Why this reads the repository rather than taking a promise
 *
 * A page that awaited the session and passed the result down would have nothing
 * left to suspend on, and the composing state would be unreachable. A page that
 * created the promise and passed it down would have to hold an unhandled
 * rejection across a component boundary. Reading here keeps the failure inside
 * the same `try` that renders `Failure`, which is where a reader would look for
 * the explanation anyway.
 *
 * ## The review states
 *
 * `?demo=` holds a state open so somebody can look at it. `docs/12` §9 is the
 * record of a screen that shipped without anybody looking, and the two states
 * this surface cannot otherwise be photographed in are the answer (which needs
 * a question typed) and the failure (which needs the repository to break).
 * `e2e/observer-product.spec.ts` already captures `?demo=answer`, so the
 * convention is the suite's rather than this file's invention. Each held state
 * says on the page that it is being held.
 */
export async function AskConsole({
  viewer,
  tenantSlug,
  projectSlug,
  period,
  periodLabel,
  selection,
  question,
  demo,
  root,
  language = DEFAULT_LANGUAGE,
}: {
  readonly viewer: Viewer;
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly period: PeriodPreset;
  /** The period in the reader's words, for the states that read before the
   * session does — the failure, which has no context to quote. */
  readonly periodLabel: string;
  readonly selection: string | null;
  /** What the reader asked, straight from the URL. Empty when nothing was. */
  readonly question: string;
  /** A held review state: `answer` or `error`. Anything else is ignored. */
  readonly demo: string | null;
  /** The project root, `/{tenant}/{project}`. */
  readonly root: string;
  /** The words' language, asked of the repository and used here alike. */
  readonly language?: Language;
}) {
  const askPath = `${root}/ask`;

  let session: AskSession;
  try {
    if (demo === "error") throw new Error("Held open for review.");
    session = await repository.getAskSession(
      { viewer, tenantSlug, projectSlug, period, language },
      selection,
    );
  } catch {
    return (
      <div className="ox-plane">
        <Failure what="Ask IRIS" retry={{ label: "Ask again", href: askPath }} period={period} />
        {demo === "error" ? (
          <p className="ox-section-note">
            This failure is being held open for review. Nothing is wrong with the project; the read
            was refused on purpose so the state could be looked at.
          </p>
        ) : (
          <p className="ox-section-note">
            {periodLabel} could not be read for this project. Nothing above is a measurement.
          </p>
        )}
      </div>
    );
  }

  /*
   * The questions offered, and the questions that can be answered, are the same
   * list. `AskSession.suggestions` is the read model's own shortlist of them,
   * so it leads; the rest follow, because a reader who can see everything the
   * surface answers can tell what it does not answer, which is the more useful
   * half of the information.
   */
  const prepared = session.answers.map((answer) => answer.question);
  const offered = [
    ...session.suggestions.filter((suggestion) => prepared.includes(suggestion)),
    ...prepared.filter((asked) => !session.suggestions.includes(asked)),
  ];
  const answerable = answerableQuestions(session.answers);

  /*
   * `?demo=answer` asks the first prepared question on the reader's behalf, so
   * the answered state can be captured without a keystroke. It resolves through
   * exactly the same lookup as a typed question — there is no second path to
   * the answer, and so no second path that could show something the real one
   * would not.
   */
  const asked = demo === "answer" ? (offered[0] ?? "") : question;
  const answer = findAnswer(session.answers, asked);

  const composer = (
    <AskComposer
      action={askPath}
      context={session.context}
      period={period}
      question={asked}
      selection={selection}
      clearSelectionHref={selection === null ? null : askPath}
    />
  );

  if (session.answers.length === 0) {
    return (
      <div className="ox-plane">
        {composer}
        <Empty
          title="Nothing to answer from yet"
          note={`No presentation has been recorded on this project in ${session.context.periodLabel.toLowerCase()}, so there is nothing for a question to be answered against. This is the period's answer, not a gap in it.`}
        />
      </div>
    );
  }

  const openings = (
    <div className="ox-plane">
      <div className="ox-section-head">
        <h2 className="ox-section-title">
          {answer === undefined ? "What this project can answer" : "Ask something else"}
        </h2>
        <span className="ox-n">
          {offered.length} {plural(language, offered.length, ASK_CONSOLE_PREPARED)}
        </span>
      </div>
      <p className="ox-section-note">
        These are the questions {session.context.projectLabel} holds a composed answer for over{" "}
        {session.context.periodLabel.toLowerCase()}. Asking anything else is allowed and will say so
        plainly rather than guess.
      </p>
      <AskOpenings
        action={askPath}
        questions={offered}
        period={period}
        selection={selection}
        label="Questions this project can answer"
      />
    </div>
  );

  return (
    <>
      <div className="ox-plane">{composer}</div>

      {asked.trim().length === 0 ? null : answer === undefined ? (
        <div className="ox-plane">
          <p className="ox-turn-question">{asked}</p>
          <p className="ox-result">
            <span className="ox-chip" data-tone="none">
              <span className="ox-chip-mark" aria-hidden="true" />
              No prepared answer
            </span>
            <span>
              Observer composes its answers from the read models rather than writing them, so it
              answers a fixed set of questions on each project and says nothing about the rest. This
              question is not one of them.
            </span>
          </p>
        </div>
      ) : (
        <div className="ox-plane">
          <div className="ox-thread">
            <AnswerSheet
              answer={answer}
              period={period}
              periodLabel={session.context.periodLabel}
              askAction={askPath}
              selection={selection}
              answerable={answerable}
            />
          </div>
          {demo === "answer" ? (
            <p className="ox-section-note">
              This answer is being held open for review: the first prepared question was asked on
              the reader&rsquo;s behalf. It is the same answer a reader gets by pressing the same
              row.
            </p>
          ) : null}
        </div>
      )}

      {openings}
    </>
  );
}
