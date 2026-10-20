# ADR-0042 — Dark on screen, paper in print

**Status:** accepted · **Date:** 2026-10-19
**Decided by:** the product owner, directly, for the Shark Residence demo build
**Supersedes in part:** ADR-0034 (the paper ground on screen; its token vocabulary and its print
values stand)
**Extends:** ADR-0037 (the print-only paper precedent in `madspace.css`), ADR-0041 (chart cards)

## Context

ADR-0034 put every measured region of a product screen on a warm-paper plate: `.ox-plate.ox-paper`,
`#f5f4f1` with `#ffffff` panels and dark inks, inside the graphite frame. Eleven product routes wear
it (the agent page, the unit register and unit page, attention, Ask history and the answer sheet,
meetings and the replay, the Briefing, features, and every `Plate` on the Project page). The sign-in
and the root 404 used a second light system, the `.mp` tokens in `apps/web/src/portal/portal.css`,
transcribed from the client-portal reference.

On 2026-10-19 the owner reviewed the demo build and said:

> I absolutely do not like the white-background blocks (e.g.
> /alpha/ister-tower/agents/agt_martinkovac). Everything in the system must have a dark background,
> not white.

An earlier decision of his stands beside it: the printed report stays white and legible.

## Decision

1. **The paper ground is print only.** In `packages/ui/src/observer-product.css` the `.ox-paper`
   token block, the paper chart accent (`--accent: var(--iris-accent-dim)`) and the paper link
   colour move under `@media print`, the mechanism ADR-0037 used for `/madspace`. On screen
   `.ox-paper` declares no `--ox-` token, only the chart-bridge names it shares with `.ox-graphite`,
   which resolve to the graphite it inherits; so a plate wears the graphite of the shell it stands
   in: its `--ox-page` is the graphite `transparent`, so the shell's near-black shows through,
   inside the plate's hairline. The class names and the markup stay: eleven e2e locators and every page read
   `.ox-plate.ox-paper`, and in print the plate is still the measured region on paper.
2. **The printed report reads paper ink throughout.** The print block set `#111` on `.ox-report`
   and its planes only, while every child names `var(--ox-ink)` and its steps, which resolved to
   the graphite inks: near-white on white paper. The paper tokens are now declared in print on
   `.ox-root:has(.ox-report)` as well as on `.ox-paper`, so the report, its planes and the context
   band above it (the period switcher prints, `frame-language.spec.ts` measures it) all read the
   paper values, and the chart bridge resolves against them on the same element.
3. **The portal is graphite.** The `.mp` block takes the values `.mad-portal` carries since
   ADR-0037, which are `.ox-graphite` restated, with `color-scheme: dark`. Three values that would
   fail on the dark ground are replaced: `--link` (3.99:1) by the brand accent, the critical red
   (3.05:1) by the graphite poor pair, `--ink-5` (4.39:1) by the floor ink. The primary `.mp-btn`
   fills with the brand accent and near-black text, the product's `.ox-btn` primary, rather than
   with the now-light ink, which would have made the sign-in's main button a near-white slab. The
   skip link writes the page colour on the light ink. The hero keeps its own photograph values.
   Nothing in the portal prints, so no paper values are kept there.
4. **An error no nearer boundary catches is graphite too.** `app/global-error.tsx` renders its own
   document in the portal register the root 404 uses. Before it, an error in the project layout,
   `/projects`, `/welcome`, `/settings/ai`, `/madspace` or `/sign-in` reached Next's built-in page,
   which is white on a light-mode system.
5. **The MADSPACE scope band is a raised graphite band.** `.mad-scope-band` (`/madspace/sources/…`,
   "These operations reach …") was filled with `--ink`, which on graphite is near-white: a
   full-width light block. It now stands on `--surface-tint` with the strongest border alpha and
   the light inks; the kicker text names the wider scope, as it did.
