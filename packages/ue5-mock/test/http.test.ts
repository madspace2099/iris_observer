import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockObserverBackend } from "../src/backend";
import { startMockServer, type MockServer } from "../src/server";
import { activationRequest, batch, bearer, event, WHEN } from "./helpers";

/**
 * THE HTTP SKIN, EXERCISED OVER A REAL SOCKET.
 *
 * Every other test in this package drives the backend object directly, which is
 * faster and reads better. This file exists because Akhilesh's transport cannot
 * call a TypeScript method: UE-OBS-007 needs a URL, and the things that go wrong
 * over a socket — a destroyed connection, a missing header, a body that is not
 * JSON — do not exist at the method boundary.
 *
 * The drop case is the reason this is worth the cost. A dropped request is not
 * an error status; it is **silence**, and a client that has only ever been
 * tested against a mock that always answers has never met it.
 */

const backend = new MockObserverBackend({ baseUrl: "http://127.0.0.1" });
let server: MockServer;

beforeAll(async () => {
  server = await startMockServer(backend);
});

afterAll(async () => {
  await server.close();
});

const post = async (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown; headers: Headers }> => {
  const answer = await fetch(`${server.url}/functions/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await answer.text();
  return {
    status: answer.status,
    body: text.length === 0 ? null : JSON.parse(text),
    headers: answer.headers,
  };
};

describe("where it listens", () => {
  it("binds loopback and nothing else", () => {
    /*
     * A mock that answered on a LAN address is a fake analytics endpoint sitting
     * on a developer's network, and one day a real showroom build finds it.
     */
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("answers nothing on an unknown path", async () => {
    const answer = await post("observer-nope", {});
    expect(answer.status).toBe(404);
  });

  it("refuses anything that is not a POST", async () => {
    const answer = await fetch(`${server.url}/functions/v1/observer-ingest`);
    expect(answer.status).toBe(405);
    expect(answer.headers.get("allow")).toBe("POST");
  });
});

describe("the whole flow over the wire", () => {
  it("activates, ingests, and heartbeats", async () => {
    const code = backend.issueActivationCode({ displayLabel: "Wire test" });

    const activated = await post("observer-activate", activationRequest({ activation_code: code }));
    expect(activated.status).toBe(200);
    const token = (activated.body as Record<string, string>)["source_token"] as string;

    const ingested = await post("observer-ingest", batch([event(), event()]), {
      authorization: bearer(token),
    });
    expect(ingested.status).toBe(200);
    expect((ingested.body as Record<string, number>)["accepted"]).toBe(2);

    const beat = await post(
      "observer-heartbeat",
      {
        sent_at: WHEN,
        build: activationRequest()["build"],
        queue: {
          pending_events: 0,
          oldest_pending_at: null,
          quarantined_events: 0,
          bytes_used: 0,
          bytes_ceiling: 52_428_800,
          dropped_events: 0,
        },
        last_error: null,
      },
      { authorization: bearer(token) },
    );
    expect(beat.status).toBe(200);
    expect((beat.body as Record<string, string>)["status"]).toBe("ok");
  });

  it("refuses a heartbeat without a credential", async () => {
    const beat = await post("observer-heartbeat", { sent_at: WHEN });
    expect(beat.status).toBe(401);
  });

  it("answers 400 to a body that is not JSON", async () => {
    const answer = await post("observer-ingest", "{not json", {
      authorization: bearer("obs_whatever"),
    });
    expect(answer.status).toBe(400);
    expect((answer.body as Record<string, string>)["code"]).toBe("malformed_request");
  });

  it("passes Retry-After through as a header a client can read", async () => {
    const code = backend.issueActivationCode();
    const activated = await post("observer-activate", activationRequest({ activation_code: code }));
    const token = (activated.body as Record<string, string>)["source_token"] as string;

    backend.push({ kind: "rate_limit", retryAfterSeconds: 12 });
    const limited = await post("observer-ingest", batch([event()]), {
      authorization: bearer(token),
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("12");
  });
});

describe("silence, which is what a lost response actually looks like", () => {
  it("destroys the connection instead of answering", async () => {
    const code = backend.issueActivationCode();
    const activated = await post("observer-activate", activationRequest({ activation_code: code }));
    const token = (activated.body as Record<string, string>)["source_token"] as string;

    backend.push({ kind: "drop_after_processing" });
    const sent = batch([event(), event()]);

    await expect(post("observer-ingest", sent, { authorization: bearer(token) })).rejects.toThrow();

    /*
     * The client saw nothing. The server stored everything. Resending is the
     * only thing the client can do, and the stable event_id makes it safe.
     */
    const sourceId = backend.sourceIdForToken(token) as string;
    expect(backend.storedCount(sourceId)).toBe(2);

    const retry = await post("observer-ingest", sent, { authorization: bearer(token) });
    expect(retry.status).toBe(200);
    expect((retry.body as Record<string, number>)["duplicate"]).toBe(2);
    expect(backend.storedCount(sourceId)).toBe(2);
  });
});
