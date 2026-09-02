import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_OPTIONS,
  createAccountSession,
  destroySession,
  isKnownViewerKey,
  resolveSession,
} from "../src/lib/session";

/*
 * The directory these tests sign into.
 *
 * resolveSession returns an account, and an account only exists while the
 * synthetic directory is switched on — which is the fail-closed property the
 * last describe block asserts directly.
 */
process.env["OBSERVER_DEMO_ACCOUNTS"] = "1";

const AGENT = "acct_monika";
const DEVELOPER = "acct_petra";

/**
 * The scenario session adapter's one real security property.
 *
 * It is not production authentication and is not claimed to be. What it must
 * guarantee while the data is synthetic is that **the browser cannot grant
 * itself a tenant or a role** — because a reviewer clicking around must be
 * seeing the access model the product will actually ship, not a cookie they
 * could have edited.
 *
 * The session is a signed, stateless token. It has to be: an in-memory table
 * cannot survive a serverless platform, where the instance that minted a
 * session is not the instance that reads it.
 */
describe("session cannot be forged from the browser", () => {
  it("rejects the viewer key itself, which an earlier version accepted", () => {
    // The previous implementation stored the role in the cookie, so becoming a
    // MADSPACE administrator took one edit in devtools. These must all fail.
    for (const forged of ["developer", "madspace", "agencyManager", "salesAgent"]) {
      expect(isKnownViewerKey(forged)).toBe(true);
      expect(resolveSession(forged), forged).toBeNull();
    }
  });

  it("rejects a plausible-looking guess", () => {
    expect(resolveSession("obs_00000000000000000000000000000000")).toBeNull();
    expect(resolveSession("")).toBeNull();
    expect(resolveSession(undefined)).toBeNull();
  });

  it("resolves only an identifier the server issued", () => {
    const id = createAccountSession(AGENT);
    const account = resolveSession(id);
    expect(account?.accountId).toBe(AGENT);
    /*
     * An ACCOUNT, not a role. What that account may see is looked up from the
     * account on the server; the token has nothing in it to promote.
     */
    expect(Object.keys(account ?? {})).not.toContain("role");
  });

  it("cannot be edited into a different role", () => {
    /*
     * The token carries the viewer key in the clear and is signed, so the key
     * is readable — and useless to change. The earlier implementation hid the
     * key instead; hiding it was never the property that mattered, and it cost
     * the ability to work on a platform where no two requests share memory.
     */
    const id = createAccountSession(AGENT);
    expect(resolveSession(id)?.accountId).toBe(AGENT);

    /*
     * Swapping the subject for another account fails the signature. It is worth
     * saying that this check is now the second line of defence rather than the
     * only one: the subject is an account identifier, so even a successful
     * forgery would buy that account's grants, not a role of the forger's
     * choosing.
     */
    for (const other of ["acct_madspace", "acct_petra", "acct_tomas"]) {
      const tampered = id.replace(/^[^.]+/, other);
      expect(tampered).not.toBe(id);
      expect(resolveSession(tampered), other).toBeNull();
    }
  });

  it("rejects a token whose signature has been altered", () => {
    const id = createAccountSession(DEVELOPER);
    const parts = id.split(".");
    const flipped = `${parts[0]}.${parts[1]}.${parts[2]}.${(parts[3] ?? "").split("").reverse().join("")}`;
    expect(resolveSession(flipped)).toBeNull();
  });

  it("rejects a token that has expired", () => {
    // The expiry is signed with the rest, so moving it forward breaks the
    // signature and moving it backward expires the token. Both must fail.
    const id = createAccountSession(DEVELOPER);
    const parts = id.split(".");
    const past = `${parts[0]}.${Date.now() - 1000}.${parts[2]}.${parts[3]}`;
    expect(resolveSession(past)).toBeNull();
  });

  it("issues a different identifier every time", () => {
    const ids = new Set(Array.from({ length: 20 }, () => createAccountSession(DEVELOPER)));
    expect(ids.size).toBe(20);
  });

  it("is stateless, which is why sign-out clears the cookie and nothing else", () => {
    /*
     * The limitation, asserted rather than hidden.
     *
     * There is no server record to delete, so a token copied before sign-out
     * stays valid until it expires. That is the price of a session that works
     * on a platform where every request may land on a different instance, and
     * it is acceptable only because the token grants a profile from a screen
     * where every profile is already freely selectable, over synthetic data.
     * ADR-0022 records it; the pre-production gate removes it.
     */
    const id = createAccountSession(DEVELOPER);
    expect(resolveSession(id)).not.toBeNull();
    destroySession(id);
    expect(resolveSession(id)).not.toBeNull();
  });

  it("resolves nothing at all when no account directory is configured", () => {
    /*
     * The fail-closed posture, at the session layer. A validly signed token for
     * an account that does not exist is not a session — so a server with the
     * synthetic directory switched off has no way in, whatever cookie arrives.
     */
    const id = createAccountSession(DEVELOPER);
    const before = process.env["OBSERVER_DEMO_ACCOUNTS"];
    delete process.env["OBSERVER_DEMO_ACCOUNTS"];
    try {
      expect(resolveSession(id)).toBeNull();
    } finally {
      if (before !== undefined) process.env["OBSERVER_DEMO_ACCOUNTS"] = before;
    }
    expect(resolveSession(id)).not.toBeNull();
  });
});

describe("cookie attributes", () => {
  it("is http-only, so no script can read it", () => {
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
  });

  it("is same-site, so another origin cannot ride it", () => {
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
  });

  it("is secure in production and relaxed only for local http", () => {
    expect(SESSION_COOKIE_OPTIONS.secure).toBe(process.env.NODE_ENV === "production");
  });

  it("expires rather than lasting forever", () => {
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBeGreaterThan(0);
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBeLessThanOrEqual(12 * 60 * 60);
  });
});
