# UE5 ↔ Observer ingestion contract — candidate v1

**Status:** PROPOSED contract candidate · **Version:** `1.0.0-candidate.1` · **Date:** 2026-09-01
**Derives from:** _IRIS Observer Analytics — UE5 Plugin Architecture and Implementation Brief_ v1.0
**Executable form:** `packages/contracts/src/ue5/` · **Generated:** `docs/ue5-contract/`
**Reference implementation:** `packages/ue5-mock/` (MOCK-ONLY)

Nothing here is implemented. No endpoint exists, no Edge Function is deployed, no database has been
touched. This is a contract candidate: precise enough for Akhilesh to build UE-OBS-003 through
UE-OBS-010 against, with every unresolved product decision left visibly unresolved.

| Label            | Meaning                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| **LOCKED**       | Approved in the architecture brief. Restated with a citation, never reopened here.  |
| **UE-CONFIRMED** | Evidenced by completed UE work. True, and not an architecture rule.                 |
| **DECIDED**      | An approved decision that is neither in the brief nor still a proposal.             |
| **DERIVED**      | Not in the brief, but follows from a rule that is. The derivation is named.         |
| **PROPOSED**     | A concrete recommendation awaiting sign-off. Not yet contract.                      |
| **OPEN**         | Genuinely unresolved, and left that way rather than filled with invented certainty. |
| **MOCK-ONLY**    | Test fixture. Never protocol.                                                       |

The full classification is machine-readable in `packages/contracts/src/ue5/traceability.ts` and
rendered to [`ue5-contract/traceability.md`](ue5-contract/traceability.md). Tests enforce it:
nothing `PROPOSED` may cite the brief, and every `DERIVED` rule must name the locked rule it follows
from. A convenient proposal cannot quietly acquire the authority of an approved decision.

**Counts:** 28 LOCKED · 17 DERIVED · **12 UE-CONFIRMED** · **2 DECIDED** · 22 PROPOSED · 14 OPEN ·
3 MOCK-ONLY. Ninety-eight rules in all.

---

## 1. This is not a second architecture

ADR-0015 already fixed the ingestion boundary:

```
immutable source observation → adapter → canonical fact → projection → metric → evidence
```

Everything in this document is the **transport encoding of the first box**, not a parallel pipeline
with its own store. `packages/contracts/src/ue5/projection.ts` is the executable proof: a total
function from a UE5 wire event plus server-derived identity to the existing `SourceObservation`. If
the two ever diverge, it stops compiling.

| `SourceObservation`          | Where it comes from                                |
| ---------------------------- | -------------------------------------------------- |
| `observationId`              | client `event_id` — the idempotency key            |
| `sourceSchemaVersion`        | client `schema_version`, recorded as `ue5-<n>`     |
| `source`                     | constant `showroom`                                |
| `sourceEventName`            | client `event_name`, carried and never interpreted |
| `tenantId`, `projectId`      | **server**, from the credential                    |
| `installationId`, `deviceId` | **server**, from the source record                 |
| `occurredAt`                 | client `occurred_at`, never corrected              |
| `sequence`                   | client `sequence` — see §11                        |
| `payload`                    | client `properties`, untouched                     |

### 1.1 Credential identity is independent of the build — LOCKED

A source credential belongs to the **registered project source**, not to a particular Unreal Engine
minor, plugin version or packaged build. An ordinary IRIS or engine upgrade must not create a new
source identity and must not invalidate the credential because `app_version`, `plugin_version`,
`build_id` or the engine version changed. Those are reported metadata, recorded for support. They are
not identity and not authorisation.

**Scope note.** Whether the plugin may depend on UE 5.6-specific APIs, and how many engine minors one
source line supports, is an Unreal implementation and support-matrix question owned with Akhilesh.
This contract does not decide it. The backend's only concerns are which plugin and schema versions it
still accepts, and recording the version metadata a client reports.

---

## 2. What the brief settles — LOCKED

