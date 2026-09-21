-- The read that lets an operator see a project by its name.
--
-- Every facade so far takes a project id and answers about what is inside it.
-- Nothing answers "which projects does this account have", and the omission had
-- two consequences that only became visible once a screen existed:
--
--   1. The operations screen could render a project's UUID and nothing else. A
--      name is display metadata the spine already stores; there was simply no
--      door to read it through, so the screen either showed the identifier or
--      invented a label — and inventing one is fabricated data on a surface
--      whose whole purpose is to report what is really there.
--
--   2. A project holding NO sources was invisible to every read this layer had,
--      because the only account-wide facade (`observer_source_operations`)
--      enumerates sources. That is exactly the state left behind if a process
--      dies between creating a project and creating its first source, and it
--      forced a file-based ledger to remember the id.
--
-- One `security definer` facade removes both. Account-scoped like every other
-- door in this schema, ordered by most recent activity because that is the
-- order an operations list wants, and carrying the source rollups the list
-- would otherwise compute with one query per project.
--
-- Instants are rendered at millisecond precision, matching `20260902120000`.
--
-- Note on `greatest`: it is bare rather than schema-qualified, unlike every
-- other call here. It is a SQL construct rather than a function, so
-- `pg_catalog.greatest` does not resolve and the first version of this file
-- failed with "function pg_catalog.greatest(...) does not exist" on the empty
-- search_path. Qualifying everything is the right habit; this is the exception
-- the habit does not cover.

create or replace function public.observer_projects_for_account(p_account text)
returns table (
  project_id            uuid,
  name                  text,
  slug                  text,
  status                text,
  created_at            text,
  source_count          bigint,
  connected_count       bigint,
  verified_count        bigint,
  last_activity_at      text
)
language sql
security definer
set search_path = ''
as $$
  select
    p.project_id,
    p.name,
    p.slug,
    p.status,
    pg_catalog.to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    /*
     * Counted with FILTER rather than with three correlated subqueries: one pass
     * over the sources of one account, and the three numbers cannot disagree
     * with each other because they come from the same scan.
     *
     * `count(s.source_id)` rather than `count(*)`, so a project with no sources
     * counts zero instead of one — the left join's null row is exactly the case
     * this facade was added to make visible, and `count(*)` would have hidden it
     * behind a plausible-looking 1.
     */
    pg_catalog.count(s.source_id),
    pg_catalog.count(o.last_heartbeat_at) filter (where o.last_heartbeat_at is not null),
    pg_catalog.count(o.ingestion_verified_at) filter (where o.ingestion_verified_at is not null),
    pg_catalog.to_char(
      pg_catalog.max(
        greatest(s.last_seen_at, s.last_ingest_at, o.last_heartbeat_at)
      ) at time zone 'utc',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
  from observer.projects p
  left join observer.project_sources s
    on s.project_id = p.project_id
   and s.account_id = p.account_id
  left join observer.source_operations o
    on o.source_id = s.source_id
  where p.account_id = p_account
  group by p.project_id, p.name, p.slug, p.status, p.created_at
  /*
   * Nulls last, so a project that has never been heard from sorts below the
   * live ones rather than above them. A brand-new project at the top of an
   * operations list every time somebody creates one is noise, not news.
   */
  order by pg_catalog.max(
    greatest(s.last_seen_at, s.last_ingest_at, o.last_heartbeat_at)
  ) desc nulls last, p.created_at desc;
$$;

alter function public.observer_projects_for_account(text)
  owner to observer_ingest_owner;

comment on function public.observer_projects_for_account(text) is
  'Every project an account holds, with its source rollups. The only door that can see a project holding no sources.';

revoke all on function public.observer_projects_for_account(text)
  from public, anon, authenticated, service_role;

grant execute on function public.observer_projects_for_account(text) to service_role;
