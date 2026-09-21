-- Observer — the CRM's deals as a connector delivers them, and the stage facts between two pulls.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
--
-- Executed on every test run by `supabase/test/deals-connectors.test.ts`.
-- Applying it to a hosted project remains an open deployment prerequisite,
-- beside `20260907100000_observer_catalogue_and_connectors.sql`, which this
-- file depends on for the connector configuration and the project resolver.
--
-- ## What this holds
--
-- ADR-0021: the deal ladder is the CRM's, authoritative, and Observer never
-- puts its own opinion on a rung. ADR-0036: a connector pulls snapshots and
-- change is the difference between two of them. So three tables, the same
-- three nouns the catalogue has:
--
--   deals_current        the CURRENT snapshot, one row per deal per connector,
--                        `withdrawn_at` set rather than the row deleted when the
--                        source no longer lists the deal.
--   deal_stage_changes   append-only, keyed by the fact's own event id, which
--                        the application derives from what changed and when —
--                        so the same move delivered twice is one row, which is
--                        the idempotency ADR-0001 asks of every fact.
--   deal_syncs           one row per attempt, succeeded or refused.
--
-- ## No person is in here
--
-- A deal row carries `subject_key`: a keyed hash of the buyer's email, else
-- phone, computed by the application under a pepper this database has never
-- seen. No name, no address, no number, in any column, in any JSON.

/* --- 1. the owner --------------------------------------------------------- */

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_ingest_owner') then
    create role observer_ingest_owner nologin noinherit;
  end if;
end;
$$;

create schema if not exists observer;
grant usage on schema observer to observer_ingest_owner;

/* --- 2. the current deals ------------------------------------------------- */

create table if not exists observer.deals_current (
  project_id   uuid        not null,
  account_id   text        not null,
  connector    text        not null,
  external_id  text        not null,

  -- The canonical deal, exactly as the contract shapes it (`CrmDeal`).
  deal         jsonb       not null,

  fetched_at   timestamptz not null,
  withdrawn_at timestamptz,

  constraint deals_current_pkey primary key (project_id, connector, external_id),
  constraint deals_current_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint deals_current_kind_known
    check (connector in ('realpad', 'monday', 'lomnio', 'csv')),
  constraint deals_current_id_len check (char_length(external_id) between 1 and 128),
  constraint deals_current_deal_is_object check (jsonb_typeof(deal) = 'object'),
  -- The contract has no field for a person; the row refuses one too.
  constraint deals_current_no_person check (
    not (deal ? 'email') and not (deal ? 'phone') and not (deal ? 'name') and not (deal ? 'customer')
  )
);

alter table observer.deals_current owner to observer_ingest_owner;

comment on table observer.deals_current is
  'The current deal snapshot per project and connector. A projection of deal_stage_changes.';

create index if not exists deals_current_project_live
  on observer.deals_current (project_id, connector)
  where withdrawn_at is null;

/* --- 3. the stage facts, append-only -------------------------------------- */

