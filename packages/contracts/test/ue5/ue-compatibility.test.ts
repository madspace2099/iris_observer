import { describe, expect, it } from "vitest";
import { ActivationRequestSchema } from "../../src/ue5/activation";
import { EventEnvelopeSchema } from "../../src/ue5/ingestion";
import { scanForForbiddenContent } from "../../src/ue5/privacy";
import { buildOpenApiDocument } from "../../src/ue5/openapi";

/**
 * THE IMPLEMENTED UE5 BEHAVIOUR, PUT THROUGH THE CONTRACT.
 *
 * UE-OBS-001 through UE-OBS-004 are complete, and they were built before this
 * contract existed. That makes the interesting question no longer "is this
 * implementable" but "does what already exists parse" — and the honest way to
 * answer it is to feed the reported behaviour to the schemas rather than to
 * reason about it in a table.
 *
 * Some of these assertions record a **match**, and some record a **hazard**: a
 * plausible UE serialisation that this contract refuses. A hazard is not a
 * complaint about the UE implementation — it is a coordination item made
 * concrete, so that a decision is taken deliberately rather than discovered
 * when the first showroom quarantines every event it produces.
 *
 * Where a hazard exists, the assertion asserts the *refusal*, so that if either
 * side changes, this file has to be looked at.
 */

const REPORTED_TIMESTAMP = "2026-09-01T09:14:02.881Z";

const envelope = {
  event_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  event_name: "unit.viewed",
  schema_version: 1,
  occurred_at: REPORTED_TIMESTAMP,
  session_id: "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e",
  sequence: 1,
  properties: {},
};

