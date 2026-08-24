# Project state

**Read this first in every session.** Then `.claude/skills/iris-observer-product/SKILL.md`, then
whatever it points at. Update this file at the end of every meaningful session.

**Last updated:** 2026-08-24 · **Branch:** `main` · **Never pushed.**

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
| M3 Remaining intelligence surfaces           | ⛔ blocked on approval                                 |

## Cloud resources — do not ask for these again

Full runbook in `docs/18-deployment.md`. No secret value is recorded anywhere in this repository.

|                  |                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| GitHub           | `madspace2099/iris_observer` — public, branch `main`, pushed                                              |
| Supabase org     | `LEGALIZALJUK` (`cjmkiuszyotwjhbcbviq`)                                                                   |
| Supabase staging | `iris-observer-staging`, ref `jtvqecusxzogqubxpoyf`, `eu-central-1`, `ACTIVE_HEALTHY`, €0/mo, zero tables |
| Supabase legacy  | `vrhrzlvhyxrkxxcjxmaf` — the obsolete MVP project. Left alone, never reused.                              |
| Vercel team      | `madspace's projects` (`team_DcZjnqXKYp579zibvXU3UiNE`), **hobby** plan                                   |
| Vercel project   | `iris-observer` (`prj_4pqpmpB8VwLbq06V1TTd3zTWp15p`), root `apps/web`, region `fra1`                      |
| **Live URL**     | **https://iris-observer.vercel.app**                                                                      |

**One thing to know.** The deployment landed on **Production**, not Preview: `create_git_project`
deploys from the linked repository's production branch, and `main` is it. That was not the intent and
is recorded rather than glossed over. It is harmless in this state — synthetic data, `noindex`, the
staging badge on every screen, a sign-in that states it is not authentication — and nothing was
deleted to undo it. Push any non-`main` branch to get a genuine Preview.

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
- **24 ADRs. 218 unit tests, 246 Playwright tests** across 1920×1080, 1440×900 and Pixel 7
  (12 skipped: the desktop-only concepts), **zero axe violations on every showroom
  surface at every viewport**, production build green.
- **Thirteen chart shapes**, all hand-drawn SVG, documented in `docs/17-showroom-intelligence.md`
  §5a. Sales Flow carries the summary window, the weekday×hour heatmap, the annotated trend, the
  stacked composition, the nested behaviour funnel and two ranked lists; Project carries the
  bullet chart against the sales plan and the stepped journey alluvial; Sales Agents carries one
  radar per presenter. Four correctness rules — funnels nest, ordered lists are never ordered by
  outcome, one figure has one value per page, a radar is a shape and not a score — are guarded by
  tests in `e2e/quality.spec.ts`, each because it was broken first.
- **Ask Observer is live**, running the controlled tool architecture. Without `FAL_KEY` the
  deterministic provider answers from the same tools; the answer sheet says which produced
  the prose. No live-model smoke test has been run — no key is present on this machine.
- **132 synthetic showroom meetings**, four agents, two comparable periods, 16 sessions
  carrying no per-step timing so the honest gap has to be rendered.
- Three laboratory routes exist and no production route has changed: `/lab/sign-in`,
  `/lab/overview-a`, `/lab/overview-b`. They are declared in `SURFACES` as MADSPACE-only.
- No database, no ingestion, no LLM, no production authentication. All deliberate; see the roadmap.
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

1. User reviews the Showroom Intelligence surfaces on **https://iris-observer.vercel.app** and
   approves the product direction.
2. Set the Vercel environment variables from `docs/18-deployment.md` §4. The application runs
   correctly without them — `env.ts` defaults to synthetic and treats Supabase as optional — so this
   is a refinement, not a fault.
3. A live-model smoke test once `FAL_KEY` is available, to confirm ADR-0024's route in practice.
4. Only then M3.

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
