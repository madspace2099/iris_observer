import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_KINDS,
  NEVER_LOGGED,
  safeDetail,
  scanForForbiddenContent,
} from "../../src/ue5/privacy";
import { HARNESS_LIMITS } from "../../src/ue5/limits";
import { DEFAULT_CLOCK_POLICY, validateEvent } from "../../src/ue5/validation";

/**
 * FORBIDDEN CONTENT, WITH SYNTHETIC PAYLOADS AND NO REAL PEOPLE.
 *
 * Every value below is invented for this file. None of it came from a user, a
 * database, a log or a screenshot, and the credential shapes are structurally
 * valid prefixes with obviously fake bodies.
 *
 * Two claims are under test, and the second is as important as the first:
 *
 *   - the scanner **catches** the accidents it is aimed at, and
 *   - the scanner **never carries the value it found** into the rejection.
 *
 * A guardrail that quotes the leaked email into a rejection record, a server log
 * and a support ticket has tripled the leak while appearing to prevent it.
 */

const base = {
  event_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  event_name: "share.sent",
  schema_version: 1,
  occurred_at: "2026-09-01T09:14:02.881Z",
  session_id: "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e",
  sequence: 3,
  app: {
    version: "1.0.0",
    plugin: "0.2.0",
    build_id: "BUILD-2026-09-01",
    environment: "development",
  },
};

const context = {
  limits: HARNESS_LIMITS,
  acceptedSchemaVersions: { min: 1, max: 1 },
  registry: null,
  clock: DEFAULT_CLOCK_POLICY,
  now: new Date("2026-09-01T09:20:00.000Z"),
};

/* Synthetic. Invented for this test; not a real address, number or key. */
const FAKE_EMAIL = "not.a.real.person@example.invalid";
const FAKE_PHONE = "+36 20 000 0000";
const FAKE_KEY = "sk-observer-test-000000000000000000";
const FAKE_JWT = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJmYWtlIn0.";

