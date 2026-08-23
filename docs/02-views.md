# IRIS Observer — Views, Metrics and the AI Layer

**Status:** concept, v0.1 · **Date:** 2026-08-24 · **Depends on:** [`01-foundation.md`](01-foundation.md)

> **Amended by [`03-event-map.md`](03-event-map.md) (2026-08-24)** after the Showroom IRIS UX flow was
> documented: the outcome model expands from three values to six (adding `not_interested`, which is what
> makes true conversion computable), and new measures arrive for share, POI coverage, presentation
> coverage and the Compare-Mode competition graph. See §9 there.

> **Amended by M1 (2026-08-24).** The confirmed product areas supersede the four-lens naming used
> below: Executive Overview, Project Intelligence, Unit Intelligence, Sales Agent Workspace, Sales
> Flow, Meeting Intelligence, Behaviour Intelligence, Period Comparison, Reports and MADSPACE
> Administration. The page pattern, the metric discipline and the sequencing argument here all
> still hold. The unified journey adds **no** primary navigation item: the pre-meeting brief lives
> in the agent Overview and the Meeting drill-down, and the full journey in the Contact drill-down
> under People. See `docs/04-journey.md` §5.

Visual design system and component specs: `04-ui-ux.md` (not yet written).

---

## 1. The page pattern: verdict first

Stano's test is that within ten seconds you know whether things are good, bad, or worth attention.
That is not a layout problem, it is a **computation** problem: the verdict has to be calculated, not
left for the reader to infer from a wall of boxes.

Every screen in Observer has the same four-part anatomy, in this order:

```
┌───────────────────────────────────────────────────────────────────────┐
│ ● VERDICT   One computed sentence, with the number inside it.         │
│             "Ister Tower is selling 18% slower than in Q1 —           │
│              at this rate it sells out in March 2028, not late 2027." │
│                                                                        │
│  4.1 sales/mo      2.3 mo to offer     31 units left                  │
│  ▼ 18% vs Q1       ▲ 0.4 vs project    of 96                          │
├───────────────────────────────────────────────────────────────────────┤
│ EVIDENCE    The one chart that proves the sentence. Not six charts.   │
├───────────────────────────────────────────────────────────────────────┤
│ WHO / WHAT  The rows behind the number. Always drillable to meetings. │
├───────────────────────────────────────────────────────────────────────┤
│ ACT         What you can do about it, from here, without leaving.     │
└───────────────────────────────────────────────────────────────────────┘
```

Three rules enforce it:

> **No metric without a denominator. No verdict without a sample size. No screen without an action.**

The MVP fails all three: `Total Clicks: 4,318` has no denominator, the funnel shows all-time totals with
no comparison, and nothing on any screen can be acted upon. That is the entire substance of Stano's
critique, expressed as three checks a designer can actually apply.

---

## 2. The semantic layer

One typed metric layer serves the UI, the exports and the AI. Nothing computes metrics anywhere else.
Every measure below has an exact definition, because "engagement" that means three different things on
three screens is how a dashboard loses trust.

### 2.1 Dimensions

| Dimension          | Values                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `project`          | Ister Tower, …                                                                           |
| `period`           | week, month, quarter, year, project-to-date, custom                                      |
| `agent` / `agency` | who ran the meeting                                                                      |
| `segment`          | `rooms`, `floor_band`, `orientation`, `price_band`, `surface_band`, `building`, `status` |
| `contact`          | the identified visitor                                                                   |
| `outcome`          | presentation, reservation, purchase (extended in §2.4)                                   |
| `environment`      | time-of-day preset, weather                                                              |
| `language`         | meeting language                                                                         |

`segment` is the dimension the MVP could not express at all, and it is the one the developer cares about
most. It requires the unit catalogue from the CRM (§4 of the foundation doc).

### 2.2 Meeting measures

