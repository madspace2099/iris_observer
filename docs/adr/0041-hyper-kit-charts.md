# ADR-0041 — Every product chart in the Hyper kit's hand

**Status:** accepted · **Date:** 2026-10-19
**Decided by:** the product owner, directly, for the Shark Residence demo build
**Amends:** CLAUDE.md non-negotiable 10 ("nothing is a card"), for chart regions only
**Extends:** ADR-0012 (components compute no metric), ADR-0034 (the two grounds)

## Context

Design-lab variant D (`/design-lab/variants/d`) drew the product's own chart components under the
treatment of the "Hyper ✦ Charts" kit: black cards on a darker ground, the kit's layered elevation and
glow, gradient strokes, dot fills, mono figures, round ring caps, segmented ranked tracks, and an entry
motion. It also drew two forms the product did not have: the journey as one narrowing funnel, and the
attention × conversion frame as a scatter.

The owner reviewed the gallery and chose its look for every chart on a product page, with its motion,
and on the Project page the funnel in place of the journey sankey and the scatter in place of the four
quadrant lists. His words were that the site must not look like AI slop: the look is the brief, to be
executed with restraint.

## Decision

1. **Chart regions are cards.** A chart region on a product page wears `.d-card`: the kit's black
   card, 12px radius, its elevation, 24px inside (16px on a phone), and a 1px edge the kit does not
   have, because the product's plane is darker than the card and a black card on it has no visible
   end. `ChartFrame` wears it together with `ox-graphite`, so a frame standing on a paper plate draws
   its chart on the dark card. Cards sit on one 20px gutter; a hairline rule between two cards gives
   way to the gutter.
2. **Paint and type cross over, sizes do not.** The kit's marks are ported onto the product's
   components at the product's sizes: a roster ring stays 126px, Sales Flow's 148px, the KPI strip
   keeps its joined cells. Gradient stroke and dot fill on the sparkline and the trend, pill columns,
   the segmented track on ranked rows and CSS bars, round ring caps, the "simple" radar, the
   "gradient" heatmap, the bullet ramp, the section sequence, mono figures. No text under 12px
   inside a card.
3. **One stylesheet, one scope.** The rules live in `packages/ui/src/design-lab-d.css`, imported
   last by the root layout. Its `--d-*` tokens apply under `.dld-root` (the gallery) and under
   `[data-charts="d"]`, which the project shell sets; every product rule is under
   `[data-charts="d"] .d-card`. On the product scope the kit's quietest ink is lifted from 3.13:1 to
   5.75:1 on the card. The shell renders the three paint servers the rules name (`#dld-line`,
   `#dld-dots`, `#dld-glow`) once, from `ChartPaint` in `apps/web/src/showroom/forms.tsx`.
4. **Motion.** Every chart component draws itself in with the gallery's kind (`DrawIn`, now
   `apps/web/src/showroom/DrawIn.tsx`): bloom, sweep, rise or turn, once, when it first reaches the
   screen, and again when the reader changes the period (the card or the frame is keyed on it). Under
   reduced motion, and in print, there is no waiting frame. Playwright runs the suite under reduced
   motion so no screenshot or axe scan reads a half-drawn chart.
5. **The Project page's two forms are composed in the read model.** `ProjectCharts.journey.funnel`
   carries each band's count and its share of the first band, and names a stage nobody stopped before
   rather than drawing a band as wide as the one above it. `ProjectView.scatter` places every segment
   with a quadrant and carries `SegmentConversion.display`, the line the quadrant lists printed. The
   scatter's key keeps the frame's action: each point and each key row opens its segment, under the
   cell's name and its instruction. Neither form is drawn empty; a sentence stands instead.

## What stays out

- **Tables, registers, text plates and the printed report.** They wear no `.d-card`, so no rule
  reaches them. The report (`.ox-report`) stays white and complete.
- **Colours that already mean something.** The outcome palette (`OUTCOME_TONE`), the verdict colours
  (`--gain`, `--watch`, `--loss`), `.ox-track-fill`, and the deal ladder's `.ox-stage-fill` and
  `.ox-funnel` are not repainted, and nothing that carries one glows. Where a product rule would reach
  one it excludes it by name.
- **`observer-product.css`.** No D rule is written there; its test still holds the one elevation and
  the uncoloured proportion.
- **The kit's typefaces.** Text stays Manrope; figures take Geist Mono, as in the gallery.

## Consequences

- CLAUDE.md non-negotiable 10 has one exception: a chart region is a card. Everything else is still
  on planes separated by hairlines.
- `QuadrantMatrix`, `FlowScroller` and their CSS are gone; `JourneyFlow` remains for the one unused
  component that still imports it.
- Every product page with charts needs a fresh screenshot that somebody looked at (non-negotiable 11):
  a green build approves none of this.

## Amendments

**2026-10-19, after the chart-stream review.** Four points of decision 2 changed on screen evidence:

- **Ring ends are butt, not round.** A round cap reaches half the stroke past its slice, and the
  neighbour's cap painted over a one-purchase slice.
- **Ranked rows are neutral by default.** Every list in the kit's green with its glow read as one
  wall. `RankedBars` names a tone where it says something: the kit's green for a plain count of
  work, the watch colour (never glowing) for stalled deals. The glow is the pointer's and the
  keyboard's.
- **Three geometries, not two.** `Sized` takes a middle drawing for a card between the Large and the
  XL, and each is shown only where it renders at 1:1 or more, so no chart label falls under 12px on a
  tablet or a phone. The trend line draws all three.
- **The scatter is a picture of its key.** Its SVG is hidden from assistive technology with the
  reading as a sentence beside it; the points stay pointer links out of the tab order, and the key's
  links are the keyboard's route.
