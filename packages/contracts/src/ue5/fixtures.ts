import type { SendingState } from "./errors";
import { OBSERVER_ROUTES } from "./wire";

/**
 * THE UE5 CONFORMANCE FIXTURE PACK — every exchange the plugin must get right,
 * as data rather than as prose.
 *
 * ## Who this is for, and what that forces
 *
 * Akhilesh builds the Unreal transport without reading a line of this
 * repository's TypeScript. `docs/ue5-contract/` already publishes the *shape* of
 * the protocol; a schema cannot express the part he actually has to implement,
 * which is **what the outbox does next**. `openapi.json` says a `200` carries a
 * `results` array. It cannot say that a submitted event with no result in that
 * array is still unacknowledged, and that is precisely the rule an
 * implementation gets wrong.
 *
 * So each fixture is a complete exchange — request, response, and the resulting
 * per-event outbox decision — with a one-line reason. `pnpm contracts:fixtures`
 * writes them to `docs/ue5-contract/fixtures/`, and a conformance run is then a
 * loop: feed the response to the transport, compare the outbox actions.
 *
 * ## Why the actions are three words and not the contract's own vocabulary
 *
 * `OUTBOX_ACTIONS` in `errors.ts` is `retain | quarantine | retain_and_split` —
 * what to do about a *failure*. It has no word for the ordinary case, because a
 * success is not a failure policy. A conformance harness has to assert on all
 * three outcomes with one vocabulary, so this module uses:
 *
 *   `remove`      acknowledged. The server holds the fact; the outbox may erase
 *                 the row. Reached by `accepted` **and by `duplicate`** — the
 *                 second is the one implementations mistake for a failure, and
 *                 a plugin that retries duplicates never drains its queue.
 *   `retain`      not acknowledged. Still queued, will be sent again.
 *   `quarantine`  kept on disk with its reason, never retried. Needs a human.
 *
 * There is deliberately no fourth word, and in particular no `discard`. LOCKED
 * §5.4 forbids silent loss, so no response anywhere in this pack may result in
 * an event ceasing to exist.
 *
 * `retain_and_split` collapses to `retain` here because the split is a property
 * of the *batch*, not of an event: every event in a `413` is retained, and how
 * the sender re-frames them afterwards is its own business. The `413` fixture's
 * `why` says so.
 *
 * ## Determinism
 *
 * No clock, no randomness, no environment. Every identifier and instant below is
 * a fixed synthetic constant, so the generated pack is byte-stable and a drift
 * test can compare it against what is committed. The credential is
 * `obs_FIXTURE_selector.FIXTURE_secret_not_real` — deliberately not the
 * `obs.<selector>.<secret>` form a real token takes, so that no value in this
 * pack can be pasted into a client and appear to work.
 */

/* ================================================== the synthetic constants */

/**
 * The bearer credential every authenticated fixture presents.
 *
 * Obviously fake by construction. A real source token is
 * `obs.<selector>.<secret>` with two dots and 16+ random selector bytes; this
 * has one dot and spells out what it is, so `parseSourceToken` refuses it and
 * nobody can mistake the pack for a leak. It is still long enough to satisfy
 * `ActivationSuccessSchema`'s 32-character floor, which is the only reason the
 * length matters.
 */
export const FIXTURE_SOURCE_TOKEN = "obs_FIXTURE_selector.FIXTURE_secret_not_real";

/** The one-time activation code, same reasoning. */
export const FIXTURE_ACTIVATION_CODE = "FIXTURE-ACTIVATION-CODE-NOT-REAL";

/**
 * Every credential-shaped value the pack is allowed to contain.
 *
 * `fixtures.test.ts` sweeps the serialised pack for opaque credential-shaped
 * strings and asserts the set it finds is exactly this one. A real token pasted
 * into a fixture during a debugging session fails there rather than in a
 * published document.
 */
export const DECLARED_SYNTHETIC_SECRETS: readonly string[] = Object.freeze([
  FIXTURE_SOURCE_TOKEN,
  FIXTURE_ACTIVATION_CODE,
]);

/**
 * The submitted event identifiers, plus one that is deliberately not submitted.
 *
 * Canonical lowercase, and valid RFC 4122 shapes: `EventResultSchema.event_id`
 * is `z.uuid()`, so a fixture id that ignored the version and variant nibbles
 * would fail its own schema validation and prove nothing.
 */
