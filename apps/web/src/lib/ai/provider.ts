import { z } from "zod";

/**
 * The language-model boundary.
 *
 * Provider-neutral on purpose: the application asks for prose about evidence it
 * has already computed, and which vendor writes that prose is a deployment
 * decision, not an architectural one. Swapping providers must not touch a
 * single tool, read model or component.
 *
 * **This module is server-only.** `FAL_KEY` is read from the process
 * environment and never prefixed with `NEXT_PUBLIC_`; a test asserts that no
 * client bundle can reach it.
 */

import "server-only";

export interface LlmRequest {
  readonly system: string;
  readonly prompt: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface LlmResponse {
  readonly text: string;
  readonly model: string;
  readonly provider: string;
  /** Present when the provider reports usage. Recorded, never displayed. */
  readonly usage: { readonly promptTokens?: number; readonly completionTokens?: number } | null;
}

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export class LlmUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "LlmUnavailableError";
  }
}

/* --- fal.ai, OpenRouter route ---------------------------------------------- */

/**
 * The response shape of `openrouter/router` on fal.
 *
 * Validated rather than trusted: this is text arriving from a third party over
 * the network, and the rest of the pipeline treats it as data to be checked.
 */
const FalResponseSchema = z.object({
  output: z.string(),
  reasoning: z.string().optional(),
  error: z.string().nullish(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

const FAL_ENDPOINT = "https://fal.run/openrouter/router";

/**
 * The default model.
 *
 * `google/gemini-2.5-flash` is fal's own documented example on this route: it
 * is multilingual, commercially licensed, cheap enough to sit behind an
 * always-available assistant, and reliable at returning a JSON object when
 * asked for one — which is the only structured output this architecture needs,
 * because the model never computes a figure. Overridable with
 * `OBSERVER_LLM_MODEL`; see ADR-0024.
 */
export const DEFAULT_MODEL = "google/gemini-2.5-flash";

function falProvider(model: string): LlmProvider {
  const key = process.env["FAL_KEY"];
  if (key === undefined || key.length === 0) {
    throw new LlmUnavailableError("FAL_KEY is not set on the server.");
  }

  return {
    id: "fal-openrouter",
    model,
    async complete(request) {
      const response = await fetch(FAL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: request.prompt,
          system_prompt: request.system,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 900,
          // The agent answers from Observer evidence and nothing else. A model
          // that can search the web can contradict the figures on the screen
          // with something it read, and the reader has no way to tell which is
          // which.
          enable_web_search: false,
          reasoning: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new LlmUnavailableError(`fal returned ${response.status} ${response.statusText}.`);
      }

      const parsed = FalResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new LlmUnavailableError("fal returned a response in an unexpected shape.");
      }
      if (
        parsed.data.error !== null &&
        parsed.data.error !== undefined &&
        parsed.data.error !== ""
      ) {
        throw new LlmUnavailableError(parsed.data.error);
      }

      return {
        text: parsed.data.output,
        model,
        provider: "fal-openrouter",
        usage:
          parsed.data.usage === undefined
            ? null
            : {
                ...(parsed.data.usage.prompt_tokens === undefined
                  ? {}
                  : { promptTokens: parsed.data.usage.prompt_tokens }),
                ...(parsed.data.usage.completion_tokens === undefined
                  ? {}
                  : { completionTokens: parsed.data.usage.completion_tokens }),
              },
      };
    },
  };
}

/* --- the deterministic provider --------------------------------------------- */

/**
 * A provider that never makes a network call.
 *
 * Used by the automated tests and by any environment without a key. It is not
 * a mock of the model: it is a real implementation of the same interface that
 * writes plain prose from the evidence it is handed, which is all the model is
 * permitted to do anyway.
 *
 * Tests run against this so the suite is free, offline and reproducible. A test
 * that spends money on every run is a test people delete.
 */
export function deterministicProvider(): LlmProvider {
  return {
    id: "deterministic",
    model: "deterministic",
    complete(request) {
      // The prompt carries a machine-readable block the agent put there; the
      // provider echoes the planned tool call or composes the plain summary.
      const planMatch = /<plan>([\s\S]*?)<\/plan>/.exec(request.prompt);
      if (planMatch?.[1] !== undefined) {
        return Promise.resolve({
          text: planMatch[1].trim(),
          model: "deterministic",
          provider: "deterministic",
          usage: null,
        });
      }

      const draftMatch = /<draft>([\s\S]*?)<\/draft>/.exec(request.prompt);
      return Promise.resolve({
        text: (draftMatch?.[1] ?? "No evidence was returned for this question.").trim(),
        model: "deterministic",
        provider: "deterministic",
        usage: null,
      });
    },
  };
}

/* --- resolution -------------------------------------------------------------- */

export interface ProviderStatus {
  readonly provider: string;
  readonly model: string;
  readonly live: boolean;
  readonly reason: string | null;
}

/**
 * Which provider this deployment uses.
 *
 * Falls back to the deterministic provider rather than failing the request: an
 * assistant that returns "the key is missing" where an answer should be is
 * worse than one that answers from evidence in plainer words. The status is
 * surfaced to the reader either way, because prose written by a model and prose
 * written by a template are not the same thing and the reader should know which
 * they are looking at.
 */
export function resolveProvider(): { provider: LlmProvider; status: ProviderStatus } {
  const configured = process.env["OBSERVER_LLM_PROVIDER"] ?? "fal-openrouter";
  const model = process.env["OBSERVER_LLM_MODEL"] ?? DEFAULT_MODEL;

  if (configured === "deterministic") {
    const provider = deterministicProvider();
    return {
      provider,
      status: {
        provider: provider.id,
        model: provider.model,
        live: false,
        reason: "OBSERVER_LLM_PROVIDER is set to deterministic.",
      },
    };
  }

  try {
    const provider = falProvider(model);
    return {
      provider,
      status: { provider: provider.id, model: provider.model, live: true, reason: null },
    };
  } catch (error) {
    const provider = deterministicProvider();
    return {
      provider,
      status: {
        provider: provider.id,
        model: provider.model,
        live: false,
        reason: error instanceof Error ? error.message : "The model provider is unavailable.",
      },
    };
  }
}
