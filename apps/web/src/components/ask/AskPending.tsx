/**
 * IRIS COMPOSING AN ANSWER.
 *
 * The state between the question and the answer, and the reason it is a real
 * state rather than a decoration: the answer region is wrapped in a
 * `<Suspense>` boundary and this is its fallback, so it appears exactly while
 * the read is outstanding and never a millisecond longer. Against the
 * deterministic in-memory repository that is usually too short to see; against
 * the database repository this port is written for, it is the whole wait.
 *
 * ## What it deliberately does not do
 *
 * It does not animate a typing cursor, pulse three dots, or count anything up.
 * A model is not writing, and a shimmer that imitates one would be the screen
 * claiming a kind of work it is not doing — which is the same lie as a send
 * button with nothing behind it, told more prettily. Motion in this product has
 * four jobs (period change, selection, cross-highlight, evidence reveal) and
 * waiting is not one of them.
 *
 * What it does instead is say what is happening, in words, and repeat the
 * question so the reader can see that the right one was asked. `.ox-result` is
 * the sheet's solid statement panel rather than the dashed `.ox-empty` slot,
 * because a slot reads as "something belongs here and is missing" and this is a
 * screen doing exactly what it should.
 */
export function AskPending({
  question,
  projectLabel,
  periodLabel,
  preview = false,
}: {
  /** What was asked. Empty on a first load, where nothing was. */
  readonly question: string;
  readonly projectLabel: string;
  readonly periodLabel: string;
  /**
   * Held on screen so the state can be looked at in review.
   *
   * `docs/12-visual-autopsy.md` §9 is the record of what happens when a state
   * ships without anybody seeing it, and a fallback that resolves in under a
   * frame cannot be photographed. Reached only through `?demo=thinking`, and it
   * says on the page that it is being held — a preview that did not admit to
   * being one would be indistinguishable from a surface that had hung.
   */
  readonly preview?: boolean;
}) {
  return (
    <div className="ox-plane">
      {question.trim().length === 0 ? null : <p className="ox-turn-question">{question}</p>}

      <p className="ox-result">
        <span className="ox-chip" data-tone="human">
          <span className="ox-chip-mark" aria-hidden="true" />
          Composing
        </span>
        <span>
          Reading {projectLabel} over {periodLabel} and assembling the answer from the read models.
        </span>
      </p>

      {preview ? (
        <p className="ox-section-note">
          This state is being held open for review. It normally appears only while the read is
          outstanding, and it is not a model writing — nothing on this surface is.
        </p>
      ) : null}
    </div>
  );
}
