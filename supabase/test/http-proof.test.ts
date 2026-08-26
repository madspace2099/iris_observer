import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The deployed-build compatibility proof, executed against seeded rows.
 *
 * `observer-http-compat-proof.sql` is what an operator runs at rollout steps
 * 4-5 (the deployed legacy build) and step 9 (the new build). The HTTP half
 * cannot be simulated here — there is no PostgREST and no deployment — but the
 * SQL half can, and every defect this round fixed was in the SQL half.
 *
 * Three of them are worth naming, because each would have produced a confident
 * wrong answer:
 *
 *  - THE QUESTION WAS THE WRONG LENGTH. The file declared "How did the
 *    northgate showroom perform?" to be 41 characters. It is 39. The
 *    correlation key would have matched nothing and the operator would have
 *    read "0 — proof void" with no idea why. Nobody counted it, so the length
 *    is now derived from the literal, here, by machine.
 *
 *  - TWO MODES WERE DOCUMENTED AND ONE WAS IMPLEMENTED. The prose told the
 *    operator to set `cross_tenant_done` — a parameter that did not exist — and
 *    said that after the new deployment two expectations were "inverted", while
 *    the executable SQL still expected `pseudonym_version = 1` and equal
 *    hashes. A verifier that requires its reader to mentally invert PASS and
 *    FAIL is a verifier that will be read wrong at three in the morning.
 *
 *  - THE ROW ACCOUNTING CONTRADICTED ITSELF. Doing the optional second-tenant
 *    request made row 8 pass and row 9 fail, because row 9 always expected
 *    exactly one audit row. The legitimate two-tenant mode could not return
 *    all-PASS.
 *
 * All four modes must now be able to read all-PASS, and every way of being
 * wrong is asserted over the COMPLETE failed-row set rather than one row.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const PROOF = join(import.meta.dirname, "..", "verifiers", "observer-http-compat-proof.sql");

const CONTRACT = "20260826090000_observer_audit_facade_cleanup.sql";
const RETENTION = "20260826140000_observer_bucket_retention.sql";
const KEY_ID = "0123456789abcdef";

const PROOF_SQL = readFileSync(PROOF, "utf8");

/* --- the canonical question --------------------------------------------- */

/**
 * The one place the fixed question is written down.
 *
 * Read out of the operator's own file, so the prose the operator types, the
 * default parameter the SQL carries and the fixture below cannot drift apart.
 * The expected length is DERIVED from the literal — never asserted as a number
 * somebody counted by hand, which is exactly how 39 came to be documented as
 * 41.
 */
function canonicalQuestion(): string {
  const m = PROOF_SQL.match(/^-- CANONICAL_QUESTION: (.+)$/m);
  if (m?.[1] === undefined) throw new Error("CANONICAL_QUESTION marker missing");
  return m[1];
}

const QUESTION = canonicalQuestion();
const QUESTION_CHARS = QUESTION.length;

/* --- driving the verifier ------------------------------------------------ */

interface Row {
  readonly "#": number;
  readonly check: string;
  readonly expected: string;
  readonly actual: string;
  readonly verdict: string;
}

interface Params {
  readonly floorTs: string;
  readonly auditRowsBefore: number;
  readonly expectedBuild: string;
  readonly crossTenantDone: boolean;
  readonly primaryTenant?: string;
  readonly primaryProject?: string;
  readonly siblingTenant?: string;
  readonly siblingProject?: string;
  readonly viewerRole?: string;
  readonly questionChars?: number;
  readonly primaryRequestId?: string | null;
  readonly siblingRequestId?: string | null;
}

const uuidLit = (v: string | null | undefined) => (v == null ? "null::uuid" : `'${v}'::uuid`);

/**
 * Part B of the operator's file with its parameter block swapped.
 *
 * Everything downstream of `mode as (` is the real artefact, unmodified — the
 * selection, the expectations and the verdict column are the ones the operator
 * runs. Only the values a human types are substituted.
 */
