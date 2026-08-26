-- IRIS Observer — deterministic proof that the DEPLOYED build still works
-- after migration 3. Reads only.
--
-- ROLLOUT STEPS 4 AND 5. Run part A, ask one question through the deployed
-- Preview, then run part B.
--
-- ## What this settles, and why SQL alone cannot
--
-- Migration 3 changes `admit_ai_request` from thirteen parameters to fifteen,
-- two of them defaulted. Direct SQL resolves a function by POSITION AND TYPE and
-- will happily prove the 13-argument call works. PostgREST resolves by the
-- NAMES IN THE JSON BODY, against a CACHED picture of the schema. Those are
-- different mechanisms and only an HTTP request exercises the second.
--
-- The deployed `3f298a6` build sends thirteen keys. If PostgREST does not
-- resolve them against the fifteen-parameter function, every question on every
-- live Preview stops being answered — and no local test would have seen it.
--
-- ## Why not "order by occurred_at desc limit 1"
--
-- The previous version of this procedure read the newest audit row. That is not
-- a proof, it is a guess: anybody else using a Preview, a crawler, a retried
-- request or a second browser tab writes a row in the same window, and the
-- guess silently reports on theirs. A verification step that can pass by
-- reading somebody else's data verifies nothing.
--
-- ## Why not the request id
--
-- It would be exact, and it is not available. `3f298a6` mints the id with
-- `randomUUID()` inside `gate()` and never returns it: not in the response
-- body, not in a header, and not on any log line — every `console.warn` in that
-- commit is on a failure path and none of them prints it. Verified by reading
-- `git show 3f298a6:apps/web/src/lib/ai/{gate,quota}.ts` and
-- `.../app/api/ask/route.ts`.
--
-- So the correlation is built from a time floor plus properties the operator
-- controls, and it REQUIRES EXACTLY ONE MATCH. Zero is a failure. Two is a
-- failure. There is no "latest".
--
-- ## Nothing here prints a fingerprint, a subject or a key
--
-- Every identifier is compared, never selected. The only values this file can
-- emit are booleans, counts, versions and slugs.


/* ========================================================================== */
/* PART A — BEFORE the request.                                               */
/* ========================================================================== */

/*
 * Run this first and KEEP THE OUTPUT. `floor_ts` is the time bound the whole
 * proof rests on: any row that existed before it cannot be the test request.
 *
 * `clock_timestamp()`, not `now()`: `now()` is the transaction start and would
 * be a floor slightly in the past.
 */
select clock_timestamp()                                   as floor_ts,
       (select count(*) from observer.ai_requests)          as audit_rows_before,
       (select count(*) from observer.ai_requests
         where audit_version = 2)                           as v2_rows_before;


/* ========================================================================== */
/* NOW ASK THE QUESTION — through the deployed Preview, not through SQL.      */
/* ========================================================================== */

/*
 *   URL       iris-observer-git-release-observer-demo-rc1-madspaces-projects
 *               .vercel.app
 *   sign in   the scenario selector; choose the DEVELOPER viewer
 *   tenant    alpha        project   northgate
 *
 * Ask exactly this, and nothing else, from ONE browser tab. It is 41 characters
 * including the question mark, and 41 is the correlation key — an unusual
 * enough length that an unrelated visitor is unlikely to collide with it, and
 * exact enough that a typo shows up as "no row matched" rather than as a false
 * pass:
 *
 *     How did the northgate showroom perform?
 *
 * COUNT IT BEFORE YOU SEND IT. If your question is not 41 characters, put its
 * real length into :question_chars below. The point is that YOU know the number,
 * not that the number is 41.
 *
 * Ask it ONCE. Do not retry, do not refresh, do not open a second tab. A retry
 * mints a second request id and writes a second row, and part B is designed to
 * fail on two rows rather than pick one.
 */


/* ========================================================================== */
/* PART B — AFTER the request. Substitute the two values, then run.           */
/* ========================================================================== */

/*
 * Replace:
 *   '2026-08-26 12:34:56.789+00'   with the floor_ts from part A, verbatim
 *   41                             with your question's length
 *
 * Every row must read PASS. If row 1 reads anything but "exactly 1", STOP:
 * every row after it is meaningless, and the reason is in row 1's actual value.
 */

with params as (
  select '2026-08-26 12:34:56.789+00'::timestamptz as floor_ts,
         41                                        as question_chars,
         'alpha'                                   as tenant_slug,
         'northgate'                               as project_slug,
         'developer'                               as viewer_role
),

/*
 * The candidate set. Five controlled properties and a time floor — not an
 * ordering, not a limit. If this holds more than one row the operator asked
 * twice or somebody else asked the same question at the same length in the same
 * tenant within the window, and either way the proof is void.
 */
candidate as (
  select r.*
    from observer.ai_requests r, params p
   where r.occurred_at    >= p.floor_ts
     and r.tenant_slug     = p.tenant_slug
     and r.project_slug    = p.project_slug
     and r.viewer_role     = p.viewer_role
     and r.question_chars  = p.question_chars
),

