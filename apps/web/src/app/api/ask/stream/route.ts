import { askStream } from "@/lib/ai/agent";
import { gate } from "@/lib/ai/gate";
import { LIMITS } from "@/lib/ai/limits";
import { publicOutcome, reportOutcome } from "../route";

/**
 * Ask Observer — the streamed route.
 *
 * Server-sent events, not a WebSocket: the traffic is one-way, the client is a
 * browser that already has `fetch`, and a socket would add a connection
 * lifecycle to maintain for no capability this needs.
 *
 * Four event types, and the distinction between them is the honest part:
 *
 * - `stage` — what the tool layer is doing, in words, while it does it. Real
 *   progress, not a timer counting to three.
 * - `tool` — a named analysis that actually ran.
 * - `delta` — characters of the answer as the model produces them. **Not
 *   trusted.** The interface shows them and then replaces them with the
 *   validated answer, or discards them entirely if validation fails.
 * - `final` — the validated outcome. The only thing a reader keeps.
 *
 * Every request passes the same gate as the JSON route, before a single byte of
 * the stream is written.
 */

export const runtime = "nodejs";

const encoder = new TextEncoder();

function frame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  // Vercel and several proxies buffer responses without this, which turns a
  // stream into one slow response and defeats the entire point.
  "X-Accel-Buffering": "no",
} as const;

export async function POST(request: Request) {
  const started = Date.now();
  const admitted = await gate(await request.json().catch(() => null));

  if (!admitted.ok) {
    /*
     * A refusal is an ordinary JSON response, not an event stream.
     *
     * The client checks `response.ok` before it starts reading, so a 401 or a
     * 429 arrives as a status code it can act on rather than as an error
     * message buried in a stream it has already committed to consuming.
     */
    return new Response(JSON.stringify({ error: admitted.message }), {
      status: admitted.httpStatus,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(admitted.retryAfterSeconds === null
          ? {}
          : { "Retry-After": String(admitted.retryAfterSeconds) }),
      },
    });
  }

  /*
   * Two abort sources, joined.
   *
   * The reader pressing Stop closes the request, and the deadline stops a turn
   * that has gone quiet. Either must reach the upstream call, or a cancelled
   * question keeps costing money after nobody is listening.
   */
  const deadline = AbortSignal.timeout(LIMITS.requestTimeoutMs * 2);
  const signal = AbortSignal.any([request.signal, deadline]);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of askStream(admitted.question, admitted.context, signal)) {
          if (signal.aborted) break;
          switch (event.type) {
            case "stage":
              controller.enqueue(frame("stage", { label: event.label }));
              break;
            case "tool":
              controller.enqueue(frame("tool", { name: event.name }));
              break;
            case "delta":
              controller.enqueue(frame("delta", { field: event.field, delta: event.delta }));
              break;
            case "final":
              reportOutcome(event.outcome, admitted.subject, started);
              controller.enqueue(frame("final", publicOutcome(event.outcome)));
              break;
          }
        }
      } catch {
        /*
         * One fixed sentence, whatever happened.
         *
         * No stack trace, no upstream body, no provider message. The detail is
         * already in the server log; the reader gets a state they can act on.
         */
        controller.enqueue(
          frame("failure", {
            error: "Observer could not complete this answer. The measured evidence is unchanged.",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
