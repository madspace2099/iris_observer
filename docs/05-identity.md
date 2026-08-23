# Identity architecture

**Status:** contract, v0.1 · **Date:** 2026-08-24 · **Milestone:** M1
**Implements:** `packages/contracts/src/identity.ts` · **Decides:** ADR-0011

Connecting a known WEBIRIS lead to the person who later walks into the showroom is the capability the
whole journey rests on. It is also the part of the product where being wrong has consequences for a
real person, so the rules are settled and reviewed here **before** any code merges records.

**Identity resolution is deliberately not implemented in this milestone.**

---

## 1. The entities

| Entity               | What it is                                                             | Scope            |
| -------------------- | ---------------------------------------------------------------------- | ---------------- |
| `AnonymousVisitor`   | a browser that has not identified itself                               | tenant           |
| `OnlineSession`      | one continuous visit                                                   | tenant + project |
| `Contact`            | a person, carrying **no** personal data                                | tenant           |
| `ContactPii`         | name, email, phone — separate record, separate permission              | tenant           |
| `ContactIdentity`    | one way a contact can be recognised (email, phone, CRM record, device) | tenant           |
| `Lead`               | the moment of identification, with its consent                         | tenant + project |
| `ProjectContact`     | this person's relationship with one project                            | tenant + project |
| `IdentityLink`       | why two records are believed to be the same person                     | tenant           |
| `Meeting`            | one showroom appointment and session, sharing one id                   | tenant + project |
| `MeetingParticipant` | who was in the room                                                    | meeting          |
| `Deal`               | the commercial process on one project                                  | tenant + project |
| `SourceReference`    | a pointer to the same thing in another system                          | tenant           |
| `TimelineEntry`      | one normalised entry on the unified timeline (a read model)            | tenant           |

---

## 2. The rules

**1. `contact_id` is stable within one developer tenant.** The same person may interact with several
of that tenant's projects and appear under one contact, with a separate `ProjectContact` per project.
Collapsing per-project state onto the contact makes two-project reporting wrong the first time anyone
looks.

**2. Identity resolution never crosses a tenant boundary.** Two developers may both hold a record for
the same buyer, and merging them would be a commercial incident. This is enforced three ways:
`tenantId` on every identity record, row-level security, and a **per-tenant salt** on the identity
hash — so a hash from one tenant cannot match a hash from another even if the code tried.

**3. Behavioural payloads carry internal identifiers only.** No name, email or phone in an event or an
observation, ever. `Contact` is a strict object with no PII fields, which makes the separation
structural rather than a matter of remembering to omit columns.

**4. Matching runs on hashes, not raw values.** `ContactIdentity.valueHash` holds a tenant-salted hash
of the normalised value, so resolution can run in contexts where the plain address must not be present.

**5. Pre-identification activity may be back-linked only when consent allows it.** The consent captured
at lead submission (`Lead.consent.behaviouralLinking`) governs whether the anonymous history attached
to that visitor may be joined to the contact. Without it, the sessions stay anonymous and contribute
only to aggregates.

**6. Back-linked history is labelled.** `TimelineEntry.backLinked` and
`OnlineActivity.includesBackLinkedActivity` are surfaced in the UI. An agent should know which part of
the history the buyer never volunteered, and a buyer who asks should get a straight answer.

**7. Meetings support several participants.** Buyers arrive in pairs and decide together; a model with
one contact per meeting reports half of a joint decision. An `unidentified` participant is also valid —
a walk-in who declines to give details is a real case, not a data error.

**8. Cross-system identifiers are explicit records.** `SourceReference`, not a column. The mapping is
many-to-many in practice: one Observer contact can correspond to two unmerged CRM records, and a CRM
record can be reachable under both an internal id and an email. Flattening that into one column is how
duplicate-contact bugs begin.

**9. The scheduled meeting and the showroom session resolve to one `meeting_id`.** See
`docs/04-journey.md` §1.

---

## 3. Link strength, recorded rather than assumed

Every link says why it exists, and whether it is deterministic:

