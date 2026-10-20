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

**2026-10-19, after the second review.** The deal ladder wears the card the other chart regions wear,
so inside a `.d-card` its `.ox-funnel` panel gives up its edge, tint and radius: one card, not a box
in a box. Its fill and its rows' hairlines are not touched. The glow left on two outcome marks, the
"progressed" part of the period steps and the units sold against the plan, is gone.

**2026-10-20, outcome rows.** Recording the Shark Residence demo, the owner looked at Sales Flow's two
stacked-column charts and said, in Hungarian: _"Nem tetszenek ezek a diagramok itt nagyon rosszul
olvasható!!! Ezeket cseréld ki egy másfélére."_ (I don't like these charts, they are very hard to
read; replace them with a different kind.) His screenshots showed why: columns a few pixels wide, a
one-meeting part a 3px sliver, two names wrapping under their columns, each presenter's column short
beside the team's 150, and a key whose colours came in pairs (Interested and Follow-up needed both
blue, Presentation only and Not interested both brown).

- **What replaced what.** "What those meetings became" and "How each agent's meetings end" are drawn
  by `OutcomeRows` (`apps/web/src/showroom/charts2.tsx`), no longer by `StackedBars`. One horizontal
  row per group: the team first, set apart by a hairline, then each presenter in the read model's
  order, never sorted on a figure; the months in time order. Each row is its own whole, so a share
  compares row to row. Parts run in ladder order, the unrecorded outcome last as a hatch; a part with
  no meeting is not drawn; a part carries its count inside where it is 26px or wider and a title
  ("Lena Fischer · Purchase: 7 of 39") always. Beside each bar stands the read model's
  `ProgressedFigure`, "81% progressed · 29 of 36 recorded", written for a presenter
  (`AgentOutcomeRing.figure`), the team (`SalesFlowView.team`) and a month (`StackedColumn.figure`);
  below `AGENT_MIN_SAMPLE` recorded meetings, the set the rate stands on and not the meetings held,
  a row keeps its bar and states how far short it is instead of a rate, for a presenter, the team and
  a month alike (a five-meeting stub month states no rate beside a whole one). One key, its counts the
  team's own. A card narrower than 56rem (a tablet's included) puts the name above the bar and the
  figure under it, so the bar takes the card's width. Each row is a list item named with its group,
  its meetings and its figure; the bar is one image to assistive technology, a bar with no part is
  none, and no part is a focus stop. A period with no meeting gets one sentence in each card instead
  of the rows.
- **Motion.** A new `DrawIn` kind, `grow`: the bars clip in from the left, row by row 70ms apart,
  inside the 1500ms the entry already allows. Names, figures and key stand from the first frame;
  reduced motion and print get the final frame.
- **Colour.** One palette for every outcome chart: the `--outcome-*` tokens (`iris.css`, bridged in
  `observer-product.css`) were retokened, so the ring, its key and the rows read one key. A first
  pass scoped a palette to the rows and left the ring on the old tokens; on one page blue then meant
  Interested in the ring and Follow-up needed in the rows, and grey meant unrecorded in one and
  Presentation only in the other. WCAG non-text contrast on the D card (`#000`) and the ring's track
  (`#111114`): purchase `#8cf5a8` 15.7 / 14.1:1, reservation `#3fd3a0` 11.0 / 9.9:1, interested
  `#26c0cf` 9.5 / 8.6:1, follow-up needed `#3f7fd0` 5.2 / 4.6:1 (green to teal to blue, lightest
  first, for the four that progressed), presentation only `#8d8f95` 6.5 / 5.8:1 (neutral grey), not
  interested `#c4744c` 6.0 / 5.3:1 (a terracotta, neither the watch amber `#d9a441` nor the loss red
  `#e07a72`), unrecorded `#6e6e78` (`--outcome-unrecorded`) 4.2 / 3.7:1, never solid: a hatch in a
  bar and a key, stripes on a ring. Every two of the seven stand at least 0.096 apart in OKLab under
  normal vision, protanopia and deuteranopia (Machado 2009, full severity); the first pass's
  interested `#22a6b8` and presentation only `#9a9aa5` were 0.028 apart under protanopia. Neighbours
  are close in luminance (1.1 to 1.9:1), so a 2px gap of the card separates every two parts in a bar
  and a gap of the track every two slices on a ring. A count inside a part is the card's black, 5.2:1
  or more on every fill; on the hatch it stands on a black patch in the card's ink. The period steps
  read the D ramp, not these tokens, and are unchanged. No glow.
