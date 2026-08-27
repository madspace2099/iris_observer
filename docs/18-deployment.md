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
Observer question when `OBSERVER_SUBJECT_PEPPER` is absent or malformed — before admission, before
an audit row, before any model call.

**Vercel environment-variable changes do not affect previous deployments; they apply only to new
deployments.** A built deployment keeps the environment snapshot captured when it was built.

#### What is proven, and what is not

That second fact is often over-read, and this document over-read it in a previous edition. The
precise position:

|                |                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proven**     | The existing `3f298a6` deployment retains the environment snapshot captured when it was built. Later project-level changes do not alter that snapshot.                                                  |
| **Unknown**    | Whether that snapshot contains `OBSERVER_SUBJECT_PEPPER` at all, and whether the value is valid. Nothing in this work has read Vercel's environment metadata.                                           |
| **Unobserved** | How that deployment currently behaves. No HTTP request has been made to it. It may answer; it may return 503. Neither has been seen.                                                                    |
| **Required**   | It is nonetheless **ineligible** for the controlled legacy proof, because its configuration snapshot is unverified. A proof whose target's configuration is unknown proves nothing about configuration. |

So the rule is about eligibility, not about a predicted failure. A fresh deployment of exact SHA
`3f298a6` — built after the pepper state has been settled — is the required controlled target, and
it is required whether or not the old one happens to work.

#### Deciding the pepper state, without touching a secret

The preflight answers two **separate** questions, and conflating them was a mistake in the previous
edition: it said project mapping was established "from environment-variable names and scopes only".
Names and scopes cannot prove which Supabase project a deployment targets. A variable called
`SUPABASE_URL` exists in every environment; which project it points at is in its **value** — and that
particular value is not a secret.

**(i) Supabase project mapping — read the non-secret value.**

- inspect **`SUPABASE_URL`** (or the project reference it contains) and nothing else;
- record only the expected **project ref**, e.g. `tfcchobwobpadenampyh`;
- **never** read or print `SUPABASE_SECRET_KEY`, `OBSERVER_SUBJECT_PEPPER` or `OPENAI_API_KEY`.

If the available tool cannot retrieve that one non-secret project ref without also exposing a secret,
**pause** and let Matthew read it in the dashboard.

**(ii) Pepper state — metadata only, never a value.**

1. whether `OBSERVER_SUBJECT_PEPPER` **exists** in each relevant scope;
2. its **type** — is it marked Sensitive/Secret;
3. its **scope** — Preview, Production, or both;
4. whether **one** sensitive record covers all relevant scopes;
5. whether the configuration is therefore **absent**, **uniform** or **ambiguous**.

Nothing in (ii) reads a value. The classification is made entirely from presence, type and scope.

The rollout then branches, and two of the three branches do not create anything:

| State                                                | Action                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Absent everywhere relevant**                       | PAUSE. Matthew creates one ≥32-byte random value through a secure interface and targets every relevant environment with that same value.         |
| **One sensitive record covers every relevant scope** | **Reuse it.** Do not edit, do not rotate, do not overwrite. Redeploying picks up the approved current configuration.                             |
| **Partial, separate or ambiguous**                   | **STOP.** Never infer that two separate sensitive variables hold the same value — nothing can read them to check. Never overwrite automatically. |

In the third case Matthew chooses between reconciling the existing configuration securely, or
**explicitly authorising a coordinated rotation**. A rotation is a real operation with consequences,
and they are stated before it is chosen: it changes **every pseudonymous identifier**, **restarts
every subject-scoped quota**, **requires one value across all environments sharing the database**,
and **requires every deployment carrying the old or unknown snapshot to be made unreachable**.

The pepper is never transported through shell output, terminal history, logs or a generated file. If
the available tooling cannot inspect names and scopes, the step pauses for Matthew to check them in
the Vercel dashboard.

#### Every version-1 writer must be retired, and that includes `3f298a6`

The compatibility table proves something easy to miss:

```text
3f298a6 after Migration 3   resolves and writes pseudonym_version 1
3f298a6 after Migration 4   resolves and writes pseudonym_version 1
3f298a6 after the contract  still resolves and writes version 1
```

