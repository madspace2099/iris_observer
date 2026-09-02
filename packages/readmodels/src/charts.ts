import type { MeetingOutcome, SectionId } from "@observer/contracts";
import type { ViewContext } from "./context";
import type { EvidenceRef } from "./metric-value";

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

export interface KpiPanel {
  readonly window: KpiWindowId;
  readonly windowLabel: string;
  readonly figures: readonly KpiFigure[];
  /** Stated when the window holds too little to read. */
  readonly caveat: string | null;
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

export interface BehaviourFunnel {
  readonly cohortLabel: string;
  readonly steps: readonly BehaviourStep[];
  /** Names the group each `comparisonNote` is measured against. */
  readonly comparisonLabel: string;
  readonly disclaimer: string;
}

/* --- one agent across several dimensions -------------------------------------- */

export interface RadarProfile {
  readonly id: string;
  readonly label: string;
  readonly tone: string;
  /** Normalised 0–1 against the strongest agent on each axis. */
  readonly values: readonly number[];
}

export interface AgentRadar {
  readonly axes: readonly string[];
  readonly axisNotes: readonly string[];
  readonly profiles: readonly RadarProfile[];
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

/* --- progress against a target -------------------------------------------------- */

/**
 * How the project is selling against its own plan.
 *
 * Actual, the target, and where the schedule wanted it to be by now. The last
 * is what turns a percentage into a decision: 33% sold is neither good nor bad
 * until you know the plan wanted 41%.
 */
export interface SalesTarget {
  readonly id: string;
  readonly label: string;
  readonly total: number;
  readonly actual: number;
  readonly target: number;
  /** Straight-line expectation at today's date. */
  readonly pace: number;
  readonly startedOn: string;
  readonly targetDate: string;
  readonly note: string;
}

/* --- composition over time ------------------------------------------------------ */

export interface StackedColumn {
  readonly label: string;
  readonly total: number;
  readonly parts: Readonly<Record<string, number>>;
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

export interface JourneyFlowModel {
  readonly stages: readonly JourneyStage[];
  readonly links: readonly JourneyLink[];
  readonly droppedLabel: string;
  readonly note: string;
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
  readonly evidence: EvidenceRef;
}

export interface ProjectCharts {
  readonly targets: readonly SalesTarget[];
  readonly journey: JourneyFlowModel;
}

export interface AgentCharts {
  readonly radar: AgentRadar;
  readonly ranked: readonly RankedRow[];
}

export type { SectionId };
