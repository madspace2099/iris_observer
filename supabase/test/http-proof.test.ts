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
 * SQL half can, and every defect found so far was in the SQL half.
 *
 * The two this round closes are both FALSE-PASS paths, which is the worst kind
 * of defect a verifier can have:
 *
 *  - A REQUEST ID REPLACED THE CONTROLLED PROPERTIES. Selection read
 *    `id matches OR properties match`, so supplying an id skipped the tenant,
 *    project, role and length checks entirely. Any valid UUID identifies SOME
 *    row; one belonging to a different request would have been accepted as the
 *    controlled one, and in two-tenant mode the primary and sibling ids could
 *    be swapped without anything noticing.
 *
 *  - SCOPED MODE STILL FELL BACK. `exactness_ok` required only the primary id,
 *    so the two-tenant scoped mode ran happily with no sibling id and
 *    correlated the sibling by timestamp and properties — while the file
 *    claimed scoped mode refuses fallback.
 *
 * Both are fixed by the same rule, asserted throughout below: the controlled
 * properties are required in EVERY mode, and a supplied request id is an
 * additional conjunct on top of them, never an alternative to them.
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
 * somebody counted, which is how a 39-character question came to be documented
 * as 41.
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
    // Neither is trusted on its own; an earlier version failed exactly here.
    expect(Number(declared)).toBe(QUESTION.length);
    expect(QUESTION.length).toBe(41);
  });

  it("is ASCII only, so no encoding changes the count", () => {
    expect(QUESTION).toMatch(/^[\x20-\x7e]+$/);
    expect(Buffer.byteLength(QUESTION, "utf8")).toBe(QUESTION.length);
  });

  it("names no project, because it is asked in two of them", () => {
    /*
     * The previous question named Northgate and was then submitted from
     * beta/kingsford in two-tenant mode — one project asked about another. The
     * question has to be true in both places or the operator is being told to
     * type something incoherent.
     */
    expect(QUESTION.toLowerCase()).not.toContain("northgate");
    expect(QUESTION.toLowerCase()).not.toContain("kingsford");
    expect(QUESTION.toLowerCase()).not.toContain("alpha");
    expect(QUESTION.toLowerCase()).not.toContain("beta");
  });

  it("is the same text the instructions tell the operator to type", () => {
    // Once as the canonical marker, once in the prose block.
    expect(PROOF_SQL.match(new RegExp(QUESTION.replace(/[?]/g, "\\?"), "g"))).toHaveLength(2);
  });

  it("is the same number the default parameter carries", () => {
    const def = PROOF_SQL.match(/^\s+(\d+)\s+as question_chars,$/m)?.[1];
    expect(Number(def)).toBe(QUESTION.length);
  });
});

/* --- 2. every legitimate mode can read all-PASS --------------------------- */

