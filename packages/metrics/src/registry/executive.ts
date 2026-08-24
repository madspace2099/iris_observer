import { defineMetric } from "../definition";
import { NOT_ENOUGH, NO_CATALOGUE, NO_CRM, NO_MEETINGS, insufficient } from "./shared";

/**
 * Executive intelligence — the first screen.
 *
 * Stano's test: within about ten seconds you should know whether things are
 * healthy, weak or promising. That is a computation problem, not a layout
 * problem, so the verdict itself is a metric with a definition, a sample
 * requirement and a drill-down like any other.
 */

export const performanceStatus = defineMetric({
  id: "exec.performance_status",
  displayName: "Overall performance status",
  businessDefinition:
    "A single healthy / watch / weak verdict for the project in this period, with the components that produced it.",
  kind: "status",
  calculation:
    "Composed from sales velocity against the trailing twelve weeks, stage conversion against the project baseline, and pipeline coverage. Any component below its own minimum sample is reported as unknown rather than assumed healthy.",
  numerator: "component verdicts",
  denominator: null,
  exclusions: ["components whose required source is disconnected"],
  dimensions: ["project", "period"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended", "meeting.outcome.recorded", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: ["price", "status"],
  minimumSampleSize: 10,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: NO_MEETINGS,
    insufficient: insufficient(10, "meetings"),
    unavailable: "Not enough sources are connected to form a verdict.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

export const unrealisedPotential = defineMetric({
  id: "exec.unrealised_potential",
  displayName: "Unrealised potential",
  businessDefinition:
    "Value of available units that attracted real interest but have produced no offer.",
  kind: "currency",
  calculation:
    "Sum of list price across available units with at least one meaningful view and no offer in the period. Deliberately conservative: interest is counted only where dwell passed the meaningful threshold.",
  numerator: "list price of qualifying available units",
  denominator: "list price of all available units",
  exclusions: ["reserved or sold units", "units with no attribute data"],
  dimensions: ["project", "period", "rooms", "floor_band", "orientation", "price_band"],
  timeWindow: "period",
  requiredFacts: ["unit.viewed", "unit.availability.changed", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: ["price", "status"],
  minimumSampleSize: 5,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Every unit that drew interest has an offer against it.",
    insufficient: insufficient(5, "units with observed interest"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager"],
});

export const notableChanges = defineMetric({
  id: "exec.notable_changes",
  displayName: "Important changes",
  businessDefinition:
    "The movements since the previous period that are large enough to act on, positive and negative alike.",
  kind: "list",
  calculation:
    "Metrics whose period-over-period change exceeds their own significance threshold and whose sample clears their minimum. Ranked by magnitude, with direction preserved so good news is not buried under bad.",
  numerator: "metrics exceeding their change threshold",
  denominator: null,
  exclusions: [
    "metrics below their minimum sample",
    "changes explained entirely by a policy version change",
  ],
  dimensions: ["project", "period"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended", "unit.viewed", "deal.stage.changed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 10,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Nothing moved enough to report.",
    insufficient: "Too little history to compare periods yet.",
    unavailable: "No previous period to compare against.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const dataCompleteness = defineMetric({
  id: "exec.data_completeness",
  displayName: "Data completeness",
  businessDefinition:
    "Share of the expected inputs Observer actually received, across every connected source.",
  kind: "ratio",
  calculation:
    "Expected inputs present divided by expected inputs, counted per meeting: an identified contact, a recorded outcome, a CRM deal where the CRM is connected, and online history where a qualifying identity link exists.",
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
    empty: NO_MEETINGS,
    insufficient: insufficient(5, "meetings"),
    unavailable: "No source is connected for this project yet.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

/* --- the approved headline figures -------------------------------------- */

export const unitsSold = defineMetric({
  id: "exec.units_sold",
  displayName: "Units Sold",
  businessDefinition: "Units whose sale completed in the period.",
  kind: "count",
  calculation: "Deals reaching the purchase stage in the period, counted once per unit.",
  numerator: "units reaching purchase",
  denominator: null,
  exclusions: ["reservations that have not completed", "cancelled sales"],
  dimensions: ["project", "period", "rooms", "floor_band", "orientation", "price_band", "building"],
  timeWindow: "period",
  requiredFacts: ["deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit"],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No sales completed in this period.",
    insufficient: NOT_ENOUGH,
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager", "madspace_admin"],
});

export const revenue = defineMetric({
  id: "exec.revenue",
  displayName: "Revenue",
  businessDefinition: "Contracted value of sales completed in the period.",
  kind: "currency",
  calculation:
    "Sum of contracted price across completed sales, in the project's configured currency. Falls back to list price only where the contracted price is absent, and says so.",
  numerator: "contracted price of completed sales",
  /**
   * Revenue could be shown as a bare total, and the page rule would let it
   * through as a count-like figure. It is given a denominator anyway, because
   * "€4.2M" tells a developer far less than "€4.2M of €31M in inventory" — the
   * second answers how far through the project they are, which is the question
   * they actually have.
   */
  denominator: "total list value of the project's inventory",
  exclusions: ["reservations", "cancelled sales", "units with no price"],
  dimensions: ["project", "period", "rooms", "floor_band", "price_band", "building"],
  timeWindow: "period",
  requiredFacts: ["deal.stage.changed", "unit.attributes.published"],
  requiredCrmFields: ["deal.stage", "deal.contract_price"],
  requiredUnitAttributes: ["price"],
  minimumSampleSize: 1,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No revenue recognised in this period.",
    insufficient: NOT_ENOUGH,
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "madspace_admin"],
});

export const averageDaysToClose = defineMetric({
  id: "exec.avg_days_to_close",
  displayName: "Average Days to Close",
  businessDefinition: "How long a sale takes from first meeting to completed purchase.",
  kind: "duration",
  calculation:
    "Median and 80th percentile days from first attended meeting to purchase, for sales completed in the period. Reported as a range: a planning answer is a range, and the mean of a skewed distribution is not one.",
  numerator: "days from first meeting to purchase",
  denominator: "sales completed in the period",
  exclusions: ["deals still open", "sales with no attended meeting on record"],
  dimensions: ["project", "period", "agency", "rooms", "price_band"],
  timeWindow: "period",
  requiredFacts: ["meeting.attended", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 10,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No sales completed in this period.",
    insufficient: insufficient(10, "completed sales"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager"],
});

export const activeBuyers = defineMetric({
  id: "exec.active_buyers",
  displayName: "Active Buyers",
  businessDefinition:
    "Contacts with an open deal and at least one interaction in the trailing four weeks.",
  kind: "count",
  calculation:
    "Distinct contacts whose deal has not reached a terminal stage and who have any recorded interaction in the last 28 days.",
  numerator: "distinct contacts",
  denominator: null,
  exclusions: ["terminal deals", "erased contacts", "contacts with withdrawn consent"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "trailing_28d",
  requiredFacts: ["meeting.attended", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage"],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No buyer has been active in the last four weeks.",
    insufficient: NOT_ENOUGH,
    unavailable: NO_CRM,
  },
  drillTo: "contacts",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const EXECUTIVE_METRICS = [
  performanceStatus,
  unrealisedPotential,
  notableChanges,
  dataCompleteness,
  unitsSold,
  revenue,
  averageDaysToClose,
  activeBuyers,
] as const;
