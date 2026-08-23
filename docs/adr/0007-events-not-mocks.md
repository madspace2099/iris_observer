# ADR-0007 — Seeds and the simulator emit real events

**Status:** accepted · 2026-08-24

## Context

The dashboard must look and behave like the finished product before Unreal Engine produces a single
event. The tempting shortcut is a large mock-data module. That shortcut guarantees the demo and the
product diverge, and it proves nothing about ingest, projections or the query layer.

## Decision

Synthetic scenarios are generated as **event batches** and pushed through the real ingest API. The
same projections and the same query layer serve them. There is no mock data layer, and the frontend
cannot distinguish synthetic events from live ones.

## Consequences

- The integration simulator is not a separate toy; it is how the demonstration data exists.
- Ingest, idempotency, validation and projections are exercised from day one.
- "A new project can be populated through the standard event API" is true by construction rather
  than by assertion.
