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

**It fails closed, and that reverses an earlier decision.** Both sides are kept
because the reversal matters.

It used to fail open: an unreachable Postgres let the request through and the
in-process limiter still applied. The argument was that a Supabase outage should
not disable Ask Observer mid-consultation, and that the vendor-side spend limit
sits underneath regardless.

The argument against is stronger for a public demonstration. This ceiling exists
to bound a bill, and one that removes itself precisely when its enforcement
mechanism breaks is not a ceiling — it is a ceiling-shaped assumption, and the
outage that disables it is exactly the moment nobody is watching. Failing open
has no visible symptom either: a deployment could run unbounded for a month and
look identical to one that was fine.

So a deployment that **has** Supabase configured and cannot reach it refuses,
and calls no model. A deployment that has **none** configured is untouched —
nothing promised it a shared ceiling, so nothing is taken away. That distinction
is what keeps local development and the test suite working.

The cost is stated rather than hidden: an unreachable database stops Ask
Observer answering in a model's words. The reader is told to try again shortly,
and **every measured figure on every screen is unaffected** — none of them
needed the network, which is the property that makes this affordable.

## The audit

`observer.ai_requests` records **that** a question happened. Never what it said.

No prompt, no answer, no contact name, no unit code, no address. Those are the
fields that turn a useful operational log into a disclosure, and a
demonstration has no need for any of them: the questions worth asking of this
table are how many, how fast, how often refused, and what it cost.

Both tables carry RLS with no policies and every grant to `anon`,
`authenticated` and `public` is revoked. Supabase's linter reports
`rls_enabled_no_policy` at INFO. That finding is the control working.

## Ten defects this gate found

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
first period, not growth. ADR-0027 corrected the _progression_ figure for this
and left the _volume_ figure beside it still making the claim. There is now no
comparison, no arrow and no direction where there is no baseline. Found by
looking at a screenshot.

**A developer's own figures counted a competitor's meetings.** The Sales Flow
summary window must be able to say "all time" without being clipped to the
selected period, so it was handed `showroomSessions()` — every meeting in every
project of every tenant. Northgate therefore reported 98 presentations this
month above a chart reading 32, and the 98 counted Riverside and Beta
Development's Kingsford.

The window ignores the _period_. It does not get to ignore the _project_. It
now reads the same unclipped set scoped to the project the viewer already
resolved.

**Every project rendered Northgate's apartments.** `RAW_CATALOGUE` was a module
constant pinned to `prj_northgate01` — "retained for the surfaces that are
still single-project" — and four builders read it: the unit list, the segment
breakdown, the audience filter and the sales-plan bullet chart. Riverside Walk
and Kingsford Yard both showed Northgate's forty-eight units against Northgate's
sold count and Northgate's target.

ADR-0027 scoped the _sessions_ and stopped there. The route, the read model and
the tool were all correct; the catalogue underneath them was not. Riverside now
has its 36 units in buildings R and W, Kingsford its 30 in building K, and the
constant is deleted rather than deprecated — one that is correct for a single
project and silently wrong for every other is not a thing to leave lying about
with a comment on it.

Nine tests across the two: no window may count more meetings than its project
has, three projects must have three different sales plans, and every unit code
on a project's list must match that project's buildings.

**One screen, two windows, one name.** The Sales Flow summary offers Today /
This week / This month, and the chart beneath it carries calendar buckets with
the same words. The summary's windows are _rolling_ — thirty days back from
tonight — so the page read "This month: 41" in the summary and "This month: 32"
in the chart, three inches apart, both correct and neither reconcilable by
anybody looking at them.

A rolling window is a perfectly good thing to offer. Calling it a calendar
month is not. They are "Last 7 days", "Last 30 days", "Last 91 days" now, and
an end-to-end test asserts no word but "Today" names both a rolling window and
a calendar bucket on the same page. The test was checked against the defect: it
fails when the old label is put back.

