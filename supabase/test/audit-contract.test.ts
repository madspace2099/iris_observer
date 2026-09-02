import type { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  openDatabase,
  closeTestDatabases,
  closeSuiteDatabases,
  type DatabaseScope,
} from "./support/pglite";

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
const FORWARD = "20260826120000_observer_exact_retry_and_pseudonym_scope.sql";
const RETENTION = "20260826140000_observer_bucket_retention.sql";

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
async function database(
  stopBefore: string = RETENTION,
  scope: DatabaseScope = "test",
): Promise<PGlite> {
  const db = await openDatabase(scope);
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

/**
 * A stand-in for `pg_cron`, and the label is load-bearing.
 *
 * PGlite cannot run `pg_cron`: it is a background worker in a shared library,
 * and there is no postmaster here to preload it. Pretending otherwise and
 * reporting green would reinstate exactly the class of defect this round is
 * fixing — a retention claim resting on something that never runs.
 *
 * So this creates the two documented surfaces the migration *writes to* — the
 * `cron.job` table and `cron.schedule` / `cron.unschedule` — and nothing else.
 * It has no scheduler and no clock. What the tests below can therefore prove is
 * that the migration converges on one correct job row; what they cannot prove
 * is that anything ever executes it. That is a live check, and it is why
 * `observer-cron-health.sql` exists.
 *
 * Note what is deliberately absent: `cron.schedule` here does NOT overwrite by
 * name. Supabase documents that it does, and the migration does not rely on it
 * — it unschedules every matching job first. Leaving the upsert out of the
 * stand-in means the convergence test fails if that dependency is ever
 * reintroduced, instead of passing because the stand-in was generous.
 */
async function installCronStandIn(db: PGlite): Promise<void> {
  await db.exec(`
    -- The migration's precondition reads pg_catalog, not the cron schema, so
    -- the stand-in has to satisfy it there. PGlite runs as a superuser and
    -- permits the write; a real deployment gets this row from CREATE EXTENSION.
    set allow_system_table_mods = on;
    insert into pg_extension (oid, extname, extowner, extnamespace, extrelocatable, extversion)
    values (99999, 'pg_cron', 10, 'pg_catalog'::regnamespace, false, '1.6.4');
    reset allow_system_table_mods;

    create schema cron;

    create table cron.job (
      jobid    bigserial primary key,
      schedule text    not null,
      command  text    not null,
      nodename text    not null default 'localhost',
      nodeport integer not null default 5432,
      database text    not null default current_database(),
      username text    not null default current_user,
      active   boolean not null default true,
      jobname  text
    );

    create function cron.schedule(p_name text, p_schedule text, p_command text)
    returns bigint language sql as $fn$
      insert into cron.job (schedule, command, jobname)
      values (p_schedule, p_command, p_name)
      returning jobid;
    $fn$;

    create function cron.unschedule(p_jobid bigint)
    returns boolean language sql as $fn$
      delete from cron.job where jobid = p_jobid returning true;
    $fn$;
  `);
}

/** Migrations through retention, behind the stand-in above. */
async function databaseWithRetention(): Promise<PGlite> {
  const db = await database();
  await installCronStandIn(db);
  await db.exec(sql(RETENTION));
  return db;
}

/** Sixteen hex characters, the shape the key-id constraint requires. */
const KEY_ID = "0123456789abcdef";

const ADMIT = `select * from public.admit_ai_request(
  $1, 'subject-a', 'client-a', 'alpha/northgate', 10, 60, 120, 500,
  'alpha', 'northgate', 'developer', 42, '${KEY_ID}')`;

const ID = "11111111-1111-4111-8111-111111111111";

/* --- 1. the rows that were already there ------------------------------------------ */

describe("historical rows survive the migration as what they are", () => {
  let db: PGlite;

  beforeAll(async () => {
    // Everything up to, but not including, the migration under test.
    /* SUITE-SCOPED: every test in this block reads it. */
    db = await database(EXPAND, "suite");

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
      'alpha', 'northgate', 'developer', 12, '${KEY_ID}')`;
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
           tenant_slug, project_slug, viewer_role, state, question_chars, key_id,
           pseudonym_version)
         values (2, $1, 's', 'c', 'alpha', 'northgate', 'developer', 'started', 1, $2, 2)`,
        [ID, KEY_ID],
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
     author_model, attempted_model, fallback_reason, completed_at, tool_calls, key_id,
     pseudonym_version)`;

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
      key_id: "'0123456789abcdef'",
      pseudonym_version: "2",
      ...over,
    };
    return `${base} values (${v.audit_version}, ${v.request_id}, 's', 'c', 'alpha', 'northgate',
      'developer', ${v.state}, ${v.question_chars}, ${v.outcome}, ${v.response_source},
      ${v.model_attempted}, ${v.model_authored}, ${v.author_model}, ${v.attempted_model},
      ${v.fallback_reason}, ${v.completed_at}, ${v.tool_calls}, ${v.key_id},
      ${v.pseudonym_version})`;
  };

  let db: PGlite;
  beforeAll(async () => {
    /* SUITE-SCOPED: every rejection case below reuses this one database. */
    db = await database(RETENTION, "suite");
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
      // Which key produced the pseudonyms is not optional for a row that has
      // any: without it a rotation is an unexplained counter reset.
      name: "a version-2 row with no key id",
      over: { key_id: "null" },
      constraint: /requires_key_id/,
    },
    {
      name: "a key id that is not the right shape",
      over: { key_id: "'not-hex'" },
      constraint: /requires_key_id/,
    },
    {
      // Which derivation made the pseudonyms. Tenant-scoping changed every one
      // of them while leaving the pepper — and the key id — untouched.
      name: "a version-2 row with no pseudonym scheme",
      over: { pseudonym_version: "null" },
      constraint: /requires_pseudonym_version/,
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
          ? row({ tool_calls: "-1" })
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

/* --- 6. an exact retry means every persisted field --------------------------------- */

describe("completion tells a repeat from a disagreement", () => {
  /*
   * The defect this closes. The first comparison covered the eight provenance
   * fields and none of the five persisted metrics, so a second completion with
   * the same provenance and *different* usage was answered
   * `duplicate_ignored` — the caller told nothing had changed and nothing was
   * wrong, when two executions had disagreed about what the request cost.
   *
   * The behaviour script missed it too, because its conflicting example also
   * changed `response_source`, authorship and the fallback reason. A test that
   * varies five things at once cannot say which one was noticed.
   */
  const TERMINAL = {
    outcome: "answered",
    responseSource: "model",
    attemptedProvider: "openai",
    attemptedModel: "gpt-5.6-sol",
    modelAttempted: true,
    modelAuthored: true,
    authorModel: "gpt-5.6-sol",
    fallbackReason: null as string | null,
    tools: "{summarize_showroom_period}",
    toolCalls: 1,
    inputTokens: 900,
    outputTokens: 120,
    latencyMs: 4300,
  };

  const complete = (db: PGlite, over: Partial<typeof TERMINAL> = {}) => {
    const v = { ...TERMINAL, ...over };
    return db.query<{ result: string }>(
      `select public.complete_ai_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as result`,
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
        v.tools,
        v.toolCalls,
        v.inputTokens,
        v.outputTokens,
        v.latencyMs,
      ],
    );
  };

  async function completedOnce(): Promise<PGlite> {
    const db = await database();
    await db.exec("set role service_role");
    await db.query(ADMIT, [ID]);
    const first = await complete(db);
    expect(first.rows[0]?.result).toBe("completed");
    return db;
  }

  const stored = (db: PGlite) =>
    db.query(
      `select tools, tool_calls, input_tokens, output_tokens, latency_ms, completed_at,
              response_source, author_model
         from observer.ai_requests where request_id = $1`,
      [ID],
    );

  it("calls a byte-for-byte repeat a duplicate", async () => {
    const db = await completedOnce();
    const again = await complete(db);
    expect(again.rows[0]?.result).toBe("duplicate_ignored");
  });

  const differences: readonly { name: string; over: Partial<typeof TERMINAL> }[] = [
    { name: "output tokens", over: { outputTokens: 121 } },
    { name: "input tokens", over: { inputTokens: 901 } },
    { name: "latency", over: { latencyMs: 4301 } },
    { name: "the tool list", over: { tools: "{summarize_showroom_period,compare_agent_flows}" } },
    { name: "the tool count", over: { toolCalls: 2 } },
  ];

  for (const scenario of differences) {
    it(`calls a retry differing only in ${scenario.name} a conflict`, async () => {
      const db = await completedOnce();
      await db.exec("reset role");
      const before = await stored(db);

      await db.exec("set role service_role");
      const retry = await complete(db, scenario.over);
      expect(retry.rows[0]?.result).toBe("conflict");

      // Nothing moved — not a metric, not the timestamp.
      await db.exec("reset role");
      const after = await stored(db);
      expect(after.rows[0]).toEqual(before.rows[0]);
    });
  }

  it("treats a null tool list and an empty one as the same thing", async () => {
    /*
     * The first write normalises with `coalesce(p_tools, '{}')`, so the
     * comparison has to normalise identically or a caller sending null twice
     * would be told it disagreed with itself.
     */
    const db = await database();
    await db.exec("set role service_role");
    await db.query(ADMIT, [ID]);
    await complete(db, { tools: null as unknown as string, toolCalls: null as unknown as number });
    const again = await complete(db, {
      tools: null as unknown as string,
      toolCalls: null as unknown as number,
    });
    expect(again.rows[0]?.result).toBe("duplicate_ignored");

    const third = await complete(db, { tools: "{}", toolCalls: 0 });
    expect(third.rows[0]?.result).toBe("duplicate_ignored");
  });
});

/* --- 7. the pseudonym scheme is recorded, and old callers keep working ------------- */

describe("a row says which derivation made its pseudonyms", () => {
  it("stores the scheme and the tenant-scoped client hash", async () => {
    const db = await database();
    await db.exec("set role service_role");
    await db.query(
      `select * from public.admit_ai_request($1, 'subject-a', 'global-hash', 'alpha/northgate',
         10, 60, 120, 500, 'alpha', 'northgate', 'developer', 42, $2, 'scoped-hash', 2)`,
      [ID, KEY_ID],
    );
    await db.exec("reset role");

    const r = await db.query<{ pseudonym_version: number; client_hash: string }>(
      `select pseudonym_version, client_hash from observer.ai_requests where request_id = $1`,
      [ID],
    );
    // The global hash keys the ceiling; the scoped one is what is kept.
    expect(r.rows[0]).toEqual({ pseudonym_version: 2, client_hash: "scoped-hash" });

    const bucket = await db.query<{ subject: string }>(
      `select subject from observer.ai_rate_buckets where scope = 'client'`,
    );
    expect(bucket.rows[0]?.subject).toBe("global-hash");
  });

  it("still admits a caller built before the scheme existed, and labels its rows", async () => {
    /*
     * Both new parameters carry defaults, so a thirteen-argument call from an
     * older build resolves. Its row falls back to the global hash and records
     * `pseudonym_version = 1` — the old derivation, labelled as the old
     * derivation, rather than quietly filed beside the new one.
     */
    const db = await database();
    await db.exec("set role service_role");
    await db.query(ADMIT, [ID]);
    await db.exec("reset role");

    const r = await db.query<{ pseudonym_version: number; client_hash: string }>(
      `select pseudonym_version, client_hash from observer.ai_requests where request_id = $1`,
      [ID],
    );
    expect(r.rows[0]).toEqual({ pseudonym_version: 1, client_hash: "client-a" });
  });

  it("refuses a version-2 row with no scheme, and one with a scheme nobody defined", async () => {
    const db = await database();
    const base = `insert into observer.ai_requests
      (audit_version, request_id, subject, client_hash, tenant_slug, project_slug, viewer_role,
       state, question_chars, key_id, pseudonym_version)
      values (2, gen_random_uuid(), 's', 'c', 'alpha', 'northgate', 'developer', 'started', 1,
              '0123456789abcdef', `;
    await expect(db.exec(base + "null)")).rejects.toThrow(/requires_pseudonym_version/);
    await expect(db.exec(base + "9)")).rejects.toThrow(/requires_pseudonym_version/);
    await expect(db.exec(base + "2)")).resolves.toBeDefined();
  });

  it("scopes its own constraint check to the table, not just the name", () => {
    /*
     * `conname` is not globally unique, so a name-only existence check can be
     * satisfied by a constraint on a different table and skip its own work.
     * The applied migration checks by name alone and is immutable; this one
     * does not, and that is the forward correction.
     */
    const corrective = sql("20260826120000_observer_exact_retry_and_pseudonym_scope.sql");
    expect(corrective).toContain("conrelid = v_table");
    expect(corrective).toContain("'observer.ai_requests'::regclass");
  });
});

/* --- 8. exactly one callable admission path -------------------------------------- */

describe("PostgREST has exactly one admit_ai_request to choose from", () => {
  /*
   * PGRST203 is what happens when it has two.
   *
   * The forward migration widens the function rather than adding a second one,
   * and it must: PostgREST resolves an RPC by the names in the JSON body, and
   * two overloads that both accept those names are ambiguous. It answers
   * "Could not choose the best candidate function" and every request fails —
   * a production-only failure that no direct-SQL test would see, because SQL
   * resolves by position and type instead.
   *
   * So the migration drops before it creates, and these assertions read the
   * catalogue rather than the file.
   */

  const SIGNATURE =
    "uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text, text, integer";

  interface Catalog {
    readonly n: number;
    readonly signature: string;
    readonly nargs: number;
    readonly ndefaults: number;
    readonly definer: boolean;
    readonly config: string | null;
  }

  const catalog = (db: PGlite, schema: string, name: string) =>
    db.query<Catalog>(
      `select count(*) over ()::int          as n,
              oidvectortypes(p.proargtypes)  as signature,
              p.pronargs::int                as nargs,
              p.pronargdefaults::int         as ndefaults,
              p.prosecdef                    as definer,
              array_to_string(p.proconfig, ',') as config
         from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = $1 and p.proname = $2`,
      [schema, name],
    );

  it("leaves one function, not an overload pair", async () => {
    const db = await database();
    for (const schema of ["public", "observer"]) {
      const r = await catalog(db, schema, "admit_ai_request");
      expect(r.rows.length, `${schema}.admit_ai_request is not unique`).toBe(1);
      expect(r.rows[0]?.n).toBe(1);
    }
  });

  it("carries the intended signature and exactly two trailing defaults", async () => {
    const db = await database();
    const r = await catalog(db, "public", "admit_ai_request");
    expect(r.rows[0]?.signature).toBe(SIGNATURE);
    expect(r.rows[0]?.nargs).toBe(15);
    // `p_audit_client_hash` and `p_pseudonym_version`. Defaults are what let a
    // build made before the scheme existed keep resolving.
    expect(r.rows[0]?.ndefaults).toBe(2);
    expect(r.rows[0]?.definer).toBe(true);
    expect(r.rows[0]?.config).toMatch(/search_path=/);
  });

  it("resolves both the legacy call and the tenant-scoped one", async () => {
    const db = await database();
    await db.exec("set role service_role");

    // Thirteen arguments: what commit 3f298a6 sends. Verified from that
    // commit's own source, not inferred from its name.
    const legacy = await db.query<{ allowed: boolean }>(
      `select allowed from public.admit_ai_request($1, 's', 'global', 'alpha/northgate',
         10, 60, 120, 500, 'alpha', 'northgate', 'developer', 42, $2)`,
      ["aaaaaaaa-0000-4000-8000-000000000001", KEY_ID],
    );
    expect(legacy.rows[0]?.allowed).toBe(true);

    const scoped = await db.query<{ allowed: boolean }>(
      `select allowed from public.admit_ai_request($1, 's2', 'global', 'alpha/northgate',
         10, 60, 120, 500, 'alpha', 'northgate', 'developer', 42, $2, 'scoped', 2)`,
      ["aaaaaaaa-0000-4000-8000-000000000002", KEY_ID],
    );
    expect(scoped.rows[0]?.allowed).toBe(true);
  });

  it("labels each call with the scheme it actually used", async () => {
    const db = await database();
    await db.exec("set role service_role");
    await db.query(
      `select public.admit_ai_request($1, 's', 'global', 'alpha/northgate', 10, 60, 120, 500,
         'alpha', 'northgate', 'developer', 42, $2)`,
      ["aaaaaaaa-0000-4000-8000-000000000001", KEY_ID],
    );
    await db.query(
      `select public.admit_ai_request($1, 's2', 'global', 'alpha/northgate', 10, 60, 120, 500,
         'alpha', 'northgate', 'developer', 42, $2, 'scoped', 2)`,
      ["aaaaaaaa-0000-4000-8000-000000000002", KEY_ID],
    );
    await db.exec("reset role");

    const r = await db.query<{
      request_id: string;
      pseudonym_version: number;
      client_hash: string;
    }>(
      `select request_id::text, pseudonym_version, client_hash
         from observer.ai_requests where audit_version = 2 order by request_id`,
    );
    // The legacy caller cannot have scoped anything, and its row says so
    // rather than being filed beside rows that did.
    expect(r.rows[0]).toEqual({
      request_id: "aaaaaaaa-0000-4000-8000-000000000001",
      pseudonym_version: 1,
      client_hash: "global",
    });
    expect(r.rows[1]).toEqual({
      request_id: "aaaaaaaa-0000-4000-8000-000000000002",
      pseudonym_version: 2,
      client_hash: "scoped",
    });
  });

  it("no longer resolves the twelve-argument call commit 1ee5d2d sends", async () => {
    /*
     * Stated rather than hidden. Adding `p_key_id` in the expand migration
     * already broke that shape, and the forward migration does not restore it:
     * a build that cannot name the key that made its pseudonyms must not be
     * able to write rows, or the key id guarantees nothing.
     */
    const db = await database();
    await db.exec("set role service_role");
    await expect(
      db.query(
        `select public.admit_ai_request($1, 's', 'c', 'alpha/northgate', 10, 60, 120, 500,
           'alpha', 'northgate', 'developer', 42)`,
        ["aaaaaaaa-0000-4000-8000-000000000003"],
      ),
    ).rejects.toThrow(/does not exist/i);
  });

  it("is callable by the server role and by nothing else", async () => {
    const db = await database();
    const r = await db.query<{ role: string; allowed: boolean }>(
      `select role, has_function_privilege(role, p.oid, 'EXECUTE') as allowed
         from unnest(array['anon','authenticated','service_role']) role,
              pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'admit_ai_request'
        order by role`,
    );
    expect(r.rows).toEqual([
      { role: "anon", allowed: false },
      { role: "authenticated", allowed: false },
      { role: "service_role", allowed: true },
    ]);
  });

  it("keeps the observer-schema implementation unreachable from a browser", async () => {
    const db = await database();
    const r = await db.query<{ role: string; allowed: boolean }>(
      `select role, has_function_privilege(role, p.oid, 'EXECUTE') as allowed
         from unnest(array['anon','authenticated']) role,
              pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'observer' and p.proname = 'admit_ai_request'`,
    );
    expect(r.rows.every((x) => x.allowed === false)).toBe(true);
  });

  it("drops before it creates, so no stale overload can survive", () => {
    // The property the catalogue assertions above rest on, read from the
    // migration itself: a bare CREATE beside the old one is what produces the
    // ambiguity, and there is none.
    const corrective = sql("20260826120000_observer_exact_retry_and_pseudonym_scope.sql");
    const dropPublic = corrective.indexOf("drop function if exists public.admit_ai_request");
    const dropObserver = corrective.indexOf("drop function if exists observer.admit_ai_request");
    const createObserver = corrective.indexOf("create function observer.admit_ai_request");
    const createPublic = corrective.indexOf("create function public.admit_ai_request");

    expect(dropPublic).toBeGreaterThan(-1);
    expect(dropObserver).toBeGreaterThan(-1);
    expect(dropPublic).toBeLessThan(createObserver);
    expect(dropObserver).toBeLessThan(createObserver);
    expect(createObserver).toBeLessThan(createPublic);
    expect(corrective).not.toContain("create or replace function public.admit_ai_request");
  });
});

/* --- 9. the scheme and the hash must agree --------------------------------- */

describe("an incoherent admission is refused before anything is spent", () => {
  /*
   * The two arguments were independently `coalesce`d, which let one
   * combination through that is a lie in the table: no scoped hash and
   * `p_pseudonym_version = 2` stored the GLOBAL hash under a label saying
   * tenant-scoped. Anybody later reading the audit would trust a row that
   * follows a browser between customers precisely because it claims it cannot.
   */
  const admit = (db: PGlite, audit: string | null, version: number | null) =>
    db.query<{ allowed: boolean; reason: string | null }>(
      `select * from public.admit_ai_request($1, 'subject-a', 'global-hash',
         'alpha/northgate', 10, 60, 120, 500, 'alpha', 'northgate', 'developer', 42,
         $2, $3, $4)`,
      [ID, KEY_ID, audit, version],
    );

  const counts = (db: PGlite) =>
    db.query<{ rows: number; units: number }>(
      `select (select count(*) from observer.ai_requests)::int              as rows,
              (select coalesce(sum(count), 0) from observer.ai_rate_buckets)::int as units`,
    );

  const invalid: readonly { name: string; audit: string | null; version: number | null }[] = [
    { name: "scoped version with no scoped hash", audit: null, version: 2 },
    { name: "scoped version with an empty scoped hash", audit: "", version: 2 },
    { name: "scoped version with a whitespace scoped hash", audit: "   ", version: 2 },
    // Identical hashes mean the caller scoped nothing and said it had.
    { name: "scoped version with the global hash", audit: "global-hash", version: 2 },
    { name: "legacy version with a scoped hash", audit: "scoped-hash", version: 1 },
    { name: "a scheme nobody defined", audit: "scoped-hash", version: 3 },

    /*
     * ABSENT IS NOT BLANK, and the previous version of this function treated
     * them as the same thing. It asked one question — "is there a usable scoped
     * hash?" — so `''` answered no and the row was filed as legacy: a build
     * from before the scheme existed. It is not that. A caller sending an empty
     * string is a caller that meant to compute a fingerprint and computed
     * nothing, and mislabelling it puts a wrong claim in the one table whose
     * whole job is to be believed.
     *
     * Only `IS NULL` is legacy now, which is exactly what the deployed 13-key
     * caller produces: it never mentions the parameter and reaches NULL through
     * the default.
     */
    { name: "legacy version with an empty hash", audit: "", version: 1 },
    { name: "legacy version with a whitespace hash", audit: "   ", version: 1 },
    { name: "an empty hash with no version at all", audit: "", version: null },
    { name: "a whitespace hash with no version at all", audit: "   ", version: null },
  ];

  for (const scenario of invalid) {
    it(`refuses ${scenario.name}, spending nothing`, async () => {
      const d = await database();
      // Counted as the owner: `service_role` deliberately cannot read the
      // observer schema directly, which is the control working.
      const before = await counts(d);

      await d.exec("set role service_role");
      const r = await admit(d, scenario.audit, scenario.version);
      expect(r.rows[0]).toMatchObject({ allowed: false, reason: "invalid_admission" });
      await d.exec("reset role");

      const after = await counts(d);
      // Neither table moved: no quota consumed, no audit row written.
      expect(after.rows[0]).toEqual(before.rows[0]);
    });
  }

  it("still admits the deployed 13-key caller, which omits both parameters", async () => {
    /*
     * The compatibility that must not break. `3f298a6` sends thirteen
     * arguments and never mentions a scheme or a scoped hash; both reach the
     * function through defaults, as NULL and 1. Tightening blank to invalid
     * must not touch this path, so it is exercised through the real 13-argument
     * call rather than by passing NULL explicitly.
     */
    const d = await database();
    await d.exec("set role service_role");

    const r = await d.query<{ allowed: boolean }>(
      `select allowed from public.admit_ai_request($1, 'subject-legacy', 'global-hash',
         'alpha/northgate', 10, 60, 120, 500, 'alpha', 'northgate', 'developer', 42, $2)`,
      ["dddddddd-0000-4000-8000-000000000001", KEY_ID],
    );
    expect(r.rows[0]?.allowed).toBe(true);

    await d.exec("reset role");
    const row = await d.query<{ version: number; hash: string }>(
      `select pseudonym_version as version, client_hash as hash
         from observer.ai_requests where request_id = $1`,
      ["dddddddd-0000-4000-8000-000000000001"],
    );
    // Version 1, storing the global hash — honestly what that build derives.
    expect(row.rows[0]).toEqual({ version: 1, hash: "global-hash" });
  });

  it("admits the two combinations that are coherent", async () => {
    const d = await database();
    await d.exec("set role service_role");

    const legacy = await admit(d, null, 1);
    expect(legacy.rows[0]).toMatchObject({ allowed: true });

    const scoped = await d.query<{ allowed: boolean }>(
      `select allowed from public.admit_ai_request($1, 'subject-b', 'global-hash',
         'alpha/northgate', 10, 60, 120, 500, 'alpha', 'northgate', 'developer', 42,
         $2, 'scoped-hash', 2)`,
      ["bbbbbbbb-0000-4000-8000-000000000001", KEY_ID],
    );
    expect(scoped.rows[0]?.allowed).toBe(true);
  });
});

/* --- 10. migration 3 is safely rerunnable ---------------------------------- */

describe("applying the forward migration twice changes nothing", () => {
  /*
   * It failed the second time: the fifteen-argument function it had just made
   * met a bare CREATE. A migration that only works once is one nobody dares
   * re-apply after a partial failure, which is exactly when it is needed.
   */
  it("leaves one function per schema, and both call forms still resolve", async () => {
    const d = await database();

    await d.exec(sql(FORWARD));
    await d.exec(sql(FORWARD));

    for (const schema of ["public", "observer"]) {
      const r = await d.query<{ n: number; nargs: number; ndefaults: number }>(
        `select count(*)::int as n, max(p.pronargs)::int as nargs,
                max(p.pronargdefaults)::int as ndefaults
           from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = $1 and p.proname = 'admit_ai_request'`,
        [schema],
      );
      expect(r.rows[0], `${schema} after a re-run`).toEqual({ n: 1, nargs: 15, ndefaults: 2 });
    }

    await d.exec("set role service_role");
    const legacy = await d.query<{ allowed: boolean }>(
      `select allowed from public.admit_ai_request($1, 's', 'g', 'alpha/northgate',
         10, 60, 120, 500, 'alpha', 'northgate', 'developer', 42, $2)`,
      ["cccccccc-0000-4000-8000-000000000001", KEY_ID],
    );
    const scoped = await d.query<{ allowed: boolean }>(
      `select allowed from public.admit_ai_request($1, 's2', 'g', 'alpha/northgate',
         10, 60, 120, 500, 'alpha', 'northgate', 'developer', 42, $2, 'scoped', 2)`,
      ["cccccccc-0000-4000-8000-000000000002", KEY_ID],
    );
    expect(legacy.rows[0]?.allowed).toBe(true);
    expect(scoped.rows[0]?.allowed).toBe(true);

    // And the twelve-argument shape is still gone.
    await expect(
      d.query(
        `select public.admit_ai_request($1, 's', 'c', 'alpha/northgate', 10, 60, 120, 500,
           'alpha', 'northgate', 'developer', 42)`,
        ["cccccccc-0000-4000-8000-000000000003"],
      ),
    ).rejects.toThrow(/does not exist/i);
  });

  it("tells PostgREST to reload, in both unapplied migrations", () => {
    /*
     * PostgREST resolves an RPC from a cached picture of the schema. A changed
     * signature that it has not been told about answers PGRST202 for the new
     * shape and keeps offering the old one — stale metadata this project has
     * already spent a round diagnosing. Inside the transaction, so a rolled-back
     * migration does not announce a change that never happened.
     */
    expect(sql(FORWARD)).toContain("notify pgrst, 'reload schema'");
    expect(sql(CONTRACT)).toContain("notify pgrst, 'reload schema'");
    expect(sql(RETENTION)).toContain("notify pgrst, 'reload schema'");
  });
});

/* --- 11. retention is scheduled, not opportunistic -------------------------- */

/*
 * Three kinds of claim live in this file, and they are kept apart deliberately.
 *
 *   RUN    — executed against a real Postgres (PGlite). The delete, the
 *            threshold, the record of the run, the privileges, and the fact
 *            that the migration refuses to install without its scheduler.
 *   TEXT   — statically verified. The exact job name, schedule and command; the
 *            absence of cleanup from the interactive path; the absence of a
 *            browser-callable retention RPC.
 *   STAND-IN — run against `installCronStandIn`, which is a table and two
 *            functions. It proves the migration converges on one correct job
 *            ROW. It proves nothing about whether pg_cron ever executes it.
 *
 * What none of them can prove: that the scheduler runs. There is no clock here.
 * That is a live check — `observer-cron-health.sql`, rollout step 6 — and no
 * amount of local green may be read as covering it.
 */

/**
 * A migration with its commentary removed.
 *
 * These files explain themselves at length, and several of the explanations
 * quote SQL that must NOT execute — the documented `create extension` line, the
 * signature a previous draft had. A text assertion that cannot tell a statement
 * from a sentence about a statement fails on the prose and proves nothing.
 */
function statementsOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const JOB_NAME = "observer-prune-ai-rate-buckets";
const JOB_SCHEDULE = "0 * * * *";
const JOB_COMMAND = "select observer.run_rate_bucket_retention(48);";

describe("retention: the precondition [RUN]", () => {
  it("refuses to install when pg_cron is absent, rather than reporting success", async () => {
    /*
     * The whole point of the correction. A migration that creates a cleanup
     * function and no scheduler, and then reports success, recreates the
     * original defect exactly: a retention claim resting on something nobody
     * runs. So it aborts, and says which file fixes it.
     */
    const d = await database();
    await expect(d.exec(sql(RETENTION))).rejects.toThrow(/pg_cron, which is not installed/);
  });

  it("leaves nothing behind when it refuses", async () => {
    const d = await database();
    await expect(d.exec(sql(RETENTION))).rejects.toThrow();

    // No half-installed retention: no function, no table.
    const left = await d.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'observer' and p.proname = 'run_rate_bucket_retention'`,
    );
    expect(left.rows[0]?.n).toBe(0);
    expect((await d.query(`select to_regclass('observer.maintenance') as t`)).rows[0]).toEqual({
      t: null,
    });
  });

  it("names the documented remedy in its hint", () => {
    const text = sql(RETENTION);
    expect(text).toContain("observer-cron-prerequisite.sql");
    /*
     * It must not install the extension itself: that lifecycle is the
     * operator's, and `drop extension pg_cron` deletes every job in the
     * project. Comments are stripped first — the file quotes the documented
     * install SQL so a reader knows what the precondition is, and matching that
     * quotation would be a test of prose rather than of behaviour.
     */
    expect(statementsOnly(text)).not.toMatch(/create\s+extension/i);
  });
});

