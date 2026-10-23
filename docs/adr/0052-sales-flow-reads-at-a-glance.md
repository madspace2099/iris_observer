# ADR-0052 — Sales Flow reads at a glance

**Status:** accepted · **Date:** 2026-10-22 · **Amended:** 2026-10-23, the source line is off every
screen and Sales Flow's findings are short (the last section)
**Decided by:** the product owner, while recording the Shark Residence demo
**Extends:** ADR-0023 (provenance is visible), ADR-0041 (every product chart in the Hyper kit's
hand)
**Runs beside:** ADR-0053 (the not-interested drill, stream DRILL) and ADR-0054 (agent portraits,
stream PORTRAITS), which answer the rest of the same comments on the same page.

## Context

On 2026-10-22 the owner went through `/shark/shark-residence/flow` on the local production build and
wrote a list of comments in Hungarian. The ones this decision answers, in his words and translated:

1. _"Every outcome - túl kicsi ez a kör diagram, legyen nagyobb látványosabb."_ — this ring chart is
   too small; make it bigger, more striking.
2. _"A 'Meetings, and how many progressed' blokkban a diagramok alatt sok a fekete blank space azt
   optimalizáld!"_ — under the charts in that block there is a lot of black blank space.
3. The bubble lens's lead ("150 meetings, quarter to date, 80 of them drawn: one bubble each…")
   and its note ("The sizes follow the order of the outcome ladder; they are not a computed
   likelihood…"): _"ezt szintén helyezd a blokk neve mellé egy 'i' floating blokkban"_ — put this,
   too, beside the block's name in an "i" floating box. Both of them.
4. _"'What changed since the same 54 days of the previous quarter' + 'When showroom meetings
   happen' + 'Which meetings are nearest a purchase, and whose' ezek a titulusok nagyon fontosak, de
   nagyon kicsi a betűméret!"_ — these titles are very important, but the font is very small.
5. _"'What those meetings became' titulus nem érthető milyen 'those' meetings? A mellett levő
   'Presentations week by week' diagramhoz kapcsolódik ez? Ha igen akkor a kettőt kapcsold össze egy
   blokkba horizontálisan."_ — which "those" meetings? If it belongs to the weekly chart beside it,
   join the two into one block, horizontally.
6. Oliver Grant's flag, _"8 of 22 recorded meetings ended 'not interested' — worth watching the
   presentation itself…"_: _"ide legyen mellé téve egy felkiáltójel pirossal ne agresszívan de
   figyelemfelkeltően"_ — put a red exclamation mark beside it, not aggressive but attention-catching.
7. _"A 'How they present' gomb legyen ugyanabba a magasságba rendezve a panelekben."_ — line the
   "How they present" buttons up at one height across the panels.
8. _"'IRIS observed / IRIS calculated / CRM outcome' - nem értem hogy ezek mit jelentenek miért
   vannak oda írva."_ — I don't understand what these mean or why they are written there.

The "How each agent's meetings end" drill, the not-interested section and the agents' profile pictures
are the other two streams'.

## Decision

1. **Every outcome is drawn large.** The ring is 248px (148 before), in the kit's Large-ring
   vocabulary scaled to it: a 22px butt-ended stroke, a 42px total in its centre, no glow, no
   gradient. Its key sits beside it at 14px, capped at 17rem so a count stays near its name, and under
   it, centred, where the card is narrower than 28rem. The drawing shrinks with a phone's card and
   never past it.
2. **The black field is gone by sharing the row, not by shrinking.** It came from the band stretching
   both cards to the taller one — the ring's — while six 6rem columns stood at the top of theirs.
   Side by side (wider than 75rem) the two cards split the row 1.15 to 1, so the ring holds its key
   beside it, and the step columns grow to the height the ring sets. The six steps share four rows
   through two subgrids, so a wrapped label pushes every label down alike and every bar stands on one
   floor. Stacked, each card is its own height and nothing changes.
3. **The lens explains itself behind its `i`.** The read model's lead and note, unchanged, are the
   InfoTip beside "Which meetings are nearest a purchase, and whose"; its summary stays the
   screen-reader line. Its count stays in view as one quiet line under the title — "80 of 150
   meetings drawn · not drawn: 11 Purchase, 40 Presentation only, 19 with no outcome recorded", every
   figure the read model's — because InfoTip may hide a definition, never a denominator. With no
   bubble drawn, the lead is the card's only sentence and stays in view — a refusal is never hidden.
4. **Section titles are titles.** Every card's own title and every measured `h2` — on a card or
   between cards — takes the type scale's Section role, 20 on 28 at 600 (`docs/14-design-system.md`
   §5), in the kit's telegray. It was the kit's 16px bold on a card and an 11px uppercase kicker
   between cards. The card rule is shared, so the chart cards of Project, Sales Agents, an agent's
   page, a unit's page, Presentation DNA and IRIS-led sales grow alike; each was rendered at 1440 and
   390 and none overflows that did not before. (The Coaching view's unbroken action ran its reading
   33px past its card at 1440 and the page 112px sideways at 390, before this decision as after; the
   review round lets that action wrap, CSS only.)
