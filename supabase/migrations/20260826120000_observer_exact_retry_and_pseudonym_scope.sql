-- Observer — a correct "exact retry", and pseudonyms that cannot cross tenants.
--
-- **Forward-only.** `20260825205000` is applied to the live database and is
-- treated as immutable from here: it is not edited, not re-run and not
-- reconciled. Everything below corrects it by adding to it.
--
-- Three findings, all from review of the applied schema.
--
-- **`complete_ai_request` compared the wrong half of the row.** Its
-- exact-retry test covered the eight provenance fields and none of the five
-- persisted metrics — `tools`, `tool_calls`, `input_tokens`, `output_tokens`,
-- `latency_ms`. So a second completion carrying the same provenance and
-- *different* usage was answered `duplicate_ignored`: the caller was told
-- nothing had changed and nothing was wrong, when two executions had in fact
-- disagreed about what the request cost. A write-once record whose sameness
-- test ignores most of the record is not write-once.
--
-- **The durable pseudonyms were stable across tenants.** `telemetrySubject`
-- hashed the viewer alone, so one sales agent working for two developers wrote
-- the same `subject` into both tenants' audit rows, and the same browser wrote
-- the same `client_hash`. Anybody holding the table could join a person's
-- activity across customers — the exact correlation ADR-0023's tenancy model
-- exists to prevent, built into the one table meant to hold nothing
-- identifying.
--
-- **`key_id` names the secret, not the derivation.** Tenant-scoping changes
-- every pseudonym while leaving the pepper — and therefore the key id —
-- untouched. Two rows could carry the same key id and incomparable subjects.
-- `pseudonym_version` is added beside it: the key id says *which secret*, the
-- version says *which scheme*, and the pair identifies the space a pseudonym
-- lives in.

/* --- 1. the pseudonym scheme, recorded per row ---------------------------- */

alter table observer.ai_requests
  add column if not exists pseudonym_version smallint;

comment on column observer.ai_requests.pseudonym_version is
  'Which derivation produced this row''s subject and client_hash. 1 = viewer-only (cross-tenant linkable). 2 = tenant-scoped. Read with key_id: the key id says which secret, this says which scheme.';

/*
 * Version-2 audit rows written before this migration used the viewer-only
 * derivation, and are marked as such rather than left ambiguous.
 *
 * At the time of writing the live database holds **zero** of them — 133 rows,
 * all `audit_version = 1`, verified read-only before this file was written. The
 * statement is here anyway: a migration that is correct only against the
 * database somebody happened to look at is not correct.
 */
update observer.ai_requests
   set pseudonym_version = 1
 where audit_version = 2 and pseudonym_version is null;

/* --- 2. the constraints, scoped to the table ------------------------------ */

-- `conname` is not globally unique — a constraint of the same name on another
-- table would satisfy a name-only existence check and this migration would
-- silently skip its own work. `20260825205000` checks by name alone; it is
-- applied and therefore immutable, so the fix is here and forward: every check
-- below is scoped by `conrelid`.
do $$
declare
  v_table oid := 'observer.ai_requests'::regclass;
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = v_table and conname = 'ai_requests_v2_requires_pseudonym_version'
  ) then
    alter table observer.ai_requests
      add constraint ai_requests_v2_requires_pseudonym_version
      -- `x in (1, 2)` is NULL when x is NULL, and a CHECK passes on NULL.
      -- Written as `is not null and …` so the absence of a value is a
      -- violation rather than an abstention. A test caught this by asserting
      -- the rejection rather than trusting the shape.
      check ((audit_version = 1 and pseudonym_version is null)
             or (audit_version = 2
                 and pseudonym_version is not null
                 and pseudonym_version in (1, 2)));
  end if;
end $$;

/* --- 3. an exact retry means every persisted terminal field --------------- */

