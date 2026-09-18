-- Fixed windows leave rows behind once their window has passed. Nothing reads
-- them and nothing needs them: the counters are the product, not a history.
--
-- Two days of retention leaves the day buckets intact for a full day after
-- they close, which is the longest window in use.
--
-- Reconciled against the deployed `pg_proc.prosrc`. See the note in the
-- migration beside this one.
create or replace function observer.prune_ai_rate_buckets(p_keep_hours integer default 48)
returns integer
language plpgsql
security definer
set search_path = observer, pg_catalog
as $$
declare
  v_deleted integer;
begin
  delete from observer.ai_rate_buckets
   where window_start < now() - make_interval(hours => p_keep_hours);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function observer.prune_ai_rate_buckets(integer)
  from anon, authenticated, public;
