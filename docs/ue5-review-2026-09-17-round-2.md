# InsightAnalytics 0.2.0, round 2 — what the 2026-09-17 drop actually closes

Checked against [the round-1 report](ue5-review-2026-09-15-response-to-akhilesh.md), item by item, by
diffing the two deliveries and re-running the exact request shapes the plugin now builds through the
live `packages/contracts/src/ue5` Zod schemas. Same rule as before: every claim below is `file:line` in
the new zip, no credential value reproduced.

**Short version: 10 of 14 items are genuinely fixed, 3 are half-done, and the one that matters most —
activation and heartbeat against the live endpoint — is still rejected, for a reason that is a
four-line delete.** The 17/17 test pass is real but proves the mock transport only, same as round 1.

## Scorecard

| #   | Round-1 finding                                                    | Status                                | Evidence in the new zip                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Supabase key + direct egress in web assets                         | ✅ fixed                              | `script.js` −230 lines; zero `supabase`/`eyJ`/`rest/v1` markers left in `Resources/AnalyticsWeb/*`                                                                                                                          |
| 1.2 | Verifier never scanned `Resources/`                                | ✅ fixed                              | `verify_observer_source.py:16-17,59-61` — `.js/.html/.css` in scope, `Resources/` walked. (Not executed here: no Python on this machine.)                                                                                   |
| 1.3 | Legacy tracker never bridged to V2                                 | ✅ mostly                             | 13 of 14 legacy functions now emit V2 (`InsightAnalyticsSubsystem.cpp:406,446,474,526,562,590,622,657,688,711,789,990,1017,1038,1053,1078`). Still not bridged: `TrackAnalytics` (`:905-961`, the hierarchy click counter). |
| 2.1 | Activation request shape                                           | ❌ **still rejected**                 | see §A                                                                                                                                                                                                                      |
| 2.2 | Heartbeat request shape                                            | ❌ **still rejected**                 | see §A                                                                                                                                                                                                                      |
| 2.3 | `diagnostic.test` nulls + `{reason, note}`                         | ✅ fixed, proven                      | `ObserverEvent.cpp:151-155`, `ObserverAnalyticsSubsystem.cpp:1553-1554`; `validateEvent` → `ok: true`                                                                                                                       |
| 3.1 | Known-code retryable disagreement retried forever                  | ✅ fixed + tested                     | `ObserverBatchResponseParser.cpp:168-171`; contract test `:218-219`                                                                                                                                                         |
| 3.2 | HTTP 400 stalls the queue                                          | ✅ fixed                              | `ObserverAnalyticsSubsystem.cpp:1825-1843` quarantines the batch, resets the flush timer, continues                                                                                                                         |
| 3.3 | No batch split on 413                                              | ✅ fixed                              | `:1845-1869` halves `CurrentDynamicBatchSize`, quarantines a lone oversized event. Gap: it never grows back — see §B                                                                                                        |
| 3.4 | Unrecognised 4xx retried forever                                   | ⚠️ half                               | transport now marks 4xx non-retryable (`ObserverActivationClient.cpp:500`) — but the dispatcher then falls to `SetActivationState(Error)` (`:1913-1915`), so a 404/422 now stalls delivery instead of looping. See §B       |
| 3.5 | `Retry-After` parsed as float, clamped to 60s                      | ✅ fixed                              | `ObserverActivationClient.cpp:39-59` (numeric + HTTP-date); `:1892-1893` floor, no ceiling                                                                                                                                  |
| 3.6 | One corrupt queue entry discards the queue                         | ✅ fixed                              | `ObserverDurableOutbox.cpp:208-241` per-entry quarantine + resave                                                                                                                                                           |
| 3.7 | Every `Enqueue()` rewrites the whole file                          | ❌ not addressed (not claimed either) | `ObserverDurableOutbox.cpp:73-88` unchanged                                                                                                                                                                                 |
| 4.1 | Screenshot subtypes (A.9)                                          | ⚠️ half                               | V2 wire is now always `"standard"` (`:711`). The legacy struct and local JSON still split Normal/Advanced (`AnalyticsUserData.h:238,241`; `:1292-1293`)                                                                     |
| 4.2 | Rating: fabricated "Good", no share gate, local dashboard exposure | ⚠️ half                               | fabricated `Good++` gone ✅ (only `SetExperienceRating` touches `GlobalUserRatings` now). No `share.sent` gate, and `irisRating` still in the local export (`:1277-1287`) — both unchanged                                  |
| 4.3 | `AgentId = MD5(name)`                                              | ⚠️ half                               | V2 session uses `SalesPersonID` ✅ (`:267-269`). `ExportAnalyticsToJson` still writes `MD5(name)` as `agent_id` (`:1479`), so the local file and the server disagree about who the agent is                                 |
| 4.4 | Cancel leaves V2 session open                                      | ✅ fixed                              | `:167` `EndSession("session_cancelled")`                                                                                                                                                                                    |
| 4.5 | Session outcome never reaches V2                                   | ✅ fixed                              | `:789` `meeting.outcome_set`                                                                                                                                                                                                |
| 5a  | Environment defaults exported as observed                          | ⚠️ half                               | `bHasBeenSet` added and set (`AnalyticsUserData.h:154`; `:1032,1047,1060`) but the exporter never reads it — `:1418-1422` still writes `"Noon"/"Clear"/"12:00"/"August 16"` unconditionally                                 |
| 5b  | `entity.id` slug                                                   | ✅ (narrow)                           | `:342` replaces spaces only; `/ ( ) &` and accented characters still fail the plugin's own `IsSafeOpaqueIdentifier` and the click is dropped locally. Use a whitelist filter, not a single `Replace`                        |

