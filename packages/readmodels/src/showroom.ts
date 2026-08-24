import type {
  InsightSource,
  MeetingOutcome,
  SectionId,
  ShowroomSession,
  TimeOfDayPreset,
  WeatherPreset,
} from "@observer/contracts";
import type { ViewContext } from "./context";
import type { EvidenceRef, MetricValue } from "./metric-value";

/**
 * Showroom Intelligence read models.
 *
 * The product's subject is what happened inside the IRIS presentation. These
 * are the shapes the five primary surfaces read, and every one of them carries
 * its `sources` so ADR-0023 is checkable rather than aspirational.
 */

/* --- a finding ------------------------------------------------------------- */

/**
 * One stated thing, with everything needed to judge it.
 *
 * The old dashboard's "Insights" panel reported the maximum and the minimum of
 * a single series. A finding here has to answer five questions: what happened,
 * compared with what, why it might matter, what to look at next, and what
 * evidence and sample size stand behind it.
 */
export interface ShowroomFinding {
  readonly id: string;
  /** What happened. One sentence, its number inside it. */
  readonly statement: string;
  /** Compared with what. Null only when nothing comparable exists. */
  readonly baseline: string | null;
  /** Why it might matter. Never a causal claim. */
  readonly soWhat: string;
  /** What to inspect next, and where that is. */
  readonly nextStep: { readonly label: string; readonly href: string } | null;
  readonly evidence: EvidenceRef;
  /** How many meetings stand behind it. Always displayed. */
  readonly sampleSize: number;
  readonly sources: readonly InsightSource[];
  /** Set when the finding rests on an incomplete or timing-blind source. */
  readonly caveat: string | null;
}

/* --- A. Showroom Overview -------------------------------------------------- */

export interface ShowroomOverview {
  readonly context: ViewContext;
  /** The verdict. One sentence about the presentation, never about the CRM. */
  readonly verdict: string;
  readonly verdictDetail: string;
  readonly verdictSources: readonly InsightSource[];
  /** Presentation-rooted figures. CRM figures are not admitted here. */
  readonly figures: readonly MetricValue[];
  readonly findings: readonly ShowroomFinding[];
  /** What moved compared with the previous period, behaviour first. */
  readonly changes: readonly BehaviourChange[];
  readonly coverage: PresentationCoverage;
  /** Outcome mix, present only as context and labelled as such. */
  readonly outcomeContext: readonly {
    readonly outcome: MeetingOutcome;
    readonly label: string;
    readonly count: number;
  }[];
  readonly meetingCount: number;
  readonly evidence: EvidenceRef;
}

export interface BehaviourChange {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly direction: "up" | "down" | "flat";
  readonly deltaDisplay: string;
  readonly sources: readonly InsightSource[];
  readonly sampleSize: number;
  readonly href: string;
}

/**
 * How much of IRIS the presentation actually reached.
 *
 * Coverage is the honest counterpart to "top feature": an argmax tells you what
 * dominated, coverage tells you what never happened.
 */
export interface PresentationCoverage {
  /** Share of core sections reached, 0–1. */
  readonly coreReached: number;
  readonly coreTotal: number;
  readonly sectionsReached: number;
  readonly sectionsTotal: number;
  /** Sections the project has that meetings routinely never open. */
  readonly routinelySkipped: readonly { readonly sectionId: SectionId; readonly label: string; readonly skipRate: number }[];
  readonly medianDepth: number;
}

/* --- B. Presentation Intelligence ------------------------------------------ */

/**
 * A presentation, as a sequence.
 *
 * `Presentation DNA`. Built from ordinals alone, so it works on legacy data;
 * pacing appears only where `enteredAt` exists.
 */
export interface PresentationLane {
  readonly id: string;
  readonly label: string;
  /** Meetings behind this lane. One for a single meeting, many for an agent. */
  readonly meetingCount: number;
  readonly steps: readonly PresentationLaneStep[];
  readonly coverage: number;
  readonly medianDurationSeconds: number | null;
  readonly outcomeMix: readonly { readonly outcome: MeetingOutcome; readonly count: number }[];
}

