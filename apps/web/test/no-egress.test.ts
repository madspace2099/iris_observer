import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * NOTHING LEAVES THIS MACHINE. PROVED ADVERSARIALLY.
 *
 * The synthetic harness exists so that a browser suite, a screenshot pass and a
 * local review can exercise every AI path without a vendor ever hearing from
 * us. That guarantee was, until this file, an argument rather than a test — and
 * the argument had a hole in it: `lib/ai/voice.ts` built an OpenAI client
 * directly instead of going through the injectable transport, so pressing a
 * microphone on a harness server would have sent a fake `sk-observer-test-…`
 * key to api.openai.com. A DNS lookup, a TLS handshake and a 401 in somebody
 * else's logs, from a system that promised silence.
 *
 * So this file assumes the hole is back and goes looking for it. Three
 * independent proofs, because each catches what the others cannot:
 *
 *   1. RUNTIME. `fetch` is replaced with a recorder that fails loudly. Every AI
 *      route is driven with a synthetic credential in a harness environment and
 *      must produce zero calls to any external host.
 *   2. SECRECY. Whatever those routes did pass to `fetch` — nothing, if all is
 *      well — is searched for the synthetic key. A key in a URL, a header or a
 *      body is a key that has left.
 *   3. STATIC. Every module under `lib/ai` and `app/api` is read and checked
 *      for a direct vendor SDK import or a hard-coded vendor URL. A route added
 *      next year that constructs its own client fails here before it can fail
 *      in production.
 *
 * The static check is the one that would have caught the voice hole on the day
 * it was written, which is why it is here even though the runtime check now
 * also covers it.
 */

/* The obviously-fake credential the harness stores. Never a real key. */
const SYNTHETIC_KEY = "sk-observer-test-egress-000000abcd";

/** Hosts that would mean a request left the building. */
const EXTERNAL = /^https?:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/i;

