import type { FollowUpState, ReplayStep } from "@observer/readmodels";
import type { MeetingOutcome } from "@observer/contracts";

/**
 * THE WORDS AND THE MARKS THE TWO MEETING SURFACES USE.
 *
 * Three maps, kept out of the components that read them, for the reason every
 * other vocabulary in this repository is kept in one place: the register and
 * the replay both render an outcome, and an outcome that is a settled square on
 * one screen and a waiting ring on the other is two products.
 *
 * Nothing here invents a label. `OUTCOME_LABELS` in `@observer/contracts` and
 * `FOLLOW_UP_LABELS` in `@observer/readmodels` already own the words, and every
 * row carries its own `outcomeLabel` and `followUpLabel` besides. What is
 * chosen here is only the SHAPE — which of the stylesheet's six chip tones a
 * state is drawn in — and the shape is a design decision that has to be made
 * somewhere and made once.
 */

/**
 * The six tones `observer-product.css` §9 draws, as a type.
 *
 * Written out rather than imported: the stylesheet is not a TypeScript module
 * and there is nothing to import. A tone the sheet does not draw would fall
 * through to the unstyled `.ox-chip` base rule, which is a border and no mark,
 * so the union is narrowed here to make that a compile error rather than a
 * quiet visual one.
 */
export type ChipTone = "good" | "watch" | "human" | "poor" | "settled" | "none";

/**
 * The agent's recorded outcome, as a shape.
 *
 * Two decisions in here are worth arguing with, so both are stated.
 *
 * **`not_interested` is not drawn in the poor tone.** The sheet's poor tone is
 * a triangle and its meaning is "wrong". A buyer who decided against the scheme
 * is not a failure of the meeting and is not a defect in the data — it is a
 * recorded loss, and `docs/adr` on the outcome vocabulary is explicit that
 * without a recorded loss there is no denominator and "still open" cannot be
 * told apart from "dead". Painting it red would teach an agency to stop
 * recording it, which would cost the product the one figure that makes a
 * conversion rate true. It takes the settled square, alongside
 * `presentation_only`: both are closed, and the chip carries its own word so
 * the two are never confused for one another.
 *
 * **`skipped` is the unmeasured bar, not a zero.** An outcome nobody recorded
 * is an absence, and the sheet's `none` tone is the only one that says so.
 */
export const OUTCOME_TONES: Readonly<Record<MeetingOutcome, ChipTone>> = {
  purchase: "good",
  reservation: "good",
  interested: "watch",
  follow_up_needed: "watch",
  presentation_only: "settled",
  not_interested: "settled",
  skipped: "none",
};

/**
 * Whether anybody is owed a call, as a shape.
 *
 * `unavailable` is deliberately absent from this map. A follow-up state of
 * `unavailable` means no CRM is connected to the project, which is not a state
 * of the meeting at all — it is a state of the region, stated once above the
 * register by `Unavailable` and drawn per row with the missing treatment
 * `Figure` uses. Giving it a chip tone here would have made it look like a
 * seventh kind of answer instead of the absence of one, and would have repeated
 * the reason on every row, which is the exact defect `docs/12-visual-autopsy.md`
 * §9 records.
 */
export const FOLLOW_UP_TONES: Readonly<Record<Exclude<FollowUpState, "unavailable">, ChipTone>> = {
  required: "watch",
  not_required: "settled",
  not_recorded: "none",
};

/**
 * What each replay step IS, as opposed to what it happened to.
 *
 * `ReplayStep` carries a `kind` and a `label`, and the label is the ENTITY —
 * the section's name, the unit's code, the outcome's word. On the old replay
 * the kind reached the reader as a glyph in a legend-less column; on a timeline
 * it has to reach them as a word, so that a row reads "Unit shortlisted ·
 * A-0304" rather than "Shortlisted" beside a code in small print.
 *
 * The twelve entries are the twelve members of `ReplayStep["kind"]` and the
 * `Record` makes adding a thirteenth a type error here, which is the point:
 * a step kind with no word would render as a bare entity and the reader would
 * have no way to tell an opened floor plan from an opened unit.
 *
 * Two of the twelve are worth noting. `filter` is in the union and the current
 * showroom build never emits one — the replay's own `gaps` say so in words —
 * and `share` belongs to WEB IRIS rather than to the room. Both are given
 * words anyway: a kind that arrives one day and finds no word here would render
 * as an unlabelled entity on a customer screen.
 */
/**
 * Whether a step's own `label` is the ENTITY or is already the ACT.
 *
 * `ReplayStep.label` is not one thing. On five kinds it names the entity — the
 * section, the unit code, the environment preset, the outcome word, the filter
 * — and the event has to be supplied beside it from {@link STEP_EVENTS} for the
 * row to read as a journey. On the other seven the read model has already
 * written the act into the label ("Shortlisted", "Floor plan opened",
 * "Compared A-0304, B-0201") and the entity is in `detail`; prefixing those
 * with the event word would produce "Unit shortlisted · Shortlisted", which is
 * the kind of small doubling that makes a screen look generated.
 *
 * This is a table rather than a rule inferred from the fields, and a table is
 * the honest form: which of the two a label is depends on what the read model's
 * author wrote, not on anything the shape can be asked at runtime. A thirteenth
 * kind is a compile error here as well as in {@link STEP_EVENTS}, which is the
 * only way this stays true.
 */
export const STEP_LABEL_NAMES_ENTITY: Readonly<Record<ReplayStep["kind"], boolean>> = {
  section: true,
  unit: true,
  environment: true,
  outcome: true,
  filter: true,
  favourite: false,
  pdf: false,
  balcony: false,
  floor_cut: false,
  screenshot: false,
  share: false,
  compare: false,
};

export const STEP_EVENTS: Readonly<Record<ReplayStep["kind"], string>> = {
  section: "Section entered",
  unit: "Unit opened",
  favourite: "Unit shortlisted",
  pdf: "Document opened",
  balcony: "Balcony view",
  floor_cut: "Floor cut",
  screenshot: "Screenshot created",
  compare: "Comparison opened",
  share: "Unit shared",
  environment: "Environment changed",
  filter: "Filter applied",
  outcome: "Outcome recorded",
};
