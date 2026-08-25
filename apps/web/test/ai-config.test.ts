import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment, resetEnvironmentCache } from "../src/lib/env";
import { modelIsAllowed } from "../src/lib/ai/limits";
import { publicBlocker, voiceBlocker } from "../src/lib/ai/voice";
import { diagnoseServerSupabase, resolveServerSupabase } from "../src/lib/supabase-env";
import { consumeSharedQuota } from "../src/lib/ai/quota";
import { SHARED_REFUSAL_TEXT } from "../src/lib/ai/gate";
import { safetyIdentifier, telemetrySubject } from "../src/lib/ai/identity";
import { addUsage } from "../src/lib/ai/telemetry";

/**
 * The model configuration, validated.
 *
 * These are the variables an operator sets on Vercel at three in the afternoon
 * with a demonstration at five. Every one of them either works, or says clearly
 * what is wrong with it — never silently does something else.
 */

const KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_TEXT_MODEL",
  "OPENAI_FAST_MODEL",
  "OPENAI_VOICE_MODEL",
  "OPENAI_REASONING_EFFORT",
  "OPENAI_STORE_RESPONSES",
  "OBSERVER_AI_ENABLED",
  "OBSERVER_VOICE_ENABLED",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetEnvironmentCache();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetEnvironmentCache();
});

function withEnv(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  resetEnvironmentCache();
  return environment();
}

describe("the model configuration", () => {
  it("defaults to the three models the product specified", () => {
    const env = withEnv({});
    expect(env.ai.textModel).toBe("gpt-5.6-sol");
    expect(env.ai.fastModel).toBe("gpt-5.6-luna");
    expect(env.ai.voiceModel).toBe("gpt-realtime-2.1");
    expect(env.ai.reasoningEffort).toBe("medium");
  });

  it("accepts an override of any model identifier", () => {
    const env = withEnv({ OPENAI_TEXT_MODEL: "gpt-5.6-sol-2026-09-01" });
    expect(env.ai.textModel).toBe("gpt-5.6-sol-2026-09-01");
  });

  it("rejects a model identifier that is not one", () => {
    /*
     * Shape, not membership.
     *
     * Model names change faster than deployments do, so an enum here would mean
     * a code change to adopt a successor. What is refused is a value that is
     * plainly not a model id — a URL, a path, a shell fragment — which is how
     * a mistyped variable turns into a request to somewhere unexpected.
     */
    const env = withEnv({ OPENAI_TEXT_MODEL: "https://evil.example/v1" });
    expect(env.problems.join(" ")).toMatch(/OPENAI_TEXT_MODEL/);
    // And it falls back to the default rather than using the bad value.
    expect(env.ai.textModel).toBe("gpt-5.6-sol");
  });

  it("rejects a reasoning effort that is not one of the three", () => {
    const env = withEnv({ OPENAI_REASONING_EFFORT: "maximum" });
    expect(env.problems.join(" ")).toMatch(/OPENAI_REASONING_EFFORT/);
    expect(env.ai.reasoningEffort).toBe("medium");
  });

  it("says so when the feature is on and no key is set", () => {
    const env = withEnv({ OBSERVER_AI_ENABLED: "true" });
    expect(env.ai.keyConfigured).toBe(false);
    expect(env.problems.join(" ")).toMatch(/OPENAI_API_KEY is not set/);
  });

  it("never returns the key, only whether there is one", () => {
    const env = withEnv({ OPENAI_API_KEY: "sk-not-a-real-key-for-tests" });
    expect(env.ai.keyConfigured).toBe(true);
    // The report is the shape surfaces may read. There is no path from it to a
    // secret, and this asserts it rather than trusting the review that said so.
    expect(JSON.stringify(env)).not.toContain("sk-not-a-real-key");
  });

  it("ignores a request to retain responses, and says it is ignoring it", () => {
    const env = withEnv({ OPENAI_STORE_RESPONSES: "true" });
    expect(env.ai.storeResponses).toBe(true);
    // The flag is recorded for auditability; the provider pins store=false.
    expect(env.problems.join(" ")).toMatch(/It is ignored/);
  });

  it("treats the feature switches as switches", () => {
    expect(withEnv({ OBSERVER_AI_ENABLED: "false" }).ai.enabled).toBe(false);
    expect(withEnv({ OBSERVER_AI_ENABLED: "true" }).ai.enabled).toBe(true);
    expect(withEnv({ OBSERVER_VOICE_ENABLED: "false" }).ai.voiceEnabled).toBe(false);
  });
});

