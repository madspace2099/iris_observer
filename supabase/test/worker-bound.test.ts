import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGLITE_SUITES } from "../../scripts/release/vitest-runner-reporter";

/**
 * The concurrency bound, and the things that must not quietly undo it.
 *
 * ## Why there is a bound at all
 *
 * Vitest's forks pool sizes itself from the CPU count. On a sixteen-core
 * machine that put thirteen workers to work, six of them each holding a WASM
 * Postgres of about a quarter of a gigabyte, and left the machine with a
 * megabyte free. Every worker reports progress to the parent over an RPC with
 * a deadline; when the parent could not answer inside it, Vitest recorded
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` as an unhandled error and
 * exited 1 — while its JSON report said 1265 passed and nothing failed.
 *
 * A bounded matrix measured the parent's worst event-loop stall at each worker
 * count. Four is the highest bound where every run came in far below every
 * default run, and it is also the fastest configuration measured.
 *
 * ## What these tests are for
 *
 * A configuration that is right today and silently wrong tomorrow is worse
 * than none, because the failure it prevents is intermittent and would be
 * blamed on the runner again. Everything below is derived from the repository
 * rather than restated in a constant, so adding a PGlite suite or removing the
 * bound fails here instead of surfacing months later as a flaky gate.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const CONFIG = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");

/**
 * Source with its comments removed.
 *
 * Every scan below is about what the code DOES, and a comment describing the
 * forbidden thing is not the forbidden thing — a distinction this repository
 * has had to make more than once, most recently when a control-character scan
 * flagged the paragraph explaining control characters.
 */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Where a suite that boots a WASM Postgres is allowed to live.
 *
 * Two directories, and the second one is the correction. This detector scanned
 * only `supabase/test`, so when six PGlite-booting suites appeared under
 * `packages/sources/test` the bound went from covering eight modules to
 * covering eight of fourteen — and every assertion below went on passing,
 * because it could not see the six.
 *
 * That is precisely the failure this file was written to prevent. Its own
 * opening says a configuration that is right today and silently wrong tomorrow
 * is worse than none; a detector that is right about one directory and silent
 * about another is the same thing wearing a test's clothes.
 */
const SUITE_DIRECTORIES = [
  join(ROOT, "supabase", "test"),
  join(ROOT, "packages", "sources", "test"),
] as const;

/**
 * Every test file that boots a WASM Postgres, from the files themselves.
 *
 * TWO SIGNALS, because there are now two ways to boot one. A suite in
 * `supabase/test` imports the package directly. A suite in `packages/sources`
 * cannot — the package is a root devDependency, not one of that workspace's —
 * so it reaches the same instance through `openDatabase` in the shared harness.
 * Matching only the direct import counts the second kind as zero.
 *
 * Both patterns are IMPORTS rather than substrings. This file names the package
 * inside its own detector and would otherwise find itself, which is the same
 * class of error as a scanner matching the comment that describes it.
 */
const BOOTS_PGLITE = [
  /^import[^;]*"@electric-sql\/pglite";$/m,
  /^import[\s\S]*?\bopenDatabase\b[\s\S]*?from\s+"[^"]*support\/pglite";$/m,
];

function pgliteSuitesOnDisk(): readonly string[] {
  return SUITE_DIRECTORIES.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts"))
      .filter((f) => {
        const source = readFileSync(join(dir, f), "utf8");
        return BOOTS_PGLITE.some((pattern) => pattern.test(source));
      }),
  ).sort();
}

/** The same files, with the directory that holds each — for the hook check. */
function pgliteSuitePaths(): readonly string[] {
  return SUITE_DIRECTORIES.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".test.ts"))
      .filter((f) => {
        const source = readFileSync(join(dir, f), "utf8");
        return BOOTS_PGLITE.some((pattern) => pattern.test(source));
      })
      .map((f) => join(dir, f)),
  ).sort();
}

describe("the worker bound is applied, and says why", () => {
  it("sets both bounds, because the forks pool honours them separately", () => {
    /*
     * `minWorkers` matters as much as `maxWorkers` here: the pool keeps that
     * many processes alive regardless of the maximum, so setting only the
     * ceiling leaves a floor at the default and the bound is not what it looks.
     */
    expect(CONFIG).toMatch(/maxWorkers:\s*4\b/);
    expect(CONFIG).toMatch(/minWorkers:\s*4\b/);
  });

  it("does not serialize the suite", () => {
    /*
     * Four is a bound, not a queue. A single worker was measured at 2.5x the
     * runtime, and the milestone that set this number forbids reaching for
     * serialisation before a smaller bound has been shown not to work.
     */
    const max = /maxWorkers:\s*(\d+)/.exec(CONFIG)?.[1];
    expect(Number(max)).toBeGreaterThan(1);
  });

  it("keeps file parallelism on", () => {
    expect(CONFIG).not.toMatch(/fileParallelism:\s*false/);
  });

  it("records the measurement rather than asserting the number", () => {
    /* A bare `maxWorkers: 4` invites someone to "tidy" it back to the default. */
    expect(CONFIG).toMatch(/728ms/);
    expect(CONFIG).toMatch(/onTaskUpdate/);
  });
});

