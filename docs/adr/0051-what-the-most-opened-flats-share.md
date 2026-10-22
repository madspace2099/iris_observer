# ADR-0051 — The most-opened flats are answered by what they share

**Status:** accepted · **Date:** 2026-10-20
**Decided by:** the product owner, while recording the Shark Residence demo
**Extends:** ADR-0010 (evidence tiers), ADR-0039 (an IRIS-assisted sale is an observed sequence),
ADR-0049 (the demonstration CRM's deals are made from meetings)
**Numbered 0051** because 0050 is taken on the feature branch by the report-print stream (ADR-0050,
the report prints as a document); 0046 is held for a parallel stream.

## Context

On 2026-10-20, recording a demo on `/shark/shark-residence`, the owner asked Ask IRIS's suggested
question "Which units draw the most attention, and do they convert?" and wrote:

> ne úgy legyenek leírva hogy "The units drawing most attention are S-503 (29 meetings), S-603 (22
> meetings), S-403 (23 meetings), H-401 (18 meetings), S-501 (22 meetings). 10 of 32 dated sales
> (31%) followed an IRIS showing of the unit within 72 hours." hanem ott legyen figyelve pattern mint
> pl. a közös pattern ezeknél a lakásoknál az hogy mindegyik ilyen és olyan tájolású lakás, ezen az
> emeleten vagy X. emeletnél feljebb van, vagy ilyen árban vannak mind. Ezeket a legtöbbször
> megnyitott lakásokat kell figyelni a közös fellelhető patternok alapján és összefüggéseket keresni
> ott a lakások paraméterei között!

Translated: not a list like that, but the pattern — that these flats all face this way, are on this
floor or above floor X, or are all in this price range. The most-opened flats must be read for the
patterns they share, and relationships sought among the flats' parameters.

The quoted answer had two further faults. It was out of order (29, 22, 23): the tool ranked by
looking time and printed meeting counts. And its second sentence was the whole project's dated
sales, which beside five flats reads as their conversion rate (`PROJECT_WIDE_SALES` existed to
forbid exactly that reading).

## Decision

1. **A read model, `getUnitAttentionPatterns`.** The period's five most-opened flats, ranked by the
   meetings that opened them; a tie by times shortlisted, then by unit code, and the tie is said.
2. **Compared with the whole catalogue**, sold and reserved flats included: a flat is opened
   whatever its status, so every flat could have been among the five. Attributes: aspect, block,
   rooms, floor band (thirds of the building's storeys), price and area.
3. **A line is said only where chance would rarely give it.** A band (an aspect, a block, a room
   count, a storey band) needs **at least 70%** of the five **and** a binomial tail under **1 in
   20** at its catalogue share: four of five in a band holding half the catalogue happens about one
   time in five and is not said; five of five in it (1 in 32) is. Price and area are tested on the
   five flats' **own span**: all five inside a span that five random flats stay inside less than
   one time in twenty (n·s^(n−1) − (n−1)·s^n). Fixed thirds of the catalogue's values were tried
   first and rejected: on Shark the cut fell inside the two-room cluster and the price the owner
   asked about was never said. One test per line, not a correction across the fifteen or so values
   tested, which the caveat says; a Bonferroni bar finds nothing among five flats.
4. **Said as a share against a share**: "All 5 most-opened flats are on the middle floors, 4 to 7,
   against 40% of the 60 flats in the catalogue." "4 of the 5" names the exception ("all but
   H-401"). Two attributes that pick the same flats from the same base, of the same size, are one
   fact ("face south and are in block A"). A span that is not a pattern is still said, with the
   catalogue's share inside it ("They are priced €191,000 to €218,000, a range that holds 35% of
   the catalogue"). An attribute a flat does not state is never a band and counts against a
   concentration, never for it; the denominator becomes the flats that state it, and the sentence
   says so.
5. **Conversion, per flat, split at the period's start.** How many of the five are reserved or
   sold now (the catalogue's status) against the catalogue's share; then the sales dated since the
   period began, each placed by ADR-0039; then the ones dated before it, named as predating the
   period and never credited to its meetings. A sale on a flat the catalogue still lists says so
   in its own sentence. A sale the CRM holds with no date, and a held flat the CRM holds no sale
   of, are told apart. A sale dated by the sync carries ADR-0039's longer-lag note, and the
   demonstration CRM's caveat is printed beside the sales lines.
6. **Below 10 meetings or 3 opened flats nothing is compared**, and the note says how far short.
7. **Association only.** Every sentence is a fact about the flats; none says why a buyer opened
   them, and rooms, area and price move together, which the caveat says.
8. **Where it reads.** Ask IRIS's `analyze_unit_attention`, asked of no unit, answers from it alone
   (the live question routes there). Its draft fits the composer's `ANSWER_CEILING` with the
   ranking always in it: patterns first, then how many are sold, then the spans, then the per-sale
   lines, each kept or dropped whole. A model gets the same facts, with the "nothing concentrates"
   and "too few meetings" notes as limitations. Units carries one section, in the page's own
   section head rather than a chart card, with the same sentences and the five flats as links.

## Consequences

- Shark, quarter to date: S-503 (29 of 150), S-403 (23), S-603 (22), S-501 (22), H-401 (18). All
  five measure 59–65 m² (32% of the catalogue), stand on floors 4–7 (40%) and have two rooms
  (45%); they are priced €191,000–€218,000, a range holding 35%. Four are reserved or sold now
  (60%); both sales dated in the quarter followed a showing within 72 hours, and S-501's
  reservation (10 Feb) and H-401's purchase (26 Mar) predate it. "4 of the 5 face south and are in
  block S, against 50%" is no longer said.
- The thresholds are named constants in `packages/synthetic/src/showroom/unit-patterns.ts`. Raise
  `UNIT_PATTERN_TOP` before tightening the chance bar.
- English only, as every Ask tool reads in `DEFAULT_LANGUAGE`; a model answering in Slovak or
  Hungarian words it from the same facts, under the same causal guard.

## Review round, 2026-10-21

Two adversarial reviewers read the first version. What changed: the 1.5× lift became the chance
test (§3); price and area thirds became the flats' own span (§3); the ranking is kept within the
ceiling and the sales lines split at the period's start (§5, §8); merges compare the denominator;
the catalogue-versus-CRM note stays in its sale's sentence; count words agree; the section lost its
card; the ADR moved from 0050, which the report-print stream holds on the feature branch.
