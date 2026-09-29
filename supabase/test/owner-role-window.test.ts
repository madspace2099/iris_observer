import type { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { installCronStandIn } from "./support/cron-stand-in";
import {
  closeRoleWindowStatement,
  closeSuiteDatabases,
  closeTestDatabases,
  openDatabase,
  type DatabaseScope,
} from "./support/pglite";

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * THE OWNER-ROLE WINDOW, UNDER THE RUNNER THE HOST ACTUALLY HAS.
 *
 * From `20260829173000` on, the migrations hand what they build to three NOLOGIN owner roles.
 * The hosted `postgres` is not a superuser, and until this file existed the suite applied every
 * migration as one — so a chain that cannot run on the host ran here, green, for a month.
 *
 * Every database below is opened with the hosted runner (`support/pglite.ts`): a non-superuser
 * `postgres` with the attributes measured on the host. It starts where the host is — the five
 * migrations recorded as applied, and `pg_cron` as its prerequisite leaves it — and every file is
 * applied the way the operator applies one: a single transaction, stopped at the first error,
 * whose line is reported.
 *
 * What is proved: without `observer-role-prerequisite.sql` the chain stops at the first ownership
 * transfer; with it, all sixteen pending files apply; the runbook's own revoke closes the window;
 * and `observer-role-window-closed.sql` is red in every way the window can be left open —
 * including the way psql runs a file when nobody set ON_ERROR_STOP, where a guard that trusted its
 * own first statement would print CLOSED under the error.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const PREREQUISITES = join(import.meta.dirname, "..", "prerequisites");
const PREREQUISITE = readFileSync(join(PREREQUISITES, "observer-role-prerequisite.sql"), "utf8");
const WINDOW_CLOSED = readFileSync(join(PREREQUISITES, "observer-role-window-closed.sql"), "utf8");

/** Recorded as applied on the host: `supabase migration list`, 2026-09-24. */
const APPLIED = [
  "20260825121909_observer_ai_rate_limiting.sql",
  "20260825121927_observer_ai_rate_bucket_pruning.sql",
  "20260825154900_observer_ai_public_facade.sql",
  "20260825173000_observer_whoami_diagnostic.sql",
  "20260825205000_observer_audit_provenance.sql",
];
/** Applied last, after `observer-contract-readiness.sql`, and never as part of a chain. */
const CONTRACT = "20260826090000_observer_audit_facade_cleanup.sql";
const RETENTION = "20260826140000_observer_bucket_retention.sql";
const FIRST_PENDING = "20260826120000_observer_exact_retry_and_pseudonym_scope.sql";
const FIRST_OWNER = "20260829173000_observer_account_credentials.sql";

/** Everything the host still has to apply except the contract. A new migration joins it. */
const CHAIN = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .filter((file) => !APPLIED.includes(file) && file !== CONTRACT);

const OWNERS = ["observer_budget_owner", "observer_credentials_owner", "observer_ingest_owner"];
const CLOSED = "observer role window: CLOSED — no owner role can create in schema public";
const OPEN_ALL = `observer role window: OPEN — ${OWNERS.join(", ")} can still create in schema public`;

const migration = (file: string): string => readFileSync(join(MIGRATIONS, file), "utf8");

interface Statement {
  readonly line: number;
  readonly text: string;
}

/**
 * The top-level statements of a file and the line each starts on — the split psql makes. Quotes,
 * dollar quotes and comments are respected, so a `;` inside a function body splits nothing.
 */
function statements(sql: string): Statement[] {
  const out: Statement[] = [];
  let start = 0;
  let i = 0;
  let line = 1;
  let first: number | null = null;
  const cut = (end: number): void => {
    const text = sql.slice(start, end).trim();
    if (text !== "" && first !== null) out.push({ line: first, text });
    start = end + 1;
    first = null;
  };
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "\n") {
      line += 1;
      i += 1;
    } else if (c === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
    } else if (c === "/" && next === "*") {
      let depth = 0;
      while (i < sql.length) {
        if (sql.startsWith("/*", i)) {
          depth += 1;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth -= 1;
          i += 2;
          if (depth === 0) break;
        } else {
          if (sql[i] === "\n") line += 1;
          i += 1;
        }
      }
    } else if (c !== undefined && /\s/.test(c)) {
      i += 1;
    } else {
      first ??= line;
      const tag = c === "$" ? /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64)) : null;
      if (c === "'") {
        i += 1;
        while (i < sql.length) {
          if (sql.startsWith("''", i)) i += 2;
          else if (sql[i] === "'") {
            i += 1;
            break;
          } else {
            if (sql[i] === "\n") line += 1;
            i += 1;
          }
        }
      } else if (tag !== null) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const stop = end === -1 ? sql.length : end + tag[0].length;
        for (let k = i; k < stop; k += 1) if (sql[k] === "\n") line += 1;
        i = stop;
      } else if (c === ";") {
        cut(i);
        i += 1;
      } else {
        i += 1;
      }
    }
  }
  cut(sql.length);
  return out;
}

