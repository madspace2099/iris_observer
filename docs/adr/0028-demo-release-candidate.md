# ADR-0028 — The demonstration release candidate

**Status:** accepted
**Date:** 2026-08-25
**Branch:** `release/observer-demo-rc1`, from `8b4d7c1`

## Context

Everything before this point has been protected by being unreachable. The
deployment answered questions on a Vercel project nobody had the URL for, with
limits kept in one lambda's memory and a bill bounded by the same accident.

A demonstration given to a client is not that. It is a URL somebody can send to
somebody else, running on a serverless platform that will happily give every
warm instance its own copy of every counter.

## The shared ceiling

`ai/limits.ts` counts in the process. It stays, because refusing an obvious
burst without a network round trip is worth doing and costs nothing.

Above it, `ai/quota.ts` consumes four ceilings from Postgres inside one
transaction behind an advisory lock: per session per minute, per session per
hour, per client fingerprint per hour, and **per project per day** — the only
one of the four that bounds the bill, and the one a per-instance counter cannot
express at all.

Three properties are worth stating because each was a decision:

**The client is a salted hash, never an address.** An IP address identifies a
building. A sales office behind one connection is one address and a dozen
readers, and rate-limiting them as a single caller punishes the busiest
customer. It is also personal data this product has no reason to hold.

**Counters move only when the request is allowed.** A refused request that still
spent quota would let somebody exhaust a ceiling they were never permitted to
use.

**It fails open.** If Postgres cannot be reached the request proceeds and the
in-process limiter still applies. Failing closed would mean a database outage
silently disables Ask Observer in the middle of a client consultation, with a
refusal the reader cannot distinguish from a broken product. Failing open
degrades the ceiling to per-instance — which is exactly where it was before —
while the vendor-side spend limit on the OpenAI project remains underneath.
This ceiling is not the last line, and is not built as though it were.

## The audit

`observer.ai_requests` records **that** a question happened. Never what it said.

No prompt, no answer, no contact name, no unit code, no address. Those are the
fields that turn a useful operational log into a disclosure, and a
demonstration has no need for any of them: the questions worth asking of this
table are how many, how fast, how often refused, and what it cost.

Both tables carry RLS with no policies and every grant to `anon`,
`authenticated` and `public` is revoked. Supabase's linter reports
`rls_enabled_no_policy` at INFO. That finding is the control working.

## Two defects the acceptance run found

Neither was visible to the unit suite, and both were about the product telling
the reader something untrue.

**`live` described the deployment, not the answer.** A correctly configured
model that then timed out — or returned prose the schema rejected — still
reported `live: true` beside an answer the deterministic composer had written.
The reader was told they were reading a model's words when they were not, which
is the one claim ADR-0024 exists to keep honest. The flag now describes the
answer in front of the reader.

**A "why" answered without a model was answered as a "what".** ADR-0027 gave
the live path four moves and a validator that rejects an answer making neither
the causal step nor the refusal of it. The deterministic path had neither, so
`Explain why Compare mode fell` returned three descriptive figures and stopped
— which reads as an answer to the question that was asked and is not one. It
now says what the measurement cannot settle and names the comparison that would
narrow it, in the same voice, without a causal word in it.

## Release blocker at the time of writing

**The configured `OPENAI_API_KEY` is rejected by the API.** It is present, it is
a replacement for the key that was pasted into a conversation and must be
treated as compromised — verified by digest comparison, not by eye — and the
value is additionally wrapped in placeholder angle brackets. Unwrapped, it
returns `invalid_api_key` on `/v1/models` and on `/v1/responses`.

So every answer in the acceptance evidence is Observer's own composition. The
gate, the tools, the evidence, the refusals, the ceilings and the fallback are
all exercised for real. **The model's prose is not**, and this release candidate
is therefore not consultation-ready until a working key is configured.

`env.ts` now reports a malformed key as a named problem at startup. A key that
is present but the wrong shape produced a 401 indistinguishable from a revoked
key or an empty account, and the operator had no way to tell which.
