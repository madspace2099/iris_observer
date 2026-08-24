import { z } from "zod";
import {
  ContactIdSchema,
  EvidenceIdSchema,
  InstantSchema,
  MeetingIdSchema,
  ProjectIdSchema,
  UnitIdSchema,
} from "./ids";
import { SourceSystemSchema } from "./sources";

/**
 * Evidence discipline.
 *
 * Observer joins three source systems and then says things about buyers. The
 * distance between "these events happened in this order" and "the website
 * caused this sale" is enormous, and a product that blurs it will eventually
 * tell a developer something false about where their money should go.
 *
 * So the strength of every claim is part of the claim, carried in data rather
 * than in the wording of a sentence.
 */
export const EVIDENCE_TIERS = [
  /**
   * These facts were recorded, in this order, for this person. Nothing is
   * claimed beyond the record itself. Most of the pre-meeting brief is this.
   */
  "observed_sequence",
  /**
   * A conversion assigned to a source under a stated attribution rule. The
   * rule — window, qualifying link, touch model — is part of the evidence and
   * must be displayable next to the number.
   */
  "attributed_conversion",
  /**
   * Two things co-occur more than chance would suggest, at a stated sample
   * size and effect. Labelled as a pattern wherever it is shown, never as a
   * finding about an individual buyer.
   */
  "statistical_association",
  /**
   * A cause-and-effect claim. **Observer does not produce this tier.** It is
   * named here so that the prohibition is expressible and testable rather than
   * a matter of editorial discipline. Establishing causation needs a
   * controlled experiment, which is outside this product.
   */
  "causal_claim",
] as const;

export const EvidenceTierSchema = z.enum(EVIDENCE_TIERS);
export type EvidenceTier = z.infer<typeof EvidenceTierSchema>;

/** The tiers Observer is permitted to emit. */
export const PRODUCIBLE_EVIDENCE_TIERS = [
  "observed_sequence",
  "attributed_conversion",
  "statistical_association",
] as const;

export type ProducibleEvidenceTier = (typeof PRODUCIBLE_EVIDENCE_TIERS)[number];

export function isProducibleTier(tier: EvidenceTier): tier is ProducibleEvidenceTier {
  return (PRODUCIBLE_EVIDENCE_TIERS as readonly EvidenceTier[]).includes(tier);
}

/* --- confidence --------------------------------------------------------- */

/**
 * Confidence is categorical and explained, not a manufactured percentage.
 *
 * "73% confident" invites a precision the underlying data does not have. A
 * level plus the reason for it is both more honest and more useful: the reader
 * can tell whether to wait for more data or act now.
 */
export const CONFIDENCE_LEVELS = ["high", "moderate", "low", "insufficient"] as const;
export const ConfidenceLevelSchema = z.enum(CONFIDENCE_LEVELS);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const ConfidenceSchema = z.strictObject({
  level: ConfidenceLevelSchema,
  /** Plain-language reason, shown to the reader. */
  reason: z.string().min(1).max(240),
  sampleSize: z.number().int().nonnegative().nullable().default(null),
  minSampleRequired: z.number().int().positive().nullable().default(null),
});
export type Confidence = z.infer<typeof ConfidenceSchema>;

/* --- where a claim can be verified -------------------------------------- */

/**
 * Every number drills to the records behind it. This is not only a usability
 * nicety: an agency manager who disputes a figure must be able to click into
 * the meetings, and a figure that cannot be audited will be rejected, rightly.
 */
export const DrillTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("timeline"), contactId: ContactIdSchema }),
  z.strictObject({ kind: z.literal("meeting"), meetingId: MeetingIdSchema }),
  z.strictObject({ kind: z.literal("contact"), contactId: ContactIdSchema }),
  z.strictObject({ kind: z.literal("unit"), unitId: UnitIdSchema }),
  z.strictObject({
    kind: z.literal("meetings"),
    projectId: ProjectIdSchema,
    filter: z.record(z.string(), z.string()).default({}),
  }),
  z.strictObject({
    kind: z.literal("segment"),
    projectId: ProjectIdSchema,
    dimension: z.string().min(1).max(64),
    value: z.string().min(1).max(120),
  }),
]);
export type DrillTarget = z.infer<typeof DrillTargetSchema>;

/* --- the evidence object ------------------------------------------------ */

/**
 * What a statement rests on.
 *
 * Produced alongside every generated sentence and every headline number. A
 * statement without one cannot be rendered — that constraint is what keeps the
 * intelligence layer from drifting into confident prose with nothing under it.
 */
export const EvidenceSchema = z.strictObject({
  id: EvidenceIdSchema,
  tier: EvidenceTierSchema,
  /** Which observable facts were read. Ids from `observables.ts`. */
  factIds: z.array(z.string().min(1).max(80)).min(1),
  /** Which systems supplied them. Drives the "one source is missing" notice. */
  sources: z.array(SourceSystemSchema).min(1),
  observedFrom: InstantSchema,
  observedTo: InstantSchema,
  /** How many underlying records. The honest denominator for the reader. */
  observationCount: z.number().int().nonnegative(),
  confidence: ConfidenceSchema,
  /**
   * Share of the expected inputs actually present, 0 to 1. A brief built while
   * the CRM connector is down is still useful, but it must say so.
   */
  completeness: z.number().min(0).max(1),
  drillTo: DrillTargetSchema,
  /** Anything that materially qualifies the claim. Rendered, not hidden. */
  caveats: z.array(z.string().min(1).max(240)).default([]),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * A sentence Observer is prepared to stand behind.
 *
 * The evidence reference is required, and the tier is repeated on the
 * statement so that a renderer can style an association differently from an
 * observation without dereferencing anything.
 */
export const StatementSchema = z
  .strictObject({
    text: z.string().min(1).max(500),
    tier: EvidenceTierSchema,
    evidenceId: EvidenceIdSchema,
  })
  .refine((s) => isProducibleTier(s.tier), {
    message: "Observer does not produce causal claims",
    path: ["tier"],
  });
export type Statement = z.infer<typeof StatementSchema>;
