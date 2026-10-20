# ADR-0045 — Export produces documents: print-to-PDF and a CSV of the figures

**Status:** accepted · **Date:** 2026-10-20
**Decided by:** the product owner, directly, while recording the Shark Residence demo
**Supersedes in part:** the `preview_only` generation state (`packages/readmodels/src/report.ts`) and
the disabled "Generate document" control it kept in `ExportReport.tsx`
**Keeps:** ADR-0018 (internal audience only), ADR-0042 (dark on screen, paper in print)

## Context

The export dialog (`apps/web/src/components/report/ExportReport.tsx`), mounted as "Export project
report", "Export meeting summary" and "Export agent summary", offered three formats. Only "Shareable
page" worked: a link to `/report` carrying the scope, the period, the language chosen and the sections
taken out. For "PDF document" and "Figures as CSV" the primary control was an `aria-disabled` button
with no handler, and the footer said that report generation was scheduled for M4. That was a deliberate
decision: `ReportGeneration.state` was typed to the single member `preview_only`, so that nothing could
promise a renderer nobody had built.

Recording a demo on 2026-10-20, the owner opened "Export agent summary" and reported two defects:

> 1. visibility gondok itt a dropdown menüben; 2. a generate document button locked

("1. visibility problems here in the dropdown menu; 2. the Generate document button is locked.") His
words override the earlier decision.

The first was a styling defect, fixed separately: the native format `<select>` opened its list on
white with near-white option text, because Chrome on Windows paints the open list from the select's
own background and `.ox-select` used the translucent `--ox-panel` lift.

## Decision

1. **PDF document is the browser's print of the composed report.** "Generate document" opens the
   report page the dialog composed (the same address as the shareable page) in a new tab with
   `print=1`. On the report page `PrintPage` opens the browser's print dialog once the document and
   its fonts have loaded, and only when that parameter is present. The footer says what happens in
   plain words: the report opens and the print dialog appears; choose "Save as PDF". The print
   stylesheet already puts the report on paper (ADR-0042): white ground, dark ink, no control and no
   nested graphite region. Nothing pretends to be a server-side renderer.
2. **Figures as CSV is a real download.** `GET /[tenant]/[project]/report/csv` takes the report page's
   address and authorises exactly as the page does: `requireViewer`; the project grant the layout
   checks, refused with the layout's own sentence because a route handler is not wrapped by the layout;
   `requireSurface` for the report, and for the meeting or the agent surface when the scope is one; a
   meeting or an agent the repository refuses is not found. It reads the same read models the page
   reads for that scope, period, language and omitted sections, and writes one row per figure the page
   prints: section, figure, value as displayed, its denominator or the section's sample with its noun,
   period, scope, sources. Nothing is computed in it. A section the read model writes only as a
   sentence is that sentence, with an empty denominator; an absent figure is its word, never 0; below
   the floor the shortfall travels with the figure. The agent register is written without its visitor
   column: a file that leaves the room is not where the buyer-naming gate is decided again. UTF-8 with a
   byte-order mark, RFC 4180 quoting, CRLF, a formula-injection guard on any cell starting with `=`,
   `+`, `-`, `@`, a tab or a carriage return, and an ASCII file name such as
   `shark-residence_zsofia-barany_year-to-date_hu.csv`.
3. **The section checkboxes and the language chips apply to all three formats**, because all three
   take the one address the dialog composes.
4. **`ReportGeneration.state` is `available`.** Its statement says how the document is produced, in
   each scope and language; its milestone names what is still not built. The chip reads "Available now"
   for every format and the "scheduled for M4" footer is gone.

## What stays M4

A server-side PDF renderer ("real vector PDF" in `docs/roadmap.md`), scheduled or e-mailed sends, and
the buyer-facing meeting report. ADR-0018 is unchanged: everything the dialog produces is internal, the
dialog states its audience rather than offering one, and the period is set in the shell, not in the
dialog.

## Consequences

- The PDF depends on the reader's browser. Margins, headers and footers are the browser's print
  settings; the content is the report page.
- A comma-separated file opened by double-click in a Slovak or Hungarian Excel, whose list separator is
  the semicolon, lands in one column; Data → From Text/CSV reads it correctly. A semicolon variant, or
  an `.xlsx`, is a later decision.
- `apps/web/test/report-csv.test.ts`, `report-csv-route.test.ts` and `export-dialog.test.ts` hold the
  writer, the rows, the refusals and the addresses; `e2e/agent-report.spec.ts` drives the dialog and
  the download.
