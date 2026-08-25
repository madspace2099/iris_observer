import { describe, expect, it } from "vitest";

import { JsonFieldStreamer } from "../src/lib/ai/streaming";

/**
 * Reading prose out of JSON that has not finished arriving.
 *
 * Tested character by character, because every bug this class can have is a
 * chunk-boundary bug: an escape split across two reads, a quote inside a value,
 * a watched key nested inside an object where it means something else. None of
 * those appear when the whole document is pushed at once, which is exactly how
 * they reach production.
 */

function collect(streamer: JsonFieldStreamer, chunks: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chunk of chunks) {
    for (const { field, delta } of streamer.push(chunk)) {
      out[field] = (out[field] ?? "") + delta;
    }
  }
  return out;
}

/** Splits a document into fixed-size pieces, to force awkward boundaries. */
function slice(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let at = 0; at < text.length; at += size) parts.push(text.slice(at, at + size));
  return parts;
}

describe("the incremental field reader", () => {
  it("reads a watched field arriving in one piece", () => {
    const streamer = new JsonFieldStreamer(["answer"]);
    expect(collect(streamer, ['{"answer":"Coverage held."}'])).toEqual({
      answer: "Coverage held.",
    });
  });

  it("reads a field split across every possible boundary", () => {
    const document = '{"headline":"x","answer":"Coverage held at 78%.","limitations":[]}';
    /*
     * Size one is the real test.
     *
     * At one character per chunk every state transition in the scanner happens
     * between two calls, which is the condition the class exists to survive.
     */
    for (const size of [1, 2, 3, 7, 13]) {
      const streamer = new JsonFieldStreamer(["answer"]);
      expect(collect(streamer, slice(document, size)), `chunk size ${size}`).toEqual({
        answer: "Coverage held at 78%.",
      });
    }
  });

  it("ignores fields it was not asked to watch", () => {
    const streamer = new JsonFieldStreamer(["answer"]);
    const out = collect(streamer, ['{"headline":"Not this","answer":"This."}']);
    expect(out).toEqual({ answer: "This." });
  });

  it("watches more than one field and keeps them apart", () => {
    const streamer = new JsonFieldStreamer(["answer", "interpretation"]);
    const out = collect(streamer, ['{"answer":"Short.","interpretation":"Longer, and separate."}']);
    expect(out).toEqual({ answer: "Short.", interpretation: "Longer, and separate." });
  });

  it("decodes escapes, including one split across chunks", () => {
    const streamer = new JsonFieldStreamer(["answer"]);
    // The ó sequence is deliberately cut in half. Slovak, Czech and
    // Hungarian names all reach this path, so it is not a hypothetical.
    const out = collect(streamer, ['{"answer":"Vikt\\u00', 'f3ria said \\"yes\\"."}']);
    expect(out).toEqual({ answer: 'Viktória said "yes".' });
  });

  it("handles a newline and a backslash inside a value", () => {
    const streamer = new JsonFieldStreamer(["answer"]);
    expect(collect(streamer, ['{"answer":"one\\ntwo\\\\three"}'])).toEqual({
      answer: "one\ntwo\\three",
    });
  });

  it("does not mistake a nested key of the same name for the top-level one", () => {
    /*
     * The subtle one.
     *
     * `findings[].statement` sits inside an array of objects, and a scanner
     * that tracks only "the last key it saw" would start streaming any nested
     * field that happened to share a watched name.
     */
    const streamer = new JsonFieldStreamer(["answer"]);
    const out = collect(streamer, [
      '{"findings":[{"answer":"NESTED","value":"1"}],"answer":"TOP"}',
    ]);
    expect(out).toEqual({ answer: "TOP" });
  });

  it("does not treat an array element as a key position", () => {
    const streamer = new JsonFieldStreamer(["answer"]);
    const out = collect(streamer, ['{"limitations":["a","b"],"answer":"real"}']);
    expect(out).toEqual({ answer: "real" });
  });

  it("produces nothing for a document that never opens the watched field", () => {
    const streamer = new JsonFieldStreamer(["answer"]);
    expect(collect(streamer, ['{"headline":"only this"}'])).toEqual({});
  });

  it("stops emitting the moment the value closes", () => {
    const streamer = new JsonFieldStreamer(["answer"]);
    const out = collect(streamer, ['{"answer":"done","headline":"after"}']);
    expect(out).toEqual({ answer: "done" });
  });

  it("coalesces to one delta per field per chunk", () => {
    // A consumer should receive one event per field per push, not one per
    // character — otherwise a React state setter runs a few thousand times.
    const streamer = new JsonFieldStreamer(["answer"]);
    const deltas = streamer.push('{"answer":"several characters here"}');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.field).toBe("answer");
  });
});
