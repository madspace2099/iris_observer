# Showroom Intelligence audit

**Read-only audit** of the legacy IRIS Analytics Dashboard, the UE5 analytics source, and Observer's
own registry — performed to refocus the product on what happens **inside the IRIS Showroom**.

**Sources audited**

| Source                                                                | How                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `https://akhileshundev.github.io/Analytics-Dashboard/`                | via the two supplied captures; no request made to its backend     |
| `1_screencapture-…11_29_07.pdf`                                       | Global Analytics tab, embedded raster extracted and read          |
| `2_screencapture-…11_29_35.pdf`                                       | User / Section Analytics tab, two rasters extracted and read      |
| UE5 `InsightAnalytics` module                                         | inspected previously; findings carried forward and marked         |
| Observer metric registry (82 metrics), `docs/03-event-map.md`, ADRs   | read from this repository                                         |

**No personal data was retrieved and no Supabase row was read or modified.** The dashboard's own
capture shows visitor names (`Vivek`, `Testing-3`, …); those are reproduced here only where they are
needed to describe a defect, and never stored in the application.

> The old dashboard is a **measurement inventory**, not a visual reference. Its layout — nine KPI
> cards, a donut, three bar lists and a max/min "Insights" strip — is explicitly not the foundation
> for the new Observer. See §6.

---

## 1. The product correction, stated once

The CRM records what the commercial process **concluded**. IRIS Observer explains what happened
**inside the IRIS presentation** before that conclusion.

Observer's primary subject is behaviour inside the Unreal Engine showroom: how the agent presents,
in what order, what is skipped, where the presentation slows or returns, which units draw attention,
which arguments are used. CRM data is admissible only as an **outcome label**, a **later-stage
validation signal**, or **cohort context** for comparing showroom behaviour against results.

**Every primary insight must be rooted in at least one observed IRIS Showroom fact.** This is
enforced by `ADR-0023` and by an automated guard (`packages/metrics` + `apps/web/test`), not by
editorial discipline.

---

## 2. What the legacy dashboard actually measures

### 2.1 Session and identity

| Measurement          | Evidence in the capture                                            | Availability      | Data quality                                                                                  |
| -------------------- | ------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------- |
| Session record       | "All Visitors" table, 7 rows                                       | `legacy_available` | One row per visitor session. Sound.                                                            |
| Visitor name         | `Vivek`, `Testing`, `Testest2`, `Testing-3`, `Visitor_06`, …       | `legacy_available` | Free text typed by the agent. Five of seven rows are test data. No contact identity behind it. |
| Sales agent          | every row `Akhilesh`                                               | `legacy_available` | One agent only. **No multi-agent data exists**; agent comparison is unproven against real data. |
| Session start        | `Aug 19 · 15:04:27`                                                | `legacy_available` | Real wall-clock timestamps. Better than previously assumed.                                    |
| Session end          | `Aug 19 · 15:06:21`                                                | `legacy_available` | Present.                                                                                       |
| Session duration     | `1m 54s`, `39s`, `27s`, `51s`, `0s`, `25s`, `29s`                  | `legacy_available` | **A 0s session is recorded as a session.** Longest is 114s. Nothing is a real meeting.         |
| Meeting outcome      | `Presentation`, `Follow-up needed`, `Not interested`, `Presentation only`, `Purchase` | `legacy_available` | Agent-selected at the end. `Presentation` and `Presentation only` are two labels for one idea. |

**Finding.** Session timestamps *do* exist. The earlier concern was about **per-event** timestamps
inside the session, which the Journey Flow shows only as an ordinal sequence — see §2.4.

### 2.2 Feature and section engagement

| Measurement            | Evidence                                                              | Availability      | Data quality                                                                                       |
| ---------------------- | --------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| Feature clicks         | Global Clicks: `Amenities 1`, `Skip Intro 1`                          | `legacy_available` | Counter only. No timestamp, no session link at event level.                                        |
| Feature open count     | derived: `Amenities 6, Home 2, Residences 2, Surroundings 2, Maps 2`   | `legacy_available` | Labelled "(derived)" in the dashboard itself — it is recomputed, not recorded.                     |
| Total time per feature | `Amenities 45.56s, Surroundings 30.16s, Residences 27.68s, …`         | `legacy_available` | **Inconsistent with the hierarchy panel** — see the defect below.                                  |
| Average time / feature | `Amenities 10.67s`                                                    | `legacy_available` | Total ÷ opens. No median, so one long dwell dominates.                                             |
| Top feature            | `Amenities`                                                           | `legacy_available` | An argmax over the above.                                                                          |
| Engagement badge       | `High` in the Full Feature Breakdown                                  | `legacy_available` | **Threshold undocumented.** One feature with one click is graded "High".                           |