- **What stays.** `StackedBars` and the `.iris-stacks` rules remain for the design-lab gallery alone;
  the product card's own stacked-column rules are gone.

**2026-10-20, four more of the gallery's forms, and Coaching as one chart.** Preparing the Shark
Residence recording, the owner named the gallery's bubble lens, parallel coordinates, radial day and
radars as missing from the product. They are adopted, each over recorded data through the port:

- **The radial day** on Sales Flow, above the weekday grid: `ActivityMatrix.day`, counted in the
  grid's own pass, all twenty-four hours, every day together. Only the busiest hour glows: on Shark
  every hour clears the gallery's half of the peak, so a glow there marked every bar and meant
  nothing.
- **The bubble lens** on Sales Flow: `FlowCharts.lens`, the period's recorded meetings, never the
  lab's rehearsal (the lab keeps it, in the product's shape). It is drawn at the card's own measured
  width, one lens and one strip, months only where a month's columns hold a bubble; a month the
  period starts inside is shaded for its days before the period (`lead`).
- **The radars and the parallel plot** on Coaching, and the basic radar on the agent page. On
  Coaching the owner overruled the small multiples in his own words (2026-10-20, translated): "Fine,
  but the user learns nothing from this, they only see charts in front of them. The system should be
  able to evaluate what it sees between the individual sales agents. On this page I would use one
  single big chart, which could be almost full-screen size, and all the agents would be inside one
  chart." (Original: „jó de ebből nem tanul a user semmit csak lát maga előtt diagramokat. Ki kellene
  tudnia értékelnie a rendszernek azt hogy mit lát az egyes sales ügynökök között. Itt ezen az
  oldalon én egyetlen nagy diagramot használnék ami szinte az egész full screen nagyságú lehetne és
  eg diagramon belül lenne az összes agent.") So Coaching is one region the width of the page: every
  agent at or above the floor in one chart, through one of two lenses kept on the address
  (`&lens=parallel`), a key that lifts, hides and opens each agent, the agents under the floor named
  beside it, and **IRIS's reading** beside the chart — composed in the read model
  (`CoachingReading`), never in the component: where the drawn agents differ most, each one's most
  distinctive habit against everyone else's meetings, and what meetings with that habit came to
  across the project, split as the cohort comparison splits them, at both sample sizes, only where
  each side clears the floor. It describes and associates; it never names a cause or ranks a person,
  and it closes on the comparison's own disclaimer.

Four decisions come with them:

- **Seat-order identity colours, in the read model.** `RadarProfile.tone`, `FeatureUsageProfile.tone`
  and the lens's agents give each presenter `--d-series-${seatSeries(seat)}` in the order
  `presentersIn` returns them, never by the period's workload, so a person wears one colour on every
  chart in a period. The four-step ramp this replaces gave the fifth agent the first one's colour.
  `seatSeries` takes the kit's hues as 1, 2, 4, 6, 5, 3, not in the kit's order: the kit's 3 and 5
  are near-identical cyans, and in that order Shark's five agents wore both.
- **Two decorations are not ported**: the parallel plot's pink haze and the basic radar's blurred
  colour field. Both are glowing blobs, which the doctrine refuses (SKILL.md §5), and the brief was
  the kit executed with restraint. The field stays in the lab (`.dld-root` only); restoring either
  on the product is one line.
- **The kit's magenta and violet stay.** `--d-series-4: #ff00dd` and `--d-funnel: #8338ec` conflict
  with SKILL.md §5's "no purple"; they are the owner's kit, chosen clear of the verdict colours, and
  nothing new in purple is added. A known conflict, resolved by his decision.
- **No text under 12px** in the ported forms: their rules read under `:is(.dld-root,
[data-charts="d"])`, the axis names stand on end where ten do not fit across, and
  `apps/web/test/chart-paint.test.ts` holds both.
