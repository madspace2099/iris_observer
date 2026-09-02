-- Observer — a source's operational state: heartbeat, queue pressure, first proof.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
--
-- Executed on every test run by `supabase/test/source-operations.test.ts`.
-- Applying it to a hosted project remains an open deployment prerequisite.
--
-- ## Why a separate 1:1 table rather than more columns on the spine
--
-- The obvious shape is eleven more columns on `observer.project_sources`, and
-- it was rejected for a reason that is about lifetime rather than tidiness.
--
-- `project_sources` is the identity anchor. Every authenticated request reads
-- it — `observer_credential_resolve` joins it on the hottest path in the
-- system — and its identity columns are immutable by trigger, because handing
-- one account's showroom to another is the worst thing this schema could do.
-- It is the row a reviewer must be able to hold in their head.
--
-- The values below are the opposite kind of fact. They are a snapshot that
-- every heartbeat overwrites wholesale, they are worthless the moment they are
-- stale, and nothing authorises, joins or scopes on any of them. Putting eleven
-- of them into the identity row would make the widest, most-rewritten column
-- set in the schema live in the one table whose reads must stay cheap, and
-- would bury five load-bearing columns among sixteen diagnostic ones.
--
-- The honest cost, stated rather than hidden: a heartbeat writes twice, because
-- `last_seen_at` and the four `observed_*` provenance columns already exist on
-- the spine and this migration refuses to duplicate them. Both writes are in
-- one function and therefore one transaction, and the second is an upsert on a
-- primary key. What is bought for that is that no counter can ever be the
-- reason an identity row is rewritten.
--
-- The identity guarantee is untouched: `observer.refuse_source_move` still
-- fires on every UPDATE of `project_sources`, and the heartbeat's UPDATE below
-- names no identity column, so it passes that trigger the same way
-- `observer_source_set_state` already does.
--
-- ## The registered environment is authoritative; the reported one is evidence
--
-- `PD-25`, and the spine says the same thing. So `environment_mismatch` is
-- DERIVED in the read model and stored nowhere. A stored boolean would be a
-- third copy of a fact already held by two columns, free to drift out of
-- agreement with them, and — worse — a value a heartbeat writes, which is one
-- refactor away from a heartbeat writing the environment itself.
--
-- ## A heartbeat carries codes and counts. Never text.
--
-- `HeartbeatFacts` in `packages/sources/src/db.ts` has no free-text field on
-- purpose: the alternative is an exception dump arriving in an operational
-- table with a visitor's name inside it. This file enforces that rather than
-- trusting it. Only the named keys are read at all, every count is clamped, and
-- every string must look like a code or a version before it is stored.
--
-- Each of those rejections is silent — a bad value becomes null, and the
-- heartbeat still succeeds. That is deliberate and it is the same judgement the
-- port's docblock makes about optional fields: a diagnostic that fails
-- validation stops being a diagnostic and becomes an outage. A plugin that
-- cannot measure its outbox, or that reports a build id in some shape nobody
-- anticipated, must still be able to say it is alive.

/* --- 1. the owner --------------------------------------------------------- */
--
-- The same role the spine created. One owner for the whole ingestion domain, so
-- there is one set of grants to get right rather than five.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_ingest_owner') then
    create role observer_ingest_owner nologin noinherit;
  end if;
end;
$$;

create schema if not exists observer;
grant usage on schema observer to observer_ingest_owner;

/* --- 2. the operational snapshot ------------------------------------------ */

