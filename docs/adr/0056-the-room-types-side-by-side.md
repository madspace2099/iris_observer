# ADR-0056 — The room types side by side

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, while recording the Shark Residence demo
**Supersedes, on the Project page only:** the parity scale ("Does attention match supply?"), the
attention × conversion scatter ADR-0041 placed there, the segment tabs (`?segment=`) and the
one-segment band. The components stay for the pages and the design lab that still draw them.
**Extends:** ADR-0010 (association is never cause), ADR-0041 (the Hyper kit's card), ADR-0052
(Section titles at 20/28/600, notes behind an `i`)
**Runs beside:** ADR-0055 (stream PLAN owns "Sold against the plan" on the same page)

## Context

On 2026-10-22 the owner went through `/shark/shark-residence/project` on the local production build
and wrote, in Hungarian. His recurring complaint was blocks he could not read in a few seconds, too
much small text and no hierarchy by type size: _"SIMPLIFY!"_

1. _"'Does attention match supply?' — itt azt kell látnunk vizuálisan hogy az egyes lakástípusok
   mennyire jól értékesíthetőek…"_ — show how sellable each flat type is: how many one-, two-,
   three- and four-room flats there are, how many of each sold, and the interest in each size during
   meetings, all types in one chart, over a week, a month, a quarter, a half-year, a year and total.
2. _"'Attention against conversion' — … nagyon nehéz nekem is megérteni építészként mit akar ez a
   diagram mondani. Egyszerűsítsd!"_ — even as an architect I can hardly understand it. Simplify.
3. _"One-room / Two-room / … amikor ezekre kattintok ne töltődjön be újra a weboldal"_ and _"jó lenne
   őket látni egymás mellett"_ — clicking the tabs must not reload the page, and the types should
   stand side by side so they can be compared.
4. _"'How far a presentation gets' — mit jelent itt a 150?"_ — what does 150 mean? Redesign.

## Decision

**One read model for the room types.** `ObserverRepository.getRoomTypes` returns `RoomTypesView`
(`packages/readmodels/src/room-types.ts`, built by `packages/synthetic/src/showroom/room-types.ts`).
A room type is one of the catalogue's own room counts — the project view's segments, so a type with
no stated count is its own type — never a fixed four. Four figures are declared in the registry:
`project.room_type_stock` (flats, sold and reserved by type; sold and reserved come from the CRM and
are absent, never 0, without one), `project.room_type_interest` (floor 10 meetings),
`project.room_type_reading` (floor 20) and `project.room_type_examined` (floor 20). Every display
string, the line's point labels included, is the read model's.

**Flat types: stock, sales and interest** replaces the parity scale. One row a type: its flats as
blocks (sold, reserved, open), its share of the stock, the share of the window's meetings that
opened at least one flat of the type, and the change in points against the same length of time just
before (shown only when both sides hold 10 meetings and the time before lies wholly after the project's first meeting). A meeting that opened two sizes counts for
both, so the shares add up to more than 100%, and the `i` says so. Beside the rows, a line per type
over the window's equal stretches, each stretch drawn only from its own meetings and only at 10;
the caption counts the stretches left out, and fewer than two drawn is a sentence instead.

The windows are Sales Flow's rolling windows without Today: the owner's spans (a week to all time),
named by their length (7 days, 30 days, 91 days, 182 days, 365 days, All time; see the review round). **All six arrive with the page**, so the switch is a state
change in the browser: no request, no navigation, no reload. A live region says the new set ("82
meetings in the last 30 days") and a sentence ranks the types and names the largest move.

**Interest against sales** replaces the scatter. Per type, a reading in words and the act it
suggests — "More time on it, and selling well · Lead the campaign with it", "More time on it, but
selling less", "Less time on it, but selling well", "Less time on it, and selling less", and, within
a flat of the project's rate, "… selling at the project's rate" (wording from the review round) —
from the period's attention index (the same index as before: share of looking time on the unsold
stock over share of the unsold stock; 1.00× is its fair share) and its sold flats against the
project's rate. Both facts are drawn,
each against its upright reference. Under 20 meetings that opened the type there is no reading and
the row says how far short it is; with no CRM no type has a reading and the card says so once. The
`i` says the reading pairs attention with sales and claims nothing about which caused which.

**The room types side by side** replaces the tabs and the band. What buyers did once they opened a
flat — balcony view, floor plan, floor cut, screenshot, shared — as rows, the types as columns, each
column headed by the openings its rates are of. A row's highest is marked only among types with 20
openings or more and only when the rates differ. Each column ends in a link that builds the
audience of that type's buyers, carrying the period. On a phone the types stay columns and each
row's name takes its own line, so the comparison survives the width.

**How far N presentations got.** The journey's title states its set; every band says what it is
after its count ("150 presentations", "150 opened a flat", "137 shortlisted a flat", "68 progressed ·
18 have no recorded outcome"); every stage a meeting reached is drawn, one as wide as the band above
included, instead of a merged stage explained in a sentence. The bands start at the left edge of one
track, so a band's length is its share of the first, without the kit's centred, glowing violet.

**The rest of the page.** Section titles take the Section size; method notes move behind the `i`
beside their titles; the search register's head and phone labels, the findings' citations and the
neighbourhood bars on a phone are lifted to the 12px floor by rules scoped to this page
(`components/project/rooms.css`). The project finding about the lead segment now leads to its
audience instead of to `?segment=`, which would reload the page it sits on.

## Consequences

- `/project?segment=…` is no longer read by the page; old links land on the full comparison.
  `getProjectView` keeps its segment argument (every caller now passes null) and the view still
  carries the scatter for the design lab's gallery.
- The per-segment "Where those buyers spent their time" is gone from the page; places stay
  project-wide (the neighbourhood's kinds of place, the places buyers stopped on).
- A type's hue is the kit's agent set ordered blue, magenta, aqua, sky (review round), with the kit's
  green last, because green means sold on these cards.
- Verified on static renders (react-dom/server, the product stylesheets, headless Chromium) at 1440,
  390 and 360 for Shark, Northgate and Riverside (no CRM): no sideways scroll, no text under 12px but
  the `i` glyph. Not yet seen on a running build; the e2e specs that read the old blocks are
  rewritten, not run.

## Review round (2026-10-22)

Adversarial reviewers read the branch with fourteen findings, three of them duplicates. All eleven
distinct ones held in the code and were fixed; two suggested remedies were not taken.

**Fixed.**

- _A part window set against a whole one._ Shark's 182 days were compared with "the 182 days
  before", of which 43 days followed the first meeting (25 meetings, over the floor). A change is now
  set only against time before that lies wholly after the first meeting; otherwise the change line
  says the first meeting falls inside it. Declared on `project.room_type_interest`.
- _A sold verdict on less than a flat._ Three-room's 8 of 19 against the project's 40% was "selling
  well", 0.4 of a flat above. The sold side now names a direction only when the type's sold flats are
  `ROOM_TYPE_SOLD_GAP` (one flat, exported with the metric) from the project's rate applied to its
  flats; nearer, the reading says it sells at the project's rate and suggests no act. The row shows
  the flats it stands on: "8 of 19 · 42%".
- _Two measures called interest._ The reading's axis is dwell time on the unsold flats; the block
  above counts meetings that opened a type. "Looked at less, show it more" stood under "63% of
  meetings opened one". The axis is now **Time spent, against its share of the unsold flats** (the
  unsold share is the index's true denominator), the headlines say "More/Less time on it", the `i`
  says it is time, not openings, and "Show it more in presentations" is withheld from a type already
  opened in a larger share of the period's meetings than its share of the stock.
- _Two "quarters" on one page._ The switch's chips name their length; the readings and the
  side-by-side table name the page's period and its presentations ("Quarter to date · 150
  presentations"), so the reader can tell which figures the switch moves.
- _A week that could never draw._ Seven one-day points each needed 10 meetings. The 7-day line is
  its 7 days and the 7 before them, one point each: the change column's own two sets.
- _A first meeting claimed with no meeting._ With an empty history no caption says "from the first
  meeting".
- _An audience link promising a type it cannot filter._ Flats of an unstated room count get no link.
- _A phone grid read under the wrong head._ The corner header left the accessibility tree with
  `display: none`; it is now visually hidden and out of flow, and the head and rows align again.
- _The owner's first figures in the smallest print._ Flats and sold per type stand at the body size.
- _Near-identical hues, and a green "highest"._ Hues run blue, magenta, aqua, sky; a row's highest
  is marked by weight and an underline.

**Not taken.**

- Sizing every window's stretches by the floor (Northgate's 30 days held 8–9 a stretch): it trades
  resolution where meetings cluster for a line that may still fall short; the sentence saying why
  there is no line is honest, and the week, which no showroom could fill, is fixed on its own.
- Basing the reading on meetings that opened a type over its stock share: those shares add up to
  more than 100% and have no parity to read against. The established index stays, named for what it
  measures.
