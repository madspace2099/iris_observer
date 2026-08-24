import { defineMetric } from "../definition";
import { DEFAULT_ATTRIBUTION_POLICY } from "../policy";
import { NOT_ENOUGH, NO_CRM, NO_SHOWROOM, insufficient } from "./shared";

/**
 * Observer intent signals — "lead temperature".
 *
 * A separate family from Sales Flow, on purpose. Stage conversion measures
 * movement through an authoritative ladder; these measure whether Observer's
 * own read of a buyer turns out to be worth anything.
 *
 * That distinction has a practical consequence: **stage conversion is never
 * computed through an intent level.** A buyer can cool from high to medium
 * without moving backwards commercially, so a funnel that routed through
 * temperature would show a regression that never happened.
 */

export const intentDistribution = defineMetric({
  id: "intent.distribution",
  displayName: "Intent signal distribution",
  businessDefinition:
    "How the project's active buyers currently classify as low, medium or high intent.",
  kind: "distribution",
  calculation:
    "Contacts with a fresh intent signal, grouped by level. Signals past their freshness date are excluded and counted separately: a high from six weeks ago describes a buyer who may already have bought elsewhere.",
  numerator: "contacts at an intent level",
  denominator: "contacts with a fresh signal",
  exclusions: [
    "signals past their freshness window",
    "contacts whose inputs are too thin to classify, reported as insufficient_data",
  ],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "point_in_time",
  requiredFacts: ["unit.viewed", "unit.favourited", "meeting.attended", "online.session.observed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 10,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No buyer has enough activity to classify yet.",
    insufficient: insufficient(10, "classified contacts"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const intentFreshness = defineMetric({
  id: "intent.signal_freshness",
  displayName: "Intent signal freshness",
  businessDefinition: "Share of intent signals still inside their freshness window.",
  kind: "ratio",
  calculation:
    "Signals whose freshness date has not passed, divided by all signals held. A falling figure means the product is showing opinions about buyers nobody has seen recently.",
  numerator: "fresh signals",
  denominator: "all signals held",
  exclusions: ["contacts erased or with consent withdrawn"],
  dimensions: ["project", "period"],
  timeWindow: "point_in_time",
  requiredFacts: ["unit.viewed", "meeting.attended"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 10,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No intent signals are held for this project.",
    insufficient: insufficient(10, "signals"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

/**
 * Does a high signal mean anything?
 *
 * These are the metrics that keep the intent model honest. If high-intent
 * buyers reach an offer at the same rate as everyone else, the signal is
 * decoration and the ruleset needs changing — and that has to be visible
 * rather than assumed.
 */
function intentOutcome(id: string, displayName: string, outcome: string, minimum: number) {
  return defineMetric({
    id,
    displayName,
    businessDefinition: `Share of buyers classified high intent who went on to ${outcome}.`,
    kind: "ratio",
    calculation: `Contacts whose deal reached ${outcome} within the attribution window after a high-intent signal, divided by contacts who held a high signal. Measured from the signal, not through it: the deal ladder is never routed through a temperature.`,
    numerator: `high-intent contacts reaching ${outcome}`,
    denominator: "contacts with a high-intent signal",
    exclusions: [
      "signals that had already expired when the outcome occurred",
      "contacts classified after the outcome, which would be hindsight",
    ],
    dimensions: ["project", "period", "agent", "agency"],
    timeWindow: "trailing_90d",
    requiredFacts: ["unit.favourited", "meeting.attended", "deal.stage.changed"],
    requiredCrmFields: ["deal.stage"],
    requiredUnitAttributes: [],
    minimumSampleSize: minimum,
    comparison: "previous_quarter",
    evidenceTier: "attributed_conversion",
    attribution: DEFAULT_ATTRIBUTION_POLICY,
    states: {
      empty: "No buyer has held a high-intent signal in this period.",
      insufficient: insufficient(minimum, "high-intent contacts"),
      unavailable: NO_CRM,
    },
    drillTo: "deals",
    roles: ["developer", "agency_manager"],
  });
}

export const highIntentToOffer = intentOutcome(
  "intent.high_to_offer",
  "High intent to offer",
  "a price offer",
  15,
);

export const highIntentToReservation = intentOutcome(
  "intent.high_to_reservation",
  "High intent to reservation",
  "a reservation",
  15,
);

export const highIntentToPurchase = intentOutcome(
  "intent.high_to_purchase",
  "High intent to purchase",
  "a completed purchase",
  20,
);

export const intentLift = defineMetric({
  id: "intent.lift_over_baseline",
  displayName: "Intent signal lift",
  businessDefinition:
    "How much better a high-intent buyer converts than an average buyer on the same project.",
  kind: "ratio",
  calculation:
    "Offer rate among high-intent contacts divided by the offer rate among all contacts. A figure near 1 means the signal adds nothing and the ruleset should change.",
  numerator: "offer rate among high-intent contacts",
  denominator: "offer rate among all contacts",
  exclusions: ["periods with fewer than the minimum high-intent contacts"],
  dimensions: ["project", "period"],
  timeWindow: "trailing_90d",
  requiredFacts: ["unit.favourited", "meeting.attended", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 20,
  comparison: "previous_quarter",
  evidenceTier: "statistical_association",
  states: {
    empty: "No high-intent contacts in this period.",
    insufficient: insufficient(20, "high-intent contacts"),
    unavailable: NO_CRM,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

export const INTENT_METRICS = [
  intentDistribution,
  intentFreshness,
  highIntentToOffer,
  highIntentToReservation,
  highIntentToPurchase,
  intentLift,
] as const;

/** Re-exported so the shared state strings stay in one place. */
export { NOT_ENOUGH };