| Statement                                                                    | Source           |
| ---------------------------------------------------------------------------- | ---------------- |
| One shared Observer platform; no per-project clone                           | §10.1            |
| Identity spine `tenant → project → project_source`                           | §3.3             |
| Project UUID immutable; project name is display metadata                     | §3.1, §10.1      |
| Activation code is one-time and short-lived                                  | §3.1, §3.4       |
| Code is exchanged for a source-scoped credential; then invalid               | §3.1             |
| Backend derives `tenant_id`, `project_id`, `source_id` from the credential   | §3.2, §4.2, §9.2 |
| The client cannot select those identifiers                                   | §3.4, §4.2       |
| Source credential is revocable and rotatable                                 | §3.4             |
| Invalid/expired code must not reveal whether anything exists                 | §9.1             |
| Repeat activation needs explicit recovery; never silent duplicate sources    | §9.1             |
| UE5 has no direct table access                                               | §3.4, §10.1      |
| `analytics_events` is immutable and append-only                              | §3.2, §3.3       |
| Versioned envelope with the §4.1 field set                                   | §4.1             |
| `event_id` generated before first send, stable across retries                | §4.1, §5.4       |
| Replaying an accepted `event_id` never creates a second fact                 | §5.4, §5.5       |
| Per-event accepted / duplicate / rejected, with safe reason and retryability | §9.2             |
| Partial batch success is intended                                            | §9.2             |
| Events leave the outbox only on explicit accept or duplicate ack             | §3.2, §5.4, §5.5 |
| 401/403 → stop, mark unauthorised, reactivate                                | §5.5             |
| 400 → no endless retry; quarantine with safe diagnostic                      | §5.5             |
| 429 → respect `Retry-After`, retain                                          | §5.5             |
| 5xx → retain, bounded backoff; never crash IRIS                              | §5.5             |
| Queue limits configurable, visible, never silent discard                     | §5.4             |
| No raw PII in event properties                                               | §5.6, §10.1      |
| Personal/contact data in a separate protected store                          | §3.3, §5.6       |
| Credentials and raw payloads never in UE logs or crash reports               | §3.4, §5.6       |
| Client timestamps never silently corrected                                   | §4.1, §4.2       |
| Credential belongs to the source, not to a build                             | §3.3, §3.4       |

---

## 3. Activation API v1 — PROPOSED

`POST /functions/v1/observer-activate` · unauthenticated · `application/json`

### 3.1 Request

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

Three field decisions here are not the obvious ones, and each replaced something an earlier draft of
this document proposed.

**There is no machine fingerprint.** The earlier draft hashed hardware to detect repeat activation.
It does detect it — and it also blocks the ordinary case of reinstalling IRIS on the same showroom
PC, because the hardware is unchanged and the server answers `409` to a perfectly legitimate setup. A
hardware-derived persistent identifier that generates support tickets is a poor trade for a check
that is not a security control in the first place: the code is one-time, so the _code_ cannot be
replayed regardless. `installation_nonce` is a random value the plugin generates once and keeps
beside its outbox. It catches the failure the brief actually names — a second fresh code pasted into
an installation that already holds a working credential — without touching hardware, without an
OS-specific API to port to every platform in OPEN-7, and without turning a reinstall into an
escalation.

**There is no `hostname_hint`.** It was Admin display convenience, and it was the only field in the
protocol capable of carrying a person's name into an operational store — showroom machines are named
after people more often than anyone plans for. The operator names the source when they create it, and
a server-authored `display_label` comes back instead. Untrusted client text replaced by trusted server
text, for the same benefit.

**`reported_environment` is informational.** A development build declaring itself production must not
be able to route its data there. The stored environment comes from the source record; the reported
value only produces a mismatch flag the operator can see.

### 3.2 Success — `200`