function partB(p: Params): string {
  const start = PROOF_SQL.indexOf("with params as (");
  const end = PROOF_SQL.indexOf(" order by ord;", start);
  if (start < 0 || end < 0) throw new Error("part B not found in the proof file");
  const query = PROOF_SQL.slice(start, end + " order by ord;".length);

  const paramsEnd = query.indexOf("\n),\n");
  if (paramsEnd < 0) throw new Error("params block not found");

  const block = `with params as (
  select
    '${p.floorTs}'::timestamptz as floor_ts,
    ${p.auditRowsBefore}::bigint as audit_rows_before,
    '${p.expectedBuild}'::text as expected_build,
    ${p.crossTenantDone} as cross_tenant_done,
    '${p.primaryTenant ?? "alpha"}'::text as primary_tenant,
    '${p.primaryProject ?? "northgate"}'::text as primary_project,
    '${p.siblingTenant ?? "beta"}'::text as sibling_tenant,
    '${p.siblingProject ?? "kingsford"}'::text as sibling_project,
    '${p.viewerRole ?? "agency_manager"}'::text as viewer_role,
    ${p.questionChars ?? QUESTION_CHARS} as question_chars,
    ${uuidLit(p.primaryRequestId)} as primary_request_id,
    ${uuidLit(p.siblingRequestId)} as sibling_request_id`;

  return block + query.slice(paramsEnd);
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

interface Ask {
  readonly id: string;
  readonly tenant?: string;
  readonly project?: string;
  readonly role?: string;
  readonly chars?: number;
  readonly globalHash?: string;
  /** Supplied => the 15-argument scoped call, so the row is version 2. */
  readonly scopedHash?: string;
}

/**
 * One request through the real admission function, then completed.
 *
 * Without `scopedHash` this is the THIRTEEN-argument call the deployed
 * `3f298a6` build makes: both new parameters reach the function through their
 * defaults, so the row records version 1 and the global hash. With it, the
 * fifteen-argument call the new build makes.
 */
async function ask(db: PGlite, o: Ask): Promise<void> {
  await db.exec("set role service_role");
  if (o.scopedHash === undefined) {
    await db.query(
      `select public.admit_ai_request($1, 'subject-x', $2, 'alpha/northgate',
         1000, 6000, 12000, 50000, $3, $4, $5, $6, $7)`,
      [
        o.id,
        o.globalHash ?? "global-hash",
        o.tenant ?? "alpha",
        o.project ?? "northgate",
        o.role ?? "agency_manager",
        o.chars ?? QUESTION_CHARS,
        KEY_ID,
      ],
    );
  } else {
    await db.query(
      `select public.admit_ai_request($1, 'subject-x', $2, 'alpha/northgate',
         1000, 6000, 12000, 50000, $3, $4, $5, $6, $7, $8, 2)`,
      [
        o.id,
        o.globalHash ?? "global-hash",
        o.tenant ?? "alpha",
        o.project ?? "northgate",
        o.role ?? "agency_manager",
        o.chars ?? QUESTION_CHARS,
        KEY_ID,
        o.scopedHash,
      ],
    );
  }
  await db.query(
    `select public.complete_ai_request($1, 'answered', 'model', 'openai', 'gpt-5.6-sol',
       true, true, 'gpt-5.6-sol', null, '{summarize_showroom_period}', 1, 900, 120, 4300)`,
    [o.id],
  );
  await db.exec("reset role");
}

async function floorNow(db: PGlite): Promise<string> {
  return (await db.query<{ t: string }>(`select clock_timestamp()::text as t`)).rows[0]?.t ?? "";
}

async function auditCount(db: PGlite): Promise<number> {
  return (
    (await db.query<{ n: number }>(`select count(*)::int as n from observer.ai_requests`)).rows[0]
      ?.n ?? 0
  );
}

async function proof(db: PGlite, p: Params): Promise<readonly Row[]> {
  return (await db.query<Row>(partB(p))).rows;
}

const failed = (rows: readonly Row[]) =>
  rows.filter((r) => r.verdict === "FAIL").map((r) => r["#"]);

const at = (rows: readonly Row[], n: number) => rows.find((r) => r["#"] === n);

/** A database, a floor and the baseline count, ready to seed. */
async function opened(): Promise<{ db: PGlite; floorTs: string; before: number }> {
  const db = await database();
  const before = await auditCount(db);
  return { db, floorTs: await floorNow(db), before };
}

const ID = {
  primary: "aaaaaaaa-0000-4000-8000-000000000001",
  primary2: "aaaaaaaa-0000-4000-8000-000000000002",
  sibling: "bbbbbbbb-0000-4000-8000-000000000001",
  sibling2: "bbbbbbbb-0000-4000-8000-000000000002",
  other: "cccccccc-0000-4000-8000-000000000001",
} as const;

/* --- 1. the canonical question ------------------------------------------- */

describe("the fixed question is one value, checked three ways", () => {
  it("has the declared JavaScript length, derived from the literal", () => {
    const declared = PROOF_SQL.match(/^-- CANONICAL_LENGTH:\s+(\d+)$/m)?.[1];
    expect(declared).toBeDefined();
    // The number in the file must equal the length of the literal in the file.
    // Neither is trusted on its own; the previous version failed exactly here.
    expect(Number(declared)).toBe(QUESTION.length);
    expect(QUESTION.length).toBe(41);
  });

  it("is ASCII only, so no encoding changes the count", () => {
    expect(QUESTION).toMatch(/^[\x20-\x7e]+$/);
    expect(Buffer.byteLength(QUESTION, "utf8")).toBe(QUESTION.length);
  });

  it("is the same text the instructions tell the operator to type", () => {
    // Once as the canonical marker, once in the prose block.
    expect(PROOF_SQL.match(new RegExp(QUESTION.replace(/[?]/g, "\\?"), "g"))).toHaveLength(2);
  });

  it("is the same number the default parameter carries", () => {
    const def = PROOF_SQL.match(/^\s+(\d+)\s+as question_chars,$/m)?.[1];
    expect(Number(def)).toBe(QUESTION.length);
  });

  it("is not the length the previous version claimed", () => {
    expect("How did the northgate showroom perform?".length).toBe(39);
  });
});

/* --- 2. every legitimate mode can read all-PASS --------------------------- */

describe("all four modes return a complete pass", () => {
  it("legacy build, one tenant", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(failed(rows)).toEqual([]);
    expect(at(rows, 5)?.actual).toBe("1");
    expect(at(rows, 11)?.actual).toBe("1");
    expect(at(rows, 13)?.actual).toBe("time + controlled properties (correlation)");
  });

  it("legacy build, two tenants — the same browser, so the hashes match", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, globalHash: "one-browser" });
    await ask(db, {
      id: ID.sibling,
      tenant: "beta",
      project: "kingsford",
      globalHash: "one-browser",
    });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: true,
    });
    expect(failed(rows)).toEqual([]);
    expect(at(rows, 10)?.actual).toBe("equal (global)");
    expect(at(rows, 11)?.actual).toBe("2");
  });

  it("scoped build, one tenant, selected by request id", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: false,
      primaryRequestId: ID.primary,
    });
    expect(failed(rows)).toEqual([]);
    expect(at(rows, 5)?.actual).toBe("2");
    expect(at(rows, 11)?.actual).toBe("1");
    expect(at(rows, 13)?.actual).toBe("request_id (exact)");
  });

  it("scoped build, two tenants — tenant-scoped, so the hashes differ", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });
    await ask(db, {
      id: ID.sibling,
      tenant: "beta",
      project: "kingsford",
      scopedHash: "beta-scoped",
    });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: true,
      primaryRequestId: ID.primary,
      siblingRequestId: ID.sibling,
    });
    expect(failed(rows)).toEqual([]);
    expect(at(rows, 10)?.actual).toBe("different (tenant-scoped)");
    expect(at(rows, 11)?.actual).toBe("2");
  });
});

