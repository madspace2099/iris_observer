# ADR-0031 — An account chooses its model and its ceiling

**Status:** accepted
**Date:** 2026-08-31
**Branch:** `feature/observer-reference-parity`
**Builds on:** ADR-0030, which moved the credential to the account

## Context

ADR-0030 moved the credential to the account. It left two things unanswered.

The first is which model the credential is spent on. `OPENAI_TEXT_MODEL` chose
one for the whole deployment, so every account asked with whatever the operator
had configured — a reader paying for their own questions could not ask a cheap
model a cheap question, and could not ask a deep one for a report worth the
money.

The second is how much. A credential with no ceiling is an open tab. Observer
could spend an account's money until the vendor stopped it, and the first the
reader knew of it was the vendor's invoice.

A third arrived mid-milestone and was then withdrawn: a reader who wants to
compare vendors. The first draft of this decision shipped seven models across
five vendors. Four of those vendors had never been reached by any request, and
every number attached to them — price, base URL, model identifier — was a
considered placeholder. That is recorded here rather than quietly rewritten,
because the reasoning matters: a budget computed from invented prices is not a
budget, and labelling it "unverified" on the screen does not make the arithmetic
behind it any more real.

## Decision

**A server-owned catalogue names every model. An account picks from it, and sets
a monthly ceiling in dollars.**

Three models, one vendor: `gpt-5.6-luna`, `gpt-5.6-terra` and `gpt-5.6-sol`,
priced from OpenAI's published rates read on **2026-08-31** at
<https://developers.openai.com/api/docs/models>. The date and the source are
recorded in the catalogue beside the figures, because "verified" decays: a
vendor can change a price the afternoon after somebody checks it, and a check
nobody has repeated for a year is not meaningfully a check. `PRICE_RECHECK_AFTER_DAYS`
turns that from a sentiment into a gate — `catalogueReadyForProduction()` goes
false when the reading ages out.

The interface stays provider-neutral. `ProviderId`, `Transport` and the provider
record all remain, so a second vendor is a catalogue entry plus a transport
rather than a refactor. What is gone is any vendor that can be **selected or
routed to** before somebody has checked its numbers.

Nothing about the catalogue comes from the browser. A per-question model
override is validated against it and then checked against what the account
actually holds a key for.

## Money is an integer, and it is claimed before it is spent

Every amount is an integer number of micro-dollars. No float touches money at
any point: the only floating-point value in the feature is the number a reader
types into the budget field, and it is converted at the boundary. Every
conversion multiplies before it divides and rounds **up**, so a rounding error
can only ever favour the reader's ceiling.

Cached input is priced separately, at a tenth of the fresh rate, and counted as
a **subset** of the input tokens rather than as an addition — charging list
price for tokens the vendor discounted is simply wrong.

## Five states, because "in flight" is not one thing

    reserved    money held; nothing has been sent.
    dispatched  the request is with the vendor. It may already have cost money.
    settled     the real cost is known and recorded.
    released    never dispatched, so nothing was spent. Charge nothing.
    uncertain   dispatched, and the outcome never came back.

The distinction that matters is the last two. The first draft released a hold
whenever a request failed. From inside a `catch` block, "never sent" and "sent
and never heard from" look identical — and they are opposite in what they mean
for money. A request that reached OpenAI may have run to completion and been
billed there whatever this process managed to observe, so handing the hold back
would tell a reader they have money they have already spent.

So a dispatched hold cannot be released. The ledger refuses, in SQL and in the
harness, and returns what it actually did rather than nothing; the honest
resolution is `uncertain`, which charges the reserved amount in full and records
it as an unconfirmed charge a person can reconcile against the vendor's invoice.
Expiry applies the same rule: a stale reserved hold is refunded, a stale
dispatched one is charged.

## A reservation is the worst case for the actual request

Not an average and not a typical figure: the most this request can cost if every
bound it is allowed is reached. Three bounds, and two of them vary per request —
the **measured** size of what is being sent, the per-turn output cap this
deployment imposes, and the number of model turns the agent may take. Tool
results are counted once, at their allowed ceiling, because they land in the
composing turn's input.

