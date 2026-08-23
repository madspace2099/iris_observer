# ADR-0004 — Drizzle ORM with repository-managed SQL migrations

**Status:** accepted · 2026-08-24

## Context

The schema must be reviewable, versioned in git, and applied identically to a development database
and to production. Row-level security policies are hand-written SQL that no ORM models well.

## Decision

Drizzle ORM for the schema definition and the typed query layer; `drizzle-kit generate` for
migrations, committed as plain SQL. RLS policies live in hand-written SQL migrations alongside them.
This mirrors the sibling MADSPACE repository, including its two-role owner/app model.

## Consequences

- Every schema change is a reviewable SQL diff.
- Policies and tables version together; a table cannot ship without its policy.
- Drizzle's typed queries cover the ordinary path; analytics aggregation uses raw SQL behind the
  metric registry, which is the appropriate tool for the job.
