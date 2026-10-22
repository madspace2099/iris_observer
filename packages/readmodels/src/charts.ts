import type { MeetingOutcome, SectionId } from "@observer/contracts";
import type { ViewContext } from "./context";
import type { EvidenceRef } from "./metric-value";
import type { ProgressedFigure } from "./views3";

/**
 * The data behind the chart vocabulary.
 *
 * Each of these exists because a question could not be answered by the shapes
 * already in the product. They are read models, not chart configs — the surface
 * decides how to draw them, and the same figures are available to the AI.
 */

/* --- a period the reader chooses -------------------------------------------- */

/**
 * The window a summary figure covers.
 *
 * "How many presentations" is a different question today and this year, and a
 * dashboard that answers only one of them makes the reader do arithmetic. The
 * window is the reader's choice; the comparison always moves with it.
 *
 * **Every label says how long, not which calendar period**, and that is a
 * correction. These windows are rolling — thirty days back from tonight — and
 * they were labelled "This month", "This week", "This quarter". The Sales Flow
 * page carries calendar buckets in the chart beneath them, so one screen had
 * "This month: 41" in the summary and "This month: 32" in the chart, three
 * inches apart, both correct and neither reconcilable by the reader.
 *
 * A rolling window is a perfectly good thing to offer. Calling it a calendar
 * month is not.
 */
export const KPI_WINDOWS = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "quarter", label: "Last 91 days", days: 91 },
  { id: "half", label: "Last 182 days", days: 182 },
  { id: "year", label: "Last 365 days", days: 365 },
  { id: "all", label: "All time", days: 3650 },
] as const;

export type KpiWindowId = (typeof KPI_WINDOWS)[number]["id"];

export interface KpiFigure {
  readonly id: string;
  readonly label: string;
  readonly measurementId: string | null;
  readonly value: string;
  readonly qualifier: string | null;
  /** Against the same length of time immediately before. Null when there is none. */
  readonly delta: string | null;
  readonly tone: "good" | "bad" | "flat";
  /** Recent shape, oldest first. Empty when the window is too short to have one. */
  readonly points: readonly number[];
}

/**
 * One of the summary row's four groups (R05, item 2): Volume, Progress,
 * Conversion, Cycle time, each named and defined.
 *
 * A group nothing on the page measures is printed as empty, with what is
 * missing, rather than dropped. A group quietly left out is the same lie as a
 * zero standing in for a value nobody measured (`report/page.tsx`).
 */
export interface KpiGroup {
  readonly id: "volume" | "progress" | "conversion" | "cycle_time";
  readonly label: string;
  readonly definition: string;
  /** Ids from `KpiPanel.figures`, in the order drawn. Empty when nothing measures the group. */
  readonly figureIds: readonly string[];
  /** For an empty group, what is missing. Null when the group holds figures. */
  readonly missing: string | null;
}

export interface KpiPanel {
  readonly window: KpiWindowId;
  readonly windowLabel: string;
  readonly figures: readonly KpiFigure[];
  /** Stated when the window holds too little to read. */
  readonly caveat: string | null;
  readonly groups: readonly KpiGroup[];
  /** Figures that belong to none of the groups, drawn in the row beside them. */
  readonly ungrouped: readonly string[];
}

/* --- when meetings actually happen ------------------------------------------ */

/**
 * Weekday against hour.
 *
 * Two dimensions, so a bar cannot hold it. The answer feeds staffing and
 * booking: if nothing happens before eleven and Thursday afternoon is solid,
 * that is a rota, not a curiosity.
 */
