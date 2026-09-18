import { describe, expect, it } from "vitest";
import {
  ACTIVATION_CODE_PEPPER,
  SOURCE_TOKEN_PEPPER,
  SOURCE_TOKEN_PREFIX,
  assertDistinctPeppers,
  assertPeppersUsable,
  bearerToken,
  constantTimeEquals,
  describePepper,
  issueActivationCode,
  issueSourceToken,
  parseToken,
  PepperMisconfiguredError,
  verifySecret,
  type EnvSource,
} from "../src/secrets";

/**
 * SOURCE SECRETS, PUT THROUGH THE CASES THAT MATTER.
 *
 * The property this file exists to defend is that **the database never holds
 * anything a credential can be recovered from**. Everything else — the parser's
 * strictness, the two peppers, the constant-time compare — exists to serve that
 * one claim or to stop a caller quietly undoing it.
 *
 * Every pepper below is obviously fake and obviously long. `VITEST` is set by
 * the runner, which is the only reason a low-entropy value is accepted at all;
 * a deployment refuses these, which is what makes copying a test configuration
 * into Preview fail closed rather than run on a known key.
 */

const PEPPER_A = "activation-pepper-0123456789abcdefghijklmnop";
const PEPPER_B = "source-token-pepper-0123456789abcdefghijklmnop";

const ENV: EnvSource = {
  VITEST: "1",
  [ACTIVATION_CODE_PEPPER]: PEPPER_A,
  [SOURCE_TOKEN_PEPPER]: PEPPER_B,
};

describe("a pepper is checked for the mistakes people actually make", () => {
  const cases: readonly [string, string | undefined, RegExp][] = [
    ["absent", undefined, /is not set/],
    ["empty", "", /empty or whitespace/],
    ["whitespace only", "   ", /empty or whitespace/],
    ["wrapped in angle brackets", "<a-real-looking-secret-value-here-32ch>", /wrapped in quotes/],
    ["wrapped in quotes", '"a-real-looking-secret-value-here-32chars"', /wrapped in quotes/],
    ["padded", " a-real-looking-secret-value-here-32chars ", /wrapped in quotes|whitespace/],
    ["containing a space", "a real looking secret value here 32chars", /whitespace/],
    ["a placeholder", "change-me", /placeholder/],
    ["too short", "abcdefghijklmnop", /at least 32 bytes/],
  ];

  for (const [name, value, expected] of cases) {
    it(`refuses one that is ${name}`, () => {
      const verdict = describePepper(ACTIVATION_CODE_PEPPER, {
        VITEST: "1",
        ...(value === undefined ? {} : { [ACTIVATION_CODE_PEPPER]: value }),
      });
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.problem).toMatch(expected);
    });
  }

  it("accepts a plausible one", () => {
    expect(describePepper(ACTIVATION_CODE_PEPPER, ENV).ok).toBe(true);
  });

  it("refuses a low-entropy value outside a test environment", () => {
    /*
     * Sixty-four of the same character is 64 bytes and no entropy at all. It is
     * exactly what a test should use and exactly what a deployment must refuse,
     * so the only thing separating those two is the absence of `VITEST`.
     */
    const sixtyFour = "a".repeat(64);
    expect(describePepper(ACTIVATION_CODE_PEPPER, { [ACTIVATION_CODE_PEPPER]: sixtyFour }).ok).toBe(
      false,
    );
    expect(
      describePepper(ACTIVATION_CODE_PEPPER, { VITEST: "1", [ACTIVATION_CODE_PEPPER]: sixtyFour })
        .ok,
    ).toBe(true);
  });

  it("names the variable in the error and never the value", () => {
    let thrown: unknown = null;
    try {
      assertPeppersUsable({ VITEST: "1" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PepperMisconfiguredError);
    const message = (thrown as Error).message;
    expect(message).toContain(ACTIVATION_CODE_PEPPER);
    expect(message).not.toContain(PEPPER_A);
  });
});

describe("the two peppers may not be the same value", () => {
  it("refuses a deployment that configured one secret twice", () => {
    /*
     * Sharing a pepper means a compromise of either analysis compromises both —
     * and, more quietly, that a verifier computed for one class is a valid
     * verifier for the other. Refused at boot rather than left to a reviewer.
     */
    const shared = {
      VITEST: "1",
      [ACTIVATION_CODE_PEPPER]: PEPPER_A,
      [SOURCE_TOKEN_PEPPER]: PEPPER_A,
    };
    expect(() => {
      assertDistinctPeppers(shared);
    }).toThrow(/must not share one pepper/);
  });

  it("says nothing when a pepper is simply missing, because that is a different error", () => {
    expect(() => {
      assertDistinctPeppers({ VITEST: "1", [ACTIVATION_CODE_PEPPER]: PEPPER_A });
    }).not.toThrow();
  });

  it("accepts two distinct peppers", () => {
    expect(() => {
      assertPeppersUsable(ENV);
    }).not.toThrow();
  });
});

describe("issuing and verifying", () => {
  it("returns a plaintext whose parts are the selector and secret", () => {
    const issued = issueSourceToken(ENV);
    const parsed = parseToken(issued.plaintext);
    expect(parsed).not.toBeNull();
    expect(parsed?.selector).toBe(issued.selector);
    expect(issued.plaintext.startsWith(`${SOURCE_TOKEN_PREFIX}.`)).toBe(true);
  });

  it("stores a verifier the plaintext cannot be recovered from", () => {
    const issued = issueSourceToken(ENV);
    /*
     * The claim is a property of HMAC rather than something a test can prove,
     * so what is asserted is the observable half: the stored value contains no
     * part of the credential, and is a fixed-width digest regardless of input.
     */
    const secret = parseToken(issued.plaintext)?.secret ?? "";
    expect(issued.verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.verifier).not.toContain(secret);
    expect(issued.verifier).not.toContain(issued.selector);
    expect(issued.plaintext).not.toContain(issued.verifier);

    /* A fixed width whatever the input, which is what carries no length. */
    expect(issueSourceToken(ENV).verifier.length).toBe(issued.verifier.length);
  });

  it("verifies the secret it issued", () => {
    const issued = issueSourceToken(ENV);
    const parsed = parseToken(issued.plaintext);
    expect(
      verifySecret("source_token", issued.selector, parsed?.secret ?? "", issued.verifier, ENV),
    ).toBe(true);
  });

  it("refuses a different secret under the right selector", () => {
    const issued = issueSourceToken(ENV);
    const other = issueSourceToken(ENV);
    const otherSecret = parseToken(other.plaintext)?.secret ?? "";
    expect(verifySecret("source_token", issued.selector, otherSecret, issued.verifier, ENV)).toBe(
      false,
    );
  });

  it("refuses the right secret under a different selector", () => {
    /*
     * The selector is bound into the HMAC as well as the secret. Without that,
     * a verifier lifted from one row could be replayed under another selector,
     * and the row it named would verify a secret it was never issued for.
     */
    const issued = issueSourceToken(ENV);
    const other = issueSourceToken(ENV);
    const secret = parseToken(issued.plaintext)?.secret ?? "";
    expect(verifySecret("source_token", other.selector, secret, issued.verifier, ENV)).toBe(false);
  });

  it("keeps the two secret classes apart, even given the same material", () => {
    /*
     * Two peppers is the control. The domain separator is what stops a
     * configuration mistake from silently removing it, so both are exercised:
     * a value issued as an activation code must not verify as a source token.
     */
    const issued = issueActivationCode(ENV);
    const secret = parseToken(issued.plaintext)?.secret ?? "";
    expect(verifySecret("activation_code", issued.selector, secret, issued.verifier, ENV)).toBe(
      true,
    );
    expect(verifySecret("source_token", issued.selector, secret, issued.verifier, ENV)).toBe(false);
  });

  it("still separates the classes when a deployment misconfigures one pepper twice", () => {
    const shared: EnvSource = {
      VITEST: "1",
      [ACTIVATION_CODE_PEPPER]: PEPPER_A,
      [SOURCE_TOKEN_PEPPER]: PEPPER_A,
    };
    /* Issuance refuses outright... */
    expect(() => issueActivationCode(shared)).toThrow(/must not share one pepper/);

    /* ...and even if a verifier from such a deployment were presented, the
     * domain separator keeps the two classes from validating each other. */
    const issued = issueActivationCode(ENV);
    const secret = parseToken(issued.plaintext)?.secret ?? "";
    const asToken = verifySecret("source_token", issued.selector, secret, issued.verifier, {
      VITEST: "1",
      [ACTIVATION_CODE_PEPPER]: PEPPER_A,
      [SOURCE_TOKEN_PEPPER]: PEPPER_A,
    });
    expect(asToken).toBe(false);
  });

  it("mints a different value every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(issueSourceToken(ENV).plaintext);
    expect(seen.size).toBe(200);
  });
});

