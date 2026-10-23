# ADR-0055 — Sold against the plan, said plainly

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, commenting on the Project page while recording the Shark Residence
demo
**Extends:** ADR-0049 (the company admin connects the CRM), ADR-0054 (the same right, the same local
store)
**Keeps:** CLAUDE.md non-negotiables 6 (nothing project-specific in application logic) and 7 (no
metric without a denominator, no verdict without a sample size), ADR-0021 (a deal stage is
authoritative), the skill's §3 (absent is never zero)
**Replaces:** `SalesTarget` and the bullet chart on the Project page, with its hard-coded plan
**Numbered 0055** because 0056 to 0058 are the streams working on the same page and its neighbours
in parallel; 0046 stays unused.

## Context

On 2026-10-22 the owner wrote, about the block on `/shark/shark-residence/project`:

> A 'Sold against the plan' blokk nem igazán érthető. Itt látni kellene azt tisztán hogy a CRM-ből
> kiolvasható legyen az összes lakások száma. Mennyi ideig tart az értékesítés (meg kell adni egy
> időpontot meddig kell mindent eladni) és jelenleg hány eladott lakás van - ezt szintén a CRM-ből
> kell tudnia kiolvasnia az AI-nak. Ezt a blokkot újra kell tervezni.

Translated: the block is not really understandable. It should show clearly the total number of
flats, read from the CRM; how long the sales run (a date must be set by which everything has to be
sold); and how many flats are sold now, also read from the CRM. Redesign this block.

What it showed: two bullet rows, "Sold 24 / 60" and "Sold or reserved 36 / 60", each with a band, a
fill, a "needed by now" mark and a target outline, and a sentence beginning "A straight line
from…". The plan behind them was `2026-01-15` to `2028-06-30`, written into `buildTargets` for
every project — a commercial decision nobody had made, in application code. On a 390-wide phone the
track was 32 px and only the printed "24 / 60" survived.

## Decision

1. **Three answers, the verdict first.** One short verdict; then the stock; then the window and the
   pace. Each fact is said once.
   - **The verdict**, first: "On pace" or "Behind", with a dot in the gain or watch colour, in the
     type scale's Verdict role (34/40; 26/32 on a phone). A state that stands in for a verdict
     (below) is a sentence at 22/30 (20/28 on a phone). The figures under it are in the Figure role
     (40/44, 32/36 on a phone), a step larger, as the design system sets the two roles everywhere
     (`docs/14-design-system.md` §5); the verdict leads by place and weight, not by size.
   - **The stock**: Flats, Sold, Reserved, Available as four large figures, and one bar of every
     flat split the same way. The figures are in words; the bar repeats them and is hidden from
     assistive technology.
   - **The window and the pace**: "Sell out by 30 Jun 2027" as a large figure; one track from the
     sales start to that date with today marked, "Today · 10 months left" above the mark and "From
     12 Jan 2026" under its start, so the sell-out date is printed once. Then the two paces as
     figures of their own, each present when it has a value: "Selling a month 4.7" and "Needed a
     month 4.0". Only beside a stated selling pace, what it stands on ("14 sales dated in the last
     90 days") and "At this pace, sold out in May 2027". With no window there is no "Sell out by"
     figure at all: the verdict already says "No sell-out date set".
     The definitions — what Sold means, the 90 days, the floor, who sets the window — stand behind
     the block's `i`, as the owner asked for less text.
