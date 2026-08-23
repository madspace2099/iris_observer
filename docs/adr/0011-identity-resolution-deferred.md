# ADR-0011 — Identity is tenant-scoped, and resolution is deferred

**Status:** accepted · 2026-08-24

## Context

Connecting a known WEBIRIS lead to the person who later walks into the showroom is what the unified
journey rests on. It is also the part of the product where being wrong has consequences for a real
person: a bad merge shows one buyer another buyer's history.

A sales agency may work for competing developers, and two developers may each hold a record for the
same buyer. Merging those would be a commercial incident, not a feature.

## Decision

**Scope.** `contact_id` is stable within one developer tenant and never crosses one. Enforced three
ways: `tenant_id` on every identity record, row-level security, and a per-tenant salt on the identity
hash — so hashes from two tenants cannot match even if the code attempted it.

**Deferral.** M1 delivers the entities, the rules, the link-strength model and the tests that pin them
down. It does not implement resolution, merging, hashing or the consent-withdrawal job. Those land with
the schema and the administration surface.

**Recorded, not assumed.** Every link states its basis and whether it is deterministic, and is
revocable. Attributed metrics count deterministic links only; a probabilistic link may suggest a brief
to a human who can dismiss it, but it may not move a number.

**Conflicts are surfaced, never resolved automatically.** Two contacts sharing a verified identity
produce a data-health item and stay separate. Undercounting is recoverable; showing one buyer another's
history is not.

## Consequences

- Writing the rules before the code means the awkward cases — duplicates, second devices, couples,
  walk-ins, erasure, consent withdrawal — are answered in `docs/05-identity.md` rather than discovered.
- Because behavioural data never contains personal data, erasure does not force destroying analytics.
  That is the reason for the separation, not a happy accident.
- Cross-device inference is deliberately not attempted. It is acceptable for advertising and wrong here.
