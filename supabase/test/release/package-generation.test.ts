import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../../../scripts/release/build-package";
import { walk } from "../../../scripts/release/zip";
import { openPackageOperation, type TestPackageOperation } from "../support/package-operation";

/**
 * A RELEASE SUITE: it needs the prepared release workspace, and runs only under
 * `pnpm test:release`.
 *
 * Two complete packages, built and compared. The packager renders the evidence
 * templates, and those name the gate records and the delivered archives under
 * `.release/` and `_review/` — gitignored, so a fresh clone refuses to build.
 *
 * Everything under `supabase/test/release/` is excluded from `pnpm test` and
 * from CI by its location, not by a flag (`vitest.release.config.ts`). Moved
 * here on 2026-09-27 from the portable suite, where a fresh clone could never
 * pass it: see `docs/23-phase2-acceptance.md` on the two numbers.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");

const scratch = mkdtempSync(join(tmpdir(), "observer-package-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const fullHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();

/*
 * NO GUARD ON A REAL GATE RECORD, and none on `_review/<head>` either.
 *
 * The old guard was circular: the packager refuses without a current green
 * record, the record only exists after the gate completes, so a fresh commit's
 * own gate skipped the fifteen tests that verify its packager. The suite owns
 * its evidence now — a synthetic record in its own temporary root, checked by
 * the same contract a real record goes through.
 */