A cache hit is never assumed. It makes a request cheaper than reserved, which
corrects itself at settlement; assuming one makes the reservation too small,
which does not.

Nothing substitutes a cheaper model to make a question fit. The reader chose; a
budget that quietly downgrades the answer is not a budget, it is a surprise.

## Every entry carries the rates it was priced with

Not merely the catalogue version — the three rates themselves, on the row. A
price change must not retroactively rewrite what last month cost, and a version
string alone would only tell a reader which file to go and read.

## The long-context band is refused, not guessed at

OpenAI prices input above 272,000 tokens differently. This catalogue carries the
ordinary band only, so a request past that boundary would be reserved and
settled at rates that do not apply to it — an under-charge here against a real
charge on the reader's bill, which is the exact failure a budget exists to
prevent. Rather than carry a second rate table nobody has exercised, Observer
enforces `MAX_REQUEST_INPUT_TOKENS`, well below the boundary, and refuses a
larger request before any money is held.

## The ceiling carries; the spending resets

The period is a UTC month, computed from UTC and stored on the row. Not the
reader's local month: two people in one account in different time zones would
otherwise disagree about which month a question belonged to.

A ceiling is a standing decision and carries into the new month. Spending is
what resets. Both doors — reading the figure and reserving against it — apply
the same carry, because for a while only one of them did and a reader opening
the settings page on the first of the month was told no budget was set while a
question asked in the same minute went through on the ceiling they had chosen.

## Exhausted means "nothing more can be asked"

The threshold is judged against what one more question would cost **for the
model this account actually uses**, which the caller knows and the ledger does
not — so it is a parameter with no default. A version that defaulted to the
cheapest model in the catalogue reported "80% or more" to an account whose every
question was already being refused, because some other model would still have
fitted. The percentage was true and the label was misleading, which is the worse
of the two failures: a reader plans around the label.

## A refusal says which refusal it is

There are seven reasons no model may answer, and a reader can act on five. They
used to arrive as one boolean, so an account that had spent its monthly budget
was told it had no OpenAI connection and sent to add the key it was already
using. `ModelBlock` names them, survives the redaction that strips everything
else, and the answer sheet offers the link that matches.

## Voice is refused locally, and cannot be switched on

Realtime voice is **not** part of this decision, and the refusal is now
structural rather than a flag.

`lib/ai/voice.ts` used to construct an OpenAI client and mint a realtime client
secret. It was the one AI path that did not go through the injectable transport,
which meant the synthetic browser harness — whose entire guarantee is that
nothing leaves the machine — would have made a real HTTPS request to
api.openai.com carrying a fake `sk-observer-test-…` key the moment anybody
pressed a microphone.

The vendor SDK import is gone from that module rather than guarded, because a
guard is something a later edit can step around and a missing dependency is not.
`voiceBlocker()` answers `not_built` whatever the environment says, so no
deployment can open the door by setting a variable. `apps/web/test/no-egress.test.ts`
proves all of it three ways: a `fetch` recorder that fails loudly, a search of
everything handed to `fetch` for the synthetic key, and a static sweep of every
module under `lib/ai` and `app/api` for a vendor SDK import or a hard-coded
vendor URL.

Realtime audio is also not billed at the text-token rates in this catalogue, so
metering a spoken session against a reader's budget would put a number on their
screen unrelated to their bill. Voice needs its own pricing as well as its own
transport, and both belong to M0.5.

## What this does not do

It does not prove the migration against a hosted Supabase project. It is
executed on every test run against PostgreSQL compiled to WASM, which is what
makes the grant assertions real answers rather than readings of SQL text —
applying it to a deployment remains an open prerequisite.

## Consequences

An account with no ceiling gets evidence-only answers, because a budget that
cannot be enforced must not be pretended. That is the same fail-closed direction
ADR-0030 chose for a missing credential, for the same reason: spending money
because the meter is broken is the wrong way to fail.

An account whose request outcome is lost keeps the charge. That is the
uncomfortable half of the same principle, and it is deliberate: the alternative
gives back money the vendor has already taken.
