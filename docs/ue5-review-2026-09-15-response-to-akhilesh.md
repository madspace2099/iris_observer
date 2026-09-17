# InsightAnalytics 0.2.0 — review against the Observer contract

**2026-09-15.** Reviewed the full `InsightAnalytics.zip` delivery (42 files, claimed complete through
UE-OBS-010) against `docs/ue5-integration-handoff.md`, the `packages/contracts/src/ue5` Zod schemas — which
the live `/functions/v1/observer-{activate,ingest,heartbeat}` endpoints in `packages/sources` actually parse
requests with, not a future spec — and the prior UE5 telemetry audit.

Every technical claim below was independently re-verified against the actual delivered source after this
document's first draft, by agents with no stake in the draft being right, each re-opening the cited file and
confirming or correcting the citation. All held up; one line-range was off by one line (noted inline) and one
claim in the first draft (about `diagnostic.test` property validation) was corrected before this version —
see §2.3.

No credential value is reproduced anywhere in this document.

## What's solid

Worth saying plainly, since the rest of this is a defect list: the DPAPI credential store (fail-closed, no
plaintext fallback, one-way plaintext→DPAPI migration), the atomic temp-then-rename writes for the outbox,
queue, and source-binding files, the source-binding fail-closed guard on reactivation, the
`installation_nonce` persistence, the 401/403 handling (stop + retain + distinct operator messaging + never
auto-reactivate), the credential/PII-shaped property denylist in `ObserverEventValidator`, and the
exponential-backoff-with-jitter are all implemented correctly and match the contract. A.3/A.6/A.7/A.8 from
your last message are genuinely done.

## 1. Critical

### 1.1 The legacy Supabase egress wasn't removed — it shipped in the packaged build

`Resources/AnalyticsWeb/script.js:234-235` hardcodes the Supabase project URL and a live anon JWT for
project `thxjxjrtubnxnvmpzefc`. `:529-537` uses that key to read `rest/v1/user_sessions` and
`rest/v1/global_analytics` directly — the exact two tables the changelog says were retired. `:556-557` fires
this fetch automatically on `DOMContentLoaded`, so it's not a stale unused path — it's the default behavior
of the dashboard every time it loads.

`Source/InsightAnalytics/InsightAnalytics.Build.cs:65-74` stages the entire `Resources/AnalyticsWeb` folder
into the packaged build as `RuntimeDependencies` (`StagedFileType.NonUFS`, recursive, every file).
`SetupBrowserHosting()` (`Private/InsightAnalyticsSubsystem.cpp:1404-1425`, declared `BlueprintCallable` in
the header) loads that HTML via `file:///` into a `UWebBrowser` widget — reachable in a shipping build, not
editor-only tooling.

**Fix:** delete the Supabase fetch path from `script.js` entirely (`fetchAnalyticsFromSupabase`,
`reconstructFromSupabase`, the `DOMContentLoaded` auto-call, the retry button around `:310`) and drive the
dashboard only from `window.loadAnalyticsData(...)`, which `BuildInjectJS` already calls from the plugin
after every `Analytics.json` write. The dashboard doesn't need Supabase — it needs the JSON you're already
injecting.

**Also rotate that key.** It's been staged into a build artifact that left your machine; treat it as
compromised regardless of what fixes this review.

### 1.2 `Tools/verify_observer_source.py` can't see the leak it should have caught

`source_files()` (`:31-47`) only walks `<module>/Public`, `<module>/Private`, and
`InsightAnalytics.Build.cs`. `TEXT_SUFFIXES` at line 16 (`.h`, `.hpp`, `.cpp`, `.cs`, `.md`, `.py`) is
declared and never referenced anywhere else in the file. `Resources/`, `Config/`, and `Tools/` itself are
never scanned, so the forbidden-pattern check (`*.supabase.co`, `user_sessions`, `global_analytics`, JWT
shape) never runs against the one file that actually violates it. The gate reported clean because it never
looked.

**Fix:** wire `TEXT_SUFFIXES` into `source_files()`, and add `Resources/` to the scanned roots. The
forbidden patterns are already correct — they just need to reach the file.

### 1.3 The V2 bridge forwards 6 event types; the legacy tracker calls ~20

