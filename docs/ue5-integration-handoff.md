# UE5 integration handoff — what to build against

**For:** Akhilesh · **From:** Observer backend · **Updated:** 2026-09-01 (second pass, after your UE-OBS-001..004 report and settings)
**Contract:** `1.0.0-candidate.1` — **PROPOSED**, not yet implemented
**Machine-readable:** `docs/ue5-contract/openapi.json`, `schemas/*.json`
**For the two packages you are building:** [`validation-order.md`](ue5-contract/validation-order.md) · [`outbox-states.md`](ue5-contract/outbox-states.md) · [`v1-settings.md`](ue5-contract/v1-settings.md)
**Runnable mock:** `pnpm ue5:mock` (loopback only, no database, no network)

> **Read this first — it blocks UE-OBS-007.**
>
> Your envelope sends `app`, `agent_id`, `visitor_subject` and `entity` in
> addition to the seven fields below. The envelope is a **strict** object, so those four are
> currently refused and no real event parses. Everything else about your envelope matches:
> snake_case, millisecond UTC, canonical hyphenated GUIDs, sequence from 1.
>
> **Do not change your code yet.** We think adopting all four is the right answer and the
> extended schema is already written and tested against your exact sample. One condition if we
> do: `app.environment` is reported metadata, never authoritative — the stored
> environment comes from the source record. Your sample also sends `Development`
> capitalised, and the enum is lower-case.

This document is meant to be enough on its own. You should not have to read our TypeScript,
and if you find yourself needing to, that is a defect in this page rather than in your
reading of it.

**What changed since the last version.** UE-OBS-001 to UE-OBS-004 are done, so this is now
written against an implementation that exists rather than one that does not. Three things
follow: §4 and §5 are expanded into implementable specifications for the two packages you
are starting; §6 records the legacy transport as retired; and §9 lists five places where
what you have already built may not parse against these schemas. None of those five is a
complaint — they are coordination items, each with a test in
`packages/contracts/test/ue5/ue-compatibility.test.ts` that demonstrates the exact refusal.

---

## 1. The three endpoints

|           | Endpoint                                      | Auth                                   |
| --------- | --------------------------------------------- | -------------------------------------- |
| Activate  | `POST {base}/functions/v1/observer-activate`  | none                                   |
| Ingest    | `POST {base}/functions/v1/observer-ingest`    | `Authorization: Bearer <source_token>` |
| Heartbeat | `POST {base}/functions/v1/observer-heartbeat` | `Authorization: Bearer <source_token>` |

`base`, `ingest_url` and `heartbeat_url` all come back from activation. **Do not hard-code
them into the build** — store what activation returned, beside the credential. You have
already done the harder half of this in UE-OBS-001.

`Content-Type: application/json`. `Content-Encoding: gzip` is accepted on ingest.

---

## 2. UE-OBS-003 — activation

### 2.1 What you send

```json
{
  "activation_code": "DEV-7K4M-2QX9-D3TA",
  "reported_environment": "development",
  "installation_nonce": "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  "build": {
    "app_version": "IRIS 4.3.0",
    "plugin_version": "ObserverUE 0.2.0",
    "build_id": "iris-4.3.0-win64-shipping-8821",
    "engine_version": "5.6"
  },
  "os": "Windows 11 24H2"
}
```

**The code prefix is not semantic.** `DEV-` is as valid as `OBS-`; the schema constrains
length and nothing else. The mock mints whichever you ask it for —
`new MockObserverBackend({ codePrefix: "DEV" })`.

**`installation_nonce`** — a UUID generated **once**, the first time the plugin runs, and
persisted beside the outbox. Never regenerated, never derived from hardware, not a secret.
Its only job is to let the server say "this installation already has a source" instead of
silently creating a second one. If UE-OBS-003 currently sends a hardware fingerprint or a
hostname hint instead, those two fields were removed from the proposal — see §9.

**`reported_environment`** — what this build believes it is. The server does not trust it;
it compares against the source record and tells you if they disagree.

**The build block is metadata, not identity.** Changing any of it — including the engine
version — never invalidates your credential and never requires reactivation.

### 2.2 What comes back on success

