import { describe, expect, it } from "vitest";
import { findAnswerDefects, isCausalQuestion, type ObserverAnswer } from "../src/observer-answer";

/**
 * "What changed" and "why it changed" are different questions.
 *
 * A live answer to `Explain why Compare mode fell, and cite the evidence.`
 * reported three descriptive figures, repeated one of them in different words,
 * never said that the evidence cannot establish a cause, and routed to a
 * general overview instead of the period comparison. Every one of those is a
 * rule here.
 */

const bundle = {
  bundleId: "b1",
  tool: "detect_showroom_behavior_changes",
  sampleSize: 74,
  evidenceLevel: "observed_sequence" as const,
  sourceChannel: "IRIS_SHOWROOM_DERIVED" as const,
  facts: [],
  caveats: [],
};

function answer(overrides: Partial<ObserverAnswer> = {}): ObserverAnswer {
  return {
    answer: "Compare use is 29% of presentations this quarter, 14 points below the previous one.",
    headline: "Compare use fell by 14 points",
    findings: [{ statement: "Compare used in 29% of presentations", value: "29%", evidenceRefs: ["b1"] }],
    evidence: [bundle],
    interpretation:
      "These figures establish that the rate fell. They cannot establish why: nothing Observer records carries a cause.",
    limitations: ["The comparison covers two periods of unequal agent mix."],
    recommendedActions: [],
    followUpQuestions: [],
    orbState: "waiting_for_human",
    ...overrides,
  } as ObserverAnswer;
}

describe("recognising a question that asks why", () => {
  for (const q of [
    "Explain why Compare mode fell, and cite the evidence.",
    "Why is interest in A-402 changing?",
    "What caused the drop in shortlisting?",
    "What is the reason for fewer meetings?",
  ]) {
    it(`treats as causal: ${q}`, () => {
      expect(isCausalQuestion(q)).toBe(true);
    });
  }

  for (const q of ["What changed this month?", "Compare the sales agents", "Which units are losing attention?"]) {
    it(`treats as descriptive: ${q}`, () => {
      expect(isCausalQuestion(q)).toBe(false);
    });
  }
});

describe("answering a why-question", () => {
  const WHY = "Explain why Compare mode fell, and cite the evidence.";

  it("accepts an answer that states the change and declines the cause", () => {
    expect(findAnswerDefects(answer(), WHY)).toEqual([]);
  });

  it("rejects an answer that quietly describes instead of declining", () => {
    /*
     * The shipped failure.
     *
     * Three true figures under a "why" heading, with nothing saying the
     * question was not answered. The reader leaves believing they were told
     * the reason.
     */
    const defects = findAnswerDefects(
      answer({
        interpretation: "Compare was unopened in 71% of presentations across 73 meetings.",
        limitations: ["Sample sizes differ between the periods."],
      }),
      WHY,
    );
    expect(defects.map((d) => d.kind)).toContain("unsupported_causal_claim");
  });

  it("rejects an answer that asserts a cause", () => {
    const defects = findAnswerDefects(
      answer({ interpretation: "Compare use fell because agents skipped the shortlist step." }),
      WHY,
    );
    expect(defects.map((d) => d.kind)).toContain("unsupported_causal_claim");
  });

  it("does not apply the rule to a descriptive question", () => {
    expect(
      findAnswerDefects(
        answer({ interpretation: "Compare was unopened in 71% of presentations." }),
        "What changed this month?",
      ),
    ).toEqual([]);
  });
});

describe("saying the same thing twice", () => {
  it("rejects one measurement stated as two findings", () => {
    // "unopened in 71%" and "never opened in 71%" are one sentence twice.
    const defects = findAnswerDefects(
      answer({
        findings: [
          { statement: "Compare was unopened in 71% of presentations", value: "71%", evidenceRefs: ["b1"] },
          { statement: "Compare was never opened in 71% of presentations", value: "71%", evidenceRefs: ["b1"] },
        ],
      }),
    );
    expect(defects.map((d) => d.kind)).toContain("duplicate_finding");
  });

  it("allows two genuinely different findings", () => {
    expect(
      findAnswerDefects(
        answer({
          findings: [
            { statement: "Compare used in 29% of presentations", value: "29%", evidenceRefs: ["b1"] },
            { statement: "Shortlist reached in 86% of presentations", value: "86%", evidenceRefs: ["b1"] },
          ],
        }),
      ),
    ).toEqual([]);
  });
});
