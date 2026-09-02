-- Observer — per-account model choice and a monthly usage budget.
--
-- **Forward-only. EXECUTED against PGlite, NOT APPLIED to any deployment.**
--
-- `supabase/test/model-budget-grants.test.ts` runs this file on every test run
-- against PostgreSQL compiled to WASM, creates the three Supabase roles, and
-- then asks PostgreSQL itself who may do what. Applying it to a hosted project
-- and running the verifier remains an open deployment prerequisite.
--
-- ## What this adds
--
--   account_preferences   which model an account uses by default, and which for
--                         a Deep Report.
--   model_availability    what a provider said last time THIS account tried a
--                         model. Remembered rather than assumed: a model nobody
--                         has tried is unknown, not available.
--   usage_periods         one row per account per UTC month: the ceiling the
--                         reader set, what has been settled, what is held, and
--                         what was charged for a request whose outcome nobody
--                         ever learned.
--   usage_reservations    money claimed against a request, through its whole
--                         life: reserved, dispatched, settled, released or
--                         uncertain.
--
-- ## Five states, because "in flight" is not one thing
--
--   reserved    money held; NOTHING has been sent to a vendor yet.
--   dispatched  the request is with the vendor. It may already have cost money.
--   settled     the real cost is known and recorded.
--   released    never dispatched, so nothing was spent. Charge nothing.
--   uncertain   dispatched, and the outcome never came back.
--
-- The distinction that matters is the last two. A request that failed before it
-- was sent costs nothing and its hold must come back. A request that WAS sent
-- and then timed out may well have run to completion and been billed by the
-- vendor, and releasing it as free would tell a reader they have headroom they
-- do not have. So an uncertain request keeps its money, moves it out of "held"
-- into "spent", and is recorded as uncertain so a person can reconcile it
-- against the vendor's own invoice later.
--
-- ## Every entry carries the rates it was priced with
--
-- Not merely the catalogue version: the three rates themselves. A price change
-- must not retroactively rewrite what last month cost, and a version string
-- alone would only tell a reader which file to go and read.
--
-- ## Money is integers
--
-- Micro-dollars — one millionth of a dollar — in `bigint`. No `numeric`, no
-- `float`, no currency arithmetic anywhere but addition and comparison of whole
-- numbers. A budget is not a place to discover that 0.1 + 0.2 is not 0.3.
--
-- ## Reserve, then settle
--
-- `observer_usage_reserve` decides and writes in ONE statement: it compares the
-- ceiling against spent + reserved + the new amount, and inserts the hold only
-- if it fits. Two concurrent requests therefore cannot both find room that only
-- one of them can have — which a check followed by a separate insert would
-- allow, and which is the whole reason this is a database function rather than
-- three round trips from the application.
--
-- ## The same privilege model as the credentials
--
-- One private NOLOGIN owner, `security definer` functions with an empty
-- `search_path` and fully qualified objects, EXECUTE revoked from PUBLIC, anon
-- and authenticated by exact signature, and granted only to `service_role`.
-- The browser roles hold nothing at all.

/* --- 1. the private owner ------------------------------------------------- */

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'observer_budget_owner') then
    create role observer_budget_owner nologin noinherit;
  end if;
end;
$$;

create schema if not exists observer;
grant usage on schema observer to observer_budget_owner;

/* --- 2. the provider list stays a list, and stays at one ------------------ */
--
-- An earlier draft of this migration widened the credential table's provider
-- constraint to five vendors. Four of them had never been reached by any
-- request and every figure attached to them was a placeholder, so the surface
-- is back to the one vendor whose numbers are checked.
--
-- Restated rather than left alone, because the widened constraint may already
-- exist in a database this file ran against. The constraint stays a LIST rather
-- than becoming free text: a typo in a provider name would otherwise create a
-- credential nothing can ever read.

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'account_credentials_provider_known'
  ) then
    alter table observer.account_credentials
      drop constraint account_credentials_provider_known;
  end if;
