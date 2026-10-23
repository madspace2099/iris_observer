import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelTurn } from "../src/lib/ai/provider";
import { callModel, TransportFailure } from "../src/lib/providers/transport";

/**
 * OPENAI IS ASKED THROUGH THE RESPONSES API (2026-10-23).
 *
 * The first real key reached a planning turn and the GPT-5.6 family answered
 * 400: chat completions refuses function tools together with a reasoning
 * effort. Both Ask turns carry both. `fetch` is a recorder here; nothing leaves
 * the process, and the key is an obviously fake constant.
 */

const KEY = "sk-observer-test-responses-0000";

const TURN: ModelTurn = {
  instructions: "Answer from the tools.",
  messages: [
    { role: "user", content: "Which agent converts best?" },
    {
      role: "assistant_tool_calls",
      calls: [{ callId: "call_1", name: "agent_ranking", argumentsJson: "{}" }],
    },
    { role: "tool_result", callId: "call_1", output: '{"rows":[]}' },
  ],
  tools: [
    {
      name: "agent_ranking",
      description: "Ranks agents.",
      parameters: { type: "object", properties: {} },
    },
  ],
  toolChoice: "none",
  reasoningEffort: "low",
  maxOutputTokens: 2000,
  safetyIdentifier: "subject-1",
  responseSchema: { name: "observer_answer", schema: { type: "object" } },
} as ModelTurn;

let sent: { url: string; body: Record<string, unknown> }[] = [];
let reply: Response;
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return reply;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("the request", () => {
  it("goes to /responses with tools, effort, schema and no chat-completions fields", async () => {
    reply = Response.json({ output: [], output_text: "{}", model: "gpt-5.6-terra" });
    await callModel("gpt-5.6-terra", KEY, TURN);

    expect(sent).toHaveLength(1);
    const [{ url, body }] = sent as [(typeof sent)[number]];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({
      model: "gpt-5.6-terra",
      instructions: "Answer from the tools.",
      store: false,
      safety_identifier: "subject-1",
      max_output_tokens: 2000,
      reasoning: { effort: "low" },
      tool_choice: "none",
      text: { format: { type: "json_schema", name: "observer_answer" } },
    });
    expect(body["tools"]).toEqual([
      expect.objectContaining({ type: "function", name: "agent_ranking" }),
    ]);
    expect(body["input"]).toEqual([
      { role: "user", content: "Which agent converts best?" },
      { type: "function_call", call_id: "call_1", name: "agent_ranking", arguments: "{}" },
      { type: "function_call_output", call_id: "call_1", output: '{"rows":[]}' },
    ]);
    for (const field of [
      "messages",
      "max_completion_tokens",
      "reasoning_effort",
      "response_format",
    ]) {
      expect(body, field).not.toHaveProperty(field);
    }
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it("goes to the picked model's own name", async () => {
    reply = Response.json({ output: [], output_text: "ok" });
    await callModel("gpt-5.6-sol", KEY, { ...TURN, tools: [], responseSchema: null });
    expect(sent[0]?.body["model"]).toBe("gpt-5.6-sol");
  });

  it("sends no effort to a model outside the reasoning families", async () => {
    reply = Response.json({ output: [], output_text: "ok" });
    await callModel("gpt-5.6-terra", KEY, TURN, "gpt-4.1-mini");
    expect(sent[0]?.body["model"]).toBe("gpt-4.1-mini");
    expect(sent[0]?.body).not.toHaveProperty("reasoning");
  });
});

describe("the reply", () => {
  it("reads the text, the tool calls and the usage", async () => {
    reply = Response.json({
      model: "gpt-5.6-terra-2026-09-01",
      output: [
        { type: "reasoning", summary: [] },
        { type: "function_call", call_id: "call_9", name: "agent_ranking", arguments: '{"k":1}' },
        { type: "message", content: [{ type: "output_text", text: "Lena converts best." }] },
      ],
      usage: { input_tokens: 120, output_tokens: 40 },
    });
    const result = await callModel("gpt-5.6-terra", KEY, TURN);
    expect(result).toEqual({
      text: "Lena converts best.",
      toolCalls: [{ callId: "call_9", name: "agent_ranking", argumentsJson: '{"k":1}' }],
      usage: { inputTokens: 120, outputTokens: 40, reasoningTokens: null },
      model: "gpt-5.6-terra-2026-09-01",
      truncated: false,
    });
  });

  it("says when the reply stopped at the output ceiling, and counts reasoning", async () => {
    reply = Response.json({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "message", content: [{ type: "output_text", text: '{"answer":"Le' }] }],
      usage: {
        input_tokens: 90,
        output_tokens: 2000,
        output_tokens_details: { reasoning_tokens: 7 },
      },
    });
    const result = await callModel("gpt-5.6-terra", KEY, TURN);
    expect(result.truncated).toBe(true);
    expect(result.usage.reasoningTokens).toBe(7);
  });

  it("fails with the status, the vendor's code and the field it objected to", async () => {
    reply = Response.json(
      {
        error: {
          message: "Function tools with reasoning_effort are not supported",
          type: "invalid_request_error",
          code: "unsupported_parameter",
          param: "reasoning.effort",
        },
      },
      { status: 400 },
    );
    const failure = await callModel("gpt-5.6-terra", KEY, TURN).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TransportFailure);
    expect(failure).toMatchObject({ status: 400, code: "unsupported_parameter" });
    expect((failure as Error).message).toBe(
      "provider request failed with status 400 · unsupported_parameter · reasoning.effort",
    );
    expect((failure as Error).message).not.toContain("not supported");
  });

  it("drops a param that is not a field name", async () => {
    reply = Response.json(
      { error: { code: "invalid_value", param: "input[0] says: hello world" } },
      { status: 400 },
    );
    const failure = (await callModel("gpt-5.6-terra", KEY, TURN).catch((e: unknown) => e)) as Error;
    expect(failure.message).toBe("provider request failed with status 400 · invalid_value");
  });
});
