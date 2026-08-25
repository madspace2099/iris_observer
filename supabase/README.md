# Supabase migrations

Applied to the **staging/preview** project `iris-observer-staging`
(`jtvqecusxzogqubxpoyf`, eu-central-1). No production project exists yet.

Every file here has been applied to that project through the Supabase
management API and is committed so the schema can be rebuilt from source.

## What lives in the `observer` schema

Only what a public demonstration needs to protect itself:

- `ai_rate_buckets` — shared counters for Ask Observer;
- `ai_requests` — a redacted audit of *that* a question happened;
- `consume_ai_quota()` — the atomic gate;
- `prune_ai_rate_buckets()` — housekeeping.

The showroom read models are **not** here. Observer still answers from the
deterministic synthetic repository; the real ingest is a later milestone.

## Row-level security

Both tables have RLS enabled and **no policies**, deliberately. The browser
holds a publishable key, and a table with RLS on and no policy is invisible to
it. Supabase's linter reports this as `rls_enabled_no_policy` at INFO level —
that finding is the control working, not a gap.

Only the server, holding `SUPABASE_SECRET_KEY`, reaches these tables.
