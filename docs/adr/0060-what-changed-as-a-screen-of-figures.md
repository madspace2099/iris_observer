# ADR-0060 — What changed, as a screen of figures

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, while recording the Shark Residence demo
**Extends:** ADR-0052 (Sales Flow reads at a glance: the type scale, the InfoTip), ADR-0041 (every
product chart in the Hyper kit's hand), ADR-0012 (components never compute)
**Runs beside:** ADR-0059 (stream SCREENS: Sales Flow one screen per chart, the panel merges, every
block's wrapper). This decision is stream KPIS: the inside of the "What changed since …" block.

## Context

On 2026-10-22 the owner went through `/shark/shark-residence/flow` as Clara Weiss and wrote, among
the comments ADR-0059 answers:

> _"A 'What changed since the same 54 days of the previous quarter' 3db KPI kártya nagyon elvan
> veszve. Ezt jó lenne szintén három fontos KPI adatként megmutatni egy full-screenen. Ide lehetne
> még hozzáadni több KPI számot amelyet szintén mérünk az Unreal Engine-ben és kapjuk ezeket az
> adatokat: További KPI-k: Median Clicks per Meeting, Median presentation time per Meeting, Top
> Feature (pl. Residences), Median Screenshots taken per Meeting, Median Favorites added per
> Meetings (mindegyik mellé lehetne egy növekvő/csökkenő tendencia az utolsó időszakhoz képest
> viszonyítva pl: a ma számított átlag magasabb mint a 7 naptár nappal ezelőtt számított átlag
> akkor ott növekvő tendencia van tehát zöld nyíl mehet felfelé mutatva."_
>
> The three KPI cards of "What changed since …" are very lost. Show them as three important KPI
> figures on a full screen. More KPI numbers we also measure in Unreal Engine could be added: median
> clicks per meeting, median presentation time per meeting, top feature (e.g. Residences), median
> screenshots taken per meeting, median favourites added per meeting — each with a rising or
> falling trend against the last period: if the average computed today is higher than the one
> computed 7 calendar days ago, the trend is rising, so a green arrow pointing up.

And over the whole page: _"Minden diagram panel legyen SIMPLYFIED! Tehát gyorsan 5 másodpercen
belül meg kell érteni mi van a diagramon rajta!"_ — every panel simplified, understood within five
seconds.

The block held three cards — Compare mode, Surroundings early, Presentation depth — each a delta
against the previous period's equivalent days, a detail line and a "Look at it" pill, read from
`ShowroomOverview.changes`.

The owner's decision outranks every other rule (the skill's source hierarchy). The honesty rules
still hold: no figure without its denominator, no verdict or trend without its sample size and
floor, absent never shown as nought, association never cause, never a measure the event contract
does not carry.

## Decision

1. **Eight figures, the three first.** One read model (`ChangeKpisView`,
   `packages/readmodels/src/change-kpis.ts`), built by `buildChangeKpis`
   (`packages/synthetic/src/showroom/change-kpis.ts`) and carried on `ShowroomOverview.kpis`, so the
   page reads it through the `summary` it already fetched. In order:

   | Figure                   | What it is                                                       | Sample in view                            |
   | ------------------------ | ---------------------------------------------------------------- | ----------------------------------------- |
   | Compare mode used        | meetings that opened Compare, over the window's meetings         | "72 of 150 meetings"                      |
   | Surroundings, early      | meetings that opened Surroundings in their opening third         | "61 of 150 meetings"                      |
   | Presentation depth       | median section openings per meeting, a return counted again      | "median of 150 meetings"                  |
   | Interactions per meeting | median recorded openings and actions per meeting (below)         | "median of 150 meetings"                  |
   | Presentation length      | median Start-to-End Presentation length, timed meetings only     | "median of 150 meetings"                  |
   | Top feature              | the section with the most timed presentation time, and its share | "39% of presentation time · 150 meetings" |
   | Screenshots per meeting  | median screenshots a meeting took                                | "median of 150 meetings"                  |
   | Favourites per meeting   | median flats a meeting favourited                                | "median of 150 meetings"                  |

   Medians, never means: a meeting of a hundred openings among nineteen of two reads 2, not 6.9. The
   presentation length leaves out the meetings the source could not time, as Typical length does,
   and says how many it read when that is fewer than all.

2. **Clicks are not measured, so there is no click count.** `docs/03-event-map.md` §7 deleted the
   client's `GlobalClickMap`; the event contract has no click or tap fact. The owner's "median clicks
   per meeting" is answered by the closest figure the showroom does record, under its own name:
   **Interactions per meeting** — sections opened (a return to one left out, see 7), flats opened,
   floor plans opened, floor cuts shown, balcony views, flats favourited and screenshots taken. Its
   `i` says so, and so does the registry (`flow.interactions_per_meeting`, exclusion "clicks and
   taps, which the showroom does not record").

3. **The arrow is the owner's rule.** Today's figure is the period's own slice (`sliceSpan`, the
   window every surface reads, through the end of today when the period is running). The figure it
   is set against is **the same period as it was computed seven calendar days earlier** — the same
   wall-clock reading seven days back in the project's time zone (so a clock change does not move
   it), the period preset resolved on that day (`periodsAt`) and sliced as it was then
   (`changeWindows`). Quarter to date on 24 August is set against 1 July – 17 August; the last 28
   days against the 28 days to 17 August; in a quarter's first week, quarter to date against the
   previous quarter to that day. A **completed quarter** was, seven days ago, most often the same
   quarter: its figures read then as they do now, so nothing has moved and no figure carries an
   arrow — said once, "No arrows: 1 Apr – 30 Jun had already ended 7 days ago, so its figures read
   then as they do now." A quarter completed within the week is set against the one before it.
   Under the figures one line states the dates (a closed window's last day is its own, not the
   exclusive midnight) and the meetings of that window, and the threshold. The block's title and
   its `i` are the read model's words too — "What changed since 7 days ago" — so they name the
   comparison the arrows make.

4. **About the same, inside a small threshold.** A share that moved under two points, or a median
   under 5% of where it stood, reads "about the same as 48%, 7 days ago" with no arrow — never
   "unchanged", since the two figures can differ inside the threshold. A median of whole counts
   (depth, interactions, screenshots, favourites) has also to move by **a whole count**: half a
   count is an even sample's middle pair changing places, and on a median of 1 or 2 every step is
   25% or more. A median that was nought moves by a whole count. When the earlier figure rests on
   fewer meetings than its window (the timed ones), its sample is said with it: "about the same as
   13m 05s over 107 timed meetings, 7 days ago".

5. **No arrow below the floor.** An arrow needs `AGENT_MIN_SAMPLE` (20) meetings that can answer the
   figure in **both** windows, the floor Presentation DNA keeps on its cohorts (docs/10-policies.md
   §6). A window short of it takes every arrow away and says so once — "No arrows below 20 meetings
   a window: 19 meetings 7 days ago, 1 short of 20." — and when it is this window, the same sentence
   says its figures are raw, once, rather than under each of eight figures. A figure whose own part
   of the window is short (the timed meetings behind its length) is marked raw in secondary ink,
   "raw figure, N short of 20", and its arrow says how many of the 20 it had. A figure no meeting
   could answer is absent ("—", "none of 25 meetings timed"), never raw.

6. **No attribution-policy guard on these figures.** The old cards took their arrows away under
   `context.attribution.comparisonRefusal` (docs/10-policies.md §1). That refusal is about
   attribution — only its window and its qualifying link change what is counted, and what they
   count is deals credited to meetings — and it was computed for the period against its baseline,
   not for the two windows the arrows use. None of the eight figures counts an attributed deal; each
   is a showroom observation. So the guard does not apply and is not kept: a guard read for the
   wrong pair of windows would refuse arrows it does not govern, or pass ones it should refuse.

7. **Green up, red down — where more is plainly better.** Per figure, and why:

   | Figure                   | Arrow colour      | Why                                                                     |
   | ------------------------ | ----------------- | ----------------------------------------------------------------------- |
   | Compare mode used        | good up, bad down | a comparison is the buyer weighing flats — engagement, the owner's case |
   | Interactions per meeting | good up, bad down | the owner's example; returns to a section left out, as depth's reason   |
   | Screenshots per meeting  | good up, bad down | a capture is a view the buyer wanted to take away                       |
   | Favourites per meeting   | good up, bad down | a favourite is a flat the buyer singled out                             |
   | Surroundings, early      | neutral           | an order of telling; neither earlier nor later is a better presentation |
   | Presentation depth       | neutral           | a return counts again, so more openings can be going back over ground   |
   | Presentation length      | neutral           | longer is not better, as on Typical length                              |
   | Top feature              | none              | a name does not rise or fall; it says whether it was the top 7 days ago |

   The arrow carries the colour; its words stay in the label's ink. This reverses, for this screen,
   the rule the old cards kept ("direction is a colour, but never a verdict"): the owner asked for a
   verdict colour where engagement moved. An arrow is a movement at the stated sample, never a
   cause.

8. **The top feature, and its tie.** Each section's timed seconds summed over the window's fully
   timed meetings; the most wins, with its share of all of them. A tie goes to the section more of
   those meetings opened, then to the inventory's order (`SHOWROOM_SECTIONS`). A top is a rank, so
   under the floor it is not named: the figure reads "Not ranked" in secondary ink, "5 short of the
   20 a rank needs", and its share — the rank's own figure — is withheld with the name. "—" stays
   the sign for absent (nothing timed at all).

9. **Declared in the registry.** `CHANGE_FIGURES` in `packages/metrics/src/registry/flow.ts`, each
   with its numerator, denominator, exclusions, required facts, `minimumSampleSize:
AGENT_MIN_SAMPLE` and a new comparison method, `seven_days_earlier`. The screen's labels and the
   definitions behind its `i` are the registry's words. `docs/measurement-matrix.*` regenerated.

10. **The screen** (`apps/web/src/components/flow/ChangeKpis.tsx`, `change-kpis.css`), mounted in
    place of the `summary.changes` list and its refusal, and nowhere else on the page. One plane cut
    by hairlines, never a row of boxes: the three that stood here first across the top, the figure
    in the kit's mono and as large as the width allows (44 to 72); the five beneath at the type
    scale's Figure size, 44. A section's name is set in Manrope at 32 so it wraps between words; a
    bare number's unit ("steps") sits beside it, smaller. Each figure is four rows of a subgrid —
    name, figure, arrow, sample — so a wrapped name moves its whole row alike. The layout reads the
    block's width (a container query), not the window's: three over five, three-three-two on a
    middle width, and one row per figure on a phone, name left and figure right. The name opens
    where the figure can be looked at, with the period carried — Presentation DNA for Compare and
    Surroundings, Storytelling for depth and the top feature, the meetings register for length and
    favourites (its "Length" and "Shortlisted" columns are those counts, a meeting a row) — and
    opens nothing for interactions and screenshots, which no surface shows as a count; its
    definition is behind the `i`. The entry cascades the figures 70ms
    apart inside `DrawIn`'s play and moves each arrow in the direction it points; reduced motion and
    no script see the last frame at once.

11. **Ask IRIS reads the same figures.** `detect_showroom_behavior_changes` read `summary.changes`;
    it now reads `ShowroomOverview.kpis` — every figure, its sample and its arrow's words — and its
    draft states no figure a model is not shown. Its byline reads "Change against 7 days ago". It
    names the top feature only where the screen does, and lists the figures that stayed about the
    same with semicolons, as a label can hold a comma ("Surroundings, early").

## What stays out

- **The block's wrapper is SCREENS'** (ADR-0059). This stream changes two lines inside its header —
  the title and the `i` now read `summary.kpis.title` and `summary.kpis.about` — and nothing else
  outside the block's inside; `git merge-tree` against `flow-screens-r6` merges them cleanly (the
  one conflict is the import line both streams add to `page.tsx`).
