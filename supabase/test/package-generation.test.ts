import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  build,
  packagingProblems,
  type PreconditionInput,
} from "../../scripts/release/build-package";
import { walk } from "../../scripts/release/zip";
import { openPackageOperation, type TestPackageOperation } from "./support/package-operation";

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

const HEAD_FIXTURE = "2222222222222222222222222222222222222222";

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

  beforeAll(() => {
    owned = openPackageOperation(scratch, fullHead);
    first = build(join(scratch, "a"), {
      gateRecordRoot: owned.root,
      operation: owned.operation,
    });
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

  /*
   * The dirty-tree and missing-evidence refusals, as data.
   *
   * These used to be `it.runIf(!clean)` — a test that ran only when the
   * developer happened to have uncommitted work, which is to say never during a
   * release gate, which is precisely when it mattered. The refusal logic is now
   * a pure function over its three inputs, so each state is reachable from a
   * literal instead of from the state of somebody's checkout.
   */
  describe("its preconditions, evaluated from inputs rather than from the world", () => {
    const clean: PreconditionInput = {
      head: HEAD_FIXTURE,
      expectedHead: undefined,
      dirty: [],
      gateProblems: [],
      lockProblems: [],
      treeProblems: [],
    };

    it("permits packaging when every precondition holds", () => {
      expect(packagingProblems(clean)).toEqual([]);
    });

    it("refuses while the working tree is dirty, naming the files", () => {
      const problems = packagingProblems({
        ...clean,
        dirty: [" M supabase/test/package-generation.test.ts", "?? notes.txt"],
      });
      expect(problems.join("\n")).toMatch(/working tree is not clean/);
      expect(problems.join("\n")).toMatch(/notes\.txt/);
    });

    it("refuses when HEAD is not the pinned commit", () => {
      expect(packagingProblems({ ...clean, expectedHead: "0000000" }).join("\n")).toMatch(
        /not the expected 0000000/,
      );
    });

    it("accepts a pinned prefix of the real HEAD", () => {
      expect(packagingProblems({ ...clean, expectedHead: HEAD_FIXTURE.slice(0, 7) })).toEqual([]);
    });

    it("treats an empty pin as no pin, not as a mismatch", () => {
      expect(packagingProblems({ ...clean, expectedHead: "" })).toEqual([]);
    });

    it("refuses on gate problems, and says how to produce evidence", () => {
      const problems = packagingProblems({ ...clean, gateProblems: ["no gate record"] });
      expect(problems.join("\n")).toMatch(/gate record is not current and clean/);
      expect(problems.join("\n")).toMatch(/pnpm release:gates/);
    });

    it("reports the wrong commit before the unrelated dirty files", () => {
      /* A caller who named the wrong commit wants to hear THAT first. */
      const problems = packagingProblems({
        ...clean,
        expectedHead: "0000000",
        dirty: [" M a.txt"],
        gateProblems: ["no gate record"],
      });
      expect(problems).toHaveLength(3);
      expect(problems[0]).toMatch(/not the expected/);
    });
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
     * It writes one, obviously — and now it also VERIFIES the one it wrote,
     * with the tools a reviewer would use. That is not the defect this guards
     * against. The defect was that the previous packager READ seven DELIVERED
     * archives, to recover a hash whose source was not tracked, so a fresh
     * clone could not rebuild the package at all.
     *
     * So the ban is on reading an archive as an INPUT: the only archive named
     * anywhere in this file is the one this run just produced.
     */
    const source = readFileSync(join(ROOT, "scripts/release/build-package.ts"), "utf8");
    expect(source).not.toMatch(/readFileSync\([^)]*\.zip/);
    for (const [call] of source.matchAll(/execFileSync\("unzip",[^)]*\)/g)) {
      expect(call).toContain("first.archive");
    }
    for (const [call] of source.matchAll(/execFileSync\("sha256sum",[^)]*\)/g)) {
      expect(call).toContain("SHA256SUMS");
    }
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
