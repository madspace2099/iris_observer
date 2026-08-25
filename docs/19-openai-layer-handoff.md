# The OpenAI intelligence layer — handoff

**Written:** 2026-08-25 · **Status:** built, unit-verified, **not committed, not fully verified**
**Author:** a session that stood down mid-milestone. See *Why this is a handoff* at the end.

This document exists because two Claude sessions were writing to this working tree at
once. Rather than interleave two half-finished designs into one unreviewable commit,
this workstream stopped and wrote down what it built and why. **Nothing here is
committed.** The code is in the tree to be used, amended or discarded.

---

## 1. What was built

The OpenAI intelligence layer replacing ADR-0024's fal.ai route. It extends the
existing provider-neutral architecture rather than introducing a second one: the
`LlmProvider` port became `ObserverModel`, and the tool registry, read models and
components were not touched by the provider change.

### New files

| File | What it is |
| ---- | ---------- |
| `packages/contracts/src/observer-answer.ts` | The strict `ObserverAnswer` contract, evidence bundles, traceability check |
| `apps/web/src/lib/ai/identity.ts` | Hashed, peppered, tenant-scoped `safety_identifier` |
| `apps/web/src/lib/ai/fake-provider.ts` | A real implementation of the port that makes no network call |
| `apps/web/src/lib/ai/streaming.ts` | Incremental JSON field reader, so structured answers still stream |
| `apps/web/src/lib/ai/telemetry.ts` | Usage and latency, with no prompt and no personal data |
| `apps/web/src/lib/ai/gate.ts` | One authentication → shape → authorisation → allowance → meter path |
| `apps/web/src/lib/ai/voice.ts` | Realtime session minting and the non-secret blocker taxonomy |
| `apps/web/src/app/api/ask/stream/route.ts` | Server-sent events: `stage`, `tool`, `delta`, `final`, `failure` |
| `apps/web/src/app/api/observer/voice/session/route.ts` | Ephemeral client secret, gated |
| `apps/web/src/app/api/observer/voice/tool/route.ts` | Where the voice agent's tool calls are actually executed |
| `apps/web/src/showroom/observer/useObserverVoice.ts` | WebRTC in the browser, with no key in it |
| `scripts/openai-smoke.mjs` | The one opt-in live check (`pnpm smoke:openai`) |
| `apps/web/test/ai-intelligence.test.ts` | 24 tests: the agent against a misbehaving model |
| `apps/web/test/ai-config.test.ts` | 20 tests: configuration, allowlist, voice blockers, identity |
| `apps/web/test/ai-streaming.test.ts` | 11 tests: chunk-boundary behaviour of the JSON reader |
| `packages/contracts/test/observer-answer.test.ts` | 13 tests: the answer contract's structural prohibitions |

### Rewritten

`apps/web/src/lib/ai/provider.ts` (official SDK, Responses API) ·
`apps/web/src/lib/ai/agent.ts` (native tool calling, structured output, streaming) ·
`apps/web/src/lib/env.ts` (the seven new settings, validated) ·
`apps/web/src/app/api/ask/route.ts` · `apps/web/src/showroom/observer/{useObserver,Answer,ObserverConsole,types}.ts(x)` ·
`apps/web/src/showroom/orb/profile.ts` · `packages/ui/src/observer.css` · `.env.example`

---

## 2. The decisions, and why

These are the parts that will look arbitrary later and are not.

**The model never authors an evidence bundle.** It receives a map the server built
from what the tools returned, and may only quote a `bundleId`. A fabricated citation
is therefore a key that is not in a map the server owns, and `findAnswerDefects`
rejects the whole answer. This is the difference between a citation and a
plausible-looking citation, and it is why `ModelAnswerSchema` omits `evidence`.

**No causal claim is structurally impossible, not merely discouraged.**
`EvidenceLevelSchema` is derived from `PRODUCIBLE_EVIDENCE_TIERS`, which omits
`causal_claim` — so the two lists cannot drift apart. A second guard,
`CAUSAL_PATTERNS`, runs over the finished prose. It caught the deterministic
composition's own wording during development, which is the guard working on the one
paragraph in the pipeline no model wrote.

**A misconfigured deployment refuses; it does not substitute.** A model the account
cannot reach raises `ModelConfigurationError` and the reader is told the
interpretation layer is misconfigured. It is never quietly answered by a different
model. `resolveModel()` distinguishes three states — live, evidence-only (a supported
mode, not a degraded one) and misconfigured (a fault) — and conflating the last two is
how a deployment ends up believing it runs a model while running a template.

**The breaker suppresses the vendor call, never the request.** Adopted from the other
session's `limits.ts`, and it is the better design: the tools and read models never
needed the network, so an open breaker means the *interpretation* is missing, not the
evidence.

**Luna plans, Sol composes.** Tool selection is the only Luna path. Its output passes a
compile-time allowlist and a Zod schema before it can do anything, so a wrong plan
costs one wasted read-model query and yields a different valid analysis — never a
wrong figure. Every reader-facing sentence is Sol's. This is the "validated low-risk
task" the brief asked for; nothing else qualified.

**High reasoning effort is requested, never inferred.** `depth: "deep"` comes from an
explicit control in the interface. A system that escalates its own reasoning budget
based on how a question is phrased has a bill that is a function of phrasing.

**Streamed text is shown and never trusted.** The SSE `delta` events render in a
visibly provisional state and are replaced wholesale by the validated answer — or
discarded. `useObserver` treats a stream that ends without a `final` event as a
failure, because prose on screen under a settled-looking orb, having passed no check,
is the worst available outcome.

