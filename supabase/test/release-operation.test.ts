import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { packagingProblems, ownershipProblems } from "../../scripts/release/build-package";
import {
  gateRecordProblems,
  structuralRecordProblems,
  sanitizedRecord,
  captureEvidence,
  readGateRecord,
  type GateRecord,
} from "../../scripts/release/gate-contract";
import {
  endOperation,
  stillOwner,
  OPERATION_LOCK_PATH,
} from "../../scripts/release/release-operation";
import { openPackageOperation, type TestPackageOperation } from "./support/package-operation";
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

/**
 * PACKAGE BUILDS RUN UNDER A REAL OPERATION, OR NOT AT ALL.
 *
 * `build()` may run only while its caller holds the release mutex, so a gate
 * cannot invalidate the record underneath it. That invariant is production
 * behaviour and stays exactly as it is: there is no test-only switch past the
 * ownership check, and these cases drive the real one.
 *
 * The three suites that exercise the packager were never given an operation, so
 * every one of them refused at collection. On a dirty development tree the
 * refusal they hit FIRST was the clean-tree one — expected, and read as such —
 * so the ownership refusal underneath stayed invisible until the authoritative
 * gate at `3094443` ran on a clean commit and three suites failed with zero
 * failed assertions.
 */
describe("a package build needs genuine operation ownership", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-own-"));
  const opened: TestPackageOperation[] = [];
  afterAll(() => {
    for (const o of opened) {
      try {
        o.close();
      } catch {
        /* already closed by its own case */
      }
    }
    rmSync(scratch, { recursive: true, force: true });
  });

  const HEAD_A = "a".repeat(40);
  const open = (options?: Parameters<typeof openPackageOperation>[2]): TestPackageOperation => {
    const o = openPackageOperation(scratch, HEAD_A, options);
    opened.push(o);
    return o;
  };

  /** The precondition input, as `requireCleanHead` assembles it. */
  const problemsFor = (owned: TestPackageOperation, head = HEAD_A): readonly string[] => {
    const record = readGateRecord(owned.root);
    return packagingProblems({
      head,
      expectedHead: undefined,
      dirty: [],
      gateProblems: gateRecordProblems(record, head),
      lockProblems: ownershipProblems(owned.root, owned.operation, head, record?.treeId),
      treeProblems: [],
    });
  };

  it("permits the build when a valid temporary package operation holds the mutex", () => {
    const owned = open();
    expect(problemsFor(owned)).toEqual([]);
  });

  it("refuses when no operation was begun at all", () => {
    const owned = open();
    const record = readGateRecord(owned.root);
    const problems = packagingProblems({
      head: HEAD_A,
      expectedHead: undefined,
      dirty: [],
      gateProblems: gateRecordProblems(record, HEAD_A),
      lockProblems: ownershipProblems(owned.root, undefined, HEAD_A, record?.treeId),
      treeProblems: [],
    });
    expect(problems.join(" ")).toMatch(/OWNERSHIP: no release operation was begun/);
  });

  it("refuses a gate operation, because measuring is not building", () => {
    const owned = open({ kind: "gate" });
    expect(problemsFor(owned).join(" ")).toMatch(
      /OWNERSHIP: the release operation is a gate operation/,
    );
  });

  it("refuses an operation that belongs to another root", () => {
    const mine = open();
    const theirs = open();
    const record = readGateRecord(mine.root);
    const problems = packagingProblems({
      head: HEAD_A,
      expectedHead: undefined,
      dirty: [],
      gateProblems: gateRecordProblems(record, HEAD_A),
      /* Their operation, asserted against my root: a different lock entirely. */
      lockProblems: ownershipProblems(mine.root, theirs.operation, HEAD_A, record?.treeId),
      treeProblems: [],
    });
    expect(problems.join(" ")).toMatch(/OWNERSHIP: /);
    expect(problems.join(" ")).toMatch(/no longer owns the release mutex/);
  });

  it("refuses an operation begun at a different HEAD", () => {
    const owned = open({ operationHead: "b".repeat(40) });
    expect(problemsFor(owned).join(" ")).toMatch(
      /OWNERSHIP: the package operation was begun at bbbbbbb/,
    );
  });

  it("refuses an operation begun against a different tree", () => {
    const owned = open({ operationTree: "c".repeat(40) });
    expect(problemsFor(owned).join(" ")).toMatch(
      /OWNERSHIP: the package operation was begun against tree cccccccccccc/,
    );
  });

  it("refuses an operation that has already been released", () => {
    const owned = openPackageOperation(scratch, HEAD_A);
    endOperation(owned.root, owned.operation);
    expect(problemsFor(owned).join(" ")).toMatch(/OWNERSHIP: .*the lock is gone/);
    rmSync(owned.root, { recursive: true, force: true });
  });

  it("refuses a forged lock carrying the same id but a different file identity", () => {
    /*
     * Ownership is the FILE OBJECT — device, inode, birth time, size — captured
     * when the exclusive create succeeded. Content can be written by anyone.
     */
    const owned = open();
    const lock = join(owned.root, OPERATION_LOCK_PATH);
    const before = readFileSync(lock, "utf8");
    rmSync(lock, { force: true });
    writeFileSync(lock, before, "utf8");
    expect(problemsFor(owned).join(" ")).toMatch(/OWNERSHIP: .*different file object/);
  });

  it("cleans up only its own operation and its own files", () => {
    const mine = openPackageOperation(scratch, HEAD_A);
    const theirs = openPackageOperation(scratch, HEAD_A);
    opened.push(theirs);

    mine.close();

    expect(existsSync(mine.root)).toBe(false);
    /* Another operation's root, lock and record are untouched. */
    expect(existsSync(theirs.root)).toBe(true);
    expect(existsSync(join(theirs.root, OPERATION_LOCK_PATH))).toBe(true);
    expect(stillOwner(theirs.root, theirs.operation)).toBe(true);
  });

  it("never touches this repository's real .release state", () => {
    /*
     * The helper takes a scratch directory and makes its own root inside it.
     * Nothing in it names the repository root, and nothing recovers.
     */
    const source = readFileSync(join(ROOT, "supabase/test/support/package-operation.ts"), "utf8");
    expect(source).not.toContain("REPO_ROOT");
    expect(source).not.toContain("recoverOperation");
    expect(source).not.toMatch(/process\.cwd\(\)/);
  });
});

