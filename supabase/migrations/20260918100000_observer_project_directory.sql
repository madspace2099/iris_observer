-- Observer — the project directory: developers, project settings, who may view,
-- and the names of the people who present.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
--
-- ## What this is for
--
-- A project created in administration was a name, a slug and a status, and
-- nothing a customer could open: the customer application resolved projects
-- from a constant list, so a fresh project's events were stored and had no
-- screen (`docs/21-self-served-projects.md`). This migration gives a project
-- the rest of what a dashboard needs to exist — a developer it belongs to, a
-- currency, a locale, a time zone — and records who may see it.
--
-- ## A developer is a row inside the operating estate, and that is a ceiling
--
-- `account_id` stays what the identity spine made it: opaque text, the boundary
-- every facade filters on. Administration still operates as one estate, so a
-- developer is a row here rather than an account of its own. The spine's long
-- shape is an account per developer, and a project cannot move between accounts
-- (`refuse_project_move`). When that day comes it is one audited migration that
-- re-homes projects, and until production authentication exists (Gate 2) there
-- is no second party to isolate at the account level. Decided 2026-09-17, D1.
--
-- ## A person's name lives here and never in an event
--
-- `observer.project_agents` holds the display name for the identifier a showroom
-- sends as `agent_id`. It is the only table in the ingestion domain that holds a
-- name, on purpose: events stay free of personal data, and the name is joined at
-- read time. MADSPACE made the name a condition on 2026-09-17 (D4): every
-- showroom session shows who presented it.
--
-- ## Re-applied on every local start
--
-- The local control plane runs every migration at each start, so nothing here
-- may fail the second time: tables and columns are `if not exists`, constraints
-- are added behind a catalogue check, and every function this file introduces
-- is dropped before it is created, because `create or replace` cannot change a
-- return type and a desk that applied an earlier draft would stop starting.

/* --- 1. developers --------------------------------------------------------- */

create table if not exists observer.tenants (
  tenant_id   uuid        not null default gen_random_uuid(),

  -- The operating estate that administers this developer. See the header.
  account_id  text        not null,

  name        text        not null,

  -- The first segment of every customer address, so unique across the whole
  -- system and never a word the application routes itself.
  slug        text        not null,

  status      text        not null default 'active',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tenants_pkey primary key (tenant_id),
  constraint tenants_status_known check (status in ('active', 'archived')),
  constraint tenants_name_len check (char_length(name) between 1 and 200),
  constraint tenants_slug_shape check (slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  constraint tenants_slug_not_a_route check (
    slug not in (
      'sign-in', 'projects', 'settings', 'madspace', 'design-lab', 'lab',
      'iris', 'api', 'functions', 'brand'
    )
  ),
  constraint tenants_slug_unique unique (slug)
);

alter table observer.tenants owner to observer_ingest_owner;

comment on table observer.tenants is
  'A property developer whose projects are observed. slug is the first segment of every customer address.';

create index if not exists tenants_account
  on observer.tenants (account_id, created_at desc);

/* --- 2. what a project needs to be a dashboard ------------------------------ */

alter table observer.projects
  add column if not exists tenant_id uuid,
  add column if not exists currency  text,
  add column if not exists locale    text,
  add column if not exists time_zone text;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'projects_tenant_fkey') then
    alter table observer.projects
      add constraint projects_tenant_fkey
      foreign key (tenant_id) references observer.tenants (tenant_id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'projects_currency_shape') then
    alter table observer.projects
      add constraint projects_currency_shape
      check (currency is null or currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'projects_locale_shape') then
    alter table observer.projects
      add constraint projects_locale_shape
      check (locale is null or locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
  end if;
  -- The shape only. Whether the zone exists is the application's question:
  -- PGlite and a hosted Postgres need not agree on `pg_timezone_names`, and the
  -- two adapters must refuse the same inputs.
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'projects_time_zone_shape') then
    alter table observer.projects
      add constraint projects_time_zone_shape
      check (
        time_zone is null
        or (char_length(time_zone) between 1 and 64 and time_zone ~ '^[A-Za-z0-9_+/-]+$')
      );
  end if;
end;
$$;

create index if not exists projects_tenant
  on observer.projects (tenant_id)
  where tenant_id is not null;

