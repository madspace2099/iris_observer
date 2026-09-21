import { z } from "zod";
import { BuildMetadataSchema, WireInstantSchema } from "./wire";

/**
 * HEARTBEAT — liveness and plugin health, on its own endpoint. PROPOSED.
 *
 * The brief requires Admin to show **Connected** only after a validated test
 * event *or* a heartbeat (LOCKED §3.1). It does not say those are the same
 * mechanism, and they are not.
 *
 * ## Why not an empty ingestion batch
 *
 * An empty batch was the obvious candidate and it is the worst of the three. It
 * shares the dedicated endpoint's weakness — it proves nothing about whether an
 * event can actually be *stored* — and the test-event's weakness — it pollutes
 * ingestion metrics — while adding an ambiguity neither has: `received: 0`
 * cannot distinguish a healthy liveness ping from a client bug that sends empty
 * batches. It is a degenerate case of a data API, not a health signal.
 *
 * ## What a dedicated endpoint buys
 *
 * Somewhere to put the things an operator actually needs when a showroom looks
 * quiet, none of which belong in an immutable analytics fact: how deep the
 * outbox is, how old its oldest entry is, how much is quarantined, and what went
 * wrong last. Queue depth is not a fact about a customer, and putting it in
 * `analytics_events` would mean every read model forever after had to exclude
 * it.
 *
 * It writes to the source's operational record — `last_seen_at` and a small
 * health table — and **never** to `analytics_events`.
 *
 * ## What is deliberately not here
 *
 * There is no free-text `message`. The last error is a code and a timestamp,
 * because a free-text field carrying an exception string is the most likely
 * place in this whole protocol for a credential or a buyer's name to end up in a
 * log. Nothing is lost: the code is what an operator triages on, and the local
 * log still has the detail.
 */

export const OutboxHealthSchema = z.strictObject({
  /** Events waiting to be delivered. */
  pending_events: z.int().min(0),
  /** When the oldest waiting event occurred. Null when the queue is empty. */
  oldest_pending_at: WireInstantSchema.nullable(),
  /** Events kept with a reason and never retried. A rising number is a defect. */
  quarantined_events: z.int().min(0),
  /** Bytes the outbox occupies on disk. */
  bytes_used: z.int().min(0),
  /**
   * The configured disk ceiling, so an operator can see the fill percentage.
   *
   * Reported alongside `bytes_used` rather than as a precomputed percentage,
   * because two numbers that can be checked beat one that cannot. Null when the
   * deployment states no ceiling.
   */
  bytes_ceiling: z.int().min(0).nullable(),
  /**
   * Events dropped because a local queue ceiling was reached.
   *
   * Reported rather than hidden. LOCKED §5.4 forbids silent discard, and a
   * counter that only exists on the showroom PC is silent to everybody who
   * matters.
   */
  dropped_events: z.int().min(0),
});
export type OutboxHealth = z.infer<typeof OutboxHealthSchema>;

/**
 * How full the outbox is, as a percentage of its configured ceiling.
 *
 * Null when no ceiling is configured — which is honest, and better than the
 * alternative of reporting `0%` for a queue whose limit nobody set.
 */
export function outboxFillPercent(queue: OutboxHealth): number | null {
  if (queue.bytes_ceiling === null || queue.bytes_ceiling === 0) return null;
  return (queue.bytes_used / queue.bytes_ceiling) * 100;
}

export const LastErrorSchema = z.strictObject({
  /** A contract code, request-level or event-level. Never free text. */
  code: z.string().min(3).max(64),
  at: WireInstantSchema,
});

export const HeartbeatRequestSchema = z.strictObject({
  sent_at: WireInstantSchema,
  build: BuildMetadataSchema,
  queue: OutboxHealthSchema,
  /** The most recent failure, or null if there has not been one. */
  last_error: LastErrorSchema.nullable(),
});
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;

export const HeartbeatResponseSchema = z.strictObject({
  status: z.literal("ok"),
  /** Server time, so a plugin can show the operator how far its clock has drifted. */
  server_time: WireInstantSchema,
  /**
   * Whether the plugin should re-run activation-time configuration discovery.
   *
   * The only instruction a heartbeat may carry, and it is advisory: it never
   * changes identity, never changes credentials, and never asks the client to
   * discard anything.
   */
  config_stale: z.boolean(),
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
