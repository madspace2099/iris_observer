import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VIEWERS } from "@observer/synthetic";

import type * as GateModule from "../src/lib/ai/gate";
import type * as QuotaModule from "../src/lib/ai/quota";

/**
 * `X-Observer-Request-Id`, and the reason it exists.
 *
 * Proving that a deployment writes the audit row it is supposed to write means
 * finding that row afterwards. The deployed `3f298a6` build returns its request
 * id nowhere — not in the body, not in a header, not on a log line — so its
 * verification has to correlate on a time window plus properties the operator
 * controlled. That establishes "exactly one matching row exists and nothing
 * else was written in the window". It is NOT the claim "this row came from that
 * request", and the rollout documentation now says so in those words.
 *
 * From this build on, the response names its own row. The whole value of that
 * depends on one property: THE HEADER AND THE DATABASE MUST CARRY THE SAME ID.
 * A header holding a freshly minted UUID would look identical and point at
 * nothing.
 *
 * So the gate is mocked to hand back a known admission, `completeAiRequest` is
 * mocked to capture what each route actually wrote, and the two are compared —
 * for ALL FOUR admitting routes, by driving their handlers. `admittedHeaders`
 * itself is deliberately NOT mocked: it is the code under test.
 *
 * An earlier version of this file drove `/api/ask` and asserted the other three
 * by reading their source. Source order is worth checking — a header attached
 * before the admission guard is a structural mistake a reader can miss — but it
 * is not behaviour, and the audit was right that behaviour is what matters.
 */

const REQUEST_ID = "3f5b9c21-8a4d-4e77-9c11-0d2e4a6b8c30";

/** What `completeAiRequest` was called with, per test. */
const written = vi.hoisted(() => ({ requestIds: [] as string[] }));

vi.mock("../src/lib/ai/gate", async (importOriginal) => {
  const actual = await importOriginal<typeof GateModule>();
  return {
    ...actual,
    // Real `admittedHeaders`, real `REQUEST_ID_HEADER`, mocked `gate` only.
    gate: vi.fn(),
  };
});

vi.mock("../src/lib/ai/quota", async (importOriginal) => {
  const actual = await importOriginal<typeof QuotaModule>();
  return {
    ...actual,
    completeAiRequest: vi.fn(async (result: { requestId: string }) => {
      written.requestIds.push(result.requestId);
      return "completed" as const;
    }),
  };
});

const { gate, REQUEST_ID_HEADER, admittedHeaders } = await import("../src/lib/ai/gate");
const { POST: askPost } = await import("../src/app/api/ask/route");
const { POST: streamPost } = await import("../src/app/api/ask/stream/route");
const { POST: voiceSessionPost } = await import("../src/app/api/observer/voice/session/route");
const { POST: voiceToolPost } = await import("../src/app/api/observer/voice/tool/route");
const { resetEnvironmentCache } = await import("../src/lib/env");

const gateMock = vi.mocked(gate);

/** An admission exactly as the real gate would produce one. */
function admission(): GateModule.Admitted {
  return {
    ok: true,
    question: "How did this showroom perform this month?",
    subject: "0123456789abcdef",
    clientHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    requestId: REQUEST_ID,
    /*
     * Whose OpenAI connection the route may resolve. An identifier, not a key:
     * the gate carries the account and the route asks the credential service
     * for that account's credential immediately before the model is built.
     */
    accountId: "acct_test_developer",
    context: {
      viewer: VIEWERS.developer,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      projectLabel: "Northgate",
      periodLabel: "Quarter to date",
      period: "quarter_to_date",
      agentIds: [],
      unitCode: null,
      meetingId: null,
      safetyIdentifier: "obs_test",
      depth: "standard",
    },
  };
}

const REFUSALS = [
  { ok: false as const, httpStatus: 401, message: "Sign in first.", retryAfterSeconds: null },
  { ok: false as const, httpStatus: 429, message: "Too many.", retryAfterSeconds: 30 },
  { ok: false as const, httpStatus: 503, message: "Misconfigured.", retryAfterSeconds: null },
] as const;

