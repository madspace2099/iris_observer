-- Observer — the unit catalogue as a connector delivers it, and what a connector needs to run.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
--
-- Executed on every test run by `supabase/test/catalogue-connectors.test.ts`.
-- Applying it to a hosted project remains an open deployment prerequisite.
--
-- ## What this holds
--
-- ADR-0036: a connector is a credentialed pull adapter that produces
-- snapshots of one canonical catalogue, and change is the difference between
-- two snapshots. So there are five tables and they are exactly those nouns:
--
--   connector_configs       the non-secret half of a connection — which CRM,
--                           which project on their side, which columns mean
--                           what, which status words map to which state.
--   connector_credentials   the secret half, sealed by the application under
--                           a key this database has never seen, the same
--                           arrangement as `account_credentials`.
--   catalogue_units         the CURRENT snapshot, one row per unit per
--                           connector, with `withdrawn_at` set rather than the
--                           row deleted when a unit leaves the pricelist.
--   catalogue_changes       append-only. Every addition, field change and
--                           withdrawal, with the unit before and after. This is
--                           the fact sequence; the table above is a projection
--                           of it that happens to be cheap to keep.
--   catalogue_syncs         one row per attempt, succeeded or refused, so an
--                           operator screen can say when the last sync ran and
--                           why the last one did not.
--
-- ## Scoping
--
-- Every façade takes `p_account` first and resolves the project THROUGH the
-- account in the same statement, as `observer_source_create` does. A project
-- that is not the caller's is not found, not refused: the answer to "does
-- somebody else's project exist" is the same as "no".
--
-- ## The credential is a ciphertext here and a secret nowhere in this file
--
-- Nonce, ciphertext, tag and key version, base64, as `account_credentials`
-- stores them. The master key lives in the application's environment. The
-- authenticated data binds the row to its account, project and connector, so
-- a row copied between projects fails to open.

/* --- 1. the owner --------------------------------------------------------- */
--
-- The ingestion owner, not a fifth role. Every façade below resolves a project
-- through `observer.projects`, which that role owns, and a table with RLS on
-- and no policy shows its rows to its owner alone — a separate owner with a
-- SELECT grant saw the table and none of its rows. Found by executing this
-- file, which is what the test is for.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_ingest_owner') then
    create role observer_ingest_owner nologin noinherit;
  end if;
end;
$$;

create schema if not exists observer;
grant usage on schema observer to observer_ingest_owner;

/* --- 2. connector configuration ------------------------------------------- */

create table if not exists observer.connector_configs (
  project_id   uuid        not null,
  account_id   text        not null,
  connector    text        not null,

  -- Non-secret. Developer and project ids on the CRM's side, a board id, the
  -- column mapping, the status vocabulary, a currency. Never a token, never a
  -- password: those have their own table and their own door.
  config       jsonb       not null default '{}'::jsonb,
  enabled      boolean     not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint connector_configs_pkey primary key (project_id, connector),
  constraint connector_configs_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint connector_configs_kind_known
    check (connector in ('realpad', 'monday', 'lomnio', 'csv')),
  constraint connector_configs_config_is_object
    check (jsonb_typeof(config) = 'object')
);

alter table observer.connector_configs owner to observer_ingest_owner;

comment on table observer.connector_configs is
  'The non-secret half of a CRM connection per project. Credentials live in connector_credentials.';

create index if not exists connector_configs_account
  on observer.connector_configs (account_id, project_id);

/* --- 3. connector credentials --------------------------------------------- */

create table if not exists observer.connector_credentials (
  project_id   uuid        not null,
  account_id   text        not null,
  connector    text        not null,

  key_version  text        not null,
  nonce        text        not null,
  ciphertext   text        not null,
  auth_tag     text        not null,
  -- Not a secret: what a person recognises their own credential by.
  last_four    text        not null,

  -- A monotonic write token minted by the application; see
  -- `account_credentials.revision` for why a late replacement must not win.
  revision     bigint      not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint connector_credentials_pkey primary key (project_id, connector),
  constraint connector_credentials_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint connector_credentials_kind_known
    check (connector in ('realpad', 'monday', 'lomnio', 'csv')),
  constraint connector_credentials_last_four_len check (char_length(last_four) = 4)
);

alter table observer.connector_credentials owner to observer_ingest_owner;

comment on table observer.connector_credentials is
  'One sealed CRM credential per project and connector. The decryption key is held by the application, never here.';

/* --- 4. the current catalogue --------------------------------------------- */

