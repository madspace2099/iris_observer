-- IRIS Observer — deterministic proof that a DEPLOYED build writes the audit
-- row it is supposed to write. Reads only.
--
-- ROLLOUT STEPS 4-5 (the deployed legacy build) and STEP 9 (the new build).
-- One file, four modes, no predicate editing and no inverted PASS/FAIL.
--
-- ============================================================================
-- CANONICAL_QUESTION: How did Northgate showroom perform today?
-- CANONICAL_LENGTH:   41
-- ============================================================================
--
-- Those two lines are the single source of truth for the fixed question. The
-- prose below, the default `question_chars` parameter and the test fixture in
-- `supabase/test/http-proof.test.ts` are all checked against them; the test
-- derives the length from the literal rather than trusting either number.
--
-- The previous version of this file declared a 39-character question to be 41
-- characters. Nobody counted it, and a proof whose correlation key is wrong
-- matches nothing — the operator would have read "0 - proof void" and had no
-- idea why.
--
--
-- ## What each mode actually proves
--
--   LEGACY  build 3f298a6, already deployed and unchangeable. It mints its
--           request id inside `gate()` and returns it NOWHERE — not in the
--           body, not in a header, not on a log line (verified by reading
--           `git show 3f298a6:apps/web/src/lib/ai/{gate,quota}.ts` and
--           `.../app/api/ask/route.ts`).
--
--           So this mode is a TIME-BOUNDED CONTROLLED CORRELATION, and that is
--           weaker than identification. It establishes that exactly one row
--           exists in a window you opened, carrying five properties you chose,
--           with no other row written in that window. It does NOT prove by
--           construction that the row is the one your HTTP request produced.
--           Row 12 is what closes most of that gap: any unaccounted row in the
--           window fails the whole proof rather than being ignored.
--
--   SCOPED  the new build, which returns `X-Observer-Request-Id`. That header
--           carries the same UUID the admission wrote, so the row is selected
--           by primary key. This IS exact identification, and rows 2 and 13
--           say which of the two you got.
--
-- The mode also decides two expectations that used to be described in prose and
-- left for the operator to invert by hand:
--
--   pseudonym_version        legacy 1        scoped 2
--   cross-tenant hashes      legacy equal    scoped different
--
-- Both are correct behaviour for their build. Version 1 stores the tenant-blind
-- global fingerprint, so one browser in two tenants gives the SAME hash; the
-- scoped build derives per tenant, so it must give DIFFERENT ones. Every
-- legitimate mode can return all-PASS.
--
--
-- ## Nothing here prints a fingerprint, a subject or a key
--
-- Every identifier is compared, never selected. The only values this file can
-- emit are booleans, counts, versions, slugs and the words below.


/* ========================================================================== */
/* PART A — BEFORE the request(s). Run this first and KEEP BOTH VALUES.       */
/* ========================================================================== */

/*
 * `clock_timestamp()`, not `now()`: `now()` is the transaction start and would
 * be a floor slightly in the past.
 *
 * `audit_rows_before` is not decoration. Part B subtracts it to get the delta,
 * which is how "exactly one controlled request" and "exactly two, one per
 * tenant" are told apart from "one of them plus somebody else's".
 */
select clock_timestamp()                          as floor_ts,
       (select count(*) from observer.ai_requests) as audit_rows_before;


/* ========================================================================== */
/* NOW ASK — through the deployed Preview, not through SQL.                   */
/* ========================================================================== */

/*
 * Sign in as the AGENCY MANAGER scenario profile (Tomáš Varga). That viewer is
 * the only one holding projects in two tenants, which is what makes the
 * cross-tenant check possible from ONE browser:
 *
 *   primary   tenant alpha  project northgate
 *   sibling   tenant beta   project kingsford      <- note: a DIFFERENT slug
 *
 * The sibling project slug is not the same as the primary one and must be
 * named explicitly. There is no `beta/northgate`.
 *
 * Ask exactly this, character for character, from ONE browser tab:
 *
 *     How did Northgate showroom perform today?
 *
 * ONE-TENANT MODE: ask it once, in alpha/northgate. Set cross_tenant_done to
 * false below.
 *
 * TWO-TENANT MODE: ask it once in alpha/northgate, then switch project to
 * beta/kingsford IN THE SAME BROWSER and ask the identical question again. Set
 * cross_tenant_done to true.
 *
 * Do not retry, refresh or open a second tab. A retry mints a second request id
 * and writes a second row, and rows 2, 11 and 12 are built to fail on that
 * rather than pick one.
 *
 * SCOPED BUILD ONLY: read `X-Observer-Request-Id` from each response (browser
 * devtools -> Network -> the /api/ask request -> Response Headers) and paste
 * the UUIDs below. For the legacy build there is no such header; leave them
 * null and the file falls back to correlation, saying so in row 13.
 */


