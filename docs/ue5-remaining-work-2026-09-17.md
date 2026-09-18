# What is still missing on the Unreal side — 2026-09-17

For Akhilesh. Written against the fourth InsightAnalytics drop (17:06), with `file:line` for every
claim about it. Paths are relative to `Source/InsightAnalytics/`.

**The target.** A showroom PC gets the plugin, an operator creates a project and a source in
Observer, the website shows a one-time code, IRIS asks for that code, and from then on the
showroom's meetings appear on the customer's dashboard. No second website, no configuration beyond
one address.

**Where it stands.** The wire contract is right on your side since the third drop, and
`engine_version` since the fourth. On ours, creating the project and the source, issuing the code,
activation, heartbeat, ingest, and turning your events into meetings on screen are built and proven
end to end on a local Observer.

**Checked against your 2026-09-18 drop: §2 and §3 below are closed.** The activation screen is
built, and everything this list asked of it is in the source; the three mismatches are corrected. We
did not take that from the notes: each claim was read in your own files, and then your exact
payloads were sent over real HTTP to our real endpoints. That run is recorded at the head of §3.

**The first item on this list is still the open one: §1, the loopback run.** Your seventeen
automation tests carry no HTTP request at all — there is no `FHttpModule` and no `CreateRequest`
anywhere under `Private/Tests/` — so the C++ transport has still never had a request parsed by a
server. It is the last unproven link on your side, and it is half an hour's work.

**And one new thing, which post-dates this drop:** a fourth endpoint, for reporting who your
`agent_id` values are, so every meeting on the customer's screen can name the person who presented
it. Specified in `docs/ue5-integration-handoff.md` §8.4. Nothing on this list depends on it.

A live Observer host still does not exist: the hosted database does not hold the source tables and
the server secrets are not set. That is our operator's work, not yours. Until we send you an HTTPS
address and a real code, everything below can be built and proven against the mock.

In priority order:

## 1. The loopback run, before anything else

Still the one unproven thing: the C++ HTTP path has never completed a request that a server parsed.
The 17 tests use the mock transport, which never reads a request body.

From this repository: `pnpm install`, then `pnpm ue5:mock --port 8787`. It prints an activation
code. In a Development build set **Activation Endpoint** to
`http://127.0.0.1:8787/functions/v1/observer-activate` and activate with that code.

Done means all of these, in one run, from a real build and not from an automation test:

1. Activation answers `200 "activated"`, and the credential is on disk under DPAPI.
2. `diagnostic.test` comes back `accepted` in `results[]`.
3. A heartbeat answers `200 { "status": "ok" }`, unprompted, from the 60 s timer.
4. One real session (start, a few unit views, outcome, end) drains from the outbox with no duplicate
   and no loss.
5. The refusals behave as the handoff §2.3 says. A wrong code, or the printed code used a second
   time, answers `401`. For the rest, start the mock with
   `pnpm ue5:mock --port 8787 --force rate_limit,unavailable`: the first request gets a `429` with
   `Retry-After: 5`, the second a `503`, and from the third on it behaves normally.
   `drop_before_processing` and `drop_after_processing` can be forced the same way, and they are the
   two that prove your retry keeps the same `event_id`.

Send us the mock's console output and the plugin log of that run. That closes the transport.

**One correction on our side, so you do not build for it.** The handoff's §2.3 listed
`409 already_activated` with a `source_id`. That answer was removed from the contract some time ago
and the handoff had not caught up; it has now. Activation can fail in exactly four ways:
`401 activation_failed`, `400 malformed_request`, `429 rate_limited`, `503 unavailable`. A failure
body's `source_id` is always `null`.

## 2. The activation screen inside IRIS — BUILT in the 2026-09-18 drop

