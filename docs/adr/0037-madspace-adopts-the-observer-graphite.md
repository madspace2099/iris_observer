# ADR-0037 — MADSPACE administration adopts the Observer graphite ground

**Status:** accepted · **Date:** 2026-09-08
**Extends:** ADR-0034 (the graphite token vocabulary), ADR-0020 (Manrope and `#00A3FF`)
**Revises:** `docs/20-madspace-admin-design-system.md` §0 "Light by default" and "Inter on
`/madspace`", §2 Surfaces and Ink, §8 Inverse theme

## Context

`docs/20-madspace-admin-design-system.md` adopted the client-portal design system for every screen
under `/madspace`, and took two visible decisions with it: the operations screens went from graphite
to warm paper, and the font switched to Inter at the `/madspace` boundary. Both were recorded as the
boundary between two products under one vendor: the customer's Observer is dark, the operator's
MADSPACE is light.

On 2026-09-08 the founder reviewed the seven operations screens (Administration, Projects, New
project, Project detail, Integrations, Diagnostics, Directory) and asked, explicitly and for these
routes, that they stop using the light presentation and adopt the existing Observer dark/blue visual
language. The request is scoped: the same information architecture, permissions, navigation and
workflows, a different ground. It is not a merge of the two products and not a redesign.

Two facts about the current state bear on how to do it:

- The paper decision was implemented as a token swap on one class (`.mad-portal`), and the
  stylesheet's own docblock says why: a filter on `body` breaks every fixed element, a swap does not.
  The rules underneath speak semantic token names, so the surface turns over by redeclaring the
  block, and anything that does not turn over is a hard-coded value the swap makes visible.
- Inter was specified and never delivered. There is no Inter asset in the repository; the declared
  stack resolves to the metric-matched `"Inter Fallback"`, which is the user's OS face (Segoe UI,
  Roboto) spaced to Inter's metrics. Measured on 2026-09-08 before this change: `document.fonts`
  holds `Manrope Variable` and `Inter Fallback`, never Inter. MADSPACE has been rendering in a
  system face by accident for as long as the paper theme has existed.

## Decision

1. **The ground is the Observer graphite.** `.mad-portal` redeclares its tokens with the values
   ADR-0034 measured for `.ox-graphite`: the shell ground `#07090c`, the translucent panel
   `rgb(140 165 205 / 5%)` composited to `#0d1117` where a surface must be opaque (header,
   navigation, popover, dialog), the six-alpha line ramp on `rgb(130 150 185)`, the ink hierarchy
   `#f4f7fc` / 74% / `#98a4b8` / `#8592a8`, and the status pairs (good `#8ad9b0`/`#4fbf88`, watch
   `#e6c07a`/`#d9a441`, human `#7cc9ff`/`#00a3ff`, poor `#f0a49e`/`#e07a72`). No value is invented;
   every one is already in `observer-product.css` or `tokens.css`, with its contrast measured there.
2. **The accent is the brand accent.** On paper `#00a3ff` failed the contract at 2.73:1 and the
   studio blue stood in. On graphite it measures 7.10:1 on the panel and carries the focus ring and
   the "a person decided this" state, exactly as on every Observer surface. The status meaning of
   blue in `docs/20` §1 ("waiting for MADSPACE") is kept: it is the same hue family, drawn from the
   `--ox-human` pair.
3. **Ink as surface inverts.** The filled primary control and the scope band were ink on paper with
   white text. On graphite the same rule reads as light ink with the ground's text colour, through
   `--text-inverse`, never a literal `#ffffff`/`#000000`. Hover on a filled control lightens, the
   dark-ground direction the stylesheet already documents.
4. **Manrope on `/madspace` too.** The founder asked for the Observer visual language, typography is
   half of it, and the alternative was to keep declaring a face that does not load. `--portal-font`
   points at `--font-sans`; the Inter stand-in `@font-face` and the "Inter on `/madspace`" adoption
   decision are withdrawn. The portal's own type scale, tracking and 12px floor are unchanged.
5. **Print stays paper.** A `@media print` block restores the paper token values inside
   `.mad-portal`, so a printed Diagnostics or Directory is ink on white. Screen and print are
   governed by their own requirements; the dark ground never reaches paper.
6. **Nothing else moves.** Information architecture, `OpsNav`, permissions, the disclosure, the six
   status shapes, the 12px floor, the two-shadow rule, the focus ring, the no-dash language rule and
   every workflow are untouched. The customer-facing shell, the design labs and the sign-in portal
   (`mp-`) are outside this decision.

## Consequences

- `docs/20` remains the specification for structure, components, accessibility and language; its
  colour tables are superseded by the graphite values in this ADR, and §8 now describes the theme in
  force rather than an optional inverse. The document is amended in place, only where it states the
  ground or the font.
- `apps/web/test/madspace-design-system.test.ts` asserts the five values that carry meaning; they are
  restated for graphite. The test that no `--surface-*` token is declared at `:root` still holds:
  the swap is on the class, so the Observer product is not repainted by it.
- The client-portal PDF's own paper palette is no longer what `/madspace` shows. Anyone reading the
  PDF beside the screen should expect the ink hierarchy and the status shapes, not the colours.
- Every consumer of `.mad-portal` turns over at once: the seven routes named above, and the two
  drill-downs under them (`/madspace/sources/[sourceId]`, `/madspace/projects/[projectId]/sources/new`),
  which were verified in the same pass.

## Verification

Before and after this change the seven routes were measured at 390, 768, 1440 and 1920 with the same
account, fixture and capture location: computed ground, panel, control and text colours, the loaded
font, scroll width against viewport width, clipped labels, focus ring, scoped axe. The evidence set is
recorded in `docs/PROJECT-STATE.md` with the tested commit.