/* ========================================================================== */
/* PART B — AFTER. Fill in the parameters, then run. Every row must PASS.     */
/* ========================================================================== */

with params as (
  select
    /* --- from part A, verbatim --------------------------------------- */
    '2026-08-26 12:34:56.789+00'::timestamptz as floor_ts,
    133::bigint                               as audit_rows_before,

    /* --- which build answered ----------------------------------------- */
    -- 'legacy' = the deployed 3f298a6 Preview (rollout steps 4-5)
    -- 'scoped' = the new build after step 8    (rollout step 9)
    'legacy'::text                            as expected_build,

    /* --- which mode you ran ------------------------------------------- */
    false                                     as cross_tenant_done,

    /* --- the controlled properties ------------------------------------ */
    'alpha'::text                             as primary_tenant,
    'northgate'::text                         as primary_project,
    'beta'::text                              as sibling_tenant,
    'kingsford'::text                         as sibling_project,
    'agency_manager'::text                    as viewer_role,
    41                                        as question_chars,

    /* --- exact correlation, scoped build only ------------------------- */
    null::uuid                                as primary_request_id,
    null::uuid                                as sibling_request_id
),

mode as (
  select p.*,
         (p.expected_build = 'scoped')                             as scoped,
         case when p.expected_build = 'scoped' then 2 else 1 end   as want_version,
         case when p.cross_tenant_done then 2 else 1 end           as want_delta,
         (p.expected_build in ('legacy', 'scoped'))                as build_known,
         -- The new build must be identified exactly. Falling back to question
         -- length for a build that hands you its request id would be choosing
         -- the weaker proof when the stronger one is on the wire.
         (p.expected_build <> 'scoped' or p.primary_request_id is not null)
                                                                   as exactness_ok
    from params p
),

/*
 * The controlled rows.
 *
 * By request id when one was supplied — that is a primary-key lookup and
 * nothing else can satisfy it. Otherwise by the floor plus five properties the
 * operator chose. Never by an ordering, never with a LIMIT.
 */
primary_row as (
  select r.*
    from observer.ai_requests r, mode m
   where r.occurred_at >= m.floor_ts
     and (
       (m.primary_request_id is not null and r.request_id = m.primary_request_id)
       or (m.primary_request_id is null
           and r.tenant_slug    = m.primary_tenant
           and r.project_slug   = m.primary_project
           and r.viewer_role    = m.viewer_role
           and r.question_chars = m.question_chars)
     )
),

/*
 * The sibling is an EXACT tenant and project pair, not "anything that is not
 * the primary tenant". A sibling defined by inequality would silently accept a
 * third tenant, or a row from a project that happens to share a slug.
 */
sibling_row as (
  select r.*
    from observer.ai_requests r, mode m
   where m.cross_tenant_done
     and r.occurred_at >= m.floor_ts
     and (
       (m.sibling_request_id is not null and r.request_id = m.sibling_request_id)
       or (m.sibling_request_id is null
           and r.tenant_slug    = m.sibling_tenant
           and r.project_slug   = m.sibling_project
           and r.viewer_role    = m.viewer_role
           and r.question_chars = m.question_chars)
     )
),

/*
 * Anything else written in the window.
 *
 * Matched on the table's own primary key rather than on `request_id`, because a
 * legacy façade write carries a NULL request id and `not in` over a set
 * containing NULL quietly returns nothing at all.
 */
interference as (
  select r.*
    from observer.ai_requests r, mode m
   where r.occurred_at >= m.floor_ts
     and not exists (select 1 from primary_row p where p.id = r.id)
     and not exists (select 1 from sibling_row s where s.id = r.id)
),

