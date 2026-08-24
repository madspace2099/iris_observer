# Synthetic scenarios

**Status:** specification, v0.1 · **Date:** 2026-08-24 · **Milestone:** M1 (specified) → M4 (seeded)

Scenarios are **deterministic**: fixed identifiers, fixed timestamps, a fixed random seed. A demo that
changes shape between runs cannot be asserted against, and a screenshot of it proves nothing.

They are generated as **fact batches pushed through the real ingest API** (ADR-0007). There is no mock
data layer. Every screen state in the product — healthy, declining, insufficient, disconnected,
unmatched — is produced by one of these, which is also how those states get tested.

Reference tenant: `tnt_demoalpha01` (developer). Reference projects: `prj_northgate01`,
`prj_riversidew1`. A second tenant, `tnt_demobeta002`, exists solely to prove isolation.

---

## 1. Viktória — the reference journey

The scenario the whole WEBIRIS-to-showroom capability is demonstrated with. Every step is one or more
observable facts; wire event names are deliberately not fixed yet.

| #   | When            | What happens                                                                                    | Facts                                                                  | Assertion                                                                                                       |
| --- | --------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | 02 Aug, 18:12   | Visits anonymously, browses 14 minutes                                                          | `online.session.observed`                                              | counted in `webiris.anonymous_visitors`; no contact exists                                                      |
| 2   | 02 Aug          | Views three two-bedroom units — A-402, B-301, A-505 — twice each                                | `unit.viewed` ×6                                                       | 3 units, 6 views, 2 unique views per unit                                                                       |
| 3   | 09 Aug          | Second visit; favourites two of the three (A-402 and A-505)                                     | `online.session.observed`, `unit.favourited` ×2                        | favourites survive across sessions                                                                              |
| 4   | 09–21 Aug       | Filters for southern orientation on four occasions                                              | `catalogue.filtered` ×4                                                | preferred attribute `orientation = S`, support 4 of 5                                                           |
| 5   | 21 Aug, 21:40   | Third visit, then submits the lead form. Consent: behavioural linking **yes**, marketing **no** | `lead.submitted`                                                       | contact created; `webiris.visitor_to_lead` numerator +1                                                         |
| 6   | 21 Aug          | Prior activity back-linked on `same_device`                                                     | `identity.linked` (deterministic)                                      | all three sessions attach; `backLinked = true`                                                                  |
| 7   | 22 Aug          | Books a showroom meeting for 27 Aug                                                             | `meeting.booked`                                                       | `meeting_id` minted; `journey.lead_to_booking` +1                                                               |
| 7b  | 25 Aug          | **A-505 sells to another buyer** while she is deciding                                          | `unit.availability.changed`                                            | the brief must surface this before the meeting                                                                  |
| 8   | 27 Aug, 09:00   | Agent opens the pre-meeting brief                                                               | —                                                                      | brief lists 3 units, 2 favourites, south-facing preference, price range **null** (she never set a price filter) |
| 9   | 27 Aug, 10:04   | She attends; the session binds to the same `meeting_id`                                         | `meeting.attended`                                                     | one meeting, not two                                                                                            |
| 10  | 27 Aug          | Showroom behaviour appends to the same journey                                                  | `unit.viewed`, `unit.examined.balcony`, `unit.compared`, `unit.shared` | timeline interleaves both channels in one order                                                                 |
| 11  | 27 Aug          | Outcome: `interested`, on two units                                                             | `meeting.outcome.recorded`                                             | `journey.webiris_to_showroom` +1, attributed deterministically                                                  |
| 12  | 04 Sep → 19 Sep | CRM: offer, then reservation                                                                    | `deal.stage.changed` ×2                                                | `journey.online_to_offer` and `online_to_reservation` +1 each, inside the 90-day window                         |

**What this scenario is for.** It is the only path that exercises the full four-source join, and it is
the demo. If it renders correctly, the core product claim is true.

---

## 2. The cases that break naive implementations

