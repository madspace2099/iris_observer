import { describe, expect, it, vi } from "vitest";
import {
  DEMO_PASSWORD,
  LOGIN_FAILURE_CEILING,
  LOGIN_FAILURE_WINDOW_MS,
  authenticate,
} from "../src/lib/accounts";

/*
 * The directory these tests sign into. See session.test.ts for the same
 * pattern; the fail-closed posture with the flag absent is asserted there,
 * not repeated here.
 */
process.env["OBSERVER_DEMO_ACCOUNTS"] = "1";

/**
 * The login throttle.
 *
 * What it must guarantee: repeated wrong guesses against one address stop
 * being answered before the ceiling, whether or not that address exists —
 * and a legitimate caller signing in correctly, as fast as the demonstration
 * directory's own accounts do across the rest of the E2E suite, never trips
 * it. Those two properties are the whole point, and each test below is
 * one of them rather than an implementation detail of the counter.
 *
 * Every test uses its own address. The counter is module-level state shared
 * across every call in this file, so reusing an address between tests would
 * make one test's failures count toward another's ceiling.
 */
describe("login attempt throttling", () => {
  it("never throttles a caller who keeps signing in correctly", () => {
    const email = "tomas.varga@meridian-sales.example";
    for (let i = 0; i < LOGIN_FAILURE_CEILING * 3; i++) {
      const result = authenticate(email, DEMO_PASSWORD);
      expect(result.ok, `attempt ${i}`).toBe(true);
    }
  });

  it("throttles an address after enough wrong attempts, even with the real password", () => {
    const email = "monika.kovacova@meridian-sales.example";
    for (let i = 0; i < LOGIN_FAILURE_CEILING; i++) {
      const result = authenticate(email, "not-the-password");
      expect(result.ok, `failure ${i}`).toBe(false);
      if (!result.ok) expect(result.reason, `failure ${i}`).toBe("invalid");
    }

    // The ceiling is reached; the true password no longer even gets checked.
    const result = authenticate(email, DEMO_PASSWORD);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("throttles an address that holds no account exactly the same way", () => {
    // The rate limit is keyed on the string submitted, not on whether it
    // resolves to a real account — an attacker probing unknown addresses
    // gets the same friction as one probing a real one.
    const email = "nobody-in-particular@example.invalid";
    for (let i = 0; i < LOGIN_FAILURE_CEILING; i++) {
      const result = authenticate(email, "guess");
      expect(result.ok, `failure ${i}`).toBe(false);
      if (!result.ok) expect(result.reason, `failure ${i}`).toBe("invalid");
    }
    const result = authenticate(email, "another-guess");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("clears the count on a success, so it does not carry into later failures", () => {
    const email = "akhilesh.undev@meridian-sales.example";

    // One below the ceiling, then a correct sign-in.
    for (let i = 0; i < LOGIN_FAILURE_CEILING - 1; i++) {
      authenticate(email, "wrong");
    }
    expect(authenticate(email, DEMO_PASSWORD).ok).toBe(true);

    // The count reset, so this address can absorb a fresh run of failures
    // before it throttles again rather than throttling on the very next one.
    for (let i = 0; i < LOGIN_FAILURE_CEILING - 1; i++) {
      const result = authenticate(email, "wrong-again");
      expect(result.ok, `post-reset failure ${i}`).toBe(false);
      if (!result.ok) expect(result.reason, `post-reset failure ${i}`).toBe("invalid");
    }
  });

  it("throttles per address, not across the whole directory", () => {
    const throttled = "petra.novak@alpha-estates.example";
    const unaffected = "martin.kovac@meridian-sales.example";

    for (let i = 0; i < LOGIN_FAILURE_CEILING; i++) {
      authenticate(throttled, "wrong");
    }
    expect(authenticate(throttled, DEMO_PASSWORD).ok).toBe(false);

    // A different address's legitimate sign-in is untouched.
    const result = authenticate(unaffected, DEMO_PASSWORD);
    expect(result.ok).toBe(true);
  });

  it("lifts the throttle once the window has passed", () => {
    const email = "operations@madspace.example";
    vi.useFakeTimers();
    try {
      for (let i = 0; i < LOGIN_FAILURE_CEILING; i++) {
        authenticate(email, "wrong");
      }
      expect(authenticate(email, DEMO_PASSWORD).ok).toBe(false);

      vi.advanceTimersByTime(LOGIN_FAILURE_WINDOW_MS + 1);

      expect(authenticate(email, DEMO_PASSWORD).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