- **`ShowroomOverview.changes`** keeps its three previous-period deltas; nothing on screen reads
  them now (`apps/web/test/showroom.test.ts` still does). Removing them is a separate decision.
- **No count-up of the figures.** The design system's "figures count to their new value" needs
  script on every figure; the cascade and the arrows carry the motion here.

## Consequences

- `packages/synthetic/test/change-kpis.test.ts` (30), hand-computed: the windows across Bratislava's
  clock change, quarter to date in a quarter's middle and first week, a completed quarter that was
  the same seven days ago and one completed this week (and its last day), medians a mean would
  contradict and an even count's middle pair, what an interaction counts (a return left out), the
  threshold met and missed by one (shares at 1.9 and 2 points, medians, whole counts), nought, the
  tones, the floor in each window and for one figure alone, the shortfall said once, a figure no
  meeting could answer, the earlier subset's sample, the top feature's share, both tie rules, "was
  the top" and "the top too", "Not ranked", an empty period, the registry's order, and Shark's
  windows through the repository. `apps/web/test/ask.test.ts` holds that the tool's facts are the screen's
  figures and that every digit of its draft is among them.
- **Not looked at on a running page** (no dev server, build or Playwright e2e in this stream). Static
  renders — `ChangeKpis` through `react-dom/server` with the product stylesheets, headless Chromium,
  on the block's plane and inside a chart card — of Shark and Kingsford quarter to date, the refused
  and the short states, and the longest figures the read model writes ("58m 59s", "Surroundings"),
  at 1440, 1280, 1200, 1100, 1024, 768, 600, 390 and 360: no sideways scroll, no text running past
  its line or its cell, no text under 12px but the `i` glyph itself. A mid-entry frame shows the
  cascade and the arrows in flight.