describe("retention: the cleanup itself [RUN]", () => {
  const seed = async (d: PGlite) => {
    await d.exec(`
      insert into observer.ai_rate_buckets (scope, subject, window_kind, window_start, count)
      values ('session', 'ancient', 'hour', now() - interval '80 hours', 3),
             ('client',  'ancient', 'hour', now() - interval '60 hours', 3),
             ('session', 'recent',  'hour', now() - interval '2 hours',  3),
             ('project', 'recent',  'day',  now() - interval '10 hours', 3)`);
  };

  it("removes what has expired and keeps what has not", async () => {
    const d = await databaseWithRetention();
    await seed(d);

    const removed = await d.query<{ n: number }>(
      `select observer.run_rate_bucket_retention(48)::int as n`,
    );
    expect(removed.rows[0]?.n).toBe(2);

    const left = await d.query<{ subject: string }>(
      `select distinct subject from observer.ai_rate_buckets order by subject`,
    );
    expect(left.rows.map((r) => r.subject)).toEqual(["recent"]);
  });

  it("honours the threshold it is given", async () => {
    const d = await databaseWithRetention();
    await seed(d);

    // At six hours, everything but the two-hour bucket is expired.
    expect(
      (await d.query<{ n: number }>(`select observer.run_rate_bucket_retention(6)::int as n`))
        .rows[0]?.n,
    ).toBe(3);
  });

  it("records the run where an operator can see it", async () => {
    const d = await databaseWithRetention();
    await seed(d);

    // Nothing has run yet: no row at all, which is itself the honest answer.
    expect(
      (await d.query<{ n: number }>(`select count(*)::int as n from observer.maintenance`)).rows[0]
        ?.n,
    ).toBe(0);

    await d.exec(`select observer.run_rate_bucket_retention(48)`);

    const row = await d.query<{ removed: number; keep: number; fresh: boolean }>(
      `select last_removed as removed, keep_hours as keep,
              last_pruned_at > now() - interval '1 minute' as fresh
         from observer.maintenance where id = 1`,
    );
    expect(row.rows[0]).toEqual({ removed: 2, keep: 48, fresh: true });
  });

  it("refuses a threshold that would delete live windows", async () => {
    const d = await databaseWithRetention();
    await expect(d.query(`select observer.run_rate_bucket_retention(0)`)).rejects.toThrow(
      /at least 1 hour/,
    );
  });

  it("leaves the ceiling counting exactly as it did", async () => {
    /*
     * Retention moved out of admission, so the thing to prove is that nothing
     * about admission changed with it: ten requests against a ceiling of three
     * still admit three.
     */
    const d = await databaseWithRetention();
    await seed(d);
    await d.exec("set role service_role");

    let allowed = 0;
    for (let i = 0; i < 10; i += 1) {
      const r = await d.query<{ allowed: boolean }>(
        `select allowed from public.admit_ai_request(gen_random_uuid(), 'retention-subject',
           'retention-client', 'alpha/northgate', 3, 60, 120, 500,
           'alpha', 'northgate', 'developer', 12, $1)`,
        [KEY_ID],
      );
      if (r.rows[0]?.allowed) allowed += 1;
    }
    expect(allowed).toBe(3);

    await d.exec("reset role");
    // And nothing pruned along the way, because nothing in that path prunes.
    const ancient = await d.query<{ n: number }>(
      `select count(*)::int as n from observer.ai_rate_buckets where subject = 'ancient'`,
    );
    expect(ancient.rows[0]?.n).toBe(2);
  });
});

