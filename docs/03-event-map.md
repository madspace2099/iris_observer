# IRIS Observer — Event Map and UE5 API

**Status:** concept, v0.1 · **Date:** 2026-08-24 · **Depends on:** [`01-foundation.md`](01-foundation.md), [`02-views.md`](02-views.md)

This maps the complete Showroom IRIS sales-agent flow onto the event contract, and specifies the UE5
subsystem API to implement. It replaces §7 of `01-foundation.md`, which was written before the flow was known.

---

## 1. What the flow revealed

Eight signals in the real flow are **not tracked at all** by the current `InsightAnalytics` module. Three of
them are stronger than anything currently being captured.

| Untracked today          | Why it matters                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Share / email sent** ⚑ | The only in-app action with a consequence outside the room. Strongest intent artifact in the flow.     |
| **Compare Mode** ⚑       | A comparison set is the buyer's real shortlist — and it reveals which units _compete with each other_. |
| **Surroundings / POI** ⚑ | The top of the presentation funnel, and directly a marketing-message input.                            |
| Amenities                | Same, plus auto-play mode usage.                                                                       |
| Photo Mode detail        | Camera preset, aspect ratio, which unit the capture was of.                                            |
| AI Render Studio         | Engagement signal and a GPU-cost signal.                                                               |
| Unit selection method    | 3D model vs list — spatial or numeric buyer.                                                           |
| Loss (`Not interested`)  | Without it there is no denominator for conversion. See §5.                                             |

And one structural correction the flow makes explicit:

> **The Welcome Screen may sit open for minutes. The meeting timer must start at `Start Presentation`,
> not at profile selection or visitor entry.**

The current module starts the session whenever `StartAnalytics()` happens to be called, so today every
meeting duration silently includes the waiting time. Every duration-based metric inherits that error.

---

## 2. The flow, mapped

| #   | UX step                 | Events                                                                                                      | Notes                                                                             |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Profile select          | `agent.selected`                                                                                            | No meeting yet. Seat-limited (3 active, MADSPACE grants more).                    |
| 2   | Welcome screen prepared | `welcome.prepared {display_name, language}`                                                                 | Preparation, not the meeting.                                                     |
| 3   | Waiting                 | —                                                                                                           | **Timer off.**                                                                    |
| 4   | **Start Presentation**  | **`meeting.started {language}`**                                                                            | Meeting id minted here. Timer starts here.                                        |
| —   | Contact details entered | `contact.identified {name, email, phone, consent}`                                                          | May happen at 2, 21 or anywhere between.                                          |
| 5   | Home / Project intro    | `section.entered/exited {path:[home]}`                                                                      |                                                                                   |
| 6   | Surroundings            | `section.entered {path:[surroundings]}`, `poi.shown {poi_id, category}`, `poi.hidden`                       | **New.**                                                                          |
| 7   | Amenities               | `section.entered {path:[amenities]}`, `amenity.shown {amenity_id, autoplay}`, `amenity.ended`               | **New.**                                                                          |
| 8   | Unit search             | `filter.applied {price, surface, floor, rooms, buildings, statuses, result_count}`, `filter.cleared`        | Extend existing.                                                                  |
| 9   | Unit picked in twin     | `unit.view.started {unit_id, method}`                                                                       | `method`: `model_3d` \| `list` \| `compare` \| `favorites` \| `search` — **new.** |
| 10  | Apartment detail        | `unit.view.ended {unit_id, duration_ms}`, `unit.pdf_opened`                                                 |                                                                                   |
| 11  | Floor Cut               | `unit.floor_cut.shown {unit_id, floor}` / `.ended {duration_ms}`                                            |                                                                                   |
| 12  | Balcony / View          | `unit.balcony.entered {unit_id}` / `.exited {duration_ms}`                                                  | The signature IRIS moment.                                                        |
| 13  | Interior tour           | `unit.interior.opened {unit_id, mode, ref}` / `.closed {duration_ms}`                                       | `mode`: `guided` \| `free` \| `external`. See §6.                                 |
| 14  | Daytime / weather       | `scene.changed {time_of_day, clock, weather}`                                                               | Scene control — explicitly **not** Photo Mode.                                    |
| 15  | **Compare Mode**        | `compare.opened {unit_ids[]}`, `compare.changed {unit_ids[]}`, `compare.closed {unit_ids[], kept_unit_id?}` | **New.** See §4.                                                                  |
| 16  | Favorites               | `unit.favourited {unit_id, origin}` / `unit.unfavourited`                                                   | `origin`: which screen it was added from.                                         |
| 17  | Photo Mode              | `photo.mode.entered {context_unit_id}` / `.exited {duration_ms}`                                            |                                                                                   |
| 18  | Capture                 | `capture.created {capture_id, camera_preset, aspect_ratio, context_unit_id}`                                | Enters the meeting working set.                                                   |
| 19  | AI Render Studio        | `render.started {capture_id, preset}`, `render.completed {render_id, success, duration_ms}`                 | **New.**                                                                          |
| 20  | Share Panel             | `share.panel.opened`                                                                                        |                                                                                   |
| 21  | **Email sent**          | **`share.sent {recipient_hash, unit_ids[], image_ids[], included_pdfs}`**                                   | **New. The most valuable event in the flow.**                                     |
| 22  | End Presentation        | `meeting.presentation_ended`                                                                                | Timer stops. Outcome UI opens.                                                    |
| 23  | Outcome                 | `meeting.outcome_set {outcome, related_unit_ids[], note?}`                                                  | Six values, §5.                                                                   |
| 24  | Session close           | `meeting.closed`                                                                                            | Final flush.                                                                      |
| 25  | New meeting             | —                                                                                                           | Working set clears; nothing is deleted server-side.                               |

