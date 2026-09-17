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
- `admit_ai_request()` — the gate plus the audit row, in one transaction, and
  a repeated request id consumes nothing;
- `complete_ai_request()` — the terminal result, written once;
- `prune_ai_rate_buckets()` — the delete itself;
- `run_rate_bucket_retention()` — what the scheduled job calls: the delete plus
  a record of the run in `maintenance`. Private, and never in a request path.

Reachable through PostgREST, every one a `security definer` façade in `public`
granted to `service_role` alone: `admit_ai_request`, `complete_ai_request`, and
— during the expand phase only — the superseded `consume_ai_quota` and
`record_ai_request`. `observer_whoami` is reachable by the server key, which
uses it to tell a wrong-key 401 apart from a wrong-project 404; no browser role
may execute anything in `public`.

## The catalogue and the connectors — executed, not applied

`20260907100000_observer_catalogue_and_connectors.sql` (ADR-0036) adds five
tables under the ingestion owner (it already owns `projects`, and a table with
RLS on and no policy shows its rows to its owner alone — a separate owner saw
the table and none of its rows):
`connector_configs`, `connector_credentials` (sealed by the application,
exactly as `account_credentials` is), `catalogue_units` (the current snapshot,
withdrawn rather than deleted), `catalogue_changes` (append-only, trigger-
enforced) and `catalogue_syncs` (every attempt, refused ones included). Nine
`security definer` façades in `public`, every one taking `p_account` first and
resolving the project through it; `service_role` alone may execute them.

It has been **executed against PGlite on every test run**
(`supabase/test/catalogue-connectors.test.ts`, which also asserts the grants
by asking PostgreSQL) and **applied to no hosted project**. Add it to the
`migration repair` list above when it is.

## The deals — executed, not applied

`20260907180000_observer_deals.sql` (ADR-0021, ADR-0036 decision 4) adds
three tables under the same owner: `deals_current` (the snapshot, withdrawn
by membership rather than by comparing fetch instants, and refusing any row
that carries an email, phone, name or customer field), `deal_stage_changes`
(append-only `deal.stage.changed` facts keyed by their own SHA-256 event id,
so a replayed sync conflicts and inserts nothing) and `deal_syncs`. Five
façades: `observer_deals_apply`, `observer_deals_current`,
`observer_deal_changes`, `observer_deal_sync_record`, `observer_deal_sync_last`;
`service_role` alone may execute them, and no browser role may read a table.

Executed against PGlite on every test run (`supabase/test/deals-connectors.test.ts`),
applied to no hosted project. It depends on the catalogue migration above;
apply them in order, and add both to the `migration repair` list when they are.

## The project event read — executed, not applied

`20260917100000_observer_events_for_project.sql` (ADR-0038) adds one façade and no table:
`observer_events_for_project`, the read that turns stored showroom events back into the meetings
the customer's screens draw. It answers one page of a project's session-scoped events behind an
opaque keyset cursor, never more than a thousand rows, because PostgREST cuts a response at its
`max-rows` and says nothing; `readProjectEvents` in `packages/sources` pages until a page comes
back empty. `diagnostic.%` and events with no session are left out in the SQL.

`service_role` alone may execute it; `anon`, `authenticated` and `PUBLIC` are refused, and the
table stays closed to every role (`supabase/test/events-for-project.test.ts` asks PostgreSQL). It
drops the function before creating it, so it can be applied over itself and over its first draft,
which the same test does.

Executed against PGlite on every test run and on every start of the local control plane, applied
to no hosted project. It depends only on `20260902100000_observer_analytics_events.sql`. Until it
is applied a deployment behaves exactly as before: the application treats a failed event read as
"no ingested meetings" and keeps delivering a connector's. Add it to the `migration repair` list
when it is.

## The project directory — executed, not applied