export interface ActivityMatrix {
  readonly rows: readonly string[];
  readonly columns: readonly string[];
  /** Keyed `${weekday}|${hour}`. */
  readonly cells: Readonly<Record<string, number>>;
  readonly busiest: {
    readonly weekday: string;
    readonly hour: string;
    readonly meetings: number;
  } | null;
  readonly quietest: { readonly weekday: string; readonly meetings: number } | null;
  readonly meetingsCounted: number;
  /**
   * The same meetings by the hour each started, every day together and all
   * twenty-four hours, in the project's own time zone: the radial dial. Counted
   * in the grid's own pass, so the two cannot disagree; a meeting outside the
   * grid's hours is counted here only.
   */
  readonly day: {
    /** Twenty-four, from 00:00; `label` is "09:00". */
    readonly hours: readonly {
      readonly hour: number;
      readonly label: string;
      readonly count: number;
    }[];
    readonly peak: number;
    /** Every meeting in the period: `SalesFlowView.meetingCount`. */
    readonly total: number;
    /** The busiest hour, every tied one named as a span ("09:00–10:00 and 13:00–14:00"); null with no meeting. */
    readonly busiest: {
      readonly display: string;
      /** Meetings in each busiest hour. */
      readonly count: number;
      /** How many hours tie for it. */
      readonly hours: number;
    } | null;
    /** Meetings that started outside the grid's hours: `total − meetingsCounted`. */
    readonly outsideGrid: number;
  };
}

/* --- what precedes a poor outcome -------------------------------------------- */

/**
 * A funnel over behaviour, not over deal stages.
 *
 * The CRM already draws a conversion funnel and Observer will not redraw it
 * (ADR-0023). This one asks a different question: of the meetings that ended
 * "not interested", how many had each of the behaviours the product can see —
 * so a manager can look at what those meetings had in common.
 *
 * It is a description of a cohort, never a cause. The wording is checked.
 */
export interface BehaviourStep {
  readonly id: string;
  readonly label: string;
  /** Meetings that did this **and** everything above it. Monotonically falling. */
  readonly count: number;
  /** This behaviour on its own, ignoring the steps above it. */
  readonly note: string | null;
  /** The same behaviour, on its own, among every other recorded meeting. */
  readonly comparisonNote: string | null;
}

/**
 * One presenter's meetings in the group (`flow.not_interested_by_agent`): how
 * many of the group were theirs, and how many of their own recorded meetings
 * ended so. In the roster's order, never ranked.
 */
export interface CohortAgent {
  readonly agentId: string;
  readonly name: string;
  /** Their meetings in the group. */
  readonly count: number;
  /** "22 recorded": the rate's denominator, every meeting of theirs with an outcome recorded. */
  readonly recordedDisplay: string;
  /** "8 of 22 · 36%"; under `AGENT_MIN_SAMPLE` recorded, "3 of 19 · no rate, 1 short of 20". */
  readonly display: string;
  /** That rate, 0 to 1, and the bar's length; null under `AGENT_MIN_SAMPLE` recorded, where neither is stated. */
  readonly share: number | null;
  readonly belowMinimum: boolean;
  /** The register, narrowed to this presenter and the group's outcome; null where they have none in it. */
  readonly href: string | null;
}

/**
 * A typical figure per meeting, the group's against every other recorded
 * meeting's (`flow.not_interested_length`, `flow.not_interested_interactions`).
 */
export interface CohortFigure {
  readonly id: "length" | "features_opened" | "apartments_opened";
  readonly metricId: string;
  readonly label: string;
  /** The group's median, or "No median" where none of the group could answer it. */
  readonly value: string;
  /** The others' median, the middle halves where stated, and both samples; under the floor, the group's sample and the shortfall. */
  readonly qualifier: string;
}

/** One behaviour on its own, in the group and among the others (`flow.not_interested_reach`). */
export interface CohortReach {
  readonly id: string;
  readonly label: string;
  /** Of the group, 0 to 1. */
  readonly share: number;
  /** Of every other recorded meeting, 0 to 1. */
  readonly comparisonShare: number;
  /** "Used Compare: 11% of the not-interested meetings, against 58% of the others." */
  readonly text: string;
}

