# ADR-0001 — Append-only events are the single source of truth

**Status:** accepted · 2026-08-24

## Context

The legacy `InsightAnalytics` UE5 module stored pre-aggregated counters (`ClickMap`,
`FeatureTimeMap`, `GlobalApartmentRegistry`) and pushed them to Supabase as one JSON blob per
session. A metric that was not counted at the time it happened was lost permanently, and no
timestamped ordering existed below the session boundary.

## Decision

The showroom client emits immutable, timestamped, append-only **events**. Everything else —
meetings, participants, unit interest, funnels, rollups — is a **projection** derived from those
events and rebuildable at any time.

The client never aggregates.

## Consequences

- A metric invented next year can be computed over last year's data.
- Ingest must be idempotent, because at-least-once delivery is the only realistic guarantee.
- Projections are disposable; raw events are not. Backups protect the event table above all else.
- Storage grows linearly with meetings rather than staying constant. At the observed scale
  (about 100 visitors per week per project) this is irrelevant for years.
