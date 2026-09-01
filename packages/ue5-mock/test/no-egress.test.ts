import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockObserverBackend } from "../src/backend";
import { activationRequest, batch, bearer, event, WHEN } from "./helpers";
import { SUPPORTED_SCENARIOS } from "../src/scenarios";

/**
 * NOTHING LEAVES THIS MACHINE, AND NOTHING TOUCHES A DATABASE.
 *
 * The same discipline `apps/web/test/no-egress.test.ts` applies to the AI layer,
 * applied here for the same reason: this package is meant to be handed to
 * somebody else and run on their machine, against their build, with no
 * explanation from us. It must be provably inert.
 *
 * Two proofs, because each catches what the other cannot.
 *
 *   **Runtime.** `fetch` is replaced with a recorder that throws. Every method
 *   on the backend is driven, and must produce zero calls.
 *
 *   **Static.** Every source file is read and checked for an outbound client, a
 *   Supabase import or a hard-coded remote URL. A file added next year that
 *   quietly phones home fails here rather than in somebody's showroom.
 *
 * `server.ts` is exempt from the static sweep's `createServer` check and nothing
 * else — it *listens*, which is the opposite of egress, and it is asserted
 * elsewhere to bind loopback only.
 */

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

let attempts: string[] = [];
let realFetch: typeof globalThis.fetch;

beforeEach(() => {
  attempts = [];
  realFetch = globalThis.fetch;
  /*
   * A recorder that also REFUSES. Returning a plausible response would let a
   * module that should never have called out carry on as though it had
   * succeeded, and the test would pass on the strength of a mock.
   */
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : String((input as { url?: unknown }).url ?? input);
    attempts.push(url);
    throw new Error(`egress attempted: ${url}`);
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("the backend reaches nothing", () => {
  it("activates, ingests and heartbeats without one outbound request", () => {
    const backend = new MockObserverBackend();
    const code = backend.issueActivationCode();
    const activated = backend.activate(activationRequest({ activation_code: code }));
    if (activated.kind !== "response") throw new Error("expected a response");
    const token = (activated.body as Record<string, string>)["source_token"] as string;

    backend.ingest(bearer(token), batch([event(), event()]));
    backend.heartbeat(bearer(token), {
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
    });

    expect(attempts).toEqual([]);
  });

  it("survives every failure directive without reaching out", () => {
    const backend = new MockObserverBackend();
    const code = backend.issueActivationCode();
    const activated = backend.activate(activationRequest({ activation_code: code }));
    if (activated.kind !== "response") throw new Error("expected a response");
    const token = (activated.body as Record<string, string>)["source_token"] as string;

    backend.push(
      { kind: "rate_limit", retryAfterSeconds: 1 },
      { kind: "unavailable" },
      { kind: "batch_too_large" },
      { kind: "malformed_request" },
      { kind: "drop_before_processing" },
      { kind: "drop_after_processing" },
    );
    for (let index = 0; index < 6; index += 1) {
      backend.ingest(bearer(token), batch([event()]));
    }
    expect(attempts).toEqual([]);
  });
});

/* ===================================================== the static sweep */

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
}

describe("nothing in the source could reach out even if it wanted to", () => {
  const files = sourceFiles(SOURCE);

  it("finds the files it is meant to be checking", () => {
    /* A sweep over an empty list is a guard nobody is protected by. */
    expect(files.length).toBeGreaterThan(4);
  });

  it("contains no outbound client", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const suspicious = [
        /\bfetch\s*\(/,
        /\bXMLHttpRequest\b/,
        /\bWebSocket\b/,
        /from\s+["']node:https["']/,
        /\brequire\(["']node:https?["']\)/,
        /\bhttps?\.request\b/,
        /\brequest\s*\(\s*["']http/,
      ];
      if (suspicious.some((pattern) => pattern.test(text))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("uses `node:http` to listen and for nothing else", () => {
    /*
     * `node:http` is both a server and a client, so its mere presence proves
     * nothing either way. What matters is which symbols come out of it:
     * `createServer` listens, `request` and `get` reach out. Only the first is
     * permitted, and only in the one file whose job is listening.
     */
    const importers = files.filter((file) =>
      /from\s+["']node:http["']/.test(readFileSync(file, "utf8")),
    );
    expect(importers.map((file) => file.replace(/.*[\\/]/, ""))).toEqual(["server.ts"]);

    const text = readFileSync(join(SOURCE, "server.ts"), "utf8");
    const clause = /import\s*\{([^}]*)\}\s*from\s*["']node:http["']/.exec(text)?.[1] ?? "";
    const symbols = clause
      .split(",")
      .map((part) => part.replace(/\btype\b/, "").trim())
      .filter((part) => part.length > 0);
    expect(symbols.sort()).toEqual(["IncomingMessage", "Server", "ServerResponse", "createServer"]);
  });

  it("imports nothing from Supabase or any vendor SDK", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/@supabase|postgres|drizzle|openai|anthropic/i.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("hard-codes no remote host", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
        const url = match[0];
        if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(url))
          offenders.push(`${file}: ${url}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("says in every file that it is scaffolding", () => {
    /*
     * Not decoration. This package is handed to somebody who has never read our
     * commit history, and the one thing they must not conclude is that it is a
     * preview of the production backend.
     */
    const declared = files.filter((file) => /MOCK-ONLY|mock|Mock/.test(readFileSync(file, "utf8")));
    expect(declared).toEqual(files);
  });
});

describe("the scenario list is the contract with whoever uses this", () => {
  it("covers activation, ingestion and diagnostics", () => {
    const prefixes = new Set(SUPPORTED_SCENARIOS.map((name) => name.split("_")[0]));
    expect(prefixes).toContain("activation");
    expect(prefixes).toContain("ingest");
    expect(prefixes).toContain("heartbeat");
  });

  it("names every situation the review asked to be reproducible", () => {
    const required = [
      "activation_success_first",
      "activation_invalid_code",
      "activation_expired_code",
      "activation_consumed_code",
      "activation_reactivation_same_source",
      "activation_source_suspended",
      "activation_rate_limited",
      "activation_unavailable",
      "ingest_all_accepted",
      "ingest_duplicate_event",
      "ingest_partial_success",
      "ingest_all_rejected",
      "ingest_unsupported_schema",
      "ingest_malformed_event",
      "ingest_event_too_large",
      "ingest_batch_too_large",
      "ingest_unauthorised_credential",
      "ingest_suspended_source",
      "ingest_rate_limited_retry_after",
      "ingest_unavailable_503",
      "ingest_transport_drop_before_processing",
      "ingest_transport_drop_after_processing",
      "ingest_storage_error_event_level",
    ];
    for (const scenario of required) {
      expect(SUPPORTED_SCENARIOS, scenario).toContain(scenario);
    }
  });

  it("lists each scenario once", () => {
    expect(new Set(SUPPORTED_SCENARIOS).size).toBe(SUPPORTED_SCENARIOS.length);
  });
});
