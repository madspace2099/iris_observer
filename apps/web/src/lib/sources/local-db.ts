import "server-only";

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { pgliteDb, type ObserverDb, type SqlQuery } from "@observer/sources";

/**
 * A real Postgres for the control plane, running inside the dev server.
 *
 * ## Why this exists
 *
 * The operations screens have to read and mutate the same state the three
 * endpoints do — the same tables, through the same `security definer` facades.
 * Anything less is a mockup with a database-shaped hole in it, and the one
 * thing this milestone must not produce is a screen that looks right and is
 * describing nothing.
 *
 * There is no hosted database to point at. `DATABASE_URL` is absent, the hosted
 * projects are out of bounds, and ADR-0008 records that Docker is not installed
 * here so `supabase start` cannot run. PGlite is the same WASM Postgres the
 * migration suites already use, and it runs in-process — so the dev server can
 * hold one and the UI can be honest.
 *
 * ## What makes this safe to ship in the tree
 *
 * Three gates, and all three must open:
 *
 *   - `NODE_ENV` is not `production`;
 *   - `OBSERVER_LOCAL_CONTROL_PLANE` is set;
 *   - the import is dynamic, so a production build never pulls the WASM in.
 *
 * `next.config.ts` also lists the package as server-external, so it is never
 * considered for the browser bundle at all. A production deployment reaches
 * Postgres through `postgrestDb` and never evaluates a line of this file.
 *
 * ## Why the data lives on disk
 *
 * An in-memory database would reset on every hot reload, and the flow this
 * milestone exists to demonstrate — activate, heartbeat, verify, suspend,
 * resume — is a sequence across several minutes and several page loads. A
 * status that vanishes when a file is saved cannot be reviewed.
 *
 * So it persists under `.observer-local/`, which is gitignored. Deleting that
 * directory is the reset button, and it is the only one: there is deliberately
 * no "wipe" action in the UI, because a button that destroys an operator's
 * state is not something to put beside the buttons that do real work.
 *
 * ## No `globalThis`
 *
 * The cache below is a module-level promise, not a process global. Hot reload
 * replaces the module and the new one reconnects to the same directory, which
 * is the behaviour that actually matters — and `credentials.test.ts` keeps a
 * short, deliberate list of files allowed to reach for process-global state.
 * This is not one of them, and it does not need to be.
 */

/** The three roles Supabase provides, which the migrations grant against. */
const SUPABASE_ROLES = `
  do $$ begin
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      create role service_role nologin bypassrls;
    end if;
  end $$;
`;

/**
 * Where the repository root is, found by walking up rather than counted in
 * `..` segments.
 *
 * Two things rule out the obvious answers. `import.meta.dirname` is `undefined`
 * inside a module Next has bundled, which is where this code actually runs —
 * the first version of this file used it and threw `ERR_INVALID_ARG_TYPE` on
 * the first request. And `process.cwd()` is `apps/web` under `pnpm --filter`
 * but the repository root when the same command is run from the top, so a
 * fixed relative path is right in one of those and wrong in the other.
 *
 * Walking up until `supabase/migrations` appears is true in both, and fails
 * with a sentence naming what it looked for rather than with a path error.
 */
function repositoryRoot(): string {
  let dir = process.cwd();
  for (let up = 0; up < 8; up += 1) {
    if (existsSync(join(dir, "supabase", "migrations"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `local control plane: no supabase/migrations found above ${process.cwd()}. ` +
      "The dev server must run inside the Observer repository.",
  );
}

/**
 * Which migrations the control plane needs, in filename order.
 *
 * NOT every migration in the directory, and the first version of this file made
 * exactly that mistake. Two of the earlier ones cannot apply to a bare PGlite
 * and are right to refuse:
 *
 *   - `20260826140000_observer_bucket_retention` asserts `pg_cron` is installed
 *     and raises `feature_not_supported` when it is not, deliberately, so that
 *     a migration cannot claim retention it has no scheduler to perform;
 *   - `20260825154900_observer_ai_public_facade` writes to the Ask Observer
 *     audit table, whose shape a later migration completes.
 *
 * Neither belongs to the control plane. The source spine, activation,
 * credentials, events and operations are self-contained, which is why the
 * migration suites apply exactly this set and nothing else.
 *
 * A prefix rather than a hand-listed set of filenames, so the next control-plane
 * migration is picked up without an edit here — and a date is the right
 * boundary because that is what actually separates the two groups.
 */
const CONTROL_PLANE_PREFIX = "202609";

function migrationFiles(): readonly string[] {
  return readdirSync(join(repositoryRoot(), "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql") && f.startsWith(CONTROL_PLANE_PREFIX))
    .sort();
}

/**
 * Whether this process may run a local control plane at all.
 *
 * Exported because the UI needs to explain its absence rather than fail
 * mysteriously: a deployment without it should say so in words.
 */
export function localControlPlaneEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env["OBSERVER_LOCAL_CONTROL_PLANE"] === "1"
  );
}

/**
 * Where everything this machine keeps for the local control plane lives.
 *
 * Exported so that the demonstration estate's ledger and the source token
 * activation hands back land BESIDE the database they describe rather than in
 * a second directory with its own lifetime. That shared lifetime is what makes
 * the ledger trustworthy: there is no facade that lists projects, so a ledger
 * outliving its database would name a project id nothing could resolve, and
 * `rm -rf .observer-local` has to be able to reset all of it at once.
 */
export function observerLocalDirectory(): string {
  return join(repositoryRoot(), ".observer-local");
}

let cached: Promise<ObserverDb> | null = null;

async function connect(): Promise<ObserverDb> {
  /*
   * Dynamic, and this is the line that keeps the WASM out of a production
   * build. A static import would be resolved and bundled whatever the guards
   * above say at runtime.
   */
  const { PGlite } = await import("@electric-sql/pglite");

  const root = repositoryRoot();
  const dataDir = join(root, ".observer-local", "control-plane");

  /*
   * PGlite's own `mkdir` is not recursive, so it fails with ENOENT on the
   * FIRST run of a fresh clone — the one run where a helpful error matters
   * most. Creating the parent here costs a syscall and removes a setup step
   * nobody would have guessed at.
   */
  mkdirSync(dataDir, { recursive: true });

  const pg = await PGlite.create({ dataDir });

  /*
   * Applied every start, and safe to. Every migration in this repository is
   * written with `create ... if not exists`, `create or replace function` and
   * idempotent grants, because the same files are applied to a fresh PGlite by
   * every data test. A marker table would add a second source of truth about
   * what has run, and get it wrong the first time a migration is edited.
   */
  await pg.exec(SUPABASE_ROLES);
  for (const file of migrationFiles()) {
    await pg.exec(readFileSync(join(root, "supabase", "migrations", file), "utf8"));
  }

  const query: SqlQuery = async (sql, params) => {
    const result = await pg.query(sql, params as unknown[]);
    return { rows: result.rows as unknown[] };
  };

  return pgliteDb(query);
}

/**
 * The local control-plane database, or null when this process may not have one.
 *
 * Returns the same instance for the lifetime of the module. A failure to open
 * is not cached: a missing directory or a half-written migration should be
 * retryable by reloading the page rather than by restarting the server.
 */
export async function localControlPlaneDb(): Promise<ObserverDb | null> {
  if (!localControlPlaneEnabled()) return null;
  if (cached === null) {
    cached = connect().catch((error: unknown) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}