export interface BehaviourFunnel {
  readonly cohortLabel: string;
  /**
   * Nested bands, each the meetings that did this and everything above it.
   * Sales Flow no longer draws them (ADR-0053); the design lab still does.
   * Empty when the group has no meeting in it.
   */
  readonly steps: readonly BehaviourStep[];
  /** What to say instead of the section when the group is empty; null otherwise. */
  readonly empty: string | null;
  /** Names the group each `comparisonNote` is measured against. */
  readonly comparisonLabel: string;
  /** How the comparison is made and what it does not claim: the section's `i`. */
  readonly disclaimer: string;
  /**
   * The clearest difference between the group and the others, with both
   * sample sizes, said as association; or why none is said. Null with no group.
   */
  readonly lead: string | null;
  /** Length, features opened and apartments opened, typical per meeting. Empty with no group. */
  readonly figures: readonly CohortFigure[];
  /** Every presenter of the period, in the roster's order. Empty with no group. */
  readonly byAgent: readonly CohortAgent[];
  /** Each behaviour on its own, the widest gap first. Empty where a side is under the floor. */
  readonly reach: readonly CohortReach[];
  /** What the reach rates are shares of; or, with `reach` empty, why it is not drawn. */
  readonly reachOf: string;
}

/* --- what a chart of agents shows, in words ------------------------------------ */

/**
 * IRIS's reading of a chart that draws every agent at once: what the drawing
 * shows between people, said as description and never as cause, every figure
 * beside its denominator. Composed with the chart from the same meetings, so
 * the words and the drawing cannot disagree.
 */
export interface CoachingReading {
  /** The measures on which the drawn agents differ most, widest first, naming who sits at each end. Empty under two drawn. */
  readonly differences: readonly { readonly id: string; readonly text: string }[];
  /** Each drawn agent's most distinctive habit: the measure on which they stand furthest from the rest of the team. */
  readonly habits: readonly {
    readonly agentId: string;
    readonly name: string;
    readonly tone: string;
    readonly text: string;
  }[];
  /** What meetings with each of those habits came to across the project, once per measure, at both sample sizes. */
  readonly outcomes: readonly { readonly id: string; readonly text: string }[];
  /** Why a part cannot be read in this period; null when every part is. */
  readonly note: string | null;
  /** What all of it is, and is not: the comparison's own words. */
  readonly caveat: string;
}

/* --- one agent across several dimensions -------------------------------------- */

/*
 * Which of the kit's six agent hues (`--d-series-1` to `-6`) each seat wears.
 * The kit's own order put two cyans, 3 and 5, both in any five-agent chart; this
 * order keeps them apart until a sixth seat, so any five seats are the five most
 * distinct hues (OKLab, about 0.16 apart at the closest pair against 0.10).
 */
const SEAT_SERIES = [1, 2, 4, 6, 5, 3] as const;

/** The `--d-series-*` number a seat wears; seats wrap after six. */
export function seatSeries(seat: number): number {
  return SEAT_SERIES[seat % SEAT_SERIES.length] ?? 1;
}

export interface RadarProfile {
  readonly id: string;
  readonly label: string;
  /**
   * The agent's identity colour, by seat order (`seatSeries`): within a
   * period, the same person wears the same colour on every chart that draws
   * people. Across periods it can move: the seat counts only those who
   * presented in the period. Never a status colour.
   */
  readonly tone: string;
  /** Normalised 0–1 against the strongest presenter in the period on each axis, drawn or not. */
  readonly values: readonly number[];
  /**
   * `meetings < AGENT_MIN_SAMPLE`. A shape scaled against the strongest
   * colleague on every axis is a ranking without numbers, and below the floor
   * no agent figure is presented as a verdict: the card prints `note` and not
   * the shape.
   */
  readonly belowMinimum: boolean;
  /** The floor's own sentence, null when the sample clears it. */
  readonly note: string | null;
  /** The shape in words, for a reader who cannot see it; null below the floor, where no shape is drawn. */
  readonly reading: string | null;
}