2. **Where each figure comes from.** Flats: every flat for sale in the catalogue the project's
   connector delivers — a delayed flat, or one whose status the source cannot say, included (no unit
   surface draws them, but they still have to be sold by the date); a flat marked not for sale is
   not. Sold and reserved: **the CRM's deal stage for each catalogued flat now** — a deal at purchase
   makes it sold, a deal at reservation and none at purchase reserved; available is every other flat,
   a lost deal included. The catalogue's own status is not read: it is the connector's word, and in
   the synthetic world it carries the building's own sales under the CRM's (Shark's catalogue says
   24 sold where the demonstration CRM has a purchase on 19). A deal at reservation or purchase that
   names no catalogued flat is counted in words beside the split ("1 reservation or purchase in the
   CRM names no flat in the catalogue, not counted." — the demonstration CRM has one on Shark).
   Without a CRM, or a CRM that delivers no deals, the split is not drawn and the block says why —
   never three zeros. The owner's "the AI reads it from the CRM" is kept as Observer keeps it
   everywhere: the figures come deterministically from the connected CRM and catalogue through the
   read model, and no model computes them (see 9).
3. **The pace and its floor.** Selling: catalogued flats whose first purchase the CRM dates in **the
   last 90 days, always** — a saved sales start never shortens the window — a month of 365.25 / 12
   days. A flat is dated by its earliest dated purchase, so a second purchase deal on it is not a
   second sale. A purchase the CRM leaves undated is dated by the sync that first saw it, or counted
   as undated and said so beside the basis. Needed: flats not yet sold (a reservation is not a sale)
   over the months left to the sell-out date; "by" includes the day, so the date has passed only
   from the day after and the last day counts as one day left. Sells out: today plus unsold × 90 ÷
   dated sales. Below `SALES_PACE_MIN_SAMPLE` = 5 dated sales — the floor IRIS-assisted sales
   already use — no selling pace, no sell-out month and no verdict: "Too few dated sales to judge
   the pace (3 of 5)"; the needed pace, which does not rest on the sample, stays in view. Before
   selling starts there is no pace at all. On pace means selling, to one decimal, is at least what
   is needed.
4. **The states that are not a verdict**, each in words: no catalogue; "Unavailable: the CRM is not
   connected"; "Unavailable: the CRM delivers no deals"; "Sold out"; "No sell-out date set";
   "Selling starts on …"; "Past the sell-out date, N flats unsold"; too few dated sales.
5. **The window is project configuration, set by the company admin.** `SALES_WINDOWS` in
   `packages/synthetic/src/world.ts` is each project's configured window; a project absent from it
   has none and says "No sell-out date set" — never an invented date. **Shark Residence's window,
   12 January 2026 to 30 June 2027, is demonstration configuration**: selling began with its first
   showroom presentation, and sixty flats in eighteen months is an ordinary campaign for a scheme
   that size. No other project states one.
6. **Who sets it: the admin of the tenant's own company** (`maySetSalesWindow`, the comparison
   `mayConnectCrm` and `portraitRight` make). On Shark Residence that is Clara Weiss. Daniel Hart
   (the agency's admin), company members and every presenter read the plan and change nothing;
   MADSPACE does not set a customer's commercial plan. The admin sees "Set the sell-out date" or
   "Change the dates" under the window: two native date fields, Save dates, Cancel. Anyone else,
   where no date is set, reads "The admin of Shark Developments sets the sell-out date." A refusal
   goes with the form it answered: a form opened again after Cancel does not start under it.
7. **Where a saved window is kept.** Behind a port, `SalesWindowStore`, the same pattern as the
   portraits: one JSON file per project under `OBSERVER_LOCAL_STATE_DIR/plans/`, named by the
   project id's SHA-256, written to a temporary name and renamed. The repository reads it through
   `salesWindowSource` and puts it in front of the configuration. Where there is no local control
   plane, there is no store: the control is replaced by a sentence — "the project's configured dates
   stand" where it has some, "No sell-out date can be set on this deployment" where it has none — and
   a save is refused with one. The server action `saveSalesWindow` re-authorises every save (signed
   in, holds the project, the right), parses both dates (calendar days, the second after the first),
   and re-renders the page. A file edited by hand that the form would refuse is ignored and the
   configuration stands.
8. **Declared in the registry**: `plan.stock_position`, `plan.sales_pace`, `plan.needed_pace`,
   `plan.verdict`, under the requirement `madspace.sold_against_the_plan`. `SalesTarget` becomes
   `SalesPlan`, which carries the formatted figures, the verdict, the `i`'s definition and a
   one-paragraph summary.
9. **Ask IRIS reads the same plan.** The owner's "the AI must read it from the CRM" outranks the
   pinned tool list: one read-only tool, `get_sales_plan`, hands over `SalesPlan` as the read model
   states it — the stock by deal stage, the window, the dated sales, both paces, the verdict — with
   the summary as its draft. It computes nothing, so the answer and the block cannot disagree, and
   every figure of the draft is among the facts a model is shown. "Are we on track to sell out?" and
   "How many flats are sold?" are routed to it before any reading that takes "sold" for a meeting
   outcome. `apps/web/test/ask.test.ts` pins it in the tool list; the answer's trace calls it "Sold
   against the plan".

## What this does not do

- **No hosted store.** A table behind RLS by tenant is a later milestone; on a hosted deployment the
  configured window stands.
- **No forecast.** "At this pace" extends the last 90 days in a straight line and says so; it is
  not a prediction, and nothing is ranked or attributed by it.
- **The unit surfaces still read the catalogue's status.** The Units register and anything built on
  `catalogueFor` show Shark's catalogue (24 sold), the plan the CRM (19). Making a CRM-statused
  building start every flat available before the CRM's holds are laid over it (`withCrmStatus` in
  `pulse.ts`) would make them agree; it moves every Shark unit figure and is not this block's to
  change.

