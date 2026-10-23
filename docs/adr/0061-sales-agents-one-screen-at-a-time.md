# ADR-0061 — Sales Agents, one screen at a time

**Status:** accepted · **Date:** 2026-10-23
**Decided by:** the product owner, before recording the IRIS Observer marketing video
**Extends:** ADR-0059 (Sales Flow, one screen at a time), ADR-0057 (Sales Agents at a glance),
ADR-0054 (agent portraits), ADR-0048 (the verdict is said by IRIS)
**Runs beside:** stream PORTRAITS (ADR-0054's amendment: the portrait as a plain circle, and beside
every presenter's name on the other pages) and stream MOTION (ADR-0062: chart entrances and link
prefetch on every other page). This decision is stream AGENTS: the roster, Coaching and an agent's
page.

## Context

On 2026-10-23 the owner, about to record a marketing video of the product, wrote (Hungarian, the
working language of the project):

> _"Feltöltöm az 5 ügynök profilképét, a neveikkel megnevezve - a kép nevében. Ezeket állítsd be
> nekik profilképnek és ahol lehet az összes lehető oldalon ott jelenítsd meg a profilfotóikat. Egy
> minimalisztikus körben legyenek a képek, color stroke nélkül. Majd végezd el ugyanazt a 1
> panel/full screen scrollozásonkénti változtatásokat a "Sales Agent" oldalakra is és ugyanúgy
> optimalizáld ott is az előbetöltő kérések számát. Majd miután elkészült minden csinálj egy nagy
> bug és overlapping ellenőrzést MINDEGYIK oldalra, ahol sok a szöveg SIMPLYFY! Majd ellenőrizd a
> responsiveness-t is mindegyik oldalon! A diagrambetöltéseket motion animációkkal egészítsd ki
> amelyek scrollozásnál játszódnak majd le."_
>
> I am uploading the five agents' profile pictures, named after the agents. Set them as their
> profile pictures and show them on every page you can, in a minimalist circle, without a colour
> stroke. Then make the same one panel / full screen per scroll changes on the Sales Agent pages
> too, and optimise the number of prefetch requests there the same way. Once everything is done,
> do a big bug and overlap check on EVERY page; where there is a lot of text, SIMPLIFY! Then check
> responsiveness on every page. Add motion animations to the charts' loading that play when
> scrolling.

"The same way" is ADR-0059 (every block a screen, the next not visible under it, snap by proximity,
one turn of the wheel one screen where the screens fit, a quiet rail of where you are, every panel
read in five seconds) and commit `be3ac396` (no viewport prefetch on a chart's links: a Sales Flow
screen with dozens of links sent 600 requests in eight seconds, each a page rendered in full on the
server).

A decision the owner has just made outranks every other rule (the skill's source hierarchy). The
honesty rules still hold: no figure without its denominator (a definition may stand behind the
`i`), no verdict without its sample size, absent never shown as zero, association never cause.
Refusals and sample shortfalls stay in view.

## Decision

1. **One rail, shared.** `FlowRail`'s logic — one dot per screen, the current one under the
   viewport's middle line, a dot that scrolls, moves focus and replaces the address, and one turn
   of the wheel one screen where the screens fit — is `components/screens/ScreenRail.tsx`, with its
   sheet `screens.css`. `FlowRail` is a thin wrapper; Sales Flow keeps its own screens' sheet and
   places the rail itself. Measured on the static render at 1440×900, 1280×720, 390×844 and 844×390,
   Sales Flow's rail and every screen stand exactly where they stood. A page opts in to the screens
   with `.iris-screens` on its root and `.screen` on each block (the same rules as
   `flow-screens.css`: at least the viewport under the sticky chrome, proximity snapping, none under
   reduced motion, no smooth scrolling).
2. **The roster: four screens.** The verdict (ADR-0048, up to 56px, the mark at 72px) with the two
   tabs under it; the presenters' cards, five on a line from a desktop window (a 1280 window gives
   each 211px, so the card's padding narrows to a phone's and the name to 18px); presentations
   given beside "Was it the buyer's first meeting?", their rows spread down the screen with 12px
   bars; the findings, the lead finding's sentence set as the screen's headline, and the reading
   note. Without a finding the reading note closes the workload screen rather than standing alone.