5. **One block for presentations over time.** "Those" meetings were the same presentations: one card,
   "Presentations over time, and how they ended", the weekly line ("Week by week") and the monthly
   outcome rows ("Month by month, how they ended") side by side, stacked on a phone. Both notes stand
   behind its one `i`; "too few whole weeks" and "no meeting" stay where the drawing would be. Each
   column is its own container, so the trend still picks its geometry by its own width. The weekly
   line is drawn as tall as the month rows beside it — 150 for one month, about 80 more for each
   further month, capped at three — so side by side the two columns end within 10px of each other at
   1210, 1280 and 1440; a year to date still leaves its later months below the line. Stacked, the
   same drawing is taller than before (242px on a 390 phone, 158 before). The page's reading note
   names the block by its new title.
6. **A flag carries a calm mark.** A flag is a sentence after a small filled circle with "!": the loss
   colour for a concern (more than 35% of the recorded meetings ended "not interested"), the watch
   colour for a watch (progression under three quarters of the team's, or too few outcomes recorded)
   — both severities are raised only where a pattern is worth a conversation, so both are marked. The
   colours are muted 20% towards the ground; the "!" is hidden from assistive technology, since the
   sentence already says what is wrong. It replaces the 2px coloured rule on the left, the callout the
   doctrine names. The same CSS reaches the Sales Agents roster's flags.
7. **An action sits on its cell's floor.** A change cell is a column with its last action pushed to
   the bottom, so "How they present" lines up across the agents strip and "Look at it" across "What
   changed", whatever stands above them. The Sales Agents roster's "Agent detail →" is a different
   markup (a ring card with a link line under its action) and is left as it is; its "How they present"
   is a tab in the Coaching view, not a panel button.
8. **Provenance is said in words.** `SourceChips` prints one quiet line: "Source: recorded in the
   showroom by the IRIS app · calculated by Observer from showroom recordings · deal stages from your
   CRM" (WEBIRIS: "website visits from WEBIRIS"; a model: "worded by an AI model", in the watch
   colour). 12px, Manrope, ink-3 with the "Source:" lead in ink-2. Each source keeps its `data-src`
   and the read model's order. It lives in `apps/web/src/showroom/sources.tsx`, so the measurement
   panel (`Measure`) and the observer answer panel print the same words, and Ask's answer sheet prints
   the same line in the answer's language (Slovak and Hungarian drafts for review). The contract's
   `INSIGHT_SOURCE_LABELS` is frozen and keeps its short names. Plain words make a wrong source a
   false sentence, so a block names only what its figures read: "How each agent's meetings end" names
   the showroom alone, connected CRM or not, as the Sales Agents roster already did.

## What stays out

- **`Sources` in `components/product/Provenance.tsx`** — the `ox-` chip list on the agent detail,
  unit, features, showroom, report and meeting surfaces, and the printed report's source column — still
  says "IRIS observed", so one source has two names on two kinds of screen until it follows, and a
  meeting opened from the lens shows the chips the owner could not read. **It is the next step, before
  the demo is recorded**: `Sources` printing the same line (its `data-source` tokens kept for the
  AI and CRM treatments), with the printed report's column decided on its own. The audience page's
  "IRIS observed · Recorded today" basis is the same words by another path. _(Closed by the second
  round, below.)_
- **The not-interested section's source line** still names the CRM ("deal stages from your CRM")
  over a group read from in-room outcomes and showroom use. The section is stream DRILL's (ADR-0053);
  the same correction is theirs to make.
- **The outcome rows' and the funnel's props**, the not-interested section and "Presentations given"
  belong to the other two streams. The monthly rows' `aria-label` still reads "What those meetings
  became, month by month"; it is a prop of their call site. _(Renamed in the second round, below.)_
- **No new popover kind**: both new explanations are the existing InfoTip.

