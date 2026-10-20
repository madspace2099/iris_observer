# ADR-0050 — The report prints as a document

**Status:** accepted · **Date:** 2026-10-20
**Decided by:** the product owner, directly, after exporting the Shark Residence agent summary
**Extends:** ADR-0045 (export produces documents), ADR-0042 (dark on screen, paper in print)
**Keeps:** ADR-0018 (internal audience only), ADR-0012 (a component computes no figure)
**Number:** written as ADR-0049; renumbered before merging, because a parallel stream's
"IRIS-led sales and connect your CRM" holds 0049

## Context

Máté exported Zsófia Bárány's summary (Shark Residence, year to date, in Hungarian) through
Export → PDF document, which since ADR-0045 opens `/{tenant}/{project}/report?agent=…&lang=…&print=1`
and calls the browser's print dialog. He wrote (translated from Hungarian):

> The exported client report is not really well structured for PDF. It has many pages, 14, and no
> good PDF content structure. There is a lot of blank space in it and it is not visually impressive
> either. Fix this.

The printed page was one long column: no cover, a contents list without structure, every section
followed by its explanatory paragraphs, tables and the funnel as one-cell-per-line records, page
breaks that left large white gaps, and no page numbers or running header. Two causes made most of
it, measured in the print render:

1. **The phone layout reached paper.** An A4 page less its margins is about 182mm, roughly 43rem.
   The sheet's `@media (width <= 48rem)` step, which turns a table into stacked records and a
   funnel into a column, applied to every printed page.
2. **Whole sections were kept together.** `.ox-report .ox-plane { break-inside: avoid }` pushed any
   section that did not fit the rest of a page onto the next one, whole.

## Decision

1. **The narrow-screen steps are for screens.** `@media screen and (width <= 48rem)` and
   `(width <= 30rem)`: paper is laid out as a desk width, in small type.
2. **An A4 page box of its own.** `@page report` (A4; 16mm top, 14mm sides, 18mm bottom) reaches the
   report alone through `.ox-report { page: report }`; printing any other screen keeps the
   browser's page. Its margin boxes carry the running footer: bottom left "IRIS Observer · project ·
   document · period" in the report's language (the page writes those words into the rule, quoted
   by `cssString`), bottom right `counter(page) " / " counter(pages)`. `@page report:first` has no
   margin and no footer. A browser without margin boxes (Chrome before 131) prints no footer and
   lays the page out exactly the same.
3. **A cover, on paper only.** Page one bleeds on the graphite ground in the brand's ink
   (`print-color-adjust: exact`): the IRIS wordmark, "Internal — not for buyers" (ADR-0018), the
   document type in the report's language, its subject, the verdict the screen's head states, and
   headline figures in large type, each with its base — handed to the cover by the page from the
   read models it already reads, and chosen to say what the pages after it do not already say in the
   same order: for an agent the presentations, units opened per meeting, outcome recorded and
   progressed of recorded, each a `MetricValue` through `Figure` (section 01's tally is not
   repeated); for the project the period's meetings, the timed ones of them, the team's progression
   as Sales Flow writes it under a label naming its window, and the meetings with no outcome
   recorded; for a meeting its length and recorded outcome (its title is already the start and the
   presenter). Where the verdict stands on other meetings than the period's — Sales Flow's
   comparison of two recency buckets — its base is printed under it from `verdictMeetings`
   (ADR-0048). Below them the project, the period's label (not its bounds: the exclusive end sat
   beside meetings the read model counts after it; the CSV writes the bounds), the language, the
   generated time and the data marker. A meeting's cover and footer name no period. On screen the
   page head says the same and the cover is not drawn. The context band no longer prints: the cover
   states its project and period, and the band would stand above it.
4. **Numbered contents.** Every section of the scope, numbered as its heading is, with the
   manifest's line (`ReportSection.summary`) — on paper one column, the summary cut to one line,
   because the agent scope's summaries run to seven lines in Hungarian; a section the reader left
   out keeps its place, unnumbered and marked. Page numbers per entry would need `target-counter()`,
   which Chrome does not print; the section numbers are what the headings and the notes repeat.