| Measure                | Definition                                                      |
| ---------------------- | --------------------------------------------------------------- |
| `meetings`             | meetings started in period                                      |
| `contacts`             | distinct contacts met                                           |
| `repeat_rate`          | contacts with ≥2 meetings ÷ contacts                            |
| `duration_p50` / `p80` | meeting length, percentiles — never a mean                      |
| `breadth`              | distinct units shown per meeting                                |
| `depth`                | median dwell per unit shown                                     |
| `completeness`         | meetings with contact identified **and** outcome set ÷ meetings |

`completeness` is a product metric, not a vanity metric. It measures whether agents are actually feeding
the system, and every other number is unreliable in proportion to it. It is displayed permanently, and it
is the early-warning signal for the goodwill problem in §1.2 of the foundation doc.

### 2.3 Interest measures (per unit or per segment)

| Measure                    | Definition                                     | Why                                                        |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `viewers`                  | distinct contacts who opened it                |                                                            |
| `reach`                    | `viewers ÷ contacts` in period                 | **This is Stano's "62% of clients" — with a denominator.** |
| `dwell_total`, `dwell_p50` | time on the unit                               |                                                            |
| `attention_share`          | dwell on segment ÷ total unit dwell            |                                                            |
| `inventory_share`          | units in segment ÷ all units                   |                                                            |
| **`attention_index`**      | `attention_share ÷ inventory_share`            | >1 = draws more attention than its size warrants           |
| `deep_dive_rate`           | (balcony + floor-cut + PDF + interior) ÷ views | separates "clicked past" from "seriously considered"       |
| `shortlist_rate`           | favourited ÷ viewers                           | the strongest in-app intent signal                         |
| `return_rate`              | viewed across ≥2 meetings by the same contact  |                                                            |

`attention_index` is the workhorse of the project view. It answers "are the two-room flats interesting?"
in a way that is comparable across segments of different sizes — which a raw view count never is.

### 2.4 Pipeline measures

The stage ladder, and **who owns each stage**:

| Stage       | Source   | Definition             |
| ----------- | -------- | ---------------------- |
| Met         | Observer | a meeting happened     |
| Engaged     | Observer | deep-dive on ≥1 unit   |
| Shortlisted | Observer | ≥1 unit favourited     |
| Offered     | CRM      | a price offer exists   |
| Negotiating | CRM      | offer under discussion |
| Reserved    | CRM      | reservation signed     |
| Sold        | CRM      | contract signed        |

> **Observer owns the top of the funnel, the CRM owns the bottom, and the join is the product.**
> Neither system can draw this ladder alone. That is precisely why it is defensible.

| Measure                 | Definition                                 |
| ----------------------- | ------------------------------------------ |
| `stage_conversion`      | forward conversion between adjacent stages |
| `time_in_stage_p50/p80` | dwell in each stage                        |
| `meetings_per_deal`     | meetings before the first offer            |
| `time_to_first_offer`   | first meeting → offer                      |
| `sales_cycle_p50/p80`   | first meeting → sale                       |

**Durations are always reported as p50 and p80, never as a mean.** Stano asked the question in exactly
this shape — _"3 to 8 weeks, or 2 to 6 months"_ — because a planning answer is a range. A mean sales cycle
is a number nobody can plan a campaign with.

### 2.5 Velocity and forecast

| Measure           | Definition                                               |
| ----------------- | -------------------------------------------------------- |
| `sales_velocity`  | sales ÷ week, trailing 8 and 12 weeks                    |
| `absorption_rate` | sales ÷ available inventory, monthly                     |
| `sellout_eta`     | remaining ÷ velocity, with a band from velocity variance |
| `segment_sellout` | the same, per segment — surfaces what will _never_ clear |

`sellout_eta` is the highest-value number in the system for the buyer, because it drives construction
financing timing. It should be on the developer's home screen, always.

---

## 3. Statistical honesty

The MVP renders a "Most Engaged Visitors" leaderboard from two sessions. Repeating that would destroy
credibility with exactly the audience whose trust the product needs.

