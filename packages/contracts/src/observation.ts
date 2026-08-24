import { z } from "zod";
import {
  ContactIdSchema,
  DeviceIdSchema,
  InstallationIdSchema,
  InstantSchema,
  MeetingIdSchema,
  ProjectIdSchema,
  TenantIdSchema,
  UnitIdSchema,
} from "./ids.js";
import { SourceSystemSchema } from "./sources.js";

/**
 * The ingestion boundary.
 *
 * ```
 * immutable source observation → adapter + validation → canonical fact
 *                                                     → projection → metric → evidence
 * ```
 *
 * The canonical fact store is **not** the external trust boundary. Clients
 * submit *source observations* — what their own system saw, in its own terms.
 * Server-side adapters normalise those into canonical facts.
 *
 * Two reasons this separation is worth its cost:
 *
 *  - **Normalisation rules change.** Keeping the immutable source observations
 *    means a corrected adapter can be re-run over history. If clients wrote
 *    canonical facts directly, a normalisation bug would be permanent.
 *  - **A client must never assert a derived truth.** Attribution, conversion,
 *    anomalies and causation are Observer's conclusions, drawn from the whole
 *    picture. A showroom PC can honestly report that a panel was open for
 *    ninety seconds; it cannot report that a sale was caused by a website.
 */

/* --- how something was measured ----------------------------------------- */

/**
 * Two systems reporting the same fact may have measured it differently, and a
 * metric that mixes measurement methods without knowing it is silently wrong.
 */
export const MEASUREMENT_METHODS = [
  /** Foreground, interaction-gated wall-clock time. The strongest signal. */
  "active_foreground",
  /** Elapsed wall-clock time with no idle or visibility gating. Weaker. */
  "elapsed_wall_clock",
  /** The source reported an occurrence with no duration at all. */
  "occurrence_only",
  /** Derived by the adapter from a start and an end observation. */
  "paired_boundary",
] as const;
export const MeasurementMethodSchema = z.enum(MEASUREMENT_METHODS);
export type MeasurementMethod = z.infer<typeof MeasurementMethodSchema>;

/**
 * How sure we are that this observation belongs to the person it is attached
 * to. Carried on the fact, because a metric that requires a deterministic
 * identity link must be able to filter on it without re-deriving the join.
 */
export const IDENTITY_CONFIDENCE = [
  /** No person attached. Anonymous visitor or unidentified participant. */
  "none",
  /** Attached through a probabilistic inference. Never counts in attribution. */
  "probabilistic",
  /** Attached through an exact, verifiable match or a human confirmation. */
  "deterministic",
] as const;
export const IdentityConfidenceSchema = z.enum(IDENTITY_CONFIDENCE);
export type IdentityConfidence = z.infer<typeof IdentityConfidenceSchema>;

/* --- what a client submits ---------------------------------------------- */

/**
 * An immutable record of what one source system saw.
 *
 * Stored exactly as received, forever, and never edited. Everything downstream
 * is rebuildable from these.
 *
 * The payload is deliberately typed loosely here: its shape is owned by the
 * per-source event catalogue, which is a later milestone (ADR-0013). What this
 * contract fixes is the envelope every source must supply regardless.
 */
export const SourceObservationSchema = z.strictObject({
  /** Client-generated. Ingest deduplicates on this, so replay is safe. */
  observationId: z.uuid(),
  /** Version of the submitting system's own event vocabulary. */
  sourceSchemaVersion: z.string().min(1).max(32),
  source: SourceSystemSchema,
  /** The source's own name for what happened. Carried, never interpreted here. */
  sourceEventName: z.string().min(1).max(120),

  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  installationId: InstallationIdSchema.nullable().default(null),
  deviceId: DeviceIdSchema.nullable().default(null),

  /** When the source says it happened. */
  occurredAt: InstantSchema,
  /** Monotonic within one session or meeting; orders events inside a millisecond. */
  sequence: z.number().int().nonnegative(),

  payload: z.record(z.string(), z.unknown()),
});
export type SourceObservation = z.infer<typeof SourceObservationSchema>;

/** Per-observation ingest outcome. Never a bare success or failure for a batch. */
export const INGEST_RESULTS = ["accepted", "duplicate", "rejected"] as const;
export const IngestResultSchema = z.enum(INGEST_RESULTS);
export type IngestResult = z.infer<typeof IngestResultSchema>;

export const IngestOutcomeSchema = z.strictObject({
  observationId: z.uuid(),
  result: IngestResultSchema,
  /** Present exactly when rejected. A rejection without a reason is a bug. */
  reason: z.string().min(1).max(300).nullable().default(null),
});
export type IngestOutcome = z.infer<typeof IngestOutcomeSchema>;

/* --- what the adapter produces ------------------------------------------ */

/**
 * A canonical fact: one observable fact, normalised, with its provenance.
 *
 * Produced only by a server-side adapter. Every field below exists because
 * some metric or some audit would be wrong without it — in particular
 * `measurementMethod` and `rawActiveDurationMs`, which are what allow a
 * threshold like "meaningful dwell" to be re-derived later at a different
 * value instead of being baked in at ingestion time.
 */
export const CanonicalFactSchema = z.strictObject({
  /** Fact identifier from the taxonomy in `observables.ts`. */
  factId: z.string().min(1).max(80),
  /** Version of the adapter's normalisation rules, so a re-run is traceable. */
  semanticVersion: z.string().min(1).max(32),

  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  /** Which system observed it, and through which channel it reached the buyer. */
  source: SourceSystemSchema,
  channel: SourceSystemSchema,

  /** The immutable observation this was derived from. Always traceable back. */
  sourceObservationId: z.uuid(),
  observedAt: InstantSchema,

  measurementMethod: MeasurementMethodSchema,
  /**
   * Raw active duration, always retained, never pre-thresholded. Null when the
   * fact has no duration.
   */
  rawActiveDurationMs: z.number().int().nonnegative().nullable().default(null),

  identityConfidence: IdentityConfidenceSchema,
  contactId: ContactIdSchema.nullable().default(null),
  meetingId: MeetingIdSchema.nullable().default(null),
  unitId: UnitIdSchema.nullable().default(null),

  attributes: z.record(z.string(), z.unknown()).default({}),
});
export type CanonicalFact = z.infer<typeof CanonicalFactSchema>;

/**
 * Fact families a client may never submit, in any form.
 *
 * Enforced at the adapter, not left to reviewers reading payloads: these are
 * conclusions drawn from the whole picture, and a single source has neither
 * the data nor the standing to assert them.
 */
export const CLIENT_PROHIBITED_FACT_PREFIXES = [
  "attribution.",
  "conversion.",
  "anomaly.",
  "causal.",
  "insight.",
] as const;

export function isClientSubmittableFact(factId: string): boolean {
  return !CLIENT_PROHIBITED_FACT_PREFIXES.some((prefix) => factId.startsWith(prefix));
}
