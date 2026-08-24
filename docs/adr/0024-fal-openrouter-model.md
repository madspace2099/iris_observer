# ADR-0024 — The language model runs through fal.ai's OpenRouter route

**Status:** accepted · **Date:** 2026-08-24
**Constrains:** `apps/web/src/lib/ai/*`

## Context

Ask Observer needs a model to write prose about evidence Observer has already
computed. It does not need a model that can query, aggregate, browse or decide what
counts as evidence — those are the things the tool architecture exists to keep away
from it (ADR-0023).

That makes the choice narrow: a commercially usable, multilingual text model that
reliably returns a JSON object when asked for one, cheap enough to sit behind an
always-available assistant, and reachable without adding a second vendor
relationship.

## Decision

**`openrouter/router` on fal.ai, with `google/gemini-2.5-flash` as the default model.**

- Endpoint: `POST https://fal.run/openrouter/router`, `Authorization: Key ${FAL_KEY}`.
- Request fields: `model`, `prompt`, `system_prompt`, `temperature`, `max_tokens`,
  `enable_web_search`, `reasoning`. Response: `output`, `reasoning`, `error`, `usage`.
- `enable_web_search` is **always false**. A model that can search can contradict the
  figures on the screen with something it read, and the reader has no way to tell
  which is which.
- The model id is configuration, not code: `OBSERVER_LLM_MODEL` overrides it, and
  `OBSERVER_LLM_PROVIDER` selects the provider.

`google/gemini-2.5-flash` is fal's own documented example on this route. It is
multilingual — Slovak, Czech, Hungarian and English all appear in this product's
audience — commercially licensed, and fast and cheap enough that an assistant on
every screen is not a budget decision.

## Why a provider-neutral interface

`LlmProvider` has one method. Which vendor writes the prose is a deployment
decision, not an architectural one, and swapping it must not touch a tool, a read
model or a component. The interface also makes the second implementation possible:

**The deterministic provider.** It makes no network call and writes the tool's own
draft. Tests run against it, so the suite is offline, reproducible and free — a test
that spends money on every run is a test people delete, and one that depends on a
model's mood is one they stop trusting. It also serves any deployment without a key,
and the answer sheet states which provider produced the prose.

## Consequences

- The route returns a plain string rather than native tool-calling, so tool selection
  is a JSON object validated with Zod and filtered against the registered tool names.
  An unknown tool name is discarded; the model does not get to widen its own surface.
- Two calls per question — plan, then write. Both are small.
- A live model's prose is checked for causal wording before it is shown, and the
  deterministic draft is used instead if it fails. A guard, not a request.
- `FAL_KEY` is server-only, never prefixed `NEXT_PUBLIC_`, and a test fails if any
  file reading it is a client component or lacks the `server-only` marker.

## Alternatives rejected

**A direct vendor SDK.** Ties the deployment to one vendor's availability and pricing
for a job any competent model can do.

**Native tool-calling.** Would remove the JSON parsing step, but this route does not
expose it, and the validation layer is needed regardless — a model that names a tool
is not the same as a model that may run one.

**No model at all.** The deterministic drafts are honest but flat, and the product's
promise is explanation in the reader's own language.