| Rule                       | Enforcement                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Minimum sample**         | no agent comparison below **n = 20 meetings per agent**; below it the card reads "not enough data yet (7 of 20)" and shows raw counts only |
| **Percentiles, not means** | for every duration measure                                                                                                                 |
| **Confidence band**        | on every forecast; a point estimate with no band is a lie                                                                                  |
| **Correlation ≠ cause**    | tactic-vs-outcome panels are labelled as patterns, not verdicts                                                                            |
| **Completeness caveat**    | when `completeness < 80%`, every verdict on the screen carries a warning chip                                                              |
| **Traceability**           | every number drills to the meetings behind it. Always.                                                                                     |

Traceability matters beyond correctness: an agency manager who disputes a number must be able to click
into the meetings. A number that cannot be audited will be rejected, correctly.

---

## 4. The views

### 4.0 Meeting Report — the atom

**Built first.** Not because the developer wants it, but because the agent does, and the agent's goodwill
is the supply of all data (foundation §1.2).

Generated automatically when the meeting ends. Available in seconds.

- **Timeline** of the meeting: what was shown, in what order, for how long, in which environment preset.
- **The shortlist**: units favourited, with floor plan, price, floor, orientation — _Stano's "let me see the
  floor plan next to it"._
- **Interest profile**, derived from behaviour rather than from what the client said: price band actually
  explored, floors, orientations, room counts, and where the filter narrowed.
- **Suggested next step**, with the evidence for it.
- **Two buttons: send to client, log outcome.** The send is the reason the agent opens it; the outcome
  logging is what the system needs. Putting them side by side is deliberate.

The client-facing version is a stripped, branded document — the four apartments, floor plans, prices. A
genuine follow-up asset. This is the trade: the agent gets a sales tool, the system gets its data.

---

### 4.1 Sales Flow — "how does selling actually work here?"

**Question:** how long does it take, where does it leak, and what can I plan with?

**Verdict examples**

- _"12 of 47 meetings reached an offer (26%) — the leak is between Shortlisted and Offered, where 31 deals sit."_
- _"Median time to first offer is 2.3 months, 80th percentile 4.1. Plan the campaign at least five months before you need units sold."_

**Evidence:** the stage ladder with conversion between steps and time-in-stage on each — one chart, both
numbers. Stano's core complaint was that the pipeline is unreadable when the figures are not next to each
other on one screen.

**Who/What:** deals grouped by stage, sorted by time stuck, drillable to the meetings.

**Act:** export the stalled list; hand the cohort to the Contacts view; save as a benchmark for the next project.

**Cross-project benchmarking** is a quiet strength here. A developer with three projects can finally answer
"is this one slow?" — a question no single-project CRM report can answer.

---

### 4.2 Project — "what is selling, and what should the campaign say?"

**Question:** which parts of the inventory work, which do not, and why.

**Verdict examples**

- _"Two-room units draw 2.1× their share of attention but convert at half the project average — the interest is real, the price probably is not."_
- _"Floors 2–5 north-facing have had 4 viewers in 47 meetings. This is dead stock at the current presentation."_

**Evidence — the attention × conversion matrix.** The single most actionable frame in the product:

```
            high conversion          low conversion
          ┌────────────────────────┬────────────────────────┐
     high │  HERO                  │  MISPRICED / OVERSOLD  │
attention │  sell more of this;    │  they look, they don't │
          │  lead the campaign     │  buy → check price,    │
          │  with it               │  check the promise     │
          ├────────────────────────┼────────────────────────┤
      low │  HIDDEN GEM            │  DEAD STOCK            │
attention │  converts when seen —  │  neither seen nor sold │
          │  agents aren't showing │  → reposition, bundle, │
          │  it. Fixable today.    │  or discount           │
          └────────────────────────┴────────────────────────┘
```

Each quadrant carries a different instruction, and each is a segment, not a single unit — so it maps
directly onto a marketing decision. The **hidden gem** quadrant is the one that pays for the product
quickly: it is a fixable behaviour, not a pricing concession.