3. **Coaching: two screens.** The same verdict and tabs; then the one question (ADR-0057), the
   answer and the key down the left, the chart the screen's height beside them from 75rem. Who is
   under the floor and the source close the card under both columns, so nothing is read after the
   chart and painted above its end.
4. **An agent's page: eight screens.** Who they are (the head, the portrait large, "Presenting for
   …"); activity (the counts across the screen at Figure size, follow-up beside the outcomes they
   recorded, the two absences — follow-ups completed, verified outcomes — in sight); how their
   meetings ended (the ring, 260px) beside where they reached (the funnel); how they present (the
   shape at 340) beside the running order; what their buyers opened beside the weekly line (360
   units tall, the shared 11rem cap lifted so its ticks stay 12px); the apartments they keep
   opening beside where else they present; their most recent meetings; what this period found and
   how to read the page. For a reader the register is kept from, its refusal and "Every meeting of
   theirs" close the apartments' screen: a screen of one sentence would be a black field. Under the
   floor a half that holds a sentence (the shape's note, "No trend") is as tall as the sentence.
5. **Five seconds: the title, the drawing, the figure; the rest behind the `i`.** Moved behind an
   `i` beside the title: the activity screen's three notes (what the counts are, why none carries a
   drill-down reference, follow-up's two questions, what "outcomes they recorded" are); every
   chart's definition (the agent page's charts are drawn in a local `Frame`: `ChartFrame`'s card
   with the note behind the `i`); what each of the shape's six spokes measures; the association
   note on the apartments and why where else they present is scoped; the register's naming rule;
   the reading note's detail. Visible still: every denominator and sample, the refusals, every
   below-the-floor sentence, the scope of where else they present in one line, "Nothing on this
   page ranks … against a colleague, and nothing adds these figures into a score."
6. **Motion plays when its screen arrives, once.** Every chart on these pages draws in through
   `DrawIn` (an `IntersectionObserver`, once, nothing under reduced motion): the cards' rings turn
   in 60ms apart (the last ends at 1440ms, inside `DrawIn`'s 1500); the ranked list, the
   first-meeting bars, the paired rates, the weekly line and the running order sweep; the shape
   blooms. Two had no entrance and now sweep: Coaching's rows and the agent's funnel.
7. **No prefetch on sight for the pages' own links.** `prefetch={false}` (App Router: never on
   entering the viewport and never on hover; a click still navigates) on a card's three links,
   Coaching's agent arrows and the names off the chart, an agent's unit links, other projects,
   register rows (`MeetingRegister`, shared with the printed agent report) and "Every meeting of
   theirs". The header's navigation, the tabs and the crumbs keep Next's default.
8. **A face beside a name.** Every presenter's name on these pages stands with their
   `AgentPortrait`: the cards, presentations given, Coaching's key, ends and off-chart names, the
   agent's head, and the two chart titles that name the agent. The portrait's look is stream
   PORTRAITS' (a plain circle, no stroke, in `Portrait.tsx` and `portrait.css`); these pages only
   size it.
9. **The rail after the screens.** On these pages the rail is drawn beside the screens and comes
   after them in the DOM, so Tab reaches the page's own controls first: an agent's crumbs sit at
   the top of the first screen, above the rail's dots, and Tab going back up the same column is a
   jump the accessibility contract refuses. Its name is the page's: "Sales Agents screens", "Sales
   agent screens".

## Prefetch, measured

Before, on the demo build of `be3ac396` at `http://127.0.0.1:3400`, read-only, signed in as Clara
Weiss, 1440×900, a fresh browser context per page; RSC requests counted 8 s after load, then after
four 900px wheel turns 1.5 s apart and 5 s more (two runs):