create table if not exists observer.catalogue_units (
  project_id   uuid        not null,
  account_id   text        not null,
  connector    text        not null,
  code         text        not null,

  -- The canonical unit, exactly as the contract shapes it (`CatalogueUnit`).
  unit         jsonb       not null,

  fetched_at   timestamptz not null,
  -- Set, never deleted, when a fetch no longer lists the unit.
  withdrawn_at timestamptz,

  constraint catalogue_units_pkey primary key (project_id, connector, code),
  constraint catalogue_units_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint catalogue_units_kind_known
    check (connector in ('realpad', 'monday', 'lomnio', 'csv')),
  constraint catalogue_units_code_len check (char_length(code) between 1 and 64),
  constraint catalogue_units_unit_is_object check (jsonb_typeof(unit) = 'object')
);

alter table observer.catalogue_units owner to observer_ingest_owner;

comment on table observer.catalogue_units is
  'The current catalogue snapshot per project and connector. A projection of catalogue_changes.';

create index if not exists catalogue_units_project_live
  on observer.catalogue_units (project_id, connector)
  where withdrawn_at is null;

/* --- 5. the change log, append-only --------------------------------------- */

create table if not exists observer.catalogue_changes (
  id             bigserial   primary key,
  project_id     uuid        not null,
  account_id     text        not null,
  connector      text        not null,
  code           text        not null,
  kind           text        not null,
  changed_fields jsonb       not null default '[]'::jsonb,
  before_unit    jsonb,
  after_unit     jsonb,
  fetched_at     timestamptz not null,
  recorded_at    timestamptz not null default now(),

  constraint catalogue_changes_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint catalogue_changes_kind_known
    check (kind in ('added', 'changed', 'withdrawn')),
  constraint catalogue_changes_fields_is_array
    check (jsonb_typeof(changed_fields) = 'array'),
  -- An addition has no before; a withdrawal has no after; a change has both.
  constraint catalogue_changes_shape_coherent check (
    (kind = 'added'     and before_unit is null     and after_unit is not null) or
    (kind = 'withdrawn' and before_unit is not null and after_unit is null) or
    (kind = 'changed'   and before_unit is not null and after_unit is not null)
  )
);

alter table observer.catalogue_changes owner to observer_ingest_owner;
alter sequence observer.catalogue_changes_id_seq owner to observer_ingest_owner;

comment on table observer.catalogue_changes is
  'Append-only history of the catalogue: every addition, change and withdrawal a sync found.';

create index if not exists catalogue_changes_project_time
  on observer.catalogue_changes (project_id, recorded_at desc);

create or replace function observer.refuse_catalogue_change_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'catalogue changes are append-only';
end;
$$;

alter function observer.refuse_catalogue_change_mutation() owner to observer_ingest_owner;

drop trigger if exists catalogue_changes_append_only on observer.catalogue_changes;
create trigger catalogue_changes_append_only
  before update or delete on observer.catalogue_changes
  for each row execute function observer.refuse_catalogue_change_mutation();

/* --- 6. sync attempts ----------------------------------------------------- */

create table if not exists observer.catalogue_syncs (
  id                  bigserial   primary key,
  project_id          uuid        not null,
  account_id          text        not null,
  connector           text        not null,
  outcome             text        not null,
  fetched             integer     not null default 0,
  added               integer     not null default 0,
  changed             integer     not null default 0,
  withdrawn           integer     not null default 0,
  -- Raw status words the mapping did not cover; the integrations screen turns
  -- them into rows of the mapping table.
  unknown_statuses    jsonb       not null default '[]'::jsonb,
  retry_after_seconds integer,
  -- A sentence Observer wrote, never a response body.
  detail              text        not null default '',
  started_at          timestamptz not null default now(),

  constraint catalogue_syncs_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint catalogue_syncs_outcome_known check (
    outcome in ('ok', 'unauthorised', 'rate_limited', 'unavailable', 'malformed', 'misconfigured')
  ),
  constraint catalogue_syncs_unknown_is_array
    check (jsonb_typeof(unknown_statuses) = 'array'),
  constraint catalogue_syncs_detail_len check (char_length(detail) <= 400)
);

alter table observer.catalogue_syncs owner to observer_ingest_owner;
alter sequence observer.catalogue_syncs_id_seq owner to observer_ingest_owner;

create index if not exists catalogue_syncs_project_time
  on observer.catalogue_syncs (project_id, connector, started_at desc);

/* --- 7. identity may not move --------------------------------------------- */

create or replace function observer.refuse_connector_move()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.account_id is distinct from old.account_id
     or new.connector is distinct from old.connector then
    raise exception 'a connector row may not move between projects, accounts or connectors';
  end if;
  return new;
end;
$$;