**Environment panel.** Exterior-specific, and nobody else has it: which time-of-day preset and weather the
agents actually present in, and how dwell time differs under each. Output: _"78% of meetings use the sunset
preset and dwell is 1.9× higher under it — shoot the campaign renders at sunset."_

**Unit detail:** floor plan alongside the numbers, plus which named contacts viewed it.

**Act:** build a segment → hand to Contacts; flag units for price review; export the campaign brief.

---

### 4.3 Team — "is my sales partner performing?"

**Question:** for the developer, evidence about a supplier. For the agency manager, coaching material.
**Built last** — it needs sample size, and it is politically the hottest surface (foundation §1.1).

**Verdict examples**

- _"3 of 7 agents have run more than 10 meetings without producing a single offer."_
- _"Median time from meeting to offer is 2.3 months across the agency; two agents are above 5."_

**Evidence:** agents as cards — meetings, offers, reservations, sales, median time-to-offer, and
`completeness`. Below the sample threshold the card refuses to rank.

**Tactics fingerprint** — the genuinely new thing here, and the reason this view is coaching rather than
scoring. From the event stream: opening move (which view first), units shown per meeting, dwell depth,
feature mix, environment usage, time to the first unit, language. Then: which patterns co-occur with
offers. Labelled as patterns, never as causes.

_"Agents who open with the environment and reach a unit within 4 minutes produce offers at roughly twice
the rate. Two agents average 11 minutes before the first unit."_ — that is a training session, and it is
also exactly the kind of finding a developer can raise with an agency without it becoming a personnel fight.

**Act:** share the coaching card; export the steering-meeting summary; compare periods.

---

### 4.4 Contacts — "who do I talk to, and about what?"

**Question:** turn the data into a list of people and then into an action. This is Stano's kindergarten
example — _pull the ten clients interested in this project and email them, without asking the agents._

**Segment builder** over behavioural attributes the CRM does not have: viewed a segment, favourited a
specific unit, explored a price band, deep-dived without an offer, has not been contacted in N days.

**Contact card:** interest profile from behaviour, meetings timeline, shortlist with floor plans, deal
stage, next action.

**Act — the whole point of the view:** export; push a list or a task to the CRM; hand the segment to the
agency with the reason attached. Saved segments become standing lists that refill themselves.

**A caution worth designing around:** a behavioural segment used for marketing is a lawful-basis question
(foundation §5). The export path must check consent status per contact and exclude those without it —
silently producing a marketing list that includes non-consenting people is the one failure mode that could
genuinely damage the client.

---

### 4.5 Agent Companion — mobile, three screens

Separate surface, separate design. Not a shrunken dashboard.

1. **Today** — meetings scheduled, who they are, what they looked at last time.
2. **After the meeting** — outcome in two taps, then send the Meeting Report.
3. **Follow-ups** — who has gone cold, sorted by how hot they were.

No leaderboards. No comparison to colleagues. The moment this screen starts scoring the agent, the data
supply degrades and the developer's product degrades with it.

---

## 5. Navigation

Four lenses, one shared filter context (project + period), an Ask bar on every screen.

```
Project ▾   Period ▾                                    ⌘K  Ask
─────────────────────────────────────────────────────────────
  Flow      Project      Team      Contacts
```

The drill paths are what make it a system rather than four reports — each one ends in either a person or
a decision:

```
Flow    → stalled stage      → deals        → contacts → act
Project → quadrant           → segment      → contacts → act
Team    → agent              → meetings     → contacts → act
Any number  → the meetings behind it        → a Meeting Report
```

Changing project or period never resets the lens. Stano's complaint about the MVP was that everything is
in one pile; the fix is not fewer numbers, it is that **the same numbers are reachable from four different
questions**.

---

## 6. The AI layer

