import { describe, expect, it } from "vitest";
import { SessionSecretMissingError, signingSecretFrom } from "../src/lib/session-secret";

/**
 * A MISSING SECRET STOPS THE SIGNING, IT IS NOT STOOD IN FOR.
 *
 * Outside development the session module refuses to produce a signing key
 * when `OBSERVER_SESSION_SECRET` is unset: staging and production get a named
 * error, not `observer-dev.<deployment id>`. One assertion over both
 * environments, because the rule is one rule — the stand-in exists for
 * development alone.
 */
describe("the session signing secret", () => {
  it("refuses to make a signing key outside development without OBSERVER_SESSION_SECRET", () => {
    const outcome = (environment: string): string => {
      try {
        signingSecretFrom({ OBSERVER_ENVIRONMENT: environment, VERCEL_DEPLOYMENT_ID: "dpl_test" });
        return "signed on a stand-in";
      } catch (error) {
        return error instanceof SessionSecretMissingError ? "refused" : "other error";
      }
    };
    expect({ staging: outcome("staging"), production: outcome("production") }).toEqual({
      staging: "refused",
      production: "refused",
    });
  });
});