## Consequences

- Sales Flow's section titles, the ring and the source line changed size; the e2e that quotes the
  page's reading note was updated, no other e2e or unit test asserted the old words.
- Every finished surface still needs a real screenshot somebody looked at (non-negotiable 11). This
  was looked at as a static render on the product stylesheets in headless Chrome at 1440, 1280, 1210,
  1024, 390 and 360 — not on a running page.

## Review round, 2026-10-22

Two adversarial reviewers read the branch: eight findings, two pairs of them the same. Fixed: the agents
block's false CRM source (§8, with a markup test); the lens's hidden denominator (§3, with a markup
test); the black field under the weekly line in the joined block (§5); the source line breaking into
a stacked list inside a KPI's measurement panel, where the panel's `> span` grid outranked it (one
two-class rule); the Coaching reading overflowing its card at 1440, which this ADR had understated
(§4, CSS only). Left, and recorded above: `Sources` in `Provenance.tsx` still printing the chips,
and the not-interested section's CRM source, which is stream DRILL's. Each fix was looked at as a
static render at 1440 and 390 (and 1210, 1280, 1024 for the block).

## The owner's word on the lens, 2026-10-22

On the running demo the review round's count line ("80 of 150 meetings drawn · not drawn: …") stood
under the lens's title — the very sentence the owner had asked to put behind the `i`. A decision the
owner has just made outranks InfoTip's denominator rule (the skill's source hierarchy), so the line is
gone: the lead and the note, counts and all, are the `i`; the lens still says what it holds in view
("35 of 35 in view"), and with nothing drawn the lead stays the card's one sentence.
`apps/web/test/flow-claims.test.ts` holds it.

## Second round, 2026-10-22: one source line everywhere

A meeting opened from Sales Flow still showed the chips the owner could not read. Now every surface
says its sources the way §8 does, in one vocabulary:

1. **The words live with the report's.** `SOURCE_LINE_WORDS` (EN, SK, HU) is in
   `components/report/words.ts`, so the printed report says its sources in its own language and
   `e2e/frame-language.spec.ts` reads them as a word table. `SourceChips` reads them from there;
   `INSIGHT_SOURCE_LABELS` stays frozen and no screen indexes it (a unit test holds that).
2. **`Sources` is the line.** Meeting replay and outcomes, agent detail, units and unit detail,
   features, showroom, findings, attention states and the report on screen and on paper print
   "Source: recorded in the showroom by the IRIS app · …". The CSV's source column uses the same
   words (no lead: the column is headed "Sources"). The audience page says its source once, above
   the list; a row adds only an availability that is not "Recorded today" (see the review below).
3. **The chips' styling goes with them.** The `ox-prov`/`ox-src` rules and the stylesheet-only
   `data-source` tokens are removed: no markup or test read the tokens, and the line keeps
   `data-src`. A model's wording keeps its colour through `.iris-src[data-src="AI_INTERPRETATION"]`,
   which the design test now reads; a CRM source is no longer tinted, since the words say it.
4. **A journey says a shared source once.** When every step of a `Timeline` has the same sources,
   the line stands once under the list, not on each of fifteen steps (`docs/12` §9). Steps from two
   feeds keep a line each.
5. **The month rows' accessible name** is "Month by month, how they ended", as the sub-label reads.
6. **Week labels never touch.** `TrendLine`'s phone drawing ended the last label at its point, so a
   label two weeks earlier touched it at 390 ("3 Aug17 Aug"). The ticks keep their stride and are
   thinned from the latest week back by an estimated drawn width (8 units a character); the XL and
   middle drawings lose nothing.

Looked at as static renders (the pages through `react-dom/server`, the product stylesheets, headless
Chromium) at 1440 and 390: a Shark meeting, Lena Fischer's page, Sales Flow, the Slovak and
Hungarian report on screen and in print, Northgate's audience and features. No new sideways scroll.

## Review of the second round, 2026-10-22

Six findings, each confirmed in the code and fixed:

- **The audience rows repeated the line above them.** Every row printed "Source: recorded in the
  showroom by the IRIS app · Recorded today": N+1 copies, three lines a row at 1440, read inside
  every row link's name, and "Recorded today" beside "2 Jul" read as the meeting's day. The line
  stands once; a row prints its availability only when a place it names is not recorded whole.
