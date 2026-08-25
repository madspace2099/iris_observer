import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The migrations, against a real Postgres.
 *
 * PGlite is Postgres compiled to WASM — the same planner, the same constraint
 * checker, the same advisory locks. Asserting a migration's *text* proves it was
 * typed; running it proves it works, and every claim below is the second kind.
 *
 * Three things are under test and each was a release blocker at some point:
 *
 * - historical rows must survive the migration describing what they are, not
 *   relabelled into something convenient;
 * - an admitted request must consume quota exactly once, however many times the
 *   same id arrives;
 * - a completed record must never be rewritten.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

/** Every migration, in order. The last is the contract; it is applied separately. */
function migrationFiles(): readonly string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

const EXPAND = "20260825205000_observer_audit_provenance.sql";
const CONTRACT = "20260826090000_observer_audit_facade_cleanup.sql";

function sql(file: string): string {
  return readFileSync(join(MIGRATIONS, file), "utf8");
}

/**
 * A database with Supabase's three roles and the migrations up to `stopBefore`.
 *
 * The roles matter: the migrations revoke from and grant to them by name, and a
 * database without them would silently skip the half of this schema that is
 * access control.
 */
async function database(stopBefore?: string): Promise<PGlite> {
  const db = await new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const file of migrationFiles()) {
    if (file === stopBefore) break;
    if (file === CONTRACT) continue;
    await db.exec(sql(file));
  }
  return db;
}

const ADMIT = `select * from public.admit_ai_request(
  $1, 'subject-a', 'client-a', 'alpha/northgate', 10, 60, 120, 500,
  'alpha', 'northgate', 'developer', 42)`;

const ID = "11111111-1111-4111-8111-111111111111";

/* --- 1. the rows that were already there ------------------------------------------ */

