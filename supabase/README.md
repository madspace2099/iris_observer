# Supabase migrations

Applied to the **preview** project `IRIS OBSERVER` (`tfcchobwobpadenampyh`,
eu-west-1) — the project the Vercel Preview deployment actually reaches. No
production project exists yet.

Every file here is committed so the schema can be rebuilt from source.

## How they were applied, and what that means for the CLI

Not through the management API — the Supabase MCP tools are write-blocked from
the session that authored them. Each file was wrapped in a single transaction
and pasted into the SQL Editor by the operator, verified byte-identical to its
source file first. The Supabase CLI therefore has **no record** of them.

Before the first `supabase db push`, reconcile the history or all five will be
attempted again:

```
supabase link --project-ref tfcchobwobpadenampyh
supabase migration repair --status applied \
  20260825121909 20260825121927 20260825154900 20260825173000 20260825205000
supabase migration list
```

`repair` marks them applied without running them. They are written with
`create or replace` and `if not exists` throughout, so a re-run would not be
destructive either — but the history should say what is true.

## The project this replaced

`iris-observer-staging` (`jtvqecusxzogqubxpoyf`, eu-central-1) held these
migrations first. The Vercel Preview never reached it: the Supabase–Vercel
integration supplied `SUPABASE_URL` for a different project and overrode the
value set by hand, and five rounds of diagnosis went into establishing that the
host — not the key — was the fault. The cheaper fix was to accept the project
the integration already pointed at and build the schema there. Neither the old
staging project nor the paused legacy MVP project was deleted.

## What lives in the `observer` schema

Only what a public demonstration needs to protect itself:

- `ai_rate_buckets` — shared counters for Ask Observer;
- `ai_requests` — a redacted audit of _that_ a question happened;
- `consume_ai_quota()` — the atomic gate;
- `admit_ai_request()` — the gate plus the audit row, in one transaction;
- `complete_ai_request()` — the terminal result, idempotent;
- `prune_ai_rate_buckets()` — housekeeping.

Two functions are reachable through PostgREST, both `security definer` façades
in `public` and both granted to `service_role` alone: `admit_ai_request` and
`complete_ai_request`. `observer_whoami` is also reachable by the server key —
it tells a wrong-key 401 apart from a wrong-project 404, which cost five rounds
of diagnosis once — but no longer by a browser one.

The showroom read models are **not** here. Observer still answers from the
deterministic synthetic repository; the real ingest is a later milestone.

## The audit contract

`observer.ai_requests` holds one row per **admitted** request. A refused request
has none, because it never happened: the ceiling declines before any work, so an
admitted-request count and an audit-row count are the same number and can be
reconciled against each other.

| column                                                               | meaning                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `request_id`                                                         | Minted by the route, unique, stable across a retry.             |
| `state`                                                              | `started` at admission, `complete` when the route reports back. |
| `response_source`                                                    | `model`, `deterministic_composer`, `refusal` or `failure`.      |
| `model_authored`                                                     | Equals the `live` flag the answer sheet renders.                |
| `author_model`                                                       | The model that wrote the prose, or **null**.                    |
| `attempted_provider` / `attempted_model`                             | What was tried, whatever happened next.                         |
| `model_attempted`                                                    | Whether a model call was made at all.                           |
| `fallback_reason`                                                    | A fixed code, never a provider message.                         |
| `outcome`                                                            | The terminal outcome, null until `complete`.                    |
| `tools`, `tool_calls`, `input_tokens`, `output_tokens`, `latency_ms` | Counts and timings.                                             |
| `question_chars`                                                     | The question's _length_.                                        |

`fallback_reason` is one of `model_unavailable`, `provider_misconfigured`,
`composition_failed`, `schema_rejected` or `output_guard`.

**Never stored:** the question, the answer, any prompt, any tool argument, any
provider error body, any key, anything identifying. `subject` and `client_hash`
are opaque hashes.

### The two defects this replaced

`outcome` was `answered` whenever an answer existed and `model` held the
configured model name either way, so prose the deterministic composer wrote was
filed as a model's. And the write was fired and forgotten after the response:
the Preview admitted 153 requests and recorded 133. The row is now inserted
inside the quota transaction, and the terminal result is awaited before the
route finishes.

A row left reading `started` is an interrupted request. That is a fact worth
having, and the thing the old design could not tell apart from silence.

## Row-level security

Both tables have RLS enabled and **no policies**, deliberately. The browser
holds a publishable key, and a table with RLS on and no policy is invisible to
it. Supabase's linter reports this as `rls_enabled_no_policy` at INFO level —
that finding is the control working, not a gap.

Only the server, holding `SUPABASE_SECRET_KEY`, reaches these tables.
