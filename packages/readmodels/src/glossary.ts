import type { InsightSource } from "@observer/contracts";

/**
 * What every number on screen actually measures.
 *
 * One definition, in one place, used by the column headers, the info buttons,
 * the tooltips and the AI answers. A figure whose meaning lives in a column
 * abbreviation is a figure the reader has to guess at, and two screens that
 * explain the same number differently are worse than one that explains nothing.
 *
 * Each entry answers four questions:
 *
 *   what it measures      — in a sentence a salesperson would use
 *   how it is computed    — the rule, including any threshold
 *   where it comes from   — the provenance class, so ADR-0023 is visible
 *   what it does not say  — the limit, stated rather than implied
 */
export interface MeasurementDefinition {
  readonly id: string;
  /** The full, unabbreviated name. Used as the panel's heading. */
  readonly label: string;
  /**
   * A shorter name for a narrow column.
   *
   * Still a real word — never an abbreviation. "Change since last period" does
   * not fit a nine-rem column and overlapped its neighbour; "Trend" does fit,
   * and the full name is one click away in the panel.
   */
  readonly columnLabel?: string;
  /** A monoline glyph name the UI maps to an icon. Never a lone abbreviation. */
  readonly icon: MeasurementIcon;
  readonly whatItMeasures: string;
  readonly howItIsComputed: string;
  readonly sources: readonly InsightSource[];
  readonly limitation: string;
  /** Unit of the displayed value, for the reader and for the AI. */
  readonly unit: "count" | "seconds" | "percent" | "ratio" | "text";
}

export const MEASUREMENT_ICONS = [
  "meetings",
  "clock",
  "star",
  "plan",
  "compare",
  "trend",
  "eye",
  "camera",
  "share",
  "balcony",
  "layers",
  "coverage",
  "depth",
  "sequence",
  "sun",
  "cloud",
  "link",
] as const;
export type MeasurementIcon = (typeof MEASUREMENT_ICONS)[number];

const OBSERVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED"];
const DERIVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"];