Migration 3 deliberately keeps the 13-argument call working through its defaults, and the contract
migration only drops `consume_ai_quota` and `record_ai_request`. Neither disables the version-1
compatibility path. So protecting "deployments that can call the old façades" is **too narrow**: it
leaves both the original and the freshly redeployed `3f298a6` URLs able to keep writing
cross-tenant-linkable version-1 pseudonyms into the durable audit indefinitely.

The gate before the contract migration is therefore broader, and the two capabilities do **not** get
the same remedy:

| Capability                                                                                         | Remedy                                      | Why                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **(a)** can call `consume_ai_quota` or `record_ai_request`                                         | delete **or** protect                       | The contract migration genuinely removes those functions. Their RPC stops existing, whoever reaches the URL. |
| **(b)** can reach `admit_ai_request` with **thirteen** arguments and write `pseudonym_version = 1` | **DELETE. Protection is not a substitute.** | Nothing removes that path. See below.                                                                        |

**Why (b) must be deleted rather than protected.** "Protected" in the previous edition meant "cannot
serve an anonymous request", and that is not enough here:

- Vercel Authentication still admits **authorised** users — the team, and anyone they share with;
- Vercel supports explicit **protection-bypass** mechanisms;
- the contract migration does **not** disable the thirteen-argument admission path.

So a protected `3f298a6` deployment can still write a cross-tenant-linkable version-1 row after the
contract migration. The only remedy that ends the capability is deletion.

That is why the original unverified `3f298a6` deployment is **deleted** at step 5, once the fresh one
has answered — not merely protected — and why the fresh proof deployment is deleted at step 18,
after it has served the legacy compatibility phase.

If deleting every version-1-capable deployment is operationally unacceptable, **stop and ask
Matthew.** The requirement is not to be quietly weakened back to protection.

A deployment proven to contain no Observer RPC path at all, such as the `3515402` `main` builds, may
remain **only with that evidence recorded**. And a build whose admission signature no longer resolves
is not version-1-capable either: `1ee5d2d` calls `admit_ai_request`, `complete_ai_request` and
`observer_whoami` — **neither legacy façade** — with **twelve** arguments, which the expand migration
already took out of resolution. It writes nothing at all, and classifying it as a legacy-façade
caller for the sake of conservative retirement was simply wrong.

#### Enumerate to pagination exhaustion, then again after deletion

`vercel ls` is paginated: it returns roughly the newest twenty and takes `--next <timestamp>` to
continue. A single page is not an inventory, and this project already has twenty READY deployments —
exactly the page size, which is the shape of a list that looks complete and is not.

```bash
vercel ls iris-observer
vercel ls iris-observer --next <timestamp printed by the previous page>
# …until no further page is returned
```

The retirement gate must:

1. follow pagination **to exhaustion**;
2. record every **immutable deployment URL**, its state and its source SHA;
3. classify capability **from that SHA's own source**, never from an alias or a branch name;
4. include the freshly created proof deployment, which is younger than any earlier listing;
5. **re-run the complete inventory after deletion**;
6. prove that **no READY version-1-capable deployment remains**.

`observer-contract-readiness.sql` reports on the database side and still cannot say READY: it sees
what was written, never what can be written. It remains honestly INCONCLUSIVE, and the external gate
is a person's enumeration.

#### The sequence

Steps 1–2 are read-only; nothing external is mutated before explicit operator approval.