describe("the scanner catches what it is aimed at", () => {
  it("finds an email address in a value", () => {
    const findings = scanForForbiddenContent({ recipient: FAKE_EMAIL });
    expect(findings).toEqual([{ path: "recipient", kind: "email" }]);
  });

  it("finds a telephone number in a value", () => {
    expect(scanForForbiddenContent({ callback: FAKE_PHONE })).toEqual([
      { path: "callback", kind: "phone" },
    ]);
  });

  it("finds credential shapes", () => {
    expect(scanForForbiddenContent({ debug: FAKE_KEY })[0]?.kind).toBe("credential");
    expect(scanForForbiddenContent({ debug: FAKE_JWT })[0]?.kind).toBe("credential");
    expect(scanForForbiddenContent({ debug: `Bearer ${"a".repeat(24)}` })[0]?.kind).toBe(
      "credential",
    );
  });

  it("recognises Observer's own credentials, which it once did not", () => {
    /*
     * The likeliest secret to reach an Observer payload is an Observer
     * credential: a plugin author debugging an authorisation failure attaches
     * the token to an event, and it is the one secret that build certainly
     * holds. The scanner did not know these shapes until a mock token was put
     * through it and sailed past.
     */
    expect(scanForForbiddenContent({ debug: `obs_${"0".repeat(56)}` })[0]?.kind).toBe("credential");
    expect(scanForForbiddenContent({ debug: "OBS-7K4M-2QX9-D3TA" })[0]?.kind).toBe("credential");
  });

  it("finds a personal key whatever the value is", () => {
    /* `first_name: "Kitchen"` is still a field that will hold a person. */
    expect(scanForForbiddenContent({ first_name: "Kitchen" })).toEqual([
      { path: "first_name", kind: "personal_key" },
    ]);
    expect(scanForForbiddenContent({ buyerName: null })).toEqual([
      { path: "buyerName", kind: "personal_key" },
    ]);
  });

  it("looks inside nested objects and arrays", () => {
    const findings = scanForForbiddenContent({
      share: { recipients: [{ to: FAKE_EMAIL }] },
    });
    expect(findings).toEqual([{ path: "share.recipients[0].to", kind: "email" }]);
  });

  it("scans a maximum-size value without backtracking into next week", () => {
    /*
     * A regression guard on a real defect. The email pattern was unbounded, so a
     * long value with no `@` made it quadratic — the engine consumed to the end
     * from every start position and backtracked. A 64 KB property, which is the
     * approved event cap and therefore entirely legal, took 3.4 seconds to scan.
     * That is a denial of service inside the privacy guard.
     *
     * The bound is deliberately loose: the failure was three and a half seconds,
     * so anything under a quarter of one is comfortably fixed without making
     * this test sensitive to a slow machine.
     */
    const started = performance.now();
    expect(scanForForbiddenContent({ blob: "x".repeat(65_536) })).toEqual([]);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("stays bounded against inputs shaped to make each pattern backtrack", () => {
    /*
     * The email fix generalised. Every detector now runs against a 64 KiB input
     * chosen to be adversarial *for that detector specifically* — a long local
     * part with no `@`, a plus followed by digits, repeated `eyJ` at word
     * boundaries, a `sk-` or `Bearer` prefix in front of a long run.
     *
     * A legal event may be 64 KiB, so any privacy or secret detector has to have
     * bounded runtime on one. This is the guard for the whole family rather than
     * for the one member that failed.
     */
    const n = 65_536;
    const adversarial: Record<string, string> = {
      plain: "x".repeat(n),
      alphanumeric: "aZ9".repeat(n / 3),
      jwtish: ("a eyJ" + "A".repeat(20)).repeat(Math.floor(n / 26)),
      jwtPrefix: "eyJ" + "A".repeat(n),
      secretPrefix: "sk-" + "A".repeat(n),
      bearerPrefix: "Bearer " + "A".repeat(n),
      plusDigits: "+" + "1".repeat(n),
      dotted: "a.".repeat(n / 2),
      tokenPrefix: "obs_" + "a".repeat(n),
    };

    const started = performance.now();
    scanForForbiddenContent(adversarial);
    const elapsed = performance.now() - started;

    /*
     * Nine adversarial values of 64 KiB each. The unbounded email pattern took
     * 3.4 seconds on one of them, so a second for all nine is a loose bound that
     * still fails loudly if any detector goes quadratic again.
     */
    expect(elapsed).toBeLessThan(1_000);
  });

  it("survives a payload built with a cycle in it", () => {
    const cyclic: Record<string, unknown> = { name: "unit" };
    cyclic["self"] = cyclic;
    expect(() => scanForForbiddenContent(cyclic)).not.toThrow();
  });
});

describe("the scanner leaves ordinary showroom payloads alone", () => {
  it("passes the kind of thing an event actually carries", () => {
    const findings = scanForForbiddenContent({
      unit_code: "A-402",
      unit_name: "Corner apartment",
      scene_name: "dusk",
      preset_name: "wide-16-9",
      duration_ms: 94_000,
      capture_id: "3f9a1c22-5d6e-4f70-8a91-b2c3d4e5f607",
      floor: 4,
      price_band: "120000-140000",
    });
    expect(findings).toEqual([]);
  });

  it("does not treat a UUID as a payment card", () => {
    /*
     * The reason there is no card-value detector at all. Strip the letters out
     * of a UUID and seventeen digits in neat groups remain — indistinguishable
     * from a card number to any digit-run heuristic, and a false rejection here
     * loses a real event for ever.
     */
    expect(scanForForbiddenContent({ capture_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b" })).toEqual(
      [],
    );
  });

  it("does not flag a bare `name`, which is usually a thing and not a person", () => {
    expect(scanForForbiddenContent({ name: "Balcony view" })).toEqual([]);
  });
});

describe("a finding never carries what it found", () => {
  it("names the path and the kind, and nothing else", () => {
    const findings = scanForForbiddenContent({ profile: { email: FAKE_EMAIL } });
    const serialised = JSON.stringify(findings);
    expect(serialised).not.toContain(FAKE_EMAIL);
    expect(serialised).not.toContain("not.a.real.person");
    expect(findings.some((f) => f.path === "profile.email")).toBe(true);
  });

  it("keeps the value out of the rejection detail too", () => {
    const verdict = validateEvent({ ...base, properties: { recipient: FAKE_EMAIL } }, context);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.rejection.code).toBe("pii_suspected");
      expect(verdict.rejection.detail).toContain("recipient");
      expect(verdict.rejection.detail).not.toContain(FAKE_EMAIL);
    }
  });

  it("keeps a credential out of the detail, above all", () => {
    const verdict = validateEvent({ ...base, properties: { note: FAKE_KEY } }, context);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.rejection.detail).not.toContain(FAKE_KEY);
      expect(verdict.rejection.detail).not.toContain("sk-");
    }
  });

  it("summarises a flood without quoting any of it", () => {
    const many = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`field_${index}`, FAKE_EMAIL]),
    );
    const detail = safeDetail(scanForForbiddenContent(many));
    expect(detail).not.toContain(FAKE_EMAIL);
    expect(detail).toMatch(/and \d+ more/);
    expect(detail.length).toBeLessThanOrEqual(300);
  });
});

describe("what may never be logged", () => {
  it("names the credential-bearing fields", () => {
    expect(NEVER_LOGGED).toContain("activation_code");
    expect(NEVER_LOGGED).toContain("source_token");
    expect(NEVER_LOGGED).toContain("authorization");
  });

  it("keeps the kinds list closed and non-empty", () => {
    expect(FORBIDDEN_KINDS.length).toBeGreaterThan(2);
    expect(new Set(FORBIDDEN_KINDS).size).toBe(FORBIDDEN_KINDS.length);
  });
});
