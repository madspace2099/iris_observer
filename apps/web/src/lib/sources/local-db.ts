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
 * ## Why the connection IS on `globalThis`
 *
 * It began as a module-level promise, on the reasoning that a process global is
 * a thing to avoid and hot reload would reconnect to the same directory anyway.
 * That was wrong, and the frontend found it.
 *
 * Next gives the server-action bundle and the RSC bundle separate module
 * registries, so this file was evaluated TWICE in one process and opened TWO
 * PGlite instances on the same data directory. Activation, heartbeat and
 * ingestion all answered 200 — the writer worked perfectly — while every screen
 * kept reading "not activated", because the reader was a different instance
 * that had loaded the directory before those writes and never saw them.
 *
 * A database connection has to be one per process, and `globalThis` is the only
 * thing in Node that spans bundles. `ai/limits.ts` is on the same allow-list for
 * the same bundle-boundary reason, which is what that list is for: making each
 * such file a deliberate, reviewed decision rather than a habit.
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
 * A date rather than a hand-listed set of filenames, so the next control-plane
 * migration is picked up without an edit here — and a date is the right
 * boundary because that is what actually separates the two groups.
 *
 * FROM that month on, not that month only. It was a prefix match, which would
 * have skipped the first migration written in October without a word.
 */
const CONTROL_PLANE_FROM = "202609";

function migrationFiles(): readonly string[] {
  return readdirSync(join(repositoryRoot(), "supabase", "migrations"))
    .filter(
      (f) => f.endsWith(".sql") && f.slice(0, CONTROL_PLANE_FROM.length) >= CONTROL_PLANE_FROM,
    )
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

/**
 * The one connection, keyed on a symbol so nothing else can collide with it.
 *
 * Typed through a narrow interface rather than `any`: what is stored is a
 * promise for the port, and nothing else about `globalThis` is assumed.
 */
const CONNECTION = Symbol.for("observer.local-control-plane.connection");

/**
 * The port and the raw query it was built from, together.
 *
 * The catalogue connectors have their own port over the same façade style
 * (`@observer/connectors`), and it is built from the same query function —
 * one PGlite, two ports, never two databases on one directory.
 */
interface LocalConnection {
  readonly db: ObserverDb;
  readonly query: SqlQuery;
}

interface ConnectionHolder {
  [CONNECTION]?: Promise<LocalConnection> | undefined;
}

const holder = globalThis as unknown as ConnectionHolder;

async function connect(): Promise<LocalConnection> {
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

  return { db: pgliteDb(query), query };
}

/**
 * The local control-plane database, or null when this process may not have one.
 *
 * Returns the same instance for the lifetime of the module. A failure to open
 * is not cached: a missing directory or a half-written migration should be
 * retryable by reloading the page rather than by restarting the server.
 */
export async function localControlPlaneDb(): Promise<ObserverDb | null> {
  const connection = await localConnection();
  return connection === null ? null : connection.db;
}

/** The same connection's raw query, for the catalogue port. Null under the same gates. */
export async function localControlPlaneQuery(): Promise<SqlQuery | null> {
  const connection = await localConnection();
  return connection === null ? null : connection.query;
}

async function localConnection(): Promise<LocalConnection | null> {
  if (!localControlPlaneEnabled()) return null;

  const existing = holder[CONNECTION];
  if (existing !== undefined) return existing;

  const opening = connect().catch((error: unknown) => {
    /*
     * A failure is not cached: a missing directory or a half-written migration
     * should be retryable by reloading the page rather than by restarting the
     * server.
     */
    holder[CONNECTION] = undefined;
    throw error;
  });
  holder[CONNECTION] = opening;
  return opening;
}