/* --- 3. every way of being wrong, over the complete failed set ------------ */

describe("the correlation refuses to guess", () => {
  it("FAILS on a missing primary row", async () => {
    const { db, floorTs, before } = await opened();
    // Asked at a different length: nothing the operator controlled matches.
    await ask(db, { id: ID.primary, chars: 12 });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    // 2 no primary; 4-9 have no row to read; 11 the delta is 1 but the row is
    // unaccounted, so 12 names it.
    expect(failed(rows)).toEqual([2, 4, 5, 6, 7, 8, 9, 12]);
    expect(at(rows, 2)?.actual).toBe("0 — proof void");
  });

  it("FAILS on duplicate primary rows rather than picking one", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });
    await ask(db, { id: ID.primary2 });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(failed(rows)).toEqual([2, 11]);
    expect(at(rows, 2)?.actual).toBe("2 — proof void");
  });

  it("FAILS when cross_tenant_done is false and a sibling row exists anyway", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });
    await ask(db, { id: ID.sibling, tenant: "beta", project: "kingsford" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(failed(rows)).toEqual([11, 12]);
    expect(at(rows, 12)?.actual).toBe("beta/kingsford");
  });

  it("FAILS when cross_tenant_done is true and no sibling row exists", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: true,
    });
    expect(failed(rows)).toEqual([3, 10, 11]);
    expect(at(rows, 3)?.actual).toBe("0 — proof void");
  });

  it("FAILS when cross_tenant_done is true and several sibling rows exist", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });
    await ask(db, { id: ID.sibling, tenant: "beta", project: "kingsford" });
    await ask(db, { id: ID.sibling2, tenant: "beta", project: "kingsford" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: true,
    });
    expect(failed(rows)).toEqual([3, 10, 11]);
    expect(at(rows, 3)?.actual).toBe("2 — proof void");
  });

  it("does not accept a sibling from a third tenant or a different project", async () => {
    /*
     * The sibling is an exact tenant AND project pair. Defined by inequality —
     * "anything where tenant_slug <> alpha" — a row from an unrelated tenant
     * would have satisfied it, and the project slug the operator named would
     * never have been checked. There is no `beta/northgate` in the registry.
     */
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });
    await ask(db, { id: ID.sibling, tenant: "gamma", project: "elsewhere" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: true,
    });
    expect(at(rows, 3)?.actual).toBe("0 — proof void");
    expect(at(rows, 12)?.actual).toBe("gamma/elsewhere");
  });
});

