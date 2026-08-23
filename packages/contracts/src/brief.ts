import { z } from "zod";
import {
  AgentIdSchema,
  ContactIdSchema,
  InstantSchema,
  MeetingIdSchema,
  ProjectIdSchema,
  TenantIdSchema,
  UnitIdSchema,
} from "./ids.js";
import { ConfidenceSchema, StatementSchema } from "./evidence.js";
import { SourceSystemSchema } from "./sources.js";

/**
 * The pre-meeting brief.
 *
 * This is the artefact that makes the whole two-sided product work. The
 * developer buys Observer, but the sales agent produces its data, and the
 * agent will only keep feeding a system that hands them something worth having
 * before they walk into the room. A brief that says "she has looked at three
 * two-bedroom units twice each and keeps filtering for south-facing" is worth
 * having. A dashboard about the agent is not.
 *
 * Three sections, kept apart on purpose, because collapsing them is how an
 * analytics product starts lying:
 *
 *   1. `observed`       — what is recorded. No inference whatsoever.
 *   2. `interpretation` — what the data supports, labelled as such.
 *   3. `recommended`    — what to do about it.
 *
 * Every sentence in all three carries an evidence reference and a drill-down.
 */

/* --- what may never be inferred ----------------------------------------- */

/**
 * Categories the brief must never speculate about, whatever the behaviour
 * suggests. Listed as data rather than left to the prompt, so the generator
 * can be tested against them.
 *
 * Buying a home is bound up with pregnancy, divorce, illness, religion and
 * money trouble, and browsing behaviour genuinely does correlate with all of
 * them. That is exactly why the line is drawn here: the inference would often
 * be right, and it would still be indefensible to put in front of a salesperson.
 */
export const PROHIBITED_INFERENCE_CATEGORIES = [
  "health_or_disability",
  "pregnancy_or_family_planning",
  "ethnicity_or_national_origin",
  "religion_or_belief",
  "political_opinion",
  "sexual_orientation",
  "trade_union_membership",
  "financial_distress",
  "immigration_status",
  "criminal_history",
] as const;
export type ProhibitedInferenceCategory = (typeof PROHIBITED_INFERENCE_CATEGORIES)[number];

/* --- section one: observed ---------------------------------------------- */

export const OnlineActivitySchema = z.strictObject({
  sessionCount: z.number().int().nonnegative(),
  firstSeenAt: InstantSchema.nullable(),
  lastSeenAt: InstantSchema.nullable(),
  daysSinceLastVisit: z.number().int().nonnegative().nullable(),
  /** Dates of individual visits, so the agent can see a pattern of returning. */
  sessionDates: z.array(InstantSchema).default([]),
  /**
   * True when some of this history was attached after identification. The
   * agent should know which part of it the buyer never volunteered.
   */
  includesBackLinkedActivity: z.boolean().default(false),
});
export type OnlineActivity = z.infer<typeof OnlineActivitySchema>;

export const UnitInterestSchema = z.strictObject({
  unitId: UnitIdSchema,
  /** Distinct occasions, not raw view events. Re-opening a panel is not interest. */
  uniqueViews: z.number().int().nonnegative(),
  /**
   * Dwell above the threshold that separates looking from scrolling past.
   * The threshold is a metric-registry parameter, never a magic number here.
   */
  meaningfulDwellMs: z.number().int().nonnegative(),
  favourited: z.boolean(),
  channels: z.array(SourceSystemSchema).min(1),
  lastSeenAt: InstantSchema,
  materialsOpened: z.array(z.string().min(1).max(40)).default([]),
  sharedAt: InstantSchema.nullable().default(null),
});
export type UnitInterest = z.infer<typeof UnitInterestSchema>;

export const CompareSetSchema = z.strictObject({
  unitIds: z.array(UnitIdSchema).min(2),
  keptUnitId: UnitIdSchema.nullable().default(null),
  occurredAt: InstantSchema,
  channel: SourceSystemSchema,
});
export type CompareSet = z.infer<typeof CompareSetSchema>;

export const ObservedFilterSchema = z.strictObject({
  criterion: z.string().min(1).max(60),
  value: z.string().min(1).max(120),
  occurrences: z.number().int().positive(),
  lastAppliedAt: InstantSchema,
  /** Result count on the last application: did the search narrow or give up? */
  lastResultCount: z.number().int().nonnegative().nullable().default(null),
});
export type ObservedFilter = z.infer<typeof ObservedFilterSchema>;

/**
 * A price range the buyer actually stated through a filter.
 *
 * Present only when explicitly observed. A range guessed from the prices of
 * units they happened to open is an inference and belongs in section two — the
 * difference matters, because an agent who is told "her budget is 180 to 220"
 * will negotiate on it.
 */
export const ObservedPriceRangeSchema = z.strictObject({
  min: z.number().nonnegative().nullable(),
  max: z.number().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  observedAt: InstantSchema,
  occurrences: z.number().int().positive(),
});
export type ObservedPriceRange = z.infer<typeof ObservedPriceRangeSchema>;