Two rules that keep this honest in a live room:

- **Scopes auto-close.** Opening a new unit view closes the previous one; `meeting.presentation_ended`
  closes every open scope. A Blueprint author cannot leak a dangling `started` with no `ended`.
- **Every `*.ended` event carries `duration_ms`**, measured with `FPlatformTime::Seconds()`. The server
  never subtracts timestamps to get a duration.

---

## 3. What the new signals unlock

### 3.1 Share — the follow-up bridge

`share.sent` closes the loop between the room and the CRM. It gives a confirmed email, an explicit unit
list chosen by the agent _with the buyer present_, and a timestamp to measure follow-up latency from.

New measures: `share_rate` (meetings ending in a share), `shared_vs_favourited` (favourites are cheap,
shares are considered), `time_to_share`, and — with the CRM joined — **share → offer conversion**, which
is likely the single most predictive step in the whole funnel.

### 3.2 Surroundings — Stano's kindergarten, closed loop

Stano's example was: _a kindergarten is being built nearby, pull the interested clients and email them._
POI events make the other half possible — **which surroundings arguments actually work.**

- POI coverage: which POIs get shown, by which agent, how often.
- POI → outcome: _"meetings that included the school convert at 1.6× the rate; the tram stop appears in 18% of meetings."_
- Campaign input: lead with the arguments that correlate with offers, not with the ones the agency happens to like.

### 3.3 Presentation coverage — fair coaching

From `section.entered`, a coverage profile per meeting: Home, Surroundings, Amenities, Units, Interior,
Compare, Share. Aggregated per agent, this is the tactics fingerprint from `02-views.md` §4.3 made concrete
and, importantly, **fair**: not "you are underperforming" but _"you skipped Surroundings in 8 of your last
10 meetings; meetings that include it reach an offer 1.6× more often."_ That is a training sentence, not a
performance review — which is exactly what the two-sided product needs.

---

## 4. Compare Mode: the competition graph

The most under-appreciated signal in the flow. A comparison set is a decision moment: these units are
genuinely in the running, and one of them will win.

Aggregate the sets across all meetings on a project and you get a **competition graph** — which units are
repeatedly weighed against which. From it:

| Measure               | Definition                                                            |
| --------------------- | --------------------------------------------------------------------- |
| `compare_appearances` | how often a unit enters a comparison                                  |
| `win_rate`            | kept / appearances (kept = favourited, shared, or offered afterwards) |
| `rivals`              | which units it is most often compared against                         |

The output sentence has no equivalent in any CRM:

> _"A-402 has entered 9 comparisons and won 2. It loses to B-301 seven times out of nine. The two are
> 4 m² and one floor apart, but priced €12,000 apart — the gap is wrong, not the apartment."_

That is a pricing decision, derived purely from behaviour, and it is precisely the "context" Stano said
was missing. It is worth capturing `kept_unit_id` on `compare.closed` even if it has to be inferred rather
than explicitly chosen.

---

## 5. Outcome model

Six values, replacing the current three. The critical addition is **`not_interested`**: without a recorded
loss there is no denominator, and "still open" is indistinguishable from "dead". The MVP's funnel could
never produce a true conversion rate for this reason.

| Outcome             | Pipeline stage (`02-views.md` §2.4) | Terminal |
| ------------------- | ----------------------------------- | -------- |
| `presentation_only` | Met                                 | no       |
| `interested`        | Engaged                             | no       |
| `follow_up_needed`  | Engaged                             | no       |
| `reservation`       | Reserved                            | no       |
| `purchase`          | Sold                                | yes      |
| `not_interested`    | Lost                                | **yes**  |

`related_unit_ids` matters as much as the outcome itself: an outcome attached to specific units is what
lets the project view compute per-unit and per-segment conversion. IRIS should pre-fill it with the
favourited and most-viewed units, so the agent confirms rather than types — two taps, per the flow.

