import type {
  EvidenceTier,
  InsightSource,
  MeetingOutcome,
  SessionChannel,
} from "@observer/contracts";
import type { TrendSeries } from "./charts";
import type { ViewContext } from "./context";
import type {
  AlertItem,
  AlertSeverity,
  EvidenceRef,
  FunnelStep,
  MetricValue,
} from "./metric-value";
import type { MeetingSummary, ShowroomFinding, UnitAttentionRow } from "./showroom";
import type { AgentProfile, OutcomeSlice } from "./views3";

/**
 * The drill-down surfaces, as read models.
 *
 * Four screens the customer-facing frontend needs and the port could not
 * answer: the meeting list, one unit, one agent, and the cross-screen attention
 * states. They live together rather than one file each because they share a
 * register — context, rows, findings, and an explicit sentence for the state
 * where there is nothing to show — and because three of them reuse each other's
 * rows, which is only obvious when they are read side by side.
 *
 * Two rules shaped every type here.
 *
 * 1. **ADR-0012: a component may not join two read models.** So anything one
 *    screen needs arrives from one call, even where that means a view carries a
 *    row type another view also returns. Reuse is deliberate: `MeetingRow`
 *    appears on the meeting list, inside a unit, and inside an agent, and the
 *    three cannot disagree about what a meeting is.
 * 2. **Absence is a state, never a zero.** Every figure that a source might not
 *    be able to answer is a `MetricValue`, which already distinguishes empty
 *    from insufficient from unavailable from error. Nothing here invents a
 *    fifth way of saying "we do not know".
 */

/* --- who was in the room, without saying who ------------------------------- */

/**
 * How a visitor is named on screen, when they may not be named at all.
 *
 * A meeting list is the surface most likely to grow a name column, and today
 * no name appears on it. That is the current state rather than a settled rule:
 * `docs/05-identity.md` §2 rule 3 forbids name, email and phone in an event or
 * an observation, which is the behavioural pipeline and not a screen, and
 * ADR-0018 governs which surfaces the internal brief may reach rather than
 * whether an agent may see who they are meeting. An earlier version of this
 * comment read both as a prohibition on display. They are not one, and
 * `docs/22-visitor-name-display.md` settles where a real name would come from
 * and where it would be joined.
 *
 * So the label is **privacy-safe by construction rather than by review**: the
 * type has no field a name could sit in, and its only inputs are a closed
 * vocabulary and a count of previous meetings. Neither can carry a person. The
 * sentence a reader sees is produced by `visitorLabel` from those two values,
 * so a caller cannot pass prose through instead.
 *
 * What it does *not* say is which contact this is, because nothing in this
 * repository can say it yet: `ContactPii.fullName` is declared in the contracts
 * and has no producer, no store and no consumer. When that changes, the name
 * arrives as a field beside this label rather than inside its `display`, so the
 * guarantee above survives the feature that ends the silence.
 */
export const VISITOR_LABEL_KINDS = [
  /** No contact was ever linked. A walk-in has no history to have. */
  "unlinked",
  /** A contact Observer knows, meeting this project for the first time. */
  "known_first_meeting",
  /** A contact Observer knows, who has been here before. */
  "known_returning",
] as const;
export type VisitorLabelKind = (typeof VISITOR_LABEL_KINDS)[number];

export interface VisitorLabel {
  readonly kind: VisitorLabelKind;
  /**
   * Meetings this contact had on this project before this one. Null when there
   * is no contact, which is a different statement from a first meeting.
   */
  readonly priorMeetings: number | null;
  /** Ready to print. Produced by `visitorLabel`, never composed by a caller. */
  readonly display: string;
}

/** "2nd", "3rd", "11th". Small, and wrong in three places if written twice. */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const unit = n % 10;
  return `${n}${unit === 1 ? "st" : unit === 2 ? "nd" : unit === 3 ? "rd" : "th"}`;
}