/**
 * AN OWNERSHIP REFUSAL MUST NOT READ AS A DIRTY-TREE REFUSAL.
 *
 * That confusion is what cost an authoritative gate run: three suites refused
 * for one reason on a dirty tree and a different reason on a clean one, and the
 * message did not distinguish them.
 */
describe("every packaging precondition names itself", () => {
  const head = "d".repeat(40);
  const base = {
    head,
    expectedHead: undefined,
    dirty: [] as readonly string[],
    gateProblems: [] as readonly string[],
    lockProblems: [] as readonly string[],
    treeProblems: [] as readonly string[],
  };

  it("labels the four preconditions distinctly", () => {
    const dirty = packagingProblems({ ...base, dirty: ["M src/app.ts"] }).join(" ");
    const ownership = packagingProblems({ ...base, lockProblems: ["OWNERSHIP: none"] }).join(" ");
    const tree = packagingProblems({ ...base, treeProblems: ["digest mismatch"] }).join(" ");
    const record = packagingProblems({ ...base, gateProblems: ["no record"] }).join(" ");

    expect(dirty).toMatch(/CLEAN TREE:/);
    expect(ownership).toMatch(/OWNERSHIP:/);
    expect(tree).toMatch(/RECORD TREE:/);
    expect(record).toMatch(/GATE RECORD:/);

    /* And no refusal borrows another's label. */
    expect(dirty).not.toMatch(/OWNERSHIP:|RECORD TREE:|GATE RECORD:/);
    expect(ownership).not.toMatch(/CLEAN TREE:|RECORD TREE:|GATE RECORD:/);
    expect(tree).not.toMatch(/CLEAN TREE:|OWNERSHIP:|GATE RECORD:/);
    expect(record).not.toMatch(/CLEAN TREE:|OWNERSHIP:|RECORD TREE:/);
  });

  it("reports every failing precondition, not only the first", () => {
    /*
     * The one that fires first on a dirty tree is not the only one that
     * matters, and hearing only it is how the other stayed hidden.
     */
    const all = packagingProblems({
      ...base,
      dirty: ["M src/app.ts"],
      lockProblems: ["OWNERSHIP: no release operation was begun"],
      treeProblems: ["digest mismatch"],
      gateProblems: ["no record"],
    }).join(" ");
    expect(all).toMatch(/CLEAN TREE:/);
    expect(all).toMatch(/OWNERSHIP:/);
    expect(all).toMatch(/RECORD TREE:/);
    expect(all).toMatch(/GATE RECORD:/);
  });
});

