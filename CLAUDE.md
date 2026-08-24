# IRIS Observer — working notes

**Official product name: IRIS Observer.** Use it in all documentation and UI. The local folder is
`iris-observer` and the GitHub repository is `iris_observer`; both are incidental spellings and
neither should appear in prose.

## Start every session here

1. **Load two skills, always, before any design or frontend work:**
   - `iris-observer-product` — this project's doctrine. Lives in
     `.claude/skills/iris-observer-product/SKILL.md`.
   - `frontend-design` — generic craft guidance.

   Where they disagree, **`iris-observer-product` wins**. The generic skill will suggest an unusual
   display font and an extreme aesthetic direction; IRIS has a locked identity.

2. **Read `docs/PROJECT-STATE.md`** — where the project is, what was decided, what is blocked, and
   the exact next action. Update it at the end of every meaningful session.

Never ask the user to restate context that exists in this repository.

## What this is

A multi-tenant sales-intelligence platform for MADSPACE IRIS showroom installations. A sales agent
presents a residential development to a buyer inside an Unreal Engine 5 application; Observer
records what happened, joins it to the developer's CRM, and turns it into decisions.

**Development order is deliberately reversed.** Observer defines what must be measured; the UE5
module implements that specification afterwards. **Do not write UE5 C++ in this phase.** The output
for Unreal is `docs/ue5-instrumentation-spec.md`, generated from the metric registry.

## Read first

| Document                       | What it settles                                                            |
| ------------------------------ | -------------------------------------------------------------------------- |
| `docs/01-foundation.md`        | Two-sided product, tenancy, CRM boundary, identity, privacy                |
| `docs/02-views.md`             | Page pattern, semantic metric layer, the views, AI layer, sequencing       |
| `docs/03-event-map.md`         | Showroom UX flow mapped to observable facts; the Unreal API surface        |
| `docs/04-journey.md`           | The unified WEBIRIS → showroom → CRM journey, evidence tiers, attribution  |
| `docs/05-identity.md`          | Identity architecture, and the awkward cases: duplicates, couples, erasure |
| `docs/06-ownership.md`         | Which system owns which fact, and the read-model rule                      |
| `docs/07-pre-meeting-brief.md` | The brief contract and what may never be inferred                          |
| `docs/08-scenarios.md`         | Deterministic synthetic scenarios, Viktória first                          |
| `docs/09-ingestion.md`         | Source observation → adapter → canonical fact. The trust boundary.         |
| `docs/10-policies.md`          | Attribution, dwell, visitor identity, meeting identity, brief visibility   |
| `docs/roadmap.md`              | Milestones, and what is deliberately not built yet                         |
| `docs/coverage-report.md`      | **Generated.** Every source requirement and what covers it.                |
| `docs/traceability.md`         | Requirement → where satisfied. Hand-maintained.                            |
| `docs/measurement-matrix.md`   | **Generated.** Metric → facts → sources. Never edit by hand.               |
| `docs/adr/`                    | Architecture decisions, numbered                                           |
| `docs/references.md`           | External references (Figma, legacy system)                                 |

## Commands

```bash
pnpm install
pnpm dev          # Next.js dev server
pnpm typecheck    # tsc --noEmit in every package
pnpm lint         # eslint, whole repo
pnpm test         # vitest
pnpm matrix       # regenerate the measurement dependency matrix
pnpm build        # production build of @observer/web
pnpm verify       # format, typecheck, lint, test, build
```

Run `pnpm matrix` after any registry change. A test fails if the committed matrix has drifted.

## Non-negotiables

1. **The client never aggregates.** Showroom clients emit events; the server derives everything.
   Projections must be rebuildable from raw events.
2. **No mock data layer.** Synthetic scenarios are event batches pushed through the real ingest
   API. If you are about to write `mockData.ts`, stop — see ADR-0007.
3. **Every metric is declared in the registry** (`packages/metrics`), never inline in a component.
   The matrix and the UE5 spec are generated from it, so hand-editing them is always wrong.
4. **No personal data in event payloads.** Events carry `contact_id`; names, emails and phone
   numbers live only in the restricted contacts table.
5. **Every tenant-scoped table gets an RLS policy in the same migration.** See ADR-0005.
6. **Nothing project-specific in application logic.** No hard-coded project name, unit, colour,
   currency or seat count. Projects are configuration.
7. **No metric without a denominator, no verdict without a sample size, no screen without an
   action.** The three page rules from `docs/02-views.md`.
8. **A deal stage is authoritative; intent is a signal.** Never put lead temperature in the ladder,
   and never compute stage conversion through it. See ADR-0021.
9. **The sign-in is a scenario selector, not authentication.** Do not describe it as authentication,
   and do not let the browser decide a role. See ADR-0022.
10. **Nothing is a card.** Content sits on planes separated by hairlines; controls sit on floating
    rails. The M2.1 card stack is the rejected system — see `docs/12-visual-autopsy.md`.
11. **A screen is not approved because the build is green.** Every finished surface needs a real
    screenshot that somebody looked at. A mostly-empty frame is an automatic failure.

## Environment notes for this machine

- `pnpm` is installed globally through npm (`npm i -g pnpm`), because `corepack enable` needs
  administrator rights here. `corepack pnpm ...` also works.
- **Docker is not installed**, so `supabase start` cannot run. The app uses a hosted Supabase
  development project; data tests use PGlite. See ADR-0008.
- `pnpm-workspace.yaml` carries an `allowBuilds` entry for esbuild. pnpm 11 treats unapproved build
  scripts as a hard error, so do not remove it.

## Layout

```
apps/web/            Next.js application (App Router)
packages/contracts/  event contract: Zod -> JSON Schema -> OpenAPI -> examples
packages/db/         Drizzle schema, migrations, RLS, projections, seeds
packages/metrics/    metric registry and the typed query layer
packages/ui/         design tokens, primitives, hand-built SVG charts
packages/simulator/  integration simulator CLI
packages/readmodels/ read-model shapes and the repository port
packages/synthetic/  deterministic implementation of that port
docs/                concept documents, ADRs, generated specifications
.claude/skills/      the iris-observer-product project skill
```
