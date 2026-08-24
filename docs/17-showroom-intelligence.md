# Showroom Intelligence — architecture and methodology

**Companion to** `docs/16-showroom-intelligence-audit.md` (what the sources can answer)
and **ADR-0023** (why the showroom is the subject).

This document covers what was built: the information architecture, the two signature
surfaces, the source taxonomy, the comparison methodology, the AI evidence contract,
and what the current sources cannot do.

---

## 1. Information architecture

### Before and after

| Before                              | After                                | Why                                                                    |
| ----------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `/overview` — units sold, revenue, days to close, funnel | `/showroom` — presentation volume, coverage, depth, findings | The CRM already answers the first set. ADR-0023. |
| `/flow` — conversion funnel (primary nav) | reachable, not primary               | A funnel is the CRM's own report with better typography.               |
| `/project` — segment interest       | folded into `/units` and `/storytelling` | Segment interest is a reading of unit attention, not a separate place. |
| `/people` — agent comparison        | `/presentation`                      | Comparing agents is comparing *presentations*, not scoring people.     |
| —                                   | `/presentation` — Presentation DNA   | New. The signature surface.                                            |
| —                                   | `/units` — Unit Attention            | New. Replaces a counter table with explained attention.                |
| —                                   | `/storytelling` — Feature Intelligence | New. How the IRIS story itself is used.                              |
| `/meetings/[id]` — pre-meeting brief | `/meetings/[id]` — replay **or** brief | Same URL. A meeting that has run shows its replay; one that has not shows its brief. |
| —                                   | `/meetings` — the list               | New.                                                                   |

### The four primary sections

`Showroom · Presentation · Units · Storytelling`. All four are rooted in observed
showroom facts. Administration remains outside the customer navigation.

---

## 2. Presentation DNA

**The question:** two agents sell the same building from the same software. What is
different about how they do it?

**The construction.** A lane is one presenter's sequence, built from ordinals alone so
it works on legacy data. Each section in the lane carries:

| Channel        | Meaning                                                          |
| -------------- | ---------------------------------------------------------------- |
| horizontal order | mean position across the lane's meetings — left is earlier      |
| width          | reach rate — how often the lane's meetings got there at all      |
| fill luminance | median dwell, scaled against the lane's own busiest section      |
| dashed + hatched | the source cannot report timing; the sequence is real, the pacing unknown |
| `↺` mark       | the section was returned to after leaving, in >25% of meetings   |

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

| Class                    | What it is                                                  | May lead a screen? |
| ------------------------ | ----------------------------------------------------------- | ------------------ |
| `IRIS_SHOWROOM_OBSERVED` | IRIS recorded it directly                                   | yes                |
| `IRIS_SHOWROOM_DERIVED`  | Observer computed it from observed facts, reproducibly      | yes                |
| `CRM_OUTCOME_CONTEXT`    | what the commercial process concluded                       | **no**             |
| `WEBIRIS_CONTEXT`        | online behaviour before the meeting                         | **no**             |
| `AI_INTERPRETATION`      | a model's prose about evidence it was given                 | never alone        |

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
2. **No perfect correlations.** The dominant term in the outcome model is *buyer
   readiness* — a driver Observer cannot see. Behaviour contributes detectable
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