describe("the PGlite suites cannot silently escape the bound", () => {
  it("the reporter's list is exactly the files that import PGlite", () => {
    /*
     * DERIVED, not restated. The concurrency figure the whole comparison rests
     * on is "how many PGlite-heavy modules ran at once", and it is counted by
     * matching module basenames against this list — so a new PGlite suite that
     * nobody added to it would be measured as zero and the bound would look
     * more effective than it is.
     */
    expect([...PGLITE_SUITES].sort()).toEqual(pgliteSuitesOnDisk());
  });

  it("finds the suites it claims to find", () => {
    expect(pgliteSuitesOnDisk().length).toBeGreaterThanOrEqual(6);
  });

  it("every one of them registers both cleanup hooks", () => {
    /*
     * Per-test databases close in `afterEach`, suite-scoped ones in `afterAll`.
     * A file that opens a database and registers neither leaks it for the whole
     * run, which is the condition the bound exists to keep bounded.
     */
    for (const path of pgliteSuitePaths()) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path}: afterEach(closeTestDatabases)`).toMatch(
        /afterEach\(closeTestDatabases\)/,
      );
      expect(source, `${path}: afterAll(closeSuiteDatabases)`).toMatch(
        /afterAll\(closeSuiteDatabases\)/,
      );
    }
  });

  it("none of them constructs a PGlite outside the owned factory", () => {
    /*
     * `new PGlite()` anywhere but `support/pglite.ts` is an instance nothing
     * will close, and nothing will count.
     */
    for (const path of pgliteSuitePaths()) {
      expect(code(readFileSync(path, "utf8")), path).not.toMatch(/new PGlite\(/);
    }
  });

  it("counts the suites that reach PGlite through the shared harness", () => {
    /*
     * The regression that motivated widening the detector. Six suites under
     * `packages/sources/test` boot a database through `openDatabase` without
     * importing the package — they cannot import it, it is a root
     * devDependency rather than one of that workspace's — and the original
     * detector, which matched only the direct import, counted every one of them
     * as zero.
     *
     * Asserted as a floor rather than an exact number so that adding a seventh
     * does not fail here for the wrong reason; the exact-list assertion above
     * is what catches an unregistered one.
     */
    const viaHarness = pgliteSuitePaths().filter((p) => p.includes("packages"));
    expect(viaHarness.length, "suites reaching PGlite through the harness").toBeGreaterThanOrEqual(
      5,
    );
  });
});

describe("the suite is neither split nor duplicated", () => {
  it("uses one project, so every test runs exactly once", () => {
    /*
     * A scoped-project configuration was considered and rejected: the global
     * bound is FASTER than the default, so there was nothing to buy with the
     * complexity, and projects are the mechanism by which a file gets included
     * twice or not at all.
     */
    expect(CONFIG).not.toMatch(/\bprojects\s*:/);
    expect(CONFIG).not.toMatch(/\bworkspace\s*:/);
  });

  it("collects each test file from exactly one include pattern", () => {
    const includes = /include:\s*\[([\s\S]*?)\]/.exec(CONFIG)?.[1] ?? "";
    const patterns = includes.match(/"[^"]+"/g) ?? [];
    expect(patterns.length).toBeGreaterThan(0);
    /* Distinct roots — no pattern can match a file another one already did. */
    const roots = patterns.map((p) => p.replace(/"/g, "").split("/")[0]);
    expect(new Set(roots).size).toBe(roots.length);
  });
});

describe("the only remaining skip is inapplicable by platform", () => {
  it("no suite skips on repository state", () => {
    /*
     * `it.runIf` on anything but the platform is how the skipped count came to
     * depend on whether a gitignored directory happened to exist, which made
     * the total undiagnosable. One platform skip remains and says so in its
     * own title.
     */
    const dir = join(ROOT, "supabase", "test");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".test.ts"))) {
      for (const [i, line] of readFileSync(join(dir, file), "utf8").split("\n").entries()) {
        /* Anchored, so the comment recording a removed guard is not one. */
        if (!/^\s*(it|describe)\.(runIf|skipIf)\(/.test(line)) continue;
        if (line.includes("process.platform")) continue;
        offenders.push(`${file}:${String(i + 1)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
