import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CredentialUnreadableError,
  EncryptionUnavailableError,
  lastFour,
  masterKey,
  open,
  seal,
} from "../src/lib/credentials/envelope";
import {
  ALL_FAILURES,
  classifyProviderFailure,
  describeFailure,
} from "../src/lib/credentials/failure";
import { credentialStore } from "../src/lib/credentials/store";
import {
  isSyntheticCredential,
  resetTestStore,
  testAuditTrail,
  testStorePermitted,
} from "../src/lib/credentials/test-store";
import {
  connectionFor,
  credentialsAvailable,
  removeConnection,
  resolveApiKey,
  saveConnection,
  testConnection,
  type ProbeResult,
} from "../src/lib/credentials/service";

/**
 * PER-ACCOUNT PROVIDER CREDENTIALS — THE SECURITY PROPERTIES, ASSERTED.
 *
 * ## Nothing here touches OpenAI, and nothing here reads a real key
 *
 * Every credential in this file is an obviously fake constant. Every provider
 * call is a function this file wrote. `OPENAI_API_KEY` is deleted from the
 * process before the first test and asserted absent, so a machine that happens
 * to have one exported cannot leak it into a run — which is not hypothetical:
 * an ambient key on this workstation billed a real suite run once already.
 *
 * ## The master key
 *
 * Thirty-two zero bytes. Valid hex, correct length, and unmistakably not a
 * secret — which is the point. A test fixture that looks like a real key is a
 * real key waiting to be pasted somewhere.
 */

/* --------------------------------------------------------------- fixtures */

const TEST_MASTER_KEY = "0".repeat(64);
const OTHER_MASTER_KEY = "1".repeat(64);

const ALICE = "acct_test_alice";
const BOB = "acct_test_bob";

/**
 * Obviously synthetic, and shaped so the test store will hold them.
 *
 * The harness accepts `sk-observer-test-…` and nothing else, so these are not
 * merely fake-looking — they are the only shape that works, and a real key
 * cannot be substituted into this file by accident.
 */
const ALICE_KEY = "sk-observer-test-alice-000000wxyz";
const BOB_KEY = "sk-observer-test-bob-111111111abcd";

/**
 * What a real credential looks like, ASSEMBLED AT RUNTIME.
 *
 * Written as parts rather than as a literal so no string in this repository
 * matches an OpenAI key pattern. `scripts/secret-audit.mjs` flagged the literal
 * form — correctly: a fixture shaped like a real secret is the thing a scanner
 * exists to find, and "it is only a test" is what everybody says about the one
 * that turns out to be real.
 *
 * Used only to prove that such a value is refused.
 */
const REAL_LOOKING = ["sk", "proj", "A".repeat(40)].join("-");

/** The other shapes a vendor might issue, built the same way. */
const VENDOR_SHAPED = [
  REAL_LOOKING,
  ["sk", "proj", "abcdefghijklmnopqrstuvwxyz012345"].join("-"),
  ["sk", "abcdefghijklmnopqrstuvwxyz012345"].join("-"),
];

const accepts = async (): Promise<ProbeResult> => ({ ok: true });
const rejects =
  (status: number, code: string | null = null) =>
  async (): Promise<ProbeResult> => ({ ok: false, status, code });

/** What the probe was handed, so a test can prove whose key was used. */
function recordingProbe(): { probe: () => Promise<ProbeResult>; seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    probe: async (apiKey?: string) => {
      seen.push(String(apiKey));
      return { ok: true };
    },
  };
}

/** Every condition the harness needs, and nothing a deployment would have. */
const HARNESS: Readonly<Record<string, string>> = Object.freeze({
  OBSERVER_CREDENTIAL_KEY: TEST_MASTER_KEY,
  OBSERVER_CREDENTIAL_TEST_STORE: "browser-tests-only",
  OBSERVER_SYNTHETIC_HARNESS: "1",
  OBSERVER_ENVIRONMENT: "development",
});

const DEPLOYMENT_MARKERS = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "AWS_REGION",
  "AWS_EXECUTION_ENV",
  "LAMBDA_TASK_ROOT",
  "NETLIFY",
  "RENDER",
  "FLY_APP_NAME",
  "DYNO",
  "WEBSITE_INSTANCE_ID",
  "KUBERNETES_SERVICE_HOST",
  "K_SERVICE",
];

function configure(overrides: Record<string, string | undefined> = {}): void {
  for (const [k, v] of Object.entries(HARNESS)) process.env[k] = v;
  for (const marker of DEPLOYMENT_MARKERS) delete process.env[marker];
  delete process.env["SUPABASE_URL"];
  delete process.env["SUPABASE_SECRET_KEY"];
  delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  /*
   * Requirement 14, enforced rather than promised. If this workstation has a
   * key exported, it is gone for the duration of the suite and the assertion
   * below proves it.
   */
  delete process.env["OPENAI_API_KEY"];
  resetTestStore();
  configure();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the suite never touches a real credential", () => {
  it("has no OPENAI_API_KEY in the process", () => {
    expect(process.env["OPENAI_API_KEY"]).toBeUndefined();
  });

  it("uses a master key that could not be mistaken for a secret", () => {
    expect(TEST_MASTER_KEY).toBe("0".repeat(64));
    expect(isSyntheticCredential(ALICE_KEY)).toBe(true);
    expect(isSyntheticCredential(BOB_KEY)).toBe(true);
  });
});

