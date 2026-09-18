import { describe, expect, it } from "vitest";

import {
  EvidenceBundleSchema,
  EvidenceLevelSchema,
  ObserverAnswerSchema,
  findAnswerDefects,
  isTraceable,
  type EvidenceBundle,
  type ObserverAnswer,
} from "../src/observer-answer";

/**
 * The answer contract, as tests.
 *
 * These assert the three structural prohibitions rather than the wording of a
 * prompt. A system prompt asking a model not to claim causation is a request; a
 * schema that will not parse a causal tier is a guarantee, and the difference
 * shows up exactly when a model is behaving unusually.
 */

const BUNDLE: EvidenceBundle = {
  bundleId: "ev_1_summarize_showroom_period",
  projectSlug: "northgate",
  period: "Quarter to date",
  factId: "showroom.coverage.core",
  sourceChannel: "IRIS_SHOWROOM_OBSERVED",
  sampleSize: 132,
  evidenceLevel: "observed_sequence",
  href: "/alpha/northgate/showroom",
};

function answer(overrides: Partial<ObserverAnswer> = {}): ObserverAnswer {
  return {
    answer: "Core coverage was 78% across 132 presentations.",
    headline: "Coverage held, depth did not",
    findings: [
      {
        statement: "Core coverage",
        value: "78%",
        evidenceRefs: [BUNDLE.bundleId],
      },
    ],
    evidence: [BUNDLE],
    interpretation: "Coverage is steady in this sample; median depth is the figure that moved.",
    limitations: ["16 sessions carry no per-step timing."],
    recommendedActions: [],
    followUpQuestions: [],
    orbState: "insight",
    ...overrides,
  };
}

describe("the evidence bundle", () => {
  it("carries everything needed to check a figure", () => {
    const parsed = EvidenceBundleSchema.safeParse(BUNDLE);
    expect(parsed.success).toBe(true);
  });

  it("refuses a causal claim as an evidence level", () => {
    /*
     * The central prohibition, made structural.
     *
     * ADR-0010 says Observer produces observed sequences, attributed
     * conversions and statistical associations, never causation. The level
     * enum is built from the producible list, so a model that labels its own
     * finding causal produces an answer that cannot be parsed.
     */
    expect(EvidenceLevelSchema.safeParse("causal_claim").success).toBe(false);
    expect(EvidenceLevelSchema.safeParse("observed_sequence").success).toBe(true);
    expect(EvidenceLevelSchema.safeParse("attributed_conversion").success).toBe(true);
    expect(EvidenceLevelSchema.safeParse("statistical_association").success).toBe(true);
  });

  it("keeps a sample size of zero rather than treating it as absent", () => {
    // Zero is a real answer and the honest denominator for an empty period.
    const parsed = EvidenceBundleSchema.safeParse({ ...BUNDLE, sampleSize: 0 });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown field rather than ignoring it", () => {
    const parsed = EvidenceBundleSchema.safeParse({ ...BUNDLE, confidence: 0.9 });
    expect(parsed.success).toBe(false);
  });
});

describe("the answer shape", () => {
  it("accepts a well-formed answer", () => {
    expect(ObserverAnswerSchema.safeParse(answer()).success).toBe(true);
  });

  it("caps recommended actions at three", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({
      label: `Action ${i}`,
      rationale: "Because it was measured.",
      href: null,
    }));
    expect(ObserverAnswerSchema.safeParse(answer({ recommendedActions: four })).success).toBe(
      false,
    );
  });

  it("bounds every string, so a runaway generation fails validation", () => {
    const huge = "x".repeat(5_000);
    expect(ObserverAnswerSchema.safeParse(answer({ answer: huge })).success).toBe(false);
    expect(ObserverAnswerSchema.safeParse(answer({ interpretation: huge })).success).toBe(false);
    expect(ObserverAnswerSchema.safeParse(answer({ headline: huge })).success).toBe(false);
  });

  it("permits only the four orb states an answer may claim", () => {
    for (const state of ["insight", "contradictory_evidence", "waiting_for_human", "error"]) {
      expect(ObserverAnswerSchema.safeParse(answer({ orbState: state as never })).success).toBe(
        true,
      );
    }
    // `listening`, `thinking` and `speaking` describe what the client is doing
    // and are never a server payload's to claim.
    for (const state of ["thinking", "speaking", "listening", "idle"]) {
      expect(ObserverAnswerSchema.safeParse(answer({ orbState: state as never })).success).toBe(
        false,
      );
    }
  });

  it("requires at least one evidence reference on every finding", () => {
    const parsed = ObserverAnswerSchema.safeParse(
      answer({ findings: [{ statement: "Something", value: null, evidenceRefs: [] }] }),
    );
    expect(parsed.success).toBe(false);
  });
});

describe("traceability", () => {
  it("passes an answer whose citations all resolve", () => {
    expect(isTraceable(answer())).toBe(true);
    expect(findAnswerDefects(answer())).toEqual([]);
  });

  it("catches a citation to a bundle that was never supplied", () => {
    /*
     * The failure that actually happens.
     *
     * A model shown four bundles will occasionally cite a fifth, and a citation
     * to nothing is worse than no citation because it reads as rigour.
     */
    const defects = findAnswerDefects(
      answer({
        findings: [{ statement: "Invented", value: "99%", evidenceRefs: ["ev_9_nonexistent"] }],
      }),
    );
    expect(defects).toHaveLength(1);
    expect(defects[0]?.kind).toBe("dangling_evidence");
  });

  it("catches findings offered with no evidence at all", () => {
    // The shape a model produces when it has decided to answer from memory.
    const defects = findAnswerDefects(answer({ evidence: [] }));
    expect(defects.some((d) => d.kind === "ungrounded_answer")).toBe(true);
  });

  it("exempts the two states whose whole point is having nothing to show", () => {
    for (const state of ["error", "waiting_for_human"] as const) {
      const defects = findAnswerDefects(answer({ evidence: [], orbState: state }));
      expect(defects.some((d) => d.kind === "ungrounded_answer")).toBe(false);
    }
  });
});
