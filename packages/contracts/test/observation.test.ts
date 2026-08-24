import { describe, expect, it } from "vitest";
import {
  CLIENT_PROHIBITED_FACT_PREFIXES,
  CanonicalFactSchema,
  IngestOutcomeSchema,
  SourceObservationSchema,
  isClientSubmittableFact,
} from "../src/observation";

const TENANT = "tnt_aabbccdd11";
const PROJECT = "prj_istertower1";
const OBSERVATION = "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b";

describe("source observation", () => {
  it("accepts what a client is allowed to submit", () => {
    const parsed = SourceObservationSchema.safeParse({
      observationId: OBSERVATION,
      sourceSchemaVersion: "webiris-1.0",
      source: "webiris",
      sourceEventName: "apartment_panel_closed",
      tenantId: TENANT,
      projectId: PROJECT,
      occurredAt: "2026-08-21T21:35:12.482+02:00",
      sequence: 141,
      payload: { unitCode: "A-402", activeMs: 94000 },
    });
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("requires a globally unique identifier so replay is safe", () => {
    const parsed = SourceObservationSchema.safeParse({
      observationId: "not-a-uuid",
      sourceSchemaVersion: "webiris-1.0",
      source: "webiris",
      sourceEventName: "x",
      tenantId: TENANT,
      projectId: PROJECT,
      occurredAt: "2026-08-21T21:35:12.482+02:00",
      sequence: 0,
      payload: {},
    });
    expect(parsed.success).toBe(false);
  });
});

describe("client-submittable facts", () => {
  it("refuses derived conclusions from a client", () => {
    // A showroom PC can honestly report a panel was open for ninety seconds.
    // It cannot report that a sale was caused by a website.
    expect(isClientSubmittableFact("attribution.online_to_offer")).toBe(false);
    expect(isClientSubmittableFact("conversion.stage")).toBe(false);
    expect(isClientSubmittableFact("causal.webiris_drove_visit")).toBe(false);
    expect(isClientSubmittableFact("anomaly.demand_drop")).toBe(false);
    expect(isClientSubmittableFact("insight.coaching")).toBe(false);
  });

  it("allows ordinary observations", () => {
    expect(isClientSubmittableFact("unit.viewed")).toBe(true);
    expect(isClientSubmittableFact("meeting.attended")).toBe(true);
  });

  it("keeps the prohibition list non-empty and unique", () => {
    expect(CLIENT_PROHIBITED_FACT_PREFIXES.length).toBeGreaterThan(3);
    expect(new Set(CLIENT_PROHIBITED_FACT_PREFIXES).size).toBe(
      CLIENT_PROHIBITED_FACT_PREFIXES.length,
    );
  });
});

describe("canonical fact", () => {
  const base = {
    factId: "unit.viewed",
    semanticVersion: "adapter-1.0.0",
    tenantId: TENANT,
    projectId: PROJECT,
    source: "webiris" as const,
    channel: "webiris" as const,
    sourceObservationId: OBSERVATION,
    observedAt: "2026-08-21T21:35:12.482+02:00",
    measurementMethod: "active_foreground" as const,
    rawActiveDurationMs: 94_000,
    identityConfidence: "deterministic" as const,
    unitId: "unt_a402000001",
  };

  it("preserves provenance back to the immutable observation", () => {
    const parsed = CanonicalFactSchema.safeParse(base);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
    expect(CanonicalFactSchema.parse(base).sourceObservationId).toBe(OBSERVATION);
  });

  it("retains the raw duration rather than a pre-thresholded value", () => {
    // The dwell threshold is applied at query time so it can be revised and
    // re-applied to history. Storing only a meaningful flag would repeat the
    // legacy system's mistake.
    expect(CanonicalFactSchema.parse(base).rawActiveDurationMs).toBe(94_000);
  });

  it("carries how it was measured and how sure the identity is", () => {
    const fact = CanonicalFactSchema.parse(base);
    expect(fact.measurementMethod).toBe("active_foreground");
    expect(fact.identityConfidence).toBe("deterministic");
  });

  it("requires a measurement method even when there is no duration", () => {
    const withoutMethod: Record<string, unknown> = { ...base };
    delete withoutMethod["measurementMethod"];
    expect(CanonicalFactSchema.safeParse(withoutMethod).success).toBe(false);
  });
});

describe("ingest outcome", () => {
  it("reports per observation, never per batch", () => {
    for (const result of ["accepted", "duplicate"] as const) {
      expect(IngestOutcomeSchema.safeParse({ observationId: OBSERVATION, result }).success).toBe(
        true,
      );
    }
  });

  it("carries a reason with every rejection", () => {
    const parsed = IngestOutcomeSchema.parse({
      observationId: OBSERVATION,
      result: "rejected",
      reason: "unknown unit reference",
    });
    expect(parsed.reason).toBe("unknown unit reference");
  });
});