This is the structural reason the earlier audit's 20 yellow items are still yellow, and it's a narrower,
more mechanical fix than the audit made it look. None of the following functions in
`Private/InsightAnalyticsSubsystem.cpp` call into `UObserverAnalyticsSubsystem` anywhere in their bodies —
they only touch the legacy `Global*`/`Session*` maps that stay on the kiosk PC. (The only actual bridges in
the whole file are inside `StartSession`, `EndSession`, `TrackClick`, `TrackLanguageChange`, and
`SetExperienceRating`.)

| Legacy function (never bridged)                                                                                                     | Matching V2 entry point that already exists                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TrackFilterUsage` (`:430-454`)                                                                                                     | `UObserverBlueprintLibrary::TrackFilterApplied` (`ObserverBlueprintLibrary.cpp:163`)                                                                  |
| `StartApartmentView` / `EndApartmentView` (`:456-489`, `:491-511`)                                                                  | `TrackUnitViewed` (`:69`) — but that only gives one `unit.viewed`; needs a `unit.view.started`/`.ended` pair to match `docs/03-event-map.md` row 9-10 |
| `TrackApartmentPdfOpen` (`:513-525`)                                                                                                | `TrackUnitDocumentOpened` (`:107`)                                                                                                                    |
| `TrackApartmentBalconyView` / `TrackApartment3DFloorCutView` (`:527-544`, `:546-563`)                                               | no V2 entry point exists yet — needs one                                                                                                              |
| `ToggleFavoriteApartment` (`:565-590`)                                                                                              | `TrackUnitFavoriteChanged` (`:92`)                                                                                                                    |
| `TrackScreenshot` (`:592-609`)                                                                                                      | `TrackScreenshotCreated` (`:218`)                                                                                                                     |
| `OnFeatureSelected` / `TrackAnalytics` / `StartAnalyticsNode` / `EndAnalyticsNode` (`:373-428`, `:782-838`, `:840-868`, `:870-897`) | `TrackFeatureOpened` / `TrackFeatureClosed` (`:121`, `:135`)                                                                                          |
| `TrackTimeOfDay` / `TrackWeather` / `TrackClockTime` (`:899-909`, `:911-921`, `:923-931`)                                           | `TrackWeatherChanged` (`:188`)                                                                                                                        |
| `SetSessionOutcome` (`:640-673`)                                                                                                    | no V2 entry point exists — `meeting.outcome_set` per the event map, needs one                                                                         |

Every `ObserverBlueprintLibrary::Track*` function on the right already builds a schema-correct event. The
fix in every row but the two "no entry point" ones is a single added call from inside the legacy function to
its V2 counterpart — not new design, just wiring two things that already exist. `StartApartmentView`/
`EndApartmentView` and `SetSessionOutcome` need one new event name each, which the event map already
specifies.

## 2. Wire contract — the live endpoint will reject these today

The exact payloads these functions build were run through the real `packages/contracts/src/ue5` Zod schemas
(the same ones `packages/sources/src/{activate,ingest,heartbeat}.ts` parse requests with). All three fail.

### 2.1 Activation request (`Private/Observer/ObserverActivationClient.cpp:78-85`)

Sent flat: `activation_code`, `installation_nonce`, `app_version`, `plugin_version`, `build_id`,
`engine_version`, `reported_environment`. The contract requires `build_id`/`app_version`/`plugin_version`/
`engine_version` nested under a `build: {…}` object, plus a top-level `os` string
(`packages/contracts/src/ue5/activation.ts:65-92`). Actual rejection: `unrecognized_keys` on the four
flattened fields, plus `build` and `os` reported missing.

### 2.2 Heartbeat request (`Private/Observer/ObserverActivationClient.cpp:504-512`)

Same flattening problem, plus the heartbeat body needs `sent_at`, a `queue: {pending_events,
oldest_pending_at, quarantined_events, bytes_used, bytes_ceiling, dropped_events}` object, and
`last_error: {code, at} | null` (`packages/contracts/src/ue5/heartbeat.ts:41-93`). None of that is sent.
`SendHeartbeat()` (`ObserverAnalyticsSubsystem.cpp:1593-1627`) already computes `QueueDepth` and
`QueueBytes` locally — the data exists, it's just not shaped into the required object.

### 2.3 `diagnostic.test` (`ObserverAnalyticsSubsystem.cpp:1539-1553` → `ObserverEvent.cpp:136-141`)

`SendTestEvent` leaves `SessionId` empty and `Sequence = 0`. `FObserverEvent::ToJsonObject` omits the
`session_id`/`sequence` keys entirely when `SessionId` is empty, but the contract requires both keys present
as explicit `null` for a session-less event (`packages/contracts/src/ue5/ingestion.ts:225,241` — the same
shape `docs/ue5-integration-handoff.md` §8.2 shows in its example payload). This one **is enforced today**;
actual rejection is `malformed_event`.

Separately, the properties sent are `{probe, triggered_at}` rather than the documented
`{reason: "activation_check"|"manual_check"|"support_check", note: string|null}`
(`packages/contracts/src/ue5/diagnostic.ts:40-55`). Worth noting precisely: that properties shape is
published in the OpenAPI document but **isn't wired into the live validator yet** — only the event name
(`event_name === "diagnostic.test"` exactly) is checked today, so this half doesn't currently cause a
rejection. Recommend switching to `{reason, note}` anyway while you're touching this function, so there's no
second migration once property-shape enforcement lands.

**Fix for all three:** these are payload-construction bugs, not design questions — nest the fields per the
schemas above. Once 2.1 is fixed, activation will actually succeed against the live endpoint for the first
time, which unblocks testing everything downstream of it, including your own self-tests (which currently
only exercise the mock path — `RunTransportSelfTest`'s Test 1 uses a literal `"https://mock.ingest"` URL).

## 3. Outbox and transport robustness

### 3.1 A server "known code, disagreeing retryable flag" result is silently dropped — the event retries forever

`ObserverBatchResponseParser.cpp:170-177`: if the server marks a known non-retryable code (e.g.
`schema_invalid`) as `retryable: true`, the parser treats the whole result as untrustworthy
(`bMalformed = true; continue;`) and never adds the event to `ParsedById`. It then falls into
`UnacknowledgedEventIds` (`:191-204`), which forces `bRequestRetryable = true` (`:244`) — so the plugin
retries the same event on every flush, forever, instead of quarantining it. **Fix:** for a `rejected`
result, derive retryability from the code alone (known code → the contract's retryable value; unknown code
→ false) and ignore the server's `retryable` flag rather than discarding the result outright.

### 3.2 HTTP 400 stalls the outbox permanently instead of quarantining the batch

`ObserverActivationClient.cpp:453-457` doesn't set `bRequestRetryable` for a 400. In
`OnDispatchBatchFinished` (`ObserverAnalyticsSubsystem.cpp:1699-1849`), a 400 matches none of the retry
conditions and falls to the terminal branch at `:1846-1848`, which only calls
`SetActivationState(Error, ...)` — `DurableOutbox->Quarantine(...)` is called exactly once in the whole
function (`:1737`), and only on the success path. Because `OutboxFlushTimerHandle` was armed as a
_repeating_ timer in `Initialize()` (`:150-160`) and is never cleared on this path, the same malformed batch
gets re-sent on every flush interval, forever. **Fix:** on 400, quarantine the whole batch with a
`batch_rejected_http_400` reason and continue to the next one.

### 3.3 No batch-splitting on 413

Confirmed by a full-tree search: there's no split/halve logic anywhere in the module. A 413
(`ObserverActivationClient.cpp:448-452`) just sets `ErrorCode = "batch_too_large"` without setting
`bRequestRetryable`, so it stalls via the same §3.2 mechanism. `BatchSize` is read once per flush cycle and
never mutated at runtime. **Fix:** track a per-session batch size, halve it on 413 (floor at 1 event; if a
single event is still too large, quarantine that one event as oversized — never split an event, per the
handoff doc's own rule).

### 3.4 Unrecognized 4xx retried forever

`ObserverActivationClient.cpp:458-463`, the catch-all `else` for any status not specifically handled, sets
`bRequestRetryable = true`. A 404 from a misconfigured URL or a 422 would retry indefinitely instead of
quarantining. **Fix:** only set retryable for `< 400 || >= 500`; treat unrecognized 4xx like 400.

### 3.5 `Retry-After` is parsed as a bare float and hard-clamped to 60s

`ObserverActivationClient.cpp:426` uses `FCString::Atof` on the header — an HTTP-date value parses as `0`.
And even a correct numeric value is clamped: `OnDispatchBatchFinished:1826` does
`FMath::Clamp(Response.RetryAfterSeconds, 1.0f, ObserverConstants::MaxRetryDelaySeconds)` where
`MaxRetryDelaySeconds = MaxRetryBackoffSeconds = 60.0f` (`ObserverVersion.h:37,40`). A server asking for a
5-minute backoff gets 60 seconds. **Fix:** parse both delta-seconds and HTTP-date forms; treat `Retry-After`
as a floor, not something subject to your own backoff ceiling.

### 3.6 One corrupt queue entry discards the whole pending queue

`ObserverDurableOutbox.cpp:190-206`: on the first unparseable or duplicate-ID entry found while loading
`queue.json`, `LoadFromDisk_NoLock` calls `PendingEvents.Empty()` — discarding every good event already
parsed earlier in the same pass, not just the bad one — and moves the entire file to a `.invalid_…` backup.
**Fix:** skip or quarantine just the one bad entry, keep the rest, rewrite `queue.json`.

### 3.7 Every `Enqueue()` rewrites the whole queue file, on the game thread

`Enqueue()` (`:73-88`) rebuilds `PendingEvents + new event`, serializes the whole array, and does a
synchronous file write (temp-then-rename) — called inline, synchronously, from `TrackObserverEvent` on the
game thread (`ObserverAnalyticsSubsystem.cpp:930-939`) for every single tracked interaction, with no
`AsyncTask`/thread dispatch anywhere in the path. Near the 50MB ceiling this is a multi-megabyte
serialize-and-rewrite per click, worst exactly when the network is down and the queue is deepest. **Fix:**
an append-only journal (one JSON line per event) for the hot path, compacting only on acknowledge/quarantine.

## 4. Product decisions from the brief — not yet applied

### 4.1 A.9 (no screenshot subtypes) — subtype survives in three places

`Public/AnalyticsUserData.h:234-238` still has separate `NormalScreenshotsTaken`/`AdvancedScreenshotsTaken`
fields, distinct from the general `ScreenshotsTaken`. `TrackScreenshot(bool bIsAdvancedMode)`
(`InsightAnalyticsSubsystem.cpp:592-609`) still branches on a subtype. `TrackScreenshotCreated(...,
const FString& ScreenshotType)` (`ObserverBlueprintLibrary.cpp:218-229`) — the function that _does_ reach
V2 — still takes a free-text subtype parameter and forwards it as `screenshot_type`. **Fix:** collapse to
one counter and drop the parameter from all three; a single `screenshot.created` event with no subtype
property is what A.9 asked for.

### 4.2 A.10 (agent rating) — fabricated baseline, no gating, and a local-dashboard exposure risk

Three separate issues under the same decision:

- `StartSession` (`:241`) runs `GlobalUserRatings.FindOrAdd(TEXT("Good"))++` unconditionally, the moment
  every session starts — before any agent has rated anything. Every session contributes one fabricated
  "Good" to the rating distribution shown in `SerializeGlobalAnalyticsToJson`'s `UserRatings` object
  (`:1085-1092`), which the local kiosk dashboard renders. This is a fabricated-data issue independent of
  anything else here.
- No code path gates `SetExperienceRating`, `TrackScreenshot`, or `EndSession` on a prior `share.sent` —
  confirmed by a repo-wide search, zero matches for anything share-related. Your description was "the popup
  appears after the agent sends the Share Panel"; I found nothing that enforces that precondition. This may
  be unbuilt rather than wrong — flagging as open.
- The mechanism that _is_ built (`SetExperienceRating` → `agent.rating` event, `:675-728`) matches the
  smiley/1-5 shape correctly. But the same session object unconditionally carries `irisRating`/
  `iris_rating`/`irisRatingScore` in the legacy JSON export (`SerializeUserDataToJson:1126-1135`, defaulting
  to `"None"`/`0` when unset), which `SetupBrowserHosting` loads into the in-kiosk browser. Per the brief,
  this rating must only ever be visible to MADSPACE admin. Confirm the AnalyticsWeb dashboard is never shown
  on-screen while a client is present — if it can be, that's the exposure this decision was meant to
  prevent.

**Fix:** remove the `StartSession` fabrication; add the `share.sent`-before-rating gate; either strip
rating fields from the legacy JSON export or restrict when/where that dashboard can be opened.

### 4.3 AgentId hashes the raw name instead of using the GUID that already exists

`StartSession` (`:255`) and `ExportAnalyticsToJson` (`:1328`) both compute
`FMD5::HashAnsiString(*SalesData->SalesPersonName).Left(10).ToLower()` for the agent ID — despite the
adjacent comment calling it a "persistent privacy-safe agent ID." `SalesPersonData` already has
`SalesPersonID`, a proper `FGuid::NewGuid()` value assigned once in `AddSalesPerson` (`:119`), sitting on
the same struct — genuinely opaque and not derived from anything personal. For a sales team of a handful of
named people, `MD5(name)` is reversible in practice by precomputing hashes against the known roster; it's
deterministic, not privacy-safe. **Fix:** derive `AgentId` from `SalesPersonID` instead of
`SalesPersonName`. One-line change, and it satisfies OPEN-21 properly instead of only in appearance.

### 4.4 Cancelling a session doesn't end the Observer V2 session — the next visitor inherits the old one

`CancelCurrentSession` (`:145-162`) clears the legacy `CurrentSessionID` and removes the visitor entry, but
never calls anything on the V2 subsystem — no `EndSession`. `StartSession` (`:248-260`) only calls
`ObserverSub->StartSession(...)` inside `if (!ObserverSub->IsSessionActive())` — so after a cancel, the next
visitor's `StartSession` sees the old V2 session still marked active and skips starting a new one. Every
V2-bridged event from the new visitor (`TrackClick`, `TrackLanguageChange`, `SetExperienceRating`) is gated
only by `IsSessionActive()`, with no re-check of identity — so it's silently attributed to the previous,
cancelled visitor's `session_id` and agent context until an idle timeout eventually closes it. **Fix:** call
`ObserverSub->EndSession("session_cancelled")` inside `CancelCurrentSession`.

### 4.5 Session outcome (the six-value ladder) never reaches V2

`SetSessionOutcome` (`:640-673`) only updates the legacy `GlobalSessionOutcomes` map and
`Session->SessionOutcome` — no call into the V2 subsystem. Per the event map, this is `meeting.outcome_set`
(`docs/03-event-map.md` row 23) and doesn't exist yet in the V2 event set at all. Also listed in §1.3's
table; called out here because it's also a named decision (A.10-adjacent), not only a missing wire-up.

## 5. Minor

- **Environment defaults exported as if observed.** `FEnvironmentAnalytics` defaults to `"Noon"`/`"Clear"`/
  `"12:00"`/`"August 16"` (`AnalyticsUserData.h:154-163`), with no flag on the struct indicating whether
  they were ever actually set. If a session never calls `TrackTimeOfDay`/`TrackWeather`/`TrackClockTime`,
  the legacy JSON export still writes these as though observed. (The V2 side is fine —
  `TrackWeatherChanged` only sends what's explicitly passed in.) Worth a `bHasBeenSet` flag so an untouched
  session exports nothing rather than a fabricated default.
- **`entity.id` with spaces passes the server, fails your own local validator.** `TrackClick` sets
  `Entity.Id = ButtonID` directly (`:349`) from whatever Blueprint label is passed — e.g. `"Floor Plan"`.
  The server accepts this today. `FObserverEventValidator::IsSafeOpaqueIdentifier`
  (`ObserverEventValidator.cpp:485-496`, allowed characters: letters/digits/`_`/`-`/`.`/`:` only) would
  reject the same value if it ever ran against `entity.id` the way it does against `AgentId`/
  `VisitorSubject`. Worth normalizing button IDs to slugs before they become an entity reference, so your
  own validator's rules and what you actually send agree.
