# ADR-0063 — Project, one screen at a time

**Status:** accepted · **Date:** 2026-10-23
**Decided by:** the product owner, before recording the IRIS Observer marketing video
**Extends:** ADR-0059 (Sales Flow, one screen at a time), ADR-0061 (Sales Agents, one screen at a
time, and the shared `ScreenRail`), ADR-0055 (sold against the plan), ADR-0056 (the room types
side by side), ADR-0062 (the charts arrive as you scroll)

## Context

On 2026-10-23 the owner wrote, of `/shark/shark-residence/project`:

> _"a /project oldal nincs új felépítve mint a másik 2 (Sales Flow és Sales Agent) hogy mindegyik
> panel kitölti az egész full screen-t. Ezt javítsd!"_
>
> The Project page is not rebuilt like the other two, where every panel fills the whole screen.
> Fix it.

"Like the other two" is ADR-0059 and ADR-0061: every block a screen as tall as the viewport under
the sticky chrome, the next not visible beneath it at rest, the shared rail of where you are,
proximity snapping, one turn of the wheel one screen where the screens fit, a tall screen read
through first, nothing snapping under reduced motion. The honesty rules still hold: denominators,
refusals and shortfalls in sight; definitions may stand behind the `i`.

## Decision

1. **Eight screens, in the page's order.** The spoken verdict (up to 56px, the mark at 72px) with
   the page's ways on under it — Presentation DNA, Report, the export; sold against the plan; flat
   types: stock, sales and interest; interest against sales; the room types side by side; what
   buyers searched for beside what the neighbourhood is doing, the places buyers stopped on under
   both; how far the presentations got; the findings and what this source cannot say. The rules
   between blocks are gone. The page opts in with `.iris-screens` / `.screen`
   (`components/screens/screens.css`) and draws `ScreenRail` after its screens ("Project screens",
   keyed on the period), so Tab reaches the page's own controls first.
2. **The searches, the kinds of place and the named places share a screen.** Each alone is a list
   too short to hold a screen, and the two place lists read together. In the narrow side card a
   kind of place's name and share stand on one line with its bar under them: stacked name over
   bar and share, seven kinds took 356px of a 591px screen.
3. **Without a unit catalogue** the one sentence that says so closes the plan's screen, and the
   three room-type screens are not drawn or listed: three screens of one sentence would be black
   fields (ADR-0059 §9).
4. **The drawing takes the screen** (`components/project/project-screens.css`, every rule under
   `.pr-page` and a screen's id, so `plan.css` and `rooms.css` keep the cards as they are drawn
   anywhere else): the plan's verdict at up to 48px, its figures up to 64px, the stock bar up to
   40px and the window's track 16px; the readings' meters 14px; the comparison's rows spread, each
   rate 20px over an 8px bar; the presentation path's bands up to 64px with the gaps between them
   the screen's. Each grows with `--screen-h` and is floored at the size it was drawn at. **Flat
   types and interest against sales take the room their screen leaves** (review round 1): each
   card is its screen's height, and what its header, reading, notes and source leave goes to the
   readings' rows and, on a wide card, to the type rows and the interest line beside them. The
   screen less a constant (21rem for the line, 26rem for the rows) ran past the view wherever
   something wrapped past the guess. The interest line now draws at its box's height as well as
   its width (`Lines` in `RoomTypes.tsx`), its drawing out of the flow so the box, not an earlier
   drawing, decides it: 196px, as before, unless the screen raises it, never under, so its labels
   stay 12px at every size.
5. **A short desktop window** (64rem wide, under 900px tall; 1280×720 leaves 591px) tightens the
   cards' padding, the rows and the gaps, so every Shark screen fits with its source line in sight.
   The searches with the places and the findings do not grow with the screen (Shark's 690px and
   675px, Riverside's searches 756px at 1280 wide), so the tightening holds until a window leaves
   them that much; at 760px it left 1280×800, 1366×768 and 1440×810 cutting them (review round 1).
6. **Five seconds.** Nothing new behind the `i` and nothing removed: the room types' reading
   sentence is the one takeaway, the plan's verdict is its one line, the path's title states its
   set. Every denominator (the search register's two count heads, "82 meetings in the last 30
   days", "Quarter to date · 150 presentations", each type's openings), every refusal and every
   shortfall stand where they stood.
7. **Motion and prefetch are unchanged.** The plan, the room types, the readings and the
   comparison draw in mark by mark as their screen arrives (`DrawIn` `fill`, ADR-0062), the kinds
   of place sweep and the path blooms; nothing moves under reduced motion. The page's two `Link`s
   are the action pills ADR-0062 kept; "Build an audience" already sends no prefetch.

## What stays out

- **Riverside at 1280×720 and 1280×740:** its eighteen named places carry longer names and wrap to
  four rows (Shark's to three), so the search screen is 629px against 591 and is read through.
  Every other screen of Shark, Northgate and Riverside fits from 720 to 1080px tall at 1280 to
  1920px wide.
- **A window under 720px tall** (a 591px screen) is under the size the short-window rules are
  drawn for: the searches, the findings and flat types run up to 20px past it and are read through,
  as they do at 720px tall between 1200 and 1279px wide, where the narrower cards wrap more (up to
  53px).
- **Narrower desktop windows** stack two screens and read them through, as a phone does: flat types
  under about 1180px wide, where the card puts the line under its rows, and the searches with the
  places under about 1240px.
- **The plan editor opened** adds its two date fields and buttons to the plan's screen, which then
  reads through; closed, its button fits at both desktop sizes.
- **A phone** stacks the screens as the shared sheet draws them on the agents' pages: each at least
  the view's height, most taller and read through; the rail is not drawn and the wheel is not
  stepped there.
- **The first wheel turn** from the page's top lands the verdict screen's top (83px down, under
  the context band's second row), as on the other two pages; the shared rail's rule, unchanged.

## Consequences

- `project/page.tsx`, `components/project/project-screens.css` (new), `RoomTypes.tsx` (`Lines`
  draws at its box's height), `rooms.css` (`.pr-lines` owns its 196px).
- `apps/web/test/project-screens.test.ts` (new): every listed screen drawn, in order, and every
  drawn screen listed; no rule left; the verdict screen holds the verdict and the ways on only;
  the room-type screens only with a catalogue, the sentence closing the plan's screen otherwise;
  each chart on its screen; the search's denominators and shortfall outside an `i`; the rail keyed
  on the period and drawn after the screens; only the two action pills prefetch; every rule of the
  sheet under `.pr-page`; the line never drawn under 196px; flat types and interest against
  sales given the room their screen leaves, never the screen less a constant. No e2e spec asserted the structure that
  moved (`project-denominators` reads `.pr-rows .pr-type`, unchanged).
- Looked at as static renders (the page in the real Shell through `react-dom/server`, the product
  stylesheets, the interest line drawn at the size its box measures, headless Chromium) at
  1440×900, 1280×720, 390×844 and 360×780 for Clara Weiss on Shark Residence (with and without the
  plan editor), and at the two desktop sizes for Northgate and Riverside: no sideways scroll, no new
  text under 12px. **Not looked at on a running page.**
- Review round 1, measured the same way at every 20px from 720 to 1080px tall at 1280, 1366,
  1440, 1536, 1600 and 1920px wide, and at 1199×800: every Shark and Northgate screen fits; the
  four brief sizes, the phones' screens unchanged.