> **Defect — the same quantity has two values.** The "Total Time per Feature" panel reports
> `Amenities 45.56s` and `Surroundings 30.16s`. The Hierarchy Analytics Explorer, on the same screen
> and the same filter, reports `Amenities 44.13s` and `Surroundings 11.13s`. Surroundings differs by
> **2.7×**. Two accumulators are counting different things under one name. Any Observer metric built
> on legacy feature time must state which accumulator it used, or refuse the number.

### 2.3 Hierarchy analytics

The richest thing the legacy system holds.

- Node kinds observed: **`SECTION`** (`Amenities` — 11 items; `Surroundings` — 5 items) and
  **`OPTION`** (`Residences`, `Google Maps`, `Home`).
- Per node: total time, open count, click count. `Amenities 44.13s · 24 opens · 24 clicks`.
- Nested items resolve to real content: `Amenities › Car parking entrance`, `› Ister Tower`,
  `› Butique / Shop`, `› Fitness`, `› Pharmacy`, `› Grocery Store`, `› Kids Zone`.
- "Top Interests" ranks every screen and sub-action by aggregated time.

| Measurement           | Availability      | Data quality                                                                       |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| Section usage         | `legacy_available` | Sound at the aggregate.                                                            |
| Category / item usage | `legacy_available` | Depth is two levels in practice; the schema implies more but no data exercises it. |
| Opens vs clicks       | `legacy_available` | Identical in every observed node (24/24, 2/2, 5/5). Probably the same event twice. |

### 2.4 User Journey Flow — the most valuable and most limited signal

The capture shows, per visitor:

```
Vivek   · via Akhilesh · 1m 54s
1. Home   2. Residences   3. Amenities   4. Surroundings   5. Home   6. Weather
```

| Property                    | State                | Note                                                                                     |
| --------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| Section order               | `legacy_available`    | The ordinal path is recorded. **This is the seed of Presentation DNA.**                  |
| Revisits                    | `partially_derivable` | `Home` appears at 1 and 5 — a return is visible because the sequence repeats a label.    |
| Skipped sections            | `partially_derivable` | Derivable only against a known section inventory; the legacy data does not carry one.    |
| Per-step timestamp          | `requires_ue5_v2_event` | The panel says "including filter state & sub-actions" but exposes only ordinals.        |
| Per-step dwell              | `requires_ue5_v2_event` | Time exists per *feature in aggregate*, not per *step in the path*.                      |
| Transition timing           | `requires_ue5_v2_event` | Cannot say how long the presentation paused between Residences and Amenities.            |
| Step count                  | `legacy_available`    | Shown as "6 steps · top: Surroundings" in Most Engaged Visitors.                          |

**This is the single most important gap.** Presentation DNA can be built on ordinals alone —
sequence, coverage, skips, returns, transitions. It cannot be built with *pacing* until UE5 v2 emits
a timestamp per step.

### 2.5 Unit (apartment) interactions

