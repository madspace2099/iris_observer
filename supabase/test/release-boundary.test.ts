import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LINE BETWEEN THE PORTABLE SUITE AND THE RELEASE GATE, HELD BY LOCATION.
 *
 * Decided 2026-09-27, after CI failed round after round on one missing release
 * artefact at a time: `pnpm test` is what passes on any fresh clone, and
 * `pnpm test:release` is the release gate, which needs the prepared release
 * workspace (`.release/` gate records, the delivered archives in `_review/`).
 * A test's directory decides which it is. This file keeps a test that needs
 * the workspace from landing in the portable suite, where CI would fail on it
 * and a local run would pass on whatever this machine happens to hold.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const RELEASE = join("supabase", "test", "release");

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === "node_modules") return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

/** Every test file the portable suite collects, by the roots `vitest.config.ts` includes. */
const portable = ["packages", "apps", join("supabase", "test")]
  .flatMap((root) => walk(join(ROOT, root)))
  .filter((path) => path.endsWith(".test.ts"))
  .map((path) => relative(ROOT, path))
  .filter((path) => !path.startsWith(RELEASE + sep))
  .filter((path) => path !== join("supabase", "test", "release-boundary.test.ts"));

describe("the release boundary", () => {
  it("has portable tests and release tests to separate", () => {
    expect(portable.length).toBeGreaterThan(100);
    expect(walk(join(ROOT, RELEASE)).filter((p) => p.endsWith(".test.ts")).length).toBe(4);
  });

  it("keeps every package build out of the portable suite", () => {
    /*
     * A real build, under the suite's own gate record: it renders the evidence,
     * which names `.release/` records. Opening a package operation without
     * building (the mutex cases) and a build that refuses first stay portable.
     */
    const building = portable.filter((path) =>
      /gateRecordRoot:/.test(readFileSync(join(ROOT, path), "utf8")),
    );
    expect(building, "builds a package outside supabase/test/release/").toEqual([]);
  });

  it("keeps every read of a delivered archive out of the portable suite", () => {
    /* This repository's own `_review/`; a synthetic one in a temporary directory stays portable. */
    const reading = portable.filter((path) =>
      /join\(ROOT, "_review"/.test(readFileSync(join(ROOT, path), "utf8")),
    );
    expect(reading, "reads a delivered archive outside supabase/test/release/").toEqual([]);
  });

  it("is drawn by the configuration, not by a flag", () => {
    const base = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
    const release = readFileSync(join(ROOT, "vitest.release.config.ts"), "utf8");
    expect(base).toContain('"supabase/test/release/**"');
    expect(release).toContain('include: ["supabase/test/release/**/*.test.ts"]');
  });
});
