import { z } from "zod";

/**
 * LIMITS — the shape is contract, the numbers are not. PROPOSED shape, OPEN values.
 *
 * Every field below is `nullable`, and every one of them is null in this
 * candidate. That is the point rather than an omission: a batch ceiling invented
 * at a desk is a number a showroom PC will meet at the worst possible moment,
 * and OPEN-12 records that the values wait on Akhillesh's measurements against
 * real hardware and a real showroom connection.
 *
 * What the plugin can build against today is the *negotiation*: the server
 * states its limits at activation, the client obeys them, a null means "no
 * server limit stated, use your own default", and a server value always beats a
 * client default. That is enough to write UE-OBS-006 and UE-OBS-007 against.
 *
 * ## Two limits that are not the server's business
 *
 * `local_max_queue_bytes`, `local_max_queue_events` and `local_max_event_age`
 * are plugin configuration, not protocol. They appear here only so both sides
 * use one vocabulary — the server never sends them and never sees them.
 * `local_max_event_age` in particular is **contract A** in the retention
 * discussion: how long an *undelivered* event stays eligible for delivery. It is
 * not derived from, and does not constrain, how long an *accepted* event is
 * stored.
 */

/**
 * Server-stated limits, returned at activation.
 *
 * A null value means the server states no limit for this deployment and the
 * client should apply its own configured default. It never means "unlimited".
 */
export const LimitsSchema = z.strictObject({
  /** Most events permitted in one ingestion request. */
  max_batch_events: z.int().min(1).max(100_000).nullable(),
  /** Largest request body accepted, in bytes, measured after decompression. */
  max_batch_bytes: z
    .int()
    .min(1_024)
    .max(64 * 1_024 * 1_024)
    .nullable(),
  /** Largest single serialised event, in bytes. */
  max_event_bytes: z
    .int()
    .min(256)
    .max(4 * 1_024 * 1_024)
    .nullable(),
  /**
   * Deepest nesting permitted inside `properties`.
   *
   * A limit, not a style preference: unbounded nesting is a parser denial of
   * service that costs an attacker one kilobyte.
   */
  max_property_depth: z.int().min(1).max(64).nullable(),
  /** Most keys permitted at any single level of `properties`. */
  max_property_count: z.int().min(1).max(4_096).nullable(),
  /** Floor between two ingestion requests, in milliseconds. */
  min_send_interval_ms: z.int().min(0).max(3_600_000).nullable(),
});
export type Limits = z.infer<typeof LimitsSchema>;

/**
 * What this candidate states: nothing.
 *
 * Every value is null because every value is OPEN-12. A test asserts this, so
 * that a number cannot arrive here without also arriving in the decision
 * register.
 */
export const UNSTATED_LIMITS: Limits = Object.freeze({
  max_batch_events: null,
  max_batch_bytes: null,
  max_event_bytes: null,
  max_property_depth: null,
  max_property_count: null,
  min_send_interval_ms: null,
});

/**
 * The limits a validator actually applies once nulls are resolved.
 *
 * Separate type, because "the server stated nothing" and "the value in force" are
 * different facts and conflating them is how a null becomes an accidental
 * infinity.
 */
export interface EffectiveLimits {
  readonly maxBatchEvents: number;
  readonly maxBatchBytes: number;
  readonly maxEventBytes: number;
  readonly maxPropertyDepth: number;
  readonly maxPropertyCount: number;
}

/**
 * Defensive ceilings for a reference implementation and a test harness.
 *
 * **MOCK-ONLY. These are not proposed protocol values.** They exist so the mock
 * and the validator have *something* finite to refuse, and they are deliberately
 * generous — large enough that no plausible real batch meets them, small enough
 * that a fuzz case does. Nothing in the contract, the handoff document or the
 * decision register cites them.
 */
export const HARNESS_LIMITS: EffectiveLimits = Object.freeze({
  maxBatchEvents: 500,
  maxBatchBytes: 4 * 1_024 * 1_024,
  maxEventBytes: 64 * 1_024,
  maxPropertyDepth: 8,
  maxPropertyCount: 128,
});

/** Apply server-stated limits over a floor of defaults, null meaning "unstated". */
export function resolveLimits(stated: Limits, defaults: EffectiveLimits): EffectiveLimits {
  return {
    maxBatchEvents: stated.max_batch_events ?? defaults.maxBatchEvents,
    maxBatchBytes: stated.max_batch_bytes ?? defaults.maxBatchBytes,
    maxEventBytes: stated.max_event_bytes ?? defaults.maxEventBytes,
    maxPropertyDepth: stated.max_property_depth ?? defaults.maxPropertyDepth,
    maxPropertyCount: stated.max_property_count ?? defaults.maxPropertyCount,
  };
}

/* ======================================================= local plugin config */

/**
 * Outbox configuration. Client-side, never sent, never received.
 *
 * Named here so the handoff document and the plugin use the same words, and so
 * that `local_max_event_age_hours` is visibly a *delivery eligibility* rule
 * rather than a retention policy.
 */
export interface OutboxConfig {
  readonly localMaxQueueBytes: number;
  readonly localMaxQueueEvents: number;
  readonly localMaxEventAgeHours: number;
}