| #   | Step                                                                                                                                                                                                                                                                                                                                                                                         | Mutates                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Read-only preflight, in two separable parts: (i) Git, Supabase catalogue and a deployment inventory paginated **to exhaustion**; (ii) environment checks — pepper **presence, type and scope as metadata only**, and Supabase project mapping read from the **non-secret** `SUPABASE_URL` or project ref. Names and scopes cannot prove which project a deployment targets; only the URL can | no                                   |
| 2   | Explicit operator approval, and the pepper-state decision from the table above                                                                                                                                                                                                                                                                                                               | no                                   |
| 3   | Reuse, create or explicitly rotate the pepper according to that decision                                                                                                                                                                                                                                                                                                                     | Vercel, only if creating or rotating |
| 4   | Redeploy exact SHA `3f298a6` as a fresh Preview. Do **not** push the local commits to achieve this                                                                                                                                                                                                                                                                                           | Vercel                               |
| 5   | Confirm READY and source SHA exactly `3f298a6`; run the **pre-migration HTTP smoke** and confirm it answers rather than returning 503; **then DELETE the original unverified `3f298a6` deployment** — protection is not enough, see below                                                                                                                                                    | 1 audit row, Vercel                  |
| 6   | Enable Supabase Cron (`observer-cron-prerequisite.sql`)                                                                                                                                                                                                                                                                                                                                      | Supabase                             |
| 7   | Verify `pg_cron` is installed and the scheduler process is alive                                                                                                                                                                                                                                                                                                                             | no                                   |
| 8   | Apply Migration 3                                                                                                                                                                                                                                                                                                                                                                            | Supabase                             |
| 9   | Apply Migration 4                                                                                                                                                                                                                                                                                                                                                                            | Supabase                             |
| 10  | Run **Part A**, then the controlled request through the fresh legacy Preview — in that order, so the step-5 smoke cannot contaminate the proof window                                                                                                                                                                                                                                        | 1–2 audit rows                       |
| 11  | Require **legacy 13/13** with `pseudonym_version = 1`, both request ids NULL                                                                                                                                                                                                                                                                                                                 | no                                   |
| 12  | Schema, Cron-health and rollback-protected behavioural verification                                                                                                                                                                                                                                                                                                                          | no                                   |
| 13  | Wait through the scheduled hourly run and require **Cron-health 26/26**                                                                                                                                                                                                                                                                                                                      | no                                   |
| 14  | **Push** the corrected release branch                                                                                                                                                                                                                                                                                                                                                        | Git                                  |
| 15  | Capture the scoped Preview's exact `X-Observer-Request-Id` from the response                                                                                                                                                                                                                                                                                                                 | 1–2 audit rows                       |
| 16  | Require **scoped 13/13** with `pseudonym_version = 2`                                                                                                                                                                                                                                                                                                                                        | no                                   |
| 17  | Separately run the corrected **live-model readiness** proof                                                                                                                                                                                                                                                                                                                                  | no                                   |
| 18  | Record `retirement_floor_ts`; **DELETE every version-1-capable deployment** — the fresh `3f298a6` proof Preview included; delete **or** protect legacy-façade-only builds; then **re-enumerate to exhaustion** and prove no READY version-1-capable deployment remains                                                                                                                       | Vercel                               |
| 19  | Run `observer-contract-readiness.sql` with that floor — it must show **0 on both version axes** and read INCONCLUSIVE — then apply the **contract migration** last                                                                                                                                                                                                                           | Supabase                             |

**No Production promotion is part of this sequence.**

The fresh `3f298a6` Preview exists only to carry the legacy compatibility phase. It is retired at
step 18 like every other version-1 writer, before the contract phase.

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
id, and its verdict is the conjunction of **all ten** conditions — exactly one row, `state` complete,
`response_source = 'model'`, `model_attempted`, `model_authored`, no `fallback_reason`,
`attempted_provider = 'openai'`, a non-empty attempted model, a non-empty author model, and the two
models equal. A row labelled `model` that contradicts any of them reads

```text
Live AI is not proven — see the failed checks
```

rather than either of the other two sentences. `e2e/observer-live.spec.ts` proves the screen half
from the rendered answer sheet.

### Database migrations, once the application is proven

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

At least **32 bytes of cryptographically random material**.

**There is deliberately no command here.** This section used to carry a one-liner that prints the
value to stdout, and that contradicted the promise made everywhere else in this release: the pepper
never travels through shell output, terminal history, a captured log or an assistant's context. A
command that echoes a secret puts it in all four at once, and a scrollback buffer is not a secret
store.

The procedure instead:

1. generate the value in a **trusted password manager's secret generator**;
2. paste it **directly into Vercel's Sensitive/Secret field** for every environment that shares the
   Supabase project;
3. never pass it through an assistant, a shell command, a clipboard-logging tool, generated evidence
   or any file in this repository.

Nothing in this repository, this runbook or any review bundle may print, echo or generate a pepper.
`supabase/test/no-secret-recipes.test.ts` fails if an operator-facing tracked file starts to.

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