| Basis                       | Deterministic | Sufficient alone to merge?                                            |
| --------------------------- | ------------- | --------------------------------------------------------------------- |
| `same_device`               | yes           | for back-linking anonymous history, yes; for merging two contacts, no |
| `verified_email`            | yes           | yes                                                                   |
| `verified_phone`            | yes           | yes                                                                   |
| `unverified_contact_detail` | no            | **never**                                                             |
| `crm_reference`             | yes           | yes, if the CRM record is confirmed                                   |
| `manual_confirmation`       | yes           | yes — always outranks an automatic basis                              |

Attributed metrics count only deterministic links (`docs/04-journey.md` §3). Probabilistic links may
suggest a pre-meeting brief to a human who can dismiss it; they may not move a number.

Links are revocable. `IdentityLink.revokedAt` exists because a merge can be wrong, and "the system
decided" is not an acceptable answer when the subject asks why their browsing history is attached to
their name.

---

## 4. The awkward cases

### Identity conflict

Two contacts share a verified identity of the same kind, or one identity resolves to two contacts.

**Behaviour:** no automatic merge. The conflict is recorded and surfaced in MADSPACE administration as
a data-health item. Both contacts stay usable; metrics count them as two people, which is the
conservative answer. Resolution requires `manual_confirmation`.

_Rationale:_ silently merging two buyers means one of them sees the other's history in a brief. Under
counting is recoverable; that is not.

### Duplicate contacts

The same person exists twice, usually because the CRM has duplicates or a second email was used.

**Behaviour:** merge produces a surviving contact and sets `mergedIntoContactId` on the other. The
merged record is **kept**, so historical references still resolve and a mistaken merge can be undone.
Timelines union; the earliest `firstTouchAt` wins; `SourceReference` records from both are retained.
Metrics recompute on the next projection rebuild — the reason projections are rebuildable.

### Deletion and erasure

**Behaviour:** `ContactPii` is deleted outright. `Contact` is tombstoned with `erasedAt`, keeping the
identifier so that aggregate history stays correct without the person being identifiable. Behavioural
observations are retained in anonymised form — they contain no PII by rule (§2.3), so what remains is
"someone viewed A-402 twice", which is exactly what a developer's aggregate needs and no longer relates
to an identified person. Timelines, briefs and exports exclude erased contacts.

_The design consequence worth noting:_ because PII was never in the behavioural data, erasure does not
force us to destroy analytics. That is not a happy accident — it is why the separation exists.

### Consent withdrawal

Narrower than erasure, and reversible in effect.

**Behaviour:** `IdentityLink.revokedAt` is set on links authorised by the withdrawn consent.
Back-linked anonymous history detaches and returns to the anonymous pool. Marketing segments exclude
the contact from that moment. The contact, their meetings and their deal remain — a signed reservation
is a contractual fact, not a consent-dependent one.

Exports must check consent per contact at export time. Silently producing a marketing list that
includes non-consenting people is the one failure mode that could genuinely damage a client.

### Second device

Viktória browses on her phone, then submits the form on her laptop.

**Behaviour:** the phone's visitor is not linked by `same_device`. It may later link through a verified
email or phone. Until then her brief shows only the laptop's history, and `dataHealth` says the picture
may be incomplete. Observer does not guess across devices — cross-device inference is exactly the kind
of probabilistic link that is fine for advertising and wrong here.

### Unmatched showroom visitor

A walk-in who gave no details.

**Behaviour:** a meeting with `origin: showroom_walk_in` and one `unidentified` participant. It counts
in attendance and behaviour metrics, and in `journey.unmatched_meetings`. It never joins a contact
timeline. If the agent captures details later, the participant is updated and the meeting joins the
journey retroactively — no reprocessing needed, because the meeting always had its own identifier.

### Same email, two tenants

Two developers both have a lead from `viktoria@example.com`.

**Behaviour:** two contacts, in two tenants, permanently separate. The per-tenant hash salt means the
values do not even collide. This is the correct answer, and it is covered by a test in M2's isolation
suite.

---

## 5. What is not built yet

Not in M1: the resolution engine, the merge tool, the hashing implementation, the consent-withdrawal
job. M1 delivers the contracts, the rules and the tests that pin the rules down. Implementation lands
with the schema in M2 and the administration surface in M10.
