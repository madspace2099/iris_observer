# ADR-0034 — Hybrid Executive: two grounds, one token vocabulary, divided by content

**Status:** accepted, provisional · **Date:** 2026-09-04
**Extends:** ADR-0033 (the approved shell), ADR-0020 (Manrope and `#00A3FF`)
**Narrows:** `docs/20-madspace-admin-design-system.md` §0, and the line in
`docs/PROJECT-STATE.md` reading "Observer stays dark; the boundary is one class"

## Context

The user asked for the complete customer-facing product frontend, and named the
visual language for it:

> Use a HYBRID EXECUTIVE direction as the provisional system-wide working
> language: premium dark global frame/chrome, highly legible operational/content
> surfaces, restrained use of light/paper surfaces where dense information
> benefits, strong typography, architectural hierarchy, calm enterprise visual
> character, minimal decorative noise.
>
> This is a WORKING VISUAL BASELINE, not permanent design-system approval.

Three things about the repository make that instruction sharper than it sounds.

**The direction already exists, built and reviewed.** `/design-lab` variant C is
literally named "Hybrid executive", and `packages/ui/src/design-lab-c.css` is
1,960 lines of it, applied to five MADSPACE control-plane screens. It is not a
sketch. It is the most complete of the three directions the user was shown.

**Observer had no light surface at all.** `packages/ui/src/tokens.css` declines
a light theme in its own words — a half-considered light palette would ship a
second set of contrast bugs — and all eight product stylesheets are dark-only.

**Warm paper is currently MADSPACE's identity, on purpose.**
`docs/20-madspace-admin-design-system.md` §0 chose paper plus Inter for the
operations surface _precisely so the two products could be told apart_. Adopting
paper inside Observer narrows a boundary that was drawn deliberately.

## Decision

**One set of token names, declared twice, applied by REGION rather than by page
or by preference.** The implementation is `packages/ui/src/observer-product.css`,
namespace `ox-`.

    .ox-graphite   what we CONCLUDE, and what a reader may DO about it.
                   Identity, scope, the verdict sentence, navigation, controls,
                   the attention list, an AI interpretation.

    .ox-paper      what was MEASURED. Every reading, every figure, every date,
                   every row of a table, every timeline step.

Every rule in the sheet is written against the token NAMES, never against a
colour, so one component renders correctly on both grounds with no variant code.
Applying a ground is `className="ox-paper"` and nothing else. The mechanism is
the one `docs/20` §8 already specifies: **a token swap on a class, never a
filter on `body`** — a filter makes `body` the containing block for every
`position: fixed` element and would break the sticky header and every dialog.

The seam is governed by two numbers, `--ox-inset` and `--ox-pad`. Graphite copy
is padded by their sum, so dark text and light text stand on one left edge while
the plate and the bands above it share one outer edge. That single alignment is
what stops the frame reading as a header pasted above a page.

## Why this does not erase the MADSPACE boundary

It narrows it, and the narrowing is bounded in three ways that are structural
rather than remembered.

**The frame stays dark.** Paper never touches the header, the navigation, the
page title or the verdict. A reader always arrives on graphite and always
returns to it. MADSPACE, by contrast, is paper from the first pixel.

**Paper is earned.** It appears only where a dense measured body genuinely reads
better on it: tables, rows of readings, timelines, the unit register. A
paragraph does not get a plate. On most Observer screens the majority of the
viewport is still graphite.

**The typefaces still differ.** MADSPACE is Inter by its own specification;
Observer is Manrope on both grounds, brand-locked by ADR-0020.

And the two token sets cannot bleed into one another in either direction, at any
load order: `madspace.css` owns `--ink`, `--ink-2`, `--ink-3`, `--surface-card`
and the `--border-*` family on `.mad-portal`; every name in the new sheet is
`--ox-`. This is why the sheet did not simply copy `design-lab-c.css`, which
uses the unprefixed names.

## The accent, and the one contrast rule that follows from it

`#00A3FF` measures **2.73:1 on white**. On paper it is therefore never text,
never a border and never a focus ring; the dim step `--iris-accent-dim`
(`#0b6fae`, **5.39:1**) carries those, exactly as `design-lab-c.css`
established. On graphite the accent measures **7.10:1** on a panel and is used
for exactly two things: the focus ring, and the mark meaning _a person decided
this, and a person can change it_. It carries a state rather than decorating
one.

