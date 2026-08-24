# IRIS Spatial Intelligence — the design system

**Status:** direction, v1.0 · **Date:** 2026-08-24
**Replaces:** the M2.1 card system · **Derived from:** `docs/13-figma-adoption-matrix.md`

The named visual philosophy for IRIS Observer, and the rules that make it reproducible.

---

## 1. The thesis in one sentence

> **A building, and what buyers are doing to it.**

Observer is a room where somebody decides what to do about a specific building. The interface should
put the building in the room, put the evidence beside it, and get out of the way.

Everything below follows from that. If a component cannot be traced back to it, it does not belong.

---

## 2. The memorable signature — Project Pulse

Every product needs one thing a reader remembers. Observer's is **Project Pulse**: the building,
alive, built entirely from the unit catalogue.

It is a floor-stacked massing diagram. Each floor is a row; each unit is a cell. Cells carry:

| Channel           | Encodes                                                                     | Why this channel                              |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| Fill luminance    | attention — meaningful views per unit, normalised                           | brightness reads as heat pre-attentively      |
| Outline           | availability — solid available, hairline reserved, hollow sold              | shape survives colour-blindness and greyscale |
| Accent stroke     | recent change — sold, price moved, demand collapsed, in the selected period | a second channel that only fires on news      |
| Width             | unit area, banded                                                           | the plan's real proportions, not decoration   |
| Vertical position | floor                                                                       | the building's real geometry                  |

It is **not decorative data art**. Selecting a floor, a segment, a unit or a period must update the
narrative, the evidence, the actions, the metrics and the Ask Observer context. A Pulse that does not
drive the rest of the screen has failed and should be deleted.

Where a project supplies a massing model, a floor plan or a render, that takes the same position and
the abstraction becomes the fallback.

---

## 3. Structure — planes, rails, instruments

Three kinds of surface, and nothing else.

**Planes** carry content. They are continuous regions separated by hairlines, not boxes. A plane has
no border, no radius and no shadow; it is defined by its background and the rule above it. Most of
the interface is planes.

**Rails** carry controls. They float above the planes, are fully rounded, and have a border and a
backdrop blur. The bottom-centre command rail, the top-centre period scrubber and the mode-chip strip
are rails. Rails are the only rounded containers in the product.

**Instruments** are precise, technical readouts of state: the period scrubber's tick marks, the
orientation rose, the completeness meter. They are drawn as line work, not as widgets.

**Collection cards** are the fourth kind, and they were missing from the first draft of this
document. Reading further into the Figma file — the project browser `6964:245` — showed that IRIS
does use cards, in exactly one situation: browsing a collection of real things you choose between,
each led by an image. A card there is image-first, with a bottom scrim carrying a type chip, the
name, a stat pair and a circular arrow. That is a legitimate card, and Observer reuses it verbatim
for the profile picker and the project chooser.

What produced the M2.1 rejection was not the card shape. It was using a card for **analytical
content** — wrapping a number in a bordered box and calling the layout done.

> **The rule:** if it holds information, it is a plane. If it holds a control, it is a rail. If it
> reads a state, it is an instrument. If it is one of several real things you are choosing between,
> and it leads with an image, it is a card — and that is the only card in the product.

---

## 4. Layout

- **Two-field composition.** A dominant spatial field and a narrower evidence field, asymmetric,
  roughly 3:2 at 1920 and 3:2 at 1440. Not a 12-column grid of equal cells.
- **Anchored, not centred.** Content aligns to a left architectural margin and runs to the right edge
  of its field. Centred columns in a wide frame are what produced the M2.1 emptiness.
- **Vertical rhythm** on an 8px base, with 4px permitted for optical alignment of line work.
- **Line length** capped at 68ch for prose, 46ch for a verdict headline.
- **Density is earned.** A dense table is fine on a plane with hairlines. A dense grid of boxes is not.

---

## 5. Type

Manrope, locked. Character comes from the scale, not the family.

| Role    | Size / line | Weight | Treatment                                       |
| ------- | ----------- | ------ | ----------------------------------------------- |
| Verdict | 34 / 40     | 600    | −0.03em, max 46ch                               |
| Section | 20 / 28     | 600    | −0.01em                                         |
| Figure  | 44 / 44     | 600    | −0.04em, tabular                                |
| Body    | 15 / 22     | 500    |                                                 |
| Meta    | 13 / 18     | 500    | secondary colour                                |
| Kicker  | 11 / 16     | 600    | uppercase, 0.22em tracking                      |
| Code    | 12 / 16     | 500    | monospace: unit codes, timestamps, evidence ids |

Every numeral in a column is tabular. A monospace companion carries identifiers so a unit code reads
as a designation rather than as a word.

---

## 6. Colour

```
--iris-void      #060709   the ground behind everything
--iris-plane     #0b0d11   a content plane
--iris-plane-2   #101318   the raised plane, for the evidence field
--iris-rail      #171b21   a floating rail
--iris-rule      rgb(255 255 255 / 8%)    hairline
--iris-rule-firm rgb(255 255 255 / 16%)   structural hairline

--iris-ink       #f2f5f8   primary
--iris-ink-2     #9fadba   secondary
--iris-ink-3     #6b7885   tertiary, never below 4.5:1 on any plane

--iris-accent    #00a3ff   selection, and the one primary action
```

