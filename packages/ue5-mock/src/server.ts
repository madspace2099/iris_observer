import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { MockObserverBackend, MockOutcome } from "./backend";
import { OBSERVER_ROUTES } from "@observer/contracts/ue5";

/**
 * AN HTTP SKIN OVER THE REFERENCE BACKEND. MOCK-ONLY.
 *
 * The backend is a plain object and every one of our own tests drives it
 * directly, which is faster and easier to read. This exists for the other
 * consumer: an Unreal transport cannot call a TypeScript method, and UE-OBS-007
 * needs something to point `ingest_url` at.
 *
 * ## Two properties it is required to keep
 *
 * **Loopback only.** It binds `127.0.0.1` and nothing else. A mock that answered
 * on a LAN address would be a fake analytics endpoint sitting on a developer's
 * network, and eventually a real showroom build would find it.
 *
 * **No egress, ever.** Nothing in this package makes an outbound request. There
 * is no client, no fetch, no telemetry, no "phone home to check for updates".
 * `no-egress.test.ts` reads every source file in the package and fails if one
 * appears.
 *
 * A dropped outcome destroys the socket without writing a response, because
 * that is what the client has to survive: not an error status, but silence.
 */

export interface MockServer {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

/**
 * Imported, not restated. These path strings used to be written here as well as
 * inside `buildOpenApiDocument()`, which is one fact in two places — and the one
 * place a divergence would show up is a deployment, not a test.
 */
const ROUTES = OBSERVER_ROUTES;

export async function startMockServer(backend: MockObserverBackend, port = 0): Promise<MockServer> {
  const server = createServer((request, response) => {
    handle(backend, request, response).catch(() => {
      /* A handler that throws must not take the process with it. */
      if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "unavailable", message: "mock failure" }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () => closeServer(server),
  };
}

async function handle(
  backend: MockObserverBackend,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json", allow: "POST" });
    response.end(JSON.stringify({ code: "malformed_request", message: "POST only" }));
    return;
  }

  const path = (request.url ?? "").split("?")[0] ?? "";
  const authorization = request.headers.authorization ?? null;
  const raw = await readBody(request);

  let body: unknown = null;
  try {
    body = raw.length === 0 ? null : JSON.parse(raw);
  } catch {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        code: "malformed_request",
        message: "The body is not JSON.",
        batch_id: null,
        retry_after_seconds: null,
      }),
    );
    return;
  }

  let outcome: MockOutcome;
  switch (path) {
    case ROUTES.activate:
      outcome = backend.activate(body);
      break;
    case ROUTES.ingest:
      outcome = backend.ingest(authorization, body);
      break;
    case ROUTES.heartbeat:
      outcome = backend.heartbeat(authorization, body);
      break;
    default:
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "malformed_request", message: "No such endpoint" }));
      return;
  }

  if (outcome.kind === "dropped") {
    /* Silence, not a status. This is what a lost response actually looks like. */
    request.socket.destroy();
    return;
  }

  response.writeHead(outcome.status, { ...outcome.headers });
  response.end(JSON.stringify(outcome.body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    /*
     * BYTES, NOT CHARACTERS — and the difference is not pedantry.
     *
     * This used to call `setEncoding("utf8")` and accumulate `chunk.length`,
     * which counts UTF-16 code units, against a ceiling named in bytes. Every
     * non-ASCII character in a payload is then undercounted: a body of Hungarian
     * or Japanese property values passes a limit it exceeds, and — worse for the
     * contract — a client computing `max_batch_bytes` in real UTF-8 and a server
     * checking code units disagree about whether the same batch fits.
     *
     * `serialisedBytes()` in `ingestion.ts` counts real UTF-8. This now agrees
     * with it. Any adapter copying this function inherits the agreement rather
     * than the bug.
     */
    request.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
      /* A hard ceiling before anything is parsed. The harness is not a target,
       * but a mock that can be exhausted by one request is a mock that will be. */
      if (bytes > 32 * 1_024 * 1_024) {
        request.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}
