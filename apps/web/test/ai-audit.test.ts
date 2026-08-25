import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VIEWERS } from "@observer/synthetic";

import { fakeModel, type ScriptedTurn } from "../src/lib/ai/fake-provider";
import type * as ProviderModule from "../src/lib/ai/provider";
import type { ModelResolution, ObserverModel } from "../src/lib/ai/provider";
import type { TerminalResult } from "../src/lib/ai/quota";
import { resetLimits } from "../src/lib/ai/limits";
import { resetEnvironmentCache } from "../src/lib/env";

/**
 * The audit, and the two things it got wrong.
 *
 * **It could not say who wrote the prose.** `answered · gpt-5.6-sol` was
 * recorded whether a model had written a word or the deterministic composer
 * had. The answer sheet was already honest about it — "written by the tools" —
 * so the screen and the durable record disagreed, and the durable record is the
 * one somebody reads a week later when they cannot re-run the question.
 *
 * **It lost requests.** The Preview admitted 153 and recorded 133. The write
 * was fired and forgotten after the response, and a serverless instance may
 * freeze the moment it has responded.
 *
 * Both are asserted here against the real pipeline. What is faked is the vendor
 * and the network, never the agent, the guards or the classifier.
 */

const resolution = vi.hoisted(() => ({ current: null as ModelResolution | null }));

vi.mock("../src/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderModule>();
  return {
    ...actual,
    resolveModel: (): ModelResolution =>
      resolution.current ?? {
        ok: false,
        configurationFault: false,
        status: {
          provider: "evidence-only",
          model: "none",
          live: false,
          reason: "no model key is configured",
        },
      },
  };
});

const { ask } = await import("../src/lib/ai/agent");
const { classify } = await import("../src/app/api/ask/route");
const { completeAiRequest } = await import("../src/lib/ai/quota");

const CONTEXT = {
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  projectLabel: "Northgate",
  periodLabel: "Quarter to date",
  period: "quarter_to_date" as const,
  agentIds: ["agt_monika", "agt_akhilesh", "agt_jan", "agt_lucia"],
  unitCode: null,
  meetingId: null,
  safetyIdentifier: "obs_test",
  depth: "standard" as const,
};

const FIRST_BUNDLE = "ev_1_summarize_showroom_period";

const PLAN: ScriptedTurn = {
  toolCalls: [{ name: "summarize_showroom_period", argumentsJson: "{}" }],
};

function composed(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    answer: "Core coverage held across the period.",
    headline: "Coverage steady, depth moved",
    findings: [{ statement: "Core coverage", value: "78%", evidenceRefs: [FIRST_BUNDLE] }],
    interpretation:
      "Coverage is stable in this sample, and median depth is the figure associated with the change.",
    limitations: ["Some sessions carry no per-step timing."],
    recommendedActions: [],
    followUpQuestions: ["Which sections are skipped most often?"],
    orbState: "insight",
    ...overrides,
  });
}

/** A model that is present, allowed and scripted. */
function useModel(script: readonly ScriptedTurn[]): ObserverModel {
  const model = fakeModel({ script });
  resolution.current = {
    ok: true,
    model,
    status: { provider: "fake", model: "fake-model", live: true, reason: null },
  };
  return model;
}