describe("all four modes return a complete pass", () => {
  it("legacy, one tenant — no request ids, honest correlation", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(failed(rows)).toEqual([]);
    expect(rows).toHaveLength(13);
    expect(at(rows, 5)?.actual).toBe("1");
    expect(at(rows, 11)?.actual).toBe("1");
    expect(at(rows, 13)?.actual).toBe("time + controlled properties (correlation)");
  });

  it("legacy, two tenants — the same browser, so the hashes match", async () => {
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
    // Exactly two newly written audit rows, one per named tenant.
    expect(at(rows, 11)?.actual).toBe("2");
  });

  it("scoped, one tenant — id plus every controlled property", async () => {
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
    expect(at(rows, 13)?.actual).toBe("request id + every controlled property");
  });

  it("scoped, two tenants — both ids, tenant-scoped hashes differ", async () => {
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

/* --- 3. scoped mode never falls back ------------------------------------- */

describe("scoped mode refuses every property-only fallback", () => {
  /*
   * Each of these would previously have produced a confident all-PASS by
   * correlating on timestamp and properties while the file claimed exactness.
   */

  it("FAILS scoped one-tenant with no primary id", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: false,
      primaryRequestId: null,
    });
    expect(failed(rows)).toEqual([1, 13]);
    expect(at(rows, 1)?.actual).toContain("requires primary_request_id");
    expect(at(rows, 13)?.actual).toBe("invalid — see row 1");
  });

  it("FAILS scoped two-tenant with no primary id", async () => {
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
      primaryRequestId: null,
      siblingRequestId: ID.sibling,
    });
    expect(failed(rows)).toEqual([1, 13]);
    expect(at(rows, 1)?.actual).toContain("requires primary_request_id");
  });

  it("FAILS scoped two-tenant with no sibling id — the defect this closes", async () => {
    /*
     * The exact false PASS. `exactness_ok` required only the primary id, so
     * this combination ran, correlated the sibling by timestamp and properties,
     * and returned 13/13 while row 13 claimed exactness.
     */
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
      siblingRequestId: null,
    });
    expect(failed(rows)).toEqual([1, 13]);
    expect(at(rows, 1)?.actual).toContain("requires sibling_request_id");
  });

  it("FAILS scoped two-tenant when both ids are the same", async () => {
    // One row cannot be two requests, however well it matches.
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
      siblingRequestId: ID.primary,
    });
    /*
     * Five failures, not two, and the extra three are the point. Row 1 rejects
     * the configuration; rows 3, 10 and 12 then show what it would have meant —
     * the sibling selector wants tenant beta AND the primary's id, matches
     * nothing, and the real beta row falls into interference. A misconfigured
     * proof fails loudly at every level rather than only at the gate.
     */
    expect(failed(rows)).toEqual([1, 3, 10, 12, 13]);
    expect(at(rows, 1)?.actual).toContain("must differ");
    expect(at(rows, 3)?.actual).toBe("0 — proof void");
    expect(at(rows, 12)?.actual).toBe("beta/kingsford");
  });

  it("FAILS legacy mode if a request id is supplied at all", async () => {
    // The deployed build returns none, so having one means the operator is
    // describing a different build than the one they tested.
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
      primaryRequestId: ID.primary,
    });
    expect(failed(rows)).toEqual([1, 13]);
    expect(at(rows, 1)?.actual).toContain("legacy mode takes no request ids");
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
});

/* --- 4. an id proves identity only with the properties -------------------- */

describe("a request id never replaces the controlled properties", () => {
  /*
   * The second false-PASS path. Selection read `id matches OR properties
   * match`, so a supplied id skipped every dimension check. Each case below
   * supplies a perfectly valid UUID belonging to the wrong row.
   */

  const wrongDimension = async (seed: Ask) => {
    const { db, floorTs, before } = await opened();
    await ask(db, seed);
    return {
      rows: await proof(db, {
        floorTs,
        auditRowsBefore: before,
        expectedBuild: "scoped",
        crossTenantDone: false,
        primaryRequestId: seed.id,
      }),
    };
  };

  it("FAILS when the id belongs to a row in the wrong tenant", async () => {
    const { rows } = await wrongDimension({
      id: ID.primary,
      tenant: "beta",
      project: "northgate",
      scopedHash: "s",
    });
    expect(failed(rows)).toEqual([2, 4, 5, 6, 7, 8, 9, 12]);
    expect(at(rows, 2)?.actual).toBe("0 — proof void");
    // And it is counted, not exempted, because its id was supplied.
    expect(at(rows, 12)?.actual).toBe("beta/northgate");
  });

  it("FAILS when the id belongs to a row in the wrong project", async () => {
    const { rows } = await wrongDimension({
      id: ID.primary,
      tenant: "alpha",
      project: "riverside",
      scopedHash: "s",
    });
    expect(failed(rows)).toEqual([2, 4, 5, 6, 7, 8, 9, 12]);
    expect(at(rows, 12)?.actual).toBe("alpha/riverside");
  });

  it("FAILS when the id belongs to a row with the wrong viewer role", async () => {
    const { rows } = await wrongDimension({ id: ID.primary, role: "developer", scopedHash: "s" });
    expect(failed(rows)).toEqual([2, 4, 5, 6, 7, 8, 9, 12]);
    expect(at(rows, 12)?.actual).toBe("alpha/northgate");
  });

  it("FAILS when the id belongs to a row with the wrong question length", async () => {
    const { rows } = await wrongDimension({ id: ID.primary, chars: 12, scopedHash: "s" });
    expect(failed(rows)).toEqual([2, 4, 5, 6, 7, 8, 9, 12]);
  });

  it("FAILS when the sibling id belongs to the wrong tenant and project", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });
    // A third tenant entirely, whose id the operator pasted by mistake.
    await ask(db, {
      id: ID.sibling,
      tenant: "gamma",
      project: "elsewhere",
      scopedHash: "gamma-scoped",
    });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: true,
      primaryRequestId: ID.primary,
      siblingRequestId: ID.sibling,
    });
    expect(failed(rows)).toEqual([3, 10, 12]);
    expect(at(rows, 3)?.actual).toBe("0 — proof void");
    expect(at(rows, 12)?.actual).toBe("gamma/elsewhere");
  });

  it("FAILS when the primary and sibling ids are swapped", async () => {
    /*
     * Both ids are real, both rows exist, both are the operator's own requests
     * — and each is attributed to the wrong tenant. Under the old `OR` this
     * read as a complete pass.
     */
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
      primaryRequestId: ID.sibling,
      siblingRequestId: ID.primary,
    });
    expect(failed(rows)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
    expect(at(rows, 12)?.actual).toBe("alpha/northgate, beta/kingsford");
  });

  it("FAILS a wrong id even while a perfectly matching row exists", async () => {
    /*
     * The controlled request IS there and would satisfy every property. The
     * operator pasted somebody else's id. The verifier must report a void
     * proof rather than quietly finding the row it was not asked for.
     */
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: false,
      primaryRequestId: ID.other,
    });
    expect(failed(rows)).toEqual([2, 4, 5, 6, 7, 8, 9, 12]);
    expect(at(rows, 2)?.actual).toBe("0 — proof void");
    // The real row is unaccounted, not invisible.
    expect(at(rows, 12)?.actual).toBe("alpha/northgate");
  });

  it("does not exempt a wrong-id row from the interference count", async () => {
    // Two rows: one matching every property, one whose id was supplied but
    // whose tenant is wrong. Both must be counted.
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });
    await ask(db, {
      id: ID.other,
      tenant: "gamma",
      project: "elsewhere",
      scopedHash: "gamma-scoped",
    });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "scoped",
      crossTenantDone: false,
      primaryRequestId: ID.other,
    });
    expect(at(rows, 12)?.actual).toBe("alpha/northgate, gamma/elsewhere");
    expect(at(rows, 11)?.actual).toBe("2");
  });
});

