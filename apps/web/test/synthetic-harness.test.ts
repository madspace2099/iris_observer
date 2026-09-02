import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describePepper, pepperConfigured } from "@/lib/ai/identity";

/**
 * THE TEST-ONLY SEAM, AND EVERY EDGE OF IT.
 *
 * The browser suite runs the real production build, so it cannot be recognised
 * by `VITEST` or by `NODE_ENV=test`. `OBSERVER_SYNTHETIC_HARNESS=1` is the third
 * signal, and its only permitted consequence is that an obviously-fake pepper —
 * sixty-four identical characters — is accepted.
 *
 * A seam like that is worth exactly as much as the proof that it cannot be used
 * for anything else, so this file spends most of its length on what the flag
 * must NOT do. The property that matters: a deployment without a pepper refuses
 * every question whether the flag is set or not, so the failure mode of
 * misusing the harness configuration is fail-closed.
 *
 * `describePepper` takes its environment as an argument, so a deployment can be
 * described here as a plain object without touching the runner's own
 * environment. Each case below is a bag of variables, not a mutation.
 */

/** Sixty-four identical characters: what the harness passes, and no secret. */
const SYNTHETIC = "a".repeat(64);

/** A value shaped like something a deployment would really hold. */
const REAL = "9f3b7c1e58a24d06be91473fc2a85d0e7b64193af8025ce7";

/** A deployment: no unit runner, no test mode, no harness flag. */
const DEPLOYMENT = { NODE_ENV: "production" } as const;

/** The browser suite: a production build that has announced itself. */
const HARNESS = { NODE_ENV: "production", OBSERVER_SYNTHETIC_HARNESS: "1" } as const;

describe("production stays fail-closed", () => {
  it("refuses the harness pepper wherever the harness flag is absent", () => {
    /*
     * The single most important line in this file. Copying the Playwright env
     * block into Preview or Production produces a deployment that answers
     * nothing — not one quietly running on a value published in a config file.
     */
    const verdict = describePepper({ ...DEPLOYMENT, OBSERVER_SUBJECT_PEPPER: SYNTHETIC });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problem).toMatch(/too few distinct characters/);
    expect(pepperConfigured({ ...DEPLOYMENT, OBSERVER_SUBJECT_PEPPER: SYNTHETIC })).toBe(false);
  });

  it("refuses a missing pepper even with the harness flag set", () => {
    /*
     * The flag relaxes one shape check. It does not make a pepper optional, and
     * nothing derives one when it is absent.
     */
    const verdict = describePepper(HARNESS);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problem).toBe("is not set");
    expect(pepperConfigured(HARNESS)).toBe(false);
  });

  it.each([
    ["empty", "", /empty or whitespace/],
    ["whitespace only", "   ", /empty or whitespace/],
    ["too short", "a".repeat(31), /at least 32 bytes/],
    ["quoted", `"${REAL}"`, /quotes or brackets/],
    ["angle-bracketed", `<${REAL}>`, /quotes or brackets/],
    ["padded", ` ${REAL} `, /quotes or brackets|whitespace/],
    ["internal whitespace", "9f3b7c1e58a24d06 be91473fc2a85d0e7b64193af8", /whitespace/],
    ["a placeholder", "change-me-change-me-change-me-change-me", /placeholder/],
    ["your-secret-here", "your-secret-here-your-secret-here-abc", /placeholder/],
  ])("still refuses a pepper that is %s, with the harness flag set", (_name, value, problem) => {
    /*
     * Every other rejection survives the flag. The seam widens exactly one
     * gate, and this is the list of gates it does not touch.
     */
    const verdict = describePepper({ ...HARNESS, OBSERVER_SUBJECT_PEPPER: value });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problem).toMatch(problem);
  });
});

