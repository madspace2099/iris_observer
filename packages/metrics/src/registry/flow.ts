import { defineMetric } from "../definition";
import { NOT_ENOUGH, NO_CRM, NO_MEETINGS, insufficient } from "./shared";

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
    "Deals at reservation or purchase that name a unit and carry a stage date, whose unit was opened in a showroom meeting that started no more than 72 hours before that date, divided by all such deals. The lag from the last showing to the stage date is reported for every sale, inside the window or not.",
  numerator: "dated sales whose unit was opened in IRIS within 72 hours before the stage date",
  denominator: "deals at reservation or purchase that name a unit and carry a stage date",
  exclusions: [
    "deals with no stage date, which cannot be placed in time",
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

export const FLOW_METRICS = [
  stageCounts,
  stageConversion,
  viewingToOffer,
  offerToReservation,
  reservationToSale,
  timeBetweenMeetings,
  timeInStage,
  salesCycleDuration,
  stalledOpportunities,
  irisAssistedSales,
] as const;