```json
{
  "status": "activated",
  "source_id": "018f3a2c-9c11-4a7e-8b02-4d5e6f708192",
  "display_label": "Northgate · Showroom PC 1",
  "environment": "production",
  "environment_mismatch": false,
  "source_token": "obs_9f2c7a1b4e6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d",
  "token_expires_at": null,
  "ingest_url": "https://example.supabase.co/functions/v1/observer-ingest",
  "heartbeat_url": "https://example.supabase.co/functions/v1/observer-heartbeat",
  "accepted_schema_versions": { "min": 1, "max": 1 },
  "limits": {
    "max_batch_events": null,
    "max_batch_bytes": null,
    "max_event_bytes": null,
    "max_property_depth": null,
    "max_property_count": null,
    "min_send_interval_ms": null
  },
  "config_refresh_after": "2026-10-01T00:00:00.000Z"
}
```

**The token is returned once and never again.** Persist it before you do anything else.

**Treat it as opaque.** Never parse it, split it, decode it, or write it to a log, a crash
report or a telemetry field.

**`token_expires_at` is `null`, and will stay null.** The field exists so that a future
expiry policy would not be a breaking change. There is no refresh endpoint and none is
planned: credential material reaches a device through exactly one door.

**`limits` values may be `null`.** Null means the server states no limit and you should
apply your own configured default. It never means unlimited. Every value is null today
because the numbers are still yours to measure — see §10.

**Do not send `source_id`, `tenant_id` or `project_id` anywhere.** `source_id` is for your
diagnostic screen and support conversations. The server derives all identity from the token
on every request and will **reject** an event that carries any of them.

### 2.3 Every other answer

| HTTP                | `code`              | What it means                               | What you do                                                              |
| ------------------- | ------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| 200 `"activated"`   | —                   | New source registered                       | Store the token. Go to `Active`.                                         |
| 200 `"reactivated"` | —                   | Same source, new credential                 | Replace the stored token. **Keep the outbox.** Go to `Active`.           |
| 400                 | `malformed_request` | Your request is wrong                       | Do not retry. This is a plugin bug.                                      |
| 401                 | `activation_failed` | Unknown, expired, consumed **or revoked**   | Do not retry. Ask the operator for a new code.                           |
| 409                 | `already_activated` | This installation already has a live source | Do not retry. Show `source_id`; ask the operator to rotate or retire it. |
| 429                 | `rate_limited`      | Too many attempts                           | Wait `Retry-After`, then retry.                                          |
| 503                 | `unavailable`       | Backend down                                | Retry with backoff.                                                      |

Two things about that table that are easy to get backwards:

**The `401` is byte-identical for all four unusable-code cases.** Unknown, expired,
consumed and revoked answer the same status, the same body and the same `source_id: null`.
Do not try to tell them apart; there is nothing there to read. A response that separated
them would tell anyone holding a guessed code whether a source exists.

**`409` never happens to an unusable code.** It is reachable only from a _valid_ code
meeting an installation that already has a live source — at which point the caller has
already proved possession, so returning `source_id` costs nothing. An unusable code never
takes that path and never receives a `source_id`.

### 2.4 Recovery

There is no refresh endpoint and no self-service recovery. If the credential is lost or
revoked, an operator issues a **new one-time code tied server-side to the existing source**,
and you run the ordinary activation flow against the same endpoint. You get
`status: "reactivated"` and the same `source_id`.

**Keep your outbox across reactivation.** The events were never the problem.

---

## 3. UE-OBS-004 — the event envelope

```json
{
  "event_id": "b2a5f0c1-3d4e-4f7a-8c9b-0d1e2f3a4b5c",
  "event_name": "unit.viewed",
  "schema_version": 1,
  "occurred_at": "2026-09-01T09:14:02.881Z",
  "session_id": "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e",
  "sequence": 7,
  "properties": { "unit_code": "A-402", "duration_ms": 94000 }
}
```

