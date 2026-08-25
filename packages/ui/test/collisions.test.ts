import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * One class name, one meaning.
 *
 * Three defects in this codebase have been the same defect: a new stylesheet
 * declaring a class name an older one already used. `.iris-stack` was both a
 * page layout and a column in a stacked bar chart, and silently centred and
 * narrowed every page that used it. `.obs-briefing` was both a card component
 * and Observer's opening sentence, and drew a box around the sentence.
 *
 * Neither was catchable by the type checker, the build, the unit suite or a
 * selector-based end-to-end test. Both were found by looking at a screenshot.
 * So the rule is asserted here instead of relied upon.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function classesIn(file: string): Set<string> {
  const css = readFileSync(join(SRC, file), "utf8");
  const found = new Set<string>();
  /*
   * Only where the class is the subject of the rule.
   *
   * `.iris-home .iris-verdict` sets a property on `.iris-verdict` within a
   * scope; it does not define `.iris-home`, and treating it as a definition
   * would report every scoped override as a collision.
   */
  for (const match of css.matchAll(/(?:^|\n)\s*\.([a-zA-Z][\w-]*)(?=[\s,{:[.>+~])/g)) {
    const name = match[1];
    if (name !== undefined) found.add(name);
  }
  return found;
}

/*
 * The one legitimate reason for a class to appear twice.
 *
 * `showroom.css` is an override layer over `iris.css`: it restyles the shell
 * for the analytical surfaces and is loaded after it on purpose. Redefining a
 * class there is the point of the file. Every other pair of stylesheets is
 * independent, and a name in two of them is two things wearing one name.
 */
const OVERRIDES: Readonly<Record<string, string>> = {
  "showroom.css": "iris.css",
};

function mayRedefine(file: string, owner: string): boolean {
  return OVERRIDES[file] === owner;
}

describe("stylesheet class names", () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".css"));

  it("has stylesheets to check", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("never defines the same class in two stylesheets", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];

    for (const file of files) {
      for (const name of classesIn(file)) {
        const existing = owner.get(name);
        if (existing === undefined) {
          owner.set(name, file);
        } else if (existing !== file && !mayRedefine(file, existing)) {
          clashes.push(`.${name} is declared in both ${existing} and ${file}`);
        }
      }
    }

    expect(clashes, clashes.join("\n")).toEqual([]);
  });
});
