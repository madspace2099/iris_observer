import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VIEWERS } from "@observer/synthetic";

import { fakeModel, type ScriptedTurn } from "../src/lib/ai/fake-provider";
import type * as ProviderModule from "../src/lib/ai/provider";
import type { ModelResolution, ObserverModel } from "../src/lib/ai/provider";
import type { TerminalResult } from "../src/lib/ai/quota";
import { resetLimits } from "../src/lib/ai/limits";

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
const { completeAiRequest, clientFingerprint, auditClientFingerprint } =
  await import("../src/lib/ai/quota");
const {
  PSEUDONYM_VERSION,
  telemetrySubject,
  pseudonymKeyId,
  describePepper,
  pepperConfigured,
  PepperMisconfiguredError,
} = await import("../src/lib/ai/identity");
const { environment, resetEnvironmentCache } = await import("../src/lib/env");

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
        return Promise.resolve(new Response(JSON.stringify("completed"), { status: 200 }));
      }),
    );

    await expect(completeAiRequest(RESULT)).resolves.toBe("completed");

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
      vi.fn(() => Promise.resolve(new Response(JSON.stringify("not_found"), { status: 200 }))),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(completeAiRequest(RESULT)).resolves.toBe("not_found");
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

    await expect(completeAiRequest(RESULT)).resolves.toBe("unreachable");
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

    /*
     * A no-op rather than `null`, and no assertion either.
     *
     * A `Promise` executor runs synchronously, so `release` is the real
     * resolver by the next statement — but TypeScript cannot see that and
     * narrows a `null` initialiser to `null` forever, making the call site
     * unreachable in the type system. Starting from a function keeps the type
     * honest without a definite-assignment assertion; the placeholder is
     * replaced before anything can call it.
     */
    let release: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await arrived;
        return new Response(JSON.stringify("completed"), { status: 200 });
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

    release();
    await expect(writing).resolves.toBe("completed");
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

  /*
   * What the migration *does* is proven against a real Postgres in
   * `supabase/test/audit-contract.test.ts` — quota consumed once per id, one
   * row, a completed record that cannot be rewritten, historical rows left
   * describing themselves. Asserting the SQL text here was a stand-in for
   * running it, and it aged into a test that broke when the design improved
   * while proving nothing about either version.
   *
   * What stays is the one guarantee that lives in this file rather than in the
   * database: the id exists before the database is called, and authorisation
   * happens before admission.
   */
  it("declares the ceiling before the migration relies on it", () => {
    expect(migration).toContain("create unique index if not exists ai_requests_request_id_key");
  });

  it("takes the diagnostic away from the browser key", () => {
    expect(migration).toContain(
      "revoke execute on function public.observer_whoami() from anon, authenticated, public",
    );
  });
});

/* --- 6. the pepper is mandatory ---------------------------------------------------- */