```json
{
  "status": "activated",
  "source_id": "018f3a2c-…",
  "display_label": "Northgate · Showroom PC 1",
  "environment": "production",
  "environment_mismatch": false,
  "source_token": "<opaque, returned exactly once>",
  "token_expires_at": null,
  "ingest_url": "https://<ref>.supabase.co/functions/v1/observer-ingest",
  "heartbeat_url": "https://<ref>.supabase.co/functions/v1/observer-heartbeat",
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

**The response deliberately omits `tenant_id` and `project_id`.** The plugin has no operational use
for either: it never sends them, and the server would refuse them if it did. Returning them for a
diagnostic screen buys a legible label at the cost of placing two authoritative-looking identifiers
inside a client that some future implementer will, eventually, echo back into an event.
`display_label` is what the diagnostic screen actually needed.

`source_id` is returned because support and recovery are defined in terms of it. It is informational
to the plugin and authoritative only on the server.

Every `limits` value is `null`, and that is the point rather than an omission — see §8.

### 3.3 Invalid, expired or already-used code — `401`

```json
{
  "status": "failed",
  "code": "activation_failed",
  "message": "The activation code could not be used.",
  "source_id": null,
  "retry_after_seconds": null
}
```

**One answer for all three cases**, identical in status, body and timing. A response that separates
them tells anyone holding a guessed code whether a tenant, a project or a source exists (LOCKED
§9.1). An archived source answers the same way, so archival cannot be probed either.

### 3.4 Already activated — `409`

Returned when the installation nonce already belongs to a live source. **No token is issued** — that
is what prevents a second source per installation. The code is deliberately _not_ consumed: nothing
was exchanged for it, and burning it would force the operator to issue another to fix a problem they
have not yet been told about.

### 3.5 Reactivation and recovery — `200`

Recovery is not a separate endpoint. An operator issues a **new activation code for the existing
`source_id`**, and the plugin runs the ordinary flow. One field differs: `status: "reactivated"`.
Same source, same history, new credential, previous credential dead.

There is deliberately no token-refresh channel. Credential material reaches a device through exactly
one door, which is what makes revoking a leaked build meaningful.

---

## 4. Batch Ingestion API v1 — PROPOSED

`POST /functions/v1/observer-ingest` · `Authorization: Bearer <source_token>`

### 4.1 The rule to read before any other

> **The HTTP status says whether the batch was processed. It never says whether the events were
> accepted.**

- `200` — the batch was processed; read `results`. A batch in which every event was rejected is still
  a `200`.
- non-2xx — the batch was **not** processed. Nothing in it was stored, and the whole batch is safe to
  resend unchanged.

That separation is what makes retry safe. Get it backwards and a client either loses a batch that was
never stored or duplicates one that was.

### 4.2 A server must not validate events at the batch level — DERIVED

The obvious implementation parses the incoming request against the full batch schema, which validates
every event inside it. One malformed event then fails the whole parse and the batch comes back `400`
— quietly destroying partial batch success, which is LOCKED §9.2.

So the server validates the **frame** only (`batch_id`, `sent_at`, `events: array`) and judges each
event on its own. `BatchFrameSchema` is that parse; `BatchEnvelopeSchema` remains the description of a
well-formed request and is what the OpenAPI document publishes.

This was found by a test rather than by reading, and it is written down so an implementation cannot
get it backwards a second time.

### 4.3 Per-event results

```json
{
  "batch_id": "018f4c11-…",
  "received": 3,
  "accepted": 1,
  "duplicate": 1,
  "rejected": 1,
  "results": [
    { "event_id": "…a1", "status": "accepted", "code": null, "retryable": null, "detail": null },
    { "event_id": "…a2", "status": "duplicate", "code": null, "retryable": null, "detail": null },
    {
      "event_id": "…a3",
      "status": "rejected",
      "code": "schema_unknown",
      "retryable": false,
      "detail": "unit.hovered is not registered at schema_version 1"
    }
  ],
  "warnings": []
}
```

One result per submitted event, in submission order. `duplicate` is a **success** for the plugin: the
fact is stored, therefore delivered, therefore the outbox entry is finished (LOCKED §5.5). A plugin
that retries duplicates never drains.

An empty batch is valid and returns `received: 0`. It is **not** a heartbeat — see §7.

### 4.4 `retryable`

`retryable` answers one question: _would sending this same event again, later and unchanged, plausibly
succeed?_ It is a property of the **event**, not of the connection. Batch-level failures never appear
in per-event results.

---

## 5. Error and rejection model — PROPOSED

The complete table, with the rationale for every code, is generated from the source into
[`ue5-contract/error-model.md`](ue5-contract/error-model.md). The shape of it:

**Request level** — `malformed_request` 400 · `unauthorised` 401 · `source_suspended` 403 ·
`batch_too_large` 413 · `rate_limited` 429 · `unavailable` 503.

**Event level** — `malformed_event` · `schema_unknown` · `schema_invalid` · `unsupported_version` ·
`event_too_large` · `reserved_property` · `clock_out_of_range` · `pii_suspected` (all
non-retryable) · `storage_error` (the only retryable one).

Two rules govern everything else:

1. **Nothing ever discards an event.** Every outcome is `retain`, `quarantine` or
   `retain_and_split`. A quarantined event is still on disk with its reason attached.
2. **An unrecognised code is non-retryable and quarantines, whatever the server says about
   `retryable`.** A client compiled today will one day receive a code that did not exist when it was
   built. Retrying something it cannot interpret loops for ever; a quarantined event an operator can
   see is a better failure than an infinite loop nobody notices. The server's flag is overridden in
   that one case, and only that one.

An unrecognised **status** is handled the other way round: retain and back off. Not a `200` means
nothing was acknowledged, means nothing may leave the outbox. An unrecognised **4xx** quarantines — a
404 from a mistyped URL does not improve with a thousand attempts.

`detail` is for a human reading a log. It may change wording between releases and **nothing may branch
on it.**

---

## 6. Credential lifecycle — PROPOSED (external behaviour only)

The internals — hash or KDF, prefix scheme, lookup index — are OPEN-11 and deliberately absent.

| Object            | States                                          |
| ----------------- | ----------------------------------------------- |
| Activation code   | `issued` → `consumed` \| `expired` \| `revoked` |
| Source credential | `active` → `superseded` \| `revoked`            |
| Project source    | `active` → `suspended` → `archived`             |

**Rotation** issues a new code for the same source; the previous credential dies only when the new one
is successfully minted, so a rotation that is issued but never used leaves a working installation
working. **Revocation** takes effect on the very next request, with no deploy. **Suspension** keeps the
token valid and answers `403` — a different remedy from `401`, which is why they are different
statuses.

### 6.1 Credentials do not expire

Expiry sounds like security and here it is the opposite. It forces a refresh channel — a second door
for credential material to reach a device — which is new attack surface and new failure modes, in
exchange for nothing. An extracted token stays valid until it expires either way, and the window is
exactly as long as the operator's inattention. The brief asks for credentials that are _revocable_ and
_rotatable_; both are operator actions with immediate effect, which is strictly better than waiting
for a clock.

`config_refresh_after` says when to re-read **configuration**. It is not a token lifetime.

`token_expires_at` is on the wire and is always `null`. The field exists precisely because the answer
is "never": a client that reads it and finds `null` knows no expiry is stated, and if a policy is ever
introduced the value arrives in a field every build already reads, rather than in a new one that
breaks every strict parser on the day it appears.

### 6.2 Credential at rest — a concrete UE-OBS-003 follow-up, OPEN-13

UE-OBS-003 persists the credential at `Saved/Observer/source_credential.json` (`U-05`).

**Being JSON is not the problem, and this is not a criticism of that choice.** A packaged Unreal
application cannot keep a secret, the approved architecture accepts that (§3.4), and nothing in this
contract depends on pretending otherwise. What the contract requires is unchanged and is all
behavioural: source-scoped, revocable, rotatable, never source-controlled, never logged, narrow
authority, an operator-visible unauthorised state, and revocation effective on the next request.

What is genuinely open is narrower and worth asking precisely: **is the token plaintext in that file,
and what platform-appropriate protection is applied to it?** If it is plaintext, the residual risk is
that anyone with filesystem access to a showroom PC — a support engineer, a backup, a shared machine —
has the credential without needing to open a binary at all. That is a materially lower bar than
extraction from a packaged build, which is the threat the architecture actually accepted.

The question is therefore whether UE 5.6 on Windows offers something practical for V1 — DPAPI, the
Credential Manager, or an equivalent. **Not redesigned here**, because the answer depends on Unreal
and platform facts we do not hold. Recorded as OPEN-13, owned jointly, and blocking nothing.

### 6.3 After a 401 or a 403

1. Stop sending immediately. Never retry with a credential the server has just refused.
2. **Keep the outbox.** The events are not the problem and must not be discarded.
3. Mark the source unauthorised, keeping `401` and `403` visibly distinct.
4. Do not attempt self-recovery. No silent re-activation, no stored fallback code.
5. Keep capturing locally within the queue limits, so an authorisation problem does not also become a
   data gap.
6. Never log the token, on failure least of all.

---

## 7. Heartbeat and the test event — PROPOSED

The brief requires Admin to show **Connected** after a validated test event _or_ a heartbeat (LOCKED
§3.1). It does not say those are the same mechanism, and they are not.

|       | Mechanism                            | Proves                                                                  | Costs                                                                                                                                                                                 |
| ----- | ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Empty ingestion batch                | Credential + connectivity                                               | `received: 0` cannot distinguish a healthy ping from a client bug that sends empty batches; pollutes ingestion metrics; nowhere to put health telemetry; proves nothing about storage |
| **B** | `POST /observer-heartbeat`           | Credential + connectivity + **plugin health**                           | Does not prove an event can be stored                                                                                                                                                 |
| **C** | A registered `diagnostic.test` event | The **whole** path: envelope, registry, validation, insert, idempotency | Writes a synthetic row into the immutable fact table                                                                                                                                  |

**Recommendation: B as the standing mechanism, C as the one-time activation proof. Reject A** — it
carries B's weakness _and_ C's weakness while adding an ambiguity neither has. An empty batch is a
degenerate case of a data API, not a health signal.

The heartbeat carries what belongs in a health signal and emphatically does not belong in an analytics
fact: pending events, oldest pending timestamp, quarantined count, bytes used, dropped count, and the
**code** of the last error. There is deliberately **no free-text message field** — an exception string
is the likeliest place in this whole protocol for a credential or a buyer's name to reach a server
log. It writes to the source's operational record, never to `analytics_events`.

`diagnostic.test` is registered like any other event and excluded from read models by a **published
rule** (`event_name NOT LIKE 'diagnostic.%'`) rather than by convention. Convention is how wrong
numbers happen.

---

## 8. Limits — shape is contract, numbers are OPEN

The **fields** are contract; every **value** in this candidate is `null`, which means "the server
states no limit; use your configured default". It never means unlimited.

| Field                                                                    | Direction                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `max_batch_events`, `max_batch_bytes`, `max_event_bytes`                 | server → client, at activation                                   |
| `max_property_depth`, `max_property_count`                               | server → client, at activation                                   |
| `min_send_interval_ms`                                                   | server → client, at activation                                   |
| `Retry-After`                                                            | server → client, per response — authoritative over local backoff |
| `local_max_queue_bytes`, `local_max_queue_events`, `local_max_event_age` | plugin configuration                                             |

The numbers wait on Akhilesh's measurements against real showroom hardware (OPEN-12). Anything a test
harness needs in the meantime is `HARNESS_LIMITS`, which is labelled MOCK-ONLY and cited nowhere else.

`local_max_event_age` is **contract A** in §9 — delivery eligibility, not retention.

---

## 9. Deduplication and the three retention contracts

### 9.1 Deduplication — LOCKED, with one addition

Replaying an accepted stable `event_id` must never create a second accepted fact.

**Deduplication must be scoped to the source, not global.** Two reasons, and the second settles it.
Correctness: `event_id` is minted by a client offline, so global uniqueness is an assumption rather
than a guarantee. Security: with a global index, a holder of any credential could submit a guessed
`event_id` and read the answer — `duplicate` means some other installation sent it, `accepted` means
nobody did. That is a cross-tenant existence oracle built out of a success response, and it costs an
attacker one request. Scoped deduplication closes it, and a test keeps it closed.

### 9.2 Three questions that are not one question

|       | Contract                  | Question                                                              | Owner                   |
| ----- | ------------------------- | --------------------------------------------------------------------- | ----------------------- |
| **A** | UE outbox retention       | How long may an _undelivered_ local event stay eligible for delivery? | Plugin + backend limits |
| **B** | Analytics event retention | How long does an _accepted_ raw event stay stored?                    | Backend / data policy   |
| **C** | Idempotency retention     | How long must the backend remember an `event_id` was accepted?        | Backend architecture    |

### 9.3 Where they interact — OPEN-1

Today C is enforced incidentally by B: uniqueness lives in the stored event, so "we remember this id"
and "we still store this event" are the same fact. That is a coincidence of the current shape, not a
design.

**If a retention policy ever deletes accepted events, it deletes the record that enforces
uniqueness**, and a replay could then be accepted twice. The strategy — retained idempotency records,
tombstones, a separate dedup store — is deliberately not designed here. It is required **before any
retention policy may delete accepted events**, not before ingestion works.

---

## 10. Clock — OPEN-3 and OPEN-4

**LOCKED:** `occurred_at` is the client's UTC claim; `ingested_at` is server-assigned; both are kept;
client timestamps are never silently corrected.

**OPEN-3 — the acceptance window.** A future timestamp has no legitimate cause beyond small skew, so a
tight future bound is defensible. A past timestamp is usually _correct_ — it is what a genuinely
offline showroom looks like. They are asymmetric and should not share a number. The decisive risk:
`clock_out_of_range` is non-retryable, so a showroom offline longer than an invented bound loses its
whole backlog to a clock rule rather than to a data problem.

| Option | Behaviour                                                                   |
| ------ | --------------------------------------------------------------------------- |
| A      | Reject outside the window — risks permanent loss                            |
| B      | Always accept; flag `late_arrival` / `future_skew`; read models decide      |
| C      | Tight future bound (reject); no past bound (accept and flag)                |
| D      | Accept; clamp only reporting-period assignment; keep `occurred_at` verbatim |

**Leaning C.** Not decided — and because it is not decided, the reference implementation defaults to
**accept and flag**, with rejection something a deployment switches on deliberately. A reference
implementation must not encode an undecided policy as though it were settled.

**OPEN-4 — batch clock skew.** One skew figure per batch describes the clock at _send_ time and cannot
retroactively validate `occurred_at` values recorded days earlier during an offline period. A device
whose clock was wrong last Tuesday and is correct today reports zero skew while carrying a week of
wrong timestamps. Before it can be proposed: what it means, which timestamp pair, who computes it,
diagnostic or validating, and what it means for a mixed-age backlog.

---

## 11. Session sequence — feasibility CONFIRMED, semantics PROPOSED

**UE implementation confirmed (`U-10`).** `FObserverEvent` implements monotonic sequencing. Central
generation is demonstrably feasible, and that question is closed rather than re-asked.

**Still to verify** — three details implementation evidence does not settle on its own, and which
remain `P-17`:

1. whether `sequence` is guaranteed **mandatory** for every session-scoped event;
2. whether Blueprint callers are **completely unable** to override or manage it;
3. the exact **reset semantics** when a new `session_id` starts.

The brief marks `sequence` _Recommended_. **Proposal: required for session facts**, because it is the
only ordering signal that survives a wrong device clock — and §10 leaves clock trust deliberately
weak. This strengthens the public UE5 contract, so it needs Akhilesh's agreement.

- Generated **centrally by `UObserverAnalyticsSubsystem`** at event creation, before queueing.
- **Never supplied by individual Blueprint callers.** A Blueprint that can set it is a Blueprint that
  can corrupt journey reconstruction.
- Monotonically increasing within one `session_id`, starting at 1, unchanged across retries.
- **Null exactly when `session_id` is null** — application start before a meeting, diagnostics. Those
  order by `occurred_at` and `ingested_at`.
- Gaps are permitted and informative: a gap means an event was quarantined, and diagnostics should say
  so. The server never rejects on gaps or out-of-order arrival.

A _session fact_ is any event carrying `session_id`.

**Consequence for the stored contract (P-21).** `SourceObservation.sequence` is currently required.
The recommended resolution is to make it nullable rather than default session-less events to `0`,
which would sort them before every real event in a session they do not belong to. The projection
refuses to invent a value instead of quietly choosing one; see `docs/09-ingestion.md`.

---

## 12. Reference implementation — MOCK-ONLY

`packages/ue5-mock/` is deterministic, local, Supabase-free and egress-free. It exists so our contract
tests and Akhilesh's future transport tests exercise the same protocol rather than two readings of a
document.

**Nothing in it is protocol.** Recurring failure patterns live behind `MOCK_ONLY_FIXTURES` — a
`rate_limit_every_7th` fixture is scaffolding, not a rule, and the mock otherwise does exactly what a
test tells it and nothing else. Identifiers come from a counter and clocks are injected, so a
transcript is reproducible.

**Activation code prefixes are cosmetic.** The UE build tests against `DEV-` codes and the harness
mints `OBS-`; the schema constrains length and nothing else. `new MockObserverBackend({ codePrefix:
"DEV" })` makes the harness match, rather than asking the UE side to change something the protocol
does not care about. The forbidden-content scanner is prefix-agnostic for the same reason — it
previously knew `OBS-` only, which is to say it protected the prefix nobody was testing with.

```bash
pnpm ue5:mock
```

Every scenario the review asked to be reproducible is named in `SUPPORTED_SCENARIOS` and asserted
present by a test, including the two transport drops that a client cannot
tell apart. See `packages/ue5-mock/src/scenarios.ts`.

---

## 13. Open items

| Ref         | Item                                                                           | Owner                     |
| ----------- | ------------------------------------------------------------------------------ | ------------------------- |
| **OPEN-1**  | Idempotency retention. Required before any retention deletes accepted events.  | Backend review            |
| **OPEN-2**  | Analytics event retention. No policy exists.                                   | Product                   |
| **OPEN-3**  | Clock acceptance window — options A–D (§10).                                   | Matthew + Akhilesh        |
| **OPEN-4**  | Batch clock skew — meaning and use (§10).                                      | Matthew                   |
| **OPEN-5**  | Screenshots: storage path and how events reference it.                         | Matthew                   |
| **OPEN-6**  | `event_schema_registry` entries. Mechanism contracted; catalogue is not.       | Product                   |
| **OPEN-7**  | Platform matrix beyond Unreal Engine 5.6.                                      | Akhilesh                  |
| **OPEN-8**  | Identity handoff for `agent_id` and approved visitor references.               | Product + Akhilesh        |
| **OPEN-9**  | Schema support window — how long old builds remain accepted.                   | Matthew                   |
| **OPEN-11** | Credential internals: hash/KDF, prefix, lookup scheme.                         | Backend review            |
| **OPEN-12** | Numeric limit values.                                                          | **Akhilesh measurements** |
| **OPEN-13** | Protection applied to the persisted source credential at rest (§6.2).          | Matthew + Akhilesh        |
| **OPEN-14** | UE event identifier: hyphenation, and RFC 4122 version/variant conformance.    | Matthew + Akhilesh        |
| **OPEN-15** | Whether `FObserverEvent` serialises snake_case rather than Unreal's camelCase. | Matthew + Akhilesh        |

**OPEN-10 is closed.** It asked which legacy database held prototype analytics and whether any of it
needed preserving. Answered on 2026-09-01: prototype snapshot blobs only, nothing to migrate. See §15.

### Deliberately out of scope

**AI/provider spending governance.** Activation validates a code; ingestion validates a token and
inserts facts. Neither reads nor debits a monetary balance, and neither calls a model provider. Which
level owns the Ask/OpenAI ceiling belongs to the AI/Observer financial architecture. It returns here
only if ingestion is ever metered by event volume, which the approved architecture does not do.

---

## 14. What still needs a decision, and from whom

**Akhilesh — five things.** Two questions were removed after the UE-OBS-001..004 report: the legacy
database (answered, §15) and whether central sequence generation is feasible at all (`U-10` shows it
already exists). Three are new, and all three come from having a real implementation to compare
against rather than from anything going wrong.

1. **Credential at rest** — is the token plaintext in `source_credential.json`, and does UE 5.6 on
   Windows offer a practical protected store for V1? (§6.2, OPEN-13)
2. **Event identifier** — hyphenated, and does it carry RFC 4122 version and variant bits? (OPEN-14)
3. **Field naming** — `event_id` or `eventId` on the wire? (OPEN-15)
4. **Sequence semantics** — mandatory for session-scoped events, unreachable from Blueprint, and what
   happens to the counter at a new `session_id`? (§11, P-17)
5. **Platform matrix and limits** — targets beyond Windows kiosk on 5.6, and realistic ceilings
   measured on the actual hardware. (OPEN-7, OPEN-12)

**Matthew — the proposals in this document.** Activation v1 (§3), Ingestion v1 (§4), the error model
(§5), credential lifecycle and no-expiry (§6), heartbeat B + C (§7), limit field shape (§8),
source-scoped deduplication (§9.1), and the `SourceObservation.sequence` amendment (§11).

Everything else in §13 can wait for live ingestion without blocking UE-OBS-003 through UE-OBS-010.

---

## 15. Closed decisions

### 15.1 Legacy analytics — no migration. DECIDED, `PD-01`

Akhilesh confirmed on 2026-09-01 (`U-12`) that the legacy `InsightAnalytics` database holds **no live
client analytics**. It carried prototype snapshot blobs written directly into `user_sessions` and
`global_analytics` during Job 1 proof-of-concept testing and demo showroom sessions, and those blobs
do not conform to the versioned, multi-tenant `FObserverEvent` fact schema.

**Observer V2 analytics starts as a clean slate.** Nothing is to be built for those records: no legacy
importer, no compatibility projection, no blob migration, no historical conversion layer. The old
system is kept as historical prototype evidence where useful.

The legacy adapter in UE-OBS-011 stays in scope. It is about **Blueprint and API migration
convenience**, not about moving historical analytics data — a distinction worth keeping, because the
two would be very different pieces of work under the same milestone name.

### 15.2 The legacy transport is retired. DECIDED, `PD-02`

```
LEGACY   interaction → mutable in-memory state → application/session close
                     → one large snapshot blob → direct database tables

V2       interaction → immutable event with UUID + UTC timestamp
                     → durable local outbox → bounded HTTPS batch
                     → protected ingestion backend → explicit acknowledgement
                     → removed from the outbox only after accepted or duplicate
```

UE-OBS-001 removed every hard-coded Supabase URL and key from the V2 plugin; configuration arrives
through Unreal Project Settings, and V2 no longer depends on the direct-table transport (`U-02`,
`U-03`). No V2 code or document may imply that the legacy path remains a supported production route.
`docs/01-foundation.md` §7 and `docs/03-event-map.md` §7–8 carry dated amendments to that effect.

### 15.3 Central sequence generation is feasible. `U-10`

`FObserverEvent` implements monotonic sequencing. The feasibility question is closed and is not to be
reopened. What remains is the semantic guarantee — mandatory for session-scoped events, unreachable
from Blueprint, defined reset behaviour — which implementation evidence does not establish on its own,
and which stays `P-17`.