/**
 * The only supported way to build a `VisitorLabel`.
 *
 * A pure function of a closed enum and an integer, which is what makes the
 * privacy guarantee structural: there is no parameter a name, an email or a
 * phone number could be passed in, so no call site can leak one by accident.
 */
export function visitorLabel(kind: VisitorLabelKind, priorMeetings: number | null): VisitorLabel {
  if (kind === "unlinked") {
    return { kind, priorMeetings: null, display: "Not linked to a contact" };
  }
  if (kind === "known_first_meeting" || priorMeetings === null || priorMeetings <= 0) {
    return { kind, priorMeetings: priorMeetings ?? 0, display: "First meeting" };
  }
  return {
    kind,
    priorMeetings,
    display: `Returning · ${ordinal(priorMeetings + 1)} meeting`,
  };
}

/* --- 1. the meeting list --------------------------------------------------- */

/**
 * Whether anybody is owed a follow-up, and whether that can be known.
 *
 * Four states, and the fourth is the point. Observer sees the outcome the agent
 * recorded at the end of the meeting; it does not see the call that came
 * afterwards, and no source in this phase does. "Follow-up needed" and
 * "follow-up done" are therefore different questions with different answers,
 * and a screen that renders the first as the second turns a reminder into a
 * report of work that may never have happened.
 */
export const FOLLOW_UP_STATES = [
  /** The recorded outcome says one is owed. */
  "required",
  /** The recorded outcome closed the meeting. */
  "not_required",
  /** The meeting ended without an outcome being recorded at all. */
  "not_recorded",
  /** No CRM is connected, so the meeting has no outcome to read. */
  "unavailable",
] as const;
export type FollowUpState = (typeof FOLLOW_UP_STATES)[number];

export const FOLLOW_UP_LABELS: Record<FollowUpState, string> = {
  required: "Follow-up recorded as needed",
  not_required: "No follow-up recorded as needed",
  not_recorded: "Outcome not recorded",
  unavailable: "No CRM connected",
};

/**
 * One meeting, as the list shows it.
 *
 * Extends `MeetingSummary` rather than replacing it: the old `listMeetings`
 * still returns the summary, every surface that already reads one keeps
 * working, and the two can never drift into two ideas of what a meeting is.
 */
/** A unit code as a register prints it, with its own page when the catalogue holds it. */
export interface UnitReference {
  readonly code: string;
  readonly href: string | null;
}

export interface MeetingRow extends MeetingSummary {
  /** Which surface the presentation ran on. Never inferred (`SESSION_CHANNELS`). */
  readonly channel: SessionChannel;
  readonly channelLabel: string;
  /** Never a name, an email or a phone number. See `VisitorLabel`. */
  readonly visitor: VisitorLabel;
  /**
   * Units opened in this meeting, in the order they were first opened.
   *
   * Each carries the href of its own page, or `null` when the catalogue does
   * not hold that code — a showroom can record a code the catalogue has never
   * stated (a legacy import, a unit withdrawn since), and a register that
   * linked every code sent readers to a page that could only say the link was
   * wrong. The register prints an unlinked code as a code, not as a link.
   */
  readonly unitsViewed: readonly UnitReference[];
  readonly favourites: number;
  readonly followUp: FollowUpState;
  readonly followUpLabel: string;
  /**
   * False for a legacy import, which carries the order of the presentation and
   * not its timing. The duration shown for one of those is the session's, not a
   * sum of steps, and the row says so rather than drawing a timeline.
   */
  readonly timingAvailable: boolean;
}

/** One value a reader can filter by, with how many meetings carry it. */
export interface MeetingFilterOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

/**
 * What is on offer in the filter controls.
 *
 * Counted over the **period**, not over the current result, so a filter that
 * would empty the list still says how many meetings it would keep. A control
 * whose options are computed after filtering can only ever offer the reader
 * more of what they already have.
 */
export interface MeetingFilterOptions {
  readonly agents: readonly MeetingFilterOption[];
  readonly channels: readonly MeetingFilterOption[];
  readonly outcomes: readonly MeetingFilterOption[];
}

