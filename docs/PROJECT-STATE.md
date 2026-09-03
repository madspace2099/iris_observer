# Project state

**Read this first in every session.** Then `.claude/skills/iris-observer-product/SKILL.md`, then
whatever it points at. Update this file at the end of every meaningful session.

**Last updated:** 2026-09-03 · **Branch:** `feature/observer-reference-parity` · **PR #1 open. Not merged.**

---

## Where the project is

| Milestone                                    | Status                                                 |
| -------------------------------------------- | ------------------------------------------------------ |
| M0 Workspace foundation                      | ✅ accepted · `d73ba18`, `3214b51`                     |
| M1 Product Intelligence Contract             | ✅ accepted · `a30fcb8`                                |
| M1 closure amendment                         | ✅ accepted · `b7d4869`                                |
| M2 UI foundation and first slices            | ✅ **technically** accepted · `2bb84eb`                |
| M2.1 Visual acceptance and model corrections | ✅ model, security and typography accepted · `50d0349` |
| **M2.1 visual layer**                        | ❌ **rejected.** See `docs/12-visual-autopsy.md`       |
| M2.2 Visual reboot — concepts                | 🟡 built; awaiting the user's selection                |
| **M2.3 Showroom Intelligence refocus**       | 🟡 **built; awaiting visual and product approval**     |
| **Infrastructure checkpoint**                | ✅ **deployed and verified on the live URL**           |
| Production remediation, 19 sections          | ✅ built · `8b4d7c1` · **local only, never on `main`** |
| **Demo release candidate**                   | 🟡 **on Preview; model live, audit rebuilt**           |
| M3 Remaining intelligence surfaces           | ⛔ blocked on approval                                 |

## Cloud resources — do not ask for these again

Full runbook in `docs/18-deployment.md`. No secret value is recorded anywhere in this repository.

