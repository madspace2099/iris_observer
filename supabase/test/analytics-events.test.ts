import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { closeSuiteDatabases, closeTestDatabases, openDatabase } from "./support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE EVENT STORE, AND THE ONE LINE THAT MAKES IT SAFE.
 *
 * Uniqueness is `(source_id, event_id)`. A global unique index on `event_id`
 * would make one installation's replay collide with another's first submission,
 * and the second source would be told `duplicate` for an event it never sent —
 * an existence oracle any source could query by guessing identifiers.
 *
 * So the cross-source case below is not a nicety. It is the assertion that
 * would fail first if somebody "simplified" the primary key, and the reason it
 * sits beside the ordinary replay case rather than in a security file
 * somewhere else.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
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

let db: PGlite;

beforeAll(async () => {
  db = await openDatabase("suite");
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const file of FILES) await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return Object.values(row)[0] as T;
}

async function asRole(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.exec(`set role ${role}`);
  try {
    await db.query(sql, params);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await db.exec("reset role");
  }
}

async function makeSource(account: string, label: string): Promise<string> {
  const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
    account,
    `P ${label}`,
    null,
  ]);
  return one<string>(`select public.observer_source_create($1, $2, $3, $4, $5)`, [
    account,
    project,
    "showroom_ue5",
    "production",
    label,
  ]);
}

/** Canonical lowercase 8-4-4-4-12, which is all the contract requires. */
let minted = 0;
function eventId(): string {
  minted += 1;
  const n = minted.toString(16).padStart(12, "0");
  return `6f1c9f6e-2c7a-0a4e-9b31-${n}`;
}

interface EventOver {
  readonly event_id?: string;
  readonly event_name?: string;
  readonly session_id?: string | null;
  readonly sequence?: number | null;
  readonly properties?: Record<string, unknown>;
  readonly agent_id?: string;
  readonly entity?: { type: string; id: string };
}

function event(over: EventOver = {}): Record<string, unknown> {
  return {
    event_id: over.event_id ?? eventId(),
    event_name: over.event_name ?? "diagnostic.test",
    schema_version: 1,
    occurred_at: "2026-09-01T15:30:00.124Z",
    session_id: over.session_id === undefined ? null : over.session_id,
    sequence: over.sequence === undefined ? null : over.sequence,
    app: {
      version: "1.0.0",
      plugin: "0.2.0",
      build_id: "BUILD-2026-09-01",
      environment: "development",
    },
    ...(over.agent_id === undefined ? {} : { agent_id: over.agent_id }),
    ...(over.entity === undefined ? {} : { entity: over.entity }),
    properties: over.properties ?? {},
  };
}

interface Outcome {
  readonly ordinal: number;
  readonly event_id: string;
  readonly outcome: string;
}

async function append(source: string, events: Record<string, unknown>[]): Promise<Outcome[]> {
  const result = await db.query<Outcome>(
    `select * from public.observer_events_append($1, $2::jsonb)`,
    [source, JSON.stringify(events)],
  );
  return result.rows;
}

describe("the store is append-only and unreachable", () => {
  it("is owned by the ingest role with RLS and no policy", async () => {
    expect(
      await one<string>(
        `select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'observer' and c.relname = 'analytics_events'`,
      ),
    ).toBe("observer_ingest_owner");
    expect(
      await one<boolean>(
        `select c.relrowsecurity from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'observer' and c.relname = 'analytics_events'`,
      ),
    ).toBe(true);
  });

  it("denies every client role, by catalogue and by attempt", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(
          await one<boolean>(`select pg_catalog.has_table_privilege($1, $2, $3)`, [
            role,
            "observer.analytics_events",
            privilege,
          ]),
          `${role} ${privilege}`,
        ).toBe(false);
      }
      expect(await asRole(role, `select * from observer.analytics_events limit 1`), role).toMatch(
        /permission denied/i,
      );
    }
  });

  it("refuses an UPDATE even from the owner's own connection", async () => {
    const source = await makeSource(ACCOUNT_A, "PC append 1");
    await append(source, [event()]);
    await expect(
      db.query(`update observer.analytics_events set event_name = 'changed'`),
    ).rejects.toThrow(/append-only: UPDATE is not permitted/i);
  });

  it("refuses a DELETE the same way", async () => {
    const source = await makeSource(ACCOUNT_A, "PC append 2");
    await append(source, [event()]);
    await expect(db.query(`delete from observer.analytics_events`)).rejects.toThrow(
      /append-only: DELETE is not permitted/i,
    );
  });
});

