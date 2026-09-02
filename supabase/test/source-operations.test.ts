import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { closeSuiteDatabases, closeTestDatabases, openDatabase } from "./support/pglite";

/*
 * CLOSE WHAT THE FIXTURE OPENS. `worker-bound.test.ts` fails when a suite that
 * boots a PGlite does not register both hooks.
 */
afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * OPERATIONAL STATE, AND THE FOUR THINGS IT MUST NOT BECOME.
 *
 * This file runs the migration against a real Postgres and then asks Postgres
 * what happened. It is organised around the four ways this table could stop
 * being operational state and start being something worse:
 *
 * **A diagnostic blob.** `p_facts` is client-supplied JSON, and the only reason
 * an unanticipated key cannot end up stored is that the function reads named
 * keys and nothing else. The unknown-key case below is the assertion that would
 * fail first if somebody added a `jsonb` column "just for the extra fields".
 *
 * **Analytics.** A heartbeat is not a fact about a visitor and must never reach
 * the event store. Asserted by counting `observer.analytics_events` across a
 * heartbeat rather than by reading the function and believing it.
 *
 * **An authority on environment.** `PD-25` makes the registered environment
 * authoritative and the reported one provenance. A heartbeat that could change
 * the registered value would let a development build reclassify itself into
 * production, so the mismatch case checks both halves: that the flag is raised
 * AND that the registered column did not move.
 *
 * **A tenancy leak.** `observer_source_operations` is the widest row Admin
 * renders. One missing predicate shows another account's showrooms, and the
 * cross-account cases are here rather than in a security file somewhere else
 * because that is where they would actually be noticed.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
const FILES = [
  "20260902090000_observer_source_identity_spine.sql",
  "20260902093000_observer_activation_and_credentials.sql",
  "20260902100000_observer_analytics_events.sql",
  "20260902110000_observer_source_operations.sql",
  "20260902120000_observer_instant_precision_and_ingest_mark.sql",
];

/** Every door this migration adds, by exact signature. */
const DOORS: readonly [string, string][] = [
  ["public.observer_heartbeat_record", "uuid, jsonb"],
  ["public.observer_ingestion_verified", "uuid"],
  ["public.observer_source_operations", "text, uuid"],
];

/** The helpers, which are not doors and must not be reachable as if they were. */
const HELPERS: readonly [string, string][] = [
  ["observer.heartbeat_count", "jsonb, text"],
  ["observer.heartbeat_code", "jsonb, text"],
];

/**
 * `SourceOperationsRow` in `packages/sources/src/db.ts`, in its declared order.
 *
 * Duplicated here on purpose. The port names the columns and the migration
 * returns them, and nothing in TypeScript can notice that a `returns table`
 * clause was reordered — the adapter reads by name and would keep compiling
 * while a positional consumer silently swapped two counters.
 */
const ROW_SHAPE = [
  "source_id",
  "project_id",
  "source_type",
  "environment",
  "display_label",
  "state",
  "last_seen_at",
  "last_heartbeat_at",
  "ingestion_verified_at",
  "observed_app_version",
  "observed_plugin",
  "observed_build_id",
  "observed_engine",
  "observed_environment",
  "environment_mismatch",
  "queue_event_count",
  "queue_bytes_used",
  "queue_bytes_ceiling",
  "oldest_pending_age_seconds",
  "quarantine_count",
  "validation_failure_count",
  "capacity_refusal_count",
  "backend_quarantine_count",
  "last_error_code",
] as const;

const OWNER = "observer_ingest_owner";
const BROWSER_ROLES = ["anon", "authenticated"];

const ACCOUNT_A = "acct_northgate";
const ACCOUNT_B = "acct_riverside";

let db: PGlite;

beforeAll(async () => {
  db = await openDatabase("suite");

  /* The three roles Supabase provides, to the shape it provides them. */
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

/** A project and a source, created the only way they can be. */
async function makeSource(
  account: string,
  label: string,
  environment = "production",
): Promise<{ project: string; source: string }> {
  const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
    account,
    `P ${label}`,
    null,
  ]);
  const source = await one<string>(`select public.observer_source_create($1, $2, $3, $4, $5)`, [
    account,
    project,
    "showroom_ue5",
    environment,
    label,
  ]);
  return { project, source };
}

