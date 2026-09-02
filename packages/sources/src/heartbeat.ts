import {
  HeartbeatRequestSchema,
  isDiagnosticEvent,
  type HeartbeatRequest,
  type HeartbeatResponse,
} from "@observer/contracts/ue5";

import { authenticateSource } from "./authenticate";
import type { HeartbeatFacts, SourceOperationsRow } from "./db";
import { bodyWithinCeiling, failure, ok, requirePost, type Handler } from "./http";

/**
 * THE HEARTBEAT ENDPOINT — liveness and plugin health, and nothing else.
 *
 * ## The one property this file exists to keep
 *
 * A heartbeat writes to the source's operational record and **never** to
 * `analytics_events`. That is not a performance preference; it is the reason
 * the contract gave liveness its own endpoint rather than reusing an empty
 * ingestion batch. Queue depth is not a fact about a visitor, and the moment
 * one lands in the event store every read model in the product — for ever
 * after — has to remember to exclude it. `heartbeat.test.ts` counts the rows
 * in `observer.analytics_events` on either side of a successful heartbeat for
 * exactly this reason, because "we did not call `eventsAppend`" is a claim
 * about this file while "no row appeared" is a claim about the system.
 *
 * ## The order of the steps, and why validation precedes authentication
 *
 * Method, then byte ceiling, then parse, then schema, then credential. The
 * unusual-looking half is the last two: most services authenticate first.
 *
 * They can afford to because their bodies are unbounded and parsing one is the
 * expensive thing to do for a stranger. Here the ceiling below is four
 * kibibytes, so everything before `authenticateSource` costs a header read and
 * a parse of at most a few hundred bytes — while doing it in this order means a
 * plugin with a genuine payload bug is told *which* rule it broke rather than
 * being told its credential is fine and then, on the next release, being told
 * nothing at all. The credential check still gates every side effect: nothing
 * is written, and no fact about the source is revealed, until it passes.
 *
 * ## What a heartbeat may say about itself
 *
 * Codes and counts. `HeartbeatRequestSchema` is a `strictObject` all the way
 * down, so an unknown key is a refusal rather than a silently ignored field,
 * and {@link operationalFacts} names every value it forwards one at a time
 * instead of spreading the parsed payload. Both are needed: the schema stops a
 * stack trace arriving under a new key, and the explicit mapping stops one
 * arriving under a key the schema happens to allow but the operational record
 * has no business holding.
 */

/**
 * The largest heartbeat this endpoint will read.
 *
 * A schema-valid heartbeat cannot be large. With every bounded string at its
 * maximum — a 64-character app version, a 128-character build id, a
 * 64-character error code — and all six queue counters at nineteen digits, the
 * body comes to roughly 750 bytes. Four kibibytes is about five times that,
 * which leaves room for pretty-printed JSON and for a field the contract has
 * not grown yet, and is still three orders of magnitude below the 8 MiB
 * ingestion ceiling.
 *
 * ## Why an over-sized heartbeat is `malformed_request` and not `batch_too_large`
 *
 * `batch_too_large` is a 413 whose published policy is `retain_and_split`, and
 * it means what it says: the request carried more events, or more bytes of
 * events, than the ceiling in force. A heartbeat has no batch. Answering with
 * that code would tell a plugin to split and resend something that cannot be
 * split, so its outbox would either loop or quarantine a liveness ping.
 *
 * `malformed_request` is the honest answer, because a heartbeat this large is
 * not a large heartbeat — it is a payload that cannot satisfy the schema,
 * discovered before the parser had to prove it. Its policy is `continue`, which
 * is what a client should do: report the defect locally, keep sending events,
 * and do not stop.
 */
export const HEARTBEAT_MAX_BODY_BYTES = 4096;

