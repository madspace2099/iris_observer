-- THE READ THE DASHBOARD WAS MISSING.
--
-- `observer_events_for_source` exists for the operations screen and the E2E
-- proof: newest first, one source, capped at a thousand, and without the
-- identity the envelope carried. Nothing in the product could turn stored
-- events back into sessions, so a showroom that activated and ingested
-- correctly still showed nothing on Sales Flow, Project or Sales Agents.
--
-- This is that read: the session-scoped events of one PROJECT, across all of
-- its sources, with `agent_id`, `visitor_subject` and the entity — the columns
-- `analytics_events` has always stored and no facade returned.
--
-- ## A new function, not a wider old one
--
-- Adding columns to `observer_events_for_source` means changing its return
-- type, which `create or replace` refuses. The local control plane re-applies
-- every migration on every start (`apps/web/src/lib/sources/local-db.ts`), so
-- the ORIGINAL definition would then fail against the altered function on the
-- second start. A new name costs one facade and breaks nothing.
--
-- ## What it leaves out, deliberately
--
--   - `diagnostic.%` — `READ_MODEL_EXCLUSION_RULE` in the contracts, applied
--     here so no caller can forget it;
--   - events with no session — a read model folds sessions, and an event that
--     belongs to none has nothing to fold into.
--
-- ## One page at a time, behind a cursor
--
-- PostgREST caps a response at its `max-rows` (1000 on Supabase, lower if an
-- operator says so) and says nothing when it cuts one short. A facade that
-- answered a whole project would work on PGlite and silently lose most of a busy
-- project on the hosted database, its newest meetings first. So this answers a
-- page, and the caller pages until a page comes back empty
-- (`readProjectEvents` in `packages/sources`), which is right whatever the cap.
--
-- The cursor is a KEYSET, not an offset and not a timestamp:
--
--   - `(ingested_at, source_id, event_id)` is unique, so a strict `>` neither
--     repeats a row nor skips one. `ingested_at` alone is not: every event of a
--     batch carries the same `now()`.
--   - it is returned as one opaque text column with MICROSECOND precision and
--     handed back verbatim. The port's instants are formatted to the millisecond;
--     a cursor rebuilt from one would sit before rows it had already returned.
--   - arrival order is what makes paging safe on an append-only store: a row
--     ingested during the read lands after the cursor, never inside a page
--     already taken. The fold orders each session by `sequence` itself.
--
-- ## Dropped first, on purpose
--
-- The first version of this file (never applied anywhere shared) returned
-- thirteen columns and no cursor. `create or replace` cannot change a return
-- type, and a desk that ran that version would fail to start on this one. The
-- function has no dependants, so dropping it is free, and it makes the file
-- idempotent against either predecessor.
--
-- ponytail: folded in TypeScript at read time. When a project outgrows that,
-- materialise sessions at ingest — the fold in
-- `packages/connectors/src/ue5-events.ts` is already pure.

drop function if exists public.observer_events_for_project(text, uuid, text, integer);

create function public.observer_events_for_project(
  p_account text,
  p_project uuid,
  p_after   text,
  p_limit   integer
)
returns table (
  source_id       uuid,
  event_id        uuid,
  event_name      text,
  schema_version  integer,
  occurred_at     text,
  ingested_at     text,
  session_id      uuid,
  sequence        integer,
  agent_id        text,
  visitor_subject text,
  entity_type     text,
  entity_id       text,
  properties      jsonb,
  page_cursor     text
)
language sql
security definer
set search_path = ''
as $$
  select
    e.source_id, e.event_id, e.event_name, e.schema_version,
    pg_catalog.to_char(e.occurred_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    pg_catalog.to_char(e.ingested_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    e.session_id, e.sequence, e.agent_id, e.visitor_subject, e.entity_type, e.entity_id,
    e.properties,
    pg_catalog.to_char(e.ingested_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      || '|' || e.source_id::text || '|' || e.event_id::text
  from observer.analytics_events e
  where e.account_id = p_account
    and e.project_id = p_project
    and e.session_id is not null
    and e.event_name not like 'diagnostic.%'
    and (
      p_after is null
      or (e.ingested_at, e.source_id, e.event_id) > (
        pg_catalog.split_part(p_after, '|', 1)::pg_catalog.timestamptz,
        pg_catalog.split_part(p_after, '|', 2)::pg_catalog.uuid,
        pg_catalog.split_part(p_after, '|', 3)::pg_catalog.uuid
      )
    )
  order by e.ingested_at, e.source_id, e.event_id
  limit least(greatest(p_limit, 1), 1000);
$$;
alter function public.observer_events_for_project(text, uuid, text, integer)
  owner to observer_ingest_owner;

revoke all on function public.observer_events_for_project(text, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.observer_events_for_project(text, uuid, text, integer)
  to service_role;

notify pgrst, 'reload schema';
