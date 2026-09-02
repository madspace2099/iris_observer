-- IRIS Observer — expand-phase health. Reads only.
--
-- No insert, update, delete or DDL. Safe to run any number of times.
--
-- **Expand health only.** Every row must read PASS, and every row *can*:
-- nothing here is a readiness gate for a later step. Whether the contract
-- migration may be applied is a different question with a different answer, and
-- it lives in `observer-contract-readiness.sql` — which cannot say READY,
-- because a database cannot see which deployments are still reachable.
--
-- Mixing the two was a defect in the previous bundle. This query claimed 28
-- checks that must all pass while containing one that could not pass while any
-- legacy row was recent, so a healthy database reported a failure.
--
-- Where a check names things rather than counting them, that is deliberate:
-- "six security-definer functions" is satisfied by six of the wrong ones.
with r as (

  /* --- the schema and its tables ----------------------------------------- */

  select 1 as ord, 'schema "observer" exists' as item, 'true' as expect,
    (exists (select 1 from pg_namespace where nspname = 'observer'))::text as actual

  union all select 2, 'observer tables with RLS enabled', 'ai_rate_buckets, ai_requests, maintenance',
    (select coalesce(string_agg(c.relname, ', ' order by c.relname), '(none)')
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'observer' and c.relkind = 'r' and c.relrowsecurity)

  union all select 3, 'observer schema — policy count (no policy = deny all)', '0',
    (select count(*)::text from pg_policies where schemaname = 'observer')

  /* --- the functions, by name and signature ------------------------------ */

  union all select 4, 'functions in "public", by name and argument types',
    'admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text, text, integer); '
    || 'complete_ai_request(uuid, text, text, text, text, boolean, boolean, text, text, text[], integer, integer, integer, integer); '
    || 'consume_ai_quota(text, text, text, integer, integer, integer, integer); '
    || 'observer_whoami(); '
    || 'record_ai_request(text, text, text, text, text, text, text, text[], integer, integer, integer, integer, integer)',
    (select coalesce(string_agg(p.proname || '(' || oidvectortypes(p.proargtypes) || ')',
                                '; ' order by p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public')

  union all select 5, 'functions in "observer", by name',
    'admit_ai_request, complete_ai_request, consume_ai_quota, prune_ai_rate_buckets, run_rate_bucket_retention',
    (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'observer')

  -- A function owned by someone else runs as someone else. `security definer`
  -- makes the owner the privilege boundary, so the owner is part of the check.
  union all select 6, 'owners of every observer/public function', '1 distinct owner',
    (select count(distinct p.proowner)::text || ' distinct owner'
            || case when count(distinct p.proowner) = 1 then '' else 's' end
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('observer', 'public'))

  union all select 7, 'security definer functions, by name',
    'observer.admit_ai_request, observer.complete_ai_request, observer.consume_ai_quota, '
    || 'observer.prune_ai_rate_buckets, observer.run_rate_bucket_retention, public.admit_ai_request, '
    || 'public.complete_ai_request, public.consume_ai_quota, public.record_ai_request',
    (select coalesce(string_agg(n.nspname || '.' || p.proname, ', '
                                order by n.nspname, p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('observer', 'public') and p.prosecdef)

  union all select 8, 'security definer functions WITHOUT a fixed search_path', '(none)',
    (select coalesce(string_agg(n.nspname || '.' || p.proname, ', '
                                order by n.nspname, p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('observer', 'public') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                         where c like 'search_path=%'))

  union all select 9, 'public.observer_whoami — runs as caller, not definer', 'false',
    (select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'observer_whoami')

  /* --- who may execute what ---------------------------------------------- */

  union all select 10, 'public functions the browser key (anon) may execute', '(none)',
    (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE'))

  union all select 11, 'public functions "authenticated" may execute', '(none)',
    (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE'))

  -- The two superseded façades are here on purpose during expand: older Preview
  -- deployments still call them by name. Removing them is the contract
  -- migration's job, gated by external evidence rather than by this query.
  union all select 12, 'public functions the secret key (service_role) may execute',
    'admit_ai_request, complete_ai_request, consume_ai_quota, observer_whoami, record_ai_request',
    (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'EXECUTE'))

  union all select 13, 'observer functions any browser role may execute', '(none)',
    (select coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'observer'
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE')))

  union all select 14, 'browser roles with USAGE on schema "observer"', '(none)',
    (select coalesce(string_agg(role, ', '), '(none)') from (
       select r as role from unnest(array['anon', 'authenticated']) r
        where to_regnamespace('observer') is not null
          and has_schema_privilege(r, 'observer', 'USAGE')) s)

  union all select 15, 'browser roles with any privilege on the observer tables', '(none)',
    (select coalesce(string_agg(role || ' on ' || tbl, ', '), '(none)') from (
       select r as role, t as tbl
         from unnest(array['anon', 'authenticated']) r,
              unnest(array['observer.ai_rate_buckets', 'observer.ai_requests',
                           'observer.maintenance']) t
        where to_regclass(t) is not null
          and (has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT')
               or has_table_privilege(r, t, 'UPDATE') or has_table_privilege(r, t, 'DELETE'))) s)

  /* --- the columns, the index and the constraints ------------------------- */

  union all select 16, 'the provenance columns, by name',
    'attempted_model, attempted_provider, audit_version, author_model, completed_at, '
    || 'fallback_reason, key_id, model_attempted, model_authored, pseudonym_version, '
    || 'request_id, response_source, state',
    (select coalesce(string_agg(column_name, ', ' order by column_name), '(none)')
       from information_schema.columns
      where table_schema = 'observer' and table_name = 'ai_requests'
        and column_name in ('audit_version','request_id','state','response_source',
                            'attempted_provider','attempted_model','model_attempted',
                            'model_authored','author_model','fallback_reason','completed_at',
                            'key_id','pseudonym_version'))

  -- Unique, and on the right column. A non-unique index of the same name would
  -- satisfy "an index exists" and guarantee nothing.
  union all select 17, 'the request_id index — unique, and on request_id', 'unique on request_id',
    (select case when i.indisunique and pg_get_indexdef(i.indexrelid) like '%(request_id)%'
                 then 'unique on request_id' else 'wrong shape' end
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       join pg_index i on i.indexrelid = c.oid
      where n.nspname = 'observer' and c.relname = 'ai_requests_request_id_key')

  union all select 18, 'the audit constraints, by name',
    'ai_requests_audit_version_allowed, ai_requests_authorship_coherent, '
    || 'ai_requests_complete_is_terminal, ai_requests_counts_non_negative, '
    || 'ai_requests_fallback_reason_allowed, ai_requests_outcome_allowed, '
    || 'ai_requests_response_source_allowed, ai_requests_state_allowed, '
    || 'ai_requests_v2_requires_key_id, ai_requests_v2_requires_pseudonym_version, '
    || 'ai_requests_v2_requires_question_chars, ai_requests_v2_requires_request_id',
    (select coalesce(string_agg(conname, ', ' order by conname), '(none)')
       from pg_constraint
      where conrelid = to_regclass('observer.ai_requests') and contype = 'c'
        and conname like 'ai_requests_%')

  union all select 19, 'outcome is nullable, so an admitted request can exist before it has one',
    'YES',
    (select is_nullable from information_schema.columns
      where table_schema = 'observer' and table_name = 'ai_requests'
        and column_name = 'outcome')

  /* --- the data ----------------------------------------------------------- */

  -- Historical rows were completed requests. Any of them reading `started`
  -- means the migration relabelled history instead of describing it.
  union all select 20, 'version-1 rows classified as interrupted', '0',
    (select case when to_regclass('observer.ai_requests') is null then '(missing)'
             else (select count(*)::text from observer.ai_requests
                    where audit_version = 1 and state <> 'complete') end)

  union all select 21, 'version-1 rows claiming an authorship they never recorded', '0',
    (select case when to_regclass('observer.ai_requests') is null then '(missing)'
             else (select count(*)::text from observer.ai_requests
                    where audit_version = 1
                      and (model_authored is not null or author_model is not null)) end)

  union all select 22, 'completed rows violating a provenance invariant', '0',
    (select case when to_regclass('observer.ai_requests') is null then '(missing)'
             else (select count(*)::text from observer.ai_requests
                    where state = 'complete' and audit_version = 2
                      and (outcome is null or response_source is null
                           or model_attempted is null or model_authored is null
                           or completed_at is null
                           or (model_authored and (author_model is null
                                                   or response_source <> 'model'))
                           or (not model_authored and author_model is not null))) end)

  union all select 23, 'admitted requests still awaiting a terminal result', '0',
    (select case when to_regclass('observer.ai_requests') is null then '(missing)'
             else (select count(*)::text from observer.ai_requests
                    where state = 'started' and occurred_at < now() - interval '10 minutes') end)

  union all select 24, 'version-2 rows missing a question length', '0',
    (select case when to_regclass('observer.ai_requests') is null then '(missing)'
             else (select count(*)::text from observer.ai_requests
                    where audit_version = 2 and question_chars is null) end)

  -- Which pseudonym key made this row's subject.
  union all select 25, 'version-2 rows with no usable key id', '0',
    (select case when to_regclass('observer.ai_requests') is null then '(missing)'
             else (select count(*)::text from observer.ai_requests
                    where audit_version = 2
                      and (key_id is null or key_id !~ '^[0-9a-f]{16}$')) end)

  -- Which derivation made it. `key_id` names the secret; this names the
  -- algorithm, and tenant-scoping changed one without changing the other.
  union all select 26, 'version-2 rows with no supported pseudonym scheme', '0',
    (select case when to_regclass('observer.ai_requests') is null then '(missing)'
             else (select count(*)::text from observer.ai_requests
                    where audit_version = 2
                      and (pseudonym_version is null
                           or pseudonym_version not in (1, 2))) end)

  /* --- the expand/contract boundary --------------------------------------- */

  -- During expand these must be present. After the contract migration they are
  -- gone, and this row is expected to read `(none)` instead. It is the only
  -- expectation here that depends on the phase, and it says so rather than
  -- being read as a readiness signal — that question lives elsewhere.
  union all select 27, 'superseded façades still present (expand phase)',
    'consume_ai_quota, record_ai_request',
    (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('consume_ai_quota', 'record_ai_request'))
)
select ord as "#",
       item as "check",
       expect as "expected",
       coalesce(actual, '(missing)') as "actual",
       case when coalesce(actual, '(missing)') = expect then 'PASS' else 'FAIL' end as "verdict"
  from r
 order by ord;