export const handleHeartbeat: Handler = async (request, deps) => {
  const wrongMethod = requirePost(request);
  if (wrongMethod !== null) return wrongMethod;

  const body = await bodyWithinCeiling(request, HEARTBEAT_MAX_BODY_BYTES);
  if (!body.ok) {
    return failure(
      "malformed_request",
      `A heartbeat may not exceed ${String(HEARTBEAT_MAX_BODY_BYTES)} bytes.`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.text) as unknown;
  } catch {
    /*
     * The parser's own message is discarded rather than forwarded. `JSON.parse`
     * quotes the offending input in its error text ("Unexpected token } in JSON
     * at position 41"), which is the one way a rejected value could reach a
     * response body from a path that has not yet authenticated anybody.
     */
    return failure("malformed_request", "The heartbeat body is not valid JSON.");
  }

  const parsed = HeartbeatRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return failure(
      "malformed_request",
      `The heartbeat payload does not satisfy the heartbeat schema: ${describeSchemaRejection(
        parsed.error.issues,
      )}.`,
    );
  }

  const auth = await authenticateSource(request, deps);
  if (!auth.ok) return auth.response;

  /*
   * One clock reading for the whole request, so the age computed from the
   * client's `oldest_pending_at` and the `server_time` it is told to compare
   * against are measured from the same instant. Two calls would differ by the
   * cost of a database round trip, which is small, arbitrary, and exactly the
   * sort of difference somebody eventually debugs.
   */
  const now = deps.now();

  const recorded = await deps.db.heartbeatRecord({
    source: auth.context.sourceId,
    facts: operationalFacts(parsed.data, now),
  });

  if (!recorded) {
    /*
     * The facade refuses an archived source and returns false for a source that
     * is not there at all. `authenticateSource` has already refused both — it
     * answers 401 for an archived source, deliberately — so reaching here means
     * the source was archived in the window between that credential read and
     * this write.
     *
     * `unavailable` rather than a 4xx, because the client's correct response to
     * losing a race is to back off and try again, and the attempt after the race
     * closes gets the refusal that names the real reason. Inventing a 4xx here
     * would mean guessing which of the facade's reasons applied, and the guess
     * would be wrong the moment it grows another.
     */
    return failure("unavailable", "The heartbeat could not be recorded.");
  }

  const response: HeartbeatResponse = {
    status: "ok",
    server_time: now.toISOString(),
    /*
     * Always false, and honestly so. `config_stale` asks the plugin to re-run
     * activation-time configuration discovery, and nothing in this milestone
     * versions that configuration — there is no generation counter to compare a
     * client against, so there is no fact that could make this true. Returning
     * a computed-looking value from an invented rule would be worse than a
     * constant: a plugin that re-discovers configuration on a whim is a plugin
     * whose activation traffic nobody can explain.
     */
    config_stale: false,
  };

  return ok(response);
};

/* --- what a heartbeat is allowed to write ------------------------------------- */

/**
 * The validated payload, mapped field by field onto the operational record.
 *
 * ## Why this is written out rather than spread
 *
 * `{ ...parsed.data }` would compile, would pass every test that only checks
 * the fields it knows about, and would forward the whole envelope — including
 * whatever the schema grows next — into a `jsonb` the database then has to
 * defend itself against. The port's `HeartbeatFacts` is the list of things an
 * operational record may hold, and naming each one here is what makes that list
 * enforced rather than documented.
 *
 * ## The four fields deliberately absent
 *
 *   - `reported_environment`. The heartbeat envelope has no place to report an
 *     environment, and this function does not invent one. That is `PD-25` made
 *     structural: there is no code path from a heartbeat to
 *     `observed_environment`, let alone to the registered `environment`, so a
 *     development build declaring itself production cannot change anything by
 *     beating. A mismatch recorded at activation stays visible in
 *     `environment_mismatch`, which the read model derives; a heartbeat neither
 *     applies it nor clears it.
 *   - `installation_nonce`. Activation's concern, not liveness'.
 *   - `validation_failure_count` and `backend_quarantine_count`. The outbox
 *     health block reports neither, and the facade reads an absent key as "not
 *     measured this cycle" and keeps whatever was last written. Sending a zero
 *     for a number nobody measured would show an operator a confident,
 *     invented, falling counter.
 *
 * ## `last_error_code` is not re-validated here
 *
 * The schema bounds it to 64 characters and the table's own constraint bounds
 * it to a code-shaped character class, dropping anything with whitespace in it.
 * A third check here would be a copy of that allow-list free to drift from the
 * one the database actually enforces, so the value is forwarded and the SQL
 * refuses it — which is why a heartbeat whose "code" is a sentence records no
 * code at all rather than a sentence.
 */
function operationalFacts(heartbeat: HeartbeatRequest, now: Date): HeartbeatFacts {
  return {
    app_version: heartbeat.build.app_version,
    plugin_version: heartbeat.build.plugin_version,
    build_id: heartbeat.build.build_id,
    engine_version: heartbeat.build.engine_version,
    queue_event_count: heartbeat.queue.pending_events,
    queue_bytes_used: heartbeat.queue.bytes_used,
    queue_bytes_ceiling: heartbeat.queue.bytes_ceiling,
    oldest_pending_age_seconds: backlogAgeSeconds(heartbeat.queue.oldest_pending_at, now),
    quarantine_count: heartbeat.queue.quarantined_events,
    /*
     * `dropped_events` is what a local queue ceiling refused to accept, which is
     * what `capacity_refusal_count` counts. The wire and the column are named
     * from the two ends of the same event — the client sees a drop, the operator
     * sees a refusal — and this line is the only place that correspondence is
     * stated, so it is stated rather than left for a reader to infer from two
     * plausible-looking names.
     */
    capacity_refusal_count: heartbeat.queue.dropped_events,
    last_error_code: heartbeat.last_error?.code ?? null,
  };
}

