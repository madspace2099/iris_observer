import { z } from "zod";
import {
  ContactIdSchema,
  EvidenceIdSchema,
  InstantSchema,
  ProjectIdSchema,
  TenantIdSchema,
} from "./ids";
import { ConfidenceSchema } from "./evidence";

/**
 * Observer's intent signal — what the product calls "lead temperature".
 *
 * Kept strictly apart from the deal stage, and the separation is the point.
 *
 * | | Deal stage | Intent signal |
 * | --- | --- | --- |
 * | Authority | the CRM, or an authorised manual outcome | Observer |
 * | Direction | generally forward through a pipeline | rises **and falls** |
 * | Lifetime | until the business changes it | expires; a stale signal is not a signal |
 * | Meaning | what was agreed | what the behaviour suggests |
 *
 * A buyer can cool off without moving backwards commercially. Modelling
 * temperature as a pipeline rung makes conversion arithmetic meaningless,
 * which is why an earlier draft's `hot_lead` stage was removed.
 *
 * The UI may badge `high` as "Hot lead". That is a label on an Observer signal
 * layered over the authoritative stage — never a replacement for it.
 */

export const INTENT_LEVELS = ["low", "medium", "high", "insufficient_data"] as const;
export const IntentLevelSchema = z.enum(INTENT_LEVELS);
export type IntentLevel = z.infer<typeof IntentLevelSchema>;

/**
 * Why the signal came out where it did, in machine-readable form.
 *
 * Reason codes exist so the classification can be explained without
 * re-deriving it, filtered on, and argued with. "High because she shortlisted
 * two units and returned three times" is a conversation; "high" alone is not.
 */
export const INTENT_REASON_CODES = [
  "recent_return_visit",
  "multiple_units_shortlisted",
  "comparison_completed",
  "material_shared_with_buyer",
  "deep_dive_on_available_unit",
  "meeting_attended_recently",
  "consistent_attribute_preference",
  "no_activity_in_window",
  "shortlisted_unit_unavailable",
  "single_touch_only",
  "sources_incomplete",
] as const;
export const IntentReasonCodeSchema = z.enum(INTENT_REASON_CODES);
export type IntentReasonCode = z.infer<typeof IntentReasonCodeSchema>;

/**
 * One metric's part in the score.
 *
 * Carried so the verdict is explainable rather than opaque: a reader can see
 * which figure moved the classification and by how much.
 */
export const IntentContributionSchema = z.strictObject({
  metricId: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  /** The observed value, already formatted for display. */
  display: z.string().min(1).max(60),
  /** Weight this rule carries, 0 to 1, summing to 1 across contributions. */
  weight: z.number().min(0).max(1),
  /** Points this contribution added to the score. May be negative. */
  points: z.number(),
});
export type IntentContribution = z.infer<typeof IntentContributionSchema>;

export const IntentSignalSchema = z
  .strictObject({
    /** Stable identifier for this signal instance. */
    signalId: z.string().regex(/^isg_[0-9a-z]{8,40}$/),
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    contactId: ContactIdSchema,

    level: IntentLevelSchema,
    /**
     * Deterministic score, 0 to 100. Null only when the level is
     * `insufficient_data` — a score computed from too little input would give
     * the classification a precision it has not earned.
     */
    score: z.number().min(0).max(100).nullable(),

    calculatedAt: InstantSchema,
    /**
     * When the signal stops being trustworthy.
     *
     * Intent decays. A "high" from six weeks ago describes a buyer who may
     * since have bought elsewhere, and presenting it as current is worse than
     * presenting nothing.
     */
    freshUntil: InstantSchema,

    contributingMetrics: z.array(IntentContributionSchema).default([]),
    evidenceIds: z.array(EvidenceIdSchema).default([]),
    confidence: ConfidenceSchema,
    /** Share of the expected inputs that were available, 0 to 1. */
    dataCompleteness: z.number().min(0).max(1),
    reasonCodes: z.array(IntentReasonCodeSchema).min(1),
    /** Version of the rules that produced this, so a result is reproducible. */
    rulesetVersion: z.string().min(1).max(32),
  })
  .refine((signal) => (signal.level === "insufficient_data") === (signal.score === null), {
    message: "a score exists exactly when the level is not insufficient_data",
    path: ["score"],
  })
  .refine(
    (signal) => signal.contributingMetrics.length > 0 || signal.level === "insufficient_data",
    {
      message: "a classified signal must show what produced it",
      path: ["contributingMetrics"],
    },
  );
export type IntentSignal = z.infer<typeof IntentSignalSchema>;

/** A signal past its freshness date describes a buyer who may have moved on. */
export function isIntentSignalStale(signal: IntentSignal, now: string): boolean {
  return Date.parse(now) > Date.parse(signal.freshUntil);
}

/**
 * The default rules.
 *
 * Deterministic thresholds rather than a model, and published rather than
 * buried: the classification has to be defensible to an agency that disagrees
 * with it. Tuning these is a versioned change, not a code tweak.
 */
export const INTENT_RULESET_VERSION = "1.0.0";

export const INTENT_THRESHOLDS = {
  high: 70,
  medium: 40,
  /** Below this many contributing observations, no level is claimed. */
  minimumObservations: 3,
  /** How long a signal stays fresh. Intent decays faster than a deal does. */
  freshnessDays: 21,
} as const;

export function classifyIntent(score: number): Exclude<IntentLevel, "insufficient_data"> {
  if (score >= INTENT_THRESHOLDS.high) return "high";
  if (score >= INTENT_THRESHOLDS.medium) return "medium";
  return "low";
}
