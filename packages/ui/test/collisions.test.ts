import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * One class name, one meaning.
 *
 * Three defects in this codebase have been the same defect: a new stylesheet
 * writing a bare rule for a class name an older one already used.
 *
 *   `.iris-stack`     a page layout in `iris.css`, and a stacked-bar column in
 *                     `charts.css`. Every page using the layout was silently
 *                     centred and narrowed.
 *   `.obs-briefing`   a card component, and Observer's opening sentence. The
 *                     sentence rendered inside a box.
 *   `.obs-evidence`   an evidence chip, and the panel beneath the briefing.
 *
 * None was catchable by the type checker, the build, the unit suite or a
 * selector-based end-to-end test. All three were found by looking at a
 * screenshot.
 *
 * ## What counts as a collision
 *
 * An **unscoped subject** — `.foo { … }` — claims the name everywhere. A file
 * that scopes *into* a class — `.foo .bar { … }` — is asserting ownership of
 * `.foo` just as firmly. A **scoped subject** — `.panel .foo { … }` — only
 * restyles someone else's component inside a stated context, which is
 * deliberate, local and easy to find.
 *
 * So the rule is: a class claimed outright in one stylesheet must not be owned
 * by another.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

interface Usage {
  /** Classes this file claims outright, with a bare `.foo { … }` rule. */
  readonly defines: Set<string>;
  /**
   * Classes this file treats as containers of its own — the leftmost compound
   * of a descendant selector, as in `.iris-stack > * + *`.
   *
   * A file that scopes *into* a class is asserting ownership of it just as
   * firmly as one that styles it directly, and that is the pairing every real
   * collision here had: one file owning the container, another writing a bare
   * rule for the same name.
   */
  readonly scopeRoots: Set<string>;
}

function usageIn(file: string): Usage {
  const css = readFileSync(join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const defines = new Set<string>();
  const scopeRoots = new Set<string>();

  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1];
    if (prelude === undefined) continue;

    for (const selector of prelude.split(",")) {
      const trimmed = selector.trim();
      // At-rule preludes (`@media …`, `@container …`) are not selectors.
      if (trimmed.length === 0 || trimmed.startsWith("@")) continue;

      // `:has(.foo)` names a class without scoping into it structurally.
      const structural = trimmed.replace(/:has\([^)]*\)/g, "");
      const compounds = structural.split(/[\s>+~]+/).filter(Boolean);

      if (compounds.length === 1) {
        const name = /^\.([a-zA-Z][\w-]*)/.exec(compounds[0] ?? "")?.[1];
        if (name !== undefined) defines.add(name);
        continue;
      }

      const root = /^\.([a-zA-Z][\w-]*)/.exec(compounds[0] ?? "")?.[1];
      if (root !== undefined) scopeRoots.add(root);
    }
  }

  return { defines, scopeRoots };
}

/*
 * The one legitimate reason for a class to be defined twice.
 *
 * `showroom.css` is an override layer over `iris.css`: it restyles the shell
 * for the analytical surfaces and is loaded after it on purpose. Redefining a
 * class there is the point of the file.
 */
const OVERRIDES: Readonly<Record<string, string>> = {
  "showroom.css": "iris.css",
};

function mayRedefine(file: string, owner: string): boolean {
  return OVERRIDES[file] === owner || OVERRIDES[owner] === file;
}

describe("stylesheet class names", () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".css"));

  it("has stylesheets to check", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("never claims a name another stylesheet owns", () => {
    const usage = new Map(files.map((f) => [f, usageIn(f)] as const));
    const clashes: string[] = [];

    for (const [file, own] of usage) {
      for (const name of own.defines) {
        for (const [other, theirs] of usage) {
          if (other === file || mayRedefine(file, other)) continue;
          // Owned there either outright, or as a container scoped into.
          if (!theirs.defines.has(name) && !theirs.scopeRoots.has(name)) continue;

          clashes.push(`.${name} is claimed by ${file} and already owned by ${other}`);
        }
      }
    }

    expect([...new Set(clashes)], [...new Set(clashes)].join("\n")).toEqual([]);
  });
});