describe("retention stays private [RUN]", () => {
  it("keeps the maintenance row away from every browser role", async () => {
    const d = await databaseWithRetention();
    for (const role of ["anon", "authenticated"]) {
      const r = await d.query<{ allowed: boolean }>(
        `select has_table_privilege($1, 'observer.maintenance', 'SELECT') as allowed`,
        [role],
      );
      expect(r.rows[0]?.allowed).toBe(false);
    }
  });

  it("keeps both retention functions unexecutable by every browser role", async () => {
    const d = await databaseWithRetention();
    for (const fn of [
      "observer.run_rate_bucket_retention(integer)",
      "observer.prune_ai_rate_buckets(integer)",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        const r = await d.query<{ allowed: boolean }>(
          `select has_function_privilege($1, $2, 'EXECUTE') as allowed`,
          [role, fn],
        );
        expect(r.rows[0]?.allowed).toBe(false);
      }
    }
  });

  it("exposes no retention RPC through PostgREST", async () => {
    /*
     * `public` is the only Observer schema PostgREST is allowed to see. A
     * retention façade there would be callable by anything holding a key, and
     * housekeeping is not an API.
     */
    const d = await databaseWithRetention();
    const r = await d.query<{ names: string | null }>(
      `select string_agg(p.proname, ', ' order by p.proname) as names
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like '%prune%' or p.proname like '%retention%'
               or p.proname like '%maintenance%')`,
    );
    expect(r.rows[0]?.names).toBeNull();
  });

  it("runs as a definer with a fixed search_path", async () => {
    const d = await databaseWithRetention();
    const r = await d.query<{ secdef: boolean; config: string[] | null }>(
      `select p.prosecdef as secdef, p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'observer' and p.proname = 'run_rate_bucket_retention'`,
    );
    expect(r.rows[0]?.secdef).toBe(true);
    expect(r.rows[0]?.config).toContain("search_path=observer, pg_catalog");
  });
});

