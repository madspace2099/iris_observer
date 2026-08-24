import { defineMetric } from "../definition";
import type { Dimension } from "../definition";
import { NO_CATALOGUE, NO_WEBIRIS, insufficient } from "./shared";

/**
 * Aggregated filter demand.
 *
 * What buyers say they are looking for, in their own criteria, as distinct
 * from what they happen to click on.
 *
 * **Never counted as raw filter clicks.** A buyer dragging a price slider
 * generates a dozen filter events and one preference; an agent demonstrating
 * the filter panel generates several and none. Every metric here counts
 * **unique contacts** or **qualified sessions**, which is the only denominator
 * that means anything about demand.
 */

const DEMAND_MIN = 20;

const SEGMENT_DIMENSIONS: readonly Dimension[] = [
  "project",
  "period",
  "channel",
  "rooms",
  "orientation",
  "floor_band",
  "price_band",
  "area_band",
];

export const filterValueReach = defineMetric({
  id: "demand.filter_value_reach",
  displayName: "Reach by filter value",
  businessDefinition:
    "Share of buyers who asked for each filter value at least once — two-room, south-facing, under €220,000 and so on.",
  kind: "ratio",
  calculation:
    "Distinct contacts who applied a filter value, divided by distinct contacts who used the catalogue at all. Counted per contact, never per application: dragging a slider is one preference, not twelve.",
  numerator: "distinct contacts applying the value",
  denominator: "distinct contacts who used the catalogue",
  exclusions: [
    "repeat applications by the same contact",
    "sessions with no unit interaction at all, which are usually a demonstration",
  ],
  dimensions: SEGMENT_DIMENSIONS,
  timeWindow: "period",
  requiredFacts: ["catalogue.filtered", "unit.viewed"],
  requiredCrmFields: [],
  requiredUnitAttributes: [],
  minimumSampleSize: DEMAND_MIN,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Nobody used the filters in this period.",
    insufficient: insufficient(DEMAND_MIN, "contacts"),
    unavailable: NO_WEBIRIS,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

function demandBy(id: string, displayName: string, attribute: string, unitAttribute: string) {
  return defineMetric({
    id,
    displayName,
    businessDefinition: `Demand by ${attribute}, measured in buyers rather than clicks.`,
    kind: "distribution",
    calculation: `Distinct contacts who filtered for or meaningfully viewed each ${attribute} value, with the share of inventory carrying that value alongside so a large segment is not mistaken for a popular one.`,
    numerator: `distinct contacts expressing interest in the ${attribute} value`,
    denominator: "distinct contacts active on the project",
    exclusions: [`units missing a ${attribute} value`, "repeat expressions by the same contact"],
    dimensions: SEGMENT_DIMENSIONS,
    timeWindow: "period",
    requiredFacts: ["catalogue.filtered", "unit.viewed", "unit.attributes.published"],
    requiredCrmFields: [],
    requiredUnitAttributes: [unitAttribute],
    minimumSampleSize: DEMAND_MIN,
    comparison: "previous_quarter",
    evidenceTier: "observed_sequence",
    states: {
      empty: "No demand recorded in this period.",
      insufficient: insufficient(DEMAND_MIN, "contacts"),
      unavailable: NO_CATALOGUE,
    },
    drillTo: "segments",
    roles: ["developer", "agency_manager"],
  });
}

export const demandByRooms = demandBy(
  "demand.by_rooms",
  "Demand by room count",
  "room count",
  "rooms",
);
export const demandByOrientation = demandBy(
  "demand.by_orientation",
  "Demand by orientation",
  "orientation",
  "orientation",
);
export const demandByFloorBand = demandBy(
  "demand.by_floor_band",
  "Demand by floor range",
  "floor range",
  "floor",
);
export const demandByPriceBand = demandBy(
  "demand.by_price_band",
  "Demand by price range",
  "price range",
  "price",
);
export const demandByAreaBand = demandBy(
  "demand.by_area_band",
  "Demand by area range",
  "area range",
  "area",
);

export const demandCombinations = defineMetric({
  id: "demand.filter_combinations",
  displayName: "Common filter combinations",
  businessDefinition:
    "The combinations buyers actually ask for together — two-room and south-facing, or upper floor under a price ceiling.",
  kind: "distribution",
  calculation:
    "Distinct contacts per combination of two or three filter criteria. Combinations below the minimum sample are grouped rather than listed, because a combination two people used is a coincidence, not a pattern.",
  numerator: "distinct contacts using the combination",
  denominator: "distinct contacts who used more than one filter",
  exclusions: [
    "combinations below the minimum sample, grouped as other",
    "combinations of four or more criteria, which are almost always unique",
  ],
  dimensions: ["project", "period", "channel"],
  timeWindow: "trailing_90d",
  requiredFacts: ["catalogue.filtered"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["rooms", "orientation", "price", "floor", "area"],
  minimumSampleSize: DEMAND_MIN,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No buyer combined more than one filter.",
    insufficient: insufficient(DEMAND_MIN, "contacts"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

/**
 * The one that pays for the family.
 *
 * A search that returns nothing is a buyer telling the developer, precisely,
 * what they wanted and could not have. No other signal in the product names
 * unmet demand directly — everything else can only rank what already exists.
 */
export const zeroResultSearches = defineMetric({
  id: "demand.zero_result_searches",
  displayName: "Searches returning nothing",
  businessDefinition:
    "Filter combinations that matched no available unit, and what buyers were asking for when they did.",
  kind: "distribution",
  calculation:
    "Filter applications whose result count was zero, grouped by criteria and counted in distinct contacts. Reported with the nearest available alternative, so the gap is actionable rather than merely noted.",
  numerator: "distinct contacts whose search returned nothing",
  denominator: "distinct contacts who searched",
  exclusions: [
    "searches immediately followed by a widened filter within the same minute, which are a slider being dragged",
  ],
  dimensions: SEGMENT_DIMENSIONS,
  timeWindow: "period",
  requiredFacts: ["catalogue.filtered"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["rooms", "orientation", "price", "floor", "area", "status"],
  minimumSampleSize: 10,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "Every search returned at least one unit.",
    insufficient: insufficient(10, "searches"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

export const matchingAvailableUnits = defineMetric({
  id: "demand.matching_available_units",
  displayName: "Average matching available units",
  businessDefinition: "How much choice a buyer's own criteria actually leave them.",
  kind: "count",
  calculation:
    "Median available units matching a contact's last applied filter set. A falling figure with steady demand means the inventory is thinning where buyers are looking, which arrives well before it shows up in sales.",
  numerator: "available units matching the criteria",
  denominator: null,
  exclusions: ["searches returning zero, which are counted separately"],
  dimensions: SEGMENT_DIMENSIONS,
  timeWindow: "period",
  requiredFacts: ["catalogue.filtered", "unit.availability.changed"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["status"],
  minimumSampleSize: 10,
  comparison: "previous_quarter",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No searches in this period.",
    insufficient: insufficient(10, "searches"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

export const DEMAND_METRICS = [
  filterValueReach,
  demandByRooms,
  demandByOrientation,
  demandByFloorBand,
  demandByPriceBand,
  demandByAreaBand,
  demandCombinations,
  zeroResultSearches,
  matchingAvailableUnits,
] as const;