## A. The one that blocks everything: flat "compatibility" keys

Both requests now carry the correct nested objects — and _also_ the old flat keys, labelled
"backward-compatibility" (`ObserverActivationClient.cpp:114-119` and `:541-543,583-589`). There is
nothing to be compatible with: the flat form never worked against any server. And both schemas are
`z.strictObject`, so any extra key is a rejection. Run today against the live contracts:

```
1.  activation, as sent   FAIL  unrecognized_keys  app_version, plugin_version, build_id, engine_version
1b. same, flat keys removed                        PASS
2.  heartbeat, as sent    FAIL  unrecognized_keys  installation_nonce, reported_environment, os,
                                                    app_version, plugin_version, build_id,
                                                    engine_version, queue_depth, queue_bytes
2b. same, flat keys removed                        PASS
3.  diagnostic.test, as sent                       ok: true
```

**Fix, exactly:**

- Activation: delete `ObserverActivationClient.cpp:114-118` (the comment and the four flat keys
  `app_version`, `plugin_version`, `build_id`, `engine_version`). **Keep `:119`
  `reported_environment`** — it sits inside the "backward-compatibility" block but it is a required
  top-level field. (An earlier version of this document said `:114-119`; that was wrong by one line
  and would have traded one rejection for another.) The body is then exactly
  `{ activation_code, installation_nonce, build, os, reported_environment }`.
- Heartbeat: delete `:541-543` (`installation_nonce`, `reported_environment`, `os` — these three are
  _outside_ the commented compat block, easy to miss) and `:583-589`. The body is then exactly
  `{ sent_at, build, queue, last_error }` and nothing else; the heartbeat is authenticated by the
  bearer token, so it carries no installation identity of its own.

Everything else in both payloads is already right.

**Why the 17 tests did not catch it:** they run the mock transport (`obs_tok_mock_*` / `DEV-` codes),
which never parses a request. The plugin already allows `http://127.0.0.1` in non-shipping builds —
run `pnpm ue5:mock` from this repository (it parses with the same Zod schemas the live endpoint uses),
point `ActivationEndpoint` at the printed loopback URL, and activate with the code it prints. That is
the test that would have failed on this drop, and it takes a minute.

