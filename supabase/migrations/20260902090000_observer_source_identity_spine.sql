-- Observer — the source identity spine: projects and project sources.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
--
-- No Supabase project was contacted while this was written. It IS executed on
-- every test run against PGlite — PostgreSQL compiled to WASM, with a real
-- catalogue and a real permission system — by
-- `supabase/test/source-spine-grants.test.ts`, which creates the three Supabase
-- roles and then asks PostgreSQL itself who can do what.
--
-- Applying it to a hosted project and running a verifier remains an open
-- deployment prerequisite, and no test here should be read as having closed it.
--
-- ## What this establishes
--
-- The identity spine `L-02` fixed: **account → project → project_source**. Every
-- analytics fact this system will ever store hangs off a `source_id`, and every
-- `source_id` resolves to exactly one project and one account. That resolution
-- is done by the server from an authenticated credential and never read from a
-- request body, which is what `projection.ts` is the executable proof of.
--
-- ## There is deliberately no `observer.accounts` table
--
-- The obvious reading of "account → project → source" is three tables. It is
-- two, and the reason is already written down in
-- `20260829173000_observer_account_credentials.sql`:
--
--   > The account directory belongs to the application, and a foreign key here
--   > would tie the credential store to a table that does not exist yet.
--
-- That decision has not changed, and creating `observer.accounts` now would
-- contradict it while producing exactly the thing the architecture forbids: a
-- second account model, in the database, beside the one the application already
-- owns. So `account_id` is `text` here for the same reason it is `text` there —
-- opaque, supplied by the Next.js server from a verified session, never by a
-- browser — and the two halves of the schema key on the same value.
--
-- The cost is honest and worth naming: PostgreSQL cannot enforce that an
-- `account_id` refers to anything real. What it does enforce is that a project
-- cannot move between accounts, that a source cannot move between projects or
-- accounts, and that every read is scoped by an account the caller had to
-- supply. A mistake upstream cannot quietly reassign a source.
--
-- ## Identity is immutable; everything a person types is not
--
-- `project_id` and `source_id` are UUIDs minted by the database and never
-- reused, renamed or recycled. `name`, `slug` and `display_label` are display
-- metadata (`L-03`) and may be edited freely: nothing authorises on them,
-- nothing joins on them, and a rename must never orphan a year of events.
--
-- `environment` is the exception among the editable-looking columns. It is
-- authoritative — it is what a stored event is grouped by — and a client's
-- reported environment never overrides it (`PD-25`). It is settable only
-- through a function that says so in its name.

/* --- 1. the private owner ------------------------------------------------- */
--
-- One owner for the whole ingestion domain: this migration, and the activation,
-- credential, event and heartbeat migrations that follow. A role per table
-- would be five roles that must all be granted identically, which is five
-- chances to grant one of them something the others do not have.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_ingest_owner') then
    -- NOLOGIN, NOINHERIT, no password. It exists to own objects, not to be used.
    create role observer_ingest_owner nologin noinherit;
  end if;
end;
$$;

create schema if not exists observer;

-- The owner needs USAGE on a schema it does not own. Found by executing the
-- credential migration rather than by reading it: the schema belongs to
-- whoever created it first, so owning the tables inside it grants nothing on
-- the way in, and every definer function fails with "permission denied for
-- schema observer".
grant usage on schema observer to observer_ingest_owner;

/* --- 2. projects ---------------------------------------------------------- */

create table if not exists observer.projects (
  -- Minted here, immutable, never reused. A project's identity outlives every
  -- name it is ever given.
  project_id  uuid        not null default gen_random_uuid(),

  -- The security boundary. Opaque text, from the server's verified session.
  account_id  text        not null,

  -- Display metadata. Editable, never an identifier (`L-03`).
  name        text        not null,
  slug        text,

  status      text        not null default 'active',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint projects_pkey primary key (project_id),
  constraint projects_status_known check (status in ('active', 'archived')),
  constraint projects_name_len check (char_length(name) between 1 and 200),
  constraint projects_slug_len check (slug is null or char_length(slug) between 1 and 120),
  -- Unique per account, not globally: two developers may both have a "Riverside".
  constraint projects_slug_per_account unique (account_id, slug)
);

alter table observer.projects owner to observer_ingest_owner;