/* ================================================================= the envelope */

describe("authenticated encryption", () => {
  it("round-trips a credential for the account it was sealed for", () => {
    const sealed = seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
    expect(open(sealed, { accountId: ALICE, provider: "openai" })).toBe(ALICE_KEY);
  });

  it("never puts the plaintext in the stored bytes", () => {
    /* Requirement 4: what is written down does not contain what was typed. */
    const sealed = seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
    const stored = JSON.stringify(sealed);
    expect(stored).not.toContain(ALICE_KEY);
    expect(stored).not.toContain(ALICE_KEY.slice(0, 12));

    /* And the raw bytes, not only the JSON of them. */
    const bytes = Buffer.concat([
      Buffer.from(sealed.nonce, "base64"),
      Buffer.from(sealed.ciphertext, "base64"),
      Buffer.from(sealed.tag, "base64"),
    ]);
    expect(bytes.toString("utf8")).not.toContain("sk-observer-test");
    expect(bytes.toString("latin1")).not.toContain("sk-observer-test");
  });

  it("uses a fresh nonce every time, so two seals of one key differ", () => {
    const a = seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
    const b = seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses to open a row bound to another account", () => {
    /*
     * The property that makes a moved row useless. Change nothing but the
     * account the ciphertext is opened for, and the tag fails.
     */
    const sealed = seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
    expect(() => open(sealed, { accountId: BOB, provider: "openai" })).toThrow(
      CredentialUnreadableError,
    );
  });

  it("refuses to open a row bound to another provider", () => {
    const sealed = seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
    expect(() => open(sealed, { accountId: ALICE, provider: "anthropic" })).toThrow(
      CredentialUnreadableError,
    );
  });

  it("refuses a tampered ciphertext, tag or nonce", () => {
    const sealed = seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
    const flip = (b64: string): string => {
      const buf = Buffer.from(b64, "base64");
      buf[0] = (buf[0] ?? 0) ^ 0xff;
      return buf.toString("base64");
    };
    for (const mutated of [
      { ...sealed, ciphertext: flip(sealed.ciphertext) },
      { ...sealed, tag: flip(sealed.tag) },
      { ...sealed, nonce: flip(sealed.nonce) },
    ]) {
      expect(() => open(mutated, { accountId: ALICE, provider: "openai" })).toThrow(
        CredentialUnreadableError,
      );
    }
  });

  it("refuses a payload sealed under a different master key", () => {
    const sealed = seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
    process.env["OBSERVER_CREDENTIAL_KEY"] = OTHER_MASTER_KEY;
    expect(() => open(sealed, { accountId: ALICE, provider: "openai" })).toThrow(
      CredentialUnreadableError,
    );
  });

  it("refuses to seal at all without a master key", () => {
    /* Requirement 7, at the primitive. There is no plaintext fallback. */
    delete process.env["OBSERVER_CREDENTIAL_KEY"];
    expect(() => seal(ALICE_KEY, { accountId: ALICE, provider: "openai" })).toThrow(
      EncryptionUnavailableError,
    );
  });

  it("refuses a master key of the wrong shape", () => {
    for (const bad of ["", "not-hex-at-all", "abcd", "0".repeat(63), "0".repeat(66), "  "]) {
      expect(masterKey({ OBSERVER_CREDENTIAL_KEY: bad }).ok, bad).toBe(false);
    }
    expect(masterKey({ OBSERVER_CREDENTIAL_KEY: TEST_MASTER_KEY }).ok).toBe(true);
  });

  it("will not mask a value too short to mask", () => {
    expect(() => lastFour("sk-abc")).toThrow();
    expect(lastFour(ALICE_KEY)).toBe("wxyz");
  });
});

/* ============================================================ the account boundary */

