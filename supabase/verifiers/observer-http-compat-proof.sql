-- IRIS Observer — deterministic proof that a DEPLOYED build writes the audit
-- row it is supposed to write. Reads only.
--
-- ROLLOUT STEPS 4-5 (the deployed legacy build) and STEP 9 (the new build).
-- One file, four modes, no predicate editing and no inverted PASS/FAIL.
--
-- ============================================================================
-- CANONICAL_QUESTION: How did this showroom perform this month?
-- CANONICAL_LENGTH:   41
-- ============================================================================
--
-- Those two lines are the single source of truth for the fixed question. The
-- prose below, the default `question_chars` parameter and the test fixture in
-- `supabase/test/http-proof.test.ts` are all checked against them; the test
-- derives the length from the literal rather than trusting either number.
--
-- The question is deliberately PROJECT-NEUTRAL. An earlier version named
-- Northgate and was then submitted from beta/kingsford in two-tenant mode,
-- which asked one project about another. The version before that declared a
-- 39-character question to be 41, and nobody counted it.
--
--
-- ## The four modes, and exactly what each one requires
--
--   legacy, one tenant    BOTH ids NULL. The primary row is found by bounded
--                         controlled-property correlation.
--   legacy, two tenants   BOTH ids NULL. Both rows by correlation.
--   scoped, one tenant    primary_request_id NOT NULL, sibling_request_id
--                         NULL. No property-only fallback.
--   scoped, two tenants   BOTH NOT NULL and DISTINCT. No property-only
--                         fallback for either row.
--
-- `expected_build` and `cross_tenant_done` must both be stated; a NULL in
-- either is a parameter block somebody half-filled, not a default to guess.
--
-- Row 1 refuses every other combination before any of the rest can read PASS,
-- and it does so from ONE definition (`mode_problem`) that row 13 also reads.
-- An unused parameter is not a permitted one: a sibling id supplied in scoped
-- ONE-tenant mode is refused even though nothing would have read it.
--
--
-- ## What "exact" means here, precisely
--
-- A request id on its own proves nothing. Any valid UUID identifies SOME row,
-- and a row identified by the wrong id — or by an id belonging to the sibling
-- request, or to a different tenant, project, viewer role or question length —
-- is not the request the operator made.
--
-- So EXACT means all six of these together, per request:
--
--     request id = the supplied id
--     occurred_at >= floor_ts
--     tenant_slug   = the expected tenant
--     project_slug  = the expected project
--     viewer_role   = the controlled role
--     question_chars = the canonical question length
--
-- The controlled properties are required in EVERY mode. The request id is an
-- additional constraint on top of them, never a replacement for them. An
-- earlier version wrote `id matches OR properties match`, which meant a
-- supplied id skipped the property checks entirely and a UUID from another
-- request could be accepted as the controlled one.
--
-- A row that fails any of the six is not quietly discarded either: it lands in
-- the interference count (row 12) with its tenant and project named, exactly
-- like any other unaccounted row.
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
--           exists in a window you opened, carrying four properties you chose,
--           with no other row written in that window. It does NOT prove by
--           construction that the row is the one your HTTP request produced.
--
--   SCOPED  the new build, which returns `X-Observer-Request-Id`. Selection is
--           by primary key AND every controlled property. Rows 2, 3 and 13 say
--           which of the two you got.
--
-- The mode also decides two expectations that used to be described in prose
-- and left for the operator to invert by hand:
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
-- ## Nothing here prints an identifier
--
-- No request id, no client hash, no subject, no key id, no question text. Every
-- identifier is compared, never selected. The only values this file emits are
-- counts, versions, booleans, tenant and project slugs, and the fixed words
-- below.


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
 * Ask exactly this, character for character, from ONE browser tab. It names no
 * project, so it is the same question in both:
 *
 *     How did this showroom perform this month?
 *
 * ONE-TENANT MODE: ask it once, in alpha/northgate. Set cross_tenant_done to
 * false below.
 *
 * TWO-TENANT MODE: ask it once in alpha/northgate, then switch project to
 * beta/kingsford IN THE SAME BROWSER and ask the identical question again. Set
 * cross_tenant_done to true.
 *
 * Do not retry, refresh or open a second tab. A retry mints a second request id
 * and writes a second row, and rows 2, 3, 11 and 12 are built to fail on that
 * rather than pick one.
 *
 * SCOPED BUILD ONLY: read `X-Observer-Request-Id` from EACH response (browser
 * devtools -> Network -> the /api/ask request -> Response Headers) and paste
 * the UUIDs below — the primary one always, and the sibling one too in
 * two-tenant mode. If either required id is missing, STOP: row 1 fails and no
 * property-only fallback is offered. For the legacy build there is no such
 * header; leave both null.
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
    -- Required in scoped mode; must be NULL in legacy mode.
    null::uuid                                as primary_request_id,
    null::uuid                                as sibling_request_id
),