describe("the harness can exercise Ask Observer", () => {
  it("accepts the synthetic pepper when the harness announces itself", () => {
    expect(describePepper({ ...HARNESS, OBSERVER_SUBJECT_PEPPER: SYNTHETIC })).toEqual({
      ok: true,
    });
    expect(pepperConfigured({ ...HARNESS, OBSERVER_SUBJECT_PEPPER: SYNTHETIC })).toBe(true);
  });

  it("recognises the flag only when it is exactly 1", () => {
    /*
     * Not truthiness. "0", "false" and "true" are all things somebody types
     * into a dashboard field meaning to turn something off.
     */
    for (const value of ["0", "false", "true", "yes", "", " 1", "1 "]) {
      const verdict = describePepper({
        NODE_ENV: "production",
        OBSERVER_SYNTHETIC_HARNESS: value,
        OBSERVER_SUBJECT_PEPPER: SYNTHETIC,
      });
      expect(verdict.ok, `flag=${JSON.stringify(value)}`).toBe(false);
    }
  });

  it("accepts a genuinely random pepper regardless of the flag", () => {
    /*
     * The seam is about what a test may use, not about what a deployment must
     * be. A real pepper is accepted everywhere, which is what keeps the two
     * paths one code path.
     */
    expect(describePepper({ ...DEPLOYMENT, OBSERVER_SUBJECT_PEPPER: REAL }).ok).toBe(true);
    expect(describePepper({ ...HARNESS, OBSERVER_SUBJECT_PEPPER: REAL }).ok).toBe(true);
  });
});

describe("the seam is confined to the test harness", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const read = (relative: string): string => readFileSync(resolve(root, relative), "utf8");

  it("is read in exactly one place in the application", () => {
    /*
     * One reader, in the module that owns the contract. A second reader
     * somewhere else would be a second policy, and nobody would know which one
     * was in force.
     */
    const identity = read("apps/web/src/lib/ai/identity.ts");
    expect(identity.split("OBSERVER_SYNTHETIC_HARNESS").length - 1).toBe(1);
  });

  it("is written only by the Playwright configuration", () => {
    const config = read("playwright.config.ts");
    expect(config).toContain('OBSERVER_SYNTHETIC_HARNESS: "1"');
    expect(config).toContain('OBSERVER_SUBJECT_PEPPER: "a".repeat(64)');
  });

  it("is in no environment file, example or deployment configuration", () => {
    /*
     * Nothing persisted. The value exists for the lifetime of a spawned server
     * process and nowhere else on the machine.
     */
    for (const file of [".env.example", ".gitignore"]) {
      expect(read(file)).not.toContain("OBSERVER_SYNTHETIC_HARNESS");
    }
    const example = read(".env.example");
    /* And the real variable is still declared empty, as it always was. */
    expect(example).toMatch(/OBSERVER_SUBJECT_PEPPER=\s*$/m);
  });

  it("never reaches the browser", () => {
    /*
     * A NEXT_PUBLIC_ prefix would ship either name into the client bundle. The
     * pepper is a server secret and the flag is a server-side test signal, and
     * neither is a thing a page may see.
     */
    const config = read("playwright.config.ts");
    expect(config).not.toContain("NEXT_PUBLIC_OBSERVER_SUBJECT_PEPPER");
    expect(config).not.toContain("NEXT_PUBLIC_OBSERVER_SYNTHETIC_HARNESS");
    const identity = read("apps/web/src/lib/ai/identity.ts");
    expect(identity).not.toContain("NEXT_PUBLIC");
  });

  it("keeps the key out of every message the module can produce", () => {
    /*
     * The existing contract, re-asserted at the seam: what leaves this module
     * is an HMAC or a sentence about a problem, never the value.
     */
    const verdict = describePepper({ ...DEPLOYMENT, OBSERVER_SUBJECT_PEPPER: REAL });
    expect(JSON.stringify(verdict)).not.toContain(REAL);
    const refusal = describePepper({ ...DEPLOYMENT, OBSERVER_SUBJECT_PEPPER: SYNTHETIC });
    expect(JSON.stringify(refusal)).not.toContain(SYNTHETIC);
  });
});
