import { PGlite } from "@electric-sql/pglite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Who owns a WASM Postgres, and who closes it.
 *
 * ## What was wrong
 *
 * The suite created roughly 145 PGlite instances per run across five files and
 * called `close()` on none of them. Each one is a Postgres compiled to WASM
 * holding its own heap, so a single test file could hold dozens alive at once
 * while it ran — and with Vitest's `forks` pool defaulting to one worker per
 * CPU, several such files ran at the same time.
 *
 * ## Ownership is not uniform, so cleanup cannot be either
 *
 * Almost every instance belongs to the ONE TEST that opened it and is finished
 * with by the end of that test. Two belong to a `describe` block: they are
 * built in `beforeAll` and every test in that block reads them. Closing those
 * two after the first test would break the rest, so scope is declared at the
 * point of creation rather than guessed at the point of cleanup:
 *
 *     openDatabase()          per-test  -> closed in `afterEach`
 *     openDatabase("suite")   per-suite -> closed in `afterAll`
 *
 * ## Registration happens before the caller can fail
 *
 * An instance is recorded the moment it exists, so a test that throws — or a
 * `beforeAll` that throws half-way through building a fixture — cannot leak
 * one. The hooks run regardless of the outcome, which is why this is registered
 * cleanup rather than a `try/finally` at every one of 145 call sites.
 */

export type DatabaseScope = "test" | "suite";

/**
 * Who applies the migrations.
 *
 *     "superuser"  PGlite's own bootstrap superuser, as every file here did until 2026-09-24
 *     "hosted"     a non-superuser `postgres`, the way the hosted project runs them
 *
 * A superuser skips every ownership and privilege check, so under it a migration that cannot run
 * on the host still runs here. That hid `must be able to SET ROLE "observer_credentials_owner"`
 * at `20260829173000:121` for a month. The superuser runner stays for suites that need it; each
 * one says why.
 */
export type DatabaseRunner = "superuser" | "hosted";

/**
 * THE HOSTED RUNNER, AS MEASURED — not as assumed.
 *
 * Read-only catalogue queries on IRIS OBSERVER (`tfcchobwobpadenampyh`), 2026-09-24, PostgreSQL
 * 17.6:
 *
 *     pg_roles 'postgres'   rolsuper false, rolinherit true, rolcreaterole true, rolcreatedb true,
 *                           rolcanlogin true, rolreplication true, rolbypassrls true
 *     pg_database.datdba    postgres — so it also holds CREATE on `public` through
 *                           pg_database_owner
 *     pg_auth_members       postgres is a member of anon, authenticated, authenticator,
 *                           pg_create_subscription, pg_monitor, pg_read_all_data,
 *                           pg_signal_backend, service_role, supabase_privileged_role
 *     createrole_self_grant '' — PGlite's default as well
 *
 * Reproduced below except `authenticator` and `supabase_privileged_role`, which no migration
 * names. A later measurement that differs refutes this block: change it, with that date.
 *
 * The three Supabase roles keep the shape every suite gave them before this mode existed —
 * `service_role` with BYPASSRLS, as on the host, so a table it could reach would not be saved by
 * row level security. PGlite's bootstrap superuser is also called `postgres`, so it steps aside
 * first; otherwise a `grant … to postgres` would land on a superuser and prove nothing. It stays
 * the authenticated user, which is what lets `asPlatform` borrow `supabase_admin` for the
 * platform's own work.
 */
const HOSTED_POSTGRES = `
  create role postgres login inherit createrole createdb replication bypassrls nosuperuser;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant anon, authenticated, service_role, pg_read_all_data, pg_signal_backend, pg_monitor,
        pg_create_subscription
     to postgres;
  do $$ begin execute format('alter database %I owner to postgres', current_database()); end $$;
`;

const hosted = new WeakSet<PGlite>();

async function becomeHostedPostgres(db: PGlite): Promise<void> {
  await db.exec(
    "create role supabase_admin superuser login; set session authorization supabase_admin;",
  );
  await db.exec("alter role postgres rename to bootstrap_superuser;");
  await db.exec(HOSTED_POSTGRES);
  await db.exec("set session authorization postgres;");
  hosted.add(db);
}

/**
 * What the PLATFORM does on a hosted project — install an extension, own its schema — run as the
 * platform's superuser, and the session handed back to `postgres` afterwards. On a superuser
 * database this is plain `exec`: that runner is the platform as well.
 */
export async function asPlatform(db: PGlite, sql: string): Promise<void> {
  if (!hosted.has(db)) {
    await db.exec(sql);
    return;
  }
  await db.exec("set session authorization supabase_admin;");
  try {
    await db.exec(sql);
  } finally {
    await db.exec("set session authorization postgres;");
  }
}

const MIGRATIONS = join(import.meta.dirname, "..", "..", "migrations");
const PREREQUISITES = join(import.meta.dirname, "..", "..", "prerequisites");
const RUNBOOK = join(import.meta.dirname, "..", "..", "..", "docs", "18-deployment.md");

/**
 * The revoke exactly as `docs/18-deployment.md` prints it, so the suite closes the window with the
 * operator's own statement and the two cannot drift apart. Read when first needed, not at import.
 */
