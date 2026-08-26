import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The deployed-build compatibility proof, executed against seeded rows.
 *
 * `observer-http-compat-proof.sql` is what an operator runs at rollout steps 4
 * and 5 to establish that the deployed `3f298a6` build still answers after
 * migration 3 changes `admit_ai_request` from thirteen parameters to fifteen.
 * The HTTP half of that cannot be simulated here — there is no PostgREST and no
 * deployment — but the SQL half can, and the SQL half is where the previous
 * version was wrong.
 *
 * It read the newest audit row: `order by occurred_at desc limit 1`. That is
 * not a proof, it is a guess. A second browser tab, a crawler, a retry or
 * another reviewer writes a row in the same window and the guess reports on
 * theirs instead — a verification step that can pass by reading somebody else's
 * data verifies nothing.
 *
 * What is proven below: the correlation requires EXACTLY ONE match, and both
 * ways of not having exactly one are failures rather than a row to pick from.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const PROOF = join(import.meta.dirname, "..", "verifiers", "observer-http-compat-proof.sql");

const CONTRACT = "20260826090000_observer_audit_facade_cleanup.sql";
const RETENTION = "20260826140000_observer_bucket_retention.sql";
const KEY_ID = "0123456789abcdef";

interface Row {
  readonly "#": number;
  readonly check: string;
  readonly expected: string;
  readonly actual: string;
  readonly verdict: string;
}

/**
 * Part B of the operator's file, with its two placeholders filled in.
 *
 * Sliced out of the real artefact rather than retyped, so this tests the SQL
 * the operator actually pastes. If somebody edits the file and forgets the
 * placeholders, the slice fails loudly rather than testing a copy.
 */
function partB(floor: string, questionChars: number): string {
  const text = readFileSync(PROOF, "utf8");
  const start = text.indexOf("with params as (");
  const end = text.indexOf(" order by ord;", start);
  if (start < 0 || end < 0) throw new Error("part B not found in the proof file");

  const query = text.slice(start, end + " order by ord;".length);
  if (!query.includes("'2026-08-26 12:34:56.789+00'")) {
    throw new Error("the floor placeholder is gone");
  }
  return query
    .replace("'2026-08-26 12:34:56.789+00'", `'${floor}'`)
    .replace(
      "         41                                        as question_chars,",
      `         ${questionChars} as question_chars,`,
    );
}

