import { defineMetric } from "../definition";
import {
  NOT_ENOUGH,
  NO_CATALOGUE,
  NO_CRM,
  NO_MEETINGS,
  SALES_PACE_MIN_SAMPLE,
  insufficient,
} from "./shared";

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

/* --- sold against the plan (ADR-0055) ------------------------------------ */

const NO_WINDOW = "No sell-out date is set for this project.";

export const stockPosition = defineMetric({
  id: "plan.stock_position",
  displayName: "Stock position",
  businessDefinition:
    "How many of the project's flats are sold, reserved and still available, out of every flat it has.",
  kind: "distribution",
  calculation:
    "Every flat in the catalogue the project's connector delivers, split by the status the CRM states for it now: sold, reserved, and available (every other flat). Each part over the total.",
  numerator: "flats sold, reserved or available",
  denominator: "every flat in the catalogue",
  exclusions: ["nothing: a withdrawn flat leaves the catalogue, and the total with it"],
  dimensions: ["project", "unit_status"],
  timeWindow: "point_in_time",
  requiredFacts: ["unit.attributes.published", "unit.availability.changed", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit"],
  requiredUnitAttributes: ["status"],
  minimumSampleSize: 1,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "The catalogue holds no flat.",
    insufficient: NOT_ENOUGH,
    unavailable: NO_CRM,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
});

export const salesPace = defineMetric({
  id: "plan.sales_pace",
  displayName: "Sales pace",
  businessDefinition: "How many flats the project is selling a month, now.",
  kind: "ratio",
  calculation:
    "Distinct flats whose deal the CRM dates at purchase in the last 90 days (or since selling began, if later), divided by that window in months of 30.4375 days. A deal the CRM states no date for is dated by the sync that first saw it at purchase, or left out.",
  numerator: "flats with a dated purchase in the window",
  denominator: "the window's length in months",
  exclusions: ["reservations", "purchases with no date", "lost deals"],
  dimensions: ["project"],
  timeWindow: "trailing_90d",
  requiredFacts: ["deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit", "deal.stage_date"],
  requiredUnitAttributes: [],
  minimumSampleSize: SALES_PACE_MIN_SAMPLE,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No flat was sold in the last 90 days.",
    insufficient: insufficient(SALES_PACE_MIN_SAMPLE, "dated sales in the last 90 days"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
});

export const neededPace = defineMetric({
  id: "plan.needed_pace",
  displayName: "Pace needed to sell out",
  businessDefinition:
    "How many flats a month the project must sell from today to have none left by its sell-out date.",
  kind: "ratio",
  calculation:
    "Flats not yet sold (every flat less the sold ones; a reservation is not a sale) divided by the months from today to the sell-out date the company admin set, in months of 30.4375 days.",
  numerator: "flats not yet sold",
  denominator: "months left to the sell-out date",
  exclusions: ["a project with no sell-out date", "a date already past"],
  dimensions: ["project"],
  timeWindow: "point_in_time",
  requiredFacts: ["unit.attributes.published", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit"],
  requiredUnitAttributes: ["status"],
  minimumSampleSize: 1,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Every flat is sold.",
    insufficient: NOT_ENOUGH,
    unavailable: NO_WINDOW,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
});

export const planVerdict = defineMetric({
  id: "plan.verdict",
  displayName: "On pace to sell out",
  businessDefinition:
    "Whether the project, selling at its current pace, sells out by its sell-out date, and when it would sell out at that pace.",
  kind: "status",
  calculation:
    "On pace when the sales pace, to one decimal, is at least the pace needed; behind otherwise, stating both. At the current pace the unsold flats take unsold × window days ÷ dated sales more days, which dates the sell-out. No verdict below the pace's minimum sample, without a sell-out date, before selling begins or after the date has passed.",
  numerator: "the sales pace",
  denominator: "the pace needed",
  exclusions: ["the same as the two paces"],
  dimensions: ["project"],
  timeWindow: "trailing_90d",
  requiredFacts: ["unit.attributes.published", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit", "deal.stage_date"],
  requiredUnitAttributes: ["status"],
  minimumSampleSize: SALES_PACE_MIN_SAMPLE,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Every flat is sold.",
    insufficient: insufficient(SALES_PACE_MIN_SAMPLE, "dated sales in the last 90 days"),
    unavailable: NO_CRM,
  },
  drillTo: "deals",
  roles: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
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
  stockPosition,
  salesPace,
  neededPace,
  planVerdict,
] as const;
