# ADR-0059 — Sales Flow, one screen at a time

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, while recording the Shark Residence demo
**Extends:** ADR-0048 (the verdict is said by IRIS), ADR-0052 (Sales Flow reads at a glance),
ADR-0041 (every product chart in the Hyper kit's hand)
**Runs beside:** ADR-0060 (stream KPIS: the "What changed" screen's figures), which answers the
third paragraph of the same comment on the same page.

## Context

On 2026-10-22 the owner, recording the demo on `/shark/shark-residence/flow` as Clara Weiss, wrote:

> _"Amikor a Sales Flow oldalon vagyunk akkor "scrollozással" tudjam az egyes diagramokat
> váltogatni. Pl. a "Meetings are holding up and progressing well: 66 meetings this month against 65
> last month, first 24 days, and 54% of recorded meetings progressed, against 53% before." az
> töltsön ki egy egész oldalt a képernyőn. és ne lássam alatta már a következő diagramokat. Így a
> diagramok mérete és layout-ja minimálisan de változni fog szinte mindenhol. A képernyőt a
> diagramok vizuális/motion effektje uralja és az legyen a hangsúlyban. Minden diagram panel legyen
> SIMPLYFIED! Tehát gyorsan 5 másodpercen belül meg kell érteni mi van a diagramon rajta!"_
>
> On the Sales Flow page I want to switch between the charts by scrolling. The verdict should fill
> a whole screen, and I should not see the next charts under it. So the charts' size and layout will
> change a little almost everywhere. The screen is dominated by the charts' visual and motion
> effect, and that should be the emphasis. Every chart panel simplified: what is on a chart must be
> understood within five seconds.
>
> _"Aztán a Meetings, and how many progressed + Every outcome szintén legyen egy panelba rakva
> tehát egyszerre jelennének meg ugyanazon a full-screenen."_ — those two go into one panel, on the
> same full screen.
>
> _"A Longest presentations this period + Presentations given panelek legyenek egy panelben
> benne."_ — those two panels in one panel.

His third paragraph — the three "What changed" figures are lost; show them as important KPI figures
on a full screen, with more figures measured in Unreal Engine — is ADR-0060's. This decision gives
that screen its frame and leaves its inside to that stream.

A decision the owner has just made outranks every other rule (the skill's source hierarchy). The
honesty rules still hold: no figure without its denominator (a denominator or a definition may stand
behind the `i`), no verdict without its sample size, absent never shown as zero, association never
cause. Refusals and sample shortfalls stay in view.

## Decision

1. **Every block is a screen.** `flow/page.tsx` draws its blocks, in the page's order, as
   `.flow-screen`s: the verdict; the summary figures; the deal ladder; stalled deals; IRIS-assisted
   sales; the meetings with every outcome; what changed; the day hour by hour; when meetings happen;
   the bubble lens; presentations over time; how each agent's meetings end; the not-interested
   group; the longest presentations with who gave them; the findings and "How to read this". A
   screen is at least as tall as the viewport under the sticky chrome — `100svh` less the 70px
   header and the 59px context band above 1199px, less the 58px bar below — so the next screen
   starts below the fold. The rules between blocks are gone: a screen's edge parts it from the next.
   Picking a summary window keeps the reader on the summary's screen (`scroll={false}` on its
   chips): Next otherwise scrolls to a page's top when that top is out of view.
2. **The page's scroller snaps.** `html:has(.iris-salesflow)` sets `scroll-padding-top` to the
   chrome's height and `scroll-snap-type: y proximity`; from 64rem wide and 40rem tall, where the
   screens are drawn to fit, `mandatory`, so a turn of the wheel is a screen. A screen taller than the
   viewport is read through to its end: measured in headless Chromium on the static render, small
   steps inside the agents screen (855px at 1440×900, 1008px at 1280×720, 1641px at 390) moved
   through the whole of it, and Page Down and the arrow keys went screen to screen. Proximity, not
   mandatory, where nearly every screen outgrows the viewport (a phone, a short window). The Ask
   composer after the last screen is a place the scroller may rest (`scroll-snap-align: end`). The
   page sets no smooth scrolling anywhere, so nothing is smoothed under reduced motion.
3. **The verdict is the first screen, alone.** The spoken verdict (ADR-0048), unchanged in words and
   in its typing, at up to 56px in a 30ch measure with the mark at 72px, in the middle of its screen.
4. **Two pairs share a screen.** "Meetings, and how many progressed" and "Every outcome" are one
   card; so are "Longest presentations this period" and "Presentations given". Each half keeps its
   own title, so every heading, link and test that names one still finds it; side by side above
   75rem, stacked below.
5. **The drawing takes the screen.** Each drawing is sized against `--flow-h`, the screen's height,
   less what the screen also holds, and never past its card's width; a drawing with a viewBox
   scales its type with it, never under the 12px floor. The summary's figures at 36–56px with their
   strips the screen's height, a sparkline under its words where the cell is narrow; the ladder's
   rungs spread down the screen with 28px bars; the steps the screen's height beside a ring of up
   to 416px with its key in two columns under it; the clock face up to the screen's height less
   9rem; the heatmap's seven rows the screen's height between them; the weekly line drawn 460 units
   tall on a wide screen (`TrendLine`'s new `wideHeight`; a phone's drawing 260), capped at the
   screen; a ranked list's five rows spread down its screen with a 12px bar, its names at 16px with
   a third more width in a wide card, so a sale's name stays one line.
6. **Five seconds: one line, the rest behind the `i`.** A screen says its title, draws its chart,
   and keeps the figure it stands on and its source. What moved behind an `i`: the clock face's
   count sentence, time zone, the grid reconciliation and "a count of when meetings start, not a
   judgement of which hour sells" (its busiest hour stays, "Busiest: 09:00–10:00, 24 of 150."); the
   heatmap's "an empty square is drawn empty…" (its denominator caption and busiest slot stay);
   "How many, not how well. Volume is a workload figure." beside Presentations given. Nothing else
   was removed: the ladder's note, the stalled list's "12 of 114 open deals", the assisted sales'
   unplaced note, every refusal and every shortfall stand where they stood.
7. **Motion plays when its screen arrives.** The charts already draw in through `DrawIn` (an
   `IntersectionObserver`, once, nothing under reduced motion); on a screen of its own each plays as
   its screen comes into view. The ladder, the one drawing without an entrance, sweeps in.
8. **A quiet rail says where you are.** `FlowRail`: one dot per screen in a column beside the
   screens, sticky in the middle of the viewport, each a link to its screen, the current one in IRIS
   blue (`aria-current="location"`, set by an observer on the viewport's middle line). Its name shows
   beside the dot on hover or keyboard focus; its accessible name is the link's `aria-label`, so the
   page's text and headings are unchanged. In the DOM before the screens, so Tab reaches it after the
   context band and before the summary; a 2px blue focus ring. Not drawn on a phone, where each
   screen's title says where you are.
9. **Without a CRM the ladder's sentence closes the summary screen** instead of holding a screen of
   its own, so no screen is one sentence on a black field. With a CRM the ladder, stalled deals and
   IRIS-assisted sales are screens as before.
10. **The "What changed" screen is a frame.** Its wrapper became the screen; its header, its `i`, its
    inner content and its source line are byte-for-byte as they were, so ADR-0060's replacement of
    the inside cherry-picks onto this. The screen is a flex column, so that content may take the
    height between the header and the source line.

## What stays out

- **The ladder's secondary figures** ("100% on its own", "−74 after Meeting") stay: they are the
  component's on every page that draws a ladder, and the bars already carry the share. A screen-only
  quiet mode would be a second ladder.
- **The lens's span.** It opens on the month, as ported; seven days makes its bubbles the screen's
  size, and is one press away.
- **A 1280×720 window**: the summary, the ladder, IRIS-assisted sales, the lens, the agents and the
  not-interested group are taller than its 591px screen (645 to 1,008px) and are read through; at
  1440×900 only the agents screen is (855px against 771).
- **The inside of the not-interested screen** is stream DRILL's (ADR-0053), unchanged.

## Consequences

- `apps/web/test/flow-screens.test.ts`: every screen on the rail is drawn and every drawn screen is
  on the rail; the verdict stands alone; the two pairs share a screen; the heatmap keeps its
  denominator in view and its method behind the `i`; the stylesheet is scoped to the page, snaps by
  proximity unless the screens fit, and sets no smooth scrolling; the rail links every screen and
  marks the first before script runs. `flow-claims.test.ts` ends a block at the next screen.
- `e2e/flow-screens.spec.ts` (written, not run here): every screen fills the viewport under the
  header at 1440×900; Page Down lands the next screen under the header; a phone's tallest screen is
  read through by the arrow key; the rail names and reaches every screen. No other e2e spec asserted
  the structure that moved: the reading note, every title, every link and every list name are
  unchanged.
- Looked at as static renders (the page in the real shell through `react-dom/server`, the product
  stylesheets, headless Chromium) at 1440×900, 1280×720, 390×844 and 360×780, every screen: no
  sideways scroll at any size, no new text under 12px. **Not looked at on a running page.**