-- A project's developer is set once, and from then on its address is fixed
-- (D3): every link already sent has to keep working, and a redirect table is a
-- second thing that can be wrong.
create or replace function observer.refuse_project_readdress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.tenant_id is not null then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'a project may not move between developers';
    end if;
    if new.slug is distinct from old.slug then
      raise exception 'a project with a developer keeps its address';
    end if;
  end if;
  return new;
end;
$$;

alter function observer.refuse_project_readdress() owner to observer_ingest_owner;

drop trigger if exists projects_address_immutable on observer.projects;
create trigger projects_address_immutable
  before update on observer.projects
  for each row execute function observer.refuse_project_readdress();

/* --- 3. who may view a project ---------------------------------------------- */
--
-- A grant is never deleted. Revoking stamps it, so "who could see this, and
-- when" stays answerable after the fact.

create table if not exists observer.project_viewers (
  grant_id       uuid        not null default gen_random_uuid(),
  project_id     uuid        not null,

  -- Denormalised like `project_sources.account_id`, and for the same reason.
  account_id     text        not null,

  -- The application's account identifier for the person. Opaque text.
  viewer_account text        not null,

  granted_by     text        not null,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     text,

  constraint project_viewers_pkey primary key (grant_id),
  constraint project_viewers_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint project_viewers_viewer_len check (char_length(viewer_account) between 1 and 200),
  constraint project_viewers_granted_by_len check (char_length(granted_by) between 1 and 200),
  constraint project_viewers_revocation_coherent
    check ((revoked_at is null) = (revoked_by is null))
);

alter table observer.project_viewers owner to observer_ingest_owner;

comment on table observer.project_viewers is
  'Who may open a project on the customer side. Revoked grants are stamped, never deleted.';

create unique index if not exists project_viewers_live
  on observer.project_viewers (project_id, viewer_account)
  where revoked_at is null;

create index if not exists project_viewers_by_viewer
  on observer.project_viewers (viewer_account)
  where revoked_at is null;

/* --- 4. the names of the people who present --------------------------------- */

create table if not exists observer.project_agents (
  project_id   uuid        not null,
  account_id   text        not null,

  -- Exactly what a showroom sends as `agent_id`. Opaque.
  agent_ref    text        not null,

  -- Null exactly when the name was withdrawn: see `named_by`.
  display_name text,

  -- Administration's word wins over a showroom's: see the report function.
  --
  -- `withdrawn` is a THIRD state and not the absence of a row. An administrator
  -- who removes a name is answering for a real person, and a deleted row would
  -- be refilled by the next roster report within half a minute — a removal that
  -- undoes itself is not a removal. The row stays, holding no name, and the
  -- report function's `where named_by = 'showroom'` refuses to write over it.
  named_by     text        not null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint project_agents_pkey primary key (project_id, agent_ref),
  constraint project_agents_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint project_agents_ref_len check (char_length(agent_ref) between 1 and 128),
  constraint project_agents_name_len
    check (display_name is null or char_length(display_name) between 1 and 120),
  constraint project_agents_named_by_known
    check (named_by in ('administration', 'showroom', 'withdrawn')),
  constraint project_agents_withdrawn_holds_no_name
    check ((named_by = 'withdrawn') = (display_name is null))
);

-- The same three rules for a database that already holds the first shape of this
-- table, where `create table if not exists` above did nothing. Dropped and added
-- rather than guarded, because a check constraint cannot be altered and both
-- statements are idempotent; the re-validation is a few rows.
alter table observer.project_agents alter column display_name drop not null;
alter table observer.project_agents
  drop constraint if exists project_agents_name_len,
  drop constraint if exists project_agents_named_by_known,
  drop constraint if exists project_agents_withdrawn_holds_no_name;
alter table observer.project_agents
  add constraint project_agents_name_len
    check (display_name is null or char_length(display_name) between 1 and 120),
  add constraint project_agents_named_by_known
    check (named_by in ('administration', 'showroom', 'withdrawn')),
  add constraint project_agents_withdrawn_holds_no_name
    check ((named_by = 'withdrawn') = (display_name is null));

alter table observer.project_agents owner to observer_ingest_owner;

comment on table observer.project_agents is
  'The display name behind an agent_id a showroom sends. The only place in the ingestion domain that holds a person''s name.';

