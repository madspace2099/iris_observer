import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  APPROVED_BACKEND_CEILINGS,
  BatchResponseSchema,
  OBSERVER_ROUTES,
  RequestFailureBodySchema,
  type BatchResponse,
  type RequestFailureBody,
} from "@observer/contracts/ue5";

import type { ObserverDb } from "../src/db";
import type { HandlerDeps } from "../src/http";
import { handleIngest } from "../src/ingest";
import { pgliteDb, type SqlQuery } from "../src/pglite";
import { issueActivationCode, issueSourceToken, type EnvSource } from "../src/secrets";
import {
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
} from "../../../supabase/test/support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE INGESTION ENDPOINT, AGAINST A REAL POSTGRES AND A REAL CREDENTIAL.
 *
 * ## Why this boots a database rather than stubbing `ObserverDb`
 *
 * Almost everything worth proving here is a property of the *pair* — the
 * handler and the SQL it hands a batch to — and a stub can be made to agree with
 * whatever the handler currently does. Two examples make the point:
 * `accepted` versus `duplicate` is decided by a primary key inside
 * `observer_events_append`, not by the handler; and "nothing was stored" is only
 * a claim a stub can echo, whereas here it is a `select` that finds no rows.
 *
 * So every case below drives the real handler, through the real adapter, against
 * the real migrations, with a credential minted the way activation mints one.
 *
 * ## Every response is parsed by the published schema
 *
 * `BatchResponseSchema` and `RequestFailureBodySchema` are `strictObject`, so
 * parsing a response through them is simultaneously the type assertion these
 * tests need and a proof that the body carries no field the contract does not
 * define. That is what makes the `accepted_ids` case at the bottom a
 * belt-and-braces check rather than the only guard.
 *
 * ## Every secret here is obviously synthetic
 *
 * The peppers are English sentences with hyphens in them. They are the right
 * length and the wrong shape, so no value in this file could be mistaken for a
 * real one in a dump or a grep. No token, code, verifier or rejected property
 * value is ever printed — the one rejected value the suite uses is asserted to
 * be *absent* from the response rather than compared against it.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../../../supabase/migrations");

/*
 * Named rather than globbed, as the migration suites do, so that a migration
 * added later joins this fixture by somebody's decision rather than by matching
 * a pattern. All five are load-bearing: the spine creates the source row the
 * credential resolves to, the second mints credentials, the third is the event
 * store, the fourth carries `ingestion_verified_at`, and the fifth is what makes
 * `occurred_at` survive the round trip at millisecond precision.
 */
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
  "20260902130000_observer_credential_resolve_precision.sql",
];

const ACCOUNT = "acct_northgate";
const OTHER_ACCOUNT = "acct_riverside";

/**
 * Two peppers, distinct, and unmistakably not secrets.
 *
 * `assertDistinctPeppers` refuses a configuration where both hold the same
 * value, so the fixture has to satisfy that rule as a deployment would. Both are
 * well past the 32-byte floor and neither matches the placeholder pattern.
 */
const PEPPERS: EnvSource = Object.freeze({
  OBSERVER_ACTIVATION_CODE_PEPPER: "synthetic-activation-pepper-for-the-ingest-suite-only",
  OBSERVER_SOURCE_TOKEN_PEPPER: "synthetic-source-token-pepper-for-the-ingest-suite-only",
});

/** Server time, frozen, so no case depends on when it ran. */
const NOW = new Date("2026-09-02T09:30:00.000Z");

/** Comfortably inside every clock window, so a clean batch carries no warnings. */
const OCCURRED_AT = "2026-09-02T09:00:00.000Z";

const BATCH_ID = "9c2f4a1e-5b6d-4c7e-8a9b-0d1e2f3a4b5c";
const SESSION_ID = "1d5e8b3a-7c2f-4e6b-9a1c-3f5d7b9e1a2c";

type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let db: ObserverDb;

const query: SqlQuery = async (sql, params) => pg.query(sql, [...params]);

beforeAll(async () => {
  pg = await openDatabase("suite");
  /*
   * The three Supabase roles the migrations revoke from and grant to. PGlite has
   * none of them, and `revoke ... from anon` against a role that does not exist
   * is an error rather than a no-op.
   */
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const name of FILES) await pg.exec(readFileSync(join(MIGRATIONS, name), "utf8"));
  db = pgliteDb(query);
});

