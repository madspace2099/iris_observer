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
 * THE IDENTITY SPINE, AND WHO CAN ACTUALLY TOUCH IT.
 *
 * ## This runs the migration. It does not read it.
 *
 * PGlite is PostgreSQL compiled to WASM — a real planner, a real catalogue and
 * a real permission system. Every assertion below is the answer PostgreSQL
 * gives after the migration has executed: `has_table_privilege`,
 * `has_function_privilege`, and statements actually attempted under `set role`.
 * A test that greps the SQL text proves the text; this proves the grants.
 *
 * ## The two questions it is here to answer
 *
 * **Can a client reach the tables?** Not through PostgREST, not through a
 * publishable key, not through the secret key. The only door is a definer
 * function, and the assertions attempt real statements rather than trusting a
 * catalogue read alone.
 *
 * **Can one account reach another's sources?** Every door takes `p_account`
 * first and filters on it, so the interesting cases are the ones where the
 * account is wrong: a source created against somebody else's project, a status
 * read scoped to the wrong account, an update trying to move a row across the
 * boundary.
 *
 * ## What it still does not prove
 *
 * That a hosted Supabase project matches. The roles here are created by this
 * file to the shape Supabase gives them, PGlite has no PostgREST in front of
 * it, and nothing has been applied to a hosted database. That remains an open
 * deployment prerequisite; this closes the design question, not that one.
 */

const MIGRATIONS = resolve(import.meta.dirname, "../migrations");
const SPINE = "20260902090000_observer_source_identity_spine.sql";

/** Every function this migration adds, by exact signature. */
const DOORS: readonly [string, string][] = [
  ["public.observer_project_create", "text, text, text"],
  ["public.observer_source_create", "text, uuid, text, text, text"],
  ["public.observer_source_set_state", "text, uuid, text"],
  ["public.observer_source_status", "text, uuid"],
];

const TABLES = ["observer.projects", "observer.project_sources"];
const BROWSER_ROLES = ["anon", "authenticated"];
const OWNER = "observer_ingest_owner";

const ACCOUNT_A = "acct_northgate";
const ACCOUNT_B = "acct_riverside";

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

  await db.exec(readFileSync(join(MIGRATIONS, SPINE), "utf8"));
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

