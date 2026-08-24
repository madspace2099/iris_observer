import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderCoverageJson, renderCoverageMarkdown } from "../src/generate/coverage";
import {
  REQUIREMENTS,
  requirementsBySource,
  uncoveredRequirements,
  unresolvedRequirements,
} from "../src/requirements";
import { getMetric } from "../src/registry/index";

const root = resolve(import.meta.dirname, "../../..");

describe("source-requirement coverage", () => {
  it("leaves no requirement uncovered", () => {
    // A requirement with no metric, no read model, no contract, no deferral
    // and no recorded open question has silently been dropped.
    expect(uncoveredRequirements().map((r) => r.id)).toEqual([]);
  });

  it("only names metrics that actually exist", () => {
    for (const requirement of REQUIREMENTS) {
      for (const id of requirement.metrics ?? []) {
        expect(getMetric(id), `${requirement.id} claims missing metric ${id}`).toBeDefined();
      }
    }
  });

  it("has requirements from every source", () => {
    expect(requirementsBySource("stano").length).toBeGreaterThan(0);
    expect(requirementsBySource("sales_agent_flow").length).toBeGreaterThan(0);
    expect(requirementsBySource("madspace").length).toBeGreaterThan(0);
    expect(requirementsBySource("webiris_addendum").length).toBeGreaterThan(0);
  });

  it("states a question for every open decision", () => {
    for (const requirement of unresolvedRequirements()) {
      expect(requirement.unresolved?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it("uses unique requirement ids", () => {
    const ids = REQUIREMENTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is committed in sync", () => {
    const committed = readFileSync(resolve(root, "docs/coverage-report.md"), "utf8");
    expect(committed).toBe(renderCoverageMarkdown());
  });

  it("has a machine-readable counterpart in sync too", () => {
    const committed = readFileSync(resolve(root, "docs/coverage-report.json"), "utf8");
    expect(committed).toBe(`${JSON.stringify(renderCoverageJson(), null, 2)}\n`);
  });
});