## B. Small follow-ups, in priority order

1. **Unrecognised 4xx still stalls** (`ObserverAnalyticsSubsystem.cpp:1913-1915`). The contract says
   quarantine-and-continue, like 400. Change the `== 400` branch at `:1825` to
   `>= 400 && < 500 && !bRequestRetryable`, so 404/415/422 take the same path.
2. **`CurrentDynamicBatchSize` never recovers** after a 413 (`:1850` is the only assignment). Reset it
   to the configured size on a fully successful dispatch, otherwise one bad batch halves throughput
   for the rest of the process's life.
3. **Double emission on unit view end** (`InsightAnalyticsSubsystem.cpp:562` + `:567`): the bridge
   sends `unit.view.ended` _and_ `TrackUnitViewed` sends `unit.viewed` for the same view. One fact,
   one event — keep `unit.view.started`/`unit.view.ended` (that is the event map's pair) and drop the
   `TrackUnitViewed` call there.
4. **Empty strings as environment facts** (`:1038`, `:1053`): `TrackWeatherChanged` is called with one
   of weather/time-of-day as `""`, so every `environment.weather_changed` event carries an empty
   `time_of_day` or `weather_type` plus an always-empty `clock_time`. The event map has one event for
   this — `scene.changed { time_of_day, clock, weather }` — with only the fields that are known. Emit
   that once, from one place; omit unknown fields rather than sending `""`.
5. **Event names vs `docs/03-event-map.md`**: `unit.balcony_viewed` / `unit.floor_cut_viewed` /
   `environment.clock_changed` are not in the map (`unit.balcony.entered/exited`,
   `unit.floor_cut.shown/ended`, `scene.changed`). Nothing rejects them today — the registry is null
   until ADR-0013 — but every name that lands now is a migration later. Align before the Blueprint
   node replacement in §C, so nodes are replaced once.
6. The three half-done items above (4.1 local subtypes, 4.3 local `agent_id`, 5a exporter ignoring
   `bHasBeenSet`) are each a two-line change in `SerializeUserDataToJson` / `ExportAnalyticsToJson`.
7. **No heartbeat timer.** `SendHeartbeat()` is still only reachable from Blueprint/console; the
   handoff (§8.1) has it on a timer. Admin's "Connected" state depends on it arriving unprompted.
8. **Was the anon key rotated?** The drop removes it from the build; the round-1 note about the key
   having already shipped stands until MADSPACE confirms rotation on the Supabase side.

## Addendum — third drop, same day (14:34): the blocker is closed

Re-checked by diffing against the second drop and re-running the exact shapes through the live
schemas. `ObserverActivationClient.cpp` is −15 lines, +0.

```
PASS  activation   { activation_code, installation_nonce, build, os, reported_environment }
PASS  heartbeat    { sent_at, build, queue, last_error: null }
PASS  heartbeat    { sent_at, build, queue, last_error: { code, at } }
```

Also fixed in this drop, unannounced — all verified in the diff:

| Item                                | Status                                                                                                                                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §B.1 unrecognised 4xx               | ✅ quarantine-and-continue for any non-retryable 4xx except 401/403/413/429; reason carries the status                                                                                                                                                               |
| §B.2 batch size recovery            | ✅ reset to the configured size on a fully clean delivery                                                                                                                                                                                                            |
| §B.3 double emission on view end    | ✅ `TrackUnitViewed` call removed; `unit.view.started`/`.ended` is the one pair                                                                                                                                                                                      |
| §B.4 empty-string environment facts | ✅ `TrackWeatherChanged` omits empty fields (still three event names, see §B.5)                                                                                                                                                                                      |
| §B.7 heartbeat timer                | ✅ every 60s, first at 5s, cleared in `Deinitialize`                                                                                                                                                                                                                 |
| 4.3 local `agent_id`                | ✅ `SalesPersonID`, same as V2                                                                                                                                                                                                                                       |
| 5b slug                             | ✅ whitelist filter, separators collapsed, 128-char cap                                                                                                                                                                                                              |
| 5a environment defaults             | ⚠️ exporter now honours `bHasBeenSet`, but it is one flag for four fields — call only `TrackWeather` and `"Noon"`, `"12:00"`, `"August 16"` still export as observed. Laziest correct fix: make the four defaults in `AnalyticsUserData.h` empty and delete the flag |

**One new finding, small and real: `build.engine_version` passes by zero margin.**
`FEngineVersion::Current().ToString()` is `5.6.0-43139311+++UE5+Release-5.6` on a stock build —
exactly 32 characters, and the contract's maximum is 32. A licensee or custom engine branch name
(37 characters in the check below), or a nine-digit changelist, fails activation _and every
heartbeat_ on that machine only, with nothing in the plugin's log to say why.

```
FAIL  activation, licensee-branch engine string
      too_big  build.engine_version  expected string to have <=32 characters
```

The contract documents the short form (`"engine_version": "5.6"` in the handoff). Send
`FEngineVersion::Current().ToString(EVersionComponent::Patch)` → `5.6.0`, in both requests.

**Still open, unchanged since round 1 or 2:** 3.7 (`Enqueue` rewrites the whole queue per event),
4.1 (local struct and JSON still split Normal/Advanced screenshots), 4.2 (no `share.sent` gate; the
rating is still in the kiosk-local export), 1.3 (`TrackAnalytics` not bridged), §B.5 (event names off
the event map), §B.8 (was the round-1 anon key rotated). None of them blocks a first real
activation.

**What is still unproven:** the C++ HTTP path itself. The shapes are right; whether a packaged
build completes activate → `diagnostic.test` accepted → heartbeat 200 is only shown by running it
once against `pnpm ue5:mock` on loopback. The 17 tests still use the mock transport.

## Addendum 2 — fourth drop, same day (17:06): `engine_version` is fixed

**Claim checked:** the engine version string now uses
`FEngineVersion::Current().ToString(EVersionComponent::Patch)` in both the activation and the
heartbeat payload.

**Verified.** Diffed against the third drop: one file changed,
`Private/Observer/ObserverActivationClient.cpp`, and in it exactly two lines, `:109` (activation)
and `:541` (heartbeat). Both now call `ToString(EVersionComponent::Patch)`. There is no other
`engine_version` or `FEngineVersion` site in the plugin. Nothing else moved, so nothing the
third drop fixed was disturbed.

Run through the live Zod schemas with the exact request shapes the plugin builds:

| `engine_version`                                        | length | activation | heartbeat |
| ------------------------------------------------------- | ------ | ---------- | --------- |
| `5.6.0` (Patch form, stock 5.6)                         | 5      | PASS       | PASS      |
| `5.10.12` (Patch form, the longest it can plausibly be) | 7      | PASS       | PASS      |
| `5.6.1-44394996+++UE5+Release-5.6-Licensee` (old form)  | 41     | FAIL       | FAIL      |

The last row is the defect this drop removes: a licensee engine branch would have failed every
activation and every heartbeat on that machine.

Secret scan of the drop: no JWT-shaped string, no Supabase host. The three pattern hits are the
privacy guard's own prefixes (`ObserverEventValidator.cpp:397`), the verifier's regex
(`Tools/verify_observer_source.py:165`) and a test fixture that feeds the guard a fake bearer
string to prove it is refused (`Tests/ObserverContractTests.cpp:118`). All three are unchanged
from the third drop.

**Not verified, and cannot be from here:** that it compiles, and the 17 tests. Both are claims
about his machine; the change itself is a one-token edit to a call that already compiled.

**Next, agreed:** the loopback run against `pnpm ue5:mock` (activate, `diagnostic.test`
accepted, heartbeat 200). That is the first time the C++ HTTP path is exercised end to end; the
17 tests use the mock transport, which never parses a request. After it, one real session against
the Preview is worth more than another review: since 2026-09-17 ingested events become meetings on
the customer's screens (ADR-0038), and `docs/ue5-integration-handoff.md` §13 says which events
and fields are read. The one that decides whether anything joins: `unit_id` must be the unit's
code exactly as the developer's catalogue states it.

Still open from the first addendum, none blocking: the full-queue rewrite in `Enqueue`, the local
screenshot subtypes, the share gate and local rating export, `TrackAnalytics` unbridged, one flag
for four environment fields.

## Addendum 3 — a proposal to issue activation codes from a separate website (same evening)

**The proposal.** Akhilesh offered to generate the one-time activation code from a website of his
own, store it in a database, manage the connection with Unreal from his side, and show on that
website whatever we say is needed. Offered as an optional, separate milestone.

**Answer: not needed, and it should not be built.** It already exists on the Observer side, and it
is the one part of the system that must have a single owner.

- MADSPACE administration creates the project and the source, and issues the code
  (`issueActivationCodeAction` → `ObserverAdmin.issueActivationCode`). The operator sees the code
  once, with a copy button, its purpose (activation or reactivation), when it was issued, when it
  expires, and one of four statuses: issued, consumed, expired, revoked.
- The database never holds the code. It holds a selector and an HMAC keyed by a server-side
  pepper (`observer.activation_codes`), the source the code activates, its purpose, its state and
  its expiry. A code is single-use and lives fifteen minutes. A dump of the table cannot reproduce
  one.
- Activation mints the source credential and returns it once. From then on the source page shows
  what an operator needs: the three states kept apart (activated, connected, ingestion verified),
  the credential's lifecycle, last heartbeat and its freshness, the observed app, plugin, build and
  engine, the reported environment and whether it mismatches, the last verification, the last event
  accepted, and the outbox figures the heartbeat carries.

A second website with its own table would be a second authority for credentials. The backend could
not verify a code it did not issue; a code stored where it can be read is a credential at rest; and
a site that talks to a database from the browser is the shape the first review removed from the
plugin's web assets. None of that is a judgement on the offer, which was made without sight of this
side's source, as the handoff intends.

**What is his, and would help:** the screen inside IRIS where an operator types the code and sees
what came back: activated or reactivated, `activation_failed` and "ask for a new code", rate
limiting, no network, the environment mismatch, and the diagnostics of handoff §8.3. It is specified
in `docs/ue5-remaining-work-2026-09-17.md`. (Corrected later the same evening: this sentence first
listed `already_activated` with the source id. The contract removed that answer, `PD-27`, and the
handoff's §2.3 had not caught up; it has now.)

**What actually stands between his build and a real backend is on this side, and is the
operator's.** By this repository's own records the hosted Preview database holds the August
migrations and none of the source spine, so activation cannot work there yet. See the operator
steps in `docs/PROJECT-STATE.md`. Until then the full path, MADSPACE screens included, runs on a
local control plane (`.env.example`, "Local control plane"), which is how it was proven here.

## C. On UE-OBS-011 — keep the bridge, then replace the nodes, in that order

Agreed with the instinct to end up on the new nodes only. Two things make the order matter:

- The bridge is the only reason existing Blueprints emit V2 at all today, so it stays until each
  node is actually replaced — not before.
- A node must never be bridged _and_ replaced at the same time; §B.3 is what that looks like. The rule
  for the replacement pass: when a legacy call is swapped for the new `UObserverBlueprintLibrary`
  node in a Blueprint, remove that call's bridge line in `InsightAnalyticsSubsystem.cpp` in the same
  change, so every fact has exactly one emitter at every point in the migration.

Do the §A delete and the §B.1–B.5 renames first; replace nodes second. Otherwise the nodes get
replaced twice.