type Row = Record<string, unknown>;
type Applied =
  | { readonly ok: true; readonly rows: readonly Row[] }
  | { readonly ok: false; readonly line: number; readonly message: string };

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** One transaction, stopping at the first error — how the operator applies a file. */
async function apply(db: PGlite, sql: string): Promise<Applied> {
  let rows: readonly Row[] = [];
  await db.exec("begin");
  for (const statement of statements(sql)) {
    try {
      rows = (await db.query<Row>(statement.text)).rows;
    } catch (error) {
      await db.exec("rollback");
      return { ok: false, line: statement.line, message: messageOf(error) };
    }
  }
  await db.exec("commit");
  return { ok: true, rows };
}

/** Where the host is: the five applied files, and `pg_cron` as its prerequisite leaves it. */
async function theHost(scope: DatabaseScope = "test"): Promise<PGlite> {
  const db = await openDatabase(scope, "hosted");
  for (const file of APPLIED) await db.exec(migration(file));
  await installCronStandIn(db);
  return db;
}

/** The whole chain applied through an open window, and the window left open. */
async function windowLeftOpen(): Promise<PGlite> {
  const db = await theHost();
  await db.exec(PREREQUISITE);
  for (const file of CHAIN) {
    const result = await apply(db, migration(file));
    if (!result.ok) throw new Error(`${file}:${String(result.line)} ${result.message}`);
  }
  return db;
}

/** Everything the prerequisite can change. Two runs must leave this identical. */
async function catalogue(db: PGlite): Promise<string> {
  const result = await db.query<{ s: unknown }>(`
    select json_build_object(
      'roles', (select json_agg(json_build_object('r', rolname, 'login', rolcanlogin,
          'inherit', rolinherit, 'super', rolsuper, 'createrole', rolcreaterole,
          'createdb', rolcreatedb, 'replication', rolreplication, 'bypassrls', rolbypassrls,
          'connlimit', rolconnlimit, 'validuntil', rolvaliduntil) order by rolname)
        from pg_roles where rolname like 'observer\\_%'),
      'members', (select json_agg(json_build_object('role', r.rolname, 'member', m.rolname,
          'grantor', g.rolname, 'admin', a.admin_option, 'inherit', a.inherit_option,
          'set', a.set_option) order by r.rolname, m.rolname, g.rolname)
        from pg_auth_members a
        join pg_roles r on r.oid = a.roleid
        join pg_roles m on m.oid = a.member
        join pg_roles g on g.oid = a.grantor
        where r.rolname like 'observer\\_%'),
      'observer', (select nspacl::text from pg_namespace where nspname = 'observer'),
      'public', (select nspacl::text from pg_namespace where nspname = 'public')) as s`);
  return JSON.stringify(result.rows[0]?.s);
}

describe("without the prerequisite, the chain stops at the first ownership transfer", () => {
  it("in 20260829173000 at line 121, and the transaction leaves nothing behind", async () => {
    const db = await theHost();
    const applied: string[] = [];
    let stop: { file: string; result: Applied } | null = null;
    for (const file of CHAIN) {
      const result = await apply(db, migration(file));
      if (!result.ok) {
        stop = { file, result };
        break;
      }
      applied.push(file);
    }

    /* The two before it hand nothing to an owner, and apply. */
    expect(applied).toEqual([FIRST_PENDING, RETENTION]);
    expect(stop).toEqual({
      file: FIRST_OWNER,
      result: {
        ok: false,
        line: 121,
        message: 'must be able to SET ROLE "observer_credentials_owner"',
      },
    });

    const left = await db.query<{ role: string | null; table: string | null }>(
      `select (select rolname from pg_roles where rolname = 'observer_credentials_owner') as role,
              to_regclass('observer.account_credentials')::text as table`,
    );
    expect(left.rows).toEqual([{ role: null, table: null }]);
  });
});