Demand is a **luminance ramp, not a rainbow** — from `--iris-plane` to a desaturated blue-white. Three
semantic colours only: `#3ecf8e` gain, `#e8b339` watch, `#f0616d` loss. They appear on line work and
small marks, never as a card background.

Forbidden: purple gradients, aurora fields, neon outlines, multicolour accent systems, glowing blobs,
any gradient behind data.

---

## 7. Motion

Motion has four jobs and no others.

| Event           | Motion                                                             |
| --------------- | ------------------------------------------------------------------ |
| Period change   | Pulse cells re-weight over 320ms; figures count to their new value |
| Selection       | the selected cell holds; unselected cells drop to 30% over 160ms   |
| Cross-highlight | the related funnel stage and evidence row lift on the same frame   |
| Evidence reveal | the drawer opens 200ms with the source rows staggered 24ms apart   |

Easing `cubic-bezier(0.2, 0, 0, 1)`. Nothing loops. Nothing animates on idle.
`prefers-reduced-motion` collapses every duration to zero and keeps every state change.

---

## 8. Ask Observer

The IRIS showroom already ships this surface as **Ask IRIS**, on the bottom rail. Observer's is its
counterpart and must read as the same component.

- Persistent on the bottom-centre command rail, at every route.
- `⌘K` or `/` focuses it. Escape closes.
- It carries the **current context as visible chips** — project, period, and any selected floor,
  segment or unit — so the reader can see what the question will be answered against.
- Answers open in a side sheet on the evidence field, never a modal over the content.
- Every answer is: a sentence, the figures it rests on, an evidence row, and a follow-up affordance.
- Suggested questions are derived from the current selection, not a static list.

**The assistant already has a name.** Node `6872:3494` in the Figma file reads *"Welcome, Bob. I am
AI-RIS."* — the showroom assistant introduces itself by name and greets the agent who signed in. So
"Ask Observer" is a description of the surface, not a brand: the assistant is AI-RIS in both
products, and Observer's greeting should address the profile that was chosen at the picker. That
consistency is the whole reason the picker is being reused.

In the synthetic phase every answer is deterministic, produced behind the tool interface a model will
later call. **No LLM before its milestone.**

---

## 9. The way in — the profile picker

The showroom opens on a Netflix-style profile chooser: an agent picks themselves, then steps into
IRIS. Observer opens the same way, on the same component, because an agent who uses both products in
one day should not meet two different front doors.

- The ground is the splash atmosphere from `6620:1840` — a soft gradient, the wordmark, `IRIS BY
  MADSPACE` at the foot. It is the one place a gradient is allowed, because there is no data on it.
- Profiles are **collection cards** (§3), grouped by a segmented control — the same control as the
  showroom's `Running Projects | In preparations | Closed projects`.
- Each card carries the type chip, the name, a stat pair and the circular arrow, in the anatomy of
  the project cards at `6964:245`.
- Where an IRIS card carries a commissioned render, an Observer profile carries a **monogram field**,
  deterministic from the name. Generating photographs of people who do not exist is the fabrication
  the doctrine forbids, and stock avatars would be the same lie with a licence.
- The blurb says what that profile will *see*. A picker that says only "Sales agent" makes the reader
  guess at the difference between five entries.

In the laboratory this is a scenario selector and is labelled as one. It is not authentication and
must never be described as such; the session adapter behind it is unchanged (ADR-0022).

---

## 10. States

Four different situations, four different treatments. None of them is a zero.

| State        | Treatment                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Empty        | the plane keeps its shape; one sentence in secondary ink, in place                                         |
| Insufficient | the figure is shown at full size in secondary ink, with the shortfall beside it and no trend               |
| Unavailable  | the region is drawn in hairline outline with the reason and one action, **once** — not repeated per figure |
| Error        | stated as a failure to load, never as data                                                                 |

---

## 11. Accessibility, non-negotiable

- Contrast is checked against the plane the text actually sits on, including translucent rails.
- Hierarchy is never created by dropping below 4.5:1. Use size, weight, spacing and grouping.
- Every colour channel has a redundant shape or text channel. Pulse availability is outline style,
  not hue.
- Every interactive element has a visible focus ring: 2px `--iris-accent`, 2px offset.
- The Pulse is keyboard-navigable by floor and unit, and exposes a table equivalent.
- Reduced motion is honoured everywhere.

---

## 12. The prohibition list

Sidebar plus top bar plus four KPI cards plus chart plus table · identical bento cards · giant
greeting copy · an isolated AI card with a sparkle icon · excessive pills · an icon beside every
label · decorative doughnuts · radial gauges that mean nothing · default chart-library styling · fake
glassmorphism · stock illustrations · blue-purple gradients · excessive rounded corners · detached
floating panels · charts without interaction · controls that do not work · mobile layouts made by
stacking desktop modules.

Note what is *not* on that list: an image-led card in a collection you are choosing from (§3, §9).
The prohibition is on the card as a substitute for layout, not on the shape.

**The test:** hide the logo. If the screen does not read as real-estate spatial sales intelligence, it
is not finished.