| Page                                  | On load | After four turns |
| ------------------------------------- | ------: | ---------------: |
| `/shark/shark-residence/agents`       |      13 |          32 / 33 |
| `…/agents?view=coaching`              | 21 / 25 |          24 / 25 |
| `…/agents/agt_sharklena01` (an agent) |      14 |               14 |

Of the roster's 20 extra requests, 15 were the cards' links (each agent's page, meetings and report)
as the cards scrolled into view; Coaching's extra were the five agents' pages, twice. The agent page
never reached its findings in four turns.

After: **not measured on a running build** (this round builds nothing). Counted on the static
render, the in-content links that still prefetch: the roster 2 of 23 (the two tabs), Coaching 2 of
7 (the tabs), an agent's page 7 of 14 — the two crumbs and five links drawn by shared product
components (the head's and the findings' `Evidence`, the findings' next steps), which stream
MOTION's prefetch pass owns. Expected on the build: the roster's load count with nothing added by
scrolling, Coaching about ten fewer, an agent's page unchanged on load.

## What stays out

- **A name inside a sentence** (the spoken verdict, a finding: "Zsófia Bárány spends 1.8× the
  team's share…") carries no face. The finding names no subject in its read model, and a page that
  parsed one out of a link would be computing in a component; `ShowroomFinding.subjectAgentId` is
  the upgrade if the owner wants the face there.
- **The shared components' links** (`PageHead`'s crumbs, `Evidence`, `FindingList`) keep their
  prefetch here; they are drawn on every page and are stream MOTION's.
- **Screens still taller than a ~600px window** (1280×720, a 591px screen), read through: the
  presenters' cards (799), Coaching (875), how they present (784) and the apartments (695). At
  1440×900 and 1920×1080 every Shark screen fits. On a phone most screens are taller than the view and
  are read through; the rail is not drawn there.
- **The roster card's flag** keeps its sentence; it is something to act on.

## Consequences

- `apps/web/src/components/screens/ScreenRail.tsx`, `screens.css` (new); `components/flow/FlowRail.tsx`
  a wrapper; `flow-screens.css` lost its rail rules and places the rail.
- `agents/page.tsx`, `agents/[agentId]/page.tsx`, `components/agents/roster.css`,
  `components/agents/agent-page.css` (new), `components/agents/MeetingRegister.tsx` (prefetch),
  `showroom/CoachingChart.tsx` (its rows draw in; its arrows do not prefetch).
- Tests: `apps/web/test/agents-screens.test.ts` (new: every listed screen drawn and every drawn
  screen listed, on all three; the verdict screen alone with its tabs; the rail keyed on the period
  and the tab; no in-content prefetch but the tabs; the face beside the titles that name the agent;
  refusals and shortfalls outside an `i`; the shared sheet's snapping and scope; the rail's markup).
  `flow-screens.test.ts` reads the rail's source and sheet where they now live, its assertions
  unchanged. The e2e specs that read these pages were checked against the new structure and need no
  change: the activity plate keeps its eight children in order (R13-3), "WHERE ELSE THEY PRESENT"
  still runs to "Scoped to the projects this account holds" (R13-6), the register's caption and
  "Kept for the sales team" stand (register gate), one `h1` (R13-1).
- Looked at as static renders (the pages in the real shell through `react-dom/server`, the product
  stylesheets, the five uploaded portraits read from the demo's local plane, headless Chromium) at
  1440×900, 1280×720, 1920×1080, 390×844 and 360×780, for Clara Weiss on Shark Residence, Daniel
  Hart (the register drawn) and Tomáš Varga on Northgate (an agent under the floor): no sideways
  scroll, no text under 12px but the shared `i` glyph, every Shark screen at 1440×900 and
  1920×1080 inside its viewport (Northgate's agent under the floor: how they present is 808px at
  1440×900, its shortfall sentence under the running order). The entrances were looked at mid-play with `DrawIn`'s behaviour scripted
  into the static page. **Not looked at on a running page.**