/* --- 5. the legacy correlation still behaves ----------------------------- */

describe("the legacy correlation is honest and still strict", () => {
  it("FAILS on a missing primary row", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, chars: 12 });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
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
  });

  it("never lets an unrelated row substitute for the controlled request", async () => {
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.other, tenant: "gamma", project: "elsewhere" });

    const rows = await proof(db, {
      floorTs,
      auditRowsBefore: before,
      expectedBuild: "legacy",
      crossTenantDone: false,
    });
    expect(at(rows, 2)?.actual).toBe("0 — proof void");
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

  it("an invalid correlation can never read 13/13", async () => {
    /*
     * The summary property. Six invalid configurations against a database that
     * holds a perfectly good controlled row: not one of them may pass.
     */
    const { db, floorTs, before } = await opened();
    await ask(db, { id: ID.primary, scopedHash: "alpha-scoped" });
    const base = { floorTs, auditRowsBefore: before } as const;

    const invalid: Params[] = [
      { ...base, expectedBuild: "scoped", crossTenantDone: false, primaryRequestId: null },
      { ...base, expectedBuild: "scoped", crossTenantDone: true, primaryRequestId: ID.primary },
      {
        ...base,
        expectedBuild: "scoped",
        crossTenantDone: true,
        primaryRequestId: ID.primary,
        siblingRequestId: ID.primary,
      },
      { ...base, expectedBuild: "legacy", crossTenantDone: false, primaryRequestId: ID.primary },
      { ...base, expectedBuild: "nonsense", crossTenantDone: false },
      { ...base, expectedBuild: "scoped", crossTenantDone: false, primaryRequestId: ID.other },
    ];

    for (const params of invalid) {
      const rows = await proof(db, params);
      expect(failed(rows).length).toBeGreaterThan(0);
    }
  });
});

/* --- 6. the verifier prints nothing identifying -------------------------- */

describe("the verifier prints nothing identifying", () => {
  it("emits no fingerprint, subject, key identifier or request id", async () => {
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
    // Not even the id the operator supplied — it is a parameter, not output.
    expect(rendered).not.toContain(ID.primary);
  });

  it("projects no identifier column anywhere in the file", () => {
    const projections = PROOF_SQL.match(/select\s+(client_hash|subject|key_id|request_id)\b/gi);
    expect(projections).toBeNull();
  });
});