| Field            | Rule                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id`       | UUID, **hyphenated lowercase or uppercase canonical form**. Generated before the first send, never regenerated. See §9 — this one needs a word. |
| `event_name`     | Dotted `lower_snake_case`, at least two segments. **The catalogue is not fixed yet** — the names here are illustrative.                         |
| `schema_version` | Integer, inside `accepted_schema_versions` from activation.                                                                                     |
| `occurred_at`    | ISO-8601 **with an offset**. `YYYY-MM-DDTHH:MM:SS.sssZ` — exactly what you already emit.                                                        |
| `session_id`     | UUID, or `null` for events belonging to no meeting.                                                                                             |
| `sequence`       | Integer **from 1**, or `null`. Null exactly when `session_id` is null. A counter starting at 0 loses the first event of every session.          |
| `properties`     | Free-form object. Two prohibitions, in §4.                                                                                                      |

**Field names are snake_case on the wire.** Unreal's `FJsonObjectConverter` lowercases the
first letter of each `UPROPERTY` by default, which produces `eventId`, not `event_id`. The
envelope is closed, so a camelCase key is a rejection rather than a silent drop. See §9.

A batch wraps events:

```json
{
  "batch_id": "018f4c11-2a3b-4c5d-8e9f-0a1b2c3d4e5f",
  "sent_at": "2026-09-01T09:14:05.100Z",
  "events": [/* … */]
}
```

`batch_id` is for correlating your log with ours. It is **not** used for deduplication, so
resending the same events under a new `batch_id` is fine and expected.

---

## 4. UE-OBS-005 — local validator and privacy guard

The full generated specification is [`validation-order.md`](ue5-contract/validation-order.md).
This is the shape of it.

**Validation runs before durable queue admission.** An event that fails locally never enters the
outbox: it would have been quarantined server-side anyway, and catching it here turns a round trip
into an assertion at the call site. Count it, name it on the diagnostic screen, and fix the caller.

**Three stages, and the split decides what you can do.**

| Stage        | Runs where  | Why                                                                                     |
| ------------ | ----------- | --------------------------------------------------------------------------------------- |
| `structural` | **locally** | Shape, size and consistency need no server knowledge.                                   |
| `privacy`    | **locally** | The point of doing it locally is that a rejected value never leaves the machine.        |
| `semantic`   | server only | You hold neither the event registry nor server time. Guessing would reject good events. |

### 4.1 Structural — steps 1 to 6

| #   | Step                             | Rejection             |
| --- | -------------------------------- | --------------------- |
| 1   | nesting depth                    | `event_too_large`     |
| 2   | serialised size — **64 KiB**     | `event_too_large`     |
| 3   | envelope shape                   | `malformed_event`     |
| 4   | session and sequence consistency | `malformed_event`     |
| 5   | schema version range             | `unsupported_version` |
| 6   | property breadth                 | `event_too_large`     |

**Depth before size, and this order was earned.** The size check has to serialise, and
serialisation recurses — so a deeply nested payload crashes the guard that was meant to
refuse it. We shipped that bug in our own validator and a test caught it. Measure depth
iteratively, first, before anything walks the structure.

Step 3 checks: `event_id` is a UUID; `event_name` is canonical dotted `lower_snake_case`;
`schema_version` is an integer; `occurred_at` is UTC with an offset; `properties` is an
object; and **no field outside the envelope**. Step 4 checks that `session_id` and
`sequence` are both present or both null — a sequence without a session orders nothing, and
a session without one cannot be ordered.

### 4.2 Privacy guard — steps 7 and 8

**Step 7 — reserved identity keys → `reserved_property`.** At _any_ depth, in any spelling:

- `tenant_id`, `project_id`, `source_id`, `tenant`, `project`, `source`
- `ingested_at`, `received_at`, `server_time`
- anything starting `observer_` or `__`

Matched case-insensitively across snake_case and camelCase, so `projectId` and `project-id`
are the same key. Nobody writes `project_id` at the top of a payload on purpose; somebody
writes `context: { ids: { projectId } }` because it was convenient in Blueprint, and that is
the case this catches.

**Step 8 — forbidden content → `pii_suspected`.** At minimum:

- email addresses
- telephone numbers
- activation codes (**any prefix** — `DEV-`, `OBS-`, whatever comes next)
- Observer source credentials
- known secret shapes: `sk-…`, `Bearer …`, JWTs, PEM blocks, cloud key formats
- key names that hold personal data by definition: `email`, `phone`, `first_name`,
  `buyer_name`, `address`, and the rest of the published list

A bare `name` is deliberately **not** flagged — `unit_name`, `preset_name` and `scene_name`
are ordinary, and a guard that cried wolf on those would be switched off within a week.

There is deliberately **no payment-card value detector**: strip the letters out of a UUID
and seventeen grouped digits remain, and a false rejection loses a real event permanently.
Card-shaped _keys_ are caught by name.

**Two rules for this stage, and they matter more than the detection itself.**

_Fail without logging the value._ Every finding names the **key path and the kind** and
never carries what it found. A diagnostic that quotes the leaked email into a rejection
record, a log line and a support ticket has tripled the leak while appearing to prevent it.

_This is a guardrail, not the policy._ Heuristics catch accidents — a debug field left in a
build, an exception message pasted into a payload. They cannot prove an absence of personal
data, and anyone who says otherwise is selling something. The authoritative long-term
control is the per-event schema registry, which whitelists property keys by name. That is a
later milestone; until it exists, this is what stands between a payload and a person's
email address.

### 4.3 The size number is now real

`max_event_bytes` is **65536**, on both sides. It is inclusive: an event of exactly 64 KiB is
accepted, and 64 KiB plus one byte is `event_too_large`. Both boundaries have a test.

One caution worth a minute of your time: your serialisation and ours may differ by a few bytes on
the same event — key order, whitespace, escaping. If you validate at exactly 65536 locally and we
measure a slightly larger body, an event you passed could still be refused. Leaving a small margin
locally costs nothing and avoids a class of confusing rejection.

**An event is never split.** Splitting either invents a second `event_id` — breaking idempotency —
or reuses the first, producing two facts from one. `event_too_large` is a producer bug.

---

## 5. UE-OBS-006 — the durable outbox

The full generated specification is [`outbox-states.md`](ue5-contract/outbox-states.md), and the
numbers are in [`v1-settings.md`](ue5-contract/v1-settings.md).

### 5.0 The confirmed V1 parameters

|                       | Value                    |
| --------------------- | ------------------------ |
| directory             | `Saved/Observer/Outbox/` |
| disk ceiling          | 50 MB (`52428800`)       |
| default batch         | 25 events                |
| supported batch range | 25–50 events             |
| normal flush          | every 5 s                |
| event cap             | 64 KiB (`65536`)         |

**Three numbers that look like one.** The client _default_ is 25. The client _range_ is 25–50 — what
an operator may configure without a code change. The _backend ceiling_ is a third number, proposed at
200 events and 8 MiB, and deliberately above your range so that turning a legitimate dial never
produces a `413`. Where a server-stated limit is stricter than your configured one, **the stricter
wins**.

**Capacity, stated carefully.** 50 MB is the ceiling. Roughly 50,000 events — about a week offline —
is an _expected_ capacity at typical event sizes. It is not a guarantee: at the 64 KiB cap the same
50 MB holds **800** events. So the ceiling must be enforced by **bytes actually used**, never by an
assumed event count — a count-based limit would overrun the disk budget by roughly sixty times
exactly when a showroom is producing the most.

**Diagnostics to expose:** bytes used, event count, oldest pending event age, and the configured
ceiling — the last so the fill percentage can be computed rather than asserted. The heartbeat carries
all four (`queue.bytes_ceiling` is new).

**When capacity is reached:** do not discard silently. Record a **counted** safe failure and surface
the condition. The counter records that admission failed; it never records the event, because a
capacity log that quoted payloads would be a payload store with no size limit of its own. And do not
create an unbounded queue — an analytics buffer that fills a showroom PC's disk has caused a worse
problem than the one it was solving.

### 5.1 The rule everything else follows from

> **The HTTP status says whether the batch was processed. It never says whether the events
> were accepted.**

`200` means the batch was processed — read the per-event results, _even when every event in
it was rejected_. Any non-2xx means the batch was **not** processed, nothing was stored, and
the whole batch is safe to resend unchanged.

### 5.2 Durable states

Your internal representation is your business — a status column, two files, an index and a
tombstone log are all fine. What is contract is the observable behaviour. You need enough
durable state to distinguish at least:

| State         | Delivered again? | Meaning                                                                  |
| ------------- | ---------------- | ------------------------------------------------------------------------ |
| `pending`     | yes              | Waiting to be sent. Where retries return to.                             |
| `in_flight`   | yes              | Sent, no answer yet. **Optional** — folding this into `pending` is fine. |
| `retained`    | yes              | Kept after a retryable failure.                                          |
| `accepted`    | no               | The server stored it. Delivery finished.                                 |
| `duplicate`   | no               | The server already had it. **This is a success.**                        |
| `quarantined` | no               | Kept on disk with a reason, never retried. Needs a human.                |

### 5.3 The event **remains locally** when

- it has never been sent
- the request timed out
- the connection was lost
- `429` rate limited
- any `5xx`
- an unrecognised whole-request failure
- **the client did not receive an acknowledgement**
- a per-event `storage_error` — the one retryable rejection

### 5.4 The event **leaves pending delivery** when

- the server explicitly **accepted** it
- the server explicitly acknowledged it as a **duplicate**

Those two, and nothing else. A `503` is not an acknowledgement. A timeout is not an
acknowledgement. A connection dying mid-response is not an acknowledgement. A crash is not
an acknowledgement.

### 5.5 The event is **preserved but not retried** when

- a deterministic, non-retryable validation rejection
- a rejection code this build does not recognise
- an unsupported contract version needing an operator or a developer
- a `400` on the whole request, which is a plugin bug

**Preserved, not deleted.** A quarantined event with its reason attached is what tells an
operator that a build is emitting something the contract refuses. A deleted one tells them
nothing and destroys the evidence.

### 5.6 Full mapping

| What happened                       | State         | Retried              | Sending  |
| ----------------------------------- | ------------- | -------------------- | -------- |
| per-event `accepted`                | `accepted`    | no                   | continue |
| per-event `duplicate`               | `duplicate`   | no                   | continue |
| per-event `storage_error`           | `retained`    | yes                  | continue |
| per-event any other rejection       | `quarantined` | no                   | continue |
| per-event code you do not recognise | `quarantined` | **no**               | continue |
| `400 malformed_request`             | `quarantined` | no                   | continue |
| `401 unauthorised`                  | `pending`     | no                   | **stop** |
| `403 source_suspended`              | `pending`     | no                   | **stop** |
| `413 batch_too_large`               | `pending`     | yes, **split first** | continue |
| `429 rate_limited`                  | `pending`     | after `Retry-After`  | backoff  |
| `503` / other `5xx`                 | `pending`     | yes                  | backoff  |
| unrecognised 4xx                    | `quarantined` | no                   | continue |
| unrecognised other status           | `pending`     | yes                  | backoff  |
| no response at all                  | `pending`     | yes                  | backoff  |

**A rejection code you do not recognise is non-retryable whatever `retryable` says.** We
will add codes after your build ships. Retrying something you cannot interpret loops for
ever; a quarantined event an operator can see is a better failure than an infinite loop
nobody notices.

**Never split an event.** Splitting either invents a second `event_id` — breaking
idempotency — or reuses the first, producing two facts from one. `event_too_large` is a
producer bug. Splitting a _batch_ is fine and is what `413` asks for.

### 5.7 On restart

- Unacknowledged events are recoverable: anything not `accepted` or `duplicate` is offered
  again.
- **No event receives a new `event_id`.** Regenerating one turns a safe replay into a second
  fact, and it is the single most damaging thing a restart can do.
- Replay stays safe: resending what was already sent answers `duplicate`, never a second
  accept.
- The credential and source association an event was captured under does not silently
  change. If a reactivation swapped the credential and the queued events quietly followed it
  to a different source, a showroom's history would move between sources without anybody
  deciding that it should.
- Quarantined events survive with their reason. A restart is not a way to clear them.
- An event in flight when the process died returns as `pending`, never as delivered.

### 5.8 After `401` or `403` — **approved V1 behaviour**

Confirmed by you as practical and intended, so this is contract now rather than a proposal:

1. Stop network delivery.
2. **Retain the outbox in full.** The events are not the problem.
3. Continue bounded local capture, so an authorisation problem does not also become a data
   gap.
4. Surface the unauthorised state as an operator-visible diagnostic, `401` and `403`
   distinct — the operator's remedy differs: reactivate, versus resume the source.
5. Never reactivate automatically.

Rule 2 is the one that gets omitted in a hurry and costs the most. A plugin that clears its outbox on
an authorisation failure turns a five-minute operator task into permanent data loss, silently.

`Analytics Offline / Reactivation Needed` is a good showroom-facing string for the `401` case.
Reactivation is an administrator entering a **newly issued** activation code — there is no automatic
path, and that is what makes revoking a leaked build meaningful.

**Reactivation changes authentication material, not identity.** Queued events keep their `event_id`,
keep the source they were captured for, and replay safely: whatever reached us before the credential
was revoked comes back `duplicate`, and whatever did not comes back `accepted`. There is a test that
drives exactly that sequence end to end.

### 5.9 The retry case that matters most

You send a batch. The connection dies. **You cannot tell whether the server processed it.**

That is a property of networks and no amount of care on your side closes it. What closes it
is that you do not need to know: resend the whole batch with the same `event_id`s, and the
server answers `duplicate` for whatever it already holds. The totals come out identical
either way.

The mock reproduces both branches on demand — `drop_before_processing` and
`drop_after_processing` — and from your side they are indistinguishable, which is the point.

### 5.9a `Max Retry Attempts = 5` — what it is not

It is a **delivery-attempt and backoff configuration**. It is **not** an event-retention limit.

The obvious reading — five failures and the event is deleted — would void everything above in exactly
the circumstances the outbox exists for: a showroom offline all afternoon fails far more than five
times before anyone notices. Exhausting the configured sequence preserves the event and surfaces the
condition; the only things that ever remove an event are an explicit acknowledgement and an explicit
non-retryable rejection.

Tell us what it actually bounds in your implementation and we will write it down properly (OPEN-16).

### 5.10 Backoff

`Retry-After` is authoritative and overrides your schedule whenever present. Otherwise
exponential **with jitter** — without it, every showroom that lost the same deployment comes
back at the same instant. Bounded. Never block the game thread, and never crash IRIS because
ingestion is unavailable.

---

## 6. The legacy transport is retired

Recorded here because no V2 code or document should imply otherwise.

```
LEGACY   interaction → mutable in-memory state → application/session close
                     → one large snapshot blob → direct database tables

