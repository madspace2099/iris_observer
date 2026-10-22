# ADR-0051 — The most-opened flats are answered by what they share

**Status:** accepted · **Date:** 2026-10-20
**Decided by:** the product owner, while recording the Shark Residence demo
**Extends:** ADR-0010 (evidence tiers), ADR-0039 (an IRIS-assisted sale is an observed sequence),
ADR-0049 (the demonstration CRM's deals are made from meetings)
**Numbered 0051** because 0050 is taken on the feature branch by the report-print stream (ADR-0050, the report prints as a document); 0046 is held for a parallel stream.

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
   rooms, floor band (thirds of the building's storeys), price and area (thirds of the catalogue's
   own values). A value is a pattern when **at least 70%** of the five hold it **and** that is at
   least **1.5×** its catalogue share. 70% rather than the 60% first proposed: with five flats 60%
   is three, which five flats drawn at random from a third of the catalogue reach about one time in
   five (four of five, about one in twenty). Two attributes that pick the same flats in both are one
   fact ("face south and are in block S").
3. **Said as a share against a share**: "All 5 most-opened flats are on the middle floors, 4 to 7,
   against 40% of the 60 flats in the catalogue." Where no band concentrates, the span the flats
   cover is said with the catalogue's share inside it. An attribute a flat does not state is never
   a band and counts against a concentration, never for it; the denominator becomes the flats that
   state it, and the sentence says so.
4. **Conversion, per flat.** How many of the five are reserved or sold now (the catalogue's status)
   against the catalogue's share; then each flat's own dated sale placed by ADR-0039; a sale the CRM
   does not date is named. On Shark the demonstration CRM makes its deals from meetings, which the
   answer states.
5. **Below 10 meetings or 3 opened flats nothing is compared**, and the note says how far short.
6. **Association only.** Every sentence is a fact about the flats; none says why a buyer opened
   them, and rooms, area and price move together, which the caveat says.
7. **Where it reads.** Ask IRIS's `analyze_unit_attention`, asked of no unit, leads with the
   patterns, then the sales, then the ranking; the live question routes to it alone. Units carries
   one panel with the same sentences and the five flats as links.

## Consequences

- Shark, quarter to date: S-503 (29 of 150), S-403 (23), S-603 (22), S-501 (22), H-401 (18); all
  five on floors 4–7 (40% of the catalogue), all two-room (45%), four facing south in block S (50%);
  four reserved or sold (60%).
- The thresholds are named constants in `packages/synthetic/src/showroom/unit-patterns.ts`, not a
  significance test. A binomial test against the base share is the upgrade if a false line shows.
- English only, as every Ask tool reads in `DEFAULT_LANGUAGE`; a model answering in Slovak or
  Hungarian words it from the same facts, under the same causal guard.
