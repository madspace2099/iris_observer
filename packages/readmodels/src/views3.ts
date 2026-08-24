import type { InsightSource, MeetingOutcome, PlaceCategory, SectionId } from "@observer/contracts";
import type { ViewContext } from "./context";
import type { EvidenceRef } from "./metric-value";
import type { ShowroomFinding } from "./showroom";

/**
 * The three views, and the door that leads to them.
 *
 * Review found the opening screen overloaded: a wall of prose and figures where
 * a verdict belonged. A developer with two minutes must be able to tell whether
 * the showroom meetings are going well or badly, and then choose one of three
 * places to go. Everything analytical moved behind those three doors.
 *
 *   Sales Flow   — how the process is performing
 *   Project      — what buyers want, and what they linger on
 *   Sales Agents — how each person presents, and how their meetings end
 */

/* --- the opening screen ------------------------------------------------------ */

/**
 * Whether things are going well.
 *
 * Three states, not a score. A number between 0 and 100 invites the reader to
 * watch it move by a point; a word makes them ask why.
 */
export type ShowroomSignal = "good" | "attention" | "poor";

export interface HomeFigure {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** The comparison, in words. Null when there is nothing to compare against. */
  readonly against: string | null;
  readonly direction: "up" | "down" | "flat";
  readonly better: "up" | "down" | "neither";
  /** The glossary entry, so the figure can explain itself. */
  readonly measurementId: string | null;
}

export interface ShowroomDoor {
  readonly id: "flow" | "project" | "agents";
  readonly label: string;
  /** What this view answers, in one line. */
  readonly question: string;
  /** The single most useful thing behind the door, already computed. */
  readonly headline: string;
  readonly href: string;
}

export interface ShowroomHome {
  readonly context: ViewContext;
  readonly signal: ShowroomSignal;
  /** One sentence. The whole ten-second answer. */
  readonly verdict: string;
  /** Why the signal is what it is. One clause, never a paragraph. */
  readonly because: string;
  /** Three figures. Never more — the registry holds eighty-two. */
  readonly figures: readonly HomeFigure[];
  /** The one thing worth acting on today, if there is one. */
  readonly alert: { readonly text: string; readonly href: string } | null;
  readonly doors: readonly ShowroomDoor[];
  readonly meetingCount: number;
  readonly sources: readonly InsightSource[];
  readonly evidence: EvidenceRef;
}

/* --- 1. Sales Flow ----------------------------------------------------------- */

/**
 * A bucket of time.
 *
 * Named periods rather than a date picker, because the question an agent or a
 * manager actually asks is "how did this week go" — and a comparison to the
 * matching previous bucket is what makes the answer mean anything.
 */
export interface FlowPeriod {
  readonly id: "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month";
  readonly label: string;
  readonly meetings: number;
  /** Median, not mean. One long meeting must not move it. */
  readonly medianDurationSeconds: number | null;
  readonly medianDurationDisplay: string;
  /** Share of meetings whose outcome was recorded at all. */
  readonly outcomeRecorded: number;
  readonly progressed: number;
}

export interface OutcomeSlice {
  readonly outcome: MeetingOutcome;
  readonly label: string;
  readonly count: number;
  readonly share: number;
}

/**
 * A presenter's results, as a shape rather than a table.
 *
 * The doughnut is the requested form and the right one: outcome mix is parts of
 * one whole, and a bar chart of six categories invites a reader to compare
 * heights across agents, which is exactly the league table this product refuses
 * to be. Side by side, the shapes are comparable at a glance and the counts are
 * still written down.
 */
export interface AgentOutcomeRing {
  readonly agentId: string;
  readonly name: string;
  readonly meetings: number;
  readonly slices: readonly OutcomeSlice[];
  readonly progressedShare: number;
  /** Set only when the pattern is worth a conversation, never as a score. */
  readonly flag: { readonly severity: "watch" | "concern"; readonly text: string } | null;
  readonly href: string;
}

export interface SalesFlowView {
  readonly context: ViewContext;
  readonly verdict: string;
  readonly periods: readonly FlowPeriod[];
  readonly outcomes: readonly OutcomeSlice[];
  readonly rings: readonly AgentOutcomeRing[];
  readonly findings: readonly ShowroomFinding[];
  readonly meetingCount: number;
  readonly evidence: EvidenceRef;
}

/* --- 2. Project -------------------------------------------------------------- */

/**
 * One unit segment, and whether attention matches supply.
 *
 * The question behind it: *are two-room flats interesting to buyers, and if so
 * what about them?* Share of stock against share of every kind of engagement —
 * looking, shortlisting, comparing, sharing — because those four are different
 * strengths of interest and averaging them loses the distinction.
 */
