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
5. **What cannot be placed is counted beside.** A sale with no stage date or no unit is in neither
   the numerator nor the denominator. The note says how many.
6. **Every word comes from the read model.** `buildAssistedSales` writes the headline, the row labels,
   the per-sale sentence and the note; the component prints them. The causal-language guard runs over
   read models, and this is the section of the product most tempted to say "because".
7. **Whole project, not the period.** The sales and the meetings are read across the project's whole
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
  stage date (`readInstant`), and that sale is counted among those that cannot be placed.
- When a deterministic buyer-to-visitor link exists, the same rule restricted to the buyer's own
  meetings is an attributed conversion. It will need its own metric, its own attribution rule and its
  own ADR. It is not built, and the type does not pretend otherwise.
- The window has no override path, like every other policy here. Per-tenant values wait on policy
  storage.
