import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { HeartbeatResponseSchema, OBSERVER_ROUTES } from "@observer/contracts/ue5";

import type { ObserverDb, SourceOperationsRow } from "../src/db";
import {
  classifyOperationalState,
  countsAsBusinessFact,
  handleHeartbeat,
  HEARTBEAT_MAX_BODY_BYTES,
} from "../src/heartbeat";
import type { HandlerDeps } from "../src/http";
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
 * THE HEARTBEAT ENDPOINT, AGAINST A REAL POSTGRES.
 *
 * ## Why the assertions are about rows and not about calls
 *
 * The claim this endpoint makes is not "the handler did not call `eventsAppend`"
 * — that is a claim about one file, provable with a spy, and true right up until
 * somebody adds a second write. The claim is that **a heartbeat produces no
 * analytics row**, and the only way to assert that is to count the rows in
 * `observer.analytics_events` on either side of one.
 *
 * The same reasoning runs through the rest of the file. "The registered
 * environment wins" is asserted by reading the source's environment back out of
 * the operator's read model after a heartbeat has tried to change it, not by
 * checking which fields were passed to a mock.
 *
 * ## Every secret here is minted, not written down
 *
 * The credentials come from `issueSourceToken`, so the tokens are real ones the
 * authentication boundary genuinely verifies, and nothing in this file contains
 * a literal that could be mistaken for one. The two peppers are obviously
 * synthetic English phrases padded to length; `describePepper` accepts them only
 * because `VITEST` is set, and refuses them on any deployment.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../../../supabase/migrations");

/*
 * Named rather than globbed, as the other database suites do, so that a
 * migration added later joins this fixture because somebody decided it should.
 * All five are needed: the spine creates the sources, the second credentials
 * them, the third is the `analytics_events` table this file counts rows in, the
 * fourth is the operational record a heartbeat writes, and the fifth corrects
 * the instant precision the port's `Instant` promises.
 */
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
  "20260902130000_observer_credential_resolve_precision.sql",
];

/**
 * The two peppers, obviously not secrets.
 *
 * `VITEST` is included in the object rather than left to `process.env`, because
 * `describePepper` reads the injected source and nothing else — which is the
 * property that stops a deployment inheriting a harness key by accident.
 */
const ENV: EnvSource = Object.freeze({
  VITEST: "1",
  OBSERVER_ACTIVATION_CODE_PEPPER: "activation-code-pepper-for-this-test-file-only",
  OBSERVER_SOURCE_TOKEN_PEPPER: "source-token-pepper-for-this-test-file-only-and-nothing-else",
});

/**
 * One instant, read once, and every timestamp in the file derived from it.
 *
 * The injected clock is what makes the backlog assertion exact: the queue below
 * reports its oldest pending event {@link BACKLOG_SECONDS} before this, so the
 * operational record must read exactly that. Against an uninjected clock the
 * assertion would have to be a range, and a range is how an off-by-one in the
 * derivation survives.
 *
 * It is taken from the real clock rather than written as a literal because the
 * *database's* clock is not injectable — `observer_activation_consume` compares
 * an activation code's expiry against `now()`. A literal instant would mint
 * codes that were already expired on any day but one, which is exactly how this
 * fixture failed the first time it ran.
 */
const NOW = new Date();

/** How far behind {@link NOW} the fixture's oldest queued event sits. */
const BACKLOG_SECONDS = 95;

const OLDEST_PENDING_AT = new Date(NOW.getTime() - BACKLOG_SECONDS * 1_000).toISOString();

type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let db: ObserverDb;
let deps: HandlerDeps;

const query: SqlQuery = (sql, params) => pg.query(sql, [...params]);

beforeAll(async () => {
  pg = await openDatabase("suite");
  /* The three Supabase roles the migrations revoke from; PGlite ships none. */
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const name of FILES) await pg.exec(readFileSync(join(MIGRATIONS, name), "utf8"));
  db = pgliteDb(query);
  deps = { db, env: ENV, now: () => NOW };
});

/* --- fixtures ------------------------------------------------------------------ */

let accounts = 0;

/** A fresh account per case, so no test can see another's sources. */
function nextAccount(): string {
  accounts += 1;
  return `acct_heartbeat_${String(accounts)}`;
}

interface Activated {
  readonly account: string;
  readonly projectId: string;
  readonly sourceId: string;
  /** The plaintext credential, which exists only for the life of this test. */
  readonly token: string;
}