describe("retention is out of the interactive path [RUN + TEXT]", () => {
  it("is absent from the admission function the database actually holds", async () => {
    /*
     * Read from `pg_proc.prosrc` rather than from the migration text, so this
     * is a fact about the installed function and not about a file.
     */
    const d = await databaseWithRetention();
    const r = await d.query<{ src: string }>(
      `select pg_get_functiondef(p.oid) as src
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'observer' and p.proname = 'admit_ai_request'`,
    );
    const src = r.rows[0]?.src ?? "";
    expect(src).not.toMatch(/prune/i);
    expect(src).not.toMatch(/retention/i);
    expect(src).not.toMatch(/maintenance/i);
  });

  it("is absent from the quota function too", async () => {
    const d = await databaseWithRetention();
    const r = await d.query<{ src: string }>(
      `select pg_get_functiondef(p.oid) as src
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'observer' and p.proname = 'consume_ai_quota'`,
    );
    expect(r.rows[0]?.src ?? "").not.toMatch(/prune|retention|maintenance/i);
  });

  it("does not redefine admission in the retention migration", () => {
    /*
     * The review asked for this explicitly: copying the whole of
     * `admit_ai_request` into the retention migration to add one line is how
     * two files come to disagree about one function.
     */
    const text = sql(RETENTION);
    expect(statementsOnly(text)).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+\S*admit_ai_request/i,
    );
    // The old traffic-driven cleanup is removed, not left as a second answer.
    expect(text).toContain("drop function if exists observer.prune_if_due(integer)");
  });
});

