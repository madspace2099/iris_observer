-- Observer — one-time activation codes and source-scoped credentials.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
--
-- Executed on every test run by `supabase/test/activation-credential.test.ts`,
-- which creates the three Supabase roles and asks PostgreSQL who can do what.
-- Applying it to a hosted project remains an open deployment prerequisite.
--
-- ## Nothing here can produce a credential
--
-- Both tables hold a public `selector` and an HMAC `verifier`. Neither holds
-- plaintext, and no function in this file returns any: `packages/sources`
-- computes the verifier in the application, from a pepper the database has
-- never seen, and the plaintext is returned to its owner exactly once at
-- issuance and then discarded.
--
-- So a full dump of these tables lets an attacker check a guess and nothing
-- else. That is a deliberately different design from
-- `observer.account_credentials`, which stores a *reversible* AES-256-GCM
-- envelope because an OpenAI key has to be replayed to a vendor. Nothing ever
-- replays an activation code or a source token, so nothing here is recoverable.
--
-- ## A code is tied to a source that already exists
--
-- An operator creates the source first, then issues a code for it. The code
-- therefore never carries the identity it grants — it names a row, and the
-- server reads account, project and source from that row.
--
-- The alternative, where activation mints the source, was the reference mock's
-- shape and is not carried over. It makes the client's first request the thing
-- that creates a durable record, which means an unauthenticated caller with a
-- guessed code creates rows, and it leaves no moment at which an operator can
-- see and name the source before a machine claims it.
--
-- ## Consumption and issuance are one statement
--
-- `observer_activation_consume` is a single conditional UPDATE guarded by state
-- and expiry, with `returning`, in the shape `observer_usage_reserve` already
-- established: **decide and write together, then read the row count to learn
-- what happened.** A read-then-write would let twenty-five simultaneous
-- exchanges of the same code all observe `issued` and all proceed.
--
-- PGlite is a single connection and cannot issue two truly simultaneous
-- statements, so the concurrency suite proves what it can — that the statement
-- is atomic in shape, and that repeated sequential attempts yield exactly one
-- success — and the single-statement property is what makes the hosted case
-- follow. A `Promise.all` against one handle serialises and proves nothing;
-- see `audit-contract.test.ts:319`.

/* --- 1. the owner --------------------------------------------------------- */
--
-- The same role the spine created. One owner for the whole ingestion domain, so
-- there is one set of grants to get right rather than five.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_ingest_owner') then
    create role observer_ingest_owner nologin noinherit;
  end if;
end;
$$;

create schema if not exists observer;
grant usage on schema observer to observer_ingest_owner;

/* --- 2. activation codes -------------------------------------------------- */

create table if not exists observer.activation_codes (
  -- Public half of the code. Indexed, and the only thing a lookup touches.
  selector      text        not null,

  -- HMAC-SHA-256 over the domain, selector and secret, keyed by
  -- OBSERVER_ACTIVATION_CODE_PEPPER. The plaintext is not derivable from it.
  verifier      text        not null,

  -- Which source this code activates. The code carries no identity of its own.
  source_id     uuid        not null,

  -- `activation` for a source that has never been activated; `reactivation`
  -- for one being re-credentialled. Both are issued by an operator and consumed
  -- identically — the distinction is what the response says, and what the audit
  -- records, not a different code path a client can select.
  purpose       text        not null,

  state         text        not null default 'issued',

  -- Short-lived by construction. A code with no expiry is a permanent
  -- credential that looks like a temporary one.
  expires_at    timestamptz not null,

  created_at    timestamptz not null default now(),
  consumed_at   timestamptz,
  revoked_at    timestamptz,

  constraint activation_codes_pkey primary key (selector),
  constraint activation_codes_source_fkey
    foreign key (source_id) references observer.project_sources (source_id),
  constraint activation_codes_purpose_known
    check (purpose in ('activation', 'reactivation')),
  constraint activation_codes_state_known
    check (state in ('issued', 'consumed', 'expired', 'revoked')),
  -- A consumed code has a consumption time, and only a consumed one does.
  constraint activation_codes_consumed_coherent
    check ((state = 'consumed') = (consumed_at is not null)),
  constraint activation_codes_revoked_coherent
    check ((state = 'revoked') = (revoked_at is not null))
);