`20260918100000_observer_project_directory.sql` (`docs/21-self-served-projects.md`) is what lets a
project created in administration become a customer dashboard. Three tables: `observer.tenants`
(a developer: a name and a globally unique slug, with the application's own route names refused),
`observer.project_viewers` (who may open a project, kept with its revocations), and
`observer.project_agents` (the display name behind an `agent_id`, **the only place in this domain
that holds a person's name**). `observer.projects` gains a developer, a currency, a locale and a
time zone, and a trigger refuses to move a project or change its slug once it has an address.

Eleven façades in the spine's posture. Ten take `p_account` first and filter on it. The eleventh,
`observer_source_agents_report(p_source, p_agents)`, is called for a showroom that authenticated
with its source credential (`POST /functions/v1/observer-agents`, `PD-30`): it reads the project
from the source, takes names only for an active source, and never overwrites a name an
administrator set. `service_role` alone may execute any of them, the tables are closed to every
role with row level security enabled and no policy, and
`supabase/test/project-directory.test.ts` asks PostgreSQL for each of those facts. Every function
is dropped before it is created and every constraint is added behind a catalogue check, so the file
applies over itself, which the local control plane does on every start.

Executed against PGlite on every test run and on every start of the local control plane, applied
to no hosted project. It depends on the identity spine (`observer.projects`,
`observer.project_sources`) and the event store (`observer.analytics_events`, for the presenters a
showroom has been seen to send). Until it is applied a deployment behaves exactly as before: the directory read fails,
the application falls back to the older project list, no runtime project appears, and
`observer-agents` answers `503`. Add it to the `migration repair` list when it is.

## Expand and contract

The audit change ships as two migrations, and the second must wait.

`20260825205000` **expands**: it adds columns, back-fills the rows that were
already there, adds constraints and adds the new functions. It removes nothing.
The two superseded façades keep working, and `record_ai_request` is rewritten so
its rows are labelled `audit_version` 1 with authorship unknown rather than
violating the new constraints.

`20260826090000` **contracts**: it drops those two façades. Applying it early
breaks every deployment still calling them — and Vercel keeps _every_ build
reachable at its own URL, so "Production has been promoted" is not the
condition. Twelve Preview deployments of `release/observer-demo-rc1` were READY
when this was written, each one calling the old names.

The empirical check, which is the one worth trusting:

```sql
select max(occurred_at) from observer.ai_requests where audit_version = 1;
```

A recent timestamp means somebody is still writing through the old door.

The showroom read models are **not** here. Observer still answers from the
deterministic synthetic repository; the real ingest is a later milestone.

## The audit contract

`observer.ai_requests` holds one row per **admitted** request. A refused request
has none, because it never happened: the ceiling declines before any work, so an
admitted-request count and an audit-row count are the same number and can be
reconciled against each other.

| column                                                               | meaning                                                                                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `request_id`                                                         | Minted by the route, unique, stable across a retry.                                                                         |
| `key_id`                                                             | Which pseudonym **key** produced `subject` and `client_hash`. Sixteen hex characters of an HMAC of that key, never the key. |
| `pseudonym_version`                                                  | Which **derivation** produced them. 1 = viewer-only, cross-tenant linkable. 2 = tenant-scoped.                              |
| `state`                                                              | `started` at admission, `complete` when the route reports back.                                                             |
| `response_source`                                                    | `model`, `deterministic_composer`, `refusal` or `failure`.                                                                  |
| `model_authored`                                                     | Equals the `live` flag the answer sheet renders.                                                                            |
| `author_model`                                                       | The model that wrote the prose, or **null**.                                                                                |
| `attempted_provider` / `attempted_model`                             | What was tried, whatever happened next.                                                                                     |
| `model_attempted`                                                    | Whether a model call was made at all.                                                                                       |
| `fallback_reason`                                                    | A fixed code, never a provider message.                                                                                     |
| `outcome`                                                            | The terminal outcome, null until `complete`.                                                                                |
| `tools`, `tool_calls`, `input_tokens`, `output_tokens`, `latency_ms` | Counts and timings.                                                                                                         |
| `question_chars`                                                     | The question's _length_.                                                                                                    |

`fallback_reason` is one of `model_unavailable`, `provider_misconfigured`,
`composition_failed`, `schema_rejected` or `output_guard` — an allow-list the
database enforces, which is also what keeps a provider error message out of the
column.

Nine named check constraints hold the rest, and `supabase/test/audit-contract.test.ts`
runs every migration against a real Postgres to prove they do: an author named
beside a fallback, `model` as a source with no author, a state nobody defined and
a version-2 row with no request id are all rejected by the database rather than
by a convention.

**Never stored:** the question, the answer, any prompt, any tool argument, any
provider error body, any key, anything identifying. `subject` and `client_hash`
are keyed HMACs under `OBSERVER_SUBJECT_PEPPER`, which is mandatory and derived
from nothing — a deployment without it refuses every question rather than
falling back to something that merely looks configured.

`key_id` names the key those pseudonyms were made with; `pseudonym_version`
names the algorithm. Both are needed, because either can change without the
other: rotating the pepper changes the key id and leaves the scheme alone, and
tenant-scoping changed every pseudonym while leaving the pepper — and therefore
the key id — untouched. Two rows differing in either hold subjects that cannot
be compared: unrelated strings, not one viewer twice.

Both are stored per row rather than only logged at startup, because a boot line
ages out of a platform's retention and the question a rotation raises — _why did
the counters restart on the 14th?_ — is asked afterwards.

### Two client identifiers, and only one is kept

The per-client hourly ceiling exists to catch one browser hammering the
demonstration, including across tenants, so its bucket key is a **global**
fingerprint. That value lives only in `ai_rate_buckets` and never reaches the
durable audit.

**Retention was claimed twice before it existed.** This paragraph used to end
"and is pruned". `prune_ai_rate_buckets` was there; nothing called it — not the
ceiling, not admission, no `pg_cron` job, no trigger — so buckets accumulated
indefinitely and the promise rested on a function nobody invoked.

The correction was worse in an interesting way: it called the pruning function
from `admit_ai_request` and called the result "bounded". Cleanup driven by
traffic is opportunistic garbage collection. With no requests nothing runs, so
row age is unbounded no matter how often the delete is _permitted_ to happen —
and it put a `delete` in the path an answer waits on.

Migration `20260826140000` schedules it instead. One `pg_cron` job,
`observer-prune-ai-rate-buckets`, hourly on the hour, running
`select observer.run_rate_bucket_retention(48);`. Nothing in the request path.
State it precisely and it is defensible:

|                          |                                                    |
| ------------------------ | -------------------------------------------------- |
| deletion threshold       | 48 hours                                           |
| scheduled frequency      | hourly                                             |
| expected maximum row age | ~49 hours **while the scheduler is healthy**       |
| monitoring               | separate and required (`observer-cron-health.sql`) |
| guarantee                | none — a stopped scheduler stops deleting          |

`pg_cron` is **not installed on this project**. Enabling it is an explicit
operator precondition — `supabase/prerequisites/observer-cron-prerequisite.sql`
— and the migration aborts rather than reporting success without it.

The migration owns **one job name** and touches nothing else in `cron.job`. An
earlier draft unscheduled anything whose command mentioned an Observer function;
that would have deleted scheduled work belonging to somebody else. A differently
named job that appears to target Observer retention now stops the migration
before it writes anything, and a person decides what that job is for. See
`docs/18-deployment.md`.

## Four different questions, and only one of them is about the database

"Does `3f298a6` work?" collapsed four properties into one word for several
rounds, and the answer was different for each of them:

|                                          |                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **database RPC signature compatibility** | Proven. Its 13-key call resolves against the 15-parameter function through the defaults, asserted from the catalogue and against a real Postgres.                                    |
| **application runtime readiness**        | **Not proven.** `3f298a6` is the commit that made `OBSERVER_SUBJECT_PEPPER` mandatory: without it the gate returns 503 for every question, before admission and before an audit row. |
| **environment configuration**            | **Unknown from here.** The Vercel tooling available exposes projects, deployments and protection settings — never environment-variable names, scopes or values.                      |
| **observed HTTP behaviour**              | **Never attempted.** No request has been made to any deployment from this work.                                                                                                      |

A signature that resolves says nothing about a deployment that refuses every
question before reaching it. Nothing in this release may describe `3f298a6` as
currently answering questions until the fourth row has been demonstrated.

**And UNKNOWN is not ABSENT.** What is proven is that the existing deployment
retains the environment snapshot captured when it was built, and that later
project-level changes do not alter it — Vercel applies them only to new
deployments. What is _not_ known is whether that snapshot contains the variable
at all. That deployment may answer or may return 503; neither has been observed.

It is excluded from the controlled legacy proof because its configuration is
**unverified**, not because it has been shown to fail. A **fresh redeploy of the
same SHA**, built after the pepper state is settled, is the required controlled
target either way. See `docs/18-deployment.md`.

## Verifiers

Version-controlled under `supabase/verifiers/`, because a verifier with a bug in
it is worse than no verifier — it reports PASS. All four are read-only, and
three of them are executed by the test suite against a real Postgres.

- `observer-contract-readiness.sql` — the pre-contract report, and it can never
  say READY. Its external gate covers TWO capabilities, and they take DIFFERENT
  remedies:

  | Capability                                                           | Remedy                    |
  | -------------------------------------------------------------------- | ------------------------- |
  | calls a legacy façade (`consume_ai_quota`, `record_ai_request`)      | **DELETE or PROTECT**     |
  | reaches thirteen-argument admission, writing `pseudonym_version = 1` | **DELETE. Nothing else.** |

  The remedies differ because the contract migration actually removes the
  façade functions, so a protected build that calls them has nothing left to
  call. It does **not** disable thirteen-argument admission — migration 3 keeps
  that resolving through two defaulted parameters, deliberately — so protection
  leaves the cross-tenant-linkable write reachable by anybody who can sign in.
  That is every `3f298a6` build, the fresh proof deployment included.

  `1ee5d2d` is neither: it calls no façade, and its twelve-argument admission
  stopped resolving when the expand migration added `p_key_id`.

- `observer-ai-readiness.sql` — 11 checks, and a different question from the one
  above. The compatibility proof accepts `deterministic_composer` as a complete
  pass, correctly, because its subject is the database path. Observer answers
  without a model by design, so a deployment with no `OPENAI_API_KEY` reads
  13/13 there while never calling one. This gate takes the exact
  `X-Observer-Request-Id` and requires `response_source = 'model'`,
  `model_attempted`, `model_authored`, no `fallback_reason`, and the authoring
  model equal to the attempted one. When the answer came from the composer it
  says so in words: _Observer application works, but live AI is not yet
  enabled._ `e2e/observer-live.spec.ts` proves the same fact from the screen.
- `observer-cron-health.sql` — 26 checks on the scheduled retention: the
  extension, the scheduler process, the job's exact name, schedule, command,
  database and owner, the function's `SECURITY DEFINER` and fixed `search_path`,
  every browser-role privilege, and — the part a catalogue check cannot give
  you — whether it has actually **run**, recently and successfully.
- `observer-http-compat-proof.sql` — the deployed-build proof, for rollout steps
  4–5 (the deployed legacy build) and step 9 (the new one). One file, four
  modes, chosen by parameter rather than by editing predicates:

  |                       | `pseudonym_version` | cross-tenant hashes | audit delta |
  | --------------------- | ------------------- | ------------------- | ----------- |
  | `legacy`, one tenant  | 1                   | —                   | 1           |
  | `legacy`, two tenants | 1                   | **equal**           | 2           |
  | `scoped`, one tenant  | 2                   | —                   | 1           |
  | `scoped`, two tenants | 2                   | **different**       | 2           |

  Both hash expectations are correct behaviour for their build — version 1
  stores the tenant-blind global fingerprint, version 2 a per-tenant one — and
  every mode can return an all-PASS result. Nothing is "inverted" by the reader.

  **What each mode actually proves is different, and the file says so.** The
  deployed `3f298a6` build returns its request id nowhere, so its mode is a
  time-bounded controlled correlation: exactly one row matching four properties
  you chose, with every other row in the window named and failed. That is not
  the same claim as _this row came from that request_.

  Row 1 also refuses a configuration outside the four defined modes even when
  the surplus parameter would never be read — a sibling id in scoped one-tenant
  mode, a null `expected_build`, a null `cross_tenant_done`. Unused is not
  permitted, and there is now one definition of validity rather than two.

  For the new build, **exact** means all six of these together, per request —
  never a request id on its own:

  ```
  request id + time floor + tenant + project + viewer role + question length
  ```

  The controlled properties are required in every mode; a supplied request id is
  an additional constraint on top of them, never a replacement for them. Any
  valid UUID identifies _some_ row, and a row found by the wrong id — or by the
  sibling request's id — is not the request the operator made. Two-tenant scoped
  mode requires **both** ids and they must differ; legacy mode takes none at
  all. Row 1 refuses every other combination before anything else can read PASS.

`ai_requests.client_hash` is a **tenant-scoped** fingerprint instead. A global
one there would let anybody holding the durable table follow a browser between
customers — the same cross-tenant linkability the subject had, arriving by a
different column. The subject is scoped the same way, by the canonical tenant id
the repository returns _after_ authorising the viewer, never by the slug in the
request body.

### The two defects this replaced

`outcome` was `answered` whenever an answer existed and `model` held the
configured model name either way, so prose the deterministic composer wrote was
filed as a model's. And the write was fired and forgotten after the response:
the Preview admitted 153 requests and recorded 133. The row is now inserted
inside the quota transaction, and the terminal result is awaited before the
route finishes.

A row left reading `started` is an interrupted request. That is a fact worth
having, and the thing the old design could not tell apart from silence.

Admission is retry-safe: it takes an advisory lock on the request id, looks for
an existing row, and only then spends. A repeated id returns `duplicate_request`
having consumed nothing. Completion is write-once: only a `started` row becomes
terminal, an exact retry is ignored without moving `completed_at`, and a
conflicting second result is refused and logged.

## Row-level security

Both tables have RLS enabled and **no policies**, deliberately. The browser
holds a publishable key, and a table with RLS on and no policy is invisible to
it. Supabase's linter reports this as `rls_enabled_no_policy` at INFO level —
that finding is the control working, not a gap.

Only the server, holding `SUPABASE_SECRET_KEY`, reaches these tables.