/** Null on every axis is the unfiltered list. There is no implicit default. */
export interface MeetingFilters {
  readonly agentId: string | null;
  readonly channel: SessionChannel | null;
  readonly outcome: MeetingOutcome | null;
}

export interface MeetingListView {
  readonly context: ViewContext;
  /** Rows after the filters. The denominator the reader is looking at. */
  readonly total: number;
  /** Meetings in the period before any filter, so the filter has a scale. */
  readonly periodTotal: number;
  readonly rows: readonly MeetingRow[];
  readonly filters: MeetingFilters;
  readonly options: MeetingFilterOptions;
  readonly findings: readonly ShowroomFinding[];
  /**
   * What to say when `rows` is empty, written here and always present.
   *
   * Carried on every response rather than only on an empty one, so a component
   * never composes the sentence itself: an empty list caused by a filter and an
   * empty list caused by a quiet fortnight need different words, and only the
   * read model knows which of the two it is looking at.
   */
  readonly emptyState: string;
  readonly evidence: EvidenceRef;
}

/* --- 2. one unit ----------------------------------------------------------- */

/**
 * The unit itself, as the catalogue states it.
 *
 * Attributes rather than measurements: nothing here was observed, all of it was
 * supplied, and the two belong in separate objects so a reader is never left
 * wondering which of the numbers on a unit page came from a buyer.
 */
export interface UnitAttributes {
  readonly unitId: string;
  readonly unitCode: string;
  readonly block: string;
  /** Each `null` when the catalogue did not state it; the display strings say so. */
  readonly floor: number | null;
  readonly rooms: number | null;
  readonly areaSqm: number | null;
  readonly orientation: string | null;
  readonly status: "available" | "reserved" | "sold";
  readonly statusLabel: string;
  readonly price: number | null;
  readonly priceDisplay: string;
  readonly pricePerSqmDisplay: string;
}

/**
 * The six interest signals, each with its own state.
 *
 * Named slots rather than a list, because a unit page places them deliberately
 * and a component that has to search an array for "favourites" will eventually
 * search for the wrong string. Each is a `MetricValue`, so a signal the project
 * cannot produce — shares on a scheme with no WEB IRIS, comparisons on a
 * project where nobody opened Compare — renders its own absence instead of a
 * zero that reads as indifference.
 */
export interface UnitInterestSignals {
  readonly views: MetricValue;
  readonly uniqueSessions: MetricValue;
  readonly favourites: MetricValue;
  readonly documentOpens: MetricValue;
  readonly comparisons: MetricValue;
  readonly shares: MetricValue;
}

export const UNIT_TIMELINE_KINDS = [
  "viewed",
  "favourited",
  "plan_opened",
  "compared",
  "shared",
  "balcony_viewed",
  "floor_cut_viewed",
  "screenshot",
  "outcome_recorded",
] as const;
export type UnitTimelineKind = (typeof UNIT_TIMELINE_KINDS)[number];

/**
 * One thing that happened to this unit, and how well it is known.
 *
 * `at` is nullable and `atDisplay` says so, because a legacy import records
 * that a unit was opened during a meeting and not at what moment. `tier` is the
 * evidence class from `docs/04-journey.md` — observed sequence for an act IRIS
 * saw, attributed conversion for an outcome that belongs to the meeting rather
 * than to this unit alone — and `channel` is carried on every entry because a
 * minute in a browser tab and a minute in front of a wall-sized render are not
 * the same measurement (`SESSION_CHANNELS`).
 */
export interface UnitTimelineEntry {
  readonly id: string;
  readonly kind: UnitTimelineKind;
  readonly label: string;
  readonly detail: string | null;
  /** Null when the source records the meeting but not the moment. */
  readonly at: string | null;
  /** Already formatted, and honest: the day alone when there is no clock. */
  readonly atDisplay: string;
  readonly channel: SessionChannel;
  readonly channelLabel: string;
  readonly tier: EvidenceTier;
  readonly sources: readonly InsightSource[];
  readonly meetingId: string;
  readonly agentName: string;
  readonly href: string;
}

