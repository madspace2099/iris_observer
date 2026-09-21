import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ActivationSuccessSchema,
  BatchResponseSchema,
  DIAGNOSTIC_TEST_EVENT,
  OBSERVER_ROUTES,
  READ_MODEL_EXCLUSION_RULE,
  RequestFailureBodySchema,
  type BatchResponse,
  type RequestFailureBody,
} from "@observer/contracts/ue5";

import { observerAdmin, type ObserverAdmin } from "../src/admin";
import { handleActivate } from "../src/activate";
import type { ObserverDb, SourceOperationsRow } from "../src/db";
import { classifyOperationalState, countsAsBusinessFact, handleHeartbeat } from "../src/heartbeat";
import type { HandlerDeps } from "../src/http";
import { handleIngest } from "../src/ingest";
import { pgliteDb, type SqlQuery } from "../src/pglite";
import { ACTIVATION_CODE_PEPPER, SOURCE_TOKEN_PEPPER, type EnvSource } from "../src/secrets";
import {
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
} from "../../../supabase/test/support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE WHOLE PATH, ONCE, END TO END — an empty database, an operator, two
 * tenants, and one showroom PC that is commissioned, breaks, is suspended, is
 * recovered, and keeps its history through all of it.
 *
 * ## What this file proves that the endpoint suites do not
 *
 * `activate.test.ts`, `ingest.test.ts` and `heartbeat.test.ts` each prove one
 * endpoint exhaustively, and each starts from a fixture built for that endpoint
 * alone. Every one of them mints its credential by calling the port directly,
 * because a suite about ingestion has no business failing over a bug in
 * activation.
 *
 * The consequence is that nothing in the repository has ever checked that the
 * output of one endpoint is accepted as the input of the next. The token this
 * file presents to `handleIngest` is the string that came out of a real
 * `handleActivate` response body; the source it lands under is the one the
 * operator created through `observerAdmin`; the duplicate it is answered with
 * after a credential rotation is decided by a row written before that rotation
 * happened. Those are joins, and a join is exactly what a per-endpoint suite
 * cannot see.
 *
 * ## Why this is one ordered journey rather than fifteen independent cases
 *
 * Independence is the right default and this file is the exception, deliberately
 * taken. The claims below are about *sequence* — that a superseded token stops
 * working at the moment its replacement is minted, that an event stored before a
 * rotation is still a duplicate after it, that a suspension stores nothing while
 * leaving everything already stored intact. Rebuilding the world for each of
 * those would be rebuilding it into the state the previous case left it in,
 * which is the same dependency written out longhand and with more places to get
 * it wrong.
 *
 * So the cases run in file order against one database, and {@link recall}
 * refuses rather than reads undefined if a leg is run without the legs before
 * it — a `.only` on step nine gets a sentence explaining why it cannot work,
 * not an assertion failure about an empty string.
 *
 * ## Everything a client can observe is observed through HTTP
 *
 * `handleActivate`, `handleIngest` and `handleHeartbeat` are called with real
 * `Request` objects and their real `Response` objects are read for status,
 * headers and body. The port is used for two other things and never for the
 * journey itself: `observerAdmin` is the operator's control plane, which has no
 * route by design, and `db`/`pg` are how this file looks *inside* the database
 * to check what the HTTP surface actually did.
 *
 * ## Every secret here is obviously synthetic
 *
 * The two peppers are English sentences at the right length and the wrong shape.
 * The codes and tokens are minted by the real issuers through the real
 * endpoints, and no plaintext is ever printed: each is compared, or asserted
 * absent, never logged.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../../../supabase/migrations");

/**
 * The six migrations of the ingestion domain, named rather than globbed.
 *
 * Named, as the other database suites name them, so that a migration written
 * later joins this fixture because somebody decided it should. All six are
 * load-bearing here: the spine creates accounts, projects and sources; the
 * second mints activation codes and credentials; the third is the event store;
 * the fourth is the operational record a heartbeat writes and this journey
 * reads; the fifth carries `ingestion_verified_at` and millisecond instants; and
 * the sixth makes `observer_credential_resolve` render them at the same
 * precision.
 */
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
  "20260902130000_observer_credential_resolve_precision.sql",
];

/** The tenant the journey belongs to. */
const ACCOUNT_A = "acct_northgate";

/** A second tenant, present for the whole journey so isolation is asserted, not assumed. */
const ACCOUNT_B = "acct_riverside";

/**
 * The two peppers, distinct and unmistakably not secrets.
 *
 * `VITEST` is carried in the object rather than left to `process.env`, because
 * `describePepper` reads the injected source and nothing else — the property
 * that stops a deployment inheriting a harness key, and the reason material this
 * obvious is accepted here and refused in Preview.
 */
const ENV: EnvSource = Object.freeze({
  VITEST: "1",
  [ACTIVATION_CODE_PEPPER]: "activation-code-pepper-for-the-journey-suite-only",
  [SOURCE_TOKEN_PEPPER]: "source-token-pepper-for-the-journey-suite-only-and-nothing-else",
});

