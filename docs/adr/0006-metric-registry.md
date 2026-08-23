# ADR-0006 — The metric registry is the single source of truth

**Status:** accepted · 2026-08-24

## Context

Analytics products rot when the same word means different things on different screens, and when the
formula lives inside a React component where nobody can audit it. The handoff to Unreal Engine adds
a second failure mode: a screen can silently depend on an event that nobody ever implemented.

## Decision

Every metric is declared once in a machine-readable registry: identifier, display name, business
definition, calculation, numerator, denominator, exclusions, dimensions, time window, required
events, required CRM fields, required unit attributes, minimum sample size, comparison method,
empty state, unavailable state, drill-down destination and permitted roles.

Generated from it: the query layer's typed contracts, the measurement dependency matrix in both
Markdown and JSON, and the UE5 instrumentation specification.

## Consequences

- The UI, the query layer and the UE5 specification cannot drift apart: they share identifiers.
- A metric whose events do not exist yet is visible as such, by construction.
- Adding a metric means editing the registry, not a component.