Stano's position — _don't build complex general dashboards and ask everyone what they want; let the AI
build the report on demand_ — is right about the direction and needs one correction: **the model must never
compute a number.**

### 6.1 MCP server over the semantic layer

Typed, read-scoped tools mirroring §2 — not SQL access:

```
list_projects()                         get_metric(measure, dimensions, filters, period)
get_pipeline(project, period)           get_forecast(project)
compare(dimension, measure, period)     list_contacts(segment)
get_meeting_report(meeting_id)          list_insights(period)
```

The model chooses the query and writes the prose. The numbers come from the same code path that renders
the UI, so the dashboard and the AI can never disagree. Every AI sentence carries a citation back to the
query result — clickable, auditable. This is the difference between Stano's "85% of the time it identifies
the right insight" and something a developer will act on.

Access is scoped to the calling user's permissions. An agency's MCP token must not reach another agency's
meetings.

### 6.2 Insight engine — deterministic detectors, AI narration

Not "ask the LLM what's interesting". A fixed catalogue of detectors runs on schedule; each has a
definition, a threshold and a suggested action. The model **ranks** them and **writes** them up.

| Detector                     | Fires when                                                    |
| ---------------------------- | ------------------------------------------------------------- |
| attention without conversion | segment `attention_index` > 1.3 and conversion < 0.6× project |
| hidden gem                   | conversion > 1.3× project and `reach` < 0.5× project          |
| stalled deals                | time-in-stage > p80 for that stage                            |
| agent without offers         | meetings > threshold, offers = 0                              |
| velocity drop                | trailing 4-week velocity < 0.7× trailing 12-week              |
| dead stock                   | `reach` < 10% after n meetings                                |
| cold contacts                | shortlisted, no contact in 21 days                            |
| **completeness drop**        | `completeness` < 80%, or falling                              |

Deterministic detection is what makes the insight reproducible tomorrow. LLM-only detection is not.

### 6.3 Report composer

Stano's Monday steering meeting, literally: _"prepare this onto one A4."_ Pick an audience and a period,
get a document — numbers from the semantic layer, narrative from the model, one page, exportable. Saved
as a recurring job it lands in the inbox before the meeting.

### 6.4 Ask bar

Present on every screen, scoped to the current filter context. "Which three contacts have shortlisted a
south-facing unit and have no offer?" returns a **list with rows you can act on**, not a paragraph. Voice
input is the same pipeline with a different front end — worth building once the text path is trusted, not
before.

---

## 7. Sequencing

The order is driven by dependencies and by politics, not by what is easiest to demo.

| Phase | Ships                                                    | Why here                                                                                          |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **0** | Event pipeline v2 + **Meeting Report** + Agent Companion | Buys the agent's goodwill, which is what produces the data. Nothing downstream works without it.  |
| **1** | Project view + Contacts + segment actions                | Real developer value **without needing the CRM**. Also the strongest sales demo.                  |
| **2** | CRM connector → Sales Flow, forecast, sell-out ETA       | Unlocks the buyer's highest-value number. Gated on the REALPAD API question.                      |
| **3** | Team view                                                | Needs n ≥ 20 meetings per agent to be honest, and needs the relationship to be established first. |
| **4** | MCP + insight engine + report composer                   | Sits on the semantic layer; genuinely cheap once §2 exists.                                       |

The temptation will be to build the Team view early, because it is what a developer asks for in the first
meeting. Building it before phase 3 produces rankings from small samples, the agency disputes them
correctly, and the product loses the argument permanently.

---

## 8. Open questions

| #   | Question                                                                                           | Blocks                             |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Does REALPAD expose a usable API?                                                                  | phase 2 entirely                   |
| 2   | Interior platform — can it post back?                                                              | interior dwell in `deep_dive_rate` |
| 3   | Is the sales agency a contractual party to Observer, or does the developer just grant them access? | tenancy model, DPA                 |
| 4   | Does the client-facing Meeting Report need per-developer branding at launch?                       | phase 0 scope                      |