/**
 * The one instant every injected clock in this file returns.
 *
 * Read from the real clock rather than written as a literal, and the difference
 * is not sloppiness. `observer_activation_consume` compares a code's expiry
 * against the *database's* own `now()`, which no injected clock reaches, so a
 * frozen literal would mint codes that were already expired on every day but
 * one. Taking the instant once and deriving everything from it is what keeps the
 * assertions exact: nothing below depends on how long the suite takes to run.
 */
const NOW = new Date();

/**
 * When the showroom says its events happened: half an hour before server time.
 *
 * Comfortably inside `accept_and_flag`'s windows — an hour ahead, seven days
 * behind — so a clean batch carries no warnings and a `warnings` array that grew
 * something is a failure rather than noise.
 */
const OCCURRED_AT = new Date(NOW.getTime() - 30 * 60_000).toISOString();

const SESSION_ID = "1d5e8b3a-7c2f-4e6b-9a1c-3f5d7b9e1a2c";

type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let db: ObserverDb;
let admin: ObserverAdmin;
let deps: HandlerDeps;

const query: SqlQuery = (sql, params) => pg.query(sql, [...params]);

beforeAll(async () => {
  pg = await openDatabase("suite");
  /*
   * The three Supabase roles the migrations revoke from and grant to. PGlite
   * ships none of them, and `revoke ... from anon` against a role that does not
   * exist is an error rather than a no-op.
   */
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const name of FILES) await pg.exec(readFileSync(join(MIGRATIONS, name), "utf8"));

  db = pgliteDb(query);
  admin = observerAdmin({ db, env: ENV, now: () => NOW });
  deps = { db, env: ENV, now: () => NOW };
});

/* --- what one leg hands to the next --------------------------------------------- */

/**
 * The journey's memory, and the reason a leg run on its own fails legibly.
 *
 * A plain `let sourceA: string` would be `undefined` under a `.only`, and
 * `undefined` reaches Postgres as a null parameter — so the case would fail with
 * a type error from the driver about a uuid, three layers away from the actual
 * mistake. Recalling through a map turns that into one sentence naming the leg
 * that never ran.
 */
const journey = new Map<string, string>();

function record(key: string, value: string): void {
  journey.set(key, value);
}

function recall(key: string): string {
  const value = journey.get(key);
  if (value === undefined) {
    throw new Error(
      `the journey needs "${key}", which an earlier leg produces — this file's cases run in order and cannot be run alone`,
    );
  }
  return value;
}

/* --- building requests ------------------------------------------------------------ */