describe("the scheduled job [TEXT + STAND-IN]", () => {
  it("names one job, one schedule and one command, exactly", () => {
    const text = sql(RETENTION);
    expect(text).toContain(`'${JOB_NAME}'`);
    expect(text).toContain(`'${JOB_SCHEDULE}'`);
    expect(text).toContain(`'${JOB_COMMAND}'`);
  });

  it("schedules exactly that job [STAND-IN]", async () => {
    const d = await databaseWithRetention();
    const r = await d.query<{
      jobname: string;
      schedule: string;
      command: string;
      active: boolean;
    }>(`select jobname, schedule, command, active from cron.job`);

    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      jobname: JOB_NAME,
      schedule: JOB_SCHEDULE,
      command: JOB_COMMAND,
      active: true,
    });
  });

  it("still holds exactly one job after being applied three times [STAND-IN]", async () => {
    /*
     * The stand-in's `cron.schedule` deliberately does NOT upsert by name, so
     * this passes only because the migration unschedules its OWN job first. If
     * somebody replaces that with a bare `cron.schedule` on the grounds that
     * Supabase documents an upsert, this test fails.
     */
    const d = await databaseWithRetention();
    await d.exec(sql(RETENTION));
    await d.exec(sql(RETENTION));

    const r = await d.query<{ n: number }>(`select count(*)::int as n from cron.job`);
    expect(r.rows[0]?.n).toBe(1);
  });

  it("corrects its own job when the schedule or command has drifted [STAND-IN]", async () => {
    const d = await databaseWithRetention();
    await d.exec(
      `update cron.job
          set schedule = '*/7 * * * *',
              command  = 'select observer.run_rate_bucket_retention(2);',
              active   = false
        where jobname = '${JOB_NAME}'`,
    );

    await d.exec(sql(RETENTION));

    const r = await d.query<{
      jobname: string;
      schedule: string;
      command: string;
      active: boolean;
    }>(`select jobname, schedule, command, active from cron.job`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      jobname: JOB_NAME,
      schedule: JOB_SCHEDULE,
      command: JOB_COMMAND,
      active: true,
    });
  });
});