/* --- 5. the doors ----------------------------------------------------------- */
--
-- Same rules as the spine: `public`, `security definer`, empty `search_path`,
-- `p_account` first and filtered on. Each is dropped first; see the header.

drop function if exists public.observer_tenant_create(text, text, text);
create function public.observer_tenant_create(
  p_account text,
  p_name    text,
  p_slug    text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into observer.tenants (account_id, name, slug)
  values (p_account, p_name, p_slug)
  returning tenant_id;
$$;

drop function if exists public.observer_tenants_for_account(text);
create function public.observer_tenants_for_account(p_account text)
returns table (
  tenant_id     uuid,
  name          text,
  slug          text,
  status        text,
  created_at    text,
  project_count bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    t.tenant_id,
    t.name,
    t.slug,
    t.status,
    pg_catalog.to_char(t.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    (select pg_catalog.count(*) from observer.projects p
      where p.tenant_id = t.tenant_id and p.account_id = p_account)
  from observer.tenants t
  where t.account_id = p_account
  order by t.name, t.created_at;
$$;

-- One statement, so the developer is proved to belong to the same estate as the
-- project in the act of being attached. False covers "not yours", "archived",
-- "another estate's developer" and "this would move or re-address it" alike.
drop function if exists public.observer_project_settings_set(text, uuid, uuid, text, text, text, text);
create function public.observer_project_settings_set(
  p_account   text,
  p_project   uuid,
  p_tenant    uuid,
  p_slug      text,
  p_currency  text,
  p_locale    text,
  p_time_zone text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]([a-z0-9-]{0,118}[a-z0-9])?$' then
    raise exception 'a project address is lowercase letters, digits and hyphens';
  end if;

  update observer.projects p
     set tenant_id  = p_tenant,
         slug       = p_slug,
         currency   = p_currency,
         locale     = p_locale,
         time_zone  = p_time_zone,
         updated_at = pg_catalog.now()
   where p.project_id = p_project
     and p.account_id = p_account
     and p.status     = 'active'
     and (p.tenant_id is null or (p.tenant_id = p_tenant and p.slug = p_slug))
     and exists (
       select 1 from observer.tenants t
        where t.tenant_id  = p_tenant
          and t.account_id = p_account
          and t.status     = 'active'
     );

  get diagnostics moved = row_count;
  return moved = 1;
end;
$$;

-- Every active project of the estate with what the customer side needs. A row
-- whose developer or settings are null is a project that is not complete yet;
-- the reader decides what that means, this only reports.
drop function if exists public.observer_project_directory(text);
create function public.observer_project_directory(p_account text)
returns table (
  project_id  uuid,
  name        text,
  slug        text,
  tenant_id   uuid,
  tenant_name text,
  tenant_slug text,
  currency    text,
  locale      text,
  time_zone   text,
  created_at  text
)
language sql
security definer
set search_path = ''
as $$
  select
    p.project_id,
    p.name,
    p.slug,
    t.tenant_id,
    t.name,
    t.slug,
    p.currency,
    p.locale,
    p.time_zone,
    pg_catalog.to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  from observer.projects p
  left join observer.tenants t
    on t.tenant_id = p.tenant_id
   and t.account_id = p_account
   and t.status = 'active'
  where p.account_id = p_account
    and p.status = 'active'
  order by p.created_at;
$$;

drop function if exists public.observer_project_viewer_grant(text, uuid, text, text);
create function public.observer_project_viewer_grant(
  p_account    text,
  p_project    uuid,
  p_viewer     text,
  p_granted_by text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into observer.project_viewers (project_id, account_id, viewer_account, granted_by)
  select p.project_id, p.account_id, p_viewer, p_granted_by
  from observer.projects p
  where p.project_id = p_project
    and p.account_id = p_account
    and p.status     = 'active'
  on conflict (project_id, viewer_account) where revoked_at is null do nothing;

  -- True when the grant stands afterwards, whether or not this call made it.
  return exists (
    select 1 from observer.project_viewers v
     where v.project_id = p_project
       and v.account_id = p_account
       and v.viewer_account = p_viewer
       and v.revoked_at is null
  );
end;
$$;

drop function if exists public.observer_project_viewer_revoke(text, uuid, text, text);
create function public.observer_project_viewer_revoke(
  p_account    text,
  p_project    uuid,
  p_viewer     text,
  p_revoked_by text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  update observer.project_viewers v
     set revoked_at = pg_catalog.now(),
         revoked_by = p_revoked_by
   where v.project_id = p_project
     and v.account_id = p_account
     and v.viewer_account = p_viewer
     and v.revoked_at is null;

  get diagnostics moved = row_count;
  return moved = 1;
end;
$$;

drop function if exists public.observer_project_viewers(text, uuid);
create function public.observer_project_viewers(p_account text, p_project uuid)
returns table (
  viewer_account text,
  granted_by     text,
  created_at     text
)
language sql
security definer
set search_path = ''
as $$
  select
    v.viewer_account,
    v.granted_by,
    pg_catalog.to_char(v.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  from observer.project_viewers v
  where v.account_id = p_account
    and v.project_id = p_project
    and v.revoked_at is null
  order by v.created_at;
$$;

drop function if exists public.observer_projects_for_viewer(text, text);
create function public.observer_projects_for_viewer(p_account text, p_viewer text)
returns table (project_id uuid)
language sql
security definer
set search_path = ''
as $$
  select v.project_id
  from observer.project_viewers v
  join observer.projects p
    on p.project_id = v.project_id
   and p.account_id = p_account
   and p.status = 'active'
  where v.account_id = p_account
    and v.viewer_account = p_viewer
    and v.revoked_at is null
  order by v.created_at;
$$;

-- Administration names a presenter. Its word replaces a showroom's and is never
-- replaced by one.
drop function if exists public.observer_project_agent_name_set(text, uuid, text, text);
create function public.observer_project_agent_name_set(
  p_account text,
  p_project uuid,
  p_agent   text,
  p_name    text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  -- A null name WITHDRAWS it. One door rather than two, because withdrawing is
  -- the same decision as naming, taken by the same person, about the same row:
  -- what a meeting shows for this agent id. The row is kept, holding no name,
  -- so that a roster report cannot refill it.
  insert into observer.project_agents (project_id, account_id, agent_ref, display_name, named_by)
  select
    p.project_id,
    p.account_id,
    p_agent,
    p_name,
    case when p_name is null then 'withdrawn' else 'administration' end
  from observer.projects p
  where p.project_id = p_project
    and p.account_id = p_account
    and p.status     = 'active'
  on conflict (project_id, agent_ref) do update
    set display_name = excluded.display_name,
        named_by     = excluded.named_by,
        updated_at   = pg_catalog.now();

  get diagnostics moved = row_count;
  return moved = 1;
end;
$$;

-- Everyone who presented on a project, and everyone administration has named,
-- in one list. A presenter with no name yet has `display_name` null, which is
-- the row an operator is looking for.
drop function if exists public.observer_project_agents(text, uuid);
create function public.observer_project_agents(p_account text, p_project uuid)
returns table (
  agent_ref     text,
  display_name  text,
  named_by      text,
  session_count bigint,
  last_seen_at  text
)
language sql
security definer
set search_path = ''
as $$
  with seen as (
    select
      e.agent_id                            as agent_ref,
      pg_catalog.count(distinct e.session_id) as session_count,
      pg_catalog.max(e.occurred_at)         as last_seen_at
    from observer.analytics_events e
    where e.account_id = p_account
      and e.project_id = p_project
      and e.agent_id   is not null
      and e.session_id is not null
    group by e.agent_id
  ),
  named as (
    select a.agent_ref, a.display_name, a.named_by
    from observer.project_agents a
    where a.account_id = p_account
      and a.project_id = p_project
  )
  select
    coalesce(s.agent_ref, n.agent_ref),
    n.display_name,
    n.named_by,
    coalesce(s.session_count, 0),
    pg_catalog.to_char(s.last_seen_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  from seen s
  full outer join named n on n.agent_ref = s.agent_ref
  order by s.last_seen_at desc nulls last, coalesce(s.agent_ref, n.agent_ref);
$$;

-- A showroom reports the names on its own roster. Identity comes from the
-- resolved source, as it does for events; nothing in the body says which
-- project this is. A name administration set is left alone. Returns how many
-- names were taken.
drop function if exists public.observer_source_agents_report(uuid, jsonb);
create function public.observer_source_agents_report(p_source uuid, p_agents jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken integer;
begin
  if pg_catalog.jsonb_typeof(p_agents) <> 'array' then
    raise exception 'agents must be an array';
  end if;

  -- `distinct on`, because one statement may not touch a row twice and a roster
  -- that lists somebody twice is a showroom's mistake, not a reason to fail.
  insert into observer.project_agents as a
    (project_id, account_id, agent_ref, display_name, named_by)
  select distinct on (r.agent_id)
    s.project_id, s.account_id, r.agent_id, r.display_name, 'showroom'
  from observer.project_sources s
  cross join lateral pg_catalog.jsonb_to_recordset(p_agents)
    as r(agent_id text, display_name text)
  where s.source_id = p_source
    and s.state = 'active'
    and r.agent_id is not null
    and r.display_name is not null
  order by r.agent_id
  on conflict (project_id, agent_ref) do update
    set display_name = excluded.display_name,
        updated_at   = pg_catalog.now()
    where a.named_by = 'showroom';

  get diagnostics taken = row_count;
  return taken;
end;
$$;

alter function public.observer_tenant_create(text, text, text) owner to observer_ingest_owner;
alter function public.observer_tenants_for_account(text) owner to observer_ingest_owner;
alter function public.observer_project_settings_set(text, uuid, uuid, text, text, text, text)
  owner to observer_ingest_owner;
alter function public.observer_project_directory(text) owner to observer_ingest_owner;
alter function public.observer_project_viewer_grant(text, uuid, text, text)
  owner to observer_ingest_owner;
alter function public.observer_project_viewer_revoke(text, uuid, text, text)
  owner to observer_ingest_owner;
alter function public.observer_project_viewers(text, uuid) owner to observer_ingest_owner;
alter function public.observer_projects_for_viewer(text, text) owner to observer_ingest_owner;
alter function public.observer_project_agent_name_set(text, uuid, text, text)
  owner to observer_ingest_owner;
alter function public.observer_project_agents(text, uuid) owner to observer_ingest_owner;
alter function public.observer_source_agents_report(uuid, jsonb) owner to observer_ingest_owner;

/* --- 6. row level security --------------------------------------------------- */
--
-- Enabled, no policy: the posture of every table in this domain. See the spine.

alter table observer.tenants         enable row level security;
alter table observer.project_viewers enable row level security;
alter table observer.project_agents  enable row level security;

/* --- 7. grants ---------------------------------------------------------------- */

revoke all on observer.tenants         from public, anon, authenticated, service_role;
revoke all on observer.project_viewers from public, anon, authenticated, service_role;
revoke all on observer.project_agents  from public, anon, authenticated, service_role;

revoke all on function observer.refuse_project_readdress()
  from public, anon, authenticated, service_role;

revoke all on function public.observer_tenant_create(text, text, text)
  from public, anon, authenticated;
revoke all on function public.observer_tenants_for_account(text)
  from public, anon, authenticated;
revoke all on function public.observer_project_settings_set(text, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.observer_project_directory(text)
  from public, anon, authenticated;
revoke all on function public.observer_project_viewer_grant(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.observer_project_viewer_revoke(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.observer_project_viewers(text, uuid)
  from public, anon, authenticated;
revoke all on function public.observer_projects_for_viewer(text, text)
  from public, anon, authenticated;
revoke all on function public.observer_project_agent_name_set(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.observer_project_agents(text, uuid)
  from public, anon, authenticated;
revoke all on function public.observer_source_agents_report(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.observer_tenant_create(text, text, text) to service_role;
grant execute on function public.observer_tenants_for_account(text) to service_role;
grant execute on function public.observer_project_settings_set(text, uuid, uuid, text, text, text, text)
  to service_role;
grant execute on function public.observer_project_directory(text) to service_role;
grant execute on function public.observer_project_viewer_grant(text, uuid, text, text)
  to service_role;
grant execute on function public.observer_project_viewer_revoke(text, uuid, text, text)
  to service_role;
grant execute on function public.observer_project_viewers(text, uuid) to service_role;
grant execute on function public.observer_projects_for_viewer(text, text) to service_role;
grant execute on function public.observer_project_agent_name_set(text, uuid, text, text)
  to service_role;
grant execute on function public.observer_project_agents(text, uuid) to service_role;
grant execute on function public.observer_source_agents_report(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
