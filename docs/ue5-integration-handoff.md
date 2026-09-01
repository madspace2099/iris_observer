# UE5 integration handoff — what to build against

**For:** Akhilesh · **From:** Observer backend · **Date:** 2026-09-01
**Contract:** `1.0.0-candidate.1` — **PROPOSED**, not yet implemented
**Machine-readable:** `docs/ue5-contract/openapi.json` and `docs/ue5-contract/schemas/*.json`
**Runnable mock:** `pnpm ue5:mock` (loopback only, no database, no network)

This document is meant to be enough on its own. You should not have to read our TypeScript to build
UE-OBS-003 through UE-OBS-010 against it, and if you find yourself needing to, tell us — that is a
defect in this page rather than in your reading of it.

**What is settled and what is not.** The behaviour below is stable enough to build against: the
request and response shapes, the error codes and what to do about each one, the outbox rules, and the
state machine. What is _not_ settled is listed in §8, and none of it blocks you. The one thing that
could still change shape is `sequence` (§6), and it needs your answer before it can.

---

## 1. The three endpoints

|           | Endpoint                                      | Auth                                   |
| --------- | --------------------------------------------- | -------------------------------------- |
| Activate  | `POST {base}/functions/v1/observer-activate`  | none                                   |
| Ingest    | `POST {base}/functions/v1/observer-ingest`    | `Authorization: Bearer <source_token>` |
| Heartbeat | `POST {base}/functions/v1/observer-heartbeat` | `Authorization: Bearer <source_token>` |

`base`, `ingest_url` and `heartbeat_url` all come back from activation. **Do not hard-code them into
the build** — store what activation returned, beside the credential.

`Content-Type: application/json`. `Content-Encoding: gzip` is accepted on ingest.

---

## 2. UE-OBS-003 — the activation state machine

### 2.1 What you send

```json
{
  "activation_code": "OBS-7K4M-2QX9-D3TA",
  "reported_environment": "production",
  "installation_nonce": "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  "build": {
    "app_version": "IRIS 4.3.0",
    "plugin_version": "ObserverUE 0.1.0",
    "build_id": "iris-4.3.0-win64-shipping-8821",
    "engine_version": "5.6"
  },
  "os": "Windows 11 24H2"
}
```

**`installation_nonce`** — generate a UUID **once**, the first time the plugin runs, and persist it
beside the outbox. Never regenerate it, never derive it from hardware, and do not treat it as a
secret. Its only job is to let the server say "this installation already has a source" instead of
silently creating a second one.

**`reported_environment`** — what this build believes it is. The server does not trust it; it compares
it against the source record and tells you if they disagree.

**The build block is metadata, not identity.** Changing any of it — including the engine version —
never invalidates your credential and never requires reactivation.

### 2.2 What comes back on success

