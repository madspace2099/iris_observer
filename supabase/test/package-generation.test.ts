import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import {
  build,
  packagingProblems,
  type PreconditionInput,
} from "../../scripts/release/build-package";

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

/* The two complete builds moved to `release/package-generation.test.ts` (2026-09-27). */
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
    /*
     * The integrity checks run through ONE routine now, applied twice: to the
     * archive this build wrote, and to the file at the canonical path after
     * publication. Its parameter is named `archive`, and the only two call
     * sites pass `first.archive` and `distributable` — both this run's own
     * bytes. No delivered archive is an input to either.
     */
    for (const [call] of source.matchAll(/execFileSync\("unzip",[^)]*\)/g)) {
      expect(call).toMatch(/\barchive\b/);
    }
    /* Call sites only: the first match is the declaration of the routine. */
    const integrityCalls = [...source.matchAll(/verifyArchiveIntegrity\(([A-Za-z][\w.]*),/g)].map(
      (m) => m[1],
    );
    expect(integrityCalls).toEqual(["first.archive", "distributable"]);

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