function post(route: string, token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers["authorization"] = `Bearer ${token}`;
  return new Request(`https://observer.test${route}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A well-formed activation request, with this leg's code in it. */
function activationBody(plaintextCode: string): Record<string, unknown> {
  return {
    activation_code: plaintextCode,
    reported_environment: "production",
    installation_nonce: "9f4b2d61-0c8e-4a37-b1d5-6e2a7c930f48",
    build: {
      app_version: "1.4.2",
      plugin_version: "0.3.0",
      build_id: "BUILD-2026-09-02",
      engine_version: "5.6",
    },
    os: "Windows 11 26100",
  };
}

/** A well-formed heartbeat. Liveness and outbox health, and nothing else. */
function heartbeatBody(): Record<string, unknown> {
  return {
    sent_at: NOW.toISOString(),
    build: {
      app_version: "1.4.2",
      plugin_version: "0.3.0",
      build_id: "BUILD-2026-09-02",
      engine_version: "5.6",
    },
    queue: {
      pending_events: 0,
      oldest_pending_at: null,
      quarantined_events: 0,
      bytes_used: 0,
      bytes_ceiling: 1_048_576,
      dropped_events: 0,
    },
    last_error: null,
  };
}

/* --- building events -------------------------------------------------------------- */

/**
 * Canonical, lowercase and RFC 4122-shaped, and issued in sequence.
 *
 * `BatchFrameSchema` reads `event_id` with `WireUuidSchema`, which enforces the
 * version and variant nibbles, so a frame-legal id is stricter than the
 * envelope's and every fixture id has to satisfy it. The counter makes the ids
 * deterministic for a given path through the file, which is what lets a
 * duplicate be a duplicate on purpose rather than by luck.
 */
let minted = 0;
function eventId(): string {
  minted += 1;
  return `4f1c9f6e-2c7a-4a4e-9b31-${minted.toString(16).padStart(12, "0")}`;
}

type Event = Record<string, unknown>;

/** A business event: an ordinary fact about a visitor, which read models count. */
function businessEvent(overrides: Event = {}): Event {
  return {
    event_id: eventId(),
    event_name: "section.entered",
    schema_version: 1,
    occurred_at: OCCURRED_AT,
    session_id: SESSION_ID,
    sequence: 1,
    app: {
      version: "1.4.2",
      plugin: "0.3.0",
      build_id: "BUILD-2026-09-02",
      /* Reported, never authoritative. The registered environment is `production`. */
      environment: "Development",
    },
    properties: { section: "atrium" },
    ...overrides,
  };
}

/**
 * The one diagnostic the contract defines — the event onboarding sends to prove
 * the whole path, and which every read model must exclude for ever after.
 */
function diagnosticEvent(overrides: Event = {}): Event {
  return businessEvent({
    event_name: DIAGNOSTIC_TEST_EVENT,
    properties: { reason: "activation_check", note: null },
    ...overrides,
  });
}

let batches = 0;
function batch(events: readonly Event[]): Event {
  batches += 1;
  return {
    batch_id: `9c2f4a1e-5b6d-4c7e-8a9b-${batches.toString(16).padStart(12, "0")}`,
    sent_at: NOW.toISOString(),
    events,
  };
}

/* --- reading the answers ---------------------------------------------------------- */

interface Answer {
  readonly status: number;
  /** The raw body, kept so a leg can assert on what is *not* in it. */
  readonly text: string;
}

async function answerOf(response: Response): Promise<Answer> {
  return { status: response.status, text: await response.text() };
}

async function ingest(token: string | null, body: unknown): Promise<Answer> {
  return answerOf(await handleIngest(post(OBSERVER_ROUTES.ingest, token, body), deps));
}

/** Parsed by the published schema, so a stray field fails the leg rather than passing it. */
function batchResponse(answer: Answer): BatchResponse {
  expect(answer.status, "a processed batch is 200 whatever the per-event outcomes were").toBe(200);
  return BatchResponseSchema.parse(JSON.parse(answer.text));
}

function failureBody(answer: Answer): RequestFailureBody {
  return RequestFailureBodySchema.parse(JSON.parse(answer.text));
}

/** The load-bearing half of a result: everything a client branches on. */
function shapeOf(response: BatchResponse): readonly Event[] {
  return response.results.map((result) => ({
    event_id: result.event_id,
    status: result.status,
    code: result.code,
    retryable: result.retryable,
  }));
}

/* --- looking inside the database -------------------------------------------------- */

/** What is actually stored under a source, which is the only honest "nothing was". */
async function storedIds(account: string, source: string): Promise<readonly string[]> {
  const rows = await db.eventsForSource({ account, source, limit: 1000 });
  return [...rows.map((row) => row.event_id)].sort();
}

async function scalar(sql: string, params: readonly unknown[] = []): Promise<number> {
  const result = await pg.query<{ readonly n: number }>(sql, [...params]);
  const row = result.rows[0];
  if (row === undefined) throw new Error("an aggregate returned no row, which it cannot do");
  return row.n;
}

/** Every analytics row in the database, of every kind, for every tenant. */
const analyticsRowCount = (): Promise<number> =>
  scalar("select count(*)::int as n from observer.analytics_events");

/**
 * The rows a read model is allowed to count, by the contract's own published
 * rule rather than by a prefix this file wrote out again.
 */
const businessRowCount = (): Promise<number> =>
  scalar(
    `select count(*)::int as n from observer.analytics_events where ${READ_MODEL_EXCLUSION_RULE}`,
  );

async function operationsOf(account: string, source: string): Promise<SourceOperationsRow> {
  const rows = await db.sourceOperations({ account, project: null });
  const row = rows.find((candidate) => candidate.source_id === source);
  if (row === undefined) throw new Error("the source is missing from its own operational record");
  return row;
}

/**
 * Whether a value appears anywhere in the `observer` schema, in any column of
 * any table.
 *
 * Written as a scan rather than as three targeted `select`s because the claim is
 * "nowhere", and a targeted query only ever proves "not in the places I thought
 * to look" — a code copied into an audit row or a future column would satisfy
 * every targeted assertion while being exactly the leak. The table list comes
 * from `information_schema`, so a table added by a later migration joins the
 * scan without anybody remembering to add it.
 *
 * Identifiers are interpolated because a table name cannot be a bind parameter.
 * They come from the catalogue and are re-checked against a strict pattern
 * first, so nothing a caller controls reaches the statement.
 */
async function appearsInDatabase(needle: string): Promise<boolean> {
  const tables = await pg.query<{ readonly table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'observer' and table_type = 'BASE TABLE' order by table_name",
  );

  /* A scan of nothing would pass every assertion below it. */
  expect(
    tables.rows.map((row) => row.table_name),
    "the scan must actually have tables to scan",
  ).toContain("activation_codes");

  for (const { table_name: name } of tables.rows) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("unexpected identifier in the catalogue");
    const dumped = await pg.query<{ readonly body: string }>(
      `select coalesce(json_agg(to_jsonb(t))::text, '[]') as body from observer."${name}" t`,
    );
    if (dumped.rows[0]?.body.includes(needle) === true) return true;
  }
  return false;
}

/* ============================================================ the journey */

describe("one source, from an empty database to a verified installation and back", () => {
  /* --- 1 & 2. the operator creates the estate ----------------------------------- */

  it("creates a project and a source for each of two accounts, visible only to their own", async () => {
    const projectA = await admin.createProject({
      account: ACCOUNT_A,
      name: "Northgate showroom",
      slug: "northgate",
    });
    expect(projectA.ok, "the control plane accepted the operator's project").toBe(true);
    if (!projectA.ok) return;

    const sourceA = await admin.createSource({
      account: ACCOUNT_A,
      project: projectA.value,
      type: "showroom_ue5",
      environment: "production",
      label: "Atrium PC",
    });
    expect(sourceA.ok, "the control plane accepted the operator's source").toBe(true);
    if (!sourceA.ok) return;

    /*
     * A second account, created now rather than when it is first needed. Every
     * assertion about isolation from here on is against a tenant that has
     * existed for the whole journey, so "the other account saw nothing" cannot
     * be explained by the other account not existing yet.
     */
    const projectB = await admin.createProject({
      account: ACCOUNT_B,
      name: "Riverside showroom",
      slug: "riverside",
    });
    expect(projectB.ok).toBe(true);
    if (!projectB.ok) return;

    const sourceB = await admin.createSource({
      account: ACCOUNT_B,
      project: projectB.value,
      type: "showroom_ue5",
      environment: "production",
      label: "Riverside PC",
    });
    expect(sourceB.ok).toBe(true);
    if (!sourceB.ok) return;

    record("projectA", projectA.value);
    record("sourceA", sourceA.value);
    record("projectB", projectB.value);
    record("sourceB", sourceB.value);

    /* The database, not the return value: the source is active and is A's. */
    const mine = await admin.sourceStatus({ account: ACCOUNT_A, project: projectA.value });
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    expect(mine.value.map((row) => row.source_id)).toEqual([sourceA.value]);
    expect(mine.value[0]?.state, "a new source is active and has never been seen").toBe("active");
    expect(mine.value[0]?.display_label, "server-authored, never the client's hostname").toBe(
      "Atrium PC",
    );

    /*
     * The tenant boundary, asserted at the first opportunity rather than at the
     * end: A naming B's project reads an empty list, which is the same answer a
     * real project with no sources gives.
     */
    const theirs = await admin.sourceStatus({ account: ACCOUNT_A, project: projectB.value });
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;
    expect(theirs.value, "one account may not read another's estate through its own scope").toEqual(
      [],
    );
  });

  /* --- 3. the operator issues a code -------------------------------------------- */

  it("issues an activation code and stores a selector and an HMAC, never the code", async () => {
    const issued = await admin.issueActivationCode({
      account: ACCOUNT_A,
      source: recall("sourceA"),
      purpose: "activation",
    });
    expect(issued.ok, "an active source is issuable").toBe(true);
    if (!issued.ok) return;

    record("codeA", issued.value.plaintext);
    record("codeSelectorA", issued.value.selector);

    const stored = await pg.query<Record<string, unknown>>(
      "select * from observer.activation_codes where selector = $1",
      [issued.value.selector],
    );
    expect(stored.rows, "exactly one code was recorded").toHaveLength(1);

    const row = JSON.stringify(stored.rows[0]);
    expect(row.includes(issued.value.plaintext), "the plaintext is not in the row").toBe(false);
    expect(row.includes("issued"), "and the code is live, waiting to be spent").toBe(true);

    /*
     * The receipt an operator surface may keep. `toJSON` is what makes the
     * ordinary accident — `logger.info({ result })` — produce a selector and an
     * expiry rather than a live credential, so it is asserted here as part of
     * the issuing step rather than left to the admin suite alone.
     */
    expect(JSON.stringify(issued.value)).not.toContain(issued.value.plaintext);
  });

  /* --- 4. the plugin activates -------------------------------------------------- */

  it("exchanges the code over HTTP for one token, and says the source is activated", async () => {
    const response = await handleActivate(
      post(OBSERVER_ROUTES.activate, null, activationBody(recall("codeA"))),
      deps,
    );

    expect(response.status, "a spent code answers 200 and nothing else does").toBe(200);
    const body = ActivationSuccessSchema.parse(await response.json());

    expect(body.status, "a first activation, derived from the operator's purpose").toBe(
      "activated",
    );
    expect(body.source_id, "the source the operator created, not one the client named").toBe(
      recall("sourceA"),
    );
    expect(body.display_label).toBe("Atrium PC");
    expect(body.environment, "the record's environment, not the build's claim").toBe("production");
    expect(body.token_expires_at, "V1 states no credential expiry").toBeNull();

    record("tokenA", body.source_token);

    /* The database: one credential, active, resolving to the source it was minted for. */
    const credentials = await scalar(
      "select count(*)::int as n from observer.source_credentials where source_id = $1",
      [recall("sourceA")],
    );
    expect(credentials, "one exchange mints exactly one credential").toBe(1);

    const status = await db.credentialStatus({
      account: ACCOUNT_A,
      source: recall("sourceA"),
    });
    expect(status?.state, "the credential is usable the moment the response is written").toBe(
      "active",
    );

    /*
     * THE THREE STATES, AT THE ONE MOMENT THEY ARE EASIEST TO CONFUSE.
     *
     * ACTIVATED is everything asserted above and nothing more: a credential was
     * minted, exactly one, it resolves to this source, it is usable, and the
     * response body carried it the single time it will ever be readable.
     *
     * Neither of the other two follows from it. CONNECTED means a heartbeat was
     * accepted — that the showroom could still reach us *after* the exchange, on
     * a credential it stored rather than one it was mid-conversation holding.
     * INGESTION VERIFIED means an event went the whole way through normal
     * ingestion and landed. An activation proves neither, and this is the exact
     * instant a commissioning screen is most tempted to claim both: the operator
     * has just watched a green response arrive, and the plugin's outbox may be
     * entirely broken.
     *
     * So the two nulls are asserted here, before any heartbeat, rather than left
     * to be inferred from the later legs. The rest of the journey moves them one
     * at a time.
     */
    const row = await operationsOf(ACCOUNT_A, recall("sourceA"));
    expect(row.last_heartbeat_at, "activation is not a heartbeat").toBeNull();
    expect(row.ingestion_verified_at, "and issuing a credential stores no event").toBeNull();
    expect(
      classifyOperationalState(row),
      "activated, and by that fact alone neither connected nor ingestion verified",
    ).toEqual({ connected: false, ingestionVerified: false });
  });

  /* --- 5. the code is gone ------------------------------------------------------- */

  it("cannot produce the plaintext code or token from any table once the exchange is over", async () => {
    /*
     * The whole schema, every table, every column. See `appearsInDatabase`: the
     * claim is "nowhere", and a targeted query would only ever prove "not where
     * I looked" — which is precisely the assertion a code copied into an audit
     * row would satisfy.
     */
    expect(
      await appearsInDatabase(recall("codeA")),
      "the activation code exists nowhere in the database it was spent against",
    ).toBe(false);
    expect(
      await appearsInDatabase(recall("tokenA")),
      "and neither does the credential the exchange minted",
    ).toBe(false);

    /* The selector survives, because a lookup has to find something. */
    expect(
      await appearsInDatabase(recall("codeSelectorA")),
      "the public half remains, which is what makes the row findable",
    ).toBe(true);

    /* And the code is spent, so the same plaintext can never be exchanged again. */
    const state = await pg.query<{ readonly state: string }>(
      "select state from observer.activation_codes where selector = $1",
      [recall("codeSelectorA")],
    );
    expect(state.rows[0]?.state, "single use means single use").toBe("consumed");
  });

  /* --- 6 & 7. liveness, and only liveness ---------------------------------------- */

  it("answers an authenticated heartbeat and writes no analytics row at all", async () => {
    const before = await analyticsRowCount();
    expect(before, "nothing has been ingested yet").toBe(0);

    const response = await handleHeartbeat(
      post(OBSERVER_ROUTES.heartbeat, recall("tokenA"), heartbeatBody()),
      deps,
    );
    expect(response.status, "a credential minted by activation is accepted by heartbeat").toBe(200);

    expect(
      await analyticsRowCount(),
      "a heartbeat is liveness; queue depth is not a fact about a visitor",
    ).toBe(before);

    /*
     * THE FIRST TRANSITION, and it moves one state only. Connected turns yes
     * here because a heartbeat was accepted; ingestion verified is the same no
     * it was after activation, because a heartbeat deliberately writes nothing
     * to `analytics_events` and so can never be the thing that proves ingestion.
     *
     * This is also the state a single collapsed status would hide — an
     * installation that can reach us, holds a valid credential, and has still
     * never had one event stored — and it is the ordinary state of every
     * commissioning that is halfway done.
     */
    const row = await operationsOf(ACCOUNT_A, recall("sourceA"));
    expect(
      classifyOperationalState(row),
      "the heartbeat moved connected, and connected is all it may move",
    ).toEqual({ connected: true, ingestionVerified: false });
  });

  /* --- 8 & 9. the first event ---------------------------------------------------- */

  it("stores a diagnostic.test event under the identity the credential resolved to", async () => {
    const first = diagnosticEvent();
    record("firstEventId", first["event_id"] as string);

    const response = batchResponse(await ingest(recall("tokenA"), batch([first])));

    expect(response.results[0]?.status, "the onboarding check reaches storage").toBe("accepted");
    expect(response.accepted).toBe(1);
    expect(response.warnings, "a batch inside every clock window carries no notes").toEqual([]);

    /*
     * The stored row, read back. Account and project are never sent by the
     * client at all — the facade reads them from the source's own row — so this
     * is the assertion that server-derived identity is what landed.
     */
    const rows = await db.eventsForSource({
      account: ACCOUNT_A,
      source: recall("sourceA"),
      limit: 1000,
    });
    expect(rows, "exactly the one event that was sent").toHaveLength(1);
    expect(rows[0]?.event_id).toBe(recall("firstEventId"));
    expect(rows[0]?.account_id, "the account the credential resolved to").toBe(ACCOUNT_A);
    expect(rows[0]?.project_id, "the project the credential resolved to").toBe(recall("projectA"));
    expect(rows[0]?.app_environment, "the build's own claim, kept as provenance").toBe(
      "Development",
    );

    /*
     * THE SECOND TRANSITION, and the operational fact a heartbeat can never
     * give: an event travelled the whole path — envelope, registry, validation,
     * insert — through ordinary ingestion, and was stored. It was a
     * `diagnostic.test`, which is what that reserved name exists for: the proof
     * is a real event through the real door, not a special case the endpoint
     * knows to treat kindly.
     *
     * Connected is still yes and was not re-earned here; the triple is now
     * complete, each state having been turned on by the one thing that is
     * allowed to turn it on.
     */
    const row = await operationsOf(ACCOUNT_A, recall("sourceA"));
    expect(
      classifyOperationalState(row),
      "the accepted diagnostic moved ingestion verified, and only it",
    ).toEqual({ connected: true, ingestionVerified: true });
  });

  /* --- 10. the replay ------------------------------------------------------------ */

  it("answers the identical resend duplicate and does not store it twice", async () => {
    const resent = diagnosticEvent({ event_id: recall("firstEventId") });

    const response = batchResponse(await ingest(recall("tokenA"), batch([resent])));

    expect(
      response.results[0]?.status,
      "idempotency is (source_id, event_id) in a primary key",
    ).toBe("duplicate");
    expect(response.duplicate).toBe(1);
    expect(response.accepted).toBe(0);

    expect(
      await storedIds(ACCOUNT_A, recall("sourceA")),
      "a duplicate answer means one row, not two",
    ).toEqual([recall("firstEventId")]);
  });

  /* --- 11. the mixed batch ------------------------------------------------------- */

  it("answers a mixed batch with one result per event, in exact submission order", async () => {
    const fresh = businessEvent();
    const replayed = diagnosticEvent({ event_id: recall("firstEventId") });
    const futureVersion = businessEvent({ schema_version: 9 });
    const malformed = businessEvent();
    /* `app` is required by the envelope, so removing it is a per-event plugin bug. */
    delete malformed["app"];

    record("businessEventId", fresh["event_id"] as string);

    const response = batchResponse(
      await ingest(recall("tokenA"), batch([fresh, replayed, futureVersion, malformed])),
    );

    /*
     * The exact array, compared in one assertion rather than field by field: the
     * ordering is the contract, and four separate index assertions would still
     * pass if the results came back in some other order that happened to have
     * the right value at each index it checked.
     */
    expect(shapeOf(response), "results are positional, and the position is the client's").toEqual([
      { event_id: fresh["event_id"], status: "accepted", code: null, retryable: null },
      { event_id: replayed["event_id"], status: "duplicate", code: null, retryable: null },
      {
        event_id: futureVersion["event_id"],
        status: "rejected",
        code: "unsupported_version",
        retryable: false,
      },
      {
        event_id: malformed["event_id"],
        status: "rejected",
        code: "malformed_event",
        retryable: false,
      },
    ]);

    expect(response.received).toBe(4);
    expect(response.accepted).toBe(1);
    expect(response.duplicate).toBe(1);
    expect(response.rejected).toBe(2);
    /* The counters are redundant with `results` on purpose; they must agree. */
    expect(response.accepted + response.duplicate + response.rejected).toBe(
      response.results.length,
    );

    expect(
      await storedIds(ACCOUNT_A, recall("sourceA")),
      "one bad event never prevents its neighbours being stored, and never stores itself",
    ).toEqual([recall("businessEventId"), recall("firstEventId")].sort());
  });

  /* --- 12. identity the payload asserted ----------------------------------------- */

  it("ignores every identity field the payload tries to assert about itself", async () => {
    const before = await storedIds(ACCOUNT_A, recall("sourceA"));

    const honest = businessEvent();
    /* The envelope is closed, so a top-level identity field is a per-event rejection. */
    const topLevel = businessEvent({ source_id: recall("sourceB") });
    /* And `properties` refuses the reserved names, so a nested one is too. */
    const nestedProject = businessEvent({ properties: { project_id: recall("projectB") } });
    const nestedTenant = businessEvent({ properties: { tenant_id: ACCOUNT_B } });

    const answer = await ingest(
      recall("tokenA"),
      batch([honest, topLevel, nestedProject, nestedTenant]),
    );
    const response = batchResponse(answer);

    expect(shapeOf(response)).toEqual([
      { event_id: honest["event_id"], status: "accepted", code: null, retryable: null },
      {
        event_id: topLevel["event_id"],
        status: "rejected",
        code: "malformed_event",
        retryable: false,
      },
      {
        event_id: nestedProject["event_id"],
        status: "rejected",
        code: "reserved_property",
        retryable: false,
      },
      {
        event_id: nestedTenant["event_id"],
        status: "rejected",
        code: "reserved_property",
        retryable: false,
      },
    ]);

    /*
     * The names are echoed because that is what a plugin author has to fix; the
     * values are not, anywhere in the answer.
     */
    expect(answer.text, "a rejection names the key and never the value").not.toContain(
      recall("projectB"),
    );
    expect(answer.text).not.toContain(recall("sourceB"));

    const stored = await db.eventsForSource({
      account: ACCOUNT_A,
      source: recall("sourceA"),
      limit: 1000,
    });
    const landed = stored.find((row) => row.event_id === honest["event_id"]);
    expect(
      landed?.account_id,
      "still the credential's account, with B's named in the payload",
    ).toBe(ACCOUNT_A);
    expect(landed?.project_id, "still the credential's project").toBe(recall("projectA"));
    expect(
      await storedIds(ACCOUNT_A, recall("sourceA")),
      "only the honest event was added",
    ).toEqual([...before, honest["event_id"] as string].sort());
    expect(
      await storedIds(ACCOUNT_B, recall("sourceB")),
      "and nothing at all reached the source the payload named",
    ).toEqual([]);
  });

  /* --- 13. the operator suspends ------------------------------------------------- */

  it("refuses a suspended source with 403 and stores nothing while it is suspended", async () => {
    const before = await storedIds(ACCOUNT_A, recall("sourceA"));

    const suspended = await admin.suspendSource({
      account: ACCOUNT_A,
      source: recall("sourceA"),
    });
    expect(suspended.ok, "the operator's own source is suspendable").toBe(true);

    const refused = businessEvent();
    const answer = await ingest(recall("tokenA"), batch([refused]));

    expect(answer.status, "403 and not 401: the credential is fine, the source is stopped").toBe(
      403,
    );
    expect(
      failureBody(answer).code,
      "an operator resumes a suspension; nobody reactivates it",
    ).toBe("source_suspended");

    expect(
      await storedIds(ACCOUNT_A, recall("sourceA")),
      "a suspension stores nothing and destroys nothing",
    ).toEqual(before);
  });

  /* --- 14. recovery -------------------------------------------------------------- */

  it("re-credentials the same source after the operator resumes it", async () => {
    /*
     * The resume comes first because `observer_activation_consume` requires an
     * active source: a code presented against a suspended one is SPENT and then
     * refused, so that a caller cannot poll a stolen code until an operator
     * happens to resume. The operator's recovery is therefore two actions, and
     * this is the order they have to happen in.
     */
    const resumed = await admin.resumeSource({ account: ACCOUNT_A, source: recall("sourceA") });
    expect(resumed.ok, "suspension is reversible, which is what makes it the mild action").toBe(
      true,
    );

    const issued = await admin.issueActivationCode({
      account: ACCOUNT_A,
      source: recall("sourceA"),
      /* The operator's own record of why. There is no token-refresh endpoint. */
      purpose: "reactivation",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const response = await handleActivate(
      post(OBSERVER_ROUTES.activate, null, activationBody(issued.value.plaintext)),
      deps,
    );
    expect(response.status).toBe(200);
    const body = ActivationSuccessSchema.parse(await response.json());

    expect(body.status, "labelled from the code's purpose, never from a client field").toBe(
      "reactivated",
    );
    expect(body.source_id, "the same source, which is what recovery means").toBe(recall("sourceA"));
    expect(
      body.source_token === recall("tokenA"),
      "a new credential, never the old one handed back",
    ).toBe(false);

    record("tokenA2", body.source_token);

    /* Two credential rows now: the old superseded, the new active. */
    const active = await scalar(
      "select count(*)::int as n from observer.source_credentials where source_id = $1 and state = 'active'",
      [recall("sourceA")],
    );
    expect(active, "exactly one credential may be active for a source").toBe(1);
    const superseded = await scalar(
      "select count(*)::int as n from observer.source_credentials where source_id = $1 and state = 'superseded'",
      [recall("sourceA")],
    );
    expect(superseded, "the old one is kept in that state, not deleted").toBe(1);
  });

  /* --- 15. the rotation, from the client's side ---------------------------------- */

  it("refuses the superseded token with 401 and accepts the new one", async () => {
    const before = await storedIds(ACCOUNT_A, recall("sourceA"));

    const stale = await ingest(recall("tokenA"), batch([businessEvent()]));
    expect(stale.status, "a superseded credential is refused, not merely ignored").toBe(401);
    expect(
      failureBody(stale).code,
      "401 says the credential failed; 403 would say the source is stopped",
    ).toBe("unauthorised");
    expect(
      await storedIds(ACCOUNT_A, recall("sourceA")),
      "a refused credential stores nothing",
    ).toEqual(before);

    const fresh = businessEvent();
    const accepted = batchResponse(await ingest(recall("tokenA2"), batch([fresh])));
    expect(accepted.results[0]?.status, "the replacement credential works immediately").toBe(
      "accepted",
    );
    expect(await storedIds(ACCOUNT_A, recall("sourceA"))).toEqual(
      [...before, fresh["event_id"] as string].sort(),
    );
  });

  /* --- 16. history survives the rotation ----------------------------------------- */

  it("still answers duplicate for an event stored before the credential was rotated", async () => {
    const before = await storedIds(ACCOUNT_A, recall("sourceA"));

    /*
     * The join no per-endpoint suite can see: idempotency is keyed on the
     * SOURCE, not on the credential that presented the event. A plugin that was
     * reimaged and reactivated resends its outbox, and every event it already
     * delivered has to come back `duplicate` — otherwise a recovery doubles a
     * fortnight of a showroom's history.
     */
    const preRotation = diagnosticEvent({ event_id: recall("firstEventId") });
    const response = batchResponse(await ingest(recall("tokenA2"), batch([preRotation])));

    expect(
      response.results[0]?.status,
      "identity is the source's, and the source did not change",
    ).toBe("duplicate");
    expect(await storedIds(ACCOUNT_A, recall("sourceA")), "and nothing was stored again").toEqual(
      before,
    );
  });

  /* --- 17. the same id under another tenant --------------------------------------- */

  it("accepts the very same event_id from the other account's source", async () => {
    /* The second source completes the identical exchange, through the same door. */
    const issued = await admin.issueActivationCode({
      account: ACCOUNT_B,
      source: recall("sourceB"),
      purpose: "activation",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const activated = await handleActivate(
      post(OBSERVER_ROUTES.activate, null, activationBody(issued.value.plaintext)),
      deps,
    );
    const body = ActivationSuccessSchema.parse(await activated.json());
    expect(body.source_id).toBe(recall("sourceB"));
    record("tokenB", body.source_token);

    const beforeA = await storedIds(ACCOUNT_A, recall("sourceA"));

    /*
     * The same `event_id` A has already stored. Deduplication is scoped to the
     * source, so B has never seen it — a global uniqueness rule would let one
     * tenant silently suppress another's event by guessing an id.
     */
    const collision = diagnosticEvent({ event_id: recall("firstEventId") });
    const response = batchResponse(await ingest(recall("tokenB"), batch([collision])));

    expect(response.results[0]?.status, "one tenant's history cannot suppress another's").toBe(
      "accepted",
    );
    expect(await storedIds(ACCOUNT_B, recall("sourceB"))).toEqual([recall("firstEventId")]);
    expect(
      await storedIds(ACCOUNT_A, recall("sourceA")),
      "and A's store is untouched by B's write",
    ).toEqual(beforeA);
  });

  /* --- 18. the lost response ------------------------------------------------------ */

  it("treats a response the client never received as a duplicate, not as a lost event", async () => {
    const before = await storedIds(ACCOUNT_A, recall("sourceA"));
    const inFlight = businessEvent();

    /*
     * TRANSPORT LOSS, NOT A SERVER ERROR, and the distinction is the case.
     *
     * The handler is called, it commits, and its `Response` is dropped without
     * ever being read — the socket died between the commit and the last byte
     * reaching the showroom. Nothing failed; the client simply does not know
     * what happened. Modelling this as a throw would be modelling a different
     * bug: a server error means nothing was stored, whereas here the row is
     * already there and the client is about to send it again.
     */
    await handleIngest(post(OBSERVER_ROUTES.ingest, recall("tokenA2"), batch([inFlight])), deps);

    expect(
      await storedIds(ACCOUNT_A, recall("sourceA")),
      "the commit happened; only the answer was lost",
    ).toEqual([...before, inFlight["event_id"] as string].sort());

    /* The outbox, having no acknowledgement, does the only correct thing. */
    const retry = batchResponse(await ingest(recall("tokenA2"), batch([inFlight])));

    expect(
      retry.results[0]?.status,
      "an unacknowledged send is safe to repeat, which is what makes at-least-once delivery correct",
    ).toBe("duplicate");
    expect(
      await storedIds(ACCOUNT_A, recall("sourceA")),
      "the retry stored nothing, so a flaky network cannot inflate a metric",
    ).toEqual([...before, inFlight["event_id"] as string].sort());
  });

  /* --- 19 & 20. the ledger at the end --------------------------------------------- */

  it("closes with a heartbeat that adds no business fact and diagnostics nothing counts", async () => {
    const rowsBefore = await analyticsRowCount();
    const businessBefore = await businessRowCount();

    const response = await handleHeartbeat(
      post(OBSERVER_ROUTES.heartbeat, recall("tokenA2"), heartbeatBody()),
      deps,
    );
    expect(response.status, "the rotated credential beats as the first one did").toBe(200);

    expect(
      await analyticsRowCount(),
      "the last heartbeat of the journey adds no row, exactly as the first did not",
    ).toBe(rowsBefore);
    expect(await businessRowCount(), "and therefore adds nothing a read model would count").toBe(
      businessBefore,
    );

    /*
     * The diagnostic and the business event are the same row shape in the same
     * table, reached by the same code path — which is the whole point of the
     * namespace, and the reason the exclusion has to be a published rule rather
     * than a habit. Both directions are asserted: the rule excludes exactly the
     * diagnostics, and the TypeScript predicate agrees with the SQL one.
     */
    const diagnostics = await scalar(
      `select count(*)::int as n from observer.analytics_events where not (${READ_MODEL_EXCLUSION_RULE})`,
    );
    expect(diagnostics + businessBefore, "every row is one or the other, and never both").toBe(
      rowsBefore,
    );
    expect(diagnostics, "the onboarding check under A, and the colliding one under B").toBe(2);

    expect(
      countsAsBusinessFact(DIAGNOSTIC_TEST_EVENT),
      "a diagnostic is never a business fact, in TypeScript as in SQL",
    ).toBe(false);
    expect(countsAsBusinessFact("section.entered"), "and an ordinary event always is").toBe(true);

    /* The two are distinguishable by name in the stored rows themselves. */
    const storedNames = await pg.query<{ readonly event_name: string }>(
      "select distinct event_name from observer.analytics_events order by event_name",
    );
    expect(storedNames.rows.map((row) => row.event_name)).toEqual([
      DIAGNOSTIC_TEST_EVENT,
      "section.entered",
    ]);

    /* And the operator's read model still says both things about the source. */
    const row = await operationsOf(ACCOUNT_A, recall("sourceA"));
    expect(
      classifyOperationalState(row),
      "commissioned, recovered, and still both connected and verified",
    ).toEqual({ connected: true, ingestionVerified: true });
    expect(row.state, "and back to active, which is where the journey started").toBe("active");
  });
});
