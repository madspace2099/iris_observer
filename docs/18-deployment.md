# Deployment runbook

**Status:** deployed and verified · **Last updated:** 2026-08-24

Everything a future session needs to maintain this deployment without asking for an identifier
twice. **No secret value appears in this file, and none may be added to it.**

---

## 1. What this deployment is, and is not

| It is                                        | It is not                                   |
| -------------------------------------------- | ------------------------------------------- |
| Deterministic synthetic Observer data        | connected to any real project, buyer or CRM |
| A scenario selector at `/sign-in`            | production authentication                   |
| A Supabase staging project, empty on purpose | a database the application reads from       |
| A Preview deployment for review              | promoted to Production                      |

`OBSERVER_DATA_SOURCE=synthetic` is the switch. It stays `synthetic` until a milestone changes it
deliberately: pointing a finished interface at an empty database is not a migration.

---

## 2. Cloud resources

### GitHub

|            |                                                 |
| ---------- | ----------------------------------------------- |
| Repository | `https://github.com/madspace2099/iris_observer` |
| Visibility | public                                          |
| Branch     | `main` (production branch)                      |
| State      | pushed — 15 commits                             |

**Access resolved.** `asbothmate95` was added as a collaborator on 2026-08-24; the first push had been
refused with `403 Permission denied`. Pushing works:

```bash
git push origin main
```

Never force-push. Never rewrite remote history. If the remote has diverged, push to
`release/m2-spatial-lab` and open a pull request rather than merging automatically.

### Supabase

|                    |                                     |
| ------------------ | ----------------------------------- |
| Organization       | `sekhesnlqiutdovgcoqw`              |
| Project name       | `IRIS OBSERVER`                     |
| Project ref        | `tfcchobwobpadenampyh`              |
| Region             | `eu-west-1`                         |
| Created            | 2026-08-24                          |
| Status             | `ACTIVE_HEALTHY`                    |
| Postgres           | 17.6                                |
| Cost               | €0/month                            |
| Tables in `public` | **none** — three RPC functions only |

**This is the project the Vercel Preview reaches.** It was not the first choice.
`iris-observer-staging` (`jtvqecusxzogqubxpoyf`, eu-central-1) was provisioned for this and holds
the same migrations, but the Supabase–Vercel integration injects `SUPABASE_URL` for the project
_it_ is linked to, which overrode every hand-set value. Rather than untangle the integration, the
schema was built in the project the integration already pointed at. Neither other project was
deleted.

**The old project is deliberately not reused.** `asboth.mate@madspace.co.uk's Project`
(`vrhrzlvhyxrkxxcjxmaf`, `eu-west-1`, `INACTIVE`) belongs to the obsolete MVP and previously served
rows to unauthenticated callers. It is left alone: not deleted, not modified, not connected.

### Vercel

|                   |                                                                |
| ----------------- | -------------------------------------------------------------- |
| Team              | `madspace's projects` (`team_DcZjnqXKYp579zibvXU3UiNE`)        |
| Plan              | **hobby**                                                      |
| Project           | `iris-observer` (`prj_4pqpmpB8VwLbq06V1TTd3zTWp15p`)           |
| Linked repository | `madspace2099/iris_observer`, production branch `main`         |
| Root directory    | `apps/web`                                                     |
| Region            | `fra1`                                                         |
| Live URL          | `https://iris-observer.vercel.app`                             |
| Branch alias      | `https://iris-observer-git-main-madspaces-projects.vercel.app` |

