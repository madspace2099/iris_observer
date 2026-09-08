import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CATALOGUE_FACADES,
  DEALS_FACADES,
  postgrestCatalogueDb,
  postgrestDealsDb,
} from "@observer/connectors";

import { installCronStandIn } from "./support/cron-stand-in";
import { closeSuiteDatabases, closeTestDatabases, openDatabase } from "./support/pglite";

/**
 * THE TWO M10 MIGRATIONS, AS THE PREVIEW WOULD RECEIVE THEM.
 *
 * `20260907100000_observer_catalogue_and_connectors.sql` and
 * `20260907180000_observer_deals.sql` are executed on every test run by their
 * own suites, each on a database holding only the source spine. This suite
 * asks the question those cannot: do they apply, in order, on top of EVERY
 * migration before them — the state the hosted project is actually in — and
 * do they leave behind exactly what the application's PostgREST port assumes?
 *
 * ## What this proves, and what it cannot
 *
 * PGlite is PostgreSQL 17 compiled to WebAssembly: the SQL, the catalogue,
 * the privilege system and row-level security are Postgres's own, so a
 * grant that reads false here reads false on the hosted project too. What
 * it is NOT is Supabase: there is no PostgREST in front of it, no JWT
 * claims, no `pg_cron` worker (a stand-in satisfies the retention
 * migration's precondition), and no Supabase-managed role attributes. This
 * workstation has neither Docker nor a Postgres binary, so `supabase start`
 * cannot run. Everything below is therefore evidence about the migration
 * files against Postgres, and nothing below is evidence that they have been
 * applied to `tfcchobwobpadenampyh` — the README says so, and so does this.
 *
 * ## The argument-name check is the one worth having
 *
 * PostgREST matches an RPC's JSON keys to the function's parameter NAMES,
 * and a key it cannot match is a 404 (`PGRST202`, the shape of the very
 * error that once cost five rounds of diagnosis, `docs/PROJECT-STATE.md`).
 * The SQL adapter passes parameters positionally and would never notice a
 * renamed one. So the PostgREST adapter is driven against a recording fetch
 * and every key it sends is compared with `pg_proc.proargnames` after the
 * migration ran — the one place the two halves of the port meet.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
const CATALOGUE = "20260907100000_observer_catalogue_and_connectors.sql";
const DEALS = "20260907180000_observer_deals.sql";
const CONTRACT = "20260826090000_observer_audit_facade_cleanup.sql";
const RETENTION = "20260826140000_observer_bucket_retention.sql";

const files = (): readonly string[] =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
const sql = (file: string): string => readFileSync(join(MIGRATIONS, file), "utf8");

const TABLES = [
  "connector_configs",
  "connector_credentials",
  "catalogue_units",
  "catalogue_changes",
  "catalogue_syncs",
  "deals_current",
  "deal_stage_changes",
  "deal_syncs",
] as const;

/** A column name that would mean a person is in the store. The migration's check refuses keys; this refuses columns. */
const PERSON_COLUMN = /email|phone|name|customer|address|birth/i;

let db: PGlite;

