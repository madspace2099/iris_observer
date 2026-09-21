import { DIAGNOSTIC_TEST_EVENT, READ_MODEL_EXCLUSION_RULE } from "./diagnostic";
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
 * ## Both halves of the exchange
 *
 * `expectedOutboxActions` says what the **client** does. `expectedBackendState`
 * says what the **server** must be holding once the exchange is over: which rows
 * exist in `observer.analytics_events`, which of the operational facts moved,
 * what became of the credential and the activation code.
 *
 * A pack carrying only the client half lets a backend regression through
 * unnoticed. A server that quietly stops writing `ingestion_verified_at`, or
 * that advances `last_heartbeat_at` for a credential it has just refused,
 * answers every fixture in this pack correctly on the wire — and both are
 * defects an operator finds out about by trusting a screen that is wrong.
 *
 * The two halves are cross-checked rather than merely filed side by side. An
 * event whose action is `remove` must appear in `storedEventIds`, because
 * removal is only ever justified by the server holding the fact; an event in
 * `undeterminedEventIds` must be `retain`, because an outcome the response does
 * not reveal cannot acknowledge anything. `fixtures.test.ts` asserts both, so a
 * fixture whose two halves disagree fails here rather than teaching a plugin
 * author to delete an event the server never stored.
 *
 * ## Three states, and why the pack keeps them apart
 *
 * ACTIVATED, CONNECTED and INGESTION VERIFIED are three separate facts and no
 * one of them implies another:
 *
 *   ACTIVATED           a credential was issued. `activation-success`.
 *   CONNECTED           a heartbeat succeeded. `heartbeat-success` — and it sets
 *                       `last_heartbeat_at` and touches nothing else.
 *   INGESTION VERIFIED  an event reached storage through ordinary ingestion.
 *                       `diagnostic-test-accepted` is the fixture that earns it.
 *
 * Each of those fixtures records the two facts it does **not** set, because that
 * is the half a collapsed status would destroy: a source can be INGESTION
 * VERIFIED and never CONNECTED, and it can be ACTIVATED and neither.
 *
 * ## Two kinds of fixture
 *
 * Most fixtures are an `exchange`: a request, a response, and what each side
 * holds afterwards. One rule this pack has to publish is not an exchange at all
 * — a diagnostic row is stored for ever and counted never — so
 * `diagnostic-excluded-from-business-metrics` is a `read-model` fixture
 * carrying the stored rows and the metric they must produce.
 *
 * It could have been faked as an HTTP case by inventing a query endpoint. That
 * would have published an endpoint that does not exist, in a document whose
 * whole purpose is that its contents can be relied upon, so the type grew a
 * second shape instead. `kind` discriminates them.
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
  /**
   * The `diagnostic.test` event, which is an ordinary event in every respect
   * that matters to the transport and is separated here only so a reader can
   * tell at a glance which row a diagnostic assertion is about.
   */
  diagnostic: "d1a90057-0000-4000-8000-000000000010",
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
  unknownCodeRetryableTrue: "b0000000-0000-4000-8000-000000000006",
  missing: "b0000000-0000-4000-8000-000000000007",
  foreign: "b0000000-0000-4000-8000-000000000008",
  conflicting: "b0000000-0000-4000-8000-000000000009",
  malformed: "b0000000-0000-4000-8000-00000000000a",
  tooLarge: "b0000000-0000-4000-8000-00000000000b",
  rateLimited: "b0000000-0000-4000-8000-00000000000c",
  unavailable: "b0000000-0000-4000-8000-00000000000d",
  countNotList: "b0000000-0000-4000-8000-00000000000e",
  /*
   * The unknown-code pair's two batches differ, and deliberately so. The
   * fixtures exist to show that two responses differing only in `retryable`
   * produce one behaviour; sharing a batch_id would let a reader think the
   * pairing was an artefact of correlation rather than of the rule.
   */
  unknownCodeRetryableFalse: "b0000000-0000-4000-8000-00000000000f",
  diagnosticAccepted: "b0000000-0000-4000-8000-000000000010",
  diagnosticReplay: "b0000000-0000-4000-8000-000000000011",
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

/* ------------------------------------------------- what the backend must hold */

/**
 * Whether an exchange writes an operational timestamp, or leaves it alone.
 *
 * A delta rather than an absolute, because a delta is true regardless of what a
 * harness did before it and is therefore the only form a single fixture can
 * honestly claim. `set` means this exchange writes the column; `unchanged`
 * means it must not — including when the column already holds a value, which is
 * the case `ingest-all-duplicate` and `diagnostic-test-replay-duplicate` exist
 * to pin down.
 */
export const FIXTURE_STATE_EFFECTS = ["set", "unchanged"] as const;
export type FixtureStateEffect = (typeof FIXTURE_STATE_EFFECTS)[number];

/** What becomes of the one-time activation code a request presented, if any. */
export const FIXTURE_ACTIVATION_CODE_STATES = ["consumed", "unchanged", "not-presented"] as const;
export type FixtureActivationCodeState = (typeof FIXTURE_ACTIVATION_CODE_STATES)[number];

/**
 * What the server holds once the exchange is over.
 *
 * The other half of `expectedOutboxActions`, and the half without which a
 * backend regression passes the pack unnoticed. Structured rather than prose so
 * that a conformance run can compare it, with one prose field — `assertion` —
 * for the part that is genuinely a sentence.
 *
 * ## `storedEventIds` and `undeterminedEventIds` are not the same claim
 *
 * The first is what the backend **certainly** holds. The second is what the
 * response does not reveal, and it is non-empty in exactly the four cases where
 * the response is itself a server defect: a missing result, a foreign result id,
 * two results for one id, and an unreadable `2xx`. Naming that ignorance rather
 * than guessing at it is what makes those four fixtures' `retain` the *derived*
 * answer rather than a rule to memorise — an event whose fate is unknown cannot
 * be acknowledged.
 */
