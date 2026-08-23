# ADR-0003 — Workspace packages are consumed as TypeScript source

**Status:** accepted · 2026-08-24

## Context

A per-package build step in a monorepo costs a build-order graph, stale output bugs and a slower
inner loop, in exchange for benefits that only matter when publishing to a registry. Nothing here
is published.

## Decision

Every workspace package exports `./src/index.ts` directly. Next.js compiles them through
`transpilePackages`. Node-side entry points (seeds, simulator, generators) run through `tsx`.
Only `@observer/web` has a build step.

## Consequences

- No build ordering, no stale artefacts, instant cross-package changes.
- Per-package `tsc --noEmit` remains the correctness gate.
- If a package is ever published, it gains its own build then, and not before.