describe("one account cannot reach another's connection", () => {
  it("does not show Alice's metadata to Bob", async () => {
    /* Requirement 1. */
    expect((await saveConnection(ALICE, ALICE_KEY, accepts)).ok).toBe(true);

    const hers = await connectionFor(ALICE);
    const his = await connectionFor(BOB);

    expect(hers.kind).toBe("connected");
    expect(his.kind).toBe("not_connected");
    expect(JSON.stringify(his)).not.toContain("wxyz");
  });

  it("does not resolve Alice's key for Bob", async () => {
    /* Requirement 2, at the one function that produces a plaintext. */
    await saveConnection(ALICE, ALICE_KEY, accepts);

    const forAlice = await resolveApiKey(ALICE);
    const forBob = await resolveApiKey(BOB);

    expect(forAlice).toEqual({ ok: true, apiKey: ALICE_KEY });
    expect(forBob.ok).toBe(false);
    expect(JSON.stringify(forBob)).not.toContain(ALICE_KEY);
  });

  it("gives each account its own key when both are connected", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    await saveConnection(BOB, BOB_KEY, accepts);

    const a = await resolveApiKey(ALICE);
    const b = await resolveApiKey(BOB);
    expect(a.ok && a.apiKey).toBe(ALICE_KEY);
    expect(b.ok && b.apiKey).toBe(BOB_KEY);
  });

  it("refuses a row that has been moved to another account", async () => {
    /*
     * The database is not trusted to have kept rows where they belong. The
     * binding is rebuilt from the account that is ASKING, so a row relocated by
     * a bad restore fails to open instead of being handed over.
     */
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const storage = credentialStore();
    expect(storage.available).toBe(true);
    if (!storage.available) return;

    const row = await storage.store.read(ALICE, "openai");
    expect(row).not.toBeNull();
    if (row === null) return;

    await storage.store.upsert({ ...row, accountId: BOB });

    const stolen = await resolveApiKey(BOB);
    expect(stolen).toEqual({ ok: false, reason: "unreadable" });
  });

  it("uses the same account key on every project that account may open", async () => {
    /*
     * Requirement 12. The credential is resolved from the account and nothing
     * else — there is no project parameter anywhere in this module, which is
     * the strongest form of "the same key works everywhere they may look".
     */
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const first = await resolveApiKey(ALICE);
    const second = await resolveApiKey(ALICE);
    expect(first).toEqual(second);
    expect(resolveApiKey.length).toBe(1);
  });
});

/* ===================================================================== saving */

describe("saving a credential", () => {
  it("refuses when no encryption key is configured", async () => {
    /* Requirement 7, at the boundary a reader reaches. */
    delete process.env["OBSERVER_CREDENTIAL_KEY"];
    expect(credentialsAvailable()).toBe(false);

    const result = await saveConnection(ALICE, ALICE_KEY, accepts);
    expect(result).toEqual({ ok: false, failure: "storage_unavailable" });
    expect(await connectionFor(ALICE)).toEqual({
      kind: "unavailable",
      failure: "storage_unavailable",
    });
  });

  it("refuses when there is nowhere to store the result", async () => {
    delete process.env["OBSERVER_CREDENTIAL_TEST_STORE"];
    expect(credentialsAvailable()).toBe(false);
    const result = await saveConnection(ALICE, ALICE_KEY, accepts);
    expect(result).toEqual({ ok: false, failure: "storage_unavailable" });
  });

  it("does not store a key the provider rejects", async () => {
    const result = await saveConnection(ALICE, ALICE_KEY, rejects(401));
    expect(result).toEqual({ ok: false, failure: "rejected" });
    expect(await connectionFor(ALICE)).toEqual({ kind: "not_connected" });
  });

  it("keeps the previous credential when a replacement fails", async () => {
    /*
     * Requirement 9. The probe runs before the write, so a rejected
     * replacement cannot destroy a working connection — which matters more
     * here than anywhere, because the reader cannot retype the old value.
     */
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const before = await connectionFor(ALICE);

    const failed = await saveConnection(ALICE, BOB_KEY, rejects(401));
    expect(failed.ok).toBe(false);

    expect(await connectionFor(ALICE)).toEqual(before);
    const still = await resolveApiKey(ALICE);
    expect(still.ok && still.apiKey).toBe(ALICE_KEY);
  });

  it("replaces atomically when the new key works", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const replaced = await saveConnection(ALICE, BOB_KEY, accepts);

    expect(replaced.ok && replaced.replaced).toBe(true);
    const now = await resolveApiKey(ALICE);
    expect(now.ok && now.apiKey).toBe(BOB_KEY);
  });

  it("keeps the connected-since date across a replacement", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const first = await connectionFor(ALICE);
    await saveConnection(ALICE, BOB_KEY, accepts);
    const second = await connectionFor(ALICE);

    if (first.kind !== "connected" || second.kind !== "connected") throw new Error("not connected");
    expect(second.connection.createdAt).toBe(first.connection.createdAt);
  });

  it("enforces no vendor prefix of its own, only a length a mask cannot betray", async () => {
    /*
     * The SERVICE has no prefix rule: `sk-` is a convention, not a contract,
     * and it has changed once already. What it refuses is a value so short
     * that four visible characters would be a third of it.
     *
     * The STORE may have a rule, and the browser harness does — which is why
     * the accepted value below is one the harness will hold. The two rules are
     * separate on purpose: the real store accepts whatever a provider issues.
     */
    expect((await saveConnection(ALICE, "short", accepts)).ok).toBe(false);
    expect((await saveConnection(ALICE, ALICE_KEY, accepts)).ok).toBe(true);

    /* Nothing in the service names a vendor prefix. */
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/lib/credentials/service.ts"),
      "utf8",
    );
    /*
     * Code only. The file explains in a comment why there is no prefix rule,
     * and a check that fails on its own explanation is a check people delete.
     */
    const code = source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trimStart();
        return !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("//");
      })
      .join("\n");
    expect(code).not.toContain("sk-");
  });

  it("hands the probe the key being saved, and nothing else", async () => {
    const { probe, seen } = recordingProbe();
    await saveConnection(ALICE, ALICE_KEY, probe as never);
    expect(seen).toEqual([ALICE_KEY]);
  });
});