/**
 * How well a funnel stage is known.
 *
 * The distinction the styling turns on. A unit that was opened was *observed*
 * being opened. A meeting that ended in a reservation, in which this unit was
 * one of five shown, is *attributed* — the outcome belongs to the meeting and
 * assigning it to one unit is an association. Only a system of record stating
 * something about this unit itself is *verified*, and only that may be styled
 * as verified. ADR-0021 is the same rule from the other side: a deal stage is
 * authoritative, a signal is not, and neither may be dressed as the other.
 */
export const FUNNEL_VERIFICATIONS = [
  /** IRIS saw the act itself. */
  "observed",
  /** Joined to a meeting outcome that is not about this unit alone. */
  "attributed",
  /** A system of record states it about this unit. Stylable as verified. */
  "verified",
  /** No source can answer this stage at all. */
  "unavailable",
] as const;
export type FunnelVerification = (typeof FUNNEL_VERIFICATIONS)[number];

export const UNIT_FUNNEL_STAGES = [
  "viewed",
  "favourited",
  "follow_up",
  "offer",
  "reservation",
  "purchase",
] as const;
export type UnitFunnelStageId = (typeof UNIT_FUNNEL_STAGES)[number];

export interface UnitFunnelStage {
  readonly id: UnitFunnelStageId;
  /** The counts and the rate, in the shape every other funnel already uses. */
  readonly step: FunnelStep;
  readonly verification: FunnelVerification;
  /** Why the stage is only as strong as it is. Always present. */
  readonly basis: string;
  readonly tier: EvidenceTier;
  readonly sources: readonly InsightSource[];
}

/** Who showed this unit, and how often. Never a ranking of them. */
export interface UnitAgentInterest {
  readonly agentId: string;
  readonly name: string;
  readonly meetings: number;
  readonly favourites: number;
  /** Their meetings on this project, which is the sample any verdict needs. */
  readonly sampleSize: number;
  readonly minimumSampleSize: number;
  /** True below `AGENT_MIN_SAMPLE`: show the figure, never a rank or a verdict. */
  readonly belowMinimum: boolean;
  readonly href: string;
}

/**
 * Interest over time, and whether it may be read as a trend.
 *
 * The series is always returned — a reader may look at the shape of anything —
 * and `verdict` is the `MetricValue` that goes `insufficient` below
 * `UNIT_MIN_SAMPLE`. `docs/10-policies.md` §6: below the minimum, the raw figure
 * and how far short it falls, never a direction.
 */
export interface UnitInterestTrend {
  readonly series: TrendSeries;
  readonly verdict: MetricValue;
  readonly direction: "rising" | "flat" | "falling" | "unknown";
  readonly baselineLabel: string;
}

/**
 * One unit, in full.
 *
 * **A separate method from `getUnitAttention`, not an extension of
 * `UnitAttentionDetail`.** Three reasons, and the third is the one that
 * settled it.
 *
 * 1. They answer different questions. `UnitAttentionDetail` explains a row's
 *    position in a ranking of the whole building — who it was compared against,
 *    what its dwell was beside the project median. This is the unit's own page,
 *    and a timeline, a funnel and a list of related meetings have nothing to do
 *    with where the unit sits in a list.
 * 2. Cost. The attention view computes every row in the building to normalise
 *    attention; hanging a per-unit timeline off `selected` would make the list
 *    surface build one on every render, for a panel most readers never open.
 * 3. **A unit nobody opened still has a page.** `UnitAttentionView.selected` is
 *    null for a unit with no observations, which is exactly the unit whose page
 *    most needs to explain itself. A method that can only answer for units that
 *    already have attention is a method the empty state cannot use.
 *
 * The two do not diverge: `attention` below is the same `UnitAttentionRow` the
 * list returns, built by the same projection, so the page and the table cannot
 * disagree about a count.
 */