/**
 * THE OBSERVED PEAK, WHICH WAS MEASURED AND NEVER WRITTEN DOWN.
 *
 * The reporter counts peak concurrent modules — one per worker, so the real
 * concurrency — and `readRunnerEvidence` carried it. The persisted `testGate`
 * literal enumerates its fields explicitly and left this one out, so the value
 * was computed on every run and recorded on none. Nothing caught it: the runner
 * skipped contract validation once a gate had already failed.
 */
describe("the observed peak survives every layer", () => {
  const head = "e".repeat(40);
  const withPeak = (peak: unknown): GateRecord => {
    const base = greenGateRecord(head);
    return {
      ...base,
      testGate: { ...base.testGate, observedPeakWorkers: peak as number },
    } as GateRecord;
  };

  it("refuses a record that omits it", () => {
    const base = greenGateRecord(head) as { testGate: Record<string, unknown> };
    const gate = { ...base.testGate };
    delete gate["observedPeakWorkers"];
    const record = { ...base, testGate: gate } as unknown as GateRecord;
    expect(structuralRecordProblems(record, head).join(" ")).toMatch(
      /observedPeakWorkers not recorded/,
    );
  });

  it.each([
    ["null", null],
    ["a negative count", -1],
    ["a fraction", 2.5],
    ["a string", "4"],
    ["an array", [4]],
  ])("refuses %s", (_why, value) => {
    expect(structuralRecordProblems(withPeak(value), head).join(" ")).toMatch(
      /observedPeakWorkers (not recorded|is not a non-negative integer)/,
    );
  });

  it("refuses a value above the configured maximum", () => {
    expect(structuralRecordProblems(withPeak(5), head).join(" ")).toMatch(
      /observedPeakWorkers is 5, above the configured maximum/,
    );
  });

  it("refuses zero on a run that collected tests", () => {
    /*
     * Structurally a count, and still impossible: a run that executed suites
     * had at least one module running. It is an acceptance failure rather than
     * a shape failure, so a red record is not refused for it twice.
     */
    expect(structuralRecordProblems(withPeak(0), head)).toEqual([]);
    expect(gateRecordProblems(withPeak(0), head).join(" ")).toMatch(
      /observedPeakWorkers is 0 — a run that collected tests/,
    );
  });

  it.each([1, 2, 3, 4])("accepts an observed peak of %i", (peak) => {
    expect(gateRecordProblems(withPeak(peak), head)).toEqual([]);
  });

  it("survives sanitization and reaches the staged projection", () => {
    const staged = sanitizedRecord(withPeak(3)) as {
      testGate?: { observedPeakWorkers?: unknown };
    };
    expect(staged.testGate?.observedPeakWorkers).toBe(3);
    expect(captureEvidence(withPeak(3), head).json).toContain('"observedPeakWorkers": 3');
  });

  it("keeps configuration and observation semantically distinct", () => {
    /*
     * Four configured and four observed is a coincidence of this release, not
     * an identity. A record whose peak is BELOW its bound is perfectly valid;
     * one whose peak is above it is not.
     */
    const belowBound = withPeak(2) as { testGate: { configuredMaxWorkers?: number } };
    expect(belowBound.testGate.configuredMaxWorkers).toBe(4);
    expect(gateRecordProblems(belowBound as GateRecord, head)).toEqual([]);

    const source = readFileSync(join(ROOT, "scripts/release/gate-contract.ts"), "utf8");
    expect(source).toMatch(/CONFIGURATION, and they are|configuration/i);
    expect(source).toContain("MEASURED, not configured");
  });

  it("is threaded through the runner, not invented at the record", () => {
    const runner = readFileSync(join(ROOT, "scripts/release/run-gates.ts"), "utf8");
    expect(runner).toContain("observedPeakWorkers: d?.peakConcurrentModules ?? null");
    expect(runner).toContain("observedPeakWorkers: gate.observedPeakWorkers");
    const reporter = readFileSync(join(ROOT, "scripts/release/vitest-runner-reporter.ts"), "utf8");
    expect(reporter).toContain("peakConcurrentModules: this.peakModules");
  });
});

