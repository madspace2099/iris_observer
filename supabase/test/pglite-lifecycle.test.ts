import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  openDatabase,
  closeTestDatabases,
  closeSuiteDatabases,
  databaseLifecycle,
} from "./support/pglite";

/**
 * Who closes a WASM Postgres, proved rather than assumed.
 *
 * The suite opened roughly 145 of these per run and closed none. The parent
 * process then had to answer every worker's `onTaskUpdate` RPC inside its
 * timeout on a machine with three figures of megabytes left, and when it could
 * not, Vitest recorded an unhandled error and exited 1 — beside a JSON report
 * that said 1265 passed and nothing failed, because that reporter discards the
 * unhandled-error list it is handed.
 *
 * These are the assertions that keep the correction from quietly regressing.
 * They exercise the real helper with real instances, because the behaviour
 * under test is what `close()` does and not what a double would be told to say.
 */

const suiteScoped: { db: PGlite | null } = { db: null };

beforeAll(async () => {
  /* The one thing in this file that a single test must not close. */
  suiteScoped.db = await openDatabase("suite");
}, 60_000);

afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

describe("a per-test database is closed by the test that opened it", () => {
  it("is open while the test runs, and is registered against this test", async () => {
    const before = databaseLifecycle();
    const db = await openDatabase();
    await db.exec("select 1");
    const after = databaseLifecycle();
    expect(after.created).toBe(before.created + 1);
    expect(after.openTest).toBe(before.openTest + 1);
  });

  it("is closed before the next test starts", () => {
    /*
     * The previous test opened one and did not close it. `afterEach` did, and
     * this assertion runs after that hook — which is the only place the
     * property is observable.
     */
    expect(databaseLifecycle().openTest).toBe(0);
  });

  it("is closed exactly once, however often cleanup runs", async () => {
    await openDatabase();
    const opened = databaseLifecycle();
    await closeTestDatabases();
    const once = databaseLifecycle();
    expect(once.closed).toBe(opened.closed + 1);

    /* Idempotent: nothing left to close, and no second close counted. */
    await closeTestDatabases();
    expect(databaseLifecycle().closed).toBe(once.closed);
    expect(databaseLifecycle().openTest).toBe(0);
  });

  it("is closed even when the test that opened it then throws", async () => {
    /*
     * Registration happens the moment the instance exists, before the caller
     * can do anything with it, so a failure afterwards cannot leak one. That is
     * why this is registered cleanup rather than a `try/finally` repeated at
     * every one of the call sites.
     */
    const before = databaseLifecycle().openTest;
    await expect(
      (async () => {
        await openDatabase();
        throw new Error("the test failed after opening a database");
      })(),
    ).rejects.toThrow(/failed after opening/);
    expect(databaseLifecycle().openTest).toBe(before + 1);
  });

  it("shows the leaked instance from the failing test was cleaned up after it", () => {
    expect(databaseLifecycle().openTest).toBe(0);
  });
});

describe("a suite-scoped database outlives every individual test", () => {
  it("is not closed by per-test cleanup", async () => {
    await closeTestDatabases();
    expect(databaseLifecycle().openSuite).toBe(1);
  });

  it("is still usable in a later test, which is the whole reason for the scope", async () => {
    /* Closing this in `afterEach` would break every test after the first. */
    const rows = await suiteScoped.db?.query<{ n: number }>("select 1 as n");
    expect(rows?.rows[0]?.n).toBe(1);
  });

  it("is still open at the end of the last test, for `afterAll` to close", () => {
    expect(databaseLifecycle().openSuite).toBe(1);
  });

  it("accounts for every instance it opened", () => {
    /*
     * `closeSuiteDatabases` throws unless opened equals accounted-for, so the
     * suite's own `afterAll` is the assertion. This states the invariant it
     * checks, so a reader does not have to find the hook to know it exists.
     */
    const l = databaseLifecycle();
    expect(l.created).toBeGreaterThan(0);
    expect(l.failedCloses).toBe(0);
    expect(l.closed + l.openTest + l.openSuite).toBe(l.created);
  });
});