**No automatic retry.** `maxRetries: 0` on the SDK client. An automatic retry loop in
front of a per-token vendor spends money at machine speed.

---

## 3. Verification, as of standing down

```
pnpm test        343 passed (24 files)      ← was 265 before this work
pnpm lint        clean
pnpm typecheck   clean (all packages)
pnpm format      clean
```

**Not run:** `pnpm build`, Playwright, axe, screenshots. The full `pnpm verify` was
started and interrupted; it was never completed against a stable tree, so **no claim is
made that the production build is green.**

One test file fails and is **not** from this workstream:
`packages/synthetic/test/isolation.test.ts`, 9 failures. It describes a real,
pre-existing defect — [`sessions.ts:700`](../packages/synthetic/src/showroom/sessions.ts)
stamps a hard-coded `"prj_northgate"` (not even a valid project id; the world uses
`prj_northgate01`) onto every session, so Northgate, Riverside and Kingsford render
identical figures. Two mechanical breakages in that file were fixed here (`VIEWERS` is
a record, not an array). The remaining 9 failures need the per-project dataset
separation that the other session began in `views3.ts`, `charts.ts`, `repository.ts`
and `sessions.ts`. **That work is unfinished and uncommitted.**

---

## 4. Blockers

**None. The live smoke test passes.**

```
PASS  models listing — 124 models visible
PASS  text model "gpt-5.6-sol" is reachable
PASS  fast model "gpt-5.6-luna" is reachable
PASS  voice model "gpt-realtime-2.1" is reachable
PASS  text completion — 5 output tokens, store=false
PASS  fast completion — 5 output tokens, store=false
PASS  realtime client secret — minted and discarded
```

All three configured models exist on this account, the Responses API accepts
`store: false` and `safety_identifier`, and a realtime client secret mints — so the
voice layer's server side is viable. **The browser WebRTC path is still unexercised:**
minting a secret is not the same as holding a call, and voice must not be described as
working until somebody has spoken to it.

### The 401 that was not a 401 — read this before debugging a key

Several hours were lost, and at least one working key was needlessly revoked, to a
diagnosis that was wrong. `GET /v1/models` returned 401 from Node while returning 200
from PowerShell **with the same key**, because the two read different things:

| Reader | Source | Freshness |
| ------ | ------ | --------- |
| `[Environment]::GetEnvironmentVariable(name, "User")` | the registry | current |
| `$env:NAME`, `process.env.NAME` | the inherited process block | **frozen at parent start** |

A Windows process inherits its environment from its parent. Changing a User-scope
variable updates the registry; it does **not** reach any process already running, nor
any child they spawn. So every tool process descended from a shell started before the
key changed kept serving the old, revoked value — and reported 401 with total
confidence.

The fingerprints made it obvious once compared: registry `6d5129ea`, inherited
`6faf0142`. Two different keys.

**Practical consequences.** After changing `OPENAI_API_KEY`, restart anything already
running — the dev server, editors, other agent sessions — or hand the fresh value in
explicitly:

```powershell
$env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY","User")
```

**`scripts/openai-smoke.mjs` should be hardened for this** and has not been: it trusts
`process.env` and cannot tell a revoked key from a stale one. Printing a short
fingerprint of the key it is about to use — a hash prefix, never the value — would have
turned this into a ten-second diagnosis. That change is not made here only because this
workstream stood down.

### Security incident, recorded rather than buried

Two API keys were exposed during this milestone and **both must be treated as
compromised regardless of any later care**:

1. A key was printed into a session transcript by a failed redaction in a PowerShell
   `-replace` intended to mask it. The lesson is in `scripts/openai-smoke.mjs`: that
   script never reads the key's value at all, not even its length or prefix.
2. A second key was echoed to a terminal and captured in a screenshot, because it was
   pasted into the *prompt-string argument* of `Read-Host` rather than at the prompt.
   It is also in that shell's history file.

`.env.local` never held a key and still does not; it carries only a comment saying so.
`.env.example` carries `OPENAI_API_KEY=` with an empty value, and a test enforces that
every secret-shaped name in it stays empty.

---

## 5. What is left

1. Reconcile with the role-authorisation work the other session added to
   `ObserverContext`, `suggestions.ts`, `ObserverRail.tsx` and `tools.ts`.
2. ADR-0027 (the intelligence layer, superseding ADR-0024) and ADR-0028 (realtime
   voice). ADR-0026 exists and is sound, but its *No voice* section and its *Blocked*
   section are both now out of date.
3. `pnpm build`, Playwright, axe, and desktop plus mobile screenshots of the Observer
   surface — which, per the project's own rule, is the only thing that can approve a
   screen. **No screenshot of this work has been looked at by anybody.**
4. `pnpm smoke:openai` against a working key, then the realtime path.
5. `docs/PROJECT-STATE.md`. Deliberately not edited from here: the other session was
   actively writing the tree and would have clobbered it.

---

## Why this is a handoff

Two sessions were editing this working tree simultaneously — first `iris-observer-45`,
then `iris-observer-36` — both on overlapping parts of this milestone. A commit
assembled from that tree would blend two unfinished designs, and `pnpm verify` cannot
mean anything while files change under it. Asked to choose, the user kept the other
session. This one stopped rather than race it.

The code left behind is coherent on its own terms and its unit suite is green. It is
not verified end to end, and it should not be described as finished.
