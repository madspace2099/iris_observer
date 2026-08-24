import { describe, expect, it } from "vitest";
import {
  INTENT_LEVELS,
  INTENT_THRESHOLDS,
  IntentSignalSchema,
  classifyIntent,
  isIntentSignalStale,
} from "../src/intent";
import { DEAL_STAGES } from "../src/engagement";

const base = {
  signalId: "isg_viktoria01",
  tenantId: "tnt_aabbccdd11",
  projectId: "prj_northgate01",
  contactId: "cnt_viktoria001",
  level: "high" as const,
  score: 78,
  calculatedAt: "2026-08-24T09:00:00.000+02:00",
  freshUntil: "2026-09-14T09:00:00.000+02:00",
  contributingMetrics: [
    {
      metricId: "unit.favourites",
      label: "Units shortlisted",
      display: "2",
      weight: 0.4,
      points: 32,
    },
    {
      metricId: "online.session.count",
      label: "Visits in 3 weeks",
      display: "3",
      weight: 0.6,
      points: 46,
    },
  ],
  evidenceIds: ["evd_7f3a1c02b9"],
  confidence: {
    level: "moderate" as const,
    reason: "Three visits and two shortlisted units, no CRM record linked.",
    sampleSize: 5,
    minSampleRequired: 3,
  },
  dataCompleteness: 0.75,
  reasonCodes: ["multiple_units_shortlisted" as const, "recent_return_visit" as const],
  rulesetVersion: "1.0.0",
};

describe("intent signal", () => {
  it("is a separate concept from the deal ladder", () => {
    for (const level of INTENT_LEVELS) {
      expect(DEAL_STAGES as readonly string[]).not.toContain(level);
    }
  });

  it("accepts a fully explained signal", () => {
    const parsed = IntentSignalSchema.safeParse(base);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("refuses a classification with nothing behind it", () => {
    // "High" with no contributing metric is an opaque judgement, which is
    // exactly what this signal is designed not to be.
    expect(IntentSignalSchema.safeParse({ ...base, contributingMetrics: [] }).success).toBe(false);
  });

  it("refuses a signal with no reason codes", () => {
    expect(IntentSignalSchema.safeParse({ ...base, reasonCodes: [] }).success).toBe(false);
  });

  it("claims a score exactly when it claims a level", () => {
    expect(IntentSignalSchema.safeParse({ ...base, score: null }).success).toBe(false);
    expect(
      IntentSignalSchema.safeParse({
        ...base,
        level: "insufficient_data",
        score: null,
        contributingMetrics: [],
        reasonCodes: ["sources_incomplete"],
      }).success,
    ).toBe(true);
    expect(
      IntentSignalSchema.safeParse({ ...base, level: "insufficient_data", score: 78 }).success,
    ).toBe(false);
  });

  it("classifies deterministically at published thresholds", () => {
    expect(classifyIntent(INTENT_THRESHOLDS.high)).toBe("high");
    expect(classifyIntent(INTENT_THRESHOLDS.high - 1)).toBe("medium");
    expect(classifyIntent(INTENT_THRESHOLDS.medium)).toBe("medium");
    expect(classifyIntent(INTENT_THRESHOLDS.medium - 1)).toBe("low");
    // Same input, same output, every time. No model, no drift.
    expect(classifyIntent(78)).toBe(classifyIntent(78));
  });

  it("expires, because intent decays and a stale signal is not a signal", () => {
    const signal = IntentSignalSchema.parse(base);
    expect(isIntentSignalStale(signal, "2026-09-01T09:00:00.000+02:00")).toBe(false);
    expect(isIntentSignalStale(signal, "2026-10-01T09:00:00.000+02:00")).toBe(true);
  });

  it("carries the ruleset version, so a disputed result is reproducible", () => {
    expect(IntentSignalSchema.parse(base).rulesetVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("says how complete the inputs were", () => {
    expect(IntentSignalSchema.parse(base).dataCompleteness).toBeLessThan(1);
  });
});
