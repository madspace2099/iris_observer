-- Observer — the append-only analytics event store.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
--
-- Executed on every test run by `supabase/test/analytics-events.test.ts`.
-- Applying it to a hosted project remains an open deployment prerequisite.
--
-- ## Uniqueness is `(source_id, event_id)`, never `event_id` alone
--
-- This is the single most consequential line in the file, and getting it wrong
-- is not a performance mistake but a security one.
--
-- A global unique index on `event_id` would make one installation's replay
-- collide with another's first submission. The second source would be told
-- `duplicate` for an event it had never sent — which is an **existence oracle**:
-- by submitting a guessed identifier, any source could learn whether some other
-- source, in some other account, had already stored it. Deduplication scoped to
-- the source keeps the collision domain to one installation, where it belongs.
--
-- It is also simply correct. Two showrooms independently minting the same
-- `FGuid` is astronomically unlikely but perfectly legitimate; neither has done
-- anything wrong, and neither should lose an event to the other.
--
-- ## Append-only, enforced three ways
--
-- Grants deny UPDATE and DELETE. A trigger raises on either. And the definer
-- function offers no path to them. Three, because each fails differently: a
-- grant is silently widened by a later `grant all`, a trigger is dropped by a
-- migration that recreates the table, and a function is the only one a reviewer
-- reads. ADR-0001 makes projections rebuildable from raw events, which is only
-- true if the raw events never change underneath them.
--
-- ## What this file deliberately does NOT do
--
-- No retention, no deletion, no TTL. `O-01` and `O-02` are open, and they are
-- coupled in a way worth stating: **idempotency retention must be resolved
-- before an accepted event may ever be deleted.** Delete a stored event and its
-- `(source_id, event_id)` becomes free again, so a client replaying its outbox
-- after a long offline period would have that event accepted a second time and
-- counted twice. Whatever remembers the identifier has to outlive the row.

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

/* --- 2. the table --------------------------------------------------------- */

create table if not exists observer.analytics_events (
  -- SERVER-DERIVED, all three. A client sends none of them and every envelope
  -- refuses them; they are read from the credential's source row.
  source_id       uuid        not null,
  account_id      text        not null,
  project_id      uuid        not null,

  -- The client's own identifier, preserved exactly. Canonical lowercase
  -- 8-4-4-4-12, which is what makes native `uuid` storage identity-preserving:
  -- an uppercase value would round-trip altered and never pair with its outbox
  -- entry again.
  event_id        uuid        not null,

  event_name      text        not null,
  schema_version  integer     not null,

  -- What the client says happened, never silently corrected.
  occurred_at     timestamptz not null,
  -- What the server observed. Assigned here; a client cannot supply it.
  ingested_at     timestamptz not null default now(),

  -- Null exactly together: an event either belongs to a session with a position
  -- in it, or to no session at all. `sequence` starts at 1, because the UE
  -- subsystem resets to 0 and stamps the first emitted event with 1 — so a 0 on
  -- the wire means a counter was read before it was incremented.
  session_id      uuid,
  sequence        integer,

  -- Which build produced THIS event, as opposed to which build the source runs
  -- now. After a release that difference is the whole story.
  app_version     text        not null,
  app_plugin      text        not null,
  app_build_id    text        not null,
  -- REPORTED, never authoritative. The source row's environment is the one a
  -- read model groups by; this is kept for provenance and for spotting a
  -- development build that believes it is in production.
  app_environment text        not null,

  agent_id        text,
  visitor_subject text,
  entity_type     text,
  entity_id       text,

  properties      jsonb       not null default '{}'::jsonb,

  -- THE IDEMPOTENCY IDENTITY. Source-scoped, deliberately. See the header.
  constraint analytics_events_pkey primary key (source_id, event_id),

  constraint analytics_events_source_fkey
    foreign key (source_id) references observer.project_sources (source_id),
  constraint analytics_events_schema_version_sane
    check (schema_version between 1 and 4096),
  constraint analytics_events_sequence_positive
    check (sequence is null or sequence >= 1),
  constraint analytics_events_session_coherent
    check ((session_id is null) = (sequence is null)),
  constraint analytics_events_entity_coherent
    check ((entity_type is null) = (entity_id is null)),
  constraint analytics_events_properties_is_object
    check (jsonb_typeof(properties) = 'object')
);

alter table observer.analytics_events owner to observer_ingest_owner;

comment on table observer.analytics_events is
  'Append-only analytics facts. Unique on (source_id, event_id) — never on event_id alone, which would be a cross-source existence oracle.';

-- Reading is always by source and time. Nothing queries globally by event_id,
-- and an index that allowed it would invite the global-dedup mistake back.
create index if not exists analytics_events_source_time
  on observer.analytics_events (source_id, occurred_at desc);
create index if not exists analytics_events_project_time
  on observer.analytics_events (project_id, occurred_at desc);
create index if not exists analytics_events_session
  on observer.analytics_events (source_id, session_id, sequence)
  where session_id is not null;

/* --- 3. append-only ------------------------------------------------------- */

create or replace function observer.refuse_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'analytics_events is append-only: % is not permitted', pg_catalog.upper(tg_op);
end;
$$;

