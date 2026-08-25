import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { environment, resetEnvironmentCache } from "../src/lib/env";
import { modelIsAllowed } from "../src/lib/ai/limits";
import { voiceBlocker } from "../src/lib/ai/voice";
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
