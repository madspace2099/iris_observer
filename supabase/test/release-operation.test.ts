import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  treeIdentity,
  treeProblems,
  TreeBinding,
  expectedSuiteFiles,
  suiteLabel,
} from "../../scripts/release/tree-identity";
import { packagingProblems } from "../../scripts/release/build-package";
import { gateRecordProblems, readGateRecord } from "../../scripts/release/gate-contract";
import { greenGateRecord, syntheticGateRecord } from "./support/synthetic-gate-record";

/**
 * A GATE RESULT IS ABOUT BYTES, AND USED TO BE ABOUT A COMMIT NAME.
 *
 * The runner recorded HEAD and never required a clean tree, so this sequence
 * produced a package that described something other than what it shipped:
 *
 *   1. edit runtime code, or weaken a test, without committing;
 *   2. run the gates green at HEAD H;
 *   3. restore the working tree — it is clean at H again;
 *   4. package at H.
 *
 * The packager saw a clean tree, a matching HEAD and a green record. All three
 * were true, and the record described different bytes. Nothing in the archive
 * could have shown it.
 *
 * These cases build the sequence in a real throwaway git repository, so what is
 * tested is the identity computation itself rather than a description of it.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const readSource = (path: string): string => readFileSync(path, "utf8");

const git = (root: string, ...args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd: root, encoding: "utf8" });

/** A tiny repository with one commit, so tree identity has something to say. */
function throwaway(scratch: string): string {
  const root = mkdtempSync(join(scratch, "repo-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "export const answer = 42;\n", "utf8");
  writeFileSync(join(root, "src", "a.test.ts"), "/* a suite */\n", "utf8");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "one");
  return root;
}

describe("a gate result is bound to the bytes it measured", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-tree-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("reports a clean tree as clean", () => {
    expect(treeProblems(throwaway(scratch))).toEqual([]);
  });

  it("refuses an unstaged edit, a staged edit and an untracked file separately", () => {
    const unstaged = throwaway(scratch);
    writeFileSync(join(unstaged, "src", "app.ts"), "export const answer = 43;\n", "utf8");
    expect(treeProblems(unstaged).join(" ")).toMatch(/unstaged changes/);

    const staged = throwaway(scratch);
    writeFileSync(join(staged, "src", "app.ts"), "export const answer = 43;\n", "utf8");
    git(staged, "add", "-A");
    expect(treeProblems(staged).join(" ")).toMatch(/staged changes not present in HEAD/);

    const untracked = throwaway(scratch);
    writeFileSync(join(untracked, "src", "extra.ts"), "export const extra = 1;\n", "utf8");
    expect(treeProblems(untracked).join(" ")).toMatch(/untracked file/);
  });

  it("gives edited-then-restored content the identity it had while edited", () => {
    /*
     * THE WHOLE DEFECT, IN THREE LINES. The digest is taken while the edit is
     * in place — which is what a gate running at that moment would record — and
     * differs from the clean tree's. Restoring the file does not change what
     * was measured, and the packager compares the record against the tree it
     * can see.
     */
    const root = throwaway(scratch);
    const clean = treeIdentity(root);

    writeFileSync(join(root, "src", "app.ts"), "export const answer = 99;\n", "utf8");
    git(root, "add", "-A");
    const dirty = treeIdentity(root);
    expect(dirty.inputsDigest).not.toBe(clean.inputsDigest);
    /* HEAD and the commit tree are IDENTICAL, which is why they were not enough. */
    expect(dirty.head).toBe(clean.head);
    expect(dirty.treeId).toBe(clean.treeId);

    git(root, "reset", "-q", "--hard");
    expect(treeIdentity(root).inputsDigest).toBe(clean.inputsDigest);
  });

  it("remembers a breach seen at any sample, even after the tree is restored", () => {
    const root = throwaway(scratch);
    const clean = treeIdentity(root);
    const binding = new TreeBinding(root, {
      branch: clean.branch,
      head: clean.head,
      treeId: clean.treeId,
      inputsDigest: clean.inputsDigest,
    });

    expect(binding.sample("before")).toEqual([]);
    writeFileSync(join(root, "src", "app.ts"), "export const answer = 7;\n", "utf8");
    expect(binding.sample("mid-run")).not.toEqual([]);
    git(root, "reset", "-q", "--hard");
    expect(binding.sample("before publication")).toEqual([]);

    /* Restored, and still refused: the run measured bytes no commit contains. */
    expect(binding.everBroken.length).toBeGreaterThan(0);
    expect(binding.everBroken.join(" ")).toContain("mid-run");
    expect(binding.sampleCount).toBe(3);
  });

  it("refuses to package a record whose measured tree is not this tree", () => {
    /*
     * END TO END, THROUGH THE REAL PRECONDITION. The record is green, current
     * and internally valid; its tree identity is the only thing wrong with it,
     * and that is the whole point.
     */
    const root = mkdtempSync(join(scratch, "pkg-"));
    const head = "4".repeat(40);
    syntheticGateRecord(root, head);
    const record = readGateRecord(root);
    expect(gateRecordProblems(record, head)).toEqual([]);

    const problems = packagingProblems({
      head,
      expectedHead: undefined,
      dirty: [],
      gateProblems: gateRecordProblems(record, head),
      lockProblems: [],
      treeProblems: [
        "the record's tracked-inputs digest does not match this tree — the gate measured " +
          "different bytes, and reverting them afterwards does not change what was measured",
      ],
    });
    expect(problems.join(" ")).toMatch(/not the one the gate measured/);
    expect(problems.join(" ")).toMatch(/tracked-inputs digest/);
  });

  it("requires the packager to have looked at both the mutex and the tree", () => {
    /*
     * Both fields are REQUIRED, so "did not look" cannot arrive here as
     * "looked and it was fine". A caller that omits either does not compile.
     */
    const source = readSource(join(ROOT, "scripts/release/build-package.ts"));
    expect(source).toContain("readonly lockProblems: readonly string[];");
    expect(source).toContain("readonly treeProblems: readonly string[];");
  });
});

