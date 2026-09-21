-- Observer — real showroom sessions, from a telemetry source connected in MADSPACE.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
-- Same posture as 20260907100000 and 20260907180000: an open deployment
-- prerequisite, exercised locally and in tests.
--
-- ## What this holds
--
-- A telemetry source (`ShowroomSourceKind`, e.g. `supabase_showroom`) is not
-- a `ConnectorKind` — it delivers no catalogue units and no deal stages, only
-- `ShowroomSession`s — so this does not touch `catalogue_units` or
-- `deals_current`. It reuses `connector_configs`/`connector_credentials`
-- (the generic, vendor-neutral config/credential storage already there) by
-- widening their kind check, and adds exactly two tables of its own:
--
--   showroom_session_snapshots   the CURRENT delivered snapshot, one row per
--                                 project per source — the whole session list
--                                 as last fetched, replaced wholesale on each
--                                 sync (no per-record change history: a
--                                 session that stops being returned by the
--                                 source is simply absent from the next
--                                 snapshot, which is what "the source's
--                                 current statement" means here).
--   showroom_session_syncs       one row per attempt, so the integrations
--                                 screen can say when the last sync ran, and
--                                 with what fetched/accepted/rejected counts.

/* --- 1. widen the generic connector kind check ---------------------------- */

alter table observer.connector_configs
  drop constraint if exists connector_configs_kind_known;
alter table observer.connector_configs
  add constraint connector_configs_kind_known
  check (connector in ('realpad', 'monday', 'lomnio', 'csv', 'supabase_showroom'));

alter table observer.connector_credentials
  drop constraint if exists connector_credentials_kind_known;
alter table observer.connector_credentials
  add constraint connector_credentials_kind_known
  check (connector in ('realpad', 'monday', 'lomnio', 'csv', 'supabase_showroom'));

/* --- 2. the current snapshot ------------------------------------------------ */

create table if not exists observer.showroom_session_snapshots (
  project_id  uuid        not null,
  account_id  text        not null,
  connector   text        not null,

  -- The canonical sessions, exactly as the contract shapes them
  -- (`readonly ShowroomSession[]`).
  sessions    jsonb       not null,

  fetched_at  timestamptz not null,
  updated_at  timestamptz not null default now(),

  constraint showroom_session_snapshots_pkey primary key (project_id, connector),
  constraint showroom_session_snapshots_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint showroom_session_snapshots_kind_known
    check (connector in ('supabase_showroom')),
  constraint showroom_session_snapshots_sessions_is_array
    check (jsonb_typeof(sessions) = 'array')
);

alter table observer.showroom_session_snapshots owner to observer_ingest_owner;

comment on table observer.showroom_session_snapshots is
  'The current showroom-session snapshot per project and telemetry source. Replaced wholesale on each sync.';

/* --- 3. sync attempts -------------------------------------------------------- */

create table if not exists observer.showroom_session_syncs (
  id                  bigserial   primary key,
  project_id          uuid        not null,
  account_id          text        not null,
  connector           text        not null,
  outcome             text        not null,
  fetched             integer     not null default 0,
  accepted            integer     not null default 0,
  rejected            integer     not null default 0,
  retry_after_seconds integer,
  detail              text        not null default '',
  started_at          timestamptz not null default now(),

  constraint showroom_session_syncs_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint showroom_session_syncs_outcome_known check (
    outcome in ('ok', 'unauthorised', 'rate_limited', 'unavailable', 'malformed', 'misconfigured')
  ),
  constraint showroom_session_syncs_detail_len check (char_length(detail) <= 400)
);

alter table observer.showroom_session_syncs owner to observer_ingest_owner;
alter sequence observer.showroom_session_syncs_id_seq owner to observer_ingest_owner;

create index if not exists showroom_session_syncs_project_time
  on observer.showroom_session_syncs (project_id, connector, started_at desc);

/* --- 4. façades -------------------------------------------------------------- */

create or replace function public.observer_sessions_apply(
  p_account    text,
  p_project    uuid,
  p_connector  text,
  p_fetched_at timestamptz,
  p_sessions   jsonb
)
returns table (stored integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_account text;
  n_stored integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'sessions must be an array';
  end if;

  select p.account_id into owner_account
    from observer.projects p
   where p.project_id = p_project
     and p.account_id = p_account;
  if owner_account is null then
    return;
  end if;

  insert into observer.showroom_session_snapshots
    (project_id, account_id, connector, sessions, fetched_at, updated_at)
  values (p_project, owner_account, p_connector, p_sessions, p_fetched_at, now())
  on conflict (project_id, connector) do update
     set sessions   = excluded.sessions,
         fetched_at = excluded.fetched_at,
         updated_at = now();

  select pg_catalog.jsonb_array_length(p_sessions) into n_stored;
  stored := n_stored;
  return next;
end;
$$;

alter function public.observer_sessions_apply(text, uuid, text, timestamptz, jsonb)
  owner to observer_ingest_owner;

create or replace function public.observer_sessions_current(
  p_account   text,
  p_project   uuid,
  p_connector text
)
returns table (sessions jsonb, fetched_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select s.sessions, s.fetched_at
    from observer.showroom_session_snapshots s
    join observer.projects p on p.project_id = s.project_id
   where s.project_id = p_project
     and s.connector  = p_connector
     and p.account_id = p_account;
$$;

alter function public.observer_sessions_current(text, uuid, text)
  owner to observer_ingest_owner;

create or replace function public.observer_sessions_sync_record(
  p_account      text,
  p_project      uuid,
  p_connector    text,
  p_outcome      text,
  p_fetched      integer,
  p_accepted     integer,
  p_rejected     integer,
  p_retry_after  integer,
  p_detail       text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_account text;
  new_id bigint;
begin
  select p.account_id into owner_account
    from observer.projects p
   where p.project_id = p_project
     and p.account_id = p_account;
  if owner_account is null then
    return null;
  end if;

  insert into observer.showroom_session_syncs
    (project_id, account_id, connector, outcome, fetched, accepted, rejected, retry_after_seconds, detail)
  values (p_project, owner_account, p_connector, p_outcome, p_fetched, p_accepted, p_rejected, p_retry_after, p_detail)
  returning id into new_id;

  return new_id;
end;
$$;

alter function public.observer_sessions_sync_record(text, uuid, text, text, integer, integer, integer, integer, text)
  owner to observer_ingest_owner;

create or replace function public.observer_sessions_sync_last(
  p_account text,
  p_project uuid
)
returns table (
  connector text,
  started_at timestamptz,
  outcome text,
  fetched integer,
  accepted integer,
  rejected integer,
  detail text
)
language sql
security definer
set search_path = ''
stable
as $$
  select distinct on (s.connector)
         s.connector, s.started_at, s.outcome, s.fetched, s.accepted, s.rejected, s.detail
    from observer.showroom_session_syncs s
    join observer.projects p on p.project_id = s.project_id
   where s.project_id = p_project
     and p.account_id = p_account
   order by s.connector, s.started_at desc;
$$;

alter function public.observer_sessions_sync_last(text, uuid)
  owner to observer_ingest_owner;

grant execute on function public.observer_sessions_apply(text, uuid, text, timestamptz, jsonb)
  to service_role;
grant execute on function public.observer_sessions_current(text, uuid, text)
  to service_role;
grant execute on function public.observer_sessions_sync_record(text, uuid, text, text, integer, integer, integer, integer, text)
  to service_role;
grant execute on function public.observer_sessions_sync_last(text, uuid)
  to service_role;