/** A project and a source, created the only way they can be. */
async function seed(
  account: string,
  name: string,
  label: string,
): Promise<{ project: string; source: string }> {
  const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
    account,
    name,
    null,
  ]);
  const source = await one<string>(`select public.observer_source_create($1, $2, $3, $4, $5)`, [
    account,
    project,
    "showroom_ue5",
    "production",
    label,
  ]);
  return { project, source };
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
      expect(owner, table).toBe(OWNER);
    }
  });

  it("owns every door with the same private role", async () => {
    for (const [name, args] of DOORS) {
      const owner = await one<string>(
        `select pg_catalog.pg_get_userbyid(p.proowner)
           from pg_catalog.pg_proc p
          where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
        [name, args],
      );
      expect(owner, name).toBe(OWNER);
    }
  });

  it("gives that role no way to log in and no members", async () => {
    const role = await db.query<{ rolcanlogin: boolean; rolsuper: boolean }>(
      `select rolcanlogin, rolsuper from pg_catalog.pg_roles where rolname = $1`,
      [OWNER],
    );
    expect(role.rows[0]?.rolcanlogin).toBe(false);
    expect(role.rows[0]?.rolsuper).toBe(false);

    const members = await one<string>(
      `select count(*)::text from pg_catalog.pg_auth_members m
         join pg_catalog.pg_roles r on r.oid = m.roleid
        where r.rolname = $1`,
      [OWNER],
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
       * The exact string, not a prefix. `search_path=""` is empty; anything
       * else — `search_path=public`, `search_path=observer` — is a resolvable
       * name inside a definer function, which is the whole hazard.
       */
      expect(config, name).toEqual(['search_path=""']);
    }
  });

  it("is security definer, which is the only reason it can reach anything", async () => {
    for (const [name, args] of DOORS) {
      const definer = await one<boolean>(
        `select p.prosecdef from pg_catalog.pg_proc p
          where p.oid = ($1 || '(' || $2 || ')')::regprocedure`,
        [name, args],
      );
      expect(definer, name).toBe(true);
    }
  });

  it("keeps the two triggers as security invoker, because they are not doors", async () => {
    for (const fn of ["observer.refuse_project_move", "observer.refuse_source_move"]) {
      const definer = await one<boolean>(
        `select p.prosecdef from pg_catalog.pg_proc p
          where p.oid = ($1 || '()')::regprocedure`,
        [fn],
      );
      expect(definer, fn).toBe(false);
    }
  });
});

describe("row level security denies by having no policy at all", () => {
  it("enables RLS on both tables", async () => {
    for (const table of TABLES) {
      const [schema, name] = table.split(".");
      const enabled = await one<boolean>(
        `select c.relrowsecurity
           from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relname = $2`,
        [schema, name],
      );
      expect(enabled, table).toBe(true);
    }
  });

  it("writes no policy, which is the control rather than an omission", async () => {
    const policies = await one<string>(
      `select count(*)::text from pg_catalog.pg_policies where schemaname = 'observer'`,
    );
    expect(policies).toBe("0");
  });
});

describe("the browser roles hold nothing", () => {
  it("cannot even name the schema", async () => {
    for (const role of BROWSER_ROLES) {
      const usage = await one<boolean>(`select pg_catalog.has_schema_privilege($1, $2, 'USAGE')`, [
        role,
        "observer",
      ]);
      expect(usage, role).toBe(false);
    }
  });

  it("holds no privilege on either table, by catalogue", async () => {
    for (const role of BROWSER_ROLES) {
      for (const table of TABLES) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
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

  it("is refused when it actually attempts a statement", async () => {
    /*
     * The catalogue read above and this are not the same assertion. A privilege
     * can be absent from `has_table_privilege` and still be reachable through a
     * default privilege, a role membership or an exposed view — so the door is
     * also tried, not only inspected.
     */
    for (const role of BROWSER_ROLES) {
      const select = await asRole(role, `select * from observer.project_sources limit 1`);
      expect(select, `${role} select`).toMatch(/permission denied/i);

      const call = await asRole(role, `select public.observer_source_status($1, $2)`, [
        ACCOUNT_A,
        "00000000-0000-0000-0000-000000000000",
      ]);
      expect(call, `${role} execute`).toMatch(/permission denied/i);
    }
  });
});

describe("service_role may knock, and may do nothing else", () => {
  it("holds no table privilege, despite bypassrls", async () => {
    for (const table of TABLES) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const held = await one<boolean>(`select pg_catalog.has_table_privilege($1, $2, $3)`, [
          "service_role",
          table,
          privilege,
        ]);
        expect(held, `service_role ${privilege} ${table}`).toBe(false);
      }
    }
  });

  it("is refused a direct read even though RLS would not stop it", async () => {
    /*
     * `service_role` carries `bypassrls`, so RLS is not what protects these
     * tables from it — the absence of any grant is. Worth asserting explicitly,
     * because a reader who sees "RLS enabled" may believe it is doing work here
     * that it is not.
     */
    const select = await asRole("service_role", `select * from observer.projects limit 1`);
    expect(select).toMatch(/permission denied/i);
  });

  it("may execute all four doors", async () => {
    for (const [name, args] of DOORS) {
      const held = await one<boolean>(
        `select pg_catalog.has_function_privilege('service_role', $1 || '(' || $2 || ')', 'EXECUTE')`,
        [name, args],
      );
      expect(held, name).toBe(true);
    }
  });
});

describe("identity is minted here and cannot be moved", () => {
  it("creates a project and a source through the doors", async () => {
    const { project, source } = await seed(ACCOUNT_A, "Northgate", "Showroom PC 1");
    expect(project).toMatch(/^[0-9a-f-]{36}$/);
    expect(source).toMatch(/^[0-9a-f-]{36}$/);

    const account = await one<string>(
      `select account_id from observer.project_sources where source_id = $1`,
      [source],
    );
    expect(account, "the source inherits the project's account, not the caller's claim").toBe(
      ACCOUNT_A,
    );
  });

  it("refuses to move a source between accounts", async () => {
    const { source } = await seed(ACCOUNT_A, "Northgate 2", "Showroom PC 2");
    await expect(
      db.query(`update observer.project_sources set account_id = $1 where source_id = $2`, [
        ACCOUNT_B,
        source,
      ]),
    ).rejects.toThrow(/may not change its identity or move/i);
  });

  it("refuses to move a project between accounts", async () => {
    const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
      ACCOUNT_A,
      "Northgate 3",
      null,
    ]);
    await expect(
      db.query(`update observer.projects set account_id = $1 where project_id = $2`, [
        ACCOUNT_B,
        project,
      ]),
    ).rejects.toThrow(/may not change its identity or move/i);
  });

  it("lets a project be renamed, because a name is not an identifier", async () => {
    const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
      ACCOUNT_A,
      "Before",
      null,
    ]);
    await db.query(`update observer.projects set name = $1 where project_id = $2`, [
      "After",
      project,
    ]);
    const name = await one<string>(`select name from observer.projects where project_id = $1`, [
      project,
    ]);
    expect(name).toBe("After");
  });
});

describe("one account cannot reach another's sources", () => {
  it("refuses to create a source against somebody else's project", async () => {
    const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
      ACCOUNT_A,
      "Northgate 4",
      null,
    ]);

    /*
     * The insert selects from `projects` filtered by BOTH project and account,
     * so a wrong account matches no row and inserts nothing. It returns null
     * rather than raising — the caller sees "no source was created", which is
     * the same answer it would get for a project that does not exist. That is
     * deliberate: a distinguishable failure here would say whether somebody
     * else's project id is real.
     */
    const created = await db.query<{ observer_source_create: string | null }>(
      `select public.observer_source_create($1, $2, $3, $4, $5)`,
      [ACCOUNT_B, project, "showroom_ue5", "production", "Stolen"],
    );
    expect(created.rows[0]?.observer_source_create ?? null).toBeNull();

    const count = await one<string>(
      `select count(*)::text from observer.project_sources where account_id = $1`,
      [ACCOUNT_B],
    );
    expect(count, "nothing was inserted for the wrong account").toBe("0");
  });

  it("returns nothing when status is read under the wrong account", async () => {
    const { project } = await seed(ACCOUNT_A, "Northgate 5", "Showroom PC 5");

    const mine = await db.query(`select * from public.observer_source_status($1, $2)`, [
      ACCOUNT_A,
      project,
    ]);
    expect(mine.rows.length).toBeGreaterThan(0);

    const theirs = await db.query(`select * from public.observer_source_status($1, $2)`, [
      ACCOUNT_B,
      project,
    ]);
    expect(theirs.rows.length, "an empty result, not an error and not a row").toBe(0);
  });

  it("refuses to change the state of a source in another account", async () => {
    const { source } = await seed(ACCOUNT_A, "Northgate 6", "Showroom PC 6");

    const moved = await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
      ACCOUNT_B,
      source,
      "suspended",
    ]);
    expect(moved, "no row matched, so nothing moved").toBe(false);

    const state = await one<string>(
      `select state from observer.project_sources where source_id = $1`,
      [source],
    );
    expect(state).toBe("active");
  });
});

describe("source state is a lifecycle, not a free field", () => {
  it("suspends and resumes", async () => {
    const { source } = await seed(ACCOUNT_A, "Northgate 7", "Showroom PC 7");

    expect(
      await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
        ACCOUNT_A,
        source,
        "suspended",
      ]),
    ).toBe(true);
    expect(
      await one<string>(`select state from observer.project_sources where source_id = $1`, [
        source,
      ]),
    ).toBe("suspended");

    expect(
      await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
        ACCOUNT_A,
        source,
        "active",
      ]),
    ).toBe(true);
  });

  it("treats archived as terminal", async () => {
    /*
     * Reviving an archived source would resurrect a credential lifecycle an
     * operator deliberately ended — and every event ever stored against that
     * source id would start counting again under a name somebody retired.
     */
    const { source } = await seed(ACCOUNT_A, "Northgate 8", "Showroom PC 8");

    expect(
      await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
        ACCOUNT_A,
        source,
        "archived",
      ]),
    ).toBe(true);

    const revived = await one<boolean>(`select public.observer_source_set_state($1, $2, $3)`, [
      ACCOUNT_A,
      source,
      "active",
    ]);
    expect(revived, "an archived source does not come back").toBe(false);
    expect(
      await one<string>(`select state from observer.project_sources where source_id = $1`, [
        source,
      ]),
    ).toBe("archived");
  });

  it("refuses a state that is not one of the three", async () => {
    const { source } = await seed(ACCOUNT_A, "Northgate 9", "Showroom PC 9");
    await expect(
      db.query(`select public.observer_source_set_state($1, $2, $3)`, [
        ACCOUNT_A,
        source,
        "deleted",
      ]),
    ).rejects.toThrow(/unknown source state/i);
  });
});

describe("the closed vocabularies are closed", () => {
  it("refuses an unknown source type", async () => {
    const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
      ACCOUNT_A,
      "Vocabulary 1",
      null,
    ]);
    await expect(
      db.query(`select public.observer_source_create($1, $2, $3, $4, $5)`, [
        ACCOUNT_A,
        project,
        "smart_fridge",
        "production",
        "Nope",
      ]),
    ).rejects.toThrow(/project_sources_type_known/i);
  });

  it("refuses an environment outside the published four", async () => {
    const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
      ACCOUNT_A,
      "Vocabulary 2",
      null,
    ]);
    await expect(
      db.query(`select public.observer_source_create($1, $2, $3, $4, $5)`, [
        ACCOUNT_A,
        project,
        "showroom_ue5",
        "Development",
        "Capitalised",
      ]),
    ).rejects.toThrow(/project_sources_environment_known/i);
  });

  it("accepts every source type the architecture names, not only the Unreal one", async () => {
    /*
     * The point of the check constraint listing five types is that the first
     * web or CRM source is a row rather than a migration. Asserted, because a
     * schema that only ever gets exercised with `showroom_ue5` is one that
     * quietly becomes Unreal-only.
     */
    const project = await one<string>(`select public.observer_project_create($1, $2, $3)`, [
      ACCOUNT_A,
      "Every type",
      null,
    ]);
    for (const type of ["showroom_ue5", "web_iris", "crm", "communication", "manual_admin"]) {
      const source = await one<string>(`select public.observer_source_create($1, $2, $3, $4, $5)`, [
        ACCOUNT_A,
        project,
        type,
        "production",
        `A ${type}`,
      ]);
      expect(source, type).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
