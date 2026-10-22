import { defineMetric, type MetricDefinition } from "../definition";
import {
  AGENT_MIN_SAMPLE,
  NOT_ENOUGH,
  NO_CRM,
  NO_MEETINGS,
  NO_SHOWROOM,
  insufficient,
} from "./shared";

/**
 * Sales Flow — how selling actually works here.
 *
 * The ladder spans three systems, so no CRM report can draw it. The times
 * matter as much as the conversions: Stano's planning question was "how long
 * does it take to sell a flat", and the answer that lets him plan a campaign
 * is a range, not an average.
 */

export const stageCounts = defineMetric({
  id: "flow.stage_counts",
  displayName: "Pipeline by stage",
  businessDefinition: "How many buyers stand on each rung of the ladder right now.",
  kind: "distribution",
  calculation:
    "Distinct contacts at each authoritative deal stage at the end of the period: lead, meeting, negotiation, offer, reservation, purchase. Lost is shown alongside, not hidden. Intent level is never a rung here — see the intent family.",
  numerator: "contacts at a stage",
  denominator: "contacts in the pipeline",
  exclusions: ["erased contacts", "deals closed before the period began"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "point_in_time",
  requiredFacts: ["meeting.attended", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "The pipeline is empty.",
    insufficient: NOT_ENOUGH,
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const stageConversion = defineMetric({
  id: "flow.stage_conversion",
  displayName: "Conversion between stages",
  businessDefinition: "The share of buyers who move forward from each rung to the next.",
  kind: "distribution",
  calculation:
    "For each adjacent pair of stages, buyers reaching the later stage divided by buyers who reached the earlier one, cohorted by when they entered rather than by when they converted.",
  numerator: "contacts reaching the later stage",
  denominator: "contacts who reached the earlier stage",
  exclusions: ["cohorts still too recent for the typical transition time"],
  dimensions: ["project", "period", "agent", "agency", "rooms", "price_band"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 20,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: NO_MEETINGS,
    insufficient: insufficient(20, "buyers per stage"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager"],
});

function funnelStep(id: string, displayName: string, from: string, to: string, minimum: number) {
  return defineMetric({
    id,
    displayName,
    businessDefinition: `Share of buyers who moved from ${from} to ${to}.`,
    kind: "ratio",
    calculation: `Contacts reaching ${to} divided by contacts who reached ${from}, cohorted on entry to ${from}.`,
    numerator: `contacts reaching ${to}`,
    denominator: `contacts reaching ${from}`,
    exclusions: ["cohorts too recent to have had time to convert"],
    dimensions: ["project", "period", "agent", "agency", "rooms", "price_band"],
    timeWindow: "period",
    requiredFacts: ["meeting.attended", "deal.stage.changed"],
    requiredCrmFields: ["deal.stage"],
    requiredUnitAttributes: [],
    minimumSampleSize: minimum,
    comparison: "previous_quarter",
    evidenceTier: "observed_sequence",
    states: {
      empty: `No buyer reached ${from} in this period.`,
      insufficient: insufficient(minimum, "buyers"),
      unavailable: NO_CRM,
    },
    drillTo: "deals",
    roles: ["developer", "agency_manager"],
  });
}

export const viewingToOffer = funnelStep(
  "flow.viewing_to_offer",
  "Viewing to Offer",
  "an attended viewing",
  "a price offer",
  20,
);

export const offerToReservation = funnelStep(
  "flow.offer_to_reservation",
  "Offer to Reservation",
  "a price offer",
  "a signed reservation",
  15,
);

export const reservationToSale = funnelStep(
  "flow.reservation_to_sale",
  "Reservation to Sale",
  "a signed reservation",
  "a completed sale",
  10,
);

/* --- time, which is the half a CRM report never shows -------------------- */

export const timeBetweenMeetings = defineMetric({
  id: "flow.time_between_meetings",
  displayName: "Time between meetings",
  businessDefinition: "How long a buyer waits between one showroom meeting and the next.",
  kind: "duration",
  calculation:
    "Median and 80th percentile days between consecutive attended meetings for the same contact on the same project.",
  numerator: "days between consecutive meetings",
  denominator: "consecutive meeting pairs",
  exclusions: ["contacts with a single meeting", "gaps spanning a recorded terminal outcome"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "trailing_90d",
  requiredFacts: ["meeting.attended"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 15,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No buyer has had a second meeting yet.",
    insufficient: insufficient(15, "meeting pairs"),
    unavailable: "No showroom data has arrived for this project yet.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const timeInStage = defineMetric({
  id: "flow.time_in_stage",
  displayName: "Time in stage",
  businessDefinition: "How long buyers sit on each rung before moving.",
  kind: "duration",
  calculation:
    "Median and 80th percentile days between entering a stage and leaving it, per stage. Deals still in a stage are included as right-censored and reported separately, so a long-stuck deal is not invisible simply because it never moved.",
  numerator: "days in stage",
  denominator: "stage entries",
  exclusions: ["stage changes produced by a CRM backfill rather than by a real transition"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "trailing_90d",
  requiredFacts: ["deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 15,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No stage transitions recorded.",
    insufficient: insufficient(15, "stage entries"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager"],
});

export const salesCycleDuration = defineMetric({
  id: "flow.sales_cycle_duration",
  displayName: "Total sales-cycle duration",
  businessDefinition: "First contact to completed sale, end to end.",
  kind: "duration",
  calculation:
    "Median and 80th percentile days from the buyer's first recorded interaction on the project — online or in the showroom — to purchase.",
  numerator: "days from first interaction to purchase",
  denominator: "completed sales",
  exclusions: ["open deals", "sales whose first interaction predates the project's data"],
  dimensions: ["project", "period", "agency", "rooms", "price_band"],
  timeWindow: "trailing_90d",
  requiredFacts: ["meeting.attended", "online.session.observed", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 10,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No completed sale yet.",
    insufficient: insufficient(10, "completed sales"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager"],
});

/*
 * THE CYCLE AS THE SHOWROOM CAN MEASURE IT (R05-4, R07-4, Máté 2026-10-02).
 *
 * `flow.sales_cycle_duration` starts at a buyer's first contact, online or in
 * the showroom, and needs WEBIRIS sessions that do not reach Observer yet. Until
 * they do, the cycle is measured from the unit's first recorded showroom
 * opening, and every surface that shows it says so. A separate metric, so the
 * full-channel one keeps its meaning for the day its inputs arrive.
 */
export const showroomSaleCycle = defineMetric({
  id: "flow.showroom_sale_cycle",
  displayName: "Sales cycle, from the showroom",
  businessDefinition:
    "How long a sold unit took from its first recorded showroom opening to the CRM's Sold stage.",
  kind: "duration",
  calculation:
    "Median and 80th percentile days from the unit's earliest showroom opening anywhere in the visible history to the date the CRM states the deal entered the Sold stage, for sales whose Sold date falls in the window. Computed by the shared calculator in `sale-cycle.ts`. The two ends are on two clocks — the opening is observed by the showroom, the Sold date is stated by the CRM — and both are named.",
  numerator: "days from first showroom opening to the Sold stage",
  denominator: "sales examined",
  exclusions: [
    "sales the CRM gives no Sold date",
    "units with no showroom opening in the visible history",
    "openings after the sale",
    "units whose first opening is the first moment the data covers",
  ],
  dimensions: ["project", "period"],
  timeWindow: "period",
  requiredFacts: ["unit.viewed", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 10,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No sale was recorded in this window.",
    insufficient: insufficient(10, "measured sales"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager"],
});

export const stalledOpportunities = defineMetric({
  id: "flow.stalled_opportunities",
  displayName: "Stalled opportunities",
  businessDefinition:
    "Open deals that have sat in their current stage longer than the project's own 80th percentile.",
  kind: "count",
  calculation:
    "Open deals whose time in the current stage exceeds the project's 80th percentile for that stage. The threshold is the project's own history rather than a fixed number of days, because stages differ and projects differ.",
  numerator: "deals past the stage's 80th percentile",
  denominator: null,
  exclusions: ["terminal deals", "stages with too little history to set a threshold"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "point_in_time",
  requiredFacts: ["deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 15,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Nothing is stuck beyond the usual.",
    insufficient: "Not enough stage history to know what 'stuck' means here yet.",
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager", "sales_agent"],
});

/**
 * IRIS-assisted sales.
 *
 * The one question a developer asks of the showroom itself: of the flats that
 * sold, how many had just been shown in it. An observed sequence and nothing
 * more — the buyer of the deal is not linked to the visitor in the room
 * (ADR-0011), so this is not an attributed conversion and carries no
 * attribution rule. The window and the minimum are `DEFAULT_IRIS_ASSIST_POLICY`.
 */
export const irisAssistedSales = defineMetric({
  id: "flow.iris_assisted_sales",
  displayName: "IRIS-assisted sales",
  businessDefinition:
    "Of the sales the CRM dates, the share whose unit was opened in an IRIS presentation in the 72 hours before the reservation or purchase date.",
  kind: "ratio",
  calculation:
    "Deals at reservation or purchase that name a unit and can be dated, whose unit was opened in a showroom meeting that started no more than 72 hours before that date, divided by all such deals. The date is the stage instant the CRM states; where it states none, the sync that first saw the deal on the stage, and only for a move Observer witnessed between two syncs. The lag from the last showing to the date is reported for every sale, inside the window or not.",
  numerator: "dated sales whose unit was opened in IRIS within 72 hours before the stage date",
  denominator:
    "deals at reservation or purchase that name a unit and carry a stage date, stated by the CRM or witnessed by a sync",
  exclusions: [
    "deals with no stage instant whose move onto the stage Observer did not witness, which cannot be placed in time",
    "deals that name no unit",
    "showings after the stage date",
  ],
  dimensions: ["project", "period"],
  timeWindow: "all_time",
  requiredFacts: ["unit.viewed", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit", "deal.stage_date"],
  requiredUnitAttributes: [],
  minimumSampleSize: 5,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "The CRM dates no reservation or purchase yet.",
    insufficient: insufficient(5, "dated sales"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager"],
});

/**
 * IRIS-led sales (ADR-0049).
 *
 * The owner's question in the owner's words, answered as a rule about order:
 * of the period's sales, how many had their flat opened in IRIS before the
 * status change, and how often and how long before. The 72-hour verdict above
 * is one column of it. An observed sequence, for `irisAssistedSales`' reason:
 * the buyer is not linked to the visitor, so there is no attribution rule.
 */
export const irisLedSales = defineMetric({
  id: "flow.iris_led_sales",
  displayName: "IRIS-led sales",
  businessDefinition:
    "Of the sales the CRM states in the period, the share whose flat was opened in an IRIS presentation at any time before the status change.",
  kind: "ratio",
  calculation:
    "Deals the CRM states at reservation or purchase, and flats a catalogue sync saw change to reserved or sold where the CRM holds no sale for them, whose dated change falls in the period and names a flat; of those, the ones a showroom meeting opened at or before the change, over all of them. The date is the CRM's stage instant, else the sync that first saw the change, and only for a change Observer witnessed. Showings are read across the project's whole history, and each sale states how many came first, in the period or before it, the first and last, and the days from the last to the change.",
  numerator: "dated sales in the period whose flat was opened in IRIS before the change",
  denominator:
    "deals at reservation or purchase, and witnessed availability changes to reserved or sold, dated in the period and naming a flat",
  exclusions: [
    "sales with no date Observer could use, which no period can hold",
    "sales that name no flat",
    "flats the catalogue lists as reserved or sold with no date for the change",
    "showings after the change",
  ],
  dimensions: ["project", "period", "agent"],
  timeWindow: "period",
  requiredFacts: ["unit.viewed", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit", "deal.stage_date"],
  requiredUnitAttributes: ["status"],
  minimumSampleSize: 5,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "The CRM states no sale dated in this period.",
    insufficient: insufficient(5, "dated sales"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager"],
});

/*
 * WHY MEETINGS ENDED "NOT INTERESTED" (ADR-0053, the owner, 2026-10-22).
 *
 * Which presenter each was, how long they ran, what they opened, and what they
 * reached, each against the period's other recorded meetings. A description of
 * a group at its sample size: the comparison is an association, never a cause,
 * made only at AGENT_MIN_SAMPLE a side, as Presentation DNA makes its own.
 * The showroom records openings, not clicks or taps, so no click count exists.
 */
const SALES_FLOW_ROLES = ["developer", "agency_manager", "sales_agent", "madspace_admin"] as const;
const NO_GROUP = 'No meeting ended "not interested" in this period.';

export const notInterestedByAgent = defineMetric({
  id: "flow.not_interested_by_agent",
  displayName: "Not interested, by presenter",
  businessDefinition:
    'Of a presenter\'s meetings with an outcome recorded in the period, how many ended "not interested".',
  kind: "ratio",
  calculation:
    "Per presenter, the meetings whose recorded outcome is not interested over that presenter's meetings with any outcome recorded in the period. The count is always shown; the rate only from the minimum sample up. Presenters keep the roster's order and are never ranked.",
  numerator: "the presenter's meetings recorded as not interested",
  denominator: "the presenter's meetings with an outcome recorded",
  exclusions: ["meetings with no outcome recorded", "presenters with no meeting in the period"],
  dimensions: ["project", "period", "agent", "outcome"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended", "meeting.outcome.recorded"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: AGENT_MIN_SAMPLE,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: NO_GROUP,
    insufficient: insufficient(AGENT_MIN_SAMPLE, "recorded meetings for this presenter"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: SALES_FLOW_ROLES,
});

export const notInterestedLength = defineMetric({
  id: "flow.not_interested_length",
  displayName: "Length of the not-interested meetings",
  businessDefinition:
    'How long the meetings that ended "not interested" ran, against the period\'s other recorded meetings.',
  kind: "duration",
  calculation:
    "The median length of the period's meetings recorded as not interested, and their middle half (the 25th to the 75th percentile, nearest rank); the same of every other meeting with an outcome recorded. The two are set side by side only where each side has the minimum sample of timed meetings, the floor Presentation DNA keeps on its outcome cohorts; below it the group's own median is stated alone, with its sample and how far short it is.",
  numerator: "meeting length",
  denominator: "timed meetings on each side",
  exclusions: ["meetings the source could not time", "meetings with no outcome recorded"],
  dimensions: ["project", "period", "outcome"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended", "meeting.outcome.recorded"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: AGENT_MIN_SAMPLE,
  comparison: "none",
  evidenceTier: "statistical_association",
  states: {
    empty: NO_GROUP,
    insufficient: insufficient(AGENT_MIN_SAMPLE, "timed meetings on a side"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: SALES_FLOW_ROLES,
});

export const notInterestedInteractions = defineMetric({
  id: "flow.not_interested_interactions",
  displayName: "What the not-interested meetings opened",
  businessDefinition:
    'How many showroom features and apartments a typical meeting that ended "not interested" opened, against the period\'s other recorded meetings.',
  kind: "distribution",
  calculation:
    "Two counts per meeting: features opened, every opening of a showroom section with a return to one counted again; and apartments opened, the distinct units viewed. The median of each over the meetings recorded as not interested and over every other meeting with an outcome recorded. The two are set side by side only where each side has the minimum sample, the floor Presentation DNA keeps on its outcome cohorts; below it the group's own median is stated alone. The showroom records openings, not clicks or taps, so no click count is made.",
  numerator: "features or apartments opened in a meeting",
  denominator: "meetings on each side",
  exclusions: ["meetings with no outcome recorded"],
  dimensions: ["project", "period", "outcome"],
  timeWindow: "period",
  requiredFacts: ["project.section.viewed", "unit.viewed", "meeting.outcome.recorded"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: AGENT_MIN_SAMPLE,
  comparison: "none",
  evidenceTier: "statistical_association",
  states: {
    empty: NO_GROUP,
    insufficient: insufficient(AGENT_MIN_SAMPLE, "meetings on a side"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: SALES_FLOW_ROLES,
});

export const notInterestedReach = defineMetric({
  id: "flow.not_interested_reach",
  displayName: "What the not-interested meetings reached",
  businessDefinition:
    'For each of six things a presentation can do, the share of the meetings that ended "not interested" that did it, against the share of the period\'s other recorded meetings.',
  kind: "ratio",
  calculation:
    "Per behaviour — reached Surroundings, opened Amenities, opened three or more units, shortlisted anything, used Compare, returned to a section — the meetings on a side that did it over the meetings on that side, each behaviour on its own. Drawn widest gap first, and only where each side has the minimum sample, the floor Presentation DNA keeps on its outcome cohorts.",
  numerator: "meetings on a side that did it",
  denominator: "meetings on that side",
  exclusions: ["meetings with no outcome recorded"],
  dimensions: ["project", "period", "outcome"],
  timeWindow: "period",
  requiredFacts: [
    "project.section.viewed",
    "unit.viewed",
    "unit.favourited",
    "meeting.outcome.recorded",
  ],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: AGENT_MIN_SAMPLE,
  comparison: "none",
  evidenceTier: "statistical_association",
  states: {
    empty: NO_GROUP,
    insufficient: insufficient(AGENT_MIN_SAMPLE, "meetings on a side"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: SALES_FLOW_ROLES,
});

/*
 * WHAT CHANGED, AS A SCREEN OF FIGURES (ADR-0060, the owner, 2026-10-22).
 *
 * Eight figures of the period's meetings, each set against the same figure
 * computed seven calendar days earlier, the period as it read that day. The
 * first three stood on Sales Flow as "what changed" before; the other five are
 * what else the IRIS showroom sends. The owner asked for "median clicks per
 * meeting": the showroom records openings and actions, not clicks or taps
 * (docs/03-event-map.md §7 removed the client's click map), so the figure is
 * the openings and actions it does record, under that name.
 *
 * An arrow needs AGENT_MIN_SAMPLE meetings that can answer the figure in both
 * windows, the floor Presentation DNA keeps on its cohorts; below it the
 * figure is raw and the shortfall is stated.
 */
function changeFigure(
  definition: Pick<
    MetricDefinition,
    | "id"
    | "displayName"
    | "businessDefinition"
    | "kind"
    | "calculation"
    | "numerator"
    | "denominator"
    | "exclusions"
    | "requiredFacts"
  >,
) {
  return defineMetric({
    ...definition,
    dimensions: ["project", "period"],
    timeWindow: "period",
    requiredCrmFields: [],
    requiredUnitAttributes: [],
    minimumSampleSize: AGENT_MIN_SAMPLE,
    comparison: "seven_days_earlier",
    evidenceTier: "observed_sequence",
    states: {
      empty: NO_MEETINGS,
      insufficient: insufficient(AGENT_MIN_SAMPLE, "meetings in a window"),
      unavailable: NO_SHOWROOM,
    },
    drillTo: "meetings",
    roles: SALES_FLOW_ROLES,
  });
}

export const compareUse = changeFigure({
  id: "flow.compare_use",
  displayName: "Compare mode used",
  businessDefinition: "The share of the period's meetings that opened Compare mode.",
  kind: "ratio",
  calculation:
    "Meetings with at least one opening of the Compare section over every meeting in the window. Up is drawn as good: a comparison is the buyer weighing flats against each other.",
  numerator: "meetings that opened Compare",
  denominator: "meetings in the window",
  exclusions: [],
  requiredFacts: ["meeting.attended", "project.section.viewed"],
});

export const surroundingsEarly = changeFigure({
  id: "flow.surroundings_early",
  displayName: "Surroundings, early",
  businessDefinition:
    "The share of the period's meetings that opened Surroundings in the opening third of the presentation.",
  kind: "ratio",
  calculation:
    "Meetings whose first opening of Surroundings falls among the first third of their section openings (at least the first), over every meeting in the window. Its arrow is neutral: an order of telling earns no direction.",
  numerator: "meetings that opened Surroundings in their opening third",
  denominator: "meetings in the window",
  exclusions: [],
  requiredFacts: ["meeting.attended", "project.section.viewed"],
});

export const presentationDepth = changeFigure({
  id: "flow.presentation_depth",
  displayName: "Presentation depth",
  businessDefinition: "How many section openings a typical meeting of the period made.",
  kind: "count",
  calculation:
    "The median, over the window's meetings, of each meeting's section openings, a return to a section counted again. Its arrow is neutral: more openings can be going further or going back over ground.",
  numerator: "section openings in a meeting",
  denominator: "meetings in the window",
  exclusions: [],
  requiredFacts: ["meeting.attended", "project.section.viewed"],
});

export const interactionsPerMeeting = changeFigure({
  id: "flow.interactions_per_meeting",
  displayName: "Interactions per meeting",
  businessDefinition:
    "How many openings and actions the showroom recorded in a typical meeting of the period.",
  kind: "count",
  calculation:
    "Per meeting: sections opened (a return to one not counted again), flats opened, floor plans opened, floor cuts shown, balcony views, flats favourited and screenshots taken; the median over the window's meetings. Up is drawn as good: more of the buyer's engagement, which is why going back over a section is left out. The showroom records these, not clicks or taps, so no click count is made.",
  numerator: "openings and actions recorded in a meeting",
  denominator: "meetings in the window",
  exclusions: [
    "clicks and taps, which the showroom does not record",
    "a return to a section already opened",
  ],
  requiredFacts: [
    "meeting.attended",
    "project.section.viewed",
    "unit.viewed",
    "unit.material.opened",
    "unit.examined.floor_cut",
    "unit.examined.balcony",
    "unit.favourited",
    "visual.captured",
  ],
});

export const presentationLength = changeFigure({
  id: "flow.presentation_length",
  displayName: "Presentation length",
  businessDefinition: "How long a typical meeting of the period ran.",
  kind: "duration",
  calculation:
    "The median of the presentation's own length, Start Presentation to End Presentation, over the window's meetings the source could time. Its arrow is neutral, as Typical length's is: longer is not better.",
  numerator: "presentation length",
  denominator: "timed meetings in the window",
  exclusions: ["meetings the source could not time"],
  requiredFacts: ["meeting.attended"],
});

export const topFeature = changeFigure({
  id: "flow.top_feature",
  displayName: "Top feature",
  businessDefinition: "The showroom section the period's presentations spent the most time in.",
  kind: "ratio",
  calculation:
    "Each section's timed seconds summed over the window's fully timed meetings; the section with the most, and its share of all of them. A tie goes to the section more meetings opened, then to the inventory's order. Not named below the minimum sample; its arrow is none, as a name does not rise or fall, and the reading says whether it was the top seven days earlier.",
  numerator: "the top section's timed seconds",
  denominator: "every section's timed seconds in the window's fully timed meetings",
  exclusions: ["meetings with any step the source could not time"],
  requiredFacts: ["meeting.attended", "project.section.viewed"],
});

export const screenshotsPerMeeting = changeFigure({
  id: "flow.screenshots_per_meeting",
  displayName: "Screenshots per meeting",
  businessDefinition: "How many screenshots a typical meeting of the period took.",
  kind: "count",
  calculation:
    "The median, over the window's meetings, of the screenshots each took. Up is drawn as good: a capture is a view the buyer wanted to take away.",
  numerator: "screenshots taken in a meeting",
  denominator: "meetings in the window",
  exclusions: [],
  requiredFacts: ["meeting.attended", "visual.captured"],
});

export const favouritesPerMeeting = changeFigure({
  id: "flow.favourites_per_meeting",
  displayName: "Favourites per meeting",
  businessDefinition: "How many flats a typical meeting of the period favourited.",
  kind: "count",
  calculation:
    "The median, over the window's meetings, of the flats each favourited. Up is drawn as good: a favourite is a flat the buyer singled out.",
  numerator: "flats favourited in a meeting",
  denominator: "meetings in the window",
  exclusions: [],
  requiredFacts: ["meeting.attended", "unit.favourited"],
});

export const CHANGE_FIGURES = [
  compareUse,
  surroundingsEarly,
  presentationDepth,
  interactionsPerMeeting,
  presentationLength,
  topFeature,
  screenshotsPerMeeting,
  favouritesPerMeeting,
] as const;

export const FLOW_METRICS = [
  stageCounts,
  stageConversion,
  viewingToOffer,
  offerToReservation,
  reservationToSale,
  timeBetweenMeetings,
  timeInStage,
  salesCycleDuration,
  showroomSaleCycle,
  stalledOpportunities,
  irisAssistedSales,
  irisLedSales,
  notInterestedByAgent,
  notInterestedLength,
  notInterestedInteractions,
  notInterestedReach,
  ...CHANGE_FIGURES,
] as const;