create table if not exists observer.source_operations (
  -- Both the primary key and the foreign key: exactly one snapshot per source,
  -- enforced by the shape rather than by whoever writes the next upsert.
  source_id                  uuid not null,

  -- THE TWO TIMESTAMPS THE MILESTONE INSISTS ARE DIFFERENT.
  --
  -- `last_heartbeat_at` says the source can reach us and holds a valid
  -- credential. `ingestion_verified_at` says an event survived the whole path
  -- into storage, once, ever. A source can be Connected for months and never
  -- have proved Ingestion Verified, and an operator staring at a silent
  -- showroom needs to see which of the two is missing.
  last_heartbeat_at          timestamptz,
  ingestion_verified_at      timestamptz,

  -- The one provenance string the spine does not already carry. `app_version`,
  -- `plugin`, `build_id` and `environment` live on `project_sources` and are
  -- written there; duplicating them here would create two answers to the same
  -- question and no rule for which wins.
  observed_engine            text,

  -- Queue pressure, as the client last measured it. `bigint` because
  -- `queue_bytes_used` is a byte count and a 2GB outbox is a supportable
  -- configuration, not an absurdity — and a counter that silently overflows is
  -- worse than one that is merely large.
  queue_event_count          bigint,
  queue_bytes_used           bigint,
  queue_bytes_ceiling        bigint,
  oldest_pending_age_seconds bigint,

  -- Refusals, by the reason the client refused. Cumulative for the life of the
  -- installation, which is why they may only ever be read as a rate of change:
  -- a large number here is not by itself a fault.
  quarantine_count           bigint,
  validation_failure_count   bigint,
  capacity_refusal_count     bigint,
  backend_quarantine_count   bigint,

  -- A CODE, not a message. See the header, and the constraint below.
  last_error_code            text,

  constraint source_operations_pkey primary key (source_id),
  constraint source_operations_source_fkey
    foreign key (source_id) references observer.project_sources (source_id),

  -- The backstop, not the clamp. `observer_heartbeat_record` already floors
  -- every count at zero; this exists so that a future writer which forgets to
  -- gets an error rather than a negative queue depth on an operator's screen.
  -- One constraint rather than eight, because it should never fire and eight
  -- names for one impossible condition is eight things to keep in step.
  constraint source_operations_counts_non_negative check (
    coalesce(queue_event_count,          0) >= 0 and
    coalesce(queue_bytes_used,           0) >= 0 and
    coalesce(queue_bytes_ceiling,        0) >= 0 and
    coalesce(oldest_pending_age_seconds, 0) >= 0 and
    coalesce(quarantine_count,           0) >= 0 and
    coalesce(validation_failure_count,   0) >= 0 and
    coalesce(capacity_refusal_count,     0) >= 0 and
    coalesce(backend_quarantine_count,   0) >= 0
  ),

  -- The shape of a code, so that this column cannot become a message column by
  -- accident. Sixty-four characters admits every identifier anybody has
  -- proposed and admits no stack trace, and the character class admits no
  -- whitespace, which is what a sentence has and a code does not.
  constraint source_operations_error_is_a_code
    check (last_error_code is null or last_error_code ~ '^[A-Za-z0-9._:+~/-]{1,64}$'),
  constraint source_operations_engine_is_a_version
    check (observed_engine is null or observed_engine ~ '^[A-Za-z0-9._:+~/-]{1,64}$')
);

alter table observer.source_operations owner to observer_ingest_owner;

comment on table observer.source_operations is
  'One operational snapshot per source, overwritten by every heartbeat. Never analytics: nothing here is a fact about a visitor, and nothing here is retained as history.';

-- There is deliberately no `created_at` or `updated_at`. Every timestamp this
-- table holds is already a named operational fact with a meaning an operator
-- can act on, and a generic `updated_at` sitting beside `last_heartbeat_at`
-- would be the same instant under a vaguer name — which invites a read model to
-- pick the vaguer one.

/* --- 3. what a heartbeat is allowed to say -------------------------------- */
--
-- Two helpers rather than the same `case` expression written out eleven times
-- in the function body. Both are `security invoker` and pinned to an empty
-- search_path: they are called by a definer function and are not doors
-- themselves, so they hold no privilege of their own and nothing in their
-- bodies can be resolved to somebody else's operator or table.

-- A count, or null, and never anything else.
--
-- Three separate refusals, and each one is a real payload that has to not
-- become an outage:
--
--   * A key that is absent, or is a string, or is `null`, yields null — the
--     column keeps whatever the last heartbeat that could measure it wrote.
--     `jsonb_typeof` is checked rather than casting and catching, because an
--     exception block per field is eleven subtransactions per heartbeat.
--
--     `IS DISTINCT FROM`, not `<>`, and the suite caught the difference. An
--     ABSENT key makes `p_facts -> p_key` SQL null, `jsonb_typeof` of that is
--     null, and `null <> 'number'` is null rather than true — so the guard did
--     not fire, execution reached the arithmetic below, and every unreported
--     counter came back as a confident zero.
--   * A negative count is a client bug, not data, so it floors at zero.
--     Note the null check has to come FIRST: `greatest(null, 0)` is 0 in
--     PostgreSQL, so the obvious one-liner would turn "could not measure" into
--     a confident, wrong, zero. That is precisely what the missing
--     `IS DISTINCT FROM` above let happen.
--   * A fractional or astronomically large value saturates rather than raising,
--     because `9e99::bigint` would abort the whole heartbeat over a field
--     nobody reads except as a rough magnitude.
create or replace function observer.heartbeat_count(p_facts jsonb, p_key text)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(p_facts -> p_key) is distinct from 'number' then null
    else least(
      greatest(pg_catalog.trunc((p_facts ->> p_key)::numeric), 0),
      9223372036854775807::numeric
    )::bigint
  end;
