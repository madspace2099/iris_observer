/**
 * THE TWO MEETING SURFACES.
 *
 * The register — every showroom presentation in the period, filterable and
 * linkable — and one meeting reconstructed in the order it happened. They share
 * this folder rather than sitting beside their pages because they share a
 * vocabulary: an outcome, a follow-up state and a step kind each have to be
 * drawn the same way in both places, and a chip that means one thing on the
 * register and another on the meeting is two products.
 *
 * Everything here is a Server Component, and no prop anywhere is a function.
 * The filters are a GET form and the sequence is a list of links, so neither
 * surface needs a line of client script, and both survive being sent to
 * somebody exactly as they were read.
 */

export { MeetingRegister } from "./MeetingRegister";
export { MeetingReplayView } from "./MeetingReplayView";
export { MeetingJourney } from "./MeetingJourney";
export { MeetingOutcomes } from "./MeetingOutcomes";
export { Chip } from "./Chip";
export {
  parseMeetingFilters,
  meetingFilterFields,
  AGENT_PARAM,
  CHANNEL_PARAM,
  OUTCOME_PARAM,
  type MeetingSearch,
} from "./filters";
export {
  OUTCOME_TONES,
  FOLLOW_UP_TONES,
  STEP_EVENTS,
  STEP_LABEL_NAMES_ENTITY,
  type ChipTone,
} from "./vocabulary";
