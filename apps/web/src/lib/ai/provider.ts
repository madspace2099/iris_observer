import "server-only";

import OpenAI from "openai";

import { environment, type ReasoningEffort } from "@/lib/env";
import { LIMITS, modelIsAllowed } from "./limits";

/**
 * The language-model boundary.
 *
 * Provider-neutral on purpose: the application asks for prose and tool
 * selection about evidence it has already computed, and which vendor supplies
 * that is a deployment decision, not an architectural one. Swapping providers
 * must not touch a tool, a read model or a component — so nothing outside this
 * file imports the vendor SDK, and the types below are this product's, not
 * OpenAI's.
 *
 * **This module is server-only.** `OPENAI_API_KEY` is read from the process
 * environment, never prefixed `NEXT_PUBLIC_`, and a test asserts that no client
 * bundle can reach it.
 *
 * ## What this layer refuses to do
 *
 * **It does not fall back to another model.** A configured model the account
 * cannot reach is a configuration error, raised as one and shown as one. The
 * alternative — quietly answering from a different model — produces a system
 * whose behaviour nobody can reason about and whose bill nobody can predict.
 *
 * **It does not retry.** A key with no quota fails identically every time, and
 * an automatic retry loop in front of a per-token vendor is a way to spend
 * money at machine speed. One attempt, a bounded timeout, and a circuit breaker
 * in `limits.ts` for the repeated case.
 */

/* --- the neutral vocabulary -------------------------------------------------- */

export interface ModelToolSpec {
  readonly name: string;
  readonly description: string;
  /** JSON Schema. Produced from the tool's Zod schema, never handwritten. */
  readonly parameters: Record<string, unknown>;
}

export interface ModelToolCall {
  readonly callId: string;
  readonly name: string;
  /** Raw JSON text. Parsed and validated by the caller, never trusted here. */
  readonly argumentsJson: string;
}

/**
 * One turn of the conversation, in this product's own terms.
 *
 * `assistant_tool_calls` is a first-class message rather than an opaque vendor
 * blob so that the transcript stays inspectable, testable and portable: the
 * fake provider reads the same shape the OpenAI adapter does.
 */
export type ModelMessage =
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: string }
  | { readonly role: "assistant_tool_calls"; readonly calls: readonly ModelToolCall[] }
  | { readonly role: "tool_result"; readonly callId: string; readonly output: string };

export interface ModelTurn {
  /** The system instruction. Never assembled from anything a user supplied. */
  readonly instructions: string;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ModelToolSpec[];
  readonly reasoningEffort: ReasoningEffort;
  readonly maxOutputTokens: number;
  /** Opaque, stable, hashed. See `identity.ts`. */
  readonly safetyIdentifier: string;
  /** When set, the model must answer with JSON matching this schema. */
  readonly responseSchema: {
    readonly name: string;
    readonly schema: Record<string, unknown>;
  } | null;
  readonly signal?: AbortSignal;
  /** Overrides the configured text model. Used for the fast background path. */
  readonly model?: string;
}

export interface ModelUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
}

export interface ModelTurnResult {
  readonly text: string;
  readonly toolCalls: readonly ModelToolCall[];
  readonly usage: ModelUsage | null;
  readonly model: string;
  /** True when the model stopped because it hit the output ceiling. */
  readonly truncated: boolean;
}

export type ModelStreamEvent =
  | { readonly type: "text_delta"; readonly delta: string }
  | { readonly type: "done"; readonly result: ModelTurnResult };

export interface ObserverModel {
  readonly id: string;
  readonly model: string;
  /** True when a real vendor is on the other end. */
  readonly live: boolean;
  respond(turn: ModelTurn): Promise<ModelTurnResult>;
  streamRespond(turn: ModelTurn): AsyncIterable<ModelStreamEvent>;
}

/* --- failures ---------------------------------------------------------------- */

/**
 * The deployment is wrong, and no retry will fix it.
 *
 * A missing key, a model the account cannot reach, a model this deployment
 * refuses to call. Distinguished from an outage because the operator response
 * is completely different and because this class must never be papered over
 * with a substitute model.
 */
