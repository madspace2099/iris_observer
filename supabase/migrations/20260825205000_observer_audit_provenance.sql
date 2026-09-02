-- Observer — who wrote the answer, and did every admitted request leave a trace?
--
-- **Expand.** This migration adds and widens; it removes nothing a running
-- deployment calls. The contract migration beside it drops the superseded
-- façades, and must not be applied until no live deployment uses them.
--
-- Two defects, found by verifying the deployment rather than reading the code.
--
-- **The audit could not say who wrote the prose.** `outcome` was `answered`
-- whenever an answer existed, and `model` held the *configured* model name
-- whether or not that model had written a word. A deterministic fallback —
-- which the screen labels honestly as "written by the tools" — was recorded as
-- `answered · gpt-5.6-sol`. The one question worth asking of an AI feature's
-- audit is which answers the AI actually wrote, and this table answered it
-- wrongly.
--
-- **The audit lost requests.** 153 admitted against 133 rows. The write was
-- fire-and-forget from a serverless route, which can freeze after the response
-- and drop an unawaited promise — but that was a hypothesis, and a hypothesis
-- is not a fix. The invariant is structural instead: the row is inserted in the
-- *same transaction* that consumes the quota.
--
-- What is still never stored: the question, the answer, any prompt, any tool
-- argument, any provider error body, any key, any person. Everything below is a
-- code, a count or a timing.

/* --- 1. the rows that already exist --------------------------------------- */

-- `model` recorded the model that was *attempted*, whatever happened next. That
-- is a useful fact under an accurate name, so it keeps its data and loses its
-- misleading one. Guarded so re-running this migration is harmless.
--
-- Renaming does not break `public.record_ai_request`: a `language sql` function
-- stores its parse tree with resolved attribute numbers, so it follows the
-- column. It is recreated below anyway, for a different reason.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'observer' and table_name = 'ai_requests' and column_name = 'model'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'observer' and table_name = 'ai_requests' and column_name = 'attempted_model'
  ) then
    alter table observer.ai_requests rename column model to attempted_model;
  end if;
end $$;

/*
 * Nullable, and no defaults yet.
 *
 * A `not null default false` on `model_authored` would have rewritten every
 * historical row into a claim nobody can support: that a model demonstrably did
 * *not* write those answers. It is not known and cannot be recovered — the fact
 * was never recorded. `null` is the honest value, and the constraint below
 * requires it only of rows written by the new code.
 *
 * The same applies to `state`. A `default 'started'` applied at ALTER time
 * would have turned every completed historical request into an interrupted
 * one, which is the opposite of true.
 */
alter table observer.ai_requests
  add column if not exists audit_version   smallint,
  add column if not exists request_id      uuid,
  add column if not exists state           text,
  add column if not exists response_source text,
  add column if not exists attempted_provider text,
  add column if not exists attempted_model text,
  add column if not exists model_attempted boolean,
  add column if not exists model_authored  boolean,
  add column if not exists author_model    text,
  add column if not exists fallback_reason text,
  add column if not exists completed_at    timestamptz,
  add column if not exists key_id          text;

-- Backfill before any default exists, so the historical rows are described
-- rather than relabelled. They were completed requests; their outcome and
-- attempted model are real and stay. Their authorship is unknown, and says so.
update observer.ai_requests
   set audit_version   = 1,
       state           = 'complete',
       completed_at    = coalesce(completed_at, occurred_at),
       response_source = coalesce(response_source, 'legacy_unknown')
 where audit_version is null;

alter table observer.ai_requests
  alter column audit_version set default 2,
  alter column state         set default 'started';

alter table observer.ai_requests
  alter column audit_version set not null,
  alter column state         set not null;

-- A terminal outcome is not known at admission. `question_chars` is — it is the
-- question's length and the route has it before any work happens — so it keeps
-- its NOT NULL.
alter table observer.ai_requests alter column outcome drop not null;

comment on column observer.ai_requests.audit_version is
  '1 = written by the pre-provenance code and back-filled. 2 = written by the admission/completion pair.';
comment on column observer.ai_requests.attempted_model is
  'The model this request tried to use. Says nothing about who wrote the prose.';
comment on column observer.ai_requests.author_model is
  'The model that wrote the final prose, or null. Null is the honest answer for every fallback, and for every version-1 row.';
comment on column observer.ai_requests.model_authored is
  'Equals the `live` flag the answer sheet renders. Null on version-1 rows: unknown, not false.';
comment on column observer.ai_requests.key_id is
  'Which pseudonym key produced this row''s subject and client_hash. An HMAC of that key, never the key. Rotating the pepper changes it, and subjects written under different key ids are not comparable.';