comment on table observer.projects is
  'A development an account observes. project_id is immutable identity; name and slug are display metadata.';

create index if not exists projects_account
  on observer.projects (account_id, created_at desc);

/* --- 3. project sources --------------------------------------------------- */
--
-- One row per installed thing that emits observations. `showroom_ue5` is the
-- only type V1 activates, and the others are listed now so that the first web
-- or CRM source is a row rather than a migration — an Unreal-only schema would
-- have to be rewritten the first time anything else reports.

create table if not exists observer.project_sources (
  source_id      uuid        not null default gen_random_uuid(),

  -- Denormalised deliberately. Every authenticated request derives account,
  -- project and source together, and carrying the account here makes that one
  -- indexed read instead of a join — on the hottest path in the system.
  -- The trigger below keeps it consistent with the project's account.
  account_id     text        not null,
  project_id     uuid        not null,

  source_type    text        not null,

  -- AUTHORITATIVE. What a client reports is provenance only (`PD-25`).
  environment    text        not null,

  -- Server-authored. A client never names itself.
  display_label  text        not null,

  state          text        not null default 'active',

  -- Operational state, written by heartbeat and ingestion. Never analytics.
  last_seen_at         timestamptz,
  last_ingest_at       timestamptz,
  observed_app_version text,
  observed_plugin      text,
  observed_build_id    text,
  observed_environment text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint project_sources_pkey primary key (source_id),
  constraint project_sources_project_fkey
    foreign key (project_id) references observer.projects (project_id),
  constraint project_sources_type_known
    check (source_type in ('showroom_ue5', 'web_iris', 'crm', 'communication', 'manual_admin')),
  constraint project_sources_environment_known
    check (environment in ('production', 'staging', 'development', 'demo')),
  constraint project_sources_state_known
    check (state in ('active', 'suspended', 'archived')),
  constraint project_sources_label_len
    check (char_length(display_label) between 1 and 200)
);

alter table observer.project_sources owner to observer_ingest_owner;

comment on table observer.project_sources is
  'One installed emitter. source_id is the identity every analytics fact hangs off; environment here is authoritative over anything a client reports.';

create index if not exists project_sources_project
  on observer.project_sources (project_id, created_at desc);
create index if not exists project_sources_account
  on observer.project_sources (account_id, created_at desc);

/* --- 4. identity may not move --------------------------------------------- */
--
-- The primary keys stop duplicates. They do not stop an UPDATE rewriting
-- `account_id` on a row that already exists, which is exactly the mistake that
-- would hand one account's showroom to another — along with every event ever
-- stored against it, since events carry `source_id` and resolve the rest from
-- here.

create or replace function observer.refuse_project_move()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.account_id is distinct from old.account_id then
    raise exception 'a project may not change its identity or move between accounts';
  end if;
  return new;
end;
$$;

alter function observer.refuse_project_move() owner to observer_ingest_owner;

drop trigger if exists projects_identity_immutable on observer.projects;
create trigger projects_identity_immutable
  before update on observer.projects
  for each row execute function observer.refuse_project_move();

create or replace function observer.refuse_source_move()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_id is distinct from old.source_id
     or new.account_id is distinct from old.account_id
     or new.project_id is distinct from old.project_id then
    raise exception 'a source may not change its identity or move between projects or accounts';
  end if;
  return new;
end;
$$;

alter function observer.refuse_source_move() owner to observer_ingest_owner;

drop trigger if exists project_sources_identity_immutable on observer.project_sources;
create trigger project_sources_identity_immutable
  before update on observer.project_sources
  for each row execute function observer.refuse_source_move();

/* --- 5. the doors --------------------------------------------------------- */
--
-- `security definer`, in `public`, owned by the private role. In `public`
-- because `observer` is not an exposed schema and PostgREST answers 406 for one
-- that is not; `security definer` because the calling role deliberately holds
-- no privilege on the tables. Each sets an empty `search_path` and qualifies
-- every object, so nothing here can be resolved to an attacker's table.
--
-- Every one of them takes `p_account` as its FIRST argument and filters on it.
-- That is not defensive habit: it is what makes a mistake in the application
-- layer produce an empty result rather than another account's data.

