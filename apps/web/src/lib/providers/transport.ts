import "server-only";

import { LIMITS } from "@/lib/ai/limits";
import {
  buildBody,
  ModelConfigurationError,
  readOutputText,
  readToolCalls,
  readUsage,
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
  readonly reasoningTokens: number | null;
}

export interface TransportResult {
  readonly text: string;
  readonly toolCalls: readonly ModelToolCall[];
  readonly usage: Usage;
  readonly model: string;
  /** The reply stopped at the output ceiling: a 200 whose status is "incomplete". */
  readonly truncated: boolean;
}

/**
 * A vendor failure, reduced to the two fields the classifier reads.
 *
 * The message adds the vendor's short code and the name of the field it
 * objected to, for the server log: both come from the vendor's closed
 * vocabulary and the request's own field names, never from its content. Two
 * 400s with nothing but a status cost a round trip to the owner (2026-10-23).
 */
export class TransportFailure extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null, param: string | null = null) {
    super(
      `provider request failed with status ${status}${code === null ? "" : ` · ${code}`}${param === null ? "" : ` · ${param}`}`,
    );
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
  let param: string | null = null;
  const short = (value: unknown): string | null =>
    typeof value === "string" && /^[\w.[\]-]{1,63}$/.test(value) ? value : null;
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: { code?: unknown; type?: unknown; param?: unknown } } | null)
      ?.error;
    const raw = error?.code ?? error?.type;
    if (typeof raw === "string" && raw.length > 0 && raw.length < 64) code = raw;
    param = short(error?.param);
  } catch {
    /* A body that is not JSON tells us nothing, and that is fine. */
  }
  return new TransportFailure(response.status, code, param);
}

function deadline(turn: ModelTurn): AbortSignal {
  return turn.signal ?? AbortSignal.timeout(LIMITS.requestTimeoutMs);
}

/* ============================================================ the OpenAI one */

/**
 * OPENAI, THROUGH THE RESPONSES API.
 *
 * It spoke chat completions until 2026-10-23, when the first real key reached
 * a planning turn: the GPT-5.6 family answers 400 on chat completions to any
 * request that carries function tools and a reasoning effort together, and
 * points at /v1/responses. A key test passed, because the probe carries no
 * tools; every question then fell back to the read models' own words.
 *
 * The body is `buildBody`'s, the one `provider.ts` already wrote and reviewed
 * for this API — `store: false`, the opaque safety identifier, the effort, the
 * tools declared even when forbidden, the schema as `text.format` — so there is
 * one description of what leaves the building, not two. The reply is read with
 * the same readers.
 */
async function openAiResponses(
  baseUrl: string,
  apiKey: string,
  model: string,
  turn: ModelTurn,
): Promise<TransportResult> {
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildBody(turn, model)),
    signal: deadline(turn),
  });

  if (!response.ok) throw await failureFrom(response);

  const parsed = (await response.json()) as {
    output_text?: string;
    output?: unknown;
    usage?: unknown;
    model?: unknown;
    incomplete_details?: { reason?: unknown } | null;
  };
  const usage = readUsage(parsed.usage);

  return {
    text: readOutputText(parsed),
    toolCalls: readToolCalls(parsed.output),
    usage: {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      reasoningTokens: usage?.reasoningTokens ?? null,
    },
    model: typeof parsed.model === "string" ? parsed.model : model,
    truncated: parsed.incomplete_details?.reason === "max_output_tokens",
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
  apiIdentifier: string = modelEntry(id).apiIdentifier,
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
    case "openai-responses":
      return openAiResponses(provider.baseUrl, apiKey, apiIdentifier, turn);
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
  /** The vendor's name when it is not the catalogue's — the demonstration key's model (ADR-0040). */
  wireModel?: string,
): ObserverModel {
  const entry = modelEntry(id);
  const apiIdentifier = wireModel ?? entry.apiIdentifier;

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
      reasoningTokens: transport.usage.reasoningTokens,
    },
    model: transport.model,
    truncated: transport.truncated,
  });

  return {
    id: entry.provider,
    /* The model that writes the words is the one an answer names. */
    model: wireModel ?? id,
    live: true,

    async respond(turn) {
      return result(await callModel(id, apiKey, turn, apiIdentifier));
    },

    async *streamRespond(turn) {
      const transport = await callModel(id, apiKey, turn, apiIdentifier);
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