export interface UnitDetailView {
  readonly context: ViewContext;
  readonly unit: UnitAttributes;
  /** One sentence naming the unit and what the period saw of it. */
  readonly headline: string;
  /** The row from the attention projection, for the raw counts and the charts. */
  readonly attention: UnitAttentionRow;
  readonly signals: UnitInterestSignals;
  readonly timeline: readonly UnitTimelineEntry[];
  /** What the timeline cannot say. Stated, never implied by a gap. */
  readonly timelineNote: string;
  readonly funnel: readonly UnitFunnelStage[];
  readonly relatedMeetings: readonly MeetingRow[];
  readonly relatedAgents: readonly UnitAgentInterest[];
  readonly trend: UnitInterestTrend;
  readonly findings: readonly ShowroomFinding[];
  /** Present when nothing in the period touched this unit. Never a row of zeros. */
  readonly emptyState: string | null;
  readonly evidence: EvidenceRef;
}

/* --- 3. one agent ---------------------------------------------------------- */

/**
 * Where else this person works.
 *
 * Scoped to the projects the **viewer** holds, not to the projects the agent
 * holds. An agency selling for two developers is the ordinary arrangement, and
 * a developer who could see that their agent also works for a competitor would
 * be reading a commercial fact about somebody else off a staff page.
 */
export interface AgentProjectCoverage {
  readonly projectId: string;
  readonly projectName: string;
  readonly meetings: number;
  /** True for the project currently being read. */
  readonly isCurrent: boolean;
  readonly href: string;
}

/** A unit this agent keeps opening. Association with their habit, nothing more. */
export interface AgentUnitInterest {
  readonly unitCode: string;
  readonly meetings: number;
  readonly favourites: number;
  /** Share of this agent's meetings that opened it. */
  readonly share: number;
  readonly href: string;
}

/**
 * Follow-up, and the half of it Observer cannot see.
 *
 * `recorded` is a fact: the agent tapped an outcome that says one is owed.
 * `completed` is **always unavailable in this phase** and is carried anyway,
 * because a screen that shows only the first figure invites the reader to treat
 * it as the second. An absent measurement that is named is a gap; an absent
 * measurement that is omitted is a wrong answer.
 */
export interface AgentFollowUp {
  readonly recorded: MetricValue;
  readonly completed: MetricValue;
  readonly note: string;
}

/**
 * An outcome a system of record stands behind.
 *
 * Kept separate from the outcome mix, which is every outcome including the ones
 * nobody recorded. These are the commercial results, they carry
 * `CRM_OUTCOME_CONTEXT`, and on a project with no CRM every one of them is
 * unavailable rather than nil (ADR-0023: outcome context is never the subject
 * of a primary insight, which is why they sit beside the presentation figures
 * and not above them).
 */
export interface AgentVerifiedOutcome {
  readonly outcome: MeetingOutcome;
  readonly label: string;
  readonly metric: MetricValue;
  readonly tier: EvidenceTier;
  readonly sources: readonly InsightSource[];
}

/**
 * What the buyers this agent presented to were looking at.
 *
 * **The shares do not sum to one and this is not a pie.** Each is the share of
 * the agent's meetings that opened at least one unit of that kind, and a single
 * meeting that showed a one-room flat and a four-room penthouse counts in both.
 * Normalising them into parts of a whole would answer a question nobody asked —
 * "how was their time divided" — with figures measured for a different one.
 */
export interface AgentBuyerInterest {
  readonly id: string;
  readonly label: string;
  /** Meetings of theirs in which at least one unit of this kind was opened. */
  readonly meetings: number;
  /** Of their own meetings. A rate, not a slice. */
  readonly share: number;
  /** The same rate across the whole project, so the agent's has a scale. */
  readonly teamShare: number;
}