**One rejected variable disabled every other one.** The environment was parsed
in a single call, and `parsed.success ? parsed.data : Schema.parse({})` threw
the whole object away when any one field failed. A mistyped `SUPABASE_URL`
would therefore make a correctly configured `OPENAI_API_KEY` report as absent,
and _absent_ and _invalid_ are indistinguishable from outside — so whoever is
debugging goes and checks the wrong variable, on a deployment nobody can shell
into.

Each variable is validated on its own now. A rejected one is named, its default
applies, and nothing else is touched. The validator's own message is
deliberately not repeated: Zod echoes what it received on an enum mismatch, and
this file reads variables that must never be echoed. One test sets a key, a bad
flag and a password-bearing URL, and asserts that none of the three appears in
the report.

Found while diagnosing the environment-variable scoping below, and it is the
reason that diagnosis can now be trusted: the second build reported _absent_
with no rejection message beside it, which rules out a bad value.

## Known limitations

**Prose paraphrase is not detected generally.** The composer drops identical
restatements from two tools, and the tool above no longer produces a paraphrase
of itself, but nothing catches an arbitrary paraphrase across two tools.
Separating one from two genuinely different findings that share vocabulary —
"Gallery opened in 56% of meetings" beside "Compare opened in 56% of meetings" —
needs to know which word is the subject, and guessing at it drops real content.
`findAnswerDefects` manages it on a model's answer because it works on terse
finding labels, where the whole label is the subject. Prose is not that.

## The environment variables, and where they went

`OPENAI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY` were set in Vercel.
Two consecutive Preview builds report all three as absent:

    [observer] supabase: browser not configured, server not configured
    [observer] ai: enabled · key absent · text gpt-5.6-sol …

That is the deployment's own startup log, and the second of those builds carries
the per-variable validation above — so a present-but-rejected value would have
named itself, and none did. The variables are not in the process at all.

Confirmed independently at the other end: a question asked through the Preview
answered from the deterministic composer, and `observer.ai_requests` and
`observer.ai_rate_buckets` both stayed at zero rows. If `SUPABASE_SECRET_KEY`
had been present the audit row would have been written whether or not a model
answered.

A Vercel environment variable is saved against a set of environments —
Production, Preview, Development. One saved for Production alone is invisible to
preview deployments, which is exactly what the builds report. It cannot be
inspected or corrected from here: the Vercel connector exposes no
environment-variable tool and there is no CLI on this machine.

### What the Supabase connector can and cannot do

Asked to configure the two variables from the Supabase connector, and it cannot.
`get_publishable_keys` returns exactly what its name says: the modern
publishable key and the legacy `anon` JWT, both browser-safe by design. There is
no tool that returns a secret or service-role key, and there should not be — a
connector able to export server credentials is an exfiltration channel with a
friendly name.

The project URL is not a secret and is stated in full:
`https://jtvqecusxzogqubxpoyf.supabase.co`.

### The workaround, and why it was not taken

The publishable key _could_ be made to work: grant `execute` on
`observer.consume_ai_quota` to `anon` and let the browser-safe key call it. The
function is `security definer`, so the tables would stay unreadable.

It is refused because the caller supplies the ceilings. Anyone holding the
publishable key — which is in the browser bundle by definition — could pass
`p_per_minute => 1000000` and be unbounded, which is the opposite of the
feature. Moving the ceilings into a table inside the function fixes that and
leaves the second problem: a public caller can still consume the project's daily
budget deliberately and lock the demonstration out of its own limiter.

A ceiling that anybody may call is not a ceiling. The secret key stays a server
credential, and the configuration step stays a human one.

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

## Addendum — 2026-08-25

Two things above are now history, and are left standing because an ADR records
what was decided when, not what turned out later.

**The OpenAI key works.** The malformed value was replaced. The Preview answers
in the model's own words as `gpt-5.6-sol`, with `live: true` beside the answer
and a read tool in the transcript.