describe("idempotency is scoped to the source", () => {
  it("accepts once and reports duplicate on replay", async () => {
    const source = await makeSource(ACCOUNT_A, "PC dedup 1");
    const e = event();

    expect((await append(source, [e]))[0]?.outcome).toBe("accepted");
    expect((await append(source, [e]))[0]?.outcome).toBe("duplicate");
    expect((await append(source, [e]))[0]?.outcome, "and again").toBe("duplicate");

    expect(
      await one<string>(
        `select count(*)::text from observer.analytics_events where source_id = $1`,
        [source],
      ),
      "one accepted fact, however many times it arrives",
    ).toBe("1");
  });

  it("accepts the same event_id from a different source", async () => {
    /*
     * THE ASSERTION THAT WOULD FAIL FIRST if the primary key were global.
     * Source B has never sent this event, so it must be stored for B — and B
     * must learn nothing about whether A has it.
     */
    const a = await makeSource(ACCOUNT_A, "PC dedup A");
    const b = await makeSource(ACCOUNT_B, "PC dedup B");
    const e = event();

    expect((await append(a, [e]))[0]?.outcome).toBe("accepted");
    expect((await append(b, [e]))[0]?.outcome, "no cross-source oracle").toBe("accepted");

    for (const source of [a, b]) {
      expect(
        await one<string>(
          `select count(*)::text from observer.analytics_events where source_id = $1`,
          [source],
        ),
      ).toBe("1");
    }
  });

  it("survives a credential rotation, because dedup keys on the source", async () => {
    const source = await makeSource(ACCOUNT_A, "PC dedup rotate");
    const e = event();
    expect((await append(source, [e]))[0]?.outcome).toBe("accepted");

    /* A rotation changes credentials, not identity. */
    await db.query(
      `insert into observer.source_credentials (selector, verifier, source_id) values ($1, $2, $3)`,
      ["sel-rotate", "0".repeat(64), source],
    );

    expect((await append(source, [e]))[0]?.outcome).toBe("duplicate");
  });

  it("keeps the first version when a replay carries different properties", async () => {
    /*
     * `do nothing`, not `do update`. The first accepted version is the fact; a
     * client that rebuilt a payload must not rewrite history, or a projection
     * stops being rebuildable from raw events (ADR-0001).
     */
    const source = await makeSource(ACCOUNT_A, "PC first-write");
    const id = eventId();
    await append(source, [event({ event_id: id, properties: { unit: "A-402" } })]);
    const second = await append(source, [event({ event_id: id, properties: { unit: "CHANGED" } })]);

    expect(second[0]?.outcome).toBe("duplicate");
    const stored = await one<Record<string, unknown>>(
      `select properties from observer.analytics_events where source_id = $1 and event_id = $2`,
      [source, id],
    );
    expect(stored).toEqual({ unit: "A-402" });
  });
});

