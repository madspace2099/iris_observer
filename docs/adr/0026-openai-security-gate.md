# ADR-0026 — The OpenAI security gate

**Status:** accepted (controls landed); **the gate does not yet pass** — see _Blocked_ below
**Date:** 2026-08-25
**Extends:** ADR-0024 (the model boundary)

## Context

Observer's answers now come from a paid third-party API. That changes the threat
model in three ways at once: there is a secret worth stealing, there is a bill
worth running up, and there is project evidence leaving the building on every
request.

## Decisions

**The key exists only as `process.env.OPENAI_API_KEY`, read inside a module
guarded by `server-only`.** Never `NEXT_PUBLIC_`, never a constructor argument
from a client component, never a command-line argument, never in a fixture.
`.env.example` carries the name with an empty value and nothing else.

**Errors are sanitised at the boundary.** The provider raises an operator
sentence that names the failure — no quota, revoked key, model unreachable —
because those are three different problems with three different fixes. The route
replaces it with one fixed sentence before it reaches the browser:

> AI explanation is temporarily unavailable. Showing computed Observer evidence
> instead.

The upstream body is never forwarded: an API error can quote part of the request
back, and the request carries project evidence.

**The request is metered before it costs anything.** Authentication, then shape,
then allowance, then the meter — so a refused request never spends a tool call,
a token or a counter, and an anonymous caller cannot move anyone's quota. Every
ceiling is configurable in `apps/web/src/lib/ai/limits.ts`.

**The breaker pauses the vendor call, not the request.** After repeated upstream
failures the calls stop, and the request still returns: the tools, the read
models and the evidence never needed the network. An earlier version of this
refused the whole request while the breaker was open and threw away an answer it
had already computed — which is the opposite of failing safe.

**`store: false` on every call, and no Conversation objects.** Observer's durable
memory belongs in a store this product can enumerate and empty.

**No voice.** GPT-Realtime is not implemented, so no microphone control is
rendered and no ephemeral token endpoint exists. When it is built, the permanent
key stays on the server and the browser receives only a short-lived client
secret. A decorative microphone that does nothing is worse than none.

## What is honest about the rate limiter

The counters live in the process. On a serverless platform each instance has its
own, so a per-minute ceiling of ten is ten _per running instance_, not ten
globally — this codebase already shipped an in-memory session table and watched
it fail exactly that way (ADR-0022 amendment).

It is a real brake on a single client hitting a warm instance. It is **not** a
global spend cap. The global cap is the spending limit configured on the OpenAI
project, which is the only ceiling that cannot be bypassed by starting another
instance. **Both are required.** Setting the project limit is an operator task
that no code in this repository can perform.

## Two bugs the gate's own tests found

`recordAttempt` incremented only a meter that `checkAllowance` had already
created, so any path recording an attempt without checking first left the
viewer's allowance untouched. A counter that silently declines to count is worse
than no counter, because it reports success.

The breaker refused the request rather than the call, as above.

## Key rotation

A key pasted into a chat transcript, a terminal, a screenshot or a tracked file
is compromised, and no amount of subsequent care makes it uncompromised. It must
be revoked and replaced at the provider, not merely deleted from the file it
landed in.

`pnpm audit:secrets` scans the working tree, the staged diff, the branch's own
history and the built browser bundle. It reports a filename, a line and the rule
that fired — **never the match**, because printing a secret to prove a secret
leaked is the same leak again, somewhere more people read.

## Blocked

The gate cannot be signed off while `apps/web/src/lib/ai/agent.ts` does not
compile against the current `provider.ts`. The controls below must survive that
reconciliation, and `apps/web/test/ai-security.test.ts` fails if they do not:

- the tool allowlist filter (`TOOL_NAMES.includes`) applied to the parsed plan;
- the per-turn cap (`LIMITS.maxToolCalls`);
- per-tool argument validation (`tool.input.safeParse`);
- the output ceiling (`LIMITS.maxOutputTokens`);
- `recordUpstreamFailure()` / `recordUpstreamSuccess()` around every model call.
