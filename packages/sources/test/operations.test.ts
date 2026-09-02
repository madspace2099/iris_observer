import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { HeartbeatFacts, ObserverDb } from "../src/db";
import {
  observerOperations,
  queuePercentUsed,
  QUEUE_PRESSURE_AGE_SECONDS,
  QUEUE_PRESSURE_PERCENT,
  type ObserverOperations,
  type SourceOperationsView,
} from "../src/operations";
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
 * THE OPERATIONS READ MODEL, against a real Postgres.
 *
 * ## Why this boots a database rather than handing `toOperationsView` fixtures
 *
 * Almost every guarantee below is a property of the *pair* — the facade and the
 * view it feeds — and a hand-written `SourceOperationsRow` can be made to agree
 * with whatever the view currently does. Three cases make the point.
 *
 * `connected` is null-vs-not on a column only `observer_heartbeat_record`
 * writes, so a fixture asserting "no heartbeat means null" is asserting the
 * test author's belief about the migration. A queue that reported bytes and no
 * ceiling is a `coalesce` inside an upsert, not a shape somebody types. And the
 * account boundary is one predicate in one `where` clause; a stub cannot fail it
 * and therefore cannot prove it holds.
 *
 * So every case drives the real port, through the real adapter, against the
 * real migrations. The one exception is {@link queuePercentUsed}'s negative
 * ceiling, which is unreachable through the database — the column's own check
 * constraint forbids it — and is exercised directly, where it is the guard for
 * a future writer that is not the heartbeat.
 *
 * ## Every secret here is obviously synthetic
 *
 * The peppers are English sentences with hyphens in them: the right length and
 * the wrong shape, so nothing in this file could be mistaken for a real value.
 * The one credential this suite mints exists to be searched for in a serialised
 * view and asserted absent — never compared against, and never printed.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../../../supabase/migrations");

/*
 * Named rather than globbed, so a migration added later joins this fixture by
 * somebody's decision. All six are load-bearing here: the spine holds the
 * identity columns the view reads, the second mints the credential the leak
 * case searches for, the third is the event store the fourth's
 * `ingestion_verified_at` refers to, the fourth is this suite's subject, and
 * the last two carry the millisecond instants the view passes through.
 */
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
  "20260902130000_observer_credential_resolve_precision.sql",
];

const ACCOUNT_A = "acct_northgate";
const ACCOUNT_B = "acct_riverside";

/** Two peppers, distinct and unmistakably not secrets, as `assertDistinctPeppers` requires. */
const PEPPERS: EnvSource = Object.freeze({
  OBSERVER_ACTIVATION_CODE_PEPPER: "synthetic-activation-pepper-for-the-operations-suite-only",
  OBSERVER_SOURCE_TOKEN_PEPPER: "synthetic-source-token-pepper-for-the-operations-suite-only",
});

type Database = Awaited<ReturnType<typeof openDatabase>>;

let pg: Database;
let db: ObserverDb;
let operations: ObserverOperations;

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
  operations = observerOperations({ db });
});

/* --- the fixture ------------------------------------------------------------------ */

let sourcesMade = 0;

interface Registered {
  readonly project: string;
  readonly source: string;
}

/**
 * A fresh project and source per case, so one test's heartbeat can never explain
 * another's classification.
 *
 * Registered `production` throughout, because the environment this suite cares
 * about is the *mismatch*, and a fixture whose registered value varied would
 * make the mismatch cases depend on which source they got.
 */
async function register(account = ACCOUNT_A): Promise<Registered> {
  sourcesMade += 1;
  const label = `showroom ${String(sourcesMade)}`;
  const project = await db.projectCreate({ account, name: `P ${label}`, slug: null });
  const source = await db.sourceCreate({
    account,
    project,
    type: "showroom_ue5",
    environment: "production",
    label,
  });
  return { project, source };
}

/** A heartbeat, straight at the port — the write path an operator's screen reads back. */
async function beat(source: string, facts: HeartbeatFacts = {}): Promise<void> {
  expect(await db.heartbeatRecord({ source, facts })).toBe(true);
}

