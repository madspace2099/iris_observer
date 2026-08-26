-- Observer — the rate buckets are actually pruned now.
--
-- **Forward-only, and not yet applied.**
--
-- The documentation has said for several rounds that the global browser
-- fingerprint "lives only in `ai_rate_buckets`, which holds nothing older than
-- the longest window in use and is pruned". The first half was true. The second
-- was not: `observer.prune_ai_rate_buckets` existed and *nothing called it*.
--
-- Read-only inspection of the live database, before this file was written:
--
--   observer.consume_ai_quota calls prune_ai_rate_buckets   false
--   observer.admit_ai_request calls prune_ai_rate_buckets   false
--   pg_cron installed                                       0
--   triggers on the observer schema                         0
--   buckets present                                         78
--   oldest bucket                                           37 hours old
--
-- Thirty-seven hours is inside the forty-eight the function would have
-- enforced, so no row had yet outlived the stated retention — but only because
-- the deployment is young. Nothing was going to remove them. A retention claim
-- that rests on a function nobody invokes is a claim about a function, not
-- about data.
--
-- `pg_cron` is not installed and installing it is a change to the project's
-- extensions that this milestone should not make. Retention is therefore
-- opportunistic and bounded: admission prunes, at most once an hour, and only
-- when it can take the lock without waiting.

/* --- when the last prune happened ----------------------------------------- */

create table if not exists observer.maintenance (
  id             smallint primary key,
  last_pruned_at timestamptz not null
);

comment on table observer.maintenance is
  'One row. When retention last ran, so admission can prune on a schedule rather than on every request.';

alter table observer.maintenance enable row level security;
revoke all on observer.maintenance from anon, authenticated, public;

/* --- prune, but rarely ----------------------------------------------------- */

-- Bounded three ways, because this runs inside a request:
--
--   * `pg_try_advisory_xact_lock` never waits. Under concurrency exactly one
--     transaction holds it and the others skip pruning entirely — they do not
--     queue behind a delete;
--   * the hourly guard means the delete runs at most once an hour however many
--     requests arrive;
--   * the retention window is the caller's, defaulted to the 48 hours the
--     original function documented — a full day beyond the longest window in
--     use, so a bucket is never removed while it could still be counted.
--
-- It returns the number of rows removed so a test can assert on it, and 0 when
-- it decided not to run.
create or replace function observer.prune_if_due(p_keep_hours integer default 48)
returns integer
language plpgsql
security definer
set search_path = observer, pg_catalog
as $$
declare
  v_deleted integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('observer.prune')) then
    return 0;
  end if;

  if exists (
    select 1 from observer.maintenance
     where id = 1 and last_pruned_at > now() - interval '1 hour'
  ) then
    return 0;
  end if;

  v_deleted := observer.prune_ai_rate_buckets(p_keep_hours);

  insert into observer.maintenance (id, last_pruned_at)
  values (1, now())
  on conflict (id) do update set last_pruned_at = now();

  return v_deleted;
end;
$$;

revoke all on function observer.prune_if_due(integer) from anon, authenticated, public;

/* --- admission calls it ---------------------------------------------------- */

-- The only change to the function is one `perform` at the top. It is deliberately
-- *before* everything else: a request that is about to be refused as a duplicate,
-- or rejected for an incoherent scheme, is as good an opportunity to prune as one
-- that is admitted, and putting it first keeps retention independent of whether
-- the request succeeded.
--
-- `create or replace` with the identical signature, so nothing is dropped and no
-- overload can appear. This migration is rerunnable for the same reason.
create or replace function observer.admit_ai_request(
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
language plpgsql
security definer
set search_path = observer, pg_catalog
as $$
declare
  v_allowed boolean;
  v_reason  text;
  v_retry   integer;
  v_version integer := coalesce(p_pseudonym_version, 1);
  v_scoped  boolean := p_audit_client_hash is not null
                       and length(btrim(p_audit_client_hash)) > 0;
begin
  -- Retention, bounded to at most once an hour and never blocking.
  perform observer.prune_if_due();

  if p_request_id is null then
    return query select false, 'duplicate_request', 0;
    return;
  end if;

  /*
   * The scheme and the hash must agree, and disagreeing is refused before a
   * single unit is spent. See 20260826120000 for why: independently
   * `coalesce`d arguments let a row store the global hash under a label saying
   * tenant-scoped.
   */
  if not (
       (not v_scoped and v_version = 1)
    or (v_scoped and v_version = 2 and p_audit_client_hash is distinct from p_client_hash)
  ) then
    return query select false, 'invalid_admission', 0;
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
      case when v_scoped then p_audit_client_hash else p_client_hash end,
      p_tenant_slug, p_project_slug,
      p_viewer_role, 'started', coalesce(p_question_chars, 0), p_key_id,
      v_version::smallint
    );
  end if;

  return query select v_allowed, v_reason, v_retry;
end;
$$;

revoke all on function observer.admit_ai_request(uuid, text, text, text, integer, integer, integer, integer, text, text, text, integer, text, text, integer)
  from anon, authenticated, public;

-- The signature is unchanged, so PostgREST's cached picture is still correct.
-- The notification costs nothing and removes the question.
notify pgrst, 'reload schema';
