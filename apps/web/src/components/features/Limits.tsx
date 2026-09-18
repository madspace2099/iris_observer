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
  untimedFeatures,
  baselineNote,
}: {
  /** Features the build did not time this period, in the read model's words. */
  readonly untimedFeatures: readonly string[];
  /** What adoption can and cannot say for this period. Decided by the screen. */
  readonly baselineNote: string;
}) {
  return (
    <div className="ox-cols" data-cols="2">
      <div>
        <p className="ox-subhead">Features outside this vocabulary</p>
        <p className="ox-section-note">
          The showroom presents {SHOWROOM_SECTIONS.length} named features and this register covers
          all of them. Anything else a building could be shown with is not measured at zero here —
          it is not measured at all, and it does not appear under an invented name.
        </p>
      </div>

      <div>
        <p className="ox-subhead">Completion, and abandonment</p>
        <p className="ox-section-note">
          The showroom emits no event for finishing a feature, so nothing on this screen says one
          was completed or abandoned. What the instrument can say is how long a stop lasted, how
          often it ended almost at once, and how often a presentation came back. Those are the
          columns you are reading.
        </p>
      </div>

      <div>
        <p className="ox-subhead">Time spent, where the build does not record it</p>
        <p className="ox-section-note">
          {untimedFeatures.length === 0
            ? "Every feature opened in this period carried a recorded stay. Where a build does not emit a timing event for a feature, the stay reads as unavailable in the register rather than as zero."
            : `${untimedFeatures.join(", ")} were opened and the build recorded no stay in them. Those cells read as unavailable rather than as zero, and no median, no glance share and no ordering by stay is offered for them.`}
        </p>
      </div>

      <div>
        <p className="ox-subhead">Newly adopted</p>
        <p className="ox-section-note">{baselineNote}</p>
      </div>

      <div>
        <p className="ox-subhead">Underused</p>
        <p className="ox-section-note">
          No feature is called underused here. Naming one requires an expectation to fall short of,
          and the product carries no target for how often a feature ought to be reached. The
          register is ordered by reach and its bottom is visible; where the line falls is a
          judgement for the people who present the building.
        </p>
      </div>

      <div>
        <p className="ox-subhead">What is opened before a unit is shortlisted</p>
        <p className="ox-section-note">
          The read model returns how often each feature was reached in the presentations that
          shortlisted a unit, and it does not return how many presentations those were. A share with
          no denominator is not a figure this product prints, so that comparison is left out rather
          than shown with the denominator missing.
        </p>
      </div>
    </div>
  );
}
