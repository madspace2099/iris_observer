-- A reachable façade, and nothing else reachable.
--
-- The `observer` schema is not exposed to PostgREST — "Invalid schema:
-- observer. Only the following schemas are exposed: public, graphql_public" —
-- so `/rest/v1/rpc/consume_ai_quota` with `Accept-Profile: observer` answered
-- 406 on every call, and the shared ceiling was never once consumed over the
-- transport the application actually uses.
--
-- Nothing caught it. The function had been driven past all four of its limits
-- and the migrations reconciled byte for byte — all through `execute_sql`,
-- which speaks to Postgres directly and skips PostgREST entirely. A control
-- verified by a different route than the one production takes is a control
-- nobody has verified.
--
-- Exposing the whole `observer` schema would make the counters and the audit
-- readable through the API. Instead two `security definer` functions live in
-- `public`, where PostgREST can see them, and do their work inside `observer`,
-- where nothing else can. The tables stay invisible: with the publishable key,
-- `consume_ai_quota` answers 401 and both `record_ai_request` and the
-- `ai_requests` table answer 404.

create or replace function public.consume_ai_quota(
  p_session         text,
  p_client_hash     text,
  p_project         text,
  p_per_minute      integer,
  p_per_hour        integer,
  p_client_per_hour integer,
  p_project_per_day integer
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select * from observer.consume_ai_quota(
    p_session, p_client_hash, p_project,
    p_per_minute, p_per_hour, p_client_per_hour, p_project_per_day
  );
$$;

comment on function public.consume_ai_quota(text, text, text, integer, integer, integer, integer) is
  'The only reachable door to the shared Ask Observer ceiling. The counters it moves are not exposed.';

-- The audit is a table, and a table cannot be wrapped — so the insert is a
-- function too, for the same reason: `observer.ai_requests` must not become
-- readable just because something needs to write to it.
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
    subject, client_hash, tenant_slug, project_slug, viewer_role, outcome,
    model, tools, tool_calls, input_tokens, output_tokens, latency_ms, question_chars
  ) values (
    p_subject, p_client_hash, p_tenant_slug, p_project_slug, p_viewer_role, p_outcome,
    p_model, coalesce(p_tools, '{}'), coalesce(p_tool_calls, 0),
    p_input_tokens, p_output_tokens, p_latency_ms, p_question_chars
  );
$$;

comment on function public.record_ai_request(text, text, text, text, text, text, text, text[], integer, integer, integer, integer, integer) is
  'Records that a question happened. Never what it said. The table it writes to is not exposed.';

-- Reachable is not the same as public. Only the server-side secret key, which
-- authenticates as `service_role`, may call either of these.
revoke all on function public.consume_ai_quota(text, text, text, integer, integer, integer, integer)
  from anon, authenticated, public;
revoke all on function public.record_ai_request(text, text, text, text, text, text, text, text[], integer, integer, integer, integer, integer)
  from anon, authenticated, public;

grant execute on function public.consume_ai_quota(text, text, text, integer, integer, integer, integer)
  to service_role;
grant execute on function public.record_ai_request(text, text, text, text, text, text, text, text[], integer, integer, integer, integer, integer)
  to service_role;