-- Same signature, same return type: this replaces the body and nothing else.
--
-- The comparison now covers every column the first write set, normalised the
-- same way it was normalised on the way in — `coalesce(p_tools, '{}')` and
-- `coalesce(p_tool_calls, 0)` — because comparing a raw null against a stored
-- default would report a difference that does not exist. Everything else uses
-- `is not distinct from`, so two nulls are equal and a null against a value is
-- not.
--
-- `duplicate_ignored` now means what it says: this result is the stored result.
-- Anything else is `conflict`, and a conflict changes nothing — not a metric,
-- not `completed_at`.
create or replace function observer.complete_ai_request(
  p_request_id         uuid,
  p_outcome            text,
  p_response_source    text,
  p_attempted_provider text,
  p_attempted_model    text,
  p_model_attempted    boolean,
  p_model_authored     boolean,
  p_author_model       text,
  p_fallback_reason    text,
  p_tools              text[],
  p_tool_calls         integer,
  p_input_tokens       integer,
  p_output_tokens      integer,
  p_latency_ms         integer
)
returns text
language plpgsql
security definer
set search_path = observer, pg_catalog
as $$
declare
  v_state    text;
  v_same     boolean;
  v_updated  integer;
begin
  if p_request_id is null then
    return 'not_found';
  end if;

  perform pg_advisory_xact_lock(hashtext('observer.request:' || p_request_id::text));

  select r.state into v_state
    from observer.ai_requests r
   where r.request_id = p_request_id;

  if v_state is null then
    return 'not_found';
  end if;

  if v_state = 'complete' then
    select r.outcome            is not distinct from p_outcome
       and r.response_source    is not distinct from p_response_source
       and r.attempted_provider is not distinct from p_attempted_provider
       and r.attempted_model    is not distinct from p_attempted_model
       and r.model_attempted    is not distinct from coalesce(p_model_attempted, false)
       and r.model_authored     is not distinct from coalesce(p_model_authored, false)
       and r.author_model       is not distinct from p_author_model
       and r.fallback_reason    is not distinct from p_fallback_reason
       -- The five the first version forgot. A retry differing only in what the
       -- request cost is still two executions disagreeing about one request.
       and r.tools              is not distinct from coalesce(p_tools, '{}')
       and r.tool_calls         is not distinct from coalesce(p_tool_calls, 0)
       and r.input_tokens       is not distinct from p_input_tokens
       and r.output_tokens      is not distinct from p_output_tokens
       and r.latency_ms         is not distinct from p_latency_ms
      into v_same
      from observer.ai_requests r
     where r.request_id = p_request_id;

    return case when v_same then 'duplicate_ignored' else 'conflict' end;
  end if;

  update observer.ai_requests
     set state              = 'complete',
         completed_at       = now(),
         outcome            = p_outcome,
         response_source    = p_response_source,
         attempted_provider = p_attempted_provider,
         attempted_model    = p_attempted_model,
         model_attempted    = coalesce(p_model_attempted, false),
         model_authored     = coalesce(p_model_authored, false),
         author_model       = p_author_model,
         fallback_reason    = p_fallback_reason,
         tools              = coalesce(p_tools, '{}'),
         tool_calls         = coalesce(p_tool_calls, 0),
         input_tokens       = p_input_tokens,
         output_tokens      = p_output_tokens,
         latency_ms         = p_latency_ms
   where request_id = p_request_id
     and state = 'started';

  get diagnostics v_updated = row_count;
  return case when v_updated > 0 then 'completed' else 'conflict' end;
end;
$$;

/* --- 4. admission carries the scheme, and a tenant-scoped client hash ----- */