describe("package generation", () => {
  /*
   * Built in a hook, not in the suite body: `describe.runIf` still evaluates
   * the callback in order to collect, so building here would run even when the
   * guard says not to.
   */
  let first!: ReturnType<typeof build>;
  let second!: ReturnType<typeof build>;

  /*
   * Its own budget, and this is the whole explanation of the "intermittent"
   * gate failure.
   *
   * Two complete package builds run here — `git format-patch` over the full
   * chain, every file staged, rendered, checked and deflated, twice, because
   * proving determinism needs two. Alone that takes about sixteen seconds.
   * Under the full suite, sharing CPU with eleven PGlite fixtures, it takes
   * longer than the global 30s `hookTimeout` that was set for those fixtures.
   *
   * A hook timeout fails the SUITE, not a test. Vitest then exits non-zero with
   * `numFailedTests: 0` — which is exactly the shape the gate kept recording,
   * and exactly why it looked like a runner-level fault rather than a test one.
   * It appeared intermittently when the suite was smaller and reliably once it
   * had grown, which is the signature of a budget being crossed rather than a
   * race being lost.
   */
  /*
   * A REAL PACKAGE OPERATION, in a temporary root this suite owns.
   *
   * `build()` may run only under one, and these builds were given none — so
   * every one of them refused at collection time. On a dirty tree the refusal
   * they hit first was the clean-tree one, which was expected, so the ownership
   * refusal underneath it stayed invisible until the authoritative gate at
   * `3094443` ran on a clean commit and this suite failed with zero failed
   * assertions.
   */
  let owned!: TestPackageOperation;

  beforeAll(async () => {
    owned = openPackageOperation(scratch, fullHead);
    first = build(join(scratch, "a"), {
      gateRecordRoot: owned.root,
      operation: owned.operation,
    });
    /*
     * LET THE EVENT LOOP TURN BETWEEN THE TWO BUILDS.
     *
     * `build()` is synchronous, and two back to back held this worker's event
     * loop for longer than the sixty seconds Vitest's worker-to-parent RPC
     * allows. The parent answers the in-flight `onTaskUpdate` at once, but a
     * blocked worker cannot read the answer, and when it resumes Node runs the
     * expired timer before the I/O that carries the reply — so the whole run
     * ended with `Timeout calling "onTaskUpdate"`, one unhandled error and
     * exit 1 beside 3249 passed tests. Reproduced on 2026-09-07 with a single
     * file, a single worker and a 65-second `Atomics.wait` in a hook, nothing
     * else running. The pause lets the reply land and the next update leave
     * before the second build; each build alone (about 32 seconds under the
     * four-worker suite) is well inside the deadline.
     */
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    second = build(join(scratch, "b"), {
      gateRecordRoot: owned.root,
      operation: owned.operation,
    });
  }, 240_000);

  afterAll(() => {
    owned.close();
  });

  it("produces byte-identical archives from a clean staging state, twice", () => {
    expect(second.sha).toBe(first.sha);
    expect(second.entries).toBe(first.entries);
  });

  it("puts every file in the manifest except the manifest itself", () => {
    expect(first.manifest).toBe(first.entries - 1);
  });

  it("names the archive from HEAD rather than from a constant", () => {
    const short = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    expect(first.archive).toContain(`IRIS-Observer-${short}-review.zip`);
  });

  describe("the manifest", () => {
    const find = (): string | undefined =>
      walk(join(scratch, "a")).find((p) => p.endsWith("hashes.txt"));
    const text = (): string => readFileSync(find() ?? "", "utf8");

    it("exists inside the staged package", () => {
      expect(find()).toBeDefined();
    });

    it("prefixes every prose line with '#', so a checker consumes it silently", () => {
      for (const [i, line] of text().split("\n").entries()) {
        if (line.trim() === "") continue;
        expect(/^([0-9a-f]{64} {2}\S|#)/.test(line), `line ${i + 1}: ${line}`).toBe(true);
      }
    });

    it("verifies with a standard checker and emits no warning", () => {
      const cwd = join(
        scratch,
        "a",
        execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
          cwd: ROOT,
          encoding: "utf8",
        }).trim(),
      );
      let stderr = "";
      let ok = true;
      try {
        execFileSync("sha256sum", ["-c", "hashes.txt"], {
          cwd,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (e) {
        ok = false;
        stderr = (e as { stderr?: string }).stderr ?? "";
      }
      expect(ok, stderr).toBe(true);
      expect(stderr).toBe("");
    });

    it("says the archive's own hash is deliberately not inside the archive", () => {
      expect(text()).toMatch(/cannot contain its own\n# digest/);
      expect(text()).toMatch(/ALONGSIDE the archive/);
    });

    it("does not claim the archive hash appears in REVIEW.txt", () => {
      /* It did, and it never could: embedding it changes the bytes it names. */
      expect(text()).not.toMatch(/hashed in REVIEW\.txt/);
    });
  });

  describe("the archive", () => {
    it("stores forward-slash entry names, in sorted order", () => {
      const listing = execFileSync("unzip", ["-Z1", first.archive], { encoding: "utf8" })
        .trim()
        .split("\n")
        .map((l) => l.trim());
      expect(listing.some((n) => n.includes("\\"))).toBe(false);
      expect(listing.some((n) => n.startsWith("patches/"))).toBe(true);
      expect([...listing].sort()).toEqual(listing);
    });

    it("passes an integrity test", () => {
      const out = execFileSync("unzip", ["-t", first.archive], { encoding: "utf8" });
      expect(out).toMatch(/No errors detected/);
    });

    it("hashes to what the packager reported", () => {
      expect(createHash("sha256").update(readFileSync(first.archive)).digest("hex")).toBe(
        first.sha,
      );
    });
  });

  describe("what it staged", () => {
    const staged = (): readonly string[] =>
      walk(join(scratch, "a")).map((p) => p.split(/[\\/]/).slice(-2).join("/"));

    it("includes the generators, so the sequence can be rerun from the package", () => {
      for (const f of [
        "build-package.ts",
        "facts.ts",
        "zip.ts",
        "secret-recipes.ts",
        "wrap-migration.ts",
      ]) {
        expect(staged(), f).toContain(`generators/${f}`);
      }
    });

    it("includes the evidence templates the generators read", () => {
      for (const f of [
        "REVIEW.txt",
        "PEPPER-CONTRACT.txt",
        "RETENTION-EVIDENCE.txt",
        "COMPATIBILITY-EVIDENCE.txt",
      ]) {
        expect(staged(), f).toContain(`generators/${f}`);
      }
    });

    it("includes every migration source and every paste wrapper", () => {
      const names = staged();
      expect(
        names.filter((n) => n.startsWith("supabase-migrations/")).length,
      ).toBeGreaterThanOrEqual(13);
      expect(names).toContain(
        "supabase-migrations/20260826090000_observer_audit_facade_cleanup.sql",
      );
    });
  });
});
