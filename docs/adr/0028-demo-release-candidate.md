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

## Eight defects this gate found

None was visible to the unit suite, and each was the product telling the reader
something untrue.

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

**The operator's diagnosis was on the reader's screen.** With no key configured
— the state of any deployment nobody has set up yet — the first screen told
every visitor "Voice is unavailable: No `OPENAI_API_KEY` is set on the server,
so no client secret can be minted." A variable name is not a secret and nothing
leaked, but that sentence is written for whoever can go and set the variable and
was being shown on a public URL to an audience who cannot. `VoiceBlocker` now
carries two sentences and `publicBlocker()` puts only the reader's on the wire.
Found by the black-box run, not by the suite, which asserted on the first
element with `role="note"` and had been reading the wrong one.

**Two counts of the same meetings disagreed on one screen**, and following it
found something worse. The briefing said "I reviewed 74 showroom presentations
quarter to date" and the answer beneath it said "Measured across 73 meetings".

The repository built two slices of every period: `current`, running to the
period's stated end, and `throughToday`, running to the end of today. Two
slices meant two answers to "how many meetings are in this period" and both
reached the screen — the briefing and Sales Flow read one, Presentation DNA and
Project read the other.

`throughToday` also ignored the period's end entirely. So **"Last completed
quarter" reported 132 meetings** — every meeting in the dataset, four months of
them — on the three surfaces that read it, against the 58 the other surfaces
reported for the same selection. That is not a rounding difference; it is a
finished quarter that kept growing.

There is one slice now. It extends through today when the period is still
running and stops at the period's end when it is not. Five tests assert that
four surfaces agree on four presets, and that a completed period cannot contain
the whole dataset. Found by looking at a screenshot.

**The composed answer restated itself.** `summarize_showroom_period` built its
one-line draft as `verdict + findings[0]`, and the verdict leads with whatever
moved most — which is usually what `findings[0]` is about. The answer read
"Compare went unopened in 72%. Compare was never opened in 72% of
presentations." One measurement, two sentences, which reads as two pieces of
evidence.

Fixed at the source rather than downstream: the draft takes the first finding
that introduces a figure the verdict has not already stated. Judged on figures
because the wording is exactly what differs — those two sentences share one
number and almost no vocabulary.

**A project with no history was compared against nothing.** Kingsford has been
selling three weeks, so "last month" is a month in which it did not exist. The
briefing read "41 meetings this month against 0 last month" — arithmetically
true, and inviting exactly the comparison it should not: 41 against nothing is a
first period, not growth. ADR-0027 corrected the *progression* figure for this
and left the *volume* figure beside it still making the claim. There is now no
comparison, no arrow and no direction where there is no baseline. Found by
looking at a screenshot.

**A developer's own figures counted a competitor's meetings.** The Sales Flow
summary window must be able to say "all time" without being clipped to the
selected period, so it was handed `showroomSessions()` — every meeting in every
project of every tenant. Northgate therefore reported 98 presentations this
month above a chart reading 32, and the 98 counted Riverside and Beta
Development's Kingsford.

The window ignores the *period*. It does not get to ignore the *project*. It
now reads the same unclipped set scoped to the project the viewer already
resolved.

**Every project rendered Northgate's apartments.** `RAW_CATALOGUE` was a module
constant pinned to `prj_northgate01` — "retained for the surfaces that are
still single-project" — and four builders read it: the unit list, the segment
breakdown, the audience filter and the sales-plan bullet chart. Riverside Walk
and Kingsford Yard both showed Northgate's forty-eight units against Northgate's
sold count and Northgate's target.

ADR-0027 scoped the *sessions* and stopped there. The route, the read model and
the tool were all correct; the catalogue underneath them was not. Riverside now
has its 36 units in buildings R and W, Kingsford its 30 in building K, and the
constant is deleted rather than deprecated — one that is correct for a single
project and silently wrong for every other is not a thing to leave lying about
with a comment on it.

Nine tests across the two: no window may count more meetings than its project
has, three projects must have three different sales plans, and every unit code
on a project's list must match that project's buildings.

## Known limitations

**Prose paraphrase is not detected generally.** The composer drops identical
restatements from two tools, and the tool above no longer produces a paraphrase
of itself, but nothing catches an arbitrary paraphrase across two tools.
Separating one from two genuinely different findings that share vocabulary —
"Gallery opened in 56% of meetings" beside "Compare opened in 56% of meetings" —
needs to know which word is the subject, and guessing at it drops real content.
`findAnswerDefects` manages it on a model's answer because it works on terse
finding labels, where the whole label is the subject. Prose is not that.

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