mode as (
  select p.*,
         (p.expected_build = 'scoped')                             as scoped,
         case when p.expected_build = 'scoped' then 2 else 1 end   as want_version,
         case when p.cross_tenant_done then 2 else 1 end           as want_delta,
         /*
          * ONE DEFINITION OF A VALID MODE, and everything downstream reads it.
          *
          * There were two before — `ids_ok` and row 1's own `case` — and they
          * were subtly different: row 1 never objected to a sibling id in
          * scoped ONE-tenant mode, because `cross_tenant_done = false` makes
          * that parameter unused. Unused is not the same as permitted. A
          * configuration outside the four defined modes must be refused even
          * when the extra value happens to be harmless, or "row 1 refuses
          * everything else" is not a true sentence.
          *
          *   legacy, one tenant    both ids NULL
          *   legacy, two tenants   both ids NULL
          *   scoped, one tenant    primary NOT NULL, sibling NULL
          *   scoped, two tenants   both NOT NULL, and DISTINCT — repeating or
          *                         swapping one would let a single row satisfy
          *                         both halves of a two-request proof
          *
          * The two mode selectors must also be stated at all: a NULL
          * `expected_build` or `cross_tenant_done` is a parameter block
          * somebody half-filled, not a default worth guessing.
          */
         case
           when p.expected_build is null
             then 'expected_build must be set — legacy or scoped'
           when p.expected_build not in ('legacy', 'scoped')
             then 'expected_build must be legacy or scoped, got ' || quote_literal(p.expected_build)
           when p.cross_tenant_done is null
             then 'cross_tenant_done must be true or false, not null'
           when p.expected_build = 'legacy'
                and (p.primary_request_id is not null or p.sibling_request_id is not null)
             then 'legacy mode takes no request ids; the deployed build returns none'
           when p.expected_build = 'scoped' and p.primary_request_id is null
             then 'scoped mode requires primary_request_id from X-Observer-Request-Id'
           when p.expected_build = 'scoped' and not p.cross_tenant_done
                and p.sibling_request_id is not null
             then 'scoped one-tenant mode takes no sibling_request_id'
           when p.expected_build = 'scoped' and p.cross_tenant_done
                and p.sibling_request_id is null
             then 'scoped two-tenant mode requires sibling_request_id as well'
           when p.expected_build = 'scoped' and p.cross_tenant_done
                and p.sibling_request_id is not distinct from p.primary_request_id
             then 'the two request ids must differ — one row cannot be both requests'
           else 'ok'
         end                                                       as mode_problem
    from params p
),

/*
 * The controlled rows.
 *
 * Every controlled property is required in every mode. The request id, when
 * supplied, is an ADDITIONAL conjunct — never an alternative to the properties.
 * Never an ordering, never a LIMIT.
 */
primary_row as (
  select r.*
    from observer.ai_requests r, mode m
   where r.occurred_at    >= m.floor_ts
     and r.tenant_slug     = m.primary_tenant
     and r.project_slug    = m.primary_project
     and r.viewer_role     = m.viewer_role
     and r.question_chars  = m.question_chars
     and (m.primary_request_id is null or r.request_id = m.primary_request_id)
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
     and r.occurred_at    >= m.floor_ts
     and r.tenant_slug     = m.sibling_tenant
     and r.project_slug    = m.sibling_project
     and r.viewer_role     = m.viewer_role
     and r.question_chars  = m.question_chars
     and (m.sibling_request_id is null or r.request_id = m.sibling_request_id)
),

/*
 * Anything else written in the window — including a row whose request id was
 * supplied but whose tenant, project, role or question length did not match.
 * Supplying an id does not grant a row an exemption from being counted.
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
         (select m.mode_problem from mode m) as actual

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

  union all select 13, 'how the controlled rows were identified',
    (select case when m.scoped then 'request id + every controlled property'
                 else 'time + controlled properties (correlation)' end from mode m),
    (select case
       when m.mode_problem <> 'ok' then 'invalid — see row 1'
       when m.scoped then 'request id + every controlled property'
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
  -- never stand in for the controlled request, and a row whose id was supplied
  -- but whose properties disagree is unrelated by definition.
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
