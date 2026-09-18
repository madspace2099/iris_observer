/**
 * ASK IRIS — the composition, in pieces.
 *
 * Seven files, and the split is by STATE rather than by shape. The three routes
 * under `/ask` are three views of one thing — a question, the answer composed
 * for it, and the record of both — so what they share is not a layout but the
 * rules about what may be said: that no model wrote any of this, that a
 * question with no prepared answer is told so plainly, that a control with
 * nothing behind it is not drawn as ready, and that the figures under an answer
 * are measurements and belong on the paper ground.
 *
 *   questions      matching a typed question to a prepared answer. Strings
 *                  only: no metric, no repository, no join.
 *   AnswerSheet    one answer, straddling the seam: the claim on graphite, the
 *                  measurements on paper.
 *   ThreadList     the register of earlier questions.
 *   AskComposer    the prompt card, with a send control that works and a
 *                  microphone that says why it cannot.        (see below)
 *   AskOpenings    the suggestion rows, as submit buttons that ask.  (see below)
 *   AskPending     the composing state, as a Suspense fallback.      (see below)
 *   AskConsole     which of those states this reader is in.          (see below)
 *
 * Everything here is a Server Component. Nothing takes a callback, nothing
 * holds state, and nothing touches browser storage — the question, the period
 * and the selection all live in the URL, which is the only place a surface
 * whose whole value is that an answer can be shown to somebody else may keep
 * them.
 *
 * ## FOUR OF THESE CURRENTLY HAVE NO CALLER, AND THAT IS RECORDED RATHER THAN
 * ## QUIETLY TIDIED
 *
 * `AskComposer`, `AskOpenings`, `AskPending` and `AskConsole` were written for
 * `/ask` against the approved `.irs-ask*` composition in `iris-shell.css`.
 * While they were being written, `/ask/page.tsx` was rewritten against a design
 * export the user delivered separately, which lives in
 * `apps/web/src/components/ask-iris/` and `packages/ui/src/ask-iris.css`. The
 * doctrine's own source hierarchy puts a decision the user has just made above
 * everything else in this repository, so that page stands and these four are
 * not wired back in over it.
 *
 * They are kept rather than deleted because the reconciliation is somebody
 * else's decision to make and this working tree is not under version control,
 * so a deletion here is not recoverable. Nothing imports them, so they cost
 * nothing at runtime — and the two surfaces that DO use this directory
 * (`/ask/history` and `/ask/[threadId]`) import their pieces by path rather
 * than through this barrel, so no unused module is pulled into their graphs.
 *
 * `questions.ts` is shared: the delivered-design page imports `findAnswer` from
 * it, which is the one piece of this work the two versions agree on.
 */

export { AnswerSheet } from "./AnswerSheet";
export { AskComposer } from "./AskComposer";
export { AskConsole } from "./AskConsole";
export { AskOpenings } from "./AskOpenings";
export { AskPending } from "./AskPending";
export { ThreadList } from "./ThreadList";
export {
  answerableQuestions,
  findAnswer,
  glyphFor,
  isAnswerable,
  normaliseQuestion,
  type OpeningGlyph,
} from "./questions";
