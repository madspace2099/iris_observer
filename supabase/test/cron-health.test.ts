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
 * The health verifier, executed.
 *
 * `observer-cron-health.sql` is the only artefact in this release whose logic
 * is complicated enough to be wrong — twenty-six rows of catalogue queries,
 * privilege probes and interval arithmetic, written to be pasted into a SQL
 * editor by an operator at three in the morning. A verifier with a bug in it is
 * worse than no verifier: it reports PASS.
 *
 * It is therefore version-controlled under `supabase/verifiers/` rather than
 * living only in the operator's scratch directory, and it is run here.
 *
 * ## What this can and cannot establish
 *
 * PGlite has no `pg_cron`: it is a background worker in a shared library and
 * there is no postmaster here to preload one. So the tests below install a
 * STAND-IN — `cron.job` and `cron.job_run_details` as plain tables — and drive
 * it by hand.
 *
 * That proves the verifier's *logic*: that it reads the right columns, that its
 * expectations match what a correct installation produces, and — the reason it
 * exists — that every way the scheduler can be broken produces FAIL rather than
 * PASS. It proves nothing about pg_cron itself.
 *
 * One row can never pass here, deliberately: row 3 asks whether the scheduler
 * process is alive, and in PGlite it is not. Every test below expects exactly
 * that one failure and nothing else, so the "healthy" baseline is 25 of 26 with
 * row 3 named. If a change ever makes row 3 pass locally, something is faking
 * the thing this file exists to detect.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const VERIFIER = join(import.meta.dirname, "..", "verifiers", "observer-cron-health.sql");

const CONTRACT = "20260826090000_observer_audit_facade_cleanup.sql";

const JOB = "observer-prune-ai-rate-buckets";

/** Row 3 asks for a live background worker. There isn't one, and there can't be. */
const NO_SCHEDULER = 3;

interface Row {
  readonly "#": number;
  readonly check: string;
  readonly expected: string;
  readonly actual: string;
  readonly verdict: string;
}

async function installed(): Promise<PGlite> {
  const db = await openDatabase();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);

  /*
   * The pg_cron stand-in. `cron.job_run_details` carries only the columns this
   * verifier reads, and `cron.schedule` deliberately does not upsert by name —
   * the migration must converge on its own.
   */
  await db.exec(`
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

    create table cron.job_run_details (
      jobid          bigint,
      runid          bigserial primary key,
      database       text,
      username       text,
      command        text,
      status         text,
      return_message text,
      start_time     timestamptz,
      end_time       timestamptz
    );

    create function cron.schedule(p_name text, p_schedule text, p_command text)
    returns bigint language sql as $fn$
      insert into cron.job (schedule, command, jobname)
      values (p_schedule, p_command, p_name) returning jobid;
    $fn$;

    create function cron.unschedule(p_jobid bigint)
    returns boolean language sql as $fn$
      delete from cron.job where jobid = p_jobid returning true;
    $fn$;

    revoke all on schema cron from anon, authenticated, public;
    revoke all on all tables in schema cron from anon, authenticated, public;
  `);

  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file === CONTRACT) continue;
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

/** A database whose scheduled job has been running happily for a day. */
async function healthy(): Promise<PGlite> {
  const db = await installed();
  await ranAt(db, "20 minutes", "succeeded");
  await ranAt(db, "1 hour 20 minutes", "succeeded");
  await db.exec(`select observer.run_rate_bucket_retention(48)`);
  return db;
}

async function ranAt(db: PGlite, ago: string, status: string): Promise<void> {
  await db.query(
    `insert into cron.job_run_details
       (jobid, database, username, command, status, start_time, end_time)
     select jobid, current_database(), current_user, command, $2,
            now() - $1::interval, now() - $1::interval + interval '80 ms'
       from cron.job where jobname = $3`,
    [ago, status, JOB],
  );
}

async function health(db: PGlite): Promise<readonly Row[]> {
  const r = await db.query<Row>(readFileSync(VERIFIER, "utf8"));
  return r.rows;
}