alter function observer.refuse_event_mutation() owner to observer_ingest_owner;

drop trigger if exists analytics_events_no_update on observer.analytics_events;
create trigger analytics_events_no_update
  before update on observer.analytics_events
  for each row execute function observer.refuse_event_mutation();

drop trigger if exists analytics_events_no_delete on observer.analytics_events;
create trigger analytics_events_no_delete
  before delete on observer.analytics_events
  for each row execute function observer.refuse_event_mutation();

/* --- 4. the door ---------------------------------------------------------- */

-- APPEND A BATCH, AND SAY WHAT HAPPENED TO EACH EVENT.
--
-- One statement for the whole batch, and one result per submitted event in
-- submission order. The ordinality carried through from `jsonb_array_elements`
-- is what guarantees the order rather than a hope about how PostgreSQL returns
-- rows.
--
-- ## The identity a client sent is not read
--
-- `p_source` comes from the authenticated credential. Account and project are
-- looked up FROM that source row, so a `properties` key called `project_id`, or
-- an `entity` naming another account, changes nothing about where the event is
-- stored. The insert does not read those fields at all.
--
-- ## Duplicates inside one batch
--
-- `on conflict do nothing` handles a replay against stored rows, but a batch
-- containing the same `event_id` twice needs more: without the `occurrence`
-- rank below, the left join would mark BOTH copies accepted, which is the
-- "conflicting duplicate results for one input event" the contract forbids.
-- Only the first occurrence may be accepted; a later one is a duplicate of the
-- earlier one in its own batch.
--
-- ## First write wins
--
-- `do nothing`, not `do update`. A replayed event whose properties differ —
-- because a client rebuilt a payload — must not rewrite the fact already
-- stored. The first accepted version is the fact; ADR-0001 needs it to stay
-- that way for a projection to be rebuildable.
create or replace function public.observer_events_append(
  p_source uuid,
  p_events jsonb
)
returns table (ordinal integer, event_id uuid, outcome text)
language sql
security definer
set search_path = ''
as $$
  with submitted as (
    select
      ord::integer                                as ordinal,
      (e->>'event_id')::uuid                      as event_id,
      e->>'event_name'                            as event_name,
      (e->>'schema_version')::integer             as schema_version,
      (e->>'occurred_at')::timestamptz            as occurred_at,
      nullif(e->>'session_id', '')::uuid          as session_id,
      nullif(e->>'sequence', '')::integer         as sequence,
      e#>>'{app,version}'                         as app_version,
      e#>>'{app,plugin}'                          as app_plugin,
      e#>>'{app,build_id}'                        as app_build_id,
      e#>>'{app,environment}'                     as app_environment,
      nullif(e->>'agent_id', '')                  as agent_id,
      nullif(e->>'visitor_subject', '')           as visitor_subject,
      e#>>'{entity,type}'                         as entity_type,
      e#>>'{entity,id}'                           as entity_id,
      coalesce(e->'properties', '{}'::jsonb)      as properties
    from pg_catalog.jsonb_array_elements(p_events) with ordinality as t(e, ord)
  ),
  ranked as (
    select
      s.*,
      pg_catalog.row_number() over (partition by s.event_id order by s.ordinal) as occurrence
    from submitted s
  ),
  owner_row as (
    select ps.source_id, ps.account_id, ps.project_id
    from observer.project_sources ps
    where ps.source_id = p_source
  ),
  inserted as (
    insert into observer.analytics_events (
      source_id, account_id, project_id,
      event_id, event_name, schema_version, occurred_at,
      session_id, sequence,
      app_version, app_plugin, app_build_id, app_environment,
      agent_id, visitor_subject, entity_type, entity_id, properties
    )
    select
      o.source_id, o.account_id, o.project_id,
      r.event_id, r.event_name, r.schema_version, r.occurred_at,
      r.session_id, r.sequence,
      r.app_version, r.app_plugin, r.app_build_id, r.app_environment,
      r.agent_id, r.visitor_subject, r.entity_type, r.entity_id, r.properties
    from ranked r
    cross join owner_row o
    where r.occurrence = 1
    on conflict (source_id, event_id) do nothing
    returning analytics_events.event_id
  )
  select
    r.ordinal,
    r.event_id,
    case when r.occurrence = 1 and i.event_id is not null then 'accepted' else 'duplicate' end
  from ranked r
  left join inserted i on i.event_id = r.event_id
  order by r.ordinal;
$$;

alter function public.observer_events_append(uuid, jsonb)
  owner to observer_ingest_owner;

-- What a read model and the E2E proof need: the stored fact, by source.
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
    pg_catalog.to_char(e.occurred_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(e.ingested_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
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

/* --- 5. row level security and grants ------------------------------------- */

alter table observer.analytics_events enable row level security;

revoke all on schema observer from public, anon, authenticated, service_role;
revoke all on observer.analytics_events from public, anon, authenticated, service_role;

revoke all on function public.observer_events_append(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.observer_events_for_source(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function observer.refuse_event_mutation()
  from public, anon, authenticated, service_role;

grant execute on function public.observer_events_append(uuid, jsonb)               to service_role;
grant execute on function public.observer_events_for_source(text, uuid, integer)   to service_role;

notify pgrst, 'reload schema';