export interface FixtureBackendState {
  /** What must already be true for this response to be the correct one. */
  readonly precondition: string;
  /**
   * Every `event_id` `observer.analytics_events` certainly holds for this source
   * once the exchange has finished, including rows the precondition put there.
   *
   * Idempotency is the table's `(source_id, event_id)` primary key, so this list
   * is also the row count: a second copy of an id is not representable, which is
   * precisely the guarantee the duplicate fixtures assert.
   */
  readonly storedEventIds: readonly string[];
  /** Ids whose storage the response does not settle either way. Usually empty. */
  readonly undeterminedEventIds: readonly string[];
  /** `source_operations.last_heartbeat_at` — the CONNECTED fact. */
  readonly connected: FixtureStateEffect;
  /** `source_operations.ingestion_verified_at` — the INGESTION VERIFIED fact. */
  readonly ingestionVerified: FixtureStateEffect;
  /** Rows in `observer.source_credentials` for this source in state `active`. */
  readonly activeCredentials: number;
  readonly activationCode: FixtureActivationCodeState;
  /** One line. What a backend conformance run asserts, in words. */
  readonly assertion: string;
}

/* ------------------------------------------------------ a stored row, read back */

/**
 * One `observer.analytics_events` row as a read model sees it.
 *
 * Only the columns a read-model rule can branch on. Deliberately not the
 * server-derived identity columns: `account_id`, `project_id` and the stored
 * environment come from the source record, and a fixture that restated them
 * would invite a reader to think a read model chooses them.
 */
export interface FixtureStoredRow {
  readonly event_id: string;
  readonly event_name: string;
  readonly session_id: string | null;
  readonly sequence: number | null;
  readonly occurred_at: string;
}

/** What a business read model must produce from a set of stored rows. */
export interface FixtureReadModelOutcome {
  /** The published predicate. Always `READ_MODEL_EXCLUSION_RULE`, never a copy of the prefix. */
  readonly exclusionRule: string;
  readonly countedEventIds: readonly string[];
  /** Still on disk, still never counted. */
  readonly excludedEventIds: readonly string[];
  /** The metric these rows feed. */
  readonly metric: string;
  readonly value: number;
  /** What the same query reports with the exclusion rule left out. The bug. */
  readonly valueWithoutTheRule: number;
}

/* ------------------------------------------------------------- the two shapes */

/** What every fixture carries, whether or not it is an HTTP exchange. */
interface FixtureCommon {
  /** Stable kebab-case identifier. Also the file stem under `fixtures/`. */
  readonly name: string;
  readonly description: string;
  /** What the server holds afterwards. See {@link FixtureBackendState}. */
  readonly expectedBackendState: FixtureBackendState;
  /** One line. The rule this case demonstrates. */
  readonly why: string;
  /** Anything a harness author needs that the fields above cannot carry. */
  readonly notes?: readonly string[];
}

/** A request, its response, and what both sides hold afterwards. */
export interface ExchangeFixture extends FixtureCommon {
  readonly kind: "exchange";
  readonly request: FixtureExchange;
  readonly requestSchema: FixtureSchemaName;
  /**
   * Whether the request body is expected to validate.
   *
   * False only for the two heartbeat fixtures whose whole subject is what the
   * endpoint refuses. Carried separately from `responseValidates` because they
   * fail for opposite reasons: a malformed response is a server defect a client
   * must survive, a malformed request is a client defect a server must name.
   */
  readonly requestValidates: boolean;
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
  readonly counterExample?: FixtureCounterExample;
}

/**
 * A rule about stored rows, with no request and no response.
 *
 * The pack needs exactly one of these and the reason is worth stating: the
 * diagnostic exclusion is a property of every read model in the product, for
 * ever, and there is no HTTP call that demonstrates it. Modelling it as an
 * exchange would have required inventing a query endpoint — publishing an
 * interface that does not exist, inside the document whose value is that its
 * contents can be relied on.
 */
export interface ReadModelFixture extends FixtureCommon {
  readonly kind: "read-model";
  /** The rows already in `observer.analytics_events` when the read model runs. */
  readonly storedRows: readonly FixtureStoredRow[];
  readonly expectedReadModel: FixtureReadModelOutcome;
}

export type ConformanceFixture = ExchangeFixture | ReadModelFixture;

