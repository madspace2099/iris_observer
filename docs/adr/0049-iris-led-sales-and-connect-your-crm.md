# ADR-0049 — IRIS-led sales are a sequence, and a company connects its own CRM

**Status:** accepted · **Date:** 2026-10-20
**Decided by:** the product owner, while recording the Shark Residence demo
**Extends:** ADR-0039 (an IRIS-assisted sale is an observed sequence), ADR-0010 (evidence tiers),
ADR-0011 (identity resolution deferred), ADR-0036 (CRM connectors), ADR-0043 (company admins)
**Numbered 0049** because 0045 and 0048 are taken and 0046–0047 were held for parallel streams.

## Context

On 2026-10-20, recording a demo of IRIS Observer on `/shark/shark-residence` with the demonstration
CRM connected, the owner wrote (translated from Hungarian):

> The "IRIS LED SALES" analyses are missing, so you cannot see which sales the use of the IRIS
> SHOWROOM app contributed to. For this the user must be able to add their own CRM system, e.g.
> Realpad, Monday.com, Google Sheet, other real estate CRMs. From there it will be readable when a
> flat's availability status changed, and it can be compared with how many times it was shown in
> OBSERVER CLARITY before, while the CRM shows when the availability status changed, so it will be
> clearly visible that the sale is thanks to IRIS.

Two asks: an analysis of which sales the showroom stood behind, and a place where a customer adds
their own CRM. The second is buildable as asked. The first is buildable except for its last clause:
nothing Observer holds links the CRM's buyer (`subjectKey`) to the visitor in the room
(`contactId`), so the product cannot say a sale was _thanks to_ IRIS (ADR-0010, ADR-0011). It can
say, for every sale, how often and how recently the flat was shown before its status changed, which
is what the owner proposes to compare.

## Decision

1. **The owner's name, a rule's definition.** A sale is **IRIS-led** when its flat was opened in an
   IRIS presentation before its status changed: before the date the CRM states for its
   reservation or purchase, or before a sync saw the flat's availability change to reserved or
   sold. It is a rule about order. The tier is `observed_sequence`; the registry metric is
   `flow.iris_led_sales`, with no attribution rule. The page defines it in those words, and the
   one-paragraph caveat — sequence, not cause; the buyer is not linked to the visitor, so the buyer
   may never have seen the flat in IRIS while someone else did; whose dates these are — sits
   behind the info disclosure beside the definition.
2. **What each sale states.** The flat (linking to its page), the CRM's stage and its date, whose
   date it is (ADR-0039 §5: the CRM's instant, else the sync that first saw the change), every
   meeting that opened the flat at or before the change — counted, and said as "in the period" or
   "before it" — the first and last showing, the days from the last showing to the change, who
   presented (linking to their page where they presented in the period), the meetings (linking to
   the replay for a role `[meetingId]` admits), and ADR-0039's 72-hour verdict as one column
   (shown within 72 hours, shown earlier, not shown). ADR-0039's rule and policy are unchanged.
3. **Sales are the period's; showings are the project's history.** A sale is in the period when its
   dated change falls in it (`from` inclusive, the slice's extended end exclusive). Its showings
   are read across every meeting the project has, for ADR-0039 §8's reason.
4. **Totals with denominators, and nothing dropped.** "N of M sales in this period were shown in
   IRIS before their status changed", the 72-hour count over the same M, the median showings and
   the median days from the last showing to the change over the N. Below
   `DEFAULT_IRIS_ASSIST_POLICY.minimumSales` (5) there are counts and no share. A sale with no date
   Observer could use, one dated in the period that names no flat, and a flat the catalogue lists
   as reserved or sold with no date for the change are each counted in a sentence beside the
   figures, never inside them. Sales the showroom never showed are listed, and stay in M.
5. **An availability change is a sale only where it was witnessed.** The catalogue contract states
   no date for a status change (REALPAD's price list has no per-flat time at all). The live
   catalogue source now dates a flat by the sync that first saw it change onto the status it still
   holds (`DeliveredCatalogue.statusObservedAt`), the deals' rule from ADR-0039 §5: a flat first
   seen already sold was `added` on the day the connector was switched on and stays undated. A flat
   the CRM holds a sale for is the CRM's row; the catalogue adds only the rest.
6. **The page** is `/[tenant]/[project]/flow/iris-led`, a drill-down beneath Sales Flow with Sales
   Flow's roles, reached from one line at the end of the IRIS-assisted card. It says IRIS's
   sentence (`SpokenVerdict`, ADR-0048), four figures over their denominators, a timeline with one
   row per sale — a dot for each showing coloured by presenter, on a scale of days before the
   change stretched so the last 72 hours stay legible, ending at the change, the gap drawn — the
   table of sales, the sales never shown, and where it all was read. Every word is the read
   model's (`buildIrisLedSales`).
7. **Connect your CRM** is `/settings/crm`, beside AI and usage. For each project the account holds
   it states the CRM (connected, not connected, or the demonstration CRM), what it reads and when it
   last read, and the providers, each saying what it supports: Realpad (the price list, hourly; deals
   once the export's column ids are mapped), Monday.com (a board of flats; deals from a second
   board), **Google Sheets** (not read directly — there is no Google connector and Observer does not
   read a live sheet; download it as CSV and upload it), CSV upload (a flats sheet and a deals
   sheet; a stage date needs a time and a zone), and other CRMs (CSV, or an adapter MADSPACE builds;
   there is no general webhook receiver). Forms appear only where a save would land: the company's
   admin (ADR-0043), a project on this server's control plane, and for a login or token a server
   with a credential key. The actions use the connector service the MADSPACE integrations screen
   uses, keep any stored mapping, re-authorise on every call, and answer with a sentence. A
   demonstration project shows its built-in CRM as connected and no form.

## Consequences

- On Shark Residence, quarter to date: 19 of 19 dated sales were shown in IRIS before their status
  changed, 8 of 19 within 72 hours, a median of 9 showings and 3 days. Every sale was shown because
  the demonstration CRM derives each deal from a meeting that opened the flat; a real CRM will have
  sales the showroom never showed, and the page lists them.
- A Realpad client with only the price-list scope gets IRIS-led sales from availability changes,
  dated by the hourly sync, from the second sync on: the first sync dates nothing, by design.
- A deals sheet whose stage column holds a date without a time places none of its sales
  (`readInstant`), as ADR-0039 already says; the CSV tile says it before the upload.
- When a deterministic buyer-to-visitor link exists, the same rule restricted to the buyer's own
  meetings becomes an attributed conversion, with its own metric and ADR. Until then the product
  shows the sequence and the owner reads it.