/** Which rows failed, by number. */
function failed(rows: readonly Row[]): readonly number[] {
  return rows.filter((row) => row.verdict === "FAIL").map((row) => row["#"]);
}

describe("the health verifier reads a healthy installation correctly", () => {
  it("returns twenty-six rows", async () => {
    expect(await health(await healthy())).toHaveLength(26);
  });

  it("passes everything except the row that cannot pass without a scheduler", async () => {
    const rows = await health(await healthy());
    expect(failed(rows)).toEqual([NO_SCHEDULER]);

    // And it fails for the honest reason, not by accident.
    const row = rows.find((x) => x["#"] === NO_SCHEDULER);
    expect(row?.check).toContain("scheduler process is alive");
    expect(row?.actual).toBe("false");
  });

  it("reports the job's name, schedule and command exactly", async () => {
    const rows = await health(await healthy());
    const at = (n: number) => rows.find((x) => x["#"] === n);

    expect(at(6)?.actual).toBe("0 * * * *");
    expect(at(7)?.actual).toBe("select observer.run_rate_bucket_retention(48);");
    expect(at(9)?.actual).toBe("48");
    expect(at(11)?.actual).toBe("(none)");
  });
});

/*
 * The point of the file. Each of these is a database that a catalogue check
 * would be perfectly happy with, and on which nothing is being deleted.
 */
describe("every way the scheduler can be broken reads FAIL", () => {
  it("a MISSING job", async () => {
    const db = await healthy();
    await db.exec(`delete from cron.job where jobname = '${JOB}'`);

    const rows = await health(db);
    // 4 count, 5 active, 6 schedule, 7 command, 8 name, 9 threshold,
    // 10 database, 14 an owner that cannot be read off a job that is not there.
    expect(failed(rows)).toEqual(expect.arrayContaining([4, 5, 6, 7, 8, 9, 10, 14]));
    expect(rows.find((x) => x["#"] === 5)?.actual).toBe("(no job)");
  });

  it("an INACTIVE job — present in cron.job, and never running", async () => {
    const db = await healthy();
    await db.exec(`update cron.job set active = false where jobname = '${JOB}'`);

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 5]);
    expect(rows.find((x) => x["#"] === 5)?.actual).toBe("false");
  });

  it("a SECOND CLEANER under another name — reported, never deleted", async () => {
    /*
     * Row 11 changed meaning this round. It used to count every job whose
     * command mentioned an Observer function, including our own, and expect 1.
     * It now lists OTHER jobs and expects none — because the migration no
     * longer deletes what it does not own, and this file never deleted
     * anything. The verifier's job is to say "somebody else is also pruning
     * this table", by name, and leave the decision to a person.
     */
    const db = await healthy();
    await db.exec(
      `select cron.schedule('someones-own-cleanup', '*/5 * * * *',
         'select observer.prune_ai_rate_buckets(12)')`,
    );

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 11]);
    expect(rows.find((x) => x["#"] === 11)?.actual).toBe("someones-own-cleanup");

    // And reading the health of the database did not change it.
    expect(
      (await db.query<{ n: number }>(`select count(*)::int as n from cron.job`)).rows[0]?.n,
    ).toBe(2);
  });

  it("a foreign job in ANOTHER database is not reported as ours", async () => {
    // It cannot touch these tables, so flagging it would be noise that trains
    // an operator to ignore row 11.
    const db = await healthy();
    await db.exec(
      `insert into cron.job (schedule, command, jobname, database)
       values ('*/5 * * * *', 'select observer.prune_ai_rate_buckets(12)',
               'elsewhere-cleanup', 'some-other-database')`,
    );

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER]);
  });

  it("a duplicate under the SAME name", async () => {
    const db = await healthy();
    await db.exec(
      `insert into cron.job (schedule, command, jobname)
       values ('0 * * * *', 'select observer.run_rate_bucket_retention(48);', '${JOB}')`,
    );

    const rows = await health(db);
    expect(failed(rows)).toEqual(expect.arrayContaining([4]));
  });

  it("a STALE scheduler — the job is perfect and has not run for three hours", async () => {
    /*
     * The failure mode this whole round is about. Rows 4 to 21 are untouched:
     * the job exists, is active, has the right schedule and the right command,
     * and the function it calls is present and private. Nothing is being
     * deleted.
     */
    const db = await installed();
    await ranAt(db, "3 hours", "succeeded");
    await db.exec(`select observer.run_rate_bucket_retention(48)`);
    await db.exec(`update observer.maintenance set last_pruned_at = now() - interval '3 hours'`);

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 23, 24]);
    expect(rows.find((x) => x["#"] === 23)?.actual).toMatch(/^UNHEALTHY \(last success /);
  });

  it("a job that has NEVER run", async () => {
    const db = await installed();

    const rows = await health(db);
    expect(failed(rows)).toEqual(expect.arrayContaining([21, 22, 23, 24]));
    expect(rows.find((x) => x["#"] === 22)?.actual).toBe("(never ran)");
    expect(rows.find((x) => x["#"] === 23)?.actual).toBe("UNHEALTHY (never succeeded)");
    expect(rows.find((x) => x["#"] === 24)?.actual).toBe("(never ran)");
  });

  it("a FAILING job — the most recent run errored", async () => {
    const db = await installed();
    await ranAt(db, "70 minutes", "succeeded");
    await db.exec(`select observer.run_rate_bucket_retention(48)`);
    await ranAt(db, "10 minutes", "failed");

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 22, 25]);
    expect(rows.find((x) => x["#"] === 22)?.actual).toBe("failed");
    expect(rows.find((x) => x["#"] === 25)?.actual).toBe("1");
  });

  it("a job pointed at the WRONG function or the WRONG threshold", async () => {
    const db = await healthy();
    await db.exec(
      `update cron.job set command = 'select observer.prune_ai_rate_buckets(2);'
        where jobname = '${JOB}'`,
    );

    const rows = await health(db);
    expect(failed(rows)).toEqual(expect.arrayContaining([7, 8, 9]));
  });

  it("a job scheduled against another database in the cluster", async () => {
    const db = await healthy();
    await db.exec(`update cron.job set database = 'somewhere-else' where jobname = '${JOB}'`);

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 10]);
  });

  it("buckets that have outlived the stated ceiling", async () => {
    const db = await healthy();
    await db.exec(
      `insert into observer.ai_rate_buckets (scope, subject, window_kind, window_start, count)
       values ('client', 'survivor', 'hour', now() - interval '80 hours', 1)`,
    );

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 26]);
    expect(rows.find((x) => x["#"] === 26)?.actual).toMatch(/old$/);
  });
});