create table if not exists observer.deal_stage_changes (
  -- The fact's own id: SHA-256 over scope, deal, kind, the word moved to and
  -- the time. A second delivery of the same move conflicts here and is not
  -- inserted, which is the whole of idempotency.
  event_id     text        not null,
  project_id   uuid        not null,
  account_id   text        not null,
  connector    text        not null,
  external_id  text        not null,
  kind         text        not null,
  unit_code    text,
  subject_key  text,
  from_stage   text,
  from_raw     text,
  to_stage     text,
  to_raw       text,
  -- When the source says the stage was entered, or the fetch instant.
  at           timestamptz not null,
  -- Always the fetch instant, so a dated stage reads differently from one
  -- only known to have moved between two pulls.
  observed_at  timestamptz not null,
  recorded_at  timestamptz not null default now(),

  constraint deal_stage_changes_pkey primary key (event_id),
  constraint deal_stage_changes_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint deal_stage_changes_event_id_hex check (event_id ~ '^[a-f0-9]{64}$'),
  constraint deal_stage_changes_kind_known
    check (kind in ('opened', 'stage_changed', 'withdrawn')),
  constraint deal_stage_changes_stage_known check (
    (from_stage is null or from_stage in ('lead', 'meeting', 'negotiation', 'offer', 'reservation', 'purchase', 'lost')) and
    (to_stage   is null or to_stage   in ('lead', 'meeting', 'negotiation', 'offer', 'reservation', 'purchase', 'lost'))
  ),
  constraint deal_stage_changes_subject_hex
    check (subject_key is null or subject_key ~ '^[a-f0-9]{64}$'),
  -- Opened has no before; withdrawn has no after; a change has both words.
  constraint deal_stage_changes_shape_coherent check (
    (kind = 'opened'        and from_raw is null     and to_raw is not null) or
    (kind = 'withdrawn'     and from_raw is not null and to_raw is null) or
    (kind = 'stage_changed' and from_raw is not null and to_raw is not null)
  )
);

alter table observer.deal_stage_changes owner to observer_ingest_owner;

comment on table observer.deal_stage_changes is
  'Append-only deal.stage.changed facts, one per move the CRM stated, keyed by their own event id.';

create index if not exists deal_stage_changes_project_time
  on observer.deal_stage_changes (project_id, at desc);

create or replace function observer.refuse_deal_change_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'deal stage changes are append-only';
end;
$$;

alter function observer.refuse_deal_change_mutation() owner to observer_ingest_owner;

drop trigger if exists deal_stage_changes_append_only on observer.deal_stage_changes;
create trigger deal_stage_changes_append_only
  before update or delete on observer.deal_stage_changes
  for each row execute function observer.refuse_deal_change_mutation();

/* --- 4. sync attempts ----------------------------------------------------- */

create table if not exists observer.deal_syncs (
  id                  bigserial   primary key,
  project_id          uuid        not null,
  account_id          text        not null,
  connector           text        not null,
  outcome             text        not null,
  fetched             integer     not null default 0,
  opened              integer     not null default 0,
  changed             integer     not null default 0,
  withdrawn           integer     not null default 0,
  -- Raw stage words the mapping did not cover; the integrations screen turns
  -- them into rows of the mapping table.
  unmapped_stages     jsonb       not null default '[]'::jsonb,
  retry_after_seconds integer,
  detail              text        not null default '',
  started_at          timestamptz not null default now(),

  constraint deal_syncs_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint deal_syncs_outcome_known check (
    outcome in ('ok', 'unauthorised', 'rate_limited', 'unavailable', 'malformed', 'misconfigured')
  ),
  constraint deal_syncs_unmapped_is_array
    check (jsonb_typeof(unmapped_stages) = 'array'),
  constraint deal_syncs_detail_len check (char_length(detail) <= 400)
);

alter table observer.deal_syncs owner to observer_ingest_owner;
alter sequence observer.deal_syncs_id_seq owner to observer_ingest_owner;

create index if not exists deal_syncs_project_time
  on observer.deal_syncs (project_id, connector, started_at desc);

/* --- 5. the doors --------------------------------------------------------- */

