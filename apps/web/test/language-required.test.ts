import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LANGUAGE IS PASSED, NEVER ASSUMED (LANG1, 2026-09-30).
 *
 * Sixty places used to read English when nobody said which language: 28
 * parameter defaults, 18 prop defaults and 14 `??` fallbacks on a field the
 * type already required. They existed because twenty test suites forced a
 * partial `ViewContext` through a cast, and the fallbacks kept those suites
 * green while a Slovak or Hungarian report could quietly print an English word.
 *
 * All of it is gone, and this keeps it gone. A default or a fallback on the
 * language, or a cast that builds a context or a query without one, fails here.
 * No exception is allowed today: every request carries a language, so there is
 * no place where one can honestly arrive empty.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const TREES = ["apps/web/src", "apps/web/test", "packages"];
const SELF = relative(ROOT, import.meta.filename);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** The code, without what is written about it: the helper's own comment names the old casts. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const FORBIDDEN: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  /* `= DEFAULT_LANGUAGE`, but not `=== DEFAULT_LANGUAGE` or `!== DEFAULT_LANGUAGE`. */
  { name: "a default of DEFAULT_LANGUAGE", pattern: /(?<![=!<>])=\s*DEFAULT_LANGUAGE\b/ },
  { name: "a fallback to DEFAULT_LANGUAGE", pattern: /\?\?\s*DEFAULT_LANGUAGE\b/ },
  { name: "a cast to ViewContext", pattern: /\bas\s+(unknown\s+as\s+)?ViewContext\b/ },
  { name: "a cast to OverviewQuery", pattern: /\bas\s+(unknown\s+as\s+)?OverviewQuery\b/ },
];

describe("the language is passed, never assumed", () => {
  const files = TREES.flatMap((tree) => sourceFiles(join(ROOT, tree))).filter(
    (path) => relative(ROOT, path) !== SELF,
  );

  it("reads the source and the tests of the application and every package", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((path) => path.includes(join("packages", "synthetic", "test")))).toBe(true);
  });

  it.each(FORBIDDEN)("finds no $name", ({ pattern }) => {
    const found = files.flatMap((path) =>
      codeOf(path)
        .split("\n")
        .flatMap((line, i) => (pattern.test(line) ? [`${relative(ROOT, path)}:${i + 1}`] : [])),
    );
    expect(found).toEqual([]);
  });
});
