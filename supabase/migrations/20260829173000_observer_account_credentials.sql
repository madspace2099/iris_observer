-- Observer — per-account provider credentials, encrypted by the application.
--
-- **Forward-only. EXECUTED, but NOT APPLIED to any deployment.**
--
-- No Supabase project was contacted while this was written. It IS executed on
-- every test run, against PGlite — PostgreSQL compiled to WASM, with a real
-- catalogue and a real permission system — by
-- `supabase/test/credential-grants.test.ts`, which creates the three Supabase
-- roles and then asks PostgreSQL itself who can do what:
-- `has_table_privilege`, `has_function_privilege`, and statements attempted
-- under `set role`. That is how the missing `grant usage on schema observer`
-- below was found: every definer function failed with "permission denied for
-- schema observer", which no amount of reading had caught.
--
-- What that still does not prove is that a hosted Supabase project matches.
-- The roles there are the platform's, PostgREST sits in front, and nothing here
-- has touched it. **Applying this migration to the real project and running the
-- verifier remains an open deployment prerequisite**, and no test in this
-- repository should be read as having closed it.
--
-- ## What this stores, and what it deliberately cannot
--
-- One row per (account, provider). The row holds a sealed payload — nonce,
-- ciphertext, authentication tag, key version — and the metadata a settings
-- screen renders. It does NOT hold the key, and nothing in this file can
-- produce one: the master key lives in the application's environment, never in
-- the database, so a full dump of this table is a pile of AES-256-GCM
-- ciphertexts bound to account identifiers and is worth nothing without a
-- secret PostgreSQL has never seen.
--
-- That separation is the whole design. `pgcrypto` inside the database would put
-- the key and the ciphertext under the same compromise.
--
-- ## The privilege model
--
-- A private, NOLOGIN role owns the tables and the functions. Nobody can
-- authenticate as it and it is granted to nobody, so its privileges are
-- reachable only by calling one of the five `security definer` functions —
-- which is the definition of "these tables have exactly one door".
--
--   observer_credentials_owner   NOLOGIN. Owns both tables and all five
--                                functions. No password, no membership.
--   service_role                 EXECUTE on the five functions. Nothing else:
--                                no schema usage, no table privilege, not one
--                                column. This is the role the server's secret
--                                key authenticates as.
--   anon, authenticated          nothing at all. A browser holding the
--                                publishable key cannot select, insert,
--                                update, delete or execute anything here.
--   PUBLIC                       revoked explicitly on every function, by
--                                exact signature, because PostgreSQL grants
--                                EXECUTE to PUBLIC on new functions by default
--                                and a missed revoke is an open door.
--
-- `security definer` is necessary here and is not used anywhere it is not: the
-- callable role holds no table privilege by design, so an invoker-rights
-- function would simply fail. Each carries `set search_path = ''` and names
-- every object fully qualified — there is no unqualified identifier in any
-- function body, no `search_path` to poison, and no dynamic SQL anywhere in
-- this file.
--
-- ## Account ownership is never taken from a browser
--
-- `p_account` is supplied by the Next.js server from the verified session
-- cookie, and the browser never reaches these functions to supply anything.
-- The database cannot check that on its own; what it does is make `account_id`
-- half the primary key and refuse to let an update move a row between accounts,
-- so a mistake upstream cannot quietly reassign a credential.

/* --- 1. the private owner ------------------------------------------------- */

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_credentials_owner') then
    -- NOLOGIN, NOINHERIT, no password. It exists to own objects, not to be used.
    create role observer_credentials_owner nologin noinherit;
  end if;
end;
$$;

create schema if not exists observer;

/* --- 2. the tables -------------------------------------------------------- */

create table if not exists observer.account_credentials (
  -- The authenticated account, from the server's verified session. Opaque to
  -- this schema: the account directory belongs to the application, and a
  -- foreign key here would tie the credential store to a table that does not
  -- exist yet.
  account_id        text        not null,
  provider          text        not null,

  -- The sealed payload. Base64 of the raw bytes: a bytea round-tripped through
  -- PostgREST arrives as a hex string, and the encoding argument is one more
  -- thing to get wrong at three in the morning.
  key_version       text        not null,
  nonce             text        not null,
  ciphertext        text        not null,
  auth_tag          text        not null,

  -- Not a secret. Four characters, so a person recognises their own key.
  last_four         text        not null,

  -- A monotonic write token minted by the application. Two replacements in
  -- flight can arrive in either order; without this the later-arriving but
  -- earlier-issued one wins and silently reinstates a superseded key.
  revision          bigint      not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_tested_at    timestamptz,
  last_test_outcome text,

  constraint account_credentials_pkey primary key (account_id, provider),
  constraint account_credentials_provider_known check (provider in ('openai')),
  constraint account_credentials_last_four_len check (char_length(last_four) = 4),
  constraint account_credentials_outcome_known
    check (last_test_outcome is null or last_test_outcome in ('passed', 'rejected', 'unavailable'))
);

