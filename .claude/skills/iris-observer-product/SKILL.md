---
name: iris-observer-product
description: The IRIS Observer product doctrine — audience, principles, visual identity, information architecture, interaction model, anti-slop rules and review workflow. Load at the start of every IRIS Observer session, before any design or frontend work, and alongside the generic frontend-design skill. Where the two disagree, this one wins.
---

# IRIS Observer — product doctrine

The permanent operating context for this repository. Read it before touching a screen, a metric or a
contract. It is not a summary of the documents; it is the doctrine the documents implement, and it
tells you which document to open.

## 0. Source hierarchy

When two sources disagree, the higher one wins.

1. **A decision the user has just made in conversation.**
2. **This skill** and the ADRs in `docs/adr/`.
3. **The product documents**, `docs/01` through `docs/14`.
4. **The generated artefacts** — `docs/measurement-matrix.md`, `docs/coverage-report.md`. Never edit
   by hand; regenerate with `pnpm matrix`.
5. **The Figma file.** Visual DNA, not information architecture. See §6.
6. **The generic `frontend-design` skill.** Craft guidance only. It will suggest an unusual display
   font and an extreme aesthetic direction; IRIS has a locked identity, so take its discipline about
   intentionality and ignore its font and palette suggestions.

Never ask the user to restate context that exists in this repository.

## 1. What the product is

IRIS Observer is a **virtual real-estate sales-intelligence system**, not a generic analytics
dashboard. It joins four sources that no single system can see together:

| Source         | Owns                                              |
| -------------- | ------------------------------------------------- |
| WEBIRIS        | online buyer behaviour before anybody is known    |
| CRM            | contacts, appointments, authoritative deal stages |
| IRIS Showroom  | what happened in the room                         |
| Unit catalogue | units, attributes, price, availability            |

The **property developer buys it**. An internal or external **sales agency operates it**. That split
is the central design constraint and it is not a detail — see `docs/01-foundation.md` §1.

Four audiences, each with a different Observer:

- **Developer leadership** — evidence for pricing, marketing and forecast decisions.
- **Agency management** — coverage, conversion, coaching, fairly and with sample protection.
- **Sales agents** — the day: agenda, preparation, follow-up. Their value is the data-acquisition
  strategy; without it nothing upstream has inputs.
- **MADSPACE administrators** — tenancy, configuration, integration health. A separate surface.

## 2. Stano's principles — non-negotiable

The first screen answers, in about ten seconds:

1. Is performance positive, negative or inconclusive?
2. What changed?
3. Why does it matter?
4. What should the user do next?
5. What evidence supports the conclusion?
6. How complete and reliable is the data?

Deliver **clarity, context, usefulness, decisions, actions**. Never a collection of disconnected data
boxes. The three page rules:

> **No metric without a denominator. No verdict without a sample size. No screen without an action.**

## 3. Honesty rules that override aesthetics

- **Evidence tiers.** Observed sequence, attributed conversion, statistical association. Observer
  never produces a causal claim. `docs/04-journey.md` §2, ADR-0010.
- **A deal stage is authoritative; intent is a signal.** Never put lead temperature in the ladder and
  never compute stage conversion through it. ADR-0021.
- **Never render an absent value as zero.** Empty, insufficient, unavailable and error are four
  different situations and the reader must be able to tell them apart.
- **Below the minimum sample, no verdict, no rank, no trend.** Show the raw figure and say how far
  short it is.
- **Percentiles, not means**, for every duration.
- **No personal data in behavioural payloads.** Contact identifiers only.
- **The pre-meeting brief never reaches a buyer-visible surface.** ADR-0018.
- **Never fabricate data to make a visualisation work.** Extend the documented synthetic read model
  honestly instead, and record the extension.

## 4. The AI agent

**Ask Observer is a primary interface, not a chatbot and not an "AI Insight" card.** In the IRIS
showroom the same surface already exists and is called **Ask IRIS** — a pill on the floating bottom
rail. Observer's is its counterpart and should read as the same family.

It knows the current tenant, project, period, unit, segment, contact, meeting, anomaly and evidence.
It answers questions of the form "why did demand fall", "which available two-bedroom units have the
strongest verified interest", "who should we contact this week", "prepare me for Viktória's meeting",
"show the evidence behind this".

**The model explains deterministic facts; it never calculates authoritative values.** Every claim
keeps evidence, period, source, filters, completeness and confidence. In the synthetic phase the
responses are deterministic behind the same tool interfaces a model will later use. **Do not connect
a real LLM before its approved milestone.**

