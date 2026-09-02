# Showroom Intelligence — architecture and methodology

**Companion to** `docs/16-showroom-intelligence-audit.md` (what the sources can answer)
and **ADR-0023** (why the showroom is the subject).

This document covers what was built: the information architecture, the two signature
surfaces, the source taxonomy, the comparison methodology, the AI evidence contract,
and what the current sources cannot do.

---

## 1. Information architecture

### Before and after

| Before                                                   | After                                                        | Why                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/overview` — units sold, revenue, days to close, funnel | `/showroom` — presentation volume, coverage, depth, findings | The CRM already answers the first set. ADR-0023.                                     |
| `/flow` — conversion funnel (primary nav)                | reachable, not primary                                       | A funnel is the CRM's own report with better typography.                             |
| `/project` — segment interest                            | folded into `/units` and `/storytelling`                     | Segment interest is a reading of unit attention, not a separate place.               |
| `/people` — agent comparison                             | `/presentation`                                              | Comparing agents is comparing _presentations_, not scoring people.                   |
| —                                                        | `/presentation` — Presentation DNA                           | New. The signature surface.                                                          |
| —                                                        | `/units` — Unit Attention                                    | New. Replaces a counter table with explained attention.                              |
| —                                                        | `/storytelling` — Feature Intelligence                       | New. How the IRIS story itself is used.                                              |
| `/meetings/[id]` — pre-meeting brief                     | `/meetings/[id]` — replay **or** brief                       | Same URL. A meeting that has run shows its replay; one that has not shows its brief. |
| —                                                        | `/meetings` — the list                                       | New.                                                                                 |

### The four primary sections

`Showroom · Presentation · Units · Storytelling`. All four are rooted in observed
showroom facts. Administration remains outside the customer navigation.

---

## 2. Presentation DNA

**The question:** two agents sell the same building from the same software. What is
different about how they do it?

**The construction.** A lane is one presenter's sequence, built from ordinals alone so
it works on legacy data. Each section in the lane carries:

| Channel          | Meaning                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| horizontal order | mean position across the lane's meetings — left is earlier                |
| width            | reach rate — how often the lane's meetings got there at all               |
| fill luminance   | median dwell, scaled against the lane's own busiest section               |
| dashed + hatched | the source cannot report timing; the sequence is real, the pacing unknown |
| `↺` mark         | the section was returned to after leaving, in >25% of meetings            |

**What it deliberately does not encode.** Duration as width. A section that takes a
long time is not more important than one that is always reached, and conflating the
two is how "top feature" became the legacy dashboard's only insight.

### Comparison methodology

Four modes: two agents, outcome cohorts, two periods, two meetings.

A comparison is **computed, not narrated**. Eight named behavioural predicates run
over both sides:

```
surroundings_early     reaches Surroundings in the opening third
compare_used           opens Compare mode
returns_before_end     returns to a section before closing
amenities_skipped      never opens Amenities
shortlist_used         opens the Shortlist
environment_used       changes time of day or weather
long_opening           spends over a minute on Home
four_plus_units        opens four or more units
```

Each produces a pair of rates with both sample sizes. Differences below four
percentage points are not shown — a gap smaller than that at these samples is noise
wearing a number's clothes.

**The disclaimer is part of the read model**, not the copy: every comparison carries
`disclaimer`, and a test asserts it says "associations, not". A second test scans
every string any projection emits for causal wording (`because`, `caused`, `drives`,
`leads to`, `results in`, `due to`, `therefore`, `proves`) and fails on a match.

---

## 3. Meeting Replay

**The question:** what actually happened in this meeting?

A chronological rail, not an event table. Sections are the beats; everything else —
units opened, shortlists, plans, balcony views, floor cuts, screenshots, shares,
comparisons, environment changes — hangs off the section it happened inside. Any step
opens to show its provenance and its evidence.

**The honest part.** Only section entries carry a time. Interactions inside a section
are recorded as having happened during it, not at what moment. That is stated once, in
the gaps block, rather than as "time not recorded" beside eleven rows — a caveat
repeated eleven times is a caveat nobody reads.

A session imported from the legacy analytics shows its sequence and no times at all,
with a sentence at the top saying so.

---

## 4. The source taxonomy

Five classes, in the contract rather than in a label
(`packages/contracts/src/provenance.ts`):

| Class                    | What it is                                             | May lead a screen? |
| ------------------------ | ------------------------------------------------------ | ------------------ |
| `IRIS_SHOWROOM_OBSERVED` | IRIS recorded it directly                              | yes                |
| `IRIS_SHOWROOM_DERIVED`  | Observer computed it from observed facts, reproducibly | yes                |
| `CRM_OUTCOME_CONTEXT`    | what the commercial process concluded                  | **no**             |
| `WEBIRIS_CONTEXT`        | online behaviour before the meeting                    | **no**             |
| `AI_INTERPRETATION`      | a model's prose about evidence it was given            | never alone        |

Two predicates make the rule checkable: `isShowroomRooted` and
`isUngroundedInterpretation`. Both are asserted in `apps/web/test/showroom.test.ts`
and enforced at the AI boundary in `apps/web/src/lib/ai/agent.ts`.

### Cohort comparison

Outcomes segment meetings; they are never the subject. The split is stated once in
data (`PROGRESSED_OUTCOMES`) so a comparison cannot quietly redraw the line to make a
pattern look stronger:

- **progressed** — purchase, reservation, interested, follow-up needed
- **did not** — presentation only, not interested
- **neither** — `skipped`. A meeting whose outcome was never recorded belongs to no
  cohort. Folding it into either would invent a result.

---

## 5. Every number explains itself

A column header that says `MTGS` saves four characters and costs the reader the
meaning of the column. `packages/readmodels/src/glossary.ts` holds one definition per
measurement, used by the headers, the info controls and the AI. Each answers four
questions:

- **what it measures** — in a sentence a salesperson would use
- **how it is computed** — the rule, including any threshold
- **where it comes from** — the provenance class
- **what it does not say** — the limit, stated rather than implied

The explanation opens in place rather than on hover: a tooltip cannot be read twice,
is awkward from a keyboard, and does not exist on a touch screen.

---

## 5a. The chart vocabulary

Thirteen shapes, hand-drawn in SVG, in `apps/web/src/showroom/charts.tsx` and
`charts2.tsx`, over read models in `packages/readmodels/src/charts.ts`. No chart
library: a library's defaults are how a product ends up looking like every other
dashboard, and none of these is a default shape.

Each exists because a bar could not carry the question:

| Shape                 | The question it answers                                    | Where        |
| --------------------- | ---------------------------------------------------------- | ------------ |
| Outcome ring          | Parts of one whole, per agent, comparable side by side     | Flow, Agents |
| Paired period columns | Volume against the same days before                        | Flow         |
| Paired rates          | This segment against every other unit                      | Project      |
| Parity scale          | Which side of 1.00× a segment falls on                     | Project      |
| KPI card + sparkline  | A figure, its comparison, and its own recent shape         | Flow         |
| Heatmap               | Two dimensions at once — weekday against hour              | Flow         |
| Annotated line        | A series with the moment something changed marked on it    | Flow         |
| Stacked columns       | Composition, and how the composition itself moved          | Flow         |
| Conversion funnel     | What survives each step, and what falls out                | Flow         |
| Ranked bars           | An ordered list where the order is the finding             | Flow, Agents |
| Radar                 | One presenter across six dimensions, shape as the finding  | Agents       |
| Bullet                | One value against a target and the pace needed to reach it | Project      |
| Stepped alluvial      | Where journeys go, and where they stop                     | Project      |

Four rules the shapes are held to, each because one of them was broken first:

**A funnel means survival.** The bands nest — each is the meetings that did
everything above it as well — so the drop figure beside a band describes
something that happened. The first version counted each behaviour independently
and produced a band wider than the one above it, with a "−3" beside it that
described nothing. Guarded by a test that walks the bands and asserts they never
widen.

**An ordered list is read as a ranking whatever the header says.** So the thing
it is ordered by has to be rankable without implying a verdict on a person. The
agent list is ordered by presentations given, which is workload. Outcome rate is
not on any list; it is on the rings, where every agent is drawn to the same
scale of shares and none is above another (ADR-0023).

**One figure has one value on one page.** A chart bundle reads the same slice as
the view it is drawn on. The radars and the rings disagreed by one meeting
because one read `current` and the other `throughToday`; both now read
`current`. Guarded.

**A radar is a shape, not a score.** Each spoke is normalised against the
strongest agent on that spoke, because a median unit count and a share cannot
share a radius. The six spokes are not weighted against each other and are never
summed. Each spoke names what it measures beneath the chart — a normalised radar
with six one-word axes and no key is a decoration.

The summary window on Sales Flow — today, week, month, quarter, half, year, all
— is the reader's own control and moves independently of the page period. "How
many presentations" is a different question today and this year, and making the
reader move the whole page to ask the second one is how a dashboard stops being
read. A window holding fewer than five meetings says so instead of asserting a
trend from it.

---

## 6. The AI evidence contract

Five stages, in `apps/web/src/lib/ai/agent.ts`:

1. the model picks one or more approved tools and their arguments;
2. the server validates that choice against a Zod schema and the registered tool names;
3. deterministic tools compute the result from Observer read models;
4. the model explains what came back, and only what came back;
5. the application renders the evidence itself, beside the prose.

**The model may not:** query anything, compute an authoritative figure, invent a
missing measurement, alter CRM data, infer sensitive personal attributes, search the
web, or produce a causal claim. The last is enforced by a regular expression over its
output, not by the prompt.

Ten read-only tools: `summarize_showroom_period`, `compare_agent_flows`,
`compare_meeting_cohorts`, `explain_meeting_journey`, `analyze_feature_usage`,
`analyze_unit_attention`, `detect_showroom_behavior_changes`,
`analyze_environment_usage`, `prepare_meeting`, `get_metric_evidence`.

Every answer separates observed facts, interpretation, recommended action,
limitations, confidence and completeness, and evidence links. The refusals are
distinguished: "no registered analysis" and "not permitted to read this" are different
answers, and conflating them would tell a sales agent something false about why they
cannot see a brief.

---

## 7. The synthetic dataset

Fixed seed, 132 meetings, four agents, two comparable periods, 47 of 48 units touched.
Rules it obeys:

1. **Nothing is asserted that the product could not observe.** Every field maps to a
   measurement in the audit; the ones UE5 cannot yet emit are marked, not filled in.
2. **No perfect correlations.** The dominant term in the outcome model is _buyer
   readiness_ — a driver Observer cannot see. Behaviour contributes detectable
   differences (Compare used in 64% of one agent's meetings against 26% of another's)
   and only a ~1.5× association with progression, with exceptions in both directions.
   A test fails if the lift leaves the 1.05–2.2 band or if the exceptions disappear.
3. **The interface says it is synthetic**, on every screen, in the top bar.

---

## 8. What the current sources cannot do

Carried forward from the audit and rendered honestly in the product:

- per-step timing inside a session — only section entries have times;
- filter field, operator and value — so stated demand is unanswerable;
- which POI inside Surroundings was presented;
- compare-set membership and which unit was kept, on real installations;
- share recipient class;
- section exit, so a session ending inside a section loses its last dwell;
- un-favourite, so shortlists only ever grow;
- one named accumulator for feature time — the legacy source has two that disagree.

Each appears in the interface as a stated gap, never as a zero. The instrumentation
backlog is in `docs/16-showroom-intelligence-audit.md` §4, ordered by product value.
