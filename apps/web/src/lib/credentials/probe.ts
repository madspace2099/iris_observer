import "server-only";

import OpenAI from "openai";

import { environment } from "@/lib/env";
import { resolveServerSupabase, type EnvSource } from "@/lib/supabase-env";
import { isSyntheticCredential, testStorePermitted } from "./test-store";
import { LIMITS } from "@/lib/ai/limits";
import type { ConnectionProbe, ProbeResult } from "./service";

/**
 * THE ONE REQUEST A CONNECTION TEST MAKES.
 *
 * A single call to the model Observer actually asks with, capped at a handful
 * of output tokens. It is the smallest thing that can distinguish all six
 * failures a reader might be in:
 *
 *   401 / 403                  the key is wrong or revoked
 *   404 / model_not_found      the key works; the project cannot reach the model
 *   429                        rate limited
 *   insufficient_quota         valid key, no credit
 *   anything else / network    the provider did not answer
 *   success                    connected
 *
 * `models.retrieve` would be free and would catch the first two. It cannot see
 * a balance, and "connected" that turns into "no credit" on the reader's first
 * real question is a worse outcome than a request costing a fraction of a
 * penny. The screen says so before the button is pressed.
 *
 * ## What it returns
 *
 * A status and a short vendor code. Never the error object, never the message,
 * never a header. `failure.ts` maps the pair to one of six fixed sentences, and
 * that mapping is the only thing a reader or an audit row ever sees.
 */

/** Deliberately tiny. This proves reachability, not capability. */
const PROBE_MAX_OUTPUT_TOKENS = 16;

/**
 * THE OFFLINE PROBE, FOR THE SUITE AND A LOCAL REVIEW.
 *
 * Reachable only where the in-memory credential store is — its flag, and not in
 * production — so a deployment cannot fall into it. It makes no network call at
 * all: the verdict is read out of the obviously-fake key itself, so a reviewer
 * can photograph every error state and a browser test can assert them without
 * a single request leaving the machine.
 *
 *   Anything not matching `SYNTHETIC_CREDENTIAL` is refused outright.
 *
 *   ...-reject   the key is refused          401
 *   ...-quota    valid key, no credit        insufficient_quota
 *   ...-spend    a spending cap reached      billing_hard_limit_reached
 *   ...-limit    rate limited                429
 *   ...-model    model not entitled          404
 *   ...-down     provider unreachable        0
 *   anything else                            accepted
 */
function scriptedProbe(): ConnectionProbe {
  return (apiKey: string): Promise<ProbeResult> => {
    /*
     * A real-looking credential is refused here too, not only by the store.
     * Two independent refusals, because this one is the last thing standing
     * between a pasted production key and a network call — and it makes no
     * call at all, whatever it is handed.
     */
    if (!isSyntheticCredential(apiKey))
      return Promise.resolve({ ok: false, status: 401, code: null });
    if (apiKey.includes("reject")) return Promise.resolve({ ok: false, status: 401, code: null });
    if (apiKey.includes("quota"))
      return Promise.resolve({ ok: false, status: 429, code: "insufficient_quota" });
    if (apiKey.includes("spend"))
      return Promise.resolve({ ok: false, status: 429, code: "billing_hard_limit_reached" });
    if (apiKey.includes("limit")) return Promise.resolve({ ok: false, status: 429, code: null });
    if (apiKey.includes("model"))
      return Promise.resolve({ ok: false, status: 404, code: "model_not_found" });
    if (apiKey.includes("down")) return Promise.resolve({ ok: false, status: 0, code: null });
    return Promise.resolve({ ok: true });
  };
}

/**
 * Which probe this server uses.
 *
 * The same three conditions the memory store needs, checked the same way and
 * for the same reason: a harness that can activate in production is not a
 * harness. A deployment with Supabase configured never reaches the scripted
 * one, whatever else is set.
 */
export function probeFor(source: EnvSource = process.env): ConnectionProbe {
  /*
   * The same predicate the store uses, so the two can never disagree: a server
   * that holds only synthetic credentials must not be able to call OpenAI, and
   * a server that holds real ones must never answer from a script.
   */
  return resolveServerSupabase(source) === null && testStorePermitted(source)
    ? scriptedProbe()
    : openAiProbe();
}

export function openAiProbe(): ConnectionProbe {
  return async (apiKey: string): Promise<ProbeResult> => {
    const env = environment();

    /*
     * Built here, used once, dropped. Not cached and not module-level: a cached
     * client is a cached credential, and this function is called with a
     * different account's key every time it runs.
     */
    const client = new OpenAI({
      apiKey,
      maxRetries: 0,
      timeout: LIMITS.requestTimeoutMs,
    });

    try {
      await client.responses.create({
        model: env.ai.textModel,
        input: "ok",
        max_output_tokens: PROBE_MAX_OUTPUT_TOKENS,
      } as never);
      return { ok: true };
    } catch (error) {
      /*
       * Two fields, both short and both from a closed vocabulary the SDK
       * defines. The message, the parameter, the request id and the body are
       * all deliberately left behind — an upstream message can quote the
       * request back, and the request carried the credential.
       */
      if (error instanceof OpenAI.APIError) {
        return {
          ok: false,
          status: error.status ?? 0,
          code: typeof error.code === "string" ? error.code : null,
        };
      }
      return { ok: false, status: 0, code: null };
    }
  };
}