Every value below was **measured, not estimated** — WCAG 2.x relative
luminance, with the translucent graphite panel composited over the shell ground
first, because a token declared as `rgb(140 165 205 / 5%)` has no contrast until
it is standing on something. The full table is asserted by
`apps/web/test/observer-product-design.test.ts` so it cannot drift silently.

| Token                    | Graphite (on panel) | Paper (on plate) |
| ------------------------ | ------------------: | ---------------: |
| `--ox-ink`               |               18.08 |            18.11 |
| `--ox-ink-2`             |                9.98 |             9.06 |
| `--ox-ink-3`             |                7.71 |             6.74 |
| `--ox-ink-4` (the floor) |                6.17 |             4.80 |
| `--ox-good`              |               11.68 |             8.05 |
| `--ox-watch`             |               11.27 |             7.36 |
| `--ox-human`             |               10.78 |             5.39 |
| `--ox-poor`              |                9.72 |             7.22 |
| focus ring               |                7.10 |             5.39 |

The quietest ink in the system clears 4.5:1 on both grounds, so nothing below it
exists. The tightest value in the whole table is `--ox-ink-4` at **4.80:1** on
the warm paper plate, which is the number to watch if the plate is ever
darkened.

## What is provisional, and what is not

**Provisional:** the direction itself. The user's words were "a WORKING VISUAL
BASELINE, not permanent design-system approval". This ADR records what was
built and why; it does not claim the design system is settled.

**Not provisional, because they are locked elsewhere:** Manrope, `#00A3FF`, the
MADSPACE surface, and the rule that a state never reaches the screen as a colour
alone.

## Consequences

The rules the sheet enforces structurally, so a screen cannot forget them, are
carried over from `design-lab-c.css` unchanged and are now product rules:

- A missing value changes **four** things at once — size, weight, colour, and a
  bar mark in front. Three of the four is the failure the treatment exists to
  prevent: at three, a reader scanning a column reads the absence as a small
  number.
- A proportion is never coloured, and a track is not drawn at all when the value
  is absent. A track at zero standing in for an unmeasured quantity is the exact
  lie the missing treatment exists to prevent.
- A denominator may dim and may never be dropped.
- Cells are divided by 1px hairlines drawn with `box-shadow` and clipped by the
  container's `overflow: hidden`, never by `gap` over a coloured ground.
- Exactly **one** elevation exists in the whole system, on the dialog panel.
  Nothing else floats.
- 12px is the type floor and there are no exceptions.
- Rhythm is 8 / 12 / 20 / 28 plus the 40px gutter, and no other number.

Two consequences are new and were not in the lab:

**Charts had to be bridged.** Every chart in this product is hand-drawn and
styled by `charts.css`, which is written entirely against the token family
`iris.css` declares on the class `.iris`. Those tokens are class-scoped, so a
chart with no `.iris` ancestor draws with undefined custom properties. Wrapping
the product in `.iris` is not available — that class also paints an opaque
near-black ground and claims `min-height: 100dvh`. The family is therefore
re-declared once per ground in the new sheet, pointed at the values this system
already has, so an unmodified chart renders correctly on both.

**The paper ground must reset `color-scheme`.** `.ox-root` sets it to `dark` for
the frame; without `color-scheme: light` on `.ox-paper`, the user agent paints
every native control, scrollbar and date picker inside a paper plate as though
the plate were dark. The lab never hit this because no plate had ever contained
an input, and the product's first paper plate contains a filter bar.

## What was rejected

**A user-facing theme toggle.** The two grounds mean two different kinds of
content. A switch would make them a preference, and the seam would stop carrying
information.

**Copying `design-lab-c.css` wholesale.** It was written for MADSPACE screens
and uses the unprefixed token names MADSPACE redeclares. Copying it would have
made the two systems share a namespace and bleed at any shared import.

**A second accent for the paper ground.** ADR-0033 refused the approved
artefact's own `#2f97ff` on the ground that the brand is not ours to move; the
same argument refuses inventing a paper-side brand colour. The dim step is the
same hue.
