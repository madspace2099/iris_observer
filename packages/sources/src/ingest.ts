import {
  APPROVED_BACKEND_CEILINGS,
  BatchFrameSchema,
  CorrelationIdSchema,
  DEFAULT_CLOCK_POLICY,
  OBSERVER_ROUTES,
  serialisedBytes,
  validateEvent,
  type BatchResponse,
  type BatchWarning,
  type EffectiveLimits,
  type EventEnvelope,
  type EventRejectionCode,
  type EventResult,
} from "@observer/contracts/ue5";

import { authenticateSource } from "./authenticate";
import {
  bodyWithinCeiling,
  failure,
  ok,
  requirePost,
  type Handler,
  type HandlerDeps,
} from "./http";

/**
 * THE PROTECTED INGESTION ENDPOINT.
 *
 * ## The one rule the whole file is arranged around
 *
 * **The HTTP status says whether the batch was processed. It never says whether
 * the events were accepted.** A `200` whose every result is `rejected` is a
 * correct answer; a `400` means nothing in the request was stored and the whole
 * thing is safe to resend unchanged.
 *
 * The failure that rule exists to prevent is specific and was found by a test
 * rather than by reading: parsing an incoming batch with `BatchEnvelopeSchema`
 * validates every event inside it, so **one malformed event fails the whole
 * parse and the batch comes back `400`**. A client then has a batch it can
 * never make progress on, because resending it unchanged produces the same
 * `400` for ever, and one quarantinable event has taken two hundred good ones
 * with it.
 *
 * So this handler parses `BatchFrameSchema` — `batch_id`, `sent_at`, and an
 * array of elements each carrying a readable `event_id` — and judges every
 * event on its own afterwards. `BatchEnvelopeSchema` remains the published
 * description of a well-formed request and is what `openapi.ts` documents; it
 * is deliberately **not** the parse a correct server performs. See the
 * "what the server parses" note in `ingestion.ts`.
 *
 * The frame's one demand on an element is `event_id`, and that is forced rather
 * than chosen: the per-event result protocol is *addressed by* that id, so an
 * element without one cannot be reported on, acknowledged or deduplicated.
 *
 * ## The order of the steps is the specification
 *
 * Each step is cheap or refuses before the next becomes expensive:
 *
 *   1. method
 *   2. request byte ceiling — **before the parser sees anything**, so a hostile
 *      100 MiB body costs a stream read rather than a parse
 *   3. JSON parse
 *   4. frame shape
 *   5. authentication
 *   6. rate limit
 *   7. the three batch ceilings
 *   8. per-event validation
 *   9. identity, from the credential alone
 *  10. one append
 *  11. one result per submitted event, in submission order
 *  12. the ingestion-verified mark
 *
 * Two orderings inside that list are worth stating because they look wrong.
 * **The byte ceiling precedes authentication**, so an unauthenticated caller
 * cannot make the server hold an arbitrary body while it does a database
 * lookup. **Authentication precedes the batch ceilings**, so the ceilings are
 * enforced against a caller that is known; a `413` before a `401` would tell an
 * anonymous caller something about the deployment's limits.
 */

/* --- what this deployment enforces -------------------------------------------- */

/**
 * The five ceilings in force, assembled from the approved backend values.
 *
 * Written out rather than imported as `HARNESS_LIMITS`, which holds these exact
 * five numbers already: the values are the same and the *name* is not, and a
 * production ingestion path whose limits come from a constant called "harness"
 * invites the next reader to change it for a test's convenience. Both derive
 * from `APPROVED_BACKEND_CEILINGS`, so there is one source of truth and no
 * drift to police.
 */
const ENFORCED: EffectiveLimits = Object.freeze({
  maxBatchEvents: APPROVED_BACKEND_CEILINGS.maxBatchEvents,
  maxBatchBytes: APPROVED_BACKEND_CEILINGS.maxBatchBytes,
  maxEventBytes: APPROVED_BACKEND_CEILINGS.maxEventBytes,
  maxPropertyDepth: APPROVED_BACKEND_CEILINGS.maxPropertyDepth,
  maxPropertyCount: APPROVED_BACKEND_CEILINGS.maxPropertyCount,
});