interface Attempt {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

let attempts: Attempt[] = [];
let realFetch: typeof globalThis.fetch;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

beforeEach(() => {
  attempts = [];
  realFetch = globalThis.fetch;

  /*
   * A recorder that also REFUSES. Returning a plausible response would let a
   * module that should never have called out carry on as if it had succeeded,
   * and the test would pass on the strength of a mock.
   */
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    attempts.push({ url, init });
    if (EXTERNAL.test(url)) throw new Error(`egress attempted: ${url}`);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;

  /* The four conditions the harness needs, and nothing that looks deployed. */
  vi.stubEnv("OBSERVER_CREDENTIAL_TEST_STORE", "browser-tests-only");
  vi.stubEnv("OBSERVER_SYNTHETIC_HARNESS", "1");
  vi.stubEnv("OBSERVER_ENVIRONMENT", "development");
  vi.stubEnv("OBSERVER_CREDENTIAL_KEY", "0".repeat(64));
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Calls that reached a host outside this machine. Always expected to be none. */
function egress(): Attempt[] {
  return attempts.filter((a) => EXTERNAL.test(a.url));
}

/* ==================================================== 1. the runtime proof */

describe("no AI path reaches a vendor under the harness", () => {
  it("the transport answers from the scripted model and never calls fetch", async () => {
    const { modelFor } = await import("../src/lib/providers/transport");

    const model = modelFor("gpt-5.6-terra", SYNTHETIC_KEY);
    const result = await model.respond({
      instructions: "Reply with the word ok.",
      messages: [{ role: "user", content: "ok" }],
      tools: [],
      maxOutputTokens: 16,
      reasoningEffort: "low",
    });

    expect(result.model).toBe("gpt-5.6-terra");
    expect(egress(), "the scripted model makes no request").toHaveLength(0);
  });

  it("the connection probe reaches no vendor", async () => {
    const { probeFor } = await import("../src/lib/credentials/probe");

    const verdict = await probeFor()(SYNTHETIC_KEY, "gpt-5.6-luna");

    expect(verdict.ok, "a synthetic key the scripted model accepts").toBe(true);
    expect(egress()).toHaveLength(0);
  });

  it("minting a voice session refuses locally instead of calling OpenAI", async () => {
    const { createVoiceSession, voiceBlocker } = await import("../src/lib/ai/voice");

    await expect(createVoiceSession(SYNTHETIC_KEY)).rejects.toThrow(/not enabled yet/i);

    /* And the capability check says so before anything is attempted at all. */
    const blocker = voiceBlocker();
    expect(blocker?.kind).toBe("not_built");

    expect(egress(), "no realtime secret is minted").toHaveLength(0);
  });

  it("voice cannot be switched back on by a deployment flag", async () => {
    vi.stubEnv("OBSERVER_VOICE_ENABLED", "true");
    const { voiceBlocker } = await import("../src/lib/ai/voice");
    expect(voiceBlocker()?.kind).toBe("not_built");
  });
});

/* ==================================================== 2. the secrecy proof */

describe("the synthetic key is never transmitted", () => {
  it("appears in no URL, header or body of anything that was attempted", async () => {
    const { modelFor } = await import("../src/lib/providers/transport");
    const { probeFor } = await import("../src/lib/credentials/probe");
    const { createVoiceSession } = await import("../src/lib/ai/voice");

    await modelFor("gpt-5.6-sol", SYNTHETIC_KEY).respond({
      instructions: "",
      messages: [{ role: "user", content: "ok" }],
      tools: [],
      maxOutputTokens: 16,
      reasoningEffort: "low",
    });
    await probeFor()(SYNTHETIC_KEY, "gpt-5.6-luna");
    await createVoiceSession(SYNTHETIC_KEY).catch(() => null);

    /*
     * Everything handed to `fetch`, flattened to one string. If the key is in
     * none of it, it did not travel — whatever the destination would have been.
     */
    const everything = attempts
      .map((a) => `${a.url} ${JSON.stringify(a.init?.headers ?? {})} ${String(a.init?.body ?? "")}`)
      .join("\n");

    expect(everything).not.toContain(SYNTHETIC_KEY);
    /* And the distinctive middle of it, in case something re-encoded the rest. */
    expect(everything).not.toContain("observer-test-egress");
  });
});

/* ===================================================== 3. the static proof */

/*
 * Anchored to THIS FILE, not to the working directory.
 *
 * Vitest runs from the repository root, so `process.cwd()` pointed at a
 * `src` that does not exist and the walk failed before it checked anything —
 * a static guard that throws is a static guard nobody is being protected by.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Every `.ts`/`.tsx` under a directory, recursively. */
async function sourcesUnder(relative: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  return walk(join(ROOT, relative));
}

describe("every AI path goes through the shared transport", () => {
  /**
   * The one module allowed to know a vendor exists.
   *
   * `providers/transport.ts` holds the base URLs and the fetch calls, and
   * `ai/provider.ts` still constructs an OpenAI client for the text path it
   * owns. Everything else must reach a model through them.
   */
  const MAY_KNOW_A_VENDOR = ["lib/providers/transport.ts", "lib/ai/provider.ts"];

  it("no other module imports a vendor SDK", async () => {
    const files = [...(await sourcesUnder("lib/ai")), ...(await sourcesUnder("app/api"))];
    expect(files.length, "the walk found something to check").toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const file of files) {
      const relative = file.slice(ROOT.length + 1).replace(/\\/g, "/");
      if (MAY_KNOW_A_VENDOR.includes(relative)) continue;
      const source = readFileSync(file, "utf8");
      if (/^\s*import\s+[^;]*from\s+["']openai["']/m.test(source)) offenders.push(relative);
      if (/new\s+OpenAI\s*\(/.test(source)) offenders.push(relative);
    }

    expect(offenders, "a module that builds its own client cannot be muted").toEqual([]);
  });

  it("no other module hard-codes a vendor endpoint", async () => {
    const files = [...(await sourcesUnder("lib/ai")), ...(await sourcesUnder("app/api"))];

    const offenders: string[] = [];
    for (const file of files) {
      const relative = file.slice(ROOT.length + 1).replace(/\\/g, "/");
      if (MAY_KNOW_A_VENDOR.includes(relative)) continue;
      const source = readFileSync(file, "utf8");
      /* In code, not in prose: a comment mentioning the host is not a call. */
      const code = source
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\/|--)/.test(line))
        .join("\n");
      if (/["'`]https?:\/\/api\.openai\.com/.test(code)) offenders.push(relative);
    }

    expect(offenders).toEqual([]);
  });

  it("the voice module holds no path to the network at all", () => {
    const source = readFileSync(join(ROOT, "lib/ai/voice.ts"), "utf8");
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/)/.test(line))
      .join("\n");

    expect(code).not.toMatch(/from\s+["']openai["']/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/api\.openai\.com/);
  });
});
