-- IRIS Observer — the owner-role window is closed.
--
-- WINDOW-CLOSED CHECK. Run it LAST, after the four steps in
-- `docs/18-deployment.md`, "Owner roles, and the window on `public`":
-- `observer-role-prerequisite.sql` opens the window, the migrations are applied,
-- the operator revokes, and this file confirms. It reads and writes nothing
-- else.
--
-- Target project : IRIS OBSERVER  (ref tfcchobwobpadenampyh)
--
-- It raises an exception while any of the three owner roles can still create in
-- schema `public`, and answers in one line when none can. Applying the
-- migrations is not finished until it passes.
--
-- ## Why the window has to close
--
-- `public` is the schema PostgREST serves, and the owner roles run the code
-- behind 61 `security definer` façades. A standing CREATE there would let a flaw
-- in any one of them add a new callable object to the API. Ownership does not
-- need it after the transfer: a façade keeps its owner, and keeps answering,
-- once CREATE is revoked.
--
-- ## What counts as open
--
-- `has_schema_privilege`, not the text of the ACL, so a grant made to PUBLIC
-- counts as well as one made to the role itself. A role that does not exist
-- fails too: then the prerequisite has not run here, and there is nothing this
-- file can confirm.
--
-- The closing line repeats the test instead of trusting the block above it, so a
-- client that carries on after an error — psql without ON_ERROR_STOP — prints
-- nothing rather than CLOSED.

do $$
declare
  v_owners constant text[] :=
    array['observer_budget_owner', 'observer_credentials_owner', 'observer_ingest_owner'];
  v_missing text;
  v_open    text;
begin
  select string_agg(o, ', ' order by o) into v_missing
    from unnest(v_owners) as o
   where not exists (select 1 from pg_catalog.pg_roles r where r.rolname = o);
  if v_missing is not null then
    raise exception 'observer role window: cannot be checked — missing role(s): %', v_missing
      using hint = 'Run supabase/prerequisites/observer-role-prerequisite.sql and the migrations first.';
  end if;

  select string_agg(r.rolname, ', ' order by r.rolname) into v_open
    from pg_catalog.pg_roles r
   where r.rolname = any (v_owners)
     and has_schema_privilege(r.oid, 'public', 'CREATE');
  if v_open is not null then
    raise exception 'observer role window: OPEN — % can still create in schema public', v_open
      using hint = 'Run the revoke in docs/18-deployment.md, "Owner roles, and the window on public", then run this file again.';
  end if;
end;
$$;

select 'observer role window: CLOSED — no owner role can create in schema public' as observer_role_window
 where (select count(*)
          from pg_catalog.pg_roles r
         where r.rolname in ('observer_budget_owner', 'observer_credentials_owner', 'observer_ingest_owner')
           and not has_schema_privilege(r.oid, 'public', 'CREATE')) = 3;
