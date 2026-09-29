import { readFileSync, mkdtempSync, cpSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanDirectory } from "../../../scripts/release/control-chars";
import { HISTORICAL_CONTROL_CHAR_COMMITS } from "../../../scripts/release/transport-safe";
import { build } from "../../../scripts/release/build-package";
import { walk } from "../../../scripts/release/zip";
import { openPackageOperation, type TestPackageOperation } from "../support/package-operation";

/**
 * A RELEASE SUITE: it needs the prepared release workspace, and runs only under
 * `pnpm test:release`.
 *
 * One package built, then a control character injected into each kind of staged
 * file. The build needs the release workspace; the scanners it exercises are
 * tested portably in `../control-chars.test.ts`.
 *
 * Everything under `supabase/test/release/` is excluded from `pnpm test` and
 * from CI by its location, not by a flag (`vitest.release.config.ts`). Moved
 * here on 2026-09-27 from the portable suite, where a fresh clone could never
 * pass it: see `docs/23-phase2-acceptance.md` on the two numbers.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const BS = String.fromCharCode(8);

const scratch = mkdtempSync(join(tmpdir(), "observer-controlchars-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * The packager must refuse a control character wherever it enters.
 *
 * Injected AFTER staging, so each case exercises the package-level scan rather
 * than the tracked-file gate — which is the whole point: the tracked gate
 * cannot see a patch, a rendered evidence file, the staged gate record or a
 * copied generator, because none of them exists when it runs.
 */
/*
 * NO GUARD ON A REAL GATE RECORD.
 *
 * These used to be skipped unless a current green `.release/gate-results.json`
 * already existed — which only happens after that commit's gate has finished,
 * so a fresh commit's own gate skipped the tests that verify its packager. The
 * suite owns its evidence now: a synthetic record in its own temporary root,
 * checked by the same contract a real record goes through.
 */
describe("the packager refuses an injected character", () => {
  const fullHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const shortHead = fullHead.slice(0, 7);

  /**
   * ONE build, then a private copy per test.
   *
   * The comment here used to say "build once … one build serves every case"
   * while `stagedDir()` called `build()` on every invocation — seven complete
   * package builds in one file, each `git format-patch` over the whole chain
   * plus staging, rendering, checking and deflating every file. Alone each
   * takes 8 to 18 seconds; under the full suite the first one measured 49.5s
   * against the 30-second `testTimeout` set for the PGlite fixtures, and the
   * gate recorded three genuine failures. The comment described the intent and
   * the code did the opposite, which is the drift this release keeps finding.
   *
   * So: build once in a hook with a budget that fits the work, and give every
   * test its own temporary root copied from it. No test rebuilds, no two tests
   * share a path, and each test's cleanup can only touch its own directory —
   * so nothing a parallel worker does can delete or replace another's files.
   */
  let pristine = "";
  const mine: string[] = [];

  /* The suite's own gate evidence AND its own package operation, in its own root. */
  let owned: TestPackageOperation | undefined;

  beforeAll(() => {
    owned = openPackageOperation(scratch, fullHead);
    const out = join(scratch, "pristine");
    build(out, { gateRecordRoot: owned.root, operation: owned.operation });
    pristine = join(out, shortHead);
  }, 240_000);

  afterAll(() => {
    owned?.close();
    for (const dir of mine) rmSync(dir, { recursive: true, force: true });
  });

  /** A private, writable copy of the staged package for one test. */
  const stagedDir = (): string => {
    const dir = mkdtempSync(join(scratch, "case-"));
    cpSync(pristine, dir, { recursive: true });
    mine.push(dir);
    return dir;
  };

  it.each([
    ["a rendered evidence file", "REVIEW.txt"],
    ["the staged gate record", "gate-results.json"],
    ["a staged generator file", "generators/facts.ts"],
    ["the manifest", "hashes.txt"],
  ])("refuses %s", (_why, relativePath) => {
    const dir = stagedDir();

    /*
     * WHICH FILE, NOT MERELY HOW MANY.
     *
     * This assertion failed once, in one run, and never again — not in
     * isolation, not in the full suite, not under the exact pair that produced
     * it. What it reported was "expected 1 to be 0", which names no file and
     * distinguishes nothing, so the one observation could not be classified.
     *
     * Nothing asserted here has changed. What is added is the evidence a
     * recurrence would need: the complete structured scan of the pristine copy,
     * so a second occurrence says which staged file carried the byte instead of
     * only that one did.
     */
    const before = scanDirectory(dir);
    expect(
      before.foundCharacters,
      `the pristine staged copy is not clean: ${JSON.stringify({
        found: before.foundCharacters,
        affected: before.affectedFiles,
        requested: before.requestedFiles,
        scanned: before.scannedFiles,
        unreadable: before.unreadableFiles,
        failures: before.readFailures,
      })}`,
    ).toBe(0);
    /* The scan must also be COMPLETE, or "clean" means "did not look". */
    expect(before.scannedFiles).toBe(before.requestedFiles);
    expect(before.readFailures).toBe(0);

    appendFileSync(join(dir, relativePath), `${BS}\n`);
    const scan = scanDirectory(dir);
    expect(scan.foundCharacters).toBeGreaterThan(0);
    expect(scan.affectedFiles).toContain(relativePath);
    /* And the injection did not make the scanner lose sight of anything. */
    expect(scan.scannedFiles).toBe(scan.requestedFiles);
    expect(scan.readFailures).toBe(0);
  });

  it("refuses a generated patch", () => {
    const dir = stagedDir();
    const patch = walk(join(dir, "patches"))
      .map((p) => p.split(/[\\/]/).pop() ?? "")
      .find((n) => n.endsWith(".patch"));
    expect(patch, "no raw patch in the package").toBeDefined();
    appendFileSync(join(dir, "patches", patch ?? ""), `${BS}\n`);
    const scan = scanDirectory(dir);
    expect(scan.foundCharacters).toBeGreaterThan(0);
    expect(scan.affectedFiles.join(" ")).toContain(patch ?? "");
  });

  it("ships the declared patches encoded, and the archive holds no control byte", () => {
    const dir = stagedDir();
    const names = walk(dir).map((p) => p.split(/[\\/]/).pop() ?? "");
    expect(names.filter((n) => n.endsWith(".patch.base64")).length).toBe(
      HISTORICAL_CONTROL_CHAR_COMMITS.length,
    );
    expect(names).toContain("TRANSPORT-SAFE.txt");
    expect(scanDirectory(dir)).toMatchObject({ foundCharacters: 0, affectedFiles: [] });
  });

  it("the encoded sidecars decode to the exact patch git produces", () => {
    const dir = stagedDir();
    const note = readFileSync(join(dir, "patches", "TRANSPORT-SAFE.txt"), "utf8");
    expect(note).toMatch(/NOT DIRECTLY `?git am`? APPLICABLE/i);
    expect(note).toMatch(/base64 -d/);

    const fresh = mkdtempSync(join(tmpdir(), "observer-patches-"));
    execFileSync("git", ["format-patch", "1ee5d2d..HEAD", "-o", fresh, "--no-signature", "-q"], {
      cwd: ROOT,
    });
    for (const encoded of walk(join(dir, "patches")).filter((p) => p.endsWith(".base64"))) {
      const name = (encoded.split(/[\\/]/).pop() ?? "").replace(/\.base64$/, "");
      const decoded = Buffer.from(readFileSync(encoded, "utf8"), "base64");
      expect(decoded.equals(readFileSync(join(fresh, name))), name).toBe(true);
    }
    rmSync(fresh, { recursive: true, force: true });
  });
});
