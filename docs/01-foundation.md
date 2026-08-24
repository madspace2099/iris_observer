# IRIS Observer — Foundation

**Status:** concept, v0.1 · **Date:** 2026-08-24 · **Supersedes:** the `InsightAnalytics` UE5 module + `Analytics-Dashboard` MVP

This document fixes the things that must be decided before any UI is drawn: who the product is for,
what it measures, what the data model is, and what the event contract with UE5 looks like.
Views, metrics and UI/UX are specified in `02-views.md` (not yet written).

---

## 1. The product is two-sided, and that is the central design constraint

|                  | **Developer** (ingatlanfejlesztő)            | **Sales agency / agent**                               |
| ---------------- | -------------------------------------------- | ------------------------------------------------------ |
| Relationship     | **buys** IRIS, owns the project and the data | **uses** IRIS daily, is often a contracted third party |
| Wants            | evidence, forecast, marketing intelligence   | to sell more, with less admin                          |
| Sees Observer as | oversight of a supplier                      | potentially: surveillance                              |

Two consequences that shape everything.

**1.1 — The developer cannot "manage the sales team".**
Stano's framing (_"chalani, ste tam tri mesiace a ani jedna ponuka"_) assumes an internal team. Toward a
contracted agency that same sentence is a contract dispute, not coaching. The developer's real levers are
different: change the price, change the marketing message, escalate to the agency's director, replace the
agency. Observer must produce **evidence for those decisions**, not a performance-review console.

**1.2 — Data quality depends entirely on the agent's goodwill.**
Every metric in the system rests on the agent doing three manual things: identifying themselves,
entering the visitor's details, and setting the meeting outcome. If Observer feels like a monitoring tool
imposed by the developer, the agent will skip all three — and the developer's expensive dashboard fills
with `Visitor_07`, outcome `Presentation`, forever.

> **Therefore the agent-facing product is not a secondary feature. It is the data-collection strategy.**
> The agent must get more out of Observer than the developer does, or the developer gets nothing.

**What the agent gets (must be built first):**

- The **Meeting Report**, generated within seconds of the meeting ending — a clean, sendable summary of the
  four apartments they looked at, the shortlist, the price range. A genuine follow-up asset, not a report card.
- The **pre-meeting brief**: before the second meeting, what this client looked at last time.
- The **cold list**: who has not been contacted since their meeting.

**What the developer gets:**

- Whether the project is selling, and what will not sell at the current price.
- What the campaign should say — grounded in what visitors actually stop on.
- **Sell-out forecast** — at the current rate, when is the project gone. This drives construction financing
  timing, which makes it the highest-value single number in the system for the buyer.
- Agency performance, as evidence, over time.

---

## 2. Tenancy: the developer owns the data, the agency is a guest

```
Tenant  = developer            owns projects, owns all data, pays
  └─ Project (Ister Tower)
       ├─ granted to → Organisation (sales agency)   scoped to this project only
       └─ Agents belong to the agency, act on the project
```

Three rules that follow, and they are not negotiable later:

1. **An agency may sell for competing developers.** Project-scoped isolation must be enforced in the
   database (row-level security), never only in the API.
2. **When the developer changes agency, the data stays with the developer.** This is a large part of what
   they are actually buying — the institutional memory their supplier would otherwise walk away with.
3. **Agents see their own meetings in full; agency managers see their agency's meetings on that project;
   the developer sees everything on their projects.** Cross-agency comparison is developer-only.

---

## 3. What Observer can and cannot see

The instrumentation surface is defined by the fact that **IRIS is an exterior product**. Interior VR
walkthroughs run on a separate platform, embedded as a web link. This is a real boundary and the concept
must respect it — earlier examples about kitchen-vs-balcony dwell time are not measurable and are withdrawn.

**Natively measurable (rich):**

| Surface     | Signal                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| Unit-level  | which unit, dwell, repeat views, PDF, favourite, **balcony view**, **3D floor cut**   |
| Catalogue   | filter state — price, surface, floor, rooms, building, status — **plus result count** |
| Environment | time-of-day preset, weather, clock — _this is exterior-specific and undervalued_      |
| Navigation  | 4-level hierarchy path, per-node dwell and open count                                 |
| Meeting     | duration, language(s), screenshots (normal vs advanced), outcome                      |

**The environment data deserves attention.** In an exterior product, the view _is_ the merchandise. If the
sunset preset is used in most meetings and dwell time roughly doubles under it, that is a direct campaign
instruction: shoot the renders at sunset. No other analytics system in this market can produce that sentence.

**Not natively measurable:** anything inside the interior walkthrough.

**Design response — treat the interior as a boundary, not a black hole:**

- Emit `unit.interior.opened` and `unit.interior.returned` on the UE5 side. Even the _duration outside_ is a
  strong intent signal, and it costs almost nothing to capture.
