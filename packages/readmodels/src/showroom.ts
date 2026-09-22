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
  readonly routinelySkipped: readonly {
    readonly sectionId: SectionId;
    readonly label: string;
    readonly skipRate: number;
  }[];
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

/**
 * What the catalogue and the session together say about the units this meeting
 * opened.
 *
 * ## Why this is joined in the read model and nowhere else
 *
 * A replay carries unit codes; rooms, orientation and price are catalogue
 * attributes. The sentence a reviewer wants — "three two-room flats opened, two
 * shortlisted" — needs both, and ADR-0012 forbids a component from joining two
 * read models to get it. So the join lives here, beside the replay it is about,
 * with the same inputs `getMeetingReplay` already holds.
 *
 * ## Three counts that are not one count
 *
 * `opened` is every code the showroom recorded. A code the catalogue does not
 * hold — a legacy import, a flat withdrawn since — is still a unit somebody
 * looked at, so it stays in `opened` and is named in `notInCatalogue` rather
 * than dropped or folded into a room band it does not belong to. A code the
 * catalogue holds without a room count is a third thing again. The bands sum to
 * `opened` only with those two beside them, and a reader is owed all three.
 *
 * `shortlisted` at nought is an answer. One meeting in five on the smallest
 * scheme shortlists nothing, and "nothing was shortlisted" is what happened,
 * not what could not be measured.
 */
export interface UnitsViewedSummary {
  /** Units opened in this meeting, catalogue or not. The denominator. */
  readonly opened: number;
  /** Opened units by the room count the catalogue states, ascending. */
  readonly byRooms: readonly { readonly rooms: number; readonly count: number }[];
  /** Opened units the catalogue holds without a room count. */
  readonly roomsUnstated: number;
  /** Opened codes the catalogue does not hold. Named, never folded into a band. */
  readonly notInCatalogue: number;
  /** Shortlisted in this meeting. Nought is an answer, not an absence. */
  readonly shortlisted: number;
  /** Both facts in words, singular and nought included. */
  readonly sentence: string;
}

export interface MeetingReplay {
  readonly context: ViewContext;
  readonly meetingId: string;
  readonly headline: string;
  /** Joined here, never in a component. See {@link UnitsViewedSummary}. */
  readonly unitsViewed: UnitsViewedSummary;
  readonly agentName: string;
  /**
   * Where this agent's own detail screen is, or `null` when the session's
   * `agentId` did not resolve to a real roster entry — `agentName` falls back
   * to the raw id in that case, and a link built from the raw id would open a
   * route with nobody behind it.
   */
  readonly agentHref: string | null;
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
  /** Each `null` when the catalogue did not state it; the row says so in words. */
  readonly rooms: number | null;
  readonly areaSqm: number | null;
  readonly orientation: string | null;
  readonly floor: number | null;
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

/**
 * Whether a feature is new to this period.
 *
 * Three states, and the third is what keeps the first honest. A section that
 * appears in the current window and not in the baseline is newly adopted **only
 * if there was a baseline to be absent from** — on a project three weeks old,
 * or on any surface handed an empty comparison slice, every feature would
 * otherwise be reported as newly adopted, which is the most flattering possible
 * reading of having no history.
 */
export const FEATURE_ADOPTIONS = ["new_in_period", "established", "no_baseline"] as const;
export type FeatureAdoption = (typeof FEATURE_ADOPTIONS)[number];

export interface SectionUsage {
  readonly sectionId: SectionId;
  readonly label: string;
  readonly kind: string;
  readonly meetings: number;
  /**
   * Times the section was entered, returns included.
   *
   * Distinct from `meetings`, which counts the presentations that reached it at
   * all. One meeting that came back to Residences four times is one meeting and
   * four opens, and a "most used feature" built on the wrong one of those two
   * answers a different question than the reader asked.
   */
  readonly opens: number;
  /** Whether this section is new to the period. See `FEATURE_ADOPTIONS`. */
  readonly adoption: FeatureAdoption;
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
  readonly timeOfDay: readonly {
    readonly preset: TimeOfDayPreset;
    readonly count: number;
    readonly label: string;
  }[];
  readonly weather: readonly {
    readonly preset: WeatherPreset;
    readonly count: number;
    readonly label: string;
  }[];
  /** Which section the preset was changed during, where known. */
  readonly duringSections: readonly {
    readonly sectionId: SectionId;
    readonly label: string;
    readonly count: number;
  }[];
  readonly meetingsUsingEnvironment: number;
  readonly meetingsTotal: number;
}

export interface StorytellingIntelligence {
  readonly context: ViewContext;
  readonly sections: readonly SectionUsage[];
  readonly pairings: readonly FeaturePairing[];
  readonly environment: EnvironmentUsage;
  /** What tends to happen before a unit is shortlisted. */
  readonly beforeShortlist: readonly {
    readonly sectionId: SectionId;
    readonly label: string;
    readonly rate: number;
  }[];
  readonly findings: readonly ShowroomFinding[];
  readonly evidence: EvidenceRef;
}

/**
 * A presenter, as the product knows them.
 *
 * Exposed through the port so surfaces never reach into the fixture package for
 * a name (ADR-0007). When the database replaces the synthetic implementation
 * this is the shape it has to return, and no screen changes.
 */
export interface AgentSummary {
  readonly agentId: string;
  readonly name: string;
  readonly organisationName: string;
  readonly meetingCount: number;
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
