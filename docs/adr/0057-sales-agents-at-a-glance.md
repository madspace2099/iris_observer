# ADR-0057 — Sales Agents at a glance: the roster by type size, and Coaching as one question

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, commenting on `/shark/shark-residence/agents` while recording the
Shark Residence demo
**Extends:** ADR-0052 (Section titles are 20/28; a definition may stand behind the `i`), ADR-0054
(agent portraits, seat colours)
**Keeps:** the three page rules (`docs/02-views.md`), the agent floor (`AGENT_MIN_SAMPLE`), "never
render an absent value as zero", ADR-0010 (association, never cause), ADR-0021 (a stage is
authoritative)
**Replaces:** the Coaching tab of 2026-10-20 (two lenses, `CoachingReading` beside the chart)
**Numbered 0057** because six streams work in parallel on 2026-10-22 and 0055, 0056 and 0058 are
theirs; 0046 stays unused.

## Context

On 2026-10-22 the owner wrote four comments on the Sales Agents page (Hungarian, translated):

1. "Portraits always beside the names. The ring charts bigger, and centred."
2. "The cards are oversaturated: too much text, too small, and there is no information hierarchy set
   by type size. On every agent's card the same outcome categories — Purchase, Reservation,
   Interested, Follow-up needed, Presentation only, Not interested, Outcome not recorded — and where
   the value is 0, write 0, because that is important information too."
3. "'Across every agent' — I do not understand this chart. Rework it so I understand what it means
   in a few seconds. SIMPLIFY!"
4. "`agents?view=coaching` and `&lens=parallel` — these two panels are a complete mess. Far too much
   text, zero focus. Simplify, absolutely. I do not understand what this panel wants to show."

His recurring complaint is the same in each: a block he cannot read in seconds, small text, no
hierarchy by size.

## Decision

### The roster card: three levels, and nothing between them

1. **Face and name** at Section size (20/28/600), the portrait (ADR-0054) beside it, initials where
   none is set; the agency under it at Meta.
2. **The ring, 176px and centred**, its count in the middle; under it **one headline figure** — the
   progressed rate at Figure size and what it is of ("progressed · 29 of 36 recorded"). The read
   model writes both parts (`AgentProfile.headline`, from `progressedHeadline`, the same rule and
   words as the ring's own figure); under the floor the figure is withheld and the caption says how
   far short it is.
3. **The same seven outcome rows on every card, in ladder order, at Body size**
   (`AgentProfile.outcomes`). An outcome no meeting ended in is printed **0**: a counted outcome
   with no meetings is a measured zero, not an absent value. "Outcome not recorded" keeps its own
   row, so the seven always add up to the ring's count. `ring.slices` still draws only what exists.
   The rows line up across a row of cards (CSS subgrid), so Purchase sits at one height on all five.

What the rate counts, the typical length and the presenter's habit ("leans on…") move behind the
card's `i`; a flag stays in sight, being something to act on. The card's one action is its agent's
page.

### "Across every agent" becomes "Was it the buyer's first meeting?"

A question for a title, rows in plain words ("First meeting", "Second meeting", "Third meeting",
"Fourth or later", "Not linked to a contact" — the Meetings register's words for the same
meetings), every row standing even at 0, each with its count and share, and the share's base under the title ("Share of all 150 meetings, quarter to date",
`AgentsView.repeatsOf`). Why an unlinked meeting is neither a first nor a return stands behind the
`i`.

### Coaching: one question, one sentence, one chart

The tab answers **"How do the presenters differ?"** and nothing else:

- **The answer in one sentence** under the title (`PresenterComparison.headline`): the widest gap in
  plain words, both ends with the meetings their figure is of — "They differ most in comparing two
  apartments side by side: Marek Dvořák did it in 76% of 33 meetings, Oliver Grant in 19% of 26
  meetings." With one agent at the floor it says no two are compared; with none, that nobody is.