/** The mark the ingestion path sets once an event has survived the whole path. */
async function verifyIngestion(source: string): Promise<void> {
  expect(await db.ingestionVerified({ source })).toBe(true);
}

/** The one view under test, found by id rather than by position. */
async function viewOf(
  source: string,
  account = ACCOUNT_A,
  project: string | null = null,
): Promise<SourceOperationsView> {
  const views = await operations.list({ account, project });
  const found = views.find((candidate) => candidate.sourceId === source);
  if (found === undefined) throw new Error("the source under test was absent from the read model");
  return found;
}

/* ================================================================== the cases */

describe("connected and ingestion verified are independent facts", () => {
  it("reports neither for a source that has been registered and has done nothing", async () => {
    const { source } = await register();

    const view = await viewOf(source);

    expect(view.connected).toBe(false);
    expect(view.ingestionVerified).toBe(false);
    expect(view.lastHeartbeatAt).toBeNull();
    expect(view.ingestionVerifiedAt).toBeNull();
  });

  it("reports connected and not verified for a source that only ever heartbeats", async () => {
    const { source } = await register();
    await beat(source);

    const view = await viewOf(source);

    expect(view.connected).toBe(true);
    expect(view.ingestionVerified).toBe(false);
    expect(view.lastHeartbeatAt).not.toBeNull();
    expect(view.ingestionVerifiedAt).toBeNull();
  });

  it("reports verified and not connected for a source that ingested and never beat", async () => {
    /*
     * The combination a single "online" flag cannot express, and it is not
     * hypothetical: the ingestion path calls `observer_ingestion_verified` on
     * every accepted batch, and a plugin build that sends events but has its
     * heartbeat timer misconfigured produces exactly this row. A view that
     * derived `ingestionVerified` from `connected` would report it as silent.
     */
    const { source } = await register();
    await verifyIngestion(source);

    const view = await viewOf(source);

    expect(view.connected).toBe(false);
    expect(view.ingestionVerified).toBe(true);
    expect(view.lastHeartbeatAt).toBeNull();
    expect(view.ingestionVerifiedAt).not.toBeNull();
  });

  it("reports both for a source that has beaten and ingested", async () => {
    const { source } = await register();
    await beat(source);
    await verifyIngestion(source);

    const view = await viewOf(source);

    expect(view.connected).toBe(true);
    expect(view.ingestionVerified).toBe(true);
    expect(view.lastHeartbeatAt).not.toBeNull();
    expect(view.ingestionVerifiedAt).not.toBeNull();
  });
});

describe("the queue percentage is a measurement or it is absent", () => {
  it("computes the fill when both the usage and the ceiling were measured", async () => {
    const { source } = await register();
    await beat(source, { queue_bytes_used: 4096, queue_bytes_ceiling: 10240 });

    const view = await viewOf(source);

    expect(view.queue.bytesUsed).toBe(4096);
    expect(view.queue.bytesCeiling).toBe(10240);
    expect(view.queue.percentUsed).toBe(40);
  });

  it("reports a fill above one hundred rather than clamping it", async () => {
    /*
     * A client that has written past its own ceiling is reporting the one
     * condition that says the ceiling is not being enforced, and clamping to
     * 100 would hide it behind every other full queue on the screen.
     */
    const { source } = await register();
    await beat(source, { queue_bytes_used: 15_000, queue_bytes_ceiling: 10_000 });

    expect((await viewOf(source)).queue.percentUsed).toBe(150);
  });

  it("is absent, and not zero or infinite, when the ceiling is zero", async () => {
    const { source } = await register();
    await beat(source, { queue_bytes_used: 0, queue_bytes_ceiling: 0 });

    const view = await viewOf(source);

    /* The measurements themselves survive — it is only the ratio that cannot exist. */
    expect(view.queue.bytesUsed).toBe(0);
    expect(view.queue.bytesCeiling).toBe(0);
    expect(view.queue.percentUsed).toBeNull();
  });

  it("is absent when the client reported a usage and no ceiling", async () => {
    const { source } = await register();
    await beat(source, { queue_bytes_used: 4096 });

    const view = await viewOf(source);

    expect(view.queue.bytesUsed).toBe(4096);
    expect(view.queue.bytesCeiling).toBeNull();
    expect(view.queue.percentUsed).toBeNull();
  });

  it("is absent when the client reported a ceiling and could not measure its usage", async () => {
    /*
     * The case a naive `used ?? 0` gets exactly backwards: an outbox nobody
     * could size would render as 0% — the most reassuring number on the screen
     * — for a plugin that has lost the ability to measure itself.
     */
    const { source } = await register();
    await beat(source, { queue_bytes_ceiling: 10240 });

    const view = await viewOf(source);

    expect(view.queue.bytesUsed).toBeNull();
    expect(view.queue.bytesCeiling).toBe(10240);
    expect(view.queue.percentUsed).toBeNull();
  });

  it("refuses a negative ceiling that only a writer other than the heartbeat could store", async () => {
    /*
     * Unreachable through the database — `source_operations_counts_non_negative`
     * forbids it and `observer.heartbeat_count` floors at zero before that — so
     * this is asserted on the function directly. It exists because the guard is
     * `<= 0` rather than `=== 0`, and without the case nothing would say why.
     */
    expect(queuePercentUsed(100, -1)).toBeNull();
    expect(queuePercentUsed(null, null)).toBeNull();
  });
});