**The Supabase project changed.** The URL stated above,
`https://jtvqecusxzogqubxpoyf.supabase.co`, is not the one the deployment
reaches. The Supabase–Vercel integration supplies `SUPABASE_URL` for the project
_it_ is linked to and overrides hand-set values on every sync, so the Preview
was calling `tfcchobwobpadenampyh.supabase.co` — a live project outside the
account these tools could see. The schema was moved to that project rather than
the variable to this one; `IRIS OBSERVER` (`tfcchobwobpadenampyh`, eu-west-1) is
the official Preview database. Nothing was deleted.

**The workaround above still stands.** Granting `execute` to `anon` was
reconsidered during the move and rejected again for the same reason. The
counters are reachable only through `security definer` façades in `public`, and
verification on the running project confirms even `service_role` cannot read
`observer.ai_rate_buckets` directly — only the function can.

## Addendum — 2026-08-25, later: the audit told two lies

Both were found by verifying the deployment rather than reading the code, which
is the argument for doing it at all.

**It could not say who wrote the prose.** `outcome` was `answered` whenever an
answer existed, and `model` held the configured model's name whether or not that
model had written a word. So a deterministic fallback — which the answer sheet
labels honestly as "written by the tools" — was recorded as
`answered · gpt-5.6-sol`. ADR-0024 exists to keep exactly one claim honest, and
the durable record of that claim was wrong. The screen and the audit now derive
`live` and `model_authored` from the same value, and a test asserts they agree
on every branch rather than trusting that they will.

`response_source` takes one of four values — `model`, `deterministic_composer`,
`refusal`, `failure` — and `author_model` is null unless a model wrote the final
prose. What was attempted is kept under an accurate name, `attempted_model`,
because it is a useful fact and was never the same fact.

**It lost requests.** 153 admitted on the Preview, 133 recorded. The obvious
cause was the unawaited `void recordAudit(...)` — a serverless instance may
freeze once it has responded — but a hypothesis is not a fix, and awaiting the
same call would only have narrowed the window. The invariant is structural now:
the row is inserted in the _same transaction_ that consumes the quota, so a
request cannot be admitted without leaving a trace. The terminal result is
awaited separately, and a request interrupted before it arrives stays visible as
`started` rather than vanishing.

One consequence worth stating: a refused request has no audit row at all, and
should not. The ceiling declines before any work happens, so admitted-request
and audit-row counts are the same number — which is what makes reconciling them
meaningful instead of a comparison of two unlike things.

**The `observer_whoami` diagnostic left the browser.** It is revoked from `anon`
and `authenticated` and kept for the server key, which still calls it to tell a
wrong-key 401 apart from a wrong-project 404 — the failure this milestone spent
five rounds on. The two superseded façades, `consume_ai_quota` and
`record_ai_request`, are dropped rather than left unreachable: two doors to the
same counters is the drift this codebase avoids.

## Addendum — 2026-08-25, third: what static review caught

The audit rebuild above was reviewed before it was applied, and four of its
claims did not survive. None had reached a database, which is the argument for
reviewing a migration rather than a deployment.

**It would have dropped façades that live deployments still call.** The
reasoning had been "Production has not been promoted, so nothing calls them" —
true, and beside the point. Vercel keeps every build it has ever made reachable
at its own URL, and twelve Preview deployments of this branch were READY, each
calling `consume_ai_quota` and `record_ai_request` by name. The change now ships
as expand-and-contract: nothing is removed until an empirical check —
`select max(occurred_at) ... where audit_version = 1` — shows nobody is writing
through the old door.

**It would have rewritten history.** `add column state ... default 'started'`
turns every completed historical request into an interrupted one, and
`model_authored boolean not null default false` claims a model demonstrably did
_not_ write those answers. Neither is true and neither is recoverable: the fact
was never recorded. Historical rows are back-filled as `audit_version` 1,
`state` complete, `completed_at` drawn from `occurred_at`, and authorship
**null** — unknown, which is the honest value and the one the whole migration
exists to protect.

