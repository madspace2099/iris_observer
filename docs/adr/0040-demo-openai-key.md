# ADR-0040 — A demonstration key for a local recording, and nowhere else

**Status:** accepted · **Date:** 2026-10-19
**Amends:** ADR-0030 (keys belong to accounts) for one local case
**Amended by:** ADR-0043 (the key is spent only on a request whose `Host` is the loopback)
**Keeps:** ADR-0024 and ADR-0033 (the screen names what wrote the words), ADR-0026 (store=false,
no hosted tools), ADR-0022 (the sign-in is a demonstration, not authentication)

## Context

The product owner asked for a working local demonstration he can screen-record: a developer signs in,
asks Ask IRIS a question in their own words, and the answer is worded by a language model on his own
OpenAI key. ADR-0030 gives every key to an account and keeps it encrypted in Supabase; a local machine
running the synthetic world has no Supabase, so no account on it can hold a key, and every typed
question is answered in the read models' own prose. That remains the correct posture everywhere a
reader other than the owner can reach.

## Decision

1. **One variable, read in one file.** `OBSERVER_DEMO_OPENAI_KEY`, with an optional
   `OBSERVER_DEMO_OPENAI_MODEL` (default: the catalogue's recommended model's `apiIdentifier`), read
   only by `demoModelAccess` in `apps/web/src/lib/env.ts`. `credentials.test.ts` fails if any other
   source file names it.
2. **Honoured only when all three hold.** The synthetic account directory is on
   (`OBSERVER_DEMO_ACCOUNTS=1`); `OBSERVER_ENVIRONMENT` is `development` (unset reads as development)
   or the synthetic harness flag is set; and no deployment platform's marker is present
   (`deployment-markers.ts`, the same list the session secret and the credential test store obey).
   Any one missing, and the key is ignored and the boot report says which condition refused it.
3. **What it changes.** `/api/ask/stream` skips the account's admission and the budget ledger — the
   key belongs to no account and no budget — and hands the agent the key and the model. The gate, the
   pepper, the shared and in-process ceilings, the tool allowlist, the schema and causal guards and
   the audit row are all unchanged. The JSON route is unchanged.
4. **What it never does.** It is never logged, never serialised, never sent to a browser and never
   stored. The boot report names the variable and the model, never the value.
5. **Absent means as before.** With no key, or a refused one, every question is answered by the
   deterministic path exactly as it was: the same tools, the same figures, the read models' prose.
   The recording does not depend on the key.
6. **The screen says what wrote the words.** The answer names the model only when the outcome says a
   model wrote it (`status.live`); otherwise it says "Read models". (Amended 2026-10-23: the owner
   removed the composer's notice for the local demonstration; the answer's author line, which names
   the model on `status.live`, now carries `data-ai-notice`. See the 2026-10-23 entry under Gate 1
   in docs/11-preproduction-gates.md.)

## Why it cannot reach a deployment

Every hosting platform this product has been or could be deployed to sets a marker variable that an
`.env` file cannot unset (`VERCEL`, `AWS_REGION`, `K_SERVICE`, …). Copying the three lines into a
hosted project therefore yields a deployment that ignores the key. A deployment also refuses the
synthetic directory unless it is switched on deliberately, and with it off the key is ignored again.

## Consequences

- The owner can record a live answer locally on his own key without connecting Supabase.
- A transport fix rides with it: chat completions now send `max_completion_tokens` (current OpenAI
  models refuse `max_tokens`), and `reasoning_effort` only to the reasoning families that accept it.
- When accounts can hold keys locally, or the recording is done, the variable can simply be removed;
  nothing else reads it.