## Review round (2026-10-22)

Adversarial reviewers read the branch; each finding was checked in the code first.

**Fixed.**

- _The title and its `i` stated the previous quarter and "not a trend" above 7-day arrows_ (raised
  twice): the read model now supplies both (decision 3, "What stays out").
- _A completed period drew arrows against a shifted window nobody computed, and quarter to date and
  year to date were set against windows that crossed into the previous quarter or year_ (raised
  twice): the earlier window is the period as it was computed seven days ago (decision 3).
- _Below the floor the top feature hid its name but printed its share, beside "—" and "raw figure"_
  (raised twice): "Not ranked", the share withheld, the shortfall as a rank's (decision 8).
- _The policy refusal was read for the period and its baseline, not for the arrows' windows_: the
  guard does not govern these figures and is gone (decision 6).
- _An arrow on a timed subset did not state the earlier window's sample_: it does (decision 4).
- _Interactions counted returns and were coloured, while depth is neutral because of returns_:
  returns are left out of interactions (decisions 2 and 7).
- _A closed window's basis named its exclusive midnight as its last day_: it names the day before.
- _A figure with no answering meeting read "raw figure" and "median of 0 of N"_: "—", "none of N
  meetings timed", no shortfall (decision 5).
- _Favourites opened Units; screenshots and interactions opened a register that does not show
  them_: favourites open the meetings register, the other two open nothing (decision 10).