describe("the health ladder classifies every source, and its order is the design", () => {
  it("calls a registered source that has never phoned home never_connected", async () => {
    const { source } = await register();

    expect((await viewOf(source)).health).toBe("never_connected");
  });

  it("calls a source that beats and has never ingested connected_not_verified", async () => {
    const { source } = await register();
    await beat(source);

    expect((await viewOf(source)).health).toBe("connected_not_verified");
  });

  it("calls a connected, verified source with a quiet queue healthy", async () => {
    const { source } = await register();
    await beat(source, {
      queue_event_count: 3,
      queue_bytes_used: 1024,
      queue_bytes_ceiling: 52_428_800,
      oldest_pending_age_seconds: 4,
      quarantine_count: 0,
      validation_failure_count: 0,
      capacity_refusal_count: 0,
      backend_quarantine_count: 0,
    });
    await verifyIngestion(source);

    expect((await viewOf(source)).health).toBe("healthy");
  });

  it("calls a nearly full outbox queue_pressure", async () => {
    const { source } = await register();
    await beat(source, { queue_bytes_used: 9_000, queue_bytes_ceiling: 10_000 });
    await verifyIngestion(source);

    const view = await viewOf(source);

    expect(view.queue.percentUsed).toBe(90);
    expect(view.health).toBe("queue_pressure");
  });

  it("treats the pressure threshold as a ceiling and not a fence", async () => {
    const at = await register();
    await beat(at.source, { queue_bytes_used: 8_000, queue_bytes_ceiling: 10_000 });
    await verifyIngestion(at.source);

    const below = await register();
    await beat(below.source, { queue_bytes_used: 7_900, queue_bytes_ceiling: 10_000 });
    await verifyIngestion(below.source);

    expect((await viewOf(at.source)).queue.percentUsed).toBe(QUEUE_PRESSURE_PERCENT);
    expect((await viewOf(at.source)).health).toBe("queue_pressure");
    expect((await viewOf(below.source)).health).toBe("healthy");
  });

  it("calls a stale queue head queue_pressure even when no bytes were measured", async () => {
    /*
     * The trigger that survives a plugin which cannot size its outbox. With the
     * client's five-second default flush, an hour-old head has watched some
     * seven hundred flushes fail to take it.
     */
    const { source } = await register();
    await beat(source, { oldest_pending_age_seconds: QUEUE_PRESSURE_AGE_SECONDS });
    await verifyIngestion(source);

    const view = await viewOf(source);

    expect(view.queue.percentUsed).toBeNull();
    expect(view.health).toBe("queue_pressure");
  });

  it("does not read an unmeasured queue as a pressured one", async () => {
    const { source } = await register();
    await beat(source);
    await verifyIngestion(source);

    const view = await viewOf(source);

    expect(view.queue.percentUsed).toBeNull();
    expect(view.queue.oldestPendingAgeSeconds).toBeNull();
    expect(view.health).toBe("healthy");
  });

  it("calls a source that has discarded events quarantining", async () => {
    const { source } = await register();
    await beat(source, { quarantine_count: 1 });
    await verifyIngestion(source);

    expect((await viewOf(source)).health).toBe("quarantining");
  });

  it("counts a backend quarantine, a validation failure and a capacity refusal the same way", async () => {
    /*
     * Four counters, one rung. The difference between them is something an
     * operator reads off the fields; every one of them is a visitor who did
     * something in a showroom that nobody will ever see.
     */
    const cases: readonly (readonly [string, HeartbeatFacts])[] = [
      ["a backend quarantine", { backend_quarantine_count: 2 }],
      ["a validation failure", { validation_failure_count: 2 }],
      ["a capacity refusal", { capacity_refusal_count: 2 }],
    ];

    for (const [what, facts] of cases) {
      const { source } = await register();
      await beat(source, facts);
      await verifyIngestion(source);
      expect((await viewOf(source)).health, what).toBe("quarantining");
    }
  });

  it("does not call a source that has discarded nothing quarantining", async () => {
    const { source } = await register();
    await beat(source, {
      quarantine_count: 0,
      validation_failure_count: 0,
      capacity_refusal_count: 0,
      backend_quarantine_count: 0,
    });
    await verifyIngestion(source);

    expect((await viewOf(source)).health).toBe("healthy");
  });

  it("calls a suspended source suspended", async () => {
    const { source } = await register();
    await beat(source);
    await verifyIngestion(source);
    expect(await db.sourceSetState({ account: ACCOUNT_A, source, state: "suspended" })).toBe(true);

    expect((await viewOf(source)).health).toBe("suspended");
  });

  it("calls an archived source archived", async () => {
    const { source } = await register();
    await beat(source);
    await verifyIngestion(source);
    expect(await db.sourceSetState({ account: ACCOUNT_A, source, state: "archived" })).toBe(true);

    expect((await viewOf(source)).health).toBe("archived");
  });
});