alter function observer.refuse_connector_move() owner to observer_ingest_owner;

drop trigger if exists connector_configs_identity_immutable on observer.connector_configs;
create trigger connector_configs_identity_immutable
  before update on observer.connector_configs
  for each row execute function observer.refuse_connector_move();

drop trigger if exists connector_credentials_identity_immutable on observer.connector_credentials;
create trigger connector_credentials_identity_immutable
  before update on observer.connector_credentials
  for each row execute function observer.refuse_connector_move();

/* --- 8. the doors --------------------------------------------------------- */

-- Configuration is written whole. The project is resolved through the account
-- in the same statement; a project that is not the caller's inserts nothing.
create or replace function public.observer_connector_config_set(
  p_account   text,
  p_project   uuid,
  p_connector text,
  p_config    jsonb,
  p_enabled   boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  written integer;
begin
  insert into observer.connector_configs (project_id, account_id, connector, config, enabled)
  select p.project_id, p.account_id, p_connector, p_config, p_enabled
    from observer.projects p
   where p.project_id = p_project
     and p.account_id = p_account
  on conflict (project_id, connector) do update
     set config     = excluded.config,
         enabled    = excluded.enabled,
         updated_at = pg_catalog.now();
  get diagnostics written = row_count;
  return written = 1;
end;
$$;

alter function public.observer_connector_config_set(text, uuid, text, jsonb, boolean)
  owner to observer_ingest_owner;

-- What the integrations screen renders: every connector configured for the
-- project, whether a credential is held (and its last four), and the last
-- sync's verdict. No ciphertext, no config secret — there is none to leak.
create or replace function public.observer_connector_configs(
  p_account text,
  p_project uuid
)
returns table (
  connector           text,
  config              jsonb,
  enabled             boolean,
  has_credential      boolean,
  credential_last_four text,
  updated_at          text,
  last_sync_at        text,
  last_sync_outcome   text,
  last_sync_fetched   integer,
  last_sync_detail    text
)
language sql
security definer
set search_path = ''
as $$
  select
    c.connector,
    c.config,
    c.enabled,
    (k.project_id is not null),
    k.last_four,
    pg_catalog.to_char(c.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(s.started_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    s.outcome,
    s.fetched,
    s.detail
  from observer.connector_configs c
  left join observer.connector_credentials k
    on k.project_id = c.project_id and k.connector = c.connector
  left join lateral (
    select y.started_at, y.outcome, y.fetched, y.detail
      from observer.catalogue_syncs y
     where y.project_id = c.project_id and y.connector = c.connector
     order by y.started_at desc
     limit 1
  ) s on true
  where c.account_id = p_account
    and c.project_id = p_project
  order by c.connector;
$$;

alter function public.observer_connector_configs(text, uuid)
  owner to observer_ingest_owner;

-- The sealed credential is written whole and only forward: a revision at or
-- below the stored one is refused, so a slow first save cannot reinstate a
-- credential the operator has since replaced.
create or replace function public.observer_connector_credential_set(
  p_account     text,
  p_project     uuid,
  p_connector   text,
  p_key_version text,
  p_nonce       text,
  p_ciphertext  text,
  p_auth_tag    text,
  p_last_four   text,
  p_revision    bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  written integer;
begin
  insert into observer.connector_credentials
    (project_id, account_id, connector, key_version, nonce, ciphertext, auth_tag, last_four, revision)
  select p.project_id, p.account_id, p_connector, p_key_version, p_nonce, p_ciphertext, p_auth_tag,
         p_last_four, p_revision
    from observer.projects p
   where p.project_id = p_project
     and p.account_id = p_account
  on conflict (project_id, connector) do update
     set key_version = excluded.key_version,
         nonce       = excluded.nonce,
         ciphertext  = excluded.ciphertext,
         auth_tag    = excluded.auth_tag,
         last_four   = excluded.last_four,
         revision    = excluded.revision,
         updated_at  = pg_catalog.now()
   where observer.connector_credentials.revision < excluded.revision;
  get diagnostics written = row_count;
  return written = 1;
end;
$$;

alter function public.observer_connector_credential_set(text, uuid, text, text, text, text, text, text, bigint)
  owner to observer_ingest_owner;

-- The sealed payload, for the one function in the application that opens it.
create or replace function public.observer_connector_credential_read(
  p_account   text,
  p_project   uuid,
  p_connector text
)
returns table (
  key_version text,
  nonce       text,
  ciphertext  text,
  auth_tag    text,
  revision    bigint
)
language sql
security definer
set search_path = ''
as $$
  select k.key_version, k.nonce, k.ciphertext, k.auth_tag, k.revision
    from observer.connector_credentials k
   where k.account_id = p_account
     and k.project_id = p_project
     and k.connector  = p_connector;
$$;

alter function public.observer_connector_credential_read(text, uuid, text)
  owner to observer_ingest_owner;

create or replace function public.observer_connector_credential_remove(
  p_account   text,
  p_project   uuid,
  p_connector text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from observer.connector_credentials k
   where k.account_id = p_account
     and k.project_id = p_project
     and k.connector  = p_connector;
  get diagnostics removed = row_count;
  return removed = 1;
end;
$$;

alter function public.observer_connector_credential_remove(text, uuid, text)
  owner to observer_ingest_owner;

-- One sync's result, applied whole. The snapshot replaces the current rows,
-- anything the snapshot no longer lists is marked withdrawn, and the changes
-- the application derived are appended — in one function, so a failure in
-- any part leaves the previous snapshot exactly as it was.
--
-- `p_units` is a JSON array of `CatalogueUnit`; `p_changes` a JSON array of
-- `UnitChange`. The application diffed them; the database records them. The
-- counts returned are of what was written, not of what was sent.
create or replace function public.observer_catalogue_apply(
  p_account    text,
  p_project    uuid,
  p_connector  text,
  p_fetched_at timestamptz,
  p_units      jsonb,
  p_changes    jsonb
)
returns table (
  added     integer,
  changed   integer,
  withdrawn integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_account text;
  n_added     integer := 0;
  n_changed   integer := 0;
  n_withdrawn integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_units) <> 'array' or pg_catalog.jsonb_typeof(p_changes) <> 'array' then
    raise exception 'units and changes must be arrays';
  end if;

  select p.account_id into owner_account
    from observer.projects p
   where p.project_id = p_project
     and p.account_id = p_account;
  if owner_account is null then
    return;
  end if;

  insert into observer.catalogue_units (project_id, account_id, connector, code, unit, fetched_at)
  select p_project, owner_account, p_connector, u ->> 'code', u, p_fetched_at
    from pg_catalog.jsonb_array_elements(p_units) as u
   where pg_catalog.jsonb_typeof(u) = 'object'
     and (u ->> 'code') is not null
  on conflict (project_id, connector, code) do update
     set unit         = excluded.unit,
         fetched_at   = excluded.fetched_at,
         withdrawn_at = null;

  update observer.catalogue_units c
     set withdrawn_at = p_fetched_at
   where c.project_id = p_project
     and c.connector  = p_connector
     and c.withdrawn_at is null
     and c.fetched_at < p_fetched_at;

  insert into observer.catalogue_changes
    (project_id, account_id, connector, code, kind, changed_fields, before_unit, after_unit, fetched_at)
  select p_project, owner_account, p_connector,
         ch ->> 'code',
         ch ->> 'kind',
         coalesce(ch -> 'changedFields', '[]'::jsonb),
         case when pg_catalog.jsonb_typeof(ch -> 'before') = 'object' then ch -> 'before' end,
         case when pg_catalog.jsonb_typeof(ch -> 'after')  = 'object' then ch -> 'after'  end,
         p_fetched_at
    from pg_catalog.jsonb_array_elements(p_changes) as ch
   where pg_catalog.jsonb_typeof(ch) = 'object';

  select count(*) filter (where ch ->> 'kind' = 'added'),
         count(*) filter (where ch ->> 'kind' = 'changed'),
         count(*) filter (where ch ->> 'kind' = 'withdrawn')
    into n_added, n_changed, n_withdrawn
    from pg_catalog.jsonb_array_elements(p_changes) as ch;

  added := n_added; changed := n_changed; withdrawn := n_withdrawn;
  return next;
end;
$$;

alter function public.observer_catalogue_apply(text, uuid, text, timestamptz, jsonb, jsonb)
  owner to observer_ingest_owner;

-- The catalogue as it stands: every unit the connector still lists. Withdrawn
-- units are excluded here and kept in the change log.
create or replace function public.observer_catalogue_current(
  p_account   text,
  p_project   uuid,
  p_connector text
)
returns table (
  code       text,
  unit       jsonb,
  fetched_at text
)
language sql
security definer
set search_path = ''
as $$
  select c.code, c.unit,
         pg_catalog.to_char(c.fetched_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    from observer.catalogue_units c
   where c.account_id = p_account
     and c.project_id = p_project
     and c.connector  = p_connector
     and c.withdrawn_at is null
   order by c.code;
$$;

alter function public.observer_catalogue_current(text, uuid, text)
  owner to observer_ingest_owner;

create or replace function public.observer_catalogue_changes(
  p_account text,
  p_project uuid,
  p_limit   integer
)
returns table (
  connector      text,
  code           text,
  kind           text,
  changed_fields jsonb,
  before_unit    jsonb,
  after_unit     jsonb,
  fetched_at     text,
  recorded_at    text
)
language sql
security definer
set search_path = ''
as $$
  select c.connector, c.code, c.kind, c.changed_fields, c.before_unit, c.after_unit,
         pg_catalog.to_char(c.fetched_at  at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         pg_catalog.to_char(c.recorded_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    from observer.catalogue_changes c
   where c.account_id = p_account
     and c.project_id = p_project
   order by c.recorded_at desc, c.id desc
   limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

alter function public.observer_catalogue_changes(text, uuid, integer)
  owner to observer_ingest_owner;

-- Every attempt is recorded, refused ones included: "the last sync was refused
-- as unauthorised at 09:12" is the sentence an operator needs.
create or replace function public.observer_catalogue_sync_record(
  p_account     text,
  p_project     uuid,
  p_connector   text,
  p_outcome     text,
  p_fetched     integer,
  p_added       integer,
  p_changed     integer,
  p_withdrawn   integer,
  p_unknown     jsonb,
  p_retry_after integer,
  p_detail      text
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into observer.catalogue_syncs
    (project_id, account_id, connector, outcome, fetched, added, changed, withdrawn,
     unknown_statuses, retry_after_seconds, detail)
  select p.project_id, p.account_id, p_connector, p_outcome,
         coalesce(p_fetched, 0), coalesce(p_added, 0), coalesce(p_changed, 0), coalesce(p_withdrawn, 0),
         coalesce(p_unknown, '[]'::jsonb), p_retry_after, pg_catalog.left(coalesce(p_detail, ''), 400)
    from observer.projects p
   where p.project_id = p_project
     and p.account_id = p_account
  returning id;
$$;

alter function public.observer_catalogue_sync_record(text, uuid, text, text, integer, integer, integer, integer, jsonb, integer, text)
  owner to observer_ingest_owner;

/* --- 9. row level security ------------------------------------------------ */

alter table observer.connector_configs     enable row level security;
alter table observer.connector_credentials enable row level security;
alter table observer.catalogue_units       enable row level security;
alter table observer.catalogue_changes     enable row level security;
alter table observer.catalogue_syncs       enable row level security;

-- No policies, deliberately: the repository's posture. The owner is a role
-- nobody can log in as, and the definer functions are the only way in.

/* --- 10. grants ----------------------------------------------------------- */

revoke all on observer.connector_configs     from public, anon, authenticated, service_role;
revoke all on observer.connector_credentials from public, anon, authenticated, service_role;
revoke all on observer.catalogue_units       from public, anon, authenticated, service_role;
revoke all on observer.catalogue_changes     from public, anon, authenticated, service_role;
revoke all on observer.catalogue_syncs       from public, anon, authenticated, service_role;

revoke all on function public.observer_connector_config_set(text, uuid, text, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.observer_connector_configs(text, uuid)
  from public, anon, authenticated;
revoke all on function public.observer_connector_credential_set(text, uuid, text, text, text, text, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.observer_connector_credential_read(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.observer_connector_credential_remove(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.observer_catalogue_apply(text, uuid, text, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.observer_catalogue_current(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.observer_catalogue_changes(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.observer_catalogue_sync_record(text, uuid, text, text, integer, integer, integer, integer, jsonb, integer, text)
  from public, anon, authenticated;

revoke all on function observer.refuse_catalogue_change_mutation() from public, anon, authenticated, service_role;
revoke all on function observer.refuse_connector_move()            from public, anon, authenticated, service_role;

grant execute on function public.observer_connector_config_set(text, uuid, text, jsonb, boolean) to service_role;
grant execute on function public.observer_connector_configs(text, uuid) to service_role;
grant execute on function public.observer_connector_credential_set(text, uuid, text, text, text, text, text, text, bigint) to service_role;
grant execute on function public.observer_connector_credential_read(text, uuid, text) to service_role;
grant execute on function public.observer_connector_credential_remove(text, uuid, text) to service_role;
grant execute on function public.observer_catalogue_apply(text, uuid, text, timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.observer_catalogue_current(text, uuid, text) to service_role;
grant execute on function public.observer_catalogue_changes(text, uuid, integer) to service_role;
grant execute on function public.observer_catalogue_sync_record(text, uuid, text, text, integer, integer, integer, integer, jsonb, integer, text) to service_role;

notify pgrst, 'reload schema';