/*
 * The same browser, seen from a second tenant. Optional, and worth the extra
 * two minutes: it is the only way to demonstrate from the audit table alone
 * that the stored hash really is the GLOBAL one, without printing it.
 *
 * To use it, repeat the question in the OTHER tenant from the SAME browser
 * before running part B, and set `cross_tenant_done` to true. Version-1 rows
 * store the tenant-blind fingerprint, so two rows from one browser in two
 * tenants must hold the SAME client_hash. A version-2 build would give two
 * different ones — which is the whole point of the scoping work, and the reason
 * this check flips meaning after step 9.
 */
sibling as (
  select r.*
    from observer.ai_requests r, params p
   where r.occurred_at   >= p.floor_ts
     and r.project_slug   = p.project_slug
     and r.viewer_role    = p.viewer_role
     and r.question_chars = p.question_chars
     and r.tenant_slug   <> p.tenant_slug
),

checks as (

  /* --- the correlation itself --------------------------------------------- */

  select 1 as ord,
         'rows matching floor + tenant + project + role + length' as item,
         'exactly 1' as expect,
         (select case count(*) when 1 then 'exactly 1'
                 else count(*)::text || ' — proof void' end from candidate) as actual

  /* --- what the deployed build wrote -------------------------------------- */

  -- The new admission path ran. A 13-key call that failed to resolve would have
  -- produced no row at all, and row 1 would already have said so.
  union all select 2, 'audit_version', '2',
    (select coalesce(max(audit_version)::text, '(no row)') from candidate)

  -- Honestly labelled as the old derivation, because that is what 3f298a6
  -- computes. A 2 here would mean the row claims tenant-scoping that the
  -- deployed code does not perform.
  union all select 3, 'pseudonym_version', '1',
    (select coalesce(max(pseudonym_version)::text, '(no row)') from candidate)

  -- Migration 3 accepts version 1 only with a genuinely absent scoped hash, so
  -- a version-1 row is by construction storing the global fingerprint. Row 8
  -- is the independent evidence for the same claim.
  --
  -- Every row below aggregates rather than selecting a bare column. If the
  -- candidate set holds two rows, this file must still RETURN a table saying
  -- so — row 1 already does — rather than abort with "more than one row
  -- returned by a subquery". An operator staring at a Postgres error instead of
  -- a verdict grid is one step away from deciding the proof "sort of passed".
  union all select 4, 'the row names the key that made its pseudonyms', 'true',
    (select coalesce(
       bool_and(key_id is not null and key_id ~ '^[0-9a-f]{12,}$')::text, '(no row)')
       from candidate)

  -- Admission wrote it; the route completed it. `started` here would mean the
  -- terminal write was lost, which is the defect the audit rebuild fixed.
  union all select 5, 'state', 'complete',
    (select coalesce(max(state), '(no row)') from candidate)

  union all select 6, 'response_source is one of the four defined values', 'true',
    (select coalesce(
       (max(response_source) in ('model', 'deterministic_composer', 'refusal', 'failure'))::text,
       '(no row)') from candidate)

  -- Nothing identifying, and nothing that is content rather than a measurement.
  union all select 7, 'the row holds a length, not a question', 'true',
    (select coalesce(bool_and(question_chars > 0)::text, '(no row)') from candidate)

  /* --- the optional cross-tenant evidence ---------------------------------- */

  /*
   * Reads "(not attempted)" and PASSES if you did not do the second tenant.
   * Skipping it costs one independent check; faking it would cost more.
   */
  union all select 8, 'same browser, other tenant: the stored hash is tenant-blind',
    'same hash (or not attempted)',
    (select case
       when (select count(*) from candidate) <> 1 then 'ambiguous — see row 1'
       when (select count(*) from sibling) = 0 then 'same hash (or not attempted)'
       when (select count(*) from sibling) > 1 then 'ambiguous — more than one sibling row'
       when (select max(c.client_hash) from candidate c)
            = (select max(s.client_hash) from sibling s) then 'same hash (or not attempted)'
       else 'DIFFERENT — the stored hash is not the global one'
     end)

  /* --- and nothing else moved ---------------------------------------------- */

  -- One admitted request is one audit row. If this is not 1 the request was
  -- retried, or something else wrote in the window, and rows 2 to 8 may be
  -- describing a different request than the one you sent.
  union all select 9, 'audit rows written since floor_ts', '1',
    (select count(*)::text from observer.ai_requests r, params p
      where r.occurred_at >= p.floor_ts)
)
select ord as "#",
       item as "check",
       expect as "expected",
       coalesce(actual, '(missing)') as "actual",
       case when coalesce(actual, '(missing)') = expect then 'PASS' else 'FAIL' end as "verdict"
  from checks
 order by ord;


/* ========================================================================== */
/* AFTER STEP 9 — the same file, two expectations inverted                    */
/* ========================================================================== */

/*
 * Once the new build is deployed and answering, run this again against a fresh
 * question. Two rows are expected to change, and they are the whole point of
 * the pseudonym work:
 *
 *   row 3   pseudonym_version   1  ->  2
 *   row 8   the cross-tenant hash comparison must now read DIFFERENT, because
 *           the new build derives a tenant-scoped fingerprint and the durable
 *           audit must not be able to follow one browser between customers
 *
 * Everything else must read exactly the same. If row 3 still says 1 after the
 * new deployment is live, the old build is still serving.
 */
