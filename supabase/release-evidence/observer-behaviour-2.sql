-- IRIS Observer — behavioural verification, after the expand migration.
--
-- Unlike `observer-verify-2.sql`, this one **writes** — and then throws every
-- write away. It runs inside one transaction that ends in `rollback`, so the
-- counters it moves, the rows it admits and the results it completes exist only
-- for the length of the query.
--
-- It exists because the two properties that matter most cannot be read out of a
-- catalogue. "One admitted request consumes quota once" and "a completed record
-- is never rewritten" are claims about behaviour, and the only way to check a
-- claim about behaviour is to make the thing behave.
--
-- Run it as the operator (the SQL Editor's default role). Every row must PASS.
--
-- Every subject this script touches is unique to the run — the request id, the
-- project key, the session subject and the client hash are all generated — so
-- it is deterministic against a database with real traffic in it.
--
-- To prove for yourself that nothing survived, run this before and after; the
-- two results must be identical:
--
--   select (select count(*) from observer.ai_requests)                as audit_rows,
--          (select coalesce(sum(count), 0) from observer.ai_rate_buckets) as bucket_units;

begin;

create temp table observer_behaviour_check (
  ord    integer,
  item   text,
  expect text,
  actual text
) on commit drop;

do $$
declare
  v_id      uuid := gen_random_uuid();
  v_project text := 'behaviour-check/' || gen_random_uuid()::text;
  v_key_id  text := 'beefbeefbeefbeef';
  -- Unique per run. The previous version filtered the bucket table with
  -- `where scope = 'client' limit 1`, which on a production database picks
  -- whichever unrelated historical bucket the planner happens to reach first.
  -- A verifier whose answer depends on other people's traffic verifies nothing.
  v_client  text := 'behaviour-client-' || gen_random_uuid()::text;
  v_subject text := 'behaviour-' || gen_random_uuid()::text;
  v_first   record;
  v_second  record;
  v_rows    integer;
  v_spent   integer;
  v_result  text;
  v_stamp   timestamptz;
  v_after   timestamptz;
  v_source  text;
  v_author  text;
  v_tokens  integer;
  v_calls   integer;
  v_tools   text[];
begin
  /* --- one admitted request, one consumption ----------------------------- */

  select * into v_first from observer.admit_ai_request(
    v_id, v_subject, v_client, v_project, 10, 60, 120, 500,
    'alpha', 'northgate', 'developer', 42, v_key_id, 'scoped-for-this-tenant', 2);

  select * into v_second from observer.admit_ai_request(
    v_id, v_subject, v_client, v_project, 10, 60, 120, 500,
    'alpha', 'northgate', 'developer', 42, v_key_id, 'scoped-for-this-tenant', 2);

  insert into observer_behaviour_check values
    (1, 'a fresh request id is admitted', 'true', v_first.allowed::text),
    (2, 'the same id again is refused as a duplicate', 'duplicate_request',
        coalesce(v_second.reason, '(null)')),
    (3, 'the duplicate is not offered a retry delay', '0',
        coalesce(v_second.retry_after_seconds::text, '(null)'));

  select count(*)::integer into v_rows
    from observer.ai_requests where request_id = v_id;

  select coalesce(sum(count), 0)::integer into v_spent
    from observer.ai_rate_buckets
   where scope = 'project' and window_kind = 'day' and subject = v_project;

  insert into observer_behaviour_check values
    (4, 'audit rows written for that id', '1', v_rows::text),
    -- The defect this design replaced: quota was consumed before the insert's
    -- conflict clause, so a retry spent a second unit and left one row.
    (5, 'quota units consumed for that id', '1', v_spent::text);

  insert into observer_behaviour_check
  select 6, 'the row names the key that made its pseudonyms', v_key_id, coalesce(r.key_id, '(null)')
    from observer.ai_requests r where r.request_id = v_id;

  -- The global hash keys the ceiling; the scoped one is what the row keeps, so
  -- the durable audit cannot follow a browser between tenants.
  insert into observer_behaviour_check
  select 7, 'the row keeps the tenant-scoped client hash, not the global one',
         'scoped-for-this-tenant', coalesce(r.client_hash, '(null)')
    from observer.ai_requests r where r.request_id = v_id;

  -- Filtered by this run's own subject and window, so an unrelated bucket
  -- from real traffic cannot answer for it.
  insert into observer_behaviour_check
  select 8, 'the ceiling counted the global one, once', '1',
         coalesce((select sum(b.count)::text from observer.ai_rate_buckets b
                    where b.scope = 'client' and b.subject = v_client
                      and b.window_kind = 'hour'), '(no bucket)');

  /* --- a completed record is not rewritten -------------------------------- */

  select observer.complete_ai_request(
    v_id, 'answered', 'model', 'openai', 'gpt-5.6-sol', true, true, 'gpt-5.6-sol',
    null, '{summarize_showroom_period}', 1, 900, 120, 4300) into v_result;

  insert into observer_behaviour_check values
    (9, 'a started row accepts its terminal result', 'completed', v_result);

  select completed_at into v_stamp from observer.ai_requests where request_id = v_id;

  -- The identical result again. Nothing may move, including the timestamp.
  select observer.complete_ai_request(
    v_id, 'answered', 'model', 'openai', 'gpt-5.6-sol', true, true, 'gpt-5.6-sol',
    null, '{summarize_showroom_period}', 1, 900, 120, 4300) into v_result;

  select completed_at into v_after from observer.ai_requests where request_id = v_id;

  insert into observer_behaviour_check values
    (10, 'an exact retry is ignored', 'duplicate_ignored', v_result),
    (11, 'the completion timestamp did not move', 'unchanged',
        case when v_after is not distinct from v_stamp then 'unchanged' else 'moved' end);

  -- A different result for the same request. Two executions believed they owned
  -- it; the stored record wins and the caller is told.
  select observer.complete_ai_request(
    v_id, 'answered', 'deterministic_composer', 'openai', 'gpt-5.6-sol', true, false, null,
    'composition_failed', '{}', 0, null, null, 100) into v_result;

  select response_source, author_model into v_source, v_author
    from observer.ai_requests where request_id = v_id;

  insert into observer_behaviour_check values
    (12, 'a conflicting result is refused', 'conflict', v_result),
    (13, 'the stored record still says what it said', 'model / gpt-5.6-sol',
         coalesce(v_source, '(null)') || ' / ' || coalesce(v_author, '(null)'));

  /* --- a retry that differs only in what it cost -------------------------- */

  /*
   * The defect the previous script could not see. Its conflicting example also
   * changed the response source, the authorship and the fallback reason, so it
   * proved only that *something* was noticed. The comparison in fact covered
   * the eight provenance fields and none of the five persisted metrics, and a
   * second completion with the same provenance and different usage was
   * answered `duplicate_ignored`.
   *
   * Each case below changes exactly one metric and nothing else.
   */

  select observer.complete_ai_request(
    v_id, 'answered', 'model', 'openai', 'gpt-5.6-sol', true, true, 'gpt-5.6-sol',
    null, '{summarize_showroom_period}', 1, 900, 121, 4300) into v_result;

  select output_tokens, tool_calls, tools, completed_at
    into v_tokens, v_calls, v_tools, v_after
    from observer.ai_requests where request_id = v_id;

  insert into observer_behaviour_check values
    (14, 'a retry differing only in output tokens is a conflict', 'conflict', v_result),
    (15, 'the stored output tokens did not move', '120', coalesce(v_tokens::text, '(null)')),
    (16, 'the completion timestamp did not move', 'unchanged',
         case when v_after is not distinct from v_stamp then 'unchanged' else 'moved' end);

  select observer.complete_ai_request(
    v_id, 'answered', 'model', 'openai', 'gpt-5.6-sol', true, true, 'gpt-5.6-sol',
    null, '{summarize_showroom_period,compare_agent_flows}', 2, 900, 120, 4300) into v_result;

  select tool_calls, tools, completed_at into v_calls, v_tools, v_after
    from observer.ai_requests where request_id = v_id;

  insert into observer_behaviour_check values
    (17, 'a retry differing only in the tools is a conflict', 'conflict', v_result),
    (18, 'the stored tool count did not move', '1', coalesce(v_calls::text, '(null)')),
    (19, 'the stored tool list did not move', 'summarize_showroom_period',
         coalesce(array_to_string(v_tools, ','), '(null)')),
    (20, 'the completion timestamp still did not move', 'unchanged',
         case when v_after is not distinct from v_stamp then 'unchanged' else 'moved' end);

  /* --- completing something that was never admitted ----------------------- */

  select observer.complete_ai_request(
    gen_random_uuid(), 'answered', 'model', 'openai', 'gpt-5.6-sol', true, true, 'gpt-5.6-sol',
    null, '{}', 0, null, null, 10) into v_result;

  insert into observer_behaviour_check values
    (21, 'an unknown request id is reported, not invented', 'not_found', v_result);
end $$;

select ord   as "#",
       item  as "check",
       expect as "expected",
       actual as "actual",
       case when actual = expect then 'PASS' else 'FAIL' end as "verdict"
  from observer_behaviour_check
 order by ord;

-- Everything above is discarded: the audit row, the quota units, the temp
-- table. The database is exactly as it was before this ran.
rollback;
