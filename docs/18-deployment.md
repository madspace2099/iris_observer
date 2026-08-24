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

|                    |                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Organization       | `LEGALIZALJUK` (`cjmkiuszyotwjhbcbviq`) — the only organization on the account                |
| Project name       | `iris-observer-staging`                                                                       |
| Project ref        | `jtvqecusxzogqubxpoyf`                                                                        |
| Region             | `eu-central-1` (Frankfurt) — the European region closest to Slovak and Central European users |
| Created            | 2026-08-24                                                                                    |
| Status             | `ACTIVE_HEALTHY`                                                                              |
| Cost               | €0/month                                                                                      |
| Tables in `public` | **none**                                                                                      |
| Security advisors  | **none**                                                                                      |

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

---

## 7. Verification before any deploy

```bash
pnpm verify        # format:check, lint, typecheck, unit tests, production build
pnpm exec playwright test
```

Expected: 194 unit tests, 173 Playwright tests (10 skipped — the desktop-only concepts), zero axe
violations, clean build.

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
3. Supabase → `iris-observer-staging` → Settings → General → **Pause project** to stop it without
   losing it.

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
