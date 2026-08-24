import { defineMetric } from "../definition";
import { DEFAULT_ATTRIBUTION_POLICY, type AttributionPolicy } from "../policy";

/**
 * Journey metrics: WEBIRIS → showroom → CRM outcome.
 *
 * These are the metrics that only exist because Observer joins three source
 * systems. No CRM can produce them, and neither can a web analytics tool.
 *
 * Every attributed metric below shares one rule, stated once. A single shared
 * rule is deliberate: if "online-to-offer" and "online-to-purchase" used
 * different windows, comparing them would be meaningless, and somebody
 * eventually would.
 */
export const JOURNEY_ATTRIBUTION: AttributionPolicy = DEFAULT_ATTRIBUTION_POLICY;

const INSUFFICIENT = "Not enough data yet to read this as a trend.";
const NO_WEBIRIS = "WEBIRIS data is not connected for this project.";
const NO_CRM = "The CRM is not connected, so outcomes below the meeting are unknown.";

/* --- online reach and identification ------------------------------------ */

export const webirisAnonymousVisitors = defineMetric({
  id: "webiris.anonymous_visitors",
  displayName: "Anonymous WEBIRIS visitors",
  businessDefinition:
    "Distinct people who visited the project online without identifying themselves.",
  kind: "count",
  calculation: "Distinct visitors with at least one online session in the period.",
  numerator: "distinct visitors with a session",
  denominator: null,
  exclusions: ["visitors already resolved to a contact before the session started"],
  dimensions: ["project", "period"],
  timeWindow: "period",
  requiredFacts: ["online.session.observed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No online visits recorded in this period.",
    insufficient: INSUFFICIENT,
    unavailable: NO_WEBIRIS,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

export const webirisIdentifiedLeads = defineMetric({
  id: "webiris.identified_leads",
  displayName: "Identified WEBIRIS leads",
  businessDefinition: "People who gave their details online and became a known contact.",
  kind: "count",
  calculation: "Distinct contacts with a lead submitted through WEBIRIS in the period.",
  numerator: "distinct contacts with a WEBIRIS lead",
  denominator: null,
  exclusions: ["leads created directly in the CRM", "duplicate submissions by the same contact"],
  dimensions: ["project", "period"],
  timeWindow: "period",
  requiredFacts: ["lead.submitted"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No online leads in this period.",
    insufficient: INSUFFICIENT,
    unavailable: NO_WEBIRIS,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

export const webirisVisitorToLead = defineMetric({
  id: "webiris.visitor_to_lead",
  displayName: "Visitor-to-lead conversion",
  businessDefinition: "Share of online visitors who identified themselves.",
  kind: "ratio",
  calculation: "Identified leads divided by distinct visitors, both within the period.",
  numerator: "distinct contacts with a WEBIRIS lead",
  denominator: "distinct online visitors",
  exclusions: ["visitors whose only session was after they had already identified"],
  dimensions: ["project", "period"],
  timeWindow: "period",
  requiredFacts: ["online.session.observed", "lead.submitted"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 50,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No online visits in this period.",
    insufficient: "Fewer than 50 visitors — the rate is too noisy to compare.",
    unavailable: NO_WEBIRIS,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

/* --- from lead to the room ---------------------------------------------- */

export const leadToBooking = defineMetric({
  id: "journey.lead_to_booking",
  displayName: "Lead-to-booking conversion",
  businessDefinition: "Share of identified leads that resulted in a booked showroom meeting.",
  kind: "ratio",
  calculation:
    "Leads with a meeting booked within the attribution window, divided by leads in the period.",
  numerator: "leads with a subsequent booking",
  denominator: "identified leads",
  exclusions: ["bookings made before the lead existed", "bookings for a different project"],
  dimensions: ["project", "period", "agency"],
  timeWindow: "period",
  requiredFacts: ["lead.submitted", "meeting.booked"],
  requiredCrmFields: ["appointment.scheduled_for"],
  requiredUnitAttributes: [],
  minimumSampleSize: 20,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No leads to convert in this period.",
    insufficient: "Fewer than 20 leads — too few to read as a rate.",
    unavailable: NO_CRM,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager"],
});

export const meetingAttendanceRate = defineMetric({
  id: "journey.meeting_attendance_rate",
  displayName: "Meeting attendance rate",
  businessDefinition: "Share of booked meetings the buyer actually attended.",
  kind: "ratio",
  calculation: "Booked meetings with a recorded showroom session, divided by booked meetings.",
  numerator: "booked meetings that were attended",
  denominator: "booked meetings scheduled in the period",
  exclusions: [
    "walk-ins, which have no booking to be measured against",
    "meetings still in the future at the end of the period",
  ],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "period",
  requiredFacts: ["meeting.booked", "meeting.attended"],
  requiredCrmFields: ["appointment.scheduled_for"],
  requiredUnitAttributes: [],
  minimumSampleSize: 20,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No meetings were scheduled in this period.",
    insufficient: "Fewer than 20 scheduled meetings.",
    unavailable: NO_CRM,
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const webirisToShowroom = defineMetric({
  id: "journey.webiris_to_showroom",
  displayName: "WEBIRIS-to-showroom conversion",
  businessDefinition:
    "Share of identified online leads who attended a showroom meeting within the attribution window.",
  kind: "ratio",
  calculation:
    "Leads with an attended meeting inside the window and a qualifying identity link, divided by leads in the period. Walk-ins and bookings with no online history are reported separately, never folded in.",
  numerator: "leads with an attributed attended meeting",
  denominator: "identified online leads",
  exclusions: [
    "meetings linked only by a probabilistic identity match",
    "attendance outside the 90-day window",
    "direct bookings with no prior online activity — reported as their own bucket",
  ],
  dimensions: ["project", "period", "online_interest_segment"],
  timeWindow: "period",
  requiredFacts: ["lead.submitted", "meeting.attended", "identity.linked"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 20,
  comparison: "previous_period",
  evidenceTier: "attributed_conversion",
  attribution: JOURNEY_ATTRIBUTION,
  states: {
    empty: "No online leads to follow through in this period.",
    insufficient: "Fewer than 20 leads — attribution at this volume is not readable.",
    unavailable: NO_WEBIRIS,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager"],
});

export const leadToAttendanceDays = defineMetric({
  id: "journey.lead_to_attendance_days",
  displayName: "Time from lead to showroom attendance",
  businessDefinition:
    "How long it takes an identified online lead to stand in the showroom, as a median and an 80th percentile.",
  kind: "duration",
  calculation:
    "Median and 80th percentile of days between lead submission and first attended meeting. Reported as a range, never as a mean, because a planning answer is a range.",
  numerator: "days between lead submission and first attendance",
  denominator: "leads that reached attendance",
  exclusions: ["leads that never attended", "attendance beyond the attribution window"],
  dimensions: ["project", "period", "online_interest_segment"],
  timeWindow: "period",
  requiredFacts: ["lead.submitted", "meeting.attended"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 15,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No lead reached the showroom in this period.",
    insufficient: "Fewer than 15 completed journeys — percentiles would be misleading.",
    unavailable: NO_WEBIRIS,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager"],
});

/* --- from online to money ----------------------------------------------- */

function onlineOutcome(
  id: string,
  displayName: string,
  stage: string,
  crmField: string,
  minimumSampleSize: number,
) {
  return defineMetric({
    id,
    displayName,
    businessDefinition: `Share of identified online leads that reached ${stage}.`,
    kind: "ratio",
    calculation: `Leads with a deal reaching ${stage} inside the attribution window, divided by leads in the period.`,
    numerator: `leads whose deal reached ${stage}`,
    denominator: "identified online leads",
    exclusions: [
      "probabilistic identity matches",
      `${stage} reached outside the 90-day window`,
      "deals with no online origin — reported as their own bucket",
    ],
    dimensions: ["project", "period", "online_interest_segment"],
    timeWindow: "period",
    requiredFacts: ["lead.submitted", "deal.stage.changed", "identity.linked"],
    requiredCrmFields: [crmField],
    requiredUnitAttributes: [],
    minimumSampleSize,
    comparison: "previous_quarter",
    evidenceTier: "attributed_conversion",
    attribution: JOURNEY_ATTRIBUTION,
    states: {
      empty: "No online leads to follow through in this period.",
      insufficient: `Fewer than ${minimumSampleSize} leads — not readable as a rate.`,
      unavailable: NO_CRM,
    },
    drillTo: "deals",
    roles: ["developer", "agency_manager"],
  });
}

export const onlineToOffer = onlineOutcome(
  "journey.online_to_offer",
  "Online-to-offer conversion",
  "a price offer",
  "deal.stage",
  20,
);

export const onlineToReservation = onlineOutcome(
  "journey.online_to_reservation",
  "Online-to-reservation conversion",
  "a reservation",
  "deal.stage",
  25,
);

export const onlineToPurchase = onlineOutcome(
  "journey.online_to_purchase",
  "Online-to-purchase conversion",
  "a completed purchase",
  "deal.stage",
  30,
);

/* --- what the journey says about demand --------------------------------- */

export const conversionByOnlineSegment = defineMetric({
  id: "journey.conversion_by_online_segment",
  displayName: "Conversion by online interest segment",
  businessDefinition:
    "How buyers convert depending on what they were looking at online — room count, orientation, floor band or price band.",
  kind: "distribution",
  calculation:
    "For each online interest segment, attributed conversion to attendance, offer and purchase, with the segment population as the denominator.",
  numerator: "converted leads within the segment",
  denominator: "leads within the segment",
  exclusions: ["segments below the minimum sample, which are grouped as 'other'"],
  dimensions: [
    "project",
    "period",
    "online_interest_segment",
    "rooms",
    "orientation",
    "price_band",
  ],
  timeWindow: "period",
  requiredFacts: ["lead.submitted", "catalogue.filtered", "unit.viewed", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: ["rooms", "orientation", "price", "floor"],
  minimumSampleSize: 20,
  comparison: "previous_quarter",
  evidenceTier: "attributed_conversion",
  attribution: JOURNEY_ATTRIBUTION,
  states: {
    empty: "No segmented online activity in this period.",
    insufficient: "No segment reaches 20 leads yet.",
    unavailable: "Unit attributes are missing, so online interest cannot be segmented.",
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

export const preferenceAgreement = defineMetric({
  id: "journey.preference_agreement",
  displayName: "Online and showroom preference agreement",
  businessDefinition:
    "How often what a buyer explored online matches what they explored in the showroom.",
  kind: "ratio",
  calculation:
    "Overlap between the buyer's top online attribute preferences and their showroom ones, averaged across contacts with activity in both channels. A pattern, not a verdict about any individual.",
  numerator: "matching preferred attributes across the two channels",
  denominator: "preferred attributes observed in either channel",
  exclusions: [
    "contacts with activity in only one channel",
    "attributes observed fewer than three times",
  ],
  dimensions: ["project", "period", "rooms", "orientation", "price_band"],
  timeWindow: "trailing_90d",
  requiredFacts: ["unit.viewed", "catalogue.filtered", "unit.favourited"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["rooms", "orientation", "price", "floor", "area"],
  minimumSampleSize: 25,
  comparison: "none",
  evidenceTier: "statistical_association",
  states: {
    empty: "No buyer has activity in both channels yet.",
    insufficient: "Fewer than 25 buyers with both channels — shown as a pattern only.",
    unavailable: NO_WEBIRIS,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager"],
});

export const commonJourneyPath = defineMetric({
  id: "journey.common_path",
  displayName: "Most common online-to-showroom journey",
  businessDefinition:
    "The sequences buyers most often follow from first online visit to attended meeting.",
  kind: "distribution",
  calculation:
    "Journeys reduced to an ordered sequence of stage transitions, then counted. Sequences below the minimum sample are grouped rather than shown individually.",
  numerator: "journeys following a given sequence",
  denominator: "journeys reaching attendance",
  exclusions: ["journeys still in progress", "sequences occurring fewer than five times"],
  dimensions: ["project", "period"],
  timeWindow: "trailing_90d",
  requiredFacts: [
    "online.session.observed",
    "lead.submitted",
    "meeting.booked",
    "meeting.attended",
  ],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 30,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No completed journeys yet.",
    insufficient: "Fewer than 30 completed journeys — no sequence is representative yet.",
    unavailable: NO_WEBIRIS,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager"],
});

/* --- how trustworthy the join is ---------------------------------------- */

export const crossChannelCompleteness = defineMetric({
  id: "journey.cross_channel_completeness",
  displayName: "Cross-channel data completeness",
  businessDefinition:
    "Share of the journey that Observer can actually see, across all three source systems.",
  kind: "ratio",
  calculation:
    "Expected inputs present divided by expected inputs, counted per meeting: an identified contact, an outcome, a CRM deal where the CRM is connected, and online history where a qualifying link exists.",
  numerator: "expected inputs present",
  denominator: "expected inputs",
  exclusions: ["sources the project has deliberately not enabled"],
  dimensions: ["project", "period", "agent", "agency", "channel"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended", "meeting.outcome.recorded"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 5,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No meetings in this period.",
    insufficient: "Fewer than five meetings.",
    unavailable: "No source is connected for this project yet.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

export const unmatchedContacts = defineMetric({
  id: "journey.unmatched_contacts",
  displayName: "Unmatched contacts",
  businessDefinition:
    "Known contacts that could not be connected to a CRM record, so their outcome is invisible.",
  kind: "count",
  calculation: "Contacts with project activity and no confirmed CRM cross-reference.",
  numerator: "contacts without a CRM reference",
  denominator: null,
  exclusions: ["contacts whose consent was withdrawn", "erased contacts"],
  dimensions: ["project", "period"],
  timeWindow: "point_in_time",
  requiredFacts: ["lead.submitted"],
  requiredCrmFields: ["contact.id"],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Every contact is matched.",
    insufficient: INSUFFICIENT,
    unavailable: NO_CRM,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

export const unmatchedMeetings = defineMetric({
  id: "journey.unmatched_meetings",
  displayName: "Unmatched meetings",
  businessDefinition:
    "Showroom meetings with no identified participant, so nothing about them can join the journey.",
  kind: "count",
  calculation: "Attended meetings whose participants are all unidentified.",
  numerator: "attended meetings with no identified participant",
  denominator: null,
  exclusions: [],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Every meeting has an identified participant.",
    insufficient: INSUFFICIENT,
    unavailable: "No showroom data for this project yet.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
});

export const JOURNEY_METRICS = [
  webirisAnonymousVisitors,
  webirisIdentifiedLeads,
  webirisVisitorToLead,
  leadToBooking,
  meetingAttendanceRate,
  webirisToShowroom,
  leadToAttendanceDays,
  onlineToOffer,
  onlineToReservation,
  onlineToPurchase,
  conversionByOnlineSegment,
  preferenceAgreement,
  commonJourneyPath,
  crossChannelCompleteness,
  unmatchedContacts,
  unmatchedMeetings,
] as const;
