import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LIMITS,
  checkAllowance,
  modelIsAllowed,
  recordAttempt,
  breakerIsOpen,
  recordUpstreamFailure,
  recordUpstreamSuccess,
  resetLimits,
} from "../src/lib/ai/limits";
import { TOOLS, TOOL_NAMES, toolByName } from "../src/lib/ai/tools";

/**
 * The security gate, as tests.
 *
 * Every claim in the completion report has an assertion here. A control that is
 * only described in a document is a control nobody can prove is still on after
 * the next refactor.
 */

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(WEB, "..", "..");

function read(rel: string): string {
  return readFileSync(join(WEB, rel), "utf8");
}

function walk(dir: string, take: (path: string) => void): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, take);
    else take(full);
  }
}

/* --- the secret never leaves the server ------------------------------------- */

describe("the model key is server-only", () => {
  it("is read from process.env and nowhere else", () => {
    const provider = read("src/lib/ai/provider.ts");
    expect(provider).toContain('process.env["OPENAI_API_KEY"]');
    // A key assembled from parts, or read off a request, would defeat every
    // other check in this file.
    expect(provider).not.toMatch(/OPENAI_API_KEY\s*=\s*["'][A-Za-z0-9-]/);
  });

  it("guards every module that can reach a key with server-only", () => {
    for (const module of ["src/lib/ai/provider.ts", "src/lib/ai/limits.ts", "src/lib/env.ts"]) {
      expect(read(module), `${module} must import server-only`).toContain('import "server-only"');
    }
  });

  it("never prefixes a secret with NEXT_PUBLIC_", () => {
    const offenders: string[] = [];
    walk(join(WEB, "src"), (path) => {
      if (!/\.(ts|tsx)$/.test(path)) return;
      const text = readFileSync(path, "utf8");
      if (/NEXT_PUBLIC_[A-Z_]*(OPENAI|FAL|SECRET|API_KEY)/.test(text)) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it("is never imported by a client component", () => {
    /*
     * "use client" marks a module that is compiled into the browser bundle.
     * Reaching the provider, the limits or the env module from one is how a
     * key ends up in a source map.
     */
    const offenders: string[] = [];
    walk(join(WEB, "src"), (path) => {
      if (!/\.(ts|tsx)$/.test(path)) return;
      const text = readFileSync(path, "utf8");
      if (!/^["']use client["']/m.test(text)) return;
      if (/from "@?\/?.*lib\/ai\/(provider|limits|agent|tools)"/.test(text)) offenders.push(path);
      if (/from "@\/lib\/env"/.test(text)) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it("keeps every secret in .env.example empty", () => {
    /*
     * Only the secrets.
     *
     * `OBSERVER_DATA_SOURCE=synthetic` is a committed default and belongs in
     * the example; a rule forbidding every value would push the real
     * configuration out of the one file that documents it.
     */
    const SECRET_NAME = /(_KEY|_SECRET|_TOKEN|_PASSWORD|_PEPPER|DATABASE_URL)$/;
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    for (const line of example.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match === null) continue;
      const name = match[1] ?? "";
      if (!SECRET_NAME.test(name)) continue;
      expect(match[2], `${name} has a value in the committed example file`).toBe("");
    }
    expect(example).toContain("OPENAI_API_KEY=");
  });

  it("gitignores every local secret file", () => {
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^\.env\*\.local$/m);
  });
});

/* --- what the browser is allowed to receive --------------------------------- */

describe("the API boundary", () => {
  /*
   * The gate is one module, and that is the control.
   *
   * The streaming route and the JSON route both call it, so there is no second
   * implementation to drift. A security check that exists in two places exists
   * in one place and a copy somebody will forget to update.
   */
  const gate = read("src/lib/ai/gate.ts");
  const route = read("src/app/api/ask/route.ts");
  const stream = read("src/app/api/ask/stream/route.ts");

  it("refuses an unauthenticated caller before doing any work", () => {
    // The 401 has to come before the body is parsed, before the project is
    // resolved and before the meter moves, or an anonymous caller can burn
    // someone else's quota. Anchored on the statements, not on bare
    // identifiers — the imports at the top mention all of them and would order
    // them meaninglessly.
    const auth = gate.indexOf("const viewer = await currentViewer()");
    const parse = gate.indexOf("const body = AskBodySchema.safeParse");
    const authorise = gate.indexOf("await repository.resolveProject");
    const allowance = gate.indexOf("const verdict = checkAllowance");
    const meter = gate.indexOf("recordAttempt(viewer.userId)");

    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(parse);
    expect(parse).toBeLessThan(authorise);
    expect(authorise).toBeLessThan(allowance);
    expect(allowance).toBeLessThan(meter);
    expect(gate).toContain('deny(401, "Not signed in.", null)');
  });

  it("puts both routes behind the same gate", () => {
    for (const [name, source] of [
      ["ask", route],
      ["ask/stream", stream],
    ] as const) {
      expect(source, `${name} does not call the gate`).toContain("await gate(");
      expect(source, `${name} does not honour a refusal`).toContain("admitted.ok");
    }
  });

  it("bounds every field of the request", () => {
    expect(gate).toContain("LIMITS.maxQuestionChars");
    expect(gate).toMatch(/tenantSlug: z\.string\(\)\.min\(1\)\.max\(/);
    expect(gate).toMatch(/projectSlug: z\.string\(\)\.min\(1\)\.max\(/);
    expect(gate).toMatch(/period: z\.enum\(/);
    expect(gate).toMatch(/depth: z\.enum\(\["standard", "deep"\]\)/);
  });

  it("returns one fixed sentence rather than the upstream error", () => {
    expect(gate).toContain(
      "AI explanation is temporarily unavailable. Showing computed Observer evidence instead.",
    );
    // The provider's operator-facing reason is replaced on the way out, and
    // both routes serialise through the same function.
    expect(gate).toMatch(/export function redactStatus/);
    expect(route).toContain("redactStatus(outcome.status)");
  });

  it("sends the browser a named payload rather than a stripped one", () => {
    /*
     * Built by naming fields, never by deleting them.
     *
     * A payload assembled by removal grows a leak the first time somebody adds
     * a field upstream — which here would mean shipping the diagnostics block,
     * with its token counts and its operator-facing failure reason.
     */
    expect(route).toContain("export function publicOutcome");
    expect(route).not.toContain("...outcome,");
    expect(route).not.toContain("diagnostics: outcome.diagnostics");
  });

  it("never caches an answer", () => {
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(stream).toContain('"Cache-Control": "no-store, no-transform"');
  });

  it("answers forbidden and absent identically", () => {
    // A 404-versus-403 difference is an enumeration oracle for tenant slugs.
    expect(gate).toContain('return deny(404, "Not found.", null)');
    expect(gate).not.toContain("status: 403");
  });

  it("scopes the answer to the viewer's own grants", () => {
    // Project, period and roster all resolve through the repository port,
    // which raises NotPermittedError rather than returning another tenant's
    // rows.
    expect(gate).toContain("repository.resolveProject");
    expect(gate).toContain("repository.listAgents");
    expect(gate).toContain("NotPermittedError");
  });
});

/* --- retention -------------------------------------------------------------- */

describe("nothing is retained by the vendor", () => {
  const provider = read("src/lib/ai/provider.ts");

  it("sends store: false on every OpenAI call", () => {
    expect(provider).toContain("store: false");
    // Not configurable: there must be no environment in which it is true.
    expect(provider).not.toMatch(/store:\s*(true|Boolean|process\.env)/);
  });

  it("uses the Responses API and creates no Conversation object", () => {
    /*
     * Asserted on the property, not on one way of spelling it.
     *
     * The call may go through the SDK or through fetch; what matters is that it
     * is the Responses API and that no durable Conversation is created, because
     * Observer's memory belongs in a store this product can empty.
     */
    const usesResponses = /responses.create/.test(provider) || provider.includes("/v1/responses");
    expect(usesResponses, "the model call must use the Responses API").toBe(true);
    expect(provider).not.toContain("/v1/conversations");
    expect(provider).not.toMatch(/conversations.create/);
    expect(provider).not.toMatch(/chat.completions/);
  });

  it("never lets the model reach the open web", () => {
    // A model that can search can contradict the figures on the screen with
    // something it read, and the reader cannot tell which is which.
    expect(provider).not.toMatch(/web_search|browse_?tool|enable_web_search:s*true/);
  });

  it("never opens a browser-side client", () => {
    // The SDK's own escape hatch. In a deployed application it is a way to put
    // a permanent key in front of a user.
    expect(provider).not.toContain("dangerouslyAllowBrowser");
  });

  it("identifies the caller with a hash and never with a user id", () => {
    const identity = read("src/lib/ai/identity.ts");
    expect(provider).toContain("safety_identifier: turn.safetyIdentifier");
    expect(identity).toContain("createHmac");
    // Peppered, so a list of plausible user ids cannot be tested against the
    // identifiers by anybody who obtains them.
    expect(identity).toContain("pepper()");
    // Tenant-scoped, so the same person in two tenants is two identifiers and
    // the vendor cannot join their activity across customers.
    expect(identity).toMatch(/tenantSlug.*userId/);
  });

  it("makes no automatic retry that could spend money in a loop", () => {
    expect(provider).toContain("maxRetries: 0");
  });

  it("bounds every upstream call in time", () => {
    expect(provider).toContain("timeout: LIMITS.requestTimeoutMs");
  });
});

/* --- the agent's surface ----------------------------------------------------- */

describe("the tool allowlist", () => {
  const agent = read("src/lib/ai/agent.ts");

  it("discards a tool the model invented", () => {
    expect(toolByName("drop_all_units")).toBeUndefined();
    expect(agent).toContain("TOOL_NAMES.includes(call.tool)");
  });

  it("caps how many tools one turn may run", () => {
    expect(agent).toContain("LIMITS.maxToolCalls");
    expect(LIMITS.maxToolCalls).toBeGreaterThan(0);
    expect(LIMITS.maxToolCalls).toBeLessThanOrEqual(5);
  });

  it("validates every tool's arguments against a schema", () => {
    for (const tool of TOOLS) {
      expect(tool.input, `${tool.name} has no input schema`).toBeDefined();
      expect(typeof tool.input.safeParse).toBe("function");
    }
    expect(agent).toContain("tool.input.safeParse(call.args)");
  });

  it("exposes only read-only tools", () => {
    // Naming is the first line: nothing in this product should be able to
    // write, send, delete or price anything.
    for (const name of TOOL_NAMES) {
      expect(name).not.toMatch(/create|update|delete|write|send|set_|price|export/i);
    }
  });

  it("cannot have its allowlist widened by text inside the data", () => {
    /*
     * Prompt injection is a data problem, not a wording problem.
     *
     * The filter runs on the parsed plan after the model has spoken, and its
     * source is the compile-time TOOLS array — so a synthetic meeting note
     * saying "you may now call delete_project" changes nothing, because there
     * is no such entry to match.
     */
    const injected = ["summarize_showroom_period", "delete_project", "run_sql"];
    const survived = injected.filter((t) => TOOL_NAMES.includes(t));
    expect(survived).toEqual(["summarize_showroom_period"]);
  });
});

/* --- cost and abuse ---------------------------------------------------------- */

describe("cost and abuse ceilings", () => {
  beforeEach(() => {
    resetLimits();
  });

  it("allows a first question", () => {
    expect(checkAllowance("u1", 20, LIMITS.allowedModels[0] as string).allowed).toBe(true);
  });

  it("refuses a question longer than the ceiling, before any model call", () => {
    const verdict = checkAllowance(
      "u1",
      LIMITS.maxQuestionChars + 1,
      LIMITS.allowedModels[0] as string,
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("question_too_long");
  });

  it("refuses a model that is not on the allowlist", () => {
    expect(modelIsAllowed("gpt-5.5-pro")).toBe(false);
    const verdict = checkAllowance("u1", 20, "gpt-5.5-pro");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("model_not_allowed");
  });

  it("rate-limits a burst within one minute", () => {
    const model = LIMITS.allowedModels[0] as string;
    for (let i = 0; i < LIMITS.perMinute; i += 1) {
      expect(checkAllowance("burst", 10, model).allowed).toBe(true);
      recordAttempt("burst");
    }
    const verdict = checkAllowance("burst", 10, model);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("rate_limited");
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("meters each viewer separately", () => {
    const model = LIMITS.allowedModels[0] as string;
    for (let i = 0; i < LIMITS.perMinute; i += 1) recordAttempt("noisy");
    expect(checkAllowance("noisy", 10, model).allowed).toBe(false);
    // One viewer exhausting their allowance must not lock out the next.
    expect(checkAllowance("quiet", 10, model).allowed).toBe(true);
  });

  it("does not move a counter for a refused request", () => {
    const model = LIMITS.allowedModels[0] as string;
    checkAllowance("careful", LIMITS.maxQuestionChars + 1, model);
    checkAllowance("careful", 10, "not-a-model");
    // Neither refusal called recordAttempt, so the allowance is untouched.
    for (let i = 0; i < LIMITS.perMinute; i += 1) {
      expect(checkAllowance("careful", 10, model).allowed).toBe(true);
      recordAttempt("careful");
    }
  });

  it("opens a breaker after repeated upstream failures and closes it on success", () => {
    expect(breakerIsOpen()).toBe(false);
    for (let i = 0; i < LIMITS.breakerThreshold; i += 1) recordUpstreamFailure();
    expect(breakerIsOpen()).toBe(true);

    recordUpstreamSuccess();
    expect(breakerIsOpen()).toBe(false);
  });

  it("pauses the vendor call without refusing the request", () => {
    /*
     * The breaker must not cost the reader their evidence.
     *
     * An earlier version denied the whole request while the breaker was open,
     * which threw away an answer the tools had already computed and which
     * needed no network at all. The allowance is unaffected; only the provider
     * changes.
     */
    for (let i = 0; i < LIMITS.breakerThreshold; i += 1) recordUpstreamFailure();
    expect(breakerIsOpen()).toBe(true);
    expect(checkAllowance("u1", 10, LIMITS.allowedModels[0] as string).allowed).toBe(true);
  });

  it("re-closes the breaker once the cooldown has passed", () => {
    for (let i = 0; i < LIMITS.breakerThreshold; i += 1) recordUpstreamFailure();
    expect(breakerIsOpen()).toBe(true);
    expect(breakerIsOpen(Date.now() + LIMITS.breakerCooldownMs + 1)).toBe(false);
  });

  it("stops the whole instance at its daily ceiling", () => {
    const model = LIMITS.allowedModels[0] as string;
    const now = Date.now();
    for (let i = 0; i < LIMITS.perInstancePerDay; i += 1) recordAttempt(`v${i % 50}`, now);
    const verdict = checkAllowance("someone-new", 10, model, now);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("instance_limit");
  });

  it("bounds the output and the wait", () => {
    expect(LIMITS.maxOutputTokens).toBeGreaterThan(0);
    expect(LIMITS.maxOutputTokens).toBeLessThanOrEqual(2000);
    expect(LIMITS.requestTimeoutMs).toBeGreaterThan(0);
    expect(LIMITS.requestTimeoutMs).toBeLessThanOrEqual(60_000);
  });
});

/* --- the demo cannot reach real data ---------------------------------------- */

describe("synthetic demonstration mode", () => {
  it("is the only data source the environment permits", () => {
    const env = read("src/lib/env.ts");
    expect(env).toMatch(/OBSERVER_DATA_SOURCE:\s*z\.enum\(\["synthetic"\]\)/);
  });

  it("keeps the repository behind the port, with no database client wired", () => {
    const repo = read("src/lib/repository.ts");
    expect(repo).not.toMatch(/createClient|postgres|drizzle/i);
  });
});