- Pass identity into the link: `?iris_meeting={id}&iris_unit={id}`. If the interior platform (3DVista?) can
  post events or a session summary back to a webhook, the timeline reunifies. **Open question — needs checking
  against whichever platform is actually in use.**

---

## 4. CRM: REALPAD is the ledger, Observer is the recording

Most clients use **REALPAD** (developer-side, Czech, real-estate specific); some use **Monday**.

REALPAD sitting on the developer's side is fortunate — the integration lands on the paying customer's
system, not the supplier's. It also very likely already holds two things Observer is missing:

- the **unit catalogue** (price, floor, rooms, m², orientation, status) — blocker #5 from the MVP audit;
- the **deal and its stage** (reserved, sold) — blocker #4.

This produces a clean division of responsibility, and it should be stated as a principle:

> **The CRM records what was agreed. Observer records what happened.**
> Observer never becomes a CRM. Its entire value is in joining the two.

**Rules:**

1. Observer keeps a **canonical internal model** (`Unit`, `Contact`, `Deal`, `Stage`). Connectors map into it.
   Nothing in the core may reference REALPAD directly.
2. Connectors: `realpad`, `monday`, `csv/manual`. The manual path must always work — a client without a
   supported CRM must still be able to use the product, degraded.
3. **Matching key** between systems: email first, phone second. Both are available (see §5).
4. **Open risk — must be verified before committing to the design:** does REALPAD expose a usable API, and
   under what terms? If it does not, the deal-stage data has to be entered by the agent, which pushes the
   burden back onto the person whose goodwill we depend on. That would change the product.

---

## 5. Identity: the showroom visitor is known

Name, phone and email are collected at the meeting. This unlocks the parts of Stano's brief that were
impossible in the MVP:

- **Cross-meeting continuity** — "this client has been in three times and still has no offer."
- **CRM matching** by email/phone.
- **Segment → action** — pull the ten contacts interested in this project and email them, without asking
  the agents.
- **Later: the online join.** The `webiris` viewer's funnel ends at `showroom_attended`; Observer begins
  there. Same email = one story from first web visit to signed contract. Do not build this now, but keep
  the identifiers compatible so it stays cheap.

**It also creates a real obligation.** Observer stores identified behavioural profiles of consumers, and the
the developer and the agency each play a role in deciding how it is used. **Whether that makes them
joint controllers, and what follows from it, is a legal question marked for formal review — this
document describes what the system does, and asserts no compliance position.** Four things must be
designed in rather than bolted on:

1. **Consent captured at meeting start**, as an event, with its text version — the agent already collects the
   contact details, so this is one extra field, not a new workflow.
2. **Retention policy** per tenant, with automatic expiry of raw events.
3. **Erasure** — deleting a contact must tombstone their events, and the aggregates must survive without them.
4. **Access control enforced in the database.** See §2. The MVP's login gate was cosmetic and the entire
   `user_sessions` table, including phone numbers, was readable by anyone with the public JS bundle. That
   must not be reproducible in this architecture.

---

## 6. Data model

```
Tenant ──┬── Project ──┬── Unit          (from CRM or manual; the catalogue)
         │             ├── Meeting ──┬── Event      (append-only, the spine)
         │             │             └── Outcome
         │             └── Deal ── DealStageChange  (from CRM or manual)
         ├── Organisation (agency) ── Agent
         └── Contact ── ContactIdentity(email, phone)
```

| Entity    | Notes                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------- |
| `Contact` | the person, stable across meetings. **This is the entity the MVP was missing entirely.**            |
| `Meeting` | one showroom session: project, agent, one or more contacts, start, end, outcome, consent            |
| `Event`   | append-only, timestamped, immutable. The single source of truth.                                    |
| `Unit`    | catalogue with real attributes. Without rooms/floor/price/orientation there is no segment analysis. |
| `Deal`    | contact × project, with a stage history. Carries the pipeline and every time-in-stage metric.       |

**Everything else is derived.** Rollups, scores, leaderboards, interest profiles — all recomputable from
`Event` + `Unit` + `Deal`. Nothing is stored pre-aggregated as the only copy, which is exactly the mistake
the MVP made: a metric not counted at the time was lost forever.

---

## 7. Event contract with UE5 (schema v2)

### Envelope

```jsonc
{
  "schema_version": 2,
  "event_id": "uuid", // client-generated; server dedupes on it
  "seq": 141, // monotonic per meeting; orders events within the same ms
  "occurred_at": "2026-08-24T14:07:33.482+02:00",
  "project_id": "prj_ister_tower",
  "meeting_id": "mtg_...",
  "agent_id": "agt_...",
  "contact_id": "cnt_...", // null until contact.identified
  "type": "unit.view.ended",
  "payload": {},
  "client": { "app_version": "1.4.2", "device_id": "showroom-ba-01" },
}
```

### Types

