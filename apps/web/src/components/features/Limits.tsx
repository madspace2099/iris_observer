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
          The register covers all {SHOWROOM_SECTIONS.length} features the showroom presents.
          Anything else is not measured at all, not measured at zero.
        </p>
      </div>

      <div>
        <p className="ox-subhead">Completion, and abandonment</p>
        <p className="ox-section-note">
          No event marks a feature finished, so nothing here says one was completed or abandoned:
          only how long a stop lasted, how often it ended at once, and how often a presentation came
          back.
        </p>
      </div>

      <div>
        <p className="ox-subhead">Time spent, where the build does not record it</p>
        <p className="ox-section-note">
          {untimedFeatures.length === 0
            ? "Every feature opened in this period carried a recorded stay. An untimed stay would read as unavailable, never as zero."
            : `${untimedFeatures.join(", ")} were opened with no stay recorded: unavailable, never zero, and never ordered by stay.`}
        </p>
      </div>

      <div>
        <p className="ox-subhead">Newly adopted</p>
        <p className="ox-section-note">{baselineNote}</p>
      </div>

      <div>
        <p className="ox-subhead">Underused</p>
        <p className="ox-section-note">
          No feature is called underused: there is no target for how often one should be reached.
          The register&rsquo;s bottom is in view; where the line falls is the presenters&rsquo;
          call.
        </p>
      </div>

      <div>
        <p className="ox-subhead">What is opened before a unit is shortlisted</p>
        <p className="ox-section-note">
          Not shown: how many presentations shortlisted a unit is not returned, and a share without
          its denominator is not printed.
        </p>
      </div>
    </div>
  );
}
