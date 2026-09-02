# Positive controls — proving the Observer suite fails when the guarantees are broken

## What a positive control is, and why a green suite is not evidence

A test run tells you that the code passes the tests. It does not tell you that the
tests would have noticed had the code been wrong, and those are different claims —
the second one is the only one anybody is buying. Every suite that has ever
silently stopped testing anything was green on the day it stopped, and stayed green
afterwards. Green is the expected reading from a working detector and from a
disconnected one alike.

A positive control resolves the ambiguity the only way it can be resolved: break the
guarantee on purpose, in the smallest way a hurried change could genuinely break it,
and require the suite to say so. A mutation that produces no failure is not a
success. It is a **gap** — a sentence in a design document that no longer has a
mechanism behind it.

This document records nine such mutations against the Observer ingestion path, each
applied by hand to the working tree, run, recorded, and restored byte for byte. The
restoration is verified at the end, because a positive-control exercise that can
leave a mutation behind is worse than not doing it at all.

## How each control was run

1. Apply the smallest mutation that breaks the stated guarantee.
2. Run the smallest test selection that ought to catch it.
3. Record the file and line, the mutation, the command, the verdict, and the first
   line of the failure message.
4. Restore the file from bytes copied before the edit.
5. Re-run the same selection and confirm it is green.
6. Confirm the SHA-256 matches the pre-mutation digest and that `git diff --stat`
   reports no change to that file.

Every command below was run from `C:/Users/42191/Documents/iris-observer` as
`corepack pnpm vitest run <paths> --reporter=dot`.

### Two facts about the tree these results were measured against

**The tree was not static.** Other work was landing in this repository while these
controls ran. At the start of the exercise `git status` showed only the pre-existing
untracked archive artefacts; by the end it also showed in-progress fixture work in
`packages/contracts/src/ue5/fixtures.ts`, `packages/contracts/test/ue5/*` and
`packages/sources/test/journey.test.ts` that is not part of this exercise and was
left alone. Where that concurrent work changes a verdict, it is called out — and it
changes exactly one, Control 1, which is the most interesting result in the table.

**Two suites were already red before any mutation was applied**, and neither is
evidence about the Observer path:

- `packages/contracts/test/ue5/fixtures.test.ts` — four failures, from the fixture
  regeneration in flight. It was therefore excluded from every selection below.
- `supabase/test/{control-chars,no-secret-recipes,package-generation,staged-module}.test.ts`
  — the release-packaging suites, which measure the identity of the tree they run
  against and cannot be stable while the tree is being edited by anything at all,
  including this exercise. They were excluded for the same reason.

Baseline for everything that follows: `packages/sources/test` — 10 files, 278 tests,
all passing.

## The table