checks as (

  /* --- the parameters themselves ------------------------------------- */

  select 1 as ord,
         'the parameters describe a defined mode' as item,
         'ok' as expect,
         (select case
            when not m.build_known
              then 'expected_build must be legacy or scoped, got ' || quote_literal(m.expected_build)
            when not m.exactness_ok
              then 'scoped build requires primary_request_id from X-Observer-Request-Id'
            else 'ok' end
          from mode m) as actual

  /* --- the correlation ------------------------------------------------ */

  union all select 2, 'rows matching the primary request', 'exactly 1',
    (select case count(*) when 1 then 'exactly 1'
            else count(*)::text || ' — proof void' end from primary_row)

  union all select 3, 'rows matching the sibling request',
    (select case when m.cross_tenant_done then 'exactly 1' else 'not attempted' end from mode m),
    (select case
       when not (select cross_tenant_done from mode) then
         case (select count(*) from sibling_row)
           when 0 then 'not attempted'
           else (select count(*)::text from sibling_row) || ' — unexpected sibling rows' end
       else
         case (select count(*) from sibling_row)
           when 1 then 'exactly 1'
           else (select count(*)::text from sibling_row) || ' — proof void' end
     end)

  union all select 13, 'how the primary row was identified',
    (select case when m.scoped then 'request_id (exact)'
                 else 'time + controlled properties (correlation)' end from mode m),
    (select case when m.primary_request_id is not null then 'request_id (exact)'
                 else 'time + controlled properties (correlation)' end from mode m)

  /* --- what the row says ---------------------------------------------- */

  -- Written by the new admission path. A 13-key call that failed to resolve
  -- through PostgREST would have produced no row at all, and row 2 would
  -- already have said so.
  union all select 4, 'audit_version', '2',
    (select coalesce(max(audit_version)::text, '(no row)') from primary_row)

  -- Mode-decided. Legacy derives viewer-only pseudonyms and must say 1; the
  -- scoped build derives per tenant and must say 2. Neither is "inverted".
  union all select 5, 'pseudonym_version',
    (select want_version::text from mode),
    (select coalesce(max(pseudonym_version)::text, '(no row)') from primary_row)

  union all select 6, 'state', 'complete',
    (select coalesce(max(state), '(no row)') from primary_row)

  union all select 7, 'response_source is one of the four defined values', 'true',
    (select coalesce(
       bool_and(response_source in
         ('model', 'deterministic_composer', 'refusal', 'failure'))::text, '(no row)')
       from primary_row)

  union all select 8, 'the row names the key that made its pseudonyms', 'true',
    (select coalesce(
       bool_and(key_id is not null and key_id ~ '^[0-9a-f]{12,}$')::text, '(no row)')
       from primary_row)

  union all select 9, 'the row holds a length, not a question', 'true',
    (select coalesce(bool_and(question_chars > 0)::text, '(no row)') from primary_row)

  /* --- the cross-tenant relationship ---------------------------------- */

  /*
   * The independent evidence that the stored hash is what its version claims.
   * One browser, two tenants:
   *   version 1 stores the tenant-blind global fingerprint  -> EQUAL
   *   version 2 stores a tenant-scoped fingerprint          -> DIFFERENT
   * Skipping the second tenant costs this check and nothing else.
   */
  union all select 10, 'same browser, two tenants: the stored hashes',
    (select case when not m.cross_tenant_done then 'not attempted'
                 when m.scoped then 'different (tenant-scoped)'
                 else 'equal (global)' end from mode m),
    (select case
       when not (select cross_tenant_done from mode) then 'not attempted'
       when (select count(*) from primary_row) <> 1
         or (select count(*) from sibling_row) <> 1 then 'ambiguous — see rows 2 and 3'
       when (select max(client_hash) from primary_row)
          = (select max(client_hash) from sibling_row) then 'equal (global)'
       else 'different (tenant-scoped)'
     end)

  /* --- and nothing else happened -------------------------------------- */

  -- One controlled request per mode, counted against the Part A baseline.
  union all select 11, 'audit rows written since floor_ts',
    (select want_delta::text from mode),
    (select ((select count(*) from observer.ai_requests) - m.audit_rows_before)::text from mode m)

  -- Interference is named, not tolerated. An unrelated row in the window can
  -- never stand in for the controlled request: rows 2 and 3 select the
  -- controlled ones by identity or by property, and anything left over fails
  -- here with its tenant and project shown.
  union all select 12, 'unaccounted rows in the window', '(none)',
    (select coalesce(
       string_agg(distinct i.tenant_slug || '/' || i.project_slug, ', '), '(none)')
       from interference i)
)
select ord as "#",
       item as "check",
       expect as "expected",
       coalesce(actual, '(missing)') as "actual",
       case when coalesce(actual, '(missing)') = expect then 'PASS' else 'FAIL' end as "verdict"
  from checks
 order by ord;
