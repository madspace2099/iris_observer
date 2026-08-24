import { z } from "zod";
import {
  AgentIdSchema,
  ContactIdSchema,
  DealIdSchema,
  InstallationIdSchema,
  InstantSchema,
  MeetingIdSchema,
  MeetingParticipantIdSchema,
  ProjectIdSchema,
  TenantIdSchema,
  UnitIdSchema,
} from "./ids";
import { SourceReferenceSchema, SourceSystemSchema } from "./sources";

/**
 * The journey a buyer travels, and the records that carry it.
 *
 * The stage ladder spans three source systems, which is the whole point: no
 * single system can draw it. WEBIRIS knows the first two rungs, the CRM knows
 * the booking and everything below the meeting, and the showroom knows what
 * actually happened in the room.
 */
export const JOURNEY_STAGES = [
  "anonymous_visitor",
  "identified_lead",
  "meeting_booked",
  "showroom_attended",
  "follow_up",
  "offer",
  "reservation",
  "purchase",
] as const;
export const JourneyStageSchema = z.enum(JOURNEY_STAGES);
export type JourneyStage = z.infer<typeof JourneyStageSchema>;

/** Terminal states. A journey that reaches one of these stops advancing. */
export const JOURNEY_EXITS = ["not_interested", "lost", "unreachable"] as const;
export const JourneyExitSchema = z.enum(JOURNEY_EXITS);
export type JourneyExit = z.infer<typeof JourneyExitSchema>;

/** Which system is authoritative for each rung. See `docs/06-ownership.md`. */
export const STAGE_OWNER: Readonly<Record<JourneyStage, SourceSystem>> = {
  anonymous_visitor: "webiris",
  identified_lead: "webiris",
  meeting_booked: "crm",
  showroom_attended: "showroom",
  follow_up: "crm",
  offer: "crm",
  reservation: "crm",
  purchase: "crm",
} as const;

type SourceSystem = z.infer<typeof SourceSystemSchema>;

/* --- meetings ----------------------------------------------------------- */

/**
 * How a meeting record came to exist.
 *
 * A booking and a showroom session must resolve to the same `meeting_id`, so
 * one of them creates the record and the other binds to it. Both directions
 * happen in the field, and the walk-in case must not be treated as an error:
 * a buyer who arrives unannounced is still a meeting.
 */
export const MEETING_ORIGINS = [
  /** Created from a CRM appointment; the showroom binds to it on arrival. */
  "crm_booking",
  /** Created by the showroom; no booking existed. A walk-in. */
  "showroom_walk_in",
  /** Entered by hand, typically to repair a failed binding. */
  "manual",
] as const;
export const MeetingOriginSchema = z.enum(MEETING_ORIGINS);
export type MeetingOrigin = z.infer<typeof MeetingOriginSchema>;

/**
 * Six outcomes, replacing the legacy system's three.
 *
 * `not_interested` matters more than it looks: without a recorded loss there
 * is no denominator, and "still open" cannot be told apart from "dead". The
 * legacy funnel could never produce a true conversion rate for that reason.
 *
 * `skipped` is explicit and is never silently rewritten to `presentation_only`
 * — a manufactured default is worse than an honest gap.
 */
export const MEETING_OUTCOMES = [
  "presentation_only",
  "interested",
  "follow_up_needed",
  "reservation",
  "purchase",
  "not_interested",
  "skipped",
] as const;
export const MeetingOutcomeSchema = z.enum(MEETING_OUTCOMES);
export type MeetingOutcome = z.infer<typeof MeetingOutcomeSchema>;

export const MeetingSchema = z.strictObject({
  id: MeetingIdSchema,
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  origin: MeetingOriginSchema,
  agentId: AgentIdSchema.nullable().default(null),
  installationId: InstallationIdSchema.nullable().default(null),

  bookedAt: InstantSchema.nullable().default(null),
  scheduledFor: InstantSchema.nullable().default(null),

  /**
   * When the presentation actually started. Deliberately distinct from
   * `scheduledFor` and from the moment the welcome screen was prepared: the
   * welcome screen can sit open for a quarter of an hour while the agent waits,
   * and counting that as meeting time corrupts every duration metric.
   */
  startedAt: InstantSchema.nullable().default(null),
  endedAt: InstantSchema.nullable().default(null),

  outcome: MeetingOutcomeSchema.nullable().default(null),
  outcomeRecordedAt: InstantSchema.nullable().default(null),
  /** Units the outcome refers to. Empty is valid; absent is not the same. */
  outcomeUnitIds: z.array(UnitIdSchema).default([]),

  references: z.array(SourceReferenceSchema).default([]),
});
export type Meeting = z.infer<typeof MeetingSchema>;