/**
 * Which generations of the event vocabulary this deployment accepts.
 *
 * One, because one exists. ADR-0013 defers the business event catalogue, so
 * there has never been a second generation to accept, and an event declaring
 * `schema_version: 2` is a build from a future that has not been agreed rather
 * than a value to be tolerated. It gets `unsupported_version`, which tells the
 * plugin's diagnostic screen that only an upgrade changes the answer.
 *
 * This is also the range activation publishes as `accepted_schema_versions`, so
 * a plugin can refuse the same events locally before they enter the outbox.
 */
const ACCEPTED_SCHEMA_VERSIONS = Object.freeze({ min: 1, max: 1 });

/**
 * No registry, and that is the true state rather than a permissiveness.
 *
 * `validateEvent` treats null as "the catalogue has not been built", accepts any
 * well-formed name, and still refuses anything inside the reserved `diagnostic.`
 * namespace that is not a defined diagnostic event. When ADR-0013 lands, this
 * is the single line that changes.
 */
const REGISTRY = null;

/* --- small shapes used while building the answer ------------------------------- */

interface Passing {
  /** Where this event sat in the submitted array. The only ordering that matters. */
  readonly index: number;
  readonly event: EventEnvelope;
}

/**
 * A rejected result.
 *
 * `retryable` is derived from the code rather than passed in, because
 * `storage_error` is the only retryable event-level rejection in the taxonomy
 * and a caller that could set the flag is a caller that can eventually set it
 * wrongly — a client told to retry a `malformed_event` retries it for ever.
 *
 * `detail` is truncated here, mirroring what `failure()` does to a message and
 * for the same reason: the schema caps it at 300 characters, a validator
 * composes it freely, and the schema would reject an over-long one at
 * generation time while this handler would happily send it.
 */
function rejectedResult(eventId: string, code: EventRejectionCode, detail: string): EventResult {
  return {
    event_id: eventId,
    status: "rejected",
    code,
    retryable: code === "storage_error",
    detail: detail.slice(0, 300),
  };
}

function settledResult(eventId: string, status: "accepted" | "duplicate"): EventResult {
  return { event_id: eventId, status, code: null, retryable: null, detail: null };
}

/**
 * The `batch_id` to echo on a refusal, if the body got far enough to hold one.
 *
 * Best effort by design: a failure body echoes the correlation id when it can
 * read one, so a plugin log and a server log can be lined up over the request
 * that failed, and carries null when the body was never a readable object.
 * Parsed against the same schema the success path uses, so a caller cannot put
 * an arbitrary string into a response by sending one.
 */