export interface SegmentInterest {
  readonly id: string;
  readonly label: string;
  readonly availableUnits: number;
  readonly stockShare: number;
  readonly attentionShare: number;
  readonly favouriteShare: number;
  readonly compareShare: number;
  readonly shareShare: number;
  /** Attention share over stock share. Above one is disproportionate interest. */
  readonly index: number;
  readonly meetings: number;
  /** What buyers looking at this segment attended to, in order. */
  readonly attendedTo: readonly { readonly label: string; readonly category: string; readonly share: number }[];
  /** The sections these meetings spent longest in. */
  readonly sections: readonly { readonly sectionId: SectionId; readonly label: string; readonly share: number }[];
  /**
   * How buyers examined these units, as a rate per unit opened.
   *
   * The four acts are different questions: the balcony is the view, the floor
   * cut is the layout, the plan is what they take away, the screenshot is what
   * they show someone else. "They spend their time on the view" and "they take
   * the floor plan" call for different campaigns, and averaging them into
   * "engagement" loses exactly that.
   */
  readonly examinedHow: readonly { readonly id: string; readonly label: string; readonly rate: number; readonly otherRate: number }[];
  readonly soWhat: string;
}

export interface StatedDemand {
  readonly field: string;
  readonly label: string;
  readonly value: string;
  readonly applications: number;
  /** How many available units satisfied it. Zero is the finding. */
  readonly matches: number;
  readonly availability: "legacy_available" | "partially_derivable" | "requires_ue5_v2_event";
}

export interface PlaceInterest {
  readonly placeId: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly section: "surroundings" | "amenities";
  readonly meetings: number;
  readonly totalDwellSeconds: number;
  readonly medianDwellSeconds: number;
  readonly availability: "legacy_available" | "requires_ue5_v2_event";
}

export interface ProjectView {
  readonly context: ViewContext;
  readonly verdict: string;
  readonly segments: readonly SegmentInterest[];
  readonly selectedSegment: SegmentInterest | null;
  readonly demand: readonly StatedDemand[];
  readonly places: readonly PlaceInterest[];
  readonly placeCategories: readonly { readonly category: PlaceCategory; readonly label: string; readonly share: number; readonly meetings: number }[];
  readonly findings: readonly ShowroomFinding[];
  readonly meetingCount: number;
  readonly evidence: EvidenceRef;
}

/* --- 3. Sales Agents --------------------------------------------------------- */

/**
 * How often the same buyer came back to the same agent.
 *
 * A first meeting and a third meeting are different sales situations, and a
 * project whose meetings are all first meetings is not building a pipeline.
 */
export interface RepeatDistribution {
  readonly visits: number;
  readonly label: string;
  readonly meetings: number;
  readonly share: number;
}

/** Where an agent's time goes inside IRIS, as a share of their own presentation. */
export interface AgentSectionUse {
  readonly sectionId: SectionId;
  readonly label: string;
  /** Share of this agent's total presentation time. */
  readonly timeShare: number;
  /** Share of the team's time in the same section, for contrast. */
  readonly teamShare: number;
  readonly reachRate: number;
}

export interface AgentProfile {
  readonly agentId: string;
  readonly name: string;
  readonly meetings: number;
  readonly medianDurationDisplay: string;
  readonly ring: AgentOutcomeRing;
  readonly repeats: readonly RepeatDistribution[];
  readonly sections: readonly AgentSectionUse[];
  /** The section this agent leans on hardest relative to the team. */
  readonly signature: { readonly label: string; readonly overIndex: number } | null;
  /**
   * The agent's own rating of IRIS, averaged. **MADSPACE only** — it is
   * feedback on the software, and a developer reading it would misread it as
   * feedback on their sales team.
   */
  readonly irisRating: { readonly mean: number; readonly responses: number } | null;
  readonly href: string;
}

export interface AgentsView {
  readonly context: ViewContext;
  readonly verdict: string;
  readonly agents: readonly AgentProfile[];
  readonly repeats: readonly RepeatDistribution[];
  readonly findings: readonly ShowroomFinding[];
  readonly showRatings: boolean;
  readonly meetingCount: number;
  readonly evidence: EvidenceRef;
}

/* --- the audience builder ---------------------------------------------------- */

/**
 * Everyone whose behaviour matched, without naming any of them here.
 *
 * The product case: a nursery is being built nearby, so find the buyers who
 * shortlisted a two-room flat and spent their time on family places. The result
 * is a count, the criteria in words, and the meetings behind it — the agent
 * opens those to reach the contacts, which keeps identity on the surface that
 * already governs it rather than in a list.
 */
export interface AudienceCriteria {
  readonly rooms: number | null;
  readonly favouritedOnly: boolean;
  readonly placeCategory: PlaceCategory | null;
  readonly minimumPlaceSeconds: number;
}

export interface AudienceMatch {
  readonly meetingId: string;
  readonly startedDisplay: string;
  readonly agentName: string;
  readonly outcomeLabel: string;
  /** Why this meeting matched, in words. */
  readonly because: string;
  readonly href: string;
}

export interface AudienceView {
  readonly context: ViewContext;
  readonly criteria: AudienceCriteria;
  readonly description: string;
  readonly matches: readonly AudienceMatch[];
  readonly total: number;
  readonly ofMeetings: number;
  readonly caveats: readonly string[];
  readonly evidence: EvidenceRef;
}