describe("the ladder's precedence is what makes a classification actionable", () => {
  it("calls a suspended source with a full, quarantining queue suspended", async () => {
    /*
     * THE CASE THE LADDER EXISTS FOR. The queue is full because an operator
     * suspended the source, so reporting queue pressure would hand them the
     * consequence of their own decision as a new problem — and the action that
     * label suggests is not the action that fixes it.
     */
    const { source } = await register();
    await beat(source, {
      queue_bytes_used: 10_000,
      queue_bytes_ceiling: 10_000,
      quarantine_count: 44,
      oldest_pending_age_seconds: 90_000,
    });
    await verifyIngestion(source);
    expect(await db.sourceSetState({ account: ACCOUNT_A, source, state: "suspended" })).toBe(true);

    const view = await viewOf(source);

    /* The facts are all still on the row; only the classification is decided. */
    expect(view.queue.percentUsed).toBe(100);
    expect(view.queue.quarantineCount).toBe(44);
    expect(view.health).toBe("suspended");
  });

  it("calls an archived source archived even though it was suspended and quarantining first", async () => {
    const { source } = await register();
    await beat(source, { quarantine_count: 7, queue_bytes_used: 99, queue_bytes_ceiling: 100 });
    await verifyIngestion(source);
    expect(await db.sourceSetState({ account: ACCOUNT_A, source, state: "suspended" })).toBe(true);
    expect(await db.sourceSetState({ account: ACCOUNT_A, source, state: "archived" })).toBe(true);

    expect((await viewOf(source)).health).toBe("archived");
  });

  it("calls a suspended source that never connected suspended, not never_connected", async () => {
    const { source } = await register();
    expect(await db.sourceSetState({ account: ACCOUNT_A, source, state: "suspended" })).toBe(true);

    const view = await viewOf(source);

    expect(view.connected).toBe(false);
    expect(view.health).toBe("suspended");
  });

  it("calls a connected source that never ingested connected_not_verified, whatever its queue says", async () => {
    /*
     * A backlog that will never drain is not a backlog. Whatever is stopping
     * the first event will stop the rest, so "queue pressure" — which invites
     * an operator to wait — would be the wrong instruction.
     */
    const { source } = await register();
    await beat(source, {
      queue_bytes_used: 10_000,
      queue_bytes_ceiling: 10_000,
      quarantine_count: 12,
      oldest_pending_age_seconds: 86_400,
    });

    const view = await viewOf(source);

    expect(view.ingestionVerified).toBe(false);
    expect(view.health).toBe("connected_not_verified");
  });

  it("calls a full, quarantining queue quarantining, because loss outranks risk", async () => {
    const { source } = await register();
    await beat(source, {
      queue_bytes_used: 9_900,
      queue_bytes_ceiling: 10_000,
      quarantine_count: 3,
    });
    await verifyIngestion(source);

    const view = await viewOf(source);

    expect(view.queue.percentUsed).toBe(99);
    expect(view.health).toBe("quarantining");
  });
});

