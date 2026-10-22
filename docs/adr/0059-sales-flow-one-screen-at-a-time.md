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
   page sets no smooth scrolling anywhere, and **under reduced motion it does not snap at all**:
   Chrome animates every snap, so the page glided on by itself after each wheel turn (review round
   1). The screens still fill the viewport there, and Page Down and the rail still go from one to
   the next.
3. **The verdict is the first screen, alone.** The spoken verdict (ADR-0048), unchanged in words and
   in its typing, at up to 56px in a 30ch measure with the mark at 72px, in the middle of its screen.
4. **Two pairs share a screen.** "Meetings, and how many progressed" and "Every outcome" are one
   card; so are "Longest presentations this period" and "Presentations given". Each half keeps its
   own title, so every heading, link and test that names one still finds it; side by side above
   75rem, stacked below. The presentations' halves are even, each with its own columns, so both
   lists' bars take room (review round 1).
5. **The drawing takes the screen.** Each drawing is sized against `--flow-h`, the screen's height,
   less what the screen also holds, and never past its card's width; a drawing with a viewBox
   scales its type with it, so it is **never sized under its drawn size by the screen's height**:
   a short window scrolls the screen instead. The summary's figures at 36–56px with their strips
   the screen's height, a sparkline under its words where the cell is narrow, a group nothing
   measures as tall as its sentence; the ladder's rungs share the screen's height with 28px bars
   (six fit 591px, they spread on a taller screen); the steps the screen's height beside a ring of
   up to 416px with its key in two columns under it; the clock face up to the screen's height less
   9rem and never under its drawn 430; the heatmap's seven rows the screen's height between them;
   the weekly line drawn 400 units tall at 720 on a wide card (`TrendLine`'s new `wideHeight`, the
   middle drawing at the same proportions; a phone's drawing 260), at its column's width and never
   capped; the bubble lens on its seven days, bubbles at full size; a ranked list's five rows
   spread down its screen with a 12px bar, its names at 16px, a third wider where a sale is named
   (stalled deals, IRIS-assisted sales) so a sale's name stays one line.
6. **Five seconds: one line, the rest behind the `i`.** A screen says its title, draws its chart,
   and keeps the figure it stands on and its source. What moved behind an `i`: the clock face's
   count sentence, time zone, the grid reconciliation and "a count of when meetings start, not a
   judgement of which hour sells" (its busiest hour stays, "Busiest: 09:00–10:00, 24 of 150."); the
   heatmap's "an empty square is drawn empty…" (its denominator caption and busiest slot stay);
   "How many, not how well. Volume is a workload figure." beside Presentations given. Nothing else
   was removed: the ladder's note, the stalled list's "12 of 114 open deals", the assisted sales'
   unplaced note, every refusal and every shortfall stand where they stood. How each agent's
   meetings end says every count once, and every count is a link (review round 1): the key the
   team's row repeats steps aside and a bar's parts drop the counts the line under them carries,
   as they already did on a phone.
7. **Motion plays when its screen arrives.** The charts already draw in through `DrawIn` (an
   `IntersectionObserver`, once, nothing under reduced motion); on a screen of its own each plays as
   its screen comes into view. The ladder, the one drawing without an entrance, sweeps in.
8. **A quiet rail says where you are.** `FlowRail`: one dot per screen in a column beside the
   screens, sticky in the middle of the room under the chrome and as tall as its dots, each a link
   to its screen, the current one in IRIS blue (`aria-current="location"`, set by an observer on the
   viewport's middle line). Its name shows beside the dot on hover or keyboard focus; its accessible
   name is the link's `aria-label`, so the page's text and headings are unchanged. In the DOM before
   the screens, so Tab reaches it after the context band and before the summary; a 2px blue focus
   ring. A dot brings its screen into view, moves focus into it and replaces the address: a native
   fragment link pushed a history entry the App Router does not handle on Back. The rail is keyed
   as the screens are, on the period and the window, so its observer follows them when they are
   replaced. Drawn from 40rem wide and 33rem tall, where its dots fit under the chrome; not on a
   phone, where each screen's title says where you are.
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
- **A window about 600px tall under the chrome** (1280×720, or 1536×730, a 1920×1080 laptop at
  125%): the summary (645 / 624px), IRIS-assisted sales (642 / 650), the lens (719 / 769), the
  agents (843 / 769) and the not-interested group (647 / 647) are taller than its 591 / 601px
  screen and are read through; the ladder, the weekly line and every other screen fit. At
  1440×900 and 1920×1080 every screen fits.
- **The inside of the not-interested screen** is stream DRILL's (ADR-0053), unchanged.

## Consequences

- `apps/web/test/flow-screens.test.ts`: every screen on the rail is drawn and every drawn screen is
  on the rail; the verdict stands alone; the two pairs share a screen; the heatmap keeps its
  denominator in view and its method behind the `i`; the stylesheet is scoped to the page, snaps by
  proximity unless the screens fit, and sets no smooth scrolling; the rail links every screen and
  marks the first before script runs. `flow-claims.test.ts` ends a block at the next screen. Review
  round 1 added: the rail re-keyed on everything a screen is keyed on; no snap under reduced motion;
  no drawing shrunk under its drawn size by the screen's height; the wide name column only where a
  sale is named; every agent count once; the ladder's height through its wrappers; the rail drawn
  only where it fits, as tall as its dots, and going to a screen without a pushed history entry.
- `e2e/flow-screens.spec.ts` (written, not run here): every screen fills the viewport under the
  header at 1440×900; the page does not snap under reduced motion; with motion asked back, Page Down
  lands the next screen under the header once it comes to rest (polled; a snap glides about 470ms)
  and a phone's tallest screen is read through by the arrow key; the rail names and reaches every
  screen without adding a history entry. No other e2e spec asserted the structure that moved: the
  reading note, every title, every link and every list name are unchanged.
- Looked at as static renders (the page in the real shell through `react-dom/server`, the product
  stylesheets, headless Chromium) at 1440×900, 1280×720, 390×844 and 360×780, every screen: no
  sideways scroll at any size, no new text under 12px. **Not looked at on a running page.**

## Review round 1 (2026-10-23)

Adversarial reviewers read the branch and filed fourteen findings. Each was confirmed in the code
and, where it is a measurement, in the static render, before it was changed. All fourteen were
real; none was rejected. Measured afterwards at 1440×900, 1280×720, 1536×730, 1920×1080, 390×844
and 360×780 (and the rail at 844×390, 915×412 and 1024×768): no sideways scroll, no new text under
12px.

| #   | Finding                                                                              | Confirmed by                                                                                                                                       | Done                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | After a period or window pick the rail marks the wrong screen                        | the observer's effect depends on `ids` only; Next's page `stateKey` drops search params (`layout-router.js:549`), so the rail outlives the screens | the rail is keyed on the period and the window; a unit test holds every screen key to those two                                                                  |
| 2   | The agents screen is not simplified and is taller than 1440×900 (855 against 771)    | measured; every count stood three times (key, bar, line)                                                                                           | every count once and linked, rows closer, cards five to a line: 771 at 1440×900                                                                                  |
| 3   | The bubble lens takes a quarter of its screen                                        | measured: the month's canvas 140px high                                                                                                            | it opens on its seven days, bubbles at full size: the screen's drawing at 1440×900 and 1920×1080                                                                 |
| 4   | Both bars of the presentations pair got smaller                                      | measured: given 46px, longest 375px                                                                                                                | even halves with their own columns: given 220px, longest 265px with every date's line whole; the wide name column only where a sale is named                     |
| 5   | At about 600px six screens overflow; the ladder's flex rules are dead under `DrawIn` | measured; `.ox-funnel`'s parent became `.dld-draw-body`, which also undid "not a second box"                                                       | the height is carried through the wrappers, rungs padded small: six fit 591px and spread at 1080; the weekly line fits; the rest are listed under What stays out |
| 6   | Refusal-only summary groups stretch into empty frames                                | measured on Riverside (no CRM): two ~245px boxes of black                                                                                          | an empty group is as tall as its sentence; a second row of only empty groups takes no free height                                                                |
| 7   | SCREENS and KPIS conflict on the same import line                                    | `git merge-tree` on `ef36b566`                                                                                                                     | the `FlowRail` import moved below the chart imports: `page.tsx` merges clean. `PROJECT-STATE.md` still conflicts — keep both sections                            |
| 8   | At the page's end the rail's first dot sits under the context band                   | the sticky box was a screen tall, so the page's end dragged it up                                                                                  | the rail is as tall as its dots, centred by their count (`--flow-dots`): first dot at 230px at 1280×720, at the top and the end                                  |
| 9   | Under reduced motion snapping still animates the page                                | no reduced-motion guard on `scroll-snap-type`                                                                                                      | no snap under reduced motion; a 300px wheel now stays at 300                                                                                                     |
| 10  | The weekly line's ticks fall to 10.8px at 1280×720                                   | the `max-height` cap letterboxed a viewBox drawing                                                                                                 | the cap is gone; the drawing is 400 units at 720, the middle one at the same proportions, and fits about 600px                                                   |
| 11  | The e2e Page Down test samples before the snap has settled                           | measured: a snap settles after 438–483ms                                                                                                           | the snap tests ask for motion back and poll until the screen comes to rest                                                                                       |
| 12  | The clock face's labels fall under 12px on short windows                             | `min(100%, --flow-h − 9rem)` goes under the drawn 430 below a 574px screen                                                                         | floored at 430px; a short window scrolls the screen                                                                                                              |
| 13  | On a landscape phone the rail overflows its sticky box                               | fifteen dots need 390px; 844×390 leaves 332                                                                                                        | drawn only from 33rem tall; hidden at 844×390 and 915×412                                                                                                        |
| 14  | The rail's fragment links write history the router ignores                           | `app-router.js:285-288` returns on a popped entry with no state                                                                                    | a dot scrolls, moves focus and replaces the address with the router's state carried over; the e2e checks no entry is added                                       |

## On the demo build, 2026-10-23: proximity at every size

Looked at in a browser at 1440 × 900, the mandatory snap (64rem × 40rem and up) held the page at its
first screen: a turn of the wheel and Page Down both snapped back to it. The page now snaps by
proximity at every size: the reader scrolls freely and the page settles on a screen's top when they
stop near one; the screens still fill the viewport, so a screen at rest shows nothing of the next.
Reduced motion still turns snapping off. `apps/web/test/flow-screens.test.ts` holds that no rule asks
for mandatory.

Proximity alone pulled a short turn of the wheel back to the screen it started on (measured with
100px wheel steps on the demo build). So where the screens fit (64rem × 40rem and up) and motion is
allowed, one turn of the wheel is one screen: `FlowRail` takes the turn, moves to the next or the
previous screen, and swallows the rest of that gesture, a touchpad's momentum included, until it
pauses. A screen taller than the view is read through first; before the first screen and past the
last, an element that can still scroll the way the wheel turns, a phone and reduced motion all keep
the page's own scrolling. `wheelTarget` is tested in `apps/web/test/flow-screens.test.ts`.
