import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueActivationCode, type ObserverDb } from "@observer/sources";

import {
  activateWithAliases,
  mintAlias,
  normaliseAlias,
  recentCodes,
  resetAliases,
} from "../src/lib/madspace/activation-aliases";

/**
 * THE SHORT ACTIVATION CODE (ADR-0044, amended).
 *
 * `ACT-XXXX-XXXX` stands in for the real `obs.<selector>.<secret>` on the local
 * plane. What this proves: the alias reaches the frozen handler as the real
 * code, once; an unknown, spent or expired alias gets the unknown code's answer
 * byte for byte; lookups are limited per address; and the recent list never
 * carries the real code. The handler is the real one, over a port that
 * consumes a code exactly once, as the database does.
 */

const URL = "http://127.0.0.1:3400/functions/v1/observer-activate";
const ISSUED_AT = "2026-10-20T10:00:00.000Z";
const EXPIRES_AT = "2026-10-20T10:15:00.000Z";
const DURING = Date.parse("2026-10-20T10:05:00.000Z");
const AFTER = Date.parse("2026-10-20T10:15:01.000Z");

let issued: ReturnType<typeof issueActivationCode>;
let consumed = false;

const db = {
  activationConsume: vi.fn(async (input: { codeSelector: string; codeVerifier: string }) => {
    if (consumed || input.codeSelector !== issued.selector) return null;
    if (input.codeVerifier !== issued.verifier) return null;
    consumed = true;
    return {
      source_id: "33333333-3333-4333-8333-333333333333",
      account_id: "acct_test",
      project_id: "22222222-2222-4222-8222-222222222222",
      environment: "demo",
      display_label: "Main PC",
      purpose: "activation",
    };
  }),
};
const deps = { db: db as unknown as ObserverDb, env: process.env, now: () => new Date(DURING) };

function post(code: string, from = "203.0.113.7"): Request {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": from },
    body: JSON.stringify({
      activation_code: code,
      reported_environment: "demo",
      installation_nonce: randomUUID(),
      build: {
        app_version: "aliases-test",
        plugin_version: "aliases-test",
        build_id: "aliases-test",
        engine_version: "not-unreal",
      },
      os: "vitest",
    }),
  });
}

/** Status, headers that matter and body: what a caller can compare. */
async function seen(response: Response): Promise<string> {
  return JSON.stringify([
    response.status,
    response.headers.get("content-type"),
    response.headers.get("retry-after"),
    await response.text(),
  ]);
}

const ABOUT = {
  issuedAt: ISSUED_AT,
  expiresAt: EXPIRES_AT,
  client: "client-482",
  project: "Riverside Gardens",
  source: "Main PC",
};

