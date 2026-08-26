-- IRIS Observer — is a MODEL actually answering? Reads only.
--
-- ROLLOUT STEP 17, and it is deliberately separate from
-- `observer-http-compat-proof.sql`.
--
--
-- ## Why this is a different question
--
-- The compatibility proof accepts four values in `response_source`:
--
--     model · deterministic_composer · refusal · failure
--
-- That is right for what it asks. Its question is "did the DEPLOYED BUILD write
-- the audit row it was supposed to write, through PostgREST, after the
-- signature changed" — and a deterministic-composer answer proves that just as
-- well as a model-authored one. The database path is what is under test there.
--
-- It is NOT right as evidence that Matthew can demonstrate live AI. Observer is
-- designed to answer without a model: the deterministic composer runs the same
-- tools over the same evidence and writes plainer prose. A deployment with no
-- `OPENAI_API_KEY` answers every question, renders every figure, passes every
-- screen — and never calls a model. The compatibility proof reads 13/13 on it.
--
-- So this file asks the other question, and only that one.
--
--
-- ## What it needs
--
-- The exact `X-Observer-Request-Id` of one controlled request made against the
-- new scoped Preview. Not a time window, not the newest row: a model-authored
-- answer is precisely the thing worth being exact about, and the new build
-- hands you the id in the response headers.
--
--
-- ## What it reports when the answer is honest but not live
--
-- If the row says `deterministic_composer`, this file fails and the correct
-- sentence to report is:
--
--     Observer application works, but live AI is not yet enabled.
--
-- NOT "the AI is working". The two are different states and only one of them
-- is what a demonstration of live AI needs.
--
--
-- ## The screen half
--
-- `e2e/observer-live.spec.ts` proves the same fact from the rendered answer
-- sheet: the product writes "Observer's reading · written by the tools" when
-- the deterministic composer wrote the prose and drops that suffix when a model
-- did. Run it with `OBSERVER_EXPECT_LIVE_MODEL=1` against the deployment. The
-- two halves are worth having together — the screen is what a viewer sees, this
-- is what the durable record says, and a disagreement between them is itself a
-- finding.
--
--
-- ## Nothing here prints an identifier
--
-- No request id, no fingerprint, no subject, no key. The provider and the model
-- name are configuration, not secrets, and they are what "honestly recorded"
-- means — so they are shown.


with params as (
  -- The X-Observer-Request-Id of ONE controlled request on the new Preview.
  select '00000000-0000-0000-0000-000000000000'::uuid as request_id
),

row_under_test as (
  select r.* from observer.ai_requests r, params p where r.request_id = p.request_id
),

checks as (

  select 1 as ord,
         'rows matching that request id' as item,
         'exactly 1' as expect,
         (select case count(*) when 1 then 'exactly 1'
                 else count(*)::text || ' — check the header you pasted' end
            from row_under_test) as actual

  union all select 2, 'the request finished', 'complete',
    (select coalesce(max(state), '(no row)') from row_under_test)

  /* --- the five that decide whether this was a model ------------------- */

  union all select 3, 'response_source', 'model',
    (select coalesce(max(response_source), '(no row)') from row_under_test)

  union all select 4, 'model_attempted', 'true',
    (select coalesce(bool_and(model_attempted)::text, '(no row)') from row_under_test)

  union all select 5, 'model_authored', 'true',
    (select coalesce(bool_and(model_authored)::text, '(no row)') from row_under_test)

  -- A fallback reason beside a model-authored answer would mean the row is
  -- describing two different things that happened.
  union all select 6, 'fallback_reason', '(none)',
    (select coalesce(max(fallback_reason), '(none)') from row_under_test)

  union all select 7, 'author_model is named, not null', 'true',
    (select coalesce(
       bool_and(author_model is not null and length(author_model) > 0)::text, '(no row)')
       from row_under_test)

  /* --- and recorded honestly ------------------------------------------- */

  -- `attempted_provider` and `attempted_model` say what was TRIED. When a model
  -- authored the answer, the model it authored with must be the model that was
  -- attempted — a row naming one and crediting another is the exact defect the
  -- audit rebuild fixed.
  union all select 8, 'the authoring model is the model that was attempted', 'true',
    (select coalesce(
       bool_and(author_model is not distinct from attempted_model)::text, '(no row)')
       from row_under_test)

  union all select 9, 'attempted_provider', 'openai',
    (select coalesce(max(attempted_provider), '(no row)') from row_under_test)

  union all select 10, 'the model that wrote it (configuration, not a secret)',
    (select coalesce(max(attempted_model), '(no row)') from row_under_test),
    (select coalesce(max(author_model), '(no row)') from row_under_test)

  /* --- the verdict, in words ------------------------------------------- */

  union all select 11, 'verdict', 'live AI is answering',
    (select case
       when (select count(*) from row_under_test) <> 1 then 'no single row — see row 1'
       when (select max(response_source) from row_under_test) = 'model'
            and (select bool_and(model_authored) from row_under_test)
         then 'live AI is answering'
       when (select max(response_source) from row_under_test) = 'deterministic_composer'
         then 'Observer application works, but live AI is not yet enabled'
       else 'no answer at all — ' || (select max(response_source) from row_under_test)
     end)
)
select ord as "#",
       item as "check",
       expect as "expected",
       coalesce(actual, '(missing)') as "actual",
       case when coalesce(actual, '(missing)') = expect then 'PASS' else 'FAIL' end as "verdict"
  from checks
 order by ord;