describe("with the prerequisite: open, apply, close, check", () => {
  let db: PGlite;
  let firstRun = "";
  let secondRun = "";
  let confirm: readonly Row[] = [];
  const failures: string[] = [];
  let check: Applied = { ok: false, line: 0, message: "not run" };

  beforeAll(async () => {
    db = await theHost("suite");
    await db.exec(PREREQUISITE);
    firstRun = await catalogue(db);
    await db.exec(PREREQUISITE);
    secondRun = await catalogue(db);
    confirm = (
      await db.query<Row>(PREREQUISITE.slice(PREREQUISITE.lastIndexOf("select r.rolname")))
    ).rows;

    for (const file of CHAIN) {
      const result = await apply(db, migration(file));
      if (!result.ok) failures.push(`${file}:${String(result.line)} ${result.message}`);
    }

    await db.exec(closeRoleWindowStatement());
    check = await apply(db, WINDOW_CLOSED);
  });

  it("is idempotent: a second run changes no role, membership or schema ACL", () => {
    expect(secondRun).not.toBe("");
    expect(secondRun).toBe(firstRun);
  });

  it("says in its own confirm query that the window is open and nothing else is missing", () => {
    expect(confirm.map((row) => row["rolname"])).toEqual(OWNERS);
    for (const row of confirm) {
      expect(row).toEqual({
        rolname: row["rolname"],
        nologin_noinherit: true,
        postgres_can_set_role: true,
        postgres_inherits: true,
        can_create_in_observer: true,
        window_open_on_public: true,
      });
    }
  });

  it("lets every pending file apply under the non-superuser runner — all sixteen, retention included", () => {
    expect(CHAIN).toHaveLength(16);
    expect(CHAIN).toContain(RETENTION);
    expect(CHAIN).not.toContain(CONTRACT);
    expect(failures).toEqual([]);
  });

  it("closes with the runbook's own revoke, and the check says so in one line", () => {
    expect(check).toEqual({ ok: true, rows: [{ observer_role_window: CLOSED }] });
  });

  it("leaves 61 security definer façades with their owners, and the owners no CREATE on public", async () => {
    const owners = await db.query<{ owner: string; secdef: boolean; n: number }>(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef, count(*)::int as n
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and pg_get_userbyid(p.proowner) like 'observer\\_%'
        group by 1, 2 order by 1, 2`,
    );
    expect(owners.rows).toEqual([
      { owner: "observer_budget_owner", secdef: true, n: 11 },
      { owner: "observer_credentials_owner", secdef: true, n: 5 },
      { owner: "observer_ingest_owner", secdef: true, n: 45 },
    ]);

    const create = await db.query<{ can: boolean }>(
      `select bool_or(has_schema_privilege(rolname, 'public', 'CREATE')) as can
         from pg_roles where rolname = any ($1)`,
      [OWNERS],
    );
    expect(create.rows).toEqual([{ can: false }]);
  });

  it("leaves every owner's façades answering service_role after the revoke", async () => {
    const calls = [
      "select * from public.observer_credential_read('acct_proof', 'openai')",
      "select * from public.observer_preferences_read('acct_proof')",
      "select * from public.observer_projects_for_account('acct_proof')",
      "select * from public.observer_project_directory('acct_proof')",
    ];
    await db.exec("set role service_role");
    try {
      for (const call of calls) {
        await expect(db.query(call), call).resolves.toMatchObject({ rows: [] });
      }
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("observer-role-window-closed.sql is red while the window is open", () => {
  it("with no revoke at all, naming every owner", async () => {
    const db = await windowLeftOpen();
    expect(await apply(db, WINDOW_CLOSED)).toEqual({ ok: false, line: 34, message: OPEN_ALL });
  });

  it("and still prints no CLOSED line when psql runs it without ON_ERROR_STOP", async () => {
    /*
     * psql's default: each statement on its own, an error printed and stepped over. A guard whose
     * closing line trusted the block above it would say CLOSED here, under the error.
     */
    const db = await windowLeftOpen();
    const seen: string[] = [];
    for (const statement of statements(WINDOW_CLOSED)) {
      try {
        const result = await db.query<Row>(statement.text);
        seen.push(`line ${String(statement.line)}: ${JSON.stringify(result.rows)}`);
      } catch (error) {
        seen.push(`line ${String(statement.line)}: ERROR ${messageOf(error)}`);
      }
    }
    expect(seen).toEqual([`line 34: ERROR ${OPEN_ALL}`, "line 60: []"]);
  });

  it("with one owner left able to create", async () => {
    const db = await windowLeftOpen();
    await db.exec(
      "revoke create on schema public from observer_credentials_owner, observer_budget_owner",
    );
    expect(await apply(db, WINDOW_CLOSED)).toEqual({
      ok: false,
      line: 34,
      message:
        "observer role window: OPEN — observer_ingest_owner can still create in schema public",
    });
  });

  it("when CREATE on public reaches the owners through PUBLIC, after the owners were closed by name", async () => {
    const db = await windowLeftOpen();
    await db.exec(closeRoleWindowStatement());
    expect(await apply(db, WINDOW_CLOSED)).toMatchObject({ ok: true });

    await db.exec("grant create on schema public to public");
    expect(await apply(db, WINDOW_CLOSED)).toEqual({ ok: false, line: 34, message: OPEN_ALL });
  });

  it("when the roles do not exist, because the prerequisite never ran", async () => {
    const db = await theHost();
    expect(await apply(db, WINDOW_CLOSED)).toEqual({
      ok: false,
      line: 34,
      message: `observer role window: cannot be checked — missing role(s): ${OWNERS.join(", ")}`,
    });
  });
});