**Design constraint:** the outcome UI is the one moment the whole analytics system depends on a human.
It must be fast, pre-filled, and impossible to skip accidentally — but it must also be skippable
deliberately, and a skip must be recorded as `outcome_skipped` rather than silently defaulting to
`presentation_only`. A silent default is worse than a gap: it manufactures false data.

---

## 6. Interior: two readings to reconcile

The flow (step 13) describes a live guided walkthrough inside the apartment; the earlier answer said
interiors are an external web link on a different platform. Both may be true — per project.

The event contract handles either through `mode`: `guided` \| `free` \| `external`. For `external`, pass
`?iris_meeting={id}&iris_unit={id}` into the link so the other platform can post a session summary back.

**Open question:** which projects use which, and is the guided tour UE5-native? It affects only how much
detail is measurable inside the interior — not the contract.

---

## 7. UE5 subsystem API

Replaces the current `UInsightAnalyticsSubsystem` surface. All Blueprint-callable. The subsystem owns
buffering, batching, retry and scope closing; Blueprints only declare what happened.

```cpp
// ── Lifecycle ───────────────────────────────────────────────
void     SelectAgent(const FString& AgentId);
void     PrepareWelcome(const FString& DisplayName, const FString& LanguageCode);
FString  StartPresentation();                       // mints and returns meeting_id; starts the timer
void     EndPresentation();                         // stops timer, closes open scopes, opens outcome UI
void     SetMeetingOutcome(EMeetingOutcome Outcome, const TArray<FString>& RelatedUnitIds, const FString& Note);
void     SkipMeetingOutcome();                      // recorded explicitly, never defaulted
void     CloseMeeting();

// ── Contact ─────────────────────────────────────────────────
void     SetVisitorContact(const FString& Name, const FString& Email, const FString& Phone,
                           bool bConsentGiven, const FString& ConsentTextVersion);

// ── Navigation ──────────────────────────────────────────────
void     EnterSection(const FString& Main, const FString& Category = TEXT(""),
                      const FString& Sub = TEXT(""), const FString& Item = TEXT(""));
void     ExitSection();

// ── Surroundings & amenities ────────────────────────────────
void     ShowPoi(const FString& PoiId, const FString& Category);
void     HidePoi(const FString& PoiId);
void     ShowAmenity(const FString& AmenityId, bool bAutoPlay);
void     EndAmenity();

// ── Search ──────────────────────────────────────────────────
void     ApplyFilter(const FFilterState& State, int32 ResultCount);
void     ClearFilters();

// ── Units ───────────────────────────────────────────────────
void     StartUnitView(const FString& UnitId, EUnitSelectionMethod Method);
void     EndUnitView();
void     OpenUnitPdf(const FString& UnitId);
void     ShowFloorCut(const FString& UnitId, int32 Floor);
void     EndFloorCut();
void     EnterBalconyView(const FString& UnitId);
void     ExitBalconyView();
void     OpenInterior(const FString& UnitId, EInteriorMode Mode, const FString& Ref);
void     CloseInterior();
void     ToggleFavourite(const FString& UnitId, bool bNowFavourite, const FString& Origin);

// ── Compare ─────────────────────────────────────────────────
void     OpenCompare(const TArray<FString>& UnitIds);
void     UpdateCompare(const TArray<FString>& UnitIds);
void     CloseCompare(const FString& KeptUnitId);   // empty if none

// ── Scene control ───────────────────────────────────────────
void     SetTimeOfDay(const FString& Preset, const FString& ClockTime);
void     SetWeather(const FString& Weather);

// ── Photo & render ──────────────────────────────────────────
void     EnterPhotoMode(const FString& ContextUnitId);
void     ExitPhotoMode();
void     CaptureImage(const FString& CaptureId, const FString& CameraPreset,
                      const FString& AspectRatio, const FString& ContextUnitId);
void     StartRender(const FString& CaptureId, const FString& PresetName);
void     CompleteRender(const FString& CaptureId, const FString& RenderId, bool bSuccess, int32 DurationMs);

// ── Share ───────────────────────────────────────────────────
void     OpenSharePanel();
void     SendShare(const FString& RecipientEmail, const TArray<FString>& UnitIds,
                   const TArray<FString>& ImageIds, bool bIncludedPdfs);
```

### Implementation rules for Akhilesh

1. **No aggregation in the client.** Delete `GlobalClickMap`, `GlobalFeatureTimeMap`,
   `GlobalApartmentRegistry`, `GlobalPresentations/Reservations/Purchases` and the whole
   `SendGlobalAnalyticsToSupabase` path. The client emits events; the server aggregates. This is what makes
   new metrics computable over old data.
