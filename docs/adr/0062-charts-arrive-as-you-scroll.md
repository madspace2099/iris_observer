# ADR-0062 — The charts arrive as you scroll, and fewer prefetches

**Status:** accepted · **Date:** 2026-10-23
**Decided by:** the product owner, before recording the IRIS Observer marketing video
**Extends:** ADR-0059 (Sales Flow one screen at a time, §7 "motion plays when its screen arrives"),
ADR-0041 (every product chart in the Hyper kit's hand), `docs/14-design-system.md` §7 (motion)
**Runs beside:** ADR-0061 (stream AGENTS: the Sales Agent pages one screen at a time, and their
prefetch) and ADR-0054's 2026-10-23 section (stream PORTRAITS: a portrait beside every presenter).
This decision is stream MOTION: every other page.

## Context

On 2026-10-23 the owner wrote, about the build he will record a marketing video from:

> _"Feltöltöm az 5 ügynök profilképét, a neveikkel megnevezve - a kép nevében. […] Majd végezd el
> ugyanazt a 1 panel/full screen scrollozásonkénti változtatásokat a "Sales Agent" oldalakra is és
> ugyanúgy optimalizáld ott is az előbetöltő kérések számát. Majd miután elkészült minden csinálj
> egy nagy bug és overlapping ellenőrzést MINDEGYIK oldalra, ahol sok a szöveg SIMPLYFY! Majd
> ellenőrizd a responsiveness-t is mindegyik oldalon! A diagrambetöltéseket motion animációkkal
> egészítsd ki amelyek scrollozásnál játszódnak majd le."_
>
> I am uploading the five agents' portraits. […] Then make the same one-panel, full-screen-per-scroll
> changes on the Sales Agent pages, and optimise the number of prefetch requests there the same
> way. Then, once everything is done, do a big bug and overlapping check on every page; where there
> is a lot of text, simplify. Then check responsiveness on every page. **Add motion animations to
> the chart loads, played when scrolling.**

The chart motion is asked for everywhere. The prefetch sentence names the Sales Agent pages; the
same defect is on every page with a register or a stacking plan, so this stream applies the rule
commit `be3ac396` set for Sales Flow's charts to the other pages as well (measured below).

A decision the owner has just made outranks every other rule. The honesty rules still hold, and
nothing here changes a figure, a denominator, a sample size or a word.

## Decision

### 1. Every chart draws in once, as it comes into view

`DrawIn` (`apps/web/src/showroom/DrawIn.tsx`) already plays a drawing's entry the first time an
`IntersectionObserver` sees a fifth of it in view, once, never under reduced motion, and declares
its waiting frame only `@media screen and (scripting: enabled) and (prefers-reduced-motion:
no-preference)`, so a reader without script, a printed page and a reader who asked for reduced
motion see the final frame at once. That mechanism is unchanged, with one addition: **a drawing also
arrives once a fifth of the view is it** (`arrived`). A drawing taller than the view used to wait,
its marks hidden, with nearly half the view of it already on screen — IRIS-led's timeline is
2,375px on a 390×844 phone and needed 475px — and one taller than five views could never have
played. A drawing shorter than the view starts exactly as before (measured: a 632px card with 30px
in view waits). Two kinds are added beside the five it had, with their frames in
`apps/web/src/showroom/draw-in.css`:

- **`fill`** — the marks inside a block grow from their start, **each mark as it arrives itself**;
  every word and figure beside them stands from the first frame, an SVG's axis labels and printed
  counts included, because an SVG mark is its shapes and never the whole drawing. The marks are
  one list, `FILL_MARKS` in `DrawIn.tsx`, which `draw-in.css` names too: the plan's stock bar and
  window (SalesPlan), a flat type's blocks, interest bar and lines (RoomTypes), a reading's meters
  (RoomReadings), a comparison cell's bar (RoomCompare), a funnel's fills (a unit's funnel and
  comparisons, the report's ladder, one agent's funnel), the report's cell bars and outcome mix's
  parts, and a sale's track of showings (IrisLedTimeline). A mark waits transparent, so it can be
  observed itself; marks that arrive together start top to bottom, a millisecond a pixel below the
  highest, 560ms at most (`cascade`). The play ends on a clip 16px wider than the mark each side
  and lets it go as it ends.
- **`floors`** — a stacking plan rises from the ground floor up, 60ms a floor (`StackPlan` writes
  each floor's `--i` from the ground).

A `fill` mark ends by 1460ms, `floors` inside DrawIn's 1500ms, so `done` never cuts one short. Figure groups that read as charts
bloom (the existing kind). A card wrapped in `DrawIn` keeps the rule beside it hidden, as a bare
`.d-card` does.

| Page                 | What arrives                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Project              | Sold against the plan, Flat types, Interest against sales, The room types side by side (`fill`); the rest already drew in |
| Units                | the building (`floors`)                                                                                                   |
| A unit               | What buyers did with it (bloom); From opened to sold and Weighed against (`fill`); the weekly line already swept          |
| Meetings · a meeting | the register has no chart; the replay's three figures (bloom)                                                             |
| Features             | The period, and the instrument (bloom); the running order and time and weather already swept                              |
| Presentation         | already drew in (the lanes, what differs, the transitions)                                                                |
| Attention            | the three counts (bloom)                                                                                                  |
| Briefing             | the figures behind it (bloom); the building (`floors`)                                                                    |
| Audience             | a register, no chart                                                                                                      |
| IRIS-led sales       | the figures already bloomed; every showing before every sale, row by row (`fill`)                                         |
| The report on screen | the period summary (bloom); presentation coverage, the outcome mix and the ladder (`fill`); print never waits             |
| One agent's report   | the funnel, the running order's bars and the outcome mix (`fill`), as the project's report draws them                     |
| Ask                  | an answer's figures bloom by CSS alone as the answer is drawn (`ask-iris.css`)                                            |

**Not done: figures counting up.** A count-up rewrites the figure's text while it plays, which a
screen reader may announce part-way and a no-script render would print as its first value. The
bloom says the same without either.

### 2. No viewport prefetch on in-content links that fan out

`<Link>` prefetches every link that enters the viewport; for these dynamic routes each prefetch is a
server render down to the project's `loading.tsx` (`node_modules/next/dist/docs`, Prefetching).
`prefetch={false}` keeps the click a client navigation and sends nothing until then.

Set on: the stacking plan's cells; register rows (units, meetings, the report's single meetings,
the audience's matches); the unit links inside rows and charts (IRIS-led's timeline and table, a
unit's meetings and comparisons, an agent report's units); chart links (the room comparison's
"Build an audience"); finding and evidence links (FindingList, the attention rail and checks,
provenance pills); and chips (Audience's criteria, Presentation's mode switch, the most-opened
flats, attention subjects, Ask's openings, follow-ups, evidence and next step). Kept: the header,
the context band and its tabs, crumbs, single action pills ("Presentation DNA →", "Report →", the
Briefing's one alert, the replay's way back), and the presenter name links, which are stream
PORTRAITS' lines this round.

Measured on the demo build (`be3ac396`, `http://127.0.0.1:3400`, read-only, 1440×900, headless
Chromium): RSC requests in the 8 s after load, then after scrolling to the end; the chrome's own
(the header, the context band, crumbs, the account links) are counted apart. The "after" column is
a projection, because this build was not run: the chrome's requests plus the content links that
still prefetch in the static render of this branch.

| Page (as)              | Before: load / scrolled | Of which the chrome's | Content links still prefetching | Projected after |
| ---------------------- | ----------------------- | --------------------- | ------------------------------- | --------------- |
| Project (Clara)        | 22 / 31                 | 18                    | 2 (the two action pills)        | about 20        |
| Units (Clara)          | 82 / 82                 | 18                    | 13 sort headers (none was sent) | about 18        |
| A unit (Clara)         | 23 / 35                 | 23                    | 4 presenters                    | about 27        |
| Meetings (Clara)       | 32 / 82                 | 18                    | 1 (a phone's "Show the rest")   | about 18        |
| Meetings (Daniel)      | 37 / 233                | 18                    | 1 (a phone's "Show the rest")   | about 18        |
| A meeting (Daniel)     | 23 / 23                 | 19                    | 2 (presenter, way back)         | about 21        |
| Features (Clara)       | 26 / 26                 | 22                    | 6 sort headers (none was sent)  | about 22        |
| Presentation (Clara)   | 23 / 23                 | 19                    | 5 presenter chips (1 was sent)  | about 20        |
| Attention (Clara)      | 18 / 20                 | 13                    | 1 (Today's briefing)            | about 14        |
| Briefing (Clara)       | 68 / 80                 | 13                    | 1 (the alert)                   | about 14        |
| Audience (Clara)       | 17 / 17                 | 13                    | 0                               | 13              |
| IRIS-led sales (Clara) | 24 / 45                 | 16                    | 5 presenters, 2 header links    | about 21        |
| The report (Clara)     | 13 / 32                 | 14                    | 7 (5 presenters, 2 channels)    | about 21        |
| Ask (Clara)            | 14 / 14                 | 13                    | 1 (the history button)          | 14              |

A first run on the same build counted less on some pages (Units 4, the Briefing 7 after
scrolling): the counts vary from run to run, and the second run is the one above. The registers'
sort headers (`DataTable`) still prefetch; neither run saw one of them sent.

## What stays out

- **The trigger's fifth.** A drawing on these pages starts when a fifth of it (or of the view) is in
  view, as on Sales Flow and the agents pages; a later start would change those pages too. For
  `fill` the drawing is each mark; a stacking plan (`floors`) still rises as one building, at most
  492px tall (Units on a phone).
- **Registers' in-cell bars** (the units register's demand signal) do not grow: a register is read,
  not watched, and a wrapper around a table a phone draws 5,000px tall is a wrapper nobody sees play.
- **Text under 12px found on the way, not caused here and not changed:** Presentation's and
  Audience's 11px kickers, Audience's 10px column heads, Presentation's 10px chip counts and 11px
  evidence pill, Ask's 11.5px avatar initials. For the bug and overlap round.
- **Presenter links' prefetch** stays with stream PORTRAITS, which owns those lines this round.

## Consequences

- `apps/web/test/entrances-and-prefetch.test.ts`: every waiting and playing frame sits under
  screen, scripting and no-preference; the stylesheet waits on exactly `FILL_MARKS`; rendered
  `OutcomeMix` and `RoomTypes` paint no word inside a mark (the counts and the axis are read off
  the render, and the check fails on the first round's whole-SVG list); a `fill` play is
  `backwards` and ends by 1460ms; `cascade`; the floors end inside `PLAY_MS`; both kinds are in
  `DrawKind`; `arrived` starts a short drawing at a fifth of itself and a tall one at a fifth of
  the view; every link in the fan-out files carries `prefetch={false}`, and the meetings
  register's rows and units do.
- Static renders (the page in the real Shell through `react-dom/server`, the product stylesheets,
  headless Chromium) of the thirteen pages at 1440×900, 1280×720, 390×844 and 360×780 against the
  same render of `be3ac396`: under reduced motion every page's height, every heading's position and
  every visible rule are unchanged, and there is no sideways scroll. With motion, DrawIn's effect
  replayed on the render: below the fold every `fill` and `floors` drawing waits with only its marks
  hidden, plays when scrolled to, and is `done` with nothing hidden at the end. **Not looked at on a
  running page.**

## Review round 1 (2026-10-23)

Five findings, each checked against the code and, read-only, against the demo (`be3ac396` at
`http://127.0.0.1:3400` as Clara, this branch's `draw-in.css` and `fill` logic injected onto the
same blocks, scrolled 10px at a time). Four fixed, one fixed in part and handed on.

1. **A tall `fill` block played off screen — confirmed, wider than reported, fixed.** At the
   moment a block arrived, IRIS-led's timeline had 17 of its 19 tracks below the fold at 1440×900
   (the deepest 1,649px) and 18 at 390×844. On a phone the same was true of Flat types (938px),
   Interest against sales, the room comparison, the report's coverage table and ladder, and a
   unit's funnel (1,114px). The block-level trigger is gone for `fill`: each mark is observed
   itself (observing its row instead still started a track 70px below the fold, its row's head in
   view). After: at 1440×900, 1280×720, 390×844 and 360×780, on Project, IRIS-led, the report, one
   agent's report and a unit, every one of 113 marks started on screen, all played, none was
   clipped at rest, and nothing scrolled sideways. The rows' `--i` props went with it.
2. **The end clip cut the dots and they snapped at `done` — confirmed, fixed.** The play is now
   `backwards` and ends on a clip 16px wider each side and a view taller, so a dot on a track's end
   (10px overhang) is never cut and the clip lets go as the play ends, not 600ms later.
3. **One agent's report drew at once — confirmed, fixed.** The funnel, the running order's table
   and the outcome mix draw in with `fill`.
4. **Cherry-picking with PORTRAITS stopped on two hunks — confirmed; one removed, one handed on.**
   `IrisLedTimeline` now wraps itself in `DrawIn`, so the IRIS-led page's line beside the
   presenters' key is the base line again and merges clean (`git merge-tree` against
   `r7-portraits`). The report's single-meeting rows still conflict: `prefetch={false}` split the
   `meeting:` cell over five lines beside PORTRAITS' new `agent:` cell. Resolve by keeping both:
   the five-line `meeting:` Link with `prefetch={false}`, then
   `agent: <AgentName name={row.agentName} src={portraits[row.agentId] ?? null} />`.
   `docs/PROJECT-STATE.md` conflicts as expected; keep both sections.
5. **`fill` hid SVG words while it waited — confirmed, fixed.** The marks were whole SVGs
   (`.pr-lines svg`, `.ox-mix`), which hold Flat types' axis labels and the outcome mix's counts.
   They are now the shapes (`.pr-lines .pr-line`, `.ox-mix .ox-mix-part`), so §1 holds as written.
   The test now renders `OutcomeMix` and `RoomTypes` and reads the painted words against the
   marks; put back, the first round's list fails it.