alter table observer.activation_codes owner to observer_ingest_owner;

comment on table observer.activation_codes is
  'One-time codes. Holds a public selector and an HMAC verifier; the plaintext exists only in the response that issued it.';

-- Issued codes for one source, which is what "does this source have a pending
-- code" asks. Partial, because consumed and expired rows are the majority and
-- nothing queries them by source.
create index if not exists activation_codes_pending
  on observer.activation_codes (source_id)
  where state = 'issued';

/* --- 3. source credentials ------------------------------------------------ */

create table if not exists observer.source_credentials (
  selector      text        not null,
  verifier      text        not null,
  source_id     uuid        not null,

  state         text        not null default 'active',

  -- NULLABLE, and null means no expiry. V1 has no mandatory credential expiry;
  -- the column exists so that adding one later is a policy change rather than a
  -- migration, and so the wire contract's nullable `token_expires_at` has
  -- something real to reflect.
  expires_at    timestamptz,

  created_at    timestamptz not null default now(),
  superseded_at timestamptz,
  revoked_at    timestamptz,

  constraint source_credentials_pkey primary key (selector),
  constraint source_credentials_source_fkey
    foreign key (source_id) references observer.project_sources (source_id),
  constraint source_credentials_state_known
    check (state in ('active', 'superseded', 'revoked')),
  constraint source_credentials_superseded_coherent
    check ((state = 'superseded') = (superseded_at is not null)),
  constraint source_credentials_revoked_coherent
    check ((state = 'revoked') = (revoked_at is not null))
);

alter table observer.source_credentials owner to observer_ingest_owner;

comment on table observer.source_credentials is
  'Source-scoped opaque credentials. One active per source, enforced by a partial unique index; superseded and revoked rows are kept as history.';

-- AT MOST ONE ACTIVE CREDENTIAL PER SOURCE, enforced by the database rather
-- than by the care of whoever writes the next rotation path.
--
-- A partial unique index rather than a constraint, because superseded rows must
-- be allowed to accumulate: they are how "when did this source last rotate"
-- gets answered, and deleting them would make a rotation indistinguishable from
-- a first activation.
create unique index if not exists source_credentials_one_active
  on observer.source_credentials (source_id)
  where state = 'active';

/* --- 4. the audit --------------------------------------------------------- */
--
-- Four columns of fact and a closed vocabulary. No selector, no verifier, no
-- plaintext, no request body — a grep of this table can only ever turn up one
-- of the words in the check constraint.

create table if not exists observer.source_audit (
  id         bigserial   primary key,
  source_id  uuid        not null,
  account_id text        not null,
  action     text        not null,
  succeeded  boolean     not null,
  at         timestamptz not null default now(),

  constraint source_audit_action_known
    check (action in (
      'source_created', 'code_issued', 'code_consumed', 'code_revoked',
      'credential_issued', 'credential_superseded', 'credential_revoked',
      'source_suspended', 'source_resumed', 'source_archived'
    ))
);

alter table observer.source_audit owner to observer_ingest_owner;
alter sequence observer.source_audit_id_seq owner to observer_ingest_owner;

create index if not exists source_audit_source_at
  on observer.source_audit (source_id, at desc);

/* --- 5. neither a code nor a credential may change hands ------------------ */

create or replace function observer.refuse_secret_move()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.selector is distinct from old.selector
     or new.source_id is distinct from old.source_id
     or new.verifier is distinct from old.verifier then
    raise exception 'a credential may not change its selector, verifier or source';
  end if;
  return new;
end;
$$;

alter function observer.refuse_secret_move() owner to observer_ingest_owner;

drop trigger if exists activation_codes_immutable on observer.activation_codes;
create trigger activation_codes_immutable
  before update on observer.activation_codes
  for each row execute function observer.refuse_secret_move();