| Type                                              | Payload                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `meeting.started`                                 | `{ language }`                                                                                            |
| `contact.identified`                              | `{ contact_ref, consent: { given, text_version } }`                                                       |
| `meeting.outcome_set`                             | `{ outcome, note? }`                                                                                      |
| `meeting.ended`                                   | `{ }`                                                                                                     |
| `catalogue.filter_applied`                        | `{ price:{min,max}, surface:{min,max}, floor:{min,max}, rooms[], buildings[], statuses[], result_count }` |
| `unit.view.started` / `unit.view.ended`           | `{ unit_id, duration_ms }` on end                                                                         |
| `unit.balcony_viewed` / `unit.floor_cut_viewed`   | `{ unit_id, duration_ms }`                                                                                |
| `unit.pdf_opened`                                 | `{ unit_id }`                                                                                             |
| `unit.favourited` / `unit.unfavourited`           | `{ unit_id }`                                                                                             |
| `unit.interior.opened` / `unit.interior.returned` | `{ unit_id, url_ref, duration_ms }` on return                                                             |
| `view.entered` / `view.exited`                    | `{ path: [main, category, sub, item], duration_ms }`                                                      |
| `env.changed`                                     | `{ time_of_day?, weather?, clock?, date? }`                                                               |
| `media.screenshot`                                | `{ mode: normal or advanced }`                                                                            |
| `app.language_changed`                            | `{ from, to }`                                                                                            |

### Five rules the client must obey

1. **Wall-clock timestamps.** `FDateTime::UtcNow()` with offset, ISO-8601. Never a formatted local string.
2. **Monotonic durations.** `FPlatformTime::Seconds()`, not `GetWorld()->GetTimeSeconds()`.
   _This is a live bug in the current module:_ world time resets on level travel and is affected by pause and
   time dilation, so today's `TimeSpent` values can reset or go negative mid-presentation.
3. **The client never aggregates.** No `ClickMap`, no `FeatureTimeMap`, no `GlobalPresentations++`. The client
   emits what happened; the server decides what it means. This is what makes new metrics retroactive.
4. **Offline-first, append-only.** Buffer to disk, flush in batches, retry. Never block the UI, and never
   write the whole state to disk on every click (the current module calls `SaveAnalytics()` on every single
   `TrackClick` — a full savegame serialisation per interaction, during a live client presentation).
5. **Idempotent ingest.** The server dedupes on `event_id`, so replaying a buffer after a crash is safe.

### Migrating today's data

An adapter can synthesise events from the existing `Analytics.json` / `user_sessions` rows. Be honest about
what survives: **ordering yes, timing no.** The journey sequence and the counters are recoverable; per-step
timestamps never existed and cannot be invented. Historical sessions will therefore appear on the timeline
as a single block with a start and an end. That is acceptable for two test sessions.

---

## 8. Storage

```
UE5 ──batched events──▶  Ingest API  ──▶  events (append-only, partitioned by month)
                         (auth per device)      │
                                                ├──▶ derived rollups (scheduled + on-demand)
CRM ──connector sync──▶  units, deals ──────────┤
                                                └──▶ Query API ──┬──▶ Dashboard
                                                                 └──▶ MCP server ──▶ AI
```

Two decisions worth stating now:

- **The dashboard never downloads raw data.** The MVP pulls every session row with `Range: 0-19999` and
  computes everything in the browser. At the stated volume (~100 visitors/week) that is ~5,000 full session
  blobs a year crossing the wire on every page load. All aggregation moves server-side.
- **One query layer serves both the UI and the AI.** The MCP server calls the same typed endpoints as the
  dashboard. The model chooses the query and writes the prose; it never computes a number. That is how the
  AI layer becomes reliable rather than approximately right.

---

## 9. Relationship to the `webiris` repository

Observer lives in its own repository, as decided. No shared code for now.

But keep the **contracts** aligned — `ProjectId`, `UnitId`, and the unit identity rules in
`webiris/packages/domain/src/units.ts`, plus the conversion ladder in `visitor-session.ts` that ends exactly
where Observer starts. Aligning the identifier shapes today costs nothing; not aligning them makes the
online↔showroom join expensive later, and that join is the most valuable thing either product can eventually
offer a developer.

---

## 10. Open questions

| #   | Question                                                                                                                                                                       | Blocks                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | ~~Will the UE5 C++ module be changed?~~ **Answered 2026-08-24: yes.** Akhilesh will implement the schema as designed — no adapter needed, clean emitter.                       | resolved                             |
| 2   | ~~Reliable internet in the showroom?~~ **Answered 2026-08-24: yes, reliable.** Stream events in near-real-time; keep the disk buffer as a safety net, not as the primary path. | resolved                             |
| 3   | Does REALPAD expose a usable API?                                                                                                                                              | §4 — and if not, the product changes |
| 4   | Which platform serves the interior walkthroughs, and can it post back?                                                                                                         | §3 boundary events                   |
| 5   | Who signs the DPA — developer, agency, or both as joint controllers?                                                                                                           | §5                                   |