/*
 * Row 13 used to read `prosecdef and proconfig is not null`, which proves
 * neither half of "definer with a fixed search_path". These are the databases
 * it passed on.
 */
describe("row 13 proves a fixed search_path, not merely some configuration", () => {
  const at13 = (rows: readonly Row[]) => rows.find((x) => x["#"] === 13);

  it("reads the search path actually set, on a correct installation", async () => {
    const rows = await health(await healthy());
    expect(at13(rows)?.actual).toBe("security definer; search_path=observer, pg_catalog");
    expect(at13(rows)?.verdict).toBe("PASS");
  });

  it("FAILS on an unrelated setting with no search_path — the old check passed here", async () => {
    /*
     * The exact shape the previous check could not see. `proconfig` is
     * `{statement_timeout=5s}`: non-null, so `proconfig is not null` was true,
     * and the function is a SECURITY DEFINER resolving unqualified names
     * through whatever search_path its caller happens to hold.
     */
    const db = await healthy();
    await db.exec(`
      alter function observer.run_rate_bucket_retention(integer) reset search_path;
      alter function observer.run_rate_bucket_retention(integer) set statement_timeout = '5s';
    `);

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 13]);
    expect(at13(rows)?.actual).toBe("security definer; NO search_path");

    // The old predicate, evaluated on this same database, would have said true.
    const old = await db.query<{ ok: boolean }>(
      `select bool_and(p.prosecdef and p.proconfig is not null) as ok
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'observer' and p.proname = 'run_rate_bucket_retention'`,
    );
    expect(old.rows[0]?.ok).toBe(true);
  });

  it("FAILS when the search path is gone entirely", async () => {
    const db = await healthy();
    await db.exec(`alter function observer.run_rate_bucket_retention(integer) reset all`);

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 13]);
    expect(at13(rows)?.actual).toBe("security definer; NO search_path");
  });

  it("FAILS when the search path is the wrong one", async () => {
    const db = await healthy();
    await db.exec(
      `alter function observer.run_rate_bucket_retention(integer) set search_path = public`,
    );

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 13]);
    expect(at13(rows)?.actual).toBe("security definer; search_path=public");
  });

  it("FAILS when the function is not SECURITY DEFINER", async () => {
    const db = await healthy();
    await db.exec(`alter function observer.run_rate_bucket_retention(integer) security invoker`);

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 13]);
    expect(at13(rows)?.actual).toBe("SECURITY INVOKER; search_path=observer, pg_catalog");
  });

  it("FAILS when an unexpected overload appears", async () => {
    const db = await healthy();
    await db.exec(`
      create function observer.run_rate_bucket_retention(p_keep text) returns integer
      language sql as $fn$ select 0 $fn$;
    `);

    const rows = await health(db);
    // 12 counts two, and 13 aggregates two descriptions into one string.
    expect(failed(rows)).toEqual([NO_SCHEDULER, 12, 13]);
    expect(at13(rows)?.actual).toContain(" | ");
  });

  it("FAILS when the function is missing altogether", async () => {
    const db = await healthy();
    await db.exec(`drop function observer.run_rate_bucket_retention(integer)`);

    const rows = await health(db);
    expect(failed(rows)).toEqual(expect.arrayContaining([12, 13]));
    expect(at13(rows)?.actual).toBe("(missing)");
  });
});

