# ADR-0014 — Attribution is a versioned policy owned by MADSPACE

**Status:** accepted · 2026-08-24 · **Supersedes** the inline attribution rule in ADR-0010

## Context

Attribution decides what "online-to-purchase conversion" counts. Change the window and the number
changes while looking identical, which makes this quarter silently incomparable with the last one.
That is the most dangerous failure an analytics product has: nobody notices, and the wrong conclusion
is drawn confidently.

Tenants also differ. A prime-city project and a suburban one do not share a sales cycle, so one fixed
window would be wrong somewhere.

## Decision

Attribution is a **policy object**, not a value inside a metric. It carries a semantic version, an
effective date and an optional tenant.

- Product default: **90 days**, deterministic identity links only, first-touch and last-touch always
  reported together, direct bookings in their own bucket, missing sources reported as unknown.
- **MADSPACE administrators alone may override it per tenant.** No dashboard user of any role may
  change it: a window a viewer can adjust means nothing, because two people looking at the same
  screen would be seeing different things.
- Every report exposes the policy version that produced its figures.
- Comparisons across incompatible versions are **refused with a reason**, not silently performed.
  Only the window and the qualifying link affect what is counted, so only those two make versions
  incompatible; a change to presentation does not.

## Consequences

- A changed window becomes a visible event in the data rather than an invisible one.
- `policiesComparable` and `comparisonRefusalReason` are the enforcement, and are tested.
- Historical figures keep the policy version in force when they were produced, so the archive stays
  interpretable after a change.
- The cost is that period comparison can refuse to answer. That is the correct behaviour: no answer
  beats an answer that quietly compares two different questions.