comment on column observer.ai_requests.fallback_reason is
  'Why the deterministic composer answered instead. A fixed code from an allow-list, never a provider message.';
comment on column observer.ai_requests.occurred_at is
  'When the request was admitted by the quota gate.';

/* --- 2. one admitted request, one row ------------------------------------- */

-- Also what makes admission idempotent. Postgres allows many nulls in a unique
-- index, so the version-1 rows — which never had an id — are untouched.
create unique index if not exists ai_requests_request_id_key
  on observer.ai_requests (request_id);

create index if not exists ai_requests_started_idx
  on observer.ai_requests (occurred_at) where state = 'started';

/* --- 3. the contract, enforced by the database ---------------------------- */

-- Named, because a verification query that counts constraints proves nothing
-- about which ones are there.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_requests_state_allowed') then
    alter table observer.ai_requests add constraint ai_requests_state_allowed
      check (state in ('started', 'complete'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_requests_audit_version_allowed') then
    alter table observer.ai_requests add constraint ai_requests_audit_version_allowed
      check (audit_version in (1, 2));
  end if;

  -- Version 2 is the only version that promises an id. Version 1 predates it.
  if not exists (select 1 from pg_constraint where conname = 'ai_requests_v2_requires_request_id') then
    alter table observer.ai_requests add constraint ai_requests_v2_requires_request_id
      check (audit_version = 1 or request_id is not null);
  end if;

  /*
   * The question's length is known before any work happens, so a version-2 row
   * has no excuse for omitting it.
   *
   * It is a constraint rather than a column-level NOT NULL because the column
   * never had one — the original table declared `question_chars integer` — and
   * adding it now would depend on what the historical rows happen to contain on
   * a database this session cannot inspect. Constraining the version that
   * promises the value is the honest half of that.
   */
  if not exists (select 1 from pg_constraint where conname = 'ai_requests_v2_requires_question_chars') then
    alter table observer.ai_requests add constraint ai_requests_v2_requires_question_chars
      check (audit_version = 1 or question_chars is not null);
  end if;

  /*
   * Which key produced the pseudonyms on this row.
   *
   * Required of version 2 and impossible for version 1, which was written
   * before the key existed. It is what turns a rotation from an unexplained
   * counter reset into a fact somebody can query: subjects under two different
   * key ids are not the same viewer twice, they are two unrelated strings.
   */
  if not exists (select 1 from pg_constraint where conname = 'ai_requests_v2_requires_key_id') then
    alter table observer.ai_requests add constraint ai_requests_v2_requires_key_id
      check ((audit_version = 1 and key_id is null)
             or (audit_version = 2 and key_id is not null and key_id ~ '^[0-9a-f]{16}$'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_requests_outcome_allowed') then
    alter table observer.ai_requests add constraint ai_requests_outcome_allowed
      check (outcome is null
             or outcome in ('answered', 'refused', 'unavailable', 'rate_limited', 'rejected'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_requests_response_source_allowed') then
    alter table observer.ai_requests add constraint ai_requests_response_source_allowed
      check (response_source is null
             or response_source in ('model', 'deterministic_composer', 'refusal', 'failure',
                                    'legacy_unknown'));
  end if;

  -- An allow-list, which is also what keeps a provider's error message out of
  -- this column: an upstream body can quote the request back, and the request
  -- carries project evidence.
  if not exists (select 1 from pg_constraint where conname = 'ai_requests_fallback_reason_allowed') then
    alter table observer.ai_requests add constraint ai_requests_fallback_reason_allowed
      check (fallback_reason is null
             or fallback_reason in ('model_unavailable', 'provider_misconfigured',
                                    'composition_failed', 'schema_rejected', 'output_guard'));
  end if;

  -- A completed version-2 row has to say what happened. A started one has not
  -- happened yet, and a version-1 row was completed before any of this existed.
  if not exists (select 1 from pg_constraint where conname = 'ai_requests_complete_is_terminal') then
    alter table observer.ai_requests add constraint ai_requests_complete_is_terminal
      check (state <> 'complete' or audit_version = 1
             or (outcome is not null and response_source is not null
                 and model_attempted is not null and model_authored is not null
                 and completed_at is not null));
  end if;

  /*
   * The defect, expressed so the database cannot hold it again.
   *
   * `answered · gpt-5.6-sol` beside prose the composer wrote is exactly an
   * `author_model` with `model_authored` not true. Every clause below is one
   * shape of that same lie.
   */
  if not exists (select 1 from pg_constraint where conname = 'ai_requests_authorship_coherent') then
    alter table observer.ai_requests add constraint ai_requests_authorship_coherent
      check (
        -- Naming an author means claiming one.
        (author_model is null or model_authored is true)
        -- Claiming one means naming it, sourcing it, and having tried.
        and (model_authored is not true
             or (author_model is not null and response_source = 'model' and model_attempted is true))
        -- `model` as a source is the same claim by another name.
        and (response_source is distinct from 'model' or model_authored is true)
        -- Nothing attempted, nothing to name.
        and (model_attempted is not false or attempted_model is null)
        -- Version 1 knows neither, and must not pretend to.
        and (audit_version <> 1 or (model_authored is null and author_model is null))
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_requests_counts_non_negative') then
    alter table observer.ai_requests add constraint ai_requests_counts_non_negative
      check (tool_calls >= 0
             and question_chars >= 0
             and (input_tokens  is null or input_tokens  >= 0)
             and (output_tokens is null or output_tokens >= 0)
             and (latency_ms    is null or latency_ms    >= 0));
  end if;
end $$;

/* --- 4. admission: the ceiling and the trace, in one transaction ---------- */

-- The ceiling logic is not repeated here. `observer.consume_ai_quota` remains
-- the single implementation and this wraps it, so there is one place where a
-- limit is decided.
--
-- **Retry-safe before it is anything else.** The first version consumed quota
-- and *then* inserted `on conflict do nothing`, so a retry with the same id
-- spent a second unit of the day's budget and left one row — the two numbers
-- this migration exists to keep equal, made unequal by the fix for them.
--
-- The order is now: lock the id, look, and only then spend. The advisory lock
-- is keyed on the request id, so two concurrent duplicates serialise against
-- each other and the second sees the first's row. The unique index behind it is
-- the backstop if the lock is ever bypassed.
--
-- Lock ordering is fixed — request first, then project inside
-- `consume_ai_quota` — so two admissions cannot deadlock against each other.
create or replace function observer.admit_ai_request(
  p_request_id      uuid,
  p_session         text,
  p_client_hash     text,
  p_project         text,
  p_per_minute      integer,
  p_per_hour        integer,
  p_client_per_hour integer,
  p_project_per_day integer,
  p_tenant_slug     text,
  p_project_slug    text,
  p_viewer_role     text,
  p_question_chars  integer,
  p_key_id          text
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

  -- Already admitted. Not refused and not allowed: the caller is asking about a
  -- request that has already happened, and must not start a second one.
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
      viewer_role, state, question_chars, key_id
    ) values (
      2, p_request_id, p_session, p_client_hash, p_tenant_slug, p_project_slug,
      p_viewer_role, 'started', coalesce(p_question_chars, 0), p_key_id
    );
  end if;

  return query select v_allowed, v_reason, v_retry;
end;
$$;

/* --- 5. completion: once, and never again --------------------------------- */

-- Write-once. A completed row is a record of what happened, and a record that
-- can be rewritten is not one.
--
-- Four answers, and they are genuinely different:
--
--   completed          — a started row became terminal;
--   duplicate_ignored  — the same result arrived twice; nothing changed,
--                        including `completed_at`;
--   conflict           — a *different* result arrived for a completed row.
--                        Refused and reported, because it means two executions
--                        believed they owned the same request;
--   not_found          — no such request. Should be impossible; said out loud
--                        rather than assumed away.
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
    -- An exact retry must not touch a stored value, and must not move a
    -- timestamp. `is not distinct from` so nulls compare as equal.
    select r.outcome            is not distinct from p_outcome
       and r.response_source    is not distinct from p_response_source
       and r.attempted_provider is not distinct from p_attempted_provider
       and r.attempted_model    is not distinct from p_attempted_model
       and r.model_attempted    is not distinct from coalesce(p_model_attempted, false)
       and r.model_authored     is not distinct from coalesce(p_model_authored, false)
       and r.author_model       is not distinct from p_author_model
       and r.fallback_reason    is not distinct from p_fallback_reason
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

revoke all on function observer.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text)
  from anon, authenticated, public;
revoke all on function observer.complete_ai_request(uuid, text, text, text, text, boolean, boolean, text, text, text[], integer, integer, integer, integer)
  from anon, authenticated, public;

/* --- 6. the reachable surface --------------------------------------------- */

create or replace function public.admit_ai_request(
  p_request_id      uuid,
  p_session         text,
  p_client_hash     text,
  p_project         text,
  p_per_minute      integer,
  p_per_hour        integer,
  p_client_per_hour integer,
  p_project_per_day integer,
  p_tenant_slug     text,
  p_project_slug    text,
  p_viewer_role     text,
  p_question_chars  integer,
  p_key_id          text
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select * from observer.admit_ai_request(
    p_request_id, p_session, p_client_hash, p_project,
    p_per_minute, p_per_hour, p_client_per_hour, p_project_per_day,
    p_tenant_slug, p_project_slug, p_viewer_role, p_question_chars, p_key_id
  );
$$;

comment on function public.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text) is
  'The door to the shared Ask Observer ceiling. Consuming it and recording the request are one transaction, and a repeated request id consumes nothing.';

create or replace function public.complete_ai_request(
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
language sql
security definer
set search_path = public, pg_catalog
as $$
  select observer.complete_ai_request(
    p_request_id, p_outcome, p_response_source, p_attempted_provider, p_attempted_model,
    p_model_attempted, p_model_authored, p_author_model, p_fallback_reason,
    p_tools, p_tool_calls, p_input_tokens, p_output_tokens, p_latency_ms
  );
$$;

comment on function public.complete_ai_request(uuid, text, text, text, text, boolean, boolean, text, text, text[], integer, integer, integer, integer) is
  'Records the terminal result of an admitted request, once. Returns completed, duplicate_ignored, conflict or not_found.';

revoke all on function public.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text)
  from anon, authenticated, public;
revoke all on function public.complete_ai_request(uuid, text, text, text, text, boolean, boolean, text, text, text[], integer, integer, integer, integer)
  from anon, authenticated, public;

grant execute on function public.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text)
  to service_role;
grant execute on function public.complete_ai_request(uuid, text, text, text, text, boolean, boolean, text, text, text[], integer, integer, integer, integer)
  to service_role;

/* --- 7. the old doors stay open, and stay honest -------------------------- */

-- `public.consume_ai_quota` and `public.record_ai_request` are **not** dropped
-- here. Twelve Preview deployments of this branch are still READY and still
-- call them by name, and Vercel keeps every build reachable at its own URL.
-- Dropping them is the contract migration's job, once no live deployment does.
--
-- `record_ai_request` is recreated for a different reason. It inserts a row
-- with no request id, no state and no provenance, which the constraints above
-- would now reject at `audit_version` 2. Rather than weaken the contract for
-- the sake of old callers, its writes are labelled for what they are: version
-- 1, complete on arrival, authorship unknown. An old deployment keeps working
-- and its rows keep telling the truth.
create or replace function public.record_ai_request(
  p_subject        text,
  p_client_hash    text,
  p_tenant_slug    text,
  p_project_slug   text,
  p_viewer_role    text,
  p_outcome        text,
  p_model          text,
  p_tools          text[],
  p_tool_calls     integer,
  p_input_tokens   integer,
  p_output_tokens  integer,
  p_latency_ms     integer,
  p_question_chars integer
)
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  insert into observer.ai_requests (
    audit_version, state, completed_at, response_source,
    subject, client_hash, tenant_slug, project_slug, viewer_role, outcome,
    attempted_model, tools, tool_calls, input_tokens, output_tokens, latency_ms, question_chars
  ) values (
    1, 'complete', now(), 'legacy_unknown',
    p_subject, p_client_hash, p_tenant_slug, p_project_slug, p_viewer_role, p_outcome,
    p_model, coalesce(p_tools, '{}'), coalesce(p_tool_calls, 0),
    p_input_tokens, p_output_tokens, p_latency_ms, coalesce(p_question_chars, 0)
  );
$$;

comment on function public.record_ai_request(text, text, text, text, text, text, text, text[], integer, integer, integer, integer, integer) is
  'Superseded by complete_ai_request. Kept while older deployments are still reachable; its rows are labelled audit_version 1, authorship unknown.';

revoke all on function public.record_ai_request(text, text, text, text, text, text, text, text[], integer, integer, integer, integer, integer)
  from anon, authenticated, public;
grant execute on function public.record_ai_request(text, text, text, text, text, text, text, text[], integer, integer, integer, integer, integer)
  to service_role;

/* --- 8. the diagnostic leaves the browser --------------------------------- */

-- `observer_whoami` earned its place: it proved the deployment was talking to a
-- different Supabase project by answering 200 to one caller and 404 to another.
-- That question is settled, and a release candidate should not ship a function
-- any holder of the browser key can call, however harmless its answer.
--
-- Revoked rather than dropped. It runs as the caller by design, and the server
-- still calls it to tell a wrong key apart from a wrong project.
revoke execute on function public.observer_whoami() from anon, authenticated, public;
