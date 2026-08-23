# ADR-0010 — Claim strength is data, and Observer never claims causation

**Status:** accepted · 2026-08-24

## Context

Observer joins WEBIRIS, the CRM and the showroom, and then says things about buyers. The distance
between "these facts were recorded in this order" and "the website caused this sale" is enormous. A
product that blurs it will eventually send a developer's marketing budget somewhere it should not go,
and will be believed while doing so, because the number looked precise.

Editorial discipline is not enough. Wording drifts, and a generated sentence has no author to hold to
it.

## Decision

Every claim carries its tier in data: `observed_sequence`, `attributed_conversion`,
`statistical_association`, `causal_claim`.

Observer produces the first three. **It never produces the fourth.** The tier is named in the enum
precisely so that the prohibition is expressible and testable: `StatementSchema` rejects it, and the
metric registry validator rejects it.

An attributed metric must state its attribution rule, and only attributed metrics may carry one. All
attributed journey metrics share a single rule so they stay comparable with each other.

Confidence is categorical and explained — a level plus a reason — never a manufactured percentage.

## Consequences

- The UI can style an association differently from an observation without dereferencing anything.
- "WEBIRIS caused this showroom visit" is unsayable by construction, not by convention.
- Association claims may never be made about an individual. "Buyers like her usually" is not a fact
  about her, and the brief contract keeps such statements out of the observed section.
- Establishing causation would need a controlled experiment. That is outside this product, and saying
  so plainly is more useful to a client than a confident number would be.