-- One sync's result, applied whole: the snapshot replaces the current rows,
-- anything no longer listed is marked withdrawn, and the facts the
-- application derived are appended — each once, by its own id. The counts
-- returned are of facts actually written, so a replay reports zero.
create or replace function public.observer_deals_apply(
  p_account    text,
  p_project    uuid,
  p_connector  text,
  p_fetched_at timestamptz,
  p_deals      jsonb,
  p_changes    jsonb
)
returns table (
  opened    integer,
  changed   integer,
  withdrawn integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_account text;
  n_opened    integer := 0;
  n_changed   integer := 0;
  n_withdrawn integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_deals) <> 'array' or pg_catalog.jsonb_typeof(p_changes) <> 'array' then
    raise exception 'deals and changes must be arrays';
  end if;

  select p.account_id into owner_account
    from observer.projects p
   where p.project_id = p_project
     and p.account_id = p_account;
  if owner_account is null then
    return;
  end if;

  insert into observer.deals_current (project_id, account_id, connector, external_id, deal, fetched_at)
  select p_project, owner_account, p_connector, d ->> 'externalId', d, p_fetched_at
    from pg_catalog.jsonb_array_elements(p_deals) as d
   where pg_catalog.jsonb_typeof(d) = 'object'
     and (d ->> 'externalId') is not null
  on conflict (project_id, connector, external_id) do update
     set deal         = excluded.deal,
         fetched_at   = excluded.fetched_at,
         withdrawn_at = null;

  -- Withdrawn is "not in this snapshot", decided by membership rather than by
  -- comparing fetch instants: a clock that has not moved, or has stepped
  -- back, must not leave a deal the source no longer lists standing.
  update observer.deals_current c
     set withdrawn_at = p_fetched_at
   where c.project_id = p_project
     and c.connector  = p_connector
     and c.withdrawn_at is null
     and not exists (
       select 1
         from pg_catalog.jsonb_array_elements(p_deals) as d
        where d ->> 'externalId' = c.external_id
     );

  with written as (
    insert into observer.deal_stage_changes
      (event_id, project_id, account_id, connector, external_id, kind, unit_code, subject_key,
       from_stage, from_raw, to_stage, to_raw, at, observed_at)
    select ch ->> 'eventId', p_project, owner_account, p_connector,
           ch ->> 'externalId',
           ch ->> 'kind',
           ch ->> 'unitCode',
           ch ->> 'subjectKey',
           ch ->> 'from',
           ch ->> 'fromRaw',
           ch ->> 'to',
           ch ->> 'toRaw',
           (ch ->> 'at')::timestamptz,
           (ch ->> 'observedAt')::timestamptz
      from pg_catalog.jsonb_array_elements(p_changes) as ch
     where pg_catalog.jsonb_typeof(ch) = 'object'
       and (ch ->> 'eventId') is not null
    on conflict (event_id) do nothing
    returning kind
  )
  select count(*) filter (where w.kind = 'opened'),
         count(*) filter (where w.kind = 'stage_changed'),
         count(*) filter (where w.kind = 'withdrawn')
    into n_opened, n_changed, n_withdrawn
    from written w;

  opened := n_opened; changed := n_changed; withdrawn := n_withdrawn;
  return next;
end;
$$;

alter function public.observer_deals_apply(text, uuid, text, timestamptz, jsonb, jsonb)
  owner to observer_ingest_owner;

