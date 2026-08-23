# ADR-0002 — Modular monolith over pnpm workspaces

**Status:** accepted · 2026-08-24

## Context

IRIS Observer serves several audiences (sales agent, agency manager, developer, MADSPACE admin) and
several surfaces (web app, ingest API, simulator, report generation). The team is small.

## Decision

One deployable application, internally split into workspace packages with explicit dependency
directions:

    contracts  ->  db  ->  metrics  ->  web
    contracts  ->  simulator
    ui         ->  web

No package may import from a package that depends on it. Services are not split out.

## Consequences

- One deployment, one migration path, one auth model.
- Boundaries are enforced by dependency direction, not by network calls.
- If a component ever needs independent scaling, the package boundary is already the seam.
