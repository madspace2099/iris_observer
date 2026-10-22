import type { FactId } from "@observer/contracts";
import { defineMetric } from "../definition";
import { NOT_ENOUGH, NO_CATALOGUE, NO_CRM, UNIT_MIN_SAMPLE, insufficient } from "./shared";

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

/*
 * THE UNITS REGISTER'S DERIVED COLUMN, NAMED FOR WHAT IT IS (R07-2, Máté 2026-10-02).
 *
 * The register's "Demand · derived" column was a computation with no entry
 * here. It is not the attention index — that compares a segment's share of
 * looking time with its share of the unsold stock — so it is declared as its
 * own metric under its own name rather than borrowing that one.
 */
export const demandSignal = defineMetric({
  id: "unit.demand_signal",
  displayName: "Demand signal · derived",
  businessDefinition:
    "How much looking time this unit drew, against the unit that drew the most in the same project and period. An ordering aid, not a verdict.",
  kind: "ratio",
  calculation:
    "The unit's total active dwell in the period, divided by the largest total active dwell of any unit in the project over the same period. The busiest unit reads 1 and a unit nobody looked at reads 0. Because the denominator is a project-relative peak, it orders units within one project and period and is never compared across projects or periods. It is not the attention index, which compares a segment's share of looking time with its share of the unsold stock.",
  numerator: "the unit's total active dwell",
  denominator: "the largest total active dwell of any unit in the project",
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
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No measured attention on any unit in this period.",
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
    "The segment's share of the active dwell on the stock the period ends with unsold, divided by its share of that stock. The same units stand in both shares: available, reserved and pre-reserved; a sold unit is in neither. Above one means over-indexed interest. This is what makes segments of different sizes comparable, which a raw view count never does. Computed once, by `attentionIndex` in this package, and read by every surface that states it. The status is the catalogue's, which is the status now: exact for a period that runs to today, and for a completed period the stock as the catalogue states it now.",
  numerator: "segment share of active dwell on the unsold stock",
  denominator: "segment share of the unsold stock",
  exclusions: [
    "sold units, on both sides",
    "a segment with no unsold unit, or a period with no looking time on the unsold stock: no index, never zero",
    "units missing the segment attribute",
  ],
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

/* --- the project, by room type (ADR-0056) -------------------------------- */

/**
 * The four figures of the Project page's room-type blocks, which the owner
 * asked for in his own words on 2026-10-22: how many flats of each room count
 * there are and how many sold, how much interest each draws over a window he
 * picks, and a plain reading of interest against sales. The room types are
 * the catalogue's own room counts, never a fixed four.
 */

/** Below this many meetings in a window (or in one point of its line), no share is ranked or compared. */
const ROOM_TYPE_WINDOW_MIN = 10;

/**
 * The sold side of a room type's reading names a direction only when the
 * type's sold flats differ by at least this many from what the project's own
 * rate gives its flats. Nearer than one flat, "above the project" or "below"
 * rests on less than one sale, and the reading says it sells at the
 * project's rate.
 */
export const ROOM_TYPE_SOLD_GAP = 1;

export const roomTypeStock = defineMetric({
  id: "project.room_type_stock",
  displayName: "Flats and sales by room type",
  businessDefinition:
    "How many flats of each room count the project has, and how many of them are sold or reserved.",
  kind: "distribution",
  calculation:
    "Flats in the catalogue per room count, with the flats the CRM records as sold (a purchase) and reserved, as the catalogue stands now. The sold share is sold flats of the type over all its flats. Without a CRM, sold and reserved are unavailable, never zero.",
  numerator: "flats of the room type, and of them sold",
  denominator: "flats of the room type in the catalogue",
  exclusions: ["flats whose room count the catalogue does not state, which form their own type"],
  dimensions: ["project", "rooms", "unit_status"],
  timeWindow: "point_in_time",
  requiredFacts: ["unit.attributes.published", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit"],
  requiredUnitAttributes: ["rooms", "status"],
  minimumSampleSize: 1,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "The catalogue holds no flat.",
    insufficient: insufficient(1, "flats"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "units",
  roles: ["developer", "agency_manager"],
});

export const roomTypeInterest = defineMetric({
  id: "project.room_type_interest",
  displayName: "Interest by room type",
  businessDefinition:
    "Which flat sizes buyers ask to see: the share of meetings that opened a flat of each room count, over a window the reader picks.",
  kind: "ratio",
  calculation:
    "Meetings in the window that opened at least one flat of the room type, divided by every meeting in the window. A meeting that opened a two-room and a three-room flat counts for both, so the shares do not add up to 100%. The change is in percentage points against the same length of time immediately before, and only when that time lies wholly after the project's first meeting. The line splits the window into equal parts and draws a part only from its own meetings; the 7-day window's line is its 7 days and the 7 before them, a point each, because a showroom's day rarely holds the floor.",
  numerator: "meetings in the window that opened a flat of the room type",
  denominator: "meetings in the window",
  exclusions: [
    "openings of flats the catalogue does not list",
    `a window, or a part of its line, with fewer than ${ROOM_TYPE_WINDOW_MIN} meetings: shown raw, never ranked, compared or drawn`,
    "a change against time before that starts before the project's first meeting, which would set part of a window against a whole one",
  ],
  dimensions: ["project", "period", "rooms"],
  timeWindow: "period",
  requiredFacts: ["unit.viewed", "unit.attributes.published"],
  requiredCrmFields: [],
  requiredUnitAttributes: ["rooms"],
  minimumSampleSize: ROOM_TYPE_WINDOW_MIN,
  comparison: "previous_period",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No meeting in this window.",
    insufficient: insufficient(ROOM_TYPE_WINDOW_MIN, "meetings"),
    unavailable: NO_CATALOGUE,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

export const roomTypeReading = defineMetric({
  id: "project.room_type_reading",
  displayName: "Interest against sales, by room type",
  businessDefinition:
    "Whether a room type gets more or less of buyers' looking time than its share of the unsold flats, and whether a larger or smaller share of it has sold than of the project, in one plain line.",
  kind: "status",
  calculation: `Two readings side by side. Time spent: the attention index (\`project.attention_index\`) of the room type in the period — its share of the time spent on unsold flats over its share of the unsold flats — above or below 1.00×; it is time, not how often the type is opened (\`project.room_type_interest\`). Sold: the type's sold flats (\`project.room_type_stock\`) against the project's sold share applied to its flats; a gap of ${ROOM_TYPE_SOLD_GAP} flat or more names a direction, and a smaller one reads as selling at the project's rate. The pair names one of five readings. "Less time, but selling well" suggests showing the type more only where it was opened in no larger a share of the period's meetings than its share of the stock; the other directed readings each carry their action. It is an association between what buyers look at and what has sold, never a cause.`,
  numerator: "the room type's attention index, and its sold flats",
  denominator: "parity (1.00×), and the project's sold share applied to the type's flats",
  exclusions: [
    `a sold side within ${ROOM_TYPE_SOLD_GAP} flat of the project's rate, which names no direction`,
    "a room type opened in fewer than the minimum number of meetings in the period",
    "a room type with no attention index: all of it sold, or nobody looked at its unsold flats",
    "a project with no CRM, which cannot say what sold",
  ],
  dimensions: ["project", "period", "rooms"],
  timeWindow: "period",
  requiredFacts: ["unit.viewed", "unit.attributes.published", "deal.stage.changed"],
  requiredCrmFields: ["deal.stage", "deal.unit"],
  requiredUnitAttributes: ["rooms", "status"],
  minimumSampleSize: 20,
  comparison: "project_baseline",
  evidenceTier: "statistical_association",
  states: {
    empty: "No room type was opened in this period.",
    insufficient: insufficient(20, "meetings that opened the room type"),
    unavailable: NO_CRM,
  },
  drillTo: "segments",
  roles: ["developer", "agency_manager"],
});

export const roomTypeExamined = defineMetric({
  id: "project.room_type_examined",
  displayName: "How each room type was examined",
  businessDefinition:
    "What buyers did with the flats of each room count once they opened one: the balcony view, the floor plan, the floor cut, a screenshot, sharing it.",
  kind: "ratio",
  calculation:
    "Openings of flats of the room type with the act, divided by every opening of a flat of that type in the period's meetings. The room types stand side by side, so each rate is read against the same act on the other types. The highest rate of a row is marked only among types with the minimum number of openings.",
  numerator: "openings of flats of the room type with the act",
  denominator: "openings of flats of the room type",
  exclusions: ["a room type below the minimum openings is shown raw and never marked highest"],
  dimensions: ["project", "period", "rooms"],
  timeWindow: "period",
  requiredFacts: [
    "unit.viewed",
    "unit.examined.balcony",
    "unit.examined.floor_cut",
    "unit.material.opened",
    "visual.captured",
    "unit.shared",
    "unit.attributes.published",
  ],
  requiredCrmFields: [],
  requiredUnitAttributes: ["rooms"],
  minimumSampleSize: 20,
  comparison: "none",
  evidenceTier: "observed_sequence",
  states: {
    empty: "No flat of this room type was opened in this period.",
    insufficient: insufficient(20, "openings"),
    unavailable: NO_CATALOGUE,
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
  demandSignal,
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
  roomTypeStock,
  roomTypeInterest,
  roomTypeReading,
  roomTypeExamined,
  poiInterest,
  amenityInterest,
  environmentInterest,
  deepDiveRate,
] as const;