describe("the mode decides the expectation, not the operator", () => {
  it("FAILS a legacy cross-tenant run whose hashes differ", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, globalHash: "alpha-only" });
    await ask(db, {
      id: ID.sibling,
      tenant: "beta",
      project: "kingsford",
      globalHash: "beta-only",
    });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: true,
    });
    expect(failed(rows)).toEqual([10]);
    expect(at(rows, 10)?.expected).toBe("equal (global)");
    expect(at(rows, 10)?.actual).toBe("different (tenant-scoped)");
  });

  it("FAILS a scoped cross-tenant run whose hashes are equal", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "same-hash" });
    await ask(db, {
      id: ID.sibling,
      tenant: "beta",
      project: "kingsford",
      scopedHash: "same-hash",
    });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: true,
      primaryRequestId: ID.primary,
      siblingRequestId: ID.sibling,
    });
    expect(failed(rows)).toEqual([10]);
    expect(at(rows, 10)?.expected).toBe("different (tenant-scoped)");
  });

  it("FAILS the wrong pseudonym version for the selected mode", async () => {
    const { db, floorTs, before } = await opened();
    // A legacy row, checked as though the new build had answered.
    await ask(db, { id: ID.primary });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: false,
      primaryRequestId: ID.primary,
    });
    expect(failed(rows)).toEqual([5]);
    expect(at(rows, 5)?.expected).toBe("2");
    expect(at(rows, 5)?.actual).toBe("1");
  });

  it("FAILS an undefined build name", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "whatever",
      crossTenantDone: false,
    });
    expect(failed(rows)).toContain(1);
    expect(at(rows, 1)?.actual).toContain("expected_build must be legacy or scoped");
  });

  it("FAILS a scoped run that falls back to correlation", async () => {
    /*
     * The new build hands the operator its request id. Verifying it by question
     * length instead would be choosing the weaker proof while the stronger one
     * is sitting in the response headers.
     */
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: false,
      primaryRequestId: null,
    });
    expect(failed(rows)).toContain(1);
    expect(at(rows, 1)?.actual).toContain("requires primary_request_id");
    expect(at(rows, 13)?.verdict).toBe("FAIL");
  });
});