describe("the pseudonym key is required, and nothing stands in for it", () => {
  const USER = "usr_petra";
  const REAL = "9f2c4a7e13b58d6021ce74af8b3d905612e7ac48fd0b6931a5c8e2470df6b31a";
  const ALPHA = "tn_alpha";
  const OTHER = "5b81de3fa704c962185d3ecb47f0a29d6c53718be0af42d93167ca85be24071f";

  const request = () =>
    new Request("https://example.test/api/ask", {
      headers: {
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "Mozilla/5.0 (test)",
        "accept-language": "en-GB",
      },
    });

  function withPepper<T>(value: string | undefined, fn: () => T): T {
    const before = process.env["OBSERVER_SUBJECT_PEPPER"];
    if (value === undefined) delete process.env["OBSERVER_SUBJECT_PEPPER"];
    else process.env["OBSERVER_SUBJECT_PEPPER"] = value;
    try {
      return fn();
    } finally {
      if (before === undefined) delete process.env["OBSERVER_SUBJECT_PEPPER"];
      else process.env["OBSERVER_SUBJECT_PEPPER"] = before;
    }
  }

  /* --- 9.1 a missing pepper fails closed ---------------------------------------- */

  it("refuses when the pepper is absent, rather than inventing one", () => {
    /*
     * The whole point of the change. Two fallbacks used to live here — a
     * subkey of `SUPABASE_SECRET_KEY`, then a per-process random value — and
     * the second was the dangerous one because it *worked*: questions were
     * answered, subjects were protected, and one viewer was counted into one
     * bucket per lambda. A distributed ceiling that was not one, with nothing
     * to notice.
     */
    expect(withPepper(undefined, () => describePepper())).toEqual({
      ok: false,
      problem: "is not set",
    });
    expect(withPepper(undefined, () => pepperConfigured())).toBe(false);
    expect(() => withPepper(undefined, () => telemetrySubject(USER, ALPHA))).toThrow(
      PepperMisconfiguredError,
    );
  });

  /* --- 9.2 a weak pepper fails closed ------------------------------------------- */

  const weak: readonly { name: string; value: string; problem: RegExp }[] = [
    { name: "whitespace only", value: "   ", problem: /empty or whitespace/ },
    { name: "too short", value: "8f2c4a7e13b58d60", problem: /at least 32 bytes/ },
    { name: "exactly one byte short", value: "a".repeat(31), problem: /is 31 bytes/ },
    { name: "quoted", value: `"${REAL}"`, problem: /quotes or brackets/ },
    { name: "angle-bracketed", value: `<${REAL}>`, problem: /quotes or brackets/ },
    { name: "padded", value: ` ${REAL} `, problem: /quotes or brackets|whitespace/ },
    {
      name: "a placeholder",
      value: "change-me-change-me-change-me-change-me",
      problem: /placeholder/,
    },
    {
      name: "your-secret-here",
      value: "your-secret-here-your-secret-here-abc",
      problem: /placeholder/,
    },
  ];

  for (const scenario of weak) {
    it(`refuses a pepper that is ${scenario.name}`, () => {
      const verdict = withPepper(scenario.value, () => describePepper());
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.problem).toMatch(scenario.problem);
      expect(() => withPepper(scenario.value, () => telemetrySubject(USER, ALPHA))).toThrow(
        PepperMisconfiguredError,
      );
    });
  }

  it("accepts obvious test material only where a test is running", () => {
    /*
     * Sixty-four `a`s is what the suite injects: long enough, deterministic,
     * and unmistakably not a secret. It must pass under VITEST and fail
     * everywhere else, and the two must be the same code path or the rule is
     * untested where it matters.
     */
    const repeated = "a".repeat(64);
    expect(withPepper(repeated, () => describePepper()).ok).toBe(true);

    const vitest = process.env["VITEST"];
    const node = process.env["NODE_ENV"];
    delete process.env["VITEST"];
    process.env["NODE_ENV"] = "production";
    try {
      const verdict = withPepper(repeated, () => describePepper());
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.problem).toMatch(/too few distinct characters/);
    } finally {
      if (vitest !== undefined) process.env["VITEST"] = vitest;
      if (node === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = node;
    }
  });

  /* --- 9.3 a valid pepper is stable across instances ----------------------------- */

  it("gives one viewer one subject, whichever instance asks", () => {
    /*
     * Stability is the property the shared ceiling is built on, and it is why
     * the key may not be per-process. `describePepper` reads the environment
     * every call and holds no state, so two calls model two lambdas.
     */
    expect(withPepper(REAL, () => telemetrySubject(USER, ALPHA))).toBe(
      withPepper(REAL, () => telemetrySubject(USER, ALPHA)),
    );
    expect(withPepper(REAL, () => clientFingerprint(request()))).toBe(
      withPepper(REAL, () => clientFingerprint(request())),
    );
    expect(withPepper(REAL, () => pseudonymKeyId())).toBe(withPepper(REAL, () => pseudonymKeyId()));
  });

  /* --- 9.4 different peppers, different identifiers ------------------------------ */

  it("gives the same viewer unrelated identifiers under a different key", () => {
    expect(withPepper(REAL, () => telemetrySubject(USER, ALPHA))).not.toBe(
      withPepper(OTHER, () => telemetrySubject(USER, ALPHA)),
    );
    expect(withPepper(REAL, () => clientFingerprint(request()))).not.toBe(
      withPepper(OTHER, () => clientFingerprint(request())),
    );
    expect(withPepper(REAL, () => pseudonymKeyId())).not.toBe(
      withPepper(OTHER, () => pseudonymKeyId()),
    );
  });

  it("is not the digest an unkeyed hash would produce", async () => {
    // The original defect: `sha256(userId)` over a handful of guessable demo
    // ids is not a pseudonym, it is an index anybody can rebuild.
    const { createHash } = await import("node:crypto");
    expect(withPepper(REAL, () => telemetrySubject(USER, ALPHA))).not.toBe(
      createHash("sha256").update(USER).digest("hex").slice(0, 16),
    );
  });

  it("separates the fingerprint's fields with something a header cannot contain", () => {
    /*
     * A user-agent contains spaces, so joining three header fields with one
     * made the input ambiguous: a crafted agent could collide with a different
     * address-agent-language triple and two clients would share a bucket. NUL
     * cannot appear in a header value.
     */
    const collide = (ua: string, lang: string) =>
      withPepper(REAL, () =>
        clientFingerprint(
          new Request("https://example.test/api/ask", {
            headers: {
              "x-forwarded-for": "203.0.113.7",
              "user-agent": ua,
              "accept-language": lang,
            },
          }),
        ),
      );
    expect(collide("Mozilla/5.0 en-GB", "")).not.toBe(collide("Mozilla/5.0", "en-GB"));
  });

  /* --- 9.5 the raw pepper never leaves ------------------------------------------- */

  it("never appears in an identifier, a key id or an error", () => {
    const subject = withPepper(REAL, () => telemetrySubject(USER, ALPHA));
    const client = withPepper(REAL, () => clientFingerprint(request()));
    const keyId = withPepper(REAL, () => pseudonymKeyId());

    for (const value of [subject, client, keyId]) {
      expect(value).not.toContain(REAL);
      // Nor any workable fragment of it.
      expect(value).not.toContain(REAL.slice(0, 12));
    }
    expect(keyId).toMatch(/^[0-9a-f]{16}$/);

    const error = new PepperMisconfiguredError("is 4 bytes; at least 32 bytes are required");
    expect(error.message).not.toContain(REAL);
    expect(String(error.stack ?? "")).not.toContain(REAL);
  });

  it("never appears in the environment report a deployment logs", () => {
    /*
     * `environment()` is what writes the boot line. It reports the key *id*, so
     * a rotation leaves a trace — and must never report the key.
     */
    const report = withPepper(REAL, () => {
      resetEnvironmentCache();
      return environment();
    });
    const serialised = JSON.stringify(report);
    expect(serialised).not.toContain(REAL);
    expect(serialised).not.toContain(REAL.slice(0, 12));
    expect(report.problems.join(" ")).toContain(withPepper(REAL, () => pseudonymKeyId()));
    resetEnvironmentCache();
  });

  /* --- 9.6 no model is called when validation fails ------------------------------ */

  it("refuses at the gate, before the quota, the audit or any model call", () => {
    /*
     * Asserted on the gate's source order rather than by driving a request,
     * because the claim is about *sequence*: the refusal has to happen before
     * anything is spent, and a behavioural test that merely observes a refusal
     * cannot tell whether a quota unit was consumed on the way to it.
     */
    const gate = readFileSync(join(process.cwd(), "apps/web", "src/lib/ai/gate.ts"), "utf8");

    const check = gate.indexOf("const pepper = describePepper()");
    const authorise = gate.indexOf("await repository.resolveProject");
    const allowance = gate.indexOf("const verdict = checkAllowance");
    const admit = gate.indexOf("await admitAiRequest(");

    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(authorise);
    expect(check).toBeLessThan(allowance);
    expect(check).toBeLessThan(admit);
    expect(gate).toContain("if (!pepper.ok)");

    /*
     * And the model is downstream of the gate entirely: both routes refuse on
     * `admitted.ok` before `ask` is reached. `ai-security.test.ts` asserts that
     * pairing; what matters here is that the pepper check is inside the gate
     * rather than somewhere the model call could precede.
     */
    const route = readFileSync(join(process.cwd(), "apps/web", "src/app/api/ask/route.ts"), "utf8");
    expect(route.indexOf("admitted.ok")).toBeLessThan(route.indexOf("await ask("));
  });
});