end;
$$;

-- Anything stored for a vendor that is no longer offered cannot be used and
-- would block the constraint below. There is nothing to preserve: a credential
-- for a provider Observer will not route to is unreachable by definition.
delete from observer.account_credentials where provider <> 'openai';

alter table observer.account_credentials
  add constraint account_credentials_provider_known
  check (provider in ('openai'));

/* --- 3. preferences ------------------------------------------------------- */

create table if not exists observer.account_preferences (
  account_id    text        not null,
  default_model text        not null,
  deep_model    text,
  updated_at    timestamptz not null default now(),

  constraint account_preferences_pkey primary key (account_id)
);

alter table observer.account_preferences owner to observer_budget_owner;

create table if not exists observer.model_availability (
  account_id text        not null,
  model      text        not null,
  state      text        not null,
  checked_at timestamptz not null default now(),

  constraint model_availability_pkey primary key (account_id, model),
  constraint model_availability_state_known check (state in ('available', 'unavailable'))
);

alter table observer.model_availability owner to observer_budget_owner;

/* --- 4. the ledger -------------------------------------------------------- */

create table if not exists observer.usage_periods (
  account_id      text        not null,
  -- 'YYYY-MM', in UTC. Stored as text rather than a date because it is a label
  -- for a month, not a day, and the application computes it in one place.
  period          text        not null,
  budget_micros   bigint      not null default 0,
  spent_micros    bigint      not null default 0,
  reserved_micros bigint      not null default 0,
  -- Of `spent_micros`, how much was charged for requests whose outcome never
  -- came back. Not a separate pot of money — a subset, kept so a reader can be
  -- told "this much of your month is an unconfirmed charge" rather than being
  -- quietly billed for it or quietly refunded.
  uncertain_micros bigint     not null default 0,
  requests        integer     not null default 0,
  updated_at      timestamptz not null default now(),

  constraint usage_periods_pkey primary key (account_id, period),
  constraint usage_periods_period_shape check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  -- Money never goes backwards past zero. A negative balance would mean a
  -- settlement or a release ran twice, and it should fail loudly rather than
  -- quietly hand somebody credit.
  constraint usage_periods_non_negative
    check (budget_micros >= 0 and spent_micros >= 0 and reserved_micros >= 0
           and uncertain_micros >= 0)
);

alter table observer.usage_periods add column if not exists uncertain_micros bigint not null default 0;

alter table observer.usage_periods owner to observer_budget_owner;

create table if not exists observer.usage_reservations (
  id                text        not null,
  account_id        text        not null,
  period            text        not null,
  model             text        not null,
  amount_micros     bigint      not null,
  -- The state machine, in one column. See the header.
  status            text        not null default 'reserved',
  catalogue_version text        not null,
  -- THE RATES THIS AMOUNT WAS COMPUTED WITH, not a pointer to them.
  input_rate_micros        bigint not null default 0,
  cached_input_rate_micros bigint not null default 0,
  output_rate_micros       bigint not null default 0,
  created_at        timestamptz not null default now(),
  dispatched_at     timestamptz,
  expires_at        timestamptz not null,

  constraint usage_reservations_pkey primary key (id),
  constraint usage_reservations_amount_positive check (amount_micros > 0),
  constraint usage_reservations_status_known
    check (status in ('reserved', 'dispatched', 'uncertain')),
  -- Settled and released rows are deleted rather than kept: the money has moved
  -- and the period row is the record. An uncertain row is kept precisely
  -- because nobody knows what it cost.
  constraint usage_reservations_dispatch_time
    check ((status = 'reserved') = (dispatched_at is null))
);

alter table observer.usage_reservations
  add column if not exists status text not null default 'reserved';
alter table observer.usage_reservations
  add column if not exists input_rate_micros bigint not null default 0;
alter table observer.usage_reservations
  add column if not exists cached_input_rate_micros bigint not null default 0;