/**
 * A source that has been through the real activation exchange.
 *
 * Not a row inserted by hand: the token below is the one
 * `observer_activation_consume` minted a verifier for, so a request carrying it
 * proves the whole path this endpoint sits behind rather than a fixture that
 * happens to look right.
 */
async function activatedSource(environment = "production"): Promise<Activated> {
  const account = nextAccount();
  const projectId = await db.projectCreate({
    account,
    name: `Project for ${account}`,
    slug: null,
  });
  const sourceId = await db.sourceCreate({
    account,
    project: projectId,
    type: "showroom_ue5",
    environment,
    label: "Showroom terminal",
  });

  const code = issueActivationCode(ENV);
  await db.activationIssue({
    account,
    source: sourceId,
    selector: code.selector,
    verifier: code.verifier,
    purpose: "activation",
    /* Compared against the database's own `now()`, which nothing here injects. */
    expiresAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
  });

  const credential = issueSourceToken(ENV);
  const consumed = await db.activationConsume({
    codeSelector: code.selector,
    codeVerifier: code.verifier,
    credentialSelector: credential.selector,
    credentialVerifier: credential.verifier,
    credentialExpiresAt: null,
  });
  if (consumed === null) throw new Error("the activation fixture did not mint a credential");

  return { account, projectId, sourceId, token: credential.plaintext };
}

/** A well-formed heartbeat. Overrides replace whole top-level members. */
function heartbeat(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sent_at: NOW.toISOString(),
    build: {
      app_version: "1.4.2",
      plugin_version: "0.3.0",
      build_id: "BUILD-2026-09-02",
      engine_version: "5.6",
    },
    queue: {
      pending_events: 3,
      oldest_pending_at: OLDEST_PENDING_AT,
      quarantined_events: 1,
      bytes_used: 4096,
      bytes_ceiling: 1_048_576,
      dropped_events: 2,
    },
    last_error: null,
    ...overrides,
  };
}

interface RequestOptions {
  readonly token?: string;
  readonly method?: string;
  readonly body?: string;
}

function heartbeatRequest(payload: unknown, options: RequestOptions = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token !== undefined) headers["authorization"] = `Bearer ${options.token}`;

  const method = options.method ?? "POST";
  return new Request(`https://observer.test${OBSERVER_ROUTES.heartbeat}`, {
    method,
    headers,
    /* A GET may not carry one, and undici refuses to construct a Request that does. */
    body: method === "POST" ? (options.body ?? JSON.stringify(payload)) : undefined,
  });
}

async function operationsOf(source: Activated): Promise<SourceOperationsRow> {
  const rows = await db.sourceOperations({ account: source.account, project: source.projectId });
  const row = rows.find((candidate) => candidate.source_id === source.sourceId);
  if (row === undefined) throw new Error("the source is missing from its own read model");
  return row;
}