**Admission was not retry-safe.** It consumed quota and _then_ inserted
`on conflict (request_id) do nothing`, so a repeated id spent a second unit of
the daily budget while leaving one row — making unequal the two numbers this
work exists to keep equal. The order is now lock, look, then spend, and a
repeat returns `duplicate_request` having consumed nothing.

**Completion was not write-once.** It updated any matching row, so a retry
rewrote a completed record and moved `completed_at`. Only a `started` row now
becomes terminal; an exact retry is ignored without touching a stored value; a
conflicting second result is refused and logged.

Two smaller corrections. The audit contract is enforced by nine named check
constraints rather than by convention. And `telemetrySubject` — an unkeyed
`sha256(userId)` over a handful of guessable ids, used as both a rate-limit
bucket key and a durable audit column — is now a keyed HMAC. Its key comes from
`OBSERVER_SUBJECT_PEPPER`, or is derived from the Supabase credential under a
fixed label so that it stays identical across every instance of a deployment. A
per-process key would have turned the distributed ceiling back into a
per-instance one, silently, which is why the boot line now says when that is
what a deployment has.

One sentence in the addendum above is therefore wrong and is left standing as
written: the superseded façades are _not_ dropped by that migration. They are
dropped by `20260826090000`, later, on evidence.

## Addendum — 2026-08-26: the expand migration met review

`20260825205000` is applied to the live database and is immutable from here.
Three findings against it are corrected by `20260826120000`, forward-only.

**"Exact retry" compared the wrong half of the row.** `complete_ai_request`
tested the eight provenance fields and none of the five persisted metrics, so a
second completion with the same provenance and different usage was answered
`duplicate_ignored` — the caller told nothing had changed when two executions
had disagreed about what the request cost. The behaviour script did not catch it
because its conflicting example also changed the response source, the authorship
and the fallback reason; a test that varies five things at once cannot say which
one was noticed. The comparison now covers every persisted terminal field, with
the same normalisation the first write used.

**The durable pseudonyms were stable across tenants.** `telemetrySubject` hashed
the viewer alone and one pepper serves the whole deployment, so a sales agent
working for two developers wrote the _same_ subject into both tenants' audit
rows, and the same browser wrote the same `client_hash`. Anybody holding the
table could follow a named person between customers — the correlation ADR-0023's
tenancy model exists to prevent, built into the one table meant to hold nothing
identifying.

Both are now scoped by the canonical tenant id the repository returns _after_
authorising the viewer, never by the slug in the request body: a caller who
chooses the scoping input chooses not to be scoped.

The per-client hourly ceiling keeps a _global_ fingerprint, because catching one
browser across two tenants is that ceiling's entire purpose. It lives only in
`ai_rate_buckets`; the durable row keeps the scoped one. How long it survives
there is a monitored operational property rather than a guarantee — a 48-hour
deletion threshold applied hourly by one `pg_cron` job, so roughly 49 hours
while that scheduler is healthy and indefinitely if it stops. Two earlier
versions of this sentence said "which is pruned" and "which is bounded"; neither
was true. See `docs/18-deployment.md`.

**`key_id` named the secret, not the derivation.** Tenant-scoping changed every
pseudonym while leaving the pepper untouched, so two rows could carry one key id
and incomparable subjects. `pseudonym_version` is added beside it and required
of every version-2 row. The live database held **zero** version-2 rows when this
was written — 133 rows, all version 1, verified read-only — so nothing needed
reclassifying, and the back-fill is written anyway.

Two smaller corrections, both found by the tests rather than by reading. The
constraint was first written as `pseudonym_version in (1, 2)`, which is NULL
when the column is NULL and therefore _passes_ — three-valued logic turning a
required field into an optional one. And the new parameter was `smallint`, which
PostgREST could never have matched: it sends a JSON number as `int4` and resolves
by argument type, so every request would have answered `PGRST202`.

Finally, `20260825205000` checks for its constraints by `conname` alone, and
constraint names are not globally unique. It is applied and stays as it is;
`20260826120000` scopes its own check by `conrelid` and this addendum records
which migration remains immutable.