-- Two identifiers now, because they answer different questions.
--
-- `p_client_hash` stays GLOBAL and keys the per-client hourly bucket: catching
-- one browser hammering two tenants is the entire purpose of that ceiling, and
-- a tenant-scoped value cannot do it.
--
-- `p_audit_client_hash` is TENANT-SCOPED and is what the durable row stores.
-- The global value never reaches `ai_requests`, so the audit cannot be used to
-- follow a browser between customers, while the rate limiter — which holds
-- nothing for longer than a day and is pruned — still can.
--
-- Both new parameters carry defaults so a caller built before this migration
-- keeps working. Such a caller supplies no scoped hash and no scheme, so its
-- rows fall back to the global hash and record `pseudonym_version = 1`: the
-- old derivation, labelled as the old derivation. It keeps working and it
-- keeps telling the truth about itself.
drop function if exists public.admit_ai_request(
  uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text);
drop function if exists observer.admit_ai_request(
  uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text);

create function observer.admit_ai_request(
  p_request_id        uuid,
  p_session           text,
  p_client_hash       text,
  p_project           text,
  p_per_minute        integer,
  p_per_hour          integer,
  p_client_per_hour   integer,
  p_project_per_day   integer,
  p_tenant_slug       text,
  p_project_slug      text,
  p_viewer_role       text,
  p_question_chars    integer,
  p_key_id            text,
  p_audit_client_hash text    default null,
  -- `integer`, not `smallint`. PostgREST sends a JSON number as int4 and
  -- resolves a function by its argument types; a smallint parameter would have
  -- matched nothing and answered PGRST202 on every request. The column stays
  -- smallint and the insert casts.
  p_pseudonym_version integer default 1
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = observer, pg_catalog
as $$
declare
  v_allowed boolean;
  v_reason  text;
  v_retry   integer;
begin
  if p_request_id is null then
    return query select false, 'duplicate_request', 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('observer.request:' || p_request_id::text));

  if exists (select 1 from observer.ai_requests r where r.request_id = p_request_id) then
    return query select false, 'duplicate_request', 0;
    return;
  end if;

  select q.allowed, q.reason, q.retry_after_seconds
    into v_allowed, v_reason, v_retry
    from observer.consume_ai_quota(
      p_session, p_client_hash, p_project,
      p_per_minute, p_per_hour, p_client_per_hour, p_project_per_day
    ) q;

  if v_allowed then
    insert into observer.ai_requests (
      audit_version, request_id, subject, client_hash, tenant_slug, project_slug,
      viewer_role, state, question_chars, key_id, pseudonym_version
    ) values (
      2, p_request_id, p_session,
      -- The scoped hash when there is one; the global hash only for a caller
      -- that predates the distinction, whose row says so.
      coalesce(p_audit_client_hash, p_client_hash),
      p_tenant_slug, p_project_slug,
      p_viewer_role, 'started', coalesce(p_question_chars, 0), p_key_id,
      coalesce(p_pseudonym_version, 1)::smallint
    );
  end if;

  return query select v_allowed, v_reason, v_retry;
end;
$$;

create function public.admit_ai_request(
  p_request_id        uuid,
  p_session           text,
  p_client_hash       text,
  p_project           text,
  p_per_minute        integer,
  p_per_hour          integer,
  p_client_per_hour   integer,
  p_project_per_day   integer,
  p_tenant_slug       text,
  p_project_slug      text,
  p_viewer_role       text,
  p_question_chars    integer,
  p_key_id            text,
  p_audit_client_hash text    default null,
  p_pseudonym_version integer default 1
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select * from observer.admit_ai_request(
    p_request_id, p_session, p_client_hash, p_project,
    p_per_minute, p_per_hour, p_client_per_hour, p_project_per_day,
    p_tenant_slug, p_project_slug, p_viewer_role, p_question_chars, p_key_id,
    p_audit_client_hash, p_pseudonym_version
  );
$$;

comment on function public.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text, text, integer) is
  'The door to the shared Ask Observer ceiling. Consuming it and recording the request are one transaction, a repeated request id consumes nothing, and the row stores a tenant-scoped client hash rather than the global one the ceiling counts.';

revoke all on function observer.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text, text, integer)
  from anon, authenticated, public;
revoke all on function public.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text, text, integer)
  from anon, authenticated, public;
grant execute on function public.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text, text, integer)
  to service_role;