V2       interaction → immutable event with UUID + UTC timestamp
                     → durable local outbox
                     → bounded HTTPS batch
                     → protected ingestion backend
                     → explicit acknowledgement
                     → removed from the outbox only after accepted or duplicate
```

**There is no migration, and none is to be built.** The legacy database holds only prototype
snapshot blobs in `user_sessions` and `global_analytics`, written during Job 1
proof-of-concept testing. Observer V2 starts as a clean slate: no importer, no compatibility
projection, no blob migration, no historical conversion layer. The old system is kept as
historical prototype evidence where useful.

The legacy adapter in UE-OBS-011 remains in scope — but it is about **Blueprint and API
migration convenience**, not about moving historical analytics data.

---

## 7. UE-OBS-009 — session identity and `sequence`

`session_id` is yours: mint a UUID when the meeting starts and put it on every event that
belongs to it. The server scopes it to your source, so it cannot collide with another
installation's.

Monotonic sequencing already exists in your event engine, so the feasibility question is
closed. What is still proposed is the **semantic guarantee**:

- **mandatory** for every event carrying a `session_id`;
- generated centrally by `UObserverAnalyticsSubsystem`, **never settable from a Blueprint** —
  a Blueprint that can set it is a Blueprint that can corrupt journey reconstruction;
- monotonic **from 1** within a session, unchanged across retries;
- `null` for events with no session;
- with defined reset semantics when a new `session_id` starts.

Gaps are fine and informative — a gap means an event was quarantined. The server never
rejects on gaps or out-of-order arrival.

---

## 8. UE-OBS-010 — diagnostics

### 8.1 Heartbeat

`POST {heartbeat_url}` with the credential, on a timer:

```json
{
  "sent_at": "2026-09-01T09:14:02.881Z",
  "build": {
    "app_version": "IRIS 4.3.0",
    "plugin_version": "ObserverUE 0.2.0",
    "build_id": "iris-4.3.0-win64-shipping-8821",
    "engine_version": "5.6"
  },
  "queue": {
    "pending_events": 42,
    "oldest_pending_at": "2026-09-01T08:02:11.000Z",
    "quarantined_events": 0,
    "bytes_used": 1048576,
    "dropped_events": 0
  },
  "last_error": { "code": "rate_limited", "at": "2026-09-01T09:10:00.000Z" }
}
```

Answers `{ "status": "ok", "server_time": "…", "config_stale": false }`.

**`last_error` is a code and a timestamp — there is no free-text message field,
deliberately.** An exception string is the likeliest place in this whole protocol for a
credential or a buyer's name to end up in a server log. Keep the detail in your local log.

`server_time` is useful on your diagnostic screen: the difference from your own clock is what
an operator needs when timestamps look wrong.

### 8.2 The end-to-end test event

To prove the whole storage path once, send a normal event named `diagnostic.test`:

```json
{
  "event_id": "…",
  "event_name": "diagnostic.test",
  "schema_version": 1,
  "occurred_at": "…",
  "session_id": null,
  "sequence": null,
  "properties": { "reason": "activation_check", "note": null }
}
```

`reason` is one of `activation_check`, `manual_check`, `support_check`. `note` is optional
operator text, ≤120 characters, and the privacy guard applies to it exactly as to anything
else.

`diagnostic.` is a **reserved namespace**. Any other name inside it is rejected, so do not
invent `diagnostic.ping`.

### 8.3 What the diagnostic screen should show

`display_label`, `source_id`, the authorisation state (`Active` / `Unauthorised (401)` /
`Suspended (403)`), the environment and whether it mismatched, pending and quarantined
counts, the oldest pending timestamp, the last error code, and the clock difference from
`server_time`.

---

## 9. What matched, and the one thing that does not

Your answers of 2026-09-02 closed five of the six items that were here. Each still has a
test in `packages/contracts/test/ue5/ue-compatibility.test.ts`, now asserting the
agreement rather than the hazard — so if either side drifts, that file is what fails.

### Resolved

**Event identifier — matches.** `FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower)`,
generated once before enqueueing and immutable across retries. Both your published samples
parse under the strict schema, so nothing changes on either side. One thing worth keeping in
view: that holds because `FGuid` is backed by `CoCreateGuid` on Windows, and
Windows is now the confirmed sole V1 platform. The relaxed schema stays written and tested
for the day a second platform appears.

**Field naming — matches.** snake_case throughout, as the contract publishes. The camelCase
refusal is kept as a regression guard.

**Endpoint naming — ours to decide, and decided.** You treat endpoints as backend-owned, so
the production names are `/functions/v1/observer-activate`, `observer-ingest`
and `observer-heartbeat`. Prefixed because Edge Functions share one flat namespace
with everything else the project ever deploys, and `ingest` is a name somebody else will
eventually want. You will get the final URLs; nothing needs entering until then.

**Retry exhaustion — matches.** Events stay in `queue.json` and are never deleted for
running out of attempts. Exactly the contract.

**Platform — confirmed.** Packaged Win64 on UE 5.6, and nothing else for V1. That is what
makes Windows DPAPI the approved credential-at-rest mechanism rather than one option among
several.

### Settled since the last drop — nothing here needs an answer from you

**Envelope shape — `OPEN-20`, closed.** Your envelope carries `app`, `agent_id`,
`visitor_subject` and `entity`. All four were **adopted** (`PD-25`), and folded into the
envelope schema itself rather than into a parallel one, so the decision reaches validation, the
batch schema and the published OpenAPI at once. Your published sample now parses unchanged.
`app` is required; the other three are optional **and absent** rather than null, matching
`FObserverEvent::ToJsonObject`, which omits empty keys.

One binding condition, and it is the only part that constrains you: `app.environment` is
**reported provenance, never authoritative**. The environment that governs a source is the one on
its registered record. A development build declaring itself production changes nothing. Your
capitalised `Development` is accepted — the value is case-folded, and a value outside the
published vocabulary produces a warning rather than a rejection (`PD-26`), because a build label
must never be able to refuse a batch.

**Event identifier — `OPEN-14`, closed the other way.** The envelope previously required RFC 4122
version and variant bits, which arrived from a schema library's default rather than from the
architecture. It now accepts any canonical lowercase hyphenated 128-bit identifier, which is
exactly what `FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower)` produces. Nothing
downstream reads the version bits and deduplication is `(source_id, event_id)`-scoped, so the
strictness bought nothing and cost a dependency on how Unreal happens to mint GUIDs on one
platform. **Lowercase is now required** — an uppercase identifier is refused rather than
normalised, because Postgres would fold it and hand you back an `event_id` in `results[]` that no
longer matched your outbox row.

**The outbox — `OPEN-19`, reported fixed, awaiting your source.** You have reported that HTTP 2xx
alone no longer removes an event and that the client now reads a single `results` array. That
matches the contract. It stays OPEN here only until we read it in the source drop, which is a
statement about our evidence rather than any doubt about yours.

**One question that remains yours.** `agent_id` in your sample is `agent_john`. A pseudonymous
reference that embeds a person's name is not pseudonymous, and no scanner can catch it because
the giveaway is the convention rather than the value. If that string is generated rather than
typed, an opaque form would be better before it reaches production (`OPEN-21`).

### Unchanged, and in your favour

**Top-level shadowing only.** At the **top level of** `properties`, a key may not shadow
an envelope, identity or credential name — `event_id`, `event_name`, `schema_version`,
`occurred_at`, `session_id`, `sequence`, `tenant_id`, `project_id`,
`source_id`, `ingested_at`, `source_token`, `activation_code`,
`authorization`, `credential`, `api_key`. Rename any that
collide — `step_index` rather than `sequence`.

**Nested keys are fine.** `tour: { steps: [{ sequence }] }` is accepted; an earlier
draft rejected these at every depth and that was too strict to live with. It is safe because
the guarantee is structural rather than lexical: no payload value participates in identity
resolution at any depth, because the server takes identity from your credential and there is
no code path from the payload to it.

---

## 10. What is still open — and none of it blocks you

| Item                                | Effect on your work                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Backend ceilings (now approved)     | 200 events, 8 MiB, 64 KiB — three independent limits, all of which a batch must satisfy. Your 25–50 range sits well inside the count. |
| Clock acceptance window             | Nothing is rejected for its timestamp today; you may see a `late_arrival` or `future_skew` **warning**.                               |
| Event name catalogue                | Names are not fixed. Build the envelope, not the catalogue.                                                                           |
| Analytics and idempotency retention | No effect on the wire.                                                                                                                |
| Credential internals                | No effect: the token is opaque to you either way.                                                                                     |
| Platform matrix beyond UE 5.6       | Your call to make, and we need it.                                                                                                    |

**Closed since the last version:** the legacy database, sequence feasibility _and_ semantics,
credential-at-rest, the limit values, and the 401/403 behaviour. All six are now recorded
decisions rather than questions.

---

## 11. What we need from you

Five questions, all narrow. **Six have closed** on your last two answers — the legacy
database, sequence feasibility, sequence semantics, credential-at-rest, the limit values and
the 401/403 behaviour. Thank you; none of those will be asked again.

1. ~~**Event identifier.**~~ **Answered 2026-09-02** — canonical lower-case hyphenated
   FGuid::NewGuid(), generated once before enqueueing and immutable across retries. Both your
   samples parse under the strict schema, so nothing changes. Kept in view: that holds because
   FGuid is backed by CoCreateGuid on Windows, which is now the confirmed sole V1 platform.

   ~~Does `FObserverEvent` serialise the identifier hyphenated, and does
   it carry RFC 4122 version and variant bits? **Do not change anything on your side for
   this yet.** The strictness came from a schema library default, not from the approved
   architecture — what is actually required is a stable, globally unique 128-bit identifier
   generated once before queueing and preserved through retries. Nothing downstream reads the
   version bits, and deduplication is scoped to `(source_id, event_id)`, so the collision
   domain is one installation rather than the world. If your GUIDs do not set those bits, we would rather relax the
   schema than push arbitrary UUID-version semantics into Unreal. The relaxed form is already
   written and tested; it is one line to switch. We just need to know what you emit first.

2. **Field naming.** Does the envelope serialise as `event_id` or as `eventId`?

3. **Retry attempts.** What does `Max Retry Attempts = 5` actually bound in your
   implementation? We have modelled it as a delivery-attempt and backoff configuration, and
   written down explicitly that exhausting it **preserves** the event. If it currently means
   something closer to "give up on this event", that is worth catching now.

4. **Endpoint naming.** `/activate` and `/ingest`, or `/observer-activate` and
   `/observer-ingest`? Both are fine; picking one unilaterally is not. Tell us which you would
   rather have baked into the defaults and we will make the contract match.

5. **Platform matrix.** What targets beyond Windows kiosk on UE 5.6? This is the last thing
   holding the credential-at-rest policy to Windows only — DPAPI is approved there, and no
   mechanism is approved anywhere else because nothing else is committed to yet.

**One thing to be aware of rather than answer.** Development builds keeping the credential as
plain JSON is fine and expected. What the contract now refuses is a _production package_
configured that way — `verifyCredentialStore()` fails it — because plaintext lowers the bar
from "extract a secret from a packaged binary" to "read a file". DPAPI is the approved
Windows mechanism, and it does not make the credential unextractable; nothing here assumes it
does.

---

## 12. The mock

```bash
pnpm ue5:mock            # random port
pnpm ue5:mock --port 8787
```

Prints an activation code on start. Binds `127.0.0.1` only. Nothing is persisted, nothing
reaches a network, and there is no database behind it.

It reproduces, on demand: first activation, invalid / expired / consumed / revoked codes,
reactivation, repeat installation, suspension, rate limiting, unavailability, all-accepted,
duplicate, partial success, all-rejected, unsupported schema, malformed event, oversized
event, oversized batch, unauthorised credential, superseded credential, suspended source,
`429` with `Retry-After`, `503`, both transport drops, event-level storage error, and the
empty batch.

**None of its behaviour is protocol.** It does exactly what a test tells it to. Recurring
patterns (`rate_limit_every_7th` and friends) exist only behind `MOCK_ONLY_FIXTURES` and are
scaffolding.

If you drain your outbox against it with no duplicates and no silent loss, the transport is
done.
