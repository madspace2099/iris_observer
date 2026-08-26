-- Observer — scheduled retention for the rate buckets.
--
-- **Forward-only, and not yet applied.**
--
-- ## What was wrong twice
--
-- First, the documentation claimed retention that did not exist.
-- `observer.prune_ai_rate_buckets` was written, granted and documented, and
-- read-only inspection of the live database found *nothing calling it*: not the
-- ceiling, not admission, no `pg_cron` job, no trigger.
--
-- Then this file's first draft called it from `observer.admit_ai_request`, and
-- an independent review rejected that too, correctly. Cleanup driven by traffic
-- is opportunistic garbage collection, not retention: if no Ask Observer
-- request arrives, nothing runs, and a global browser fingerprint written on
-- Friday afternoon is still there on Monday. "At most once per hour" bounds how
-- often the delete *may* execute. It says nothing about how old a row can get.
--
-- It also put a `delete` inside the interactive path, so an answer's latency —
-- and its availability — depended on housekeeping that has nothing to do with
-- answering.
--
-- ## What this does instead
--
-- One `pg_cron` job, hourly, calling one private function with a 48-hour
-- threshold. Nothing in the request path. Retention becomes a property of the
-- clock rather than of traffic.
--
-- ## What may honestly be claimed afterwards
--
--   deletion threshold          48 hours
--   scheduled frequency         hourly, on the hour (UTC)
--   expected maximum row age    ~49 hours WHILE THE SCHEDULER IS HEALTHY
--   monitoring                  separate, and required — see
--                               `_sql-to-paste/observer-cron-health.sql`
--   guarantee                   none. A stopped scheduler stops deleting, and
--                               nothing in the database notices on its own.
--
-- That last line is the honest one. This is a maintained operational property,
-- not an unconditional retention guarantee, and legal retention remains a
-- pre-production review gate rather than something a migration can settle.

/* --- 0. the precondition, which this migration will not install ----------- */

/*
 * `pg_cron` is a project-level extension, not an Observer object. Supabase
 * documents enabling it either from the Dashboard (Integrations -> Cron) or
 * with, verbatim:
 *
 *   create extension pg_cron with schema pg_catalog;
 *   grant usage on schema cron to postgres;
 *   grant all privileges on all tables in schema cron to postgres;
 *
 * That is shipped as `supabase/prerequisites/observer-cron-prerequisite.sql`
 * and is step 1 of the rollout, deliberately outside this file:
 *
 *   - `drop extension pg_cron` deletes every job in the project, so the
 *     extension's lifecycle belongs to the operator, not to a table migration;
 *   - a restricted role running `supabase db push` cannot create extensions,
 *     and this migration should then fail for its own reason, not that one;
 *   - the reviewer asked for an explicit precondition rather than a silent
 *     assumption.
 *
 * So: assert, name the fix, and abort. A migration that "succeeds" while its
 * scheduler is absent would reinstate exactly the defect being fixed — a
 * retention claim resting on something nobody runs.
 */
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception
      using errcode = 'feature_not_supported',
            message = 'observer retention requires pg_cron, which is not installed',
            detail  = 'Without a scheduler this migration can create a cleanup function but no cleanup. It refuses rather than report success.',
            hint    = 'Run supabase/prerequisites/observer-cron-prerequisite.sql (or enable Cron under Integrations in the Supabase dashboard), then apply this migration again.';
  end if;

  if not has_schema_privilege(current_user, 'cron', 'usage') then
    raise exception
      using errcode = 'insufficient_privilege',
            message = 'observer retention cannot schedule: no USAGE on schema cron',
            hint    = 'grant usage on schema cron to postgres; grant all privileges on all tables in schema cron to postgres;';
  end if;
end $$;

/* --- 1. what the operator can look at ------------------------------------- */

create table if not exists observer.maintenance (
  id             smallint    primary key,
  last_pruned_at timestamptz not null,
  last_removed   integer     not null default 0,
  keep_hours     integer     not null default 48
);

comment on table observer.maintenance is
  'One row. When retention last ran, how many buckets it removed and under what threshold. Written by the scheduled job, readable by the operator, unreachable from any browser role.';

alter table observer.maintenance enable row level security;
revoke all on observer.maintenance from anon, authenticated, public;

/*
 * Two columns arrived after this file's first draft. `add column if not exists`
 * rather than a fresh `create table`, so a database that somehow received the
 * earlier shape converges instead of failing.
 */
alter table observer.maintenance
  add column if not exists last_removed integer not null default 0;
alter table observer.maintenance
  add column if not exists keep_hours integer not null default 48;

/* --- 2. the traffic-driven cleanup this replaces -------------------------- */