- **Three CRM names where no CRM is read.** A unit's offer stage ("No source in this product records
  an offer") now names no source, as the catalogue's stages do; the Briefing and the report's
  outcomes section name the CRM only on a project with one connected, as the attention states do.
  `packages/synthetic/test/crm-named-only-when-read.test.ts` holds the three.
- **Hungarian said the room two ways.** The line's "bemutatóterem" is "showroom", as every other
  Hungarian sentence of the report (the approved P2-17 texts among them) says it.
- **Coverage pointed at a map nothing prints.** `showroom.source_visible` names
  `SOURCE_LINE_WORDS` and `SourceChips` beside `InsightSource`, not `INSIGHT_SOURCE_LABELS`.

Northgate's audience was looked at again as a static render at 1440 and 390: one line above the
list, rows one line high at 1440.

## The owner's decision, 2026-10-23: no source line, and findings short and large

Before screen-recording the Shark Residence demo the owner decided two things, and the first one
overrides this ADR's §8, its second round, ADR-0058 §4 ("its source line stays in view") and the
"with its source line in sight" of ADR-0059 and ADR-0063.

1. **The source line is off every screen.** "Source: recorded in the showroom by the IRIS app ·
   calculated by Observer from showroom recordings" stood under the charts, findings and panels of
   Sales Flow, Project, Sales Agents, an agent's page, the report (on screen and on paper), units,
   meetings, attention, the Briefing, Features, the audience, the measurement panels and both Ask
   answer surfaces. It is removed at its source of truth, not screen by screen: `SourceChips`
   (`showroom/sources.tsx`) and `Sources` (`components/product/Provenance.tsx`) are deleted with
   every call site, the `children` slots that only carried the line, the finding's and the report
   section's source `i`, and the `.iris-srcs`/`.iris-src`/`.ox-finding-sources`/`.ox-report-sources`
   rules. `apps/web/test/source-line.test.ts` now fails if a component, a class or a rule that draws
   the line comes back. The MADSPACE administration and diagnostics tables keep their "Source"
   column: that is a datum, not this line.

   **What still carries provenance.** Every read model keeps `sources: InsightSource[]`, so the
   contract (ADR-0023), its guards and Ask's refusal of CRM-only or interpretation-only evidence are
   unchanged. The report's CSV keeps its source column, in the report's language
   (`INSIGHT_SOURCE_WORDS`, which was `SOURCE_LINE_WORDS` without the "Source" lead nothing prints
   now). The tier chip, the evidence links ("12 records · Observed") and the sample stay wherever
   they stood, except on the findings below. The observer answer panel keeps its evidence references
   and its tools · provider · model line, so which part a model wrote is still said. Coverage
   (`showroom.source_visible`) names `InsightSource`, `INSIGHT_SOURCE_WORDS` and this ADR.

2. **A finding on Sales Flow is one short sentence, large.** The last screen printed, per finding, a
   statement, an "against" line, a two-sentence "so what" and a citation ("22 records · statistical
   association · n = 22 meetings"), and two findings filled it. Now:
   - The read model's words are short (`packages/synthetic/src/showroom/views3.ts`, EN, SK, HU): the
     flag is its count and denominator and nothing after them ("Oliver Grant: 8 of 22 recorded
     meetings ended not interested."), "so what" is ten words at most ("Rates that use an outcome
     leave these out."). Every surface that reads them gets the short text: the report and its CSV,
     Ask's tools (`lib/ai/tools.ts`), and the flag on Sales Flow's and Sales Agents' outcome rows.
   - The shared `Finding` (`showroom/parts.tsx`) prints the statement and one line: what it is
     compared with when there is a comparison ("against 36% for the team"), otherwise why it
     matters; a caveat still stands. The statement is a step larger everywhere (18px) and on Sales
     Flow's last screen 22–32px at 600.
   - On Sales Flow and Sales Agents (`measured`) the citation line is gone: the count is in the
     sentence. `apps/web/test/flow-findings.test.ts` holds every finding those two routes draw, in
     five projects and four periods, to its own sample size in the words on screen, and Sales Flow's
     to fourteen words a sentence and ten a line. Project and Presentation keep their citation,
     because their statements do not carry their sample.
   - "How to read this" is two short notes: a flag is a prompt, not a ranking; which screens read
     their own window, the CRM as it stands, or the period. The note that meetings with no outcome
     leave every rate is the unrecorded finding's own line now.

Not looked at: no server or browser was run for this change (memory was tight while a demo ran on
:3400), so the screens have not been screenshotted, and the e2e specs that read the changed text were
updated without being run.
