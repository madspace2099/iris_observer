import { z } from "zod";
import {
  CanonicalIdSchema,
  CorrelationIdSchema,
  EventNameSchema,
  SchemaVersionSchema,
  WireInstantSchema,
  WireUuidSchema,
} from "./wire";
import { EventRejectionCodeSchema, RequestFailureCodeSchema } from "./errors";

/**
 * BATCH INGESTION — the wire form of the ingestion boundary. PROPOSED.
 *
 * ## The one rule to read before any other
 *
 * **The HTTP status says whether the batch was processed. It never says whether
 * the events were accepted.**
 *
 *   `200`      the batch was processed — consult `results`. A batch in which
 *              every event was rejected is still a `200`.
 *   non-2xx    the batch was **not** processed. Nothing in it was stored, and
 *              the whole batch is safe to resend unchanged.
 *
 * That separation is what makes retry safe, and it is the reason `errors.ts`
 * keeps request-level and event-level codes in two disjoint vocabularies.
 *
 * ## Where identity comes from
 *
 * Not from here. The envelope carries no tenant, project or source, and the
 * schemas are `strictObject`, so sending one is a rejection rather than a silent
 * omission. The server derives all three from the credential on the request
 * (LOCKED §3.2, §4.2, §9.2), and `projection.ts` is the executable proof that
 * the derived values are the ones that get stored.
 */

/* ================================================== reserved property keys */

/**
 * Property names a client may not use **at the top level of `properties`**.
 *
 * Three families, one reason. Identity keys are refused because the server
 * derives identity and a client-supplied copy would eventually be trusted by
 * somebody. Server-assigned keys are refused because a client that can set
 * `ingested_at` can lie about when a fact arrived. Envelope names are refused
 * because a `sequence` beside the real one leaves a read model with two answers
 * to the same question and no way to know which was meant.
 *
 * Matched case-insensitively across snake_case and camelCase, because an Unreal
 * implementation will naturally reach for `projectId` while this document is
 * written in `project_id` — and a guard that catches one spelling catches
 * nothing.
 *
 * ## Top level only, and that is a deliberate narrowing
 *
 * An earlier revision rejected these at every depth. That was too strict to
 * live with: `sequence`, `source` and `project` are ordinary words, and a future
 * event schema will legitimately want a `tour: { steps: [{ sequence }] }`
 * without the transport having an opinion about it.
 *
 * The narrowing is safe because the guarantee it protects does not come from
 * this list. **No value anywhere inside `properties` participates in identity
 * resolution**, at any depth, because `projectEvent` takes identity as a
 * separate argument and there is no code path from the payload to it. The
 * top-level rule prevents *confusion* — a field that looks authoritative — not
 * privilege escalation, which is structurally impossible either way.
 *
 * A per-event schema registry may impose stricter rules on an individual event
 * later. That is the right place for it: the registry knows what a given event
 * means, and the transport does not.
 */
export const RESERVED_PROPERTY_KEYS = [
  "tenant_id",
  "project_id",
  "source_id",
  "tenant",
  "project",
  "source",
  "ingested_at",
  "received_at",
  "server_time",
  /* The envelope owns these names, so a top-level property may not shadow one. */
  "event_id",
  "event_name",
  "schema_version",
  "occurred_at",
  "session_id",
  "sequence",
  /*
   * Credential and authentication names. The privacy guard already catches these
   * by *value* at any depth; this catches them by *name*, which is what a field
   * deliberately built to carry one looks like before it has anything in it.
   */
  "source_token",
  "activation_code",
  "authorization",
  "credential",
  "api_key",
] as const;

/**
 * Reserved key prefixes.
 *
 * `observer_` is Observer's own namespace inside a payload. Nothing a client
 * sends may claim it, so that a future server-side annotation cannot collide
 * with a field a plugin invented three years earlier.
 */
export const RESERVED_PROPERTY_PREFIXES = ["observer_", "__"] as const;

/** Normalise a property key for reserved-name comparison: `projectId` → `projectid`. */
export function normalisePropertyKey(key: string): string {
  return key.replace(/[-_\s]/g, "").toLowerCase();
}

const RESERVED_NORMALISED = new Set(RESERVED_PROPERTY_KEYS.map(normalisePropertyKey));

