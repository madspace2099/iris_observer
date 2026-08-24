import { defineMetric } from "../definition";
import { NO_SHOWROOM, insufficient } from "./shared";

/**
 * Product usage and operating cost.
 *
 * Metrics about how IRIS itself is used, rather than about how the project is
 * selling. They belong in product-usage and coaching drill-downs, and
 * deliberately **not** on the Executive Overview: a developer does not need to
 * know how many renders were generated to decide whether to reprice a segment.
 */

export const unitSelectionMethod = defineMetric({
  id: "product.unit_selection_method",
  displayName: "How units get chosen",
  businessDefinition:
    "Whether buyers arrive at a unit through the 3D building, the list, a search result, a comparison, a direct link, or an agent's recommendation.",
  kind: "distribution",
  calculation:
    "Unit views grouped by the method that opened them, per meeting and per agent. Agent recommendation is counted only where it was explicitly recorded — it is never inferred from the fact that an agent was present.",
  numerator: "unit views opened by each method",
  denominator: "unit views with a recorded method",
  exclusions: [
    "views whose selection method was not recorded",
    "recommendation inferred rather than recorded",
  ],
  dimensions: ["project", "period", "agent", "agency", "channel"],
  timeWindow: "period",
  requiredFacts: ["unit.viewed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 30,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No unit views recorded in this period.",
    insufficient: insufficient(30, "unit views"),
    unavailable: NO_SHOWROOM,
  },
  drillTo: "meetings",
  roles: ["agency_manager", "sales_agent", "madspace_admin"],
});

/* --- Render Studio, split in two ------------------------------------------ */

/**
 * Engagement and cost are separate families on purpose.
 *
 * They are read by different people for different decisions — an agency
 * manager asks whether the tool helps sell, MADSPACE asks what it costs to
 * run — and merging them produces a number that answers neither.
 *
 * Neither family may be described as purchase intent. A buyer who asked for a
 * render at sunset has asked for a render at sunset. Whether that predicts a
 * purchase is a question for `intent.lift_over_baseline`, on evidence.
 */
export const renderEngagement = defineMetric({
  id: "render.engagement",
  displayName: "Render Studio engagement",
  businessDefinition: "How Render Studio is used in meetings: opened, generated, selected, shared.",
  kind: "distribution",
  calculation:
    "Meetings reaching each step of the render funnel, as a share of meetings that opened Render Studio at all. Downstream outcomes are reported alongside as association, never as cause.",
  numerator: "meetings reaching the step",
  denominator: "meetings that opened Render Studio",
  exclusions: ["projects where the module is not enabled"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "period",
  requiredFacts: ["visual.captured", "visual.enhanced", "unit.shared", "meeting.attended"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 20,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Render Studio was not used in this period.",
    insufficient: insufficient(20, "meetings"),
    unavailable: "Render Studio is not enabled for this project.",
  },
  drillTo: "meetings",
  roles: ["agency_manager", "sales_agent", "madspace_admin"],
});

export const renderCost = defineMetric({
  id: "render.operational_cost",
  displayName: "Render Studio operating cost",
  businessDefinition:
    "Generation volume, failure rate, processing time and estimated spend, by model.",
  kind: "currency",
  calculation:
    "Estimated cost across completed generations, with failures counted separately: a failed generation costs money and produces nothing, so folding it into an average hides the waste.",
  numerator: "estimated cost of generations",
  denominator: "generations attempted",
  exclusions: ["generations cancelled before the model was invoked"],
  dimensions: ["project", "period", "agency"],
  timeWindow: "period",
  requiredFacts: ["visual.enhanced"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No generations in this period.",
    insufficient: "Too few generations to read as a rate.",
    unavailable: "Render Studio is not enabled for this project.",
  },
  drillTo: "meetings",
  roles: ["madspace_admin", "developer"],
});

export const renderFailureRate = defineMetric({
  id: "render.failure_rate",
  displayName: "Render failure rate",
  businessDefinition: "Share of render generations that failed.",
  kind: "ratio",
  calculation:
    "Failed generations divided by generations attempted. A rising figure is an operational fault, and it is felt in the room: the agent promised the buyer an image.",
  numerator: "failed generations",
  denominator: "generations attempted",
  exclusions: ["generations cancelled by the agent"],
  dimensions: ["project", "period"],
  timeWindow: "period",
  requiredFacts: ["visual.enhanced"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 20,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No generations in this period.",
    insufficient: insufficient(20, "generations"),
    unavailable: "Render Studio is not enabled for this project.",
  },
  drillTo: "meetings",
  roles: ["madspace_admin"],
});

export const PRODUCT_METRICS = [
  unitSelectionMethod,
  renderEngagement,
  renderCost,
  renderFailureRate,
] as const;