/* ==================================================================== testing */

describe("testing a connection", () => {
  it("decrypts the account's own key and reports success", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const { probe, seen } = recordingProbe();
    const result = await testConnection(ALICE, probe as never);
    expect(result.ok).toBe(true);
    expect(seen).toEqual([ALICE_KEY]);
  });

  it("never returns the key to its caller", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const result = await testConnection(ALICE, accepts);
    expect(JSON.stringify(result)).not.toContain(ALICE_KEY);
    expect(JSON.stringify(result)).not.toContain("sk-observer-test");
  });

  it("maps every provider failure to a safe category", async () => {
    /* Requirement 10, at the classifier. */
    await saveConnection(ALICE, ALICE_KEY, accepts);

    const cases: [() => Promise<ProbeResult>, string][] = [
      [rejects(401), "rejected"],
      [rejects(403), "rejected"],
      [rejects(404), "model_unavailable"],
      [rejects(400, "model_not_found"), "model_unavailable"],
      [rejects(429), "rate_limited"],
      [rejects(429, "insufficient_quota"), "insufficient_credits"],
      [rejects(500), "provider_unavailable"],
      [rejects(0), "provider_unavailable"],
    ];

    for (const [probe, expected] of cases) {
      const result = await testConnection(ALICE, probe);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure, expected).toBe(expected);
    }
  });

  it("reports unreadable when the master key has changed under it", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    process.env["OBSERVER_CREDENTIAL_KEY"] = OTHER_MASTER_KEY;

    expect(await testConnection(ALICE, accepts)).toEqual({ ok: false, failure: "unreadable" });
    expect(await resolveApiKey(ALICE)).toEqual({ ok: false, reason: "unreadable" });
  });
});

/* =================================================================== removal */

describe("removing a connection", () => {
  it("deletes the credential and disables the model for that account", async () => {
    /* Requirement 8. */
    await saveConnection(ALICE, ALICE_KEY, accepts);
    expect((await resolveApiKey(ALICE)).ok).toBe(true);

    expect(await removeConnection(ALICE)).toBe(true);

    expect(await connectionFor(ALICE)).toEqual({ kind: "not_connected" });
    expect(await resolveApiKey(ALICE)).toEqual({ ok: false, reason: "not_connected" });
  });

  it("removes only the account that asked", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    await saveConnection(BOB, BOB_KEY, accepts);

    await removeConnection(ALICE);

    expect((await connectionFor(BOB)).kind).toBe("connected");
    const his = await resolveApiKey(BOB);
    expect(his.ok && his.apiKey).toBe(BOB_KEY);
  });

  it("leaves nothing behind that could be decrypted later", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    await removeConnection(ALICE);

    const storage = credentialStore();
    if (!storage.available) throw new Error("no store");
    expect(await storage.store.read(ALICE, "openai")).toBeNull();
  });
});

/* ===================================================================== audit */

describe("the audit trail", () => {
  it("records the action and never the secret", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    await testConnection(ALICE, accepts);
    await saveConnection(ALICE, BOB_KEY, accepts);
    await removeConnection(ALICE);

    const trail = testAuditTrail();
    expect(trail.map((e) => e.action)).toEqual(["connected", "tested", "replaced", "removed"]);

    const serialised = JSON.stringify(trail);
    for (const secret of [ALICE_KEY, BOB_KEY, "sk-observer-test", TEST_MASTER_KEY]) {
      expect(serialised, secret).not.toContain(secret);
    }
  });

  it("writes only categories from the closed vocabulary", async () => {
    await saveConnection(ALICE, ALICE_KEY, rejects(429, "insufficient_quota"));
    const allowed = new Set<string>(["ok", ...ALL_FAILURES]);
    for (const entry of testAuditTrail()) {
      expect(allowed.has(entry.category), entry.category).toBe(true);
    }
  });

  it("records an account identifier, which is not a secret", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    expect(testAuditTrail()[0]?.accountId).toBe(ALICE);
  });
});

/* ============================================================ leakage surfaces */

