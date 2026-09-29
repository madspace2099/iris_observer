import { describe, expect, it } from "vitest";
import type { EvidenceRef } from "@observer/readmodels";
import { bundlesFor, type AskContextInput } from "../src/lib/ai/agent";
import type { ToolResult } from "../src/lib/ai/tools";

/**
 * An evidence bundle claims no more than its read model did.
 *
 * `bundlesFor` used to infer a tier from the source list when a tool returned
 * none: any answer carrying `CRM_OUTCOME_CONTEXT` became an attributed
 * conversion. An attributed conversion is a conversion assigned under a stated
 * rule; a chip is not a rule, and the chip most often marks the agent's own
 * recorded outcome. Without a read model's tier the bundle claims the least.
 *
 * One measured assertion per test, so a mutation is read by which one fails.
 */

const CONTEXT = {
  projectSlug: "northgate",
  periodLabel: "Quarter to date",
} as unknown as AskContextInput;

const result = (evidence: EvidenceRef | null): ToolResult => ({
  tool: "test_tool",
  facts: [],
  sources: ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED", "CRM_OUTCOME_CONTEXT"],
  evidence,
  sampleSize: 12,
  caveats: [],
  action: null,
  draft: "",
});

describe("the tier of an evidence bundle", () => {
  it("is the record's when the read model gave none, whatever the chips say", () => {
    const [bundle] = bundlesFor([result(null)], CONTEXT);
    expect(
      bundle?.evidenceLevel,
      "a CRM chip on the sources upgraded the bundle to an attributed conversion",
    ).toBe("observed_sequence");
  });

  it("is the read model's where it stated one", () => {
    const evidence = {
      evidenceId: "ev_test",
      tier: "statistical_association",
      href: "/alpha/northgate/presentation",
      observationCount: 12,
    } as unknown as EvidenceRef;
    const [bundle] = bundlesFor([result(evidence)], CONTEXT);
    expect(bundle?.evidenceLevel).toBe("statistical_association");
  });
});
