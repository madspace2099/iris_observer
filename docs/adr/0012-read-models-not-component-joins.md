# ADR-0012 — The UI consumes read models, never source records

**Status:** accepted · 2026-08-24

## Context

The unified timeline draws on four systems whose clocks disagree, whose delivery is asynchronous, and
which sometimes report the same fact twice. Reconciling them requires ordering across clock skew,
deduplicating, hiding entries whose consent was withdrawn, and deciding what a gap means.

A component that fetches sessions and meetings and zips them by timestamp will be subtly wrong — and
wrong differently on every screen that does it.

## Decision

Observer exposes **read models**: `TimelineEntry`, metric results, the pre-meeting brief. Components
render them. No React component joins WEBIRIS, CRM and showroom records, and no component computes a
metric.

Where a source is missing, the read model says so — `sourcesMissing`, `completeness` — and the
component renders that state rather than silently showing a smaller number.

## Consequences

- The dashboard, the PDF export and the MCP server give the same answer, because they read the same
  model. Three implementations of "unique unit views" would eventually be three different numbers.
- Reconciliation rules are testable in one place.
- Read models must be designed per surface rather than emerging from whatever a component happened to
  need. That is more up-front work and it is the point.
