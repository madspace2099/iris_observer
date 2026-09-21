import "server-only";

import { modelFor, TransportFailure } from "@/lib/providers/transport";
import type { ModelId } from "@/lib/models/catalogue";
import type { EnvSource } from "@/lib/supabase-env";
import type { ConnectionProbe, ProbeResult } from "./service";

/**
 * THE ONE REQUEST A CONNECTION TEST MAKES.
 *
 * A single call to the model the account will actually ask with, capped at a
 * handful of output tokens. It is the smallest thing that can distinguish the
 * conditions a reader might be in:
 *
 *   401 / 403                  the key is wrong or revoked
 *   404 / model_not_found      the key works; this account cannot reach the model
 *   429                        rate limited
 *   insufficient_quota         valid key, no credit
 *   anything else / network    the provider did not answer
 *   success                    connected
 *
 * ## Through the same transport that answers questions
 *
 * It used to build an OpenAI client directly, with the deployment's model name,
 * for every provider — so testing an Anthropic key sent it to OpenAI, and the
 * rejection that came back was reported to the reader as a bad key. Going
 * through `modelFor` means the probe reaches the vendor the model belongs to,
 * speaks that vendor's protocol, and fails in the same way a real question
 * would. A test that does not exercise the real path is a test of the test.
 *
 * It also inherits the transport's one absolute rule: under the browser
 * harness `modelFor` returns the scripted model, which makes no network call
 * whatever it is handed. The verdict then comes out of the obviously-fake key
 * itself, so every failure state is reachable offline and nothing leaves the
 * machine.
 *
 * ## What it returns
 *
 * A status and a short vendor code. Never the error object, never the message,
 * never a header. `failure.ts` maps the pair to one of seven fixed sentences,
 * and that mapping is the only thing a reader or an audit row ever sees.
 */

/** Deliberately tiny. This proves reachability, not capability. */
const PROBE_MAX_OUTPUT_TOKENS = 16;

export function probeFor(source: EnvSource = process.env): ConnectionProbe {
  return async (apiKey: string, model: ModelId): Promise<ProbeResult> => {
    try {
      /*
       * Built here, used once, dropped. Not cached and not module-level: a
       * cached client is a cached credential, and this runs with a different
       * account's key every time.
       */
      await modelFor(model, apiKey, source).respond({
        instructions: "Reply with the word ok.",
        messages: [{ role: "user", content: "ok" }],
        tools: [],
        maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
        reasoningEffort: "low",
        /*
         * No schema, no tools, and an identifier that names the probe rather
         * than a person: this request carries no evidence and belongs to no
         * viewer, so there is nothing about it worth pseudonymising.
         */
        safetyIdentifier: "observer-connection-probe",
        responseSchema: null,
      });
      return { ok: true };
    } catch (error) {
      /*
       * Two fields, both short and both from the vendor's own closed
       * vocabulary. The message, the parameter, the request id and the body are
       * all deliberately left behind — an upstream message can quote the
       * request back, and the request carried the credential.
       */
      if (error instanceof TransportFailure) {
        return { ok: false, status: error.status, code: error.code };
      }
      return { ok: false, status: 0, code: null };
    }
  };
}