6. **The chart card's half elevation goes.** `[data-charts="d"] .ox-paper .d-card` lowered the
   card's shadow on a paper plate. There is no paper plate on screen, so a chart card spends the
   kit's full elevation wherever it stands.
7. **The timeline's knock-out ring is opaque.** `.ox-time-spine::before` cut the spine around each
   step with a ring of `--ox-panel`, opaque white on paper and a 5% lift on graphite, so on screen
   the spine ran through it. The ring is `--iris-ground` on screen; print restores `--ox-panel`.
8. **Guards.** `apps/web/test/observer-product-design.test.ts` measures the paper values as print
   and adds a screen test: with every `@media print` block cut out, no paper ink, no light scheme
   and no second ground declaration remains, the only screen rule naming `.ox-paper` is the chart
   bridge it shares with `.ox-graphite`, a plate is painted `var(--ox-page)`, which is
   `transparent` on graphite, and `--ox-panel`, `--ox-panel-2` and `--ox-inset-fill`, read from the
   sheet and composited on `--iris-ground` read from `iris-shell.css`, stay below luminance 0.02.
   `apps/web/test/portal-graphite.test.ts` measures the portal tokens, failing on a value it cannot
   parse, the accent primary, and that `global-error.tsx` brings its own graphite document.
   `e2e/dark-surfaces.spec.ts` measures the rendered grounds of the sign-in, the 404 and the agent
   page the owner named (a light gradient stop or no opaque ground at all counts as light), and
   the printed report's ink.

## Contrast

WCAG 2.x ratios, computed from the declared values. The graphite page is the shell ground
`#02050d`; the graphite panel is the 5% lift `rgb(140 165 205 / 5%)` composited on it, the lighter
and so the tighter of the two. The portal page is `#07090c`, its card `#0d1117`. Text needs 4.5:1;
large text and non-text marks need 3:1.

**On screen, product plates** (the graphite values ADR-0034 measured, now also inside plates):

| Token                            | Value                         |       Shell ground |         Panel lift |
| -------------------------------- | ----------------------------- | -----------------: | -----------------: |
| `--ox-ink`                       | `#f4f7fc`                     |              18.99 |              18.08 |
| `--ox-ink-2`                     | `rgb(244 247 252 / 74%)`      |              10.26 |               9.98 |
| `--ox-ink-3`                     | `#98a4b8`                     |               8.09 |               7.71 |
| `--ox-ink-4`                     | `#8592a8`                     |               6.48 |               6.17 |
| `--ox-good`                      | `#8ad9b0`                     |              12.26 |              11.68 |
| `--ox-watch`                     | `#e6c07a`                     |              11.83 |              11.27 |
| `--ox-human`                     | `#7cc9ff`                     |              11.32 |              10.78 |
| `--ox-poor`                      | `#f0a49e`                     |              10.20 |               9.72 |
| `--ox-focus`, link, chart accent | `#00a3ff`                     |               7.46 |               7.10 |
| marks: good / watch / poor       | `#4fbf88` `#d9a441` `#e07a72` | 8.87 / 9.06 / 6.99 | 8.45 / 8.63 / 6.65 |

**On screen, the portal** (`/sign-in`, the root 404); every value here changed:

