import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMatrixJson, renderMatrixMarkdown } from "../src/generate/matrix.js";

const root = resolve(import.meta.dirname, "../../..");

describe("measurement dependency matrix", () => {
  it("is committed in sync with the registry", () => {
    // A registry change that nobody regenerated leaves the documentation
    // wrong, and a wrong dependency matrix is how a screen ends up depending
    // on a fact nobody was ever asked to produce.
    const committed = readFileSync(resolve(root, "docs/measurement-matrix.md"), "utf8");
    expect(committed).toBe(renderMatrixMarkdown());
  });

  it("has a machine-readable counterpart in sync too", () => {
    const committed = readFileSync(resolve(root, "docs/measurement-matrix.json"), "utf8");
    expect(committed).toBe(`${JSON.stringify(renderMatrixJson(), null, 2)}\n`);
  });

  it("lists every metric and traces each to at least one fact", () => {
    const json = renderMatrixJson();
    expect(json.metrics.length).toBeGreaterThan(0);
    for (const metric of json.metrics) {
      expect(metric.requiredFacts.length, `${metric.id} traces to nothing`).toBeGreaterThan(0);
    }
  });

  it("reports, for each fact, which screens' metrics it would break", () => {
    const json = renderMatrixJson();
    const lead = json.facts.find((f) => f.id === "lead.submitted");
    expect(lead?.requiredBy).toContain("journey.webiris_to_showroom");
  });
});