describe("the model allowlist is authorisation, not configuration", () => {
  it("permits the three configured models", () => {
    for (const model of ["gpt-5.6-sol", "gpt-5.6-luna", "gpt-realtime-2.1"]) {
      expect(modelIsAllowed(model), model).toBe(true);
    }
  });

  it("refuses anything else, however it was configured", () => {
    // Somebody who can set OPENAI_TEXT_MODEL must not thereby be able to point
    // a public demonstration at the most expensive model on the account.
    for (const model of ["gpt-5.6-pro", "o3-pro", "gpt-4o", "anything-else"]) {
      expect(modelIsAllowed(model), model).toBe(false);
    }
  });
});

describe("the voice layer reports why it is off", () => {
  it("names the switch when the switch is off", () => {
    withEnv({ OBSERVER_VOICE_ENABLED: "false", OPENAI_API_KEY: "x" });
    expect(voiceBlocker()?.kind).toBe("disabled");
    expect(voiceBlocker()?.detail).toMatch(/OBSERVER_VOICE_ENABLED/);
  });

  it("names the missing key when there is no key", () => {
    withEnv({ OBSERVER_VOICE_ENABLED: "true" });
    expect(voiceBlocker()?.kind).toBe("not_configured");
    expect(voiceBlocker()?.detail).toMatch(/OPENAI_API_KEY/);
  });

  it("names the model when the model is not permitted", () => {
    withEnv({
      OBSERVER_VOICE_ENABLED: "true",
      OPENAI_API_KEY: "x",
      OPENAI_VOICE_MODEL: "gpt-realtime-experimental",
    });
    const blocker = voiceBlocker();
    expect(blocker?.kind).toBe("model_not_allowed");
    expect(blocker?.detail).toMatch(/gpt-realtime-experimental/);
    // A model identifier and a variable name. Neither is a secret.
    expect(blocker?.detail).not.toMatch(/sk-/);
  });

  it("keeps the operator's diagnosis off the browser's copy", () => {
    /*
     * The two halves used to be one field, and the screen rendered the
     * operator's: every visitor to the demonstration was told which variable
     * was unset on the server. `publicBlocker` is what the route sends, and
     * this is the assertion that it carries nothing to act on.
     */
    withEnv({ OBSERVER_VOICE_ENABLED: "true" });
    const blocker = voiceBlocker();
    const publicHalf = publicBlocker(blocker);

    expect(publicHalf).not.toBeNull();
    expect(publicHalf?.reader).toMatch(/spoken questions/i);
    expect(JSON.stringify(publicHalf)).not.toMatch(/OPENAI|SUPABASE|OBSERVER_/);
    expect(Object.keys(publicHalf ?? {}).sort()).toEqual(["kind", "reader"]);
  });

  it("says the same reader-facing sentence whichever the reason", () => {
    // Three operator tasks, one thing the reader needs to know.
    withEnv({ OBSERVER_VOICE_ENABLED: "false" });
    const off = voiceBlocker()?.reader;
    withEnv({ OBSERVER_VOICE_ENABLED: "true" });
    const noKey = voiceBlocker()?.reader;

    expect(off).toBeDefined();
    expect(off).toBe(noKey);
  });

  it("is available when everything is set", () => {
    withEnv({ OBSERVER_VOICE_ENABLED: "true", OPENAI_API_KEY: "x" });
    expect(voiceBlocker()).toBeNull();
  });
});

describe("the caller's identity", () => {
  it("is stable for the same viewer in the same tenant", () => {
    expect(safetyIdentifier("usr_1", "alpha")).toBe(safetyIdentifier("usr_1", "alpha"));
  });

  it("differs for the same person in another tenant", () => {
    // So the vendor cannot join one person's activity across customers.
    expect(safetyIdentifier("usr_1", "alpha")).not.toBe(safetyIdentifier("usr_1", "beta"));
  });

  it("does not contain the input", () => {
    const id = safetyIdentifier("monika.k@example.com", "alpha");
    expect(id).not.toContain("monika");
    expect(id).not.toContain("example.com");
    expect(id).toMatch(/^obs_[0-9a-f]{32}$/);
  });

  it("keeps the telemetry tag separate from the vendor identifier", () => {
    // Reusing one value in two systems is how a correlation nobody intended
    // gets built.
    expect(telemetrySubject("usr_1")).not.toBe(safetyIdentifier("usr_1", "alpha"));
    expect(telemetrySubject("usr_1")).not.toContain("usr_1");
  });
});

