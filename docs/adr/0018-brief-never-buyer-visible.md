# ADR-0018 — The internal brief is never buyer-visible

**Status:** accepted · 2026-08-24

## Context

The showroom runs on a large display the buyer is looking at. The pre-meeting brief contains the
buyer's own behavioural history, inferred preferences, and — in the agent's workspace — patterns drawn
from other buyers.

A buyer discovering how closely their browsing was recorded, mid-meeting, on a screen they did not
expect it on, is a serious failure. Seeing another buyer's data there would be worse.

## Decision

The internal pre-meeting brief is **prohibited from every buyer-visible surface**. It exists only in
authenticated sales-agent surfaces: the agent's own device, the agent workspace, the meeting
drill-down.

The buyer-facing meeting report is a **separate, sanitised output contract** — the units discussed,
their floor plans and prices, and what was agreed. It shares no schema with the internal brief, so
there is no field that could leak by being rendered in the wrong template.

## Consequences

- Two report contracts to maintain, deliberately. A single contract with a "sanitised" flag is one
  forgotten condition away from an incident.
- Buyer-facing surfaces are marked as such in the route structure, and a test asserts that no
  internal brief component is reachable from one.
- Anything drawn from other buyers stays out of the buyer-facing report entirely, not merely
  anonymised: a small project makes "buyers like you" easy to de-anonymise.
