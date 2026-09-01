import { describe, expect, it } from "vitest";
import { ActivationRequestSchema } from "../../src/ue5/activation";
import { EventEnvelopeSchema, ExtendedEventEnvelopeSchema } from "../../src/ue5/ingestion";
import { scanForForbiddenContent } from "../../src/ue5/privacy";
import { buildOpenApiDocument } from "../../src/ue5/openapi";
import {
  CanonicalIdSchema,
  EnvironmentSchema,
  EVENT_ID_REQUIREMENT,
  WireUuidSchema,
} from "../../src/ue5/wire";

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

describe("event identifiers — resolved for V1", () => {
  it("accepts both published UE identifiers under the strict schema", () => {
    /*
     * ANSWERED, 2026-09-02:
     * `FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower)`,
     * generated once before enqueueing and immutable across retries.
     *
     * Both samples carry RFC version and variant bits, so the strict schema
     * stands and nothing has to change. **The reason it holds is worth keeping
     * in view**: `FGuid` is backed by `CoCreateGuid` on Windows, and Windows is
     * now the confirmed sole V1 platform. On a platform whose GUID source does
     * not set those bits this would silently start failing, which is why the
     * relaxation below stays prepared rather than deleted.
     */
    for (const id of [
      "c7a8b4f2-39d1-4e8a-b851-923f0dc841e1",
      "550e8400-e29b-41d4-a716-446655440000",
    ]) {
      expect(WireUuidSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it("refuses the unhyphenated 32-digit form", () => {
    /*
     * Kept as a regression guard rather than as an open hazard.
     * `FGuid::ToString()` defaults to `EGuidFormats::Digits` — 32 hex
     * characters, no hyphens — so a future refactor that drops the explicit
     * format argument fails here rather than in a showroom.
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
     * OPEN-14 is closed for V1 — the implemented identifiers do carry those
     * bits — but the refusal is asserted so that the day a non-Windows target
     * appears, this file is what fails.
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

  it("has a prepared relaxation that accepts what FGuid would emit", () => {
    /*
     * The strictness came from a schema library's default, not from the approved
     * architecture. What is actually locked is narrower: a *stable, globally
     * unique 128-bit identifier generated once before queueing and preserved
     * through retries*. Nothing downstream reads the version bits, nothing in
     * the security model depends on them, and deduplication is scoped to
     * (source_id, event_id) — so the collision domain is one installation.
     *
     * `CanonicalIdSchema` is therefore prepared and tested but deliberately NOT
     * wired into the envelope. If Akhilesh's serialisation turns out not to set
     * RFC bits, swapping it in is one line with this test already describing
     * exactly what changes.
     */
    const nonRfc = "6f1c9f6e-2c7a-0a4e-2b31-9b0f9a3f1a2b";
    expect(WireUuidSchema.safeParse(nonRfc).success, "today: refused").toBe(false);
    expect(CanonicalIdSchema.safeParse(nonRfc).success, "prepared: accepted").toBe(true);

    /* And the relaxation is not a licence for anything shorter or unstructured. */
    expect(CanonicalIdSchema.safeParse("6f1c9f6e2c7a4a4e9b319b0f9a3f1a2b").success).toBe(false);
    expect(CanonicalIdSchema.safeParse("not-an-id").success).toBe(false);

    expect(EVENT_ID_REQUIREMENT).toMatch(/Version and variant semantics are not part/);
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

describe("the envelope Akhilesh actually sends", () => {
  /* His published UE-OBS-004 sample, verbatim. */
  const implemented = {
    event_id: "c7a8b4f2-39d1-4e8a-b851-923f0dc841e1",
    event_name: "unit.viewed",
    schema_version: 1,
    occurred_at: "2026-09-01T15:30:00.124Z",
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    sequence: 1,
    app: {
      version: "1.0.0",
      plugin: "0.2.0",
      build_id: "BUILD-2026-09-01",
      environment: "Development",
    },
    agent_id: "agent_john",
    visitor_subject: "lead_1042",
    entity: { type: "unit", id: "IT-A-12-07" },
    properties: {
      building: "Ister Tower A",
      floor: 12,
      price: 450000.0,
      status_at_view: "available",
    },
  };

  it("is refused today, on exactly four unrecognised keys", () => {
    /*
     * THE BLOCKING MISMATCH. Not a naming disagreement and not a hazard that
     * might bite — every real event fails right now, because the envelope is
     * strict and his carries four fields it does not know. UE-OBS-007 cannot
     * pass a single event until OPEN-20 is decided.
     */
    const parsed = EventEnvelopeSchema.safeParse(implemented);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      expect(issue?.code).toBe("unrecognized_keys");
      expect(JSON.stringify(issue)).toContain("app");
      expect(JSON.stringify(issue)).toContain("agent_id");
      expect(JSON.stringify(issue)).toContain("visitor_subject");
      expect(JSON.stringify(issue)).toContain("entity");
    }
  });

  it("parses under the prepared extension, so adopting it is a one-line swap", () => {
    const parsed = ExtendedEventEnvelopeSchema.safeParse(implemented);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("accepts the three optional fields being absent rather than null", () => {
    /*
     * Settled by reading `FObserverEvent::ToJsonObject` rather than by guessing:
     * `agent_id`, `visitor_subject` and `entity` are written only when non-empty,
     * so an event with no agent omits the key entirely. `app` is always written.
     * A first draft of this schema made them `nullable`, which would have refused
     * every event that simply had no agent.
     */
    const withoutOptional = { ...implemented };
    delete (withoutOptional as Partial<typeof implemented>).agent_id;
    delete (withoutOptional as Partial<typeof implemented>).visitor_subject;
    delete (withoutOptional as Partial<typeof implemented>).entity;
    expect(ExtendedEventEnvelopeSchema.safeParse(withoutOptional).success).toBe(true);
    expect(
      ExtendedEventEnvelopeSchema.safeParse({ ...withoutOptional, agent_id: null }).success,
      "null is not the same as absent, and the plugin sends absent",
    ).toBe(false);
  });

  it("keeps the seven fields we already agreed on unchanged", () => {
    /*
     * The reassuring half: nothing about the existing envelope is in dispute.
     * Strip the four additions and it parses exactly as specified — snake_case,
     * millisecond UTC, sequence from 1.
     */
    const core = { ...implemented };
    delete (core as Partial<typeof implemented>).app;
    delete (core as Partial<typeof implemented>).agent_id;
    delete (core as Partial<typeof implemented>).visitor_subject;
    delete (core as Partial<typeof implemented>).entity;
    expect(EventEnvelopeSchema.safeParse(core).success).toBe(true);
  });

  it("refuses the capitalised environment, whichever envelope is used", () => {
    /*
     * A second reason `app` cannot simply be copied across. `Development` is
     * not `development`, and the value is reported metadata in any case — the
     * stored environment comes from the source record, or a development build
     * declaring itself production routes its data there.
     */
    expect(EnvironmentSchema.safeParse(implemented.app.environment).success).toBe(false);
    expect(EnvironmentSchema.safeParse("development").success).toBe(true);
  });

  it("carries an agent identifier derived from a person's name", () => {
    /*
     * OPEN-21, and it is a privacy question rather than a schema one. The
     * contract has no opinion on the shape of `agent_id` yet, so nothing
     * rejects `agent_john` — but a pseudonymous reference that embeds a name is
     * not pseudonymous, and the scanner cannot catch it because the giveaway is
     * the convention rather than the value.
     */
    expect(scanForForbiddenContent({ agent_id: implemented.agent_id })).toEqual([]);
    expect(implemented.agent_id).toMatch(/john/);
  });
});

describe("field naming — resolved", () => {
  it("confirms snake_case, so the camelCase hazard is closed", () => {
    /*
     * Answered on 2026-09-02: `FObserverEvent` serialises snake_case, matching
     * the contract rather than Unreal's default camelCase. The refusal below is
     * kept so that a future change to the UE serialiser fails here rather than
     * in a showroom.
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
    expect(EventEnvelopeSchema.safeParse(envelope).success).toBe(true);
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

describe("endpoint naming — resolved, and ours to decide", () => {
  it("publishes the three namespaced names the UE side will be given", () => {
    /*
     * ANSWERED, 2026-09-02: endpoints are treated as entirely backend-owned, and
     * the UE side enters whatever final URLs we supply into Project Settings.
     * The earlier `/activate` and `/ingest` in his settings were placeholders,
     * not a position.
     *
     * So the decision is ours alone, and the names stand. `observer-` prefixed,
     * because Supabase Edge Functions share one flat namespace with everything
     * else the project ever deploys, and `ingest` is a name somebody else will
     * eventually want.
     */
    const contractPaths = Object.keys(
      (buildOpenApiDocument() as { paths: Record<string, unknown> }).paths,
    ).sort();

    expect(contractPaths).toEqual([
      "/observer-activate",
      "/observer-heartbeat",
      "/observer-ingest",
    ]);
    for (const unprefixed of ["/activate", "/ingest", "/heartbeat"]) {
      expect(contractPaths, `${unprefixed} would squat a shared namespace`).not.toContain(
        unprefixed,
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
