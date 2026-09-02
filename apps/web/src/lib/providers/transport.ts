import "server-only";

import { LIMITS } from "@/lib/ai/limits";
import {
  ModelConfigurationError,
  type ModelToolCall,
  type ModelTurn,
  type ModelTurnResult,
  type ObserverModel,
} from "@/lib/ai/provider";
import { modelEntry, providerFor, type ModelId } from "@/lib/models/catalogue";
import { isSyntheticCredential, testStorePermitted } from "@/lib/credentials/test-store";
import type { EnvSource } from "@/lib/supabase-env";

/**
 * ONE MODEL PORT, FIVE VENDORS BEHIND IT.
 *
 * `ObserverModel` was written for OpenAI and is the shape the agent, the guards
 * and the streaming reader already speak. Nothing above this file changes to
 * add a vendor; what changes is which function builds the request and reads the
 * reply.
 *
 * ## Two transports, not five
 *
 * xAI, Moonshot and Alibaba each publish an endpoint speaking the OpenAI
 * chat-completions shape, so one adapter with a different base URL reaches all
 * three. Anthropic does not: its Messages API carries the system prompt in its
 * own field, expresses tools with `input_schema`, returns content as a list of
 * blocks and names token counts differently. It gets its own adapter rather
 * than a pile of conditionals inside the first.
 *
 * ## Tool calling is implemented, because the pipeline needs it
 *
 * Observer's planning turn asks a model to call read-only analysis tools and
 * composes from what they return. A transport that dropped `tools` would leave
 * every non-OpenAI model unable to plan — it would answer from nothing and
 * sound confident doing it. So both adapters carry the tool list, both read
 * tool calls back, and both replay `tool_result` messages.
 *
 * ## NOTHING HERE HAS EVER MADE A REQUEST
 *
 * Every base URL, field name, header and error code below is written from
 * documentation rather than observation: the milestone that wrote it had no
 * network, by instruction. The OpenAI path is exercised by the existing suite
 * through the scripted provider. The other four are **not exercised against
 * anything**, and the settings page tells a reader so before they connect a key.
 *
 * The operator chose this knowing it. This comment is the record of what the
 * choice costs, and the first thing to delete when the endpoints are verified.
 */

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface TransportResult {
  readonly text: string;
  readonly toolCalls: readonly ModelToolCall[];
  readonly usage: Usage;
  readonly model: string;
}

/** A vendor failure, reduced to the two fields the classifier reads. */
export class TransportFailure extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null) {
    super(`provider request failed with status ${status}`);
    this.name = "TransportFailure";
    this.status = status;
    this.code = code;
  }
}

/**
 * The error body, reduced and thrown away.
 *
 * A status and a short code, never the message: an upstream message can quote
 * the request back, and the request carried both a credential and project
 * evidence. `credentials/failure.ts` maps the pair to one of seven sentences,
 * and that mapping is the only thing a reader or an audit row ever sees.
 */
async function failureFrom(response: Response): Promise<TransportFailure> {
  let code: string | null = null;
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
    const raw = error?.code ?? error?.type;
    if (typeof raw === "string" && raw.length > 0 && raw.length < 64) code = raw;
  } catch {
    /* A body that is not JSON tells us nothing, and that is fine. */
  }
  return new TransportFailure(response.status, code);
}

function deadline(turn: ModelTurn): AbortSignal {
  return turn.signal ?? AbortSignal.timeout(LIMITS.requestTimeoutMs);
}

/* ====================================================== the OpenAI-compatible one */

type ChatMessage = Record<string, unknown>;

function chatMessages(turn: ModelTurn): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (turn.instructions.length > 0) {
    messages.push({ role: "system", content: turn.instructions });
  }

  for (const message of turn.messages) {
    switch (message.role) {
      case "user":
      case "assistant":
        messages.push({ role: message.role, content: message.content });
        break;
      case "assistant_tool_calls":
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: message.calls.map((call) => ({
            id: call.callId,
            type: "function",
            function: { name: call.name, arguments: call.argumentsJson },
          })),
        });
        break;
      case "tool_result":
        messages.push({
          role: "tool",
          tool_call_id: message.callId,
          content: message.output,
        });
        break;
    }
  }
  return messages;
}

async function openAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  turn: ModelTurn,
): Promise<TransportResult> {
  const body: Record<string, unknown> = {
    model,
    messages: chatMessages(turn),
    max_tokens: turn.maxOutputTokens,
  };

  if (turn.tools.length > 0) {
    body["tools"] = turn.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
    body["tool_choice"] = turn.toolChoice === "none" ? "none" : "auto";
  }

  if (turn.responseSchema !== null) {
    body["response_format"] = {
      type: "json_schema",
      json_schema: {
        name: turn.responseSchema.name,
        schema: turn.responseSchema.schema,
        strict: false,
      },
    };
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: deadline(turn),
  });

  if (!response.ok) throw await failureFrom(response);

  const parsed = (await response.json()) as {
    choices?: {
      message?: {
        content?: unknown;
        tool_calls?: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[];
      };
    }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    model?: unknown;
  };

  const message = parsed.choices?.[0]?.message;
  const toolCalls: ModelToolCall[] = (message?.tool_calls ?? []).flatMap((call) => {
    const name = call.function?.name;
    if (typeof name !== "string") return [];
    return [
      {
        callId: typeof call.id === "string" ? call.id : name,
        name,
        argumentsJson:
          typeof call.function?.arguments === "string" ? call.function.arguments : "{}",
      },
    ];
  });

  return {
    text: typeof message?.content === "string" ? message.content : "",
    toolCalls,
    usage: {
      inputTokens: Number(parsed.usage?.prompt_tokens ?? 0),
      outputTokens: Number(parsed.usage?.completion_tokens ?? 0),
    },
    model: typeof parsed.model === "string" ? parsed.model : model,
  };
}