$$;

alter function observer.heartbeat_count(jsonb, text) owner to observer_ingest_owner;

-- A version or a code, or null.
--
-- The same allow-list the table's own constraints use, applied before the row
-- is built rather than after: a value that would violate the constraint is
-- dropped, so a plugin reporting a build id in an unanticipated shape loses one
-- provenance string instead of losing its heartbeat. The constraint stays as
-- the backstop for any writer that is not this function.
--
-- `IS DISTINCT FROM` for the same reason as the counter helper. Here the
-- three-valued fall-through happened to land on the `else` and produce null
-- anyway, which is the worse kind of bug: correct by accident, and one
-- rearranged branch away from not being.
create or replace function observer.heartbeat_code(p_facts jsonb, p_key text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when pg_catalog.jsonb_typeof(p_facts -> p_key) is distinct from 'string' then null
    when (p_facts ->> p_key) ~ '^[A-Za-z0-9._:+~/-]{1,64}$' then p_facts ->> p_key
    else null
  end;
$$;

alter function observer.heartbeat_code(jsonb, text) owner to observer_ingest_owner;

/* --- 4. the doors --------------------------------------------------------- */

-- RECORD A HEARTBEAT.
--
-- ## Why there is no `p_account`
--
-- Every other door in this schema takes the account first and filters on it,
-- and this one deliberately does not. The caller reached here by presenting a
-- credential that `observer_credential_resolve` turned into exactly one
-- `source_id`; it has already proved which source it is. Accepting an account
-- as well would add a second, unproved, identity to the call — and the only
-- thing a mismatch between the two could do is let a payload field steer the
-- write. A parameter that can only be redundant or wrong is not a safeguard.
--
-- ## Unknown keys
--
-- `p_facts` is read key by key. There is no `jsonb` column here and no
-- iteration over the object, so a key nobody anticipated is not rejected, not
-- logged and not stored — it simply has nowhere to go. That is the guard that
-- keeps a free-form diagnostic blob out of an operational table, and it is a
-- property of the shape rather than of a validation step somebody could relax.
--
-- `installation_nonce` is the interesting case: the port declares it, and this
-- function ignores it, because `SourceOperationsRow` has nowhere to put it.
-- Detecting a reinstallation is a service-layer concern that compares the nonce
-- it was handed against the credential it resolved; storing it here would be a
-- second answer to a question the database has not been asked.
--
-- ## Two writes, in this order
--
-- The spine row first, because it is also the eligibility check: no row updated
-- means the source does not exist or is archived, and the function returns
-- false before creating an operations row for a source that may not have one.
create or replace function public.observer_heartbeat_record(
  p_source uuid,
  p_facts  jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched integer;
begin
  /*
   * `coalesce(new, old)` throughout: a heartbeat that omits a field is saying
   * nothing about it, not saying it became unknown. Overwriting with null would
   * make the provenance columns flicker every time a plugin skipped a field it
   * could not compute this cycle.
   *
   * `observed_environment` is written here and `environment` is not, which is
   * the whole of `PD-25` expressed as a column list. What the client reports is
   * kept beside the registered value so a mismatch can be shown; it never
   * becomes the registered value.
   */
  update observer.project_sources s
     set last_seen_at         = pg_catalog.now(),
         observed_app_version = coalesce(observer.heartbeat_code(p_facts, 'app_version'),
                                         s.observed_app_version),
         observed_plugin      = coalesce(observer.heartbeat_code(p_facts, 'plugin_version'),
                                         s.observed_plugin),
         observed_build_id    = coalesce(observer.heartbeat_code(p_facts, 'build_id'),
                                         s.observed_build_id),
         observed_environment = coalesce(observer.heartbeat_code(p_facts, 'reported_environment'),
                                         s.observed_environment),
         updated_at           = pg_catalog.now()
   where s.source_id = p_source
     -- An archived source is terminal, exactly as it is for re-credentialling.
     -- Something still beating against one is worth an operator's attention,
     -- and the way they get it is that the heartbeat is refused rather than
     -- quietly keeping the row looking alive.
     and s.state <> 'archived';

  get diagnostics touched = row_count;
  if touched <> 1 then
    return false;
  end if;

  insert into observer.source_operations as o (
    source_id, last_heartbeat_at, observed_engine,
    queue_event_count, queue_bytes_used, queue_bytes_ceiling, oldest_pending_age_seconds,
    quarantine_count, validation_failure_count, capacity_refusal_count,
    backend_quarantine_count, last_error_code
  )
  values (
    p_source,
    pg_catalog.now(),
    observer.heartbeat_code(p_facts, 'engine_version'),
    observer.heartbeat_count(p_facts, 'queue_event_count'),
    observer.heartbeat_count(p_facts, 'queue_bytes_used'),
    observer.heartbeat_count(p_facts, 'queue_bytes_ceiling'),
    observer.heartbeat_count(p_facts, 'oldest_pending_age_seconds'),
    observer.heartbeat_count(p_facts, 'quarantine_count'),
    observer.heartbeat_count(p_facts, 'validation_failure_count'),
    observer.heartbeat_count(p_facts, 'capacity_refusal_count'),
    observer.heartbeat_count(p_facts, 'backend_quarantine_count'),
    observer.heartbeat_code(p_facts, 'last_error_code')
  )
  on conflict (source_id) do update
     set last_heartbeat_at          = pg_catalog.now(),
         -- `excluded` is the row this statement just built, so the helpers are
         -- evaluated once rather than a second time per column.
         observed_engine            = coalesce(excluded.observed_engine, o.observed_engine),
         queue_event_count          = coalesce(excluded.queue_event_count, o.queue_event_count),
         queue_bytes_used           = coalesce(excluded.queue_bytes_used, o.queue_bytes_used),
         queue_bytes_ceiling        = coalesce(excluded.queue_bytes_ceiling, o.queue_bytes_ceiling),
         oldest_pending_age_seconds = coalesce(excluded.oldest_pending_age_seconds,
                                               o.oldest_pending_age_seconds),
         quarantine_count           = coalesce(excluded.quarantine_count, o.quarantine_count),
         validation_failure_count   = coalesce(excluded.validation_failure_count,
                                               o.validation_failure_count),
         capacity_refusal_count     = coalesce(excluded.capacity_refusal_count,
                                               o.capacity_refusal_count),
         backend_quarantine_count   = coalesce(excluded.backend_quarantine_count,
                                               o.backend_quarantine_count),
         last_error_code            = coalesce(excluded.last_error_code, o.last_error_code);

  return true;
end;
$$;

alter function public.observer_heartbeat_record(uuid, jsonb)
  owner to observer_ingest_owner;

-- MARK THAT THIS INSTALLATION HAS PROVED THE INGESTION PATH.
--
-- ## First ever, not most recent
--
-- The `coalesce` below is the whole function. The question an operator asks of
-- this column is "has this installation ever got an event all the way into
-- storage" — a one-time proof that an activation actually worked, that the
-- credential is real, that the envelope validates, that the row landed.
--
-- Rewriting it on every verification would answer a different question:
-- "when did it last ingest". That is a liveness signal, it duplicates
-- `last_heartbeat_at` in meaning while being strictly less frequent, and it
-- destroys the only evidence of when the installation was actually commissioned
-- — which is the number a support conversation starts from.
--
-- Takes no account for the same reason `observer_heartbeat_record` does not:
-- the caller is the ingestion path, holding a resolved credential, and has
-- already proved which source it is.
create or replace function public.observer_ingestion_verified(p_source uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched integer;
begin
  insert into observer.source_operations as o (source_id, ingestion_verified_at)
  select s.source_id, pg_catalog.now()
  from observer.project_sources s
  where s.source_id = p_source
    -- The same eligibility rule as the heartbeat, deliberately: one answer to
    -- "may this source write operational state", not two that could drift.
    and s.state <> 'archived'
  on conflict (source_id) do update
     -- IDEMPOTENT BY CONSTRUCTION. The second and thousandth calls are no-ops
     -- on this column, so nothing upstream has to remember whether it has
     -- already called this — and the ingestion path can call it on every
     -- accepted batch without thinking about it.
     set ingestion_verified_at = coalesce(o.ingestion_verified_at, pg_catalog.now());

  get diagnostics touched = row_count;
  return touched = 1;
end;
$$;

alter function public.observer_ingestion_verified(uuid)
  owner to observer_ingest_owner;

-- THE OPERATOR'S READ MODEL.
--
-- Account-scoped, and this is the place a tenancy mistake would be most
-- damaging: it is the widest row Admin renders, so one missing predicate here
-- shows another account's showrooms, their labels and their fault codes on
-- somebody's screen. `p_account` is therefore the first argument and the first
-- line of the WHERE clause, as it is on every door in this schema.
--
-- A null `p_project` means every project in the account. Null is spelled as a
-- widening of the filter and never as a bypass of it: the account predicate is
-- outside the `or` and cannot be reached by any value of `p_project`.
--
-- The join is LEFT: a source that has never sent a heartbeat has no operations
-- row, and it must still appear here. An inner join would make the sources an
-- operator most needs to see — registered, activated, never heard from — the
-- exact ones the screen omits.
create or replace function public.observer_source_operations(
  p_account text,
  p_project uuid
)
returns table (
  source_id                  uuid,
  project_id                 uuid,
  source_type                text,
  environment                text,
  display_label              text,
  state                      text,
  last_seen_at               text,
  last_heartbeat_at          text,
  ingestion_verified_at      text,
  observed_app_version       text,
  observed_plugin            text,
  observed_build_id          text,
  observed_engine            text,
  observed_environment       text,
  environment_mismatch       boolean,
  queue_event_count          bigint,
  queue_bytes_used           bigint,
  queue_bytes_ceiling        bigint,
  oldest_pending_age_seconds bigint,
  quarantine_count           bigint,
  validation_failure_count   bigint,
  capacity_refusal_count     bigint,
  backend_quarantine_count   bigint,
  last_error_code            text
)
language sql
security definer
set search_path = ''
as $$
  select
    s.source_id,
    s.project_id,
    s.source_type,
    s.environment,
    s.display_label,
    s.state,
    pg_catalog.to_char(s.last_seen_at          at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(o.last_heartbeat_at     at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(o.ingestion_verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    s.observed_app_version,
    s.observed_plugin,
    s.observed_build_id,
    o.observed_engine,
    s.observed_environment,
    /*
     * DERIVED HERE, stored nowhere. A source that has never reported an
     * environment is not mismatched — it is silent — so the null case is false
     * rather than null, and a caller can treat this as the boolean the port
     * declares it to be without deciding what a null flag would mean.
     */
    s.observed_environment is not null
      and s.observed_environment is distinct from s.environment,
    o.queue_event_count,
    o.queue_bytes_used,
    o.queue_bytes_ceiling,
    o.oldest_pending_age_seconds,
    o.quarantine_count,
    o.validation_failure_count,
    o.capacity_refusal_count,
    o.backend_quarantine_count,
    o.last_error_code
  from observer.project_sources s
  left join observer.source_operations o on o.source_id = s.source_id
  where s.account_id = p_account
    and (p_project is null or s.project_id = p_project)
  order by s.created_at desc;
$$;

alter function public.observer_source_operations(text, uuid)
  owner to observer_ingest_owner;

/* --- 5. row level security ------------------------------------------------ */

alter table observer.source_operations enable row level security;

-- No policy, deliberately. RLS with no policy denies every role that is not the
-- table owner, and the owner is a role nobody can log in as. See the spine
-- migration and `supabase/README.md` for why a linter reporting "RLS enabled,
-- no policy" here is the control working rather than a gap.

/* --- 6. grants ------------------------------------------------------------ */

revoke all on schema observer from public, anon, authenticated, service_role;
revoke all on observer.source_operations from public, anon, authenticated, service_role;

-- EXECUTE is granted to PUBLIC on every new function by default. Revoked by
-- exact signature — an overload added later inherits nothing from these lines.
revoke all on function public.observer_heartbeat_record(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.observer_ingestion_verified(uuid)
  from public, anon, authenticated;
revoke all on function public.observer_source_operations(text, uuid)
  from public, anon, authenticated;

-- The helpers are not doors. `service_role` is revoked here as well as the
-- browser roles, because nothing outside `observer` has any reason to call them
-- and a reachable helper is one more signature a reviewer has to think about.
revoke all on function observer.heartbeat_count(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function observer.heartbeat_code(jsonb, text)
  from public, anon, authenticated, service_role;

-- Reachable is not public. Only the server's secret key, which authenticates as
-- `service_role`, may call these — and calling them is all it may do.
grant execute on function public.observer_heartbeat_record(uuid, jsonb)     to service_role;
grant execute on function public.observer_ingestion_verified(uuid)          to service_role;
grant execute on function public.observer_source_operations(text, uuid)     to service_role;

notify pgrst, 'reload schema';
