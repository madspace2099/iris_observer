# Source-of-truth ownership

**Status:** contract, v0.1 · **Date:** 2026-08-24 · **Milestone:** M1
**Implements:** `packages/contracts/src/sources.ts` · **Decides:** ADR-0012

Four systems supply facts and one system reconciles them. When two disagree, the table below settles
it — before the disagreement happens, not during the incident.

---

## 1. Who owns what

| System             | Owns                                                                                                                        | Does not own                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **WEBIRIS**        | observed online behaviour: sessions, online unit interest, filters, online favourites, lead submission and its consent      | anything after the buyer leaves the site      |
| **CRM**            | contact records, appointments, deal stages, offers, reservations, sales — **where a supported integration exists**          | what happened inside a meeting                |
| **IRIS Showroom**  | in-meeting behavioural observation: attendance, what was shown, dwell, compare sets, shares, captures, the recorded outcome | whether the deal later closed                 |
| **Unit catalogue** | unit attributes, price, availability                                                                                        | anything about people                         |
| **IRIS Observer**  | normalised cross-source timelines, deterministic metrics, evidence objects, generated intelligence                          | any primary fact — Observer never invents one |

The last row is the load-bearing one. **Observer owns no primary facts.** Everything it holds is either
a copy of somebody else's fact, correctly attributed, or something it derived and can explain.

### Where two systems overlap

Some facts arrive from both channels — a unit view happens online and in the showroom. Those are **one
observable fact**, not two similar ones, and Observer owns the reconciled version (`ObservableFact.owner`
is `observer` in those cases). Cross-channel preference agreement is only computable because of this;
two separately named events would never line up.

When a supported CRM exists it wins on contact and stage facts, even against a more recent showroom
observation, because the CRM is where the commercial truth is contractually recorded. When no CRM is
connected, Observer's own records stand in, and every affected number reports reduced completeness
rather than pretending.

---

## 2. The read-model rule

> **The UI consumes Observer read models. It must never join unrelated source records in a React
> component.**

Reconciliation is not display logic. It involves ordering across clock skew between a browser, a
showroom PC and a CRM webhook; deduplicating a fact two systems both reported; hiding entries whose
consent was withdrawn; and deciding what a gap means. Those rules must live in one place that can be
tested, and they must produce the same answer for the dashboard, the PDF export and the MCP server.

A component that fetches sessions and meetings and zips them together by timestamp will be subtly
wrong, and it will be wrong differently on every screen that does it.

Concretely:

- `TimelineEntry` is a read model. Components render it; they do not build it.
- Metric results come from the metric registry's query layer, never from a client-side reduce.
- Where a source is missing, the read model says so (`sourcesMissing`, `completeness`) and the
  component renders that state — it does not silently show a smaller number.

---

## 3. Consequences for the connectors

1. Observer keeps a **canonical model** (`Unit`, `Contact`, `Deal`, `Meeting`). Connectors map into
   it. No core code names a vendor.
2. The **manual path always works**. A client with no supported CRM must still be able to use the
   product, degraded and honestly labelled.
3. Every imported record carries a `SourceReference`, so a bad sync run can be traced and reversed
   without touching records created by hand or by another connector.
4. A disconnected source is a **state**, not an error. `journey.cross_channel_completeness` measures
   it, and affected metrics render their unavailable state.
