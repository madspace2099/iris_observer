# ADR-0015 — Source observations are the ingestion boundary

**Status:** accepted · 2026-08-24

## Context

An earlier sketch had clients posting canonical facts straight into the fact store. That makes the
canonical store the external trust boundary, with two consequences that would be permanent.

Normalisation rules change. If a client writes canonical facts directly, a bug in how a duration was
interpreted cannot be corrected for existing data — the original is gone.

And a single source has neither the data nor the standing to assert a derived truth. A showroom PC can
honestly report that a panel was open for ninety seconds. It cannot report that a sale was caused by a
website.

## Decision

```
immutable source observation → adapter + validation → canonical fact → projection → metric → evidence
```

Clients submit **source observations**: what their own system saw, in its own vocabulary, with a
client-generated identifier, a source schema version and an untouched payload. These are stored
immutably and never edited.

Server-side **adapters** normalise them into canonical facts. A canonical fact preserves source
system, channel, tenant, project, source observation identifier, measurement method, raw active
duration, semantic version, observation timestamp, identity confidence, and unit or meeting context.

Clients may never submit attribution, conversion, anomaly, causal or insight facts. The prohibition is
a checked prefix list, not a review convention.

## Consequences

- A corrected adapter can be re-run across history, because the originals are still there.
- The same shared fact — `unit.viewed` — can arrive from WEBIRIS and from the showroom and be
  reconciled once, with the channel and measurement method preserved so a metric never blends
  incomparable measurements without knowing.
- Storage roughly doubles: observations and facts are both kept. At this volume that is irrelevant,
  and it is the price of being able to fix mistakes.
- Ingest reports per observation — accepted, duplicate or rejected with a reason — never a single
  verdict for a batch.