beforeEach(() => {
  resolution.current = null;
  resetLimits();
  resetEnvironmentCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* --- 1. who wrote the prose -------------------------------------------------------- */

describe("the audit says who wrote the answer", () => {
  it("classifies a model-authored answer as `model`, and names the author", async () => {
    useModel([PLAN, { text: composed() }]);
    const outcome = await ask("Summarise the period.", CONTEXT);

    expect(outcome.status.live).toBe(true);
    expect(classify(outcome)).toEqual({ responseSource: "model", modelAuthored: true });
    expect(outcome.diagnostics.fallbackReason).toBeNull();
    expect(outcome.diagnostics.modelAttempted).toBe(true);
  });

  it("classifies an attempted model that fell back as `deterministic_composer`", async () => {
    // The defect, in one assertion: this used to be recorded as `answered ·
    // gpt-5.6-sol`, which claims a model wrote prose it never saw.
    useModel([PLAN, { failWith: "unavailable" }]);
    const outcome = await ask("Summarise the period.", CONTEXT);

    expect(outcome.answer).not.toBeNull();
    expect(classify(outcome)).toEqual({
      responseSource: "deterministic_composer",
      modelAuthored: false,
    });
    expect(outcome.diagnostics.fallbackReason).toBe("composition_failed");
    // Attempted, and honestly so — the fact is kept, under an accurate name.
    expect(outcome.diagnostics.modelAttempted).toBe(true);
  });

  it("classifies a deployment with no model at all as `deterministic_composer`", async () => {
    const outcome = await ask("Summarise the period.", CONTEXT);

    expect(outcome.answer).not.toBeNull();
    expect(classify(outcome).responseSource).toBe("deterministic_composer");
    expect(outcome.diagnostics.fallbackReason).toBe("model_unavailable");
    expect(outcome.diagnostics.modelAttempted).toBe(false);
  });

  it("distinguishes prose the schema rejected from prose the output guard rejected", async () => {
    useModel([PLAN, { text: "{ not json" }]);
    const rejected = await ask("Summarise the period.", CONTEXT);
    expect(rejected.diagnostics.fallbackReason).toBe("schema_rejected");

    /*
     * Valid JSON, and a causal claim inside it. The guard catches what the
     * schema cannot: prose that parses and still breaks the product's rule.
     * Both end as the deterministic composer's words, and an operator reading
     * "my model keeps being overruled" needs to know which one is happening.
     */
    useModel([
      PLAN,
      { text: composed({ interpretation: "Depth fell because the agents skipped the tour." }) },
    ]);
    const guarded = await ask("Summarise the period.", CONTEXT);
    expect(guarded.diagnostics.fallbackReason).toBe("output_guard");

    for (const outcome of [rejected, guarded]) {
      expect(classify(outcome).responseSource).toBe("deterministic_composer");
      expect(classify(outcome).modelAuthored).toBe(false);
    }
  });

  it("classifies a policy refusal as `refusal`, not as a provider failure", async () => {
    /*
     * A refusal on an evidence-only deployment reports `live: false` like every
     * other request on it. Separating refusal from failure on that flag — the
     * obvious move — would file this as an outage and send somebody looking for
     * one. The reason code is what separates them.
     */
    const outcome = await ask("   ", CONTEXT);

    expect(outcome.answer).toBeNull();
    expect(outcome.refusal).not.toBeNull();
    expect(classify(outcome)).toEqual({ responseSource: "refusal", modelAuthored: false });
  });

  it("classifies a misconfigured provider as `failure`", async () => {
    resolution.current = {
      ok: false,
      configurationFault: true,
      status: { provider: "openai", model: "gpt-5.6-sol", live: false, reason: "invalid key" },
    };
    const outcome = await ask("Summarise the period.", CONTEXT);

    expect(outcome.answer).toBeNull();
    expect(classify(outcome)).toEqual({ responseSource: "failure", modelAuthored: false });
    expect(outcome.diagnostics.fallbackReason).toBe("provider_misconfigured");
  });

  it("prefers the configuration fault over whatever branch reported the fallback", async () => {
    // A dead key surfaces as a composition failure at the branch that catches
    // it. "The composing turn threw" sends an operator to look at timeouts; the
    // key is the thing they can actually fix.
    useModel([PLAN, { failWith: "configuration" }]);
    const outcome = await ask("Summarise the period.", CONTEXT);

    expect(outcome.diagnostics.fallbackReason).toBe("provider_misconfigured");
  });
});

/* --- 2. the screen and the record cannot disagree ---------------------------------- */

describe("the audit's `modelAuthored` matches the answer sheet's `live`", () => {
  /*
   * The same fact in two places is a drift risk taken deliberately: the reader
   * has to see it and the operator has to be able to query it. This asserts
   * they agree on every branch rather than trusting that they will.
   */
  const branches: readonly { name: string; turns: readonly ScriptedTurn[] | null }[] = [
    { name: "model-authored", turns: [PLAN, { text: composed() }] },
    { name: "composition failed", turns: [PLAN, { failWith: "unavailable" }] },
    { name: "schema rejected", turns: [PLAN, { text: "{ not json" }] },
    { name: "no model configured", turns: null },
  ];

  for (const branch of branches) {
    it(`agrees on ${branch.name}`, async () => {
      if (branch.turns === null) resolution.current = null;
      else useModel(branch.turns);

      const outcome = await ask("Summarise the period.", CONTEXT);
      const { responseSource, modelAuthored } = classify(outcome);

      const liveWithAnswer = outcome.status.live && outcome.answer !== null;
      expect(modelAuthored).toBe(liveWithAnswer);
      expect(responseSource === "model").toBe(liveWithAnswer);
    });
  }
});

/* --- 3. what reaches the database -------------------------------------------------- */

describe("the terminal result carries codes, never content", () => {
  const RESULT: TerminalResult = {
    requestId: "3f1d0c2a-0000-4000-8000-000000000001",
    outcome: "answered",
    responseSource: "deterministic_composer",
    attemptedProvider: "openai",
    attemptedModel: "gpt-5.6-sol",
    modelAttempted: true,
    modelAuthored: false,
    authorModel: null,
    fallbackReason: "composition_failed",
    tools: ["summarize_showroom_period"],
    toolCalls: 1,
    inputTokens: 900,
    outputTokens: 120,
    latencyMs: 4300,
  };

  function configureSupabase(): void {
    process.env["SUPABASE_URL"] = "https://example.supabase.co";
    process.env["SUPABASE_SECRET_KEY"] = "placeholder-not-a-key-000000000000";
  }

  beforeEach(configureSupabase);

  it("sends the request id, the source and the author — and no prose", async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Promise.resolve(new Response("true", { status: 200 }));
      }),
    );

    await expect(completeAiRequest(RESULT)).resolves.toBe(true);

    expect(sent["p_request_id"]).toBe(RESULT.requestId);
    expect(sent["p_response_source"]).toBe("deterministic_composer");
    expect(sent["p_attempted_model"]).toBe("gpt-5.6-sol");
    // The whole point: a fallback must not claim an author.
    expect(sent["p_author_model"]).toBeNull();
    expect(sent["p_model_authored"]).toBe(false);
    expect(sent["p_fallback_reason"]).toBe("composition_failed");

    /*
     * Nothing in the payload may be free text a person wrote or a model
     * returned. Asserted over the whole body rather than field by field, so a
     * field added later is caught by this test instead of by a disclosure.
     */
    const body = JSON.stringify(sent).toLowerCase();
    for (const forbidden of ["question", "answer", "prompt", "interpretation", "headline"]) {
      expect(body, `the audit payload carries "${forbidden}"`).not.toContain(`"${forbidden}"`);
    }
    expect(Object.keys(sent).every((k) => k.startsWith("p_"))).toBe(true);
  });

  it("reports a miss instead of assuming the row was there", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("false", { status: 200 }))),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(completeAiRequest(RESULT)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    // Observable to an operator, and never to a browser: this is a log line.
    expect(String(warn.mock.calls[0]?.[0])).toContain("[observer.audit]");
  });

  it("keeps a PostgREST error body out of the log", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response('{"message":"relation ai_requests ...","hint":null}', { status: 400 }),
        ),
      ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(completeAiRequest(RESULT)).resolves.toBe(false);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("HTTP 400");
    expect(line).not.toContain("relation");
  });
});

