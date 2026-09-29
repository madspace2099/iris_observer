-- IRIS Observer — owner-role prerequisite.
--
-- ROLE PREREQUISITE PHASE. This file OPENS A WINDOW; it does not set a state.
--
-- Run it BEFORE `20260829173000_observer_account_credentials.sql`, the first
-- migration that hands what it builds to a private owner role. Then apply the
-- migrations, then close the window — the revoke is an operator step in
-- `docs/18-deployment.md`, "Owner roles, and the window on `public`" — and then
-- run `supabase/prerequisites/observer-role-window-closed.sql`, which raises an
-- exception for as long as the window is open. Applying the migrations is not
-- finished until that file passes. Running this one twice is harmless: every
-- statement is either guarded or re-grants what is already granted.
--
-- Target project : IRIS OBSERVER  (ref tfcchobwobpadenampyh)
--
-- ## The defect it answers
--
-- From `20260829173000` on, fourteen migrations give what they build to one of
-- three NOLOGIN owner roles: `alter table … owner to observer_credentials_owner`.
-- On this project they run as `postgres`, which is NOT a superuser — measured on
-- 2026-09-24: LOGIN, INHERIT, CREATEROLE, CREATEDB, REPLICATION, BYPASSRLS, no
-- SUPERUSER, and `createrole_self_grant` empty. Since PostgreSQL 16 a role
-- created that way is granted to its creator with ADMIN OPTION alone, and
-- `… OWNER TO` demands two things a superuser is excused from: the caller must
-- be able to SET ROLE to the new owner, and the new owner must hold CREATE on
-- the object's schema — `observer` for the tables, `public` for the façades.
-- Without this file the first transfer stops the migration:
--
--   ERROR:  must be able to SET ROLE "observer_credentials_owner"
--
-- The test suite never met it, because PGlite applies every migration as a
-- superuser.
--
-- ## Why the membership is not a weakening
--
-- `postgres` already controls everything on a Supabase project. It owns the
-- database and the `observer` schema, it creates these roles, and creating them
-- hands it ADMIN OPTION, with which it may grant itself this membership whenever
-- it likes. The grant adds nothing it could not take; it says out loud what is
-- already true. Without it, `postgres` cannot make another role the owner of a
-- table it has just created itself.
--
-- SET is what `… OWNER TO` checks. INHERIT is needed as well, because a
-- migration keeps working on what it has just handed over: the comment, the
-- index, the trigger, row level security, the revokes and the grants are all
-- owner's work.
--
-- The owner roles gain nothing they can use. They stay NOLOGIN and NOINHERIT
-- with no password; the only ways to act as one are `set role` from `postgres`
-- and the `security definer` functions it owns, and both existed before. CREATE
-- on `observer` is the condition PostgreSQL places on owning an object there —
-- `postgres`, the schema's owner, could create those objects anyway. The
-- membership and CREATE on `observer` stay.
--
-- ## Why CREATE on `public` is a window and not a state
--
-- `public` is the schema PostgREST serves, and the owner roles run the code
-- behind 61 `security definer` façades. A standing CREATE there would let a flaw
-- in any one of them add a new callable object to the API — that is a real
-- widening, not a statement of what `postgres` could already do. `… OWNER TO`
-- checks it only at the moment of the transfer: a façade keeps its owner, and
-- keeps answering, once the grant is revoked. So this file opens the window, the
-- operator closes it after the migrations, and
-- `observer-role-window-closed.sql` proves it closed.
--
-- The window is needed again whenever a migration recreates its façades —
-- `20260917100000` and `20260918100000` apply over themselves: open, apply,
-- close, check. The revoke is deliberately not in this file: the prerequisite
-- opens, it does not close.
--
-- ## Why this is not a migration
--
-- It is about who runs the migrations, not about Observer's schema. A superuser
-- runner — PGlite in the test suite, a local control plane — needs none of it; a
-- hosted project's `postgres` needs all of it. The migrations stay as reviewed.
--
-- ## Provenance
--
-- The three role definitions are copied, attribute for attribute, from the
-- migrations that create them:
--
--   observer_credentials_owner  20260829173000_observer_account_credentials.sql:76
--   observer_budget_owner       20260830090000_observer_models_and_budget.sql:74
--   observer_ingest_owner       20260902090000_observer_source_identity_spine.sql:67
--     (declared again, identically, in 20260902093000:58, 20260902100000:47,
--      20260902110000:69, 20260907100000:56 and 20260907180000:37)
--
-- Every one is `nologin noinherit` behind the same `if not exists` guard, so
-- whichever runs first — this file or a migration — creates the same role.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_credentials_owner') then
    create role observer_credentials_owner nologin noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_budget_owner') then
    create role observer_budget_owner nologin noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_ingest_owner') then
    create role observer_ingest_owner nologin noinherit;
  end if;
end;
$$;

grant observer_credentials_owner to postgres with inherit true, set true;
grant observer_budget_owner      to postgres with inherit true, set true;
grant observer_ingest_owner      to postgres with inherit true, set true;

-- The migrations create the schema as well; saying it here lets this file run
-- first on an empty project.
create schema if not exists observer;

-- Stays.
grant create on schema observer
  to observer_credentials_owner, observer_budget_owner, observer_ingest_owner;

-- THE WINDOW. Closed by the operator after the migrations; checked by
-- observer-role-window-closed.sql.
grant create on schema public
  to observer_credentials_owner, observer_budget_owner, observer_ingest_owner;

-- Confirm before moving on. Expect three rows, every column true — the last one
-- says the window is open, which is what the migrations need.
select r.rolname,
       not r.rolcanlogin and not r.rolinherit             as nologin_noinherit,
       pg_has_role('postgres', r.oid, 'SET')              as postgres_can_set_role,
       pg_has_role('postgres', r.oid, 'USAGE')            as postgres_inherits,
       has_schema_privilege(r.oid, 'observer', 'CREATE')  as can_create_in_observer,
       has_schema_privilege(r.oid, 'public', 'CREATE')    as window_open_on_public
  from pg_catalog.pg_roles r
 where r.rolname in ('observer_credentials_owner', 'observer_budget_owner', 'observer_ingest_owner')
 order by r.rolname;