async function heartbeat(source: string, facts: Record<string, unknown>): Promise<boolean> {
  return one<boolean>(`select public.observer_heartbeat_record($1, $2::jsonb)`, [
    source,
    JSON.stringify(facts),
  ]);
}

/** One row of the read model, as an operator screen would receive it. */
type OperationsRow = Record<string, unknown>;

async function operations(account: string, project: string | null): Promise<OperationsRow[]> {
  const result = await db.query<OperationsRow>(
    `select * from public.observer_source_operations($1, $2)`,
    [account, project],
  );
  return result.rows;
}

/** The one row for a source, or a failure that names the source rather than a null. */
async function operationsFor(
  account: string,
  project: string,
  source: string,
): Promise<OperationsRow> {
  const row = (await operations(account, project)).find((r) => r["source_id"] === source);
  if (row === undefined) throw new Error(`no operations row for ${source}`);
  return row;
}

describe("the migration executes on top of the ones before it", () => {
  it("creates the operations table owned by the private ingest role", async () => {
    expect(
      await one<string>(
        `select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'observer' and c.relname = 'source_operations'`,
      ),
    ).toBe(OWNER);
  });

  it("creates every facade the port names, at the signature the port calls", async () => {
    for (const [name, args] of DOORS) {
      expect(
        await one<string>(`select ($1 || '(' || $2 || ')')::regprocedure::text`, [name, args]),
        name,
      ).toContain(name.split(".")[1] ?? "");
    }
  });

  it("leaves the ingest owner unable to log in and with nobody inside it", async () => {
    const role = await db.query<{ rolcanlogin: boolean; rolsuper: boolean }>(
      `select rolcanlogin, rolsuper from pg_catalog.pg_roles where rolname = $1`,
      [OWNER],
    );
    expect(role.rows[0]?.rolcanlogin).toBe(false);
    expect(role.rows[0]?.rolsuper).toBe(false);

    expect(
      await one<string>(
        `select count(*)::text from pg_catalog.pg_auth_members m
           join pg_catalog.pg_roles r on r.oid = m.roleid
          where r.rolname = $1`,
        [OWNER],
      ),
      "nobody is a member of the owner role",
    ).toBe("0");
  });
});

