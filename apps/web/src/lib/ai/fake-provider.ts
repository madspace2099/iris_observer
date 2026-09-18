import "server-only";

import {
  ModelConfigurationError,
  ModelUnavailableError,
  type ModelStreamEvent,
  type ModelTurn,
  type ModelTurnResult,
  type ObserverModel,
} from "./provider";

/**
 * A model that never makes a network call.
 *
 * Not a mock of the vendor SDK — a real implementation of the same port, which
 * is the difference between a test that proves the pipeline works and a test
 * that proves a stub was called. The agent, the guards, the schema validation
 * and the streaming reader all run for real against this.
 *
 * Tests use it so the suite is offline, free and reproducible. A test that
 * spends money on every run is a test people delete; a test that depends on a
 * model's mood is one they stop trusting.
 */

export interface ScriptedTurn {
  /** Text the model "produces". Streamed in chunks when streaming. */
  readonly text?: string;
  readonly toolCalls?: readonly { name: string; argumentsJson: string; callId?: string }[];
  /** Thrown instead of answering, so failure paths are exercised honestly. */
  readonly failWith?: "unavailable" | "configuration";
  readonly truncated?: boolean;
}

export interface FakeModelOptions {
  readonly id?: string;
  readonly model?: string;
  /** Consumed one per turn. The last entry repeats once the script runs out. */
  readonly script: readonly ScriptedTurn[];
  /** Characters per streamed chunk. Small values exercise partial parsing. */
  readonly chunkSize?: number;
}

export interface FakeModel extends ObserverModel {
  /** Every turn the agent sent, for assertions about what was transmitted. */
  readonly seen: readonly ModelTurn[];
  readonly turnCount: number;
}

export function fakeModel(options: FakeModelOptions): FakeModel {
  const seen: ModelTurn[] = [];
  let index = 0;

  const next = (): ScriptedTurn => {
    const entry = options.script[Math.min(index, options.script.length - 1)] ?? {};
    index += 1;
    return entry;
  };

  const resultFor = (turn: ScriptedTurn, model: string): ModelTurnResult => ({
    text: turn.text ?? "",
    toolCalls: (turn.toolCalls ?? []).map((call, i) => ({
      callId: call.callId ?? `call_${i}`,
      name: call.name,
      argumentsJson: call.argumentsJson,
    })),
    usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 10 },
    model,
    truncated: turn.truncated ?? false,
  });

  const raise = (turn: ScriptedTurn): void => {
    if (turn.failWith === "unavailable") {
      throw new ModelUnavailableError("fake: the provider is unavailable");
    }
    if (turn.failWith === "configuration") {
      throw new ModelConfigurationError("fake: the provider is misconfigured");
    }
  };

  const model = options.model ?? "fake-model";

  return {
    id: options.id ?? "fake",
    model,
    live: true,
    get seen() {
      return seen;
    },
    get turnCount() {
      return index;
    },

    respond(turn) {
      seen.push(turn);
      const scripted = next();
      raise(scripted);
      return Promise.resolve(resultFor(scripted, model));
    },

    async *streamRespond(turn): AsyncIterable<ModelStreamEvent> {
      seen.push(turn);
      const scripted = next();
      raise(scripted);

      const text = scripted.text ?? "";
      const size = options.chunkSize ?? 24;
      for (let at = 0; at < text.length; at += size) {
        yield { type: "text_delta", delta: text.slice(at, at + size) };
        // A microtask between chunks, so a consumer that assumes synchronous
        // delivery fails here rather than in production.
        await Promise.resolve();
      }

      yield { type: "done", result: resultFor(scripted, model) };
    },
  };
}
