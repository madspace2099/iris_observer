# Round 3 — your fifth drop, verified

**For Akhilesh. Date:** 2026-09-18 · Written against `InsightAnalytics (3).zip`, the drop that
reports the activation screen built. Every `file:line` below is in that archive, and paths are
relative to `Source/InsightAnalytics/`.

**The short version.** All four of your points check out: I verified them in your source rather than
from your notes, and then sent your payloads over real HTTP to a real Observer. One item on
`docs/ue5-remaining-work-2026-09-17.md` is still open, and it is the same first one: §1, the loopback
run.

**One thing needs you before you start that run: pull the repository.** We found and fixed a defect
in the mock, in the exact path your loopback run walks. The addendum after §4 says what it was and
what you should now see.

---

## 1. Activation screen — confirmed

`Public/Observer/UI/SObserverActivationScreen.h` and its 429-line implementation are new, and
everything §2 of the remaining-work list asked for is in them.

- **It works without a console.** A viewport widget at z-order 2000
  (`Private/Observer/ObserverAnalyticsSubsystem.cpp:669`,
  `GEngine->GameViewport->AddViewportWidgetContent`), so an operator standing in front of a packaged
  Shipping kiosk can activate it. That was the blocking gap.
- **The four outcomes carry the four sentences** (`ObserverAnalyticsSubsystem.cpp:790-812`), near
  enough word for word to what the list specified: `401` tells the operator to ask for a new code,
  `429` counts down, `400` names the plugin version and says to report it, `503` names the address it
  could not reach.
- **The countdown is real**, fed from the response rather than guessed (`:822` →
  `SObserverActivationScreen.cpp:225-272`).

**The part I was most glad to find.** The rule that the modal must never appear during a presentation
is enforced in three places, not one: `ShowActivationScreen()` returns immediately while a meeting is
running (`:658`), and the same check gates the automatic prompt (`:270`) and the deferred retry
(`:686`). That is the requirement that could have gone wrong quietly, in front of a buyer, and it did
not.

**Two things you added that we did not ask for, and want to keep.** The endpoint guard that refuses
plain HTTP outside a development build (`Private/Observer/ObserverActivationClient.cpp:22-31`), and
the outbox-mismatch message that names the bound source, so an operator knows which reconnection code
to ask for.

## 2. Auto-verification, three ticks — confirmed

`SendHeartbeat()` and `SendTestEvent("activation_check")` are called the moment activation succeeds
(`ObserverAnalyticsSubsystem.cpp:780-781`). That is Activated, Connected and Ingestion Verified
lighting themselves, with no console command and nothing for the operator to remember.

## 3. Payload corrections — confirmed in the source, then tested on the live endpoints

Read in your files:

| What                                                            | Where                                         |
| --------------------------------------------------------------- | --------------------------------------------- |
| Activation body is exactly the five keys                        | `ObserverActivationClient.cpp:101-113`        |
| Heartbeat body is exactly `{sent_at, build, queue, last_error}` | `ObserverActivationClient.cpp:576-613`        |
| `token_expires_at`, with a fallback to `expires_at`             | `ObserverActivationClient.cpp:219-223`        |
| `environment_mismatch`                                          | `ObserverActivationClient.cpp:239`            |
| `server_time`, turned into a clock skew on the HUD              | `:686-692`, `SObserverDiagnosticsHUD.cpp:223` |

The `expires_at` still in `ObserverAnalyticsSubsystem.cpp:495,576` is your **local credential file**,
not the wire. It is correct where it is; do not change it.

### Your payloads, over real HTTP

I rebuilt both bodies field for field as your code writes them and sent them to a real Observer.
**Nine checks, all green:**

```
activation                             200 activated
  response carries heartbeat_url       …/functions/v1/observer-heartbeat
  response carries token_expires_at    null
  response carries environment_mismatch  false
heartbeat, backlog + last_error        200
  response carries server_time         2026-09-18T09:47:36.549Z
heartbeat, empty queue + null error    200
diagnostic.test, session_id null       200, accepted
the same code a second time            401 activation_failed, source_id: null
```

The exact bodies, if you want to diff them against what your client emits:

```json
{
  "activation_code": "…",
  "installation_nonce": "<uuid>",
  "build": {
    "build_id": "IRIS_Dev",
    "app_version": "IRIS 4.3.0",
    "plugin_version": "0.2.0",
    "engine_version": "5.6.0"
  },
  "os": "Windows",
  "reported_environment": "development"
}
```