alter table observer.usage_reservations
  add column if not exists output_rate_micros bigint not null default 0;
alter table observer.usage_reservations
  add column if not exists dispatched_at timestamptz;

alter table observer.usage_reservations owner to observer_budget_owner;

create index if not exists usage_reservations_expiry
  on observer.usage_reservations (expires_at);

/* --- 5. the doors --------------------------------------------------------- */

-- Reading carries the ceiling forward, exactly as reserving does.
--
-- A ceiling is a standing decision; usage is what resets. Without the carry
-- here, a reader who set twenty dollars in August opened the settings page on
-- the first of September and was told no budget was set — while a question
-- asked in the same minute went through on the carried ceiling, because
-- `observer_usage_reserve` had the fallback and this did not. Two doors
-- disagreeing about the same number is worse than either answer.
--
-- Always one row, so "no row yet" and "a month with nothing spent" are the
-- same thing to the caller, which is what they are.
create or replace function public.observer_usage_read(
  p_account text,
  p_period  text
)
returns table (
  budget_micros    bigint,
  spent_micros     bigint,
  reserved_micros  bigint,
  uncertain_micros bigint,
  requests         integer
)
language sql
security definer
set search_path = ''
as $$
  select coalesce(cur.budget_micros, carry.budget_micros, 0)::bigint,
         coalesce(cur.spent_micros, 0)::bigint,
         coalesce(cur.reserved_micros, 0)::bigint,
         coalesce(cur.uncertain_micros, 0)::bigint,
         coalesce(cur.requests, 0)::integer
    from (select 1) as anchor
    left join observer.usage_periods cur
           on cur.account_id = p_account
          and cur.period     = p_period
    left join lateral (
      select u.budget_micros
        from observer.usage_periods u
       where u.account_id = p_account
       order by u.period desc
       limit 1
    ) carry on true;
$$;

alter function public.observer_usage_read(text, text) owner to observer_budget_owner;

