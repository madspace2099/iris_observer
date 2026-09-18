# ADR-0039 — An IRIS-assisted sale is an observed sequence under a versioned rule

**Status:** accepted · **Date:** 2026-09-17
**Extends:** ADR-0010 (evidence tiers, no causal claims), ADR-0014 (policies are versioned objects),
ADR-0021 (a deal stage is the CRM's), ADR-0011 (identity resolution deferred)

## Context

The founder's question of the showroom is direct: did IRIS assist the decision to buy the flat? The
product can never answer it in those words. "Assisted the decision" is a claim about a buyer's mind,
and ADR-0010 forbids the product the fourth evidence tier for exactly that reason. But the question
behind it is answerable, and worth answering: of the flats that sold, which had just been shown.

What the read models hold: the CRM's deals, each with a unit code, a stage and the date the CRM
states for that stage; and every showroom meeting, with the units it opened and when it started. What
they do not hold: any link between a deal's buyer (`subjectKey`, a keyed hash of an email or phone)
and a meeting's visitor (`contactId`, an opaque showroom id). Nothing joins the two (ADR-0011).

## Decision

1. **The name stays, the definition is a rule.** A sale is _IRIS-assisted_ when a meeting that opened
   the unit started no more than the policy window before the date the CRM states for its reservation
   or purchase. The lag is measured from the **last** such meeting. A showing after the date never
   counts.
2. **The tier is `observed_sequence`.** Not `attributed_conversion`: attribution needs a qualifying
   identity link and an attribution rule, and neither exists. The registry metric
   `flow.iris_assisted_sales` therefore carries no attribution policy, and `validateMetric` would
   refuse one.
3. **A policy object, `DEFAULT_IRIS_ASSIST_POLICY`:** 72 hours and a minimum of 5 dated sales,
   versioned 1.0.0. Seventy-two hours is the founder's number. Below the minimum the count is shown
   and the share is withheld, with how far short it is.
4. **Three verdicts, and the lag on every one.** `shown_in_window`, `shown_earlier`, `not_shown`. A
   short window against a long sales cycle would otherwise read as "the showroom does nothing", so
   the lag of every sale is stated and the note gives the median lag of those shown earlier. The
   reader can judge the window against the project.
5. **Whose date it is.** The CRM's stage instant where it states one. Most do not: an export gives a
   date, and a date is not an instant (`readInstant` refuses one). Where the CRM states none, the
   sale is dated by the sync that first saw the deal on the stage, **and only for a move Observer
   witnessed**, a `stage_changed` between two syncs onto the stage the deal still stands on. A deal
   first seen already there is `opened`, and its instant is when the connector was switched on: used
   as a sale date it would put every historical sale on the day of the first sync and call last
   week's showing the thing that came just before a sale from last year. The fallback is late by up
   to one sync interval and never early, so the lag it gives reads longer than it was and a sale is
   under-counted rather than over-counted. Each sale carries `dateBasis`, the sentence says
   "before Observer first saw its reservation" instead of "before its reservation date", and the note
   says how many were placed that way and which way the error runs.
6. **What cannot be placed is counted beside.** A sale with no stage date or no unit is in neither
   the numerator nor the denominator. The note says how many.
7. **Every word comes from the read model.** `buildAssistedSales` writes the headline, the row labels,
   the per-sale sentence and the note; the component prints them. The causal-language guard runs over
   read models, and this is the section of the product most tempted to say "because".
8. **Whole project, not the period.** The sales and the meetings are read across the project's whole
   history. A showing in June belongs to a reservation in July whatever period the reader chose.

## Where it shows

- **Sales Flow**, after the stalled deals: the headline with its denominator, up to twelve sales
  ordered soonest-after-a-showing first, each opening the meeting that showed the unit.
- **A unit's page**, as a finding among "What the period says", with the same sentence and the caveat
  that the buyer is not linked.
- Nowhere when no CRM is connected, for the ladder's reason: no deal, no sale to place.

## Consequences

- On the demonstration CRM, deals are dated 6 and 21 days after the meeting that produced them, so
  Northgate reads "1 of 6 dated sales (17%) … 5 more were shown earlier than that, a median of 7 days
  before the date." That is the rule working: the scenario's sales cycle is longer than the window.
- The CRM's stage date is an instant or nothing. A CRM that states a date with no time yields no
  stage date (`readInstant`); such a sale is placed by the witnessing sync where there was one, and
  is otherwise counted among those that cannot be placed. A connector's history before it was
  switched on is therefore never placed, which is the honest reading of a sale nobody dated.
- When a deterministic buyer-to-visitor link exists, the same rule restricted to the buyer's own
  meetings is an attributed conversion. It will need its own metric, its own attribution rule and its
  own ADR. It is not built, and the type does not pretend otherwise.
- The window has no override path, like every other policy here. Per-tenant values wait on policy
  storage.
