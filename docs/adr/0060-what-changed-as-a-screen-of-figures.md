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
   **Interactions per meeting** — sections opened (a return counted again), flats opened, floor plans
   opened, floor cuts shown, balcony views, flats favourited and screenshots taken. Its `i` says so,
   and so does the registry (`flow.interactions_per_meeting`, exclusion "clicks and taps, which the
   showroom does not record").

3. **The arrow is the owner's rule.** Today's figure is the period's own slice (`sliceSpan`, the
   window every surface reads, through the end of today when the period is running). The figure it
   is set against is computed over a window of the same length ending **seven calendar days
   earlier** — the same wall-clock reading seven days back in the project's time zone, so a window
   that crosses a clock change still ends at 23:59:59.999 of its day (`changeWindows`). Under the
   figures one line states the dates and the meetings of that window, and the threshold.

4. **No change, inside a small threshold.** A share that moved under two points, or a median under
   5% of where it stood, reads "unchanged from 7 days ago" with no arrow; its earlier figure stays
   in its spoken words and in Ask's facts. A median that was nought moves on any change.

5. **No arrow below the floor.** An arrow needs `AGENT_MIN_SAMPLE` (20) meetings that can answer the
   figure in **both** windows, the floor Presentation DNA keeps on its cohorts (docs/10-policies.md
   §6). A window short of it takes every arrow away and says so once — "No arrows below 20 meetings
   a window: 19 meetings 7 days ago, 1 short of 20." — and a figure whose own sample is short (the
   timed meetings behind its length) says how many of the 20 it had. Below the floor in this window
   the figure is shown raw, in secondary ink, with "raw figure, N short of 20".

6. **The policy-version refusal stays.** Where `context.attribution.comparisonRefusal` is set
   (docs/10-policies.md §1), no figure carries an arrow and the refusal is stated once in its place,
   with its reason; the figures themselves are this period's and still stand.

7. **Green up, red down — where more is plainly better.** Per figure, and why:

   | Figure                   | Arrow colour      | Why                                                                     |
   | ------------------------ | ----------------- | ----------------------------------------------------------------------- |
   | Compare mode used        | good up, bad down | a comparison is the buyer weighing flats — engagement, the owner's case |
   | Interactions per meeting | good up, bad down | the owner's own example: more of the buyer's engagement                 |
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
   under the floor it is not named ("—", with the shortfall).

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
    where the figure can be looked at (Presentation DNA, Storytelling, the meetings register, Units),
    with the period carried; its definition is behind the `i`. The entry cascades the figures 70ms
    apart inside `DrawIn`'s play and moves each arrow in the direction it points; reduced motion and
    no script see the last frame at once.

11. **Ask IRIS reads the same figures.** `detect_showroom_behavior_changes` read `summary.changes`;
    it now reads `ShowroomOverview.kpis` — every figure, its sample and its arrow's words — and its
    draft states no figure a model is not shown. Its byline reads "Change against 7 days ago".

## What stays out

- **The block's title and its `i` are SCREENS'** (ADR-0059). The title still says "What changed
  since {the period's baseline}" and its `i` still speaks of two periods; the figures now compare
  with seven days earlier, which the line under them states. Retitling it ("Against 7 days ago",
  say) belongs to the wrapper's owner and is flagged for the integration.
- **`ShowroomOverview.changes`** keeps its three previous-period deltas; nothing on screen reads
  them now (`apps/web/test/showroom.test.ts` still does). Removing them is a separate decision.
- **No count-up of the figures.** The design system's "figures count to their new value" needs
  script on every figure; the cascade and the arrows carry the motion here.

## Consequences

- `packages/synthetic/test/change-kpis.test.ts` (22), hand-computed: the windows across Bratislava's
  clock change, medians a mean would contradict and an even count's middle pair, what an interaction
  counts, the threshold met and missed by one (shares and medians), nought, the tones, the floor in
  each window and for one figure alone, the top feature's share and both tie rules and its "was the
  top" reading, the policy refusal, an empty period, the registry's order, and Shark's windows
  through the repository. `apps/web/test/ask.test.ts` holds that the tool's facts are the screen's
  figures and that every digit of its draft is among them.
- **Not looked at on a running page** (no dev server, build or Playwright e2e in this stream). Static
  renders — `ChangeKpis` through `react-dom/server` with the product stylesheets, headless Chromium,
  on the block's plane and inside a chart card — of Shark and Kingsford quarter to date, the refused
  and the short states, and the longest figures the read model writes ("58m 59s", "Surroundings"),
  at 1440, 1280, 1200, 1100, 1024, 768, 600, 390 and 360: no sideways scroll, no text running past
  its line or its cell, no text under 12px but the `i` glyph itself. A mid-entry frame shows the
  cascade and the arrows in flight.
