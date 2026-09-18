import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { closeSuiteDatabases, closeTestDatabases, openDatabase } from "./support/pglite";

/*
 * CLOSE WHAT THE FIXTURE OPENS.
 *
 * The database below is a Postgres compiled to WASM, built once for the whole
 * file. Left open it keeps a live handle in the forked worker, the worker does
 * not exit on its own, and Vitest tears the pool down underneath it — which it
 * records as an unhandled error and an exit code of 1 while its own report is
 * already written and green. `supabase/test/worker-bound.test.ts` fails when a
 * suite that boots one of these does not register both hooks, which is how this
 * omission was found.
 */
afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE CREDENTIAL TABLES, AND WHO CAN ACTUALLY TOUCH THEM.
 *
 * ## This runs the migration. It does not read it.
 *
 * PGlite is PostgreSQL compiled to WASM — a real planner, a real catalogue and
 * a real permission system. Every assertion below is the answer PostgreSQL
 * gives after the migration has executed: `has_table_privilege`,
 * `has_function_privilege`, and statements actually attempted under `set role`.
 * A test that greps the SQL text proves the text; this proves the grants.
 *
 * ## What it still does not prove
 *
 * That a Supabase project matches. The roles here are created by this file to
 * the shape Supabase gives them, PGlite has no PostgREST in front of it, and
 * nothing here has been applied to a hosted database. Executing this migration
 * against the real project and running the verifier remains an open deployment
 * prerequisite, recorded as one — this closes the design question, not the
 * deployment one.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
const CREDENTIALS = "20260829173000_observer_account_credentials.sql";

/** Every function this migration adds, by exact signature. */
const DOORS: readonly [string, string][] = [
  ["public.observer_credential_read", "text, text"],
  ["public.observer_credential_upsert", "text, text, text, text, text, text, text, bigint"],
  ["public.observer_credential_delete", "text, text"],
  ["public.observer_credential_record_test", "text, text, text, timestamptz"],
  ["public.observer_credential_audit", "text, text, text, boolean, text, timestamptz"],
];

const TABLES = ["observer.account_credentials", "observer.credential_audit"];
const BROWSER_ROLES = ["anon", "authenticated"];

/* A sealed payload's worth of obviously fake strings. Nothing here is a key. */
const SEALED = ["v1", "bm9uY2U", "Y2lwaGVy", "dGFn", "wxyz"] as const;

let db: PGlite;

beforeAll(async () => {
  db = await openDatabase("suite");

  /*
   * The three roles Supabase provides, to the shape it provides them. Note
   * `service_role` gets `bypassrls` exactly as it does there — so if these
   * tables were reachable by it at all, RLS would not save them, and the
   * assertions below would fail rather than passing for the wrong reason.
   */
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);

  await db.exec(readFileSync(join(MIGRATIONS, CREDENTIALS), "utf8"));
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return Object.values(row)[0] as T;
}

/** Runs a statement as a role, and reports what PostgreSQL said. */
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

