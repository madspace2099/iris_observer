import type { FactId } from "@observer/contracts";
import { defineMetric } from "../definition.js";
import { NOT_ENOUGH, NO_CATALOGUE, NO_CRM, UNIT_MIN_SAMPLE, insufficient } from "./shared.js";

/**
 * Project and unit intelligence.
 *
 * The distinction that governs this whole family: **a unit can be sold once,
 * but a segment can be sold many times.** Interest is measured per unit;
 * sales performance is measured per segment. Ranking units by sales is
 * meaningless — the best unit in the building sells exactly once, same as the
 * worst.
 */

const UNIT_DIMENSIONS = [
  "project",
  "period",
  "unit",
  "rooms",
  "floor_band",
  "orientation",
  "price_band",
  "area_band",
  "building",
  "unit_status",
  "channel",
] as const;

function unitCounter(
  id: string,
  displayName: string,
  businessDefinition: string,
  calculation: string,
  numerator: string,
  facts: readonly FactId[],
  emptyState: string,
) {
  return defineMetric({
    id,
    displayName,
    businessDefinition,
    kind: "count",
    calculation,
    numerator,
    denominator: null,
    exclusions: ["units removed from the catalogue", "activity by erased contacts"],
    dimensions: UNIT_DIMENSIONS,
    timeWindow: "period",
    requiredFacts: facts,
    requiredCrmFields: [],
    requiredUnitAttributes: [],
    minimumSampleSize: 1,
    comparison: "previous_period",
    evidenceTier: "observed_sequence",
    states: { empty: emptyState, insufficient: NOT_ENOUGH, unavailable: NO_CATALOGUE },
    drillTo: "units",
    roles: ["developer", "agency_manager", "sales_agent"],
  });
}

/* --- interest in a single unit ------------------------------------------ */

export const uniqueInterestedContacts = unitCounter(
  "unit.unique_interested_contacts",
  "Unique interested contacts",
  "How many different identified people showed interest in this unit.",
  "Distinct contacts with at least one meaningful view of the unit. People, not events — one buyer returning four times is one interested person.",
  "distinct contacts with a meaningful view",
  ["unit.viewed"],
  "No identified person has looked at this unit.",
);

export const rawViews = unitCounter(
  "unit.raw_views",
  "Raw views",
  "Every time the unit was opened, including repeats and glances.",
  "Count of view occurrences, unfiltered. Kept alongside meaningful views so the two can be compared: a large gap between them is itself a signal that the unit is being passed over.",
  "view occurrences",
  ["unit.viewed"],
  "This unit has not been opened.",
);

export const meaningfulViews = unitCounter(
  "unit.meaningful_views",
  "Meaningful views",
  "Views where the buyer actually stayed with the unit.",
  "Views whose raw active duration clears the channel's meaningful-dwell threshold. The threshold is a versioned policy applied at query time, never at ingestion, so it can be revised and re-applied to history.",
  "views above the dwell threshold",
  ["unit.viewed"],
  "Nobody has stayed with this unit long enough to count.",
);

