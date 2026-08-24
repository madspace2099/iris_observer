import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_OPTIONS,
  createSession,
  destroySession,
  isKnownViewerKey,
  resolveSession,
} from "../src/lib/session";

/**
 * The scenario session adapter's one real security property.
 *
 * It is not production authentication and is not claimed to be. What it must
 * guarantee while the data is synthetic is that **the browser cannot grant
 * itself a tenant or a role** — because a reviewer clicking around must be
 * seeing the access model the product will actually ship, not a cookie they
 * could have edited.
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
    const id = createSession("salesAgent");
    const viewer = resolveSession(id);
    expect(viewer?.role).toBe("sales_agent");
    expect(viewer?.agentId).not.toBeNull();
  });

  it("issues an opaque identifier that leaks no role", () => {
    const id = createSession("madspace");
    expect(id).toMatch(/^obs_[0-9a-f]{32}$/);
    for (const key of ["developer", "madspace", "agency", "agent", "admin"]) {
      expect(id).not.toContain(key);
    }
  });

  it("issues a different identifier every time", () => {
    const ids = new Set(Array.from({ length: 20 }, () => createSession("developer")));
    expect(ids.size).toBe(20);
  });

  it("stops working the moment the session is destroyed", () => {
    const id = createSession("developer");
    expect(resolveSession(id)).not.toBeNull();
    destroySession(id);
    // A copied cookie must not outlive sign-out, which is why sign-out clears
    // the server record and not only the cookie.
    expect(resolveSession(id)).toBeNull();
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