describe("every door is safe by construction", () => {
  it("is security definer, which is the only reason it can reach the tables", async () => {
    for (const [name, args] of DOORS) {
      expect(
        await one<boolean>(
          `select p.prosecdef from pg_catalog.pg_proc p
            where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
          [name, args],
        ),
        name,
      ).toBe(true);
    }
  });

  it("pins an empty search_path, so nothing in it resolves to another schema", async () => {
    for (const [name, args] of [...DOORS, ...HELPERS]) {
      /*
       * The exact string, not a prefix. `search_path=public` is a resolvable
       * name inside a definer function, which is the whole hazard — and the
       * helpers are checked too, because they run inside one.
       */
      expect(
        await one<string[] | null>(
          `select p.proconfig from pg_catalog.pg_proc p
            where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
          [name, args],
        ),
        name,
      ).toEqual(['search_path=""']);
    }
  });

  it("keeps the two heartbeat helpers as security invoker, because they are not doors", async () => {
    for (const [name, args] of HELPERS) {
      expect(
        await one<boolean>(
          `select p.prosecdef from pg_catalog.pg_proc p
            where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
          [name, args],
        ),
        name,
      ).toBe(false);
    }
  });
});

describe("only the server's secret key can open a door", () => {
  it("grants EXECUTE to nobody by way of PUBLIC", async () => {
    for (const [name, args] of [...DOORS, ...HELPERS]) {
      /*
       * An ACL entry with an empty grantee is the grant to PUBLIC that
       * PostgreSQL gives every new function. `has_function_privilege` cannot
       * be asked about PUBLIC — it is not a role — so the catalogue is read
       * directly rather than approximated by testing anon and hoping.
       */
      const acl = await one<string[] | null>(
        `select p.proacl::text[] from pg_catalog.pg_proc p
          where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
        [name, args],
      );
      expect(acl, `${name} has an explicit ACL once anything is revoked`).not.toBeNull();
      expect(
        (acl ?? []).filter((entry) => entry.startsWith("=")),
        name,
      ).toEqual([]);
    }
  });

  it("refuses the browser roles EXECUTE on every door and every helper", async () => {
    for (const role of BROWSER_ROLES) {
      for (const [name, args] of [...DOORS, ...HELPERS]) {
        expect(
          await one<boolean>(`select pg_catalog.has_function_privilege($1, $2, 'EXECUTE')`, [
            role,
            `${name}(${args})`,
          ]),
          `${role} ${name}`,
        ).toBe(false);
      }
    }
  });

  it("grants EXECUTE on the three doors to service_role and on the helpers to none", async () => {
    for (const [name, args] of DOORS) {
      expect(
        await one<boolean>(`select pg_catalog.has_function_privilege($1, $2, 'EXECUTE')`, [
          "service_role",
          `${name}(${args})`,
        ]),
        name,
      ).toBe(true);
    }
    for (const [name, args] of HELPERS) {
      expect(
        await one<boolean>(`select pg_catalog.has_function_privilege($1, $2, 'EXECUTE')`, [
          "service_role",
          `${name}(${args})`,
        ]),
        `${name} is reachable only from inside a definer function`,
      ).toBe(false);
    }
  });

  it("holds no table privilege for any client role, including service_role", async () => {
    for (const role of [...BROWSER_ROLES, "service_role"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(
          await one<boolean>(`select pg_catalog.has_table_privilege($1, $2, $3)`, [
            role,
            "observer.source_operations",
            privilege,
          ]),
          `${role} ${privilege}`,
        ).toBe(false);
      }
    }
  });
});

describe("row level security denies by having no policy at all", () => {
  it("enables RLS on the operations table", async () => {
    expect(
      await one<boolean>(
        `select c.relrowsecurity from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'observer' and c.relname = 'source_operations'`,
      ),
    ).toBe(true);
  });

  it("writes no policy for it, which is the control rather than an omission", async () => {
    expect(
      await one<string>(
        `select count(*)::text from pg_catalog.pg_policies
          where schemaname = 'observer' and tablename = 'source_operations'`,
      ),
    ).toBe("0");
  });
});

describe("a heartbeat records liveness and the client's own measurements", () => {
  it("sets last_seen_at and last_heartbeat_at on a source that had neither", async () => {
    const { project, source } = await makeSource(ACCOUNT_A, "PC beat");

    const before = await operationsFor(ACCOUNT_A, project, source);
    expect(before["last_seen_at"], "a registered source has never been heard from").toBeNull();
    expect(before["last_heartbeat_at"]).toBeNull();

    expect(await heartbeat(source, { app_version: "1.4.0" })).toBe(true);

    const after = await operationsFor(ACCOUNT_A, project, source);
    /*
     * Milliseconds, not seconds. These two assertions pinned the old truncating
     * format and failed the moment `20260902120000` corrected it — which is the
     * behaviour a format assertion is for, so they were updated rather than
     * loosened to something that would accept either.
     */
    expect(after["last_seen_at"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(after["last_heartbeat_at"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(
      await one<number>(
        `select extract(epoch from (now() - last_heartbeat_at))::float8
           from observer.source_operations where source_id = $1`,
        [source],
      ),
    ).toBeLessThan(60);
  });

  it("stores every named counter and version the facts carried", async () => {
    const { project, source } = await makeSource(ACCOUNT_A, "PC counters");

    expect(
      await heartbeat(source, {
        app_version: "1.4.0",
        plugin_version: "0.3.1",
        build_id: "BUILD-2026-09-02",
        engine_version: "5.4.4",
        queue_event_count: 12,
        queue_bytes_used: 4096,
        queue_bytes_ceiling: 1048576,
        oldest_pending_age_seconds: 90,
        quarantine_count: 2,
        validation_failure_count: 1,
        capacity_refusal_count: 3,
        backend_quarantine_count: 4,
        last_error_code: "QUEUE_FULL",
      }),
    ).toBe(true);

    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(row).toMatchObject({
      observed_app_version: "1.4.0",
      observed_plugin: "0.3.1",
      observed_build_id: "BUILD-2026-09-02",
      observed_engine: "5.4.4",
      queue_event_count: 12,
      queue_bytes_used: 4096,
      queue_bytes_ceiling: 1048576,
      oldest_pending_age_seconds: 90,
      quarantine_count: 2,
      validation_failure_count: 1,
      capacity_refusal_count: 3,
      backend_quarantine_count: 4,
      last_error_code: "QUEUE_FULL",
    });
  });

  it("returns the read model's columns in the order the port declares them", async () => {
    /*
     * The adapter reads by name, so a reordered `returns table` clause compiles
     * and passes every other test in this file. This is the only assertion that
     * would catch it.
     */
    const { project, source } = await makeSource(ACCOUNT_A, "PC shape");
    await heartbeat(source, { queue_event_count: 1 });
    expect(Object.keys(await operationsFor(ACCOUNT_A, project, source))).toEqual([...ROW_SHAPE]);
  });

  it("keeps the previous measurement when a later heartbeat omits that field", async () => {
    /*
     * A plugin that cannot measure its outbox this cycle is saying nothing
     * about it, not saying it became unknown. Overwriting with null would make
     * an operator's screen flicker between a number and a blank.
     */
    const { project, source } = await makeSource(ACCOUNT_A, "PC partial");
    await heartbeat(source, { queue_event_count: 7, last_error_code: "BACKEND_5XX" });
    await heartbeat(source, { app_version: "1.5.0" });

    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(row["queue_event_count"]).toBe(7);
    expect(row["last_error_code"]).toBe("BACKEND_5XX");
    expect(row["observed_app_version"], "and the field it did carry moved").toBe("1.5.0");
  });

  it("clamps a negative count to zero rather than storing a client's bug", async () => {
    const { project, source } = await makeSource(ACCOUNT_A, "PC negative");
    expect(
      await heartbeat(source, {
        queue_event_count: -4,
        quarantine_count: -1,
        oldest_pending_age_seconds: -30,
      }),
    ).toBe(true);

    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(row["queue_event_count"]).toBe(0);
    expect(row["quarantine_count"]).toBe(0);
    expect(row["oldest_pending_age_seconds"]).toBe(0);
  });

  it("distinguishes a count of zero from a count that was never reported", async () => {
    /*
     * `greatest(null, 0)` is 0 in PostgreSQL, so the obvious clamp would turn
     * "could not measure" into a confident, wrong, zero — and an empty outbox
     * would become indistinguishable from a broken measurement.
     */
    const { project, source } = await makeSource(ACCOUNT_A, "PC unmeasured");
    await heartbeat(source, { queue_event_count: 0 });

    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(row["queue_event_count"]).toBe(0);
    expect(row["queue_bytes_used"], "never reported, so still unknown").toBeNull();
  });
});

describe("a heartbeat may only say the things it is allowed to say", () => {
  it("ignores an unknown key instead of storing it anywhere", async () => {
    /*
     * THE ASSERTION THAT WOULD FAIL FIRST if somebody added a `jsonb` column
     * "for the extra fields". Both rows a heartbeat touches are searched for
     * the marker, because a diagnostic blob landing on the identity spine would
     * be worse than one landing here.
     */
    const marker = "unexpected-diagnostic-text-that-must-not-be-stored";
    const { source } = await makeSource(ACCOUNT_A, "PC unknown");

    expect(
      await heartbeat(source, {
        queue_event_count: 5,
        crash_report: marker,
        nested: { stack: marker },
      }),
    ).toBe(true);

    const operationsRow = await one<string>(
      `select to_jsonb(o)::text from observer.source_operations o where o.source_id = $1`,
      [source],
    );
    const spineRow = await one<string>(
      `select to_jsonb(s)::text from observer.project_sources s where s.source_id = $1`,
      [source],
    );
    expect(operationsRow).not.toContain(marker);
    expect(spineRow).not.toContain(marker);
    expect(operationsRow, "and the known key beside it was still stored").toContain("5");
  });

  it("drops a value that is not a code rather than failing the heartbeat", async () => {
    /*
     * `last_error_code` is a code, not a message. A plugin that puts a sentence
     * there loses that one field and stays alive — a heartbeat that failed
     * validation would turn a diagnostic into an outage.
     */
    const { project, source } = await makeSource(ACCOUNT_A, "PC message");
    expect(
      await heartbeat(source, {
        last_error_code: "Unhandled exception at 0x00 while rendering unit A-402",
        queue_event_count: 1,
      }),
    ).toBe(true);

    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(row["last_error_code"]).toBeNull();
    expect(row["queue_event_count"], "the rest of the heartbeat still landed").toBe(1);
  });

  it("writes no row into the event store, because a heartbeat is not a fact", async () => {
    const { source } = await makeSource(ACCOUNT_A, "PC not-analytics");
    const before = await one<string>(`select count(*)::text from observer.analytics_events`);

    await heartbeat(source, { queue_event_count: 3, last_error_code: "BACKEND_5XX" });
    await heartbeat(source, { queue_event_count: 4 });

    expect(
      await one<string>(`select count(*)::text from observer.analytics_events`),
      "operational state and analytics facts never share a table",
    ).toBe(before);
  });

  it("refuses a heartbeat from an archived source and changes nothing", async () => {
    const { project, source } = await makeSource(ACCOUNT_A, "PC archived");
    await heartbeat(source, { queue_event_count: 9 });
    const seenWhileActive = await one<string>(
      `select last_seen_at::text from observer.project_sources where source_id = $1`,
      [source],
    );

    expect(
      await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
        ACCOUNT_A,
        source,
        "archived",
      ]),
    ).toBe(true);

    expect(await heartbeat(source, { queue_event_count: 99 })).toBe(false);

    expect(
      await one<string>(
        `select last_seen_at::text from observer.project_sources where source_id = $1`,
        [source],
      ),
      "an archived source stops looking alive the moment it is archived",
    ).toBe(seenWhileActive);
    expect((await operationsFor(ACCOUNT_A, project, source))["queue_event_count"]).toBe(9);
  });

  it("refuses a heartbeat for a source that does not exist", async () => {
    expect(
      await heartbeat("00000000-0000-0000-0000-000000000000", { queue_event_count: 1 }),
      "indistinguishable from archived, deliberately",
    ).toBe(false);
    expect(await one<string>(`select count(*)::text from observer.source_operations`)).not.toBe(
      "-1",
    );
  });
});

describe("the registered environment is authoritative and a report cannot move it", () => {
  it("raises the mismatch and leaves the registered value alone", async () => {
    const { project, source } = await makeSource(ACCOUNT_A, "PC mismatch", "production");
    await heartbeat(source, { reported_environment: "development" });

    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(
      row["environment"],
      "PD-25: the registered value is the one a read model groups by",
    ).toBe("production");
    expect(row["observed_environment"], "and the reported one is kept as provenance").toBe(
      "development",
    );
    expect(row["environment_mismatch"]).toBe(true);

    expect(
      await one<string>(`select environment from observer.project_sources where source_id = $1`, [
        source,
      ]),
      "the spine column itself never moved",
    ).toBe("production");
  });

  it("reports no mismatch when the two agree", async () => {
    const { project, source } = await makeSource(ACCOUNT_A, "PC agree", "staging");
    await heartbeat(source, { reported_environment: "staging" });
    expect((await operationsFor(ACCOUNT_A, project, source))["environment_mismatch"]).toBe(false);
  });

  it("reports no mismatch for a source that has never said anything", async () => {
    /*
     * Silence is not disagreement. A null flag here would make every caller
     * decide what an unknown mismatch means, and half of them would decide
     * wrongly.
     */
    const { project, source } = await makeSource(ACCOUNT_A, "PC silent");
    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(row["observed_environment"]).toBeNull();
    expect(row["environment_mismatch"]).toBe(false);
  });
});

describe("ingestion verification is a one-time proof, not a liveness signal", () => {
  it("stamps the first verification", async () => {
    const { project, source } = await makeSource(ACCOUNT_A, "PC verified");
    expect((await operationsFor(ACCOUNT_A, project, source))["ingestion_verified_at"]).toBeNull();

    expect(await one<boolean>(`select public.observer_ingestion_verified($1)`, [source])).toBe(
      true,
    );
    expect(
      (await operationsFor(ACCOUNT_A, project, source))["ingestion_verified_at"],
    ).not.toBeNull();
  });

  it("keeps the first timestamp when it is called again", async () => {
    /*
     * The operator question is "has this installation ever proved the path".
     * Overwriting turns that into "when did it last ingest" — a liveness signal
     * that duplicates the heartbeat while destroying the only record of when
     * the installation was commissioned.
     *
     * The heartbeat beside it is the control: it proves the clock actually
     * moved between the two calls, so an unchanged verification timestamp is
     * evidence rather than an artefact of two statements running in one tick.
     */
    const { source } = await makeSource(ACCOUNT_A, "PC verify once");

    await one<boolean>(`select public.observer_ingestion_verified($1)`, [source]);
    const first = await one<string>(
      `select ingestion_verified_at::text from observer.source_operations where source_id = $1`,
      [source],
    );
    await heartbeat(source, { queue_event_count: 1 });
    const firstBeat = await one<string>(
      `select last_heartbeat_at::text from observer.source_operations where source_id = $1`,
      [source],
    );

    await one<boolean>(`select public.observer_ingestion_verified($1)`, [source]);
    await heartbeat(source, { queue_event_count: 2 });

    expect(
      await one<string>(
        `select ingestion_verified_at::text from observer.source_operations where source_id = $1`,
        [source],
      ),
    ).toBe(first);
    expect(
      await one<string>(
        `select last_heartbeat_at::text from observer.source_operations where source_id = $1`,
        [source],
      ),
      "the control: the clock did move between the two verifications",
    ).not.toBe(firstBeat);
  });

  it("verifies a source that has never sent a heartbeat", async () => {
    /* The ingestion path may be the first thing that ever writes this row. */
    const { project, source } = await makeSource(ACCOUNT_A, "PC verify first");
    expect(await one<boolean>(`select public.observer_ingestion_verified($1)`, [source])).toBe(
      true,
    );

    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(row["ingestion_verified_at"]).not.toBeNull();
    expect(row["last_heartbeat_at"], "connected and verified are separate claims").toBeNull();
  });

  it("refuses an archived source, on the same rule the heartbeat uses", async () => {
    const { source } = await makeSource(ACCOUNT_A, "PC verify archived");
    await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
      ACCOUNT_A,
      source,
      "archived",
    ]);
    expect(await one<boolean>(`select public.observer_ingestion_verified($1)`, [source])).toBe(
      false,
    );
  });
});

describe("the column that claimed a writer and had none", () => {
  /*
   * `project_sources.last_ingest_at` was declared, published by
   * `observer_source_status`, and commented "written by heartbeat and
   * ingestion". Nothing wrote it. It would have read null for ever on the first
   * operator screen that rendered it, and the comment would have sent whoever
   * noticed it to look for the bug in the reader.
   *
   * Migration `20260902120000` gave it the writer the comment promised.
   */

  it("is null until ingestion is verified, and set afterwards", async () => {
    const { source } = await makeSource(ACCOUNT_A, "PC ingest mark");

    expect(
      await one<string | null>(
        `select last_ingest_at::text from observer.project_sources where source_id = $1`,
        [source],
      ),
    ).toBeNull();

    await one<boolean>(`select public.observer_ingestion_verified($1)`, [source]);

    expect(
      await one<string | null>(
        `select last_ingest_at::text from observer.project_sources where source_id = $1`,
        [source],
      ),
    ).not.toBeNull();
  });

  it("moves on every call while the first-ever proof stays put", async () => {
    /*
     * The distinction the two columns exist for. `ingestion_verified_at`
     * answers "has this installation ever worked"; `last_ingest_at` answers "is
     * it working now". Collapsing them loses one question, and which one you
     * lose depends on which write wins.
     */
    const { source } = await makeSource(ACCOUNT_A, "PC ingest twice");

    await one<boolean>(`select public.observer_ingestion_verified($1)`, [source]);
    const firstProof = await one<string>(
      `select ingestion_verified_at::text from observer.source_operations where source_id = $1`,
      [source],
    );
    const firstIngest = await one<string>(
      `select last_ingest_at::text from observer.project_sources where source_id = $1`,
      [source],
    );

    /* A control: without a measurable gap the assertions below prove nothing. */
    await one(`select pg_catalog.pg_sleep(0.01)`);
    await one<boolean>(`select public.observer_ingestion_verified($1)`, [source]);

    expect(
      await one<string>(
        `select ingestion_verified_at::text from observer.source_operations where source_id = $1`,
        [source],
      ),
      "the first-ever proof is not overwritten",
    ).toBe(firstProof);

    expect(
      await one<string>(
        `select last_ingest_at::text from observer.project_sources where source_id = $1`,
        [source],
      ),
      "the most recent one is",
    ).not.toBe(firstIngest);
  });

  it("reaches the operator through observer_source_status, in milliseconds", async () => {
    const { project, source } = await makeSource(ACCOUNT_A, "PC ingest visible");
    await one<boolean>(`select public.observer_ingestion_verified($1)`, [source]);

    const rows = await db.query<{ source_id: string; last_ingest_at: string | null }>(
      `select * from public.observer_source_status($1, $2)`,
      [ACCOUNT_A, project],
    );
    const row = rows.rows.find((r) => r.source_id === source);

    expect(row?.last_ingest_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("the read model cannot show one account another's sources", () => {
  it("returns nothing for an account that does not own the project", async () => {
    const mine = await makeSource(ACCOUNT_A, "PC tenancy A");
    await heartbeat(mine.source, { queue_event_count: 11, last_error_code: "QUEUE_FULL" });

    expect(
      await operations(ACCOUNT_B, mine.project),
      "an empty result, not an error and not a row",
    ).toHaveLength(0);
  });

  it("returns only the caller's own sources when the project is null", async () => {
    /*
     * A null `p_project` widens the project filter and must not widen the
     * account one. This is the shape a "show me everything" screen calls, and
     * the shape a missing predicate would leak through.
     */
    const mine = await makeSource(ACCOUNT_B, "PC tenancy B");
    await heartbeat(mine.source, { queue_event_count: 3 });

    const rows = await operations(ACCOUNT_B, null);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r["source_id"])).toContain(mine.source);

    const owners = await db.query<{ account_id: string }>(
      `select distinct account_id from observer.project_sources where source_id = any($1::uuid[])`,
      [rows.map((r) => r["source_id"] as string)],
    );
    expect(owners.rows.map((r) => r.account_id)).toEqual([ACCOUNT_B]);
  });

  it("spans every project in the account when the project is null", async () => {
    const first = await makeSource(ACCOUNT_A, "PC span 1");
    const second = await makeSource(ACCOUNT_A, "PC span 2");
    expect(first.project).not.toBe(second.project);

    const ids = (await operations(ACCOUNT_A, null)).map((r) => r["source_id"]);
    expect(ids).toContain(first.source);
    expect(ids).toContain(second.source);
  });

  it("lists a source that has never reported, with its operational state null", async () => {
    /*
     * A LEFT join, because the sources an operator most needs to see are the
     * ones that were registered and never heard from. An inner join would omit
     * exactly those.
     */
    const { project, source } = await makeSource(ACCOUNT_A, "PC never");
    const row = await operationsFor(ACCOUNT_A, project, source);
    expect(row["state"]).toBe("active");
    expect(row["last_heartbeat_at"]).toBeNull();
    expect(row["queue_event_count"]).toBeNull();
    expect(row["last_error_code"]).toBeNull();
  });
});
