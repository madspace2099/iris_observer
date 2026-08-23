# ADR-0013 — Observable facts are defined before wire event names

**Status:** accepted · 2026-08-24

## Context

Observer must specify what to measure before either producer implements it: the Unreal module is
written afterwards, and WEBIRIS instrumentation is a separate workstream. Freezing concrete event
names now would fix the wrong layer first, and would have to be revised as soon as either producer met
reality.

There is also a modelling trap. A unit view happens online **and** in the showroom. If those become two
similarly named events, every cross-channel metric — preference agreement above all — has to reconcile
them by hand, forever.

## Decision

Define an **observable-fact taxonomy**: what Observer must be able to know, which system is
authoritative, which systems can report it, and which attributes are required.

Metrics declare `requiredFacts`. Wire events are mapped onto facts in a later milestone, and the
dependency matrix expands metric → fact → event once that catalogue exists.

Where a fact arrives from more than one channel, Observer is its owner and reconciles it. Single-source
facts are owned by their producer.

## Consequences

- Metrics are specifiable before either producer exists, which is what makes the reversed development
  order work at all.
- Renaming an event later is a mapping change, not a metric rewrite.
- Cross-channel comparison is possible because both channels supply the same fact.
- The cost is one indirection: reading the matrix means following metric → fact → event rather than
  metric → event. Worth it, and it disappears once the catalogue is generated.
