# The unified customer journey

**Status:** contract, v0.1 · **Date:** 2026-08-24 · **Milestone:** M1
**Implements:** `packages/contracts/src/engagement.ts`, `packages/metrics/src/registry/journey.ts`

> **Amended by M2.1 (2026-08-24).** An earlier draft added a `hot_lead` rung to this ladder. It has
> been removed: a stage is an authoritative business state that moves forward, and lead temperature is
> a derived signal that rises and falls. The authoritative ladder is now `DEAL_STAGES` — lead,
> meeting, negotiation, offer, reservation, purchase, lost — and temperature lives in `IntentSignal`.
> Stage conversion is never computed through it. See ADR-0021.

IRIS Observer unifies buyer behaviour from four places: **WEBIRIS**, the **CRM**, the **IRIS Showroom**
and later **sales outcomes**. This is a core capability, not an optional integration — it is the thing
neither a web analytics tool nor a CRM can do, and it is the reason the product is defensible.

---

## 1. The funnel

```
anonymous WEBIRIS visitor
        │  identifies (form, booking, hand-off)
        ▼
identified lead
        │
        ▼
meeting booked ──────────► no-show ────────► follow-up
        │
        ▼
showroom attended
        │
        ▼
follow-up ──► offer ──► reservation ──► purchase
        │
        └──► not interested · lost · unreachable   (terminal)
```

No single system owns this ladder, which is the point:

| Stage                                   | Owner         | Why                                             |
| --------------------------------------- | ------------- | ----------------------------------------------- |
| anonymous visitor                       | WEBIRIS       | only the site sees pre-identification behaviour |
| identified lead                         | WEBIRIS       | the form submission and its consent live there  |
| meeting booked                          | CRM           | appointments are a CRM fact                     |
| showroom attended                       | IRIS Showroom | only the room knows whether they turned up      |
| follow-up, offer, reservation, purchase | CRM           | commercial facts                                |

Encoded as `STAGE_OWNER` in `engagement.ts`, and asserted by test. Terminal exits matter as much as
progress: without a recorded loss there is no denominator, and "still open" cannot be told apart from
"dead" — the defect that made the legacy funnel's conversion rate meaningless.

**One meeting, one identifier.** A booking and a showroom session must resolve to the same
`meeting_id`. Either the CRM booking creates the record and the showroom binds to it on arrival, or
the showroom creates it as a walk-in. Both happen in the field; `MeetingOrigin` distinguishes them,
and a walk-in is a first-class case, not an error.

---

## 2. Four tiers of claim

Observer joins three systems and then says things about buyers. The distance between "these facts were
recorded in this order" and "the website caused this sale" is enormous, and blurring it will
eventually send a developer's marketing budget to the wrong place.

So claim strength is carried in data, not in the wording of a sentence.

### Tier 1 — Observed sequence

These facts were recorded, in this order, for this person.

> ✅ _"She visited three times in August, viewed A-402 twice, and favourited it."_
> ❌ _"She is very interested in A-402."_ — a judgement, not a record.

Most of the pre-meeting brief is this tier, deliberately. It is also the only tier that may be stated
about a **single individual** without qualification.

### Tier 2 — Attributed conversion

A conversion assigned to a channel under an explicit rule. The rule is part of the claim and must be
displayable next to the number.

> ✅ _"Of 64 online leads, 21 attended a showroom meeting within 90 days — 33%, attributed on a
> deterministic identity link."_
> ❌ _"Online marketing produced 21 showroom visits."_ — drops the rule and implies causation.

### Tier 3 — Statistical association

Two things co-occur more than chance suggests, at a stated sample size and effect.

> ✅ _"Meetings that include the Surroundings section reach an offer 1.6× more often (n = 84)."_
> ❌ _"Showing Surroundings increases offers by 60%."_ — a causal claim wearing a percentage.

Never stated about an individual. "Buyers like her usually…" is not a fact about her.

### Tier 4 — Causal claim

**Observer does not produce this tier.** Establishing causation needs a controlled experiment, which
is outside this product. The tier is named in `EVIDENCE_TIERS` so the prohibition is expressible and
testable rather than a matter of editorial discipline — `StatementSchema` rejects it, and the metric
registry validator rejects it.

**The rule in one line:** Observer must never claim that WEBIRIS _caused_ a showroom visit. It may
report that a visit followed online activity, and it may attribute the conversion under a stated rule.
Those are different sentences and they must stay different.

---

## 3. Attribution

Declared once, in `JOURNEY_ATTRIBUTION`, and shared by every attributed metric — because if
online-to-offer and online-to-purchase used different windows, comparing them would be meaningless,
and somebody eventually would.

| Parameter           | Value               | Reasoning                                                                                                                                                              |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Window**          | 90 days             | Chosen against the observed sales cycle, not web-analytics convention. Buying a home takes months; a 30-day window would discard most genuine online-originated sales. |
| **Qualifying link** | deterministic only  | A probabilistic match is fine for suggesting a brief to a human who can dismiss it. It is not fine for a number that decides a marketing budget.                       |
| **Touch model**     | both reported       | First-touch and last-touch are shown side by side. Picking one silently is how attribution arguments start.                                                            |
| **Direct bookings** | separate bucket     | A booking with no online history is never folded into the attributed group. It is its own number, and often the more interesting one.                                  |
| **Missing source**  | reported as unknown | If WEBIRIS was disconnected for part of the period, the affected journeys are counted as unknown rather than as "no online activity".                                  |
| **Minimum sample**  | per metric, 20–30   | Below it, the insufficient state replaces the verdict.                                                                                                                 |

**Identity link strength is the hinge.** An attributed conversion requires a deterministic link — the
same device submitted the form, or a verified email or phone matches, or a person confirmed it. See
`docs/05-identity.md`.

---

## 4. Metrics

Sixteen journey metrics are declared in `packages/metrics/src/registry/journey.ts`, each with its
definition, numerator, denominator, exclusions, required facts, minimum sample and states:

**Reach and identification** — anonymous visitors · identified leads · visitor-to-lead
**Lead to the room** — lead-to-booking · attendance rate · WEBIRIS-to-showroom · time from lead to attendance
**Online to money** — online-to-offer · online-to-reservation · online-to-purchase
**Demand shape** — conversion by online interest segment · preference agreement · most common journey
**Trust in the join** — cross-channel completeness · unmatched contacts · unmatched meetings

The last group is not housekeeping. Completeness and unmatched counts tell the reader how much of the
journey Observer can actually see, and every other number on the screen is reliable only in proportion
to them.

---

## 5. Product placement

The journey adds **no new primary navigation item**.

| Surface                                     | What appears                                     |
| ------------------------------------------- | ------------------------------------------------ |
| Sales agent Overview                        | the pre-meeting brief for upcoming meetings      |
| Meeting drill-down                          | the brief, alongside what actually happened      |
| Contact drill-down, under People            | the complete unified timeline across all sources |
| Executive Overview and Project Intelligence | the journey metrics, in existing cards           |

---

## 6. Open questions

| #   | Question                                                                                 | Blocks                            |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Is the 90-day window right for these projects, or should it be per-tenant configuration? | attribution defaults              |
| 2   | Does WEBIRIS already issue a stable visitor identifier, and with what cookie lifetime?   | deterministic same-device linking |
| 3   | Does the booking flow live in WEBIRIS, in the CRM, or both?                              | which system mints `meeting_id`   |
| 4   | Does REALPAD expose appointment records, not only deals?                                 | `meeting.booked` from the CRM     |
