import { describe, expect, it } from "vitest";
import { ActivationRequestSchema } from "../../src/ue5/activation";
import { EventEnvelopeSchema, ExtendedEventEnvelopeSchema } from "../../src/ue5/ingestion";
import { scanForForbiddenContent } from "../../src/ue5/privacy";
import { buildOpenApiDocument } from "../../src/ue5/openapi";
import {
  CanonicalIdSchema,
  EnvironmentSchema,
  EVENT_ID_REQUIREMENT,
  isCanonicalEnvironment,
  normaliseReportedEnvironment,
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
  app: {
    version: "1.0.0",
    plugin: "0.2.0",
    build_id: "BUILD-2026-09-01",
    environment: "development",
  },
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
  it("accepts both published UE identifiers", () => {
    /*
     * ANSWERED, 2026-09-02:
     * `FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower)`,
     * generated once before enqueueing and immutable across retries.
     *
     * Both samples happen to carry RFC version and variant bits, so they parse
     * under either schema. That is a fact about these two samples, not a
     * guarantee about `FGuid` — see the next test for why the envelope no
     * longer depends on it.
     */
    for (const id of [
      "c7a8b4f2-39d1-4e8a-b851-923f0dc841e1",
      "550e8400-e29b-41d4-a716-446655440000",
    ]) {
      expect(CanonicalIdSchema.safeParse(id).success, id).toBe(true);
      expect(EventEnvelopeSchema.safeParse({ ...envelope, event_id: id }).success, id).toBe(true);
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

  it("accepts a hyphenated identifier without RFC version and variant bits", () => {
    /*
     * THE RELAXATION, NOW ADOPTED. `PD-12` is superseded by `PD-12a`.
     *
     * `z.uuid()` enforced a version nibble of 1–8 and a variant nibble of
     * 8/9/a/b. `PD-12` kept that, reasoning that `CoCreateGuid` backs `FGuid` on
     * the confirmed Windows-only platform so the bits are set in practice.
     *
     * True, and exactly the problem: the guarantee rested on a platform accident
     * rather than on the contract. A 128-bit identifier from a GUID source that
     * does not set those bits would have been rejected roughly three times in
     * four, at random, the day a non-Windows target appeared.
     *
     * What is locked is narrower — a stable, globally unique 128-bit identifier
     * generated once before queueing and preserved through retries. Nothing
     * downstream reads the version bits, nothing in the security model depends
     * on them, and deduplication is scoped to `(source_id, event_id)`, so the
     * collision domain is one installation rather than the world.
     */
    const versionNibbleZero = "6f1c9f6e-2c7a-0a4e-9b31-9b0f9a3f1a2b";
    const variantNibbleWrong = "6f1c9f6e-2c7a-4a4e-2b31-9b0f9a3f1a2b";
    const neither = "6f1c9f6e-2c7a-0a4e-2b31-9b0f9a3f1a2b";

    for (const id of [versionNibbleZero, variantNibbleWrong, neither]) {
      expect(WireUuidSchema.safeParse(id).success, `${id}: refused by the old schema`).toBe(false);
      expect(EventEnvelopeSchema.safeParse({ ...envelope, event_id: id }).success, id).toBe(true);
    }

    /* The relaxation is not a licence for anything shorter or unstructured. */
    expect(CanonicalIdSchema.safeParse("6f1c9f6e2c7a4a4e9b319b0f9a3f1a2b").success).toBe(false);
    expect(CanonicalIdSchema.safeParse("not-an-id").success).toBe(false);

    expect(EVENT_ID_REQUIREMENT).toMatch(/Version and variant semantics are not part/);
  });

  it("refuses uppercase hex, because Postgres would alter it on the round trip", () => {
    /*
     * THE ONE DIRECTION THAT NARROWED, AND IT IS DELIBERATE.
     *
     * `z.uuid()` accepted either case, and a previous assertion here recorded
     * that "casing is not part of the hazard". Storage makes it part of the
     * hazard: PostgreSQL's native `uuid` type normalises its input to lowercase
     * on output. An uppercase `event_id` would be stored, read back ALTERED, and
     * echoed in `results[]` in a form the client never sent — so a UE outbox
     * pairing results to pending entries by string would fail to match, and a
     * successfully stored event would stay pending for ever.
     *
     * Accepting only what round-trips unchanged is what makes native `uuid`
     * storage safe. `EGuidFormats::DigitsWithHyphensLower` emits lowercase, so
     * this costs the confirmed client nothing.
     */
    expect(
      EventEnvelopeSchema.safeParse({
        ...envelope,
        event_id: "6F1C9F6E-2C7A-4A4E-9B31-9B0F9A3F1A2B",
      }).success,
    ).toBe(false);

    expect(
      EventEnvelopeSchema.safeParse({
        ...envelope,
        session_id: "0C9F2D31-77A4-4B12-9E88-1F2A3B4C5D6E",
      }).success,
      "session_id is minted by the same FGuid path and stored in the same column type",
    ).toBe(false);
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

  it("parses, because the four fields are now envelope fields — O-20 closed", () => {
    /*
     * THE BLOCKING MISMATCH, RESOLVED. This assertion is the inverse of what it
     * used to be, and the inversion is the point: every real event used to fail
     * with `unrecognized_keys` on `app`, `agent_id`, `visitor_subject` and
     * `entity`, so UE-OBS-007 could not pass a single event.
     *
     * OPEN-20 was decided by adopting them into `EventEnvelopeSchema` itself
     * rather than into a parallel schema — which is what makes the decision
     * reach `validation.ts`, `BatchEnvelopeSchema` and the published OpenAPI at
     * the same time.
     */
    const parsed = EventEnvelopeSchema.safeParse(implemented);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("no longer distinguishes the extension from the envelope", () => {
    /*
     * `ExtendedEventEnvelopeSchema` survives as a deprecated alias so existing
     * imports keep naming the thing they were written to describe. Asserting the
     * identity keeps a future reader from believing there are still two shapes.
     */
    expect(ExtendedEventEnvelopeSchema).toBe(EventEnvelopeSchema);
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

  it("keeps the seven original fields unchanged, and now requires app", () => {
    /*
     * The reassuring half: nothing about the pre-existing envelope is in
     * dispute — snake_case, millisecond UTC, sequence from 1 all still parse.
     *
     * What changed is that `app` became REQUIRED while the other three
     * additions did not. Asserting both halves keeps the asymmetry deliberate:
     * an event always knows which build produced it, but need not have an
     * agent, a visitor or an entity.
     */
    const withoutOptionalThree = { ...implemented };
    delete (withoutOptionalThree as Partial<typeof implemented>).agent_id;
    delete (withoutOptionalThree as Partial<typeof implemented>).visitor_subject;
    delete (withoutOptionalThree as Partial<typeof implemented>).entity;
    expect(EventEnvelopeSchema.safeParse(withoutOptionalThree).success).toBe(true);

    const withoutApp = { ...withoutOptionalThree };
    delete (withoutApp as Partial<typeof implemented>).app;
    expect(
      EventEnvelopeSchema.safeParse(withoutApp).success,
      "app is required — build provenance is not optional",
    ).toBe(false);
  });

  it("carries the capitalised environment rather than rejecting the event", () => {
    /*
     * `Development` is not `development`, and a first reading of this made the
     * envelope refuse it. That would have been the wrong trade: the value is
     * REPORTED metadata — the stored environment comes from the source record,
     * assigned at registration, or a development build declaring itself
     * production routes its data there.
     *
     * So nothing authorises on this field, and refusing a whole event over a
     * diagnostic would break delivery for no gain. The envelope carries it as a
     * bounded string; `normaliseReportedEnvironment` folds the case; and a value
     * outside the published set is a batch-level warning, not a rejection.
     */
    expect(
      EventEnvelopeSchema.safeParse(implemented).success,
      "the capitalised value must not cost the event",
    ).toBe(true);

    /* The published vocabulary is still exact, and still case-sensitive. */
    expect(EnvironmentSchema.safeParse(implemented.app.environment).success).toBe(false);
    expect(EnvironmentSchema.safeParse("development").success).toBe(true);

    /* Folding case is what reconciles the two. */
    expect(normaliseReportedEnvironment(implemented.app.environment)).toBe("development");
    expect(isCanonicalEnvironment(implemented.app.environment)).toBe(true);
    expect(isCanonicalEnvironment("kiosk")).toBe(false);

    /* `demo` joined the vocabulary in the same amendment. */
    expect(EnvironmentSchema.safeParse("demo").success).toBe(true);
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
