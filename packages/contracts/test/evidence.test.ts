import { describe, expect, it } from "vitest";
import {
  EVIDENCE_TIERS,
  EvidenceSchema,
  PRODUCIBLE_EVIDENCE_TIERS,
  StatementSchema,
  isProducibleTier,
} from "../src/evidence.js";

const evidenceId = "evd_7f3a1c02b9";

describe("evidence discipline", () => {
  it("knows about causation but refuses to produce it", () => {
    expect(EVIDENCE_TIERS).toContain("causal_claim");
    expect(PRODUCIBLE_EVIDENCE_TIERS as readonly string[]).not.toContain("causal_claim");
    expect(isProducibleTier("causal_claim")).toBe(false);
  });

  it("rejects a statement that claims causation", () => {
    const result = StatementSchema.safeParse({
      text: "The website caused this purchase.",
      tier: "causal_claim",
      evidenceId,
    });
    expect(result.success).toBe(false);
  });

  it("accepts the three tiers Observer does produce", () => {
    for (const tier of PRODUCIBLE_EVIDENCE_TIERS) {
      const result = StatementSchema.safeParse({ text: "A claim.", tier, evidenceId });
      expect(result.success, `${tier} should be producible`).toBe(true);
    }
  });

  it("requires every evidence object to name a source and a drill-down", () => {
    const result = EvidenceSchema.safeParse({
      id: evidenceId,
      tier: "observed_sequence",
      factIds: ["unit.viewed"],
      sources: ["webiris"],
      observedFrom: "2026-06-01T00:00:00.000+02:00",
      observedTo: "2026-08-24T00:00:00.000+02:00",
      observationCount: 12,
      confidence: {
        level: "moderate",
        reason: "Twelve views across three sessions.",
        sampleSize: 12,
        minSampleRequired: 10,
      },
      completeness: 0.75,
      drillTo: { kind: "contact", contactId: "cnt_9a2b4c6d8e" },
      caveats: ["The CRM was disconnected for part of the period."],
    });
    expect(result.success).toBe(true);
  });

  it("refuses evidence with no facts behind it", () => {
    const result = EvidenceSchema.safeParse({
      id: evidenceId,
      tier: "observed_sequence",
      factIds: [],
      sources: ["webiris"],
      observedFrom: "2026-06-01T00:00:00.000+02:00",
      observedTo: "2026-08-24T00:00:00.000+02:00",
      observationCount: 0,
      confidence: { level: "insufficient", reason: "Nothing observed." },
      completeness: 0,
      drillTo: { kind: "contact", contactId: "cnt_9a2b4c6d8e" },
    });
    expect(result.success).toBe(false);
  });
});