| Measurement            | Evidence                                                | Availability      | Data quality                                                             |
| ---------------------- | ------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| Apartment views        | `IT 13 B7 · Views 2`                                    | `legacy_available` | Counter per unit per visitor.                                             |
| Apartment dwell        | `IT 13 B5 · 10.64s`                                     | `legacy_available` | Aggregate; no per-view distribution, so no median.                        |
| Favourites             | `Favorite` badge; 6 in the filter                       | `legacy_available` | Boolean per unit per visitor. No un-favourite event, so no reversal.      |
| PDF opens              | `PDF` badge on `IT 12 B12`, `IT 13 B4`                  | `legacy_available` | Boolean, not a count.                                                     |
| Balcony views          | `Balcony 1` on `IT 13 B5`, `0` elsewhere                | `legacy_available` | Counter. Present but almost unexercised.                                  |
| Floor-cut views        | `Floor Cut 0` on every card                             | `legacy_available` | Counter exists; **no observed data at all**.                              |
| Apartments interacted  | `5 distinct units`                                      | `legacy_available` | Sound.                                                                    |
| Unit registry join     | **`Not found in registry`** on all five cards           | `crm_outcome_context` / catalogue | **Broken.** No unit attributes: no rooms, area, orientation, price, floor. |
| Compare-mode use       | absent                                                   | `requires_ue5_v2_event` | Never measured. `docs/03-event-map.md` §8 flagged it as one of the three strongest untracked signals. |
| Share action           | absent                                                   | `requires_ue5_v2_event` | Same.                                                                     |

> **Defect — the catalogue is not joined.** Unit codes (`IT 13 B5`) are recorded as free strings
> that resolve to nothing. Without the registry, "which segment draws attention" is unanswerable,
> which is the question the developer is actually paying for.

### 2.6 Storytelling and environment

| Measurement           | Evidence                                        | Availability      | Data quality                                                                     |
| --------------------- | ----------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| Time-of-day selection | `Golden 1 · Evening 1 · Morning 1 · Afternoon 1` | `legacy_available` | Counters. Panel says "last known state plus aggregated counts" — two ideas, one panel. |
| Weather selection     | `Rain 2 · Snow 1 · Cloudy 1`                    | `legacy_available` | Counters only. No link to which unit or section was on screen at the time.          |
| Surroundings / POI    | `Surroundings` as a section, 5 items            | `partially_derivable` | Section-level time exists; **which POI** was presented does not.                    |
| Amenity presented     | `Amenities` 11 items, named                     | `legacy_available` | Item level exists here, which is why amenities are richer than POIs today.          |
| Screenshots           | `3 all sessions`, per-session column            | `legacy_available` | Counter. Concentrated entirely in one session.                                     |
| Screenshot enhance    | absent                                           | `requires_ue5_v2_event` | The "enhance" step in the showroom flow is not measured.                            |
| Interior link opened  | absent                                           | `requires_ue5_v2_event` | Interiors are external web links; no post-back exists.                              |

### 2.7 Filters

| Measurement         | Evidence                                                                 | Availability            |
| ------------------- | ------------------------------------------------------------------------ | ----------------------- |
| Filter use          | Journey Flow claims "including filter state"; nothing is displayed        | `partially_derivable`   |
| Filter state values | not exposed anywhere in the capture                                       | `requires_ue5_v2_event` |
| Zero-result search  | not measured                                                             | `requires_ue5_v2_event` |

### 2.8 CRM-derived figures on the legacy screen

| Measurement                                    | State on the capture | Classification         |
| ---------------------------------------------- | -------------------- | ---------------------- |
| Presentations / Reservations / Purchases cards | `0`, `0`, `0`        | `crm_outcome_context`  |
| Conversion Funnel                              | "No conversion funnel data recorded." | `crm_outcome_context` |
| Session outcome distribution                   | 1/2/1/2/1 over 7      | `crm_outcome_context`  |

Three of the ten top-level KPI cards are CRM figures, and all three read zero. **The opening screen
of the legacy dashboard leads with a funnel that has never had data in it.** This is the drift the
refocus corrects.

---

## 3. Every measurement, with its proposed reinterpretation

`◆` = the reinterpretation Observer implements. Availability states are those defined in §0.

