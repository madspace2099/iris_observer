# IRIS Observer — working notes

**Official product name: IRIS Observer.** Use it in all documentation and UI. The local folder is
`iris-observer` and the GitHub repository is `iris_observer`; both are incidental spellings and
neither should appear in prose.

## What this is

A multi-tenant sales-intelligence platform for MADSPACE IRIS showroom installations. A sales agent
presents a residential development to a buyer inside an Unreal Engine 5 application; Observer
records what happened, joins it to the developer's CRM, and turns it into decisions.

**Development order is deliberately reversed.** Observer defines what must be measured; the UE5
module implements that specification afterwards. **Do not write UE5 C++ in this phase.** The output
for Unreal is `docs/ue5-instrumentation-spec.md`, generated from the metric registry.

## Read first

| Document                | What it settles                                                      |
| ----------------------- | -------------------------------------------------------------------- |
| `docs/01-foundation.md` | Two-sided product, tenancy, CRM boundary, identity, privacy          |
| `docs/02-views.md`      | Page pattern, semantic metric layer, the views, AI layer, sequencing |
| `docs/03-event-map.md`  | Showroom UX flow mapped to events; UE5 API surface                   |
| `docs/adr/`             | Architecture decisions, numbered                                     |
| `docs/references.md`    | External references (Figma, legacy system)                           |

## Commands

```bash
pnpm install
pnpm dev          # Next.js dev server
pnpm typecheck    # tsc --noEmit in every package
pnpm lint         # eslint, whole repo
pnpm test         # vitest
pnpm build        # production build of @observer/web
pnpm verify       # typecheck, lint, test, build
```

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
docs/                concept documents, ADRs, generated specifications
```
