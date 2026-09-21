-- IRIS Observer — Supabase Cron prerequisite.
--
-- CRON PREREQUISITE PHASE. Run it AFTER the application-readiness phase has
-- proved a deployment can answer, and BEFORE
-- `20260826140000_observer_bucket_retention.sql`.
--
-- Phase names rather than step numbers, deliberately: the numbered sequence has
-- been renumbered three times and an operator following a stale "step 1" inside
-- a SQL file would run the database work before the application was known to
-- work at all. The authoritative order lives in `docs/18-deployment.md`.
--
-- Target project : IRIS OBSERVER  (ref tfcchobwobpadenampyh)
--
-- ## Why this is not a migration
--
-- `pg_cron` is a project-level extension, not an Observer object.
--
--   * `drop extension pg_cron` permanently deletes every job in the project,
--     Observer's and anybody else's. That lifecycle belongs to whoever owns the
--     project, not to a table migration that happens to want a scheduler.
--   * A restricted role running `supabase db push` cannot create extensions.
--     The retention migration should fail for its own reasons, not that one.
--   * It is a change to the project's surface, and it should be a decision
--     somebody makes, not a side effect somebody discovers.
--
-- The retention migration therefore asserts this has been done and refuses,
-- loudly, if it has not. See its section 0.
--
-- ## Provenance
--
-- Copied from the official Supabase documentation, "Cron -> Install", SQL tab:
-- https://supabase.com/docs/guides/cron/install
--
-- Verified against this project on 2026-08-26 by read-only inspection: pg_cron
-- is AVAILABLE at version 1.6.4 and NOT INSTALLED (`installed_version` null).
-- 1.6.4 is the version Supabase's own troubleshooting guide recommends; it is
-- the one with the scheduler auto-revive fixes.
--
-- The Dashboard route is equivalent and is fine to use instead:
--   Integrations -> Cron -> enable the `pg_cron` extension.
--
-- ## What it costs
--
-- `pg_cron` runs one background worker and stores jobs in a new `cron` schema.
-- Supabase's guidance is no more than 8 concurrent jobs; Observer adds exactly
-- one, hourly.
--
-- One caveat worth knowing before you run it: `cron.job_run_details` is NOT
-- cleaned up automatically. One hourly job writes roughly 8 800 rows a year.
-- That is small, but it is not zero, and Supabase's upgrade guide calls out
-- oversized `job_run_details` tables as a cause of upgrade failures. Prune it
-- if this project ever gains more jobs.

create extension pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Confirm before moving on. Expect one row: pg_cron, 1.6.4.
select extname, extversion from pg_extension where extname = 'pg_cron';
