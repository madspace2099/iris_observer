-- IRIS Observer — scheduled-retention health. Reads only.
--
-- No insert, update, delete or DDL. Safe to run any number of times, including
-- against Production. Run it as the operator (the SQL Editor's default role).
--
-- ## What this is for
--
-- `observer-verify-2.sql` proves the schema is shaped correctly. It cannot
-- prove that anything *runs*, and retention is entirely a claim about running.
-- The whole finding that produced this file was that
-- `observer.prune_ai_rate_buckets` existed, was granted, was documented — and
-- was invoked by nothing. A catalogue check would have passed on that database.
--
-- So every row below is about execution, privilege or age, and the ones that
-- matter most are 21 to 25.
--
-- ## What may honestly be claimed when this reads 25/25
--
--   deletion threshold        48 hours
--   scheduled frequency       hourly, on the hour (UTC)
--   expected maximum row age  ~49 hours WHILE THE SCHEDULER IS HEALTHY
--   monitoring                this file, run on a schedule of your own
--   guarantee                 none
--
-- The last line is not a formality. A stopped `pg_cron` worker stops deleting
-- and nothing in the database notices; that is exactly what rows 3, 21 and 22
-- are for. Legal retention remains a pre-production review gate, not something
-- a green verifier settles.
--
-- ## The one failure reported as an error rather than as a row
--
-- If this query fails with `relation "cron.job" does not exist`, THAT IS THE
-- FINDING: `pg_cron` is not installed, nothing is scheduled and nothing is
-- being deleted. A query cannot select from a table that is not there, so this
-- single case cannot be a FAIL row. Run
-- `supabase/prerequisites/observer-cron-prerequisite.sql` and then migration
-- `20260826140000`, which refuses to apply without it.

with r as (

  /* --- the module ---------------------------------------------------------- */

  select 1 as ord, 'pg_cron extension installed' as item, 'true' as expect,
    (exists (select 1 from pg_extension where extname = 'pg_cron'))::text as actual

  -- Named jobs and `cron.job_run_details` both arrived before 1.4. Asserting a
  -- floor rather than an exact version, so a Supabase upgrade is not a FAIL.
  union all select 2, 'pg_cron version supports named jobs (>= 1.4)', 'true',
    (select coalesce(
       (string_to_array(extversion, '.')::int[] >= array[1, 4])::text, 'false')
       from pg_extension where extname = 'pg_cron')

  -- Supabase's own debugging guide: the scheduler is a background worker, and
  -- if the worker has died the jobs simply stop. Nothing else in this file
  -- would notice for two hours.
  union all select 3, 'pg_cron scheduler process is alive', 'true',
    (select (count(*) > 0)::text from pg_stat_activity
      where application_name ilike 'pg_cron scheduler')

  /* --- exactly one job, and exactly the right one -------------------------- */

  union all select 4, 'jobs named "observer-prune-ai-rate-buckets"', '1',
    (select count(*)::text from cron.job
      where jobname = 'observer-prune-ai-rate-buckets')

  -- A deactivated job stays in `cron.job` and never runs. Counting rows would
  -- pass on it.
  union all select 5, 'that job is active', 'true',
    (select coalesce(bool_and(active)::text, '(no job)') from cron.job
      where jobname = 'observer-prune-ai-rate-buckets')

  union all select 6, 'its schedule', '0 * * * *',
    (select coalesce(string_agg(schedule, ' | '), '(no job)') from cron.job
      where jobname = 'observer-prune-ai-rate-buckets')

  union all select 7, 'its command, exactly',
    'select observer.run_rate_bucket_retention(48);',
    (select coalesce(string_agg(command, ' | '), '(no job)') from cron.job
      where jobname = 'observer-prune-ai-rate-buckets')

  -- Rows 8 and 9 restate row 7 in the two ways it could be wrong while still
  -- looking plausible: the right threshold on the wrong function, or the right
  -- function on the wrong threshold.
  union all select 8, 'the command calls the private Observer cleanup function', 'true',
    (select coalesce(
       bool_and(command like '%observer.run_rate_bucket_retention%')::text, '(no job)')
       from cron.job where jobname = 'observer-prune-ai-rate-buckets')

  union all select 9, 'the threshold it passes', '48',
    (select coalesce(
       string_agg((regexp_match(command, 'run_rate_bucket_retention\(\s*(\d+)'))[1], ' | '),
       '(none)')
       from cron.job where jobname = 'observer-prune-ai-rate-buckets')

  -- A job scheduled against another database in the cluster never touches these
  -- tables, and looks identical in `cron.job`.
  union all select 10, 'it runs against this database', current_database(),
    (select coalesce(string_agg(database, ' | '), '(no job)') from cron.job
      where jobname = 'observer-prune-ai-rate-buckets')

  -- Under ANY name. Two jobs deleting the same rows on different schedules is
  -- not twice as safe; it is an unowned second answer to "what prunes this?".
  union all select 11, 'total jobs touching Observer retention, under any name', '1',
    (select count(*)::text from cron.job
      where command ilike '%observer.run_rate_bucket_retention%'
         or command ilike '%observer.prune_ai_rate_buckets%')

  /* --- the function it calls ----------------------------------------------- */

  union all select 12, 'observer.run_rate_bucket_retention exists', '1',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'observer' and p.proname = 'run_rate_bucket_retention')

  union all select 13, 'it is a definer with a fixed search_path', 'true',
    (select coalesce(bool_and(p.prosecdef and p.proconfig is not null)::text, '(missing)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'observer' and p.proname = 'run_rate_bucket_retention')

  -- The correction that produced this file: cleanup driven by traffic is not
  -- retention, and a `delete` in the interactive path is latency an answer pays
  -- for. Read from the installed function, not from a migration file.
  union all select 14, 'cleanup is absent from the admission path', 'true',
    (select coalesce(bool_and(
       pg_get_functiondef(p.oid) !~* '(prune|retention|maintenance)')::text, '(missing)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('observer', 'public')
        and p.proname in ('admit_ai_request', 'consume_ai_quota'))

  /* --- none of it is reachable from a browser ------------------------------ */

  union all select 15, 'browser roles that can execute a retention function', '(none)',
    (select coalesce(string_agg(role || ' on ' || fn, ', '), '(none)') from (
       select r as role, f as fn
         from unnest(array['anon', 'authenticated']) r,
              unnest(array['observer.run_rate_bucket_retention(integer)',
                           'observer.prune_ai_rate_buckets(integer)']) f
        where to_regprocedure(f) is not null
          and has_function_privilege(r, f, 'EXECUTE')) s)

  union all select 16, 'browser roles with USAGE on schema observer', '(none)',
    (select coalesce(string_agg(role, ', '), '(none)') from (
       select r as role from unnest(array['anon', 'authenticated']) r
        where to_regnamespace('observer') is not null
          and has_schema_privilege(r, 'observer', 'USAGE')) s)

  union all select 17, 'browser roles that can read observer.maintenance', '(none)',
    (select coalesce(string_agg(role, ', '), '(none)') from (
       select r as role from unnest(array['anon', 'authenticated']) r
        where to_regclass('observer.maintenance') is not null
          and has_table_privilege(r, 'observer.maintenance', 'SELECT')) s)

  -- Housekeeping is not an API. A `public` façade would be callable by anything
  -- holding a key, and PostgREST publishes `public` and nothing else.
  union all select 18, 'retention functions exposed through PostgREST', '(none)',
    (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.proname like '%prune%' or p.proname like '%retention%'
             or p.proname like '%maintenance%'))

  union all select 19, 'browser roles that can inspect cron.job', '(none)',
    (select coalesce(string_agg(role, ', '), '(none)') from (
       select r as role from unnest(array['anon', 'authenticated']) r
        where to_regclass('cron.job') is not null
          and has_table_privilege(r, 'cron.job', 'SELECT')) s)

  /* --- and it has actually been running ------------------------------------ */

  -- Rows 20 to 25 are the ones a catalogue check cannot give you.

  union all select 20, 'last_pruned_at is observable to the operator', 'true',
    (select (count(*) = 1)::text from observer.maintenance where id = 1)

  union all select 21, 'the most recent scheduled run', 'succeeded',
    (select coalesce(
       (select rd.status from cron.job_run_details rd
          join cron.job j on j.jobid = rd.jobid
         where j.jobname = 'observer-prune-ai-rate-buckets'
         order by rd.start_time desc limit 1),
       '(never ran)'))

  -- THE HEALTH THRESHOLD. Hourly schedule, so one missed run is tolerable and
  -- two is a signal. Anything but HEALTHY here means rows are outliving the
  -- stated ceiling right now, whatever rows 4 to 11 say about the job.
  union all select 22, 'scheduler health — age of the latest SUCCESSFUL run', 'HEALTHY',
    (select case
       when max(rd.end_time) is null then 'UNHEALTHY (never succeeded)'
       when max(rd.end_time) > now() - interval '2 hours' then 'HEALTHY'
       else 'UNHEALTHY (last success '
            || date_trunc('minute', now() - max(rd.end_time))::text || ' ago)'
     end
     from cron.job_run_details rd join cron.job j on j.jobid = rd.jobid
    where j.jobname = 'observer-prune-ai-rate-buckets' and rd.status = 'succeeded')

  -- The function records its own successful completion. A run that pg_cron
  -- calls "succeeded" while this stays still means the advisory lock was
  -- contended every time, or the function returned early.
  union all select 23, 'the function''s own record of its last run', 'within 2 hours',
    (select coalesce(
       (select case when last_pruned_at > now() - interval '2 hours'
                    then 'within 2 hours'
                    else date_trunc('minute', now() - last_pruned_at)::text || ' ago' end
          from observer.maintenance where id = 1),
       '(never ran)'))

  union all select 24, 'failed runs in the last 24 hours', '0',
    (select count(*)::text from cron.job_run_details rd
       join cron.job j on j.jobid = rd.jobid
      where j.jobname = 'observer-prune-ai-rate-buckets'
        and rd.status not in ('succeeded', 'running')
        and rd.start_time > now() - interval '24 hours')

  -- The outcome, measured on the data rather than on the schedule: 48-hour
  -- threshold plus at most an hour between runs.
  -- An empty table has nothing that has outlived anything, so `coalesce(min,
  -- now())` makes the vacuous case a PASS rather than a mystery string.
  union all select 25, 'oldest rate bucket', 'within 49 hours',
    (select case when coalesce(min(window_start), now()) > now() - interval '49 hours'
                 then 'within 49 hours'
                 else date_trunc('hour', now() - min(window_start))::text || ' old' end
       from observer.ai_rate_buckets)
)
select ord as "#",
       item as "check",
       expect as "expected",
       coalesce(actual, '(missing)') as "actual",
       case when coalesce(actual, '(missing)') = expect then 'PASS' else 'FAIL' end as "verdict"
  from r
 order by ord;