|                  |                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub           | `madspace2099/iris_observer` — public, branch `main`, pushed                                                                                                                                              |
| Supabase preview | **`IRIS OBSERVER`, ref `tfcchobwobpadenampyh`, `eu-west-1`, `ACTIVE_HEALTHY`, €0/mo** — the project the Preview actually reaches                                                                          |
| Supabase unused  | `iris-observer-staging`, ref `jtvqecusxzogqubxpoyf` — provisioned first, holds the same migrations, never reached by the Preview. Left alone.                                                             |
| Supabase legacy  | `vrhrzlvhyxrkxxcjxmaf` — the obsolete MVP project. Left alone, never reused.                                                                                                                              |
| Vercel team      | `madspace's projects` (`team_DcZjnqXKYp579zibvXU3UiNE`), **hobby** plan                                                                                                                                   |
| Vercel project   | `iris-observer` (`prj_4pqpmpB8VwLbq06V1TTd3zTWp15p`), root `apps/web`, region `fra1`                                                                                                                      |
| **Live URL**     | **https://iris-observer.vercel.app** — serving `3515402`, two milestones behind                                                                                                                           |
| **Preview URL**  | **https://iris-observer-git-release-observer-demo-rc1-madspaces-projects.vercel.app** — the release candidate                                                                                             |
| Vercel variables | `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — reaching Preview builds and working. The Supabase pair is supplied by the Supabase–Vercel integration, which is why hand-set values never took. |

**One thing to know.** The deployment landed on **Production**, not Preview: `create_git_project`
deploys from the linked repository's production branch, and `main` is it. That was not the intent and
is recorded rather than glossed over. It is harmless in this state — synthetic data, `noindex`, the
staging badge on every screen, a sign-in that states it is not authentication — and nothing was
deleted to undo it. Push any non-`main` branch to get a genuine Preview.

## The release blocker, and how it closed

**`SUPABASE_URL` on the Vercel Preview pointed at a Supabase project that was not in this
account.** The deployment's own log named it: `PostgREST at tfcchobwobpadenampyh.supabase.co
matched no such function`. Five rounds of diagnosis went into establishing that — 406 from an
unexposed schema, 404 from the wrong project, 401 from an unrecognised key, `PGRST202` from a
role that could not match the function, and finally `observer_whoami()` answering 200 to one
caller and 404 to another, which is only possible against two different PostgREST instances.
The fault was the host, never the key.

It came from the Supabase–Vercel integration, which injects `SUPABASE_URL` for whichever
project _it_ is linked to and overrides hand-set values on every sync.

**Resolved on 2026-08-25 by moving the schema rather than the variable.** `tfcchobwobpadenampyh`
(`IRIS OBSERVER`, eu-west-1) is now the official Preview database. The four migrations were
applied there through the SQL Editor — each part verified byte-identical to its source file
first, because the Supabase MCP tools are write-blocked from this session. The Supabase CLI has
no record of them; see `supabase/README.md` for the `migration repair` reconciliation.

Verified afterwards on the deployment itself, not by SQL alone: the shared counters move
(`project/day` climbing, `session/minute` reaching its ceiling of 10 under a burst) and the
audit records rows. Both are only reachable through PostgREST with the server-side secret
key, so their movement is proof the real transport works.

## What that verification then found

Two defects in the audit, neither visible from the code alone.

**It could not say who wrote the answer.** `answered · gpt-5.6-sol` was recorded whether a
model had written a word or the deterministic composer had — while the screen said "written
by the tools" for the same request. Migration `20260825205000` adds `response_source`
(`model` · `deterministic_composer` · `refusal` · `failure`), a nullable `author_model`, a
separate `attempted_model`, and a `fallback_reason` code. `model_authored` is derived from the
same `live` flag the answer sheet renders, and a test asserts they agree on every branch.

**It lost requests: 153 admitted, 133 recorded.** The write was fired and forgotten after the
response, and a serverless instance may freeze once it has responded. Awaiting it would only
have narrowed the window, so the invariant is structural: the row is inserted inside the same
transaction that consumes the quota. A request interrupted before its terminal result stays
visible as `started` rather than vanishing.

A refused request has no audit row and should not — the ceiling declines before any work — so
an admitted-request count and an audit-row count are the same number, which is what makes
reconciling them meaningful.

The `observer_whoami` diagnostic is revoked from the browser roles. The two superseded façades
are **kept** during the expand phase and dropped by a separate contract migration — Vercel keeps
every build reachable at its own URL, and twelve Preview deployments of this branch were READY
and still calling them by name. See [ADR-0028](adr/0028-demo-release-candidate.md) and
[supabase/README.md](../supabase/README.md) for the audit contract.

An independent review of the first draft found four release blockers, all fixed before any
Supabase write: it would have dropped façades a live deployment still calls; it would have
relabelled every historical row as an interrupted request with authorship `false`; admission
consumed quota _before_ its conflict clause, so a retry spent a second unit of the daily budget
and left one row; and completion rewrote an already-completed record, timestamp included.

## The correction that reshaped the product

**ADR-0023: IRIS Showroom is the primary observational source; the CRM is outcome
context.** 28 of 82 registry metrics were computable entirely from CRM data, and those
metrics led the product — which made Observer a second CRM with better typography. The
audit of the legacy dashboard (`docs/16-showroom-intelligence-audit.md`) found the same
mistake there: three of ten headline cards were CRM figures reading zero, above a
conversion funnel that had never held data.

The five primary surfaces are now Showroom, Presentation Intelligence, Unit Attention,
Storytelling and Meeting Replay. The conversion funnel left the navigation.

## What is true right now

- 82 metrics in the registry, **62 source requirements**, 0 uncovered, 0 open decisions, 1 review gate.
- **28 ADRs. 385 unit tests, 480 Playwright tests** across 1920×1080, 1440×900 and Pixel 7
  (65 skipped: the desktop-only concepts and the wide-only review sets), **zero axe violations
  on every showroom surface at every viewport**, production build green. The Playwright suite
  has been run against the Vercel Preview as well as locally.
- **Thirteen chart shapes**, all hand-drawn SVG, documented in `docs/17-showroom-intelligence.md`
  §5a. Sales Flow carries the summary window, the weekday×hour heatmap, the annotated trend, the
  stacked composition, the nested behaviour funnel and two ranked lists; Project carries the
  bullet chart against the sales plan and the stepped journey alluvial; Sales Agents carries one
  radar per presenter. Four correctness rules — funnels nest, ordered lists are never ordered by
  outcome, one figure has one value per page, a radar is a shape and not a score — are guarded by
  tests in `e2e/quality.spec.ts`, each because it was broken first.
- **Observer is the interface** (ADR-0025). The opening surface is a briefing: the orb, a
  first-person sentence, a prominent prompt and context-aware offers, above the fold at
  1920×1080, 1440×900 and on a phone. The orb is canvas-drawn, state-driven and has no
  runtime asset; its state mapping is asserted by the unit suite. A microphone appears only when
  the realtime layer can actually be reached; otherwise one reader-facing sentence says so, and
  the operator diagnosis behind it goes to the server log.
- **Ask Observer is live**, running the controlled tool architecture against OpenAI's Responses
  API with `store: false`. When the model cannot be reached the deterministic composer answers
  from the same tools, and `status.live` says which produced the prose — a claim that now
  describes the answer rather than the deployment. **No model-backed answer has been produced
  yet:** the configured key returns `401 invalid_api_key`. See the release blocker above.
- **A shared ceiling above the in-process limiter** (ADR-0028). Four ceilings consumed atomically
  from Postgres, the last of them the per-project daily budget that bounds the bill. Verified
  against the live database; not active on the Preview, which holds no Supabase variables.
- **Three synthetic projects with three separate datasets** — Northgate (CRM connected, two
  comparable periods), Riverside (no CRM, so every outcome rate renders as unavailable) and
  Kingsford (three weeks old, so no baseline exists). Northgate carries 16 sessions with no
  per-step timing, so the honest gap has to be rendered.
- Three laboratory routes exist and no production route has changed: `/lab/sign-in`,
  `/lab/overview-a`, `/lab/overview-b`. They are declared in `SURFACES` as MADSPACE-only.
- No ingestion and no production authentication. All deliberate; see the roadmap. The database
  now holds exactly one thing: the shared rate-limit counters and a contentless request audit.
- The synthetic repository is the only data source and sits behind `ObserverRepository`.

## The one decision waiting on the user

**Which Executive Overview concept to build on** — narrative-first, spatial-first, or a described
hybrid. The Showroom surfaces were built on the spatial direction with the narrative concept's
verdict typography, which was the recommendation; the concepts remain at `/lab` for comparison. Both are implemented as isolated laboratory routes and neither has replaced a production
route. Nothing else proceeds until this is chosen.

The critique, the defects found and fixed by inspection, and a recommendation
(**spatial-first, carrying the narrative concept's verdict typography**) are in
`docs/15-visual-concepts.md`.

## Next recommended action

Two of these are the user's and cannot be done from here.

1. **Tick "Preview" on all three Vercel variables.** They are set but not reaching preview
   deployments; the environment checkboxes are the one setting that explains it.
2. **Confirm the compromised OpenAI key is revoked** in the OpenAI dashboard. Paste the
   replacement's value alone: the one on this machine is wrapped in `<` and `>`, which the
   API rejects on every call.
3. User reviews the release candidate on the Preview URL and approves or rejects it.
4. Only then: merge, tag, promote, and M3. None of those has been done.

---

## Accepted decisions

Recorded in full in `docs/adr/`. The ones that constrain daily work:

| Decision                                                       | Where                      |
| -------------------------------------------------------------- | -------------------------- |
| Append-only events; the client never aggregates                | ADR-0001                   |
| No mock data layer; synthetic scenarios travel the real path   | ADR-0007                   |
| The metric registry is the single source of truth              | ADR-0006                   |
| Facts are defined before wire event names                      | ADR-0013                   |
| Observer produces no causal claims                             | ADR-0010                   |
| Attribution is a versioned, MADSPACE-owned policy              | ADR-0014                   |
| Source observations are the ingestion boundary                 | ADR-0015                   |
| Meaningful dwell is derived at query time                      | ADR-0016                   |
| Observer owns the canonical meeting identifier                 | ADR-0017                   |
| The internal brief is never buyer-visible                      | ADR-0018                   |
| Role-aware default home screens, no free customisation         | ADR-0019                   |
| Manrope self-hosted                                            | ADR-0020                   |
| Lead temperature is a signal, not a deal stage                 | ADR-0021                   |
| The session adapter is a scenario selector, not authentication | ADR-0022                   |
| **IRIS Spatial Intelligence is the visual system**             | `docs/14-design-system.md` |
| **The showroom is the subject; the CRM is context**            | ADR-0023                   |
| The model runs through fal.ai's OpenRouter route               | ADR-0024                   |

## Unresolved decisions

| Question                                              | Blocks                              | Owner             |
| ----------------------------------------------------- | ----------------------------------- | ----------------- |
| Narrative-first or spatial-first Executive Overview   | the visual rollout                  | **the user, now** |
| Whether the assistant is named AI-RIS in Observer too | Ask Observer's greeting and voice   | MADSPACE          |
| Does REALPAD expose a usable API                      | the CRM connector milestone         | MADSPACE          |
| Interior platform — can it post back                  | interior dwell in deep-dive metrics | MADSPACE          |
| WEBIRIS stable visitor identifier and cookie lifetime | deterministic back-linking          | MADSPACE          |
| Which system mints the booking                        | `meeting_id` ownership in practice  | MADSPACE          |
| Seats per project or per installation                 | the entitlement model               | MADSPACE          |

## Review gates before production

`docs/11-preproduction-gates.md` — privacy and legal review, production authentication, device
credentials, data processing agreement.

---

## Visual review history

| Date       | Surface                                                                     | Outcome                                                                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-24 | M2.1, 7 surfaces × 3 viewports                                              | **Rejected.** Generic dark SaaS; no spatial intelligence; no IRIS language; AI is a decorative card; MADSPACE admin shipped 86% empty and unreviewed. `docs/12-visual-autopsy.md`                                                                           |
| 2026-08-24 | Figma inspection                                                            | `4:20`, `7843:300`, `7813:1334`, `4:25` inspected; `3:16` empty. Matrix in `docs/13-figma-adoption-matrix.md`                                                                                                                                               |
| 2026-08-24 | Welcome browser `6964:245`, splash `6620:1840`, AI-RIS greeting `6872:3494` | Adopted. Corrected the "nothing is a card" rule — IRIS uses cards for image-led collection browsing, never for analytical content. Matrix §5                                                                                                                |
| 2026-08-24 | Laboratory, 3 routes × 2 desktop viewports, repose and interaction          | **11 defects found by looking and fixed**, including an invented profile that had no viewer behind it. Listed in `docs/15-visual-concepts.md` §4                                                                                                            |
| 2026-08-24 | Legacy IRIS Analytics Dashboard, 2 captures                                 | Read-only audit; both PDFs are pure raster, so the embedded images were extracted and read. 31 measurements inventoried. `docs/16-showroom-intelligence-audit.md`                                                                                           |
| 2026-08-24 | Showroom surfaces, 5 routes × 3 viewports                                   | 14 defects found by looking and fixed: overlapping headers, a hatched overlay nobody could read, "−0%", "+1,100%" from a base of one, a mobile top bar running off the screen, a command rail floating mid-page.                                            |
| 2026-08-24 | Bug-fixing sweep                                                            | The answer sheet covered the rail that opened it; `aria-pressed` on links, which axe rejects and a screen reader would misannounce; 1.1:1 contrast on a selected chip's count; a random "Suggest" button; a `38vw` answer sheet that is 156px on a handset. |
| 2026-08-24 | **User review of the unit list**                                            | Rejected as overwhelming. Rebuilt: 12 rows instead of 48, six columns instead of eight, no abbreviations, an icon and an info control on every measurement explaining what it measures, how, from where, and what it does not say.                          |

## Where the artefacts are

Review screenshots and Figma renders live outside the repository, under the session scratchpad:

```
…/scratchpad/showroom   Showroom Intelligence review set, 3 viewports
…/scratchpad/dashimg    legacy dashboard rasters, extracted from the supplied PDFs
…/scratchpad/review    42 rejected M2.1 screenshots
…/scratchpad/figma     Figma renders inspected for the adoption matrix
…/scratchpad/lab       concept screenshots
…/scratchpad/fig       extracted .fig archives (HORIZONTAL MENU, BASIC SCREEN HERE, IRIS FIGMA BOT)
```

The scratchpad root is recorded in `e2e/review-screenshots.spec.ts` and can be overridden with
`OBSERVER_SHOTS`. Screenshots are never committed — there is no visual-baseline policy yet.

---

## MADSPACE admin on the client-portal design system

**2026-09-03.** Branch `feature/observer-reference-parity`. PR #1 open, not merged.

The reviewer read the operations screenshots and gave two notes: there is a great deal of
superfluous description, which could go behind an information button beside the big titles, and
here is the MADSPACE client portal's design system, rework the pages onto it.

The specification, extracted from the PDF plus the decisions taken in adopting it, is
`docs/20-madspace-admin-design-system.md`. Read that before touching a `/madspace` screen.

### What changed

|               |                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Ground        | Graphite dark to warm paper, through a token swap on `.mad-portal`. Observer stays dark; the boundary is one class.                    |
| Type          | Inter with tabular figures on `/madspace`; Manrope everywhere else.                                                                    |
| Prose         | 94 sentences behind an `InfoNote`, 20 deleted, 38 dashes rewritten. The screens lead with the state, the party waited on and the date. |
| States        | `StatusMark` gives six states six shapes. `StatusChip` has no prop to drop its word. One verdict-to-mark table, beside `HEALTH_LABEL`. |
| Absent values | Words matched to the field: Not set, None scheduled, Never, No delay, Not readable. Never a dash, never a zero.                        |
| Numbers       | Pinned `Intl` formatters, so one count does not print two ways on one row.                                                             |

### Defects the pass found, which were not design

- The header asserted "Hosted control plane" for any process that merely was not local, including
  one with no control plane at all. `runningLocally()` reads the environment; it never asked
  whether a database answered.
- A project with any non-active status was told it was "Archived" and that the decision was
  terminal. A suspended project was being told something untrue about something reversible.
- The head tally set `data-missing` on a class with no rule behind it, so "Not reported" rendered
  at the full weight of a real count in the largest type on the page.
- An unparseable timestamp fell into the same branch as an empty column and claimed "Never".
- Two screens each declared their own verdict-to-mark table and disagreed about three of seven, so
  one installation wore two shapes depending on which screen you opened.

### Verification

`pnpm test`: 94 files, 2981 passed, 1 skipped, 0 failed. Typecheck, lint and `format:check` clean.
`apps/web/test/madspace-design-system.test.ts` holds 13 of the system's literal rules and says in
its own docblock why it does not attempt the rest.

Screenshots: 46 images, six screens at 1920 / 1440 / 412 plus the five-state lifecycle record at
1440, under `…/scratchpad/madspace`. The lifecycle record is only truthful on a fresh estate, and
the spec asserts that precondition rather than assuming it.

### Next recommended action

**The user reviews the screenshots.** Everything below is held until they do.

Three things are worth their opinion rather than another pass:

1. The scope band is on every `/madspace` screen, stating the account and which control plane
   answered. It is correct by the specification and it is heavy. The alternative is the header
   chip it replaced, which disappeared below 768px and took the fact with it.
2. Source detail's head carries project, environment and lifecycle on the right. If those belong
   in the strip below the title instead, it is a small change.
3. The `i` sits beside a title only where something needed explaining, so some headings have none.
   The reviewer asked for it beside "the big titles"; this reads it as "wherever there is doctrine
   to move", which is not quite the same request.
