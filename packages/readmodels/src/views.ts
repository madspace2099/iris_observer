import type { MeetingId, PreMeetingBrief } from "@observer/contracts";
import type { ViewContext } from "./context";
import type {
  ActionItem,
  AiBriefing,
  AlertItem,
  ChangeItem,
  DataHealth,
  EvidenceRef,
  FunnelStep,
  MetricValue,
  Verdict,
} from "./metric-value";

/**
 * The read models the screens consume.
 *
 * Each one is assembled for a surface, not for an entity. A component never
 * joins two of these together — that reconciliation belongs in the repository
 * where it can be tested once (ADR-0012).
 */

/* --- Executive Overview -------------------------------------------------- */

export interface ExecutiveOverview {
  readonly context: ViewContext;
  readonly verdict: Verdict;
  /** Units Sold, Revenue, Average Days to Close, Active Buyers. In that order. */
  readonly headline: readonly MetricValue[];
  /** Viewing to Offer, Offer to Reservation, Reservation to Sale. */
  readonly funnel: readonly FunnelStep[];
  readonly briefing: AiBriefing;
  readonly changes: readonly ChangeItem[];
  readonly alerts: readonly AlertItem[];
  readonly actions: readonly ActionItem[];
  readonly dataHealth: DataHealth;
}

/* --- Sales agent overview ------------------------------------------------ */

export interface UpcomingMeeting {
  readonly meetingId: MeetingId;
  readonly scheduledFor: string;
  readonly whenLabel: string;
  /** Display names of the participants. Agent-facing surface only. */
  readonly participantNames: readonly string[];
  readonly isReturningBuyer: boolean;
  /** One line the agent can read while walking to the room. */
  readonly headline: string;
  readonly briefHref: string;
  readonly briefReady: boolean;
  /** Why the brief is thin, when it is. */
  readonly briefCaveat: string | null;
}

export interface FollowUpItem {
  readonly contactId: string;
  readonly displayName: string;
  readonly lastMeetingLabel: string;
  readonly daysSinceMeeting: number;
  readonly reason: string;
  readonly href: string;
  readonly urgency: "overdue" | "due" | "upcoming";
}

export interface AgentOverview {
  readonly context: ViewContext;
  readonly verdict: Verdict;
  readonly upcoming: readonly UpcomingMeeting[];
  readonly followUps: readonly FollowUpItem[];
  /**
   * The agent's own figures. Never a comparison against colleagues: this
   * surface must not become a scoreboard, or the data supply degrades and
   * every other number degrades with it.
   */
  readonly personal: readonly MetricValue[];
  readonly briefing: AiBriefing;
  readonly dataHealth: DataHealth;
}

/* --- Pre-meeting brief --------------------------------------------------- */

/**
 * The brief, plus what the screen needs to render it.
 *
 * The contract from `@observer/contracts` carries the intelligence; this adds
 * resolved display names, hrefs and unit labels so no component has to look
 * anything up.
 */
export interface UnitLabel {
  readonly unitId: string;
  readonly code: string;
  readonly summary: string;
  readonly priceDisplay: string | null;
  readonly statusLabel: string;
  readonly available: boolean;
  readonly href: string;
}

export interface PreMeetingBriefView {
  readonly context: ViewContext;
  readonly brief: PreMeetingBrief;
  /** Participant display names. Agent-facing only — see ADR-0018. */
  readonly participantNames: readonly string[];
  /** Every unit the brief mentions, resolved once. */
  readonly units: Readonly<Record<string, UnitLabel>>;
  /** Evidence referenced by the brief's statements, resolved to hrefs. */
  readonly evidence: Readonly<Record<string, EvidenceRef>>;
  readonly meetingHref: string;
  readonly contactHref: string | null;
}

/* --- surface classification ---------------------------------------------- */

/**
 * Whether a surface can ever be seen by a buyer.
 *
 * Declared on the read model rather than inferred from the route, so the rule
 * is checkable in a test: no internal read model may be returned for a
 * buyer-visible surface (ADR-0018).
 */
export const SURFACE_AUDIENCES = ["internal", "buyer_facing"] as const;
export type SurfaceAudience = (typeof SURFACE_AUDIENCES)[number];

export interface SurfaceDescriptor {
  readonly route: string;
  readonly audience: SurfaceAudience;
  readonly requiresRole: readonly string[];
}