/*
 * Removed, not kept as defence in depth.
 *
 * Two functions deleting the same rows on two different triggers is two things
 * to reason about for one property, and the request-driven one carried the cost
 * that mattered: it ran inside admission, so an answer's latency depended on
 * housekeeping. Keeping it would also leave a second answer to "what prunes
 * this table?", and the review's finding was precisely that the answer was
 * unclear.
 *
 * `if exists` because it was never applied to the live database — this drop is
 * for any environment that took the earlier draft.
 */
drop function if exists observer.prune_if_due(integer);

/* --- 3. the cleanup the scheduler calls ----------------------------------- */

/*
 * `observer.prune_ai_rate_buckets` (migration `20260825121927`) still does the
 * deleting. This wraps it so that a run leaves a trace: an operator can ask
 * when retention last worked without reading `cron.job_run_details`, and the
 * health verifier can tell "the job is scheduled" apart from "the job ran".
 *
 * `pg_try_advisory_xact_lock` bounds overlap and nothing else. If a previous
 * run is somehow still going, this one returns -1 immediately rather than
 * queueing behind a delete — and, deliberately, does *not* update
 * `last_pruned_at`, so a scheduler that only ever collides reads as stale
 * rather than as healthy.
 *
 * Private. There is no `public` façade and no grant to a browser role: this is
 * housekeeping, not an API.
 */
create or replace function observer.run_rate_bucket_retention(p_keep_hours integer default 48)
returns integer
language plpgsql
security definer
set search_path = observer, pg_catalog
as $$
declare
  v_keep    integer := coalesce(p_keep_hours, 48);
  v_deleted integer;
begin
  if v_keep < 1 then
    raise exception 'observer retention threshold must be at least 1 hour, got %', v_keep;
  end if;

  if not pg_try_advisory_xact_lock(hashtext('observer.retention')) then
    return -1;
  end if;

  v_deleted := observer.prune_ai_rate_buckets(v_keep);

  insert into observer.maintenance (id, last_pruned_at, last_removed, keep_hours)
  values (1, now(), v_deleted, v_keep)
  on conflict (id) do update
    set last_pruned_at = excluded.last_pruned_at,
        last_removed   = excluded.last_removed,
        keep_hours     = excluded.keep_hours;

  return v_deleted;
end;
$$;

comment on function observer.run_rate_bucket_retention(integer) is
  'Deletes rate buckets older than p_keep_hours and records the run. Called only by the pg_cron job observer-prune-ai-rate-buckets: never from the request path, never from a browser.';

revoke all on function observer.run_rate_bucket_retention(integer)
  from anon, authenticated, public;

/* --- 4. exactly one scheduled job ----------------------------------------- */

/*
 * Convergence is explicit rather than inherited.
 *
 * Supabase documents `cron.schedule` as overwriting a job of the same name, and
 * that is probably enough — but "probably" is how the last several defects got
 * in. Every job that targets Observer retention is unscheduled first, under any
 * name, and then exactly one is created. Reapplication therefore converges by
 * construction rather than by trusting an upsert.
 *
 * The `command ilike` clauses deliberately also catch a job somebody scheduled
 * by hand against the same functions. There must be one.
 *
 * The postcondition is asserted here, in the transaction, against the real
 * `cron.job` table. If the count is not exactly one the migration raises and
 * the whole thing rolls back — including the function above, so a database can
 * never end up holding the cleanup without the schedule that makes it
 * retention.
 */
do $$
declare
  c_job_name constant text := 'observer-prune-ai-rate-buckets';
  c_schedule constant text := '0 * * * *';
  c_command  constant text := 'select observer.run_rate_bucket_retention(48);';
  v_jobid    bigint;
  v_count    integer;
begin
  for v_jobid in
    select j.jobid
      from cron.job j
     where j.jobname = c_job_name
        or j.command ilike '%observer.run_rate_bucket_retention%'
        or j.command ilike '%observer.prune_ai_rate_buckets%'
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  perform cron.schedule(c_job_name, c_schedule, c_command);

  select count(*) into v_count
    from cron.job j
   where j.jobname = c_job_name
     and j.active
     and j.schedule = c_schedule
     and j.command  = c_command
     and j.database = current_database();

  if v_count <> 1 then
    raise exception
      'observer retention expected exactly one active job named % on this database, found %',
      c_job_name, v_count;
  end if;

  select count(*) into v_count
    from cron.job j
   where j.command ilike '%observer.run_rate_bucket_retention%'
      or j.command ilike '%observer.prune_ai_rate_buckets%';

  if v_count <> 1 then
    raise exception
      'observer retention expected exactly one cleanup job in cron.job, found %', v_count;
  end if;
end $$;

/* --- 5. the schema cache -------------------------------------------------- */

-- No function reachable through PostgREST changed shape here, so this is
-- belt-and-braces. It costs nothing and it removes the question, and — as in
-- the other unapplied migrations — it is inside the transaction, so PostgreSQL
-- delivers it only if this commits.
notify pgrst, 'reload schema';