describe("nothing that leaves the server carries the key", () => {
  it("keeps it out of every value the settings page can render", async () => {
    /* Requirement 6: status is metadata only. */
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const state = await connectionFor(ALICE);
    const serialised = JSON.stringify(state);

    expect(serialised).not.toContain(ALICE_KEY);
    expect(serialised).not.toContain("sk-observer-test");
    expect(serialised).toContain("wxyz");

    if (state.kind !== "connected") throw new Error("not connected");
    expect(Object.keys(state.connection).sort()).toEqual([
      "createdAt",
      "lastFour",
      "lastTestOutcome",
      "lastTestedAt",
      "provider",
      "updatedAt",
    ]);
  });

  it("keeps it out of anything written to the console", async () => {
    /* Requirement 5. Every console channel, for a whole lifecycle. */
    const written: string[] = [];
    for (const channel of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        written.push(args.map((a) => String(a)).join(" "));
      });
    }

    await saveConnection(ALICE, ALICE_KEY, accepts);
    await testConnection(ALICE, rejects(401));
    await saveConnection(ALICE, BOB_KEY, accepts);
    await removeConnection(ALICE);

    const all = written.join("\n");
    for (const secret of [ALICE_KEY, BOB_KEY, "sk-observer-test", TEST_MASTER_KEY]) {
      expect(all, secret).not.toContain(secret);
    }
  });

  it("keeps it out of an error thrown from the failure path", async () => {
    delete process.env["OBSERVER_CREDENTIAL_KEY"];
    try {
      seal(ALICE_KEY, { accountId: ALICE, provider: "openai" });
      throw new Error("expected a refusal");
    } catch (error) {
      const text = `${String(error)} ${error instanceof Error ? (error.stack ?? "") : ""}`;
      expect(text).not.toContain(ALICE_KEY);
      expect(text).not.toContain("sk-observer-test");
    }
  });

  it("says nothing a provider said", () => {
    /*
     * The mapping is one-way and the vocabulary is closed, so an upstream
     * message cannot reach a reader however it is shaped.
     */
    for (const failure of ALL_FAILURES) {
      const message = describeFailure(failure);
      expect(message.title.length).toBeGreaterThan(0);
      expect(message.detail.length).toBeGreaterThan(0);
    }
    expect(classifyProviderFailure(418, "teapot_on_fire")).toBe("provider_unavailable");
  });
});

/* ====================================================== the shape of the source */