async function analyticsEventCount(): Promise<number> {
  const result = await pg.query<{ readonly n: number }>(
    "select count(*)::int as n from observer.analytics_events",
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("count(*) returned no row, which it cannot do");
  return row.n;
}

/* --- the happy path -------------------------------------------------------------- */

describe("a heartbeat from an activated source", () => {
  it("answers with the contract's response and the server's own clock", async () => {
    const source = await activatedSource();

    const response = await handleHeartbeat(
      heartbeatRequest(heartbeat(), { token: source.token }),
      deps,
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(HeartbeatResponseSchema.parse(body)).toEqual({
      status: "ok",
      server_time: NOW.toISOString(),
      /*
       * Nothing in this milestone versions client configuration, so there is no
       * fact that could make this true. Asserted rather than ignored, because a
       * plugin that re-runs discovery on every heartbeat is a support call.
       */
      config_stale: false,
    });
  });

  it("records the outbox health an operator triages on", async () => {
    const source = await activatedSource();

    await handleHeartbeat(heartbeatRequest(heartbeat(), { token: source.token }), deps);

    const row = await operationsOf(source);
    expect(row.last_heartbeat_at).not.toBeNull();
    expect(row.queue_event_count).toBe(3);
    expect(row.queue_bytes_used).toBe(4096);
    expect(row.queue_bytes_ceiling).toBe(1_048_576);
    expect(row.quarantine_count).toBe(1);
    /* `dropped_events` on the wire is a capacity refusal in the read model. */
    expect(row.capacity_refusal_count).toBe(2);
    expect(row.observed_app_version).toBe("1.4.2");
    expect(row.observed_plugin).toBe("0.3.0");
    expect(row.observed_build_id).toBe("BUILD-2026-09-02");
    expect(row.observed_engine).toBe("5.6");
  });

  it("derives the backlog age from the server's clock rather than the client's", async () => {
    const source = await activatedSource();

    await handleHeartbeat(heartbeatRequest(heartbeat(), { token: source.token }), deps);

    /* 11:58:30 reported, 12:00:05 on the server. */
    expect((await operationsOf(source)).oldest_pending_age_seconds).toBe(95);
  });

  it("reports a drained queue as no backlog rather than as an unmeasured one", async () => {
    const source = await activatedSource();
    const full = heartbeat();
    await handleHeartbeat(heartbeatRequest(full, { token: source.token }), deps);

    const drained = heartbeat({
      queue: {
        pending_events: 0,
        oldest_pending_at: null,
        quarantined_events: 1,
        bytes_used: 0,
        bytes_ceiling: 1_048_576,
        dropped_events: 2,
      },
    });
    await handleHeartbeat(heartbeatRequest(drained, { token: source.token }), deps);

    /*
     * The bug this guards: the facade reads a null as "could not measure" and
     * keeps the previous value, so forwarding the client's null would leave a
     * ninety-five-second backlog frozen beside a queue reporting nothing
     * pending.
     */
    const row = await operationsOf(source);
    expect(row.queue_event_count).toBe(0);
    expect(row.oldest_pending_age_seconds).toBe(0);
  });

  it("creates no analytics event row", async () => {
    const source = await activatedSource();

    const before = await analyticsEventCount();
    const response = await handleHeartbeat(
      heartbeatRequest(heartbeat(), { token: source.token }),
      deps,
    );
    const after = await analyticsEventCount();

    expect(response.status).toBe(200);
    /*
     * The whole reason liveness has its own endpoint. A heartbeat that landed in
     * `analytics_events` would put queue depth in the event store, where every
     * read model in the product would have to remember to exclude it for ever.
     */
    expect(after).toBe(before);
  });

  it("does not mark the source ingestion-verified, because nothing was stored", async () => {
    const source = await activatedSource();

    await handleHeartbeat(heartbeatRequest(heartbeat(), { token: source.token }), deps);

    expect((await operationsOf(source)).ingestion_verified_at).toBeNull();
  });
});

/* --- the method, the ceiling, and the shape ------------------------------------ */

describe("what the heartbeat endpoint refuses before it looks at a credential", () => {
  it("accepts POST only", async () => {
    const source = await activatedSource();

    const response = await handleHeartbeat(
      heartbeatRequest(null, { token: source.token, method: "GET" }),
      deps,
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { readonly code: string }).code).toBe("malformed_request");
    expect((await operationsOf(source)).last_heartbeat_at).toBeNull();
  });

  it("refuses a body over the heartbeat ceiling without echoing any of it", async () => {
    const source = await activatedSource();
    const blob = "P".repeat(HEARTBEAT_MAX_BODY_BYTES * 2);

    const response = await handleHeartbeat(
      heartbeatRequest(null, {
        token: source.token,
        body: JSON.stringify({ ...heartbeat(), diagnostics_blob: blob }),
      }),
      deps,
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly code: string; readonly message: string };
    expect(body.code).toBe("malformed_request");
    expect(body.message).not.toContain(blob);
    expect((await operationsOf(source)).last_heartbeat_at).toBeNull();
  });

  it("refuses a body that is not JSON", async () => {
    const source = await activatedSource();

    const response = await handleHeartbeat(
      heartbeatRequest(null, { token: source.token, body: "{not json at all" }),
      deps,
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { readonly code: string }).code).toBe("malformed_request");
  });

  it("names the field a payload broke and never the value it carried", async () => {
    const source = await activatedSource();
    const rejected = "not-an-instant-and-possibly-a-visitor-name";

    const response = await handleHeartbeat(
      heartbeatRequest(heartbeat({ sent_at: rejected }), { token: source.token }),
      deps,
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly message: string };
    expect(body.message).toContain("sent_at");
    expect(body.message).not.toContain(rejected);
  });
});

/* --- no free text may be persisted --------------------------------------------- */