export interface PresentationLaneStep {
  readonly sectionId: SectionId;
  readonly label: string;
  /** Mean position in the presentation, 0–1. 0 is first, 1 is last. */
  readonly position: number;
  /** Share of this lane's meetings that reached this section at all. */
  readonly reachRate: number;
  /** Share that came back to it after leaving. */
  readonly returnRate: number;
  /** Median seconds spent, where the source can say. */
  readonly medianDwellSeconds: number | null;
  readonly availability: "legacy_available" | "partially_derivable" | "requires_ue5_v2_event";
}

/** How often the presentation moved from one section straight to another. */
export interface PresentationTransition {
  readonly from: SectionId;
  readonly to: SectionId;
  readonly count: number;
  /** Share of all transitions out of `from`. */
  readonly share: number;
}

/**
 * Two lanes, and what actually differs.
 *
 * The differences are computed, not narrated: each is a named behaviour with
 * both sides' figures and the sample behind them. Wording is checked by a test
 * for causal language.
 */
export interface PresentationComparison {
  readonly context: ViewContext;
  readonly mode: "agents" | "cohorts" | "meetings" | "periods";
  readonly left: PresentationLane;
  readonly right: PresentationLane;
  readonly transitionsLeft: readonly PresentationTransition[];
  readonly transitionsRight: readonly PresentationTransition[];
  readonly differences: readonly PresentationDifference[];
  readonly evidence: EvidenceRef;
  /** Always stated: an association at this sample size is not a cause. */
  readonly disclaimer: string;
}

export interface PresentationDifference {
  readonly id: string;
  readonly behaviour: string;
  readonly leftDisplay: string;
  readonly rightDisplay: string;
  /** Absolute gap, for ordering. Never shown as a p-value. */
  readonly magnitude: number;
  readonly sampleLeft: number;
  readonly sampleRight: number;
  readonly sources: readonly InsightSource[];
  readonly note: string | null;
}

export interface PresentationIntelligence {
  readonly context: ViewContext;
  readonly lanes: readonly PresentationLane[];
  readonly transitions: readonly PresentationTransition[];
  readonly teamBenchmark: PresentationLane;
  readonly comparison: PresentationComparison | null;
  readonly findings: readonly ShowroomFinding[];
  readonly evidence: EvidenceRef;
}

/* --- C. Meeting Replay ----------------------------------------------------- */

export interface ReplayStep {
  readonly ordinal: number;
  readonly kind:
    | "section"
    | "unit"
    | "favourite"
    | "pdf"
    | "balcony"
    | "floor_cut"
    | "screenshot"
    | "compare"
    | "share"
    | "environment"
    | "filter"
    | "outcome";
  readonly label: string;
  readonly detail: string | null;
  readonly atDisplay: string | null;
  readonly dwellDisplay: string | null;
  readonly sectionId: SectionId | null;
  readonly unitCode: string | null;
  readonly isReturn: boolean;
  readonly sources: readonly InsightSource[];
  readonly evidence: EvidenceRef | null;
}

export interface MeetingReplay {
  readonly context: ViewContext;
  readonly meetingId: string;
  readonly headline: string;
  readonly agentName: string;
  readonly startedDisplay: string;
  readonly durationDisplay: string;
  readonly outcome: MeetingOutcome;
  readonly outcomeLabel: string;
  readonly steps: readonly ReplayStep[];
  readonly coverage: PresentationCoverage;
  /** Stated gaps: what this source could not record. Never rendered as zero. */
  readonly gaps: readonly string[];
  readonly timingAvailable: boolean;
  readonly evidence: EvidenceRef;
}

/* --- D. Unit Attention ----------------------------------------------------- */

