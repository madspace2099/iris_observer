# ADR-0053 — From a figure to its meetings, and why "not interested"

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, commenting on Sales Flow while recording the Shark Residence demo
**Extends:** ADR-0010 (evidence tiers), ADR-0012 (components compute no metric), ADR-0029 (agents
see their project's colleagues), ADR-0041 (outcome rows, the Hyper kit's parts)
**Numbered 0053** because three streams worked on Sales Flow at once: 0052 is the layout stream's,
0054 the portraits stream's. 0046 is unused by design.

## Context

On 2026-10-22 the owner went through `/shark/shark-residence/flow` and left two comments this
decision answers.

On "How each agent's meetings end":

> A "How each agent's meetings end" blokkban pl. a Lena Fischer-nél a "Purchase"-nál 7 meeting van.
> Legyen lehetőségem megnézni azt a 7 meetinget tehát tudjak rákattintani ezekre és megnézni őket.

Translated: Lena Fischer has 7 meetings at "Purchase"; let me look at those 7 — I should be able to
click them and see them.

On the section headed `Ended "not interested" · 19 meetings`:

> ide úgy gondolom ezek nem elegendőek hogy le vannak írva melyik funkció hányszor volt megnyitva.
> Itt azt kellene látni hogy pl. 19 "not interested" találkozóból melyik sales agent-hez köthető?
> Mennyi volt a median meeting session hossza. Mennyi volt a kattintásszám a meetingek során tehát
> meg akarom tudni miért lettek sikertelenek ezek a meetingek! "68% on its own · 80% elsewhere" ezt
> nem értem mit akar jelenteni legyen világosabban megmagyarázni.

Translated: listing which feature was opened how many times is not enough. He wants to see which
sales agent each of the 19 belongs to, the median meeting length, and how many clicks there were
during the meetings — he wants to learn why these meetings failed. And "68% on its own · 80%
elsewhere" he does not understand; it should be explained clearly.

The section was a funnel of six nested behaviours, each band the meetings that did that and every
behaviour above it, with each behaviour's own rate in the group and among the others beside it. It
answered "what did the group have in common" in a shape that needed its own disclaimer to read, and
it said nothing about who presented the meetings, how long they ran or how much was done in them.

## Decision

1. **A part opens its meetings.** With `open` (the register's path and the reader's period),
   `OutcomeRows` links every part to `/meetings?agent=<id>&outcome=<outcome>&period=<period>`,
   written by the register's own `withMeetingFilters`, so the names cannot drift from the parser. The
   team's row narrows by outcome alone. The unrecorded part links too: `skipped` is in the register's
   vocabulary. The month rows get no `open`: the register has no date range, deliberately
   (`filters.ts`), and one was not added. A reader the register would refuse gets no link
   (`maySeeSurface(role, "meetings")`); every role that reads Sales Flow may read the register, and
   the register is the project's whole, as ADR-0029 opened it, so the link never ends in a refusal.
2. **The bar is the pointer's; a count line is everyone else's.** The parts are links out of the
   tab order inside an `aria-hidden` bar, as the scatter's points are (ADR-0041). Under the bar, one
   link per part — its outcome's swatch and its count, 24px tall, a faint edge at rest so a phone
   shows a target — named "Lena Fischer: 7 meetings ended Purchase — open them". A one-meeting part
   is a sliver no finger can hit and its count stood in a tooltip alone; now every count is on
   screen. A hovered part, and the part a focused count points at, wear a ring of the card's ink.
3. **The not-interested section answers why, in four parts, all the read model's.**
   - **The lead.** One sentence naming the two widest typical differences and the widest
     behaviour, each at least 15% (relative for a median, points for a share), with both sample
     sizes: _The 19 meetings that ended "not interested" ran shorter (median 9m 52s against 14m
     19s), opened fewer features (median 6 against 8) and used Compare less often (11% against
     58%) than the 112 other recorded meetings, quarter to date. That is what they had in common,
     not why they ended so._
   - **Three typical figures** on the KPI strip's cells: median length with the middle half (25th to
     75th percentile, nearest rank) of both groups; median features opened; median apartments
     opened; the others' beside each, and both samples.
   - **Whose they were.** Every presenter of the period in the roster's order — the rings' order,
     never by count — with their part of the group as a bar drawn to the group's size, and beside
     it their count over their own recorded meetings: "8 of 22 · 36%"; under `AGENT_MIN_SAMPLE`
     recorded, "3 of 19 · no rate, 1 short of 20". The name opens those meetings in the register.
   - **What they did, against the others.** The six behaviours, each on its own, in the group and
     among the others, on the product's paired rates, widest gap first, under the column names
     "This group" and "Others" and the line "The share of meetings that did each: of the 19 meetings
     that ended "not interested", and of the 112 other recorded meetings. Each on its own; the
     widest gap first." That line is what "68% on its own · 80% elsewhere" meant. The group's end
     wears the not-interested outcome colour and the gap is neutral, without the kit's green glow:
     green would read as a good result on a group that ended badly.
4. **"Clicks" are openings.** The showroom does not record clicks or taps: `docs/03-event-map.md`
   §7 removed the client's click map, and the event contract carries section and unit openings.
   So the measure is named for what it counts — features opened (every opening of a showroom
   section, a return counted again) and apartments opened (distinct units viewed) — and the section's
   `i` says no click count exists.
5. **Four metrics, declared first** (`packages/metrics/src/registry/flow.ts`):
   `flow.not_interested_by_agent` (ratio, floor `AGENT_MIN_SAMPLE`), `flow.not_interested_length`
   (duration), `flow.not_interested_interactions` (distribution) and `flow.not_interested_reach`
   (ratio), the last three statistical associations with a floor of **10 meetings on each side**.
   Below it nothing is compared: the lead says how many there are against how many are needed, the
   figures and pairs are not drawn, and whose they were still is, as raw counts. Ten, not the
   agents' twenty: this describes a group of meetings, not a person, and the cohort is small by
   nature (Shark has 19 quarter to date); under ten a median is one or two meetings' figure.
6. **The nested bands stay in the read model** (`BehaviourFunnel.steps`) for the design lab's
   gallery, which draws them per outcome; Sales Flow no longer does, and their CSS is gone.

## What stays out

- **A cause.** Every sentence is a description at its sample sizes; the `i` keeps the old
  disclaimer's point that buyers who arrive uninterested are also shown less.
- **A ranking of presenters.** The roster's order, and no rate under the floor.
- **A date range on the register**, and so links from the month rows.
- **The rest of the page**: the layout stream (ADR-0052) and the portraits stream (ADR-0054) own it.
  This stream changed only the props of the two `OutcomeRows` call sites and the not-interested
  section, and `RankedBars` not at all.

## Consequences

- An agent row adds a line of counts under its bar (about 30px a row, two lines on a phone).
- The flow page has more tab stops: one per drawn outcome part of every row, and one per presenter
  with meetings in the not-interested group.
- `e2e/quality.spec.ts` asserts the new section in place of the nested bands, and counts the two
  outcome mixes by their names; it was written, not run, in this round.