describe("telemetry carries numbers and nothing else", () => {
  it("sums usage across the turns of one question", () => {
    const total = addUsage(
      { inputTokens: 100, outputTokens: 50, reasoningTokens: 10 },
      { inputTokens: 200, outputTokens: 80, reasoningTokens: 40 },
    );
    expect(total).toEqual({ inputTokens: 300, outputTokens: 130, reasoningTokens: 50 });
  });

  it("survives a turn that reported no usage", () => {
    expect(addUsage(null, null)).toBeNull();
    expect(addUsage({ inputTokens: 1, outputTokens: 2, reasoningTokens: null }, null)).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      reasoningTokens: null,
    });
  });
});

/* --- one bad variable disables one variable ---------------------------------- */

describe("a rejected variable does not take the others with it", () => {
  /*
   * The whole environment was parsed in one call, and one rejected value threw
   * every other value away — `parsed.success ? parsed.data : Schema.parse({})`.
   *
   * The consequence is a diagnosis that sends the operator to the wrong place:
   * a mistyped `SUPABASE_URL` makes a perfectly good `OPENAI_API_KEY` report as
   * absent, and "absent" and "invalid" look identical from outside.
   */
  it("keeps a good key when a different variable is invalid", () => {
    const env = withEnv({
      OPENAI_API_KEY: "sk-test-key",
      SUPABASE_URL: "not-a-url",
      SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
    });

    expect(env.ai.keyConfigured).toBe(true);
    expect(env.supabase.serverConfigured).toBe(false);
  });

  it("names the variable it rejected", () => {
    const env = withEnv({ OPENAI_API_KEY: "sk-test-key", SUPABASE_URL: "not-a-url" });
    expect(env.problems.join(" ")).toMatch(/SUPABASE_URL/);
  });

  it("never repeats the value it rejected", () => {
    /*
     * Zod echoes what it received on an enum mismatch, and this file reads
     * variables that must never be echoed. The report carries names only.
     */
    const env = withEnv({
      OPENAI_API_KEY: "sk-live-must-not-appear",
      OBSERVER_AI_ENABLED: "yes-please",
      SUPABASE_URL: "postgres://user:hunter2@example.com",
    });
    const said = JSON.stringify(env);

    expect(said).not.toMatch(/sk-live-must-not-appear/);
    expect(said).not.toMatch(/yes-please/);
    expect(said).not.toMatch(/hunter2/);
  });

  it("falls back to the default for the variable it rejected, and only that one", () => {
    const env = withEnv({ OBSERVER_AI_ENABLED: "yes-please", OPENAI_TEXT_MODEL: "gpt-5.6-sol" });

    // `OBSERVER_AI_ENABLED` defaults to true, so the fallback is visible.
    expect(env.ai.enabled).toBe(true);
    expect(env.ai.textModel).toBe("gpt-5.6-sol");
  });
});

/* --- which Supabase variables count ------------------------------------------ */

/*
 * Long enough to pass the shape check, and deliberately not spelled like a real
 * secret key: a literal beginning `sb_secret_` in a tracked file is a finding in
 * the secret audit, and it should stay one. The scanner keeps no allowlist.
 */
const FAKE_SECRET_KEY = "observer-test-server-key-0000000000";

