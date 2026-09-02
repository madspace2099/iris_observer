import { describe, expect, it } from "vitest";
import { ProjectIdSchema, TenantIdSchema } from "../../src/ids";
import { EventEnvelopeSchema, isReservedPropertyKey } from "../../src/ue5/ingestion";
import { projectEvent, toSourceObservation, type DerivedIdentity } from "../../src/ue5/projection";
import { HARNESS_LIMITS } from "../../src/ue5/limits";
import { DEFAULT_CLOCK_POLICY, validateEvent } from "../../src/ue5/validation";

/**
 * IDENTITY IS THE SERVER'S, AND THERE IS NO PATH BY WHICH IT BECOMES THE
 * CLIENT'S.
 *
 * LOCKED §3.2, §4.2 and §9.2 say the backend derives tenant, project and source
 * from the credential, and that the client cannot select them. That is easy to
 * write in a document and easy to lose in an implementation, usually through a
 * merge: a payload spread into a record, a helpful default, an "if the client
 * sent one, use it".
 *
 * So the guarantee here is structural rather than a convention. Identity arrives
 * as a **separate argument** to the projection, the payload is a different
 * parameter, and there is no code path connecting them. These tests attack that
 * from three directions: the envelope, the payload, and the projection itself.
 */

const TENANT = TenantIdSchema.parse("tnt_realtenant01");
const PROJECT = ProjectIdSchema.parse("prj_realproject1");

const SERVER: DerivedIdentity = {
  tenantId: TENANT,
  projectId: PROJECT,
  sourceId: "7c2f0a11-8b3d-4c5e-9f01-2a3b4c5d6e7f",
  installationId: null,
  deviceId: null,
  environment: "production",
};

const base = {
  event_id: "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b",
  event_name: "unit.viewed",
  schema_version: 1,
  occurred_at: "2026-09-01T09:14:02.881Z",
  session_id: "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e",
  sequence: 7,
  app: {
    version: "1.0.0",
    plugin: "0.2.0",
    build_id: "BUILD-2026-09-01",
    environment: "development",
  },
  properties: {} as Record<string, unknown>,
};

const context = {
  limits: HARNESS_LIMITS,
  acceptedSchemaVersions: { min: 1, max: 1 },
  registry: null,
  clock: DEFAULT_CLOCK_POLICY,
  now: new Date("2026-09-01T09:20:00.000Z"),
};

describe("the envelope has no room for identity", () => {
  it("rejects tenant, project and source on the envelope", () => {
    for (const field of ["tenant_id", "project_id", "source_id", "ingested_at"]) {
      const parsed = EventEnvelopeSchema.safeParse({ ...base, [field]: "anything" });
      expect(parsed.success, field).toBe(false);
    }
  });
});

describe("the payload has no room for it either", () => {
  it("knows the reserved keys in either spelling", () => {
    for (const key of [
      "project_id",
      "projectId",
      "Project-Id",
      "tenant",
      "SOURCE",
      "ingested_at",
    ]) {
      expect(isReservedPropertyKey(key), key).toBe(true);
    }
    for (const key of ["unit_id", "session_path", "projector_state", "sourceOfLight"]) {
      expect(isReservedPropertyKey(key), key).toBe(false);
    }
  });

  it("refuses a reserved key at the top level", () => {
    const verdict = validateEvent({ ...base, properties: { project_id: "prj_hostile" } }, context);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.rejection.code).toBe("reserved_property");
  });

  it("permits a nested domain key, because the guarantee is not lexical", () => {
    /*
     * A DELIBERATE NARROWING, and worth understanding rather than assuming.
     *
     * An earlier revision rejected these names at every depth. That is too
     * strict to live with: `sequence`, `source` and `project` are ordinary
     * words, and a future event schema will legitimately carry something like
     * `tour: { steps: [{ sequence }] }` without the transport having an opinion
     * about it.
     *
     * The narrowing is safe because the guarantee comes from the projection, not
     * from this list — see the structural test below, which hands the projection
     * a payload full of identity and gets the server's identity back anyway.
     * The top-level rule prevents a field that *looks* authoritative; it was
     * never what made privilege escalation impossible.
     */
    const nested = validateEvent(
      { ...base, properties: { context: { ids: { projectId: "prj_hostile" } } } },
      context,
    );
    expect(nested.ok, "nested is accepted").toBe(true);

    /* And the top level, where it would look authoritative, still is not. */
    const top = validateEvent({ ...base, properties: { projectId: "prj_hostile" } }, context);
    expect(top.ok).toBe(false);
    if (!top.ok) expect(top.rejection.code).toBe("reserved_property");
  });

  it("refuses a credential-shaped name at the top level", () => {
    for (const key of ["source_token", "activation_code", "authorization", "api_key"]) {
      const verdict = validateEvent({ ...base, properties: { [key]: "x" } }, context);
      expect(verdict.ok, key).toBe(false);
      if (!verdict.ok) expect(verdict.rejection.code, key).toBe("reserved_property");
    }
  });

  it("keeps a nested identity value inert once projected", () => {
    /*
     * The half of the narrowing that has to be proved rather than argued: a
     * payload that now *parses* with identity buried in it must still have no
     * effect on the identity that gets stored.
     */
    const nested = EventEnvelopeSchema.parse({
      ...base,
      properties: { context: { ids: { projectId: "prj_hostile", tenantId: "tnt_hostile" } } },
    });
    const projected = projectEvent(nested, SERVER);
    expect(projected.tenantId).toBe(TENANT);
    expect(projected.projectId).toBe(PROJECT);
    expect(projected.payload).toEqual({
      context: { ids: { projectId: "prj_hostile", tenantId: "tnt_hostile" } },
    });
  });

  it("refuses the observer namespace", () => {
    const verdict = validateEvent({ ...base, properties: { observer_score: 9 } }, context);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.rejection.code).toBe("reserved_property");
  });

  it("rejects rather than silently ignores, so a plugin bug is found on the first run", () => {
    /*
     * Ignoring would satisfy the locked rule too — the value would not be
     * trusted. It would also let a plugin believe for a year that it was setting
     * `project_id`, and the day somebody starts trusting the field is the day it
     * matters.
     */
    const verdict = validateEvent({ ...base, properties: { tenant_id: "tnt_x" } }, context);
    expect(verdict.ok).toBe(false);
  });
});

