# ADR-0021 — Lead temperature is a signal, not a deal stage

**Status:** accepted · 2026-08-24 · **Corrects** the `hot_lead` rung introduced with ADR-0006's ladder

## Context

An earlier draft put `hot_lead` into the journey ladder, between `showroom_attended` and `offer`. It
was a modelling error, and the kind that is expensive to find late.

A deal stage is an **authoritative business state**: the CRM says a deal is at offer, and it got
there by moving forward. Lead temperature is a **derived, time-sensitive read**: Observer infers it
from behaviour, and it rises and falls.

Putting the second inside the first breaks conversion arithmetic. A buyer who goes quiet cools from
high to medium without moving backwards commercially — but a funnel routed through temperature would
record a regression that never happened, and every stage conversion downstream would inherit it.

## Decision

Two separate concepts.

**`DEAL_STAGES`** — lead, meeting, negotiation, offer, reservation, purchase, lost. Authoritative,
sourced only from the CRM or an explicitly authorised manual outcome, generally forward-moving.

**`IntentSignal`** — low, medium, high, insufficient_data. Observer's own, and it carries everything
needed to defend it: a deterministic score, the calculation timestamp, a freshness date, the
contributing metrics with their weights, evidence references, confidence, data completeness, reason
codes, and the ruleset version.

**Stage conversion is never computed through an intent level.** Whether the signal is worth anything
is measured separately, by `intent.high_to_offer`, `intent.high_to_reservation`,
`intent.high_to_purchase` and `intent.lift_over_baseline` — the last of which will say plainly if a
high signal converts no better than average.

The UI may badge `high` as "Hot lead". That is a label on an Observer signal shown **beside** the
authoritative stage, never in place of it.

## Consequences

- Conversion arithmetic stays sound: every rung is a state the business actually recorded.
- Intent expires. A signal past its freshness window is not shown as current, because a "high" from
  six weeks ago describes a buyer who may already have bought elsewhere.
- The intent model can be wrong and be _seen_ to be wrong, because `intent.lift_over_baseline`
  measures it against the project's own average rather than assuming it helps.
- Two concepts to explain instead of one. That is the honest cost, and it is smaller than the cost of
  a funnel that quietly miscounts.