| # | Legacy measurement | Availability | Business question it can answer | ◆ Observer interpretation | Visualization |
|---|---|---|---|---|---|
| 1 | Session count | `legacy_available` | How much did we present this period? | Presentation volume, with coverage quality beside it | figure + sparkline |
| 2 | Session start / end / duration | `legacy_available` | Are presentations getting longer or shorter? | Presentation length distribution, median not mean | distribution strip |
| 3 | Sales agent | `legacy_available` | How do agents differ in *how* they present? | Agent flow comparison | Presentation DNA, two lanes |
| 4 | Visitor / meeting | `legacy_available` | Which meeting was this, and what happened in it? | Meeting Replay | chronological rail |
| 5 | Meeting outcome | `crm_outcome_context` | What did meetings that went further have in common? | **Cohort label only.** Never a headline. | cohort switch on every comparison |
| 6 | Feature clicks | `legacy_available` | What dominated the presentation? | Presentation emphasis | attention distribution bar |
| 7 | Feature open count | `legacy_available` | What is returned to? | Return rate per section | opens ÷ meetings |
| 8 | Total feature time | `legacy_available` | Where does the presentation actually spend itself? | Emphasis share, with the accumulator named | stacked share |
| 9 | Average feature time | `legacy_available` | Is a section skimmed or worked? | Median dwell, mean shown only beside n | dwell band |
| 10 | Section / category / item usage | `legacy_available` | How deep into IRIS does the presentation go? | Presentation depth | hierarchy drill, depth-coloured |
| 11 | User Journey Flow | `legacy_available` (ordinal) | In what order is the story told? | **Presentation DNA** | sequence lanes + transition graph |
| 12 | Section order | `legacy_available` | Does Surroundings come early or late? | Position-in-presentation index | position histogram |
| 13 | Most opened sections | `legacy_available` | What is the spine of the presentation? | Spine vs. optional sections | ranked lanes |
| 14 | Skipped sections | `partially_derivable` | What is never shown? | Coverage gap, against the project's section inventory | coverage meter + gap list |
| 15 | Revisited sections | `partially_derivable` | What do buyers pull the agent back to? | Return signal | loop marks on the DNA lane |
| 16 | Apartment views | `legacy_available` | Which units draw attention? | Unit Attention | spatial building, luminance |
| 17 | Apartment dwell | `legacy_available` | Which units are examined, not glanced at? | Meaningful dwell (≥15s, ADR-0016) | dwell column on the unit |
| 18 | Favourites | `legacy_available` | What was shortlisted? | Intent-strengthening interaction | unit badge + timeline mark |
| 19 | PDF opens | `legacy_available` | What was taken away? | Intent-strengthening interaction | as above |
| 20 | Balcony views | `legacy_available` | Was the view argument used? | Examination depth | as above |
| 21 | Floor-cut views | `legacy_available` (no data) | Was the layout argument used? | Examination depth | as above, empty state honest |
| 22 | Screenshots | `legacy_available` | What did the buyer want to keep? | Intent-strengthening interaction | as above |
| 23 | Filter use / state | `requires_ue5_v2_event` | What were they actually looking for? | Stated demand vs. available stock | filter → matching stock |
| 24 | Time-of-day selection | `legacy_available` | Which light is used to sell? | Storytelling pattern | preset usage, paired with section |
| 25 | Weather selection | `legacy_available` | Is weather an argument or a toy? | Storytelling pattern | as above |
| 26 | Surroundings / POI | `partially_derivable` | Which neighbourhood arguments are made? | POI argument usage | POI list, section-level today |
| 27 | Apartment registry | broken | What kind of unit is this? | **Blocking.** Unit attention is uninterpretable without it. | — |
| 28 | Compare mode | `requires_ue5_v2_event` | Which units were weighed against each other? | Comparison graph, win rate | competition graph |
| 29 | Share | `requires_ue5_v2_event` | Who else is in the decision? | Second-decision-maker signal | timeline mark |
| 30 | Presentations / Reservations / Purchases | `crm_outcome_context` | Did it convert? | Cohort labels and validation only | never a headline figure |
| 31 | WEBIRIS pre-visit behaviour | `webiris_context` | What did they look at before arriving? | Pre-meeting brief context | brief only |

---

## 4. What Akhilesh must instrument next (UE5 v2)

Ordered by product value, not by implementation cost. **Fact names, not event names** — the UE5
implementation maps onto these later (ADR-0013).

