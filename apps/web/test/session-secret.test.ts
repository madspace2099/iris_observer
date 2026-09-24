import { describe, expect, it } from "vitest";
import { SessionSecretMissingError, signingSecretFrom } from "../src/lib/session-secret";

/**
 * A MISSING SECRET STOPS THE SIGNING, IT IS NOT STOOD IN FOR.
 *
 * Outside development the session module refuses to produce a signing key
 * when `OBSERVER_SESSION_SECRET` is unset: staging and production get a named
 * error, not `observer-dev.<deployment id>` — and so does a process on a
 * deployment platform that says "development", or says nothing, because
 * `OBSERVER_ENVIRONMENT` defaults to development and is a variable a person
 * can forget. One assertion over the four cases, because the rule is one
 * rule — the stand-in exists for a developer's own machine alone — and the
 * local development case is in it so the assertion cannot pass by refusing
 * everything.
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
    const onVercel = (environment: string | undefined): string => {
      try {
        signingSecretFrom({
          OBSERVER_ENVIRONMENT: environment,
          VERCEL: "1",
          VERCEL_ENV: "preview",
        });
        return "signed on a stand-in";
      } catch (error) {
        return error instanceof SessionSecretMissingError ? "refused" : "other error";
      }
    };
    expect({
      staging: outcome("staging"),
      production: outcome("production"),
      developmentOnVercel: onVercel("development"),
      unsetOnVercel: onVercel(undefined),
      developmentLocal: outcome("development"),
    }).toEqual({
      staging: "refused",
      production: "refused",
      developmentOnVercel: "refused",
      unsetOnVercel: "refused",
      developmentLocal: "signed on a stand-in",
    });
  });
});