function readBatchId(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const candidate = (payload as Record<string, unknown>)["batch_id"];
  const parsed = CorrelationIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/* --- the handler ---------------------------------------------------------------- */

export const handleIngest: Handler = async (request: Request, deps: HandlerDeps) => {
  /* 1. Method. A GET here is a misconfiguration, and answering it invites a proxy to cache. */
  const wrongMethod = requirePost(request);
  if (wrongMethod !== null) return wrongMethod;

  /*
   * 2. THE BYTE CEILING, BEFORE THE PARSER.
   *
   * `Content-Length` is a claim, so `bodyWithinCeiling` counts the stream as it
   * arrives and cuts off at the same limit. Nothing below this line has seen a
   * character of the body, which is the whole point: the refusal costs a header
   * read and a cancelled stream rather than a parse of whatever turned up.
   */
  const body = await bodyWithinCeiling(request, ENFORCED.maxBatchBytes);
  if (!body.ok) {
    return failure(
      "batch_too_large",
      `The request body exceeds the ${String(ENFORCED.maxBatchBytes)} byte ceiling. Split and retry.`,
    );
  }

  /* 3. JSON. A body that is not JSON never had a batch_id to echo. */
  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    /*
     * The parser's own message is discarded rather than forwarded. It quotes the
     * input around the offending position, which is a fragment of the caller's
     * payload — potentially a property value — copied into a response body and,
     * from there, into whatever logs it.
     */
    return failure("malformed_request", "The request body is not valid JSON.");
  }

  const batchId = readBatchId(payload);

  /*
   * 4. THE FRAME ONLY. See the module note: validating events here is what turns
   * one malformed event into a batch the client can never deliver.
   */
  const frame = BatchFrameSchema.safeParse(payload);
  if (!frame.success) {
    return failure(
      "malformed_request",
      "The batch frame is not valid: batch_id, sent_at and an events array of elements carrying event_id are required.",
      { batchId },
    );
  }
  const batch = frame.data;

  /* 5. Who is calling. Its refusal is already a Response, and is sent verbatim. */
  const auth = await authenticateSource(request, deps);
  if (!auth.ok) return auth.response;
  const context = auth.context;

  /* 6. The rate-limit seam. A positive number is seconds of Retry-After. */
  const wait = (await deps.rateLimit?.(request, OBSERVER_ROUTES.ingest)) ?? null;
  if (wait !== null) {
    return failure("rate_limited", "Too many ingestion requests.", {
      batchId: batch.batch_id,
      retryAfterSeconds: wait,
    });
  }

  /*
   * 7. THREE INDEPENDENT CEILINGS, and the independence is the point.
   *
   * `BATCH_ACCEPTANCE_RULES` spells out the arithmetic that invites the mistake:
   * 200 events of 64 KiB is 12.5 MiB, which the 8 MiB body ceiling refuses, so
   * being inside the count ceiling says nothing about the bytes being available.
   *
   * Count and total bytes are properties of the *batch*, so they refuse the
   * whole request with `413` — the one failure whose fix is arithmetic, and a
   * client halves and retries. A single oversized *event* is not that: splitting
   * cannot help it and an event is never split, so it is an event-level
   * rejection further down and its neighbours are still processed.
   */
  if (batch.events.length > ENFORCED.maxBatchEvents) {
    return failure(
      "batch_too_large",
      `${String(batch.events.length)} events exceeds the ${String(ENFORCED.maxBatchEvents)} event ceiling. Split and retry.`,
      { batchId: batch.batch_id },
    );
  }
  const batchBytes = serialisedBytes(batch);
  if (batchBytes > ENFORCED.maxBatchBytes) {
    return failure(
      "batch_too_large",
      `${String(batchBytes)} bytes exceeds the ${String(ENFORCED.maxBatchBytes)} byte ceiling. Split and retry.`,
      { batchId: batch.batch_id },
    );
  }

  /*
   * 8. EVERY EVENT JUDGED ON ITS OWN.
   *
   * `results` is pre-sized and written by index rather than appended to, so the
   * response's ordering is a property of the array's shape rather than of every
   * branch below remembering to push exactly once. A `null` surviving to the end
   * is a hole, and is handled where the holes are filled.
   */
  const results: (EventResult | null)[] = batch.events.map(() => null);
  const passing: Passing[] = [];
  const warnings = new Map<string, BatchWarning>();
  const now = deps.now();

  batch.events.forEach((raw, index) => {
    /*
     * The third ceiling, per event. `validateEvent` checks the same bound and
     * would reach the same verdict; it is checked here because the three
     * ceilings are one rule with three independent parts, and burying one of
     * them inside the validator would leave this handler looking as though it
     * enforced two.
     */
    const bytes = serialisedBytes(raw);
    if (bytes > ENFORCED.maxEventBytes) {
      results[index] = rejectedResult(
        raw.event_id,
        "event_too_large",
        `${String(bytes)} bytes exceeds the ${String(ENFORCED.maxEventBytes)} byte ceiling`,
      );
      return;
    }

    const verdict = validateEvent(raw, {
      limits: ENFORCED,
      acceptedSchemaVersions: ACCEPTED_SCHEMA_VERSIONS,
      registry: REGISTRY,
      clock: DEFAULT_CLOCK_POLICY,
      now,
    });

    if (!verdict.ok) {
      /*
       * The verdict's own detail, which the validator composes to name a key, a
       * path or a ceiling and never to quote a value — a diagnostic that echoed
       * the offending value of a `pii_suspected` or `reserved_property`
       * rejection would have copied the leak into a second place rather than
       * stopped it.
       */
      results[index] = rejectedResult(
        raw.event_id,
        verdict.rejection.code,
        verdict.rejection.detail,
      );
      return;
    }

    /* Deduplicated by code: one skewed clock should not produce 200 identical notes. */
    for (const warning of verdict.warnings) warnings.set(warning.code, warning);
    passing.push({ index, event: verdict.event });
  });

  /*
   * 9 and 10. ONE APPEND, UNDER THE SOURCE THE CREDENTIAL RESOLVED TO.
   *
   * `source` is `context.sourceId` and there is no other expression in this file
   * that could supply it. Account and project are never sent at all — the facade
   * reads them from the source's own row — so a payload carrying `source_id`,
   * `project_id` or `tenant_id` is inert twice over: the envelope is closed, so
   * a top-level one is `malformed_event`, and `properties` refuses the reserved
   * names, so a nested one is `reserved_property`. Neither has a path to this
   * argument even if both checks were removed.
   */
  let stored = false;
  if (passing.length > 0) {
    try {
      const rows = await deps.db.eventsAppend({
        source: context.sourceId,
        events: passing.map((entry) => entry.event),
      });
      stored = true;

      /*
       * 11. MATCHED BY ORDINAL, NEVER BY event_id.
       *
       * The facade numbers its rows with `with ordinality` over the array it was
       * handed, so row *n* is the fate of the *n*-th event we sent. Searching
       * `passing` for a row's `event_id` would look equivalent and is not: a
       * batch may legitimately contain the same id twice — a client retrying
       * inside one batch after an ambiguous send — and the facade answers
       * `accepted` for the first occurrence and `duplicate` for the second. A
       * search finds the first match both times, so both positions would be
       * reported `accepted`, and the client would acknowledge a fact that was
       * stored once as though it had been stored twice.
       */
      for (const row of rows) {
        const submitted = passing[row.ordinal - 1];
        if (submitted === undefined) continue;
        results[submitted.index] = settledResult(
          submitted.event.event_id,
          row.outcome === "accepted" ? "accepted" : "duplicate",
        );
      }
    } catch {
      /*
       * The append is one statement, so a throw means none of the passing events
       * was stored. They get `storage_error` — the only retryable event-level
       * code — so the client keeps them and tries again, while the events this
       * batch already rejected keep their own verdicts and are not resent.
       *
       * The driver's message is deliberately dropped. A constraint violation or
       * a type error quotes the offending row, which is the caller's payload,
       * and a diagnostic that carries it has moved the data rather than
       * described the failure.
       */
      for (const entry of passing) {
        results[entry.index] = rejectedResult(
          entry.event.event_id,
          "storage_error",
          "the batch could not be stored; retry",
        );
      }
    }
  }

  /*
   * A hole means the facade returned fewer rows than it was handed elements,
   * which it cannot do — it selects from `jsonb_array_elements(...) with
   * ordinality`. If the port and the SQL ever disagree, the event is reported
   * `storage_error` rather than dropped from `results`, because a short
   * `results` array is the one thing the redundant counters exist to catch and
   * a silently missing event is a fact the client will never resend.
   */
  const settled: EventResult[] = results.map((result, index) => {
    if (result !== null) return result;
    const raw = batch.events[index];
    return rejectedResult(
      raw?.event_id ?? "00000000-0000-4000-8000-000000000000",
      "storage_error",
      "the batch could not be accounted for; retry",
    );
  });

  let accepted = 0;
  let duplicate = 0;
  let rejected = 0;
  for (const result of settled) {
    if (result.status === "accepted") accepted += 1;
    else if (result.status === "duplicate") duplicate += 1;
    else rejected += 1;
  }

  /*
   * 12. INGESTION VERIFIED — the operational fact a heartbeat cannot give.
   *
   * `last_heartbeat_at` says the source can reach us holding a valid credential.
   * This says an event survived the whole path into storage, which is a
   * different claim and the one an operator needs before believing a new
   * installation works. A duplicate counts: the path was proved the first time
   * and the row is still there.
   *
   * Its failure must not fail the batch. The events are stored; answering a
   * non-2xx now would tell a correct client to resend everything it just
   * delivered, in exchange for an operational timestamp it can write on the next
   * request.
   */
  if (stored && accepted + duplicate > 0) {
    try {
      await deps.db.ingestionVerified({ source: context.sourceId });
    } catch {
      /* Intentionally swallowed. See above. */
    }
  }

  const response: BatchResponse = {
    batch_id: batch.batch_id,
    received: batch.events.length,
    accepted,
    duplicate,
    rejected,
    results: settled,
    warnings: [...warnings.values()],
  };

  return ok(response);
};
