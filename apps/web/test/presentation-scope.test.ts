import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Source assertions on the JSX, comments stripped, as the other page-claim
 * tests do it.
 */
const web = resolve(import.meta.dirname, "..");
const markup = (path: string): string =>
  readFileSync(resolve(web, path), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * PRESENTATION DNA KEEPS THE READER'S PAIR, AND SAYS WHAT ITS FIRST LANE IS.
 *
 * The plan's R11: a chosen agent pair is part of the scope and may not be lost
 * by moving between screens, and the aggregate lane's caption names its
 * aggregation. A mode switch dropped the pair, and the page said "Each lane is
 * one presenter's sequence" above a first lane that is the team's mean order.
 */
const PAGE = markup("src/app/(app)/[tenantSlug]/[projectSlug]/presentation/page.tsx");

describe("the Presentation DNA page", () => {
  it("carries the chosen pair through a mode switch", () => {
    expect(PAGE).toContain("qs({ mode: m.id, ...pair })");
    expect(PAGE).toMatch(/left: search\.left/);
    expect(PAGE).toMatch(/right: search\.right/);
  });

  it("says the first lane is the team's mean order, not one presenter's sequence", () => {
    expect(PAGE).not.toMatch(/Each lane is one presenter/);
    expect(PAGE).toMatch(/The first lane is the team&rsquo;s/);
    expect(PAGE).toMatch(/mean position across that lane&rsquo;s meetings/);
  });
});

/**
 * THE ROSTER CREDITS NO SOURCE THAT DID NOT CONTRIBUTE.
 *
 * Sales Agents drew a "CRM outcome" source chip on every CRM-connected project,
 * under rings, flags and findings that read only the outcomes recorded in the
 * room. The sweep that took the same chip off the agent's page (83d3e72) missed
 * this one.
 */
const ROSTER = markup("src/app/(app)/[tenantSlug]/[projectSlug]/agents/page.tsx");

describe("the Sales Agents roster", () => {
  it("names the showroom as its source, and never the CRM", () => {
    expect(ROSTER).not.toContain("CRM_OUTCOME_CONTEXT");
    expect(ROSTER).toContain(
      '<SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />',
    );
  });
});