export interface UnitAttentionRow {
  readonly unitId: string;
  readonly unitCode: string;
  readonly status: "available" | "reserved" | "sold";
  readonly rooms: number;
  readonly areaSqm: number;
  readonly orientation: string;
  readonly floor: number;
  readonly priceDisplay: string;
  /** Distinct meetings in which the unit appeared. People, not events. */
  readonly meetings: number;
  readonly views: number;
  readonly medianDwellSeconds: number;
  readonly totalDwellSeconds: number;
  readonly repeatViews: number;
  readonly favourites: number;
  readonly pdfOpens: number;
  readonly balconyViews: number;
  readonly floorCutViews: number;
  readonly screenshots: number;
  readonly comparisonAppearances: number;
  /** Null when compare data does not exist for this project yet. */
  readonly comparisonWins: number | null;
  readonly shares: number;
  readonly trend: "rising" | "flat" | "falling";
  readonly trendDisplay: string;
  /** 0–1 against the busiest unit in the project. */
  readonly attention: number;
  readonly sources: readonly InsightSource[];
}

export interface UnitAttentionDetail {
  readonly row: UnitAttentionRow;
  readonly headline: string;
  readonly findings: readonly ShowroomFinding[];
  /** Units this one was weighed against, with how often it survived. */
  readonly competitors: readonly {
    readonly unitCode: string;
    readonly together: number;
    readonly keptOther: number;
  }[];
  /** Filters that were active in meetings where this unit was opened. */
  readonly relatedFilters: readonly { readonly label: string; readonly count: number }[];
  readonly evidence: EvidenceRef;
}

export interface UnitAttentionView {
  readonly context: ViewContext;
  readonly rows: readonly UnitAttentionRow[];
  readonly selected: UnitAttentionDetail | null;
  readonly findings: readonly ShowroomFinding[];
  readonly evidence: EvidenceRef;
}

/* --- E. Storytelling and Feature Intelligence ------------------------------ */

export interface SectionUsage {
  readonly sectionId: SectionId;
  readonly label: string;
  readonly kind: string;
  readonly meetings: number;
  readonly reachRate: number;
  readonly medianDwellSeconds: number | null;
  /** Dwell below the meaningful threshold — opened and left. */
  readonly glanceRate: number;
  readonly returnRate: number;
  readonly meanPosition: number;
  readonly availability: "legacy_available" | "partially_derivable" | "requires_ue5_v2_event";
}

export interface FeaturePairing {
  readonly a: SectionId;
  readonly b: SectionId;
  readonly together: number;
  /** Observed co-occurrence over the product of the marginals. 1.0 is chance. */
  readonly lift: number;
}

export interface EnvironmentUsage {
  readonly timeOfDay: readonly { readonly preset: TimeOfDayPreset; readonly count: number; readonly label: string }[];
  readonly weather: readonly { readonly preset: WeatherPreset; readonly count: number; readonly label: string }[];
  /** Which section the preset was changed during, where known. */
  readonly duringSections: readonly { readonly sectionId: SectionId; readonly label: string; readonly count: number }[];
  readonly meetingsUsingEnvironment: number;
  readonly meetingsTotal: number;
}

export interface StorytellingIntelligence {
  readonly context: ViewContext;
  readonly sections: readonly SectionUsage[];
  readonly pairings: readonly FeaturePairing[];
  readonly environment: EnvironmentUsage;
  /** What tends to happen before a unit is shortlisted. */
  readonly beforeShortlist: readonly { readonly sectionId: SectionId; readonly label: string; readonly rate: number }[];
  readonly findings: readonly ShowroomFinding[];
  readonly evidence: EvidenceRef;
}

/* --- cohorts --------------------------------------------------------------- */

export interface CohortDefinition {
  readonly id: string;
  readonly label: string;
  readonly outcomes: readonly MeetingOutcome[];
  readonly meetingCount: number;
}

export interface MeetingSummary {
  readonly meetingId: string;
  readonly label: string;
  readonly agentName: string;
  readonly startedDisplay: string;
  readonly durationDisplay: string;
  readonly outcome: MeetingOutcome;
  readonly outcomeLabel: string;
  readonly sectionCount: number;
  readonly unitCount: number;
  readonly href: string;
}

/** The raw sessions, exposed for the AI tool layer and for evidence drill-down. */
export interface ShowroomSessionSlice {
  readonly sessions: readonly ShowroomSession[];
  readonly periodLabel: string;
}