## 5. Visual identity — IRIS Spatial Intelligence

Full definition in `docs/14-design-system.md`. The doctrine:

**It should feel like** a premium architectural decision room · an intelligent digital-twin control
surface · an editorial executive briefing · a real-time sales system.

**It must never feel like** a SaaS admin panel · a CRM · a banking dashboard · a crypto interface ·
a gaming HUD · a science-fiction film screen · a marketing landing page.

- **Space is the ground, UI floats on it.** In IRIS the render fills the frame and the interface is
  thin chrome at the edges. Observer's equivalent ground is **Project Pulse** — a living building
  built from the real synthetic catalogue, never decorative data art.
- **Typography** is Manrope, locked by brand and Figma. Build character through scale, weight,
  tabular numerals, tracking, line length and editorial composition — never by swapping the font. A
  self-hosted monospace may carry unit codes, timestamps and evidence references.
- **Colour** is graphite black, warm off-white, IRIS blue `#00A3FF`, restrained semantics. No purple
  gradients, aurora, neon outlines, multicolour accents or glowing blobs.
- **Composition** favours continuous information planes, asymmetric but disciplined grids,
  architectural alignment, hairlines, controlled density. **Not every piece of information is a card.**
- **Motion** communicates period change, filtering, selection, cross-highlighting, drill-down and
  evidence reveal. Never decorative, always respects reduced motion.

## 6. Figma

File `X9a85nibp1YYMppGxQ8iVQ`. Pages: Large Screens `4:20`, Touch Screens `3:16`, Prototype `4:21`,
Local Components `4:25`. Adoption is recorded in `docs/13-figma-adoption-matrix.md`.

**It is visual DNA, not information architecture.** IRIS uses a left explorer rail over a full-bleed
render; Observer keeps its approved four-item horizontal navigation. Adopting Manrope, black and
`#00A3FF` is not adoption — cite the node and the principle.

## 7. Information architecture — approved, do not change

Primary navigation, four items: **Overview · Sales Flow · Project · People**.
Unit, contact, meeting, agent and report views are drill-downs.
MADSPACE administration is a separate surface, never a nav item.

Overview is **role-aware, not role-filtered**: the developer gets the executive view, the agent gets
their working day. ADR-0019.

## 8. Anti-slop — permanent

Never default to: sidebar plus top bar plus four KPI cards plus chart plus table · identical bento
cards · giant greeting copy · "Good morning, Petra" · an isolated AI card with a sparkle icon ·
excessive pills · an icon beside every label · decorative doughnuts · radial gauges that mean nothing ·
default chart-library styling · fake glassmorphism · stock illustrations · blue-purple gradients ·
excessive rounded corners · detached floating panels · charts without interaction · controls that do
not work · mobile layouts made by stacking desktop modules.

**With the logo hidden, the product must still read as real-estate spatial sales intelligence.**

## 9. Review workflow — a screen is not approved because the build is green

Automated checks are necessary and cannot approve aesthetics. Every finished screen needs: a real
production screenshot, manual inspection of that image, comparison against the Figma principles, an
anti-slop pass, a domain-specificity pass, an interaction pass, and desktop plus mobile review.

**A blank or mostly-empty screenshot is an automatic failure.** This has already happened once — see
`docs/12-visual-autopsy.md` on the MADSPACE administration screen.

Visual work follows the phases in `docs/12-visual-autopsy.md` §5: audit, direction, isolated flagship
prototypes, visual review, user selection, rollout. Never redesign the whole application in one
unreviewed pass.

## 10. Engineering rules

Strict TypeScript · deterministic synthetic repositories behind ports · UI never imports fixtures ·
metric meaning is never changed to make a chart easier · role and tenant separation enforced in the
repository · `pnpm verify` before every commit · focused commits · **never push unless asked**.

Do not introduce Supabase, production authentication, UE5 ingestion or a live LLM before the
milestone that owns them. `docs/roadmap.md`.

## 11. Session protocol

**On starting:** read `docs/PROJECT-STATE.md` first, then this skill, then whatever it points at.

**On finishing meaningful work:** update `docs/PROJECT-STATE.md` — state, decisions taken, milestone
status, verification results, and the exact next recommended action. Then commit.

**When blocked**, give the user: the exact blocker, the evidence, the options, your recommendation,
and the single decision you need. Never hand back a research task.