async function one<T>(text: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(text, params);
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no row from: ${text}`);
  return Object.values(row)[0] as T;
}

beforeAll(async () => {
  db = await openDatabase("suite");
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  /*
   * The whole chain, in filename order, as the SQL Editor received it: the
   * contract migration is skipped because the README holds it back on
   * evidence (its expand half is applied), and the retention migration is
   * preceded by the pg_cron stand-in its precondition demands.
   */
  for (const file of files()) {
    if (file === CONTRACT) continue;
    if (file === RETENTION) await installCronStandIn(db);
    await db.exec(sql(file));
  }
});

/* Both hooks, as every PGlite suite must: the bound test asks for them by name, and a suite with no per-test database still says so. */
afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

describe("ordering", () => {
  it("puts the catalogue before the deals, and both after everything already applied", () => {
    const list = files();
    /*
     * The catalogue and deals migrations are adjacent and in order, not
     * necessarily the newest two files in the directory — a later, unrelated
     * migration (the showroom-telemetry source, 2026-09-08) now sorts after
     * both, and asserting the literal tail here would break again the next
     * time anyone adds a migration after M10's own pair.
     */
    const catalogueAt = list.indexOf(CATALOGUE);
    const dealsAt = list.indexOf(DEALS);
    expect(catalogueAt, "catalogue migration must be present").toBeGreaterThan(-1);
    expect(dealsAt, "deals migration immediately follows the catalogue one").toBe(catalogueAt + 1);
    const stamp = (f: string) => Number(f.slice(0, 14));
    for (let i = 1; i < list.length; i += 1) {
      const previous = list[i - 1] ?? "";
      const current = list[i] ?? "";
      expect(stamp(current), `${previous} < ${current}`).toBeGreaterThan(stamp(previous));
    }
  });

  it("is named, in order, by the README that tells the operator what to paste", () => {
    const readme = readFileSync(resolve(import.meta.dirname, "../README.md"), "utf8");
    expect(readme.indexOf(CATALOGUE)).toBeGreaterThan(-1);
    expect(readme.indexOf(DEALS)).toBeGreaterThan(readme.indexOf(CATALOGUE));
    expect(readme).toMatch(/apply them in order/);
  });

  it("applies the same two files a second time without error or a second copy of anything", async () => {
    const count = async () =>
      one<number>(
        `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'observer') and (p.proname like 'observer_%' or p.proname like 'refuse_%')`,
      );
    const before = await count();
    await db.exec(sql(CATALOGUE));
    await db.exec(sql(DEALS));
    expect(await count()).toBe(before);
    for (const table of TABLES) {
      expect(await one<boolean>(`select to_regclass($1) is not null`, [`observer.${table}`])).toBe(
        true,
      );
    }
  });
});

describe("what the migrations leave behind", () => {
  it("every table, façade, trigger and index the port and the README name", async () => {
    for (const table of TABLES) {
      expect(
        await one<boolean>(`select to_regclass($1) is not null`, [`observer.${table}`]),
        table,
      ).toBe(true);
    }
    for (const facade of [...CATALOGUE_FACADES, ...DEALS_FACADES]) {
      expect(
        await one<number>(
          `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = $1`,
          [facade],
        ),
        facade,
      ).toBe(1);
    }
    const triggers = await db.query<{ tgname: string }>(
      `select tgname from pg_trigger where not tgisinternal order by tgname`,
    );
    expect(triggers.rows.map((r) => r.tgname)).toEqual(
      expect.arrayContaining([
        "catalogue_changes_append_only",
        "connector_configs_identity_immutable",
        "connector_credentials_identity_immutable",
        "deal_stage_changes_append_only",
      ]),
    );
    const indexes = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'observer' order by indexname`,
    );
    expect(indexes.rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining([
        "catalogue_units_project_live",
        "catalogue_changes_project_time",
        "catalogue_syncs_project_time",
        "connector_configs_account",
        "deals_current_project_live",
        "deal_stage_changes_project_time",
        "deal_syncs_project_time",
      ]),
    );
  });

  it("keeps every façade security definer with an empty search path, owned by the ingestion owner", async () => {
    for (const facade of [...CATALOGUE_FACADES, ...DEALS_FACADES]) {
      const row = (
        await db.query<{ prosecdef: boolean; proconfig: string[] | null; owner: string }>(
          `select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = $1`,
          [facade],
        )
      ).rows[0];
      expect(row?.prosecdef, facade).toBe(true);
      /* Postgres stores an empty search path as `search_path=""`. */
      expect(row?.proconfig, facade).toEqual(['search_path=""']);
      expect(row?.owner, facade).toBe("observer_ingest_owner");
    }
  });

  it("holds no column that could carry a person, and refuses a deal row that does", async () => {
    for (const table of TABLES) {
      const columns = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'observer' and table_name = $1`,
        [table],
      );
      for (const c of columns.rows)
        expect(c.column_name, `${table}.${c.column_name}`).not.toMatch(PERSON_COLUMN);
    }
    const check = await one<string>(
      `select pg_get_constraintdef(oid) from pg_constraint where conname = 'deals_current_no_person'`,
    );
    for (const key of ["email", "phone", "name", "customer"]) expect(check).toContain(key);
    expect(
      await one<string>(
        `select pg_get_constraintdef(oid) from pg_constraint where conname = 'deal_stage_changes_pkey'`,
      ),
    ).toBe("PRIMARY KEY (event_id)");
  });
});

describe("who can reach what", () => {
  it("has row level security on, and no policy, on every M10 table", async () => {
    for (const table of TABLES) {
      expect(
        await one<boolean>(`select relrowsecurity from pg_class where oid = to_regclass($1)`, [
          `observer.${table}`,
        ]),
        table,
      ).toBe(true);
      expect(
        await one<number>(
          `select count(*)::int from pg_policies where schemaname = 'observer' and tablename = $1`,
          [table],
        ),
        table,
      ).toBe(0);
    }
  });

  it("gives no browser role, and not the server key either, any privilege on a table", async () => {
    for (const table of TABLES) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const privilege of ["select", "insert", "update", "delete"]) {
          expect(
            await one<boolean>(`select has_table_privilege($1, $2, $3)`, [
              role,
              `observer.${table}`,
              privilege,
            ]),
            `${role} ${privilege} ${table}`,
          ).toBe(false);
        }
      }
    }
  });

  it("lets service_role alone execute every façade", async () => {
    const signatures = await db.query<{ proname: string; sig: string }>(
      `select p.proname, p.oid::regprocedure::text as sig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any($1)`,
      [[...CATALOGUE_FACADES, ...DEALS_FACADES]],
    );
    expect(signatures.rows).toHaveLength(CATALOGUE_FACADES.length + DEALS_FACADES.length);
    for (const { sig } of signatures.rows) {
      expect(
        await one<boolean>(`select has_function_privilege('anon', $1, 'execute')`, [sig]),
        sig,
      ).toBe(false);
      expect(
        await one<boolean>(`select has_function_privilege('authenticated', $1, 'execute')`, [sig]),
        sig,
      ).toBe(false);
      expect(
        await one<boolean>(`select has_function_privilege('service_role', $1, 'execute')`, [sig]),
        sig,
      ).toBe(true);
    }
  });
});

describe("the PostgREST port and the migration agree", () => {
  /** Every RPC the port makes, as PostgREST would see it: the façade and the JSON keys. */
  async function recorded(): Promise<ReadonlyMap<string, readonly string[]>> {
    const calls = new Map<string, readonly string[]>();
    const fetch = async (url: string, init: RequestInit): Promise<Response> => {
      const facade = url.split("/rest/v1/rpc/")[1] ?? "";
      calls.set(facade, Object.keys(JSON.parse(String(init.body)) as Record<string, unknown>));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    const config = { url: "https://x.supabase.co", key: "k", fetch };
    const catalogue = postgrestCatalogueDb(config);
    const deals = postgrestDealsDb(config);
    const project = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    await catalogue.connectorConfigSet("a", project, "csv", {}, true);
    await catalogue.connectorConfigs("a", project);
    await catalogue.connectorCredentialSet("a", project, "realpad", {
      keyVersion: "v1",
      nonce: "n",
      ciphertext: "c",
      authTag: "t",
      lastFour: "1234",
      revision: 1,
    });
    await catalogue.connectorCredentialRead("a", project, "realpad");
    await catalogue.connectorCredentialRemove("a", project, "realpad");
    await catalogue.catalogueApply("a", project, "csv", "2026-09-07T10:00:00.000+00:00", [], []);
    await catalogue.catalogueCurrent("a", project, "csv");
    await catalogue.catalogueChanges("a", project, 10);
    await catalogue.catalogueSyncRecord("a", project, "csv", {
      outcome: "ok",
      fetched: 0,
      added: 0,
      changed: 0,
      withdrawn: 0,
      unknownStatuses: [],
      retryAfterSeconds: null,
      detail: "",
    });
    await deals.dealsApply("a", project, "csv", "2026-09-07T10:00:00.000+00:00", [], []);
    await deals.dealsCurrent("a", project, "csv");
    await deals.dealChanges("a", project, 10);
    await deals.dealSyncRecord("a", project, "csv", {
      outcome: "ok",
      fetched: 0,
      opened: 0,
      changed: 0,
      withdrawn: 0,
      unmappedStages: [],
      retryAfterSeconds: null,
      detail: "",
    });
    await deals.dealSyncLast("a", project);
    return calls;
  }

  it("sends, for every façade, exactly the parameter names the migration declared", async () => {
    const calls = await recorded();
    const facades = [...CATALOGUE_FACADES, ...DEALS_FACADES];
    expect([...calls.keys()].sort()).toEqual([...facades].sort());
    for (const facade of facades) {
      const declared = await db.query<{ names: string[] }>(
        `select p.proargnames[1:p.pronargs] as names
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = $1`,
        [facade],
      );
      const names = declared.rows[0]?.names ?? [];
      expect([...(calls.get(facade) ?? [])].sort(), facade).toEqual([...names].sort());
    }
  });

  it("names every façade in the port's own list, once, in the migrations", () => {
    const text = sql(CATALOGUE) + sql(DEALS);
    for (const facade of [...CATALOGUE_FACADES, ...DEALS_FACADES]) {
      const declarations = text.match(
        new RegExp(`create or replace function public\\.${facade}\\(`, "g"),
      );
      expect(declarations?.length, facade).toBe(1);
    }
  });
});