describe("the Supabase diagnosis", () => {
  it("accepts the public spelling of the URL, which is not a secret", () => {
    const resolved = resolveServerSupabase({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
    } as NodeJS.ProcessEnv);

    expect(resolved?.url).toBe("https://example.supabase.co");
    expect(resolved?.from).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("refuses the legacy service-role key rather than silently adopting it", () => {
    /*
     * The Vercel–Supabase integration injects `SUPABASE_SERVICE_ROLE_KEY`.
     * This project was set up on the modern secret keys, and quietly changing
     * which credential a deployment runs on is not a thing to do by fallback.
     */
    const source = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiJ9.legacy.jwt",
    } as NodeJS.ProcessEnv;

    expect(resolveServerSupabase(source)).toBeNull();
    expect(diagnoseServerSupabase(source).ignored).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("names what is missing and what was skipped, and no values", () => {
    const source = {
      SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiJ9.must.not.appear",
      POSTGRES_URL: "postgres://user:hunter2@db.example.com:5432/postgres",
    } as NodeJS.ProcessEnv;
    const diagnosis = diagnoseServerSupabase(source);

    expect(diagnosis.configured).toBe(false);
    expect(diagnosis.missing).toEqual(["SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
    expect(diagnosis.ignored).toEqual(["SUPABASE_SERVICE_ROLE_KEY", "POSTGRES_URL"]);

    const said = JSON.stringify(diagnosis);
    expect(said).not.toMatch(/hunter2/);
    expect(said).not.toMatch(/must\.not\.appear/);
  });

  it("treats a blank variable as unset rather than as configured", () => {
    const source = { SUPABASE_URL: "  ", SUPABASE_SECRET_KEY: "" } as NodeJS.ProcessEnv;
    expect(resolveServerSupabase(source)).toBeNull();
    expect(diagnoseServerSupabase(source).configured).toBe(false);
  });

  it("reports the limiter as off, by variable name, in the environment report", () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SECRET_KEY"];
    const env = withEnv({});
    expect(env.supabase.serverConfigured).toBe(false);
    expect(env.problems.join(" ")).toMatch(/shared rate limiter is off/);
    expect(env.problems.join(" ")).toMatch(/SUPABASE_SECRET_KEY/);
  });
});

describe("a Supabase variable that is set but cannot work", () => {
  it("is called malformed, not present and not missing", () => {
    const diagnosis = diagnoseServerSupabase({
      SUPABASE_URL: "localhost:54321",
      SUPABASE_SECRET_KEY: "sb_secret_long_enough_to_pass",
    } as NodeJS.ProcessEnv);

    expect(diagnosis.configured).toBe(false);
    expect(diagnosis.malformed).toEqual(["SUPABASE_URL"]);
    expect(diagnosis.missing).toEqual([]);
  });

  it("catches the legacy JWT pasted into the modern variable", () => {
    /*
     * Both are long opaque strings, and the wrong one fails much further
     * downstream with a permission error that names nothing.
     */
    const diagnosis = diagnoseServerSupabase({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service.role",
    } as NodeJS.ProcessEnv);

    expect(diagnosis.configured).toBe(false);
    expect(diagnosis.malformed).toEqual(["SUPABASE_SECRET_KEY"]);
  });

  it("says so in the environment report, by name", () => {
    // `withEnv` never deletes, so both are set explicitly rather than trusting
    // whatever an earlier test left behind.
    const env = withEnv({
      SUPABASE_URL: "localhost:54321",
      SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
    });
    expect(env.problems.join(" ")).toMatch(/SUPABASE_URL set to something unusable/);
    expect(env.problems.join(" ")).not.toMatch(/SUPABASE_SECRET_KEY set to something unusable/);
  });
});

/* --- the ceiling fails closed, once there is a ceiling ------------------------ */

describe("an unreachable shared ceiling", () => {
  const CONFIGURED = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
  } as NodeJS.ProcessEnv;

  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SECRET_KEY"];
  });

  function configure() {
    process.env["SUPABASE_URL"] = CONFIGURED["SUPABASE_URL"] as string;
    process.env["SUPABASE_SECRET_KEY"] = CONFIGURED["SUPABASE_SECRET_KEY"] as string;
  }

  it("refuses rather than proceeding unbounded", async () => {
    /*
     * This reversed a decision. A ceiling that removes itself exactly when its
     * enforcement mechanism breaks is not a ceiling, and failing open has no
     * visible symptom — a deployment could run unbounded for a month and look
     * identical to one that was fine.
     */
    configure();
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;

    const verdict = await consumeSharedQuota("session", "client", "alpha/northgate");
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("ceiling_unavailable");
  });

  it("refuses when the database answers with an error", async () => {
    configure();
    globalThis.fetch = (() =>
      Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;

    const verdict = await consumeSharedQuota("session", "client", "alpha/northgate");
    expect(verdict.allowed).toBe(false);
  });

  it("refuses when the database answers with nothing usable", async () => {
    configure();
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
      )) as typeof fetch;

    const verdict = await consumeSharedQuota("session", "client", "alpha/northgate");
    expect(verdict.allowed).toBe(false);
  });

  it("leaves a deployment with no ceiling configured alone", async () => {
    /*
     * Nothing promised this one a shared ceiling, so nothing is taken away.
     * That is local development and this test suite — not a demonstration URL.
     */
    globalThis.fetch = (() => Promise.reject(new Error("should not be called"))) as typeof fetch;

    const verdict = await consumeSharedQuota("session", "client", "alpha/northgate");
    expect(verdict.allowed).toBe(true);
  });

  it("tells the reader the figures are unaffected, and names no internals", () => {
    const said = SHARED_REFUSAL_TEXT.ceiling_unavailable;
    expect(said).toMatch(/unaffected/i);
    expect(said).not.toMatch(/supabase|database|postgres|rpc|500/i);
  });
});