/* --- the fixture ---------------------------------------------------------------- */

let sourcesMade = 0;

/** A fresh source per case, so one test's stored events can never explain another's. */
async function makeSource(account = ACCOUNT): Promise<string> {
  sourcesMade += 1;
  const label = `showroom ${String(sourcesMade)}`;
  const project = await db.projectCreate({ account, name: `P ${label}`, slug: null });
  return db.sourceCreate({
    account,
    project,
    type: "showroom_ue5",
    environment: "production",
    label,
  });
}

/**
 * Mint a credential the way the activation endpoint does.
 *
 * Deliberately the real path — issue a code, spend it, receive a token — rather
 * than an insert into `source_credentials`. The verifier the database stores has
 * to be the one `verifySecret` re-derives from the presented plaintext, and a
 * fixture that wrote the row directly would be free to store something that
 * could never authenticate while every test still passed.
 */
async function activate(account: string, source: string): Promise<string> {
  const code = issueActivationCode(PEPPERS);
  const issued = await db.activationIssue({
    account,
    source,
    selector: code.selector,
    verifier: code.verifier,
    purpose: "activation",
    /*
     * THE WALL CLOCK, not `NOW`, and the difference is not sloppiness.
     *
     * `observer_activation_consume` compares this column against the database's
     * own `now()`, which no injected clock reaches. An expiry derived from the
     * frozen server time is therefore an hour past whatever the machine's clock
     * says, and every credential in this file silently fails to mint — which is
     * exactly how this line was first written and what the fixture then blamed
     * on the handler.
     */
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  expect(issued).toBe(true);

  const token = issueSourceToken(PEPPERS);
  const consumed = await db.activationConsume({
    codeSelector: code.selector,
    codeVerifier: code.verifier,
    credentialSelector: token.selector,
    credentialVerifier: token.verifier,
    credentialExpiresAt: null,
  });
  if (consumed === null) throw new Error("the fixture failed to mint a credential");
  return token.plaintext;
}

/** A source that is already activated, which is what most cases start from. */
async function activatedSource(account = ACCOUNT): Promise<{
  readonly source: string;
  readonly token: string;
}> {
  const source = await makeSource(account);
  return { source, token: await activate(account, source) };
}

function deps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return { db, env: PEPPERS, now: () => NOW, ...overrides };
}

/* --- building requests ----------------------------------------------------------- */

function post(token: string | null, body: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers["authorization"] = `Bearer ${token}`;
  return new Request(`https://observer.test${OBSERVER_ROUTES.ingest}`, {
    method: "POST",
    headers,
    body,
  });
}

interface Answer {
  readonly status: number;
  /** The raw body, kept so a case can assert on what is *not* in it. */
  readonly text: string;
}

async function send(
  token: string | null,
  body: unknown,
  overrides: Partial<HandlerDeps> = {},
): Promise<Answer> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const response = await handleIngest(post(token, raw), deps(overrides));
  return { status: response.status, text: await response.text() };
}

/** Parsed by the published schema, so a stray field fails the test rather than passing it. */
function batchResponse(answer: Answer): BatchResponse {
  expect(answer.status).toBe(200);
  return BatchResponseSchema.parse(JSON.parse(answer.text));
}

function failureBody(answer: Answer): RequestFailureBody {
  return RequestFailureBodySchema.parse(JSON.parse(answer.text));
}

/* --- building events ------------------------------------------------------------- */

/**
 * Canonical, lowercase, and RFC 4122-shaped.
 *
 * The envelope accepts any canonical 128-bit identifier, but `BatchFrameSchema`
 * reads `event_id` with `WireUuidSchema`, which does enforce the version and
 * variant nibbles — so a frame-legal id is the stricter of the two and every
 * fixture id has to satisfy it.
 */
let minted = 0;
function eventId(): string {
  minted += 1;
  return `4f1c9f6e-2c7a-4a4e-9b31-${minted.toString(16).padStart(12, "0")}`;
}

type Event = Record<string, unknown>;