describe("a source that has never sent anything is present, with nulls", () => {
  it("shows a registered showroom that has never phoned home rather than omitting it", async () => {
    /*
     * The sources an operator most needs are the ones that have never worked: a
     * package shipped with no activation code, or one nobody pasted. An inner
     * join would make those the exact rows the screen leaves out, and the
     * estate would look complete.
     */
    const { project, source } = await register();

    const view = await viewOf(source, ACCOUNT_A, project);

    expect(view.sourceId).toBe(source);
    expect(view.projectId).toBe(project);
    expect(view.state).toBe("active");
    expect(view.environment).toBe("production");
    expect(view.connected).toBe(false);
    expect(view.ingestionVerified).toBe(false);
    expect(view.health).toBe("never_connected");

    /* Nothing was ever measured, and nothing is invented to stand in for it. */
    expect(view.lastSeenAt).toBeNull();
    expect(view.lastHeartbeatAt).toBeNull();
    expect(view.ingestionVerifiedAt).toBeNull();
    expect(view.observed).toEqual({
      appVersion: null,
      plugin: null,
      buildId: null,
      engine: null,
      environment: null,
    });
    expect(view.queue).toEqual({
      eventCount: null,
      bytesUsed: null,
      bytesCeiling: null,
      percentUsed: null,
      oldestPendingAgeSeconds: null,
      quarantineCount: null,
      validationFailureCount: null,
      capacityRefusalCount: null,
      backendQuarantineCount: null,
      lastErrorCode: null,
    });

    /*
     * A source that has never reported an environment is silent, not mismatched
     * — false rather than null, so no caller has to decide what a null flag
     * would mean.
     */
    expect(view.environmentMismatch).toBe(false);
  });
});

describe("provenance is carried, and never mistaken for the registered fact", () => {
  it("passes the observed versions through and flags a reported environment that disagrees", async () => {
    const { source } = await register();
    await beat(source, {
      app_version: "1.4.0",
      plugin_version: "0.9.2",
      build_id: "build-synthetic-0001",
      engine_version: "5.4.4",
      reported_environment: "Development",
      last_error_code: "BACKEND_5XX",
    });

    const view = await viewOf(source);

    expect(view.observed).toEqual({
      appVersion: "1.4.0",
      plugin: "0.9.2",
      buildId: "build-synthetic-0001",
      engine: "5.4.4",
      environment: "Development",
    });
    /* The registered value is untouched by anything the client said. */
    expect(view.environment).toBe("production");
    expect(view.environmentMismatch).toBe(true);
    expect(view.queue.lastErrorCode).toBe("BACKEND_5XX");
  });

  it("does not flag a mismatch when the client reports the environment it was registered as", async () => {
    const { source } = await register();
    await beat(source, { reported_environment: "production" });

    const view = await viewOf(source);

    expect(view.observed.environment).toBe("production");
    expect(view.environmentMismatch).toBe(false);
  });
});

