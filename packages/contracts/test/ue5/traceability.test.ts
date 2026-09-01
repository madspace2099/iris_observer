import { describe, expect, it } from "vitest";
import {
  CLASSIFICATIONS,
  CONTRACT_RULES,
  classificationCounts,
  rulesByClassification,
  type ContractRule,
} from "../../src/ue5/traceability";
import { UE5_CONTRACT_STATUS, UE5_CONTRACT_VERSION } from "../../src/ue5/wire";

/**
 * "WHY IS THIS HERE, AND ON WHOSE AUTHORITY?" — ENFORCED.
 *
 * A prose contract cannot keep that question answerable. Six revisions in, a
 * convenient proposal has acquired the confident tone of an approved decision
 * and nobody can tell by reading. So the classification is data and the rules
 * about it are these tests.
 *
 * The one that matters most is the third: **nothing PROPOSED may cite the
 * brief.** That is the exact failure the reviewer asked to be made impossible —
 * a technically convenient proposal masquerading as approved architecture.
 */

const byId = new Map(CONTRACT_RULES.map((rule) => [rule.id, rule]));

describe("the traceability table is well formed", () => {
  it("gives every rule a unique identifier", () => {
    expect(byId.size).toBe(CONTRACT_RULES.length);
  });

  it("classifies every rule as one of the five", () => {
    for (const rule of CONTRACT_RULES) {
      expect(CLASSIFICATIONS, rule.id).toContain(rule.classification);
    }
  });

  it("says something in every statement", () => {
    for (const rule of CONTRACT_RULES) {
      expect(rule.statement.length, rule.id).toBeGreaterThan(20);
      expect(rule.where.length, rule.id).toBeGreaterThan(0);
    }
  });
});

describe("locked rules carry the brief's authority, and only they do", () => {
  it("cites a brief section for every locked rule", () => {
    for (const rule of rulesByClassification("LOCKED_FROM_BRIEF")) {
      expect(rule.briefSection, `${rule.id} must cite the brief`).not.toBeNull();
      expect(rule.briefSection, rule.id).toMatch(/§\d/);
      expect(rule.owner, rule.id).toBe("brief");
      expect(rule.derivedFrom, `${rule.id} is locked, not derived`).toHaveLength(0);
    }
  });

  it("refuses a brief citation to anything that is not locked", () => {
    /*
     * The important one. A proposal that cites §5.5 reads exactly like an
     * approved rule, and the difference is invisible in prose. Here it fails.
     */
    const impostors = CONTRACT_RULES.filter(
      (rule) => rule.classification !== "LOCKED_FROM_BRIEF" && rule.briefSection !== null,
    );
    expect(impostors.map((rule) => rule.id)).toEqual([]);
  });

  it("never lets a proposal claim the brief as its owner", () => {
    for (const rule of CONTRACT_RULES) {
      if (rule.classification === "LOCKED_FROM_BRIEF") continue;
      expect(rule.owner, rule.id).not.toBe("brief");
    }
  });
});

describe("derived rules name what they follow from", () => {
  const derived = rulesByClassification("DERIVED_FROM_LOCKED_RULE");

  it("names at least one antecedent, and every one of them exists", () => {
    for (const rule of derived) {
      expect(rule.derivedFrom.length, rule.id).toBeGreaterThan(0);
      for (const antecedent of rule.derivedFrom) {
        expect(byId.has(antecedent), `${rule.id} cites unknown ${antecedent}`).toBe(true);
      }
    }
  });

  it("only ever derives from something locked", () => {
    /*
     * A derivation from another derivation would be a chain nobody audits, and a
     * derivation from a PROPOSED rule would be a proposal wearing a second coat.
     */
    for (const rule of derived) {
      for (const antecedent of rule.derivedFrom) {
        const source = byId.get(antecedent) as ContractRule;
        expect(source.classification, `${rule.id} → ${antecedent}`).toBe("LOCKED_FROM_BRIEF");
      }
    }
  });

  it("never rests a derivation on a mock fixture", () => {
    const mockIds = new Set(rulesByClassification("MOCK_ONLY").map((rule) => rule.id));
    for (const rule of derived) {
      for (const antecedent of rule.derivedFrom) {
        expect(mockIds.has(antecedent), `${rule.id} derives from scaffolding`).toBe(false);
      }
    }
  });
});

