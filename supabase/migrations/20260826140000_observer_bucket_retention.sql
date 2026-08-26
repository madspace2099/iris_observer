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
 * THIS MIGRATION OWNS ONE JOB NAME AND NOTHING ELSE.
 *
 *   observer-prune-ai-rate-buckets
 *
 * The previous version unscheduled anything whose command mentioned an Observer
 * function, under any name. An independent review called that destructive
 * overreach and was right: `cron.job` is shared by the whole project, a job
 * somebody else scheduled and manages is not this migration's to delete, and
 * the previous test suite made the overreach explicit by creating a job called
 * `someones-own-cleanup` and asserting it was destroyed. A migration that
 * deletes other people's scheduled work in order to tidy up is a worse problem
 * than the duplicate it was tidying.
 *
 * So: DETECT, then FAIL CLOSED. A differently named job that appears to target
 * Observer retention stops this migration before it touches anything, and the
 * operator decides what that job is for. Nothing foreign is modified — and
 * because the abort happens before any write, and inside the transaction
 * regardless, every foreign row is left exactly as it was found.
 *
 * WHAT THE DETECTOR CAN AND CANNOT SEE. It is a substring scan over
 * `cron.command`. It catches the realistic case — somebody scheduled the same
 * function by hand — and it cannot catch every semantically equivalent command:
 * a wrapper function, a quoted identifier, `EXECUTE` of a string built at
 * runtime, a `DELETE FROM observer.ai_rate_buckets` written out longhand. It is
 * a guard against the likely collision, not a proof of uniqueness, and nothing
 * downstream may treat it as one.
 *
 * SCOPE. Both the detector and the ownership check are scoped to
 * `current_database()`: a job registered against another database in the
 * cluster never touches these tables and is none of our business. A job holding
 * our name but owned by another role is also refused rather than deleted —
 * `cron.unschedule` would fail on it anyway, and failing with an explanation
 * beats failing with a permission error.
 */
do $$
declare
  c_job_name constant text := 'observer-prune-ai-rate-buckets';
  c_schedule constant text := '0 * * * *';
  c_command  constant text := 'select observer.run_rate_bucket_retention(48);';
  v_foreign  text;
  v_jobid    bigint;
  v_count    integer;
begin
  /* --- 4a. refuse to proceed past somebody else's job -------------------- */

  select string_agg(quote_literal(j.jobname) || ' (owner ' || j.username || ')',
                    ', ' order by j.jobname)
    into v_foreign
    from cron.job j
   where j.jobname is distinct from c_job_name
     and j.database = current_database()
     and (j.command ilike '%run_rate_bucket_retention%'
          or j.command ilike '%prune_ai_rate_buckets%');

  if v_foreign is not null then
    raise exception
      using errcode = 'raise_exception',
            message = 'another cron job appears to target Observer retention: ' || v_foreign,
            detail  = 'This migration owns only the job named observer-prune-ai-rate-buckets. It will not modify or delete a job it does not own, and it will not install a second cleaner beside one.',
            hint    = 'Decide what that job is for. Unschedule it yourself if it is a leftover, or rename it to observer-prune-ai-rate-buckets if it was meant to be this one, then apply this migration again.';
  end if;

  /* --- 4b. refuse to touch our own name in the wrong hands --------------- */

  select string_agg(j.jobname || ' (owner ' || j.username || ', database ' || j.database || ')',
                    ', ' order by j.jobid)
    into v_foreign
    from cron.job j
   where j.jobname = c_job_name
     and (j.database is distinct from current_database()
          or j.username is distinct from current_user);

  if v_foreign is not null then
    raise exception
      using errcode = 'insufficient_privilege',
            message = 'a cron job named ' || c_job_name || ' exists under another owner or database: ' || v_foreign,
            detail  = 'Unscheduling it is not this migration''s to do.',
            hint    = 'Resolve the ownership by hand, then apply this migration again.';
  end if;

  /* --- 4c. replace exactly the job this migration owns -------------------- */

  /*
   * Supabase documents `cron.schedule` as overwriting a job of the same
   * case-sensitive name, and that alone would be enough. The explicit
   * unschedule is kept because it is bounded to the owned name — it can only
   * ever delete this migration's own job — and because it converges even if a
   * row was inserted into `cron.job` directly, which the documented upsert
   * would leave duplicated.
   */
  for v_jobid in
    select j.jobid
      from cron.job j
     where j.jobname = c_job_name
       and j.database = current_database()
       and j.username = current_user
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  perform cron.schedule(c_job_name, c_schedule, c_command);

  /* --- 4d. the postcondition, asserted in the transaction ---------------- */

  /*
   * If this is not exactly right the migration raises and the whole thing rolls
   * back — including `run_rate_bucket_retention` above, so a database can never
   * end up holding the cleanup without the schedule that makes it retention.
   */
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
   where j.jobname = c_job_name;

  if v_count <> 1 then
    raise exception
      'observer retention expected one job named %, found % across all databases and owners',
      c_job_name, v_count;
  end if;
end $$;

/* --- 5. the schema cache -------------------------------------------------- */

-- No function reachable through PostgREST changed shape here, so this is
-- belt-and-braces. It costs nothing and it removes the question, and — as in
-- the other unapplied migrations — it is inside the transaction, so PostgreSQL
-- delivers it only if this commits.
notify pgrst, 'reload schema';