export interface AgentRadar {
  readonly axes: readonly string[];
  readonly axisNotes: readonly string[];
  readonly profiles: readonly RadarProfile[];
  /** Every drawn shape's reading, then who is not drawn and why. */
  readonly summary: string;
  /** What the overlaid shapes show between the agents. */
  readonly reading: CoachingReading;
}

/* --- which parts of the showroom an agent uses ---------------------------------- */

/**
 * One way of using the showroom.
 *
 * Not the radar's six. Those describe how a presentation is paced; these are
 * the tools in it — the compare view, the favourite, the floor cut — and
 * whether an agent reaches for them at all.
 */
export interface FeatureUsageAxis {
  readonly id: string;
  readonly label: string;
  /** What the axis counts, in words a reader without the metric vocabulary follows. */
  readonly note: string;
  /**
   * For an axis the current build cannot answer: what is missing, and why,
   * as a KPI group with nothing to measure says it (`KpiGroup.missing`). Null
   * when the axis is measured. A missing axis is shown as missing — never left
   * out, never drawn at nought.
   */
  readonly missing: string | null;
}

export interface FeatureUsageProfile {
  readonly id: string;
  readonly label: string;
  /** The same seat colour `RadarProfile.tone` gives this person. */
  readonly tone: string;
  readonly meetings: number;
  /**
   * One per axis, in the axes' order: the part of this agent's meetings that
   * used it at least once, 0 to 1. Null on an axis that is not measured.
   */
  readonly values: readonly (number | null)[];
  /** `meetings < AGENT_MIN_SAMPLE`: the figures stand, and no shape is drawn from them. */
  readonly belowMinimum: boolean;
  /** The floor's own sentence, null when the sample clears it. */
  readonly note: string | null;
}

export interface FeatureUsage {
  readonly axes: readonly FeatureUsageAxis[];
  readonly profiles: readonly FeatureUsageProfile[];
  /** Every drawn line in words, the axes not measured, and who is not drawn and why. */
  readonly summary: string;
  /** What the lines show between the agents, on the measured axes only. */
  readonly reading: CoachingReading;
}

/* --- an ordered list where the order is the finding ---------------------------- */

export interface RankedRow {
  readonly id: string;
  readonly label: string;
  readonly sub: string | null;
  readonly value: number;
  readonly display: string;
  readonly href: string | null;
}

/* --- sold against the plan (ADR-0055) -------------------------------------------- */

/**
 * A project's sales window: when selling began and the date by which every
 * flat is meant to be sold. Project configuration, set by the admin of the
 * tenant's company; calendar dates, `YYYY-MM-DD`.
 */
export interface SalesWindow {
  readonly startsOn: string;
  readonly sellOutBy: string;
}

/**
 * Where a sales window set in Observer is kept. `null`: none was set here, and
 * the project's own configuration stands (which may be none at all).
 */
export interface SalesWindowSource {
  windowFor(projectId: string): Promise<SalesWindow | null>;
}

/** One state of the plan's one-line verdict. Only `on_pace` and `behind` judge the pace. */
export type PlanVerdict =
  | "on_pace"
  | "behind"
  | "sold_out"
  | "date_passed"
  | "too_few_sales"
  | "not_started"
  | "no_date"
  | "unavailable";

/** One part of the stock: sold, reserved or available, and its share of every flat. */
export interface StockPart {
  readonly id: "sold" | "reserved" | "available";
  readonly label: string;
  readonly count: number;
  /** `count` over every flat in the catalogue, 0 to 1. */
  readonly share: number;
}

/**
 * How the project is selling against its own plan, read in seconds.
 *
 * The stock is the catalogue's flats; which of them are sold or reserved is the
 * CRM's deal stage for each, so without a CRM's deals `parts` is empty and
 * `stockNote` says why — never a row of zeros. The pace is the flats whose
 * first purchase the CRM dates in the last 90 days; the needed pace is the
 * unsold flats over the months left to the sell-out date. Below
 * `pace.minimum` dated sales no pace is stated and no verdict is given.
 */