| #   | Guarantee                                                | Mutation                                                                                                          | Test that caught it                                                                                     | Verdict                                                       |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Activation alone never implies Connected                 | `activate.ts:462` — write a heartbeat record on a successful exchange                                             | `journey.test.ts` → "exchanges the code over HTTP for one token, and says the source is activated"      | **CAUGHT — but only in the working tree.** Uncaught at `HEAD` |
| 2   | A heartbeat writes no analytics row                      | `heartbeat.ts:148` — append an `observer.heartbeat` event before answering                                        | `heartbeat.test.ts` → "creates no analytics event row"                                                  | CAUGHT                                                        |
| 3   | `diagnostics.ping` never becomes canonical               | `diagnostic.ts:23,26` — namespace `diagnostics.`, canonical event `diagnostics.ping`                              | `heartbeat.test.ts` → three cases under "telling a diagnostic from a business fact"                     | CAUGHT                                                        |
| 4   | `diagnostic.test` never reaches a business metric        | `heartbeat.ts:356` — `countsAsBusinessFact` returns true for everything                                           | `heartbeat.test.ts` → same three cases                                                                  | CAUGHT                                                        |
| 4b  | …and the SQL form of the same rule                       | `diagnostic.ts:64` — `READ_MODEL_EXCLUSION_RULE` becomes `"true"`                                                 | `journey.test.ts` → "closes with a heartbeat that adds no business fact and diagnostics nothing counts" | CAUGHT                                                        |
| 5   | Unknown code quarantines whatever `retryable` said       | `errors.ts:385` — honour `serverRetryable` for an unknown code                                                    | `errors.test.ts` → two cases under "a code this build has never heard of"                               | CAUGHT                                                        |
| 6   | The canonical routes are the `observer-*` names          | `wire.ts:187` — `ingest: "/ingest"`                                                                               | `generated.test.ts` (3 cases) and `ue-compatibility.test.ts` (1 case)                                   | CAUGHT                                                        |
| 7   | 401 and 403 are never collapsed                          | `authenticate.ts:182` — a suspended source answers `unauthorised()`                                               | `authenticate.test.ts` → two cases under "401 and 403 are never collapsed into one another"             | CAUGHT                                                        |
| 8   | An unaccounted event is never acknowledged               | `ingest.ts:404-412` — the hole filler returns `accepted` instead of `storage_error`                               | `ingest.test.ts` → "answers storage_error, retryable, for the event whose row went missing"             | **CAUGHT — test added in response to this document**          |
| 8b  | One result per event, matched by ordinal                 | `ingest.ts:367` — match append rows by searching for `event_id`                                                   | `ingest.test.ts` → "pairs a repeated id inside one batch by ordinal, not by searching for the id"       | CAUGHT                                                        |
| 9   | Idempotency is `(source_id, event_id)`, never `event_id` | `20260902100000_observer_analytics_events.sql:103,247` — primary key and `on conflict` target become `(event_id)` | `analytics-events.test.ts` and `journey.test.ts` (3 cases)                                              | CAUGHT                                                        |

## The controls in detail

### 1. Activation sets Connected

**Mutation** — `packages/sources/src/activate.ts`, after line 462:

```ts
if (claim === null) return refused();

await deps.db.heartbeatRecord({ source: claim.source_id, facts: {} });
```

`heartbeatRecord` writes `last_heartbeat_at = now()` unconditionally, and
`classifyOperationalState` reads Connected as "that column is not null", so this is
the whole of the collapse in one line: an operator watching a green activation
response would be told the showroom is reachable, when all that has been proved is
that a credential was minted.

**Command** — `packages/sources/test supabase/test/source-operations.test.ts supabase/test/activation-credential.test.ts`
(12 files, 341 tests).

**Verdict** — FAILED, one test:
`journey.test.ts > … > exchanges the code over HTTP for one token, and says the source is activated`

```
AssertionError: activation is not a heartbeat: expected '2026-09-02T18:37:04.677Z' to be null
```

**The caveat, and it is the finding.** That assertion is at
`journey.test.ts:596`, inside a block that **does not exist at `HEAD` (8dd5a96)** —
`git show HEAD:packages/sources/test/journey.test.ts` contains the phrase "activation
is not a heartbeat" zero times; the working tree contains it once. It arrived during
this exercise as part of concurrent work on the journey suite. Nothing else in 341
tests noticed the mutation: `activate.test.ts` never inspects the operational record,
and `operations.test.ts` builds its sources by direct registration rather than by
exchanging a code, so its "reports neither for a source that has been registered and
has done nothing" case never travels the activation path.

So the honest statement of this control is two statements. **At `HEAD`, the guarantee
"activation alone never implies Connected" had no test behind it.** In the working
tree it now has exactly one, in the E2E journey, and no unit-level test anywhere
asserts it. If that journey leg is ever weakened or reordered, the guarantee is
uncovered again with nothing to say so.

### 2. Heartbeat inserts an analytics event

**Mutation** — `packages/sources/src/heartbeat.ts`, immediately before line 148,
insert an `eventsAppend` call carrying an `observer.heartbeat` event built from the
heartbeat's own build metadata and queue depth.

