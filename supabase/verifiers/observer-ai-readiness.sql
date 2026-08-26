-- IRIS Observer — is a MODEL actually answering? Reads only.
--
-- LIVE-MODEL READINESS PHASE — the last one before the contract phase, and
-- deliberately separate from
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
-- ## The three sentences row 11 can say, and what each one means
--
--   live AI is answering
--       ALL TEN conditions hold: exactly one row, state complete,
--       response_source model, model_attempted, model_authored, no
--       fallback_reason, provider openai, a non-empty attempted model, a
--       non-empty author model, and the two models equal.
--
--   Observer application works, but live AI is not yet enabled
--       A VALID composer row. Complete, honestly labelled, nothing claimed
--       that did not happen. Report exactly this — never "the AI is working".
--
--   Live AI is not proven — see the failed checks
--       Anything else, including a row labelled `model` whose other columns
--       contradict it. "Not live" and "inconsistent" are different findings,
--       and reporting the second as the first sends somebody hunting a missing
--       API key when the audit is describing two events at once.
--
-- The verdict is computed from ONE definition (`verdict.live`), not from a
-- shortcut. An earlier version said "live AI is answering" on `response_source
-- = 'model'` and `model_authored` alone — two of the ten — so a row that failed
-- rows 4, 6, 8 or 9 still produced that sentence. The eleven-row result failed;
-- the sentence a person reads did not.
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

/*
 * ONE DEFINITION OF READINESS, and row 11 is the only thing that reads it.
 *
 * The previous verdict said "live AI is answering" whenever `response_source`
 * was `model` and `model_authored` was true — two of the ten conditions. So a
 * row could fail rows 4, 6, 8 or 9 (a model credited but never attempted, a
 * fallback reason sitting beside a model-authored answer, an authoring model
 * that is not the attempted one, the wrong provider) and the human-facing
 * sentence still said the AI was working. The eleven-row result failed; the
 * sentence a person reads did not.
 *
 * `live` below is the conjunction of every condition rows 1 to 10 test. It is
 * computed once, from the row, and used nowhere else.
 */
readiness as (
  select
    (select count(*) from row_under_test) = 1                                as one_row,
    coalesce((select max(state)           from row_under_test), '')          as state,
    coalesce((select max(response_source) from row_under_test), '')          as source,
    coalesce((select bool_and(model_attempted) from row_under_test), false)  as attempted,
    coalesce((select bool_and(model_authored)  from row_under_test), false)  as authored,
    (select max(fallback_reason)  from row_under_test)                       as fallback,
    coalesce((select max(attempted_provider) from row_under_test), '')       as provider,
    coalesce((select max(attempted_model)    from row_under_test), '')       as attempted_model,
    coalesce((select max(author_model)       from row_under_test), '')       as author_model
),

verdict as (
  select r.*,
         (r.one_row
          and r.state    = 'complete'
          and r.source   = 'model'
          and r.attempted
          and r.authored
          and r.fallback is null
          and r.provider = 'openai'
          and length(r.attempted_model) > 0
          and length(r.author_model)    > 0
          and r.author_model = r.attempted_model)                            as live
    from readiness r
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

  /*
   * Three sentences, and only three.
   *
   *   live AI is answering       every one of the ten conditions holds
   *   Observer application …     a VALID composer row: complete, honestly
   *                              labelled, nothing claimed that did not happen
   *   Live AI is not proven …    anything else, including a row labelled
   *                              `model` whose other columns contradict it
   *
   * The third exists because "not live" and "inconsistent" are different
   * findings, and reporting an inconsistent row as an honest composer answer
   * would send somebody looking for a missing API key when the audit is
   * actually describing two events at once.
   */
  union all select 11, 'verdict', 'live AI is answering',
    (select case
       when v.live then 'live AI is answering'
       when v.one_row
            and v.state = 'complete'
            and v.source = 'deterministic_composer'
            and not v.attempted
            and not v.authored
            and length(v.author_model) = 0
         then 'Observer application works, but live AI is not yet enabled'
       else 'Live AI is not proven — see the failed checks'
     end from verdict v)
)
select ord as "#",
       item as "check",
       expect as "expected",
       coalesce(actual, '(missing)') as "actual",
       case when coalesce(actual, '(missing)') = expect then 'PASS' else 'FAIL' end as "verdict"
  from checks
 order by ord;
