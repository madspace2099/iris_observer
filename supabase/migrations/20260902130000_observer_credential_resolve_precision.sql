-- The one facade the precision fix missed, and it was the one on the hot path.
--
-- `20260902120000` raised four read facades to millisecond instants and left
-- `observer_credential_resolve` at seconds. That is the function every
-- authenticated request calls, and `expires_at` is the field it reads to decide
-- whether a credential is still live.
--
-- The practical effect is small and worth stating rather than dressing up: V1
-- issues credentials with a null expiry, and where an expiry does exist it is
-- measured in months, so a comparison rounded down to the second could accept a
-- credential at most 999ms past its expiry. Nobody is exploiting that.
--
-- It is fixed because of the claim it falsifies. `db.ts` now documents that the
-- facades render every instant as millisecond ISO-8601, and a docblock that is
-- true of four functions and false of the fifth is the same class of defect as
-- the `last_ingest_at` comment that promised a writer there was none of — a
-- statement a reader has no reason to doubt and every reason to rely on.
--
-- Found by a reviewer reading the migration against the port rather than by a
-- test, which is worth recording: the suite would have gone on passing, because
-- nothing asserts the precision of a value nothing compares.
--
-- Mechanically extracted and substituted, like its predecessor, so a
-- transcription slip cannot be what breaks it.

create or replace function public.observer_credential_resolve(p_selector text)
returns table (
  verifier          text,
  credential_state  text,
  expires_at        text,
  source_id         uuid,
  account_id        text,
  project_id        uuid,
  environment       text,
  display_label     text,
  source_state      text
)
language sql
security definer
set search_path = ''
as $$
  select
    c.verifier,
    c.state,
    pg_catalog.to_char(c.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    s.source_id,
    s.account_id,
    s.project_id,
    s.environment,
    s.display_label,
    s.state
  from observer.source_credentials c
  join observer.project_sources s on s.source_id = c.source_id
  where c.selector = p_selector;
$$;
alter function public.observer_credential_resolve(text)
  owner to observer_ingest_owner;