describe("the migration executes", () => {
  it("creates both tables, owned by the private role", async () => {
    for (const table of TABLES) {
      const [schema, name] = table.split(".");
      const owner = await one<string>(
        `select pg_catalog.pg_get_userbyid(c.relowner)
           from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relname = $2`,
        [schema, name],
      );
      expect(owner, table).toBe("observer_credentials_owner");
    }
  });

  it("owns the five functions with the same private role", async () => {
    for (const [name, args] of DOORS) {
      const owner = await one<string>(
        `select pg_catalog.pg_get_userbyid(p.proowner)
           from pg_catalog.pg_proc p
          where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
        [name, args],
      );
      expect(owner, name).toBe("observer_credentials_owner");
    }
  });

  it("gives that role no way to log in and no members", async () => {
    const role = await db.query<{ rolcanlogin: boolean; rolsuper: boolean }>(
      `select rolcanlogin, rolsuper from pg_catalog.pg_roles where rolname = 'observer_credentials_owner'`,
    );
    expect(role.rows[0]?.rolcanlogin).toBe(false);
    expect(role.rows[0]?.rolsuper).toBe(false);

    const members = await one<string>(
      `select count(*)::text from pg_catalog.pg_auth_members m
         join pg_catalog.pg_roles r on r.oid = m.roleid
        where r.rolname = 'observer_credentials_owner'`,
    );
    expect(members, "nobody is a member of the owner role").toBe("0");
  });
});

describe("every definer function is safe by construction", () => {
  it("runs with an empty search_path", async () => {
    for (const [name, args] of DOORS) {
      const config = await one<string[] | null>(
        `select p.proconfig from pg_catalog.pg_proc p
          where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
        [name, args],
      );
      /*
       * PostgreSQL stores the empty value quoted: `search_path=""`. Asserted
       * exactly, because `search_path=public` would satisfy a looser check
       * and is the thing this test exists to catch.
       */
      expect(config ?? [], name).toContain('search_path=""');
    }
  });

  it("is security definer only where the caller holds no privilege", async () => {
    /*
     * All five are definer, and that is necessary rather than convenient:
     * `service_role` has no privilege on either table, so an invoker-rights
     * function would fail on its first statement. The next test proves the
     * premise instead of asserting it.
     */
    for (const [name, args] of DOORS) {
      const definer = await one<boolean>(
        `select p.prosecdef from pg_catalog.pg_proc p
          where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
        [name, args],
      );
      expect(definer, name).toBe(true);
    }

    /* The trigger function needs no elevation, and does not have it. */
    const trigger = await one<boolean>(
      `select p.prosecdef from pg_catalog.pg_proc p
        where p.oid = 'observer.refuse_account_move()'::regprocedure`,
    );
    expect(trigger, "the trigger runs as its invoker").toBe(false);
  });

  it("contains no dynamic SQL", () => {
    const sql = readFileSync(join(MIGRATIONS, CREDENTIALS), "utf8");
    for (const forbidden of ["execute format(", "execute immediate", "quote_ident("]) {
      expect(sql.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });
});

describe("browser roles hold nothing at all", () => {
  it("cannot use the schema", async () => {
    for (const role of BROWSER_ROLES) {
      const usage = await one<boolean>(
        `select pg_catalog.has_schema_privilege($1, 'observer', 'USAGE')`,
        [role],
      );
      expect(usage, role).toBe(false);
    }
  });

  it("holds no privilege on either table", async () => {
    for (const role of BROWSER_ROLES) {
      for (const table of TABLES) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "REFERENCES", "TRIGGER"]) {
          const held = await one<boolean>(`select pg_catalog.has_table_privilege($1, $2, $3)`, [
            role,
            table,
            privilege,
          ]);
          expect(held, `${role} ${privilege} ${table}`).toBe(false);
        }
      }
    }
  });

  it("cannot execute any of the five functions", async () => {
    for (const role of BROWSER_ROLES) {
      for (const [name, args] of DOORS) {
        const held = await one<boolean>(
          `select pg_catalog.has_function_privilege($1, $2 || '(' || $3 || ')', 'EXECUTE')`,
          [role, name, args],
        );
        expect(held, `${role} may execute ${name}`).toBe(false);
      }
    }
  });

  it("is refused when it actually tries", async () => {
    /* Not a catalogue lookup — the statement, attempted, and refused. */
    for (const role of BROWSER_ROLES) {
      const read = await asRole(role, `select * from observer.account_credentials`);
      expect(read, `${role} select`).toMatch(/permission denied|does not exist/i);

      const call = await asRole(role, `select public.observer_credential_read('acct_x', 'openai')`);
      expect(call, `${role} call`).toMatch(/permission denied/i);

      const write = await asRole(
        role,
        `insert into observer.account_credentials
           (account_id, provider, key_version, nonce, ciphertext, auth_tag, last_four)
         values ('acct_x', 'openai', 'v1', 'n', 'c', 't', 'wxyz')`,
      );
      expect(write, `${role} insert`).toMatch(/permission denied|does not exist/i);

      const remove = await asRole(role, `delete from observer.account_credentials`);
      expect(remove, `${role} delete`).toMatch(/permission denied|does not exist/i);
    }
  });

  it("cannot reach the audit trail either", async () => {
    for (const role of BROWSER_ROLES) {
      const read = await asRole(role, `select * from observer.credential_audit`);
      expect(read, `${role} audit select`).toMatch(/permission denied|does not exist/i);
    }
  });
});

describe("the backend role may call the doors and nothing else", () => {
  it("executes all five", async () => {
    for (const [name, args] of DOORS) {
      const held = await one<boolean>(
        `select pg_catalog.has_function_privilege('service_role', $1 || '(' || $2 || ')', 'EXECUTE')`,
        [name, args],
      );
      expect(held, name).toBe(true);
    }
  });

  it("holds no table privilege, even with bypassrls", async () => {
    /*
     * The reason the functions must be definer, proved rather than asserted.
     * `service_role` carries `bypassrls` exactly as it does on Supabase, so if
     * a grant existed anywhere it would reach these rows — it does not.
     */
    for (const table of TABLES) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const held = await one<boolean>(
          `select pg_catalog.has_table_privilege('service_role', $1, $2)`,
          [table, privilege],
        );
        expect(held, `service_role ${privilege} ${table}`).toBe(false);
      }
    }

    const direct = await asRole("service_role", `select * from observer.account_credentials`);
    expect(direct, "service_role direct read").toMatch(/permission denied|does not exist/i);
  });

  it("stores, reads back and deletes through the functions", async () => {
    const [version, nonce, ciphertext, tag, lastFour] = SEALED;

    const stored = await asRole(
      "service_role",
      `select public.observer_credential_upsert('acct_a', 'openai', $1, $2, $3, $4, $5, 100)`,
      [version, nonce, ciphertext, tag, lastFour],
    );
    expect(stored).toBeNull();

    await db.exec("set role service_role");
    const read = await db.query<{ last_four: string; revision: string }>(
      `select last_four, revision from public.observer_credential_read('acct_a', 'openai')`,
    );
    await db.exec("reset role");
    expect(read.rows[0]?.last_four).toBe(lastFour);

    const removed = await asRole(
      "service_role",
      `select public.observer_credential_delete('acct_a', 'openai')`,
    );
    expect(removed).toBeNull();

    await db.exec("set role service_role");
    const gone = await db.query(
      `select * from public.observer_credential_read('acct_a', 'openai')`,
    );
    await db.exec("reset role");
    expect(gone.rows).toHaveLength(0);
  });
});

describe("a row cannot be moved between accounts", () => {
  it("refuses an update that rewrites the account", async () => {
    const [version, nonce, ciphertext, tag, lastFour] = SEALED;
    await db.exec("set role service_role");
    await db.query(
      `select public.observer_credential_upsert('acct_owner', 'openai', $1, $2, $3, $4, $5, 200)`,
      [version, nonce, ciphertext, tag, lastFour],
    );
    await db.exec("reset role");

    /* Even as the superuser running this test, the trigger refuses. */
    await expect(
      db.query(
        `update observer.account_credentials set account_id = 'acct_thief' where account_id = 'acct_owner'`,
      ),
    ).rejects.toThrow(/may not be moved between accounts/i);

    await db.exec(`delete from observer.account_credentials where account_id = 'acct_owner'`);
  });
});

describe("a late replacement cannot reinstate an older key", () => {
  it("applies a higher revision and ignores a lower one", async () => {
    await db.exec("set role service_role");
    await db.query(
      `select public.observer_credential_upsert('acct_r', 'openai', 'v1', 'n1', 'c1', 't1', 'aaaa', 1000)`,
    );
    await db.query(
      `select public.observer_credential_upsert('acct_r', 'openai', 'v1', 'n2', 'c2', 't2', 'bbbb', 2000)`,
    );

    /* The late arrival, issued before the one that already landed. */
    await db.query(
      `select public.observer_credential_upsert('acct_r', 'openai', 'v1', 'n3', 'c3', 't3', 'cccc', 1500)`,
    );

    const current = await db.query<{ last_four: string; revision: string }>(
      `select last_four, revision from public.observer_credential_read('acct_r', 'openai')`,
    );
    await db.exec("reset role");

    expect(current.rows[0]?.last_four, "the newest key survives").toBe("bbbb");
    expect(String(current.rows[0]?.revision)).toBe("2000");

    await db.exec(`delete from observer.account_credentials where account_id = 'acct_r'`);
  });
});