| Scenario                       | Setup                                                         | What must happen                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Never identifies**           | Visitor makes 5 sessions, views 8 units, never submits a form | Counts in anonymous visitors and unit interest. Appears in **no** contact timeline. `webiris.visitor_to_lead` denominator +1, numerator +0.                               |
| **Second device**              | Browses on a phone, submits on a laptop                       | Only the laptop's history back-links. The phone visitor stays anonymous. The brief's `dataHealth` notes the picture may be incomplete. **No cross-device guessing.**      |
| **Duplicate CRM contacts**     | The CRM holds the same buyer twice, unmerged                  | Two `SourceReference` records, one contact, conflict raised as a data-health item. No automatic merge. Metrics count one person.                                          |
| **A couple**                   | Two contacts attend one meeting; one is primary               | One meeting, two participants. The brief covers both. The outcome attaches to the meeting, not to one contact. Not double-counted in attendance.                          |
| **Unmatched showroom visitor** | Walk-in, no details given                                     | `origin: showroom_walk_in`, one `unidentified` participant. Counts in attendance and behaviour; counts in `journey.unmatched_meetings`; joins no timeline.                |
| **Withdrawn consent**          | Viktória withdraws after step 12                              | Back-linked sessions detach and return to the anonymous pool. Marketing exports exclude her. Meeting and reservation remain — a signed reservation is a contractual fact. |
| **Erasure**                    | A different contact requests deletion                         | `ContactPii` deleted, contact tombstoned. Aggregates unchanged, because behavioural data never held PII. Timelines and exports exclude them.                              |
| **Missing WEBIRIS**            | A project with the showroom connected and WEBIRIS not         | Every journey metric renders its **unavailable** state with a reason. Showroom metrics work normally. Completeness reports the gap; no number silently shrinks.           |
| **Disconnected CRM**           | WEBIRIS and showroom present, CRM absent                      | Funnel renders down to `showroom_attended`; below it, unavailable. Outcome comes from the showroom instead.                                                               |
| **Insufficient history**       | A project live for three weeks, 7 meetings                    | Verdicts suppressed. Cards read "not enough data yet (7 of 20)" and show raw counts. **No leaderboard.**                                                                  |
| **Same email, two tenants**    | `viktoria@example.com` in both demo tenants                   | Two contacts, never merged, hashes do not collide. Neither tenant can see the other's.                                                                                    |

---

## 3. Project-shaped scenarios

These drive the developer-facing screens rather than the identity logic.

| Scenario                          | Shape                                                                     | Demonstrates                                                                         |
| --------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Healthy project**               | steady velocity, ~30% attendance-to-offer, complete data                  | the ordinary case, and the ten-second verdict reading "healthy"                      |
| **Declining demand**              | trailing 4-week velocity at 0.6× the 12-week figure                       | the velocity-drop detector; sell-out forecast moving out by months                   |
| **High interest, low conversion** | a segment with `attention_index` 2.1 and half the project's conversion    | the mispriced quadrant — the highest-value finding in the product                    |
| **Sharp interest decline**        | one unit whose views collapse after a price change                        | the demand-drop warning on unit detail                                               |
| **Many comparisons, few wins**    | A-402 in 9 compare sets, kept twice, losing to B-301 seven times          | the competition graph and the pricing conclusion                                     |
| **Multiple agencies**             | two agencies on one project, one above and one below the sample threshold | fair comparison and the refusal to rank on small n                                   |
| **One developer, two projects**   | shared contacts across projects of one tenant                             | `ProjectContact` separation; cross-project benchmarking                              |
| **Agency across developers**      | one agency working for both demo tenants                                  | strict isolation: the agency sees each project separately and never the two together |

---

## 4. Rules the seeds must obey

1. **Facts, not rows.** Everything enters through the ingest API. If a scenario cannot be expressed as
   facts, the fact taxonomy is missing something — that is a finding, not a reason to insert rows.
2. **Deterministic.** Fixed seed, fixed identifiers, fixed dates relative to a pinned "today". Re-running
   produces byte-identical results.
3. **Replayable.** Sending the same batch twice must not change a single metric. This is how idempotency
   gets tested.
4. **Independent.** Any scenario can be loaded into an empty project on its own.
5. **Honest volumes.** Roughly 100 visitors per week per project, meetings in the tens per month. A demo
   with 50,000 meetings would hide every small-sample problem the product is designed to surface.