2. **`FPlatformTime::Seconds()` for durations, `FDateTime::UtcNow()` for timestamps.** Never
   `GetWorld()->GetTimeSeconds()` — it resets on level travel and is affected by pause and time dilation,
   which is a live bug in the current module.
3. **Buffer to an append-only file, flush in batches** (size- or time-triggered, e.g. 25 events / 5 s).
   Never `SaveAnalytics()` on every interaction — the current module serialises the entire savegame on
   every single click, during a live client presentation.
4. **Idempotent send.** Client-generated `event_id`; the server dedupes. A crash replays safely.
5. **Never block the game thread** on HTTP. A failed flush retries with backoff; the buffer survives restart.
6. **The device authenticates, not the anon key.** Per-device credentials, scoped to write-only ingest for
   one tenant. The current build ships a Supabase anon key with table-level write access inside the binary.
7. **`SelectAgent` does not start a meeting.** Only `StartPresentation` does.

---

## 8. Ingest

Reliable showroom internet is confirmed, so events stream during the meeting. The disk buffer stays as a
safety net, not as the primary path.

```
UE5 ──batch (25 ev / 5 s)──▶ POST /v2/ingest ──▶ events (append-only)
   └─ disk buffer, replayed on reconnect          dedupe on event_id
```

A live stream also enables something worth designing for later: the developer's dashboard can show a
meeting **in progress**. Low priority, but it is free once ingest is streaming, and it demos extremely well.

> **Amendment, 2026-09-01 — superseded by the UE5 contract candidate.**
>
> Three details in this section and in §7 predate the approved UE5 plugin architecture
> brief and are now wrong:
>
> - **The endpoint.** `POST /v2/ingest` is superseded by
>   `POST /functions/v1/observer-ingest`, with activation at `/observer-activate` and
>   liveness at `/observer-heartbeat`. See [`ue5-ingestion-contract.md`](ue5-ingestion-contract.md)
>   and the generated `docs/ue5-contract/openapi.json`.
> - **The batch figures.** "25 events / 5 s" was a sketch, never an approved limit. Batch
>   and event ceilings are stated by the server at activation and are deliberately
>   **unset** in the contract candidate, pending measurement on real showroom hardware
>   (`OPEN-12`).
> - **Credential scope.** §7 rule 6 says a device credential is scoped to one _tenant_. The
>   brief scopes it to one **project source** — narrower, and the difference matters: a
>   tenant-scoped credential extracted from one showroom binary would reach every project
>   that tenant owns.
>
> Everything else in §7 stands and is now contract rather than advice: no client
> aggregation, client-generated `event_id` with server-side deduplication, buffer to disk
> and flush in batches, never block the game thread, and per-device credentials rather than
> a shared key in the binary.
>
> **Update, 2026-09-01 — §7 is done, and the legacy transport is retired.** Akhilesh reports
> UE-OBS-001 complete: every hard-coded Supabase URL and key is gone from the V2 plugin,
> configuration arrives through Unreal Project Settings, and V2 no longer depends on the
> direct-table transport at all. The `SendGlobalAnalyticsToSupabase` path this section asked
> to delete is deleted.
>
> The old shape is **LEGACY** and is not a supported production path for V2:
>
> ```
> LEGACY   interaction → mutable in-memory state → app close → one snapshot blob
>                      → direct database tables
>
> V2       interaction → immutable event with UUID and UTC timestamp
>                      → durable local outbox → bounded HTTPS batch
>                      → protected ingestion backend → explicit acknowledgement
>                      → removed from the outbox only on accepted or duplicate
> ```
>
> The event names in §2 remain **illustrative**. ADR-0013 defers the wire catalogue to the
> schema registry, and the contract candidate fixes no business event names.

---

## 9. Changes this forces in `02-views.md`

- Outcome model: three values → six, with `not_interested` making true conversion computable.
- New measures: `share_rate`, `time_to_share`, POI/amenity coverage, presentation coverage, and the
  compare competition graph (`win_rate`, `rivals`).
- Contacts view: `share.sent` gives a confirmed email and a follow-up clock per contact.
- Team view: presentation coverage replaces vaguer "tactics" language with something measurable and fair.

---

## 10. Open questions

| #   | Question                                                                                                                 | Blocks                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1   | Interior: UE5-native guided tour, external platform, or both per project?                                                | §6 detail level only                            |
| 2   | Can `compare.closed` capture a kept unit explicitly, or must it be inferred?                                             | §4 `win_rate` quality                           |
| 3   | **Couples.** The welcome screen takes one name, but buyers usually arrive in pairs. One contact per meeting, or several? | contact model, consent, segment exports         |
| 4   | Are seats (3 active agents) per project or per showroom installation?                                                    | tenancy model                                   |
| 5   | Does the share email go through IRIS or the agent's own client?                                                          | whether `share.sent` is reliable or best-effort |