**Command** — `packages/sources/test/heartbeat.test.ts` (27 tests).

**Verdict** — FAILED:
`heartbeat.test.ts > a heartbeat from an activated source > creates no analytics event row`

```
AssertionError: expected 6 to be 5
```

Worth noting _why_ this works: the test counts rows in `observer.analytics_events`
either side of a successful heartbeat rather than asserting that `eventsAppend` was
not called. "We did not call the append" is a claim about one file; "no row appeared"
is a claim about the system, and it survives the append arriving by some other route.

### 3. `diagnostics.ping` becomes canonical

**Mutation** — `packages/contracts/src/ue5/diagnostic.ts:23` and `:26`:

```ts
export const DIAGNOSTIC_NAMESPACE = "diagnostics." as const;
export const DIAGNOSTIC_TEST_EVENT = "diagnostics.ping" as const;
```

This is the UE-side spelling promoted to canonical here — the thing the contract
says must never happen. Note that `diagnostics.ping` is _not_ inside the
`diagnostic.` namespace (`"diagnostics.ping".startsWith("diagnostic.")` is false), so
promoting the name means moving the namespace with it, which is exactly what a
careless "align with the plugin" change would do.

**Command** — `packages/sources/test/heartbeat.test.ts packages/contracts/test/ue5/validation.test.ts`.

**Verdict** — FAILED, three tests in `heartbeat.test.ts`:

```
AssertionError: expected true to be false
```

from `does not count the reserved diagnostic event as a business fact`,
`excludes the whole reserved namespace, not one name`, and
`is a filter a read model can apply directly`.

**`validation.test.ts` passed, and that is a lesson rather than a reassurance.**
That suite imports `DIAGNOSTIC_TEST_EVENT` and builds its fixtures from it, so the
mutation moved the test's expectation along with the code. The three assertions that
did fire are the ones that spell `"diagnostic.test"` as a literal. A contract test
that only ever refers to a constant cannot detect a change to that constant; the
literal is the control.

### 4. `diagnostic.test` reaches business metrics

**Mutation** — `packages/sources/src/heartbeat.ts:356`:

```ts
return isDiagnosticEvent(eventName) || true;
```

**Command** — `packages/sources/test/heartbeat.test.ts`.

**Verdict** — FAILED, the same three cases under "telling a diagnostic from a
business fact", first line `AssertionError: expected true to be false`.

#### 4b. The SQL half of the same rule

`countsAsBusinessFact` guards a TypeScript read model; `READ_MODEL_EXCLUSION_RULE`
guards a SQL one. Breaking one says nothing about the other, so both were run.

**Mutation** — `packages/contracts/src/ue5/diagnostic.ts:64`:

```ts
export const READ_MODEL_EXCLUSION_RULE = "true" as const;
```

**Command** — `packages/sources/test/journey.test.ts packages/contracts/test/ue5/schema.test.ts`.

**Verdict** — FAILED:
`journey.test.ts > … > closes with a heartbeat that adds no business fact and diagnostics nothing counts`

```
AssertionError: the onboarding check under A, and the colliding one under B: expected +0 to be 2
```

The journey suite interpolates the published constant straight into its counting
query, so a rule that stops excluding anything makes the diagnostic count collapse
to zero. Both halves of the rule are covered; neither covers the other.

### 5. Unknown code plus `retryable: true` causes a retry

**Mutation** — `packages/contracts/src/ue5/errors.ts:385`, in the unknown-code branch
of `classifyEventRejection`:

```ts
return {
  ...UNKNOWN_CODE_POLICY,
  retryable: serverRetryable === true,
  outbox: serverRetryable === true ? "retain" : UNKNOWN_CODE_POLICY.outbox,
  known: false,
  disagreement: false,
};
```

**Command** — `packages/contracts/test/ue5/errors.test.ts` (20 tests).