beforeEach(() => {
  vi.stubEnv("OBSERVER_ACTIVATION_CODE_PEPPER", "b".repeat(64));
  vi.stubEnv("OBSERVER_SOURCE_TOKEN_PEPPER", "c".repeat(64));
  issued = issueActivationCode(process.env);
  consumed = false;
  db.activationConsume.mockClear();
  resetAliases();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("an alias", () => {
  it("is ACT and eight symbols with no 0, 1, I or O, and never repeats a live one", () => {
    const minted = Array.from({ length: 200 }, () => mintAlias(issued.plaintext, ABOUT, DURING));
    for (const alias of minted) expect(alias).toMatch(/^ACT-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(new Set(minted).size).toBe(200);
  });

  it.each([
    ["act-66sv-j9rj", "ACT-66SV-J9RJ"],
    ["ACT66SVJ9RJ", "ACT-66SV-J9RJ"],
    [" ACT 66SV J9RJ ", "ACT-66SV-J9RJ"],
    ["ACT-66SVJ9RJ", "ACT-66SV-J9RJ"],
  ])("reads %j as %s", (typed, alias) => {
    expect(normaliseAlias(typed)).toBe(alias);
  });

  it.each(["ACT-0000-0000", "ACT-66SV-J9R", "ACT-66SV-J9RJX", "XYZ-66SV-J9RJ", "obs.a.b"])(
    "is not %j",
    (typed) => {
      expect(normaliseAlias(typed)).toBeNull();
    },
  );
});

describe("the activation endpoint on the local plane", () => {
  it("activates with the alias, typed loosely, exactly once", async () => {
    const alias = mintAlias(issued.plaintext, ABOUT, DURING);
    const loose = alias.toLowerCase().replaceAll("-", "");

    const first = await activateWithAliases(post(loose), deps, DURING);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: "activated", environment: "demo" });
    expect(db.activationConsume).toHaveBeenCalledWith(
      expect.objectContaining({ codeSelector: issued.selector }),
    );

    /* Spent: the alias is gone, so the second press is an unknown code's. */
    db.activationConsume.mockClear();
    const again = await activateWithAliases(post(alias), deps, DURING);
    expect(again.status).toBe(401);
    expect(db.activationConsume).not.toHaveBeenCalled();
    expect(recentCodes(DURING)).toEqual([
      expect.objectContaining({ status: "activated", code: `${alias.slice(0, 9)}••••` }),
    ]);
  });

  it("answers an unknown, a spent and an expired alias exactly as it answers an unknown code", async () => {
    const unknownCode = await seen(
      await activateWithAliases(post(issueActivationCode(process.env).plaintext), deps, DURING),
    );
    const unknownAlias = await seen(await activateWithAliases(post("ACT-22AA-33BB"), deps, DURING));

    const expiring = mintAlias(issued.plaintext, ABOUT, DURING);
    const expired = await seen(await activateWithAliases(post(expiring), deps, AFTER));

    expect(JSON.parse(unknownCode)[0]).toBe(401);
    expect(unknownAlias).toBe(unknownCode);
    expect(expired).toBe(unknownCode);
    expect(consumed).toBe(false);
  });

  it("passes everything that is not an alias to the handler untouched", async () => {
    const answer = await activateWithAliases(post(issued.plaintext), deps, DURING);
    expect(answer.status).toBe(200);
  });

  it("limits alias lookups per address with the handler's own 429, and counts nothing else", async () => {
    for (let n = 0; n < 10; n += 1) {
      expect((await activateWithAliases(post("ACT-22AA-33BB"), deps, DURING)).status).toBe(401);
    }
    const limited = await activateWithAliases(post("ACT-22AA-33BB"), deps, DURING);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    /* Another address, and a real code from this one, are not held up. */
    expect(
      (await activateWithAliases(post("ACT-22AA-33BB", "198.51.100.4"), deps, DURING)).status,
    ).toBe(401);
    expect((await activateWithAliases(post(issued.plaintext), deps, DURING)).status).toBe(200);
    /* The window reopens. */
    const later = DURING + 61_000;
    expect((await activateWithAliases(post("ACT-22AA-33BB"), deps, later)).status).toBe(401);
  });
});

describe("the recent list", () => {
  it("shows an active alias in full and a closed one masked, and never the real code", () => {
    const live = mintAlias(issued.plaintext, ABOUT, DURING);
    const old = mintAlias(
      issueActivationCode(process.env).plaintext,
      { ...ABOUT, issuedAt: "2026-10-20T09:00:00.000Z", expiresAt: "2026-10-20T09:15:00.000Z" },
      DURING,
    );

    const listed = recentCodes(DURING);
    expect(listed.map((row) => [row.code, row.status])).toEqual([
      [`${old.slice(0, 9)}••••`, "expired"],
      [live, "active"],
    ]);
    const text = JSON.stringify(listed);
    expect(text).not.toContain("obs.");
    expect(text).not.toContain(issued.selector);
  });

  it("keeps the fifteen most recent once they are closed", () => {
    for (let n = 0; n < 20; n += 1) mintAlias(issued.plaintext, ABOUT, DURING);
    expect(recentCodes(AFTER)).toHaveLength(15);
  });
});