describe("historical rows survive the migration as what they are", () => {
  let db: PGlite;

  beforeAll(async () => {
    // Everything up to, but not including, the migration under test.
    db = await database(EXPAND);

    /*
     * Written the way they really were: through the façade the old code called.
     * Constructing them by hand would test a table shape rather than a history.
     */
    await db.exec("set role service_role");
    for (const [outcome, model] of [
      ["answered", "gpt-5.6-sol"],
      ["answered", "gpt-5.6-sol"],
      ["refused", null],
    ] as const) {
      await db.query(
        `select public.record_ai_request('subj','cli','alpha','northgate','developer',$1,$2,'{summarize_showroom_period}',1,900,120,4300,42)`,
        [outcome, model],
      );
    }
    await db.exec("reset role");
    await db.exec(sql(EXPAND));
  });

  it("does not turn a completed request into an interrupted one", async () => {
    // The defect this replaced: `add column state ... default 'started'` would
    // have rewritten every historical request into one that never finished.
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from observer.ai_requests where state <> 'complete'`,
    );
    expect(r.rows[0]?.n).toBe(0);
  });

  it("gives them a completion time drawn from when they happened", async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from observer.ai_requests
        where completed_at is null or completed_at <> occurred_at`,
    );
    expect(r.rows[0]?.n).toBe(0);
  });

  it("keeps their outcome and the model they attempted", async () => {
    const r = await db.query<{ outcome: string; attempted_model: string | null; n: number }>(
      `select outcome, attempted_model, count(*)::int as n
         from observer.ai_requests group by 1, 2 order by 1`,
    );
    expect(r.rows).toEqual([
      { outcome: "answered", attempted_model: "gpt-5.6-sol", n: 2 },
      { outcome: "refused", attempted_model: null, n: 1 },
    ]);
  });

  it("records authorship as unknown, never as false", async () => {
    /*
     * The distinction the whole migration exists for. `false` would be a claim
     * that a model demonstrably did not write those answers, which nobody can
     * support: the fact was never recorded and cannot be recovered.
     */
    const r = await db.query<{ unknown: number; claimed: number }>(
      `select count(*) filter (where model_authored is null)::int as unknown,
              count(*) filter (where model_authored is not null or author_model is not null)::int as claimed
         from observer.ai_requests`,
    );
    expect(r.rows[0]).toEqual({ unknown: 3, claimed: 0 });
  });

  it("marks them as the version that predates provenance", async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from observer.ai_requests
        where audit_version = 1 and response_source = 'legacy_unknown' and request_id is null`,
    );
    expect(r.rows[0]?.n).toBe(3);
  });

  it("keeps the old façade usable, and its new rows honest", async () => {
    // Twelve Preview deployments still call this by name. It must keep working
    // *and* keep producing rows the constraints accept.
    await db.exec("set role service_role");
    await db.query(
      `select public.record_ai_request('subj','cli','alpha','northgate','developer','answered','gpt-5.6-sol','{}',0,null,null,null,10)`,
    );
    await db.exec("reset role");

    const r = await db.query<{
      audit_version: number;
      state: string;
      model_authored: boolean | null;
    }>(
      `select audit_version, state, model_authored from observer.ai_requests
        order by occurred_at desc limit 1`,
    );
    expect(r.rows[0]).toEqual({ audit_version: 1, state: "complete", model_authored: null });
  });
});

/* --- 2. one admitted request, one consumption ------------------------------------- */

describe("admission is retry-safe", () => {
  it("consumes quota once and writes one row, however often the id repeats", async () => {
    const db = await database();
    await db.exec("set role service_role");

    const first = await db.query<{ allowed: boolean; reason: string | null }>(ADMIT, [ID]);
    const second = await db.query<{ allowed: boolean; reason: string | null }>(ADMIT, [ID]);
    const third = await db.query<{ allowed: boolean; reason: string | null }>(ADMIT, [ID]);

    expect(first.rows[0]).toMatchObject({ allowed: true, reason: null });
    /*
     * The defect in the first draft: quota was consumed *before* the insert's
     * `on conflict do nothing`, so a retry spent a second unit of the day's
     * budget and left one row — making unequal the two numbers this design
     * exists to keep equal.
     */
    expect(second.rows[0]).toMatchObject({ allowed: false, reason: "duplicate_request" });
    expect(third.rows[0]).toMatchObject({ allowed: false, reason: "duplicate_request" });

    await db.exec("reset role");
    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from observer.ai_requests where request_id = $1`,
      [ID],
    );
    const consumed = await db.query<{ count: number }>(
      `select count from observer.ai_rate_buckets
        where scope = 'project' and window_kind = 'day'`,
    );
    expect(rows.rows[0]?.n).toBe(1);
    expect(consumed.rows[0]?.count).toBe(1);
  });

  it("refuses without writing a row and without spending anything", async () => {
    const db = await database();
    await db.exec("set role service_role");

    // A ceiling of one, then eight more attempts with fresh ids.
    const tight = `select * from public.admit_ai_request(
      gen_random_uuid(), 'subject-b', 'client-b', 'alpha/northgate', 1, 60, 120, 500,
      'alpha', 'northgate', 'developer', 12)`;
    for (let i = 0; i < 9; i += 1) await db.query(tight);

    await db.exec("reset role");
    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from observer.ai_requests where audit_version = 2`,
    );
    const consumed = await db.query<{ count: number }>(
      `select count from observer.ai_rate_buckets
        where scope = 'session' and subject = 'subject-b' and window_kind = 'hour'`,
    );
    // A refused request is not a lost record: it never happened.
    expect(rows.rows[0]?.n).toBe(1);
    expect(consumed.rows[0]?.count).toBe(1);
  });

  it("serialises concurrent duplicates on the request id, before spending", async () => {
    /*
     * PGlite is a single connection, so two genuinely simultaneous calls cannot
     * be issued here — that limitation is reported rather than papered over.
     *
     * What is asserted instead is the mechanism that makes the concurrent case
     * safe, read from the *deployed* function rather than from the file: the
     * advisory lock is taken on the request id, and it is taken before the
     * ceiling is consulted. Two callers therefore serialise, and the second
     * sees the first's row.
     */
    const db = await database();
    const r = await db.query<{ def: string }>(
      `select pg_get_functiondef(p.oid) as def from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'observer' and p.proname = 'admit_ai_request'`,
    );
    const body = r.rows[0]?.def ?? "";
    const lock = body.indexOf("pg_advisory_xact_lock(hashtext('observer.request:'");
    const look = body.indexOf("from observer.ai_requests r");
    const spend = body.indexOf("from observer.consume_ai_quota(");

    expect(lock, "no advisory lock on the request id").toBeGreaterThan(-1);
    expect(lock).toBeLessThan(look);
    expect(look).toBeLessThan(spend);
  });

  it("has a unique index behind the lock, as the backstop", async () => {
    const db = await database();
    await db.exec("set role service_role");
    await db.query(ADMIT, [ID]);
    await db.exec("reset role");

    // If the lock were ever bypassed, this is what still holds.
    await expect(
      db.query(
        `insert into observer.ai_requests (audit_version, request_id, subject, client_hash,
           tenant_slug, project_slug, viewer_role, state, question_chars)
         values (2, $1, 's', 'c', 'alpha', 'northgate', 'developer', 'started', 1)`,
        [ID],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

/* --- 3. a completed record is not rewritten --------------------------------------- */

describe("completion is write-once", () => {
  const complete = (extra: Record<string, unknown> = {}) => {
    const v = {
      outcome: "answered",
      responseSource: "model",
      attemptedProvider: "openai",
      attemptedModel: "gpt-5.6-sol",
      modelAttempted: true,
      modelAuthored: true,
      authorModel: "gpt-5.6-sol",
      fallbackReason: null as string | null,
      ...extra,
    };
    return [
      `select public.complete_ai_request($1,$2,$3,$4,$5,$6,$7,$8,$9,'{sessions}',1,900,120,4300) as result`,
      [
        ID,
        v.outcome,
        v.responseSource,
        v.attemptedProvider,
        v.attemptedModel,
        v.modelAttempted,
        v.modelAuthored,
        v.authorModel,
        v.fallbackReason,
      ],
    ] as const;
  };

  async function admitted(): Promise<PGlite> {
    const db = await database();
    await db.exec("set role service_role");
    await db.query(ADMIT, [ID]);
    return db;
  }

  it("moves a started row to terminal, once", async () => {
    const db = await admitted();
    const [q, p] = complete();
    const r = await db.query<{ result: string }>(q, [...p]);
    expect(r.rows[0]?.result).toBe("completed");
  });

  it("ignores an exact retry without moving a single stored value", async () => {
    const db = await admitted();
    const [q, p] = complete();
    await db.query(q, [...p]);

    await db.exec("reset role");
    const before = await db.query(`select * from observer.ai_requests where request_id = $1`, [ID]);

    await db.exec("set role service_role");
    const again = await db.query<{ result: string }>(q, [...p]);
    expect(again.rows[0]?.result).toBe("duplicate_ignored");

    await db.exec("reset role");
    const after = await db.query(`select * from observer.ai_requests where request_id = $1`, [ID]);
    // Including `completed_at`, which a plain UPDATE would have moved.
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("refuses a second, different result and leaves the record standing", async () => {
    const db = await admitted();
    const [q, p] = complete();
    await db.query(q, [...p]);

    const [q2, p2] = complete({
      responseSource: "deterministic_composer",
      modelAuthored: false,
      authorModel: null,
      fallbackReason: "composition_failed",
    });
    const conflicting = await db.query<{ result: string }>(q2, [...p2]);
    expect(conflicting.rows[0]?.result).toBe("conflict");

    await db.exec("reset role");
    const row = await db.query<{ response_source: string; author_model: string }>(
      `select response_source, author_model from observer.ai_requests where request_id = $1`,
      [ID],
    );
    expect(row.rows[0]).toEqual({ response_source: "model", author_model: "gpt-5.6-sol" });
  });

  it("says so when there is nothing to complete", async () => {
    const db = await database();
    await db.exec("set role service_role");
    const [q, p] = complete();
    const r = await db.query<{ result: string }>(q, [...p]);
    expect(r.rows[0]?.result).toBe("not_found");
  });
});

/* --- 4. the contract, enforced by the database ------------------------------------ */

describe("the database refuses an incoherent audit row", () => {
  const base = `insert into observer.ai_requests
    (audit_version, request_id, subject, client_hash, tenant_slug, project_slug, viewer_role,
     state, question_chars, outcome, response_source, model_attempted, model_authored,
     author_model, attempted_model, fallback_reason, completed_at, tool_calls)`;

  const row = (over: Record<string, string> = {}) => {
    const v = {
      audit_version: "2",
      request_id: "gen_random_uuid()",
      state: "'complete'",
      question_chars: "42",
      outcome: "'answered'",
      response_source: "'model'",
      model_attempted: "true",
      model_authored: "true",
      author_model: "'gpt-5.6-sol'",
      attempted_model: "'gpt-5.6-sol'",
      fallback_reason: "null",
      completed_at: "now()",
      tool_calls: "1",
      ...over,
    };
    return `${base} values (${v.audit_version}, ${v.request_id}, 's', 'c', 'alpha', 'northgate',
      'developer', ${v.state}, ${v.question_chars}, ${v.outcome}, ${v.response_source},
      ${v.model_attempted}, ${v.model_authored}, ${v.author_model}, ${v.attempted_model},
      ${v.fallback_reason}, ${v.completed_at}, ${v.tool_calls})`;
  };

  let db: PGlite;
  beforeAll(async () => {
    db = await database();
  });

  it("accepts the coherent shape it is derived from", async () => {
    await expect(db.exec(row())).resolves.toBeDefined();
  });

  const rejected: readonly { name: string; over: Record<string, string>; constraint: RegExp }[] = [
    {
      // `answered · gpt-5.6-sol` beside prose the composer wrote, exactly.
      name: "an author named beside a fallback",
      over: { response_source: "'deterministic_composer'", model_authored: "false" },
      constraint: /authorship_coherent/,
    },
    {
      name: "`model` as the source with no author",
      over: { author_model: "null" },
      constraint: /authorship_coherent/,
    },
    {
      name: "authorship claimed without an attempt",
      over: { model_attempted: "false", attempted_model: "null" },
      constraint: /authorship_coherent/,
    },
    {
      name: "a provider's error message in the reason code",
      over: {
        response_source: "'deterministic_composer'",
        model_authored: "false",
        author_model: "null",
        fallback_reason: "'429 Too Many Requests: rate limit reached for gpt-5.6-sol'",
      },
      constraint: /fallback_reason_allowed/,
    },
    {
      name: "a state nobody defined",
      over: { state: "'finished'" },
      constraint: /state_allowed/,
    },
    {
      name: "an outcome nobody defined",
      over: { outcome: "'ok'" },
      constraint: /outcome_allowed/,
    },
    {
      name: "a version-2 row with no request id",
      over: { request_id: "null" },
      constraint: /requires_request_id/,
    },
    {
      name: "a completed row that says nothing about what happened",
      over: { outcome: "null", response_source: "null" },
      constraint: /complete_is_terminal|authorship_coherent/,
    },
    {
      name: "a negative tool-call count",
      over: { audit_version: "2" },
      constraint: /counts_non_negative/,
    },
  ];

  for (const scenario of rejected) {
    it(`rejects ${scenario.name}`, async () => {
      const statement =
        scenario.name === "a negative tool-call count"
          ? row().replace("now(), 1)", "now(), -1)")
          : row(scenario.over);
      await expect(db.exec(statement)).rejects.toThrow(scenario.constraint);
    });
  }
});

/* --- 5. the reachable surface ----------------------------------------------------- */

describe("what each role can reach", () => {
  it("keeps the old façades during expand, and removes them on contract", async () => {
    const db = await database();
    const named = async (): Promise<readonly string[]> => {
      const r = await db.query<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' order by 1`,
      );
      return r.rows.map((x) => x.proname);
    };

    // Twelve Preview deployments still call these by name.
    expect(await named()).toContain("consume_ai_quota");
    expect(await named()).toContain("record_ai_request");

    await db.exec(sql(CONTRACT));
    expect(await named()).not.toContain("consume_ai_quota");
    expect(await named()).not.toContain("record_ai_request");
    // The implementation the ceiling actually uses is untouched.
    const inner = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'observer' and p.proname = 'consume_ai_quota'`,
    );
    expect(inner.rows[0]?.n).toBe(1);
  });

  it("lets no browser role execute anything in public", async () => {
    const db = await database();
    for (const role of ["anon", "authenticated"]) {
      const r = await db.query<{ names: string | null }>(
        `select string_agg(p.proname, ', ' order by p.proname) as names
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and has_function_privilege($1, p.oid, 'EXECUTE')`,
        [role],
      );
      expect(r.rows[0]?.names, `${role} can execute something in public`).toBeNull();
    }
  });

  it("gives every security-definer function a fixed search_path", async () => {
    const db = await database();
    const r = await db.query<{ proname: string; cfg: string | null }>(
      `select p.proname, array_to_string(p.proconfig, ',') as cfg
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('observer','public') and p.prosecdef order by 1`,
    );
    expect(r.rows.length).toBeGreaterThan(0);
    for (const fn of r.rows) {
      expect(fn.cfg, `${fn.proname} has no fixed search_path`).toMatch(/search_path=/);
    }
  });
});