> **Verified in your source, 2026-09-18.** `SObserverActivationScreen.{h,cpp}` is new, and every
> line this section asked for is in it. It is a viewport widget
> (`ObserverAnalyticsSubsystem.cpp:669`, `AddViewportWidgetContent(..., 2000)`), so a packaged
> Shipping kiosk needs no console. The four outcomes carry the four sentences
> (`ObserverAnalyticsSubsystem.cpp:790-812`), the `429` feeds a live countdown
> (`:822` → `SObserverActivationScreen.cpp:225-272`), and the three ticks light themselves: a
> heartbeat and a `diagnostic.test` are sent the moment activation succeeds (`:780-781`). The
> buyer-privacy rule is real and checked in three places — `ShowActivationScreen()` returns
> immediately while a meeting is running (`:658`, again at `:270` and `:686`).
>
> Two things we did not ask for and are glad to see: the endpoint guard refuses plain HTTP outside a
> development build (`ObserverActivationClient.cpp:22-31`), and the local outbox mismatch has its
> own sentence naming the bound source.
>
> One small note, no action needed: the outbox mismatch broadcasts `409`
> (`ObserverAnalyticsSubsystem.cpp:733`). Nothing on our wire answers `409` — it was removed from
> the contract (`PD-27`) — so a reader of that delegate may take it for a server code. Worth a
> local constant rather than an HTTP status, whenever you next touch it.

**What the fourth drop does today.** Activation is `ActivateWithCode`, Blueprint-callable
(`Public/Observer/ObserverAnalyticsSubsystem.h:37`), and the console command `Observer.Activate
<code>` (`Private/Observer/ObserverAnalyticsSubsystem.cpp:222`). The diagnostics HUD prints
"UNCONFIGURED (Enter Activation Code)" (`Private/Observer/UI/SObserverDiagnosticsHUD.cpp:176`) and
is made of text blocks only; there is nowhere to type. `Content/` is empty, so no widget ships. A
Shipping build has no console. So in the build a showroom actually runs, a code cannot be entered
at all.

**What is needed.** One operator-facing screen, UMG or Slate as you prefer, that works in Shipping.

_When it appears_

- At application start while the state is `Unconfigured`, before any presentation can begin.
- At application start while the state is `Unauthorised` (the credential was revoked or replaced):
  same screen, worded as "this showroom needs a new code".
- On demand, from somewhere only an operator reaches (a settings page or a key chord of your
  choosing), so a working installation can be inspected.
- **Never on top of a running session.** A buyer is in the room. If a `401` arrives mid-session,
  keep queueing as handoff §5.8 says and ask at the next start.

_What it holds_

- One text field for the code and one button. Trim whitespace. Do not validate the alphabet or a
  prefix: the contract constrains length only, 8 to 64 characters, and the prefix is not semantic
  (handoff §2.1).
- A line saying where the code comes from: "Issued in Observer, MADSPACE administration, on the
  source's page. Valid for 15 minutes, works once."
- While the request runs: the field disabled, "Activating…", no second request.

_What it shows afterwards_

| Answer                       | The screen says                                                                                            | The plugin does                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `200 "activated"`            | "Activated as `display_label`", the `source_id`, the environment                                           | store the token, go to `Active`          |
| `200 "reactivated"`          | the same, worded "reconnected"                                                                             | replace the token, **keep the outbox**   |
| `401 activation_failed`      | "This code is not valid any more. Codes last 15 minutes and work once. Ask for a new one."                 | no retry                                 |
| a different source's code    | "Events from source `current source_id` are still waiting on this PC. Ask for a reconnection code for it." | your existing local refusal; queue kept  |
| `429 rate_limited`           | "Too many attempts. Try again in N seconds." with N from `Retry-After`                                     | re-enable the button after N             |
| `503`, timeout, no network   | "Observer cannot be reached. Check the network and try again." and the address it tried                    | the operator retries; nothing is lost    |
| `400 malformed_request`      | "This build sent a request Observer refused. Report it to MADSPACE." and the plugin version                | no retry; a new code will not help       |
| `environment_mismatch: true` | a warning beside the success: "This build reports `X`, the source is registered as `Y`."                   | carry on; it is a warning, not a refusal |