create or replace function public.observer_project_create(
  p_account text,
  p_name    text,
  p_slug    text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into observer.projects (account_id, name, slug)
  values (p_account, p_name, p_slug)
  returning project_id;
$$;

alter function public.observer_project_create(text, text, text)
  owner to observer_ingest_owner;

-- The account is taken from the caller and the project is verified to belong to
-- it IN THE SAME STATEMENT. A two-step "look up the project, then insert" is
-- the same code with a race in the middle.
create or replace function public.observer_source_create(
  p_account     text,
  p_project     uuid,
  p_type        text,
  p_environment text,
  p_label       text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into observer.project_sources
    (account_id, project_id, source_type, environment, display_label)
  select p.account_id, p.project_id, p_type, p_environment, p_label
  from observer.projects p
  where p.project_id = p_project
    and p.account_id = p_account
    and p.status     = 'active'
  returning source_id;
$$;

alter function public.observer_source_create(text, uuid, text, text, text)
  owner to observer_ingest_owner;

-- Suspend, resume and archive are one function, because they are one fact with
-- three values and three functions would be three places to forget the account
-- filter. The row count says whether anything moved.
create or replace function public.observer_source_set_state(
  p_account text,
  p_source  uuid,
  p_state   text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  if p_state not in ('active', 'suspended', 'archived') then
    raise exception 'unknown source state';
  end if;

  update observer.project_sources s
     set state      = p_state,
         updated_at = pg_catalog.now()
   where s.source_id  = p_source
     and s.account_id = p_account
     -- An archived source is terminal. Reviving one would resurrect a
     -- credential lifecycle that an operator deliberately ended.
     and s.state <> 'archived';

  get diagnostics moved = row_count;
  return moved = 1;
end;
$$;

alter function public.observer_source_set_state(text, uuid, text)
  owner to observer_ingest_owner;

-- What an operator screen may see. No credential material of any kind appears
-- here, and none can: this schema holds none. The credential tables arrive in
-- the next migration and expose their own, separate, metadata-only door.
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
    pg_catalog.to_char(s.last_seen_at   at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(s.last_ingest_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    s.observed_app_version,
    s.observed_plugin,
    s.observed_build_id,
    s.observed_environment,
    pg_catalog.to_char(s.created_at     at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  from observer.project_sources s
  where s.account_id = p_account
    and s.project_id = p_project
  order by s.created_at desc;
$$;

alter function public.observer_source_status(text, uuid)
  owner to observer_ingest_owner;

/* --- 6. row level security ------------------------------------------------ */

alter table observer.projects        enable row level security;
alter table observer.project_sources enable row level security;

-- No policies, deliberately, and this is the repository's established posture
-- rather than an omission. RLS with no policy denies every role that is not the
-- table owner, and the owner is a role nobody can log in as. The definer
-- functions run as that owner and are the only way in.
--
-- Worth stating plainly because a Supabase linter reports "RLS enabled, no
-- policy" as a finding: that is the control working, not a gap. See
-- `supabase/README.md`.

/* --- 7. grants ------------------------------------------------------------ */

revoke all on schema observer from public, anon, authenticated, service_role;

revoke all on observer.projects        from public, anon, authenticated, service_role;
revoke all on observer.project_sources from public, anon, authenticated, service_role;

-- EXECUTE is granted to PUBLIC on every new function by default. Revoked by
-- exact signature — an overload added later inherits nothing from these lines.
revoke all on function public.observer_project_create(text, text, text)
  from public, anon, authenticated;
revoke all on function public.observer_source_create(text, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.observer_source_set_state(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.observer_source_status(text, uuid)
  from public, anon, authenticated;

revoke all on function observer.refuse_project_move() from public, anon, authenticated, service_role;
revoke all on function observer.refuse_source_move()  from public, anon, authenticated, service_role;

-- Reachable is not public. Only the server's secret key, which authenticates as
-- `service_role`, may call these — and calling them is all it may do.
grant execute on function public.observer_project_create(text, text, text)      to service_role;
grant execute on function public.observer_source_create(text, uuid, text, text, text) to service_role;
grant execute on function public.observer_source_set_state(text, uuid, text)    to service_role;
grant execute on function public.observer_source_status(text, uuid)             to service_role;

notify pgrst, 'reload schema';