describe("a payload carrying free text", () => {
  it("is refused outright when the text arrives under an unknown key", async () => {
    const source = await activatedSource();
    const stackTrace = "Assertion failed in AShowroomActor::Tick at Showroom.cpp:412";

    const response = await handleHeartbeat(
      heartbeatRequest(heartbeat({ stack_trace: stackTrace }), { token: source.token }),
      deps,
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly message: string };
    expect(body.message).not.toContain(stackTrace);
    /* Refused before the credential was even read, so nothing was written. */
    expect((await operationsOf(source)).last_heartbeat_at).toBeNull();
  });

  it("is refused when an arbitrary blob is nested inside a known member", async () => {
    const source = await activatedSource();

    const response = await handleHeartbeat(
      heartbeatRequest(
        heartbeat({
          queue: {
            pending_events: 0,
            oldest_pending_at: null,
            quarantined_events: 0,
            bytes_used: 0,
            bytes_ceiling: null,
            dropped_events: 0,
            last_exception: { message: "std::bad_alloc", frames: ["a", "b"] },
          },
        }),
        { token: source.token },
      ),
      deps,
    );

    expect(response.status).toBe(400);
    expect((await operationsOf(source)).last_heartbeat_at).toBeNull();
  });

  it("stores no error code at all when the code offered is a sentence", async () => {
    const source = await activatedSource();
    const sentence = "Fatal error while flushing outbox";

    const response = await handleHeartbeat(
      heartbeatRequest(heartbeat({ last_error: { code: sentence, at: OLDEST_PENDING_AT } }), {
        token: source.token,
      }),
      deps,
    );

    /*
     * The schema cannot tell a long code from a short message, so this one gets
     * through it. The column's own allow-list admits no whitespace, which is why
     * the heartbeat succeeds and the sentence is simply absent — the operational
     * record holds codes, and a record that quietly held prose would be the most
     * likely place in this protocol for a buyer's name to end up.
     */
    expect(response.status).toBe(200);
    const row = await operationsOf(source);
    expect(row.last_heartbeat_at).not.toBeNull();
    expect(row.last_error_code).toBeNull();
  });

  it("stores a code-shaped error code", async () => {
    const source = await activatedSource();

    await handleHeartbeat(
      heartbeatRequest(
        heartbeat({ last_error: { code: "storage_error", at: OLDEST_PENDING_AT } }),
        { token: source.token },
      ),
      deps,
    );

    expect((await operationsOf(source)).last_error_code).toBe("storage_error");
  });
});

/* --- the environment ------------------------------------------------------------ */

describe("the registered environment", () => {
  it("survives a heartbeat, while a recorded mismatch stays visible", async () => {
    const source = await activatedSource("staging");

    /*
     * The provenance a mismatch is surfaced from, written the way activation
     * writes it: through the port, as a reported value, into
     * `observed_environment`. The handler is deliberately not the thing that
     * puts it there — a heartbeat has nowhere to report an environment.
     */
    await db.heartbeatRecord({
      source: source.sourceId,
      facts: { reported_environment: "production" },
    });

    const response = await handleHeartbeat(
      heartbeatRequest(heartbeat(), { token: source.token }),
      deps,
    );
    expect(response.status).toBe(200);

    const row = await operationsOf(source);
    /* The heartbeat did write — so the assertions below are about a live row. */
    expect(row.observed_app_version).toBe("1.4.2");
    /* Authoritative, and untouched. */
    expect(row.environment).toBe("staging");
    /* Surfaced, and neither applied nor cleared. */
    expect(row.observed_environment).toBe("production");
    expect(row.environment_mismatch).toBe(true);
  });

  it("cannot be changed by a heartbeat that tries to declare one", async () => {
    const source = await activatedSource("staging");

    for (const payload of [
      heartbeat({ environment: "production" }),
      heartbeat({
        build: {
          app_version: "1.4.2",
          plugin_version: "0.3.0",
          build_id: "BUILD-2026-09-02",
          engine_version: "5.6",
          environment: "production",
        },
      }),
    ]) {
      const response = await handleHeartbeat(
        heartbeatRequest(payload, { token: source.token }),
        deps,
      );
      expect(response.status).toBe(400);
    }

    const row = await operationsOf(source);
    expect(row.environment).toBe("staging");
    expect(row.observed_environment).toBeNull();
    expect(row.environment_mismatch).toBe(false);
  });
});

/* --- the credential ------------------------------------------------------------- */