-- The ceiling carries forward, so a reader sets it once rather than every
-- month. The row for a new period is created with the most recent ceiling this
-- account chose, which is what "monthly budget" means to the person who set it.
create or replace function public.observer_usage_set_budget(
  p_account       text,
  p_period        text,
  p_budget_micros bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into observer.usage_periods (account_id, period, budget_micros, updated_at)
  values (p_account, p_period, p_budget_micros, pg_catalog.now())
  on conflict (account_id, period) do update
    set budget_micros = excluded.budget_micros,
        updated_at    = pg_catalog.now();
$$;

alter function public.observer_usage_set_budget(text, text, bigint)
  owner to observer_budget_owner;

-- ONE STATEMENT DECIDES.
--
-- The insert into `usage_periods` establishes the row and carries the previous
-- month's ceiling forward; the conditional update then holds the money only if
-- it fits. Because the comparison and the write are the same statement, two
-- concurrent callers serialise on the row lock and the second sees the first's
-- hold — which a select-then-update from the application could not guarantee
-- without a transaction it has no way to open over PostgREST.
create or replace function public.observer_usage_reserve(
  p_reservation             text,
  p_account                 text,
  p_period                  text,
  p_model                   text,
  p_amount_micros           bigint,
  p_catalogue_version       text,
  p_input_rate_micros       bigint,
  p_cached_input_rate_micros bigint,
  p_output_rate_micros      bigint,
  p_expires_at              timestamptz
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_carry   bigint;
  v_updated integer;
begin
  -- The ceiling this account most recently chose, for a month with no row yet.
  select u.budget_micros into v_carry
    from observer.usage_periods u
   where u.account_id = p_account
   order by u.period desc
   limit 1;

  insert into observer.usage_periods (account_id, period, budget_micros)
  values (p_account, p_period, coalesce(v_carry, 0))
  on conflict (account_id, period) do nothing;

  update observer.usage_periods u
     set reserved_micros = u.reserved_micros + p_amount_micros,
         updated_at      = pg_catalog.now()
   where u.account_id = p_account
     and u.period     = p_period
     and u.budget_micros > 0
     and u.spent_micros + u.reserved_micros + p_amount_micros <= u.budget_micros;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return query
      select case
               when (select u.budget_micros from observer.usage_periods u
                      where u.account_id = p_account and u.period = p_period) > 0
               then 'exhausted'
               else 'no_budget'
             end;
    return;
  end if;

  insert into observer.usage_reservations
    (id, account_id, period, model, amount_micros, status, catalogue_version,
     input_rate_micros, cached_input_rate_micros, output_rate_micros, expires_at)
  values
    (p_reservation, p_account, p_period, p_model, p_amount_micros, 'reserved',
     p_catalogue_version, p_input_rate_micros, p_cached_input_rate_micros,
     p_output_rate_micros, p_expires_at);

  return query select 'reserved'::text;
end;
$$;

alter function public.observer_usage_reserve(text, text, text, text, bigint, text, bigint, bigint, bigint, timestamptz)
  owner to observer_budget_owner;

-- THE MOMENT THE MONEY STOPS BEING REFUNDABLE.
--
-- Called immediately before the request leaves for the vendor. Everything up to
-- here can be released for free, because nothing was sent; from here on the
-- vendor may have done the work and billed for it whatever Observer later
-- learns, so a failure becomes 'uncertain' rather than a refund.
create or replace function public.observer_usage_dispatch(
  p_reservation text,
  p_at          timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update observer.usage_reservations r
     set status        = 'dispatched',
         dispatched_at = p_at
   where r.id = p_reservation
     and r.status = 'reserved'
  returning r.status into v_status;

  if found then
    return 'dispatched';
  end if;

  select r.status into v_status
    from observer.usage_reservations r
   where r.id = p_reservation;

  -- Already dispatched is success: the caller retried, and the request is out.
  -- A missing row is not, and the caller must not send anything on the strength
  -- of a hold that no longer exists.
  return coalesce(v_status, 'unknown');
end;
$$;

alter function public.observer_usage_dispatch(text, timestamptz)
  owner to observer_budget_owner;

-- Idempotent by reservation id: deleting the row first means a second call
-- finds nothing and charges nothing. A settlement that ran twice would bill a
-- reader for one answer twice, which is the worst arithmetic error this system
-- could make.
create or replace function public.observer_usage_settle(
  p_reservation   text,
  p_actual_micros bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_held observer.usage_reservations%rowtype;
begin
  delete from observer.usage_reservations r
   where r.id = p_reservation
  returning r.* into v_held;

  if not found then
    return;
  end if;

  -- An uncertain row has already moved its money into `spent`; settling it
  -- later (because somebody reconciled the vendor's invoice) must correct that
  -- charge rather than add a second one.
  if v_held.status = 'uncertain' then
    update observer.usage_periods u
       set spent_micros     = greatest(0, u.spent_micros - v_held.amount_micros)
                              + greatest(0, p_actual_micros),
           uncertain_micros = greatest(0, u.uncertain_micros - v_held.amount_micros),
           requests         = u.requests + 1,
           updated_at       = pg_catalog.now()
     where u.account_id = v_held.account_id
       and u.period     = v_held.period;
    return;
  end if;

  update observer.usage_periods u
     set reserved_micros = greatest(0, u.reserved_micros - v_held.amount_micros),
         spent_micros    = u.spent_micros + greatest(0, p_actual_micros),
         requests        = u.requests + 1,
         updated_at      = pg_catalog.now()
   where u.account_id = v_held.account_id
     and u.period     = v_held.period;
end;
$$;

alter function public.observer_usage_settle(text, bigint) owner to observer_budget_owner;

-- RELEASING IS ONLY FOR A REQUEST THAT WAS NEVER SENT.
--
-- The delete is conditional on the row still being 'reserved'. A dispatched
-- request cannot be refunded here however the application asks: the vendor may
-- have completed and billed it, and "we never heard back" is not evidence that
-- nothing happened. The caller is told what it actually did, and the honest
-- outcome for a dispatched request is `observer_usage_uncertain`.
create or replace function public.observer_usage_release(
  p_reservation text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_held observer.usage_reservations%rowtype;
  v_status text;
begin
  delete from observer.usage_reservations r
   where r.id = p_reservation
     and r.status = 'reserved'
  returning r.* into v_held;

  if found then
    update observer.usage_periods u
       set reserved_micros = greatest(0, u.reserved_micros - v_held.amount_micros),
           updated_at      = pg_catalog.now()
     where u.account_id = v_held.account_id
       and u.period     = v_held.period;
    return 'released';
  end if;

  select r.status into v_status
    from observer.usage_reservations r
   where r.id = p_reservation;

  return coalesce(v_status, 'unknown');
end;
$$;

alter function public.observer_usage_release(text) owner to observer_budget_owner;

-- A DISPATCHED REQUEST WHOSE OUTCOME NEVER CAME BACK.
--
-- The money stays charged, at the amount that was reserved, and is recorded as
-- uncertain so it can be reconciled against the vendor's own invoice. This is
-- the deliberate opposite of a release: the reader is not given back headroom
-- that a completed, billed request may already have consumed.
create or replace function public.observer_usage_uncertain(
  p_reservation text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_held observer.usage_reservations%rowtype;
begin
  update observer.usage_reservations r
     set status = 'uncertain'
   where r.id = p_reservation
     and r.status = 'dispatched'
  returning r.* into v_held;

  if not found then
    return 'unknown';
  end if;

  update observer.usage_periods u
     set reserved_micros  = greatest(0, u.reserved_micros - v_held.amount_micros),
         spent_micros     = u.spent_micros + v_held.amount_micros,
         uncertain_micros = u.uncertain_micros + v_held.amount_micros,
         updated_at       = pg_catalog.now()
   where u.account_id = v_held.account_id
     and u.period     = v_held.period;

  return 'uncertain';
end;
$$;

alter function public.observer_usage_uncertain(text) owner to observer_budget_owner;

-- A hold nobody settled or released would consume a budget forever. The
-- process that made it may have died between calling a provider and recording
-- the cost, which is exactly when a reader most needs the headroom back.
create or replace function public.observer_usage_expire(
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_held  observer.usage_reservations%rowtype;
begin
  -- Never sent, and out of time: the hold comes back in full.
  for v_held in
    delete from observer.usage_reservations r
     where r.expires_at <= p_now
       and r.status = 'reserved'
    returning r.*
  loop
    update observer.usage_periods u
       set reserved_micros = greatest(0, u.reserved_micros - v_held.amount_micros),
           updated_at      = pg_catalog.now()
     where u.account_id = v_held.account_id
       and u.period     = v_held.period;
    v_count := v_count + 1;
  end loop;

  -- Sent, and never heard from again. NOT a refund: the request may have run to
  -- completion at the vendor and been billed there. The money moves from held
  -- to spent and is flagged uncertain, which is the honest record of what this
  -- system actually knows.
  for v_held in
    update observer.usage_reservations r
       set status = 'uncertain'
     where r.expires_at <= p_now
       and r.status = 'dispatched'
    returning r.*
  loop
    update observer.usage_periods u
       set reserved_micros  = greatest(0, u.reserved_micros - v_held.amount_micros),
           spent_micros     = u.spent_micros + v_held.amount_micros,
           uncertain_micros = u.uncertain_micros + v_held.amount_micros,
           updated_at       = pg_catalog.now()
     where u.account_id = v_held.account_id
       and u.period     = v_held.period;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

alter function public.observer_usage_expire(timestamptz) owner to observer_budget_owner;

/* --- 6. preference doors -------------------------------------------------- */

create or replace function public.observer_preferences_read(
  p_account text
)
returns table (
  default_model text,
  deep_model    text,
  availability  jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    p.default_model,
    p.deep_model,
    coalesce(
      (select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'model', a.model,
                  'state', a.state,
                  'checked_at', pg_catalog.to_char(
                    a.checked_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                ))
         from observer.model_availability a
        where a.account_id = p_account),
      '[]'::jsonb)
  from observer.account_preferences p
  where p.account_id = p_account;
$$;

alter function public.observer_preferences_read(text) owner to observer_budget_owner;

create or replace function public.observer_preferences_set_models(
  p_account       text,
  p_default_model text,
  p_deep_model    text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into observer.account_preferences (account_id, default_model, deep_model, updated_at)
  values (p_account, p_default_model, p_deep_model, pg_catalog.now())
  on conflict (account_id) do update
    set default_model = excluded.default_model,
        deep_model    = excluded.deep_model,
        updated_at    = pg_catalog.now();
$$;

alter function public.observer_preferences_set_models(text, text, text)
  owner to observer_budget_owner;

create or replace function public.observer_preferences_record_availability(
  p_account text,
  p_model   text,
  p_state   text,
  p_at      timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into observer.model_availability (account_id, model, state, checked_at)
  values (p_account, p_model, p_state, p_at)
  on conflict (account_id, model) do update
    set state      = excluded.state,
        checked_at = excluded.checked_at;
$$;

alter function public.observer_preferences_record_availability(text, text, text, timestamptz)
  owner to observer_budget_owner;

/* --- 7. who may reach any of it ------------------------------------------- */

alter table observer.account_preferences enable row level security;
alter table observer.model_availability  enable row level security;
alter table observer.usage_periods       enable row level security;
alter table observer.usage_reservations  enable row level security;

-- No policies. RLS with none denies every role that is not the owner, and the
-- owner is a role nobody can log in as.

revoke all on observer.account_preferences from public, anon, authenticated, service_role;
revoke all on observer.model_availability  from public, anon, authenticated, service_role;
revoke all on observer.usage_periods       from public, anon, authenticated, service_role;
revoke all on observer.usage_reservations  from public, anon, authenticated, service_role;

revoke all on function public.observer_usage_read(text, text)
  from public, anon, authenticated;
revoke all on function public.observer_usage_set_budget(text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.observer_usage_reserve(text, text, text, text, bigint, text, bigint, bigint, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.observer_usage_settle(text, bigint)
  from public, anon, authenticated;
revoke all on function public.observer_usage_release(text)
  from public, anon, authenticated;
revoke all on function public.observer_usage_dispatch(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.observer_usage_uncertain(text)
  from public, anon, authenticated;
revoke all on function public.observer_usage_expire(timestamptz)
  from public, anon, authenticated;
revoke all on function public.observer_preferences_read(text)
  from public, anon, authenticated;
revoke all on function public.observer_preferences_set_models(text, text, text)
  from public, anon, authenticated;
revoke all on function public.observer_preferences_record_availability(text, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.observer_usage_read(text, text)
  to service_role;
grant execute on function public.observer_usage_set_budget(text, text, bigint)
  to service_role;
grant execute on function public.observer_usage_reserve(text, text, text, text, bigint, text, bigint, bigint, bigint, timestamptz)
  to service_role;
grant execute on function public.observer_usage_settle(text, bigint)
  to service_role;
grant execute on function public.observer_usage_release(text)
  to service_role;
grant execute on function public.observer_usage_dispatch(text, timestamptz)
  to service_role;
grant execute on function public.observer_usage_uncertain(text)
  to service_role;
grant execute on function public.observer_usage_expire(timestamptz)
  to service_role;
grant execute on function public.observer_preferences_read(text)
  to service_role;
grant execute on function public.observer_preferences_set_models(text, text, text)
  to service_role;
grant execute on function public.observer_preferences_record_availability(text, text, text, timestamptz)
  to service_role;