export interface SalesPlan {
  /** Every flat for sale in the catalogue; null where no catalogue has reached the project. */
  readonly total: number | null;
  /** Sold, reserved, available — in that order; empty where the CRM cannot say. */
  readonly parts: readonly StockPart[];
  /** What the split cannot say, in a sentence: why `parts` is empty, or the deals it leaves out; null for nothing. */
  readonly stockNote: string | null;
  /** The configured window, formatted; null where none is set. */
  readonly window: {
    readonly startsOn: string;
    readonly sellOutBy: string;
    readonly startsOnDisplay: string;
    readonly sellOutByDisplay: string;
    /** How much of the window has gone by today, 0 to 1. */
    readonly elapsed: number;
    /** "10 months left", "Past the date", "Starts in 2 months". */
    readonly remainingDisplay: string;
  } | null;
  /** Null where no CRM delivers deals, and before selling starts. */
  readonly pace: {
    /** Flats first dated at purchase in the pace window: the pace's sample. */
    readonly sales: number;
    /** The window's length: always the last 90 days. */
    readonly days: number;
    readonly minimum: number;
    /** Flats sold a month, one decimal; null below `minimum`. */
    readonly sellingDisplay: string | null;
    /** Flats a month the sell-out date needs; null without a window, sold out, or past the date. */
    readonly neededDisplay: string | null;
    /** The month the project sells out at the current pace; null below `minimum` or with nothing left. */
    readonly sellsOutDisplay: string | null;
    /** What the pace stands on, beside a stated pace: "14 sales dated in the last 90 days". */
    readonly basis: string;
  } | null;
  readonly verdict: PlanVerdict;
  /** The line itself, short: "On pace", "Behind", "No sell-out date set"; the paces are figures of their own. */
  readonly verdictText: string;
  /** What every figure means, for the block's `i`. */
  readonly definition: string;
  /** The whole block in one paragraph, for a screen reader and for Ask IRIS. */
  readonly summary: string;
}

/* --- composition over time ------------------------------------------------------ */

export interface StackedColumn {
  readonly label: string;
  readonly total: number;
  readonly parts: Readonly<Record<string, number>>;
  /** The month's own progressed share of its recorded meetings, in words, under the same floor. */
  readonly figure: ProgressedFigure;
}

export interface OutcomeComposition {
  readonly columns: readonly StackedColumn[];
  readonly keys: readonly {
    readonly id: MeetingOutcome;
    readonly label: string;
    readonly colour: string;
  }[];
}

/* --- a series with its turning point --------------------------------------------- */

export interface TrendSeries {
  readonly points: readonly { readonly label: string; readonly value: number }[];
  readonly annotation: { readonly index: number; readonly text: string } | null;
  readonly valueLabel: string;
}

/* --- where journeys go, and where they stop -------------------------------------- */