async function database(): Promise<PGlite> {
  const db = await new PGlite();
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
 * One request through the real admission function, then completed — the shape
 * the deployed build produces: thirteen arguments, so version 1 and the global
 * hash through the defaults.
 */
async function ask(
  db: PGlite,
  opts: {
    id: string;
    tenant?: string;
    chars?: number;
    clientHash?: string;
    complete?: boolean;
  },
): Promise<void> {
  await db.exec("set role service_role");
  await db.query(
    `select public.admit_ai_request($1, 'subject-x', $2, 'alpha/northgate',
       100, 600, 1200, 5000, $3, 'northgate', 'developer', $4, $5)`,
    [opts.id, opts.clientHash ?? "global-hash", opts.tenant ?? "alpha", opts.chars ?? 41, KEY_ID],
  );
  if (opts.complete !== false) {
    await db.query(
      `select public.complete_ai_request($1, 'answered', 'model', 'openai', 'gpt-5.6-sol',
         true, true, 'gpt-5.6-sol', null, '{summarize_showroom_period}', 1, 900, 120, 4300)`,
      [opts.id],
    );
  }
  await db.exec("reset role");
}

async function floorNow(db: PGlite): Promise<string> {
  const r = await db.query<{ t: string }>(`select clock_timestamp()::text as t`);
  return r.rows[0]?.t ?? "";
}

async function proof(db: PGlite, floor: string, chars = 41): Promise<readonly Row[]> {
  return (await db.query<Row>(partB(floor, chars))).rows;
}

const failed = (rows: readonly Row[]) =>
  rows.filter((r) => r.verdict === "FAIL").map((r) => r["#"]);

describe("the deployed-build proof, on the row the deployed build would write", () => {
  it("passes on exactly one matching request", async () => {
    const db = await database();
    const floor = await floorNow(db);
    await ask(db, { id: "aaaaaaaa-0000-4000-8000-000000000001" });

    const rows = await proof(db, floor);
    expect(rows).toHaveLength(9);
    expect(failed(rows)).toEqual([]);
  });

  it("reports version 1 and the global hash, which is what 3f298a6 derives", async () => {
    const db = await database();
    const floor = await floorNow(db);
    await ask(db, { id: "aaaaaaaa-0000-4000-8000-000000000002" });

    const rows = await proof(db, floor);
    expect(rows.find((r) => r["#"] === 2)?.actual).toBe("2"); // audit_version
    expect(rows.find((r) => r["#"] === 3)?.actual).toBe("1"); // pseudonym_version
    expect(rows.find((r) => r["#"] === 5)?.actual).toBe("complete");
  });

  it("prints no fingerprint, subject or key anywhere in its output", async () => {
    /*
     * The bundle and the operator's screen must not carry a pseudonym. Every
     * identifier is compared, never selected, so the only values that can
     * appear are booleans, counts, versions and slugs.
     */
    const db = await database();
    const floor = await floorNow(db);
    await ask(db, {
      id: "aaaaaaaa-0000-4000-8000-000000000003",
      clientHash: "a-secret-looking-fingerprint",
    });

    const emitted = JSON.stringify(await proof(db, floor));
    expect(emitted).not.toContain("a-secret-looking-fingerprint");
    expect(emitted).not.toContain("subject-x");
    expect(emitted).not.toContain(KEY_ID);
  });
});

describe("the correlation refuses to guess", () => {
  it("FAILS on zero matching rows rather than reporting nothing happened", async () => {
    const db = await database();
    const floor = await floorNow(db);
    // The question was never asked, or was asked at a different length.
    await ask(db, { id: "bbbbbbbb-0000-4000-8000-000000000001", chars: 12 });

    const rows = await proof(db, floor);
    expect(rows.find((r) => r["#"] === 1)?.actual).toBe("0 — proof void");
    expect(failed(rows)).toContain(1);
  });

  it("FAILS on two matching rows rather than picking the newest", async () => {
    /*
     * The defect. Two rows in the window match every controlled property — a
     * retry, a second tab, another reviewer — and the previous procedure would
     * have silently reported on whichever was newest.
     */
    const db = await database();
    const floor = await floorNow(db);
    await ask(db, { id: "cccccccc-0000-4000-8000-000000000001" });
    await ask(db, { id: "cccccccc-0000-4000-8000-000000000002" });

    const rows = await proof(db, floor);
    expect(rows.find((r) => r["#"] === 1)?.actual).toBe("2 — proof void");
    expect(failed(rows)).toContain(1);
    // And row 9 says the same thing from the other direction.
    expect(rows.find((r) => r["#"] === 9)?.actual).toBe("2");
  });

  it("ignores a row that existed before the floor, however recent", async () => {
    const db = await database();
    // Written first, matching every property — and outside the window.
    await ask(db, { id: "dddddddd-0000-4000-8000-000000000001" });
    const floor = await floorNow(db);
    await ask(db, { id: "dddddddd-0000-4000-8000-000000000002" });

    const rows = await proof(db, floor);
    expect(failed(rows)).toEqual([]);
    expect(rows.find((r) => r["#"] === 9)?.actual).toBe("1");
  });

  it("ignores a row from another tenant, project, role or question length", async () => {
    const db = await database();
    const floor = await floorNow(db);
    await ask(db, { id: "eeeeeeee-0000-4000-8000-000000000001" });
    // Same window, same length, different tenant: it is the sibling row, not a
    // second candidate.
    await ask(db, { id: "eeeeeeee-0000-4000-8000-000000000002", tenant: "beta" });
    // Same window, same tenant, different length.
    await ask(db, { id: "eeeeeeee-0000-4000-8000-000000000003", chars: 7 });

    const rows = await proof(db, floor);
    expect(rows.find((r) => r["#"] === 1)?.actual).toBe("exactly 1");
  });
});

describe("the optional cross-tenant evidence", () => {
  it("passes untried when no sibling row exists", async () => {
    const db = await database();
    const floor = await floorNow(db);
    await ask(db, { id: "ffffffff-0000-4000-8000-000000000001" });

    const rows = await proof(db, floor);
    expect(rows.find((r) => r["#"] === 8)?.verdict).toBe("PASS");
  });

  it("passes when one browser gives both tenants the same global hash", async () => {
    const db = await database();
    const floor = await floorNow(db);
    await ask(db, { id: "ffffffff-0000-4000-8000-000000000002", clientHash: "one-browser" });
    await ask(db, {
      id: "ffffffff-0000-4000-8000-000000000003",
      tenant: "beta",
      clientHash: "one-browser",
    });

    const rows = await proof(db, floor);
    expect(rows.find((r) => r["#"] === 8)?.verdict).toBe("PASS");
  });

  it("FAILS when the two hashes differ, because a v1 row must be tenant-blind", async () => {
    /*
     * After step 9 this inverts: the new build derives a tenant-scoped
     * fingerprint and DIFFERENT is what it must read. Before then, different
     * hashes on version-1 rows would mean the stored value is not the global
     * one the row claims.
     */
    const db = await database();
    const floor = await floorNow(db);
    await ask(db, { id: "ffffffff-0000-4000-8000-000000000004", clientHash: "alpha-scoped" });
    await ask(db, {
      id: "ffffffff-0000-4000-8000-000000000005",
      tenant: "beta",
      clientHash: "beta-scoped",
    });

    const rows = await proof(db, floor);
    const row = rows.find((r) => r["#"] === 8);
    expect(row?.verdict).toBe("FAIL");
    expect(row?.actual).toBe("DIFFERENT — the stored hash is not the global one");
  });
});
