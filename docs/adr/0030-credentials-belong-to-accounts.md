# ADR-0030 — A provider credential belongs to an account

**Status:** accepted
**Date:** 2026-08-29
**Branch:** `feature/observer-reference-parity`
**Implemented by:** `1dd8f9f`

## Context

Ask Observer ran on `OPENAI_API_KEY`: one credential in the deployment's
environment, read implicitly by the model client and the voice session, shared
by every reader, and impossible to attribute. Every question any account asked
was billed to MADSPACE, and nothing in the system could say who had asked it.

Three things made that untenable at once. A demonstration given to a client
spends the demonstrator's money on the client's curiosity. An ambient key is a
secret every code path can reach, which is how one came to be exported on a
workstation and inherited by a test run that made real, billed calls. And a
product that answers on somebody else's account cannot honestly tell a reader
what their questions cost.

## Decision

**The credential belongs to the authenticated account.**

Not to a project, not to a developer, not to a sales-agent profile, and not to
a browser session. One account holds at most one connection per provider, and
that connection is used for every project the account is authorised to open.

The account identifier comes from the signed session cookie's subject, resolved
server-side. It is never read from a form field, a query string, a header or a
request body — an account id that arrives from the client is an account id the
client chose.

`resolveApiKey(accountId)` is the only function in the application that produces
a plaintext credential. It is called on the request path, its result goes
directly into a request-scoped provider client, and it is not cached, logged,
placed on a context object or returned to anything that could serialise it.

## The ambient key is gone, not deprecated

Nothing on the request path reads `OPENAI_API_KEY`. There is no fallback: an
account with no connection gets evidence-only answers, on a deployment that has
a key sitting in its environment, because answering would spend money the reader
did not agree to spend and no test could tell the two paths apart from outside.

`environment()` reports the variable's presence as a **problem** rather than
ignoring it. A secret nobody reads is a secret nobody rotates.

## What this costs

A reader with no OpenAI account cannot get model-written prose. That is the
honest trade and the interface says so plainly: every measured figure is still
computed and cited, the deterministic composer still writes the interpretation,
and the answer sheet offers the one link that changes it.

## Consequences

Storage had to exist before the feature could: an encrypted per-account store,
a master key that is mandatory with no fallback, and a database in which no
browser role holds a single privilege. That is the subject of the migration
`20260829173000_observer_account_credentials.sql` and is summarised in the
commit rather than repeated here.

Applying that migration to a hosted project, and provisioning
`OBSERVER_CREDENTIAL_KEY` as a managed secret, remain open deployment
prerequisites. Until both exist the settings page says secure credential storage
is not configured and the form is disabled — which is the same thing it says on
a developer's machine, deliberately.