function request(body: unknown, path = "/api/ask"): Request {
  return new Request(`https://observer.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ASK_BODY = {
  tenantSlug: "alpha",
  projectSlug: "northgate",
  question: "How did this showroom perform this month?",
};

beforeEach(() => {
  written.requestIds.length = 0;
  gateMock.mockReset();
  // Evidence-only: no model call, no network. This is also the deterministic
  // fallback branch, and voice is unavailable without a key — which is exactly
  // the post-admission 503 branch the voice session route must still label.
  process.env["OBSERVER_AI_ENABLED"] = "false";
  delete process.env["OPENAI_API_KEY"];
  resetEnvironmentCache();
});

/* --- 1. /api/ask, in depth ----------------------------------------------- */

describe("/api/ask names the audit row it created", () => {
  it("returns the header, and it is the id admission wrote", async () => {
    gateMock.mockResolvedValue(admission());

    const response = await askPost(request(ASK_BODY));

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);

    // The claim that matters: the same id reached the database.
    expect(written.requestIds).toEqual([REQUEST_ID]);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(written.requestIds[0]);
  });

  it("covers the deterministic-fallback outcome, not only a model answer", async () => {
    /*
     * `OBSERVER_AI_ENABLED=false` means no model is called at all: this run IS
     * the deterministic composer path. A header attached only to model-authored
     * answers would leave the verifier unable to correlate exactly the outcome
     * most likely on a demonstration deployment.
     */
    gateMock.mockResolvedValue(admission());

    const response = await askPost(request(ASK_BODY));
    const payload = (await response.json()) as { status: { live: boolean } };

    expect(payload.status.live).toBe(false);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);
  });

  it("does not change the response body contract", async () => {
    gateMock.mockResolvedValue(admission());

    const response = await askPost(request(ASK_BODY));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual([
      "answer",
      "demoData",
      "question",
      "refusal",
      "sources",
      "status",
      "toolsUsed",
    ]);
    // The id is a header. It must not have leaked into the body.
    expect(JSON.stringify(payload)).not.toContain(REQUEST_ID);
  });

  it("exposes nothing but the id", async () => {
    gateMock.mockResolvedValue(admission());

    const response = await askPost(request(ASK_BODY));
    const headers = Object.fromEntries(response.headers.entries());

    expect(headers[REQUEST_ID_HEADER.toLowerCase()]).toBe(REQUEST_ID);
    const rendered = JSON.stringify(headers);
    // Not the subject, not the client fingerprint, not a key identifier.
    expect(rendered).not.toContain("0123456789abcdef");
    expect(rendered).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(rendered).not.toMatch(/pepper|secret|token|apikey|api-key/i);
  });

  it("is a v4 UUID and nothing derived from the viewer", () => {
    const headers = admittedHeaders(admission());
    expect(Object.keys(headers)).toEqual([REQUEST_ID_HEADER]);
    expect(headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

/* --- 2. every admitting route, by behaviour ------------------------------ */

/**
 * The four handlers, each with a body it accepts and one post-admission branch
 * this environment reaches deterministically.
 *
 * The voice routes' branches are not their happy paths — no key is configured,
 * so the session route takes its 503 and the tool route is asked for an
 * analysis that does not exist. That is deliberate: a response produced AFTER
 * admission must name its row whatever it then decides to say, and an error
 * branch is exactly where a header is most likely to be forgotten.
 */
const ROUTES = [
  {
    name: "/api/ask",
    handler: askPost,
    body: ASK_BODY,
    path: "/api/ask",
    expectStatus: 200,
    completes: true,
  },
  {
    name: "/api/ask/stream",
    handler: streamPost,
    body: ASK_BODY,
    path: "/api/ask/stream",
    expectStatus: 200,
    completes: false,
  },
  {
    name: "voice session",
    handler: voiceSessionPost,
    body: { tenantSlug: "alpha", projectSlug: "northgate" },
    path: "/api/observer/voice/session",
    expectStatus: 503,
    completes: false,
  },
  {
    name: "voice tool",
    handler: voiceToolPost,
    // `period` is required by AskBodySchema and this route parses the body
    // ITSELF, before the gate — so an incomplete body would 400 pre-admission
    // and never reach the branch under test.
    body: {
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "quarter_to_date",
      tool: "no_such_analysis",
    },
    path: "/api/observer/voice/tool",
    expectStatus: 400,
    completes: false,
  },
] as const;

describe.each(ROUTES)("$name", (route) => {
  it("exposes the header on an admitted response", async () => {
    gateMock.mockResolvedValue(admission());

    const response = await route.handler(request(route.body, route.path));

    expect(response.status).toBe(route.expectStatus);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);

    // Release the stream so the run does not leave one open.
    await response.body?.cancel();
  });

  it("does not expose it on a pre-admission rejection", async () => {
    for (const refusal of REFUSALS) {
      gateMock.mockResolvedValue(refusal);
      const response = await route.handler(request(route.body, route.path));

      expect(response.status).toBe(refusal.httpStatus);
      expect(response.headers.get(REQUEST_ID_HEADER)).toBeNull();
      expect(written.requestIds).toEqual([]);
      await response.body?.cancel();
    }
  });

  it("uses the same id for the header and for the audit, where it completes", async () => {
    gateMock.mockResolvedValue(admission());

    const response = await route.handler(request(route.body, route.path));
    const header = response.headers.get(REQUEST_ID_HEADER);

    if (route.completes) {
      expect(written.requestIds).toEqual([REQUEST_ID]);
      expect(header).toBe(written.requestIds[0]);
    } else {
      // This branch writes no terminal result — the row stays `started`, which
      // is the honest record of a request that did not produce an answer. The
      // header still names it, so the operator can find it either way.
      expect(header).toBe(admission().requestId);
    }
    await response.body?.cancel();
  });
});

describe("the streamed route keeps the header on the response head", () => {
  it("sets it alongside the event-stream headers, before the first frame", async () => {
    /*
     * A reader that abandons the stream half way still has the id: it goes out
     * with the head, not as a trailer.
     */
    gateMock.mockResolvedValue(admission());

    const response = await streamPost(request(ASK_BODY, "/api/ask/stream"));

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);

    await response.body?.cancel();
  });
});

/* --- 3. the structural guards, kept as a second net ---------------------- */

/*
 * Behaviour is asserted above. These remain because they catch a class the
 * handler tests cannot: a NEW response branch added later without the header,
 * or a second spelling of the header name.
 */
describe("every admitting route uses the shared helper, after the guard", () => {
  const FILES = [
    "src/app/api/ask/route.ts",
    "src/app/api/ask/stream/route.ts",
    "src/app/api/observer/voice/session/route.ts",
    "src/app/api/observer/voice/tool/route.ts",
  ] as const;

  const source = (file: string) => readFileSync(join(process.cwd(), "apps/web", file), "utf8");

  it("never hand-builds the header name", () => {
    for (const file of FILES) {
      const text = source(file);
      expect(text).toContain("admittedHeaders(admitted)");
      expect(text).not.toContain('"X-Observer-Request-Id"');
    }
  });

  it("attaches it only after the admission guard", () => {
    for (const file of FILES) {
      const text = source(file);
      const guard = text.indexOf("if (!admitted.ok)");
      expect(guard).toBeGreaterThan(-1);

      let at = text.indexOf("admittedHeaders(admitted)");
      let uses = 0;
      while (at !== -1) {
        expect(at).toBeGreaterThan(guard);
        uses += 1;
        at = text.indexOf("admittedHeaders(admitted)", at + 1);
      }
      expect(uses).toBeGreaterThan(0);
    }
  });

  it("covers every post-admission response in each route", () => {
    /*
     * The count that would drift. Every `NextResponse.json` or `new Response`
     * after the guard must carry the helper; if somebody adds a branch and
     * forgets, these numbers stop matching.
     */
    for (const file of FILES) {
      const text = source(file);
      const after = text.slice(text.indexOf("if (!admitted.ok)"));
      const responses = (after.match(/NextResponse\.json\(|new Response\(/g) ?? []).length;
      const headers = (after.match(/admittedHeaders\(admitted\)/g) ?? []).length;
      // One response inside the guard itself, which must NOT have the header.
      expect(headers).toBe(responses - 1);
    }
  });

  it("defines the header name exactly once, in the gate", () => {
    const gateSource = source("src/lib/ai/gate.ts");
    expect(gateSource).toContain('export const REQUEST_ID_HEADER = "X-Observer-Request-Id";');
    expect(gateSource.match(/"X-Observer-Request-Id"/g)).toHaveLength(1);
  });
});