export class ModelConfigurationError extends Error {
  readonly kind = "configuration" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "ModelConfigurationError";
  }
}

/** The vendor is reachable in principle and did not answer this time. */
export class ModelUnavailableError extends Error {
  readonly kind = "unavailable" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "ModelUnavailableError";
  }
}

/**
 * An upstream failure, named for the operator.
 *
 * **None of these strings reaches the browser.** The route replaces them with a
 * fixed sentence; this is what the server log keeps, so that "no billing on the
 * account" and "the key was revoked" stay different problems for whoever has to
 * fix them. Neither the upstream body nor any request header is carried, because
 * an error message can quote back part of a request and the request carries
 * project evidence.
 */
export function describeOpenAiFailure(
  error: unknown,
): ModelConfigurationError | ModelUnavailableError {
  if (error instanceof OpenAI.APIError) {
    const code = typeof error.code === "string" ? error.code : "";
    const status = error.status ?? 0;

    /*
     * No quota is an availability condition, not a misconfiguration.
     *
     * It was classified as a configuration fault, which makes the agent refuse
     * outright rather than fall back — so a demonstration whose key had run out
     * of credit lost the *measured evidence* as well as the interpretation. The
     * deployment is configured correctly; the account is empty. The reader
     * should still get every figure the tools computed.
     */
    if (code === "insufficient_quota") {
      return new ModelUnavailableError(
        "openai: the account has no remaining quota — a billing setting, not an outage",
      );
    }
    if (code === "model_not_found" || status === 404) {
      return new ModelConfigurationError(
        "openai: the account cannot reach the configured model — check OPENAI_TEXT_MODEL against the models this project is entitled to",
      );
    }
    if (status === 401 || status === 403) {
      return new ModelConfigurationError("openai: the key was rejected");
    }
    if (status === 400) {
      // A rejected parameter is a code or configuration fault, not an outage.
      // Naming the parameter is safe; it is a field name, never a value.
      return new ModelConfigurationError(
        `openai: the request was rejected${error.param === null || error.param === undefined ? "" : ` on "${String(error.param)}"`}`,
      );
    }
    if (status === 429) return new ModelUnavailableError("openai: rate limited");
    return new ModelUnavailableError(`openai: request failed with status ${status}`);
  }

  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "APIUserAbortError")
  ) {
    return new ModelUnavailableError("openai: the request was cancelled or timed out");
  }

  return new ModelUnavailableError("openai: the request could not be completed");
}

/* --- the OpenAI adapter ------------------------------------------------------- */

/*
 * Types kept deliberately loose at the seam.
 *
 * The Responses input union is large and moves between SDK minor versions.
 * Pinning our translation to the exact union buys nothing — every item this
 * file constructs is validated by the API itself, and the alternative is a
 * codebase that fails to compile because a vendor added an item type.
 */
type RawItem = Record<string, unknown>;

function toRawInput(messages: readonly ModelMessage[]): RawItem[] {
  const items: RawItem[] = [];
  for (const message of messages) {
    switch (message.role) {
      case "user":
        items.push({ role: "user", content: message.content });
        break;
      case "assistant":
        items.push({ role: "assistant", content: message.content });
        break;
      case "assistant_tool_calls":
        /*
         * Echoed back so the model can see what it already asked for.
         *
         * With `store: false` nothing is retained upstream, so the whole
         * transcript travels on every turn. That is the cost of not leaving
         * this product's evidence in a vendor's conversation store, and it is
         * the right trade.
         */
        for (const call of message.calls) {
          items.push({
            type: "function_call",
            call_id: call.callId,
            name: call.name,
            arguments: call.argumentsJson,
          });
        }
        break;
      case "tool_result":
        items.push({
          type: "function_call_output",
          call_id: message.callId,
          output: message.output,
        });
        break;
    }
  }
  return items;
}

