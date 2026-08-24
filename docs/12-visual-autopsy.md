# Visual autopsy — why M2.1 was rejected

**Status:** accepted finding · **Date:** 2026-08-24
**Evidence:** 42 production screenshots in the review folder recorded in `docs/PROJECT-STATE.md`

M2.1 was accepted as a technical foundation and **rejected as a visual foundation**. The distinction
matters: the contracts, metrics, evidence discipline, repository boundaries and security decisions
stand. The presentation layer does not.

This document records what is wrong, with evidence, so the same failures cannot be reintroduced by
somebody who only reads the design system.

---

## 1. The single most damaging finding

**A screen shipped that nobody looked at.**

`07-madspace-admin-wide-fold.png` — the MADSPACE administration surface at 1920×1080 — is roughly
**86% empty black**, containing one card holding one sentence. It passed the build, passed lint,
passed typecheck, passed Playwright, and reported zero axe violations.

Every automated gate was green and the screen was unusable.

The M2.1 review inspected six of twenty-one distinct compositions and reported the milestone
complete. That is the process failure underneath every visual failure below, and it is why the review
workflow now requires a real screenshot to be **looked at** for every finished surface, and treats a
mostly-empty frame as an automatic failure.

`06-sign-in-wide-fold.png` is the same fault in milder form: four identical cards in a centred column
occupying the middle third, with roughly two thirds of a 1920×1080 frame unused, and a paragraph whose
measure does not align to the card edge below it.

---

## 2. It is a generic dark SaaS dashboard

The strongest evidence is the negative test in the doctrine: **hide the logo and ask what product this
is.** Looking at `01-executive-overview-wide-fold.png` with the wordmark covered, there is nothing to
say it concerns buildings, apartments, floors, orientation or a showroom. It could be a support desk,
a subscription analytics tool or a logistics console.

Specific mechanisms:

| Failure                          | Evidence                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repeated rounded card containers | Every element on the Overview is a `border-radius: 0.875rem` panel with a hairline. Verdict, figures, change, health, conversion, briefing, changes, alerts — eight identical containers stacked vertically. |
| Outdated KPI-card composition    | `01-*-fold.png`: four equal cards, label above, big figure, qualifier, delta. This is the 2019 dashboard idiom, unchanged.                                                                                   |
| Generic badges and progress bars | Status is carried by pill badges and horizontal fills. `04-crm-disconnected-wide-fold.png` shows three empty dashed tracks — a progress-bar metaphor applied to something that has no progress.              |
| Everything is one column         | Every surface is a single vertical stack at `max-width: 96rem`. No asymmetry, no spatial hierarchy, no second reading order.                                                                                 |

---

## 3. No spatial intelligence at all

This is the deepest failure and the reason a repaint would not fix it.

IRIS is a **digital twin of a building**. Observer's job is to say things about floors, orientations,
price bands and specific apartments. In 42 screenshots there is:

- no building,
- no floor,
- no unit geometry,
- no floor plan,
- no orientation diagram,
- no map,
- no image of the project at all.

`03-viktoria-brief-wide-full.png` is the clearest indictment. The brief discusses A-402, A-505 and
B-301 — three apartments that differ by floor, orientation and three square metres — and renders them
as **three rows of text**. The buyer's actual decision was spatial and the interface has no spatial
representation of it. The unit codes are strings.

The catalogue contains rooms, floor, area, orientation, price and status for every unit. None of it
reaches the eye.

---

## 4. Nothing recognisably IRIS

Adopting Manrope, `#00A3FF` and a black background was recorded in M2.1 as having adopted the Figma
identity. It had not. See `docs/13-figma-adoption-matrix.md` for what the file actually contains.

Missing, all of it present in the Figma source:

- the full-bleed render as the ground plane,
- floating pill rails rather than fixed bars,
- the **Ask IRIS** surface, which already exists as a component and which Observer reinvented as a
  static "Generated" badge on a card,
- segmented controls with an inset selected state,
- dismissible mode chips,
- the monoline icon set — Observer uses **no icons whatsoever**,
- the top-centre technical instrument (a compass strip with tick marks),
- the ambient environment readout.

---

## 5. Insufficient interaction

Nothing on any Observer screen responds to anything. The only working controls are two navigating
selects and a sign-out button.

- Charts are static. The funnel bars cannot be hovered, selected, filtered or drilled.
- The metric cards are inert; `drillHref` exists in the read model and is not rendered as a target.
- There is no cross-highlighting — selecting a segment does not affect the funnel, the briefing or
  the actions.
- There is no period scrubber; the period is a select that reloads the page.
- There is no unit search, no segment filter, no timeline.
- Evidence links point at routes that do not exist yet, so the central promise of the product —
  every claim is auditable — is currently a dead link.

---

## 6. The AI is a decorative card

`AiSummary` is a bordered box with a heading, three sentences and a "GENERATED" badge. It is exactly
the "isolated AI card" the doctrine forbids.

There is no way to ask a question, no follow-up, no context awareness, no evidence expansion, no
report generation. The product's stated primary interface does not exist.

---

## 7. The pre-meeting brief is a document, not a workspace

`03-viktoria-brief-wide-full.png` reads as a printed report: headings, definition lists, paragraphs,
two columns of prose. It is the single artefact the agent opens under time pressure, minutes before a
buyer arrives, and it demands linear reading.

It should be scannable in ten seconds, spatial about the units, and interactive where the agent needs
to prepare — compare the two remaining candidates, look at a plan, expand the evidence for a claim.

Separately: observed fact, interpretation and recommendation are distinguished only by three card
headings and a badge. The distinction is the intellectual core of the brief and it is carried by
typography that looks identical in all three sections.

---

## 8. Mobile is stacked desktop

`02-agent-overview-mobile-full.png` and `03-viktoria-brief-mobile-full.png` are the desktop
composition with the grid collapsed to one column. The result is a very long scroll of full-width
cards.

The agent's phone context is specific — walking to a room, two minutes before a meeting — and it
should produce a different composition, not a narrower one. The M2.1 header fix improved the chrome
and did not touch this.

---

## 9. Disconnected empty states

`04-crm-disconnected-wide-fold.png` renders four cards each repeating the identical sentence _"The
CRM is not connected, so outcomes below the meeting are unknown."_ Four times, in four boxes, in one
viewport.

The honesty is right and the composition is wrong: one clear statement of what is missing and what it
costs, once, in place of the region it affects.

---

## 10. What must not be done about it

The failures above are not solved by adding gradients, glass, shadows, icons or animation to the
existing card system. The card system **is** the failure.

The presentation layer is reconceived in `docs/14-design-system.md`. The contracts, read models,
metrics and repository boundaries underneath it are kept exactly as they are.
