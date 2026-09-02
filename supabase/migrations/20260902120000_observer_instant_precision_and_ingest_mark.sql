-- Millisecond instants, and the column that claimed to be written and was not.
--
-- Two defects, both mine, both found by reading rather than by a failing test —
-- which is worth saying because neither would have been caught by the suite as
-- it stood.
--
-- ## 1. Every instant this schema returns was truncated to the second
--
-- The read facades render `timestamptz` with
-- `to_char(x at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`. The literal
-- `Z` is correct — the value really is converted to UTC first, so the suffix is
-- a fact rather than a hopeful label. The precision is not.
--
-- The wire contract pins an instant to ISO-8601 with an offset
-- (`WireInstantSchema`), and the UE client sends milliseconds:
-- `2026-09-01T15:30:00.124Z`. The columns are `timestamptz` and hold
-- microseconds, so **nothing was ever lost on the way in** — this is a
-- serialisation defect on the way out, and the stored data is intact. But an
-- event submitted at `.124` read back as `.000`, and ADR-0016 derives meaningful
-- dwell at query time from exactly these values. A glance at a unit lasting
-- 800ms is not a rounding error in that calculation; it is the whole
-- measurement.
--
-- It went unnoticed because the fixture that carries `.124` is only ever
-- written, never read back and compared. The end-to-end proof will compare it,
-- which is why this is fixed before that proof exists rather than after — an
-- acceptance test written against the truncated value would have made the
-- defect the specification.
--
-- ## 2. `project_sources.last_ingest_at` was written by nothing at all
--
-- The column is declared, returned by `observer_source_status`, and carries the
-- comment "written by heartbeat and ingestion". No migration writes it. It
-- would have read null for ever on the first operator screen that rendered it,
-- and the comment would have sent whoever noticed to look for the bug in the
-- reader.
--
-- A false comment is worse than a missing feature: the feature announces itself
-- by being absent, and the comment actively misdirects.
--
-- `observer_ingestion_verified` now writes both, and they answer different
-- questions on purpose:
--
--   `ingestion_verified_at`  the FIRST time this installation ever proved the
--                            whole path. Set once, never overwritten. The
--                            operator question is "has this ever worked".
--   `last_ingest_at`         the MOST RECENT time it did. Overwritten every
--                            call. The operator question is "is it working
--                            now".
--
-- Collapsing them would lose one of the two questions, and which one you lose
-- depends on which write wins.
--
-- ## Why this is a new migration and not an edit
--
-- Forward-only, as ADR-0004 requires. None of these functions has been applied
-- to any hosted database, so editing the originals would have been harmless and
-- still wrong: the convention is what makes a migration history readable, and a
-- history that is only forward-only when it is inconvenient is not one.
--
-- `create or replace function` keeps every signature, so no grant, no owner and
-- no dependent view changes. The bodies below are the originals with one format
-- string substituted; they were extracted mechanically rather than retyped, so
-- a transcription slip cannot be the thing that breaks them.

create or replace function public.observer_source_status(
  p_account text,
  p_project uuid
)
returns table (
  source_id            uuid,
  project_id           uuid,
  source_type          text,
  environment          text,
  display_label        text,
  state                text,
  last_seen_at         text,
  last_ingest_at       text,
  observed_app_version text,
  observed_plugin      text,
  observed_build_id    text,
  observed_environment text,
  created_at           text
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
    pg_catalog.to_char(s.last_seen_at   at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(s.last_ingest_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    s.observed_app_version,
    s.observed_plugin,
    s.observed_build_id,
    s.observed_environment,
    pg_catalog.to_char(s.created_at     at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  from observer.project_sources s
  where s.account_id = p_account
    and s.project_id = p_project
  order by s.created_at desc;
$$;
alter function public.observer_source_status(text, uuid)
  owner to observer_ingest_owner;

create or replace function public.observer_credential_status(
  p_account text,
  p_source  uuid
)
returns table (
  state         text,
  created_at    text,
  expires_at    text,
  superseded_at text,
  revoked_at    text
)
language sql
security definer
set search_path = ''
as $$
  select
    c.state,
    pg_catalog.to_char(c.created_at    at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(c.expires_at    at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(c.superseded_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(c.revoked_at    at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  from observer.source_credentials c
  join observer.project_sources s on s.source_id = c.source_id
  where c.source_id  = p_source
    and s.account_id = p_account
  order by c.created_at desc;
$$;
alter function public.observer_credential_status(text, uuid)
  owner to observer_ingest_owner;

create or replace function public.observer_events_for_source(
  p_account text,
  p_source  uuid,
  p_limit   integer
)
returns table (
  event_id        uuid,
  event_name      text,
  schema_version  integer,
  occurred_at     text,
  ingested_at     text,
  session_id      uuid,
  sequence        integer,
  account_id      text,
  project_id      uuid,
  app_environment text,
  properties      jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    e.event_id, e.event_name, e.schema_version,
    pg_catalog.to_char(e.occurred_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(e.ingested_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    e.session_id, e.sequence, e.account_id, e.project_id, e.app_environment, e.properties
  from observer.analytics_events e
  join observer.project_sources s on s.source_id = e.source_id
  where e.source_id  = p_source
    and s.account_id = p_account
  order by e.ingested_at desc, e.event_id
  limit least(greatest(p_limit, 1), 1000);
$$;
alter function public.observer_events_for_source(text, uuid, integer)
  owner to observer_ingest_owner;

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
    pg_catalog.to_char(s.last_seen_at          at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(o.last_heartbeat_at     at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(o.ingestion_verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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

-- WHAT PROVED THE PATH, AND WHEN IT LAST WORKED.
--
-- Replaces the version that wrote only `ingestion_verified_at`. Both writes are
-- in one statement pair inside one function, so they cannot drift apart and a
-- caller cannot remember one and forget the other.
--
-- `last_ingest_at` lives on the spine rather than beside its sibling because
-- the column is already there and already published by `observer_source_status`.
-- Moving it would have been the tidier shape and a worse change: two facades
-- would have had to change to fix a column that was only ever missing a writer.
create or replace function public.observer_ingestion_verified(p_source uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched integer;
begin
  -- The eligibility check and the operational write, in that order. An archived
  -- source records nothing, which is the same rule the heartbeat applies — one
  -- answer to "may this source write operational state", not two that drift.
  update observer.project_sources
     set last_ingest_at = pg_catalog.now()
   where source_id = p_source
     and state <> 'archived';

  get diagnostics touched = row_count;
  if touched <> 1 then
    return false;
  end if;

  insert into observer.source_operations as o (source_id, ingestion_verified_at)
  values (p_source, pg_catalog.now())
  on conflict (source_id) do update
     -- IDEMPOTENT BY CONSTRUCTION on this column. The second and thousandth
     -- calls are no-ops here, so the ingestion path can call this on every
     -- batch that stored something without tracking whether it is the first.
     set ingestion_verified_at = coalesce(o.ingestion_verified_at, pg_catalog.now());

  return true;
end;
$$;
alter function public.observer_ingestion_verified(uuid)
  owner to observer_ingest_owner;
