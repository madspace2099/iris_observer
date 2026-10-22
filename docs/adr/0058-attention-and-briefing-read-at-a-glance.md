# ADR-0058 — What needs attention and the Briefing read at a glance

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, while recording the Shark Residence demo
**Extends:** ADR-0052 (Sales Flow reads at a glance: the type scale, the InfoTip), ADR-0034 (the
seam between what we conclude and what was measured)
**Runs beside:** ADR-0055 (PLAN), ADR-0056 (ROOMS), ADR-0057 (AGENTS), and the SHELL and MOBILE
streams, which answer the rest of the same day's comments on other pages.

## Context

On 2026-10-22 the owner went through `/shark/shark-residence/attention` and
`/shark/shark-residence/showroom` as Clara Weiss and wrote the same words for both:

> _"ez a page nem jól átlátható. Legyen rajta az INFORMÁCIÓS HIERARCHIA jobban dizájnolva pl. a
> betűméretek alapján. Simplify! Kevesebb szöveg. Amit kell azt tedd 'info' floating panelbe."_ —
> this page is hard to take in. Design the information hierarchy better, for example by type size.
> Simplify! Less text. Put what is needed into an "info" floating panel.

What the demo showed: on What needs attention a 48px page name, a 20px answer, a 14px lede on the
colour rule, a "How to read this" fold, each raised card's foot of five small chips (tier, three
sources, evidence, sample, rank), and a four-column table whose every check carried its question
under its name — on a phone each of the seven rows repeated the four column names. On the Briefing
a 48px "Briefing", the verdict at 20px, a lede that said the figures in words, a method note beside
"Worth acting on", the three figures at 19px in a box, a foot of small chips, a five-item legend
and a sentence under the building, and each door a heading link, a headline, a question and a
second link to the same place.

