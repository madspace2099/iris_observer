import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The agent page claims for a figure only what the read model claims.
 *
 * The recorded-outcome region read "Verified outcomes" and said "a commercial
 * result a system of record stands behind" over a count of the agent's own
 * entries. The read model no longer says so; this checks that the page does
 * not say it either, in the one place a reader meets the words.
 *
 * Source assertions, as the other page-claim tests do it: the page is an async
 * server component behind the repository and the session.
 */

const web = resolve(import.meta.dirname, "..");
const PAGE = readFileSync(
  resolve(web, "src/app/(app)/[tenantSlug]/[projectSlug]/agents/[agentId]/page.tsx"),
  "utf8",
);

/** The JSX only — a comment may name the old claim to say why it went. */
const MARKUP = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the recorded-outcome region", () => {
  it("names no system of record as standing behind the agent's own entry", () => {
    expect(MARKUP, "the page still credits a system of record with the agent's entry").not.toMatch(
      /system of record stands behind/,
    );
  });

  it("calls the outcomes what they are", () => {
    expect(MARKUP).toContain("Outcomes they recorded");
  });

  it("reads them from the field that says so", () => {
    expect(MARKUP).toContain("view.recordedOutcomes");
  });
});
