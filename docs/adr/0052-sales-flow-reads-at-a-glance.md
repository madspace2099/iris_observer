# ADR-0052 — Sales Flow reads at a glance

**Status:** accepted · **Date:** 2026-10-22
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
   screen-reader line. With no bubble drawn, the lead is the card's only sentence and stays in view —
   a refusal is never hidden.
4. **Section titles are titles.** Every card's own title and every measured `h2` — on a card or
   between cards — takes the type scale's Section role, 20 on 28 at 600 (`docs/14-design-system.md`
   §5), in the kit's telegray. It was the kit's 16px bold on a card and an 11px uppercase kicker
   between cards. The card rule is shared, so the chart cards of Project, Sales Agents, an agent's
   page, a unit's page, Presentation DNA and IRIS-led sales grow alike; each was rendered at 1440 and
   390 and none overflows that did not before. (The Coaching view overflows a 390 phone by its own
   nowrap action, 154px before this and 112px after; that is its stream's to fix.)
5. **One block for presentations over time.** "Those" meetings were the same presentations: one card,
   "Presentations over time, and how they ended", the weekly line ("Week by week") and the monthly
   outcome rows ("Month by month, how they ended") side by side, stacked on a phone. Both notes stand
   behind its one `i`; "too few whole weeks" and "no meeting" stay where the drawing would be. Each
   column is its own container, so the trend still picks its geometry by its own width. The page's
   reading note names the block by its new title.
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
   `INSIGHT_SOURCE_LABELS` is frozen and keeps its short names.

## What stays out

- **`Sources` in `components/product/Provenance.tsx`** — the `ox-` chip list on the agent detail,
  unit, features, showroom, report and meeting surfaces, and the printed report's source column — still
  says "IRIS observed". Those surfaces were not in the owner's comments; carrying the words there is
  the next step, and the report's column needs its own decision about length.
- **The outcome rows' and the funnel's props**, the not-interested section and "Presentations given"
  belong to the other two streams. The monthly rows' `aria-label` still reads "What those meetings
  became, month by month"; it is a prop of their call site.
- **No new popover kind**: both new explanations are the existing InfoTip.

## Consequences

- Sales Flow's section titles, the ring and the source line changed size; the e2e that quotes the
  page's reading note was updated, no other e2e or unit test asserted the old words.
- Every finished surface still needs a real screenshot somebody looked at (non-negotiable 11). This
  was looked at as a static render on the product stylesheets in headless Chrome at 1440, 1280, 1210,
  1024, 390 and 360 — not on a running page.