export function isReservedPropertyKey(key: string): boolean {
  if (RESERVED_NORMALISED.has(normalisePropertyKey(key))) return true;
  const lower = key.toLowerCase();
  return RESERVED_PROPERTY_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/* ============================================== envelope member schemas */

/**
 * Which build produced *this* event.
 *
 * A different fact from which build the source is running *now*, and after a
 * release the difference is the whole story: a defect that appears in `1.0.0`
 * and disappears in `1.0.1` is invisible if every stored event carries only the
 * version the source happens to report today.
 */
export const AppMetadataSchema = z.strictObject({
  version: z.string().min(1).max(64),
  plugin: z.string().min(1).max(64),
  build_id: z.string().min(1).max(128),
  /**
   * **Reported, never authoritative.** The stored environment always comes from
   * the source record, assigned at registration. A development build declaring
   * itself `production` must not route its data there, so this value is
   * provenance and diagnostics only — never an authorisation input, and never
   * the environment a read model groups by.
   *
   * Deliberately a bounded string rather than the canonical enum. The shipped
   * client sends `"Development"` capitalised, and refusing an event over a
   * diagnostic field would fail the whole delivery path for a value nothing
   * trusts anyway. `CANONICAL_ENVIRONMENTS` publishes what is expected;
   * `normaliseReportedEnvironment` folds case; anything outside the set is
   * carried and surfaced as a batch-level warning rather than a rejection.
   */
  environment: z.string().min(1).max(32),
});

/**
 * A typed reference to the thing an event is about.
 *
 * `id` is the source's own vocabulary — `IT-A-12-07` is a unit code, not an
 * Observer identifier — and is carried, never interpreted at this layer. Domain
 * identity only: it never selects tenant, project or source.
 */
export const EntityReferenceSchema = z.strictObject({
  type: z.string().min(1).max(64),
  id: z.string().min(1).max(128),
});

/**
 * A pseudonymous subject reference.
 *
 * Bounded and opaque by intent. `lead_1042` is right; a value derived from a
 * person's name turns a pseudonymous reference back into personal data, which
 * is `OPEN-21`. Never authentication, never authorisation, and not by itself a
 * licence to match a CRM contact.
 */
export const SubjectReferenceSchema = z.string().min(1).max(128);

/* ========================================================== event envelope */

/**
 * One event, as the plugin sends it.
 *
 * Every field is either something only the client can know, or something the
 * client generated for its own bookkeeping. Nothing here is an assertion about
 * Observer's world.
 */
export const EventEnvelopeSchema = z.strictObject({
  /**
   * Generated once, before the first send attempt, and never regenerated
   * (LOCKED §4.1). This is the entire idempotency mechanism: a retry after an
   * ambiguous failure carries the same id, so the server can answer `duplicate`
   * instead of storing a second fact.
   *
   * `CanonicalIdSchema`, not `z.uuid()`: the requirement is 128 stable bits in
   * canonical lowercase form, not RFC 4122 version semantics. See `wire.ts`.
   */
  event_id: CanonicalIdSchema,

  /**
   * The source's own name for what happened, carried and not interpreted at this
   * layer (ADR-0015). **This contract fixes no business event names** —
   * ADR-0013 defers the catalogue, and the registry owns it when it exists.
   */
  event_name: EventNameSchema,

  /** Which generation of the registry this event was built against. */
  schema_version: SchemaVersionSchema,

  /**
   * When the client says it happened, with an offset. Never silently corrected
   * (LOCKED §4.1, §4.2); the server records its own `ingested_at` beside it and
   * keeps both.
   */
  occurred_at: WireInstantSchema,

  /**
   * The meeting or session this belongs to, minted by the plugin.
   *
   * Null for events that genuinely belong to no session — application start
   * before anybody arrives, diagnostics. A grouping key, never an authorisation
   * input: the server scopes every session to the source it arrived from, so two
   * sources cannot collide even if they somehow minted the same value.
   *
   * Canonical form for the same reason as `event_id`: it is minted by the same
   * `FGuid` path and stored in the same native `uuid` column.
   */
  session_id: CanonicalIdSchema.nullable(),

  /**
   * Monotonic position within one `session_id`, starting at 1.
   *
   * The only ordering signal that survives a wrong device clock, which matters
   * precisely because OPEN-3 leaves clock trust deliberately weak. Null exactly
   * when `session_id` is null. Gaps are permitted and informative — a gap means
   * an event was quarantined, and diagnostics should say so.
   *
   * **The minimum is 1, and that is load-bearing.** `StartSession()` resets the
   * counter to 0 and the first emitted event is 1, so a `0` on the wire means the
   * counter was read before it was incremented. Accepting it would place that
   * event before every real event in its session, for ever, in a way no read
   * model could detect. See `SESSION_SEQUENCE_RULES`.
   */
  sequence: z.int().min(1).max(2_147_483_647).nullable(),

  /**
   * Which build produced this event. **Required**, and an object rather than
   * four flattened top-level fields, so that build provenance stays one thing
   * that can be stored, indexed and compared as a unit.
   */
  app: AppMetadataSchema,

  /**
   * Which sales agent was presenting, in the source's own vocabulary.
   *
   * `optional`, not `nullable`, and the source settled that rather than a guess:
   * `FObserverEvent::ToJsonObject` writes this key only when it is non-empty, so
   * an event without an agent omits it entirely rather than sending null.
   *
   * A stable identifier, never a display name, never an email or phone value,
   * and never authentication or authorisation.
   */
  agent_id: SubjectReferenceSchema.optional(),

  /** A privacy-safe pseudonymous visitor reference. Optional, same omission rule. */
  visitor_subject: SubjectReferenceSchema.optional(),

  /**
   * What the event is about. Optional as a **complete object** — if present,
   * both `type` and `id` are required, which `EntityReferenceSchema` enforces.
   */
  entity: EntityReferenceSchema.optional(),

  /**
   * The event's own payload. **Open on purpose**, unlike the envelope: its shape
   * belongs to the per-event schema registry, a later milestone (ADR-0013).
   * Reserved keys are refused; see `RESERVED_PROPERTY_KEYS`.
   */
  properties: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

/* ======================================================== session sequence */

/**
 * SESSION SEQUENCE — approved V1 behaviour, no longer a proposal.
 *
 * Akhilesh confirmed the subsystem's semantics, so the question is settled and
 * is recorded here rather than argued again: `StartSession()` mints a fresh
 * `session_id` and resets the counter, the first emitted session event carries
 * `1`, stamping happens centrally, and a Blueprint caller cannot reach it.
 *
 * The rule that reads like pedantry and is not: **`sequence = 0` never
 * represents a real emitted session event.** The counter resets to zero and the
 * first event is one, so a zero on the wire means somebody read the counter
 * before incrementing it. Accepting it would sort that event ahead of every
 * genuine event in its session, permanently, and nothing downstream could tell.
 *
 * And one thing sequence does **not** mean: arrival order. A durable outbox
 * delivers late and out of order by design — that is the point of it — so a
 * server that assumed `sequence` matched receipt order would be wrong on the
 * first reconnection after an outage.
 */
export const SESSION_SEQUENCE_RULES: readonly string[] = Object.freeze([
  "StartSession() creates a fresh session_id and resets the internal counter.",
  "The first event of a session carries sequence = 1.",
  "Subsequent session events increment monotonically.",
  "Stamping is performed centrally by the subsystem; Blueprint callers cannot supply or override it.",
  "Non-session events carry sequence = null.",
  "sequence = 0 never represents a real emitted session event.",
  "Arrival order is not sequence order: durable delivery is late and out of order by design.",
]);

/* ========================================================== batch envelope */

/**
 * What the **server** parses, and it is not `BatchEnvelopeSchema`.
 *
 * A defect this contract had, found by a test rather than by reading: parsing an
 * incoming batch with `BatchEnvelopeSchema` validates every event inside it, so
 * one malformed event fails the whole parse and the batch comes back `400`. That
 * quietly destroys partial batch success — which is LOCKED §9.2 — and turns a
 * single quarantinable event into a whole batch the client cannot make progress
 * on.
 *
 * So the server validates the **frame** only, and treats each event as an opaque
 * value to be judged on its own. `BatchEnvelopeSchema` remains the description of
 * a well-formed request and is what the OpenAPI document publishes; this is the
 * parse a correct implementation performs.
 *
 * The rule, stated so an implementation cannot get it backwards:
 * **never validate events at the batch level.**
 *
 * With exactly one exception, and it is forced rather than chosen. Every element
 * must carry a readable `event_id`, because the per-event result protocol is
 * *addressed by* that id: an event without one cannot be reported on, cannot be
 * acknowledged, and cannot be deduplicated. So the frame requires that field and
 * nothing else, and an element missing it fails the whole batch with
 * `malformed_request`. It is also the crudest possible plugin bug — LOCKED §4.1
 * requires the id to exist before the first send.
 */
export const EventKeySchema = z.looseObject({ event_id: WireUuidSchema });
/* ============================== the implemented UE envelope — O-20 CLOSED */

/**
 * WHAT THE UE PLUGIN SENDS — ADOPTED. `OPEN-20` is closed.
 *
 * The implemented `FObserverEvent` carries four fields the envelope used to
 * refuse: `app`, `agent_id`, `visitor_subject` and `entity`. Because the
 * envelope is a `strictObject`, **every real event was `malformed_event` on
 * `unrecognized_keys`** — the strictness working exactly as designed, and the
 * single reason UE-OBS-007 could not pass one event.
 *
 * Two resolutions were prepared. The decision is to **adopt**, and the four
 * fields now live in `EventEnvelopeSchema` itself rather than in a parallel
 * schema. They are envelope-shaped rather than payload-shaped: `app` records
 * which build produced *this* event, which is a different fact from which build
 * the source runs *now*, and `agent_id`, `visitor_subject` and `entity` are the
 * references every read model joins on. Burying them in an open bag would mean
 * every query reaches into `properties` and no schema ever describes them.
 *
 * Adoption carries one binding condition, and it is enforced by
 * `projection.ts` rather than by politeness: **`app.environment` is reported,
 * never authoritative.** The stored environment always comes from the source
 * record assigned at registration. The shipped sample sends `"Development"`
 * capitalised; `normaliseReportedEnvironment` folds the case and
 * `CANONICAL_ENVIRONMENTS` publishes the expected set, but a value outside it
 * is carried and warned about rather than rejected — nothing authorises on it,
 * so refusing an event over it would break delivery for a diagnostic.
 *
 * Folding the fields into the base schema, rather than swapping a reference,
 * is what makes the decision reach everything at once: `validation.ts` parses
 * with `EventEnvelopeSchema`, `BatchEnvelopeSchema` embeds it, and
 * `openapi.ts` publishes it. A parallel schema would have left three of those
 * four still refusing real events.
 */

/**
 * @deprecated The distinction is gone — `EventEnvelopeSchema` now carries the
 * four fields. Kept as an alias so that existing imports and the compatibility
 * suite continue to name the thing they were written to describe. New code
 * should use `EventEnvelopeSchema`.
 */
export const ExtendedEventEnvelopeSchema = EventEnvelopeSchema;
export type ExtendedEventEnvelope = z.infer<typeof ExtendedEventEnvelopeSchema>;

export const BatchFrameSchema = z.strictObject({
  batch_id: CorrelationIdSchema,
  sent_at: WireInstantSchema,
  events: z.array(EventKeySchema),
});
export type BatchFrame = z.infer<typeof BatchFrameSchema>;

export const BatchEnvelopeSchema = z.strictObject({
  /**
   * For correlating one request across a plugin log and a server log. Not
   * identity, not deduplicated on, and never stored as a fact.
   */
  batch_id: CorrelationIdSchema,
  /** When the client sent it. Diagnostic only; `occurred_at` is what counts. */
  sent_at: WireInstantSchema,
  /**
   * The events.
   *
   * An empty array is **valid and processed**: it returns `200` with
   * `received: 0`. It is not a heartbeat — a heartbeat has its own endpoint,
   * because `received: 0` cannot distinguish a healthy liveness ping from a
   * client bug that sends empty batches.
   */
  events: z.array(EventEnvelopeSchema),
});
export type BatchEnvelope = z.infer<typeof BatchEnvelopeSchema>;

/* ============================================================== per event */

export const EVENT_OUTCOMES = ["accepted", "duplicate", "rejected"] as const;
export const EventOutcomeSchema = z.enum(EVENT_OUTCOMES);
export type EventOutcome = (typeof EVENT_OUTCOMES)[number];

/**
 * A rejection code as it appears on the wire.
 *
 * A bounded **string**, not the enum, and the difference is deliberate. A client
 * that parses responses strictly against the enum would reject an entire
 * otherwise-valid response because one event carried a code added after the
 * client was compiled — turning a single quarantined event into a permanently
 * unparseable batch. The known set is published as `EVENT_REJECTION_CODES`, and
 * `classifyEventRejection` decides what to do with anything outside it.
 */
export const WireRejectionCodeSchema = z.string().min(3).max(64);

export const EventResultSchema = z.strictObject({
  event_id: WireUuidSchema,
  status: EventOutcomeSchema,
  /** Present exactly when rejected. A rejection without a code is a server bug. */
  code: WireRejectionCodeSchema.nullable(),
  /** Present exactly when rejected. */
  retryable: z.boolean().nullable(),
  /**
   * Human-readable, may change between releases, **never branched on**.
   *
   * It must never contain a property *value*: a diagnostic that quotes the
   * offending value of a `pii_suspected` rejection has copied the leak into a
   * second place rather than stopped it.
   */
  detail: z.string().max(300).nullable(),
});
export type EventResult = z.infer<typeof EventResultSchema>;

/**
 * A batch-level note that changed nothing about acceptance.
 *
 * Warnings are how the server says "I noticed something" without inventing a
 * rejection: a clock that looks skewed, a schema version approaching the end of
 * its support window. A client logs them and carries on.
 */
export const BatchWarningSchema = z.strictObject({
  code: z.string().min(3).max(64),
  detail: z.string().max(300),
});
export type BatchWarning = z.infer<typeof BatchWarningSchema>;

/**
 * The `200` body. One result per submitted event, in submission order.
 *
 * The counters are redundant with `results` on purpose — they are what a plugin
 * logs, and a mismatch between a counter and the array is a cheap, loud signal
 * that something truncated the response.
 */
export const BatchResponseSchema = z.strictObject({
  batch_id: CorrelationIdSchema,
  received: z.int().min(0),
  accepted: z.int().min(0),
  duplicate: z.int().min(0),
  rejected: z.int().min(0),
  results: z.array(EventResultSchema),
  warnings: z.array(BatchWarningSchema),
});
export type BatchResponse = z.infer<typeof BatchResponseSchema>;

/* ================================================== whole-request failure */

/**
 * The body of any non-2xx ingestion answer.
 *
 * Deliberately small. A failed request has no per-event information to give,
 * because no event was processed, and a body that pretended otherwise would
 * invite a client to acknowledge something that was never stored.
 */
export const RequestFailureBodySchema = z.strictObject({
  code: RequestFailureCodeSchema,
  message: z.string().min(1).max(300),
  /** Echoed when the envelope parsed far enough to read it. */
  batch_id: CorrelationIdSchema.nullable(),
  /** Present only for `rate_limited`; mirrors the `Retry-After` header. */
  retry_after_seconds: z.int().min(1).max(86_400).nullable(),
});
export type RequestFailureBody = z.infer<typeof RequestFailureBodySchema>;

/* ================================================================ helpers */

/** Re-exported so a consumer can validate a code against the closed set. */
export { EventRejectionCodeSchema };

/**
 * Deepest nesting inside a value. A scalar is depth 1.
 *
 * Iterative rather than recursive, because the input is hostile by definition:
 * the whole reason this function exists is that a kilobyte of `[[[[[…]]]]]` must
 * be refused, and refusing it by overflowing the stack is not refusing it.
 */
export function depthOf(value: unknown): number {
  let deepest = 0;
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 1 }];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    if (frame.depth > deepest) deepest = frame.depth;
    /* Past any plausible ceiling there is nothing left to learn. */
    if (frame.depth > 1_000) return frame.depth;
    const node = frame.node;
    if (Array.isArray(node)) {
      for (const child of node) stack.push({ node: child, depth: frame.depth + 1 });
    } else if (node !== null && typeof node === "object") {
      for (const child of Object.values(node)) stack.push({ node: child, depth: frame.depth + 1 });
    }
  }
  return deepest;
}

/** Most keys at any single object level. */
export function widestObject(value: unknown): number {
  let widest = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
    } else if (node !== null && typeof node === "object") {
      const keys = Object.keys(node);
      if (keys.length > widest) widest = keys.length;
      for (const child of Object.values(node)) stack.push(child);
    }
  }
  return widest;
}

/**
 * Serialised size in UTF-8 bytes, as the server measures it.
 *
 * Counted by hand rather than through `Buffer` or `TextEncoder`: this package
 * compiles against `ES2023` and nothing else, so that a contract can be consumed
 * by a browser, a worker or an edge runtime without dragging Node's typings in
 * behind it.
 */
export function serialisedBytes(value: unknown): number {
  const json = JSON.stringify(value) ?? "";
  let bytes = 0;
  for (const character of json) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}