| Priority | Observable fact                                                          | Why it is worth the work                                                                                |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1        | timestamp on **every** journey step                                       | Turns the ordinal path into pacing: where the presentation slows, stalls, or is rushed.                  |
| 2        | `unit.compared` — the comparison set, and which unit was kept             | The strongest untracked buyer signal. `docs/03-event-map.md` §8.                                        |
| 3        | `catalogue.filtered` — filter field, operator and value                   | Stated demand. Lets Observer say what buyers ask for that the project does not have.                     |
| 4        | `unit.shared` — recipient class, not address                              | Reveals the second decision-maker who never entered the room.                                            |
| 5        | `surroundings.poi.presented` — **which** POI                              | POIs are the neighbourhood argument; today only the section is known.                                    |
| 6        | section **exit** as well as entry                                        | Without an exit, dwell is inferred from the next entry and a session that ends inside a section is lost. |
| 7        | `visual.enhanced`                                                        | The enhance step is a deliberate act of interest; currently invisible.                                   |
| 8        | stable `unit_id` joined to the catalogue, not a display string           | Fixes `Not found in registry` at the root.                                                              |
| 9        | canonical `meeting_id` minted by Observer (ADR-0017)                     | Lets a showroom session, a CRM appointment and a WEBIRIS visit be one meeting.                           |
| 10       | `unit.interior.opened` post-back from the interior platform              | Interiors are currently a black hole; open question with MADSPACE.                                       |
| 11       | un-favourite / de-shortlist                                             | A reversal is information; today favourites only ever accumulate.                                        |
| 12       | one accumulator for feature time, named in the payload                    | Ends the 45.56 vs 44.13 contradiction at source.                                                        |

---

## 5. Observer coverage today, and what changes

The registry holds 82 metrics. Classified by the new taxonomy:

| Class                     | Metrics | Examples                                                                    |
| ------------------------- | ------- | ---------------------------------------------------------------------------- |
| `IRIS_SHOWROOM_OBSERVED`  | 21      | `project.attention_index`, `unit.active_dwell`, `project.environment_interest` |
| `IRIS_SHOWROOM_DERIVED`   | 16      | `people.presentation_coverage`, `unit.demand_trend`, `product.unit_selection_method` |
| `CRM_OUTCOME_CONTEXT`     | 28      | every `flow.*`, `exec.units_sold`, `exec.revenue`, `exec.avg_days_to_close`  |
| `WEBIRIS_CONTEXT`         | 9       | `webiris.*`, `journey.webiris_to_showroom`                                  |
| mixed / structural        | 8       | `exec.data_completeness`, `journey.cross_channel_completeness`               |

**28 of 82 metrics — the largest single class — are CRM-only, and they currently lead the product.**
That is the drift. The correction is not to delete them; it is to demote them to cohort context and
promote showroom-rooted intelligence to the primary coverage dimension.

---

## 6. Why the legacy dashboard is not a visual reference

Recorded so the decision is not relitigated:

1. **It leads with an empty funnel.** Three of ten KPI cards are CRM figures reading `0`, and the
   first full-width panel is a conversion funnel with no data. The opening screen answers a question
   the CRM already answers, badly.
2. **"Insights" repeats the extremes.** `MOST TIME SPENT FEATURE: Amenities` /
   `LEAST TIME SPENT FEATURE: Amenities` — the same feature, because there is only one. An insight
   that is an argmax is not an insight.
3. **Nine identical rectangles.** The KPI grid gives a count of 1 the same visual weight as 116
   seconds of engagement.
4. **The donut adds nothing.** Two categories, both labelled with their value beside it.
5. **It grades without a rule.** `Engagement: High` on one click.
6. **It contradicts itself on one screen.** §2.2.
7. **`Not found in registry`** is shown to the user as a normal state.

What it *does* well and Observer should keep: the **User Journey Flow** with its numbered path, the
**Hierarchy Analytics Explorer** with time/opens/clicks per node, and the honest labelling of derived
figures as "(derived)".

---

## 7. Honest limitations of this audit

- The capture shows **one project, one agent and seven sessions, five of which are test rows.** No
  claim in this document about *behaviour* is a claim about real buyers; they are claims about what
  the system can and cannot record.
- The live dashboard's backend was not queried. Availability states come from what the UI displays
  and from the previously inspected UE5 source, not from a schema dump.
- `partially_derivable` means *derivable given an inventory Observer supplies* — usually the project
  section list or unit catalogue. If that inventory is absent, the measurement degrades to
  `requires_ue5_v2_event`.
- The legacy system stores pre-aggregated counters. Nothing in it can be re-cut by a new definition
  after the fact, which is the capability Observer's event spine exists to provide.