**Verdict** — FAILED, two tests:
`stays non-retryable even when the server insists it is retryable` and
`answers the two flags identically, having read neither of them`, both

```
AssertionError: expected true to be false
```

The second case is the stronger of the two: it asserts that the answers for
`retryable: true` and `retryable: false` are _identical_, which is a claim that the
flag was not read at all, rather than a claim about one of its two values.

### 6. The old `/ingest` path becomes canonical

**Mutation** — `packages/contracts/src/ue5/wire.ts:187`:

```ts
  ingest: "/ingest",
```

**Command** — `packages/contracts/test/ue5/generated.test.ts packages/contracts/test/ue5/ue-compatibility.test.ts` (31 tests).

**Verdict** — FAILED, four tests. First line of the first:

```
AssertionError: openapi.json is stale — run `pnpm contracts:ue5`: expected '{\n  "openapi": "3.1.0",\n  "info": {…' to be '{\n  "openapi": "3.1.0",\n  "info": {…'
```

and, more legibly, from
`the OpenAPI document says the things it must > describes the three proposed endpoints and nothing more`:

```
AssertionError: expected [ '/ingest', …(2) ] to deeply equal [ '/observer-activate', …(2) ]
```

Three independent detectors fired: the committed OpenAPI artefact no longer matched
byte for byte, the path list no longer matched the three literal names, and the
security scheme lookup missed because it keys off the path. The byte-for-byte check
on the generated pack is the one that would catch a route rename nobody thought to
assert.

### 7. 401 and 403 collapse

**Mutation** — `packages/sources/src/authenticate.ts:182`:

```ts
    case "suspended":
      return { ok: false, response: unauthorised() };
```

**Command** — `packages/sources/test/authenticate.test.ts` (19 tests).

**Verdict** — FAILED, two tests:

```
AssertionError: expected 401 to be 403
AssertionError: expected 401 not to be 401
```

from `answers 403 source_suspended for a valid credential on a suspended source` and
`never answers a suspended source with 401`. The pair is deliberate — one asserts the
right answer, the other asserts the specific wrong answer is never given — and it is
what makes the collapse detectable in either direction.

### 8. A missing event result is treated as acknowledged — **UNCAUGHT**

This is the one control the suite does not detect, and it is described in full in the
next section.

#### 8b. One result per event, matched by ordinal

The related invariant _is_ covered, so it was run as a separate control to establish
where the boundary of the coverage actually lies.

**Mutation** — `packages/sources/src/ingest.ts:367`:

```ts
const submitted = passing.find((entry) => entry.event.event_id === row.event_id);
```

— which is precisely the mistake the surrounding comment warns against.

**Command** — `packages/sources/test/ingest.test.ts` (24 tests).

**Verdict** — FAILED:
`ingest.test.ts > a replayed batch is answered duplicate rather than stored twice > pairs a repeated id inside one batch by ordinal, not by searching for the id`

```
AssertionError: expected [ 'duplicate', 'rejected' ] to deeply equal [ 'accepted', 'duplicate' ]
```

### 9. Source B can probe Source A's duplicates

**Mutation** — `supabase/migrations/20260902100000_observer_analytics_events.sql`, two
lines that are one decision:

```sql
-- :103
  constraint analytics_events_pkey primary key (event_id),
-- :247
    on conflict (event_id) do nothing
```

The `on conflict` target has to move with the key or the append raises rather than
mis-answers, which would prove only that PostgreSQL noticed — not that the suite did.
The suites apply migrations from disk on every run, so editing the file is enough;
there is no separate apply step and no cached schema.

**Command** — `supabase/test/analytics-events.test.ts packages/sources/test/journey.test.ts` (39 tests).

**Verdict** — FAILED, three tests:

```
AssertionError: no cross-source oracle: expected 'duplicate' to be 'accepted'
AssertionError: one tenant's history cannot suppress another's: expected 'duplicate' to be 'accepted'
AssertionError: the onboarding check under A, and the colliding one under B: expected 1 to be 2
```