describe("the account is the boundary, and the project only narrows within it", () => {
  it("never shows account A's sources to account B, or the reverse", async () => {
    const mine = await register(ACCOUNT_A);
    await beat(mine.source, { queue_event_count: 5 });
    const theirs = await register(ACCOUNT_B);
    await beat(theirs.source, { queue_event_count: 6 });

    const forA = await operations.list({ account: ACCOUNT_A, project: null });
    const forB = await operations.list({ account: ACCOUNT_B, project: null });

    const idsA = forA.map((view) => view.sourceId);
    const idsB = forB.map((view) => view.sourceId);

    expect(idsA).toContain(mine.source);
    expect(idsA).not.toContain(theirs.source);
    expect(idsB).toContain(theirs.source);
    expect(idsB).not.toContain(mine.source);
  });

  it("cannot be widened by naming another account's project", async () => {
    /*
     * Null is a widening of the project filter and never a bypass of the
     * account one, so the account predicate has to survive a project id that
     * belongs to somebody else. It yields nothing rather than an error, which
     * is also the answer a real project with no sources gives.
     */
    const theirs = await register(ACCOUNT_B);
    await beat(theirs.source);

    const stolen = await operations.list({ account: ACCOUNT_A, project: theirs.project });

    expect(stolen).toEqual([]);
  });

  it("narrows to one project without dropping the account's other sources from an unfiltered read", async () => {
    const first = await register(ACCOUNT_A);
    const second = await register(ACCOUNT_A);

    const narrowed = await operations.list({ account: ACCOUNT_A, project: first.project });
    const everything = await operations.list({ account: ACCOUNT_A, project: null });
    const allIds = everything.map((view) => view.sourceId);

    expect(narrowed.map((view) => view.sourceId)).toEqual([first.source]);
    expect(allIds).toContain(first.source);
    expect(allIds).toContain(second.source);
  });
});

describe("the view carries no credential and no identity the caller did not supply", () => {
  it("exposes exactly the documented fields and nothing else", async () => {
    const { source } = await register();
    await beat(source, { queue_event_count: 1 });

    const view = await viewOf(source);

    expect(Object.keys(view).sort()).toEqual(
      [
        "connected",
        "environment",
        "environmentMismatch",
        "health",
        "ingestionVerified",
        "ingestionVerifiedAt",
        "label",
        "lastHeartbeatAt",
        "lastSeenAt",
        "observed",
        "projectId",
        "queue",
        "sourceId",
        "sourceType",
        "state",
      ].sort(),
    );
  });

  it("shows nothing of a credential the source holds, and no other account's identity", async () => {
    const { source } = await register();

    /*
     * A real credential, minted the way activation mints one, so the values
     * searched for below are the values that would actually exist on this row's
     * source. None of them is compared against — each is only asserted absent.
     */
    const code = issueActivationCode(PEPPERS);
    expect(
      await db.activationIssue({
        account: ACCOUNT_A,
        source,
        selector: code.selector,
        verifier: code.verifier,
        purpose: "activation",
        /*
         * THE WALL CLOCK. `observer_activation_consume` compares this against
         * the database's own `now()`, which no injected clock reaches.
         */
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    ).toBe(true);

    const token = issueSourceToken(PEPPERS);
    const consumed = await db.activationConsume({
      codeSelector: code.selector,
      codeVerifier: code.verifier,
      credentialSelector: token.selector,
      credentialVerifier: token.verifier,
      credentialExpiresAt: null,
    });
    expect(consumed).not.toBeNull();

    await beat(source, { installation_nonce: "synthetic-installation-nonce-0001" });

    const serialised = JSON.stringify(await viewOf(source));

    for (const secret of [
      token.plaintext,
      token.selector,
      token.verifier,
      code.plaintext,
      code.selector,
      code.verifier,
    ]) {
      expect(serialised).not.toContain(secret);
    }
    /* The account is the caller's own argument and is still not echoed back. */
    expect(serialised).not.toContain(ACCOUNT_A);
    expect(serialised).not.toContain(ACCOUNT_B);
    /* Nor is the nonce, which the schema deliberately has nowhere to put. */
    expect(serialised).not.toContain("synthetic-installation-nonce-0001");
  });
});