| Token                                       | Was                    | Now                            |  Page |  Card |
| ------------------------------------------- | ---------------------- | ------------------------------ | ----: | ----: |
| `--ink`                                     | `#111111`              | `#f4f7fc`                      | 18.56 | 17.62 |
| `--ink-2`                                   | `#4a4a4a`              | `rgb(244 247 252 / 74%)`       | 10.13 |  9.83 |
| `--ink-3`                                   | `#5c5c5c`              | `#98a4b8`                      |  7.91 |  7.51 |
| `--ink-4`                                   | `#6b6b6b`              | `#8592a8`                      |  6.34 |  6.01 |
| `--ink-5`                                   | `#767676` (4.39 here)  | `#8592a8`                      |  6.34 |  6.01 |
| `--ink-900`                                 | `#1e1e1e`              | `#dfe5ee`                      | 15.74 | 14.94 |
| `--link`, focus ring                        | `#0f6fd0` (3.99 here)  | `var(--iris-accent)` `#00a3ff` |  7.29 |  6.92 |
| `--status-critical`                         | `#b3261e` (3.05 here)  | `#f0a49e`                      |  9.98 |  9.47 |
| `--status-approved`                         | `#2f8f5b`              | `#8ad9b0`                      | 11.99 | 11.38 |
| primary `.mp-btn`: near-black on the accent | page colour on `--ink` | `#04121c` on `#00a3ff`         |  6.93 |       |
| primary `.mp-btn` hover                     |                        | `#04121c` on `#2bb4ff`         |  8.19 |       |
| skip link: page colour on `--ink`           |                        | `#07090c` on `#f4f7fc`         | 18.56 |       |

The portal never declared the dim accent. On the product side it left the screen with the
`.ox-paper` block, whose `--ox-focus` it was; `#0b6fae` measures 3.70:1 on the portal page and is
now used only in print.

**On screen, the MADSPACE scope band** (`--surface-tint` on the page `#07090c`, composited
`#12151b`): `--ink` 17.02, `--ink-2` 9.61, `--ink-4` 5.81. Its edge, the 46% border alpha,
measures 2.23 against the page, under 3:1; the kicker's words name the wider scope, the edge only
frames them.

**In print** (unchanged from ADR-0034; the plate `#f5f4f1`, the panel white):

| Token                                   | Value     | Plate | White |
| --------------------------------------- | --------- | ----: | ----: |
| `--ox-ink`                              | `#14161a` | 16.47 | 18.11 |
| `--ox-ink-2`                            | `#45494f` |  8.23 |  9.06 |
| `--ox-ink-3`                            | `#575c63` |  6.13 |  6.74 |
| `--ox-ink-4`                            | `#676c74` |  4.80 |  5.28 |
| `--ox-good`                             | `#0f5c39` |  7.31 |  8.05 |
| `--ox-watch`                            | `#7d4a00` |  6.70 |  7.36 |
| `--ox-human`, focus, link, chart accent | `#0b6fae` |  4.90 |  5.39 |
| `--ox-poor`                             | `#a92019` |  6.57 |  7.22 |

## What was left

- **Graphite regions of other pages still print light ink.** Only the report has a print control,
  and only a shell holding a report swaps to paper. A reader who prints any other product page gets
  its plates on paper and its graphite planes in light ink, as before this decision.
- **A chart card in a printed plate prints its graphite ink.** `ChartFrame` wears `ox-graphite`,
  which re-declares the dark tokens inside the card, and a browser drops backgrounds in print by
  default. The report holds no chart, so the printed report is unaffected.
- **Field and alert edges are low-contrast hairlines on both grounds.** A field's border
  (`rgb(130 150 185 / 24%)`) and the alert's edge composite to under 3:1, as their light
  counterparts did; the label, the text and the focus ring carry the control.
- **Comments that say "paper"** on the product pages describe the measured region a plate holds,
  which still prints on paper; they were not rewritten one by one.
- **The dead `.mp-*` rules** for the old project selector and AI settings page stay in
  `portal.css` with graphite tokens under them; nothing renders them.
- **MADSPACE primary actions stay ink-filled, deliberately.** `.mad-portal`'s primary
  `.obs-action`, `.mad-button`, `.mad-action[data-weight="primary"|"confirm"]` and `.mad-submit`
  fill with `--ink`, near-white on graphite, with `#07090c` text (18.56:1). In `/madspace` blue
  means "waiting for MADSPACE" (principle 01, `docs/20-madspace-admin-design-system.md`), so the
  accent the product and the portal use for a primary would say something else there. These are
  controls a few words wide, not grounds; they are the one light fill left on a screen a
  signed-in user reaches.
