import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../../scripts/release/build-package";
import { walk } from "../../scripts/release/zip";
import { readGateRecord, gateRecordProblems } from "../../scripts/release/gate-contract";

/**
 * Package generation must be repeatable, and the manifest must be usable.
 *
 * The documented rebuild sequence could not be run twice. `bundle.mjs` began by
 * deleting the output directory — which held the other three generators and the
 * three hand-authored evidence files — and recreated none of them, so the
 * second command in the instructions no longer existed by the time a reader
 * reached it. It also hard-coded one machine's temporary path, required seven
 * earlier review archives to be present, and built the archive timestamp from
 * LOCAL-TIME accessors, so the "deterministic" output had different bytes under
 * different `TZ` settings while claiming otherwise.
 *
 * Everything here is checked against a temporary directory rather than
 * `_review/`, so running the suite never disturbs a delivered bundle.
 */

const ROOT = join(import.meta.dirname, "..", "..");

/*
 * The packager now REFUSES without a current, green gate record, so the build
 * fixtures below need one as well as a clean tree. Guarded rather than left to
 * throw in a hook: a hook failure fails the suite with zero failed assertions,
 * which is precisely the shape this milestone spent a round diagnosing.
 */
const gateRecordIsCurrent =
  gateRecordProblems(
    readGateRecord(join(import.meta.dirname, "..", "..")),
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: join(import.meta.dirname, "..", ".."),
      encoding: "utf8",
    }).trim(),
  ).length === 0;

const clean =
  execFileSync("git", ["status", "--porcelain=v1"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.includes(".release/")).length === 0;

const scratch = mkdtempSync(join(tmpdir(), "observer-package-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe.runIf(clean && gateRecordIsCurrent)("package generation", () => {
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
  beforeAll(() => {
    first = build(join(scratch, "a"));
    second = build(join(scratch, "b"));
  }, 240_000);

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

describe("package generation refuses rather than lying", () => {
  it("refuses when HEAD is not the expected commit", () => {
    const previous = process.env["RELEASE_EXPECT_HEAD"];
    process.env["RELEASE_EXPECT_HEAD"] = "0000000";
    try {
      expect(() => build(join(scratch, "refused"))).toThrow(/not the expected/);
    } finally {
      if (previous === undefined) delete process.env["RELEASE_EXPECT_HEAD"];
      else process.env["RELEASE_EXPECT_HEAD"] = previous;
    }
  });

  it.runIf(!clean)("refuses while the working tree is dirty", () => {
    expect(() => build(join(scratch, "dirty"))).toThrow(/working tree is not clean/);
  });

  it("uses the platform's temporary directory, not one machine's path", () => {
    const source = readFileSync(join(ROOT, "scripts/release/build-package.ts"), "utf8");
    expect(source).toMatch(/tmpdir\(\)/);
    expect(source).not.toMatch(/AppData|\/Users\/|C:\\/);
  });

  it("reads the archive timestamp through UTC accessors", () => {
    const source = readFileSync(join(ROOT, "scripts/release/zip.ts"), "utf8");
    expect(source).toMatch(/getUTCHours/);
    /* A local-time reading here is exactly what made the last claim false. */
    expect(source).not.toMatch(/when\.getHours\(\)|when\.getMonth\(\)|when\.getDate\(\)(?!.*UTC)/);
  });

  it("does not read an earlier review archive in order to run", () => {
    /*
     * It writes one, obviously. The defect was that the previous packager READ
     * seven of them — to recover a hash whose source was not tracked — so a
     * fresh clone could not rebuild the package at all.
     */
    const source = readFileSync(join(ROOT, "scripts/release/build-package.ts"), "utf8");
    expect(source).not.toMatch(/\bunzip\b/);
    expect(source).not.toMatch(/readFileSync\([^)]*\.zip/);
  });
});

describe("the previous generators are gone", () => {
  it.each(["bundle.mjs", "evidence.mjs", "package.mjs"])(
    "%s no longer exists at the repository root",
    (name) => {
      expect(existsSync(join(ROOT, ".tmp-gen", name))).toBe(false);
    },
  );
});