function readUsage(usage: unknown): ModelUsage | null {
  if (usage === null || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const details = (u["output_tokens_details"] ?? {}) as Record<string, unknown>;
  return {
    inputTokens: typeof u["input_tokens"] === "number" ? u["input_tokens"] : null,
    outputTokens: typeof u["output_tokens"] === "number" ? u["output_tokens"] : null,
    reasoningTokens:
      typeof details["reasoning_tokens"] === "number" ? details["reasoning_tokens"] : null,
  };
}

function readToolCalls(output: unknown): ModelToolCall[] {
  if (!Array.isArray(output)) return [];
  const calls: ModelToolCall[] = [];
  for (const item of output as RawItem[]) {
    if (item["type"] !== "function_call") continue;
    const callId = item["call_id"];
    const name = item["name"];
    const args = item["arguments"];
    if (typeof callId !== "string" || typeof name !== "string") continue;
    calls.push({
      callId,
      name,
      argumentsJson: typeof args === "string" ? args : "{}",
    });
  }
  return calls;
}

/** Pulls the text out of a Responses payload, whichever shape it arrived in. */
export function readOutputText(response: {
  output_text?: string | undefined;
  output?: unknown;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) return "";
  const parts: string[] = [];
  for (const item of response.output as RawItem[]) {
    const content = item["content"];
    if (!Array.isArray(content)) continue;
    for (const chunk of content as RawItem[]) {
      if (typeof chunk["text"] === "string") parts.push(chunk["text"]);
    }
  }
  return parts.join("").trim();
}

/**
 * The request body, assembled in one place.
 *
 * Every privacy and cost control this product claims is visible here, which is
 * the point: a reviewer should be able to read one function and know what
 * leaves the building.
 */
function buildBody(turn: ModelTurn, model: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    instructions: turn.instructions,
    input: toRawInput(turn.messages),
    // Never retained by the vendor. Not configurable — see env.ts on why the
    // variable exists at all.
    store: false,
    // Opaque and stable. Never a user id, an email or a display name.
    safety_identifier: turn.safetyIdentifier,
    max_output_tokens: turn.maxOutputTokens,
    reasoning: { effort: turn.reasoningEffort },
    // The model answers from Observer evidence and nothing else. No hosted
    // tools, no web search: a model that can search can contradict the figures
    // on the screen with something it read, and the reader cannot tell which is
    // which.
    truncation: "auto",
  };

  if (turn.tools.length > 0) {
    body["tools"] = turn.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    }));
    body["tool_choice"] = "auto";
    body["parallel_tool_calls"] = false;
  }

  if (turn.responseSchema !== null) {
    body["text"] = {
      format: {
        type: "json_schema",
        name: turn.responseSchema.name,
        schema: turn.responseSchema.schema,
        strict: false,
      },
    };
  }

  return body;
}

function client(): OpenAI {
  const key = process.env["OPENAI_API_KEY"];
  if (key === undefined || key.length === 0) {
    throw new ModelConfigurationError("openai: OPENAI_API_KEY is not set on the server");
  }
  return new OpenAI({
    apiKey: key,
    // One attempt. The breaker in limits.ts handles the repeated case; an
    // automatic retry in front of a per-token vendor is an uncapped bill.
    maxRetries: 0,
    timeout: LIMITS.requestTimeoutMs,
  });
}

