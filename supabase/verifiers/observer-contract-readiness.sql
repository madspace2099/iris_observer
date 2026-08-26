-- IRIS Observer — contract readiness. Reads only.
--
-- **This report cannot say READY.** Its best answer is INCONCLUSIVE, and that
-- is not a limitation to be worked around — it is the honest ceiling of what a
-- database can know.
--
-- The condition for dropping `public.consume_ai_quota` and
-- `public.record_ai_request` is that no deployment *can* call them. A database
-- sees only what has already called them. Absence of recent traffic is evidence
-- about the past; it says nothing about capability. A Preview deployment nobody
-- has opened for a week is exactly as reachable as one opened a minute ago, and
-- a bookmark, an old link or a stale message brings it back — onto a build that
-- then meets a function that is no longer there.
--
-- So this query answers one narrower question, and answers it usefully:
--
--   NO-GO         something wrote through the old façade recently. Whatever you
--                 believed about which deployments are retired, it is wrong.
--
--   INCONCLUSIVE  nothing has written recently. That is necessary and nowhere
--                 near sufficient. Proceed only with the external evidence
--                 below, gathered outside this database.
--
-- ## The external gate covers TWO capabilities, not one
--
-- Protecting only the deployments that can call the old façades is too narrow,
-- and the compatibility table is what shows it:
--
--   3f298a6 after Migration 3   resolves and writes pseudonym_version 1
--   3f298a6 after Migration 4   resolves and writes pseudonym_version 1
--   3f298a6 after THIS migration  still resolves and writes version 1
--
-- Migration 3 deliberately keeps the thirteen-argument call working through its
-- defaults, and this migration drops only consume_ai_quota and
-- record_ai_request. Neither disables the version-1 compatibility path. So a
-- 3f298a6 deployment survives the contract migration untouched and keeps
-- writing cross-tenant-linkable version-1 pseudonyms into the durable audit for
-- as long as anybody can reach its URL.
--
-- The gate is therefore: delete or genuinely protect every deployment capable
-- of EITHER
--
--   (a) calling consume_ai_quota or record_ai_request; OR
--   (b) omitting the scoped pseudonym arguments and writing
--       pseudonym_version = 1 — which is EVERY 3f298a6 deployment, including
--       the fresh one built for the legacy compatibility phase.
--
-- A deployment proven to contain no Observer RPC path at all — the 3515402
-- main builds have no quota module — may remain ONLY with that evidence
-- recorded.
--
-- ## The external evidence, which is the actual gate
--
-- Enumerate every deployment. Do not assume, and do not reason from an alias:
--
--   vercel ls iris-observer
--
-- For every READY deployment that satisfies (a) or (b) above, one of these must
-- be true:
--
--   1. DELETED    `vercel remove <deployment-url>`, or Delete in the dashboard;
--   2. PROTECTED  Deployment Protection, so the URL cannot serve an anonymous
--                 request.
--
-- **Moving an alias is necessary but not sufficient.** Vercel gives every build
-- an immutable per-deployment URL that survives any alias change: repointing
-- `…-git-<branch>-….vercel.app` at a newer build retires the *name*, not the
-- deployment behind the old one. Anyone holding the immutable URL still reaches
-- the old code. Twelve such deployments existed on `release/observer-demo-rc1`
-- when this was written, plus the Production build — which is exempt only
-- because commit 3515402 contains no quota module and calls neither façade.
--
-- Record that enumeration somewhere a reviewer can read it. The contract
-- migration's precondition is that evidence, not this query.

with legacy as (
  select
    count(*)                                                       as rows_total,
    count(*) filter (where occurred_at > now() - interval '24 hours') as last_24h,
    count(*) filter (where occurred_at > now() - interval '7 days')   as last_7d,
    max(occurred_at)                                               as most_recent
  from observer.ai_requests
  where audit_version = 1 and request_id is null
),
scheme as (
  select
    count(*)                          as v2_rows,
    count(distinct key_id)            as distinct_keys,
    count(distinct pseudonym_version) as distinct_schemes
  from observer.ai_requests
  where audit_version = 2
),
report as (
  select 1 as ord,
         'verdict' as item,
         case when (select last_24h from legacy) > 0
              then 'NO-GO — something wrote through the old façade in the last 24 hours'
              else 'INCONCLUSIVE — no recent write. Necessary, not sufficient. See the external evidence.'
         end as finding

  union all select 2, 'writes through the old façade, last 24 hours',
    (select last_24h::text from legacy)

  union all select 3, 'writes through the old façade, last 7 days',
    (select last_7d::text from legacy)

  union all select 4, 'most recent write through the old façade',
    (select coalesce(most_recent::text, 'never') from legacy)

  union all select 5, 'version-1 rows in total',
    (select rows_total::text from legacy)

  -- Context for reading the audit, not a gate. A rotation is not a fault; it is
  -- a fact that changes what two rows can be compared with.
  union all select 6, 'version-2 rows',
    (select v2_rows::text from scheme)

  union all select 7, 'distinct pseudonym keys among them',
    (select case when v2_rows = 0 then 'n/a — no version-2 rows yet'
                 when distinct_keys <= 1 then distinct_keys::text
                 else distinct_keys::text || ' — the pepper was rotated' end from scheme)

  union all select 8, 'distinct pseudonym derivations among them',
    (select case when v2_rows = 0 then 'n/a — no version-2 rows yet'
                 when distinct_schemes <= 1 then distinct_schemes::text
                 else distinct_schemes::text || ' — rows from two schemes; subjects are not comparable across them'
            end from scheme)

  union all select 9, 'the façades this would remove',
    (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(already removed)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('consume_ai_quota', 'record_ai_request'))

  union all select 10, 'external evidence required before proceeding',
    'every deployment that can call a legacy facade OR write pseudonym_version 1 '
    || '(which is every 3f298a6 build, fresh one included) DELETED or PROTECTED; '
    || 'an alias move is not enough'

  -- Named so the reader cannot mistake this report for the gate. The database
  -- cannot enumerate deployments; only a person can.
  union all select 11, 'what this report can never establish',
    'which deployments exist and can still be reached. That is the gate, and it is external.'
)
select ord as "#", item as "check", finding as "finding" from report order by ord;
