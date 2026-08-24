import { defineMetric } from "../definition.js";
import {
  AGENT_MIN_SAMPLE,
  NOT_ENOUGH,
  NO_CRM,
  NO_MEETINGS,
  NO_SHOWROOM,
  insufficient,
} from "./shared.js";

/**
 * People and agency intelligence.
 *
 * The most politically loaded family in the product. The developer buys
 * Observer but usually does not employ the agents, so these numbers are
 * evidence about a supplier, not a performance-review console — and the agents
 * whose goodwill produces every other metric can read them.
 *
 * Two consequences run through everything below:
 *
 *  - **Nothing ranks below its minimum sample.** Twenty meetings per agent, and
 *    under that the card shows raw counts and says so. The legacy dashboard
 *    ranked "most engaged visitors" off two sessions; repeating that would lose
 *    the argument with the agency permanently and deservedly.
 *  - **Behaviour is reported, judgement is not.** "Meetings including
 *    Surroundings reach an offer more often" is a pattern an agent can use.
 *    "This agent is underperforming" is a conclusion the data cannot support.
 */

export const meetingsByAgent = defineMetric({
  id: "people.meetings_by_agent",
  displayName: "Meetings by agent",
  businessDefinition: "How many showroom meetings each agent ran in the period.",
  kind: "count",
  calculation: "Attended meetings grouped by agent. A raw count, presented as a raw count.",
  numerator: "attended meetings",
  denominator: null,
  exclusions: ["meetings with no agent recorded", "meetings that were booked but not attended"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: { empty: NO_MEETINGS, insufficient: NOT_ENOUGH, unavailable: NO_SHOWROOM },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
});

export const presentationCoverage = defineMetric({
  id: "people.presentation_coverage",
  displayName: "Presentation coverage",
  businessDefinition:
    "Which parts of the story an agent actually covers: home, surroundings, amenities, units, interior, compare, share.",
  kind: "ratio",
  calculation:
    "Sections opened divided by sections available for the project, averaged across the agent's meetings. Coverage is descriptive: there is no correct score, and a short focused meeting with a decided buyer is not a failure.",
  numerator: "sections covered",
  denominator: "sections available for the project",
  exclusions: ["sections the project has not configured", "meetings under five minutes"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "period",
  requiredFacts: ["project.section.viewed", "meeting.attended"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: AGENT_MIN_SAMPLE,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: NO_MEETINGS,
    insufficient: insufficient(AGENT_MIN_SAMPLE, "meetings for this agent"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const followUpDelay = defineMetric({
  id: "people.follow_up_delay",
  displayName: "Follow-up delay",
  businessDefinition: "How long buyers wait after a meeting before anyone contacts them again.",
  kind: "duration",
  calculation:
    "Median and 80th percentile days from a meeting to the next recorded contact — a share, a CRM activity or a further meeting. Buyers with no follow-up at all are reported separately as a count rather than folded into the median, which would flatter it.",
  numerator: "days from meeting to next contact",
  denominator: "meetings with a subsequent contact",
  exclusions: [
    "meetings whose outcome was not interested",
    "meetings too recent for a follow-up to be late",
  ],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "trailing_90d",
  requiredFacts: ["meeting.attended", "unit.shared", "deal.stage.changed"],
  requiredCrmFields: ["activity.occurred_at"],
  requiredUnitAttributes: [],
  minimumSampleSize: 15,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No meeting in this period has needed a follow-up yet.",
    insufficient: insufficient(15, "meetings"),
    unavailable: NO_CRM,
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const shareToOffer = defineMetric({
  id: "people.share_to_offer",
  displayName: "Share-to-offer conversion",
  businessDefinition: "How often sending a buyer a written summary is followed by a price offer.",
  kind: "ratio",
  calculation:
    "Contacts who received a share and subsequently reached the offer stage, divided by contacts who received a share. Likely the most predictive single step in the funnel, because a share is the only in-room action with a consequence outside the room.",
  numerator: "contacts reaching an offer after a share",
  denominator: "contacts who received a share",
  exclusions: ["shares too recent for an offer to have followed", "shares to erased contacts"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "trailing_90d",
  requiredFacts: ["unit.shared", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: AGENT_MIN_SAMPLE,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No shares were sent in this period.",
    insufficient: insufficient(AGENT_MIN_SAMPLE, "shares"),
    unavailable: NO_CRM,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "sales_agent"],
});

function conversionBy(
  id: string,
  displayName: string,
  level: string,
  dimension: "agent" | "agency",
) {
  return defineMetric({
    id,
    displayName,
    businessDefinition: `Share of attended meetings that reached an offer, by ${level}.`,
    kind: "ratio",
    calculation: `Contacts reaching the offer stage divided by contacts met, grouped by ${level}. Never rendered as a ranking below the minimum sample: the card shows raw counts and states how far short it is.`,
    numerator: "contacts reaching an offer",
    denominator: "contacts met",
    exclusions: [
      "meetings with no recorded outcome",
      `${level}s below the minimum sample, which are listed without a rate`,
      "cohorts too recent to have had time to convert",
    ],
    dimensions: ["project", "period", dimension],
    timeWindow: "trailing_90d",
    requiredFacts: ["meeting.attended", "meeting.outcome.recorded", "deal.stage.changed"],
    requiredCrmFields: ["deal.stage"],
    requiredUnitAttributes: [],
    minimumSampleSize: AGENT_MIN_SAMPLE,
    comparison: "previous_quarter",
    evidenceTier: "observed_sequence",
    states: {
      empty: NO_MEETINGS,
      insufficient: insufficient(AGENT_MIN_SAMPLE, `meetings for this ${level}`),
      unavailable: NO_CRM,
    },
    drillTo: "contacts",
    roles: ["developer", "agency_manager"],
  });
}

export const agentConversion = conversionBy(
  "people.agent_conversion",
  "Agent conversion",
  "agent",
  "agent",
);

export const agencyConversion = conversionBy(
  "people.agency_conversion",
  "Agency conversion",
  "agency",
  "agency",
);

export const skippedOutcomes = defineMetric({
  id: "people.skipped_outcomes",
  displayName: "Skipped outcomes",
  businessDefinition: "Meetings that ended without the agent recording what happened.",
  kind: "ratio",
  calculation:
    "Meetings with an explicitly skipped or absent outcome, divided by attended meetings. A skip is recorded as a skip and never rewritten to presentation-only: a manufactured default is worse than an honest gap, because it silently inflates the least useful outcome.",
  numerator: "meetings with a skipped or absent outcome",
  denominator: "attended meetings",
  exclusions: ["meetings still in progress"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended", "meeting.outcome.recorded"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 10,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Every meeting has a recorded outcome.",
    insufficient: insufficient(10, "meetings"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
});

export const coachingSignals = defineMetric({
  id: "people.coaching_signals",
  displayName: "Coaching signals",
  businessDefinition:
    "Presentation behaviours that co-occur with better or worse outcomes on this project.",
  kind: "list",
  calculation:
    "Behavioural attributes — opening section, time to the first unit, units shown, environment use, share rate — tested against outcomes across the project's meetings. Reported as association with its sample size and effect, never as cause, and never as a judgement about a named person.",
  numerator: "behaviours passing the association threshold",
  denominator: null,
  exclusions: [
    "behaviours below the minimum sample",
    "agents below the minimum sample, who are excluded from the underlying test",
  ],
  dimensions: ["project", "period", "agency"],
  timeWindow: "trailing_90d",
  requiredFacts: [
    "project.section.viewed",
    "unit.viewed",
    "meeting.outcome.recorded",
    "scene.environment.set",
  ],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 40,
  comparison: "none",
  evidenceTier: "statistical_association",
  states: {
    empty: "No behaviour separates outcomes on this project yet.",
    insufficient: insufficient(40, "meetings"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: ["agency_manager", "sales_agent", "developer"],
});

export const teamComparison = defineMetric({
  id: "people.team_comparison",
  displayName: "Comparison with team and previous period",
  businessDefinition:
    "An agent's figures beside the team median and beside their own previous period.",
  kind: "distribution",
  calculation:
    "The agent's meetings, coverage, follow-up delay and share rate against the team median and their own prior period. Presented as position, not as a verdict: no label, no ranking, no score. The reader draws the conclusion, with the sample sizes visible.",
  numerator: "agent value",
  denominator: "team median",
  exclusions: ["agents below the minimum sample", "metrics whose required source is disconnected"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "trailing_90d",
  requiredFacts: ["meeting.attended", "project.section.viewed", "unit.shared"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: AGENT_MIN_SAMPLE,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: NO_MEETINGS,
    insufficient: insufficient(AGENT_MIN_SAMPLE, "meetings for this agent"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: ["agency_manager", "sales_agent", "developer"],
});

export const PEOPLE_METRICS = [
  meetingsByAgent,
  presentationCoverage,
  followUpDelay,
  shareToOffer,
  agentConversion,
  agencyConversion,
  skippedOutcomes,
  coachingSignals,
  teamComparison,
] as const;