/**
 * Who was in the room.
 *
 * Buyers arrive in pairs more often than not, and a couple decides together —
 * a model with one contact per meeting reports half of a joint decision. An
 * unidentified participant is also representable, because a walk-in who
 * declines to give details is a real and legitimate case.
 */
export const PARTICIPANT_ROLES = ["primary", "additional", "unidentified"] as const;
export const ParticipantRoleSchema = z.enum(PARTICIPANT_ROLES);
export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;

export const MeetingParticipantSchema = z
  .strictObject({
    id: MeetingParticipantIdSchema,
    meetingId: MeetingIdSchema,
    role: ParticipantRoleSchema,
    contactId: ContactIdSchema.nullable().default(null),
  })
  .refine((p) => (p.role === "unidentified") === (p.contactId === null), {
    message: "an unidentified participant has no contact, and an identified one must have one",
    path: ["contactId"],
  });
export type MeetingParticipant = z.infer<typeof MeetingParticipantSchema>;

/* --- the authoritative deal ladder --------------------------------------- */

/**
 * The commercial state of a deal, as the business records it.
 *
 * Authoritative and generally forward-moving: it comes from the CRM, or from
 * an explicitly authorised manual outcome where no CRM is connected. It is not
 * where Observer puts its own opinions.
 *
 * **Lead temperature is deliberately absent.** An earlier draft had a
 * `hot_lead` rung here, which was a modelling error: a stage is an
 * authoritative business state that a deal progresses through, while intent is
 * a derived, time-sensitive signal that rises and falls. Putting the second
 * inside the first makes conversion arithmetic meaningless — a deal can become
 * less hot without moving backwards commercially. See `IntentSignal`.
 */
export const DEAL_STAGES = [
  "lead",
  "meeting",
  "negotiation",
  "offer",
  "reservation",
  "purchase",
  "lost",
] as const;
export const DealStageSchema = z.enum(DEAL_STAGES);
export type DealStage = z.infer<typeof DealStageSchema>;

/** Where a stage value came from. Only these two are authoritative. */
export const DEAL_STAGE_SOURCES = ["crm", "authorised_manual"] as const;
export const DealStageSourceSchema = z.enum(DEAL_STAGE_SOURCES);
export type DealStageSource = z.infer<typeof DealStageSourceSchema>;

/** Terminal stages. A deal that reaches one stops progressing. */
export const TERMINAL_DEAL_STAGES = ["purchase", "lost"] as const;

export function isTerminalDealStage(stage: DealStage): boolean {
  return (TERMINAL_DEAL_STAGES as readonly DealStage[]).includes(stage);
}

/* --- commerce ----------------------------------------------------------- */

/**
 * A contact's commercial process on one project.
 *
 * Owned by the CRM wherever a supported integration exists. Observer holds a
 * canonical copy so that the funnel can be drawn when the CRM is disconnected,
 * and so no core code has to know which vendor is on the other end.
 */
export const DealSchema = z.strictObject({
  id: DealIdSchema,
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  contactId: ContactIdSchema,
  /** Authoritative. Never carries an Observer-derived value. */
  stage: DealStageSchema,
  exit: JourneyExitSchema.nullable().default(null),
  unitIds: z.array(UnitIdSchema).default([]),
  openedAt: InstantSchema,
  lastStageChangeAt: InstantSchema,
  /** Which authority set the stage, so a stale CRM can be called stale. */
  stageSource: DealStageSourceSchema,
  references: z.array(SourceReferenceSchema).default([]),
});
export type Deal = z.infer<typeof DealSchema>;

/* --- the unified timeline ----------------------------------------------- */

/**
 * One normalised entry on a contact's cross-source timeline.
 *
 * This is an Observer read model, not a source record. The UI renders these;
 * it must never join WEBIRIS, CRM and showroom records itself (ADR-0012),
 * because the reconciliation rules — ordering across clock skew, deduplicating
 * the same fact reported by two systems, hiding entries whose consent has been
 * withdrawn — belong in one place that can be tested.
 */
export const TimelineEntrySchema = z.strictObject({
  tenantId: TenantIdSchema,
  contactId: ContactIdSchema,
  projectId: ProjectIdSchema.nullable().default(null),
  occurredAt: InstantSchema,
  source: SourceSystemSchema,
  /** The observable fact this entry represents. See `observables.ts`. */
  factId: z.string().min(1).max(80),
  /** Short, already-localised summary for display. No formatting in the UI. */
  summary: z.string().min(1).max(300),
  unitIds: z.array(UnitIdSchema).default([]),
  meetingId: MeetingIdSchema.nullable().default(null),
  /**
   * True when this entry describes activity that happened before the person
   * identified and was attached afterwards. Surfaced in the UI, because an
   * agent should know which part of the history the buyer never volunteered.
   */
  backLinked: z.boolean().default(false),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
