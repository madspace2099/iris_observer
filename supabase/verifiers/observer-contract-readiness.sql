-- IRIS Observer — contract readiness. Reads only.
--
-- CONTRACT PHASE gate. **This report cannot say READY.** Its best answer is
-- INCONCLUSIVE, and that is not a limitation to be worked around — it is the
-- honest ceiling of what a database can know. A database sees what has been
-- written. The gate is about what a deployment CAN write, and only a person
-- enumerating deployments can settle that.
--
--
-- ## TWO VERSION AXES, AND THEY ARE NOT THE SAME COLUMN
--
-- An earlier edition asked one question — `audit_version = 1 and request_id is
-- null` — and called the answer "version-1 rows". That detects the historical
-- legacy-façade shape and NOTHING ELSE. It cannot see the write this whole
-- retirement exists to stop.
--
-- The three shapes are genuinely different rows:
--
--   legacy façade row (record_ai_request)
--       audit_version     = 1
--       request_id        IS NULL
--       pseudonym_version IS NULL
--
--   3f298a6 through admit_ai_request after Migration 3
--       audit_version     = 2          <- the NEW audit path
--       request_id        IS NOT NULL
--       pseudonym_version = 1          <- the CROSS-TENANT-LINKABLE pseudonym
--
--   the scoped build
--       audit_version     = 2
--       request_id        IS NOT NULL
--       pseudonym_version = 2
--
-- So a reachable `3f298a6` deployment writes `audit_version = 2` with
-- `pseudonym_version = 1`: a fresh cross-tenant-linkable row that the old
-- question reported as "no recent legacy write". The verifier looked clean
-- while the exact thing it was meant to catch was happening.
--
-- `audit_version` says WHICH AUDIT SHAPE wrote the row. `pseudonym_version`
-- says WHICH DERIVATION made its subject and client hash. Neither implies the
-- other, and this file never conflates them again.
--
--
-- ## THE RETIREMENT FLOOR
--
-- The controlled legacy proof deliberately writes `pseudonym_version = 1` rows.
-- Counting those would make a permanent false NO-GO out of a step the rollout
-- requires. So the question is time-bounded, and the sequence is:
--
--   1. record `retirement_floor_ts` immediately BEFORE retirement begins;
--   2. DELETE every version-1-capable deployment;
--   3. verify their immutable URLs are gone, by re-enumerating to exhaustion;
--   4. run this file;
--   5. NO-GO if any row written at or after the floor has EITHER
--        audit_version = 1        (a legacy façade is still reachable), OR
--        pseudonym_version = 1    (a 13-argument admission is still reachable);
--   6. otherwise INCONCLUSIVE — silence is necessary and never sufficient.
--
-- Rows before the floor are the controlled proof and are reported separately,
-- as context, never as a verdict.
--
--
-- ## THE EXTERNAL GATE, WHICH IS THE ACTUAL CONDITION
--
-- Enumerate every deployment TO PAGINATION EXHAUSTION. `vercel ls` is paginated
-- and returns roughly the newest twenty; `--next <timestamp>` continues it. A
-- single page is not an inventory, and an alias is not a deployment.
--
--   vercel ls iris-observer
--   vercel ls iris-observer --next <timestamp from the previous page>
--   … until no further page is returned
--
-- Record every immutable URL, its state and its source SHA, and classify each
-- from that SHA's own source:
--
--   (a) can call `consume_ai_quota` or `record_ai_request`;
--   (b) can reach `admit_ai_request` with THIRTEEN arguments and so write
--       `pseudonym_version = 1`.
--
-- (b) MUST BE DELETED. Not protected. Vercel Authentication still admits
-- authorised users, protection-bypass mechanisms exist, and this migration does
-- not disable the thirteen-argument admission path — so a "protected" 3f298a6
-- deployment can still write a cross-tenant-linkable row after the contract.
-- That includes the fresh Preview created for the legacy compatibility phase.
--
-- (a) may be deleted OR protected, because this migration genuinely removes the
-- functions those builds call: their RPC stops existing. That is a different
-- and stronger guarantee than making a URL harder to reach, and it is the only
-- reason the weaker option is acceptable there.
--
-- A deployment proven to contain no Observer RPC path at all may remain, with
-- that evidence recorded. Neither may a build whose admission signature no
-- longer resolves be called version-1-capable: it writes nothing.
--
-- Record that enumeration where a reviewer can read it. The contract
-- migration's precondition is that evidence, not this query.
--
--
-- ## Nothing here prints an identifier
--
-- No request id, no subject, no client hash, no key id. Counts, timestamps and
-- fixed words only.