**It deployed to Production, not to Preview.** `create_git_project` deploys from the linked
repository's production branch, and `main` is that branch, so the deployment took the `target:
production` path and the production alias. That was not the intent — the checkpoint asked for a
Preview — and it is recorded here rather than quietly accepted.

It is not harmful in this state: the data is entirely synthetic, every screen carries the synthetic
badge, the response carries `X-Robots-Tag: noindex, nofollow, noarchive`, and `/sign-in` states that
it is not production authentication. Nothing was deleted to "fix" it, per §9.

To get a genuine Preview for review, push a branch other than `main`; Vercel builds every branch as a
Preview automatically. To make Production point somewhere else later, promote the chosen deployment
(§8) rather than deleting this one.

---

## 3. Vercel build configuration

Determined from the workspace, not assumed:

| Setting          | Value                         | Why                                                                                                                        |
| ---------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Root Directory   | `apps/web`                    | `@observer/web` is the only deployable. Vercel's pnpm-workspace support installs from the repository root and builds here. |
| Framework        | Next.js                       | pinned in `apps/web/vercel.json`                                                                                           |
| Region           | `fra1`                        | pinned in `apps/web/vercel.json`; same city as the Supabase project                                                        |
| Install command  | Vercel default                | it reads `packageManager: pnpm@11.23.0` and the committed `pnpm-lock.yaml`, and installs frozen                            |
| Build command    | Vercel default (`next build`) | the same path `pnpm --filter @observer/web build` runs locally                                                             |
| Output directory | Vercel default (`.next`)      |                                                                                                                            |
| Node             | 22.x                          | root `package.json` declares `engines.node >= 22`                                                                          |

**Do not** set an explicit install command. The five `@observer/*` packages are consumed as TypeScript
source (ADR-0003, `transpilePackages`), so the build needs the whole workspace present — which is
exactly what Vercel's monorepo handling provides and what a hand-written install command would break.

---

## 4. Environment variables

Names only. Values live in Vercel and Supabase and are never copied into this repository, a commit, a
log, a screenshot or a chat message.

### Preview environment

| Variable                               | Scope           | Sensitive | Value                                                             |
| -------------------------------------- | --------------- | --------- | ----------------------------------------------------------------- |
| `OBSERVER_DATA_SOURCE`                 | build + runtime | no        | `synthetic`                                                       |
| `OBSERVER_ENVIRONMENT`                 | build + runtime | no        | `staging`                                                         |
| `NEXT_PUBLIC_SUPABASE_URL`             | build + runtime | no        | from the staging project                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build + runtime | no        | from the staging project                                          |
| `SUPABASE_URL`                         | runtime         | no        | from the staging project                                          |
| `SUPABASE_SECRET_KEY`                  | runtime         | **yes**   | from the staging project                                          |
| `FAL_KEY`                              | runtime         | **yes**   | optional; without it Ask Observer uses the deterministic provider |
| `OBSERVER_LLM_PROVIDER`                | runtime         | no        | `fal-openrouter`                                                  |
| `OBSERVER_LLM_MODEL`                   | runtime         | no        | `google/gemini-2.5-flash` (ADR-0024)                              |

Rules that are not negotiable:

- never prefix a secret with `NEXT_PUBLIC_`;
- never use the legacy `anon` / `service_role` names on this project — it was created under the
  publishable/secret key model, and the names say which is which;
- mark `SUPABASE_SECRET_KEY` and `FAL_KEY` **sensitive** in Vercel;
- do not copy a local `.env` file into Vercel;
- if the Vercel–Supabase integration creates these variables itself, verify and use those rather than
  creating conflicting duplicates.

`apps/web/src/lib/env.ts` validates all of it server-side. It returns a report of booleans and enums —
there is no path from it to a value — and it logs the posture once per server process from
`apps/web/src/instrumentation.ts`. A missing Supabase variable is a stated warning while the data
source is synthetic, not a failed build.

---

## 5. Preview access

**The plan is `hobby`, so Vercel Deployment Protection is not available.** Preview deployments on
Hobby are publicly reachable by URL.

The runbook's fallback is therefore in force, and all of it is already implemented:

| Requirement                       | Where                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| All data synthetic                | `OBSERVER_DATA_SOURCE=synthetic`; the top bar carries a `Synthetic demonstration data` badge on every screen |
| Clear staging indication          | the same badge, plus `data-environment="staging"` on `<html>`                                                |
| `noindex, nofollow`               | `robots` metadata in `apps/web/src/app/layout.tsx`, driven by `isStaging()`                                  |
| `X-Robots-Tag`                    | `apps/web/next.config.ts` → `noindex, nofollow, noarchive`, verified on a running build                      |
| Not presented as production login | `/sign-in` states "not production authentication"; a Playwright test asserts it                              |

Upgrading the team to Pro would allow Vercel Authentication on Preview. That is a billing decision and
is not made here.

The design-laboratory routes (`/lab/*`) stay reachable for review and remain declared MADSPACE-only in
`apps/web/src/lib/routes.ts`.

---

## 6. Security headers

Set in `apps/web/next.config.ts` and verified against a running production build:

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
X-Robots-Tag: noindex, nofollow, noarchive        (staging only)
```

**A full Content-Security-Policy is deliberately absent.** Next injects inline bootstrap scripts, so a
real CSP needs a nonce and middleware to issue it. An untested CSP that breaks the application is
worse than none; it belongs with production hardening, tested against a deployment.

Session cookies are `httpOnly`, `sameSite=lax`, and `secure` whenever `NODE_ENV === "production"` —
which a Vercel deployment is.

### `X-Observer-Request-Id`

One further response header, and it is a verification aid rather than a control:

```
X-Observer-Request-Id: 3f5b9c21-8a4d-4e77-9c11-0d2e4a6b8c30
```

It carries **the same UUID admission wrote to `observer.ai_requests.request_id`**, so an operator who
has just asked a question can find that exact audit row by primary key instead of guessing at the
newest one.

|                |                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| where          | every response produced **after successful admission** — `/api/ask`, `/api/ask/stream`, both voice routes, model-authored and deterministic-fallback outcomes alike |
| never          | on a request refused **before** admission (401, 429, malformed body, misconfigured pepper). Nothing was written, so there is no row to name                         |
| value          | a v4 UUID from `randomUUID()`. Not derived from the viewer, the tenant, the pepper or any key; not a session token; grants nothing                                  |
| caller control | none — admission mints it, so the response tells the caller only which row its own request created                                                                  |
| body           | unchanged. The id is a header and a test asserts it never appears in the payload                                                                                    |

It is defined once, as `REQUEST_ID_HEADER` in `apps/web/src/lib/ai/gate.ts`, and attached only
through `admittedHeaders(admitted)` — which takes the whole admission rather than a string, so the
type refuses to produce the header for a response that has no admission behind it.

**Why it was added.** The deployed `3f298a6` build returns its request id nowhere: not in the body,
not in a header, not on a log line. Verifying that build therefore has to correlate on a time window
plus properties the operator controlled, which establishes "exactly one matching row exists and
nothing else was written in that window" — a weaker claim than identification. Every build from here
on can be verified exactly. `apps/web/test/request-id-header.test.ts` drives all four handlers and
proves the header and the database write carry the same id.

**A request id alone is not exactness.** Any valid UUID identifies _some_ row. The verifier therefore
requires all six of these together, per request, and the controlled properties are required in every
mode — the id is an additional constraint on top of them, never a replacement:

```
request id + time floor + tenant + project + viewer role + question length
```

A row found by the wrong id, or by the sibling request's id, or in the wrong tenant, project or
viewer role, is not the request that was made — and it is counted as interference rather than
quietly exempted because its id was supplied.

---

## 7. Verification before any deploy

```bash
pnpm verify        # format:check, lint, typecheck, unit tests, production build
pnpm exec playwright test
```

Expected: 455 unit tests, 495 Playwright tests across three viewports (77 skipped — the
desktop-only concepts, the wide-only review sets, and the opt-in live-model file), zero axe
violations, clean build.

Against a deployment rather than a local server, point the suite at it and switch the
live-model file on:

```bash
OBSERVER_BASE_URL=https://… OBSERVER_EXPECT_LIVE_MODEL=1 pnpm exec playwright test
```

### The rollout order, and why the application comes first

Two orderings here were discovered by audit, not by design, and both would have wasted database
mutations before anybody noticed the application could not answer.

**`3f298a6` is the commit that made the pepper mandatory.** Its gate returns HTTP 503 for every Ask
Observer question when `OBSERVER_SUBJECT_PEPPER` is absent — before admission, before an audit row,
before any model call. So a deployment of that commit without the variable answers nothing at all.

**Vercel environment-variable changes do not affect previous deployments; they apply only to new
deployments.** Setting the variable on the project therefore does **not** repair the existing
`3f298a6` Preview URL. That build keeps its own environment snapshot for ever.

> **The original `3f298a6` deployment URL remains pepper-less even after the project variable is
> configured.** It must never be used for the legacy HTTP compatibility proof. A fresh redeploy of
> the same SHA is a different deployment with a different URL, and only that one has the variable.

The corrected sequence, in full. Steps 1–2 are read-only; nothing external is mutated before
explicit operator approval.

| #   | Step                                                                                                                                                                                                      | Mutates        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Read-only preflight: Git, Supabase catalogue, Vercel deployments, environment-variable **names and scopes** only                                                                                          | no             |
| 2   | Explicit operator approval for every external mutation below                                                                                                                                              | no             |
| 3   | **Pepper configuration** — generate ≥32 random bytes and store it as a _sensitive_ Vercel variable for **every** Preview and Production environment sharing the Supabase project, all with the same value | Vercel         |
| 4   | **Redeploy exact SHA `3f298a6` as a fresh Preview** so that commit finally receives the variable. Do **not** push the local commits to achieve this                                                       | Vercel         |
| 5   | Confirm the new deployment is READY and its source SHA is exactly `3f298a6`; make one **pre-migration HTTP smoke** request through it and confirm it **answers** rather than returning the pepper 503     | 1 audit row    |
| 6   | Enable Supabase Cron (`observer-cron-prerequisite.sql`)                                                                                                                                                   | Supabase       |
| 7   | Verify `pg_cron` is installed and the scheduler process is alive                                                                                                                                          | no             |
| 8   | Apply Migration 3                                                                                                                                                                                         | Supabase       |
| 9   | Apply Migration 4                                                                                                                                                                                         | Supabase       |
| 10  | Run **Part A**, _then_ the controlled request through the fresh `3f298a6` Preview. Part A must come after the step-5 smoke so that smoke cannot contaminate the proof window                              | 1 audit row    |
| 11  | Run **legacy Part B**: `expected_build = 'legacy'`, both ids NULL. Require 13/13 with `pseudonym_version = 1`                                                                                             | no             |
| 12  | Schema, Cron-health and rollback-protected behavioural verification                                                                                                                                       | no             |
| 13  | Wait through an hourly Cron execution and require **26/26**                                                                                                                                               | no             |
| 14  | Only now **push** the corrected local release branch                                                                                                                                                      | Git            |
| 15  | Verify the resulting scoped Preview using `X-Observer-Request-Id`                                                                                                                                         | 1–2 audit rows |
| 16  | Run **scoped Part B** and require 13/13 with `pseudonym_version = 2`                                                                                                                                      | no             |
| 17  | **Separately prove a real model-authored response** if live AI is expected — `observer-ai-readiness.sql` plus `OBSERVER_EXPECT_LIVE_MODEL=1 pnpm exec playwright test`                                    | no             |
| 18  | Enumerate and delete or genuinely protect every old deployment capable of reaching a legacy façade                                                                                                        | Vercel         |
| 19  | Apply the **contract migration** last                                                                                                                                                                     | Supabase       |

**No Production promotion is part of this sequence.**

If secure secret entry cannot be performed without exposing the value to an assistant, a log, a
shell history or a generated artefact, **step 3 pauses for Matthew to enter it directly in the
Vercel dashboard.** No procedure here prints, copies or stores a pepper.

#### Step 17 is not optional, and it is not the same question as step 16

Observer answers without a model by design: the deterministic composer runs the same tools over the
same evidence and writes plainer prose. A deployment with no `OPENAI_API_KEY` answers every
question, renders every figure and reads **13/13** on the compatibility proof — which accepts
`model`, `deterministic_composer`, `refusal` and `failure`, correctly, because its question is about
the database path.

So if the controlled request is answered by the deterministic composer, the honest report is:

```text
Observer application works, but live AI is not yet enabled.
```

Not "the AI is working". `observer-ai-readiness.sql` proves the audit half through the exact request
id — `response_source = 'model'`, `model_attempted`, `model_authored`, no `fallback_reason`, and the
authoring model equal to the attempted one — and `e2e/observer-live.spec.ts` proves the screen half
from the rendered answer sheet.

### Database migrations come first, once the application is proven

The Supabase MCP tools are write-blocked from the authoring session, so every migration is
applied by hand through the SQL Editor. The audit change ships in two halves and the order
is the whole point.

**1. Expand — `20260825205000`.** Adds columns, back-fills the rows already there, adds
constraints, adds the new functions. Removes nothing. Both old façades keep working, so it
may be applied at any time, before or after the code that uses the new names. A build running
the old code and a build running the new one are both correct against this schema.

**2. Contract — `20260826090000`.** Drops `public.consume_ai_quota` and
`public.record_ai_request`. **Not on promotion — on evidence.** Vercel keeps every build it
has ever made reachable at its own URL, so promoting `main` retires nothing. Run this first:

```sql
select max(occurred_at) from observer.ai_requests where audit_version = 1;
```

A timestamp inside the last day means something is still writing through the old door. Wait,
or delete the deployments that are.

`_sql-to-paste/` holds the generated block and the read-only verification query. It is
gitignored — the migrations under `supabase/migrations/` are the version-controlled source,
and those copies are generated from them.

---

## 8. Promotion to Production

**Not done, and not to be done automatically.** Four reasons, all still true:

1. the visual direction is still being selected;
2. the production Overview has not adopted the approved hybrid;
3. authentication is a synthetic scenario selector;
4. Supabase holds no approved production schema.

When the Preview and the visual direction are both approved, promotion is a redeploy of an
already-verified deployment:

```bash
vercel promote <deployment-url> --scope madspaces-projects
```

or, in the dashboard: the deployment's **⋯ → Promote to Production**.

Set `OBSERVER_ENVIRONMENT=production` on the Production environment first, or the deployment will
serve `X-Robots-Tag: noindex` to search engines.

---

## 9. Rollback

| Question                    | Answer                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Last known good commit      | the tip of `main` — read it with `git rev-parse HEAD`, do not assume a hash              |
| Last known good deployment  | Vercel → project → Deployments, the most recent with a green **Ready** state             |
| How to redeploy it          | dashboard: **⋯ → Redeploy** on that deployment. CLI: `vercel redeploy <deployment-url>`  |
| How to roll back Production | **⋯ → Promote to Production** on the last good deployment. Instant; it does not rebuild. |

**Detaching the staging Supabase environment without deleting it:**

1. Vercel → project → Settings → Environment Variables: remove the four Supabase variables from the
   Preview environment. The application keeps building — `env.ts` treats them as optional while
   `OBSERVER_DATA_SOURCE=synthetic`.
2. If the Vercel–Supabase integration was used: Settings → Integrations → Supabase → **Disconnect
   project**. This removes the managed variables and leaves the Supabase project untouched.
3. Supabase → `IRIS OBSERVER` (`tfcchobwobpadenampyh`) → Settings → General → **Pause project** to
   stop it without losing it.

**Never delete a cloud project to recover from an error.** Pause it, disconnect it, or roll back the
deployment.

---

## 10. What is still open

| Open                                             | Blocked on                           |
| ------------------------------------------------ | ------------------------------------ |
| Push to GitHub                                   | write access for the pushing account |
| Create the Vercel project and Preview deployment | the push                             |
| Configure Vercel environment variables           | the project                          |
| Live-model smoke test for ADR-0024               | a `FAL_KEY` being available          |
| Preview Deployment Protection                    | a Pro plan, if wanted                |

---

## 11. The pseudonym key

`OBSERVER_SUBJECT_PEPPER` is **required**. A deployment without a valid one
refuses every Ask Observer question at the gate — before the quota is consulted,
before an audit row is written, before any model is called — and names the
reason in the boot line.

### The contract

At least **32 bytes of cryptographically random material**:

```
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

Rejected, each with its own message: absent, empty or whitespace, shorter than
32 bytes, wrapped in quotes or brackets, padded with whitespace, an obvious
placeholder, or repeating too few distinct characters. The last rule is relaxed
only where `VITEST` or `NODE_ENV=test` is set, so the suite can use an
unmistakably fake value and a deployment cannot.

**The same value on every environment that shares a database.** Two environments
with different peppers write subjects that do not match, so the ceilings count
them as different people and aggregate nothing.

### It is derived from nothing, on purpose

An earlier draft derived it from `SUPABASE_SECRET_KEY` when no pepper was set.
That coupled two lifecycles that have no business being coupled: rotating the
database credential — for a leak, a policy, a new project — silently changed
every subject and client fingerprint, orphaned every rate-limit bucket and
restarted all four ceilings from zero, mid-day, with nothing in any log.

A key whose value is a function of another key is also a key whose compromise is
a function of another key's compromise.

### What a deploy of the tenant-scoping branch resets

Not everything, and the difference is worth stating precisely because an earlier
report said "existing rate-limit buckets orphan" without qualification.

| bucket             | keyed by                   | survives the deploy? |
| ------------------ | -------------------------- | -------------------- |
| `client` / hour    | the **global** fingerprint | **yes**              |
| `project` / day    | `tenant/project`           | **yes**              |
| `session` / minute | `telemetrySubject`         | no                   |
| `session` / hour   | `telemetrySubject`         | no                   |

`clientFingerprint` was refactored into a shared helper taking a scope string,
and with scope `client` the hashed input is character for character what it was
before: `client` + NUL + address + NUL + agent + NUL + language. A pinned
regression vector in `apps/web/test/ai-audit.test.ts` asserts the digest, so a
future change to that derivation fails a test rather than silently resetting a
ceiling. The project key is two slugs and never depended on the pepper at all.

Only `telemetrySubject` changed, because only it gained the tenant. So the two
session-scoped ceilings restart and the two that bound cost and abuse do not.

### Rate-bucket retention

Two claims were made here before this one, and both were false. They are worth
keeping because the second is the more instructive mistake.

The first said the table "is pruned". `prune_ai_rate_buckets` existed and
nothing called it: not the ceiling, not admission, no `pg_cron` job, no trigger.
Read-only inspection found 78 buckets with the oldest 37 hours old — inside the
48 the function would have enforced, but only because the deployment is young.
Retention was a property of a function nobody invoked.

The second said the table was "bounded" because admission had been made to
prune. That is **opportunistic garbage collection, not retention**. If no Ask
Observer request arrives, nothing runs: a global browser fingerprint written on
Friday afternoon is still there on Monday. "At most once per hour" limits how
often a delete _may_ execute; it does not limit how old a row can get. It also
put a `delete` in the interactive path, so an answer's latency and availability
depended on housekeeping.

Migration `20260826140000` replaces it with a scheduled job, and these five
lines are the whole claim:

|                          |                                                                               |
| ------------------------ | ----------------------------------------------------------------------------- |
| deletion threshold       | 48 hours                                                                      |
| scheduled frequency      | hourly, on the hour, one `pg_cron` job named `observer-prune-ai-rate-buckets` |
| expected maximum row age | **~49 hours while the scheduler is healthy**                                  |
| monitoring               | separate, and required — `observer-cron-health.sql`                           |
| guarantee                | none                                                                          |

The last row is not modesty. A stopped `pg_cron` worker stops deleting and
nothing in the database notices on its own, which is why the health verifier
reports **unhealthy** when the most recent successful run is more than two hours
old. Legal retention remains a pre-production review gate; a migration cannot
settle it.

`pg_cron` is **not installed on this project** and this milestone did not
install it. It is available at 1.6.4. Enabling it is rollout step 1 —
`supabase/prerequisites/observer-cron-prerequisite.sql`, or Integrations → Cron
in the dashboard — and the migration refuses to apply without it rather than
creating a cleanup function with nothing to run it.

#### The migration owns one job name, and only that

`cron.job` belongs to the whole project. An earlier version of this migration
unscheduled any job whose command mentioned an Observer function, under any
name; an independent review called that destructive overreach and was right. A
job somebody else scheduled and manages is not a migration's to delete, however
much it looks like a duplicate.

So the ownership rule is narrow and the failure is loud:

- the migration creates, replaces and unschedules **only**
  `observer-prune-ai-rate-buckets`, selected by name and scoped to this database
  and this owner;
- a **differently named** job whose command mentions an Observer retention
  function **stops the migration before it writes anything**, names the job, and
  asks a person to decide. Nothing foreign is modified;
- a job holding our name but owned by another role, or registered against
  another database, is likewise refused rather than deleted;
- the detector is a substring scan over `cron.command`. It catches the realistic
  collision — somebody scheduling the same function by hand — and **cannot** see
  a wrapper function, a quoted identifier, a run-time `EXECUTE` or a longhand
  `DELETE`. It is a guard, not a proof of uniqueness.

Row 11 of the health verifier reports the same condition read-only, and reports
is all it does.

### Rotation is a maintenance operation

Rotating the pepper **changes every pseudonymous identifier** and therefore
**resets subject-scoped quota buckets**. That is not a side effect to be avoided
— it is what rotation means when identifiers are keyed — but it must be planned
rather than discovered:

1. do it at a quiet hour, not mid-demonstration;
2. record the old and new **key id** in the deployment log;
3. expect the per-minute, per-hour, per-client and per-day counters to start
   again from zero;
4. set the same new value on every environment sharing the database, in one
   pass. A half-rotated pair of environments is two populations of subjects.

The audit is unaffected. `observer.ai_requests` rows keep the subjects they were
written with and the `key_id` that made them, which is precisely what lets
somebody see afterwards that a rotation happened rather than infer it from a
counter that looks wrong.

### The key id

Sixteen hex characters of an HMAC of the key under a fixed label. Preimage
resistant, useless to an attacker, different the instant the key is different.

It appears in two places, deliberately:

```
Ask Observer subjects are keyed. Key id 3f9a1c04e7b52d18 — if this changes,
every rate-limit bucket has reset.
```

and on **every version-2 audit row**, in `key_id`. The boot line is the fast
signal; the column is the durable one. A startup log ages out of a platform's
retention, and the question a rotation raises gets asked afterwards, sometimes
long afterwards. A column answers it. An expired log line does not.

```sql
select key_id, pseudonym_version, min(occurred_at), max(occurred_at), count(*)
  from observer.ai_requests where audit_version = 2
 group by key_id, pseudonym_version order by 3;
```

More than one `key_id` is a rotation, with the date it happened. More than one
`pseudonym_version` is a change of _derivation_ — tenant-scoping was one — and
matters for the same reason: subjects made under two schemes are unrelated
strings, not one viewer twice. Either can change without the other, which is why
both are recorded.

It is a record, not a guard: nothing refuses to start on a changed key id,
because that would turn a legitimate rotation into an outage.