alter table observer.account_credentials owner to observer_credentials_owner;

comment on table observer.account_credentials is
  'One encrypted provider credential per account. The decryption key is held by the application, never here.';

-- Four columns of fact and nothing else. No key, no ciphertext, no request
-- header, no provider response body — `category` is drawn from a closed
-- vocabulary defined in apps/web/src/lib/credentials/failure.ts, so a grep of
-- this table can only ever turn up one of those words.
create table if not exists observer.credential_audit (
  id         bigserial   primary key,
  account_id text        not null,
  provider   text        not null,
  action     text        not null,
  succeeded  boolean     not null,
  category   text        not null,
  at         timestamptz not null default now(),

  constraint credential_audit_action_known
    check (action in ('connected', 'tested', 'replaced', 'removed'))
);

alter table observer.credential_audit owner to observer_credentials_owner;
alter sequence observer.credential_audit_id_seq owner to observer_credentials_owner;

create index if not exists credential_audit_account_at
  on observer.credential_audit (account_id, at desc);

/* --- 3. an account may not be moved --------------------------------------- */
--
-- The primary key stops two rows sharing an account and provider. It does not
-- stop an UPDATE rewriting `account_id` on the row that is already there, which
-- is precisely the mistake that would hand one account's ciphertext to another.
-- The application binds the account into the GCM authentication tag so such a
-- row fails to decrypt; this makes it fail earlier and louder.

create or replace function observer.refuse_account_move()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.account_id is distinct from old.account_id
     or new.provider is distinct from old.provider then
    raise exception 'a credential may not be moved between accounts or providers';
  end if;
  return new;
end;
$$;

alter function observer.refuse_account_move() owner to observer_credentials_owner;

drop trigger if exists account_credentials_immutable_owner on observer.account_credentials;
create trigger account_credentials_immutable_owner
  before update on observer.account_credentials
  for each row execute function observer.refuse_account_move();

/* --- 4. the five doors ---------------------------------------------------- */
--
-- `security definer`, in `public`, owned by the private role. In `public`
-- because `observer` is not an exposed schema and PostgREST answers 406 for one
-- that is not; `security definer` because the calling role deliberately holds
-- no privilege on the tables. Each sets an empty `search_path` and qualifies
-- every object, so nothing here can be resolved to an attacker's table.

