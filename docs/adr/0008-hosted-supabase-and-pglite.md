# ADR-0008 — Hosted Supabase for the app, PGlite for data tests

**Status:** accepted · 2026-08-24

## Context

Docker is not installed on the development machine, so the Supabase CLI cannot run a local stack.
The product needs real Postgres, real Auth and real row-level security, and the test suite needs to
run fast, offline and in CI.

## Decision

A dedicated hosted Supabase development project backs the running application. Schema, RLS and
metric tests run against PGlite (Postgres compiled to WebAssembly) with the same migrations applied.

## Consequences

- Tests need no network, no Docker and no shared state; CI is trivial.
- PGlite has no Supabase Auth schema, so tests exercise RLS through explicit role and session
  settings rather than through real tokens. End-to-end auth is covered separately.
- If PGlite diverges from Postgres in a way that matters, the fallback is a test schema on the
  hosted project. No application code changes either way.
