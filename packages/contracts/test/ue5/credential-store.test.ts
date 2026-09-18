import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_AT_REST_CAVEAT,
  CREDENTIAL_PERSISTENCE_OPERATIONS,
  CREDENTIAL_SECURITY_PROPERTIES,
  CREDENTIAL_STORE_IMPLEMENTATION_STATUS,
  CREDENTIAL_STORE_MODES,
  CREDENTIAL_STORE_VERIFICATION_REQUIRED,
  PLATFORM_PROTECTED_MECHANISM,
  verifyCredentialStore,
} from "../../src/ue5/credential";
import { scanForForbiddenContent } from "../../src/ue5/privacy";

/**
 * CREDENTIAL AT REST — a development state, a production policy, and a gate.
 *
 * Plain JSON on disk is a perfectly reasonable place to be during development
 * and is not being criticised as one. What it must never be is **shipped**: it
 * lowers the bar from "extract it from a packaged binary" to "read a file", and
 * those are different threats however similar they sound. A backup, a shared
 * machine or a support engineer with filesystem access clears the second bar and
 * not the first.
 *
 * So the policy is a function that a packaging step can fail on, rather than a
 * paragraph somebody is supposed to have read.
 */

describe("the persistence abstraction is behavioural", () => {
  it("names four operations and no platform", () => {
    expect([...CREDENTIAL_PERSISTENCE_OPERATIONS]).toEqual([
      "SaveCredential",
      "LoadCredential",
      "DeleteCredential",
      "ReplaceCredential",
    ]);
    /* Nothing in the operation names is Windows-specific, and nothing should be. */
    expect(CREDENTIAL_PERSISTENCE_OPERATIONS.join(" ")).not.toMatch(/DPAPI|Windows|Keychain/i);
  });

  it("approves a mechanism for Windows and declines to invent one elsewhere", () => {
    expect(PLATFORM_PROTECTED_MECHANISM["windows"]).toBe("Windows DPAPI");
    /*
     * macOS and Linux are absent on purpose. The platform matrix is still open,
     * and requiring a Keychain implementation for a platform nobody has
     * committed to shipping on would be inventing work.
     */
    expect(Object.keys(PLATFORM_PROTECTED_MECHANISM)).toEqual(["windows"]);
  });

  it("offers exactly two store modes", () => {
    expect([...CREDENTIAL_STORE_MODES]).toEqual(["plaintext_development", "platform_protected"]);
  });
});

describe("the production packaging gate", () => {
  it("refuses a production package that persists plaintext", () => {
    const verdict = verifyCredentialStore({
      environment: "production",
      mode: "plaintext_development",
      platform: "windows",
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.refusal).toMatch(/PLAINTEXT CREDENTIAL/);
  });

  it("accepts a production package using the approved platform store", () => {
    expect(
      verifyCredentialStore({
        environment: "production",
        mode: "platform_protected",
        platform: "Windows",
      }).ok,
    ).toBe(true);
  });

  it("refuses production on a platform with no approved mechanism", () => {
    const verdict = verifyCredentialStore({
      environment: "production",
      mode: "platform_protected",
      platform: "macos",
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.refusal).toMatch(/NO APPROVED MECHANISM/);
  });

  it("leaves development alone, because that is where plain JSON belongs", () => {
    for (const environment of ["development", "staging"] as const) {
      expect(
        verifyCredentialStore({ environment, mode: "plaintext_development", platform: "windows" })
          .ok,
        environment,
      ).toBe(true);
    }
  });

  it("never labels the development mode production-safe", () => {
    /*
     * The one way this policy could be quietly defeated is by somebody deciding
     * the dev mode is "fine for now" in a shipped build. There is no argument
     * available: the gate refuses it, in every platform.
     */
    for (const platform of ["windows", "macos", "linux", "anything"]) {
      expect(
        verifyCredentialStore({
          environment: "production",
          mode: "plaintext_development",
          platform,
        }).ok,
        platform,
      ).toBe(false);
    }
  });
});

describe("planned is not implemented", () => {
  it("records the production store as planned and not yet verified", () => {
    /*
     * DPAPI is the confirmed plan, and a plan from a competent engineer usually
     * does arrive — which is exactly why recording it as though it had is the
     * more tempting version of the mistake this table exists to prevent.
     */
    expect(CREDENTIAL_STORE_IMPLEMENTATION_STATUS).toBe("PLANNED_NOT_YET_VERIFIED");
  });

  it("states what evidence would move it, so the bar cannot drift", () => {
    const joined = CREDENTIAL_STORE_VERIFICATION_REQUIRED.join(" ");
    expect(joined).toMatch(/implemented, not only planned/);
    expect(joined).toMatch(/survives crash recovery/);
    expect(joined).toMatch(/cannot select plaintext persistence/);
    expect(joined).toMatch(/a test or an artefact demonstrating the above/);
  });
});

describe("what platform protection does not buy", () => {
  it("says plainly that it does not make the credential unextractable", () => {
    expect(CREDENTIAL_AT_REST_CAVEAT).toMatch(/does not make the credential unextractable/);
    expect(CREDENTIAL_AT_REST_CAVEAT).not.toMatch(/secure|safe|impossible/i);
  });

  it("leaves the eight behavioural properties carrying the security", () => {
    const joined = CREDENTIAL_SECURITY_PROPERTIES.join(" ");
    expect(joined).toMatch(/scoped to one source/);
    expect(joined).toMatch(/Revocation takes effect on the next request/);
    expect(joined).toMatch(/ever appears in a log line/);
  });
});

describe("the secret scan knows Observer credential material", () => {
  it("recognises a source token and an activation code, whatever the prefix", () => {
    expect(scanForForbiddenContent({ leak: `obs_${"a".repeat(56)}` })[0]?.kind).toBe("credential");
    expect(scanForForbiddenContent({ leak: "DEV-7K4M-2QX9-D3TA" })[0]?.kind).toBe("credential");
    expect(scanForForbiddenContent({ leak: "OBS-7K4M-2QX9-D3TA" })[0]?.kind).toBe("credential");
  });

  it("names the key without carrying the credential into the finding", () => {
    const token = `obs_${"b".repeat(56)}`;
    const findings = scanForForbiddenContent({ credential_file: token });
    expect(JSON.stringify(findings)).not.toContain(token);
    expect(findings[0]?.path).toBe("credential_file");
  });
});
