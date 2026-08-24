# Measurement policies

**Status:** confirmed product decisions, v0.1 · **Date:** 2026-08-24
**Implements:** `packages/metrics/src/policy.ts` · **Decides:** ADR-0014, ADR-0016, ADR-0017, ADR-0018

A policy is a decision that changes what a number means. Each one here is versioned, dated and
reported alongside the figures it produced, because a policy that changes silently makes this quarter
incomparable with the last one while looking identical.

Nothing in this document is a legal position. Items marked **[review]** await formal privacy and legal
review.

---

## 1. Attribution

| Setting                  | Value                                                   |
| ------------------------ | ------------------------------------------------------- |
| Default window           | **90 days**                                             |
| Qualifying identity link | deterministic only                                      |
| Touch model              | first-touch and last-touch **always reported together** |
| Direct bookings          | separate bucket, never folded into the attributed group |
| Missing source           | reported as unknown, never as "no online activity"      |
| Configurable by          | **MADSPACE administrators only**, per tenant            |
| Versioning               | semantic version plus `effectiveFrom`                   |

**No dashboard-user override, at any role.** A window a viewer can adjust means nothing, because two
people looking at the same screen would be seeing different things.

**Reports expose the policy version.** Comparisons across incompatible versions are refused with a
reason rather than silently performed. Only the window and the qualifying link change what is counted,
so only those two make two versions incompatible.

---

## 2. Meaningful dwell

| Channel  | Initial threshold |
| -------- | ----------------- |
| WEBIRIS  | 10 active seconds |
| Showroom | 15 active seconds |

**Raw active duration is always retained.** The threshold is derived, versioned and applied at query
time — never during ingestion — so it can be revised and re-applied to all history.

Excluded from active time: hidden browser tabs, backgrounded application time, idle time with no
interaction, and time after another unit became the active one.

Channel and measurement method are preserved. Where a source could only report ungated wall-clock
time, the threshold is not applied and the figure is reported separately: twelve seconds of elapsed
wall clock is not twelve seconds of attention.

---

## 3. WEBIRIS visitor identity

The product default WEBIRIS is expected to implement. **[review]** — a product setting subject to
privacy and legal review, not a universal legal assertion.

| Setting                    | Value                                      |
| -------------------------- | ------------------------------------------ |
| Identifier                 | first-party **pseudonymous UUID**          |
| Lifetime                   | 180-day rolling                            |
| Cookie protections         | `Secure`, `SameSite`                       |
| Delivery                   | routed through a first-party endpoint      |
| Fingerprinting             | **none**, at any layer                     |
| Consent and deletion state | stored **separately** from the identifier  |
| Cross-device linking       | only after a deterministic identity action |

The separation of consent state from the identifier is what makes withdrawal enforceable without
destroying the identifier that withdrawal has to be applied to.

A pseudonymous identifier remains linkable to a person while the links exist, and therefore keeps the
same protected treatment as personal data until they are removed. See `docs/05-identity.md` §2.3.

---

## 4. Canonical meeting identity

**Observer owns `meeting_id`.** WEBIRIS and CRM booking identifiers are `SourceReference` records
against it, never the key.

Where a CRM integration exists, the CRM owns the **business status** of the appointment — scheduled,
rescheduled, cancelled — but not Observer's cross-system identifier. A booking and the showroom
session that follows resolve to the same `meeting_id`, whichever created it first, and a walk-in is a
first-class origin rather than an error.

---

## 5. Brief visibility

The internal pre-meeting brief is **prohibited on every buyer-visible surface**. It exists only in
authenticated sales-agent surfaces.

The buyer-facing meeting report is a **separate, sanitised output contract** sharing no schema with
the internal brief, so no field can leak by being rendered in the wrong template. Nothing derived from
other buyers appears in it at all — on a small project, "buyers like you" is easy to de-anonymise.

---

## 6. Sample-size protection

| Surface                    | Minimum                                 |
| -------------------------- | --------------------------------------- |
| Agent or agency comparison | 20 meetings per agent                   |
| Unit trend and decline     | 10 observations in the twelve-week base |
| Rate metrics generally     | declared per metric in the registry     |

Below the minimum, the card shows the raw figure and states how far short it is. It never shows a
rank, a verdict or a trend. The legacy dashboard ranked engagement off two sessions; repeating that
would lose the argument with the agency permanently, and deservedly.

---

## 7. Marked for formal review

| Item                        | Question                                                                         |
| --------------------------- | -------------------------------------------------------------------------------- |
| Legal basis                 | On what basis is behavioural data linked to an identified buyer, per channel?    |
| Consent wording             | The exact text shown at lead submission and at the start of a showroom meeting.  |
| Retention periods           | How long source observations, canonical facts and contact records are kept.      |
| Anonymisation standard      | What counts as sufficient, and whether tombstoning satisfies an erasure request. |
| Controller roles            | Which of the developer and the agency decides what, and what follows from it.    |
| Visitor identifier lifetime | Whether 180 days is defensible in the relevant jurisdictions.                    |