export const activeDwell = defineMetric({
  id: "unit.active_dwell",
  displayName: "Active dwell time",
  businessDefinition: "Total attention this unit received, as measured active time.",
  kind: "duration",
  calculation:
    "Sum and median of raw active duration across views. Idle time, hidden tabs, backgrounded application time and time after another unit became active are all excluded at the source. Measurement method is preserved, and durations from methods the dwell policy distrusts are reported separately rather than blended in.",
  numerator: "raw active duration",
  denominator: "views",
  exclusions: [
    "durations from measurement methods the dwell policy marks unreliable",
    "activity by erased contacts",
  ],
  dimensions: UNIT_DIMENSIONS,
  timeWindow: "period",
  requiredFacts: ["unit.viewed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 3,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No measured attention on this unit.",
    insufficient: insufficient(3, "views"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const favourites = unitCounter(
  "unit.favourites",
  "Favourites",
  "How often this unit was shortlisted.",
  "Distinct contacts with an active favourite on the unit at the end of the period. Removals count: unfavouriting is a signal, not an absence of one.",
  "contacts with an active favourite",
  ["unit.favourited"],
  "This unit has not been shortlisted.",
);

export const shares = unitCounter(
  "unit.shares",
  "Shares",
  "How often this unit was sent to a buyer in writing.",
  "Shares including the unit. The strongest intent signal available, because it is the only in-room action with a consequence outside the room.",
  "shares including the unit",
  ["unit.shared"],
  "This unit has never been sent to a buyer.",
);

export const materialOpens = unitCounter(
  "unit.pdf_opens",
  "Material opens",
  "How often the floor plan or brochure was opened for this unit.",
  "Openings of any unit material, broken down by kind. Distinguishes buyers who went past the summary from those who did not.",
  "material openings",
  ["unit.material.opened"],
  "No material has been opened for this unit.",
);

export const recentInterest = defineMetric({
  id: "unit.recent_interest",
  displayName: "Recent interest",
  businessDefinition: "Interest in this unit over the last four weeks.",
  kind: "count",
  calculation:
    "Distinct contacts with a meaningful view in the trailing 28 days. A separate figure from all-time interest, because a unit that was popular last spring and untouched since is a different problem from one nobody ever liked.",
  numerator: "distinct contacts in the trailing 28 days",
  denominator: null,
  exclusions: ["activity by erased contacts"],
  dimensions: UNIT_DIMENSIONS,
  timeWindow: "trailing_28d",
  requiredFacts: ["unit.viewed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No interest in the last four weeks.",
    insufficient: NOT_ENOUGH,
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager", "sales_agent"],
});

/* --- competition between units ------------------------------------------ */

export const compareInclusion = unitCounter(
  "unit.compare_inclusion",
  "Compare-set inclusion",
  "How often this unit entered a head-to-head comparison.",
  "Comparison sets containing the unit. A comparison is a decision moment: these units were genuinely in the running.",
  "comparison sets containing the unit",
  ["unit.compared"],
  "This unit has never been compared with another.",
);

export const compareWinRate = defineMetric({
  id: "unit.compare_win_rate",
  displayName: "Compare-set win rate",
  businessDefinition:
    "How often this unit survived a comparison, counting only comparisons where a winner was actually observed.",
  kind: "ratio",
  calculation:
    "Comparisons the unit won divided by comparisons with an explicitly observed winner. A comparison that simply closed is excluded rather than counted as a loss — inferring a loser from a closed panel would invent data.",
  numerator: "comparisons won",
  denominator: "comparisons with an explicitly observed winner",
  exclusions: ["comparisons closed with no observed winner", "comparison sets of a single unit"],
  dimensions: UNIT_DIMENSIONS,
  timeWindow: "trailing_90d",
  requiredFacts: ["unit.compared"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["price", "rooms", "floor", "orientation", "area"],
  minimumSampleSize: 5,
  comparison: "none",
  evidenceTier: "statistical_association",
  states: {
    empty: "No comparison of this unit had an observed winner.",
    insufficient: insufficient(5, "decided comparisons"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager"],
});

/* --- demand over time ---------------------------------------------------- */

export const demandTrend = defineMetric({
  id: "unit.demand_trend",
  displayName: "Demand trend",
  businessDefinition: "Whether interest in this unit is rising, flat or falling.",
  kind: "distribution",
  calculation:
    "Meaningful views per week over the trailing twelve weeks, with the trailing four compared against the trailing twelve.",
  numerator: "meaningful views per week",
  denominator: "weeks observed",
  exclusions: ["weeks in which the project had no meetings at all"],
  dimensions: UNIT_DIMENSIONS,
  timeWindow: "trailing_90d",
  requiredFacts: ["unit.viewed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: UNIT_MIN_SAMPLE,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No interest recorded over the trailing period.",
    insufficient: insufficient(UNIT_MIN_SAMPLE, "views"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager"],
});

export const sharpDemandDecline = defineMetric({
  id: "unit.sharp_demand_decline",
  displayName: "Sharp demand decline",
  businessDefinition:
    "Units whose interest has fallen far enough, and on enough data, to be worth investigating.",
  kind: "list",
  calculation:
    "Units whose trailing four-week meaningful views fall below 40% of their trailing twelve-week rate, where the twelve-week base clears the minimum sample. Units below the base are never flagged: on small numbers a drop from three views to one is noise, and flagging it would train the reader to ignore the alert.",
  numerator: "units meeting the decline and sample criteria",
  denominator: null,
  exclusions: [
    "units below the minimum twelve-week base",
    "units that became unavailable, whose decline is expected",
    "periods with a project-wide drop in meetings, where the cause is not the unit",
  ],
  dimensions: ["project", "period", "rooms", "floor_band", "orientation", "price_band"],
  timeWindow: "trailing_90d",
  requiredFacts: ["unit.viewed", "unit.availability.changed"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["status"],
  minimumSampleSize: UNIT_MIN_SAMPLE,
  comparison: "previous_period",
  evidenceTier: "statistical_association",
  states: {
    empty: "No unit shows a decline beyond normal variation.",
    insufficient: "Not enough history to distinguish a decline from noise.",
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager"],
});

export const availableUnitDemand = defineMetric({
  id: "unit.available_demand",
  displayName: "Demand for available units",
  businessDefinition:
    "How much of the interest in this period landed on units a buyer could actually still purchase.",
  kind: "ratio",
  calculation:
    "Meaningful views of available units divided by all meaningful views. A low figure means agents are spending the meeting on stock that is already gone, which is a fixable behaviour rather than a demand problem.",
  numerator: "meaningful views of available units",
  denominator: "all meaningful views",
  exclusions: ["units with no status information"],
  dimensions: ["project", "period", "agent", "agency", "rooms", "price_band"],
  timeWindow: "period",
  requiredFacts: ["unit.viewed", "unit.availability.changed"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["status"],
  minimumSampleSize: 20,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No views recorded in this period.",
    insufficient: insufficient(20, "views"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager"],
});

export const unitPriceContext = defineMetric({
  id: "unit.availability_price_context",
  displayName: "Availability and price context",
  businessDefinition:
    "The unit's current status and price, and how they have moved, shown beside its interest figures.",
  kind: "list",
  calculation:
    "Current status and price, with the status and price history over the period. Present so that a change in interest can be read against a change in the offer rather than in isolation.",
  numerator: "status and price changes",
  denominator: null,
  exclusions: [],
  dimensions: ["project", "period", "unit"],
  timeWindow: "period",
  requiredFacts: ["unit.attributes.published", "unit.availability.changed"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["price", "status"],
  minimumSampleSize: 1,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Nothing about this unit has changed in the period.",
    insufficient: NOT_ENOUGH,
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager", "sales_agent"],
});

/* --- the project, by segment -------------------------------------------- */

export const segmentInterest = defineMetric({
  id: "project.segment_interest",
  displayName: "Interest by segment",
  businessDefinition:
    "Which parts of the inventory draw attention, by room count, floor, orientation, price, area and building.",
  kind: "distribution",
  calculation:
    "Distinct interested contacts and meaningful views per segment, with the segment's share of inventory alongside so a large segment is not mistaken for a popular one.",
  numerator: "distinct interested contacts in the segment",
  denominator: "distinct interested contacts in the project",
  exclusions: ["units missing the attribute being segmented on"],
  dimensions: [
    "project",
    "period",
    "rooms",
    "floor_band",
    "orientation",
    "price_band",
    "area_band",
    "building",
  ],
  timeWindow: "period",
  requiredFacts: ["unit.viewed", "unit.attributes.published"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["rooms", "floor", "orientation", "price", "area", "building"],
  minimumSampleSize: 20,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No segmented interest in this period.",
    insufficient: insufficient(20, "interested contacts"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

export const attentionIndex = defineMetric({
  id: "project.attention_index",
  displayName: "Attention index",
  businessDefinition:
    "Whether a segment draws more attention than its size in the inventory would justify.",
  kind: "ratio",
  calculation:
    "The segment's share of total active dwell divided by its share of available units. Above one means over-indexed interest. This is what makes segments of different sizes comparable, which a raw view count never does.",
  numerator: "segment share of active dwell",
  denominator: "segment share of available units",
  exclusions: ["segments with fewer than three units", "units missing the segment attribute"],
  dimensions: [
    "project",
    "period",
    "rooms",
    "floor_band",
    "orientation",
    "price_band",
    "area_band",
  ],
  timeWindow: "period",
  requiredFacts: ["unit.viewed", "unit.attributes.published"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["rooms", "floor", "orientation", "price", "area"],
  minimumSampleSize: 20,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No attention recorded in this period.",
    insufficient: insufficient(20, "views"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

export const soldBySegment = defineMetric({
  id: "project.sold_by_segment",
  displayName: "Sales performance by segment",
  businessDefinition:
    "Which parts of the inventory actually sell, relative to how much of that inventory exists.",
  kind: "distribution",
  calculation:
    "Units sold in the segment divided by units of that segment in the inventory. Measured per segment rather than per unit, because a unit sells exactly once and ranking units by sales says nothing.",
  numerator: "units sold in the segment",
  denominator: "units of that segment in the inventory",
  exclusions: ["units withdrawn from sale", "units missing the segment attribute"],
  dimensions: [
    "project",
    "period",
    "rooms",
    "floor_band",
    "orientation",
    "price_band",
    "area_band",
    "building",
  ],
  timeWindow: "period",
  requiredFacts: ["deal.stage.changed", "unit.attributes.published"],
  requiredCrmFields: ["deal.stage", "deal.unit"],
  requiredUnitAttributes: ["rooms", "floor", "orientation", "price", "area", "building"],
  minimumSampleSize: 10,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No sales in this period.",
    insufficient: insufficient(10, "sales"),
    unavailable: NO_CRM,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

/* --- what surrounds the building ---------------------------------------- */

export const poiInterest = defineMetric({
  id: "project.poi_interest",
  displayName: "Surroundings and POI interest",
  businessDefinition:
    "Which neighbourhood arguments get presented, and which ones buyers stay with.",
  kind: "distribution",
  calculation:
    "Presentations and dwell per point of interest and category, with the share of meetings in which each appeared.",
  numerator: "meetings including the point of interest",
  denominator: "meetings including any surroundings content",
  exclusions: ["meetings that never opened the surroundings section"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "period",
  requiredFacts: ["surroundings.poi.presented", "project.section.viewed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 15,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Surroundings were not shown in this period.",
    insufficient: insufficient(15, "meetings"),
    unavailable: "No showroom data has arrived for this project yet.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager"],
});

export const environmentInterest = defineMetric({
  id: "project.environment_interest",
  displayName: "Environment and camera-preset interest",
  businessDefinition:
    "Which light, weather and camera settings the project is presented in, and how attention differs under each.",
  kind: "distribution",
  calculation:
    "Share of meetings using each time-of-day and weather preset, with median active dwell under each, plus the camera presets chosen when capturing an image.",
  numerator: "meetings using the preset",
  denominator: "meetings with any scene control",
  exclusions: ["meetings that never changed the scene"],
  dimensions: ["project", "period", "agent", "environment_preset"],
  timeWindow: "period",
  requiredFacts: ["scene.environment.set", "visual.captured", "unit.viewed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 15,
  comparison: "previous_quarter",
  evidenceTier: "statistical_association",
  states: {
    empty: "The scene was never changed in this period.",
    insufficient: insufficient(15, "meetings"),
    unavailable: "No showroom data has arrived for this project yet.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager"],
});

export const deepDiveRate = defineMetric({
  id: "unit.deep_dive_rate",
  displayName: "Deep-dive rate",
  businessDefinition:
    "How often a unit was examined seriously rather than merely opened — balcony view, floor cut, material or interior.",
  kind: "ratio",
  calculation:
    "Views accompanied by at least one deep-dive action divided by all views of the unit. Separates a buyer who considered the unit from one who clicked past it.",
  numerator: "views with a deep-dive action",
  denominator: "views of the unit",
  exclusions: ["channels where the deep-dive actions do not exist"],
  dimensions: UNIT_DIMENSIONS,
  timeWindow: "period",
  requiredFacts: [
    "unit.viewed",
    "unit.examined.balcony",
    "unit.examined.floor_cut",
    "unit.material.opened",
    "unit.interior.opened",
  ],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 5,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No unit was examined beyond the summary.",
    insufficient: insufficient(5, "views"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager", "sales_agent"],
});

export const amenityInterest = defineMetric({
  id: "project.amenity_interest",
  displayName: "Amenity interest",
  businessDefinition:
    "Which shared facilities get presented, how long buyers stay with them, and whether they were auto-played.",
  kind: "distribution",
  calculation:
    "Presentations and active dwell per amenity, with the share of meetings in which each appeared. Auto-played presentations are counted separately: nobody chose to watch them, so their dwell means something different.",
  numerator: "meetings including the amenity",
  denominator: "meetings including any amenity content",
  exclusions: ["meetings that never opened the amenities section"],
  dimensions: ["project", "period", "agent", "agency"],
  timeWindow: "period",
  requiredFacts: ["amenity.presented", "project.section.viewed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: 15,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Amenities were not shown in this period.",
    insufficient: insufficient(15, "meetings"),
    unavailable: "No showroom data has arrived for this project yet.",
  },
  drillTo: "meetings",
  roles: ["developer", "agency_manager"],
});

export const UNIT_METRICS = [
  uniqueInterestedContacts,
  rawViews,
  meaningfulViews,
  activeDwell,
  favourites,
  shares,
  materialOpens,
  recentInterest,
  compareInclusion,
  compareWinRate,
  demandTrend,
  sharpDemandDecline,
  availableUnitDemand,
  unitPriceContext,
  segmentInterest,
  attentionIndex,
  soldBySegment,
  poiInterest,
  amenityInterest,
  environmentInterest,
  deepDiveRate,
] as const;