describe("the credential the heartbeat endpoint demands", () => {
  it("refuses a request with no Authorization header with 401", async () => {
    const response = await handleHeartbeat(heartbeatRequest(heartbeat()), deps);

    expect(response.status).toBe(401);
    expect(((await response.json()) as { readonly code: string }).code).toBe("unauthorised");
  });

  it("refuses a token nobody issued with 401 and writes nothing", async () => {
    const source = await activatedSource();
    const stranger = issueSourceToken(ENV);

    const response = await handleHeartbeat(
      heartbeatRequest(heartbeat(), { token: stranger.plaintext }),
      deps,
    );

    expect(response.status).toBe(401);
    expect((await operationsOf(source)).last_heartbeat_at).toBeNull();
  });

  it("refuses a valid credential on a suspended source with 403", async () => {
    const source = await activatedSource();
    expect(
      await db.sourceSetState({
        account: source.account,
        source: source.sourceId,
        state: "suspended",
      }),
    ).toBe(true);

    const response = await handleHeartbeat(
      heartbeatRequest(heartbeat(), { token: source.token }),
      deps,
    );

    /*
     * 403 and 401 must never be collapsed: a suspended source is resumed by an
     * operator, a refused credential is reactivated, and one message for both
     * sends them down the wrong path.
     */
    expect(response.status).toBe(403);
    expect(((await response.json()) as { readonly code: string }).code).toBe("source_suspended");
    expect((await operationsOf(source)).last_heartbeat_at).toBeNull();
  });
});

/* --- Connected and Ingestion Verified ------------------------------------------- */

/**
 * THE FOUR COMBINATIONS, EACH AS ITS OWN CASE.
 *
 * They are enumerated rather than sampled because the whole claim is that the
 * two facts are independent, and independence is exactly what a matrix with a
 * missing corner cannot show. The two interesting corners are the off-diagonal
 * ones: a freshly activated source that beats but has never stored an event, and
 * a properly commissioned source that has gone silent.
 */
describe("classifying a source's operational state", () => {
  it("is neither connected nor ingestion-verified before anything has happened", async () => {
    const source = await activatedSource();

    expect(classifyOperationalState(await operationsOf(source))).toEqual({
      connected: false,
      ingestionVerified: false,
    });
  });

  it("is connected and not ingestion-verified after a heartbeat alone", async () => {
    const source = await activatedSource();

    await handleHeartbeat(heartbeatRequest(heartbeat(), { token: source.token }), deps);

    /*
     * The state every source is in between activation and its first stored
     * event. A single ordered status would have to call this either "connected"
     * or "verified", and both readings mislead the operator commissioning it.
     */
    expect(classifyOperationalState(await operationsOf(source))).toEqual({
      connected: true,
      ingestionVerified: false,
    });
  });

  it("is ingestion-verified and not connected when a commissioned source goes silent", async () => {
    const source = await activatedSource();

    await db.ingestionVerified({ source: source.sourceId });

    /*
     * The corner a collapsed status reports as the better of the two facts,
     * which is precisely backwards: this is the source worth a phone call.
     */
    expect(classifyOperationalState(await operationsOf(source))).toEqual({
      connected: false,
      ingestionVerified: true,
    });
  });

  it("is both once a heartbeat and a stored event have each happened", async () => {
    const source = await activatedSource();

    await handleHeartbeat(heartbeatRequest(heartbeat(), { token: source.token }), deps);
    await db.ingestionVerified({ source: source.sourceId });

    expect(classifyOperationalState(await operationsOf(source))).toEqual({
      connected: true,
      ingestionVerified: true,
    });
  });
});

/* --- diagnostics are not business facts ----------------------------------------- */

describe("telling a diagnostic from a business fact", () => {
  it("does not count the reserved diagnostic event as a business fact", () => {
    expect(countsAsBusinessFact("diagnostic.test")).toBe(false);
  });

  it("counts a plausible business event name as a business fact", () => {
    expect(countsAsBusinessFact("unit.viewed")).toBe(true);
  });

  it("excludes the whole reserved namespace, not one name", () => {
    /*
     * The namespace is the rule. A predicate that matched `diagnostic.test`
     * alone would let the second diagnostic anybody adds into every metric.
     */
    expect(countsAsBusinessFact("diagnostic.connectivity_probe")).toBe(false);
  });

  it("is a filter a read model can apply directly", () => {
    const names = ["unit.viewed", "diagnostic.test", "brochure.downloaded"];
    expect(names.filter(countsAsBusinessFact)).toEqual(["unit.viewed", "brochure.downloaded"]);
  });
});