/* --- 7. pseudonyms do not cross tenants -------------------------------------------- */

describe("a durable pseudonym is scoped to one tenant", () => {
  const USER = "usr_petra";
  const PEPPER = "9f2c4a7e13b58d6021ce74af8b3d905612e7ac48fd0b6931a5c8e2470df6b31a";
  const ALPHA = "tn_alpha";
  const BETA = "tn_beta";

  const request = () =>
    new Request("https://example.test/api/ask", {
      headers: {
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "Mozilla/5.0 (test)",
        "accept-language": "en-GB",
      },
    });

  function withPepper<T>(value: string, fn: () => T): T {
    const before = process.env["OBSERVER_SUBJECT_PEPPER"];
    process.env["OBSERVER_SUBJECT_PEPPER"] = value;
    try {
      return fn();
    } finally {
      if (before === undefined) delete process.env["OBSERVER_SUBJECT_PEPPER"];
      else process.env["OBSERVER_SUBJECT_PEPPER"] = before;
    }
  }

  it("gives the same viewer the same subject inside one tenant", () => {
    expect(withPepper(PEPPER, () => telemetrySubject(USER, ALPHA))).toBe(
      withPepper(PEPPER, () => telemetrySubject(USER, ALPHA)),
    );
  });

  it("gives the same viewer a different subject in another tenant", () => {
    /*
     * The defect this closes. One pepper is shared by the whole deployment, so
     * a viewer-only digest made a sales agent working for two developers the
     * same string in both tenants' audit rows — a join anybody holding the
     * table could perform, and precisely the correlation the tenancy model
     * exists to prevent.
     */
    expect(withPepper(PEPPER, () => telemetrySubject(USER, ALPHA))).not.toBe(
      withPepper(PEPPER, () => telemetrySubject(USER, BETA)),
    );
  });

  it("gives the same browser a different durable fingerprint in another tenant", () => {
    expect(withPepper(PEPPER, () => auditClientFingerprint(request(), ALPHA))).not.toBe(
      withPepper(PEPPER, () => auditClientFingerprint(request(), BETA)),
    );
    // …and the same one within a tenant, or it could not be a bucket key.
    expect(withPepper(PEPPER, () => auditClientFingerprint(request(), ALPHA))).toBe(
      withPepper(PEPPER, () => auditClientFingerprint(request(), ALPHA)),
    );
  });

  it("keeps the global fingerprint global, and out of the durable row", () => {
    /*
     * Two values, two jobs. The global one keys the per-client hourly ceiling —
     * catching one browser across two tenants is that ceiling's entire purpose,
     * and a scoped value cannot do it. It must therefore stay tenant-blind, and
     * must never be what the audit stores.
     */
    const global = withPepper(PEPPER, () => clientFingerprint(request()));
    expect(global).toBe(withPepper(PEPPER, () => clientFingerprint(request())));
    expect(global).not.toBe(withPepper(PEPPER, () => auditClientFingerprint(request(), ALPHA)));
    expect(global).not.toBe(withPepper(PEPPER, () => auditClientFingerprint(request(), BETA)));

    // The gate stores the scoped one. Asserted on the source, because the
    // claim is about which of two values reaches the database.
    const gate = readFileSync(join(process.cwd(), "apps/web", "src/lib/ai/gate.ts"), "utf8");
    expect(gate).toContain("auditClientHash,");
    expect(gate).toContain("auditClientFingerprint(request, tenantId)");
    const quota = readFileSync(join(process.cwd(), "apps/web", "src/lib/ai/quota.ts"), "utf8");
    expect(quota).toContain("p_audit_client_hash: admission.auditClientHash");
    expect(quota).not.toContain("p_audit_client_hash: admission.clientHash");
  });

  it("scopes by the authorised tenant, never by the slug in the request", () => {
    /*
     * A caller who chooses the scoping input chooses not to be scoped: two
     * spellings of one slug would be two namespaces, and a slug the viewer has
     * no grant on would be a namespace they picked. The canonical id is
     * assigned from the repository's answer, after it has refused anything they
     * may not see.
     */
    const gate = readFileSync(join(process.cwd(), "apps/web", "src/lib/ai/gate.ts"), "utf8");

    const authorise = gate.indexOf("await repository.resolveProject");
    const assign = gate.indexOf("tenantId = String(resolved.tenant.id)");
    const useSubject = gate.indexOf("telemetrySubject(viewer.userId, tenantId)");
    const useClient = gate.indexOf("auditClientFingerprint(request, tenantId)");

    expect(authorise).toBeGreaterThan(-1);
    expect(assign).toBeGreaterThan(authorise);
    expect(useSubject).toBeGreaterThan(assign);
    expect(useClient).toBeGreaterThan(assign);

    // The untrusted slug is never the scoping input.
    expect(gate).not.toContain("telemetrySubject(viewer.userId, body.data.tenantSlug)");
    expect(gate).not.toContain("auditClientFingerprint(request, body.data.tenantSlug)");
  });

  it("records which derivation made them, beside which key", () => {
    /*
     * `key_id` names the secret. Tenant-scoping changed every pseudonym while
     * leaving the pepper untouched, so a row carrying only a key id could not
     * say whether its subject was comparable with the row above it.
     */
    expect(PSEUDONYM_VERSION).toBe(2);
    const quota = readFileSync(join(process.cwd(), "apps/web", "src/lib/ai/quota.ts"), "utf8");
    expect(quota).toContain("p_pseudonym_version: admission.pseudonymVersion");
  });
});

