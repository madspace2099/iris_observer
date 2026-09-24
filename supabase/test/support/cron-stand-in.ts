import type { PGlite } from "@electric-sql/pglite";

import { asPlatform } from "./pglite";

/**
 * A stand-in for `pg_cron`, and the label is load-bearing.
 *
 * PGlite cannot run `pg_cron`: it is a background worker in a shared library,
 * and there is no postmaster here to preload it. Pretending otherwise and
 * reporting green would reinstate exactly the class of defect the retention
 * round fixed — a retention claim resting on something that never runs.
 *
 * So this creates the documented surfaces the migration *writes to* — the
 * `cron.job` table and `cron.schedule` / `cron.unschedule` — and the one the
 * health verifier *reads*, `cron.job_run_details`, and nothing else. It has no
 * scheduler and no clock. What a test can therefore prove is that the
 * migration converges on one correct job row; what it cannot prove is that
 * anything ever executes it. That is a live check, and it is why
 * `observer-cron-health.sql` exists.
 *
 * Note what is deliberately absent: `cron.schedule` here does NOT overwrite by
 * name. Supabase documents that it does, and the migration does not rely on it
 * — it unschedules every matching job first. Leaving the upsert out of the
 * stand-in means the convergence test fails if that dependency is ever
 * reintroduced, instead of passing because the stand-in was generous.
 *
 * ## Who installs it
 *
 * The platform, as on the host: `asPlatform` runs it as the superuser, the way
 * `create extension pg_cron` leaves the schema to Supabase's own role. Then the
 * two grants of `supabase/prerequisites/observer-cron-prerequisite.sql` give
 * `postgres` what the operator's step gives it there. One grant goes beyond that
 * file: the stand-in's `cron.schedule` is SQL running as its caller and draws on
 * the job sequence, where the real one is C and needs nothing.
 *
 * Shared by every suite that applies the whole chain, so there is one
 * stand-in to be wrong about rather than one per file.
 */
export async function installCronStandIn(db: PGlite): Promise<void> {
  await asPlatform(
    db,
    `
    -- The migration's precondition reads pg_catalog, not the cron schema, so
    -- the stand-in has to satisfy it there. Only a superuser may write the
    -- catalogue; a real deployment gets this row from CREATE EXTENSION.
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
      values (p_schedule, p_command, p_name)
      returning jobid;
    $fn$;

    create function cron.unschedule(p_jobid bigint)
    returns boolean language sql as $fn$
      delete from cron.job where jobid = p_jobid returning true;
    $fn$;

    -- observer-cron-prerequisite.sql, the operator's two grants.
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
    -- The stand-in's own need, see above.
    grant usage on all sequences in schema cron to postgres;
  `,
  );
}