/**
 * One agent, in full.
 *
 * **This is not a score, and there is no field it could be put in.** No rank, no
 * total, no weighting between the axes: the product refuses the league table
 * (`docs/01-foundation.md` on the agency audience), and refusing it in the type
 * is more durable than refusing it in a component. Every figure here is an
 * association between what a person did and what happened next, and the
 * findings are worded as such.
 *
 * `sampleSize` and `minimumSampleSize` are carried on the view itself rather
 * than only on each metric, because the suppression is a property of the
 * *page*: below `AGENT_MIN_SAMPLE` there is no verdict, no rank and no trend
 * anywhere on it, and `suppressionNote` is the sentence that says how far short
 * the sample falls (`docs/10-policies.md` §6).
 *
 * A session and a meeting resolve to one identifier (`docs/10-policies.md` §4),
 * so "recent sessions" and "recent meetings" are one list here rather than the
 * same list twice under two headings.
 */
export interface AgentDetailView {
  readonly context: ViewContext;
  readonly agentId: string;
  readonly name: string;
  readonly organisationName: string;
  readonly sampleSize: number;
  readonly minimumSampleSize: number;
  readonly belowMinimum: boolean;
  /** Null when the sample clears the minimum. Never an empty string. */
  readonly suppressionNote: string | null;
  /** Meetings, median duration, units opened, coverage. */
  readonly activity: readonly MetricValue[];
  /** How they present, from the same projection the Agents view reads. */
  readonly profile: AgentProfile;
  readonly projects: readonly AgentProjectCoverage[];
  readonly recentMeetings: readonly MeetingRow[];
  readonly commonUnits: readonly AgentUnitInterest[];
  readonly followUp: AgentFollowUp;
  readonly verifiedOutcomes: readonly AgentVerifiedOutcome[];
  readonly outcomeMix: readonly OutcomeSlice[];
  readonly sessionsOverTime: TrendSeries;
  /** Meetings, units opened, shortlisted, outcome recorded, progressed. */
  readonly funnel: readonly FunnelStep[];
  readonly buyerInterest: readonly AgentBuyerInterest[];
  readonly findings: readonly ShowroomFinding[];
  readonly evidence: EvidenceRef;
}

/* --- 4. attention ---------------------------------------------------------- */

/**
 * The six things worth a person's attention, named once.
 *
 * They are states rather than alerts in the monitoring sense: each is a
 * question the product asks of the period, and the answer is raised, clear, or
 * unanswerable. A dashboard that only ever shows the raised ones cannot tell a
 * quiet project from a project whose checks never ran.
 */
