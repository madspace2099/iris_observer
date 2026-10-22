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

1. **Three answers, largest first.** One verdict line; then the stock; then the window.
   - **The verdict**, at the block's largest size: "On pace: needs 3.5 a month, selling 4.7",
     "Behind: needs 8.5 a month, selling 4.7", or the state that stands in for a verdict (below).
     Under it, always in view, what the pace stands on: "14 sales dated in the last 90 days".
   - **The stock**: Flats, Sold, Reserved, Available as four large figures, and one bar of every
     flat split the same way. The figures are in words; the bar repeats them and is hidden from
     assistive technology.
   - **The window**: "Sell out by 30 Jun 2027" as a large figure; one track from the sales start to
     that date with today marked and "Today · 10 months left" above the mark; and "At this pace,
     sold out in Apr 2027".
     The definitions — what Sold means, the 90 days, the floor, who sets the window — stand behind
     the block's `i`, as the owner asked for less text.
2. **Where each figure comes from.** Flats: every flat in the catalogue the project's connector
   delivers. Sold and reserved: the status the CRM states for each flat now; available is every
   other flat. Without a CRM the split is not drawn and the block says "Sold, reserved and available
   flats are read from the CRM" — never three zeros. The owner's "the AI reads it from the CRM" is
   kept as Observer keeps it everywhere: the figures come deterministically from the connected CRM
   and catalogue through the read model, and no model computes them.
3. **The pace and its floor.** Selling: distinct flats the CRM dates at purchase over the last 90
   days, or since selling began if that is later, a month of 365.25 / 12 days. A purchase the CRM
   leaves undated is dated by the sync that first saw it, or counted as undated and said so beside
   the basis. Needed: flats not yet sold (a reservation is not a sale) over the months left to the
   sell-out date. Sells out: today plus unsold × window days ÷ dated sales. Below
   `SALES_PACE_MIN_SAMPLE` = 5 dated sales — the floor IRIS-assisted sales already use — no pace,
   no sell-out month and no verdict: "Too few sales to judge the pace: 3 in 90 days, 5 needed". On
   pace means selling, to one decimal, is at least what is needed.
4. **The states that are not a verdict**, each in words: no catalogue; "Unavailable: the CRM is not
   connected"; "Sold out"; "No sell-out date set"; "Selling starts on …"; "The sell-out date has
   passed with N flats unsold"; "Pace unknown: the CRM delivers no dated sale"; too few sales.
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
   where no date is set, reads "The admin of Shark Developments sets the sell-out date."
7. **Where a saved window is kept.** Behind a port, `SalesWindowStore`, the same pattern as the
   portraits: one JSON file per project under `OBSERVER_LOCAL_STATE_DIR/plans/`, named by the
   project id's SHA-256, written to a temporary name and renamed. The repository reads it through
   `salesWindowSource` and puts it in front of the configuration. Where there is no local control
   plane, there is no store: the control is replaced by a sentence, and a save is refused with one.
   The server action `saveSalesWindow` re-authorises every save (signed in, holds the project, the
   right), parses both dates (calendar days, the second after the first), and re-renders the page.
   A file edited by hand that the form would refuse is ignored and the configuration stands.
8. **Declared in the registry**: `plan.stock_position`, `plan.sales_pace`, `plan.needed_pace`,
   `plan.verdict`, under the requirement `madspace.sold_against_the_plan`. `SalesTarget` becomes
   `SalesPlan`, which carries the formatted figures, the verdict, the `i`'s definition and a
   one-paragraph summary.

## What this does not do

- **Ask IRIS has no tool for the project's sales position**, and this ADR adds none: the tool list
  is a product specification (`apps/web/test/ask.test.ts` pins it), and widening it is the owner's
  call. `SalesPlan.summary` is shaped to be the facts of such a tool when it is added; until then
  "Are we on track to sell out?" is answered from the period summary, not from the plan.
- **No hosted store.** A table behind RLS by tenant is a later milestone; on a hosted deployment the
  configured window stands.
- **No forecast.** "At this pace" extends the last 90 days in a straight line and says so; it is
  not a prediction, and nothing is ranked or attributed by it.

## Consequences

- Non-negotiable 6 holds again on this block: no date, project or count is in the builder.
- `SalesCoverage` (exported from `components/project`, mounted on no page today) states the plan's
  verdict line instead of a second bullet chart, so it still compiles against `SalesPlan`.
- `BulletChart` stays in `showroom/charts2.tsx` for the design lab's gallery; no product page draws
  it.
- `e2e/p219-screens.spec.ts` keeps "N sales dated in the last 90 days" in view on Northgate (which
  has a CRM and no window); `e2e/a11y-contract.spec.ts` opens the block's `i`.

## Verification

- `packages/synthetic/test/sales-plan.test.ts`: every state by hand (twenty flats, six dated sales,
  2.0 against 1.8 and 3.7), and Shark Residence on the demonstration's day, 24 August 2026: 60
  flats, 24 sold, 12 reserved, 24 available; 14 dated sales since 26 May, 14 / 90 × 30.4375 = 4.7 a
  month; 36 unsold over 310 days = 10.185 months, 3.5 a month; 36 × 90 / 14 = 231 days, April 2027.
- `apps/web/test/sales-plan-window.test.ts`: the right, the parsing, the store, every refusal, and
  the block for Clara, Daniel, Tomáš and Petra.
- Static renders at 1440, 390 and 360: no sideways scroll, nothing past the block, text 12 px or
  larger, the date controls 44 px tall on a phone with a 2 px focus ring.