drop trigger if exists source_credentials_immutable on observer.source_credentials;
create trigger source_credentials_immutable
  before update on observer.source_credentials
  for each row execute function observer.refuse_secret_move();

/* --- 6. the doors --------------------------------------------------------- */

-- Issue a code for a source the caller's account owns.
--
-- The account is verified against the source IN THE SAME STATEMENT, so a
-- caller cannot mint a code for somebody else's showroom by knowing its id.
create or replace function public.observer_activation_issue(
  p_account    text,
  p_source     uuid,
  p_selector   text,
  p_verifier   text,
  p_purpose    text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  written integer;
begin
  insert into observer.activation_codes (selector, verifier, source_id, purpose, expires_at)
  select p_selector, p_verifier, s.source_id, p_purpose, p_expires_at
  from observer.project_sources s
  where s.source_id  = p_source
    and s.account_id = p_account
    -- An archived source may not be re-credentialled. An operator who wants it
    -- back creates a new one, which is an explicit act with a new identity.
    and s.state in ('active', 'suspended');

  get diagnostics written = row_count;
  if written = 1 then
    insert into observer.source_audit (source_id, account_id, action, succeeded)
    values (p_source, p_account, 'code_issued', true);
  end if;
  return written = 1;
end;
$$;

alter function public.observer_activation_issue(text, uuid, text, text, text, timestamptz)
  owner to observer_ingest_owner;

-- CONSUME A CODE AND MINT A CREDENTIAL, ATOMICALLY.
--
-- The whole security property of activation lives in this function, and it
-- lives in the fact that the guard and the write are one statement.
--
-- The verifier is compared here rather than in the application because the
-- alternative — select the row, compare in TypeScript, then update — reopens
-- exactly the window this closes. The comparison itself is a plain `=` on a
-- 64-character hex digest, which is not constant-time; that is acceptable
-- precisely because the row was found by SELECTOR, so an attacker probing
-- timing learns only about a value they already supplied.
create or replace function public.observer_activation_consume(
  p_code_selector    text,
  p_code_verifier    text,
  p_cred_selector    text,
  p_cred_verifier    text,
  p_cred_expires_at  timestamptz
)
returns table (
  source_id     uuid,
  account_id    text,
  project_id    uuid,
  environment   text,
  display_label text,
  purpose       text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_source  uuid;
  claimed_purpose text;
  claimed_account text;
begin
  /*
   * ONE STATEMENT decides and writes. Twenty-five simultaneous callers all
   * issue this UPDATE; PostgreSQL serialises them on the row, the first sets
   * `consumed` and returns a row, and the other twenty-four match nothing
   * because `state = 'issued'` no longer holds.
   */
  update observer.activation_codes c
     set state       = 'consumed',
         consumed_at = pg_catalog.now()
   where c.selector   = p_code_selector
     and c.verifier   = p_code_verifier
     and c.state      = 'issued'
     and c.expires_at > pg_catalog.now()
  returning c.source_id, c.purpose into claimed_source, claimed_purpose;

  if claimed_source is null then
    return;  -- No row. The caller answers one indistinguishable failure.
  end if;

  /*
   * The source must still be eligible. Checked AFTER consumption rather than
   * before: a code presented against a suspended source is spent either way,
   * because leaving it live would let a caller poll a stolen code until an
   * operator happens to resume the source.
   */
  select s.account_id into claimed_account
  from observer.project_sources s
  where s.source_id = claimed_source
    and s.state     = 'active';

  if claimed_account is null then
    insert into observer.source_audit (source_id, account_id, action, succeeded)
    values (claimed_source, '', 'code_consumed', false);
    return;
  end if;

  -- Supersede whatever was active. Reactivation and first activation take the
  -- same path; there is simply nothing to supersede the first time.
  update observer.source_credentials
     set state = 'superseded', superseded_at = pg_catalog.now()
   where source_credentials.source_id = claimed_source
     and state = 'active';

  insert into observer.source_credentials (selector, verifier, source_id, expires_at)
  values (p_cred_selector, p_cred_verifier, claimed_source, p_cred_expires_at);

  insert into observer.source_audit (source_id, account_id, action, succeeded)
  values (claimed_source, claimed_account, 'code_consumed', true),
         (claimed_source, claimed_account, 'credential_issued', true);

  return query
    select s.source_id, s.account_id, s.project_id, s.environment, s.display_label, claimed_purpose
    from observer.project_sources s
    where s.source_id = claimed_source;
end;
$$;

alter function public.observer_activation_consume(text, text, text, text, timestamptz)
  owner to observer_ingest_owner;

-- Resolve a presented credential to the identity it grants.
--
-- Returns the row by SELECTOR ONLY. The verifier comparison happens in the
-- application, in constant time, against the value returned here — because a
-- SQL `=` on secret material is not constant-time and this is the one lookup
-- that happens on every ingestion request.
--
-- `state` and the source's state come back rather than being filtered, so the
-- caller can answer 401 and 403 differently. Filtering here would collapse
-- "revoked credential" and "suspended source" into one empty result.
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
    pg_catalog.to_char(c.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
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

-- Revoke the active credential for a source the caller owns.
create or replace function public.observer_credential_revoke(
  p_account text,
  p_source  uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer;
begin
  update observer.source_credentials c
     set state = 'revoked', revoked_at = pg_catalog.now()
   where c.source_id = p_source
     and c.state     = 'active'
     and exists (
       select 1 from observer.project_sources s
        where s.source_id = p_source and s.account_id = p_account
     );

  get diagnostics moved = row_count;
  if moved = 1 then
    insert into observer.source_audit (source_id, account_id, action, succeeded)
    values (p_source, p_account, 'credential_revoked', true);
  end if;
  return moved = 1;
end;
$$;

alter function public.observer_credential_revoke(text, uuid)
  owner to observer_ingest_owner;

-- Metadata only. There is no function anywhere that returns a verifier to an
-- operator surface, and this is the one that would have been tempting.
create or replace function public.observer_credential_status(
  p_account text,
  p_source  uuid
)
returns table (
  state         text,
  created_at    text,
  expires_at    text,
  superseded_at text,
  revoked_at    text
)
language sql
security definer
set search_path = ''
as $$
  select
    c.state,
    pg_catalog.to_char(c.created_at    at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(c.expires_at    at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(c.superseded_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    pg_catalog.to_char(c.revoked_at    at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  from observer.source_credentials c
  join observer.project_sources s on s.source_id = c.source_id
  where c.source_id  = p_source
    and s.account_id = p_account
  order by c.created_at desc;
$$;

alter function public.observer_credential_status(text, uuid)
  owner to observer_ingest_owner;

/* --- 7. row level security ------------------------------------------------ */

alter table observer.activation_codes   enable row level security;
alter table observer.source_credentials enable row level security;
alter table observer.source_audit       enable row level security;

-- No policies, deliberately. See the spine migration.

/* --- 8. grants ------------------------------------------------------------ */

revoke all on schema observer from public, anon, authenticated, service_role;

revoke all on observer.activation_codes   from public, anon, authenticated, service_role;
revoke all on observer.source_credentials from public, anon, authenticated, service_role;
revoke all on observer.source_audit       from public, anon, authenticated, service_role;
revoke all on sequence observer.source_audit_id_seq
  from public, anon, authenticated, service_role;

revoke all on function public.observer_activation_issue(text, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.observer_activation_consume(text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.observer_credential_resolve(text)
  from public, anon, authenticated;
revoke all on function public.observer_credential_revoke(text, uuid)
  from public, anon, authenticated;
revoke all on function public.observer_credential_status(text, uuid)
  from public, anon, authenticated;

revoke all on function observer.refuse_secret_move() from public, anon, authenticated, service_role;

grant execute on function public.observer_activation_issue(text, uuid, text, text, text, timestamptz)
  to service_role;
grant execute on function public.observer_activation_consume(text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.observer_credential_resolve(text)
  to service_role;
grant execute on function public.observer_credential_revoke(text, uuid)
  to service_role;
grant execute on function public.observer_credential_status(text, uuid)
  to service_role;

notify pgrst, 'reload schema';