export const ATTENTION_KINDS = [
  "high_interest_no_follow_up",
  "demand_dropping",
  "crm_verification_missing",
  "source_offline",
  "analytics_queue_pressure",
  "viewed_never_shortlisted",
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/**
 * The ceiling on how loud each state may ever be.
 *
 * `ALERT_SEVERITIES` is reused rather than replaced — a second severity
 * vocabulary would be two words for one idea, and `AlertItem` already carries
 * the one the Overview alerts use. Its middle level is spelled `warning` here
 * and read as the product's "attention"; renaming the member would mean editing
 * the MADSPACE administration surface, which is out of scope for this pass, so
 * the spelling is left alone and the meaning is stated.
 *
 * **Red is reserved and is never the default.** A severity is a property of the
 * state, not a choice a builder makes per project, so each kind declares the
 * strongest it may reach and the builder cannot exceed it. Only the two states
 * that mean *a fact is missing from the record* can reach critical; a state
 * about buyer behaviour never can, because behaviour is not an incident.
 */
export interface AttentionKindDefinition {
  readonly kind: AttentionKind;
  readonly label: string;
  /** The question it asks, in one line. Shown when the state is clear. */
  readonly question: string;
  readonly maxSeverity: AlertSeverity;
}

export const ATTENTION_KIND_DEFINITIONS: readonly AttentionKindDefinition[] = [
  {
    kind: "high_interest_no_follow_up",
    label: "High interest, no follow-up recorded",
    question: "Did a meeting that shortlisted a unit end without a follow-up being recorded?",
    maxSeverity: "warning",
  },
  {
    kind: "demand_dropping",
    label: "Demand falling",
    question: "Is any unit drawing materially less attention than in the baseline period?",
    maxSeverity: "warning",
  },
  {
    kind: "crm_verification_missing",
    label: "Outcomes not verified",
    question: "Are meetings ending without an outcome the CRM can confirm?",
    maxSeverity: "critical",
  },
  {
    kind: "source_offline",
    label: "A source has gone quiet",
    question: "Has a connected source stopped sending, or never sent at all?",
    maxSeverity: "critical",
  },
  {
    kind: "analytics_queue_pressure",
    label: "Ingestion delay",
    question: "Is observed data arriving later than the surfaces reading it assume?",
    maxSeverity: "warning",
  },
  {
    kind: "viewed_never_shortlisted",
    label: "Opened repeatedly, never shortlisted",
    question: "Is a unit being shown again and again without anybody keeping it?",
    maxSeverity: "warning",
  },
];

/** What a raised state is actually about, so the reader can go to it. */
export interface AttentionSubject {
  readonly id: string;
  readonly label: string;
  readonly href: string | null;
}

export interface AttentionState {
  readonly kind: AttentionKind;
  /** Reused whole. The title, detail, severity, evidence and action live here. */
  readonly alert: AlertItem;
  readonly subjects: readonly AttentionSubject[];
  readonly sampleSize: number;
  readonly minimumSampleSize: number;
  /** True when the state is worth naming but too thin to rank or read as a trend. */
  readonly belowMinimum: boolean;
  readonly tier: EvidenceTier;
  readonly sources: readonly InsightSource[];
  /** 1-based, severity first and size second. Stated so two surfaces agree. */
  readonly rank: number;
}

/**
 * The one state a summary surface leads with, for every surface that leads with one.
 *
 * ## Why this is here and not in a builder
 *
 * `AttentionState.rank` already says "1-based, severity first and size second.
 * Stated so two surfaces agree" — the contract anticipated two readers before
 * there were two. There were: **What needs attention** listed the ranked states,
 * and **Briefing** scanned presenters for an outcome flag of its own and called
 * the first one "the one thing worth acting on". Two computations over the same
 * period, agreeing only by luck, which is the shape a checklist requirement
 * exists to prevent.
 *
 * So the selection lives beside the definitions rather than inside either
 * builder. A builder importing another builder would tie two synthetic
 * implementations together and the tie would not survive the first of them
 * being replaced; a rule in the contract is read by whatever implements it.
 *
 * Returns null when nothing is raised, which is the honest answer and the one
 * the Briefing already draws as "Clear".
 */
export function actionWorthTaking(view: AttentionView): AttentionState | null {
  /*
   * `states` is documented as ranked, and `rank` is 1-based, so position and
   * rank should agree. They are checked against each other rather than trusted:
   * a builder that ranked correctly but emitted out of order would otherwise
   * hand the two surfaces different leads while both looked right in isolation.
   */
  let best: AttentionState | null = null;
  for (const state of view.states) {
    if (best === null || state.rank < best.rank) best = state;
  }
  return best;
}

export const ATTENTION_CHECK_STATES = ["raised", "clear", "unavailable"] as const;
export type AttentionCheckState = (typeof ATTENTION_CHECK_STATES)[number];

/**
 * Every question that was asked, including the ones that came back clean.
 *
 * The counterpart to a list of alerts. "Nothing is wrong" and "we could not
 * look" are different answers, and a surface that shows only raised states
 * renders them identically — as an empty panel.
 */
export interface AttentionCheck {
  readonly kind: AttentionKind;
  readonly label: string;
  readonly state: AttentionCheckState;
  /** Why it is clear, or why it could not be evaluated. Always a sentence. */
  readonly reason: string;
}

export interface AttentionView {
  readonly context: ViewContext;
  /** Raised states, ranked. Severity first, then how much they are about. */
  readonly states: readonly AttentionState[];
  readonly checks: readonly AttentionCheck[];
  /** What to say when nothing is raised. Distinguishes quiet from unmeasured. */
  readonly emptyState: string;
  readonly meetingCount: number;
  readonly evidence: EvidenceRef;
}