describe("the projection takes identity from the server, always", () => {
  it("uses the server's tenant and project", () => {
    const event = EventEnvelopeSchema.parse(base);
    const projected = projectEvent(event, SERVER);
    expect(projected.tenantId).toBe(TENANT);
    expect(projected.projectId).toBe(PROJECT);
  });

  it("carries the client's own bookkeeping through untouched", () => {
    const event = EventEnvelopeSchema.parse({ ...base, properties: { unit_code: "A-402" } });
    const projected = projectEvent(event, SERVER);
    expect(projected.observationId).toBe(base.event_id);
    expect(projected.sourceEventName).toBe("unit.viewed");
    expect(projected.occurredAt).toBe(base.occurred_at);
    expect(projected.payload).toEqual({ unit_code: "A-402" });
    expect(projected.source).toBe("showroom");
  });

  it("cannot be steered by a payload even when validation is bypassed", () => {
    /*
     * The adversarial case: pretend the reserved-key guard was removed, and
     * hand the projection a payload that carries identity anyway. There is no
     * path from `payload` to `tenantId`, so the answer is unchanged. That is
     * what makes this structural rather than a rule somebody has to remember.
     */
    const smuggled = {
      ...EventEnvelopeSchema.parse(base),
      properties: { tenant_id: "tnt_attacker01", project_id: "prj_attacker01" },
    };
    const projected = projectEvent(smuggled, SERVER);
    expect(projected.tenantId).toBe(TENANT);
    expect(projected.projectId).toBe(PROJECT);
    expect(projected.payload).toEqual({
      tenant_id: "tnt_attacker01",
      project_id: "prj_attacker01",
    });
  });

  it("gives two sources different identity for the same event id", () => {
    /* Source A cannot become source B by reusing an event_id. */
    const event = EventEnvelopeSchema.parse(base);
    const other: DerivedIdentity = {
      ...SERVER,
      tenantId: TenantIdSchema.parse("tnt_othertenant"),
      projectId: ProjectIdSchema.parse("prj_otherproject"),
      sourceId: "11111111-2222-4333-8444-555555555555",
    };
    expect(projectEvent(event, SERVER).tenantId).not.toBe(projectEvent(event, other).tenantId);
  });
});

describe("the one place the two contracts disagree", () => {
  it("narrows a session event to the stored observation", () => {
    const projected = projectEvent(EventEnvelopeSchema.parse(base), SERVER);
    const narrowed = toSourceObservation(projected);
    expect(narrowed.ok).toBe(true);
    if (narrowed.ok) expect(narrowed.observation.sequence).toBe(7);
  });

  it("refuses to invent a sequence for an event that has none", () => {
    /*
     * `SourceObservationSchema` requires a sequence; a session-less event has
     * none. Defaulting to zero would sort it before every real event in a
     * session it does not belong to, and nobody would notice for two years. So
     * the projection refuses and the amendment stays visible. See P-21.
     */
    const sessionless = EventEnvelopeSchema.parse({ ...base, session_id: null, sequence: null });
    const narrowed = toSourceObservation(projectEvent(sessionless, SERVER));
    expect(narrowed.ok).toBe(false);
    if (!narrowed.ok) expect(narrowed.reason).toBe("sequence_required_by_observation_contract");
  });
});
