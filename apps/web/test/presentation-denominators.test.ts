import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Presentation DNA says, on the screen, what it withholds and why.
 *
 * The read model carries three sentences a reader must meet: why there is no
 * comparison at all (`noComparison`), why a comparison drawn shows no
 * difference (`verdictRefusal`), and what a behaviour's own sample is when it
 * is narrower than the lane's. A field that exists on the read model and is
 * never printed is the P2-05 shape — the denominator in the docblock and
 * nowhere else — so this file checks the print sites, in the page and in the
 * two Ask Observer tools that answer the same question in prose.
 *
 * Source assertions, as `project-overview-denominators.test.ts` does it: the
 * page is an async server component behind the repository and the session,
 * and what is asserted here is which read-model field reaches the markup.
 */

const web = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(resolve(web, path), "utf8");

const PAGE = read("src/app/(app)/[tenantSlug]/[projectSlug]/presentation/page.tsx");
const TOOLS = read("src/lib/ai/tools.ts");

describe("the page prints the read model's reasons", () => {
  it("prints why there is no comparison, in the branch that draws none", () => {
    expect(PAGE, "the null branch shows a fixed sentence instead of the reason").toMatch(
      /comparison === null \?[\s\S]*?view\.noComparison[\s\S]*?\) : \(/,
    );
  });

  it("prints the refusal in place of the differences, under the floor", () => {
    expect(PAGE, "the floor's refusal never reaches the screen").toContain(
      "{comparison.verdictRefusal}",
    );
  });

  it("tells a refusal apart from two lanes that differ on nothing", () => {
    expect(PAGE).toMatch(/comparison\.differences\.length === 0 \?/);
  });
});

describe("the page prints every denominator the read model carries", () => {
  it("prints each transition's own denominator beneath its share", () => {
    expect(PAGE, "a transition share is drawn without the moves out of its `from`").toContain(
      "{t.count} of {t.outOf}",
    );
  });

  it("says that the denominator differs by row", () => {
    expect(PAGE).toContain("own starting section");
  });

  it("prints a row's own sample where it is narrower than the lane's", () => {
    expect(PAGE, "a row rated on fewer meetings than the lane shows the lane's n").toMatch(
      /n = \{d\.sampleLeft\} and/,
    );
  });

  it("prints what was withheld", () => {
    expect(PAGE, "a behaviour withheld by the read model vanishes from the screen").toContain(
      "comparison.withheld.map",
    );
  });
});

describe("the Ask Observer tools answer what the surface answers", () => {
  it("both comparison tools carry what was withheld", () => {
    const sites = TOOLS.match(/\.\.\.c\.withheld/g) ?? [];
    expect(sites.length, "a tool rates a behaviour the surface withholds").toBe(2);
  });

  it("both comparison tools carry the refusal", () => {
    /* Once in the caveats and once in the draft, per tool. */
    const sites = TOOLS.match(/c\.verdictRefusal (?:!==|===) null/g) ?? [];
    expect(sites.length, "a tool answers a comparison the surface refuses").toBe(4);
  });

  it("both comparison tools say why there is none", () => {
    const sites = TOOLS.match(/view\.noComparison/g) ?? [];
    expect(sites.length).toBe(2);
  });
});