describe("timestamps — match", () => {
  it("accepts the millisecond UTC form FObserverEvent produces", () => {
    /* `YYYY-MM-DDTHH:MM:SS.sssZ`, exactly as reported for UE-OBS-004. */
    expect(EventEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it("still requires the offset, so a bare local time cannot slip in", () => {
    expect(
      EventEnvelopeSchema.safeParse({ ...envelope, occurred_at: "2026-09-01T09:14:02.881" })
        .success,
    ).toBe(false);
  });
});

describe("event identifiers — hazard", () => {
  it("refuses the unhyphenated 32-digit form", () => {
    /*
     * HAZARD. `FGuid::ToString()` defaults to `EGuidFormats::Digits`, which is
     * 32 hex characters with no hyphens. If that is what reaches the wire, every
     * event is `malformed_event`. The conforming call is
     * `ToString(EGuidFormats::DigitsWithHyphensLower)`.
     */
    expect(
      EventEnvelopeSchema.safeParse({
        ...envelope,
        event_id: "6f1c9f6e2c7a4a4e9b319b0f9a3f1a2b",
      }).success,
    ).toBe(false);
  });

  it("refuses a hyphenated identifier without RFC version and variant bits", () => {
    /*
     * The subtler half of the same hazard, and the one that cannot be fixed by
     * choosing a format string. `z.uuid()` enforces a version nibble of 1–8 and
     * a variant nibble of 8/9/a/b. A 128-bit identifier from a source that does
     * not set those — which some platform GUID implementations do not — is
     * rejected roughly three times in four, at random.
     *
     * This is why OPEN-14 exists. Either UE guarantees RFC 4122 output, or the
     * contract relaxes to "any canonical 128-bit identifier". Both are
     * defensible; neither may be assumed.
     */
    const versionNibbleZero = "6f1c9f6e-2c7a-0a4e-9b31-9b0f9a3f1a2b";
    const variantNibbleWrong = "6f1c9f6e-2c7a-4a4e-2b31-9b0f9a3f1a2b";
    expect(
      EventEnvelopeSchema.safeParse({ ...envelope, event_id: versionNibbleZero }).success,
    ).toBe(false);
    expect(
      EventEnvelopeSchema.safeParse({ ...envelope, event_id: variantNibbleWrong }).success,
    ).toBe(false);
  });

  it("accepts uppercase hex, so casing is not part of the hazard", () => {
    expect(
      EventEnvelopeSchema.safeParse({
        ...envelope,
        event_id: "6F1C9F6E-2C7A-4A4E-9B31-9B0F9A3F1A2B",
      }).success,
    ).toBe(true);
  });
});

describe("field naming — hazard", () => {
  it("refuses the camelCase envelope Unreal's JSON converter produces by default", () => {
    /*
     * HAZARD. `FJsonObjectConverter` lowercases the first letter of each
     * UPROPERTY, so `EventId` becomes `eventId`, not `event_id`. Roundtripping
     * inside Unreal proves the two halves of the UE serialiser agree with each
     * other; it says nothing about agreeing with this contract.
     *
     * The contract does not move: the whole wire vocabulary, the OpenAPI
     * document and the stored observation are snake_case. This is OPEN-15.
     */
    const camel = {
      eventId: envelope.event_id,
      eventName: envelope.event_name,
      schemaVersion: 1,
      occurredAt: REPORTED_TIMESTAMP,
      sessionId: envelope.session_id,
      sequence: 1,
      properties: {},
    };
    expect(EventEnvelopeSchema.safeParse(camel).success).toBe(false);
  });
});

describe("sequence — hazard", () => {
  it("refuses a sequence that starts at zero", () => {
    /*
     * HAZARD, and a one-line one. Monotonic sequencing exists (U-10), but a
     * counter that starts at 0 loses the first event of every session to
     * `malformed_event`. The contract says "from 1"; a `++counter` and a
     * `counter++` differ by exactly this.
     */
    expect(EventEnvelopeSchema.safeParse({ ...envelope, sequence: 0 }).success).toBe(false);
  });

  it("accepts a session-less event with no sequence at all", () => {
    expect(
      EventEnvelopeSchema.safeParse({ ...envelope, session_id: null, sequence: null }).success,
    ).toBe(true);
  });

  it("accepts a sequence large enough for any real session", () => {
    expect(EventEnvelopeSchema.safeParse({ ...envelope, sequence: 2_147_483_647 }).success).toBe(
      true,
    );
  });
});

describe("endpoint naming — mismatch, deliberately unresolved", () => {
  it("records both names without picking one", () => {
    /*
     * MISMATCH. The UE Project Settings configure
     * `https://observer.madspace.io/functions/v1/activate` and `/ingest`; this
     * contract proposes `/observer-activate` and `/observer-ingest`.
     *
     * Neither is picked here. The endpoint is configurable in UE, so nothing is
     * blocked — but resolving it silently in favour of whichever document was
     * edited last is exactly how two teams end up each certain the other agreed.
     * OPEN-17, and the routing is not to be implemented around either name until
     * it is settled.
     */
    const contractPaths = Object.keys(
      (buildOpenApiDocument() as { paths: Record<string, unknown> }).paths,
    );
    const ueConfigured = ["/activate", "/ingest"];

    expect(contractPaths).toContain("/observer-activate");
    expect(contractPaths).toContain("/observer-ingest");
    for (const configured of ueConfigured) {
      expect(contractPaths, `${configured} is not what the contract publishes`).not.toContain(
        configured,
      );
    }
  });

  it("keeps the host out of the contract, which is why this is not urgent", () => {
    /*
     * `observer.madspace.io` versus a Supabase project reference is a deployment
     * detail, and the plugin takes both URLs from the activation response
     * anyway. The path *name* is the part that has to agree.
     */
    const servers = (buildOpenApiDocument() as { servers: { url: string }[] }).servers;
    expect(servers[0]?.url).toContain("{projectRef}");
  });
});

describe("activation codes — match", () => {
  const request = {
    activation_code: "DEV-7K4M-2QX9-D3TA",
    reported_environment: "development" as const,
    installation_nonce: "b2a5f0c1-3d4e-4f7a-8c9b-0d1e2f3a4b5c",
    build: {
      app_version: "IRIS 4.3.0",
      plugin_version: "ObserverUE 0.2.0",
      build_id: "iris-4.3.0-win64-development-1",
      engine_version: "5.6",
    },
    os: "Windows 11 24H2",
  };

  it("accepts the DEV- prefix already in use, because a prefix is not semantic", () => {
    expect(ActivationRequestSchema.safeParse(request).success).toBe(true);
  });

  it("treats a DEV- code as a secret in a payload, exactly as it treats an OBS- one", () => {
    /*
     * The scanner knew `OBS-` and not `DEV-`, which is to say it protected the
     * prefix nobody was testing with. It is prefix-agnostic now.
     */
    expect(scanForForbiddenContent({ debug: "DEV-7K4M-2QX9-D3TA" })[0]?.kind).toBe("credential");
    expect(scanForForbiddenContent({ debug: "OBS-7K4M-2QX9-D3TA" })[0]?.kind).toBe("credential");
  });

  it("still refuses the fields the earlier draft had and this one removed", () => {
    /*
     * UE-OBS-003 was built before this contract existed, so its request body is
     * not assumed to match. If it still carries a hardware fingerprint or a
     * hostname hint, it finds out here rather than against a live endpoint.
     */
    for (const field of ["machine_fingerprint", "hostname_hint", "environment"]) {
      expect(
        ActivationRequestSchema.safeParse({ ...request, [field]: "anything" }).success,
        field,
      ).toBe(false);
    }
  });
});