5. **Sections keep one line; the notes move to the back.** A section prints its numbered heading,
   its state, its figures, and one line of provenance (sources, sample, evidence). Every sentence
   that followed it — the tables' captions, the follow-up and recorded-outcome notes, the scope of
   the project list, the ladder's introduction and note, the replay's gaps, a partial section's
   stated gap — stands in "How to read this report", the last part of the document, under the
   section's number. A table keeps its caption as its accessible name, visually hidden; a blank
   section keeps its reason beside its heading, because the reason is then the whole section. A
   figure that is not available says so on its tile, and why stands in the notes.
6. **Sections flow.** Nothing keeps a whole section on a page. A heading stays with what follows it,
   and a figure tile row, a chart, a finding after the first, a table row, a funnel and a short list
   stay whole (planes and lists are blocks in print: as flex columns, Chrome broke between a box's
   top edge and its first item and left a heading over an empty frame); tables repeat their head on
   each page they cross; scrollers stop scrolling in print, so a table breaks between rows instead
   of being pushed whole. Nothing in a printed table refuses to wrap: one register row wider than
   the page made Chrome shrink every page, the cover too.
7. **Charts drawn for paper, from the same figures.** The outcome mix is one 100% SVG bar over the
   table that is its legend (a swatch in each row): progressed outcomes in one muted green at four
   strengths, "not interested" in the poor mark's terracotta, "presentation only" grey, no outcome
   recorded hatched, a part wide enough to hold its count printing it. On a mono printer each part
   is at least 25 steps of luma from the part beside it in the read model's order
   (`report-print.test.ts` computes it from the paper tokens). A section's median stay and the
   team's share of time carry an SVG bar beside the read model's display. The funnel and the CRM
   ladder are compact rows with the bar from the left edge: an agent's stages each have their own
   base, so a centred shape would claim they nest. SVG prints whether or not the browser prints
   backgrounds; every number beside a mark is the read model's.

### Not taken: a page of its own for the appendix

The brief allowed one forced break, before the notes. It was built and measured: it left the page
before it half empty in every scope, and the meeting summary's third page held six lines. The
appendix follows on instead, its heading and lede kept with its first entry.

## Measured

Rendered with the real read models and stylesheets (`renderToStaticMarkup` of the report page for
Shark Residence, viewer Daniel Hart) and printed by headless Chromium 151 to A4, backgrounds off,
as Chrome's "Save as PDF" starts:

| Document                              | Before | After |
| ------------------------------------- | -----: | ----: |
| Agent summary, Zsófia Bárány, HU, YTD |     14 |     6 |
| Project report, EN, YTD               |     11 |     5 |
| Meeting summary, EN                   |      3 |     2 |

The agent summary was 7 pages, its last holding six lines, until the review's round: printed
table rows wrap at a line-height of 1.35 and the contents print a line a section.

Máté's own file was 14 pages ("Microsoft Print to PDF"); the earlier capture in
`_review/shark-demo/print/` (Chrome, A4) was 8 and 7. No page after the cover ends more than a few
lines short of its foot, except the last.

## Consequences

- The CSV route is unchanged: it reads `figures.ts`, whose words, order and period bounds did not
  move.
- The screen view of `/report` gains the numbered contents and the notes appendix; its tables'
  captions are visually hidden there too (`DataTable`'s `captionHidden`, the `ox-sr` class
  layout-integrity exempts), and the appendix prints them.
- `apps/web/test/report-document.test.ts` renders the page and holds the cover's strings to the
  read model's, the numbering, the left-out section, the moved notes and the footer's quoting;
  `apps/web/test/report-print.test.ts` holds the page box, its footer and counter, the bare first
  page, the absence of section-level `break-inside: avoid`, repeated table heads and the
  screen-only narrow steps. `e2e/dark-surfaces.spec.ts` and `e2e/frame-language.spec.ts` read the
  period and the ink from the cover and the document instead of the context band.

## What was left

- The footer needs margin boxes: Chrome and Edge 131 or later. Firefox and Safari print the
  document without it.
- The contents carry section numbers, not page numbers.
- The meeting summary's first section repeats the cover's length and outcome in its tally.
- The register keeps its eight columns on paper; in Hungarian a row still takes two or three
  (tighter) lines, because its durations are the read model's long form.
- A contents line is cut at the page's width; the section beneath it is the rest of it.
- The greyscale steps hold between neighbours in the full order; where a part between two has no
  meetings, the two that meet may be closer, and the count printed in each and the table name them.
- The cover's "generated" time (09:00) is the read model's clock, earlier than the day's last
  meetings it counts; the cover no longer prints the bounds, but the clock is not this ADR's.