export function openAiModel(model: string): ObserverModel {
  if (!modelIsAllowed(model)) {
    throw new ModelConfigurationError(
      `openai: model "${model}" is not on this deployment's allowlist (OBSERVER_ALLOWED_MODELS)`,
    );
  }

  return {
    id: "openai",
    model,
    live: true,

    async respond(turn) {
      const chosen = turn.model ?? model;
      if (!modelIsAllowed(chosen)) {
        throw new ModelConfigurationError(`openai: model "${chosen}" is not on the allowlist`);
      }
      try {
        const response = await client().responses.create(
          buildBody(turn, chosen) as never,
          turn.signal === undefined ? undefined : { signal: turn.signal },
        );
        const raw = response as unknown as {
          output_text?: string;
          output?: unknown;
          usage?: unknown;
          model?: string;
          status?: string;
          incomplete_details?: { reason?: string };
        };
        return {
          text: readOutputText(raw),
          toolCalls: readToolCalls(raw.output),
          usage: readUsage(raw.usage),
          model: typeof raw.model === "string" ? raw.model : chosen,
          truncated: raw.incomplete_details?.reason === "max_output_tokens",
        };
      } catch (error) {
        throw describeOpenAiFailure(error);
      }
    },

    async *streamRespond(turn) {
      const chosen = turn.model ?? model;
      if (!modelIsAllowed(chosen)) {
        throw new ModelConfigurationError(`openai: model "${chosen}" is not on the allowlist`);
      }

      let stream;
      try {
        stream = await client().responses.create(
          { ...buildBody(turn, chosen), stream: true } as never,
          turn.signal === undefined ? undefined : { signal: turn.signal },
        );
      } catch (error) {
        throw describeOpenAiFailure(error);
      }

      let text = "";
      let final: RawItem | null = null;

      try {
        for await (const event of stream as unknown as AsyncIterable<RawItem>) {
          const type = event["type"];
          if (type === "response.output_text.delta") {
            const delta = event["delta"];
            if (typeof delta === "string" && delta.length > 0) {
              text += delta;
              yield { type: "text_delta", delta };
            }
          } else if (type === "response.completed" || type === "response.incomplete") {
            final = (event["response"] ?? null) as RawItem | null;
          } else if (type === "error") {
            throw new ModelUnavailableError("openai: the stream reported an error");
          }
        }
      } catch (error) {
        if (error instanceof ModelUnavailableError || error instanceof ModelConfigurationError) {
          throw error;
        }
        throw describeOpenAiFailure(error);
      }

      const incomplete = (final?.["incomplete_details"] ?? null) as { reason?: string } | null;
      yield {
        type: "done",
        result: {
          text: text.length > 0 ? text : readOutputText((final ?? {}) as never),
          toolCalls: readToolCalls(final?.["output"]),
          usage: readUsage(final?.["usage"]),
          model: typeof final?.["model"] === "string" ? (final["model"] as string) : chosen,
          truncated: incomplete?.reason === "max_output_tokens",
        },
      };
    },
  };
}

/* --- resolution ---------------------------------------------------------------- */

export interface ModelStatus {
  readonly provider: string;
  readonly model: string;
  readonly live: boolean;
  /** Operator-facing. Redacted before it leaves the server. */
  readonly reason: string | null;
}

export type ModelResolution =
  | { readonly ok: true; readonly model: ObserverModel; readonly status: ModelStatus }
  | { readonly ok: false; readonly status: ModelStatus; readonly configurationFault: boolean };

/**
 * Which model answers, and whether one answers at all.
 *
 * Three outcomes, and they are genuinely different:
 *
 * - **live** — a key is present, the feature is on, the model is allowed.
 * - **evidence-only** — the feature is switched off or no key is configured.
 *   Not a fault. Ask Observer still answers from the same tools in the tools'
 *   own prose, and the answer sheet says so.
 * - **misconfigured** — a key is present and something about the configuration
 *   is wrong. This is a fault, is reported as one, and does **not** silently
 *   become the evidence-only path, because a deployment that believes it is
 *   running a model should never be quietly running a template.
 */
export function resolveModel(): ModelResolution {
  const env = environment();

  if (!env.ai.enabled) {
    return {
      ok: false,
      configurationFault: false,
      status: {
        provider: "evidence-only",
        model: "none",
        live: false,
        reason: "OBSERVER_AI_ENABLED is false",
      },
    };
  }

  if (!env.ai.keyConfigured) {
    return {
      ok: false,
      configurationFault: false,
      status: {
        provider: "evidence-only",
        model: "none",
        live: false,
        reason: "no model key is configured",
      },
    };
  }

  try {
    const model = openAiModel(env.ai.textModel);
    return {
      ok: true,
      model,
      status: { provider: model.id, model: model.model, live: true, reason: null },
    };
  } catch (error) {
    return {
      ok: false,
      configurationFault: true,
      status: {
        provider: "openai",
        model: env.ai.textModel,
        live: false,
        reason: error instanceof Error ? error.message : "the model provider is misconfigured",
      },
    };
  }
}