export const FIXTURE_EVENT_IDS = Object.freeze({
  first: "e0000000-0000-4000-8000-000000000001",
  second: "e0000000-0000-4000-8000-000000000002",
  third: "e0000000-0000-4000-8000-000000000003",
  /**
   * An id the server invents and the client never sent. Chosen to be legible in
   * a diff — if this string appears anywhere in an outbox decision, the
   * implementation matched a foreign result to a queued event.
   */
  foreign: "deadbeef-0000-4000-8000-000000000099",
});

const SOURCE_ID = "f1000000-0000-4000-8000-0000000000a1";
const INSTALLATION_NONCE = "f1000000-0000-4000-8000-0000000000b2";
const SESSION_ID = "5e551011-0000-4000-8000-000000000001";

/** One batch id per fixture, so a conformance log can name the case it is in. */
const BATCH = Object.freeze({
  allAccepted: "b0000000-0000-4000-8000-000000000001",
  allDuplicate: "b0000000-0000-4000-8000-000000000002",
  mixed: "b0000000-0000-4000-8000-000000000003",
  retryable: "b0000000-0000-4000-8000-000000000004",
  nonRetryable: "b0000000-0000-4000-8000-000000000005",
  unknownCode: "b0000000-0000-4000-8000-000000000006",
  missing: "b0000000-0000-4000-8000-000000000007",
  foreign: "b0000000-0000-4000-8000-000000000008",
  conflicting: "b0000000-0000-4000-8000-000000000009",
  malformed: "b0000000-0000-4000-8000-00000000000a",
  tooLarge: "b0000000-0000-4000-8000-00000000000b",
  rateLimited: "b0000000-0000-4000-8000-00000000000c",
  unavailable: "b0000000-0000-4000-8000-00000000000d",
  countNotList: "b0000000-0000-4000-8000-00000000000e",
});

/*
 * Client instants carry `+01:00` and server instants carry `+00:00`, on purpose.
 * A pack written entirely in `Z` would let an implementation that drops the
 * offset pass every case, and the offset is the field that only misbehaves in
 * October when a showroom's clocks change.
 */
const SENT_AT = "2026-01-01T09:15:30+01:00";
const SERVER_TIME = "2026-01-01T08:15:31+00:00";
const CONFIG_REFRESH_AFTER = "2026-01-08T08:15:31+00:00";

const APP = Object.freeze({
  version: "1.4.0",
  plugin: "1.0.0",
  build_id: "fixture-build-0001",
  /*
   * Capitalised, because the shipped client capitalises it. Carried as
   * provenance and never authoritative — the stored environment comes from the
   * source record — so a conformant server must not reject over it.
   */
  environment: "Development",
});

const BUILD = Object.freeze({
  app_version: "1.4.0",
  plugin_version: "1.0.0",
  build_id: "fixture-build-0001",
  engine_version: "5.6",
});

/* ============================================================ the fixture types */

/**
 * What the outbox does with one event once the response has been read.
 *
 * See the module note for why this is not `OUTBOX_ACTIONS`.
 */
export const FIXTURE_OUTBOX_ACTIONS = ["remove", "retain", "quarantine"] as const;
export type FixtureOutboxAction = (typeof FIXTURE_OUTBOX_ACTIONS)[number];

/** Component schemas from `openapi.ts` that a fixture body may be validated against. */
export const FIXTURE_SCHEMA_NAMES = [
  "ActivationRequest",
  "ActivationSuccess",
  "ActivationFailure",
  "BatchEnvelope",
  "BatchResponse",
  "RequestFailureBody",
  "HeartbeatRequest",
  "HeartbeatResponse",
] as const;
export type FixtureSchemaName = (typeof FIXTURE_SCHEMA_NAMES)[number];

