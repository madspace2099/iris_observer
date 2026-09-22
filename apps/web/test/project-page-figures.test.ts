import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The project page computes no figure.
 *
 * It rounded three shares itself — `Math.round(x * 100)%` — without the
 * project's locale and without the "<1%" guard: the figure ADR-0012 forbids a
 * component to compute, the same line the roster's card lost two rounds ago
 * and the Flow page named when it removed its own. The read model carries
 * `*Display` strings now; this is the source assertion that the page prints
 * them and rounds nothing.
 *
 * A source assertion, comments stripped, as the other page-claim tests do it:
 * the page is an async server component behind the repository.
 */

const PAGE = readFileSync(
  resolve(import.meta.dirname, "..", "src/app/(app)/[tenantSlug]/[projectSlug]/project/page.tsx"),
  "utf8",
)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("the project page", () => {
  it("rounds no share itself", () => {
    expect(
      PAGE,
      "a share is rounded in the component, without the locale or the <1% guard",
    ).not.toMatch(/Math\.round\([^)]*share/i);
  });

  it("prints the read model's display strings for the place shares", () => {
    expect(PAGE).toMatch(/\{a\.shareDisplay\}[\s\S]*\{c\.shareDisplay\}/);
  });
});