/* --- 4. durability: the route waits ------------------------------------------------ */

describe("the audit write outlives the response", () => {
  /*
   * The lost-records defect, reproduced as a property rather than a hypothesis.
   *
   * A slow database is the condition under which an unawaited write is dropped:
   * the runtime freezes the instance once the response is sent, and the promise
   * dies unresolved. So the assertion is that `completeAiRequest` has not
   * settled while the write is still in flight, and that the route awaits it.
   */
  it("does not resolve before a delayed write completes", async () => {
    process.env["SUPABASE_URL"] = "https://example.supabase.co";
    process.env["SUPABASE_SECRET_KEY"] = "placeholder-not-a-key-000000000000";

    let release: (() => void) | null = null;
    const arrived = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await arrived;
        return new Response("true", { status: 200 });
      }),
    );

    let settled = false;
    const writing = completeAiRequest({
      requestId: "3f1d0c2a-0000-4000-8000-000000000002",
      outcome: "answered",
      responseSource: "model",
      attemptedProvider: "openai",
      attemptedModel: "gpt-5.6-sol",
      modelAttempted: true,
      modelAuthored: true,
      authorModel: "gpt-5.6-sol",
      fallbackReason: null,
      tools: [],
      toolCalls: 0,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 10,
    }).then((ok) => {
      settled = true;
      return ok;
    });

    // Let every already-queued microtask run. If the write were fired and
    // forgotten, this is where it would have "finished".
    await Promise.resolve();
    await Promise.resolve();
    expect(settled, "the write settled before the database answered").toBe(false);

    release?.();
    await expect(writing).resolves.toBe(true);
  });

  const web = (p: string) => readFileSync(join(process.cwd(), "apps/web", p), "utf8");

  it("is awaited by both routes, not fired and forgotten", () => {
    const route = web("src/app/api/ask/route.ts");
    const stream = web("src/app/api/ask/stream/route.ts");

    expect(route).toContain("await completeAiRequest(");
    expect(route).not.toContain("void completeAiRequest(");
    expect(route).toContain("await reportOutcome(");
    // In the streaming route the write must sit inside the generator, before
    // the stream closes — a runtime cannot freeze an instance whose response
    // body is still open.
    expect(stream).toContain("await reportOutcome(");
    expect(stream).not.toMatch(/^\s*reportOutcome\(/m);
  });
});