- **One chart**: a row per part of the showroom, named as something a meeting did ("Open an
  apartment's PDF"), a dot per agent at the share of **their own** meetings that used it at least
  once, the rows from the widest gap to the narrowest. The base is said once over the rows ("Share
  of each agent's own meetings").
- **At most three concrete differences**: the three widest rows that have a gap name who sits at
  each end, face, name, figure and meetings (`PresenterRow.ends`); ties name everyone at that end.
- **The key** is the chart's control, one entry per drawn agent with their portrait and count:
  pressing a name lifts their dots and prints their figure on every row (`aria-pressed`), a mouse
  resting on it previews the same, and the arrow beside it opens their page — the screen's action.
- **Marks too close to share a line take lanes**: a dot under 7 points from another moves to the
  next lane (`PresenterRow.lanes`, each mark's `lane`), so every agent's dot is visible.
- **Under the floor said, not drawn**: "Not drawn, under 20 meetings:" and each agent's face, name
  (a link to their page) and count. With one agent at the floor there is no chart — one agent has
  no gap — and that agent is named the same way under the answer.
- **Behind the `i`**: what a dot is, the order of the rows, the floor, the parts not measured yet
  (Surroundings places, filters, spaceman mode), "a different way of presenting, not a better one",
  and the comparison's own association disclaimer.

**Which chart, and why only one.** The radar ("how they present") and the parallel plot ("which
parts they use") answered two questions, and with a reading beside each the tab asked the reader to
learn two encodings and three lists. One was kept:

- The **parts of the showroom** are a share of the agent's own meetings, 0 to 100%, on every row:
  nothing is scaled against a colleague, so a dot reads as itself. The radar's spokes are scaled
  against the strongest presenter per spoke, half its axes are medians, and an overlaid shape of
  five agents is the hardest drawing in the product to read in seconds.
- The parallel plot's lines became **dot rows**: the axes were never ordered, so the lines' slopes
  between neighbouring axes carried no meaning, and the rows can be sorted by the gap the headline
  names.
- The radar stays where it says one thing, **one agent's shape on their own page**.

`CoachingReading` (`readAgents`: differences, each agent's most distinctive habit, the outcomes of
meetings with that habit) is retired with the radar lens, and with it `outcomeSplit` and
`behaviourTest`. The outcome split is still available where it belongs, Presentation DNA's cohort
comparison. A `&lens=parallel` address still opens Coaching; the parameter is ignored.

## What stays out

- **No rank and no verdict on a person.** The rows are ordered by the gap between agents, never by
  an agent; the ends are named as where they sit, not as better or worse.
- **No outcome beside a habit** on this tab: setting "meetings that compared progressed in x%"
  beside a person reads as cause. Presentation DNA keeps the cohort comparison with its own floor.
- **No unmeasured part drawn.** The three parts the build cannot answer are named behind the `i`;
  none is drawn at 0.

## Consequences

- `packages/readmodels/src/charts.ts`: `PresenterComparison`, `PresenterRow`, `PresenterEnd`;
  `FeatureUsage.comparison` replaces `.reading`; `AgentRadar.reading` is gone.
  `packages/readmodels/src/views3.ts`: `AgentProfile.headline`, `.outcomes`,
  `RepeatDistribution.shareDisplay`, `AgentsView.repeatsOf`.
- `packages/synthetic/src/showroom/charts.ts`: `comparePresenters`; the feature axes carry `plain`
  and `doing` words. `views3.ts`: `progressedHeadline`, the seven outcomes, the plain repeat rows.
- Page and styles: `agents/page.tsx`, `showroom/CoachingChart.tsx`,
  `components/agents/roster.css` (every rule scoped to the page's `ag-` classes). The old
  `.iris-coach*` rules in `packages/ui/src/charts.css` and `design-lab-d.css` are now unused; they
  sit in files another stream owns this round and are left for a later sweep.
- Tests: `packages/synthetic/test/coaching-comparison.test.ts` (hand-computed: 75/25/75% on 20
  meetings each, the order, the ends, the headline, one and no agent at the floor, Shark's 76% of 33
  and 19% of 26), `roster-card.test.ts`, `apps/web/test/coaching-chart.test.ts`; the e2e that
  quoted "IRIS reading" and the radar's scale sentence now quote the question and the `i`.
- Rendered statically (`react-dom/server`, the product stylesheets, headless Chromium) at 1440, 390
  and 360 on Shark quarter to date, Shark last 28 days (one agent at the floor) and Northgate: no
  sideways scroll, no text under 12px but the shared `i` glyph, one key entry a line on a phone.

## Review round (2026-10-22)

Adversarial reviewers read the branch: fifteen findings, two pairs of them the same defect. Each
was confirmed in the code or on a static render before it was changed. All are fixed; none was
rejected.

- **A flag gave a rate the headline withheld** (two findings). The headline waits for 20 recorded
  meetings, the flag only for 20 held, so Northgate's Akhilesh Undev (22 held, 19 recorded) read
  "No rate yet: 1 short" over "26% progressed against 40% for the team, over 19 recorded meetings".
  The progressed and not-interested flags now wait for the recorded floor in `outcomeFlag`, which
  Sales Flow reads too; the unrecorded count flag stays. Test: 22 held and 19 recorded, 20 held and
  18 recorded, no flag (`roster-card.test.ts`, checked against the unfixed code).
- **Tied agents drew one dot.** Measured at 360: 1 exact and 4 overlapping pairs in one row. Lanes,
  computed in the read model (`markLanes`, hand-computed tests). One gap for every width, so a
  desktop row stacks dots that would have fitted side by side; a gap per width is the upgrade.
- **A tap lifted and hid in one move**, so a phone could never read the unnamed rows' figures.
  Hiding is gone; a press lifts (`aria-pressed`), a mouse previews, a touch is never taken for
  pointing.
- **The not-drawn line had no faces.** Face, name and count each, as the key gives the drawn.
- **One agent drawn still drew seven rows** under "How do the presenters differ?", and the `i`
  described a gap order that did not exist. No rows under two drawn; the one agent is named.
- **The screen-reader summary used the old axis names** in axis order; it now reads the rows' words
  in the rows' order.
- **The card's `i` printed a median under the floor** while the workload list beside it withheld
  it; it is given above the floor only (source assertion in `agents-floor-claims.test.ts`).
- **"Buyer not identified" against the register's "Not linked to a contact"** (two findings): one
  group, one name, the register's, and a missing contact link does not say nobody could identify
  the buyer.
- **Layout.** The ring's count was 36px against the rate's 34px: now 28px, the rate the largest
  figure. The repeat chart's value column was `auto`, so tracks differed by 14px: now fixed. The
  workload list cut every median at 360: the count column is narrower on a phone and the median
  wraps rather than ending in an ellipsis. The key wrapped two names at 360: the link is an arrow
  with a 44px target and the accessible name "Agent page for …".
- **The per-project e2e compared headlines** whose fallback could no longer run; it compares the
  ring's meeting count with the headline.