describe("unrelated traffic cannot produce a false pass", () => {
  it("names an unrelated row in the window and fails the delta", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });
    await ask(db, { id: ID.other, tenant: "gamma", project: "elsewhere", chars: 7 });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(failed(rows)).toEqual([11, 12]);
    expect(at(rows, 11)?.actual).toBe("2");
    expect(at(rows, 12)?.actual).toBe("gamma/elsewhere");
  });

  it("never lets an unrelated row substitute for the controlled request", async () => {
    // The controlled request was never made. Only somebody else's row exists.
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.other, tenant: "gamma", project: "elsewhere" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(at(rows, 2)?.actual).toBe("0 — proof void");
    expect(at(rows, 12)?.actual).toBe("gamma/elsewhere");
  });

  it("ignores a row that existed before the floor, however recent", async () => {
    const db = await database();
    await ask(db, { id: ID.other });
    const before = await auditCount(db);
    const floorTs = await floorNow(db);
    await ask(db, { id: ID.primary });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(failed(rows)).toEqual([]);
  });
});

describe("exact identification, when the build offers it", () => {
  it("selects by request id even when two rows share every property", async () => {
    /*
     * The property-based correlation cannot tell these apart — that is the
     * limit of what the legacy mode can claim. The request id can, and this is
     * the difference the header buys.
     */
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });
    await ask(db, { id: ID.primary2, scopedHash: "alpha-scoped" });

    const correlated = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(at(correlated, 2)?.actual).toBe("2 — proof void");

    const exact = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: false,
      primaryRequestId: ID.primary,
    });
    expect(at(exact, 2)?.actual).toBe("exactly 1");
    expect(at(exact, 13)?.actual).toBe("request_id (exact)");
    // The second row is still counted: it is unaccounted traffic, not invisible.
    expect(at(exact, 12)?.actual).toBe("alpha/northgate");
  });
});

describe("the verifier prints nothing identifying", () => {
  it("emits no fingerprint, subject or key identifier", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, {
      id: ID.primary,
      globalHash: "a-secret-looking-fingerprint",
      scopedHash: "another-secret-looking-value",
    });

    const rendered = JSON.stringify(
      await proof(db, {
        floorTs,
        auditRowsBefore: before,
        expectedBuild: "scoped",
        crossTenantDone: false,
        primaryRequestId: ID.primary,
      }),
    );
    expect(rendered).not.toContain("a-secret-looking-fingerprint");
    expect(rendered).not.toContain("another-secret-looking-value");
    expect(rendered).not.toContain("subject-x");
    expect(rendered).not.toContain(KEY_ID);
  });

  it("selects no identifier column anywhere in the file", () => {
    // Every identifier is compared, never projected. `client_hash` appears only
    // inside an equality test.
    const projections = PROOF_SQL.match(/select\s+(client_hash|subject|key_id)\b/gi);
    expect(projections).toBeNull();
  });
});
