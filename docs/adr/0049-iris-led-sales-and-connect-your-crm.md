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
   "before it" — the meetings whose order against a sync-dated change is unknown (below), the
   first and last showing, the days from the last showing to the change, who
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
   figures, never inside them, and M is worded as "the period's sales with a date and a flat". The
   page also says, beside the figures, that Sales Flow's IRIS-assisted card applies the same 72-hour
   rule to every dated deal whatever the period, so the card and this page can count differently.
   Sales the showroom never showed are listed, and stay in M. Where the CRM is the demonstration
   CRM, the source note and the never-shown note say that it makes each deal from a meeting that
   opened the flat, so its 100% is how the data was made.
5. **An availability change is a sale only where it was witnessed.** The catalogue contract states
   no date for a status change (REALPAD's price list has no per-flat time at all). The live
   catalogue source dates a flat now reserved or sold by its witnessed **move off the market**
   (`DeliveredCatalogue.statusChanges`), the deals' rule from ADR-0039 §5 made stricter: walking
   the flat's status changes newest first, reserved-to-sold steps further back, and the change from
   a status the mapping knows (available, pre-reserved, …) with the CRM's own word changing too
   dates it, so a flat reserved on the 5th and sold on the 15th is dated the 5th ("Marked reserved,
   now sold"). Undated: a flat first seen already sold (`added`, on the day the connector was
   switched on), a change from `unknown` or with the raw word unchanged (a status word mapped or a
   map fixed — every old sale would otherwise move to that day), and a run whose rows do not chain
   or lie beyond the thousand read. A flat the CRM holds a sale for is the CRM's row; the catalogue
   adds only the rest. A failure reading the changes leaves every flat undated and the delivered
   catalogue in place.

   **A sync-dated change is an interval, and only what came before it counts.** A change dated by
   a sync (a deal whose CRM states no instant, every catalogue move) happened after one sync and by
   the next; the read model is handed both (`stageSeenBeforeAt`, `statusChanges[].seenBefore` —
   the newest sync instant among the change rows read, so a sync that changed nothing is invisible
   and the interval is never narrower than the truth). A showing counts as before the change only if
   it started by the earlier sync; one between the two syncs may have come after the change, so the
   row states it as of unknown order and it is counted nowhere. The gap is measured to the later
   sync, so it reads longer than it was, never shorter, and the 72-hour column can only
   under-count. A sync-dated deal with no earlier sync on record cannot be ordered and is counted
   as undated.

6. **The page** is `/[tenant]/[project]/flow/iris-led`, a drill-down beneath Sales Flow with Sales
   Flow's roles, reached from one line at the end of the IRIS-assisted card. It says IRIS's
   sentence (`SpokenVerdict`, ADR-0048), four figures over their denominators, a timeline with one
   row per sale — a dot for each showing coloured by presenter, on a scale of days before the
   change stretched so the last 72 hours stay legible, ending at the change, the gap drawn — the
   table of sales, the sales never shown, and where it all was read. Every word is the read
   model's (`buildIrisLedSales`).
7. **Connect your CRM** is `/settings/crm`, beside AI and usage. For each project the account holds
   it states the CRM (connected, not connected, or the demonstration CRM), what it reads and when it
   last read (in the project's zone, named), and the providers, each saying what it supports:
   Realpad (the price list, read on save and daily at 06:00 UTC where the scheduled sync is
   configured; deals once the export's column ids are mapped), Monday.com (a board of flats; deals from a second
   board), **Google Sheets** (not read directly — there is no Google connector and Observer does not
   read a live sheet; download it as CSV and upload it), CSV upload (a flats sheet and a deals
   sheet; a stage date needs a time and a zone), and other CRMs (CSV, or an adapter MADSPACE builds;
   there is no general webhook receiver). Forms appear only where a save would land: the admin of
   the company that **develops** the project, or MADSPACE (`mayConnectCrm` — the CRM is the
   developer's, `docs/01-foundation.md` §1 and §4; an agency's admin holding the project, such as
   Tomáš Varga on ISTER TOWER, reads it and gets no form, and every action refuses him), a project
   on this server's control plane, and for a login or token a server with a credential key. The
   actions use the connector service the MADSPACE integrations screen uses and re-authorise on every
   call. The map boxes (columns, status and stage words) are drawn filled with what is stored, as
   the MADSPACE form draws them, so a form sent back as drawn keeps every mapping; settings the page
   does not show are kept by merging over the stored configuration; a new REALPAD price-list pair
   keeps the Data Takeout pair stored beside it (`saveRealpadPricelist`). Every answer is a
   sentence, a flats read naming the status words it met unmapped. A demonstration project shows its
   built-in CRM as connected and no form; a connected project links to its IRIS-led sales, which is
   the way in for a project whose only connection is its catalogue.

## Consequences

- On Shark Residence, quarter to date: 19 of 19 dated sales were shown in IRIS before their status
  changed, 8 of 19 within 72 hours, a median of 9 showings and 3 days. Every sale was shown by
  construction: the demonstration CRM derives each deal from a meeting that opened the flat, and the
  page says so; a real CRM will have sales the showroom never showed, and the page lists them. The
  IRIS-assisted card on Sales Flow counts every dated deal whatever the period, so in a quarter its
  72-hour figure differs from the page's; the page states why beside its figures.
- A Realpad client with only the price-list scope gets IRIS-led sales from availability changes
  from the second read on: the first read dates nothing, by design. The reads are the admin's saves
  and the daily scheduled sync, which runs only once `CRON_SECRET` is set on the deployment (it is
  not yet, PROJECT-STATE); until then a client is dated only as often as someone saves.
- ADR-0039's card on Sales Flow still counts every showing up to the sync that saw a sync-dated
  deal, and its note still says such a lag "reads longer than it was and never shorter". Both are
  true only without a showing between the two syncs. The card's note was being edited by a parallel
  stream and was deliberately left alone here; carrying §5's interval rule into
  `buildAssistedSales` is the follow-up.
- Sales Flow links to this page only from the IRIS-assisted card, which is drawn only where deals
  are delivered. A project whose only connection is its catalogue reaches the page from
  `/settings/crm`; a line on Sales Flow itself waits for that page's other streams to land.
- A deals sheet whose stage column holds a date without a time places none of its sales
  (`readInstant`), as ADR-0039 already says; the CSV tile says it before the upload.
- When a deterministic buyer-to-visitor link exists, the same rule restricted to the buyer's own
  meetings becomes an attributed conversion, with its own metric and ADR. Until then the product
  shows the sequence and the owner reads it.
