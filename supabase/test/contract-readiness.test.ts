import type { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { openDatabase, closeTestDatabases, closeSuiteDatabases } from "./support/pglite";

/*
 * CLOSE WHAT THE FIXTURES OPEN.
 *
 * Each of these is a Postgres compiled to WASM, and this file opens one per
 * case. Leaving them open leaves live handles in the forked worker, so the
 * worker does not exit on its own and Vitest tears the pool down underneath
 * it — and a message in flight on a closing IPC channel throws, which Vitest
 * records as an UNHANDLED ERROR and turns into exit code 1 while its JSON
 * report is already written and green. That is the whole of the runner-level
 * exit this suite could not explain.
 */
afterEach(closeTestDatabases);
afterAll(closeSuiteDatabases);

/**
 * The contract gate, and the column it was reading.
 *
 * The verifier asked `audit_version = 1 and request_id is null` and called the
 * answer "version-1 rows". That is the historical legacy-façade shape and
 * nothing else. The write this whole retirement exists to stop looks like this:
 *
 *     audit_version     = 2      <- the NEW audit path
 *     request_id        NOT NULL
 *     pseudonym_version = 1      <- the CROSS-TENANT-LINKABLE pseudonym
 *
 * A reachable `3f298a6` deployment produces exactly that. The old question
 * reported "no recent legacy write" while the exact thing it was meant to catch
 * was happening — a clean verdict over a live leak.
 *
 * `audit_version` says which audit SHAPE wrote the row. `pseudonym_version`
 * says which DERIVATION made its pseudonyms. Neither implies the other. The
 * tests below assert both axes separately and assert that they cannot be
 * confused.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const GATE = join(import.meta.dirname, "..", "verifiers", "observer-contract-readiness.sql");

const CONTRACT = "20260826090000_observer_audit_facade_cleanup.sql";
const RETENTION = "20260826140000_observer_bucket_retention.sql";
const KEY_ID = "0123456789abcdef";
const GATE_SQL = readFileSync(GATE, "utf8");

interface Row {
  readonly "#": number;
  readonly check: string;
  readonly finding: string;
}

/** The operator's file with its one parameter substituted. */
function query(floor: string | null): string {
  const start = GATE_SQL.indexOf("with params as (");
  const end = GATE_SQL.indexOf(" order by ord;", start);
  if (start < 0 || end < 0) throw new Error("query not found in the gate file");
  const text = GATE_SQL.slice(start, end + " order by ord;".length);
  const placeholder = "'2026-08-27 00:00:00+00'::timestamptz";
  if (!text.includes(placeholder)) throw new Error("the floor placeholder is gone");
  return text.replace(
    placeholder,
    floor === null ? "null::timestamptz" : `'${floor}'::timestamptz`,
  );
}

async function database(): Promise<PGlite> {
  const db = await openDatabase();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file === CONTRACT || file === RETENTION) continue;
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

/**
 * A historical legacy-façade row, written the way they really were.
 *
 * Through `record_ai_request`, which the expand migration rewrote to label its
 * rows `audit_version = 1` with no request id and no pseudonym scheme.
 */
async function facadeRow(db: PGlite): Promise<void> {
  await db.exec("set role service_role");
  await db.query(
    `select public.record_ai_request('subj','cli','alpha','northgate','developer',
       'answered','gpt-5.6-sol','{summarize_showroom_period}',1,900,120,4300,42)`,
  );
  await db.exec("reset role");
}

/**
 * The THIRTEEN-argument admission the deployed `3f298a6` build makes.
 *
 * Both scoped parameters reach the function through their defaults, so the row
 * records `audit_version = 2` with `pseudonym_version = 1`. This is the shape
 * the old question could not see.
 */
async function legacyPseudonymRow(db: PGlite, id: string): Promise<void> {
  await db.exec("set role service_role");
  await db.query(
    `select public.admit_ai_request($1, 'subject-x', 'global-hash', 'alpha/northgate',
       1000, 6000, 12000, 50000, 'alpha', 'northgate', 'agency_manager', 41, $2)`,
    [id, KEY_ID],
  );
  await db.exec("reset role");
}

/** The fifteen-argument call the scoped build makes: version 2. */
async function scopedRow(db: PGlite, id: string): Promise<void> {
  await db.exec("set role service_role");
  await db.query(
    `select public.admit_ai_request($1, 'subject-x', 'global-hash', 'alpha/northgate',
       1000, 6000, 12000, 50000, 'alpha', 'northgate', 'agency_manager', 41, $2, $3, 2)`,
    [id, KEY_ID, `scoped-${id.slice(0, 8)}`],
  );
  await db.exec("reset role");
}

/** Move every existing row back, so "before the floor" is expressible. */
async function ageEverything(db: PGlite): Promise<void> {
  await db.exec(`update observer.ai_requests set occurred_at = occurred_at - interval '2 hours'`);
}

async function floorNow(db: PGlite): Promise<string> {
  return (await db.query<{ t: string }>(`select clock_timestamp()::text as t`)).rows[0]?.t ?? "";
}

async function gate(db: PGlite, floor: string | null): Promise<readonly Row[]> {
  return (await db.query<Row>(query(floor))).rows;
}

const at = (rows: readonly Row[], n: number) => rows.find((r) => r["#"] === n)?.finding;
const verdict = (rows: readonly Row[]) => at(rows, 1) ?? "";

const ID = {
  a: "aaaaaaaa-0000-4000-8000-00000000000a",
  b: "bbbbbbbb-0000-4000-8000-00000000000b",
  c: "cccccccc-0000-4000-8000-00000000000c",
} as const;

/* --- 1. the shapes are genuinely different -------------------------------- */

describe("the three row shapes, read from the database that wrote them", () => {
  it("a legacy façade row is audit_version 1 with no request id and no scheme", async () => {
    const db = await database();
    await facadeRow(db);

    const r = await db.query<{ av: number; rid: string | null; pv: number | null }>(
      `select audit_version as av, request_id::text as rid, pseudonym_version as pv
         from observer.ai_requests`,
    );
    expect(r.rows[0]).toEqual({ av: 1, rid: null, pv: null });
  });

  it("a 13-argument admission is audit_version 2 with pseudonym_version 1", async () => {
    /*
     * The shape the old question could not see. `audit_version` is 2 — the new
     * audit path — while the pseudonym is the cross-tenant-linkable one.
     */
    const db = await database();
    await legacyPseudonymRow(db, ID.a);

    const r = await db.query<{ av: number; rid: string | null; pv: number | null }>(
      `select audit_version as av, request_id::text as rid, pseudonym_version as pv
         from observer.ai_requests`,
    );
    expect(r.rows[0]?.av).toBe(2);
    expect(r.rows[0]?.rid).not.toBeNull();
    expect(r.rows[0]?.pv).toBe(1);
  });

  it("a scoped admission is audit_version 2 with pseudonym_version 2", async () => {
    const db = await database();
    await scopedRow(db, ID.a);

    const r = await db.query<{ av: number; pv: number | null }>(
      `select audit_version as av, pseudonym_version as pv from observer.ai_requests`,
    );
    expect(r.rows[0]).toEqual({ av: 2, pv: 2 });
  });
});

/* --- 2. the gate reads both axes ------------------------------------------ */

describe("the gate judges both version axes after the floor", () => {
  it("is INCONCLUSIVE on an empty database", async () => {
    const db = await database();
    const rows = await gate(db, await floorNow(db));

    expect(verdict(rows)).toMatch(/^INCONCLUSIVE/);
    expect(at(rows, 3)).toBe("0");
    expect(at(rows, 6)).toBe("0");
  });

  it("is NO-GO on a legacy-façade row after the floor", async () => {
    const db = await database();
    const floor = await floorNow(db);
    await facadeRow(db);

    const rows = await gate(db, floor);
    expect(verdict(rows)).toMatch(/^NO-GO/);
    expect(at(rows, 3)).toBe("1");
    expect(at(rows, 4)).not.toBe("none");
  });

  it("is NO-GO on a version-1 PSEUDONYM row after the floor — the defect", async () => {
    /*
     * `audit_version = 2`, so the old question saw nothing. This is a fresh
     * cross-tenant-linkable write from a reachable 3f298a6 deployment, and it
     * is precisely what the retirement exists to stop.
     */
    const db = await database();
    const floor = await floorNow(db);
    await legacyPseudonymRow(db, ID.a);

    const rows = await gate(db, floor);
    expect(verdict(rows)).toMatch(/^NO-GO/);
    // Axis 1 is silent — which is exactly why axis 2 has to exist.
    expect(at(rows, 3)).toBe("0");
    expect(at(rows, 6)).toBe("1");
  });

  it("would have read clean under the old single-axis question", async () => {
    const db = await database();
    await legacyPseudonymRow(db, ID.a);

    const old = await db.query<{ n: number }>(
      `select count(*)::int as n from observer.ai_requests
        where audit_version = 1 and request_id is null`,
    );
    expect(old.rows[0]?.n).toBe(0);
  });

  it("stays INCONCLUSIVE on a scoped row after the floor", async () => {
    const db = await database();
    const floor = await floorNow(db);
    await scopedRow(db, ID.a);

    const rows = await gate(db, floor);
    expect(verdict(rows)).toMatch(/^INCONCLUSIVE/);
    expect(at(rows, 10)).toBe("1");
  });
});

/* --- 3. the floor, and the controlled proof it protects ------------------- */

describe("the retirement floor separates the proof from the leak", () => {
  it("does not count the controlled version-1 proof written before it", async () => {
    /*
     * The rollout REQUIRES a version-1 row: the legacy compatibility phase
     * writes one deliberately. Counting it would make a permanent false NO-GO
     * out of a step that must happen.
     */
    const db = await database();
    await legacyPseudonymRow(db, ID.a);
    await ageEverything(db);
    const floor = await floorNow(db);

    const rows = await gate(db, floor);
    expect(verdict(rows)).toMatch(/^INCONCLUSIVE/);
    expect(at(rows, 6)).toBe("0");
    // Reported as context, in its own row, never as a verdict.
    expect(at(rows, 8)).toBe("1");
    expect(at(rows, 9)).toBe("1");
  });

  it("counts one before and one after, separately", async () => {
    const db = await database();
    await legacyPseudonymRow(db, ID.a);
    await ageEverything(db);
    const floor = await floorNow(db);
    await legacyPseudonymRow(db, ID.b);

    const rows = await gate(db, floor);
    expect(verdict(rows)).toMatch(/^NO-GO/);
    expect(at(rows, 6)).toBe("1");
    expect(at(rows, 8)).toBe("1");
    expect(at(rows, 9)).toBe("2");
  });

  it("refuses a null floor rather than judging without one", async () => {
    const db = await database();
    await legacyPseudonymRow(db, ID.a);

    const rows = await gate(db, null);
    expect(verdict(rows)).toMatch(/^UNUSABLE FLOOR/);
    expect(at(rows, 2)).toContain("unusable");
  });

  it("refuses a floor in the future", async () => {
    /*
     * A future floor makes every row "before" it, so every gate passes. That is
     * the one way to get a clean verdict out of a dirty database by typing a
     * date, and it is refused rather than answered.
     */
    const db = await database();
    await legacyPseudonymRow(db, ID.a);

    const rows = await gate(db, "2099-01-01 00:00:00+00");
    expect(verdict(rows)).toMatch(/^UNUSABLE FLOOR/);
  });
});

/* --- 4. what it must never say, and never print --------------------------- */

describe("the gate never says READY, and never prints an identifier", () => {
  it("has no READY verdict anywhere in the file or its output", async () => {
    /*
     * No verdict LITERAL may begin with READY or a bare GO. Matching `\bGO\b`
     * loosely would flag the `GO` inside `NO-GO`, which is the verdict that
     * must exist — so the check is anchored to the opening quote of a literal.
     */
    expect(GATE_SQL).not.toMatch(/'\s*READY\b/);
    expect(GATE_SQL).not.toMatch(/'\s*GO\b/);
    expect(GATE_SQL).toContain("'NO-GO — a version-1 writer was still reachable");

    const db = await database();
    await scopedRow(db, ID.a);
    const rendered = JSON.stringify(await gate(db, await floorNow(db)));
    expect(rendered).not.toMatch(/\bREADY\b/);
  });

  it("says in its own output that it cannot establish the gate", async () => {
    const db = await database();
    const rows = await gate(db, await floorNow(db));
    expect(at(rows, 14)).toMatch(/which deployments exist and can still be reached/i);
  });

  it("states that this migration does not close the 13-argument door", async () => {
    const db = await database();
    const rows = await gate(db, await floorNow(db));
    expect(at(rows, 12)).toMatch(/NO — the defaults keep it resolving/);
    expect(at(rows, 12)).toMatch(/must be DELETED/);
  });

  it("requires pagination exhaustion and re-enumeration in its own text", async () => {
    const db = await database();
    const rows = await gate(db, await floorNow(db));
    expect(at(rows, 13)).toMatch(/PAGINATION EXHAUSTION/i);
    expect(at(rows, 13)).toMatch(/re-enumerate after deletion/i);
  });

  it("emits no request id, subject, client hash or key id", async () => {
    const db = await database();
    await db.exec("set role service_role");
    await db.query(
      `select public.admit_ai_request($1, 'subject-secret', 'hash-secret', 'alpha/northgate',
         1000, 6000, 12000, 50000, 'alpha', 'northgate', 'agency_manager', 41, $2, $3, 2)`,
      [ID.c, KEY_ID, "scoped-secret"],
    );
    await db.exec("reset role");

    const rendered = JSON.stringify(await gate(db, await floorNow(db)));
    expect(rendered).not.toContain(ID.c);
    expect(rendered).not.toContain("subject-secret");
    expect(rendered).not.toContain("hash-secret");
    expect(rendered).not.toContain("scoped-secret");
    expect(rendered).not.toContain(KEY_ID);
  });

  it("never conflates the two axes in its own labels", () => {
    // Each axis names its own column, so a reader cannot mistake one for the
    // other the way the previous edition invited.
    expect(GATE_SQL).toContain("AXIS 1 · audit_version = 1");
    expect(GATE_SQL).toContain("AXIS 2 · pseudonym_version = 1");
  });
});
