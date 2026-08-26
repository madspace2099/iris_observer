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
 * mocked to capture what the route actually wrote, and the two are compared.
 * `admittedHeaders` itself is deliberately NOT mocked — it is the code under
 * test.
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
const { POST } = await import("../src/app/api/ask/route");
const { resetEnvironmentCache } = await import("../src/lib/env");

const gateMock = vi.mocked(gate);

/** An admission exactly as the real gate would produce one. */
function admission(): GateModule.Admitted {
  return {
    ok: true,
    question: "How did Northgate showroom perform today?",
    subject: "0123456789abcdef",
    clientHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    requestId: REQUEST_ID,
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

const body = () =>
  new Request("https://observer.test/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenantSlug: "alpha",
      projectSlug: "northgate",
      question: "How did Northgate showroom perform today?",
    }),
  });

beforeEach(() => {
  written.requestIds.length = 0;
  gateMock.mockReset();
  // Evidence-only, so the route answers from the deterministic composer with no
  // network. That is also the fallback branch the header must cover.
  process.env["OBSERVER_AI_ENABLED"] = "false";
  delete process.env["OPENAI_API_KEY"];
  resetEnvironmentCache();
});

describe("the response names the audit row it created", () => {
  it("returns the header, and it is the id admission wrote", async () => {
    gateMock.mockResolvedValue(admission());

    const response = await POST(body());

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

    const response = await POST(body());
    const payload = (await response.json()) as { status: { live: boolean } };

    expect(payload.status.live).toBe(false);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(REQUEST_ID);
  });

  it("does not change the response body contract", async () => {
    gateMock.mockResolvedValue(admission());

    const response = await POST(body());
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

  it("is absent when the request is refused before admission", async () => {
    /*
     * Nothing was written, so there is no row to name. A header pointing at a
     * row that does not exist is worse than no header: the verifier would look
     * it up, find nothing, and report "proof void" for a request that was
     * correctly refused.
     */
    for (const refusal of [
      { ok: false as const, httpStatus: 401, message: "Sign in first.", retryAfterSeconds: null },
      { ok: false as const, httpStatus: 429, message: "Too many.", retryAfterSeconds: 30 },
      { ok: false as const, httpStatus: 503, message: "Misconfigured.", retryAfterSeconds: null },
    ]) {
      gateMock.mockResolvedValue(refusal);
      const response = await POST(body());

      expect(response.status).toBe(refusal.httpStatus);
      expect(response.headers.get(REQUEST_ID_HEADER)).toBeNull();
      expect(written.requestIds).toEqual([]);
    }
  });

  it("exposes nothing but the id", async () => {
    gateMock.mockResolvedValue(admission());

    const response = await POST(body());
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

/*
 * The route above is one of four that admit. The rest are asserted structurally
 * rather than by driving each handler, because the property is about WHERE the
 * call sits — after admission, never before — and that is a fact about the
 * source, not about a response.
 */
describe("every admitting route names its row, and no refusal does", () => {
  const ROUTES = [
    "src/app/api/ask/route.ts",
    "src/app/api/ask/stream/route.ts",
    "src/app/api/observer/voice/session/route.ts",
    "src/app/api/observer/voice/tool/route.ts",
  ] as const;

  const source = (file: string) => readFileSync(join(process.cwd(), "apps/web", file), "utf8");

  it("uses the shared helper in all four, never a hand-built header", () => {
    for (const file of ROUTES) {
      const text = source(file);
      expect(text).toContain("admittedHeaders(admitted)");
      // A literal header name anywhere but the one definition is a second
      // spelling waiting to drift.
      expect(text).not.toContain('"X-Observer-Request-Id"');
    }
  });

  it("attaches it only after the admission guard", () => {
    for (const file of ROUTES) {
      const text = source(file);
      const guard = text.indexOf("if (!admitted.ok)");
      expect(guard).toBeGreaterThan(-1);

      // Every use sits after the guard closes, so no refusal can carry it.
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

  it("defines the header name exactly once, in the gate", () => {
    const gateSource = source("src/lib/ai/gate.ts");
    expect(gateSource).toContain('export const REQUEST_ID_HEADER = "X-Observer-Request-Id";');
    expect(gateSource.match(/"X-Observer-Request-Id"/g)).toHaveLength(1);
  });
});