/* --- 8. the global fingerprint did not change ------------------------------- */

describe("the global client fingerprint is byte-for-byte what it was", () => {
  /*
   * A regression vector, because a claim about which buckets survive a deploy
   * is only as good as the value that keys them.
   *
   * `clientFingerprint` was refactored into a shared helper taking a scope
   * string. With scope "client" the hashed input is
   * `client\u0000<addr>\u0000<ua>\u0000<lang>` — character for character what
   * it was before the refactor. So the per-client hourly bucket does NOT reset
   * when this branch deploys, and neither does the project/day bucket, whose
   * subject is the tenant and project slug. Only the session-scoped buckets
   * restart, because only `telemetrySubject` changed.
   *
   * The expected digest below is pinned. If the derivation is ever touched
   * again, this fails and whoever touched it has to say so out loud.
   */
  const PEPPER = "9f2c4a7e13b58d6021ce74af8b3d905612e7ac48fd0b6931a5c8e2470df6b31a";

  const fixed = () =>
    new Request("https://example.test/api/ask", {
      headers: {
        "x-forwarded-for": "203.0.113.7, 70.41.3.18",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "accept-language": "en-GB,en;q=0.9",
      },
    });

  function withPepper<T>(value: string, fn: () => T): T {
    const before = process.env["OBSERVER_SUBJECT_PEPPER"];
    process.env["OBSERVER_SUBJECT_PEPPER"] = value;
    try {
      return fn();
    } finally {
      if (before === undefined) delete process.env["OBSERVER_SUBJECT_PEPPER"];
      else process.env["OBSERVER_SUBJECT_PEPPER"] = before;
    }
  }

  it("matches the pinned digest for a fixed pepper and fixed headers", async () => {
    const { createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", PEPPER)
      .update(
        "client\u0000203.0.113.7\u0000Mozilla/5.0 (Windows NT 10.0; Win64; x64)\u0000en-GB,en;q=0.9",
      )
      .digest("hex")
      .slice(0, 32);

    expect(withPepper(PEPPER, () => clientFingerprint(fixed()))).toBe(expected);
  });

  it("takes only the first forwarded address, trimmed", () => {
    const one = withPepper(PEPPER, () => clientFingerprint(fixed()));
    const same = withPepper(PEPPER, () =>
      clientFingerprint(
        new Request("https://example.test/api/ask", {
          headers: {
            "x-forwarded-for": "203.0.113.7",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "accept-language": "en-GB,en;q=0.9",
          },
        }),
      ),
    );
    expect(one).toBe(same);
  });
});

/* --- 9. there is no cross-tenant "unknown" --------------------------------- */

describe("a request with no client headers is still scoped to its tenant", () => {
  /*
   * The gate's optional-request branch stored the literal string "unknown" as
   * the durable audit client hash — identical in every tenant, which is exactly
   * the cross-tenant linkable identifier the scoping work exists to remove,
   * reintroduced by a fallback nobody looked at.
   *
   * `gate` now requires a `Request`, so the branch is gone. What remains to
   * prove is behavioural: a request carrying no useful headers at all still
   * produces a value that differs between tenants.
   */
  const PEPPER = "9f2c4a7e13b58d6021ce74af8b3d905612e7ac48fd0b6931a5c8e2470df6b31a";
  const bare = () => new Request("https://example.test/api/ask");

  function withPepper<T>(value: string, fn: () => T): T {
    const before = process.env["OBSERVER_SUBJECT_PEPPER"];
    process.env["OBSERVER_SUBJECT_PEPPER"] = value;
    try {
      return fn();
    } finally {
      if (before === undefined) delete process.env["OBSERVER_SUBJECT_PEPPER"];
      else process.env["OBSERVER_SUBJECT_PEPPER"] = before;
    }
  }

  it("gives two tenants two different values for the same empty request", () => {
    const alpha = withPepper(PEPPER, () => auditClientFingerprint(bare(), "tn_alpha"));
    const beta = withPepper(PEPPER, () => auditClientFingerprint(bare(), "tn_beta"));

    expect(alpha).not.toBe(beta);
    expect(alpha).toMatch(/^[0-9a-f]{32}$/);
    expect(beta).toMatch(/^[0-9a-f]{32}$/);
  });

  it("never produces the literal that used to be stored", () => {
    const value = withPepper(PEPPER, () => auditClientFingerprint(bare(), "tn_alpha"));
    expect(value).not.toBe("unknown");
    expect(value).not.toContain("unknown");
  });
});
