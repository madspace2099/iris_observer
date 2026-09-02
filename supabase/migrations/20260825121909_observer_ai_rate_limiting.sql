-- Observer — the shared ceiling for Ask Observer.
--
-- A serverless deployment gives every warm instance its own memory, so an
-- in-process counter is a per-lambda brake and not a ceiling. These tables are
-- the number every instance can see.
--
-- Nothing here is reachable from a browser: the tables carry RLS with no
-- policies, and every grant to anon, authenticated and public is revoked. The
-- application reaches the function with the server-side secret key and nothing
-- else can.
--
-- This file is the deployed object, not a description of it. It was reconciled
-- against `pg_proc.prosrc` and `information_schema.columns` on the running
-- project, because a migration that only approximates what runs is worse than
-- none: the next person edits it, applies it, and silently changes behaviour
-- nobody reviewed.

create schema if not exists observer;

/* --- the counters --------------------------------------------------------- */

create table if not exists observer.ai_rate_buckets (
  scope        text        not null,   -- session | client | project
  subject      text        not null,   -- opaque: a telemetry subject or a salted hash
  window_kind  text        not null,   -- minute | hour | day
  window_start timestamptz not null,
  count        integer     not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (scope, subject, window_kind, window_start)
);

comment on table observer.ai_rate_buckets is
  'Fixed-window counters for Ask Observer. Subjects are opaque identifiers, never addresses or names.';

-- Only the pruning function reads this way round, and it reads the whole table
-- by age.
create index if not exists ai_rate_buckets_window_start_idx
  on observer.ai_rate_buckets (window_start);

/* --- the audit ------------------------------------------------------------ */

create table if not exists observer.ai_requests (
  id             uuid        primary key default gen_random_uuid(),
  occurred_at    timestamptz not null default now(),
  subject        text        not null,
  client_hash    text        not null,
  tenant_slug    text        not null,
  project_slug   text        not null,
  viewer_role    text        not null,
  outcome        text        not null,
  model          text,
  tools          text[]      not null default '{}',
  tool_calls     integer     not null default 0,
  input_tokens   integer,
  output_tokens  integer,
  latency_ms     integer,
  question_chars integer
);

comment on table observer.ai_requests is
  'That a question happened, never what it said. No prompt, no answer, no contact, no address.';

create index if not exists ai_requests_occurred_at_idx
  on observer.ai_requests (occurred_at desc);

/* --- the gate ------------------------------------------------------------- */

-- Checks every applicable ceiling and consumes one unit of each, in a single
-- transaction behind an advisory lock, so two instances cannot both read
-- "nine of ten" and both proceed.
--
-- Counters move only when the request is allowed. A refused request that still
-- spent quota would let somebody exhaust a ceiling they were never permitted
-- to use.
create or replace function observer.consume_ai_quota(
  p_session         text,
  p_client_hash     text,
  p_project         text,
  p_per_minute      integer,
  p_per_hour        integer,
  p_client_per_hour integer,
  p_project_per_day integer
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = observer, pg_catalog
as $$
declare
  v_now      timestamptz := now();
  v_minute   timestamptz := date_trunc('minute', v_now);
  v_hour     timestamptz := date_trunc('hour', v_now);
  v_day      timestamptz := date_trunc('day', v_now);
  v_count    integer;
begin
  perform pg_advisory_xact_lock(hashtext('observer.ai:' || p_project));

  select coalesce(b.count, 0) into v_count
    from observer.ai_rate_buckets b
   where b.scope = 'session' and b.subject = p_session
     and b.window_kind = 'minute' and b.window_start = v_minute;
  if v_count >= p_per_minute then
    return query select false, 'rate_limited',
      greatest(1, ceil(extract(epoch from (v_minute + interval '1 minute' - v_now)))::integer);
    return;
  end if;

  select coalesce(b.count, 0) into v_count
    from observer.ai_rate_buckets b
   where b.scope = 'session' and b.subject = p_session
     and b.window_kind = 'hour' and b.window_start = v_hour;
  if v_count >= p_per_hour then
    return query select false, 'hourly_limit',
      greatest(1, ceil(extract(epoch from (v_hour + interval '1 hour' - v_now)))::integer);
    return;
  end if;

  -- A second session from the same client is the same client.
  select coalesce(b.count, 0) into v_count
    from observer.ai_rate_buckets b
   where b.scope = 'client' and b.subject = p_client_hash
     and b.window_kind = 'hour' and b.window_start = v_hour;
  if v_count >= p_client_per_hour then
    return query select false, 'client_limit',
      greatest(1, ceil(extract(epoch from (v_hour + interval '1 hour' - v_now)))::integer);
    return;
  end if;

  -- The ceiling that actually bounds the bill.
  select coalesce(b.count, 0) into v_count
    from observer.ai_rate_buckets b
   where b.scope = 'project' and b.subject = p_project
     and b.window_kind = 'day' and b.window_start = v_day;
  if v_count >= p_project_per_day then
    return query select false, 'daily_budget',
      greatest(1, ceil(extract(epoch from (v_day + interval '1 day' - v_now)))::integer);
    return;
  end if;

  insert into observer.ai_rate_buckets (scope, subject, window_kind, window_start, count)
  values
    ('session', p_session,     'minute', v_minute, 1),
    ('session', p_session,     'hour',   v_hour,   1),
    ('client',  p_client_hash, 'hour',   v_hour,   1),
    ('project', p_project,     'day',    v_day,    1)
  on conflict (scope, subject, window_kind, window_start) do update
    set count = observer.ai_rate_buckets.count + 1,
        updated_at = now();

  return query select true, null::text, null::integer;
end;
$$;

/* --- who may reach any of it ---------------------------------------------- */

alter table observer.ai_rate_buckets enable row level security;
alter table observer.ai_requests     enable row level security;

-- Deliberately no policies. RLS with no policy denies every role that is not
-- the owner or a security-definer context, which is the posture wanted here:
-- the tables are server-only and the function is the sole way in.

revoke all on schema observer          from anon, authenticated, public;
revoke all on observer.ai_rate_buckets from anon, authenticated, public;
revoke all on observer.ai_requests     from anon, authenticated, public;
revoke all on function observer.consume_ai_quota(text, text, text, integer, integer, integer, integer)
  from anon, authenticated, public;