_After a success, three ticks, in this order, each with its own state_

1. **Activated** — the answer above.
2. **Connected** — the first heartbeat answered `200`.
3. **Ingestion verified** — a `diagnostic.test` with `reason: "activation_check"` came back
   `accepted`.

These are the same three states the source's page in Observer keeps apart, so the operator at the
showroom and the administrator at the website read the same thing. Send the test event and the
heartbeat automatically after activation; do not make the operator find a button.

_Rules_

- The code and the token never reach a log, a crash report, an event, or the diagnostics export.
  Clear the field after sending. Do not persist the code.
- No personal data on this screen and nothing a buyer should read.
- The rest of handoff §8.3 belongs on the same screen or one step from it: pending and quarantined
  counts, the oldest pending timestamp, the last error code, the clock difference.

**What has to change underneath for the screen to be possible.** Today every failure collapses into
`EObserverActivationState::Error` with a sentence (`ObserverAnalyticsSubsystem.cpp:617-648`), and
the sentence is chosen by status alone (`Private/Observer/ObserverActivationClient.cpp:261-269`):

- `400` shares the `401` sentence, so a plugin defect is reported to the operator as a bad code, and
  a new code will not fix it.
- The body's `code` is not read, and `Retry-After` does not reach the caller: the activation
  response carries a success flag, the status, the source configuration and a sentence
  (`Public/Observer/Interfaces/IObserverTransport.h:52-58`), and only the sentence travels on.
- The screen needs a reason it can switch on, not a sentence: the HTTP status, the body's `code`,
  the seconds to wait, and for the local refusal the `source_id` the outbox is bound to. Expose that
  to Blueprint next to `OnActivationStateChanged`.

The second row of the table is already your behaviour (`EnsureOutboxSourceBinding`), and it is the
right one: it is what stops a fresh code from quietly turning a connected PC into a second source.
It only needs to say which source it is holding events for.

## 3. Three small mismatches found while checking this — ALL THREE CORRECTED

> **Verified in your source, and then over the wire, 2026-09-18.** `token_expires_at` is read with
> a fallback to `expires_at` (`ObserverActivationClient.cpp:219-223`), `environment_mismatch` is
> read (`:239`), and `server_time` is read and turned into a clock skew shown on the HUD
> (`:686-692`, `SObserverDiagnosticsHUD.cpp:223`). The `expires_at` still in
> `ObserverAnalyticsSubsystem.cpp:495,576` is your local credential file, not the wire, and is
> right where it is.
>
> Then we built your two payloads field for field as your code writes them — activation from
> `ObserverActivationClient.cpp:101-113`, heartbeat from `:576-613` — and sent them over real HTTP
> to a real Observer. **Nine checks, all green:** activation `200 activated`; the response carried
> `heartbeat_url`, `token_expires_at` and `environment_mismatch`; a heartbeat with a backlog and a
> `last_error` answered `200`, and so did one with an empty queue and `last_error: null`; the
> answer carried `server_time`; your `diagnostic.test` with `session_id` and `sequence` null was
> `accepted`; and the same code a second time answered `401 activation_failed` with
> `source_id: null`, which is what your screen maps to its first sentence.
>
> So the payload half of §1 is no longer a risk. What §1 still proves is your HTTP client itself.

None of them breaks activation today.

1. **`expires_at` is not the field's name.** The plugin reads `expires_at`
   (`ObserverActivationClient.cpp:220,224`; `ObserverAnalyticsSubsystem.cpp:456,537`). The contract
   says `token_expires_at` (handoff §2.2). It is always `null` today, which is why nothing fails,
   and it is the reason the field exists at all: a future expiry would be silently ignored.
2. **`environment` and `environment_mismatch` are never read** from the activation answer. §8.3
   asks the diagnostics to show both. The HUD shows what the build reports about itself, which is
   the half the server does not trust.
3. **`server_time` is never read** from the heartbeat answer, so the clock difference of §8.3
   cannot be shown. It is the first thing support asks when timestamps look wrong.