/**
 * How long the oldest waiting event has been waiting, by the server's clock.
 *
 * The client reports an instant and the operational record holds an age,
 * because an age is what an operator triages on and an instant from a showroom
 * PC is only as good as that PC's clock. Deriving it here means the number on
 * the screen is measured against one trustworthy clock rather than against
 * fourteen showroom ones.
 *
 * ## Why an empty queue is zero and not "unmeasured"
 *
 * The facade reads a null as "this heartbeat could not measure the field" and
 * keeps the previous value — correct for a plugin that failed to sample its
 * outbox, and badly wrong here. A queue that has just drained reports
 * `oldest_pending_at: null` alongside `pending_events: 0`, and forwarding that
 * as null would leave the last non-empty age frozen on the operator's screen: a
 * source showing nothing pending and a backlog forty minutes old. Nothing
 * waiting is a measurement whose answer is zero.
 *
 * A clock ahead of ours floors at zero for the same reason it does inside the
 * facade — a negative backlog is not a fact anybody can act on.
 */
function backlogAgeSeconds(oldestPendingAt: string | null, now: Date): number {
  if (oldestPendingAt === null) return 0;
  const oldest = Date.parse(oldestPendingAt);
  /* Unreachable behind `WireInstantSchema`; an unmeasurable age is not a backlog. */
  if (Number.isNaN(oldest)) return 0;
  return Math.max(0, Math.floor((now.getTime() - oldest) / 1000));
}

/**
 * Which fields a payload broke, without ever repeating what they contained.
 *
 * Zod's own messages are not usable in a response: `unrecognized_keys` names
 * the key the caller invented, and several checks quote the received value.
 * Both are attacker-controlled text on a path that has not yet authenticated
 * anybody, so only the *schema's* own field paths cross the boundary — those
 * are names this repository chose, and they are the half a plugin author
 * actually needs.
 *
 * An unrecognised key has an empty path, which is why the fallback phrase
 * exists and why it does not say which key: naming it would echo the thing this
 * function is here not to echo.
 */
function describeSchemaRejection(
  issues: readonly { readonly path: readonly PropertyKey[] }[],
): string {
  const paths: string[] = [];
  for (const issue of issues) {
    const path = issue.path.map((segment) => String(segment)).join(".");
    if (path.length > 0 && !paths.includes(path)) paths.push(path);
    if (paths.length === 5) break;
  }
  return paths.length === 0 ? "an unrecognised field was present" : paths.join(", ");
}

/* --- Connected, and Ingestion Verified ---------------------------------------- */

/**
 * The two independent facts an operator needs about a source.
 *
 * Two booleans and not one status, because they are not two points on one
 * scale. `connected` says the installation can reach us and holds a credential
 * the endpoint accepted. `ingestionVerified` says an event once travelled the
 * whole path — envelope, registry, validation, insert — and was stored.
 * Neither implies the other:
 *
 *   - connected, not verified: a fresh activation that has begun beating and
 *     has not yet had its test event pass. This is the ordinary state during
 *     commissioning and the one a single status would hide.
 *   - verified, not connected: an installation that was commissioned properly
 *     and has since gone silent. A collapsed status reports it as the better of
 *     the two, which is precisely backwards — it is the one worth a phone call.
 *
 * ## The bug this shape refuses
 *
 * A single ordered status forces a rank, and any rank makes one of the two
 * facts unreportable. That is how "Connected" comes to mean "we once received
 * something from this machine", which is the claim the brief refuses: it asks
 * for Connected on a validated test event **or** a heartbeat, and it means the
 * operator can see which.
 */
export interface OperationalState {
  /** A heartbeat has been received. Says nothing about whether anything stored. */
  readonly connected: boolean;
  /** An event has reached storage at least once. Says nothing about right now. */
  readonly ingestionVerified: boolean;
}

/**
 * Classify a source's operational row into the two facts above.
 *
 * The whole implementation is two null checks, and that is the point: the row
 * already holds the distinction as two nullable timestamps, so anything more
 * here would be a second opinion about data the database is authoritative on.
 * What this function buys is a name — every caller asks the question the same
 * way, and no read model has to decide for itself whether
 * `ingestion_verified_at` being null means "no" or "unknown".
 */
export function classifyOperationalState(row: SourceOperationsRow): OperationalState {
  return {
    connected: row.last_heartbeat_at !== null,
    ingestionVerified: row.ingestion_verified_at !== null,
  };
}

/**
 * Whether an event name is a business fact rather than a diagnostic.
 *
 * The reserved `diagnostic.` namespace exists so onboarding can prove the
 * ingestion path with a real event, and the price of that is a row that must
 * never reach a business metric. The contract already answers the negative form
 * in `isDiagnosticEvent`, and this delegates to it rather than re-testing the
 * prefix — one definition of the namespace, so a read model and the ingestion
 * path cannot disagree about what a diagnostic is.
 *
 * It is stated positively because that is the shape a read model uses:
 * `events.filter(countsAsBusinessFact)` is a filter somebody can read, whereas
 * `events.filter((e) => !isDiagnostic(e.event_name))` is a negation that gets
 * dropped in a refactor and produces a metric that is quietly too high.
 *
 * `READ_MODEL_EXCLUSION_RULE` is the same rule for a SQL read model. Both
 * exist because both kinds of read model exist; neither is a copy of a prefix
 * literal.
 */
export function countsAsBusinessFact(eventName: string): boolean {
  return !isDiagnosticEvent(eventName);
}