export const GLOSSARY: readonly MeasurementDefinition[] = [
  {
    id: "unit.meetings",
    label: "Meetings",
    icon: "meetings",
    whatItMeasures: "How many separate showroom meetings this unit was opened in.",
    howItIsComputed:
      "Distinct meetings, not views. A unit opened three times in one meeting counts once here.",
    sources: OBSERVED,
    limitation: "It counts meetings, not people. Two buyers in one meeting are one meeting.",
    unit: "count",
  },
  {
    id: "unit.median_dwell",
    label: "Typical look",
    columnLabel: "Typical look",
    icon: "clock",
    whatItMeasures: "How long the unit was on screen in a typical view.",
    howItIsComputed:
      "The median across every view of this unit. Median rather than average, so one very long look does not drag the figure up.",
    sources: OBSERVED,
    limitation:
      "Time on screen is not attention. The agent may have been talking about something else.",
    unit: "seconds",
  },
  {
    id: "unit.favourites",
    label: "Shortlisted",
    icon: "star",
    whatItMeasures: "How many meetings ended with this unit marked as a favourite.",
    howItIsComputed: "One per meeting, counted when the shortlist mark was set at any point.",
    sources: OBSERVED,
    limitation:
      "The current showroom build records no un-favourite, so a unit taken off a shortlist still counts.",
    unit: "count",
  },
  {
    id: "unit.pdf_opens",
    label: "Floor plan opened",
    icon: "plan",
    whatItMeasures: "How many meetings opened this unit's floor plan.",
    howItIsComputed: "One per meeting. Opening a plan is usually the moment a buyer wants to keep something.",
    sources: OBSERVED,
    limitation: "Opening is recorded; whether the plan was downloaded or sent is not.",
    unit: "count",
  },
  {
    id: "unit.comparison",
    label: "Kept in comparison",
    columnLabel: "Comparison",
    icon: "compare",
    whatItMeasures: "How often this unit survived when it was placed beside another.",
    howItIsComputed:
      "Shown as kept out of appearances. A dash means the unit was never put into Compare mode at all.",
    sources: OBSERVED,
    limitation:
      "Compare mode is only measured when the agent opens it, so a dash means unmeasured, not unwanted.",
    unit: "ratio",
  },
  {
    id: "unit.trend",
    label: "Change since last period",
    columnLabel: "Trend",
    icon: "trend",
    whatItMeasures: "Whether attention on this unit is rising or falling.",
    howItIsComputed:
      "This period's openings against the previous period's. Below three prior openings the two counts are shown instead of a percentage, because a percentage from a base of one says nothing.",
    sources: DERIVED,
    limitation: "A change between two periods is not yet a trend. It becomes one when it repeats.",
    unit: "percent",
  },
  {
    id: "unit.attention",
    label: "Attention",
    icon: "eye",
    whatItMeasures: "How much of the project's total looking time went to this unit.",
    howItIsComputed:
      "Total seconds on this unit, scaled against the busiest unit in the project. The busiest unit is a full bar.",
    sources: DERIVED,
    limitation:
      "It is relative. A full bar in a quiet quarter is less looking than a half bar in a busy one.",
    unit: "ratio",
  },
  {
    id: "unit.screenshots",
    label: "Screenshots",
    icon: "camera",
    whatItMeasures: "How many times someone captured this unit from the screen.",
    howItIsComputed: "Counted per capture, across every meeting in the period.",
    sources: OBSERVED,
    limitation: "What was done with the image afterwards is not recorded.",
    unit: "count",
  },
  {
    id: "unit.shares",
    label: "Shared",
    icon: "share",
    whatItMeasures: "How many meetings sent this unit to someone.",
    howItIsComputed: "One per meeting in which a share was recorded.",
    sources: OBSERVED,
    limitation: "The recipient is deliberately not recorded. It signals a second decision-maker, not who.",
    unit: "count",
  },
  {
    id: "unit.examined",
    label: "Examined closely",
    icon: "balcony",
    whatItMeasures: "Whether the buyer looked past the listing — the balcony view and the floor cut.",
    howItIsComputed: "Balcony views and floor cuts, counted separately and shown together.",
    sources: OBSERVED,
    limitation: "Both are optional controls. Not using them may mean the agent never offered them.",
    unit: "count",
  },

  /* --- presentation ------------------------------------------------------- */

  {
    id: "showroom.presentations",
    label: "Presentations",
    icon: "meetings",
    whatItMeasures: "How many showroom meetings ran in the period.",
    howItIsComputed: "One per recorded session, whether or not an outcome was written down afterwards.",
    sources: OBSERVED,
    limitation: "A session that was started and abandoned still counts as a presentation.",
    unit: "count",
  },
  {
    id: "showroom.core_coverage",
    label: "Core coverage",
    columnLabel: "Coverage",
    icon: "coverage",
    whatItMeasures: "How much of the story a typical presentation actually reached.",
    howItIsComputed:
      "The share of core sections — Home, Residences, Amenities, Surroundings — opened, averaged across meetings.",
    sources: DERIVED,
    limitation: "Reaching a section is not the same as presenting it. Read it beside the glance rate.",
    unit: "percent",
  },
  {
    id: "showroom.median_depth",
    label: "Depth",
    icon: "depth",
    whatItMeasures: "How many steps a typical presentation took.",
    howItIsComputed: "The median number of section visits per meeting, revisits included.",
    sources: DERIVED,
    limitation: "More steps is not better. A long wander and a thorough tour look the same here.",
    unit: "count",
  },
  {
    id: "showroom.units_opened",
    label: "Units opened",
    icon: "layers",
    whatItMeasures: "How many apartment openings happened across all meetings.",
    howItIsComputed: "Every opening, plus the count of distinct units behind it.",
    sources: OBSERVED,
    limitation: "An opening is not an offer. It records what was shown, not what was wanted.",
    unit: "count",
  },
  {
    id: "section.reach",
    label: "Reached",
    icon: "sequence",
    whatItMeasures: "How often this part of IRIS was opened at all.",
    howItIsComputed: "The share of meetings in which the section appears at least once.",
    sources: OBSERVED,
    limitation: "It says nothing about how long it stayed open.",
    unit: "percent",
  },
  {
    id: "section.glance",
    label: "Opened and left",
    icon: "clock",
    whatItMeasures: "How often the section was opened and abandoned rather than presented.",
    howItIsComputed:
      "The share of visits that ended within fifteen seconds — the meaningful-dwell threshold for the showroom.",
    sources: DERIVED,
    limitation:
      "Fifteen seconds is a policy, not a fact. It is stated so the figure can be re-cut if it proves wrong.",
    unit: "percent",
  },
  {
    id: "section.pairing",
    label: "Travel together",
    icon: "link",
    whatItMeasures: "Whether two sections tend to be used in the same meeting.",
    howItIsComputed:
      "Observed co-occurrence divided by what independent use would produce. 1.00× is exactly chance.",
    sources: DERIVED,
    limitation: "Co-occurrence within a meeting. It makes no claim about which came first.",
    unit: "ratio",
  },
  {
    id: "environment.time_of_day",
    label: "Time of day",
    icon: "sun",
    whatItMeasures: "Which lighting preset the agent chose during a presentation.",
    howItIsComputed: "Counted per change, so one meeting can contribute several.",
    sources: OBSERVED,
    limitation: "Which unit was on screen at the moment of the change is not recorded.",
    unit: "count",
  },
  {
    id: "environment.weather",
    label: "Weather",
    icon: "cloud",
    whatItMeasures: "Which weather preset the agent chose during a presentation.",
    howItIsComputed: "Counted per change, so one meeting can contribute several.",
    sources: OBSERVED,
    limitation: "Which unit was on screen at the moment of the change is not recorded.",
    unit: "count",
  },
];

export function defineMeasurement(id: string): MeasurementDefinition | undefined {
  return GLOSSARY.find((d) => d.id === id);
}
