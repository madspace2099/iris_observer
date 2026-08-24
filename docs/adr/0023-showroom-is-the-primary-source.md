# ADR-0023 — IRIS Showroom is the primary observational source

**Status:** accepted · **Date:** 2026-08-24
**Supersedes in emphasis:** nothing. **Constrains:** every read model, metric and AI answer.

## Context

Observer drifted toward CRM analytics. Of 82 registry metrics, 28 — the largest single class — are
computable entirely from CRM outcome data, and those metrics led the product: the Executive Overview
opened on units sold, revenue and days to close, and the second surface was a conversion funnel.

The CRM already records leads, stages, offers, reservations, purchases, losses and commercial
outcomes. A second system that reports the same figures more attractively is a reporting layer, not
a product. It also cannot be sold to the party that pays for IRIS, because it says nothing about
whether IRIS was worth buying.

The legacy IRIS Analytics Dashboard made the same mistake and shows what it costs: three of its ten
headline cards are CRM figures, all reading zero, above a conversion funnel that has never held data
(`docs/16-showroom-intelligence-audit.md` §2.8).

## Decision

**IRIS Showroom is Observer's primary observational source. The CRM is an outcome-context source,
not the product's subject.**

Concretely:

1. Every **primary insight** — anything that leads a screen, forms a verdict, or is returned as an
   AI answer — must be rooted in at least one `IRIS_SHOWROOM_OBSERVED` or `IRIS_SHOWROOM_DERIVED`
   fact.
2. CRM data is admissible in exactly three roles: an **outcome label**, a **later-stage validation
   signal**, and a **cohort boundary** for comparing showroom behaviour against results.
3. A finding whose sources are only `CRM_OUTCOME_CONTEXT` may still be *displayed*, but never in a
   primary position, and never as the subject of an Ask Observer answer.
4. `AI_INTERPRETATION` may never stand alone. The model explains evidence; it does not produce it.
5. Cohort comparison must analyse the **preceding IRIS behaviour**. Recreating a CRM funnel with
   better typography is explicitly not the goal.

## Enforcement

Not editorial. `InsightSource` is part of the evidence and read-model contracts
(`packages/contracts/src/provenance.ts`), and three guards assert it:

- every metric definition declares its sources, and a registry test fails if a metric marked
  `primary` has no showroom-rooted source;
- a read-model test asserts that no verdict or headline carries only CRM sources;
- the AI tool layer refuses to return an answer whose evidence is CRM-only or interpretation-only.

## Consequences

- The Executive Overview is replaced by a **Showroom Overview**. Units sold, revenue and days to
  close survive as cohort context in the evidence field, not as the headline.
- The conversion funnel leaves the primary navigation. It remains reachable, labelled as outcome
  context.
- Four new primary surfaces exist: Presentation Intelligence, Meeting Replay, Unit Attention, and
  Storytelling & Feature Intelligence.
- Some genuinely useful CRM-only metrics become harder to reach. That is the intended cost: they are
  answers the developer's CRM already gives them.

## Alternatives rejected

**Keep both as equals.** A product with two subjects has none, and the opening screen has to choose.

**Delete the CRM metrics.** Outcome cohorts are what make showroom behaviour interpretable — the
question "what did the meetings that went further have in common" needs both sides. Demotion, not
deletion.