## Consequences

- Non-negotiable 6 holds again on this block: no date, project or count is in the builder.
- `SalesCoverage` (exported from `components/project`, mounted on no page today) states the plan's
  verdict line instead of a second bullet chart, so it still compiles against `SalesPlan`.
- `BulletChart` stays in `showroom/charts2.tsx` for the design lab's gallery; no product page draws
  it.
- `e2e/p219-screens.spec.ts` keeps "No sell-out date set" in view on Northgate (a CRM, no window,
  and four dated sales: below the floor, so no pace is drawn); `e2e/a11y-contract.spec.ts` opens the
  block's `i`.

## Verification

- `packages/synthetic/test/sales-plan.test.ts`: every state by hand (twenty flats whose split comes
  from the deals, six first purchases dated in the window, 2.0 against 1.8 and 3.7; the catalogue's
  own status ignored; a deal naming no flat; a second purchase; the last day, 334.8 a month; the
  day after), and Shark Residence on the demonstration's day, 24 August 2026: 60 flats, 29 sold, 3
  reserved, 28 available; 19 first purchases since 26 May, 19 / 90 × 30.4375 = 6.4 a month; 31
  unsold over 310 days = 10.185 months, 3.0 a month; 31 × 90 / 19 = 147 days, Jan 2027 (figures
  since the 2026-10-23 amendment below). Northgate: 4 / 2 / 42. A delivered catalogue with a delayed
  and an unknown flat counts both.
- `apps/web/test/sales-plan-window.test.ts`: the right, the parsing, the store, every refusal, and
  the block for Clara, Daniel, Tomáš and Petra, with and without a local plane.
- `apps/web/test/ask.test.ts`: the routing, and the tool's figures on Shark equal the block's.
- Static renders at 1440, 390 and 360 of the page and of every state: no sideways scroll, nothing
  past the block, text 12 px or larger, the date controls 44 px tall on a phone, the title's `i` on
  its last line at 360.

## Review, 2026-10-22 (second round)

Fifteen findings from adversarial reviewers on the branch; each was confirmed in the code (the first
by probing the demonstration CRM) and fixed. None rejected.

| Finding                                                                 | Fix                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Sold / reserved were the catalogue's status, not the CRM's (high)       | Deal stage per catalogued flat (2); unmatched deals counted in words    |
| The pace window shrank to "since selling began", inflating it           | Always the trailing 90 days (3)                                         |
| On the sell-out day the block said the date had passed (reported twice) | Passed from the day after; the last day counts as one                   |
| "0 sales dated in the last 0 days" before selling starts                | No pace before the start; the window is never 0 days                    |
| A second purchase deal counted as a new sale                            | A flat is dated by its first purchase                                   |
| Delayed and unknown flats dropped from Flats                            | Counted as flats for sale; not-for-sale excluded                        |
| Ask IRIS could not answer "Are we on track to sell out?"                | `get_sales_plan` (9)                                                    |
| The paces lived only inside the verdict sentence                        | Two pace figures, each present when it has a value                      |
| The basis line repeated, floated or read "0 of 0"                       | Only under a stated selling pace; too-few verdict carries "(3 of 5)"    |
| The same absence or date said two or three times                        | No "Not set" figure; the sell-out date printed once                     |
| The ADR called a 22 px verdict the block's largest type                 | Verdict role 34/40, and this ADR says what the scale does               |
| The hosted sentence promised configured dates that do not exist         | A second sentence where none is configured                              |
| An old refusal reappeared in a form reopened after Cancel               | The answer Cancel closed on is not said again (no DOM test environment) |
| At 360 the `i` wrapped alone under the title                            | The row does not break before the `i`; the title wraps between words    |

## Amendment, 2026-10-23 — Shark's demonstration CRM signs its reservations

The rules above are unchanged; Shark Residence's figures moved. Its demonstration CRM now signs a
reservation 21 days after it is made, on the same flat (`docs/08-scenarios.md`), so on 24 August
2026 the block reads 60 flats, 29 sold, 3 reserved, 28 available, "Selling a month 6.4", "Needed a
month 3.0", "19 sales dated in the last 90 days", sold out in Jan 2027, still On pace. The example
figures in Decision §1 (4.7, 4.0, 14 sales, May 2027) are those of 22 October.