The first is the SQL-level statement of the rule, the second is the same rule
observed through the HTTP path under two different accounts, and the third catches
the consequence — a row that should exist twice existing once. The existence oracle
is covered at both levels.

## The uncaught control

### 8 — an unaccounted event is reported as `accepted`

**File and line** — `packages/sources/src/ingest.ts:404-412`.

**Mutation** — the block that fills holes in the per-event result array:

```ts
const settled: EventResult[] = results.map((result, index) => {
  if (result !== null) return result;
  const raw = batch.events[index];
  return settledResult(raw?.event_id ?? "00000000-0000-4000-8000-000000000000", "accepted");
});
```

The original returns `rejectedResult(…, "storage_error", …)` — retryable, so the
client keeps the event and sends it again. The mutation returns `accepted`, which
tells the client to **delete an event the server never accounted for**. That is
silent data loss, and it is the exact failure the comment above the block says the
redundant counters exist to catch.

**Command and result** — no failure, at any width:

| Selection                                                                    | Result                              |
| ---------------------------------------------------------------------------- | ----------------------------------- |
| `packages/sources/test/ingest.test.ts packages/sources/test/journey.test.ts` | 2 files, 40 tests, all passed       |
| `packages/sources/test apps/web/test supabase/test/http-proof.test.ts`       | 28 files, **839 tests, all passed** |

Every suite that exercises `handleIngest` — the unit suite, the sixteen-leg E2E, the
Next route handlers, and the HTTP proof — passes with the mutation in place.

**Why nothing catches it.** The branch is unreachable through any input a test can
construct. A hole in `results` requires `observer_events_append` to return fewer rows
than it was handed elements, and it cannot: it selects from
`jsonb_array_elements(...) with ordinality`, so the row count is the element count by
construction. The branch is defensive code against a future disagreement between the
port and the SQL, and defensive code with no way to reach it has no way to be tested
by the route it defends.

That does not make the mutation harmless. It makes it invisible. The day the port and
the facade do disagree — an added filter in the SQL, a `where` clause on the insert
returning, a batching change — is the day this branch runs for the first time, and
whether it says `accepted` or `storage_error` on that day decides whether the
operator loses events or retries them. Right now nothing holds it to the safe answer.

**What would need to be added.** A unit test over the settling step with an injected
`eventsAppend` that returns a short row list. Concretely: a case that submits two
valid events against a fake `ObserverDb` whose `eventsAppend` returns only the row for
ordinal 1, and asserts that the second event's result is `rejected` with code
`storage_error` and `retryable: true` — never `accepted`, never absent. That requires
the settling logic to be reachable with a stub port, which today it is not: the
handler takes its `db` from `HandlerDeps`, so a stub is straightforward, and
`ingest.test.ts` already builds its deps object. One test, one fake, and the branch
stops being an unverified promise.

A second, weaker guard is worth having alongside it: assert
`response.results.length === response.received` for every batch the suite sends. That
is a property, not a case, and it would catch a whole family of accounting mistakes
including any future one that drops a result rather than mis-labelling it.

## Restoration

Every mutated file was restored from bytes copied before its edit, and each
restoration was verified twice — by digest against the pre-mutation copy, and by
`git diff --stat` against the index. Each control's test selection was re-run after
restoration and was green.

SHA-256 of every mutated file, before mutation and after restoration — identical in
all eight cases:

```
2246a56096214d6568ab1033d456e5d306ce0827bed9dde3cf59626363fd57c3  packages/sources/src/activate.ts
4054a2426ab5f6eb56a887ef1ec2210764060ba6825fd321d00a2c1abe0f8b18  packages/sources/src/heartbeat.ts
b4b30adc87f6fc20a4052d9e60f564943a062e60271607f4adfc330e8dcb0504  packages/sources/src/authenticate.ts
f788132f2f60531ca17a289170f94adce4b18f720ee8999135b4653d8543e829  packages/sources/src/ingest.ts
0cc05f74172b7dbdeca20903e30f209d471e9e74ee71ad890b1f28c4c2b29e2b  packages/contracts/src/ue5/diagnostic.ts
38153bb5233acd88400a3e6e7a7282db7072d96d8a7e7998e8f33495700e8216  packages/contracts/src/ue5/errors.ts
82305437dfb352b2d2d296ee3af728a07fc65880dee177cecf60b7aadd9520b6  packages/contracts/src/ue5/wire.ts
659af714bf642d09d82517e446993df9be957516d7af17d81ebc559aa7caaefd  supabase/migrations/20260902100000_observer_analytics_events.sql
```

And the git-level check over the same eight paths:

```
$ git diff --stat packages/sources/src/activate.ts packages/sources/src/heartbeat.ts \
    packages/sources/src/authenticate.ts packages/sources/src/ingest.ts \
    packages/contracts/src/ue5/diagnostic.ts packages/contracts/src/ue5/errors.ts \
    packages/contracts/src/ue5/wire.ts \
    supabase/migrations/20260902100000_observer_analytics_events.sql
(no output — no change to any mutated file)
```

Post-restoration re-runs, all green:

| Control | Selection                                             | Result         |
| ------- | ----------------------------------------------------- | -------------- |
| 1       | `journey.test.ts activate.test.ts operations.test.ts` | 79 passed      |
| 2, 4    | `heartbeat.test.ts`                                   | 27 passed      |
| 3       | `heartbeat.test.ts validation.test.ts`                | 52 passed      |
| 4b, 8   | `journey.test.ts` / `ingest.test.ts journey.test.ts`  | 16 / 40 passed |
| 5       | `errors.test.ts`                                      | 20 passed      |
| 6       | `generated.test.ts ue-compatibility.test.ts`          | 31 passed      |
| 7       | `authenticate.test.ts`                                | 19 passed      |
| 9       | `analytics-events.test.ts journey.test.ts`            | 39 passed      |

`git status --porcelain` after the exercise shows this document, the five
pre-existing untracked archive artefacts, and the concurrent fixture work described
above — and no mutated file.

---

## Addendum — control 8 is now caught

Written after the document above, and kept separate rather than folded in, because the
sequence is the point: the control found the gap, and the gap was closed because the
control reported it instead of rounding it to eight-out-of-nine.

**Added** — `packages/sources/test/ingest.test.ts`, `describe("an event the facade did
not account for is never reported accepted")`, two cases:

1. A stub `ObserverDb` wrapping the real one, whose `eventsAppend` returns one row
   fewer than it was handed. The disagreement between port and facade is stated
   directly rather than coerced out of Postgres, which cannot produce it. Asserts the
   orphaned event comes back `rejected` / `storage_error` / `retryable: true`, under
   the id it was submitted with, and that the first event really was stored — the stub
   loses the report, not the write, so a resend yields `duplicate` for one and a fresh
   attempt for the other.
2. `results.length === received` across batches of 1, 2 and 5. A property rather than
   a case, catching a family of accounting mistakes rather than this one instance.

**Verified against the mutation, not merely written.** With
`return settledResult(…, "accepted")` in place of the `storage_error` branch:

```
FAIL  ingest.test.ts > an event the facade did not account for is never reported
      accepted > answers storage_error, retryable, for the event whose row went missing
AssertionError: never accepted — the client would delete it: expected 'accepted' to be 'rejected'
```

The file was then restored and `git diff` reports no change to `ingest.ts`, and the
suite is green again at 26 tests.

**What is still true.** The branch remains unreachable through the real facade, so this
test does not prove the branch ever runs in production. It proves the branch is held to
the safe answer for the day it does — which is all a test of defensive code can honestly
claim, and more than nothing was claiming yesterday.