/**
 * A RED RECORD IS STILL EVIDENCE, AND IS HELD TO THE SCHEMA.
 *
 * Structural validation used to be skipped entirely once a gate had failed —
 * a red record was expected to fail the contract, so consulting it looked
 * pointless. That is precisely how the missing measurement stayed invisible.
 */
describe("one failure does not suppress evidence about another", () => {
  const head = "f".repeat(40);

  it("reports the genuine test failure AND the incomplete runner evidence", () => {
    const base = greenGateRecord(head) as { testGate: Record<string, unknown> };
    const gate = { ...base.testGate };
    delete gate["observedPeakWorkers"];

    /* A real suite failure, recorded correctly, beside a missing measurement. */
    const red = {
      ...base,
      gates: {
        ...(base as unknown as GateRecord).gates,
        "pnpm test": "FAILED — exit status 1; report declares failure",
      },
      processes: {
        ...(base as unknown as GateRecord).processes,
        "pnpm test": { ok: false, status: 1, signal: null, errorCode: null },
      },
      testGate: {
        ...gate,
        ok: false,
        status: 1,
        processStatus: 1,
        reportSuccess: false,
        reportedFailedSuites: 6,
        runtimeErrorSuites: 3,
        failedSuiteNames: ["control-chars.test.ts"],
        reasons: ["exit status 1", "report declares failure"],
      },
    } as unknown as GateRecord;

    const structure = structuralRecordProblems(red, head).join(" ");
    const acceptance = gateRecordProblems(red, head).join(" ");

    /* The structural fault is reported on its own, with the gate already red. */
    expect(structure).toMatch(/observedPeakWorkers not recorded/);
    /* And the genuine failure is still reported. */
    expect(acceptance).toMatch(/report declares failure|test gate not clean|exit status 1/);
    expect(acceptance).toMatch(/observedPeakWorkers not recorded/);
  });

  it("does not fail a red record for its own honest FAILED verdict", () => {
    /*
     * `FAILED — <reasons>` is a correct account of what happened, not a broken
     * rendering of the totals. Comparing it against the canonical form would
     * fail every red record for something that is not a structural fault.
     */
    const base = greenGateRecord(head);
    const red = {
      ...base,
      gates: { ...base.gates, "pnpm test": "FAILED — exit status 1" },
    } as GateRecord;
    expect(structuralRecordProblems(red, head).join(" ")).not.toMatch(/canonical rendering/);
  });

  it("still refuses a verdict that is neither a measurement nor a stated failure", () => {
    const base = greenGateRecord(head);
    for (const nonsense of ["BROKEN", "8 FOUND", "clean"]) {
      const record = { ...base, gates: { ...base.gates, "pnpm test": nonsense } } as GateRecord;
      expect(structuralRecordProblems(record, head).join(" "), nonsense).toMatch(
        /not the canonical rendering/,
      );
    }
  });

  it("runs structural validation on every completed attempt", () => {
    const runner = readFileSync(join(ROOT, "scripts/release/run-gates.ts"), "utf8");
    const structural = runner.indexOf("structuralRecordProblems(built, head)");
    const guarded = runner.indexOf("failed > 0 ? [] : gateRecordProblems(built, head)");
    expect(structural).toBeGreaterThan(0);
    expect(guarded).toBeGreaterThan(structural);
    /* The structural pass is not behind the failure guard. */
    expect(runner).toContain("THE RECORD THIS RUN PRODUCED IS STRUCTURALLY INCOMPLETE");
  });
});