export function closeRoleWindowStatement(): string {
  const found = /revoke create on schema public[\s\S]*?;/.exec(readFileSync(RUNBOOK, "utf8"));
  if (found === null)
    throw new Error("docs/18-deployment.md no longer prints the owner-role revoke");
  return found[0];
}

/**
 * Apply migrations the way the hosted project has to: the four steps in `docs/18-deployment.md`,
 * "Owner roles, and the window on `public`". Open the window with the role prerequisite, apply each
 * file as one transaction, close it with the runbook's revoke, and run
 * `observer-role-window-closed.sql`, which throws while the window is still open. Files are names
 * in `supabase/migrations`.
 */
export async function applyMigrations(db: PGlite, files: readonly string[]): Promise<void> {
  if (!hosted.has(db)) {
    throw new Error("applyMigrations is the hosted runner's procedure; open the database with it");
  }
  await db.exec(readFileSync(join(PREREQUISITES, "observer-role-prerequisite.sql"), "utf8"));
  for (const file of files) await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  await db.exec(closeRoleWindowStatement());
  await db.exec(readFileSync(join(PREREQUISITES, "observer-role-window-closed.sql"), "utf8"));
}

interface Owned {
  readonly db: PGlite;
  closed: boolean;
}

const owned: Record<DatabaseScope, Owned[]> = { test: [], suite: [] };
let created = 0;
let closed = 0;
let failedCloses = 0;
/**
 * The most alive at any one moment in THIS worker.
 *
 * The count that matters for concurrency is not how many a file opens over its
 * lifetime but how many exist at once, because that is what occupies memory
 * while the parent is trying to answer this worker's RPC inside its deadline.
 */
let peakOpen = 0;

/**
 * A database this file will close.
 *
 * `scope` says who owns it, and the hooks do the rest; the default is per-test because all but
 * two of the call sites are. `runner` says who applies the migrations — see `DatabaseRunner`.
 * Registration happens before the hosted setup runs, so a setup that throws cannot leak one.
 */
export async function openDatabase(
  scope: DatabaseScope = "test",
  runner: DatabaseRunner = "superuser",
): Promise<PGlite> {
  const db = await new PGlite();
  owned[scope].push({ db, closed: false });
  created += 1;
  peakOpen = Math.max(peakOpen, owned.test.length + owned.suite.length);
  if (runner === "hosted") await becomeHostedPostgres(db);
  return db;
}

/** Idempotent: an entry already closed is skipped, never closed twice. */
async function closeScope(scope: DatabaseScope): Promise<void> {
  const mine = owned[scope].splice(0, owned[scope].length);
  for (const entry of mine) {
    if (entry.closed) continue;
    entry.closed = true;
    try {
      await entry.db.close();
      closed += 1;
    } catch {
      /*
       * Counted rather than swallowed. A database that would not close is a
       * finding — it is reported by `closeSuiteDatabases` — but throwing here
       * would abandon the instances after it in the list.
       */
      failedCloses += 1;
    }
  }
}

/** `afterEach`. Closes what this test opened and nothing a suite owns. */
export const closeTestDatabases = (): Promise<void> => closeScope("test");

/**
 * `afterAll`. Closes the suite's own databases, then accounts for every one.
 *
 * The accounting is the point: a count of instances opened that does not equal
 * the count accounted for means one is still alive, and a leak that is not
 * asserted is a leak that comes back.
 */
export async function closeSuiteDatabases(): Promise<void> {
  await closeScope("suite");

  const problems: string[] = [];
  if (owned.test.length > 0) {
    problems.push(`${String(owned.test.length)} per-test database(s) were never closed`);
  }
  if (closed + failedCloses !== created) {
    problems.push(
      `opened ${String(created)}, accounted for ${String(closed + failedCloses)} — the rest are still alive`,
    );
  }
  if (failedCloses > 0) problems.push(`${String(failedCloses)} database(s) failed to close`);

  /*
   * The worker's own three integers, for a diagnostic run that asked for them.
   *
   * Written BEFORE the accounting throws, because a run that leaked is exactly
   * the run whose numbers are worth having. One file per worker, so nothing
   * depends on concurrent appends being atomic, and three integers is all it
   * holds — no suite name, no path, no output.
   */
  const dir = process.env["OBSERVER_PGLITE_STATS"];
  if (dir !== undefined && dir !== "") {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${randomBytes(8).toString("hex")}.json`),
        `${JSON.stringify({ created, closed, peakOpen })}
`,
        "utf8",
      );
    } catch {
      /* Diagnostics must not be able to fail a test run. */
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
}

export interface DatabaseLifecycle {
  readonly created: number;
  readonly closed: number;
  readonly failedCloses: number;
  readonly openTest: number;
  readonly openSuite: number;
  readonly peakOpen: number;
}

/** The counters, for the lifecycle tests and for nothing else. */
export const databaseLifecycle = (): DatabaseLifecycle => ({
  created,
  closed,
  failedCloses,
  openTest: owned.test.length,
  openSuite: owned.suite.length,
  peakOpen,
});

/** Test-only. Vitest isolates modules per file, so this affects one file. */
export function resetDatabaseLifecycle(): void {
  owned.test.length = 0;
  owned.suite.length = 0;
  created = 0;
  closed = 0;
  failedCloses = 0;
  peakOpen = 0;
}