describe("row 14 catches a job that will fail every run", () => {
  it("FAILS when the job owner cannot execute the cleanup function", async () => {
    /*
     * Perfectly scheduled, perfectly named, right command, right threshold —
     * and it errors on every execution because the role it runs as was never
     * granted EXECUTE. Rows 4 to 13 all pass on this database.
     */
    const db = await healthy();
    await db.exec(`create role scheduler_without_rights nologin`);
    await db.exec(
      `update cron.job set username = 'scheduler_without_rights' where jobname = '${JOB}'`,
    );

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 14]);
    expect(rows.find((x) => x["#"] === 14)?.actual).toBe("false");
  });
});

describe("the verifier is honest about privilege", () => {
  it("fails if a browser role is ever granted the cleanup function", async () => {
    const db = await healthy();
    await db.exec(
      `grant execute on function observer.run_rate_bucket_retention(integer) to authenticated`,
    );

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 16]);
    expect(rows.find((x) => x["#"] === 16)?.actual).toContain("authenticated");
  });

  it("fails if a retention façade ever appears in public", async () => {
    const db = await healthy();
    await db.exec(`
      create function public.prune_observer_buckets() returns integer
      language sql security definer set search_path = observer, pg_catalog
      as $fn$ select observer.prune_ai_rate_buckets(48) $fn$;
    `);

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 19]);
  });

  it("fails if cleanup is ever put back into the admission path", async () => {
    const db = await healthy();
    await db.exec(`
      create or replace function observer.consume_ai_quota(
        p_session text, p_client_hash text, p_project text,
        p_per_minute integer, p_per_hour integer,
        p_client_per_hour integer, p_project_per_day integer)
      returns table (allowed boolean, reason text, retry_after_seconds integer)
      language plpgsql security definer set search_path = observer, pg_catalog
      as $fn$
      begin
        perform observer.prune_ai_rate_buckets(48);
        return query select true, null::text, 0;
      end;
      $fn$;
    `);

    const rows = await health(db);
    expect(failed(rows)).toEqual([NO_SCHEDULER, 15]);
  });
});