function event(overrides: Event = {}): Event {
  return {
    event_id: eventId(),
    event_name: "section.entered",
    schema_version: 1,
    occurred_at: OCCURRED_AT,
    session_id: SESSION_ID,
    sequence: 1,
    app: {
      version: "1.4.0",
      plugin: "0.9.2",
      build_id: "build-synthetic-0001",
      environment: "Development",
    },
    properties: { section: "atrium" },
    ...overrides,
  };
}

function batch(events: readonly Event[], batchId = BATCH_ID): Event {
  return { batch_id: batchId, sent_at: OCCURRED_AT, events };
}

/** What was actually stored, which is the only honest way to say "nothing was". */
async function storedIds(account: string, source: string): Promise<readonly string[]> {
  const rows = await db.eventsForSource({ account, source, limit: 1000 });
  return rows.map((row) => row.event_id);
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

/* ================================================================= the cases */

describe("a batch that is entirely well formed is stored and reported in order", () => {
  it("answers one accepted result per submitted event, in submission order", async () => {
    const { source, token } = await activatedSource();
    const events = [event(), event(), event()];

    const response = batchResponse(await send(token, batch(events)));

    expect(response.batch_id).toBe(BATCH_ID);
    expect(response.received).toBe(3);
    expect(response.accepted).toBe(3);
    expect(response.duplicate).toBe(0);
    expect(response.rejected).toBe(0);
    expect(response.results.map((result) => result.event_id)).toEqual(
      events.map((one) => one["event_id"]),
    );
    for (const result of response.results) {
      expect(result.status).toBe("accepted");
      expect(result.code).toBeNull();
      expect(result.retryable).toBeNull();
      expect(result.detail).toBeNull();
    }

    expect([...(await storedIds(ACCOUNT, source))].sort()).toEqual(
      events.map((one) => one["event_id"] as string).sort(),
    );
  });

  it("marks the source ingestion verified, which a heartbeat alone never could", async () => {
    const { source, token } = await activatedSource();
    await send(token, batch([event()]));

    const rows = await db.sourceOperations({ account: ACCOUNT, project: null });
    const row = rows.find((candidate) => candidate.source_id === source);
    expect(row?.ingestion_verified_at).not.toBeNull();
  });
});

describe("a replayed batch is answered duplicate rather than stored twice", () => {
  it("accepts every event once and calls the identical resend duplicate", async () => {
    const { source, token } = await activatedSource();
    const events = [event(), event()];

    const first = batchResponse(await send(token, batch(events)));
    expect(first.accepted).toBe(2);

    const second = batchResponse(await send(token, batch(events)));
    expect(second.received).toBe(2);
    expect(second.accepted).toBe(0);
    expect(second.duplicate).toBe(2);
    expect(second.rejected).toBe(0);
    expect(second.results.map((result) => result.status)).toEqual(["duplicate", "duplicate"]);
    expect(second.results.map((result) => result.event_id)).toEqual(
      events.map((one) => one["event_id"]),
    );

    expect(await storedIds(ACCOUNT, source)).toHaveLength(2);
  });

  it("pairs a repeated id inside one batch by ordinal, not by searching for the id", async () => {
    /*
     * The case a search-by-event_id implementation gets wrong. A client that
     * retried inside one batch after an ambiguous send submits the same id
     * twice; the facade stores it once and answers `accepted` then `duplicate`.
     * A lookup by id finds the first match both times and would report two
     * accepteds, so the client would acknowledge one stored fact as two.
     */
    const { token } = await activatedSource();
    const twice = event();

    const response = batchResponse(await send(token, batch([twice, twice])));

    expect(response.results.map((result) => result.status)).toEqual(["accepted", "duplicate"]);
    expect(response.accepted).toBe(1);
    expect(response.duplicate).toBe(1);
  });
});

describe("one bad event never turns a processed batch into a refusal", () => {
  it("answers 200 and stores the good event when a neighbour is malformed", async () => {
    const { source, token } = await activatedSource();
    const good = event();
    /* `app` is required by the envelope, so removing it is a plugin bug per event. */
    const malformed = event();
    delete malformed["app"];

    const response = batchResponse(await send(token, batch([malformed, good])));

    expect(response.results[0]?.status).toBe("rejected");
    expect(response.results[0]?.code).toBe("malformed_event");
    expect(response.results[0]?.retryable).toBe(false);
    expect(response.results[1]?.status).toBe("accepted");
    expect(await storedIds(ACCOUNT, source)).toEqual([good["event_id"]]);
  });

  it("returns accepted, duplicate and rejected together, in the exact submitted order", async () => {
    const { source, token } = await activatedSource();

    /* Stored first, so that its resend below is a genuine replay. */
    const replayed = event();
    expect(batchResponse(await send(token, batch([replayed]))).accepted).toBe(1);

    const fresh = event();
    const futureVersion = event({ schema_version: 9 });
    const malformed = event();
    delete malformed["event_name"];
    const shadowedKey = event({ properties: { project_id: "irrelevant" } });

    const response = batchResponse(
      await send(token, batch([fresh, replayed, futureVersion, malformed, shadowedKey])),
    );

    expect(shapeOf(response)).toEqual([
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
      {
        event_id: shadowedKey["event_id"],
        status: "rejected",
        code: "reserved_property",
        retryable: false,
      },
    ]);

    expect(response.received).toBe(5);
    expect(response.accepted).toBe(1);
    expect(response.duplicate).toBe(1);
    expect(response.rejected).toBe(3);

    /* The counters are redundant with `results` on purpose; they must agree. */
    expect(response.accepted + response.duplicate + response.rejected).toBe(
      response.results.length,
    );

    /* Only the two events that reached the database are there. */
    expect([...(await storedIds(ACCOUNT, source))].sort()).toEqual(
      [replayed["event_id"] as string, fresh["event_id"] as string].sort(),
    );
  });
});

describe("the three ceilings are independent", () => {
  it("rejects an oversize event on its own while its neighbours are accepted", async () => {
    const { source, token } = await activatedSource();
    const before = event();
    /* One property past the 64 KiB per-event ceiling, and nothing else unusual. */
    const huge = event({
      properties: { note: "x".repeat(APPROVED_BACKEND_CEILINGS.maxEventBytes + 1_024) },
    });
    const after = event();

    const response = batchResponse(await send(token, batch([before, huge, after])));

    expect(shapeOf(response)).toEqual([
      { event_id: before["event_id"], status: "accepted", code: null, retryable: null },
      {
        event_id: huge["event_id"],
        status: "rejected",
        code: "event_too_large",
        retryable: false,
      },
      { event_id: after["event_id"], status: "accepted", code: null, retryable: null },
    ]);

    /* An event is never split, so the oversize one is quarantined and never stored. */
    expect([...(await storedIds(ACCOUNT, source))].sort()).toEqual(
      [before["event_id"] as string, after["event_id"] as string].sort(),
    );

    const detail = response.results[1]?.detail ?? "";
    expect(detail).toContain(String(APPROVED_BACKEND_CEILINGS.maxEventBytes));
    /* The ceiling is named; the payload that breached it is not. */
    expect(detail).not.toContain("xxxx");
  });

  it("refuses 201 events with 413 and stores none of them", async () => {
    const { source, token } = await activatedSource();
    const events = Array.from({ length: APPROVED_BACKEND_CEILINGS.maxBatchEvents + 1 }, () =>
      event(),
    );

    const answer = await send(token, batch(events));

    expect(answer.status).toBe(413);
    const body = failureBody(answer);
    expect(body.code).toBe("batch_too_large");
    expect(body.batch_id).toBe(BATCH_ID);
    expect(await storedIds(ACCOUNT, source)).toEqual([]);
  });

  it("accepts exactly 200 events, so the ceiling is a ceiling and not a fence", async () => {
    const { token } = await activatedSource();
    const events = Array.from({ length: APPROVED_BACKEND_CEILINGS.maxBatchEvents }, () => event());

    const response = batchResponse(await send(token, batch(events)));

    expect(response.received).toBe(APPROVED_BACKEND_CEILINGS.maxBatchEvents);
    expect(response.accepted).toBe(APPROVED_BACKEND_CEILINGS.maxBatchEvents);
  });

  it("refuses an oversize body before parsing it and before authenticating it", async () => {
    /*
     * Three properties in one case, and they only hold together as one.
     *
     * The body is past the 8 MiB ceiling, is not valid JSON, and carries no
     * credential. A handler that parsed first would answer `400
     * malformed_request`; one that authenticated first would answer `401`.
     * Getting `413` is the only outcome consistent with the ceiling running
     * before both — which is what stops a 100 MiB body costing a parse or a
     * database round trip.
     */
    const oversize = `[${"z".repeat(APPROVED_BACKEND_CEILINGS.maxBatchBytes + 1_024)}`;

    const answer = await send(null, oversize);

    expect(answer.status).toBe(413);
    expect(failureBody(answer).code).toBe("batch_too_large");
  });
});

describe("identity comes from the credential and from nowhere else", () => {
  it("cannot be redirected to another source by naming that source in the payload", async () => {
    const mine = await activatedSource();
    const theirs = await activatedSource(OTHER_ACCOUNT);

    const honest = event();
    /* The envelope is closed, so a top-level identity field is a per-event rejection. */
    const topLevel = event({ source_id: theirs.source });
    /* And `properties` refuses the reserved names, so a nested one is too. */
    const nested = event({ properties: { source_id: theirs.source } });

    const response = batchResponse(await send(mine.token, batch([honest, topLevel, nested])));

    expect(shapeOf(response)).toEqual([
      { event_id: honest["event_id"], status: "accepted", code: null, retryable: null },
      {
        event_id: topLevel["event_id"],
        status: "rejected",
        code: "malformed_event",
        retryable: false,
      },
      {
        event_id: nested["event_id"],
        status: "rejected",
        code: "reserved_property",
        retryable: false,
      },
    ]);

    /* The only event that was stored landed under the presenting source. */
    expect(await storedIds(ACCOUNT, mine.source)).toEqual([honest["event_id"]]);
    expect(await storedIds(OTHER_ACCOUNT, theirs.source)).toEqual([]);
  });

  it("stores the account and project the credential resolved to, not any the payload named", async () => {
    const { source, token } = await activatedSource();
    const only = event();
    await send(token, batch([only]));

    const rows = await db.eventsForSource({ account: ACCOUNT, source, limit: 1000 });
    expect(rows[0]?.account_id).toBe(ACCOUNT);
    expect(rows[0]?.app_environment).toBe("Development");
  });

  it("rejects a property shadowing an identity key without echoing the value", async () => {
    const { token } = await activatedSource();
    /*
     * A value that is unmistakable in a haystack. Nothing asserts what it *is* —
     * the whole point is that it must not appear anywhere in the answer, so it is
     * only ever searched for and never compared against.
     */
    const forbidden = "value-that-must-never-be-echoed-back-9f2c";
    const shadowing = event({ properties: { projectId: forbidden } });

    const answer = await send(token, batch([shadowing]));
    const response = batchResponse(answer);

    expect(response.results[0]?.code).toBe("reserved_property");
    /* The key is named, because that is what a plugin author has to fix. */
    expect(response.results[0]?.detail).toContain("projectId");
    /* The value is not, anywhere in the response — not in `detail`, not in a message. */
    expect(response.results[0]?.detail).not.toContain(forbidden);
    expect(answer.text).not.toContain(forbidden);
  });
});

describe("a request that cannot be trusted is refused before anything is stored", () => {
  it("refuses a request with no credential with 401 and stores nothing", async () => {
    const { source } = await activatedSource();

    const answer = await send(null, batch([event()]));

    expect(answer.status).toBe(401);
    expect(failureBody(answer).code).toBe("unauthorised");
    expect(await storedIds(ACCOUNT, source)).toEqual([]);
  });

  it("refuses an unparseable credential with the same 401, not a different one", async () => {
    const withCredential = await send(null, batch([event()]));
    const withGarbage = await send("not-a-token-at-all", batch([event()]));

    expect(withGarbage.status).toBe(401);
    /* Byte-identical: a difference in wording is as good an oracle as a difference in code. */
    expect(withGarbage.text).toBe(withCredential.text);
  });

  it("refuses a suspended source with 403 and stores nothing", async () => {
    const { source, token } = await activatedSource();
    expect(await db.sourceSetState({ account: ACCOUNT, source, state: "suspended" })).toBe(true);

    const answer = await send(token, batch([event()]));

    expect(answer.status).toBe(403);
    expect(failureBody(answer).code).toBe("source_suspended");
    expect(await storedIds(ACCOUNT, source)).toEqual([]);
  });

  it("authenticates before it counts, so an anonymous oversize batch is 401 and not 413", async () => {
    /*
     * The ordering that keeps the deployment's ceilings from being readable by
     * anybody who can reach the route: a `413` here would tell an unauthenticated
     * caller where the count ceiling sits.
     */
    const events = Array.from({ length: APPROVED_BACKEND_CEILINGS.maxBatchEvents + 1 }, () =>
      event(),
    );

    const answer = await send(null, batch(events));

    expect(answer.status).toBe(401);
  });

  it("refuses a body that is not JSON with 400 and no batch_id it could not read", async () => {
    const { token } = await activatedSource();

    const answer = await send(token, "{not json at all");

    expect(answer.status).toBe(400);
    const body = failureBody(answer);
    expect(body.code).toBe("malformed_request");
    expect(body.batch_id).toBeNull();
  });

  it("refuses a frame missing an event_id, because a result cannot address that event", async () => {
    const { token } = await activatedSource();
    const anonymous = event();
    delete anonymous["event_id"];

    const answer = await send(token, batch([anonymous]));

    expect(answer.status).toBe(400);
    const body = failureBody(answer);
    expect(body.code).toBe("malformed_request");
    /* Read from the payload, so a plugin log and a server log line up over the failure. */
    expect(body.batch_id).toBe(BATCH_ID);
  });

  it("refuses anything that is not a POST", async () => {
    const request = new Request(`https://observer.test${OBSERVER_ROUTES.ingest}`, {
      method: "GET",
    });
    const response = await handleIngest(request, deps());

    expect(response.status).toBe(400);
  });

  it("answers a rate-limit refusal with 429 and the Retry-After the hook asked for", async () => {
    const { source, token } = await activatedSource();

    const response = await handleIngest(
      post(token, JSON.stringify(batch([event()]))),
      deps({ rateLimit: () => Promise.resolve(30) }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    const body = RequestFailureBodySchema.parse(await response.json());
    expect(body.code).toBe("rate_limited");
    expect(body.retry_after_seconds).toBe(30);
    expect(await storedIds(ACCOUNT, source)).toEqual([]);
  });

  it("does not consult the rate-limit hook for a request that never authenticated", async () => {
    let consulted = 0;
    const response = await handleIngest(
      post(null, JSON.stringify(batch([event()]))),
      deps({
        rateLimit: () => {
          consulted += 1;
          return Promise.resolve(30);
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(consulted).toBe(0);
  });
});

describe("the response shape is the one the contract publishes", () => {
  it("processes an empty batch rather than treating it as a heartbeat", async () => {
    const { token } = await activatedSource();

    const response = batchResponse(await send(token, batch([])));

    expect(response.received).toBe(0);
    expect(response.results).toEqual([]);
    expect(response.accepted + response.duplicate + response.rejected).toBe(0);
  });

  it("never emits accepted_ids, duplicate_ids or rejected_ids in any answer", async () => {
    /*
     * The shape a naive implementation reaches for, and the one this contract
     * refuses: three id arrays cannot say which of two identical ids was
     * accepted, cannot carry a rejection code, and cannot preserve submission
     * order. `results` is the only per-event channel there is.
     *
     * Checked across every kind of answer the endpoint can give, on the raw text
     * rather than on the parsed object, so a field nested anywhere would still be
     * caught.
     */
    const { source, token } = await activatedSource();
    const stored = event();
    const malformed = event();
    delete malformed["app"];

    const answers = [
      await send(token, batch([stored])),
      await send(token, batch([stored, malformed])),
      await send(token, batch([])),
      await send(null, batch([event()])),
      await send(token, "{not json at all"),
      await send(
        token,
        batch(Array.from({ length: APPROVED_BACKEND_CEILINGS.maxBatchEvents + 1 }, () => event())),
      ),
    ];

    for (const answer of answers) {
      expect(answer.text).not.toContain("accepted_ids");
      expect(answer.text).not.toContain("duplicate_ids");
      expect(answer.text).not.toContain("rejected_ids");
    }

    expect(await storedIds(ACCOUNT, source)).toEqual([stored["event_id"]]);
  });
});
