import { SHOWROOM_SECTIONS } from "@observer/contracts";

/**
 * WHAT THIS SCREEN CANNOT TELL YOU, WRITTEN DOWN.
 *
 * A usage screen is the easiest surface in this product to turn into a vanity
 * one, and the two ways it happens are both silent. A feature the instrument
 * cannot see is omitted, and the reader takes the register for the whole truth.
 * A figure with no denominator is printed, and the reader takes a share for a
 * measurement. Neither failure announces itself, so the screen announces them.
 *
 * These are not caveats attached to individual figures — every figure above
 * already carries its own denominator and its own absence treatment. This is
 * the region-level statement `docs/12-visual-autopsy.md` §9 argues for: the
 * limits of the instrument, stated ONCE, where a reader who has just read the
 * register will look for them.
 *
 * One line a limit, behind the instrument title's `i` (review, round 9: seven
 * headed paragraphs, some 210 words, scrolled inside the panel on camera). A
 * limit the screen already states in sight is not repeated here: an untimed
 * feature is the register's own unavailable band, and "underused" was a
 * statement of design, not of the instrument.
 *
 * ## Why the first note names no feature that does not exist
 *
 * The showroom's nine sections are the whole vocabulary. A brief asking for a
 * usage report on a sun study, a street walk or a financing calculator is
 * asking about features this build does not present and this product therefore
 * does not measure — and the honest answer is to say so plainly, not to invent
 * a row with a zero in it. A zero would say the feature exists and nobody used
 * it. It does not exist.
 */
export function Limits({
  baselineNote,
}: {
  /** Why nothing can be newly adopted this period; null where adoption is answered. */
  readonly baselineNote: string | null;
}) {
  return (
    <>
      <p>
        Only the {SHOWROOM_SECTIONS.length} features the showroom presents are measured; anything
        else is not measured, not zero.
      </p>
      <p>Completion: no event marks a feature finished or abandoned.</p>
      <p>Before a shortlist: not shown, as the shortlist count is not returned.</p>
      {baselineNote === null ? null : <p>Newly adopted: {baselineNote}</p>}
    </>
  );
}