```json
{
  "sent_at": "<iso>",
  "build": { "…": "as above" },
  "queue": {
    "pending_events": 3,
    "oldest_pending_at": "<iso>",
    "quarantined_events": 0,
    "bytes_used": 4096,
    "bytes_ceiling": 52428800,
    "dropped_events": 0
  },
  "last_error": { "code": "rate_limited", "at": "<iso>" }
}
```

The second heartbeat sent `"oldest_pending_at": null` and `"last_error": null` with an empty queue,
and was accepted the same way.

**So the payload half of the loopback run is settled before you run it.** If your loopback attempt
fails now, it is your HTTP client, not the shape of what it sends.

## 4. Seventeen tests — confirmed

Counted: 14 in `Private/Tests/ObserverAutomationTests.cpp` and 3 in `ObserverContractTests.cpp`.

---

## Addendum, same day: pull before you run the mock

You said you are setting the loopback run up now. **Pull first** — there was a defect in the mock,
in exactly the path you are about to walk, and it is fixed.

`pnpm ue5:mock` built its backend with a bare `http://127.0.0.1`: no port, no `/functions/v1`. So
it answered activation `200` and handed back `ingest_url` and `heartbeat_url` pointing at port 80
with no route prefix. Your client does the right thing — it stores both from the response
(`ObserverActivationClient.cpp:202-203`) and requires them — so activation would have succeeded,
the screen would have turned green on the first tick, and every request after it would have answered
`404`. You would have spent the afternoon looking at your HTTP client, and the fault would have
been ours.

`startMockServer` now tells the backend the address it actually bound, the moment it has a port, and
adds the route prefix itself. `http.test.ts` gained the case that would have caught it: it uses the
two URLs from the activation answer rather than building its own paths, which is what every other
case in that file did and why none of them noticed.

**Walked end to end after the fix, with the forced failures, and this is exactly what you should
see:**

```
attempt 1                       429 rate_limited, Retry-After: 5
attempt 2                       503 unavailable
attempt 3                       200 activated
heartbeat_url                   http://127.0.0.1:8787/functions/v1/observer-heartbeat
heartbeat                       200 ok
diagnostic.test                 200, accepted
observer-agents, two names      200, recorded 2
observer-agents carrying an email   400 malformed_request
```

The last two are the fourth endpoint below: the mock serves it, so you can build §8.4 against
loopback before there is a live host.

## The one item still open

**§1 of the remaining-work list: the loopback run.** Your seventeen tests contain no HTTP request at
all. There is no `FHttpModule` and no `CreateRequest` anywhere under `Private/Tests/`, so the C++
transport has still never had a request parsed by a server. It is the last unproven link on your
side, and it is about half an hour:

```bash
pnpm install && pnpm ue5:mock --port 8787
```

It prints an activation code. In a **Development** build — your own endpoint guard refuses loopback
HTTP in Shipping, correctly — set Activation Endpoint to
`http://127.0.0.1:8787/functions/v1/observer-activate` and activate with that code.

To see your new screen's refusal states without writing a parser test, the mock can be told to answer
badly first:

```bash
pnpm ue5:mock --port 8787 --force rate_limit,unavailable
```

The first attempt then answers `429` with `Retry-After: 5`, the second `503`, and the third
succeeds. That exercises the countdown and the connection-error sentence against a real server.

## One small note, no action needed

You broadcast `409` for the local outbox-source mismatch (`ObserverAnalyticsSubsystem.cpp:733`).
Nothing on our wire answers `409` — it was removed from the contract by `PD-27`, because a `409`
carrying a `source_id` turned a guessed code into an existence oracle. Somebody reading that delegate
could take your `409` for a server code. Worth a local constant the next time you are in that file.

## One new thing, which post-dates your build

A fourth endpoint: `POST {base}/functions/v1/observer-agents`, for reporting the display name behind
each `agent_id` you send.

Every meeting on the customer's dashboard has to show who presented it, and an event may never carry
a name — `agent_id` stays the opaque identifier you already mint. So the name travels once, beside
the events and never inside them. The full specification is in `docs/ue5-integration-handoff.md`
§8.4: the body, the address (derive it from `heartbeat_url` by replacing the last path segment), when
to send it, the failures, why a name an administrator removed can never be reported again, and why a
failed report must never block or delay event delivery.

It is one request built from the list your kiosk already keeps. Nothing else on the remaining-work
list depends on it, and until it is sent nothing breaks: the meeting shows the identifier, and an
administrator types the name instead.

## What we owe you

A live HTTPS address and a real activation code. The hosted database still does not hold the source
tables and the server secrets are not set. That is our operator's work, not yours. Until then
everything above runs against the mock.

Good drop. The activation screen was the piece blocking the whole road, and it is done.