export const ObservedSectionSchema = z.strictObject({
  onlineActivity: OnlineActivitySchema,
  unitInterest: z.array(UnitInterestSchema).default([]),
  compareSets: z.array(CompareSetSchema).default([]),
  filters: z.array(ObservedFilterSchema).default([]),
  priceRange: ObservedPriceRangeSchema.nullable().default(null),
  sharedMaterials: z
    .array(
      z.strictObject({
        occurredAt: InstantSchema,
        unitIds: z.array(UnitIdSchema).default([]),
        kind: z.string().min(1).max(40),
      }),
    )
    .default([]),
  statements: z.array(StatementSchema).default([]),
});
export type ObservedSection = z.infer<typeof ObservedSectionSchema>;

/* --- section two: interpretation ---------------------------------------- */

/**
 * A preference the data supports, with the count that supports it.
 *
 * The support count is not decoration. "South-facing, seen in 7 of 9 filter
 * applications" is a different claim from "south-facing, seen once", and an
 * agent can weigh the first and discard the second.
 */
export const PreferredAttributeSchema = z.strictObject({
  attribute: z.string().min(1).max(60),
  value: z.string().min(1).max(120),
  supportCount: z.number().int().positive(),
  totalObservations: z.number().int().positive(),
  confidence: ConfidenceSchema,
});
export type PreferredAttribute = z.infer<typeof PreferredAttributeSchema>;

export const InterpretationSectionSchema = z.strictObject({
  preferredAttributes: z.array(PreferredAttributeSchema).default([]),
  statements: z.array(StatementSchema).default([]),
});
export type InterpretationSection = z.infer<typeof InterpretationSectionSchema>;

/* --- section three: recommendations ------------------------------------- */

export const UnitToPrepareSchema = z.strictObject({
  unitId: UnitIdSchema,
  available: z.boolean(),
  /** Why this unit, stated as an evidence-backed sentence. */
  reason: StatementSchema,
});
export type UnitToPrepare = z.infer<typeof UnitToPrepareSchema>;

/**
 * A question the agent could usefully ask.
 *
 * Framed as a question rather than an assertion precisely because the data
 * cannot settle it. "She filtered for south-facing every time but the two
 * units she favourited face west — worth asking which matters more" is useful.
 * "She wants west-facing" would be a guess dressed as a fact.
 */
export const ClarificationQuestionSchema = z.strictObject({
  question: z.string().min(1).max(300),
  rationale: StatementSchema,
});
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

export const RecommendationSectionSchema = z.strictObject({
  unitsToPrepare: z.array(UnitToPrepareSchema).default([]),
  /** Units they showed interest in that are no longer sellable. */
  previouslyInterestedNowUnavailable: z.array(UnitIdSchema).default([]),
  /** Price, status or availability moves since the last visit. */
  changesSinceLastVisit: z.array(StatementSchema).default([]),
  clarificationQuestions: z.array(ClarificationQuestionSchema).default([]),
  statements: z.array(StatementSchema).default([]),
});
export type RecommendationSection = z.infer<typeof RecommendationSectionSchema>;

/* --- data health -------------------------------------------------------- */

/**
 * What is missing, said out loud.
 *
 * A brief assembled while the CRM connector is down is still worth reading,
 * but the agent must be able to tell the difference between "no prior
 * interest" and "we could not see it".
 */
export const BriefDataHealthSchema = z.strictObject({
  completeness: z.number().min(0).max(1),
  sourcesPresent: z.array(SourceSystemSchema).default([]),
  sourcesMissing: z.array(SourceSystemSchema).default([]),
  missing: z
    .array(
      z.strictObject({
        what: z.string().min(1).max(160),
        consequence: z.string().min(1).max(240),
      }),
    )
    .default([]),
});
export type BriefDataHealth = z.infer<typeof BriefDataHealthSchema>;

/* --- the brief ---------------------------------------------------------- */

export const BriefContextSchema = z.strictObject({
  meetingId: MeetingIdSchema,
  projectId: ProjectIdSchema,
  tenantId: TenantIdSchema,
  agentId: AgentIdSchema.nullable().default(null),
  scheduledFor: InstantSchema.nullable().default(null),
  /** Every participant, so a couple is briefed as a couple. */
  contactIds: z.array(ContactIdSchema).default([]),
  isReturningBuyer: z.boolean(),
  previousMeetingCount: z.number().int().nonnegative(),
  lastMeetingAt: InstantSchema.nullable().default(null),
});
export type BriefContext = z.infer<typeof BriefContextSchema>;

export const PreMeetingBriefSchema = z.strictObject({
  context: BriefContextSchema,
  generatedAt: InstantSchema,
  /** Version of the generator, so an odd brief can be reproduced later. */
  generatorVersion: z.string().min(1).max(40),

  observed: ObservedSectionSchema,
  interpretation: InterpretationSectionSchema,
  recommended: RecommendationSectionSchema,
  dataHealth: BriefDataHealthSchema,
});
export type PreMeetingBrief = z.infer<typeof PreMeetingBriefSchema>;
