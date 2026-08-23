# IRIS Observer

Sales intelligence for MADSPACE IRIS showroom installations.

A sales agent presents a residential development to a buyer inside an Unreal Engine 5 application.
Observer records what happened in that meeting, joins it to the developer's CRM, and turns it into
decisions: what to price differently, what the campaign should say, which buyers to call, and when
the project will sell out.

One application serves every developer, every project and every showroom. A new project is created
through configuration — never by changing source code.

## Development order

This phase is deliberately reversed relative to the usual one. **Observer defines what must be
measured**; the Unreal Engine module implements that specification afterwards. The application is
therefore built end to end against realistic synthetic data in the real target schema, and the
handoff to Unreal is a generated, testable instrumentation specification.

No Unreal C++ is written in this phase.

## Requirements

- Node 22 or newer (verified on 24.19.0)
- pnpm 11.23.0
- A Supabase project for the database and authentication

`corepack enable` needs administrator rights on some Windows machines. If it fails,
`npm install -g pnpm@11.23.0` works, and so does invoking `corepack pnpm ...` directly.

Docker is not required. The Supabase CLI's local stack is not used — see
[ADR-0008](docs/adr/0008-hosted-supabase-and-pglite.md).

## Setup

```bash
pnpm install
cp .env.example .env.local     # then fill in the values
```

Every variable in [`.env.example`](.env.example) is read by code somewhere. No production
credentials belong in this repository.

## Commands

```bash
pnpm dev            # Next.js development server
pnpm build          # production build
pnpm typecheck      # tsc --noEmit across every package
pnpm lint           # ESLint, whole repository
pnpm format         # Prettier, write
pnpm format:check   # Prettier, verify only (what CI runs)
pnpm test           # Vitest
pnpm verify         # format:check, typecheck, lint, test, build
```

`pnpm verify` is the same sequence CI runs, in the same order. If it passes locally it passes on CI.

## Layout

| Path                 | Contents                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| `apps/web`           | Next.js application: dashboard, agent workspace, administration, ingest API |
| `packages/contracts` | Versioned event contract — Zod schemas, JSON Schema, OpenAPI, examples      |
| `packages/db`        | Drizzle schema, migrations, row-level-security policies, projections, seeds |
| `packages/metrics`   | Metric registry and the typed query layer every screen reads from           |
| `packages/ui`        | Design tokens, primitives and hand-built SVG charts                         |
| `packages/simulator` | Integration simulator: replays event batches through the real ingest API    |
| `docs`               | Product concept, architecture decisions, generated specifications           |

Workspace packages are consumed as TypeScript source; only the web application has a build step.

## Documentation

| Document                                         | What it settles                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [`docs/01-foundation.md`](docs/01-foundation.md) | Who the product is for, tenancy, the CRM boundary, identity and privacy |
| [`docs/02-views.md`](docs/02-views.md)           | The page pattern, the metric layer, the views, the AI layer, sequencing |
| [`docs/03-event-map.md`](docs/03-event-map.md)   | The showroom UX flow mapped to events, and the Unreal API surface       |
| [`docs/adr/`](docs/adr)                          | Architecture decisions, numbered and dated                              |
| [`docs/references.md`](docs/references.md)       | External references. Holds no credentials.                              |
| [`CLAUDE.md`](CLAUDE.md)                         | Working notes and the rules that must not be broken                     |

## Ground rules

These are enforced in review, and most of them have an ADR behind them.

1. The showroom client emits events and never aggregates. Everything else is derived and rebuildable.
2. There is no mock data layer. Synthetic scenarios are event batches sent through the real ingest API.
3. Every metric is declared once in the registry. The dependency matrix and the Unreal specification
   are generated from it.
4. No names, emails or phone numbers in event payloads.
5. Every tenant-scoped table ships with its row-level-security policy in the same migration.
6. Nothing project-specific in application logic — no hard-coded project, unit, colour, currency or
   seat count.
7. No metric without a denominator, no verdict without a sample size, no screen without an action.