create or replace function public.observer_credential_read(
  p_account  text,
  p_provider text
)
returns table (
  account_id        text,
  provider          text,
  key_version       text,
  nonce             text,
  ciphertext        text,
  auth_tag          text,
  last_four         text,
  revision          bigint,
  created_at        text,
  updated_at        text,
  last_tested_at    text,
  last_test_outcome text
)
language sql
security definer
set search_path = ''
as $$
  select
    c.account_id,
    c.provider,
    c.key_version,
    c.nonce,
    c.ciphertext,
    c.auth_tag,
    c.last_four,
    c.revision,
    pg_catalog.to_char(c.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(c.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(c.last_tested_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    c.last_test_outcome
  from observer.account_credentials c
  where c.account_id = p_account
    and c.provider   = p_provider;
$$;

alter function public.observer_credential_read(text, text)
  owner to observer_credentials_owner;

-- One statement, so replacement is atomic, and guarded by `revision`, so a
-- late-arriving earlier write cannot reinstate the key it superseded.
--
-- `created_at` survives a replacement, so "connected since" keeps meaning what
-- it says. Delete-then-insert is not used: it has a window in which an account
-- that had a working credential has none, and a crash inside it destroys
-- something the reader cannot retype.
create or replace function public.observer_credential_upsert(
  p_account     text,
  p_provider    text,
  p_key_version text,
  p_nonce       text,
  p_ciphertext  text,
  p_auth_tag    text,
  p_last_four   text,
  p_revision    bigint
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into observer.account_credentials as c
    (account_id, provider, key_version, nonce, ciphertext, auth_tag, last_four,
     revision, created_at, updated_at, last_tested_at, last_test_outcome)
  values
    (p_account, p_provider, p_key_version, p_nonce, p_ciphertext, p_auth_tag, p_last_four,
     p_revision, pg_catalog.now(), pg_catalog.now(), pg_catalog.now(), 'passed')
  on conflict (account_id, provider) do update
    set key_version       = excluded.key_version,
        nonce             = excluded.nonce,
        ciphertext        = excluded.ciphertext,
        auth_tag          = excluded.auth_tag,
        last_four         = excluded.last_four,
        revision          = excluded.revision,
        updated_at        = pg_catalog.now(),
        last_tested_at    = pg_catalog.now(),
        last_test_outcome = 'passed'
    where excluded.revision > c.revision
  returning true;
$$;

alter function public.observer_credential_upsert(text, text, text, text, text, text, text, bigint)
  owner to observer_credentials_owner;

-- A delete, not a flag. A row marked inactive still holds the ciphertext.
create or replace function public.observer_credential_delete(
  p_account  text,
  p_provider text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from observer.account_credentials
   where account_id = p_account
     and provider   = p_provider;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

alter function public.observer_credential_delete(text, text)
  owner to observer_credentials_owner;

create or replace function public.observer_credential_record_test(
  p_account  text,
  p_provider text,
  p_outcome  text,
  p_at       timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  update observer.account_credentials
     set last_tested_at    = p_at,
         last_test_outcome = p_outcome
   where account_id = p_account
     and provider   = p_provider;
$$;

alter function public.observer_credential_record_test(text, text, text, timestamptz)
  owner to observer_credentials_owner;

create or replace function public.observer_credential_audit(
  p_account   text,
  p_provider  text,
  p_action    text,
  p_succeeded boolean,
  p_category  text,
  p_at        timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into observer.credential_audit
    (account_id, provider, action, succeeded, category, at)
  values
    (p_account, p_provider, p_action, p_succeeded, p_category, p_at);
$$;

alter function public.observer_credential_audit(text, text, text, boolean, text, timestamptz)
  owner to observer_credentials_owner;

/* --- 5. who may reach any of it ------------------------------------------- */

alter table observer.account_credentials enable row level security;
alter table observer.credential_audit    enable row level security;

-- No policies, deliberately. RLS with no policy denies every role that is not
-- the table owner, and the owner is a role nobody can log in as. The five
-- functions run as that owner and are the only way in.

-- Belt and braces on the schema and the tables. The browser roles were never
-- granted anything; this makes sure a default privilege somewhere cannot have
-- granted it for us.
revoke all on schema observer                from public, anon, authenticated, service_role;

-- The owner needs USAGE on a schema it does not own.
--
-- Found by executing this migration rather than by reading it: the schema
-- belongs to whoever created it in an earlier migration, so owning the tables
-- inside it grants the role nothing on the way in. Every definer function
-- failed with "permission denied for schema observer" — the tables were so
-- unreachable that the one role allowed to reach them could not.
grant usage on schema observer to observer_credentials_owner;
revoke all on observer.account_credentials   from public, anon, authenticated, service_role;
revoke all on observer.credential_audit      from public, anon, authenticated, service_role;
revoke all on sequence observer.credential_audit_id_seq
  from public, anon, authenticated, service_role;

-- EXECUTE is granted to PUBLIC on every new function by default. Revoked by
-- exact signature — an overload added later inherits nothing from these lines,
-- which is why the signatures are written out rather than using a bare name.
revoke all on function public.observer_credential_read(text, text)
  from public, anon, authenticated;
revoke all on function public.observer_credential_upsert(text, text, text, text, text, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.observer_credential_delete(text, text)
  from public, anon, authenticated;
revoke all on function public.observer_credential_record_test(text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.observer_credential_audit(text, text, text, boolean, text, timestamptz)
  from public, anon, authenticated;

revoke all on function observer.refuse_account_move() from public, anon, authenticated, service_role;

-- Reachable is not public. Only the server's secret key, which authenticates as
-- `service_role`, may call any of these — and calling them is all it may do.
grant execute on function public.observer_credential_read(text, text)
  to service_role;
grant execute on function public.observer_credential_upsert(text, text, text, text, text, text, text, bigint)
  to service_role;
grant execute on function public.observer_credential_delete(text, text)
  to service_role;
grant execute on function public.observer_credential_record_test(text, text, text, timestamptz)
  to service_role;
grant execute on function public.observer_credential_audit(text, text, text, boolean, text, timestamptz)
  to service_role;