- _The threshold tests could not tell a 2-point step from 1.1, and the same top in both windows was
  untested_: a 1.9-point case and a "the top too" case.
- _Half-count wobbles on small medians drew verdict colours_: a whole count is the least move
  (decision 4); 1 → 1.5 and 19.5 → 20 read about the same.
- _"Unchanged" beside two different figures, and two numbers run together when spoken_: "about the
  same as 61%, 7 days ago" (decision 4).
- _A short window stated its shortfall nine times_: once (decision 5).
- _Ask's list of steady figures split "Surroundings, early" in two_: semicolons (decision 11).

**Not taken.**

- _The registry should declare a drill target per figure_ (in part): `drillTo` names the kind of
  record a figure opens onto — meetings, contacts, units, deals — not a route, and Presentation DNA
  and Storytelling are views over meetings, so "meetings" is true of all eight; the one figure that
  opened onto another kind (favourites, onto Units) now opens the meetings register.
- _19 against 20 should read unchanged_: under the rule proposed with it — a whole count, and 5% —
  one count at 20 is exactly 5% and is a move; any threshold has a line. With returns left out,
  Shark's interactions read 18 against 18 this quarter, about the same. A median of small counts
  still moves in whole steps (ISTER TOWER year to date, screenshots 1 from 0): that is the median
  the owner asked for, at its stated sample.