## 4. Configuration and packaging

- **One address is enough.** Only Activation Endpoint has to be right; the ingest and heartbeat
  addresses come back from activation and you already store them. The default,
  `https://observer.madspace.io/functions/v1/observer-activate`
  (`Private/Observer/ObserverProjectSettings.cpp:8`), has the right path. The host is ours to
  provide and may differ; keep it a setting and we will send the final value.
- **HTTPS only in Shipping, loopback HTTP in Development** (`ObserverActivationClient.cpp:22`) is
  right. Keep it.
- **The drop is a source plugin**: no `Binaries/`, `"Installed": false`, engine 5.6.0. If IRIS is a
  C++ project that is all it needs. If the plugin ever has to go into a project that cannot compile
  it, it needs a prebuilt package per engine version. Tell us which case IRIS is.
- **A one-page install note** we can hand to whoever sets up a showroom PC: where the folder goes,
  what to enable, the one setting, and how to reach the activation screen.

## 5. What your events must carry for the dashboard

Handoff §13 has the full table. Three things decide whether a showroom's data joins anything:

1. **`unit_id` is the unit's code exactly as the developer's catalogue states it.** `A-204` and
   `A204` are two units. Without this, every unit-level figure stays empty.
2. **A view needs its `unit.view.ended`** to have a duration. Nothing is estimated.
3. **The first segment of a feature path names the section** (`Residences`, `Amenities`, …).

**And one new thing to build, added 2026-09-18: report who the presenters are.** `agent_id` is a
GUID minted on the kiosk when a sales person is added (`Private/InsightAnalyticsSubsystem.cpp:120`).
That is correct in carrying no name, and it stays that way. But every meeting on the customer's
screens must show the presenter's name, so the name now travels on a fourth endpoint, beside the
events and never inside them: `POST {base}/functions/v1/observer-agents`, the same credential, a
body of `sent_at` and a list of `{ agent_id, display_name }`. Handoff §8.4 is the full description:
the address (derived from `heartbeat_url`), when to send it (after activation, at start, and when
the list of sales people changes), the failures, and why it never goes through the outbox. It is a
small piece: one request built from the list your kiosk already keeps.

Until it is sent nothing breaks: the meeting shows the identifier, MADSPACE administration flags
the presenter as unnamed, and somebody types the name there. Two things stay as they were. The same
person on two showroom PCs is two agents, because each kiosk mints its own GUID; how ids are
provisioned across machines is ours to propose. And the id must stay stable for a person on a
machine, across restarts.

## 6. Still open from the reviews, none blocking

- `Enqueue` rewrites the whole queue file for every event (3.7).
- The local struct and JSON still split Normal and Advanced screenshots (4.1).
- No `share.sent` gate, and the rating is still in the kiosk-local export (4.2).
- `TrackAnalytics`, the hierarchy click counter, is not bridged to V2 (1.3).
- One `bHasBeenSet` flag covers four environment fields (5a). Making the four defaults empty and
  deleting the flag is the smallest correct fix.
- UE-OBS-011: replace the legacy nodes with the `UObserverBlueprintLibrary` nodes, removing each
  call's bridge line in the same change so every fact has exactly one emitter.
- Event names: **no rename is needed.** Both your spellings and the event map's are read (§13).
- Was the key that shipped in the round-1 web assets rotated? If that project is yours, please
  rotate it and confirm.

## 7. Not needed

- **A separate activation website or code table.** Observer issues the code, stores only a keyed
  hash of it, and shows the operator the source's state. A second issuer would be a second
  authority for credentials (round-2 review, Addendum 3).
- **Anything that sends `source_id`, `tenant_id` or `project_id`.** Identity comes from the token.
  The project a showroom belongs to is decided in Observer when the source is created, which is
  what makes "create a project, get a code, type it in" the whole setup.

## What we owe you

A live HTTPS address and a real activation code, as soon as the hosted side is up. After that, one
real meeting from IRIS on the dashboard is the acceptance test for both of us.