A decision the owner has just made outranks every other rule (the skill's source hierarchy). The
honesty rules still hold: no figure without its denominator, no verdict without a sample size,
absent never shown as zero, association never cause — but a denominator or a definition may stand
behind the `i` when the owner asks for less text, as he decided for the Sales Flow lens.

## Decision

1. **The answer is the headline.** Each page's h1 is its answer — "1 of 7 checks raised something
   on Shark Residence, across 150 presentations in this period."; "Against last month, meetings and
   progression held up." — at Sales Flow's verdict size (24 to 36, 600, balanced, 42ch). The page's
   name moves into the kicker ("What needs attention · Shark Residence · Quarter to date"), as Sales
   Flow's does; the breadcrumb still says where the reader came from. The Briefing's signal chip
   and the demo mark share a line under it on a narrow screen.
2. **The figures that matter read first, at the Figure size** (44 on 44 at 600, tabular; 32 on a
   phone), with what each is out of or against under it in view:
   - What needs attention: the checks **raised**, **clear** and **not evaluated**, each "of 7
     checks". The split is the read model's (`AttentionView.tally`), so the page still counts
     nothing, and "nothing raised" and "nothing could be asked" never look alike.
   - The Briefing: its three figures ("66 / 65 last month", "54% / 53% last month", "19 / of 150
     meetings"), each figure's definition behind the `i` beside its name.
     On a phone each figure is a row — its name on the left, the figure on the right — rather than
     three 90px columns that broke "Progressing this month" a word to a line.
3. **Section titles are titles**: 20 on 28 at 600 (`docs/14-design-system.md` §5, ADR-0052), scoped
   to the two pages (`.sheet`, `apps/web/src/components/sheet/sheet.css`) so no other screen moves.
   A raised state's title is 18 at 600, its sentence 15; a check's name 16 at 600, its finding 14.
4. **Every explanation stands behind the existing InfoTip beside the title it explains**:
   - "Raised in this period": the colour rule (red is kept for a record going missing) and the
     ordering rule. The "How to read this" fold is gone.
   - Each raised state: its tier and what it claims, its evidence, sample and rank. Its title, its
     sentence with the state's own figure and denominator, the subjects it is about, its source line
     and its action stay. A state too thin to rank says so in view ("11 of 20 … — stated, not
     ranked"): a refusal is never hidden.
   - "Every check, and what it found": what the register is, each check's question, and the sample
     (n = presentations). The evidence link stays under the register.
   - "The figures behind it": the clause the verdict rests on and the sample. The source line stays
     in view under the figures.
   - "Worth acting on": that it is one thing or none.
   - The building: the stacking plan's key (`StackPlanKey`, the plan drawn with `keyed={false}`),
     and that a cell opens its unit. The counts stay in view at body size, and where the period's
     sales are not observed the line says so ("… 24 sold; how many of them in this period is not
     observed yet").
   - "Where to look next": what each view answers.
5. **The register is a list, not a table.** A row is the answer (the chip), the check's name, what it
   found and the next step, in that order at every width — no column names, no caption. Every check
   still names its next step (R04-7): the raised state's own action, "None needed" or "None on this
   screen". A check that could not be asked says why in its row. A raised check names its card
   ("Above: Meetings ending without a recorded outcome") rather than repeating the card's sentence.
6. **A door has one way in.** The view's name is a heading, the "Open …" button the door; a reader
   tabs once per view, not twice to the same place.
7. **On a phone the controls are a finger's.** Every button on the two pages, the register's next
   step and the `i` are 44px; the Briefing's plan rows are 32px rather than 22, which keeps the
   building one screen tall and makes it read more like one. A raised card's subject chips keep the
   shared chip's 32px (the units screen draws the same chips), and the breadcrumb and the evidence
   links stay inline text links.

## What stays out

- **The shared components keep their behaviour elsewhere.** `StackPlan` takes an optional `keyed`
  (default true), so Units and Project draw their key as before; `Provenance.tsx` gains
  `tierSentence`, and `evidenceText` is exported from the product index. `PageHead`, `Tally`,
  `DataTable`, `.ox-section-title` and the InfoTip are untouched; the sizes are scoped to `.sheet`.
- **The InfoTip target** is 24px on a desktop, as on Sales Flow; on these two pages it is 44px on a
  phone, with negative margins so the line it sits on does not grow. The shared 24px target is
  SHELL's to decide.
- **A per-state evidence link** is not drawn: it opened the same list as the card's action, or the
  demoted outcome-context page. Its words ("19 records · Observed") are in the card's `i`; the
  register's evidence link to that page stays in view, which `nav-reachability.spec.ts` reads.
- **The Clear rows' findings** stay in view: they are short, and they are the register's answer.

## Consequences

- `AttentionView` carries `tally` (raised, clear, unavailable), built in
  `packages/synthetic/src/showroom/attention.ts`; `packages/synthetic/test/screens.test.ts` holds
  that it equals the checks' own answers on every project and that raised equals the states.
- `apps/web/test/answer-sheets.test.ts` (10; 14 after the review round) renders the raised states and the register from the
  Shark read model and reads both pages' source: what is in view, what is behind each `i`, a
  shortfall in view and ranked nowhere, the register a list with every check's three parts, one
  link per door.
- E2E edited, not run (RAM; no dev server or build): `fejezet1` (R04-7 reads the register list, the
  rank and the method from their `i`), `p221-render` (R02-2, R02-5 find "Worth acting on" by its
  heading; R04-2, R04-3 read register rows), `p221-meres` (R04-5 reads the rule from its `i`),
  `showroom` (the verdict is the head's h1; three links in Views), `dontesek1` (the verdict from the
  h1), `a11y-contract` (What needs attention added; the InfoTip popover on both pages).
- Looked at as static renders (the pages through `react-dom/server`, the product stylesheets and
  `sheet.css`, headless Chromium) at 1440, 390 and 360: Shark quarter to date and year to date,
  Northgate as a manager (replay links), Riverside without a CRM (five states raised, none clear),
  and Northgate's last quarter (no verdict, "no earlier period to compare"). No sideways scroll,
  nothing clipped, no text under 12px but the `i` glyph itself (the mark inside a 44px target);
  the breadcrumb and the evidence link stay inline text links. **Not looked
  at on a running page.**

## Review round, 2026-10-22

Adversarial reviewers read the branch; eight findings, two of them duplicates. Each was confirmed
in the code or rejected:

1. **Fixed — the source line went behind an `i`.** `showroom.source_visible` and ADR-0052's second
   round (the same morning) say every surface prints it; this ADR did not supersede either. The
   Briefing's figures and each raised card print `Sources` in view again ("Progressing" reads the
   CRM's deal stages, and nothing else on the plate said so).
2. **Fixed — "24 sold" under a period's kicker.** Where `soldInPeriod` is null (every project but
   one, Shark included) the building's line keeps "; how many of them in this period is not
   observed yet" in view: a refusal, so not an `i`'s.
3. **Fixed — the register said each raised thing twice.** A raised row read the card's sentence word
   for word under another name. It now reads "Above: <card title>"; its step stays the card's own
   action, as R04-7 (verified) requires. **Rejected in part:** dropping the step (R04-7) and
   dropping the "Raised" figure, whose split with Clear and Not evaluated is the read model's tally
   and the reason "nothing raised" and "nothing could be asked" never look alike.
4. **Fixed — §7 overstated the 44px.** Only the doors were 44px; the card's action, "Look at it",
   "Today's briefing" (35px) and the register's step (18px) were not. `.sheet .ox-btn` and the
   step's link are now 44px under 48rem, and §7 says what is and is not.
5. **Fixed — `authorization.spec` read Riverside's refusal sentence, now in a closed panel** (two
   findings). The refusal itself is in view — the Progressing figure is "—" with "no outcome
   recorded on this project", under an h1 saying no outcomes are recorded — so the spec reads that
   figure; the sentence on why stays the `i`'s.
6. **Fixed — two guards read hidden text the wrong way.** `quality.spec` passed on the Sample inside
   a closed panel; it now reads the first figure ("Meetings this …") as visible text. R04-5 read
   `innerText`, which skips closed panels; it now screens every `.iris-info-panel` too.

`apps/web/test/answer-sheets.test.ts` holds 1 to 4 (14 tests). Static renders at 1440, 390 and 360
(Shark and Riverside, both pages): no sideways scroll, every button and step at least 44px on a
phone. E2E edited, not run: `authorization`, `quality`, `p221-render` (R04-3, R04-5), `fejezet1`
(R04-7 matches a raised row to its card by title).
