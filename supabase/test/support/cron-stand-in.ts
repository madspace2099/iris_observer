import type { PGlite } from "@electric-sql/pglite";

/**
 * A stand-in for `pg_cron`, and the label is load-bearing.
 *
 * PGlite cannot run `pg_cron`: it is a background worker in a shared library,
 * and there is no postmaster here to preload it. Pretending otherwise and
 * reporting green would reinstate exactly the class of defect the retention
 * round fixed — a retention claim resting on something that never runs.
 *
 * So this creates the two documented surfaces the migration *writes to* — the
 * `cron.job` table and `cron.schedule` / `cron.unschedule` — and nothing else.
 * It has no scheduler and no clock. What a test can therefore prove is that
 * the migration converges on one correct job row; what it cannot prove is
 * that anything ever executes it. That is a live check, and it is why
 * `observer-cron-health.sql` exists.
 *
 * Note what is deliberately absent: `cron.schedule` here does NOT overwrite by
 * name. Supabase documents that it does, and the migration does not rely on it
 * — it unschedules every matching job first. Leaving the upsert out of the
 * stand-in means the convergence test fails if that dependency is ever
 * reintroduced, instead of passing because the stand-in was generous.
 *
 * Shared by every suite that applies the whole chain, so there is one
 * stand-in to be wrong about rather than one per file.
 */
export async function installCronStandIn(db: PGlite): Promise<void> {
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