describe("open items stay open", () => {
  it("keeps the contract marked a candidate while anything is unresolved", () => {
    const open = rulesByClassification("OPEN");
    expect(open.length).toBeGreaterThan(0);
    /* Both of these must change deliberately, together, and after a review. */
    expect(UE5_CONTRACT_STATUS).toBe("PROPOSED");
    expect(UE5_CONTRACT_VERSION).toContain("candidate");
  });

  it("gives every open item an owner who is not the brief", () => {
    for (const rule of rulesByClassification("OPEN")) {
      expect(rule.owner, rule.id).not.toBe("brief");
      expect(rule.owner, rule.id).not.toBe("harness");
    }
  });

  it("keeps the list of things genuinely needing Unreal-side facts short", () => {
    /*
     * Counted over UNRESOLVED rules only. Owner alone is no longer the right
     * filter: after UE-OBS-001..004, twelve rules are owned by Akhilesh as
     * *evidence* rather than as questions, and counting those would make the
     * ask look four times larger than it is.
     */
    const asks = CONTRACT_RULES.filter(
      (rule) =>
        (rule.classification === "OPEN" || rule.classification === "PROPOSED") &&
        (rule.owner === "akhilesh" || rule.owner === "matthew_and_akhilesh"),
    );
    /* Fewer is better; more means we are asking him to decide our work. */
    expect(asks.length).toBeLessThanOrEqual(8);
    expect(asks.length).toBeGreaterThan(0);
  });
});

describe("implementation evidence is not architecture", () => {
  const ueConfirmed = rulesByClassification("UE_IMPLEMENTATION_CONFIRMED");

  it("records what completed UE work evidences", () => {
    expect(ueConfirmed.length).toBeGreaterThan(0);
    for (const rule of ueConfirmed) {
      expect(rule.evidence, `${rule.id} must name its evidence`).not.toBeNull();
      expect(rule.owner, rule.id).toBe("akhilesh");
    }
  });

  it("never lets implementation evidence borrow the brief's authority", () => {
    /*
     * The mislabelling this class exists to prevent, and it runs the opposite
     * way from the original one. That the engine is 5.6, that the credential
     * sits at a particular path, that sequencing is monotonic — all true, none
     * of them architecture rules, and all of them free to change next sprint.
     */
    for (const rule of ueConfirmed) {
      expect(rule.briefSection, rule.id).toBeNull();
      expect(rule.derivedFrom, rule.id).toHaveLength(0);
    }
  });

  it("never rests a contract derivation on implementation evidence", () => {
    const evidenceIds = new Set(ueConfirmed.map((rule) => rule.id));
    for (const rule of rulesByClassification("DERIVED_FROM_LOCKED_RULE")) {
      for (const antecedent of rule.derivedFrom) {
        expect(evidenceIds.has(antecedent), `${rule.id} derives from evidence`).toBe(false);
      }
    }
  });
});

describe("an approved decision has somewhere honest to sit", () => {
  const decisions = rulesByClassification("APPROVED_PRODUCT_DECISION");

  it("names who decided and when", () => {
    expect(decisions.length).toBeGreaterThan(0);
    for (const rule of decisions) {
      expect(rule.evidence, `${rule.id} must name the decider`).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(rule.briefSection, rule.id).toBeNull();
    }
  });

  it("closes the legacy analytics question rather than leaving it open", () => {
    /*
     * OPEN-10 asked which legacy database held prototype analytics and whether
     * any of it needed preserving. Answered on 2026-09-01: prototype blobs
     * only, nothing to migrate. An answered question left in the OPEN list is a
     * question somebody asks again.
     */
    expect(CONTRACT_RULES.some((rule) => rule.id === "O-10")).toBe(false);
    expect(decisions.some((rule) => /clean slate/i.test(rule.statement))).toBe(true);
    expect(decisions.some((rule) => /retired for V2/i.test(rule.statement))).toBe(true);
  });

  it("keeps a decision distinct from a proposal", () => {
    for (const rule of decisions) {
      expect(rule.classification).not.toBe("PROPOSED");
      expect(rule.derivedFrom).toHaveLength(0);
    }
  });
});

describe("evidence is required exactly where it belongs", () => {
  it("carries no evidence on a rule that is not a fact or a decision", () => {
    for (const rule of CONTRACT_RULES) {
      if (rule.classification === "UE_IMPLEMENTATION_CONFIRMED") continue;
      if (rule.classification === "APPROVED_PRODUCT_DECISION") continue;
      expect(rule.evidence, rule.id).toBeNull();
    }
  });
});

describe("the counts are what the report claims", () => {
  it("adds up", () => {
    const counts = classificationCounts();
    const total = CLASSIFICATIONS.reduce((sum, key) => sum + counts[key], 0);
    expect(total).toBe(CONTRACT_RULES.length);
  });

  it("has more locked and derived rules than proposals", () => {
    /*
     * Not arithmetic for its own sake. If this contract were mostly invention,
     * the ratio would say so, and it would be the first thing a reviewer should
     * be told rather than something they have to count by hand.
     */
    const counts = classificationCounts();
    const grounded = counts.LOCKED_FROM_BRIEF + counts.DERIVED_FROM_LOCKED_RULE;
    expect(grounded).toBeGreaterThan(counts.PROPOSED);
  });
});
