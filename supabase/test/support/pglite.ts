import { PGlite } from "@electric-sql/pglite";

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

interface Owned {
  readonly db: PGlite;
  closed: boolean;
}

const owned: Record<DatabaseScope, Owned[]> = { test: [], suite: [] };
let created = 0;
let closed = 0;
let failedCloses = 0;

/**
 * A database this file will close.
 *
 * `scope` is the whole of the interface: say who owns it, and the hooks do the
 * rest. The default is per-test because all but two of the call sites are.
 */
export async function openDatabase(scope: DatabaseScope = "test"): Promise<PGlite> {
  const db = await new PGlite();
  owned[scope].push({ db, closed: false });
  created += 1;
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
  if (problems.length > 0) throw new Error(problems.join("; "));
}

export interface DatabaseLifecycle {
  readonly created: number;
  readonly closed: number;
  readonly failedCloses: number;
  readonly openTest: number;
  readonly openSuite: number;
}

/** The counters, for the lifecycle tests and for nothing else. */
export const databaseLifecycle = (): DatabaseLifecycle => ({
  created,
  closed,
  failedCloses,
  openTest: owned.test.length,
  openSuite: owned.suite.length,
});

/** Test-only. Vitest isolates modules per file, so this affects one file. */
export function resetDatabaseLifecycle(): void {
  owned.test.length = 0;
  owned.suite.length = 0;
  created = 0;
  closed = 0;
  failedCloses = 0;
}