/* --- 5. one admitted request, one row ---------------------------------------------- */

describe("admission and the audit row are the same event", () => {
  const gate = readFileSync(join(process.cwd(), "apps/web", "src/lib/ai/gate.ts"), "utf8");
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260825205000_observer_audit_provenance.sql"),
    "utf8",
  );

  it("mints the request id before the database is called", () => {
    // Generated here rather than returned by the insert, so a retried admission
    // is recognisably the same request instead of a second one.
    const mint = gate.indexOf("const requestId = randomUUID()");
    const admit = gate.indexOf("await admitAiRequest(");
    expect(mint).toBeGreaterThan(-1);
    expect(mint).toBeLessThan(admit);
  });

  it("authorises before it admits, so a cross-tenant request leaves no row", () => {
    /*
     * The tenancy check is what makes a cross-tenant question a 404 with no
     * quota spent and no audit row — which is why the deployed reconciliation
     * may compare an admitted-request delta against an audit delta at all. A
     * refused request is not a missing record.
     */
    const authorise = gate.indexOf("await repository.resolveProject");
    const admit = gate.indexOf("await admitAiRequest(");
    expect(authorise).toBeGreaterThan(-1);
    expect(authorise).toBeLessThan(admit);
    expect(gate).toContain('deny(404, "Not found.", null)');
  });

  it("writes the row inside the transaction that consumes the quota", () => {
    // Not "after admission" — inside it. There is no ordering to get wrong and
    // no promise to lose.
    const insert = migration.indexOf("insert into observer.ai_requests");
    const consume = migration.indexOf("from observer.consume_ai_quota(");
    expect(consume).toBeGreaterThan(-1);
    expect(consume).toBeLessThan(insert);
    expect(migration).toContain("if v_allowed then");
    // A retried admission must not produce a second row.
    expect(migration).toContain("on conflict (request_id) do nothing");
    expect(migration).toContain("create unique index if not exists ai_requests_request_id_key");
  });

  it("leaves an interrupted request visible rather than absent", () => {
    expect(migration).toContain("'started'");
    expect(migration).toContain("state             = 'complete'");
  });

  it("takes the diagnostic away from the browser key", () => {
    expect(migration).toContain(
      "revoke execute on function public.observer_whoami() from anon, authenticated, public",
    );
  });
});