/* ==================================================================== the port */

/**
 * Calls one model with one account's credential.
 *
 * The key is a parameter and a local: not cached, not stored, not attached to
 * the result. A client built per request is a credential the next reader cannot
 * inherit.
 */
export async function callModel(
  id: ModelId,
  apiKey: string,
  turn: ModelTurn,
): Promise<TransportResult> {
  const entry = modelEntry(id);
  const provider = providerFor(entry.provider);

  if (apiKey.length === 0) {
    throw new ModelConfigurationError(`${provider.id}: no API key was supplied for this request`);
  }

  /*
   * The VENDOR'S name for the model goes on the wire; Observer's own name stays
   * in Observer's records. They match today and are not the same thing — see
   * `CatalogueEntry.apiIdentifier`.
   */
  /*
   * One transport, and the switch stays.
   *
   * `Transport` has one member today. Keeping the dispatch means a second
   * vendor with a different request shape is a new branch rather than a
   * refactor of every call site — and means this line says which protocol is
   * being spoken instead of assuming.
   */
  switch (provider.transport) {
    case "openai-compatible":
      return openAiCompatible(provider.baseUrl, apiKey, entry.apiIdentifier, turn);
  }
}

/**
 * The catalogue model as an `ObserverModel`, bound to one credential.
 *
 * Streaming is deliberately NOT implemented across five vendors at once: each
 * publishes its own event shape and none has been observed. The whole answer
 * arrives and is yielded in one piece, so a reader sees an answer appear rather
 * than type itself. Losing the typing effect is a fair price for not writing
 * five stream parsers blind — and the parser that exists for OpenAI's Responses
 * API is still there, unchanged, for the path that has been exercised.
 */
export function modelFor(
  id: ModelId,
  apiKey: string,
  source: EnvSource = process.env,
): ObserverModel {
  const entry = modelEntry(id);

  /*
   * NO REQUEST LEAVES A HARNESS SERVER. EVER.
   *
   * The browser suite and a local review hold only synthetic credentials, and a
   * synthetic credential sent to a real endpoint is still a request to that
   * vendor — a DNS lookup, a TLS handshake and a 401 in somebody's logs. The
   * same predicate that admits the test store refuses the network here, and the
   * scripted model answers from the fake key's own text instead.
   *
   * This is why a suite run cannot contact OpenAI even if a test asks it to.
   */
  if (testStorePermitted(source)) return scriptedModel(id, apiKey);

  const result = (transport: TransportResult): ModelTurnResult => ({
    text: transport.text,
    toolCalls: transport.toolCalls,
    usage: {
      inputTokens: transport.usage.inputTokens,
      outputTokens: transport.usage.outputTokens,
      reasoningTokens: null,
    },
    model: transport.model,
    truncated: false,
  });

  return {
    id: entry.provider,
    model: id,
    live: true,

    async respond(turn) {
      return result(await callModel(id, apiKey, turn));
    },

    async *streamRespond(turn) {
      const transport = await callModel(id, apiKey, turn);
      if (transport.text.length > 0) yield { type: "text_delta", delta: transport.text };
      yield { type: "done", result: result(transport) };
    },
  };
}

/* ============================================================= the scripted one */

/**
 * A model that answers without a network, for the browser suite.
 *
 * Reachable only where the test credential store is, which needs four
 * simultaneous conditions and refuses every deployment. The verdict comes out
 * of the obviously-fake key, so a reviewer can photograph every state — a
 * working answer, a model the account cannot reach, a rate limit — with nothing
 * leaving the machine.
 *
 * It reports token counts, because the budget ledger settles from them and a
 * settlement of zero would make every screenshot of a usage figure a lie.
 */
function scriptedModel(id: ModelId, apiKey: string): ObserverModel {
  const refuse = (status: number, code: string | null): never => {
    throw new TransportFailure(status, code);
  };

  const answer = (): ModelTurnResult => {
    /*
     * A REAL-LOOKING KEY IS REFUSED HERE TOO, AND ANSWERS NOTHING.
     *
     * The store will not hold one and the settings form will not accept one,
     * so reaching this line with a production credential means something has
     * already gone wrong. Answering it anyway would hand back a plausible
     * result and let the mistake continue quietly; refusing it makes the
     * mistake visible at the moment it happens. No request is made either way.
     */
    if (!isSyntheticCredential(apiKey)) refuse(401, "invalid_api_key");

    if (apiKey.includes("model")) refuse(404, "model_not_found");
    if (apiKey.includes("limit")) refuse(429, "rate_limit_exceeded");
    if (apiKey.includes("quota")) refuse(429, "insufficient_quota");
    if (apiKey.includes("spend")) refuse(429, "billing_hard_limit_reached");
    if (apiKey.includes("reject")) refuse(401, "invalid_api_key");
    if (apiKey.includes("down")) refuse(0, null);

    return {
      /*
       * Empty prose, deliberately. The deterministic composer writes the
       * answer; what this proves is that the model stage RAN and cost
       * something, which is what the budget is measuring.
       */
      text: "",
      toolCalls: [],
      usage: { inputTokens: 9_000, outputTokens: 700, reasoningTokens: null },
      model: id,
      truncated: false,
    };
  };

  return {
    id: modelEntry(id).provider,
    model: id,
    live: true,
    respond: () => Promise.resolve(answer()),
    async *streamRespond() {
      yield { type: "done", result: answer() };
    },
  };
}