export interface FixtureExchange {
  readonly method: "POST";
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface FixtureAnswer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/**
 * A body a plugin author might reasonably produce, and must not.
 *
 * Carried beside a *valid* response rather than in place of one, so that the
 * pack still holds exactly one deliberately invalid body. A negative example
 * that also broke the "every response validates" rule would be indistinguishable
 * from a mistake in the pack.
 */
export interface FixtureCounterExample {
  readonly body: unknown;
  readonly whyItIsWrong: string;
}

export interface ConformanceFixture {
  /** Stable kebab-case identifier. Also the file stem under `fixtures/`. */
  readonly name: string;
  readonly description: string;
  readonly request: FixtureExchange;
  readonly requestSchema: FixtureSchemaName;
  readonly response: FixtureAnswer;
  /** Which published component the response body is judged against. */
  readonly responseSchema: FixtureSchemaName;
  /**
   * Whether the response body is expected to validate.
   *
   * True everywhere but one. The single `false` is the malformed-`2xx` case, and
   * the test asserts both that it is the only one and that it genuinely fails —
   * a "malformed" body that quietly validates would prove nothing.
   */
  readonly responseValidates: boolean;
  /** Event ids in the request, in submission order. Empty for activation and heartbeat. */
  readonly submittedEventIds: readonly string[];
  /** Keyed by event id. Every submitted event appears exactly once; nothing else appears. */
  readonly expectedOutboxActions: Readonly<Record<string, FixtureOutboxAction>>;
  /** What the sending loop does next, which `expectedOutboxActions` cannot express. */
  readonly expectedSending: SendingState;
  /** One line. The rule this case demonstrates. */
  readonly why: string;
  /** Anything a harness author needs that the fields above cannot carry. */
  readonly notes?: readonly string[];
  readonly counterExample?: FixtureCounterExample;
}

/* ============================================================ request builders */

const JSON_HEADERS = Object.freeze({ "content-type": "application/json" });

/*
 * Lowercase header names throughout, matching `packages/sources/src/http.ts`.
 * HTTP field names are case-insensitive, so this is presentation — but a fixture
 * pack is read as an example, and `Authorization: Bearer <40 chars>` is the
 * literal shape the repository's own secret scanner looks for.
 */
const AUTHED_HEADERS = Object.freeze({
  "content-type": "application/json",
  authorization: `Bearer ${FIXTURE_SOURCE_TOKEN}`,
});

function fixtureEvent(eventId: string, sequence: number, occurredAt: string, section: string) {
  return {
    event_id: eventId,
    event_name: "section.entered",
    schema_version: 1,
    occurred_at: occurredAt,
    session_id: SESSION_ID,
    sequence,
    app: APP,
    agent_id: "agent_fixture_01",
    properties: { section_name: section, dwell_ms: 4200 },
  };
}

const EVENT_ONE = fixtureEvent(FIXTURE_EVENT_IDS.first, 1, "2026-01-01T09:15:00+01:00", "atrium");
const EVENT_TWO = fixtureEvent(FIXTURE_EVENT_IDS.second, 2, "2026-01-01T09:15:04+01:00", "kitchen");
const EVENT_THREE = fixtureEvent(
  FIXTURE_EVENT_IDS.third,
  3,
  "2026-01-01T09:15:09+01:00",
  "bathroom",
);

function batch(batchId: string, events: readonly unknown[]) {
  return { batch_id: batchId, sent_at: SENT_AT, events };
}

function ingestRequest(batchId: string, events: readonly unknown[]): FixtureExchange {
  return {
    method: "POST",
    path: OBSERVER_ROUTES.ingest,
    headers: AUTHED_HEADERS,
    body: batch(batchId, events),
  };
}

/**
 * The batch the lost-acknowledgement fixture resends.
 *
 * Shared by reference with `ingest-all-accepted` rather than copied, because
 * the property under test is that a replay is the *same bytes* — same
 * `event_id`s, same `batch_id`, same `sent_at`. A test asserts the two request
 * bodies are deeply equal, so a future edit cannot quietly break the point the
 * fixture exists to make.
 */
const ACCEPTED_BATCH_REQUEST = ingestRequest(BATCH.allAccepted, [EVENT_ONE, EVENT_TWO]);

/* ============================================================ result builders */

const settled = (eventId: string, status: "accepted" | "duplicate") => ({
  event_id: eventId,
  status,
  code: null,
  retryable: null,
  detail: null,
});

const refused = (eventId: string, code: string, retryable: boolean, detail: string) => ({
  event_id: eventId,
  status: "rejected",
  code,
  retryable,
  detail,
});

function requestFailureBody(code: string, message: string, batchId: string, retryAfter?: number) {
  return {
    code,
    message,
    batch_id: batchId,
    retry_after_seconds: retryAfter ?? null,
  };
}

/* ============================================================ the fixtures */

const ACTIVATION_SUCCESS_BODY = Object.freeze({
  status: "activated",
  source_id: SOURCE_ID,
  display_label: "Fixture Showroom, Bay 1",
  environment: "development",
  /*
   * The client reported `Development` and the record says `development`. Folded
   * case is a match, so this is false — a conformant client must not raise a
   * mismatch banner over capitalisation.
   */
  environment_mismatch: false,
  source_token: FIXTURE_SOURCE_TOKEN,
  token_expires_at: null,
  ingest_url: `https://fixture.observer.invalid${OBSERVER_ROUTES.ingest}`,
  heartbeat_url: `https://fixture.observer.invalid${OBSERVER_ROUTES.heartbeat}`,
  accepted_schema_versions: { min: 1, max: 1 },
  limits: {
    max_batch_events: null,
    max_batch_bytes: null,
    max_event_bytes: null,
    max_property_depth: null,
    max_property_count: null,
    min_send_interval_ms: null,
  },
  config_refresh_after: CONFIG_REFRESH_AFTER,
});

const ACTIVATION_REQUEST_BODY = Object.freeze({
  activation_code: FIXTURE_ACTIVATION_CODE,
  reported_environment: "development",
  installation_nonce: INSTALLATION_NONCE,
  build: BUILD,
  os: "Windows 11 (build 26100)",
});

const HEARTBEAT_REQUEST_BODY = Object.freeze({
  sent_at: SENT_AT,
  build: BUILD,
  queue: {
    pending_events: 12,
    oldest_pending_at: "2026-01-01T09:02:11+01:00",
    quarantined_events: 1,
    bytes_used: 40960,
    bytes_ceiling: 52428800,
    dropped_events: 0,
  },
  last_error: { code: "unavailable", at: "2026-01-01T09:10:00+01:00" },
});

/**
 * Every case a conforming plugin must handle, in the order a reader should meet
 * them: get a credential, prove liveness, then the twenty ways a batch can come
 * back.
 *
 * Annotated here and frozen below, rather than annotating the frozen result.
 * `Object.freeze` resolves its overloads against the raw literal, so an
 * annotation on its return value arrives too late to give the literal a
 * contextual type: `method: "POST"` widens to `string`, every computed
 * `expectedOutboxActions` key widens with it, and the whole table stops being
 * checked against `ConformanceFixture` while still looking as though it is.
 */
const FIXTURES: readonly ConformanceFixture[] = [
  {
    name: "activation-success",
    description:
      "A fresh installation exchanges its one-time code and receives a source credential.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.activate,
      headers: JSON_HEADERS,
      body: ACTIVATION_REQUEST_BODY,
    },
    requestSchema: "ActivationRequest",
    response: { status: 200, headers: JSON_HEADERS, body: ACTIVATION_SUCCESS_BODY },
    responseSchema: "ActivationSuccess",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "continue",
    why: "The token is returned once, here, and never again — persist it before answering anything else.",
    notes: [
      "The response carries no tenant_id and no project_id. A client that wants either has misread the contract.",
      "token_expires_at is null and is expected to stay null; the field exists so a future policy needs no new field.",
    ],
  },
  {
    name: "activation-failure",
    description: "An unknown, expired or already-consumed code. All three answer identically.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.activate,
      headers: JSON_HEADERS,
      body: ACTIVATION_REQUEST_BODY,
    },
    requestSchema: "ActivationRequest",
    response: {
      status: 401,
      headers: JSON_HEADERS,
      body: {
        status: "failed",
        code: "activation_failed",
        message: "The activation code could not be used.",
        source_id: null,
        retry_after_seconds: null,
      },
    },
    responseSchema: "ActivationFailure",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "stop",
    why: "One indistinguishable failure, so a guessed code cannot reveal whether a tenant, project or source exists.",
    notes: [
      "source_id is always null here, including for a code that was genuinely consumed. Its presence is a required key, never a signal.",
      "The plugin must not retry activation automatically. Only an operator issuing a fresh code changes the answer.",
    ],
  },
  {
    name: "activation-reactivation",
    description:
      "An operator issues a new code for a source that already exists; the installation re-credentials.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.activate,
      headers: JSON_HEADERS,
      body: ACTIVATION_REQUEST_BODY,
    },
    requestSchema: "ActivationRequest",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: { ...ACTIVATION_SUCCESS_BODY, status: "reactivated" },
    },
    responseSchema: "ActivationSuccess",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "continue",
    why: "Reactivation replaces the credential and nothing else: the outbox, its queued events and their event_ids all survive untouched.",
    notes: [
      "The only difference from activation-success is status. Everything else is the same shape, deliberately.",
      "The previous token stops working the moment this one is issued. There is no refresh endpoint; credential material reaches a device through one door.",
      "A plugin that clears its outbox on reactivation loses every event queued during the outage that caused the reactivation.",
    ],
  },
  {
    name: "heartbeat-success",
    description: "Liveness plus queue health, on its own endpoint.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.heartbeat,
      headers: AUTHED_HEADERS,
      body: HEARTBEAT_REQUEST_BODY,
    },
    requestSchema: "HeartbeatRequest",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: { status: "ok", server_time: SERVER_TIME, config_stale: false },
    },
    responseSchema: "HeartbeatResponse",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "continue",
    why: "A heartbeat reports on the outbox and never changes it; config_stale is advisory and touches neither identity nor credential.",
    notes: [
      "server_time is what a plugin subtracts from its own clock to show drift on the diagnostic screen.",
      "A heartbeat is not an empty batch. received: 0 cannot tell a healthy ping from a client bug that sends empty batches.",
    ],
  },
  {
    name: "heartbeat-unauthorised",
    description: "The credential is unknown, revoked or superseded.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.heartbeat,
      headers: AUTHED_HEADERS,
      body: HEARTBEAT_REQUEST_BODY,
    },
    requestSchema: "HeartbeatRequest",
    response: {
      status: 401,
      headers: JSON_HEADERS,
      body: requestFailureBody(
        "unauthorised",
        "The credential is unknown, revoked or superseded.",
        BATCH.allAccepted,
      ),
    },
    responseSchema: "RequestFailureBody",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "stop",
    why: "Sending stops until an operator reactivates, and every queued event is retained — the credential was the problem, never the events.",
    notes: [
      "batch_id is echoed for log correlation only. A heartbeat submits no events, so no per-event action applies.",
      "The plugin reports Unauthorised. A failure of the LOCAL credential store is an Error instead: the credential may be perfectly valid, and reporting it as Unauthorised sends an operator to reactivate a source that never needed it.",
    ],
  },
  {
    name: "heartbeat-forbidden",
    description: "The credential is valid; the source is suspended or archived.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.heartbeat,
      headers: AUTHED_HEADERS,
      body: HEARTBEAT_REQUEST_BODY,
    },
    requestSchema: "HeartbeatRequest",
    response: {
      status: 403,
      headers: JSON_HEADERS,
      body: requestFailureBody(
        "source_suspended",
        "The source is suspended or archived.",
        BATCH.allAccepted,
      ),
    },
    responseSchema: "RequestFailureBody",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "stop",
    why: "Distinct from 401 because the operator's next action differs: a suspended source is resumed, a rejected credential is reactivated.",
    notes: [
      "A plugin that shows one message for 401 and 403 sends the operator down the wrong path.",
      "Reactivating a suspended source does not resume it, and resuming a source does not fix a revoked credential.",
    ],
  },
  {
    name: "ingest-all-accepted",
    description: "Two new events in one batch, both stored by the server.",
    request: ACCEPTED_BATCH_REQUEST,
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.allAccepted,
        received: 2,
        accepted: 2,
        duplicate: 0,
        rejected: 0,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          settled(FIXTURE_EVENT_IDS.second, "accepted"),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "remove",
    },
    expectedSending: "continue",
    why: "An event leaves the outbox on a per-event accepted inside a 200, and on nothing else.",
  },
  {
    name: "ingest-all-duplicate",
    description: "The same two events again. The server already holds both.",
    request: ingestRequest(BATCH.allDuplicate, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.allDuplicate,
        received: 2,
        accepted: 0,
        duplicate: 2,
        rejected: 0,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "duplicate"),
          settled(FIXTURE_EVENT_IDS.second, "duplicate"),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "remove",
    },
    expectedSending: "continue",
    why: "duplicate is a SUCCESS: the fact is stored, so delivery is finished — a plugin that retries duplicates never drains its queue.",
    notes: [
      "This is the most commonly mis-implemented result in the whole contract.",
      "Deduplication is scoped to (source_id, event_id), which is why the event_id must be minted once and preserved through every retry.",
    ],
  },
  {
    name: "ingest-mixed-result",
    description: "One accepted, one duplicate, one rejected — in a single 200.",
    request: ingestRequest(BATCH.mixed, [EVENT_ONE, EVENT_TWO, EVENT_THREE]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.mixed,
        received: 3,
        accepted: 1,
        duplicate: 1,
        rejected: 1,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          settled(FIXTURE_EVENT_IDS.second, "duplicate"),
          refused(
            FIXTURE_EVENT_IDS.third,
            "schema_invalid",
            false,
            "properties do not satisfy the registered contract for this event name",
          ),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second, FIXTURE_EVENT_IDS.third],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "remove",
      [FIXTURE_EVENT_IDS.third]: "quarantine",
    },
    expectedSending: "continue",
    why: "Partial batch success is the normal case: each event is judged alone and one rejection never taints its neighbours.",
    notes: [
      "This is why the server validates the batch FRAME and never the events inside it. Parsing the whole envelope strictly would turn one bad event into a 400 for all three.",
      "detail is for a human reading a log. Never branch on it; branch on code.",
    ],
  },
  {
    name: "ingest-retryable-rejection",
    description: "A transient server-side failure while writing one event.",
    request: ingestRequest(BATCH.retryable, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.retryable,
        received: 2,
        accepted: 1,
        duplicate: 0,
        rejected: 1,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          refused(
            FIXTURE_EVENT_IDS.second,
            "storage_error",
            true,
            "a transient failure while writing this event",
          ),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "retain",
    },
    expectedSending: "continue",
    why: "storage_error is the only retryable event-level code — the event is fine and the backend is not, so it goes back in the queue.",
    notes: [
      "Sending continues. One retryable event says nothing about the credential or the rest of the queue.",
    ],
  },
  {
    name: "ingest-non-retryable-rejection",
    description: "An event refused for a reason that resending cannot change.",
    request: ingestRequest(BATCH.nonRetryable, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.nonRetryable,
        received: 2,
        accepted: 1,
        duplicate: 0,
        rejected: 1,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          refused(
            FIXTURE_EVENT_IDS.second,
            "pii_suspected",
            false,
            "property key visitor_note matched a forbidden-content heuristic",
          ),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "quarantine",
    },
    expectedSending: "continue",
    why: "Quarantine is keep-with-a-reason, never delete: the event stays on disk, stops being retried, and is counted in the heartbeat.",
    notes: [
      "detail names the offending KEY and never the offending VALUE. A diagnostic that quotes a leaked email has moved the leak rather than stopped it.",
      "A rising quarantined_events in the heartbeat is a defect signal, which is the entire reason quarantined events are counted rather than dropped.",
    ],
  },
  {
    name: "ingest-unknown-rejection-code",
    description:
      "A rejection code invented after this build shipped, which the server marks retryable.",
    request: ingestRequest(BATCH.unknownCode, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.unknownCode,
        received: 2,
        accepted: 1,
        duplicate: 0,
        rejected: 1,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          refused(
            FIXTURE_EVENT_IDS.second,
            "quota_exhausted",
            true,
            "a code this build has never heard of",
          ),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "quarantine",
    },
    expectedSending: "continue",
    why: "An unrecognised code quarantines and is NOT retried, whatever the server said about retryable — retrying something unintelligible loops for ever.",
    notes: [
      "This is the one place the server's retryable flag is deliberately overridden. Everywhere else it is obeyed, subject to only ever being downgraded.",
      "The response still parses. code is a bounded string on the wire rather than the closed enum, precisely so a future code cannot make an otherwise-valid batch unreadable.",
      "Sending continues: one unknown event code says nothing about the credential, and stopping the outbox over it turns a small unknown into an outage.",
    ],
  },
  {
    name: "ingest-missing-result",
    description: "Two events submitted; the response reports on only one of them.",
    request: ingestRequest(BATCH.missing, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.missing,
        received: 2,
        accepted: 1,
        duplicate: 0,
        rejected: 0,
        results: [settled(FIXTURE_EVENT_IDS.first, "accepted")],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "retain",
    },
    expectedSending: "continue",
    why: "A submitted event with no result of its own is NOT acknowledged: silence is retain, never accept.",
    notes: [
      "The counters agree with results.length here, so nothing in the body looks wrong. Only comparing the submitted ids against the reported ids finds it.",
      "An implementation that pairs results to queued events by ARRAY POSITION acknowledges the wrong event in this case, and does so silently. Pair by event_id.",
      "The second event is resent in the next batch and comes back duplicate if it was in fact stored. That is the mechanism working, not a fault.",
    ],
  },
  {
    name: "ingest-foreign-result-id",
    description: "The response carries a result for an event_id that was never in this batch.",
    request: ingestRequest(BATCH.foreign, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.foreign,
        received: 2,
        accepted: 2,
        duplicate: 0,
        rejected: 0,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          settled(FIXTURE_EVENT_IDS.foreign, "accepted"),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "retain",
    },
    expectedSending: "continue",
    why: "A result whose event_id was not submitted acknowledges NOTHING: it is ignored, and must never be matched to another queued event.",
    notes: [
      "The foreign id is deadbeef-0000-4000-8000-000000000099. If it appears in any outbox decision, the implementation matched by position or by count rather than by id.",
      "The counters say accepted: 2 and there are two results, so a client that trusts either number acknowledges two events while only one was really stored.",
      "The unreported second event retains, exactly as in ingest-missing-result. The two rules compose; they are not alternatives.",
      "Log the foreign id. It is a server defect and an operator needs to see it — but a defect on their side must never cost data on ours.",
    ],
  },
  {
    name: "ingest-conflicting-duplicate-result",
    description: "Two results for the same event_id, disagreeing with each other.",
    request: ingestRequest(BATCH.conflicting, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.conflicting,
        received: 2,
        accepted: 2,
        duplicate: 0,
        rejected: 1,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          settled(FIXTURE_EVENT_IDS.second, "accepted"),
          refused(
            FIXTURE_EVENT_IDS.first,
            "storage_error",
            true,
            "a transient failure while writing this event",
          ),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "retain",
      [FIXTURE_EVENT_IDS.second]: "remove",
    },
    expectedSending: "continue",
    why: "Two results for one event_id is a contradiction, so it is resolved by RETAINING — fail safe, because a redelivery costs a duplicate and a wrong acknowledgement costs the event.",
    notes: [
      "Not first-wins and not last-wins. Both are guesses, and last-wins here would happen to be safe while first-wins would lose the event — an implementation must not depend on which order a server happened to emit.",
      "The uncontested second event is unaffected. A contradiction about one event says nothing about another.",
      "The retained event is resent and comes back duplicate if it was stored. That is the cheap half of the trade.",
    ],
  },
  {
    name: "ingest-malformed-2xx-body",
    description: "A 200 whose body does not validate against BatchResponse.",
    request: ingestRequest(BATCH.malformed, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.malformed,
        received: 2,
        /* A string where an integer is required, and three required keys absent. */
        accepted: "2",
        results: "ok",
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: false,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "retain",
      [FIXTURE_EVENT_IDS.second]: "retain",
    },
    expectedSending: "backoff",
    why: "A 2xx whose body does not validate acknowledges ZERO events: an acknowledgement that cannot be read is not an acknowledgement.",
    notes: [
      "The only fixture in this pack whose response body is expected to FAIL schema validation. The test asserts that it does.",
      "A body that does not parse as JSON at all is the same case and takes the same action. Truncation by a proxy looks exactly like this.",
      "Do not salvage. Reading accepted: 2 out of an otherwise invalid body and removing two events by position is the worst available outcome.",
      "Back off rather than continue: an unreadable 200 usually means something between the client and the server is rewriting responses, and hammering it does not help.",
    ],
  },
  {
    name: "ingest-batch-too-large",
    description: "The batch is over the event-count or byte ceiling in force.",
    request: ingestRequest(BATCH.tooLarge, [EVENT_ONE, EVENT_TWO, EVENT_THREE]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 413,
      headers: JSON_HEADERS,
      body: requestFailureBody(
        "batch_too_large",
        "The batch exceeds the ceiling in force. Split it and retry.",
        BATCH.tooLarge,
      ),
    },
    responseSchema: "RequestFailureBody",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second, FIXTURE_EVENT_IDS.third],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "retain",
      [FIXTURE_EVENT_IDS.second]: "retain",
      [FIXTURE_EVENT_IDS.third]: "retain",
    },
    expectedSending: "continue",
    why: "Non-2xx means nothing was stored, so every event is retained; the only failure whose fix is arithmetic — halve the batch and send again.",
    notes: [
      "The contract's own word for this is retain_and_split. The split is a property of the batch, not of an event, so each event's action is plainly retain.",
      "A single event that is itself too large is an event-level event_too_large inside a 200 instead, because splitting cannot help it and an event is never split.",
      "Do not re-mint event_ids when re-framing the batch. The ids are the idempotency mechanism and they survive any amount of re-batching.",
    ],
  },
  {
    name: "ingest-rate-limited",
    description: "Too many requests. Retry-After states how long to wait.",
    request: ingestRequest(BATCH.rateLimited, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "30" },
      body: requestFailureBody(
        "rate_limited",
        "Too many requests. Retry after the stated interval.",
        BATCH.rateLimited,
        30,
      ),
    },
    responseSchema: "RequestFailureBody",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "retain",
      [FIXTURE_EVENT_IDS.second]: "retain",
    },
    expectedSending: "backoff",
    why: "Retry-After is authoritative and overrides any local backoff schedule — a client that waits less than the server asked for is the reason the server asked.",
    notes: [
      "The header and retry_after_seconds carry the same number. The body copy exists because a client must still learn the interval when the header is stripped by an intermediary.",
      "retry_after_seconds is populated for rate_limited alone. It is null on every other failure.",
    ],
  },
  {
    name: "ingest-unavailable",
    description: "The backend could not process the request at all.",
    request: ingestRequest(BATCH.unavailable, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 503,
      headers: JSON_HEADERS,
      body: requestFailureBody(
        "unavailable",
        "The backend could not process the request.",
        BATCH.unavailable,
      ),
    },
    responseSchema: "RequestFailureBody",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "retain",
      [FIXTURE_EVENT_IDS.second]: "retain",
    },
    expectedSending: "backoff",
    why: "A 503 is not an acknowledgement: nothing was stored, so the whole batch is safe — and required — to resend unchanged.",
    notes: [
      "Bounded exponential backoff WITH JITTER. Without jitter every showroom that lost the same deployment returns at the same instant.",
      "batch_id is echoed because the envelope parsed far enough to read it. On a 400 it may be null.",
    ],
  },
  {
    name: "ingest-lost-acknowledgement-replay",
    description:
      "The first attempt received no response at all. The identical batch is sent again.",
    request: ACCEPTED_BATCH_REQUEST,
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.allAccepted,
        received: 2,
        accepted: 0,
        duplicate: 2,
        rejected: 0,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "duplicate"),
          settled(FIXTURE_EVENT_IDS.second, "duplicate"),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "remove",
    },
    expectedSending: "continue",
    why: "This is the case the stable event_id exists for: the server had already stored both, and duplicate is how the client finds out without ever losing or double-counting a fact.",
    notes: [
      "The prior attempt was ingest-all-accepted's request. The server stored both events and the connection died before the response arrived, so the client learned nothing.",
      "The replayed request body is byte-identical to ingest-all-accepted's, batch_id and sent_at included. A test asserts that, because resend-unchanged is the property under test.",
      "The client cannot tell a lost response from a request that never arrived, and does not need to. Retain everything, resend, let the server answer.",
      "A plugin that re-mints event_ids on retry turns this 200 into two stored copies of every event, and no read model downstream can undo it.",
    ],
  },
  {
    name: "ingest-accepted-is-a-count-not-a-list",
    description:
      "ANTI-PATTERN. The canonical body beside the shape a client migrating from accepted_ids expects.",
    request: ingestRequest(BATCH.countNotList, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.countNotList,
        received: 2,
        accepted: 2,
        duplicate: 0,
        rejected: 0,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          settled(FIXTURE_EVENT_IDS.second, "accepted"),
        ],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
    expectedOutboxActions: {
      [FIXTURE_EVENT_IDS.first]: "remove",
      [FIXTURE_EVENT_IDS.second]: "remove",
    },
    expectedSending: "continue",
    why: "accepted is an INTEGER COUNT, never a list of ids — acknowledgement comes only from results[].event_id, and this is the live divergence with the UE client.",
    notes: [
      'This fixture exists because of a real mismatch, not a hypothetical one. A client that once read accepted_ids: ["..."] binds cleanly to accepted and finds a number where it expects an array.',
      "The failure mode is quiet in every language that coerces. A length check on a number yields undefined, an iteration over it yields nothing, and the outbox acknowledges zero events for ever while the server stores every one of them.",
      "There is no field anywhere in BatchResponse that lists accepted ids. received, accepted, duplicate and rejected are all counters, present so that a mismatch against results.length is a loud, cheap signal that something truncated the response.",
      "Counters are for logging and for that mismatch check. They are never the acknowledgement.",
    ],
    counterExample: {
      body: {
        batch_id: BATCH.countNotList,
        received: 2,
        accepted: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
        duplicate: [],
        rejected: [],
        results: [],
        warnings: [],
      },
      whyItIsWrong:
        "accepted, duplicate and rejected are integer counts. This body puts id arrays in all three, " +
        "which is the accepted_ids shape a migrating parser expects; it fails BatchResponse validation, " +
        "and a lenient parser reading it against the real contract acknowledges nothing at all.",
    },
  },
];

/** The published pack. See {@link FIXTURES} for why the freeze is a second step. */
export const CONFORMANCE_FIXTURES: readonly ConformanceFixture[] = Object.freeze(FIXTURES);

/* ============================================================ pack metadata */

/**
 * The directory the pack is written to, under `docs/ue5-contract/`.
 *
 * Exported rather than spelled twice, because it is also the subtree
 * `emit-ue5-contract.ts` must leave alone: that generator wipes its output
 * directory before writing, and a wipe that took this with it deleted a pack it
 * never produced and could not restore.
 */
export const UE5_FIXTURE_DIRECTORY = "fixtures";

/** Every fixture name, in pack order. The published index of the pack. */
export function fixtureNames(): readonly string[] {
  return CONFORMANCE_FIXTURES.map((fixture) => fixture.name);
}

/** One fixture by name, or undefined. */
export function fixtureNamed(name: string): ConformanceFixture | undefined {
  return CONFORMANCE_FIXTURES.find((fixture) => fixture.name === name);
}