describe("a batch gets exactly one result per submitted event, in order", () => {
  it("returns results in submission order", async () => {
    const source = await makeSource(ACCOUNT_A, "PC order");
    const events = Array.from({ length: 8 }, () => event());
    const results = await append(source, events);

    expect(results).toHaveLength(8);
    expect(results.map((r) => r.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(results.map((r) => r.event_id)).toEqual(events.map((e) => e["event_id"]));
    expect(results.every((r) => r.outcome === "accepted")).toBe(true);
  });

  it("mixes accepted and duplicate independently", async () => {
    const source = await makeSource(ACCOUNT_A, "PC mixed");
    const known = event();
    await append(source, [known]);

    const results = await append(source, [event(), known, event()]);
    expect(results.map((r) => r.outcome)).toEqual(["accepted", "duplicate", "accepted"]);
  });

  it("accepts the first of a repeated id inside one batch and duplicates the rest", async () => {
    /*
     * Without the occurrence rank, the left join would mark BOTH copies
     * accepted — two results claiming to be the same stored fact, which is the
     * "conflicting duplicate results for one input event" the contract forbids.
     */
    const source = await makeSource(ACCOUNT_A, "PC intra-batch");
    const id = eventId();
    const results = await append(source, [
      event({ event_id: id }),
      event(),
      event({ event_id: id }),
      event({ event_id: id }),
    ]);

    expect(results.map((r) => r.outcome)).toEqual([
      "accepted",
      "accepted",
      "duplicate",
      "duplicate",
    ]);
    expect(
      await one<string>(
        `select count(*)::text from observer.analytics_events where source_id = $1 and event_id = $2`,
        [source, id],
      ),
    ).toBe("1");
  });

  it("processes an empty batch without storing anything", async () => {
    const source = await makeSource(ACCOUNT_A, "PC empty");
    expect(await append(source, [])).toHaveLength(0);
    expect(
      await one<string>(
        `select count(*)::text from observer.analytics_events where source_id = $1`,
        [source],
      ),
    ).toBe("0");
  });
});

describe("identity is derived, never submitted", () => {
  it("stores the account and project of the authenticated source", async () => {
    const source = await makeSource(ACCOUNT_A, "PC derived");
    await append(source, [event()]);

    const row = await db.query<{ account_id: string; project_id: string; source_id: string }>(
      `select account_id, project_id, source_id from observer.analytics_events where source_id = $1`,
      [source],
    );
    expect(row.rows[0]?.account_id).toBe(ACCOUNT_A);
    expect(row.rows[0]?.source_id).toBe(source);
    expect(row.rows[0]?.project_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ignores identity-shaped keys inside properties", async () => {
    /*
     * The insert never reads them. A `properties` bag naming another account is
     * carried as opaque payload, exactly like any other domain field, and the
     * stored identity still comes from the source row.
     */
    const source = await makeSource(ACCOUNT_A, "PC shadow");
    const other = await makeSource(ACCOUNT_B, "PC shadow other");

    await append(source, [
      event({
        properties: {
          account_id: ACCOUNT_B,
          project_id: "00000000-0000-0000-0000-000000000000",
          source_id: other,
          ingested_at: "1999-01-01T00:00:00.000Z",
        },
      }),
    ]);

    const row = await db.query<{ account_id: string; ingested_at: string }>(
      `select account_id, ingested_at::text from observer.analytics_events where source_id = $1`,
      [source],
    );
    expect(row.rows[0]?.account_id).toBe(ACCOUNT_A);
    expect(row.rows[0]?.ingested_at.startsWith("1999")).toBe(false);
    expect(
      await one<string>(
        `select count(*)::text from observer.analytics_events where source_id = $1`,
        [other],
      ),
      "nothing landed against the source named in properties",
    ).toBe("0");
  });

  it("assigns ingested_at itself", async () => {
    const source = await makeSource(ACCOUNT_A, "PC ingested");
    await append(source, [event()]);
    const gap = await one<number>(
      `select extract(epoch from (now() - ingested_at))::float8
         from observer.analytics_events where source_id = $1`,
      [source],
    );
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(60);
  });
});

describe("the envelope's coherence rules are enforced by the table", () => {
  it("stores a session event with its sequence", async () => {
    const source = await makeSource(ACCOUNT_A, "PC session");
    const results = await append(source, [
      event({ session_id: "550e8400-e29b-41d4-a716-446655440000", sequence: 1 }),
    ]);
    expect(results[0]?.outcome).toBe("accepted");
  });

  it("refuses a session id with no sequence", async () => {
    const source = await makeSource(ACCOUNT_A, "PC half 1");
    await expect(
      append(source, [event({ session_id: "550e8400-e29b-41d4-a716-446655440000" })]),
    ).rejects.toThrow(/analytics_events_session_coherent/i);
  });

  it("refuses a sequence with no session id", async () => {
    const source = await makeSource(ACCOUNT_A, "PC half 2");
    await expect(append(source, [event({ sequence: 3 })])).rejects.toThrow(
      /analytics_events_session_coherent/i,
    );
  });

  it("refuses a zero sequence", async () => {
    const source = await makeSource(ACCOUNT_A, "PC zero");
    await expect(
      append(source, [event({ session_id: "550e8400-e29b-41d4-a716-446655440000", sequence: 0 })]),
    ).rejects.toThrow(/analytics_events_sequence_positive/i);
  });

  it("refuses half an entity", async () => {
    const source = await makeSource(ACCOUNT_A, "PC entity");
    await expect(
      db.query(
        `insert into observer.analytics_events
           (source_id, account_id, project_id, event_id, event_name, schema_version, occurred_at,
            app_version, app_plugin, app_build_id, app_environment, entity_type)
         select $1, account_id, project_id, $2, 'diagnostic.test', 1, now(),
            '1', '1', '1', 'development', 'unit'
           from observer.project_sources where source_id = $1`,
        [source, eventId()],
      ),
    ).rejects.toThrow(/analytics_events_entity_coherent/i);
  });
});

describe("reading back", () => {
  it("returns a source's events, scoped to the owning account", async () => {
    const source = await makeSource(ACCOUNT_A, "PC read");
    await append(source, [event(), event()]);

    const mine = await db.query(`select * from public.observer_events_for_source($1, $2, $3)`, [
      ACCOUNT_A,
      source,
      100,
    ]);
    expect(mine.rows).toHaveLength(2);

    const theirs = await db.query(`select * from public.observer_events_for_source($1, $2, $3)`, [
      ACCOUNT_B,
      source,
      100,
    ]);
    expect(theirs.rows, "an empty result, not an error").toHaveLength(0);
  });

  it("carries the reported environment as provenance beside the derived identity", async () => {
    const source = await makeSource(ACCOUNT_A, "PC provenance");
    await append(source, [event()]);
    const row = await db.query<{ app_environment: string; account_id: string }>(
      `select * from public.observer_events_for_source($1, $2, $3)`,
      [ACCOUNT_A, source, 10],
    );
    /* The source was registered `production`; the build reported `development`. */
    expect(row.rows[0]?.app_environment).toBe("development");
    const authoritative = await one<string>(
      `select environment from observer.project_sources where source_id = $1`,
      [source],
    );
    expect(authoritative, "and the source row is the one that counts").toBe("production");
  });

  it("returns occurred_at with its milliseconds intact", async () => {
    /*
     * The regression this exists for. Every facade rendered instants with
     * `HH24:MI:SS"Z"`, so an event submitted at `.124` read back as `.000` —
     * data intact in the `timestamptz` column, destroyed on the way out.
     *
     * It survived because the fixture carrying `.124` was only ever written.
     * Nothing compared it to what came back, so the truncation was invisible to
     * a suite that otherwise covers this table closely. Migration
     * `20260902120000` fixed the format; this is the assertion that would have
     * caught it, and the one that stops it returning.
     *
     * Not cosmetic: ADR-0016 derives meaningful dwell at query time from the
     * difference between two of these values. At second precision, a glance at
     * a unit lasting 800ms measures as zero.
     */
    const source = await makeSource(ACCOUNT_A, "PC precision");
    const precise = { ...event(), occurred_at: "2026-09-01T15:30:00.124Z" };
    await append(source, [precise]);

    const row = await db.query<{ occurred_at: string; ingested_at: string }>(
      `select * from public.observer_events_for_source($1, $2, $3)`,
      [ACCOUNT_A, source, 10],
    );

    expect(row.rows[0]?.occurred_at).toBe("2026-09-01T15:30:00.124Z");

    /*
     * And the server-assigned one too, which is a different guarantee: nothing
     * submitted it, so its precision depends only on the facade. Asserted by
     * shape rather than by value, since the clock decides the digits.
     */
    expect(row.rows[0]?.ingested_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
