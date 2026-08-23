# ADR-0005 — Row-level security is the isolation boundary

**Status:** accepted · 2026-08-24

## Context

The legacy dashboard's login gate was cosmetic: it fetched the session table with the public anon
key regardless of authentication state, so every visitor name and phone number was readable by
anyone who opened the page source. Verified against the live endpoint on 2026-08-23.

A sales agency may work for competing developers simultaneously, which makes cross-tenant leakage a
commercial risk, not only a privacy one.

## Decision

Authorization is enforced twice. The API layer applies the permission model; the database enforces
row-level security independently on every tenant-scoped table. The application connects as a role
without BYPASSRLS. Browser clients never hold a credential that can read another tenant's rows, and
device ingest credentials are write-only and scoped to a single project.

## Consequences

- A forgotten tenant filter cannot become a data breach.
- Isolation is testable as a property, and it is tested: two developers, two agencies, one agency
  shared between them.
- Every new table needs a policy before it ships. This is deliberate friction.