with params as (
  -- Recorded immediately BEFORE retirement begins. Rows at or after this
  -- instant are the ones the gate judges.
  select '2026-08-27 00:00:00+00'::timestamptz as retirement_floor_ts
),

bounds as (
  select p.retirement_floor_ts,
         (p.retirement_floor_ts is not null
          and p.retirement_floor_ts <= clock_timestamp()) as floor_usable
    from params p
),

/* --- axis 1: the legacy façade shape ------------------------------------- */

facade as (
  select
    count(*)                                                          as ever,
    count(*) filter (where r.occurred_at >= b.retirement_floor_ts)    as after_floor,
    max(r.occurred_at) filter (where r.occurred_at >= b.retirement_floor_ts)
                                                                      as latest_after
  from observer.ai_requests r, bounds b
  where r.audit_version = 1
),

/* --- axis 2: the version-1 pseudonym, which is a DIFFERENT column --------- */

pseudonym as (
  select
    count(*)                                                          as ever,
    count(*) filter (where r.occurred_at <  b.retirement_floor_ts)    as before_floor,
    count(*) filter (where r.occurred_at >= b.retirement_floor_ts)    as after_floor,
    max(r.occurred_at) filter (where r.occurred_at >= b.retirement_floor_ts)
                                                                      as latest_after
  from observer.ai_requests r, bounds b
  where r.pseudonym_version = 1
),

scoped as (
  select count(*) as ever from observer.ai_requests where pseudonym_version = 2
),

report as (

  select 1 as ord, 'verdict' as item,
         (select case
            when not b.floor_usable
              then 'UNUSABLE FLOOR — retirement_floor_ts must be set and not in the future'
            when (select after_floor from facade) > 0
                 or (select after_floor from pseudonym) > 0
              then 'NO-GO — a version-1 writer was still reachable after the retirement floor'
            else 'INCONCLUSIVE — nothing written since the floor. Necessary, never sufficient. '
                 || 'The gate is the deployment enumeration.'
          end from bounds b) as finding

  union all select 2, 'retirement floor',
    (select case when floor_usable then retirement_floor_ts::text
                 else coalesce(retirement_floor_ts::text, '(not set)') || ' — unusable' end
       from bounds)

  /* --- axis 1 --------------------------------------------------------- */

  union all select 3, 'AXIS 1 · audit_version = 1 (legacy façade) after the floor',
    (select after_floor::text from facade)

  union all select 4, 'most recent legacy-façade row after the floor',
    (select coalesce(latest_after::text, 'none') from facade)

  union all select 5, 'legacy-façade rows ever',
    (select ever::text from facade)

  /* --- axis 2 --------------------------------------------------------- */

  union all select 6, 'AXIS 2 · pseudonym_version = 1 (13-argument admission) after the floor',
    (select after_floor::text from pseudonym)

  union all select 7, 'most recent version-1 pseudonym row after the floor',
    (select coalesce(latest_after::text, 'none') from pseudonym)

  -- Context, never a verdict. The controlled legacy proof writes these
  -- deliberately, and a gate that counted them could never be satisfied.
  union all select 8, 'version-1 pseudonym rows BEFORE the floor (the controlled proof)',
    (select before_floor::text from pseudonym)

  union all select 9, 'version-1 pseudonym rows ever',
    (select ever::text from pseudonym)

  union all select 10, 'version-2 pseudonym rows ever',
    (select ever::text from scoped)

  /* --- what the migration would do, and what it would not -------------- */

  union all select 11, 'the façades this migration removes',
    (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(already removed)')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('consume_ai_quota', 'record_ai_request'))

  -- The sentence that makes the deletion rule necessary. Applying this
  -- migration does NOT close the thirteen-argument door.
  union all select 12, 'does this migration stop a 13-argument admission?',
    'NO — the defaults keep it resolving. Version-1-capable deployments must be DELETED.'

  union all select 13, 'external evidence required before proceeding',
    'enumerate every deployment TO PAGINATION EXHAUSTION; DELETE every build that can '
    || 'reach admit_ai_request with 13 arguments (every 3f298a6, fresh one included); '
    || 'delete or protect legacy-facade-only builds; re-enumerate after deletion'

  union all select 14, 'what this report can never establish',
    'which deployments exist and can still be reached. That is the gate, and it is external.'
)
select ord as "#", item as "check", finding as "finding" from report order by ord;
