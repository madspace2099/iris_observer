# Ingestion architecture

**Status:** contract, v0.1 · **Date:** 2026-08-24 · **Milestone:** M1 closure
**Implements:** `packages/contracts/src/observation.ts` · **Decides:** ADR-0015

---

## 1. The pipeline

```
  ┌──────────────────────┐
  │ source observation   │  immutable, exactly as received, never edited
  │ (WEBIRIS, UE5, CRM)  │  ← the external trust boundary
  └──────────┬───────────┘
             │  server-side adapter: validate, map, normalise
             ▼
  ┌──────────────────────┐
  │ canonical fact       │  one observable fact, with full provenance
  └──────────┬───────────┘
             ▼
  ┌──────────────────────┐
  │ projection           │  meetings, timelines, unit interest — rebuildable
  └──────────┬───────────┘
             ▼
  ┌──────────────────────┐
  │ metric               │  the registry, applied at query time
  └──────────┬───────────┘
             ▼
  ┌──────────────────────┐
  │ evidence             │  what a statement rests on, with its drill-down
  └──────────────────────┘
```

**The canonical fact store is not the external trust boundary.** Clients reach only the first box.

---

## 2. Why the extra layer earns its cost

**Normalisation rules change.** An adapter that misread a duration field, a unit code mapping that was
wrong for one project, a timezone assumption that held until it did not — all of these are ordinary and
all are correctable, but only if the original is still there. If clients wrote canonical facts
directly, a normalisation bug would be permanent.

**A single source cannot assert a derived truth.** A showroom PC can honestly report that a panel was
open for ninety seconds. It cannot report that a sale was caused by a website: it has neither the data
nor the standing. Attribution, conversion, anomalies and causation are Observer's conclusions, drawn
from the whole picture.

**Two channels, one fact.** A unit view happens online and in the showroom. Both normalise to
`unit.viewed`, with `channel` and `measurementMethod` preserved, which is what makes cross-channel
comparison possible without a hand-written reconciliation somewhere downstream.

---

## 3. What a client submits

`SourceObservation` — the envelope every source must supply, whatever its own vocabulary:

| Field                        | Why it is required                                                                |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `observationId`              | client-generated UUID; ingest deduplicates on it, so replay after a crash is safe |
| `sourceSchemaVersion`        | a showroom in the field may be several releases behind the server                 |
| `source`, `sourceEventName`  | what the source calls it, carried and never interpreted at this layer             |
| `tenantId`, `projectId`      | scope; also what the device credential is checked against                         |
| `installationId`, `deviceId` | which physical showroom and machine                                               |
| `occurredAt`                 | when the source says it happened, with an offset                                  |
| `sequence`                   | monotonic within a session or meeting; orders events inside the same millisecond  |
| `payload`                    | untouched. Its shape belongs to the per-source event catalogue, a later milestone |

Observations are stored immutably. Nothing downstream is a source of truth.

> **Amendment, 2026-09-01 — identity is derived, not submitted.**
>
> The row above describing `tenantId` and `projectId` as something a client supplies is
> obsolete for the UE5 showroom source. The approved UE5 plugin architecture brief (§3.2,
> §4.2, §9.2) requires the backend to **derive** tenant, project and source from the
> activated source credential, and states that the client cannot select them. The table
> describes the **stored** `SourceObservation`, which is composed server-side; it does not
> describe what travels over the wire.
>
> The wire form is [`docs/ue5-ingestion-contract.md`](ue5-ingestion-contract.md) and
> `packages/contracts/src/ue5/`. `projection.ts` is the executable mapping from a UE5 wire
> event plus server-derived identity to this `SourceObservation`, and `identity.test.ts`
> proves that no payload can influence the identity fields. Nothing about the pipeline in
> §1 changes: this is still the first box, reached through a credential rather than through
> a client-asserted scope.
>
> One genuine disagreement remains open. `SourceObservation.sequence` is required; the UE5
> envelope needs it null for events that belong to no session. The recommended resolution
> is to make it nullable here rather than to default such events to zero, and it is
> recorded as a proposal (`P-21`) rather than applied.

---

## 4. What the adapter produces

`CanonicalFact` preserves everything a metric or an audit could need:

- **`factId`** from the taxonomy, and **`semanticVersion`** of the normalisation rules, so a re-run is
  traceable.
- **`source` and `channel`**, kept separate: a fact can be reported by one system about another's
  channel.
- **`sourceObservationId`** — always traceable back to the original.
- **`measurementMethod`** — `active_foreground`, `elapsed_wall_clock`, `occurrence_only` or
  `paired_boundary`. A metric that blends measurement methods without knowing is silently wrong.
- **`rawActiveDurationMs`** — never pre-thresholded. See ADR-0016.
- **`identityConfidence`** — `none`, `probabilistic` or `deterministic`, so attributed metrics can
  filter without re-deriving the join.
- Context: tenant, project, contact, meeting, unit.

### What a client may never submit

Prefixes rejected at the adapter, as a checked list rather than a review convention:

`attribution.` · `conversion.` · `anomaly.` · `causal.` · `insight.`

---

## 5. Ingest semantics

- **Batched.** One request carries many observations.
- **Per-observation results.** Every observation comes back `accepted`, `duplicate` or `rejected`
  with a reason. Never a single verdict for the batch: a batch that half-failed must say which half.
- **Idempotent.** Deduplication on `observationId`. Sending the same batch twice changes nothing —
  which is exactly what the simulator asserts.
- **Rejections are data.** A rejected observation is recorded with its reason, so a misbehaving
  showroom build is visible in administration rather than silently dropping data.
- **Device-authenticated.** Each installation holds its own write-only credential, scoped to one
  tenant and project. No shared secret is compiled into a build.

---

## 6. Replay and rebuild

Two distinct operations, both required:

| Operation        | Re-runs                            | Used when                                                                   |
| ---------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| **Re-normalise** | adapters, over stored observations | an adapter was wrong, or a new fact is extracted from payloads already held |
| **Reproject**    | projections, over canonical facts  | a projection was wrong, or a new read model is added                        |

Neither touches source observations. That is the invariant the whole arrangement rests on.

---

## 7. Not yet built

The per-source event catalogues, the adapters themselves, the HTTP endpoint and its OpenAPI
description. M1 fixes the shape; the physical implementation follows the dashboard, per the reversed
development order.