```json
{
  "status": "activated",
  "source_id": "018f3a2c-9c11-4a7e-8b02-4d5e6f708192",
  "display_label": "Northgate · Showroom PC 1",
  "environment": "production",
  "environment_mismatch": false,
  "source_token": "obs_9f2c7a1b4e6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d",
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

**The token is returned once and never again.** Persist it before you do anything else. If you lose
it, an operator has to issue a new code.

**Treat it as opaque.** Never parse it, split it, decode it, or write it to a log, a crash report or a
telemetry field. It is the one secret this build holds.

**`limits` values may be `null`.** Null means the server states no limit and you should apply your own
configured default. It never means unlimited. Every value is null today because the numbers are still
being decided — see §8.

**Do not send `source_id`, `tenant_id` or `project_id` anywhere.** `source_id` is for your diagnostic
screen and for support conversations. The server derives all identity from the token on every request
and will **reject** an event that carries any of them.

### 2.3 Every other answer

| HTTP                | `code`              | What it means                               | What you do                                                                 |
| ------------------- | ------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| 200 `"activated"`   | —                   | New source registered                       | Store the token. Go to `Active`.                                            |
| 200 `"reactivated"` | —                   | Same source, new credential                 | Replace the stored token. Keep the outbox. Go to `Active`.                  |
| 400                 | `malformed_request` | Your request is wrong                       | Do not retry. This is a plugin bug.                                         |
| 401                 | `activation_failed` | Unknown, expired, or already used           | Do not retry. Ask the operator for a new code.                              |
| 409                 | `already_activated` | This installation already has a live source | Do not retry. Show `source_id` and ask the operator to rotate or retire it. |
| 429                 | `rate_limited`      | Too many attempts                           | Wait `Retry-After`, then retry.                                             |
| 503                 | `unavailable`       | Backend down                                | Retry with backoff.                                                         |

The `401` is deliberately identical for unknown, expired and consumed codes. Do not try to tell them
apart; there is nothing there to read.

### 2.4 Recovery

There is no refresh endpoint and no self-service recovery. If the credential is lost or revoked, an
operator issues a **new code for the same source**, and you run the ordinary activation flow. You will
get `status: "reactivated"` and the same `source_id`.

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

| Field            | Rule                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `event_id`       | UUID. Generate **before the first send** and never regenerate it. This is the whole idempotency mechanism.               |
| `event_name`     | Dotted `lower_snake_case`, at least two segments. **The catalogue is not fixed yet** — the names above are illustrative. |
| `schema_version` | Integer. Must be inside `accepted_schema_versions` from activation.                                                      |
| `occurred_at`    | ISO-8601 **with an offset**. `Z` is fine. Never corrected by the server, never adjusted by you.                          |
| `session_id`     | UUID, or `null` for events that belong to no meeting.                                                                    |
| `sequence`       | Integer from 1, or `null`. **Null exactly when `session_id` is null.**                                                   |
| `properties`     | Free-form object. See the two prohibitions below.                                                                        |

**The envelope is closed.** Any field not in that list is rejected — not ignored. If you send
`ingested_at` or `project_id`, you get `malformed_event` and you find out on the first run rather than
in two years.

**Two prohibitions inside `properties`:**

1. **No identity keys.** `tenant_id`, `project_id`, `source_id`, `tenant`, `project`, `source`,
   `ingested_at`, `received_at`, `server_time`, and anything starting `observer_` or `__`. Matched in
   any spelling — `projectId` and `project-id` are the same key. At **any** nesting depth. The
   rejection is `reserved_property`.
2. **No raw personal data.** No names, emails, phone numbers or addresses, as values _or_ as key
   names. Events carry references; people live in the protected contacts store. The rejection is
   `pii_suspected`, and the response will name the offending key without repeating its value.

A batch wraps events:

```json
{
  "batch_id": "018f4c11-2a3b-4c5d-8e9f-0a1b2c3d4e5f",
  "sent_at": "2026-09-01T09:14:05.100Z",
  "events": [/* … */]
}
```

`batch_id` is for correlating your log with ours. It has no other meaning — in particular it is not
used for deduplication, so resending the same events under a new `batch_id` is fine and expected.

---

## 4. UE-OBS-005 — what to validate locally before queueing

Everything the server checks, you can check first, and doing so turns a round trip into an assertion
at the call site. In rejection order:

1. Serialised size against `max_event_bytes`.
2. Nesting depth against `max_property_depth`. **Check depth before size** — a recursive size
   calculation crashes on a deeply nested payload, which is a bug we shipped in our own validator and
   caught with a test.
3. Envelope shape: every required field present, no extra fields.
4. `session_id` and `sequence` both present or both null.
5. `schema_version` inside the accepted range.
6. No reserved property key, at any depth.
7. Object breadth against `max_property_count`.
8. No forbidden content.

An event that fails locally should never enter the outbox. Count it, name it on the diagnostic screen,
and fix the caller.

---

## 5. UE-OBS-006 and UE-OBS-007 — the outbox and the transport

### 5.1 The rule everything else follows from

> **The HTTP status says whether the batch was processed. It never says whether the events were
> accepted.**

`200` means the batch was processed — read the per-event results, _even when every event in it was
rejected_. Any non-2xx means the batch was **not** processed, nothing was stored, and the whole batch
is safe to resend unchanged.

### 5.2 A response with all three outcomes

```json
{
  "batch_id": "018f4c11-2a3b-4c5d-8e9f-0a1b2c3d4e5f",
  "received": 3,
  "accepted": 1,
  "duplicate": 1,
  "rejected": 1,
  "results": [
    {
      "event_id": "b2a5f0c1-3d4e-4f7a-8c9b-0d1e2f3a4b5c",
      "status": "accepted",
      "code": null,
      "retryable": null,
      "detail": null
    },
    {
      "event_id": "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e",
      "status": "duplicate",
      "code": null,
      "retryable": null,
      "detail": null
    },
    {
      "event_id": "7c2f0a11-8b3d-4c5e-9f01-2a3b4c5d6e7f",
      "status": "rejected",
      "code": "schema_unknown",
      "retryable": false,
      "detail": "unit.hovered is not registered at schema_version 1"
    }
  ],
  "warnings": [{ "code": "late_arrival", "detail": "occurred_at is 12 days behind server time" }]
}
```

One result per submitted event, **in submission order**. Match by `event_id` rather than by position
if you can; the order is contract, but matching by id is one fewer thing to get wrong.

`warnings` never change an outcome. Log them and show them on the diagnostic screen.

### 5.3 Outbox rules — the whole of it

| What happened                                   | Event stays? | Retried?             | Deleted? | Quarantined?          | Sending continues? |
| ----------------------------------------------- | ------------ | -------------------- | -------- | --------------------- | ------------------ |
| `accepted`                                      | no           | —                    | **yes**  | no                    | yes                |
| `duplicate`                                     | no           | —                    | **yes**  | no                    | yes                |
| `rejected`, `retryable: false`                  | no           | no                   | no       | **yes**               | yes                |
| `rejected`, `retryable: true` (`storage_error`) | **yes**      | yes                  | no       | no                    | yes                |
| `400 malformed_request`                         | no           | no                   | no       | **yes** (whole batch) | yes                |
| `401 unauthorised`                              | **yes**      | no                   | no       | no                    | **no — stop**      |
| `403 source_suspended`                          | **yes**      | no                   | no       | no                    | **no — stop**      |
| `413 batch_too_large`                           | **yes**      | yes, **split first** | no       | no                    | yes                |
| `429 rate_limited`                              | **yes**      | after `Retry-After`  | no       | no                    | back off           |
| `503` / other 5xx                               | **yes**      | with backoff         | no       | no                    | back off           |
| Unknown 4xx                                     | no           | no                   | no       | **yes**               | yes                |
| Unknown other status                            | **yes**      | with backoff         | no       | no                    | back off           |
| No response at all                              | **yes**      | with backoff         | no       | no                    | back off           |
| Rejection code you do not recognise             | no           | **no**               | no       | **yes**               | yes                |

Four things that are easy to get wrong and expensive to discover later:

- **`duplicate` is a success.** The fact is stored, so the event is delivered and the outbox entry is
  finished. A plugin that retries duplicates never drains.
- **Quarantine is not delete.** Keep the event on disk with its reason. LOCKED: nothing is ever
  discarded silently. A rising quarantine count is a defect somebody needs to see.
- **A rejection code you do not recognise is non-retryable, whatever `retryable` says.** We will add
  codes after your build ships. Retrying something you cannot interpret loops for ever.
- **Never split an event.** Splitting either invents a second `event_id` — breaking idempotency — or
  reuses the first, producing two facts from one. `event_too_large` is a producer bug, not a
  transport problem. Splitting a _batch_ is fine and is what `413` asks for.

### 5.4 The retry case that matters most

You send a batch. The connection dies. **You cannot tell whether the server processed it.**

That is a property of networks and no amount of care on your side closes it. What closes it is that
you do not need to know: resend the whole batch with the same `event_id`s, and the server answers
`duplicate` for whatever it already holds. The totals come out identical either way.

The mock reproduces both branches on demand — `drop_before_processing` and `drop_after_processing` —
and from your side they are indistinguishable, which is exactly the point.

### 5.5 Backoff

- `Retry-After` is authoritative and overrides your schedule whenever it is present.
- Otherwise exponential with **jitter**. Without jitter, every showroom that lost the same deployment
  comes back at the same instant.
- Bounded. Never block the game thread, and never crash IRIS because ingestion is unavailable.

---

## 6. UE-OBS-009 — session identity and `sequence`

`session_id` is yours: mint a UUID when the meeting starts and put it on every event that belongs to
it. The server scopes it to your source, so it cannot collide with another installation's.

`sequence` is the **proposal that needs your answer.** We would like it to be:

- **required** for every event that carries a `session_id`;
- **generated centrally** by `UObserverAnalyticsSubsystem` at event creation, before queueing;
- **never settable from a Blueprint** — a Blueprint that can set it is a Blueprint that can corrupt
  journey reconstruction;
- monotonic from 1 within a session, unchanged across retries;
- `null` for events with no session.

The reason it matters: it is the only ordering signal that survives a wrong device clock, and how much
we trust showroom clocks is still open (§8). Gaps are fine and informative — a gap means an event was
quarantined. The server never rejects on gaps or out-of-order arrival.

**If this is awkward in the subsystem as designed, say so and we will drop it back to optional.**

---

## 7. UE-OBS-010 — diagnostics

### 7.1 Heartbeat

`POST {heartbeat_url}` with the credential, on a timer:

```json
{
  "sent_at": "2026-09-01T09:14:02.881Z",
  "build": {
    "app_version": "IRIS 4.3.0",
    "plugin_version": "ObserverUE 0.1.0",
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

Answers `{ "status": "ok", "server_time": "…", "config_stale": false }`. `config_stale: true` means
re-read configuration; it never changes identity or credentials.

**`last_error` is a code and a timestamp — there is no free-text message field, deliberately.** An
exception string is the likeliest place in this whole protocol for a credential or a buyer's name to
end up in a server log. Keep the detail in your local log.

`server_time` is useful on your diagnostic screen: the difference from your own clock is what an
operator needs when timestamps look wrong.

### 7.2 The end-to-end test event

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

`reason` is one of `activation_check`, `manual_check`, `support_check`. `note` is optional operator
text, ≤120 characters, and the same content rules apply to it as to any other property.

`diagnostic.` is a **reserved namespace**. Any other name inside it is rejected, so do not invent
`diagnostic.ping`.

### 7.3 What the diagnostic screen should show

Everything an operator needs before they phone anyone: `display_label`, `source_id`, the authorisation
state (`Active` / `Unauthorised (401)` / `Suspended (403)`), the environment and whether it mismatched,
pending and quarantined counts, the oldest pending timestamp, the last error code, and the clock
difference from `server_time`.

---

## 8. What is still open — and none of it blocks you

|                                     | Effect on your work                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Limit **values** (all `null` today) | Apply your own defaults; obey a server value when one arrives. We need your measurements.               |
| Clock acceptance window             | Today nothing is rejected for its timestamp; you may see a `late_arrival` or `future_skew` **warning**. |
| Event name catalogue                | Names are not fixed. Build the envelope, not the catalogue.                                             |
| Analytics and idempotency retention | No effect on the wire.                                                                                  |
| Credential internals                | No effect: the token is opaque to you either way.                                                       |
| Platform matrix beyond UE 5.6       | Your call to make, and we need it.                                                                      |
| Legacy `InsightAnalytics` data      | We need to know what it points at before anything is migrated.                                          |

---

## 9. The mock

```bash
pnpm ue5:mock            # random port
pnpm ue5:mock --port 8787
```

Prints an activation code on start. Binds `127.0.0.1` only. Nothing is persisted, nothing reaches a
network, and there is no database behind it. Stop the process and every source, credential and stored
event is gone.

It reproduces, on demand: first activation, invalid / expired / consumed codes, reactivation, repeat
installation, suspension, rate limiting, unavailability, all-accepted, duplicate, partial success,
all-rejected, unsupported schema, malformed event, oversized event, oversized batch, unauthorised
credential, superseded credential, suspended source, `429` with `Retry-After`, `503`, both transport
drops, event-level storage error, and the empty batch.

**None of its behaviour is protocol.** It does exactly what a test tells it to. Recurring patterns
(`rate_limit_every_7th` and friends) exist only behind `MOCK_ONLY_FIXTURES` and are scaffolding.

If you drain your outbox against it with no duplicates and no silent loss, the transport is done.

---

## 10. Five questions we need from you

1. **Which Supabase project does the hard-coded endpoint in the existing `InsightAnalytics` plugin
   actually target, and does it contain live analytics that must be preserved or migrated?**
2. Can `sequence` be mandatory for session events and generated by the subsystem (§6)?
3. What is the platform matrix beyond UE 5.6 — Windows kiosk only, or Pixel Streaming / macOS / VR?
4. What batch, event and outbox limits are realistic on the actual showroom hardware and connection?
5. Is the 401/403 behaviour in §5.3 implementable as written — stop, keep the outbox, keep capturing?