create or replace function public.observer_deals_current(
  p_account   text,
  p_project   uuid,
  p_connector text
)
returns table (
  external_id text,
  deal        jsonb,
  fetched_at  text
)
language sql
security definer
set search_path = ''
as $$
  select c.external_id, c.deal,
         pg_catalog.to_char(c.fetched_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    from observer.deals_current c
   where c.account_id = p_account
     and c.project_id = p_project
     and c.connector  = p_connector
     and c.withdrawn_at is null
   order by c.external_id;
$$;

alter function public.observer_deals_current(text, uuid, text)
  owner to observer_ingest_owner;

-- The facts, newest first, for every connector on the project. This is what
-- the ladder and the unified timeline read.
create or replace function public.observer_deal_changes(
  p_account text,
  p_project uuid,
  p_limit   integer
)
returns table (
  event_id    text,
  connector   text,
  external_id text,
  kind        text,
  unit_code   text,
  subject_key text,
  from_stage  text,
  from_raw    text,
  to_stage    text,
  to_raw      text,
  at          text,
  observed_at text,
  recorded_at text
)
language sql
security definer
set search_path = ''
as $$
  select c.event_id, c.connector, c.external_id, c.kind, c.unit_code, c.subject_key,
         c.from_stage, c.from_raw, c.to_stage, c.to_raw,
         pg_catalog.to_char(c.at          at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         pg_catalog.to_char(c.observed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         pg_catalog.to_char(c.recorded_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    from observer.deal_stage_changes c
   where c.account_id = p_account
     and c.project_id = p_project
   order by c.at desc, c.recorded_at desc, c.event_id
   limit greatest(1, least(coalesce(p_limit, 100), 5000));
$$;

alter function public.observer_deal_changes(text, uuid, integer)
  owner to observer_ingest_owner;

create or replace function public.observer_deal_sync_record(
  p_account     text,
  p_project     uuid,
  p_connector   text,
  p_outcome     text,
  p_fetched     integer,
  p_opened      integer,
  p_changed     integer,
  p_withdrawn   integer,
  p_unmapped    jsonb,
  p_retry_after integer,
  p_detail      text
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into observer.deal_syncs
    (project_id, account_id, connector, outcome, fetched, opened, changed, withdrawn,
     unmapped_stages, retry_after_seconds, detail)
  select p.project_id, p.account_id, p_connector, p_outcome,
         coalesce(p_fetched, 0), coalesce(p_opened, 0), coalesce(p_changed, 0), coalesce(p_withdrawn, 0),
         coalesce(p_unmapped, '[]'::jsonb), p_retry_after, pg_catalog.left(coalesce(p_detail, ''), 400)
    from observer.projects p
   where p.project_id = p_project
     and p.account_id = p_account
  returning id;
$$;

alter function public.observer_deal_sync_record(text, uuid, text, text, integer, integer, integer, integer, jsonb, integer, text)
  owner to observer_ingest_owner;

-- The last deal sync per connector, for the integrations screen.
create or replace function public.observer_deal_sync_last(
  p_account text,
  p_project uuid
)
returns table (
  connector       text,
  started_at      text,
  outcome         text,
  fetched         integer,
  unmapped_stages jsonb,
  detail          text
)
language sql
security definer
set search_path = ''
as $$
  select distinct on (y.connector)
         y.connector,
         pg_catalog.to_char(y.started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         y.outcome, y.fetched, y.unmapped_stages, y.detail
    from observer.deal_syncs y
   where y.account_id = p_account
     and y.project_id = p_project
   order by y.connector, y.started_at desc, y.id desc;
$$;

alter function public.observer_deal_sync_last(text, uuid)
  owner to observer_ingest_owner;

/* --- 6. row level security and grants ------------------------------------- */

alter table observer.deals_current      enable row level security;
alter table observer.deal_stage_changes enable row level security;
alter table observer.deal_syncs         enable row level security;

revoke all on observer.deals_current      from public, anon, authenticated, service_role;
revoke all on observer.deal_stage_changes from public, anon, authenticated, service_role;
revoke all on observer.deal_syncs         from public, anon, authenticated, service_role;

revoke all on function public.observer_deals_apply(text, uuid, text, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.observer_deals_current(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.observer_deal_changes(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.observer_deal_sync_record(text, uuid, text, text, integer, integer, integer, integer, jsonb, integer, text)
  from public, anon, authenticated;
revoke all on function public.observer_deal_sync_last(text, uuid)
  from public, anon, authenticated;
revoke all on function observer.refuse_deal_change_mutation() from public, anon, authenticated, service_role;

grant execute on function public.observer_deals_apply(text, uuid, text, timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.observer_deals_current(text, uuid, text) to service_role;
grant execute on function public.observer_deal_changes(text, uuid, integer) to service_role;
grant execute on function public.observer_deal_sync_record(text, uuid, text, text, integer, integer, integer, integer, jsonb, integer, text) to service_role;
grant execute on function public.observer_deal_sync_last(text, uuid) to service_role;

notify pgrst, 'reload schema';