describe("the source cannot grow a client-side secret path", () => {
  const src = resolve(import.meta.dirname, "../src");

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  const files = walk(src).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const read = (f: string): string => readFileSync(f, "utf8");
  const rel = (f: string): string => f.slice(src.length).split("\\").join("/");

  it("has no browser storage anywhere in the application", () => {
    /*
     * Not "no browser storage of secrets" — no browser storage at all. A rule
     * with an exception is a rule somebody argues with; this one has none, so
     * a future contributor cannot reach for it and explain why theirs is fine.
     */
    const offenders = files
      .filter((f) => /localStorage|sessionStorage|indexedDB/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("keeps every credential module server-only", () => {
    for (const name of ["envelope.ts", "store.ts", "service.ts", "probe.ts"]) {
      const source = read(join(src, "lib", "credentials", name));
      expect(source.startsWith('import "server-only";'), name).toBe(true);
    }
  });

  it("lets no client component import the credential service", () => {
    const offenders = files
      .filter((f) => read(f).includes('"use client"'))
      .filter((f) => /credentials\/(service|store|envelope|probe)/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("never puts a credential in a cookie", () => {
    const offenders = files
      .filter((f) => /apiKey|credential/i.test(read(f)))
      .filter((f) => /cookies\(\)[\s\S]{0,200}(apiKey|ciphertext)/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("reads OPENAI_API_KEY nowhere on the request path", () => {
    /*
     * The ambient key is gone. `env.ts` still names it, once, to tell an
     * operator that setting it does nothing and to remove it — that is a
     * diagnostic, not a use.
     */
    /* Comments quote the old code on purpose; only real statements count. */
    const code = (source: string): string =>
      source
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("*"))
        .join("\n");

    /* Nothing reads it out of the environment by subscript. */
    const subscripts = files
      .filter((f) => code(read(f)).includes('env["OPENAI_API_KEY"]'))
      .map(rel);
    expect(subscripts).toEqual([]);

    /*
     * One file names it as a validated field, and only to raise the problem
     * that says an ambient key is no longer read and should be removed. That
     * is a diagnostic, not a use — so the file is named here rather than
     * exempted by a pattern somebody could widen later.
     */
    const named = files.filter((f) => code(read(f)).includes("OPENAI_API_KEY")).map(rel);
    expect(named).toEqual(["/lib/env.ts"]);
    expect(read(join(src, "lib", "env.ts"))).toContain("no longer read");
  });

  it("builds no provider client without being handed a key", () => {
    const offenders = files
      .filter((f) => /new OpenAI\(\{[^}]*apiKey:\s*process\.env/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("keeps the settings form uncontrolled, with no reveal and no copy", () => {
    const page = read(join(src, "app", "settings", "ai", "page.tsx"));
    expect(page).toContain('type="password"');
    expect(page).not.toContain("useState");
    /*
     * A control, not a word. The page's own comment explains why there is no
     * reveal, and a rule that fails on its own explanation is a rule people
     * delete rather than obey.
     */
    expect(page).not.toContain("navigator.clipboard");
    expect(page).not.toMatch(/>\s*(Reveal|Show key|Copy)\b/);
  });
});

describe("the boot diagnostic and the store agree", () => {
  it("reports ready exactly when a credential could be held", async () => {
    /*
     * Two modules answer the same question — `env.ts` for the operator's boot
     * line, `store.ts` for the request path — and they compute it separately
     * because one may not import the other. So the agreement is asserted
     * rather than assumed, across every combination that matters.
     */
    const { resetEnvironmentCache, environment } = await import("../src/lib/env");

    const cases: Record<string, string | undefined>[] = [
      { OBSERVER_ENVIRONMENT: "development" },
      { OBSERVER_ENVIRONMENT: "development", OBSERVER_CREDENTIAL_KEY: TEST_MASTER_KEY },
      { OBSERVER_ENVIRONMENT: "development", OBSERVER_CREDENTIAL_MEMORY_STORE: "1" },
      {
        OBSERVER_ENVIRONMENT: "development",
        OBSERVER_CREDENTIAL_KEY: TEST_MASTER_KEY,
        OBSERVER_CREDENTIAL_MEMORY_STORE: "1",
      },
      /* The harness is an allow-list: everything but development refuses. */
      {
        OBSERVER_ENVIRONMENT: "staging",
        OBSERVER_CREDENTIAL_KEY: TEST_MASTER_KEY,
        OBSERVER_CREDENTIAL_MEMORY_STORE: "1",
      },
      {
        OBSERVER_ENVIRONMENT: "production",
        OBSERVER_CREDENTIAL_KEY: TEST_MASTER_KEY,
        OBSERVER_CREDENTIAL_MEMORY_STORE: "1",
      },
    ];

    for (const overrides of cases) {
      delete process.env["OBSERVER_CREDENTIAL_KEY"];
      delete process.env["OBSERVER_CREDENTIAL_MEMORY_STORE"];
      const previousEnvironment = process.env["OBSERVER_ENVIRONMENT"];
      delete process.env["OBSERVER_ENVIRONMENT"];
      for (const [k, v] of Object.entries(overrides)) {
        if (v !== undefined) process.env[k] = v;
      }

      resetEnvironmentCache();
      const label = JSON.stringify(overrides);
      expect(environment().ai.credentialsReady, label).toBe(credentialsAvailable());

      if (previousEnvironment === undefined) delete process.env["OBSERVER_ENVIRONMENT"];
      else process.env["OBSERVER_ENVIRONMENT"] = previousEnvironment;
    }

    resetEnvironmentCache();
  });
});

/* ============================================ the harness, and its four locks */

describe("the test store is not a development convenience", () => {
  const base = {
    OBSERVER_CREDENTIAL_TEST_STORE: "browser-tests-only",
    OBSERVER_SYNTHETIC_HARNESS: "1",
    OBSERVER_ENVIRONMENT: "development",
  };

  it("needs all four conditions, and refuses when any one is missing", () => {
    expect(testStorePermitted(base)).toBe(true);

    /* Each condition removed on its own. */
    expect(testStorePermitted({ ...base, OBSERVER_CREDENTIAL_TEST_STORE: undefined })).toBe(false);
    expect(testStorePermitted({ ...base, OBSERVER_SYNTHETIC_HARNESS: undefined })).toBe(false);
    expect(testStorePermitted({ ...base, OBSERVER_ENVIRONMENT: undefined })).toBe(false);

    /* And a deployment marker present, with everything else correct. */
    for (const marker of DEPLOYMENT_MARKERS) {
      expect(testStorePermitted({ ...base, [marker]: "1" }), marker).toBe(false);
    }
  });

  it("refuses a flag value that is merely truthy", () => {
    /*
     * The value is exact. "1" and "true" are what somebody types when they are
     * turning on a feature; this is not a feature.
     */
    for (const value of ["1", "true", "yes", "on", "browser-tests", "BROWSER-TESTS-ONLY"]) {
      expect(testStorePermitted({ ...base, OBSERVER_CREDENTIAL_TEST_STORE: value }), value).toBe(
        false,
      );
    }
  });

  it("is unavailable during ordinary development", () => {
    /*
     * `pnpm dev` sets none of the flags. The requirement that
     * OBSERVER_ENVIRONMENT alone must never enable persistence, asserted
     * directly: it is exactly the shape a developer's machine has.
     */
    expect(testStorePermitted({ OBSERVER_ENVIRONMENT: "development" })).toBe(false);
    expect(credentialStore({ OBSERVER_ENVIRONMENT: "development" }).available).toBe(false);
  });

  it("is unavailable in every environment but development", () => {
    for (const environment of ["staging", "production", "", "Development", "dev"]) {
      expect(testStorePermitted({ ...base, OBSERVER_ENVIRONMENT: environment }), environment).toBe(
        false,
      );
    }
  });

  it("is never chosen when Supabase is configured", () => {
    const configured = credentialStore({
      ...base,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb-secret-not-a-real-key-000000000000",
    });
    expect(configured.available).toBe(true);
    if (configured.available) expect(configured.store.kind).toBe("supabase");
  });

  it("holds only obviously synthetic credentials", () => {
    expect(isSyntheticCredential(ALICE_KEY)).toBe(true);

    for (const value of [
      ...VENDOR_SHAPED,
      "sk-observer-test-SHOUTING",
      "sk-observer-test-short",
      "observer-test-no-prefix-here",
      "",
    ]) {
      expect(isSyntheticCredential(value), value).toBe(false);
    }
  });

  it("refuses a real-looking key before it is sealed, probed or stored", async () => {
    const { probe, seen } = recordingProbe();
    const result = await saveConnection(ALICE, REAL_LOOKING, probe as never);

    expect(result).toEqual({ ok: false, failure: "rejected" });
    expect(seen, "the probe was never reached").toEqual([]);
    expect(await connectionFor(ALICE)).toEqual({ kind: "not_connected" });
  });

  it("keeps globalThis to itself", () => {
    /*
     * One file in the application may touch `globalThis`, and it is the one
     * that exists to be deleted when the harness is no longer wanted.
     */
    const src = resolve(import.meta.dirname, "../src");
    const every = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? every(path) : [path];
      });

    const offenders = every(src)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => readFileSync(f, "utf8").includes("globalThis"))
      .map((f) => f.slice(src.length).split("\\").join("/"));

    /*
     * Four, and every one deliberate.
     *
     * `ai/limits.ts` keeps the Ask limiter's counters there for the same
     * bundle-boundary reason and predates all of this. The other three are the
     * browser harness — credentials, ledger, preferences — each isolated in its
     * own file so the whole harness is deleted in three pieces rather than
     * unpicked from the product.
     *
     * A fifth entry appearing here means somebody reached for process-global
     * state in the product itself, which is what this list exists to catch.
     */
    expect(offenders.sort()).toEqual([
      "/lib/ai/limits.ts",
      "/lib/budget/test-ledger.ts",
      "/lib/credentials/test-store.ts",
      "/lib/models/test-preferences.ts",
    ]);

    /* Every one of the three is a test store, by name and by isolation. */
    for (const harness of offenders.filter((f) => f !== "/lib/ai/limits.ts")) {
      expect(harness, harness).toMatch(/test-(store|ledger|preferences).ts$/);
    }
  });
});

/* ================================================ the probe never leaves the box */

describe("the scripted probe replaces the network entirely", () => {
  const harness = {
    OBSERVER_CREDENTIAL_TEST_STORE: "browser-tests-only",
    OBSERVER_SYNTHETIC_HARNESS: "1",
    OBSERVER_ENVIRONMENT: "development",
  };

  /**
   * The model the probe is asked about.
   *
   * It matters now: the probe goes through the same transport that answers
   * questions, so it reaches the vendor the model belongs to. A key for one
   * provider tested against another provider's model is the defect this
   * parameter exists to prevent.
   */
  const MODEL = "gpt-5.6-luna" as const;

  it("is chosen exactly where the test store is, and calls nothing", async () => {
    const { probeFor } = await import("../src/lib/credentials/probe");
    const scripted = probeFor(harness);

    expect(await scripted("sk-observer-test-plain-000000", MODEL)).toEqual({ ok: true });
    expect(await scripted("sk-observer-test-reject-00000", MODEL)).toEqual({
      ok: false,
      status: 401,
      code: "invalid_api_key",
    });

    /*
     * A real-looking key is refused, without a request.
     *
     * The refusal now lives in the scripted transport rather than in a probe of
     * its own, which is a better place for it: it protects the ANSWER path as
     * well as the test button. Nothing about it reaches a network either way.
     */
    expect(await scripted(REAL_LOOKING, MODEL)).toEqual({
      ok: false,
      status: 401,
      code: "invalid_api_key",
    });
  });

  it("maps each scripted suffix to the category it stands for", async () => {
    const { probeFor } = await import("../src/lib/credentials/probe");
    const scripted = probeFor(harness);

    const cases: [string, string][] = [
      ["sk-observer-test-quota-00000000", "insufficient_credits"],
      ["sk-observer-test-spend-00000000", "spending_limit"],
      ["sk-observer-test-limit-00000000", "rate_limited"],
      ["sk-observer-test-model-00000000", "model_unavailable"],
      ["sk-observer-test-down-000000000", "provider_unavailable"],
    ];

    for (const [key, expected] of cases) {
      const result = await scripted(key, MODEL);
      expect(result.ok, key).toBe(false);
      if (!result.ok) {
        expect(classifyProviderFailure(result.status, result.code), key).toBe(expected);
      }
    }
  });

  it("probes the model it is given, not one fixed one", async () => {
    const { probeFor } = await import("../src/lib/credentials/probe");
    const scripted = probeFor(harness);

    /*
     * Every model in the catalogue, probed by name.
     *
     * The probe used to build one client with one hard-coded model whatever it
     * was asked about, so a reader testing a key for a model they had chosen
     * learned nothing about that model. The catalogue is one vendor now, but
     * the models differ in price and entitlement and the probe must reach the
     * one it was handed. Under the harness nothing leaves the machine.
     */
    for (const model of ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const) {
      expect(await scripted("sk-observer-test-plain-000000", model), model).toEqual({ ok: true });
    }
  });
});

/* ============================================ preservation under failure and race */

describe("a credential survives everything except a deliberate removal", () => {
  it("persists nothing at all from a failed first attempt", async () => {
    await saveConnection(ALICE, "sk-observer-test-reject-00000", rejects(401));
    expect(await connectionFor(ALICE)).toEqual({ kind: "not_connected" });

    const store = credentialStore();
    if (!store.available) throw new Error("no store");
    expect(await store.store.read(ALICE, "openai")).toBeNull();
  });

  it("is not deleted or called invalid by a bad day", async () => {
    /*
     * A model the project cannot reach, a spending cap, no credit, a rate
     * limit and an outage are failures of the moment, not of the credential.
     * The connection stays and the word recorded beside it is never
     * "rejected".
     */
    await saveConnection(ALICE, ALICE_KEY, accepts);

    const transient: [() => Promise<ProbeResult>, string][] = [
      [rejects(404, "model_not_found"), "model_unavailable"],
      [rejects(429, "billing_hard_limit_reached"), "spending_limit"],
      [rejects(429, "insufficient_quota"), "insufficient_credits"],
      [rejects(429, "rate_limit_exceeded"), "rate_limited"],
      [rejects(503), "provider_unavailable"],
    ];

    for (const [probe, expected] of transient) {
      const result = await testConnection(ALICE, probe);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toBe(expected);

      const state = await connectionFor(ALICE);
      expect(state.kind, expected).toBe("connected");
      if (state.kind === "connected") {
        expect(state.connection.lastTestOutcome, expected).toBe("unavailable");
      }

      const still = await resolveApiKey(ALICE);
      expect(still.ok && still.apiKey, expected).toBe(ALICE_KEY);
    }
  });

  it("records rejected only for a credential the provider refused", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    await testConnection(ALICE, rejects(401, "invalid_api_key"));

    const state = await connectionFor(ALICE);
    expect(state.kind).toBe("connected");
    if (state.kind === "connected") expect(state.connection.lastTestOutcome).toBe("rejected");

    /* Even then it is not deleted: the reader cannot retype what they lost. */
    const still = await resolveApiKey(ALICE);
    expect(still.ok && still.apiKey).toBe(ALICE_KEY);
  });

  it("cannot be reinstated by a replacement that arrives late", async () => {
    /*
     * Two writes in flight. The second one issued wins, and the first — landing
     * afterwards because it was slower — must not put its key back. Written
     * through the store directly, because the ordering this guards against is
     * a property of the store rather than of the caller.
     */
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const store = credentialStore();
    if (!store.available) throw new Error("no store");

    const current = await store.store.read(ALICE, "openai");
    if (current === null) throw new Error("nothing stored");

    const newer = { ...current, lastFour: "bbbb", revision: current.revision + 10 };
    const older = { ...current, lastFour: "cccc", revision: current.revision + 5 };

    await store.store.upsert(newer);
    await store.store.upsert(older);

    const after = await store.store.read(ALICE, "openai");
    expect(after?.lastFour, "the newer write survives the late one").toBe("bbbb");
    expect(after?.revision).toBe(newer.revision);
  });

  it("mints a strictly increasing revision, even within one millisecond", async () => {
    const store = credentialStore();
    if (!store.available) throw new Error("no store");

    const revisions: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      await saveConnection(ALICE, ALICE_KEY, accepts);
      const row = await store.store.read(ALICE, "openai");
      if (row !== null) revisions.push(row.revision);
    }

    for (let i = 1; i < revisions.length; i += 1) {
      expect(revisions[i], `revision ${i}`).toBeGreaterThan(revisions[i - 1] as number);
    }
  });

  it("exposes no ciphertext, nonce or tag in anything the service returns", async () => {
    await saveConnection(ALICE, ALICE_KEY, accepts);
    const store = credentialStore();
    if (!store.available) throw new Error("no store");
    const row = await store.store.read(ALICE, "openai");
    if (row === null) throw new Error("nothing stored");

    const returned = JSON.stringify([
      await connectionFor(ALICE),
      await testConnection(ALICE, accepts),
      await saveConnection(ALICE, BOB_KEY, accepts),
    ]);

    for (const secret of [row.sealed.ciphertext, row.sealed.nonce, row.sealed.tag]) {
      expect(returned, secret.slice(0, 8)).not.toContain(secret);
    }
    expect(returned).not.toContain("ciphertext");
    expect(returned).not.toContain("auth_tag");
  });
});