/*
 * `cron.job` belongs to the whole project. Everything below is about what this
 * migration must NOT do to it.
 */
describe("the migration owns one job name and touches nothing else [STAND-IN]", () => {
  /** Every column of every job, as a comparable snapshot. */
  const snapshot = async (d: PGlite) =>
    (
      await d.query<{ row: string }>(`select (j.*)::text as row from cron.job j order by j.jobid`)
    ).rows.map((r) => r.row);

  const foreign = `select cron.schedule('someones-own-cleanup', '*/5 * * * *',
       'select observer.prune_ai_rate_buckets(12)')`;

  it("REFUSES to run while a differently named job targets Observer retention", async () => {
    /*
     * The previous version of this migration deleted that job, and the previous
     * version of this test asserted the deletion as correct behaviour. An
     * independent review called it destructive overreach and was right: a job
     * somebody else scheduled and manages is not a migration's to remove.
     *
     * It now fails closed and names the job, so a person decides.
     */
    const d = await databaseWithRetention();
    await d.exec(foreign);

    await expect(d.exec(sql(RETENTION))).rejects.toThrow(
      /another cron job appears to target Observer retention.*someones-own-cleanup/s,
    );
  });

  it("leaves that foreign job byte-for-byte unchanged when it refuses", async () => {
    const d = await databaseWithRetention();
    await d.exec(foreign);
    const before = await snapshot(d);

    await expect(d.exec(sql(RETENTION))).rejects.toThrow();

    expect(await snapshot(d)).toEqual(before);
    expect(before.some((row) => row.includes("someones-own-cleanup"))).toBe(true);
  });

  it("leaves an unrelated job untouched, and still converges on its own", async () => {
    // Nothing to do with Observer. It must survive a successful application.
    const d = await databaseWithRetention();
    await d.exec(`select cron.schedule('nightly-vacuum', '0 3 * * *', 'VACUUM')`);
    const before = await snapshot(d);

    await d.exec(sql(RETENTION));

    const after = await snapshot(d);
    const vacuum = (rows: readonly string[]) => rows.filter((r) => r.includes("nightly-vacuum"));
    expect(vacuum(after)).toEqual(vacuum(before));
    expect(
      (
        await d.query<{ n: number }>(`select count(*)::int as n from cron.job where jobname = $1`, [
          JOB_NAME,
        ])
      ).rows[0]?.n,
    ).toBe(1);
  });

  it("never deletes a job in another database, even under its own name", async () => {
    const d = await databaseWithRetention();
    await d.exec(
      `insert into cron.job (schedule, command, jobname, database)
       values ('0 * * * *', 'select observer.run_rate_bucket_retention(48);',
               '${JOB_NAME}', 'some-other-database')`,
    );
    const before = await snapshot(d);

    await expect(d.exec(sql(RETENTION))).rejects.toThrow(/exists under another owner or database/);

    expect(await snapshot(d)).toEqual(before);
  });

  it("never deletes a job belonging to another owner", async () => {
    const d = await databaseWithRetention();
    await d.exec(`create role someone_else nologin`);
    await d.exec(
      `insert into cron.job (schedule, command, jobname, username)
       values ('0 * * * *', 'select observer.run_rate_bucket_retention(48);',
               '${JOB_NAME}', 'someone_else')`,
    );
    const before = await snapshot(d);

    await expect(d.exec(sql(RETENTION))).rejects.toThrow(/exists under another owner or database/);

    expect(await snapshot(d)).toEqual(before);
    expect(before.some((row) => row.includes("someone_else"))).toBe(true);
  });

  it("does not select jobs for deletion by their command text", () => {
    /*
     * The mechanical guard. `cron.unschedule` may only ever be reached from a
     * query filtered by the owned job name — never by what a command contains.
     */
    const text = statementsOnly(sql(RETENTION));
    const start = text.indexOf("for v_jobid in");
    const end = text.indexOf("end loop", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const deletionLoop = text.slice(start, end);
    expect(deletionLoop).toContain("cron.unschedule");
    expect(deletionLoop).toContain("j.jobname = c_job_name");
    expect(deletionLoop).not.toMatch(/ilike/i);
    expect(deletionLoop).not.toMatch(/command/i);

    // And `cron.unschedule` appears exactly once in the whole file, so there is
    // no second, less careful deletion path somewhere else.
    expect(text.match(/cron\.unschedule/g)).toHaveLength(1);
  });
});

describe("the scheduled job, continued [STAND-IN]", () => {
  it("aborts if the job did not end up as intended [STAND-IN]", async () => {
    /*
     * The migration asserts its own postcondition against `cron.job` inside the
     * transaction. Break the scheduling primitive and it must refuse, not
     * quietly leave a database with a cleanup function and no cleanup.
     */
    const d = await database();
    await installCronStandIn(d);
    await d.exec(`
      create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
      returns bigint language sql as $fn$ select 0::bigint $fn$;
    `);

    await expect(d.exec(sql(RETENTION))).rejects.toThrow(/exactly one active job/);
    expect(
      (
        await d.query<{ n: number }>(
          `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'observer' and p.proname = 'run_rate_bucket_retention'`,
        )
      ).rows[0]?.n,
    ).toBe(0);
  });

  it("the command calls the private function with the 48-hour threshold", async () => {
    /*
     * Not a string check: the command is executed and its effect measured.
     * A command that named the wrong function, or the wrong number, would
     * delete the wrong rows here.
     */
    const d = await databaseWithRetention();
    await d.exec(`
      insert into observer.ai_rate_buckets (scope, subject, window_kind, window_start, count)
      values ('client', 'just-inside', 'hour', now() - interval '47 hours', 1),
             ('client', 'just-outside','hour', now() - interval '49 hours', 1)`);

    const command = (
      await d.query<{ command: string }>(`select command from cron.job where jobname = $1`, [
        JOB_NAME,
      ])
    ).rows[0]?.command;
    expect(command).toBe(JOB_COMMAND);
    await d.exec(command ?? "");

    const left = await d.query<{ subject: string }>(
      `select subject from observer.ai_rate_buckets order by subject`,
    );
    expect(left.rows.map((r) => r.subject)).toEqual(["just-inside"]);
  });
});