describe("the parser is strict, and says nothing about why", () => {
  const rejected = [
    "",
    "obs",
    "obs.only-two-parts",
    "obs.a.b.c.d",
    `wrong.${"a".repeat(22)}.${"b".repeat(43)}`,
    `obs..${"b".repeat(43)}`,
    `obs.${"a".repeat(22)}.`,
    `obs.short.${"b".repeat(43)}`,
    `obs.${"a".repeat(16)}.${"b".repeat(31)}`,
    `obs.${"a".repeat(129)}.${"b".repeat(32)}`,
    `obs.${"!".repeat(16)}.${"b".repeat(32)}`,
  ];

  for (const value of rejected) {
    it(`refuses ${JSON.stringify(value.slice(0, 40))}`, () => {
      expect(parseToken(value)).toBeNull();
    });
  }

  it("returns the same shape of nothing for every rejection", () => {
    /*
     * A parser that distinguished "no such selector" from "malformed secret"
     * would be an enumeration oracle wearing an error message. `null` is the
     * only answer it can give.
     */
    const answers = rejected.map((value) => parseToken(value));
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toBeNull();
  });
});

describe("reading a bearer header", () => {
  it("accepts the ordinary form and is case-insensitive on the scheme", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("BEARER abc")).toBe("abc");
    expect(bearerToken("  Bearer   abc  ")).toBe("abc");
  });

  it("refuses everything else", () => {
    for (const header of [null, undefined, "", "abc", "Basic abc", "Bearer", "Bearer a b"]) {
      expect(bearerToken(header), String(header)).toBeNull();
    }
  });
});

describe("constant-time comparison", () => {
  it("is true only for identical values", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
  });

  it("answers false for a length mismatch without throwing", () => {
    /*
     * `timingSafeEqual` throws on unequal lengths, so a naive wrapper either
     * crashes or returns early — and an early return leaks the length through
     * timing. This burns an equivalent comparison instead.
     */
    expect(constantTimeEquals("abc", "abcdef")).toBe(false);
    expect(constantTimeEquals("", "a")).toBe(false);
    expect(constantTimeEquals("", "")).toBe(true);
  });
});