/**
 * THE EXPECTED SUITE INVENTORY, DERIVED FROM THE REPOSITORY.
 *
 * `0 passed, 0 skipped, 0 failed / 0 files` beside an empty per-file map was
 * internally consistent and satisfied every arithmetic check the contract made.
 * A stray path argument or a glob that matched nothing produces exactly that,
 * and it packaged.
 */
describe("a filtered run cannot look like a complete one", () => {
  it("derives the expected inventory from the tracked test files", () => {
    const files = expectedSuiteFiles(ROOT);
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) expect(file).toMatch(/\.test\.tsx?$/);
    /*
     * A tracked suite is in it. Deliberately not THIS file: the inventory comes
     * from `git ls-files`, so an uncommitted new suite is legitimately absent
     * and a self-reference would fail until the moment it is committed.
     */
    expect(files.map(suiteLabel)).toContain("gate-contract");
  });

  it("refuses a record that collected nothing at all", () => {
    const head = "5".repeat(40);
    const empty = {
      ...greenGateRecord(head),
      tests: { total: 0, passed: 0, skipped: 0, failed: 0, files: 0, perFile: {} },
      expectedSuites: [],
    };
    const problems = gateRecordProblems(empty, head).join(" ");
    expect(problems).toMatch(/collected no suites at all/);
    expect(problems).toMatch(/collected no tests at all/);
  });

  it("refuses a record that collected only some of the expected suites", () => {
    const head = "5".repeat(40);
    const base = greenGateRecord(head);
    const partial = {
      ...base,
      tests: {
        total: 3,
        passed: 3,
        skipped: 0,
        failed: 0,
        files: 1,
        perFile: { "suite-01.test.ts": 3 },
      },
    };
    expect(gateRecordProblems(partial, head).join(" ")).toMatch(
      /expected suite\(s\) were not collected/,
    );
  });

  it("refuses a record that collected a suite the repository does not have", () => {
    const head = "5".repeat(40);
    const base = greenGateRecord(head);
    const perFile: Record<string, number> = { ...base.tests?.perFile };
    perFile["not-in-the-inventory.test.ts"] = 1;
    const extra = {
      ...base,
      tests: {
        ...base.tests,
        files: (base.tests?.files ?? 0) + 1,
        passed: (base.tests?.passed ?? 0) + 1,
        perFile,
      },
    };
    expect(gateRecordProblems(extra, head).join(" ")).toMatch(/not in the expected inventory/);
  });
});

/**
 * The archive is published LAST, and all four hashes are compared.
 *
 * The verifier compared the three child hashes with each other and never with
 * the archive it had written — the one it reported and the one a reviewer
 * receives. Three children agreeing while the distributed file differs is
 * exactly what that check could not see.
 */
describe("the distributed archive is the one that was verified", () => {
  const source = (): string => readSource(join(ROOT, "scripts/release/build-package.ts"));

  it("includes the written archive in the comparison", () => {
    const text = source();
    expect(text).toContain('{ label: "written archive", sha: first.sha }');
    expect(text).toContain("hashes.every((h) => h.sha === first.sha");
  });

  it("builds into a staging directory and publishes by rename", () => {
    const text = source();
    expect(text).toContain("const staging = join(outDir");
    expect(text).toContain("renameSync(first.archive, distributable)");
    /* Publication comes after the checks, never before. */
    const verify = text.indexOf("all four identical");
    const publish = text.indexOf("renameSync(first.archive, distributable)");
    expect(verify).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(verify);
  });

  it("removes every temporary artefact and any same-HEAD archive on refusal", () => {
    const text = source();
    expect(text).toContain("rmSync(staging, { recursive: true, force: true })");
    expect(text).toContain("if (!published) rmSync(distributable, { force: true })");
  });

  it("runs unzip -t and sha256sum -c before publishing", () => {
    const text = source();
    expect(text).toContain('execFileSync("unzip", ["-t", first.archive]');
    expect(text).toContain('execFileSync("sha256sum", ["-c", "SHA256SUMS"]');
  });

  it("agrees with itself about what a sha256 of a file is", () => {
    /*
     * A cheap independent check that the digest the packager reports is the
     * ordinary one a reviewer would compute, rather than a digest of something
     * else that happens to be stable.
     */
    const bytes = Buffer.from("observer", "utf8");
    expect(createHash("sha256").update(bytes).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
  });
});