export function isExchangeFixture(fixture: ConformanceFixture): fixture is ExchangeFixture {
  return fixture.kind === "exchange";
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

/**
 * The `diagnostic.test` event, built by the same function as any other event
 * would be if the builder took a name — which it deliberately does not, because
 * a diagnostic differs from a business event in exactly two envelope fields and
 * spelling them out is the point.
 *
 * `session_id` and `sequence` are null together, as the envelope requires: a
 * diagnostic belongs to no visitor session. Nothing else is special, and that is
 * the whole design — an onboarding check that needed special handling would
 * prove the special handling rather than the ingestion path.
 */
const DIAGNOSTIC_EVENT = Object.freeze({
  event_id: FIXTURE_EVENT_IDS.diagnostic,
  event_name: DIAGNOSTIC_TEST_EVENT,
  schema_version: 1,
  occurred_at: "2026-01-01T09:14:50+01:00",
  session_id: null,
  sequence: null,
  app: APP,
  properties: { reason: "activation_check", note: null },
});

/* ============================================== the over-sized heartbeat body */

/**
 * The heartbeat byte ceiling, restated.
 *
 * Enforced by `HEARTBEAT_MAX_BODY_BYTES` in `packages/sources/src/heartbeat.ts`,
 * which is the authority. It is restated rather than imported because the
 * dependency runs the other way — `@observer/sources` depends on this package
 * and never the reverse — and a contract that imported a service to describe
 * itself would invert the only layering rule this repository has.
 *
 * `fixtures.test.ts` asserts the over-sized body genuinely exceeds this number,
 * so the fixture cannot silently stop being over-sized. It cannot assert the two
 * constants agree; `heartbeat.test.ts` is where the enforced ceiling is proved.
 */
export const HEARTBEAT_BODY_CEILING_BYTES = 4096;

/**
 * Filler that is legible, deterministic, and not credential-shaped.
 *
 * A run of random-looking base64 would trip this repository's own secret sweep —
 * an opaque twenty-character run of the credential alphabet is exactly what that
 * scanner is built to find — so the padding is an English sentence with spaces
 * in it. It repeats rather than being written out because the generated document
 * has to be diffable by a human.
 */
const OVERSIZED_FILLER = "heartbeat filler that cannot satisfy the schema. ".repeat(100);

/* ==================================================== backend-state builder */

/**
 * One backend state, with the uninteresting answers defaulted.
 *
 * Every field is present in the generated document; the defaults exist only so
 * that reading the table below shows what each fixture *claims* rather than a
 * wall of eight fields repeating the same boring values. The defaults are the
 * boring values: nothing stored, nothing undetermined, neither operational fact
 * written, the source's one credential intact, and no activation code presented.
 */
function backendState(state: {
  readonly precondition: string;
  readonly storedEventIds?: readonly string[];
  readonly undeterminedEventIds?: readonly string[];
  readonly connected?: FixtureStateEffect;
  readonly ingestionVerified?: FixtureStateEffect;
  readonly activeCredentials?: number;
  readonly activationCode?: FixtureActivationCodeState;
  readonly assertion: string;
}): FixtureBackendState {
  return {
    precondition: state.precondition,
    storedEventIds: state.storedEventIds ?? [],
    undeterminedEventIds: state.undeterminedEventIds ?? [],
    connected: state.connected ?? "unchanged",
    ingestionVerified: state.ingestionVerified ?? "unchanged",
    activeCredentials: state.activeCredentials ?? 1,
    activationCode: state.activationCode ?? "not-presented",
    assertion: state.assertion,
  };
}

/** The precondition almost every ingestion fixture starts from. */
const LIVE_SOURCE = "An active source holding one live credential, with nothing yet ingested.";

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
 * A heartbeat with no offset on `sent_at`.
 *
 * Chosen over the dozen other ways to fail the schema because this is the one
 * that ships. Every instant in this contract carries an offset, and a client
 * that drops it passes its own tests all summer and starts disagreeing with the
 * server by an hour on the last Sunday in October — the failure the rule exists
 * for, in the fixture that shows it being refused.
 */
const MALFORMED_HEARTBEAT_BODY = Object.freeze({
  ...HEARTBEAT_REQUEST_BODY,
  sent_at: "2026-01-01T09:15:30",
});

/**
 * A heartbeat past the byte ceiling.
 *
 * Over-sized by an unrecognised key rather than by an over-long known one, and
 * that is not laziness: every string in `HeartbeatRequestSchema` is bounded, so
 * there is no schema-valid way to build a body this large. That is exactly why
 * the answer is `malformed_request` — see the fixture's `why`.
 */
const OVERSIZED_HEARTBEAT_BODY = Object.freeze({
  ...HEARTBEAT_REQUEST_BODY,
  diagnostic_dump: OVERSIZED_FILLER,
});

/**
 * What one source's `observer.analytics_events` holds after the exchanges above:
 * two business events and the diagnostic that proved the path.
 *
 * Written as stored rows rather than as wire envelopes on purpose. A read model
 * queries the table, not the transport, and the three columns it can branch on
 * — the name, the session, the instant — are the three carried here.
 */
const READ_MODEL_ROWS: readonly FixtureStoredRow[] = Object.freeze([
  {
    event_id: FIXTURE_EVENT_IDS.first,
    event_name: "section.entered",
    session_id: SESSION_ID,
    sequence: 1,
    occurred_at: "2026-01-01T09:15:00+01:00",
  },
  {
    event_id: FIXTURE_EVENT_IDS.second,
    event_name: "section.entered",
    session_id: SESSION_ID,
    sequence: 2,
    occurred_at: "2026-01-01T09:15:04+01:00",
  },
  {
    event_id: FIXTURE_EVENT_IDS.diagnostic,
    event_name: DIAGNOSTIC_TEST_EVENT,
    session_id: null,
    sequence: null,
    occurred_at: "2026-01-01T09:14:50+01:00",
  },
]);

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
    kind: "exchange",
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
    requestValidates: true,
    response: { status: 200, headers: JSON_HEADERS, body: ACTIVATION_SUCCESS_BODY },
    responseSchema: "ActivationSuccess",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "continue",
    expectedBackendState: backendState({
      precondition:
        "One unspent, unexpired activation code for a registered active source, and no live credential.",
      activeCredentials: 1,
      activationCode: "consumed",
      assertion:
        "One row in observer.source_credentials for this source in state active, the code marked " +
        "consumed in the same transaction, and NOTHING else: no analytics_events row, and " +
        "source_operations still holding null in both last_heartbeat_at and ingestion_verified_at. " +
        "ACTIVATED is one fact; a source that has only activated is neither CONNECTED nor " +
        "INGESTION VERIFIED, and a screen that says otherwise is guessing.",
    }),
    why: "The token is returned once, here, and never again — persist it before answering anything else.",
    notes: [
      "The response carries no tenant_id and no project_id. A client that wants either has misread the contract.",
      "token_expires_at is null and is expected to stay null; the field exists so a future policy needs no new field.",
    ],
  },
  {
    kind: "exchange",
    name: "activation-failure",
    description: "An unknown, expired or already-consumed code. All three answer identically.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.activate,
      headers: JSON_HEADERS,
      body: ACTIVATION_REQUEST_BODY,
    },
    requestSchema: "ActivationRequest",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition:
        "The presented code is unknown, expired, or already consumed — the backend cannot tell the caller which.",
      activeCredentials: 0,
      activationCode: "unchanged",
      assertion:
        "Nothing is written. No credential is minted, and a code that was already consumed is not " +
        "consumed a second time — a failed attempt must leave the table exactly as it found it, or " +
        "the row's timestamps become an oracle for which of the three causes applied.",
    }),
    why: "One indistinguishable failure, so a guessed code cannot reveal whether a tenant, project or source exists.",
    notes: [
      "source_id is always null here, including for a code that was genuinely consumed. Its presence is a required key, never a signal.",
      "The plugin must not retry activation automatically. Only an operator issuing a fresh code changes the answer.",
    ],
  },
  {
    kind: "exchange",
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
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition:
        "An active source with one live credential, the two events of ingest-all-accepted already stored, and a freshly issued code.",
      storedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
      activeCredentials: 1,
      activationCode: "consumed",
      assertion:
        "The credential row is REPLACED — the previous one superseded, exactly one left active — and " +
        "nothing else moves. Both analytics_events rows survive, and ingestion_verified_at keeps the " +
        "instant it already held. A backend that cascaded credential replacement into the source's " +
        "stored events would answer this exchange correctly and destroy a showroom's history.",
    }),
    why: "Reactivation replaces the credential and nothing else: the outbox, its queued events and their event_ids all survive untouched.",
    notes: [
      "The only difference from activation-success is status. Everything else is the same shape, deliberately.",
      "The previous token stops working the moment this one is issued. There is no refresh endpoint; credential material reaches a device through one door.",
      "A plugin that clears its outbox on reactivation loses every event queued during the outage that caused the reactivation.",
    ],
  },
  {
    kind: "exchange",
    name: "heartbeat-success",
    description: "Liveness plus queue health, on its own endpoint.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.heartbeat,
      headers: AUTHED_HEADERS,
      body: HEARTBEAT_REQUEST_BODY,
    },
    requestSchema: "HeartbeatRequest",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition:
        "An active source holding one live credential, which has never been heard from.",
      connected: "set",
      assertion:
        "last_heartbeat_at and last_seen_at advance and the reported build and queue counters land " +
        "on the source's operational row. ingestion_verified_at stays null and observer.analytics_events " +
        "gains no row: this is the CONNECTED fact alone. A heartbeat never earns INGESTION VERIFIED, " +
        "and queue depth is not a fact about a visitor.",
    }),
    why: "A heartbeat reports on the outbox and never changes it; config_stale is advisory and touches neither identity nor credential.",
    notes: [
      "server_time is what a plugin subtracts from its own clock to show drift on the diagnostic screen.",
      "A heartbeat is not an empty batch. received: 0 cannot tell a healthy ping from a client bug that sends empty batches.",
    ],
  },
  {
    kind: "exchange",
    name: "heartbeat-unauthorised",
    description: "The credential is unknown, revoked or superseded.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.heartbeat,
      headers: AUTHED_HEADERS,
      body: HEARTBEAT_REQUEST_BODY,
    },
    requestSchema: "HeartbeatRequest",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: "The presented credential has been revoked, superseded, or never existed.",
      activeCredentials: 0,
      assertion:
        "Nothing is written. last_heartbeat_at does not move — a heartbeat the endpoint refused must " +
        "never make a source look CONNECTED, and a backend that recorded liveness before checking the " +
        "credential would show an operator a healthy showroom that has been locked out for a week.",
    }),
    why: "Sending stops until an operator reactivates, and every queued event is retained — the credential was the problem, never the events.",
    notes: [
      "batch_id is echoed for log correlation only. A heartbeat submits no events, so no per-event action applies.",
      "The plugin reports Unauthorised. A failure of the LOCAL credential store is an Error instead: the credential may be perfectly valid, and reporting it as Unauthorised sends an operator to reactivate a source that never needed it.",
    ],
  },
  {
    kind: "exchange",
    name: "heartbeat-forbidden",
    description: "The credential is valid; the source is suspended or archived.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.heartbeat,
      headers: AUTHED_HEADERS,
      body: HEARTBEAT_REQUEST_BODY,
    },
    requestSchema: "HeartbeatRequest",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: "The credential is live and valid; the source itself is suspended.",
      activeCredentials: 1,
      assertion:
        "Nothing is written. The credential is intact and stays intact — suspension is a property of " +
        "the source, not of the token — and last_heartbeat_at must not advance, or an operator " +
        "resuming the source would find a machine that appeared healthy throughout its suspension.",
    }),
    why: "Distinct from 401 because the operator's next action differs: a suspended source is resumed, a rejected credential is reactivated.",
    notes: [
      "A plugin that shows one message for 401 and 403 sends the operator down the wrong path.",
      "Reactivating a suspended source does not resume it, and resuming a source does not fix a revoked credential.",
    ],
  },
  {
    kind: "exchange",
    name: "heartbeat-malformed",
    description:
      "A heartbeat whose sent_at carries no UTC offset, refused by the schema before the credential is read.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.heartbeat,
      headers: AUTHED_HEADERS,
      body: MALFORMED_HEARTBEAT_BODY,
    },
    requestSchema: "HeartbeatRequest",
    requestValidates: false,
    response: {
      status: 400,
      headers: JSON_HEADERS,
      body: {
        code: "malformed_request",
        message: "The heartbeat payload does not satisfy the heartbeat schema: sent_at.",
        batch_id: null,
        retry_after_seconds: null,
      },
    },
    responseSchema: "RequestFailureBody",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "continue",
    expectedBackendState: backendState({
      precondition: "An active source holding one live credential.",
      activeCredentials: 1,
      assertion:
        "Nothing is written, and the credential is never even read: the schema check precedes " +
        "authentication, so this answer is identical whether the bearer is valid, revoked or absent. " +
        "last_heartbeat_at does not move — a heartbeat that failed to parse is not liveness.",
    }),
    why: "A heartbeat that fails its own schema is malformed_request and nothing more: sending continues, the outbox is untouched, and no operational fact moves.",
    notes: [
      "An instant without an offset is the defect this models because it is the one that ships: a client that drops the offset agrees with the server all summer and is an hour out on the last Sunday in October.",
      "The response names the schema's field path and never quotes the value. sent_at arrived on a path that has not authenticated anybody, and echoing it would put caller-controlled text into a response body.",
      "malformed_request is a 400 whose published policy is continue. A plugin reports the defect locally and keeps sending events; a bug in the liveness payload is not a reason to stop ingestion.",
      "batch_id is null, and honestly so. A heartbeat has no batch to correlate, and inventing one would teach a reader that the field means something here.",
      "This is the only fixture in the pack whose REQUEST is expected to fail validation alongside heartbeat-oversized. The test asserts both genuinely fail.",
    ],
  },
  {
    kind: "exchange",
    name: "heartbeat-oversized",
    description:
      "A heartbeat body past the four-kibibyte ceiling, refused before the parser is asked to read it.",
    request: {
      method: "POST",
      path: OBSERVER_ROUTES.heartbeat,
      headers: AUTHED_HEADERS,
      body: OVERSIZED_HEARTBEAT_BODY,
    },
    requestSchema: "HeartbeatRequest",
    requestValidates: false,
    response: {
      status: 400,
      headers: JSON_HEADERS,
      body: {
        code: "malformed_request",
        message: `A heartbeat may not exceed ${String(HEARTBEAT_BODY_CEILING_BYTES)} bytes.`,
        batch_id: null,
        retry_after_seconds: null,
      },
    },
    responseSchema: "RequestFailureBody",
    responseValidates: true,
    submittedEventIds: [],
    expectedOutboxActions: {},
    expectedSending: "continue",
    expectedBackendState: backendState({
      precondition: "An active source holding one live credential.",
      activeCredentials: 1,
      assertion:
        "Nothing is written and nothing is parsed. The ceiling is applied to the body before " +
        "JSON.parse is called, so a five-kilobyte payload never reaches the parser and never reaches " +
        "the credential check either. last_heartbeat_at does not move.",
    }),
    why: "malformed_request and NOT batch_too_large: a heartbeat has no batch, so answering 413 would tell a client to split and resend something that cannot be divided.",
    notes: [
      "The code was chosen for what it means rather than for the status it carries. batch_too_large is a 413 whose published policy is retain_and_split; a plugin obeying it here would either loop trying to halve a liveness ping or quarantine one.",
      "malformed_request is the honest answer because a heartbeat this large is not a large heartbeat. Every string in HeartbeatRequestSchema is bounded, so a schema-valid body comes to roughly 750 bytes — a body five times that cannot satisfy the schema, and the ceiling has merely discovered it early.",
      "Its policy is also the one a client should follow: continue. The plugin has a defect worth surfacing locally, and stopping ingestion over a diagnostic payload would turn a reporting bug into an outage.",
      "The ceiling is enforced as HEARTBEAT_MAX_BODY_BYTES in packages/sources/src/heartbeat.ts. HEARTBEAT_BODY_CEILING_BYTES restates it here because a contract package must not depend on a service package; the test asserts this body genuinely exceeds it.",
      "The padding is a repeated English sentence rather than random bytes, so the generated document stays diffable and so the repository's own secret sweep does not see an opaque run of credential alphabet.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-all-accepted",
    description: "Two new events in one batch, both stored by the server.",
    request: ACCEPTED_BATCH_REQUEST,
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      storedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
      ingestionVerified: "set",
      assertion:
        "Two rows in observer.analytics_events for this source, one per event_id, each carrying the " +
        "account_id, project_id and environment the SERVER derived from the credential rather than " +
        "anything the batch said. ingestion_verified_at is set; last_heartbeat_at is still null — " +
        "ingestion earns INGESTION VERIFIED and never CONNECTED.",
    }),
    why: "An event leaves the outbox on a per-event accepted inside a 200, and on nothing else.",
  },
  {
    kind: "exchange",
    name: "ingest-all-duplicate",
    description: "The same two events again. The server already holds both.",
    request: ingestRequest(BATCH.allDuplicate, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: "The two events of ingest-all-accepted are already stored for this source.",
      storedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
      ingestionVerified: "unchanged",
      assertion:
        "Still exactly two rows. The (source_id, event_id) primary key absorbs the replay, so a " +
        "second copy is not representable, and ingestion_verified_at keeps the instant of the first " +
        "batch rather than advancing — the column is a coalesce, so the operator's screen shows when " +
        "the path was proved and not when it was last exercised.",
    }),
    why: "duplicate is a SUCCESS: the fact is stored, so delivery is finished — a plugin that retries duplicates never drains its queue.",
    notes: [
      "This is the most commonly mis-implemented result in the whole contract.",
      "Deduplication is scoped to (source_id, event_id), which is why the event_id must be minted once and preserved through every retry.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-mixed-result",
    description: "One accepted, one duplicate, one rejected — in a single 200.",
    request: ingestRequest(BATCH.mixed, [EVENT_ONE, EVENT_TWO, EVENT_THREE]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition:
        "The second event is already stored from an earlier batch; the third's properties do not satisfy its registered schema.",
      storedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
      ingestionVerified: "unchanged",
      assertion:
        "Two rows: the newly accepted first event and the pre-existing second. The rejected third " +
        "event writes NOTHING — not a row, not a tombstone, not a partial insert. A batch is not one " +
        "transaction whose failure rolls back its neighbours, and it is not three writes that leave " +
        "wreckage behind either.",
    }),
    why: "Partial batch success is the normal case: each event is judged alone and one rejection never taints its neighbours.",
    notes: [
      "This is why the server validates the batch FRAME and never the events inside it. Parsing the whole envelope strictly would turn one bad event into a 400 for all three.",
      "detail is for a human reading a log. Never branch on it; branch on code.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-retryable-rejection",
    description: "A transient server-side failure while writing one event.",
    request: ingestRequest(BATCH.retryable, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      storedEventIds: [FIXTURE_EVENT_IDS.first],
      ingestionVerified: "set",
      assertion:
        "One row. The storage_error event left no partial row behind — a transient write failure must " +
        "roll back cleanly, or the client's perfectly correct retry would come back duplicate for an " +
        "event the server told it to resend, and the outbox would be right about a fact the operator " +
        "can no longer see was ever in doubt.",
    }),
    why: "storage_error is the only retryable event-level code — the event is fine and the backend is not, so it goes back in the queue.",
    notes: [
      "Sending continues. One retryable event says nothing about the credential or the rest of the queue.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-non-retryable-rejection",
    description: "An event refused for a reason that resending cannot change.",
    request: ingestRequest(BATCH.nonRetryable, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      storedEventIds: [FIXTURE_EVENT_IDS.first],
      ingestionVerified: "set",
      assertion:
        "One row. The pii_suspected event is not stored, and neither is the value that tripped the " +
        "heuristic: the response names the offending KEY, the backend keeps neither key nor value, " +
        "and the quarantined copy lives on the showroom PC. A backend that logged the payload it " +
        "refused would have moved the leak rather than stopped it.",
    }),
    why: "Quarantine is keep-with-a-reason, never delete: the event stays on disk, stops being retried, and is counted in the heartbeat.",
    notes: [
      "detail names the offending KEY and never the offending VALUE. A diagnostic that quotes a leaked email has moved the leak rather than stopped it.",
      "A rising quarantined_events in the heartbeat is a defect signal, which is the entire reason quarantined events are counted rather than dropped.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-unknown-rejection-code-retryable-true",
    description:
      "A rejection code invented after this build shipped, which the server marks retryable: true.",
    request: ingestRequest(BATCH.unknownCodeRetryableTrue, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.unknownCodeRetryableTrue,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      storedEventIds: [FIXTURE_EVENT_IDS.first],
      ingestionVerified: "set",
      assertion:
        "One row; the rejected event is not stored. What the backend claimed about retryability has " +
        "no bearing on what it wrote, which is why the client's answer can ignore the flag without " +
        "losing anything.",
    }),
    why: "An unrecognised code quarantines and is NOT retried, whatever the server said about retryable — retrying something unintelligible loops for ever.",
    notes: [
      "Half of a pair. ingest-unknown-rejection-code-retryable-false is the same batch, the same event and the same unknown code with the flag inverted, and the expected outbox action is identical.",
      "This is the one place the server's retryable flag is deliberately overridden. Everywhere else it is obeyed, subject to only ever being downgraded.",
      "The response still parses. code is a bounded string on the wire rather than the closed enum, precisely so a future code cannot make an otherwise-valid batch unreadable.",
      "Sending continues: one unknown event code says nothing about the credential, and stopping the outbox over it turns a small unknown into an outage.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-unknown-rejection-code-retryable-false",
    description:
      "The same unrecognised code and the same event, with the server marking it retryable: false.",
    request: ingestRequest(BATCH.unknownCodeRetryableFalse, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.unknownCodeRetryableFalse,
        received: 2,
        accepted: 1,
        duplicate: 0,
        rejected: 1,
        results: [
          settled(FIXTURE_EVENT_IDS.first, "accepted"),
          refused(
            FIXTURE_EVENT_IDS.second,
            "quota_exhausted",
            false,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      storedEventIds: [FIXTURE_EVENT_IDS.first],
      ingestionVerified: "set",
      assertion:
        "One row; the rejected event is not stored. Byte for byte the same backend state as the " +
        "retryable:true twin, which is the point of carrying both.",
    }),
    why: "The twin of the retryable:true case: the two responses differ in that flag alone and the correct client behaviour is IDENTICAL, because an unknown code is never interpreted.",
    notes: [
      "The pair exists because the rule is easy to half-implement. A client that quarantines on retryable:false and retries on retryable:true passes this fixture and fails its twin, and the failure it produces in the field is an infinite retry loop on a code nobody can read.",
      "There is no case in which an unknown code is retried. classifyEventRejection ignores serverRetryable entirely once the code is unrecognised, and a test asserts these two fixtures resolve to the same action.",
      "A retryable:false unknown code looks like the safe direction, and it is — which is exactly why it must not be the one an implementation branches on. Both halves reach quarantine by the same route: the code was unintelligible, so nothing about the flag could be trusted either.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-missing-result",
    description: "Two events submitted; the response reports on only one of them.",
    request: ingestRequest(BATCH.missing, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: `${LIVE_SOURCE} The response is itself a backend defect: a conformant server emits one result per submitted event.`,
      storedEventIds: [FIXTURE_EVENT_IDS.first],
      undeterminedEventIds: [FIXTURE_EVENT_IDS.second],
      ingestionVerified: "set",
      assertion:
        "One row is certain. Whether the second event was stored is UNKNOWABLE from this response, " +
        "and that is not a gap in the fixture — it is the reason the client retains rather than " +
        "removes. A backend conformance run asserts the first row exists and asserts nothing about " +
        "the second, because the contract gives it nothing to assert with.",
    }),
    why: "A submitted event with no result of its own is NOT acknowledged: silence is retain, never accept.",
    notes: [
      "The counters agree with results.length here, so nothing in the body looks wrong. Only comparing the submitted ids against the reported ids finds it.",
      "An implementation that pairs results to queued events by ARRAY POSITION acknowledges the wrong event in this case, and does so silently. Pair by event_id.",
      "The second event is resent in the next batch and comes back duplicate if it was in fact stored. That is the mechanism working, not a fault.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-foreign-result-id",
    description: "The response carries a result for an event_id that was never in this batch.",
    request: ingestRequest(BATCH.foreign, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: `${LIVE_SOURCE} The response is itself a backend defect: a result names an id this source never sent.`,
      storedEventIds: [FIXTURE_EVENT_IDS.first],
      undeterminedEventIds: [FIXTURE_EVENT_IDS.second],
      ingestionVerified: "set",
      assertion:
        "One row is certain, and the foreign id appears NOWHERE — not in the stored list, not in the " +
        "undetermined list, not in this source's table. A result for an id nobody sent is a defect to " +
        "log, never a row to expect; a backend run that went looking for that id would be repeating " +
        "the client's mistake at the other end.",
    }),
    why: "A result whose event_id was not submitted acknowledges NOTHING: it is ignored, and must never be matched to another queued event.",
    notes: [
      "The foreign id is deadbeef-0000-4000-8000-000000000099. If it appears in any outbox decision, the implementation matched by position or by count rather than by id.",
      "The counters say accepted: 2 and there are two results, so a client that trusts either number acknowledges two events while only one was really stored.",
      "The unreported second event retains, exactly as in ingest-missing-result. The two rules compose; they are not alternatives.",
      "Log the foreign id. It is a server defect and an operator needs to see it — but a defect on their side must never cost data on ours.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-conflicting-duplicate-result",
    description: "Two results for the same event_id, disagreeing with each other.",
    request: ingestRequest(BATCH.conflicting, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: `${LIVE_SOURCE} The response is itself a backend defect: one event_id carries two contradictory results.`,
      storedEventIds: [FIXTURE_EVENT_IDS.second],
      undeterminedEventIds: [FIXTURE_EVENT_IDS.first],
      ingestionVerified: "set",
      assertion:
        "The uncontested second event is certainly stored. The first is undetermined — the response " +
        "says both accepted and storage_error about it — and no ordering rule can settle that, which " +
        "is precisely why the client retains. A contradiction about one event still says nothing " +
        "about another, so the second row is a firm assertion and not a guess.",
    }),
    why: "Two results for one event_id is a contradiction, so it is resolved by RETAINING — fail safe, because a redelivery costs a duplicate and a wrong acknowledgement costs the event.",
    notes: [
      "Not first-wins and not last-wins. Both are guesses, and last-wins here would happen to be safe while first-wins would lose the event — an implementation must not depend on which order a server happened to emit.",
      "The uncontested second event is unaffected. A contradiction about one event says nothing about another.",
      "The retained event is resent and comes back duplicate if it was stored. That is the cheap half of the trade.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-malformed-2xx-body",
    description: "A 200 whose body does not validate against BatchResponse.",
    request: ingestRequest(BATCH.malformed, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: `${LIVE_SOURCE} Something between the client and the server is rewriting or truncating responses.`,
      undeterminedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
      ingestionVerified: "unchanged",
      assertion:
        "NOTHING is certain, and that is the whole finding. The status was 200, so the batch probably " +
        "WAS processed and rows probably do exist — an unreadable acknowledgement is not the same " +
        "claim as no acknowledgement. A backend run asserts nothing here; the fixture's subject is " +
        "the client, and the correct client behaviour is to assume the worst about its own knowledge " +
        "rather than about the server's storage.",
    }),
    why: "A 2xx whose body does not validate acknowledges ZERO events: an acknowledgement that cannot be read is not an acknowledgement.",
    notes: [
      "The only fixture in this pack whose response body is expected to FAIL schema validation. The test asserts that it does.",
      "A body that does not parse as JSON at all is the same case and takes the same action. Truncation by a proxy looks exactly like this.",
      "Do not salvage. Reading accepted: 2 out of an otherwise invalid body and removing two events by position is the worst available outcome.",
      "Back off rather than continue: an unreadable 200 usually means something between the client and the server is rewriting responses, and hammering it does not help.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-batch-too-large",
    description: "The batch is over the event-count or byte ceiling in force.",
    request: ingestRequest(BATCH.tooLarge, [EVENT_ONE, EVENT_TWO, EVENT_THREE]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      assertion:
        "No rows are written at all. The request was refused at the ceiling before any event was " +
        "read, so observer.analytics_events is untouched, ingestion_verified_at stays null, and the " +
        "three events remain the client's alone. This is what non-2xx means everywhere in this " +
        "contract, and it is why the whole batch is safe to resend.",
    }),
    why: "Non-2xx means nothing was stored, so every event is retained; the only failure whose fix is arithmetic — halve the batch and send again.",
    notes: [
      "The contract's own word for this is retain_and_split. The split is a property of the batch, not of an event, so each event's action is plainly retain.",
      "A single event that is itself too large is an event-level event_too_large inside a 200 instead, because splitting cannot help it and an event is never split.",
      "Do not re-mint event_ids when re-framing the batch. The ids are the idempotency mechanism and they survive any amount of re-batching.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-rate-limited",
    description: "Too many requests. Retry-After states how long to wait.",
    request: ingestRequest(BATCH.rateLimited, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      assertion:
        "No rows are written. A rate limit is refused before the batch is processed, so a client that " +
        "waits the stated interval and resends loses nothing — and a backend that stored a batch it " +
        "then rate-limited would produce duplicates on every honest retry.",
    }),
    why: "Retry-After is authoritative and overrides any local backoff schedule — a client that waits less than the server asked for is the reason the server asked.",
    notes: [
      "The header and retry_after_seconds carry the same number. The body copy exists because a client must still learn the interval when the header is stripped by an intermediary.",
      "retry_after_seconds is populated for rate_limited alone. It is null on every other failure.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-unavailable",
    description: "The backend could not process the request at all.",
    request: ingestRequest(BATCH.unavailable, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      assertion:
        "No rows are written. This is the fixture that defines what a 503 promises: the batch was not " +
        "processed, so resending it unchanged cannot double-count anything — and a backend that " +
        "answered 503 after a partial write would have broken the one guarantee the whole retry " +
        "design rests on.",
    }),
    why: "A 503 is not an acknowledgement: nothing was stored, so the whole batch is safe — and required — to resend unchanged.",
    notes: [
      "Bounded exponential backoff WITH JITTER. Without jitter every showroom that lost the same deployment returns at the same instant.",
      "batch_id is echoed because the envelope parsed far enough to read it. On a 400 it may be null.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-lost-acknowledgement-replay",
    description:
      "The first attempt received no response at all. The identical batch is sent again.",
    request: ACCEPTED_BATCH_REQUEST,
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition:
        "The first attempt was processed and both events stored; the response never reached the client.",
      storedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
      ingestionVerified: "unchanged",
      assertion:
        "Still two rows, not four. The replay is absorbed by (source_id, event_id), and " +
        "ingestion_verified_at keeps the instant of the lost first attempt. The backend cannot tell " +
        "this request from the one whose answer was lost, and does not need to — that is what makes " +
        "resending safe rather than merely tolerable.",
    }),
    why: "This is the case the stable event_id exists for: the server had already stored both, and duplicate is how the client finds out without ever losing or double-counting a fact.",
    notes: [
      "The prior attempt was ingest-all-accepted's request. The server stored both events and the connection died before the response arrived, so the client learned nothing.",
      "The replayed request body is byte-identical to ingest-all-accepted's, batch_id and sent_at included. A test asserts that, because resend-unchanged is the property under test.",
      "The client cannot tell a lost response from a request that never arrived, and does not need to. Retain everything, resend, let the server answer.",
      "A plugin that re-mints event_ids on retry turns this 200 into two stored copies of every event, and no read model downstream can undo it.",
    ],
  },
  {
    kind: "exchange",
    name: "ingest-accepted-is-a-count-not-a-list",
    description:
      "ANTI-PATTERN. The canonical body beside the shape a client migrating from accepted_ids expects.",
    request: ingestRequest(BATCH.countNotList, [EVENT_ONE, EVENT_TWO]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
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
    expectedBackendState: backendState({
      precondition: LIVE_SOURCE,
      storedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
      ingestionVerified: "set",
      assertion:
        "Two rows. The backend state is the same as ingest-all-accepted's, deliberately: the server " +
        "is behaving perfectly and the whole defect lives in how the response is read. A client stuck " +
        "on accepted_ids acknowledges nothing while these two rows sit there, and it resends them for " +
        "ever without a single error appearing on either side.",
    }),
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
  {
    kind: "exchange",
    name: "diagnostic-test-accepted",
    description:
      "A diagnostic.test event sent through ordinary ingestion, on the ordinary ingestion endpoint.",
    request: ingestRequest(BATCH.diagnosticAccepted, [DIAGNOSTIC_EVENT]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.diagnosticAccepted,
        received: 1,
        accepted: 1,
        duplicate: 0,
        rejected: 0,
        results: [settled(FIXTURE_EVENT_IDS.diagnostic, "accepted")],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.diagnostic],
    expectedOutboxActions: { [FIXTURE_EVENT_IDS.diagnostic]: "remove" },
    expectedSending: "continue",
    expectedBackendState: backendState({
      precondition: `${LIVE_SOURCE} No heartbeat has ever been received.`,
      storedEventIds: [FIXTURE_EVENT_IDS.diagnostic],
      connected: "unchanged",
      ingestionVerified: "set",
      assertion:
        "One row in observer.analytics_events with event_name diagnostic.test — a real row, on the " +
        "real path, which is the only thing that could prove the path — and ingestion_verified_at " +
        "set. last_heartbeat_at is STILL NULL: this source is INGESTION VERIFIED and not CONNECTED, " +
        "and an Admin screen that cannot show that has collapsed two facts into one.",
    }),
    why: "INGESTION VERIFIED is earned here and nowhere else: a real event travelled the whole path — envelope, registry, validation, insert — and was stored.",
    notes: [
      "It goes to /functions/v1/observer-ingest like any other event, with the same credential and the same envelope. A diagnostic that needed its own endpoint would prove the endpoint rather than the path.",
      "The canonical name is diagnostic.test. diagnostics.ping is a UE-side name and must never appear on this wire; a plugin that sends it gets schema_unknown, correctly.",
      "session_id and sequence are both null, as the envelope requires them to be together. A diagnostic belongs to no visitor session — nobody is in the showroom when a commissioning engineer presses the button.",
      "properties carry reason and note, and nothing else. reason is what lets an operator reading a source's history tell an activation check from a support engineer poking a live installation.",
      "This is the fixture that separates INGESTION VERIFIED from CONNECTED. Its backend state records last_heartbeat_at untouched for exactly that reason, and heartbeat-success records the mirror image.",
    ],
  },
  {
    kind: "exchange",
    name: "diagnostic-test-replay-duplicate",
    description:
      "The same diagnostic.test event again, because a support engineer pressed the button twice.",
    request: ingestRequest(BATCH.diagnosticReplay, [DIAGNOSTIC_EVENT]),
    requestSchema: "BatchEnvelope",
    requestValidates: true,
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: {
        batch_id: BATCH.diagnosticReplay,
        received: 1,
        accepted: 0,
        duplicate: 1,
        rejected: 0,
        results: [settled(FIXTURE_EVENT_IDS.diagnostic, "duplicate")],
        warnings: [],
      },
    },
    responseSchema: "BatchResponse",
    responseValidates: true,
    submittedEventIds: [FIXTURE_EVENT_IDS.diagnostic],
    expectedOutboxActions: { [FIXTURE_EVENT_IDS.diagnostic]: "remove" },
    expectedSending: "continue",
    expectedBackendState: backendState({
      precondition:
        "The diagnostic.test event of diagnostic-test-accepted is already stored for this source.",
      storedEventIds: [FIXTURE_EVENT_IDS.diagnostic],
      connected: "unchanged",
      ingestionVerified: "unchanged",
      assertion:
        "Still one row. A diagnostic is deduplicated by (source_id, event_id) exactly like a business " +
        "event, so pressing the button twice cannot produce two diagnostic facts, and " +
        "ingestion_verified_at keeps the instant of the first send rather than advancing to this one.",
    }),
    why: "A diagnostic is idempotent exactly like any other event: the second send comes back duplicate, which removes it from the outbox and adds no second row.",
    notes: [
      "The batch_id differs from diagnostic-test-accepted's and the event_id does not. This is a fresh send rather than a replay of lost bytes, which is why it is not modelled on ingest-lost-acknowledgement-replay.",
      "A plugin that minted a fresh event_id for the second press would store a second diagnostic row and prove nothing it had not already proved, while permanently overstating how many diagnostics a showroom has run.",
      "duplicate still proves the path, so ingestion_verified_at stays set. It does not advance, because the column records when the path was first proved and not when it was last exercised — the heartbeat is what says a source is alive now.",
    ],
  },
  {
    kind: "read-model",
    name: "diagnostic-excluded-from-business-metrics",
    description:
      "Not an HTTP exchange. Three stored rows, and the read model that must count exactly two of them.",
    storedRows: READ_MODEL_ROWS,
    expectedReadModel: {
      exclusionRule: READ_MODEL_EXCLUSION_RULE,
      countedEventIds: [FIXTURE_EVENT_IDS.first, FIXTURE_EVENT_IDS.second],
      excludedEventIds: [FIXTURE_EVENT_IDS.diagnostic],
      metric: "section_entries",
      value: 2,
      valueWithoutTheRule: 3,
    },
    expectedBackendState: backendState({
      precondition:
        "The two section.entered events and the diagnostic.test event of diagnostic-test-accepted are all stored for this source.",
      storedEventIds: [
        FIXTURE_EVENT_IDS.first,
        FIXTURE_EVENT_IDS.second,
        FIXTURE_EVENT_IDS.diagnostic,
      ],
      ingestionVerified: "unchanged",
      assertion:
        "Three rows stored and two counted. The diagnostic row is never deleted, never hidden and " +
        "never moved to a second table — it is filtered at read time by " +
        "`event_name NOT LIKE 'diagnostic.%'`, which every business read model carries, so that " +
        "nothing anywhere has to remember to exclude it.",
    }),
    why: "A diagnostic row is stored for ever and counted never: the exclusion is a published rule a test can enforce, not a convention every future read model has to remember.",
    notes: [
      "READ_MODEL_EXCLUSION_RULE is the predicate, verbatim: event_name NOT LIKE 'diagnostic.%'. It is published as a constant so the rule is one edit rather than a habit spread across every query somebody writes next year.",
      "A read model that omits it reports 3 where the truth is 2. That is the failure this fixture measures, which is why valueWithoutTheRule is carried beside value rather than described in prose.",
      "The rule matches the whole reserved namespace and not the single name diagnostic.test. A future diagnostic.something is excluded on the day it is invented, without anybody editing a read model.",
      "isDiagnosticEvent is the same rule for code rather than SQL, and countsAsBusinessFact in @observer/sources states it positively — filter(countsAsBusinessFact) survives a refactor in a way that a negation does not.",
      "This fixture has no request and no response because there is no HTTP call that demonstrates the rule. Inventing a query endpoint to make it fit the exchange shape would have published an interface that does not exist.",
    ],
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

/**
 * One fixture by name, narrowed to an exchange, or undefined.
 *
 * Exists because almost every caller wants a request and a response, and
 * re-narrowing a union at each call site is the kind of ceremony that ends in
 * somebody reaching for a cast.
 */
export function exchangeNamed(name: string): ExchangeFixture | undefined {
  const fixture = fixtureNamed(name);
  return fixture !== undefined && isExchangeFixture(fixture) ? fixture : undefined;
}

/** Every fixture that is an HTTP exchange, in pack order. */
export function exchangeFixtures(): readonly ExchangeFixture[] {
  return CONFORMANCE_FIXTURES.filter(isExchangeFixture);
}
