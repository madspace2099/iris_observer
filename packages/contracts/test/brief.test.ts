import { describe, expect, it } from "vitest";
import {
  PROHIBITED_INFERENCE_CATEGORIES,
  PreMeetingBriefSchema,
  ObservedPriceRangeSchema,
} from "../src/brief.js";

const EVIDENCE = "evd_7f3a1c02b9";
const CONTACT = "cnt_9a2b4c6d8e";
const UNIT = "unt_a402000001";

const brief = {
  context: {
    meetingId: "mtg_1122334455",
    projectId: "prj_istertower1",
    tenantId: "tnt_aabbccdd11",
    agentId: "agt_monika0001",
    scheduledFor: "2026-08-27T10:00:00.000+02:00",
    contactIds: [CONTACT],
    isReturningBuyer: false,
    previousMeetingCount: 0,
    lastMeetingAt: null,
  },
  generatedAt: "2026-08-24T09:00:00.000+02:00",
  generatorVersion: "brief-1.0.0",
  observed: {
    onlineActivity: {
      sessionCount: 3,
      firstSeenAt: "2026-08-02T18:12:00.000+02:00",
      lastSeenAt: "2026-08-21T21:40:00.000+02:00",
      daysSinceLastVisit: 3,
      sessionDates: ["2026-08-02T18:12:00.000+02:00"],
      includesBackLinkedActivity: true,
    },
    unitInterest: [
      {
        unitId: UNIT,
        uniqueViews: 2,
        meaningfulDwellMs: 94000,
        favourited: true,
        channels: ["webiris"],
        lastSeenAt: "2026-08-21T21:35:00.000+02:00",
        materialsOpened: ["floorplan"],
        sharedAt: null,
      },
    ],
    compareSets: [],
    filters: [
      {
        criterion: "orientation",
        value: "S",
        occurrences: 4,
        lastAppliedAt: "2026-08-21T21:30:00.000+02:00",
        lastResultCount: 6,
      },
    ],
    priceRange: null,
    sharedMaterials: [],
    statements: [
      {
        text: "Three visits in three weeks, the last one three days ago.",
        tier: "observed_sequence",
        evidenceId: EVIDENCE,
      },
    ],
  },
  interpretation: {
    preferredAttributes: [
      {
        attribute: "orientation",
        value: "S",
        supportCount: 4,
        totalObservations: 5,
        confidence: {
          level: "moderate",
          reason: "South-facing in four of five filter applications.",
          sampleSize: 5,
          minSampleRequired: 3,
        },
      },
    ],
    statements: [],
  },
  recommended: {
    unitsToPrepare: [
      {
        unitId: UNIT,
        available: true,
        reason: {
          text: "Favourited and viewed twice, still available.",
          tier: "observed_sequence",
          evidenceId: EVIDENCE,
        },
      },
    ],
    previouslyInterestedNowUnavailable: [],
    changesSinceLastVisit: [],
    clarificationQuestions: [],
    statements: [],
  },
  dataHealth: {
    completeness: 0.6,
    sourcesPresent: ["webiris"],
    sourcesMissing: ["crm"],
    missing: [
      { what: "CRM deal stage", consequence: "Outcomes below the meeting cannot be shown." },
    ],
  },
};

describe("pre-meeting brief", () => {
  it("parses a complete brief", () => {
    const result = PreMeetingBriefSchema.safeParse(brief);
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it("keeps observation, interpretation and recommendation apart", () => {
    const parsed = PreMeetingBriefSchema.parse(brief);
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining(["observed", "interpretation", "recommended"]),
    );
    // An interpretation must carry its support count, so a single stray
    // observation cannot be presented with the same weight as a pattern.
    expect(parsed.interpretation.preferredAttributes[0]?.supportCount).toBe(4);
  });

  it("refuses a causal claim anywhere in the brief", () => {
    const withCausalClaim = structuredClone(brief);
    withCausalClaim.observed.statements[0]!.tier = "causal_claim";
    expect(PreMeetingBriefSchema.safeParse(withCausalClaim).success).toBe(false);
  });

  it("says which sources were missing rather than reporting a smaller truth", () => {
    const parsed = PreMeetingBriefSchema.parse(brief);
    expect(parsed.dataHealth.sourcesMissing).toContain("crm");
    expect(parsed.dataHealth.missing.length).toBeGreaterThan(0);
    expect(parsed.dataHealth.completeness).toBeLessThan(1);
  });

  it("flags history the buyer never volunteered", () => {
    const parsed = PreMeetingBriefSchema.parse(brief);
    expect(parsed.observed.onlineActivity.includesBackLinkedActivity).toBe(true);
  });

  it("treats an observed price range as a filter the buyer actually set", () => {
    const observed = ObservedPriceRangeSchema.safeParse({
      min: 180000,
      max: 220000,
      currency: "EUR",
      observedAt: "2026-08-21T21:30:00.000+02:00",
      occurrences: 3,
    });
    expect(observed.success).toBe(true);
    // Absent by default: a range guessed from the units they happened to open
    // is an inference and belongs in the interpretation section.
    expect(PreMeetingBriefSchema.parse(brief).observed.priceRange).toBeNull();
  });

  it("names the sensitive categories it must never infer", () => {
    expect(PROHIBITED_INFERENCE_CATEGORIES.length).toBeGreaterThan(5);
    expect(new Set(PROHIBITED_INFERENCE_CATEGORIES).size).toBe(
      PROHIBITED_INFERENCE_CATEGORIES.length,
    );
    expect(PROHIBITED_INFERENCE_CATEGORIES).toContain("pregnancy_or_family_planning");
    expect(PROHIBITED_INFERENCE_CATEGORIES).toContain("financial_distress");
  });
});
