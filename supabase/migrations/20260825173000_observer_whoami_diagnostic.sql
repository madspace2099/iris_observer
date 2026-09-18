-- Which role is a caller actually using?
--
-- The shared ceiling failed five times with five different causes, and the last
-- one could not be diagnosed from outside at all. PostgREST answers PGRST202
-- for a role that cannot match a function, and the three roles it can assume —
-- anon, authenticated, service_role — are indistinguishable in that response.
-- A publishable key in the wrong variable and a genuine secret key with a
-- missing grant produce the identical 404.
--
-- This function returns the caller's own role and nothing else. It is
-- deliberately **not** `security definer`: running as the caller is the entire
-- point. It exposes no data, no schema and no configuration — `current_user` is
-- a fact the caller already knows about itself and cannot use to reach anything.
--
-- It earned its place. Calling it is what proved the deployment was talking to a
-- different Supabase project entirely: it answered 200 to a call made with this
-- project's publishable key and 404 to the deployment's, and both can only be
-- true of two different PostgREST instances.
create or replace function public.observer_whoami()
returns table (effective_role text, session_role text)
language sql
stable
as $$
  select current_user::text, current_setting('role', true);
$$;

comment on function public.observer_whoami() is
  'Diagnostic. Returns the caller''s own role so a misconfigured key can be identified without guessing.';

-- Granted to every role PostgREST can assume, because the question is "which of
-- you am I" and any of them must be able to answer it.
grant execute on function public.observer_whoami() to anon, authenticated, service_role;
