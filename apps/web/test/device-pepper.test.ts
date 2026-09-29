import { describe, expect, it } from "vitest";
import { DevicePepperMissingError, devicePepperFrom } from "../src/lib/device-pepper";

/**
 * A MISSING PEPPER STOPS THE KEYING, IT IS NOT STOOD IN FOR.
 *
 * The same rule as the session secret, for the pepper behind the vendor-facing
 * safety identifier: outside development, or on any deployment platform, a
 * missing `DEVICE_CREDENTIAL_PEPPER` is a named refusal, not a fixed string
 * readable in the source. One assertion over the cases, with the local
 * development case in it — it gets the stand-in, so the assertion cannot pass
 * by refusing everything — and the configured case, which is returned as
 * given, because a pepper that was derived from anything would not be stable.
 */
describe("the pepper behind the safety identifier", () => {
  it("refuses to key a safety identifier outside development without DEVICE_CREDENTIAL_PEPPER", () => {
    const outcome = (source: Record<string, string | undefined>): string => {
      try {
        const value = devicePepperFrom(source);
        return source["DEVICE_CREDENTIAL_PEPPER"] === value ? "configured value" : "stand-in";
      } catch (error) {
        return error instanceof DevicePepperMissingError ? "refused" : "other error";
      }
    };
    expect({
      staging: outcome({ OBSERVER_ENVIRONMENT: "staging" }),
      production: outcome({ OBSERVER_ENVIRONMENT: "production" }),
      developmentOnVercel: outcome({ OBSERVER_ENVIRONMENT: "development", VERCEL: "1" }),
      unsetOnVercel: outcome({ VERCEL: "1", VERCEL_ENV: "preview" }),
      developmentLocal: outcome({ OBSERVER_ENVIRONMENT: "development" }),
      configuredInProduction: outcome({
        OBSERVER_ENVIRONMENT: "production",
        VERCEL: "1",
        DEVICE_CREDENTIAL_PEPPER: "p".repeat(64),
      }),
    }).toEqual({
      staging: "refused",
      production: "refused",
      developmentOnVercel: "refused",
      unsetOnVercel: "refused",
      developmentLocal: "stand-in",
      configuredInProduction: "configured value",
    });
  });
});