export interface JourneyStage {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface JourneyLink {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

/** One band of the journey funnel: what reached the step, and its share of the first band. */
export interface JourneyFunnelStep {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly countDisplay: string;
  /** `count` over the first band's count, 0 to 1. */
  readonly share: number;
  readonly shareDisplay: string;
}

/**
 * The journey drawn as one narrowing path. A stage nobody stopped before would
 * add a band exactly as wide as the one above it, so it is named in `merged`
 * rather than drawn; so is a stage no meeting reached, and "Progressed" on a
 * project with no CRM to record an outcome. `steps` is empty when the period
 * holds no meeting, and `of` then says so instead of stating the first band.
 */
export interface JourneyFunnel {
  readonly steps: readonly JourneyFunnelStep[];
  /** Every stage named rather than drawn, and why; null when every stage is drawn. */
  readonly merged: string | null;
  /** What every share is out of, in words; or, with no step, why nothing is drawn. */
  readonly of: string;
}

export interface JourneyFlowModel {
  readonly stages: readonly JourneyStage[];
  readonly links: readonly JourneyLink[];
  readonly droppedLabel: string;
  readonly note: string;
  readonly funnel: JourneyFunnel;
}

/* --- every meeting by who presented it and how it ended ------------------------ */

/** A row of words that may open somewhere: the reading beside a chart. */
export interface TextRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly href: string | null;
}

/** One meeting the bubble rule sizes, as compact as the lens draws it. */
export interface LensMeeting {
  readonly id: string;
  /** Who presented it: an index into `MeetingLens.agents`, which picks the colour. */
  readonly a: number;
  /** The project's calendar day it started on: an index into `MeetingLens.days`. */
  readonly d: number;
  /** How it ended: an index into `MeetingLens.outcomes`, which picks the size. */
  readonly o: number;
  /** The start on the project's clock, "14:05". */
  readonly t: string;
  /** The apartments shortlisted, by code. */
  readonly u: readonly string[];
  /** Its replay; the page withholds it from a reader the replay does not admit. */
  readonly href: string | null;
}

/**
 * The bubble lens over the period's recorded meetings: one bubble per meeting
 * the rule sizes, in the colour of the agent who presented it and the size of
 * the outcome recorded at its end, a column per day of the period.
 */
export interface MeetingLens {
  /** Seat order, the radar's: the i-th agent wears `--d-series-${seatSeries(i)}` on every chart. */
  readonly agents: readonly {
    readonly id: string;
    readonly label: string;
    readonly short: string;
  }[];
  /** The outcomes the rule sizes, largest first: the size at full scale, and how many the period holds. */
  readonly outcomes: readonly {
    readonly id: MeetingOutcome;
    readonly label: string;
    readonly diameter: number;
    readonly count: number;
  }[];
  /** Every calendar day of the period in the project's zone, the last of them today. */
  readonly days: readonly {
    readonly label: string;
    readonly weekday: string;
    readonly date: number;
  }[];
  /**
   * Each month the days touch: where it starts among them, how many of its
   * days the period holds, how long it is, and how many of its days fall
   * before the period starts.
   */
  readonly months: readonly {
    readonly label: string;
    readonly long: string;
    readonly first: number;
    readonly held: number;
    readonly length: number;
    readonly lead: number;
  }[];
  readonly meetings: readonly LensMeeting[];
  /** Every meeting in the period, drawn or not. */
  readonly total: number;
  readonly notDrawn: {
    readonly purchase: number;
    readonly presentationOnly: number;
    readonly unrecorded: number;
  };
  /** The latest meetings that ended at the largest size, at most three. */
  readonly nearest: readonly TextRow[];
  readonly lead: string;
  readonly note: string;
  readonly summary: string;
  /** What the strip under the lens is, for a screen reader. */
  readonly stripLabel: string;
}

/* --- the bundle each surface reads ---------------------------------------------- */

export interface FlowCharts {
  readonly context: ViewContext;
  readonly kpis: KpiPanel;
  readonly activity: ActivityMatrix;
  readonly composition: OutcomeComposition;
  readonly trend: TrendSeries;
  readonly funnel: BehaviourFunnel;
  readonly rankedAgents: readonly RankedRow[];
  readonly longestMeetings: readonly RankedRow[];
  /** Which meetings are nearest a purchase, and whose. */
  readonly lens: MeetingLens;
  readonly evidence: EvidenceRef;
}

export interface ProjectCharts {
  readonly plan: SalesPlan;
  readonly journey: JourneyFlowModel;
}

export interface AgentCharts {
  readonly radar: AgentRadar;
  readonly ranked: readonly RankedRow[];
  readonly featureUsage: FeatureUsage;
}

export type { SectionId };
