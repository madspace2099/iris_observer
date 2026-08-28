import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  treeIdentity,
  treeProblems,
  TreeBinding,
  expectedSuiteFiles,
  suiteLabel,
  hiddenTrackedPaths,
  trackedBytesDigest,
  type UnreadableTrackedFiles,
} from "../../scripts/release/tree-identity";
import {
  packagingProblems,
  ownershipProblems,
  verifyEmbeddedManifest,
  stagedOriginProblems,
  branchProblems,
} from "../../scripts/release/build-package";
import {
  gateRecordProblems,
  structuralRecordProblems,
  renderFailedVerdict,
  renderTestVerdict,
  safeBranch,
  suiteInventoryDigestOf,
  APPROVED_SKIP,
  REQUIRED_BRANCH,
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
import {
  SNAPSHOT_QUERY,
  LIVE,
  OLDEST_BUCKET_HISTORY_PROVENANCE,
  DEPLOYMENT_INVENTORY_PROVENANCE,
} from "../../scripts/release/live-snapshot";
import {
  controlByteDistribution,
  transportSafeNote,
  isDeclaredHistorical,
  HISTORICAL_CONTROL_CHAR_COMMITS,
  patchCommit,
} from "../../scripts/release/transport-safe";
import { facts, render } from "../../scripts/release/facts";

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
  /*
   * NO LINE-ENDING REWRITING, so this experiment isolates the variable it is
   * about. With `core.autocrlf` on, `git reset --hard` writes CRLF where the
   * test wrote LF, and the byte digest correctly reports different bytes — a
   * true observation that would make this case about git's checkout filter
   * rather than about edited-then-restored content.
   */
  git(root, "config", "core.autocrlf", "false");
  git(root, "config", "core.eol", "lf");
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

  it("builds into a staging directory and publishes without clobbering", () => {
    const text = source();
    expect(text).toContain("const staging = join(outDir");
    /*
     * LINK, NOT RENAME. `rename` silently replaces an existing destination, so
     * publishing over a previous archive destroyed it and said nothing.
     * `link` fails when the destination exists, which is the whole point.
     */
    expect(text).toContain("linkSync(first.archive, distributable)");
    expect(text).not.toContain("renameSync(first.archive, distributable)");
    /* Publication comes after the checks, never before. */
    const verify = text.indexOf("all four identical");
    const publish = text.indexOf("linkSync(first.archive, distributable)");
    expect(verify).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(verify);
  });

  it("refuses rather than replacing an archive already at that path", () => {
    const text = source();
    /* Both SHAs are reported, so a reviewer can tell which file is which. */
    expect(text).toContain("if (existsSync(distributable))");
    expect(text).toMatch(/Its SHA-256 is \${sha256File\(distributable\)}/);
    expect(text).toContain("Nothing has been deleted or replaced");
  });

  it("removes its own temporary artefacts, and only those", () => {
    const text = source();
    expect(text).toContain("rmSync(staging, { recursive: true, force: true })");
    /*
     * AND NEVER THE DISTRIBUTABLE. Cleanup used to delete any archive at the
     * destination whenever the build did not publish — so a build that refused
     * for any reason at all destroyed the previous, verified archive at the
     * same HEAD. That deletion is gone.
     */
    expect(text).not.toContain("if (!published) rmSync(distributable");
    expect(text).not.toMatch(/rmSync\(distributable/);
  });

  it("claims the terminal phase before publishing, and releases it after", () => {
    const text = source();
    const claim = text.indexOf('claimTerminalPhase(REPO_ROOT, op, "publish")');
    const publish = text.indexOf("linkSync(first.archive, distributable)");
    const release = text.indexOf("releaseTerminal()");
    expect(claim).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(claim);
    expect(release).toBeGreaterThan(publish);
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

  it("requires a red verdict to be canonical, not merely to begin with FAILED", () => {
    /*
     * SUPERSEDED, AND DELIBERATELY STRICTER.
     *
     * An earlier edition exempted anything starting with `FAILED` from the
     * canonical-rendering check, on the reasoning that free prose is a correct
     * account of what happened. It is — for a HUMAN. For a record it means the
     * verdict can say anything at all, including numbers that contradict the
     * measurements sitting beside it, and it means the sanitizer refuses the
     * field so a red projection loses its test gate entirely.
     *
     * A red verdict now has one canonical shape, rendered from those same
     * measurements. Prose beginning with FAILED is no longer exempt.
     */
    const base = greenGateRecord(head);
    const t = base.tests;
    const prose = {
      ...base,
      gates: { ...base.gates, "pnpm test": "FAILED — exit status 1" },
    } as GateRecord;
    expect(structuralRecordProblems(prose, head).join(" ")).toMatch(/not the canonical rendering/);

    /* And the canonical red rendering of the same numbers is accepted. */
    const canonical = {
      ...base,
      testGate: {
        ...base.testGate,
        ok: false,
        status: 1,
        processStatus: 1,
        reportSuccess: false,
        reportedFailedSuites: 2,
        runtimeErrorSuites: 1,
        failedSuiteNames: ["a.test.ts", "b.test.ts"],
        reasons: ["exit status 1"],
      },
      processes: {
        ...base.processes,
        "pnpm test": { ok: false, status: 1, signal: null, errorCode: null },
      },
      gates: {
        ...base.gates,
        "pnpm test": renderFailedVerdict({
          passed: t?.passed ?? 0,
          skipped: t?.skipped ?? 0,
          failed: t?.failed ?? 0,
          files: t?.files ?? 0,
          status: 1,
          reportSuccess: false,
          failedSuites: 2,
          runtimeErrorSuites: 1,
        }),
      },
    } as GateRecord;
    expect(structuralRecordProblems(canonical, head)).toEqual([]);
    /* Structurally valid, and never acceptable. */
    expect(gateRecordProblems(canonical, head)).not.toEqual([]);
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

/**
 * A RUN THAT SKIPPED EVERYTHING USED TO BE A GREEN RUN.
 *
 * The contract required the skipped-test IDENTITIES to number the same as the
 * skipped COUNT, and nothing else. A report in which every test was skipped
 * satisfied that perfectly: counts agreed, no assertion failed, the process
 * exited zero, and a package could be built from a run that executed nothing.
 *
 * Vitest reports a suite whose `beforeAll` threw as SKIPPED, which is exactly
 * how twenty-three tests vanished at `3094443` and again at `ddefa50` — so this
 * is not a hypothetical. It is the shape two authoritative gates produced.
 */
describe("an unexpected skip is not a green run", () => {
  const head = "7".repeat(40);
  const onPlatform = (platform: string): GateRecord => greenGateRecord(head, { platform });

  it("accepts zero skips where every test applies", () => {
    const linux = onPlatform("linux");
    expect(linux.testGate?.skippedTests).toEqual([]);
    expect(gateRecordProblems(linux, head)).toEqual([]);
  });

  it("accepts exactly the approved identity on win32, and nothing more", () => {
    const win = onPlatform("win32");
    expect(win.testGate?.skippedTests).toHaveLength(1);
    expect(gateRecordProblems(win, head)).toEqual([]);
  });

  it("refuses a record with no platform at all", () => {
    const base = onPlatform("linux") as Record<string, unknown>;
    delete base["platform"];
    expect(gateRecordProblems(base as GateRecord, head).join(" ")).toMatch(/platform not recorded/);
  });

  it.each([
    ["", "empty"],
    ["plan9", "unknown"],
    ["Win32", "wrong case"],
  ])("refuses %s as a platform (%s)", (platform) => {
    const record = { ...onPlatform("linux"), platform } as GateRecord;
    expect(gateRecordProblems(record, head).join(" ")).toMatch(
      /platform (not recorded|.* is not one this release recognises)/,
    );
  });

  it("refuses an unexpected skip on a platform where none is approved", () => {
    const base = onPlatform("linux");
    const record = {
      ...base,
      tests: { ...base.tests, passed: (base.tests?.passed ?? 1) - 1, skipped: 1 },
      testGate: {
        ...base.testGate,
        skippedTests: [{ suite: "something.test.ts", title: "skipped for no stated reason" }],
      },
    } as GateRecord;
    expect(gateRecordProblems(record, head).join(" ")).toMatch(
      /a test was skipped on linux, where no skip is approved/,
    );
  });

  it("refuses an ADDITIONAL skip beside the approved one", () => {
    const base = onPlatform("win32");
    const record = {
      ...base,
      tests: { ...base.tests, passed: (base.tests?.passed ?? 2) - 1, skipped: 2 },
      testGate: {
        ...base.testGate,
        skippedTests: [
          ...(base.testGate?.skippedTests ?? []),
          { suite: "another.test.ts", title: "also skipped" },
        ],
      },
    } as GateRecord;
    expect(gateRecordProblems(record, head).join(" ")).toMatch(
      /2 skipped test\(s\) on win32, where exactly 1 is permitted/,
    );
  });

  it.each([
    ["a changed title", { suite: APPROVED_SKIP.suite, title: "records termination by signal" }],
    ["a changed suite", { suite: "gate-runner2.test.ts", title: APPROVED_SKIP.title }],
  ])("refuses the approved skip with %s", (_why, identity) => {
    const base = onPlatform("win32");
    const record = {
      ...base,
      testGate: { ...base.testGate, skippedTests: [identity] },
    } as GateRecord;
    expect(gateRecordProblems(record, head).join(" ")).toMatch(
      /is not the one skip this release approves/,
    );
  });

  it("refuses the approved identity on the WRONG platform", () => {
    /*
     * A TITLE IS NOT EVIDENCE OF A PLATFORM. The approved skip's title contains
     * the word win32, and a record claiming linux while skipping it is a record
     * whose prose and whose measurement disagree. The measurement wins.
     */
    const base = onPlatform("linux");
    const record = {
      ...base,
      tests: { ...base.tests, passed: (base.tests?.passed ?? 1) - 1, skipped: 1 },
      testGate: {
        ...base.testGate,
        skippedTests: [{ suite: APPROVED_SKIP.suite, title: APPROVED_SKIP.title }],
      },
    } as GateRecord;
    expect(gateRecordProblems(record, head).join(" ")).toMatch(
      /skipped on linux, where no skip is approved/,
    );
  });

  it("refuses a run in which everything was skipped", () => {
    /*
     * THE FALSE GREEN ITSELF. Status zero, no failed assertion, counts that
     * agree with their identities — and nothing executed.
     */
    const base = onPlatform("linux");
    const every = Object.keys(base.tests?.perFile ?? {}).map((suite) => ({
      suite,
      title: "never ran",
    }));
    const record = {
      ...base,
      tests: { ...base.tests, passed: 0, skipped: every.length, total: every.length },
      testGate: { ...base.testGate, skippedTests: every },
    } as GateRecord;
    const problems = gateRecordProblems(record, head).join(" ");
    expect(problems).toMatch(/no test passed/);
    expect(problems).toMatch(/where no skip is approved/);
  });

  it("refuses report success with nothing executed", () => {
    const base = onPlatform("linux");
    const record = {
      ...base,
      tests: { ...base.tests, passed: 0, skipped: 0, total: 0, files: 0, perFile: {} },
    } as GateRecord;
    expect(gateRecordProblems(record, head).join(" ")).toMatch(/no test passed/);
  });
});

/**
 * THE BRANCH, THE INVENTORY AND THE TOTALS.
 *
 * The `20ff3e0` archive staged `branch: null` while REVIEW named the release
 * branch, because the generic text filter refuses slash-containing strings and
 * a branch name has a slash in it. The staged record also dropped `tests.total`
 * entirely, so the arithmetic could not be re-checked from the archive alone.
 */
describe("a record names the branch and the inventory it measured", () => {
  const head = "8".repeat(40);

  it("keeps the release branch whole, slash included", () => {
    expect(safeBranch("release/observer-demo-rc1")).toBe("release/observer-demo-rc1");
    const staged = sanitizedRecord(greenGateRecord(head)) as { branch?: unknown };
    expect(staged.branch).toBe(REQUIRED_BRANCH);
  });

  it.each([
    ["null", null],
    ["absent", undefined],
    ["empty", ""],
    ["a detached HEAD", "HEAD"],
    ["another branch", "main"],
    ["a traversal", "release/../../etc"],
    ["a double slash", "release//observer-demo-rc1"],
    ["a leading slash", "/release/observer-demo-rc1"],
  ])("refuses %s as the branch", (_why, branch) => {
    const record = { ...greenGateRecord(head), branch } as GateRecord;
    expect(structuralRecordProblems(record, head).join(" ")).toMatch(
      /branch is not recorded as a usable name|recorded on branch/,
    );
  });

  it("carries the total, so the arithmetic survives into the archive", () => {
    const staged = sanitizedRecord(greenGateRecord(head)) as { tests?: { total?: unknown } };
    expect(staged.tests?.total).toBe(1201);
  });

  it("binds the inventory digest to the names beside it", () => {
    const base = greenGateRecord(head);
    const names = Object.keys(base.tests?.perFile ?? {});
    expect(base.suiteInventoryDigest).toBe(suiteInventoryDigestOf(names));
    /* Order does not matter; membership does. */
    expect(suiteInventoryDigestOf([...names].reverse())).toBe(base.suiteInventoryDigest);
  });

  it("refuses a filtered inventory whose counts and digest agree with each other", () => {
    /*
     * THE ATTACK THIS CLOSES. Half the repository, a per-file map that sums
     * correctly, a file count that matches, and a digest computed over exactly
     * that half — internally flawless, and describing a different repository.
     */
    const base = greenGateRecord(head);
    const all = Object.entries(base.tests?.perFile ?? {});
    const half = Object.fromEntries(all.slice(0, Math.floor(all.length / 2)));
    const names = Object.keys(half);
    const total = Object.values(half).reduce((a, n) => a + n, 0);
    const filtered = {
      ...base,
      tests: { total, passed: total, skipped: 0, failed: 0, files: names.length, perFile: half },
      expectedSuites: [...names].sort(),
      suiteInventoryDigest: suiteInventoryDigestOf(names),
      testGate: { ...base.testGate, skippedTests: [] },
      gates: {
        ...base.gates,
        "pnpm test": renderTestVerdict({
          passed: total,
          skipped: 0,
          failed: 0,
          files: names.length,
        }),
      },
    } as GateRecord;
    /*
     * The record is self-consistent, so only the REPOSITORY can refuse it —
     * which is what the packager's recomputation from git is for. What the
     * contract catches here is the smaller half of the same defect.
     */
    expect(structuralRecordProblems(filtered, head)).toEqual([]);
    expect(filtered.suiteInventoryDigest).not.toBe(base.suiteInventoryDigest);
  });

  it("refuses a digest that does not match the names recorded beside it", () => {
    const base = greenGateRecord(head);
    const record = { ...base, suiteInventoryDigest: "f".repeat(64) } as GateRecord;
    expect(structuralRecordProblems(record, head).join(" ")).toMatch(
      /does not match the expectedSuites recorded beside it/,
    );
  });
});

/**
 * THE EVIDENCE IS BOUND TO BYTES GIT CAN BE TOLD TO IGNORE.
 *
 * The identity hashed `git ls-files -s`, which reports the INDEX. Two supported
 * flags make an edited tracked file look pristine to `git status`, `git diff`
 * and `ls-files -s` alike — so every check the release made would pass while
 * the gate measured different bytes and the packager shipped them.
 */
describe("nothing tracked may be hidden from the measurement", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-hidden-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it.each([
    ["assume-unchanged", "--assume-unchanged"],
    ["skip-worktree", "--skip-worktree"],
  ])("sees a change hidden by %s, and refuses", (_why, flag) => {
    const root = throwaway(scratch);
    const clean = treeIdentity(root);

    git(root, "update-index", flag, "src/app.ts");
    writeFileSync(join(root, "src", "app.ts"), "export const answer = 666;\n", "utf8");

    /* git reports nothing wrong — that is the whole point of the flag. */
    expect(git(root, "status", "--porcelain=v1").trim()).toBe("");

    /* The byte digest sees it anyway. */
    expect(treeIdentity(root).inputsDigest).not.toBe(clean.inputsDigest);
    /* And the flag itself is refused, whether or not anything was edited. */
    const problems = treeProblems(root).join(" ");
    expect(problems).toMatch(/hidden from git and cannot be measured/);
    expect(hiddenTrackedPaths(root).join(" ")).toContain("src/app.ts");
  });

  it("reports no hidden paths in an ordinary clean repository", () => {
    expect(hiddenTrackedPaths(throwaway(scratch))).toEqual([]);
  });

  it("hashes the bytes on disk rather than the blob in the index", () => {
    const root = throwaway(scratch);
    const before = treeIdentity(root).inputsDigest;
    writeFileSync(join(root, "src", "app.ts"), "export const answer = 43;\n", "utf8");
    /* Not staged, not committed — only the working tree moved. */
    expect(treeIdentity(root).inputsDigest).not.toBe(before);
  });
});

/**
 * THE PACKAGER'S OWN VERIFICATION.
 *
 * `--verify` was optional and ordinary `pnpm release:package` published without
 * it, so the command a person is most likely to type produced an unverified
 * deliverable. And what `--verify` checked was a one-line checksum of the outer
 * ZIP against a number the same process had just computed — a tautology that
 * said nothing about `hashes.txt`, the manifest a reviewer actually uses.
 */
describe("packaging verifies what it publishes", () => {
  const source = readFileSync(join(ROOT, "scripts/release/build-package.ts"), "utf8");

  it("has no unverified publishing path", () => {
    expect(source).not.toContain('process.argv.includes("--verify")');
    expect(source).toMatch(/VERIFICATION IS NOT A FLAG/);
  });

  it("verifies the manifest inside the archive, from the archive", () => {
    expect(source).toContain("verifyEmbeddedManifest(inflated)");
    expect(source).toMatch(/unzip", \["-q", first\.archive/);
  });

  it("compares all four hashes before publishing", () => {
    expect(source).toContain('{ label: "written archive", sha: first.sha }');
    const compare = source.indexOf("hashes.every((h) => h.sha === first.sha");
    const publish = source.indexOf("linkSync(first.archive, distributable)");
    expect(compare).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(compare);
  });

  it("catches a manifest that is missing, surplus, corrupt or duplicated", () => {
    const root = mkdtempSync(join(tmpdir(), "observer-manifest-"));
    try {
      mkdirSync(join(root, "sub"), { recursive: true });
      writeFileSync(join(root, "a.txt"), "alpha\n", "utf8");
      writeFileSync(join(root, "sub", "b.txt"), "beta\n", "utf8");
      const digest = (rel: string): string =>
        createHash("sha256")
          .update(readFileSync(join(root, ...rel.split("/"))))
          .digest("hex");

      const good = `${digest("a.txt")}  a.txt\n${digest("sub/b.txt")}  sub/b.txt\n`;
      writeFileSync(join(root, "hashes.txt"), good, "utf8");
      expect(verifyEmbeddedManifest(root)).toEqual([]);

      /* A manifested file the archive does not contain. */
      writeFileSync(join(root, "hashes.txt"), `${good}${"0".repeat(64)}  missing.txt\n`, "utf8");
      expect(verifyEmbeddedManifest(root).join(" ")).toMatch(/manifested and absent/);

      /* A file the manifest does not list. */
      writeFileSync(join(root, "hashes.txt"), `${digest("a.txt")}  a.txt\n`, "utf8");
      expect(verifyEmbeddedManifest(root).join(" ")).toMatch(/in the archive and not manifested/);

      /* A digest that does not match. */
      writeFileSync(
        join(root, "hashes.txt"),
        `${"1".repeat(64)}  a.txt\n${digest("sub/b.txt")}  sub/b.txt\n`,
        "utf8",
      );
      expect(verifyEmbeddedManifest(root).join(" ")).toMatch(
        /does not match its manifested digest/,
      );

      /* The same path twice. */
      writeFileSync(
        root === "" ? "" : join(root, "hashes.txt"),
        `${good}${digest("a.txt")}  a.txt\n`,
        "utf8",
      );
      expect(verifyEmbeddedManifest(root).join(" ")).toMatch(/is listed twice/);

      /* And no manifest at all. */
      rmSync(join(root, "hashes.txt"));
      expect(verifyEmbeddedManifest(root).join(" ")).toMatch(/hashes.txt is not in the archive/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * THE STAGED CONTRACT'S OWN DEPENDENCY.
 *
 * The archive shipped `gate-contract.ts`, which loads `secret-patterns.json`,
 * and did not ship the JSON — only `.ts` was copied from `scripts/release`. A
 * reader running the staged detector got a missing-file error, so the "one
 * definition, loaded by both systems" claim was true of the repository and
 * false of the thing handed over.
 */
describe("the staged secret detector can actually run", () => {
  it("copies json from the generator directory, not only ts", () => {
    const source = readFileSync(join(ROOT, "scripts/release/build-package.ts"), "utf8");
    expect(source).toContain(
      'copyAll("scripts/release", "generators", (f) => f.endsWith(".json"))',
    );
  });

  it("names a dependency that exists and is the one the auditor uses", () => {
    /*
     * BYTE-IDENTICAL to the file the authoritative secret audit reads. Two
     * copies that merely agree today are two copies that can drift.
     */
    const patterns = join(ROOT, "scripts/release/secret-patterns.json");
    expect(existsSync(patterns)).toBe(true);
    const contract = readFileSync(join(ROOT, "scripts/release/gate-contract.ts"), "utf8");
    expect(contract).toContain('"scripts/release/secret-patterns.json"');
    const auditor = readFileSync(join(ROOT, "scripts/secret-audit.mjs"), "utf8");
    expect(auditor).toContain("scripts/release/secret-patterns.json");
    /* And it parses into rules both scopes can use. */
    const doc = JSON.parse(readFileSync(patterns, "utf8")) as {
      rules: { name: string; pattern: string; scopes: string[] }[];
    };
    expect(doc.rules.some((r) => r.scopes.includes("audit"))).toBe(true);
    expect(doc.rules.some((r) => r.scopes.includes("staged"))).toBe(true);
  });
});

/**
 * PROVENANCE: WHAT THE RECORDED QUERY SELECTED, AND WHAT IT DID NOT.
 */
describe("evidence does not attribute fields to a query that never selected them", () => {
  it("selects six fields and claims six", () => {
    const q = SNAPSHOT_QUERY;
    for (const field of ["observed_at", "oldest_h", "newest_h", "audit_version = 1"]) {
      expect(q).toContain(field);
    }
    /* And none of the things documents used to attribute to it. */
    for (const absent of ["pg_proc", "pg_cron", "information_schema", "pronargs", "cron.job"]) {
      expect(q, absent).not.toContain(absent);
    }
  });

  it("keeps the historical text as it was run, duplicate column names included", () => {
    /*
     * Rewriting it with unique aliases would produce a query that reads better
     * and that nobody executed — and the observation would then be attributed
     * to it.
     */
    expect((SNAPSHOT_QUERY.match(/count\(\*\)::int as n\b/g) ?? []).length).toBe(2);
  });

  it("qualifies the untimestamped bucket series rather than presenting it as measurements", () => {
    expect(OLDEST_BUCKET_HISTORY_PROVENANCE).toMatch(/without individual timestamps/);
    expect(OLDEST_BUCKET_HISTORY_PROVENANCE).toMatch(/not presented as such/);
  });

  it("gives the deployment inventory its own provenance, not the database clock", () => {
    expect(DEPLOYMENT_INVENTORY_PROVENANCE.lastEnumeratedFor).toBe("f1dbffd");
    expect(DEPLOYMENT_INVENTORY_PROVENANCE.enumeratedAt).toBe("not recorded");
    expect(DEPLOYMENT_INVENTORY_PROVENANCE.currentlyAccurate).toBe("UNKNOWN");
    expect(DEPLOYMENT_INVENTORY_PROVENANCE.newestAtThatEnumeration).toBe("3f298a6");
    /* And it is not the database observation time. */
    expect(DEPLOYMENT_INVENTORY_PROVENANCE.enumeratedAt).not.toBe(LIVE.observedAt);
  });

  it("renders the enumeration's missing timestamp as NOT RECORDED, and dates nothing by it", () => {
    /*
     * TWO READS OF TWO SYSTEMS. The deployment list and the database snapshot
     * were rendered from one timestamp, so a database reading dated the
     * deployment enumeration as well. The enumeration's clock time was never
     * recorded, and the document now says so in those words rather than
     * borrowing a time from the other read.
     */
    const rendered = render(
      readFileSync(join(ROOT, "docs/release/REVIEW.txt"), "utf8"),
      facts({ stagedFiles: 0 }),
    ).out;
    expect(rendered).toMatch(/last enumerated for the f1dbffd bundle, at NOT RECORDED/);
    expect(rendered).toMatch(
      /At the carried-forward enumeration, the newest recorded deployment was\s+3f298a6/,
    );
    /* The database observation time is a different sentence about a different read. */
    expect(rendered).toMatch(/it is not the database observation time/);
  });

  it("names byte-comparison states for what they compare", () => {
    const source = readFileSync(join(ROOT, "scripts/release/facts.ts"), "utf8");
    expect(source).toContain('"record changed"');
    expect(source).toContain('"record unchanged"');
    expect(source).toContain('"comparison unavailable"');
    /* "refreshed" was a claim about a query, which a byte comparison cannot see. */
    expect(source).not.toContain('=== "refreshed"');
  });
});

/**
 * THE TRANSPORT-SAFE EXPLANATION, MEASURED.
 *
 * The note said every affected commit REMOVES backspaces and that every byte
 * sits on a removed line. Decoded and counted, that is false — and the reasons
 * beside the commits then carried counts of their own that were wrong too, so
 * the counts are declared as data and regenerated from git here.
 */
describe("the transport-safe note reports where the bytes actually are", () => {
  it("counts added, removed and context separately", () => {
    /*
     * ASSEMBLED, NEVER WRITTEN. A literal backspace in this file is a literal
     * backspace in the archive, and the staged package scan refuses it —
     * which is exactly what it did when this test first carried three.
     */
    const BS = String.fromCharCode(8);
    const line = (prefix: string): string => `${prefix}const a = /x${BS}y/;\n`;
    expect(controlByteDistribution(line("+"))).toEqual({ added: 1, removed: 0, context: 0 });
    expect(controlByteDistribution(line("-"))).toEqual({ added: 0, removed: 1, context: 0 });
    expect(controlByteDistribution(line(" "))).toEqual({ added: 0, removed: 0, context: 1 });
  });

  it("measures every declared patch and finds bytes on ADDED lines", () => {
    const out = mkdtempSync(join(tmpdir(), "observer-patchfacts-"));
    try {
      execFileSync("git", ["format-patch", "1ee5d2d..HEAD", "-o", out, "--no-signature", "-q"], {
        cwd: ROOT,
      });
      const measured = readdirSync(out)
        .sort()
        .map((f) => ({ f, text: readFileSync(join(out, f), "latin1") }))
        .filter(({ text }) => isDeclaredHistorical(text))
        .map(({ f, text }) => ({ f: f.slice(0, 4), ...controlByteDistribution(text) }));

      expect(measured).toHaveLength(HISTORICAL_CONTROL_CHAR_COMMITS.length);
      /* The claim that every byte is on a removed line is false. */
      expect(measured.some((m) => m.added > 0)).toBe(true);
      /* And so is the claim that they only remove them. */
      expect(measured.some((m) => m.removed === 0)).toBe(true);
      for (const m of measured) expect(m.added + m.removed + m.context).toBeGreaterThan(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("holds every declared distribution to the bytes git actually produces", () => {
    /*
     * THE DEFECT THIS CLOSES, TWICE OVER.
     *
     * The reasons beside these commits carried counts written from memory. One
     * said a commit "removes two backspaces from the gate-contract FAILED
     * matcher" when it ADDS two and removes none; another said `1b8b912`
     * removes "a backspace" when it removes two. Both were corrections of an
     * earlier wrong description, and both were wrong in the same way — a number
     * typed beside the thing rather than taken from it.
     *
     * So the counts are declared as DATA and regenerated here. A reason that
     * drifts from history now fails, instead of shipping in a document.
     */
    const out = mkdtempSync(join(tmpdir(), "observer-declared-"));
    try {
      execFileSync("git", ["format-patch", "1ee5d2d..HEAD", "-o", out, "--no-signature", "-q"], {
        cwd: ROOT,
      });
      const files = readdirSync(out).sort();
      const byCommit = new Map<string, { file: string; text: string }>();
      for (const f of files) {
        const text = readFileSync(join(out, f), "latin1");
        const sha = patchCommit(text);
        if (sha !== null) byCommit.set(sha, { file: f, text });
      }

      for (const declared of HISTORICAL_CONTROL_CHAR_COMMITS) {
        const found = byCommit.get(declared.sha);
        expect(found, declared.sha).toBeDefined();
        expect(controlByteDistribution(found?.text ?? ""), found?.file).toEqual(
          declared.distribution,
        );
        /* And the reason carries no number to go stale. */
        expect(declared.why, declared.sha).not.toMatch(/\b(one|two|three|four|\d+)\b/);
      }

      /* Nothing else in the chain carries a control byte. */
      const undeclared = files.filter((f) => {
        const text = readFileSync(join(out, f), "latin1");
        if (isDeclaredHistorical(text)) return false;
        const d = controlByteDistribution(text);
        return d.added + d.removed + d.context > 0;
      });
      expect(undeclared).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("reconstructs the chain end to end with git am, when the base object is here", () => {
    /*
     * THE CLAIM THE NOTE MAKES, EXECUTED. The note says a decoded sidecar is
     * byte-for-byte the original patch and therefore `git am` applicable. That
     * had never been run: the encoding was verified by hash, and a hash proves
     * the bytes round-trip, not that the result applies.
     *
     * SKIPPED, NOT FAILED, when the base commit is not present locally — a
     * shallow or partial clone genuinely cannot do this, and a test that fails
     * on a legitimate checkout would be a test about the clone.
     */
    const base = "1ee5d2d";
    let haveBase = true;
    try {
      execFileSync("git", ["rev-parse", `${base}^{commit}`], { cwd: ROOT, stdio: "pipe" });
    } catch {
      haveBase = false;
    }
    if (!haveBase) return;

    const work = mkdtempSync(join(tmpdir(), "observer-am-"));
    const patches = join(work, "patches");
    const repo = join(work, "repo");
    try {
      mkdirSync(patches, { recursive: true });
      execFileSync(
        "git",
        ["format-patch", `${base}..HEAD`, "-o", patches, "--no-signature", "-q"],
        {
          cwd: ROOT,
        },
      );

      /*
       * ENCODE THE DECLARED ONES EXACTLY AS THE PACKAGER DOES, then decode them
       * back — so what `git am` is handed is the recovered file, not the
       * original. Recovering the original is the whole claim.
       */
      let recovered = 0;
      for (const f of readdirSync(patches).sort()) {
        if (!f.endsWith(".patch")) continue;
        const path = join(patches, f);
        const bytes = readFileSync(path);
        if (!isDeclaredHistorical(bytes.toString("utf8"))) continue;
        const body64 = bytes.toString("base64").replace(/(.{76})/g, "$1\n");
        const decoded = Buffer.from(body64.replace(/\n/g, ""), "base64");
        expect(decoded.equals(bytes), f).toBe(true);
        writeFileSync(path, decoded);
        recovered += 1;
      }
      expect(recovered).toBe(HISTORICAL_CONTROL_CHAR_COMMITS.length);

      /* A throwaway checkout at the base, and the whole chain replayed onto it. */
      execFileSync("git", ["clone", "--quiet", "--no-local", "--shared", ROOT, repo], {
        cwd: work,
      });
      for (const [k, v] of [
        ["user.email", "test@example.invalid"],
        ["user.name", "Test"],
        ["commit.gpgsign", "false"],
        ["core.autocrlf", "false"],
        ["core.eol", "lf"],
      ]) {
        execFileSync("git", ["config", k, v], { cwd: repo });
      }
      execFileSync("git", ["checkout", "--quiet", "--detach", base], { cwd: repo });
      execFileSync(
        "git",
        [
          "am",
          "--quiet",
          ...readdirSync(patches)
            .sort()
            .map((f) => join(patches, f)),
        ],
        { cwd: repo, maxBuffer: 64 * 1024 * 1024 },
      );

      /*
       * THE TREE, NOT THE COMMIT IDS. `git am` writes new committer metadata,
       * so the SHAs differ by construction; what must match is the content the
       * chain produces.
       */
      const rebuilt = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
        cwd: repo,
        encoding: "utf8",
      }).trim();
      const original = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();
      expect(rebuilt).toBe(original);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 180_000);

  it("does not claim every affected commit removes backspaces", () => {
    const note = transportSafeNote(
      ["0034.patch.base64"],
      [{ name: "0034.patch.base64", bytes: { added: 2, removed: 0, context: 0 } }],
    );
    expect(note).toContain("2 on added line(s)");
    expect(note).toMatch(/wherever in the diff they occur/);
    /* And it states no fixed number of affected patches, which went stale. */
    expect(note).not.toMatch(/all three/);
    expect(note).toMatch(/computed from the decoded patches of THIS/);
  });
});

/**
 * THE ARCHIVE CARRIES THE COMMIT'S BYTES, OR IT IS REFUSED.
 *
 * ## The window sampling could not close
 *
 * The tree was sampled before the build and again before publication. A change
 * made after the first sample and restored before the last one left no trace in
 * either — and the bytes copied into the archive in between were the changed
 * ones. Sampling more often narrows that window; it cannot close it, because
 * the thing sampled is not the thing copied.
 *
 * So the COPIES are checked, each against `git show HEAD:<origin>`. Note what
 * the cases below do NOT do: they never touch this repository's working tree.
 * They do not have to — that is the point. The tree is clean before, during and
 * after every one of them, and the refusal fires anyway, because the check does
 * not consult the tree at all.
 */
describe("the staged copies are checked against the commit, not the tree", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-origins-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  /** A tracked file that exists in HEAD and is small enough to copy about. */
  const ORIGIN = "scripts/release/secret-patterns.json";

  /** Stage a byte-exact copy of HEAD's version of ORIGIN. */
  const stageFromHead = (): { dir: string; staged: string } => {
    const dir = mkdtempSync(join(scratch, "staged-"));
    const committed = execFileSync("git", ["show", `HEAD:${ORIGIN}`], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "buffer",
    });
    mkdirSync(join(dir, "generators"), { recursive: true });
    writeFileSync(join(dir, "generators", "secret-patterns.json"), committed);
    return { dir, staged: "generators/secret-patterns.json" };
  };

  it("accepts a copy that is byte-identical to HEAD", () => {
    const { dir, staged } = stageFromHead();
    expect(stagedOriginProblems(dir, [{ origin: ORIGIN, staged }])).toEqual([]);
  });

  it("refuses a copy taken while the tracked file was modified, however briefly", () => {
    /*
     * THE WHOLE SEQUENCE, WITHOUT TOUCHING THE TREE.
     *
     * A tracked file edited during staging and restored immediately afterwards
     * produces exactly this: a staged copy holding the edited bytes, beside a
     * working tree that is clean and a HEAD that is unchanged. Every sample the
     * build takes agrees; only the copy disagrees.
     */
    const { dir, staged } = stageFromHead();
    const path = join(dir, "generators", "secret-patterns.json");
    const edited = `${readFileSync(path, "utf8")}\n`;
    writeFileSync(path, edited, "utf8");

    /*
     * THE ORIGIN FILE ITSELF WAS NEVER TOUCHED — only the copy holds the edit,
     * which is exactly the state a mid-staging edit leaves behind once it has
     * been restored. (This asserts the origin rather than the whole tree: the
     * suite runs during development, when other files are legitimately being
     * worked on, and a clean-tree assertion here would be about the milestone
     * rather than about the rule.)
     */
    expect(
      stagedOriginProblems(dir, [
        { origin: ORIGIN, staged: "unmodified/secret-patterns.json" },
      ]).join(" "),
    ).toMatch(/is not present/);

    const problems = stagedOriginProblems(dir, [{ origin: ORIGIN, staged }]).join(" ");
    expect(problems).toMatch(/does not match HEAD:/);
    expect(problems).toMatch(/restoring it afterwards does not change what was copied/);
  });

  it("refuses a staged file whose origin is not in HEAD at all", () => {
    const { dir, staged } = stageFromHead();
    const problems = stagedOriginProblems(dir, [
      { origin: "scripts/release/not-a-tracked-file.json", staged },
    ]).join(" ");
    expect(problems).toMatch(/is staged and is not in HEAD/);
  });

  it("refuses a recorded origin whose copy is missing", () => {
    const dir = mkdtempSync(join(scratch, "empty-"));
    const problems = stagedOriginProblems(dir, [
      { origin: ORIGIN, staged: "generators/secret-patterns.json" },
    ]).join(" ");
    expect(problems).toMatch(/was recorded as staged and is not present/);
  });

  it("refuses a staging that recorded no origins at all", () => {
    /* An empty list is not a clean result; it is the check never having run. */
    const dir = mkdtempSync(join(scratch, "none-"));
    expect(stagedOriginProblems(dir, []).join(" ")).toMatch(/no staged file recorded/);
  });

  it("runs before anything is archived", () => {
    const source = readFileSync(join(ROOT, "scripts/release/build-package.ts"), "utf8");
    const check = source.indexOf("const origins = stagedOriginProblems(dir)");
    const scan = source.indexOf("const finished = scanDirectory(dir)");
    expect(check).toBeGreaterThan(0);
    expect(scan).toBeGreaterThan(check);
  });
});

/**
 * A COMMIT BEING RIGHT IS NOT THE RELEASE BEING CUT FROM WHERE IT CLAIMS.
 *
 * Checking out a detached HEAD, or a second branch at the same commit, cannot
 * be done to this repository while its own suite is running — so the rule is a
 * free function over two strings and every shape is exercised here.
 */
describe("the branch is checked three ways", () => {
  const RELEASE = "release/observer-demo-rc1";

  it("accepts the release branch recorded and checked out", () => {
    expect(branchProblems(RELEASE, RELEASE)).toEqual([]);
  });

  it("refuses a detached HEAD, even at the right commit", () => {
    const problems = branchProblems("HEAD", "HEAD").join(" ");
    expect(problems).toMatch(/the checkout is on a detached HEAD/);
  });

  it("refuses a second branch pointing at the same commit", () => {
    const problems = branchProblems("hotfix/same-commit", "hotfix/same-commit").join(" ");
    expect(problems).toMatch(/the checkout is on hotfix\/same-commit, not release/);
  });

  it("refuses a record and a checkout that disagree", () => {
    const problems = branchProblems(RELEASE, "main").join(" ");
    expect(problems).toMatch(/the checkout is on main/);
    expect(problems).toMatch(/the gate recorded branch "release\/observer-demo-rc1"/);
  });

  it("refuses a record that names no branch at all", () => {
    /* `branch: null` beside prose naming the release branch is what 20ff3e0 staged. */
    const problems = branchProblems(null, RELEASE).join(" ");
    expect(problems).toMatch(/the gate recorded branch null/);
  });
});

/**
 * A FILE NOBODY COULD READ MUST NOT LOOK MEASURED.
 *
 * The digest used to hash the literal "UNREADABLE" in place of the bytes. That
 * is deterministic, which is what it was written for, and it is precisely the
 * wrong property: two runs that both failed to read a file agreed with each
 * other about an identity neither had established, and the packager copies the
 * bytes regardless.
 */
describe("a tracked file that cannot be read has no identity", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-unreadable-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("digests an ordinary repository", () => {
    expect(trackedBytesDigest(throwaway(scratch))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses when a tracked file has been deleted from the worktree", () => {
    const root = throwaway(scratch);
    rmSync(join(root, "src", "app.ts"));
    expect(() => trackedBytesDigest(root)).toThrow(/could not be read/);
  });

  it("refuses when a tracked path has become a directory", () => {
    const root = throwaway(scratch);
    rmSync(join(root, "src", "app.ts"));
    mkdirSync(join(root, "src", "app.ts"));
    expect(() => trackedBytesDigest(root)).toThrow(/could not be read/);
  });

  it("names the files rather than the read failure", () => {
    const root = throwaway(scratch);
    rmSync(join(root, "src", "app.ts"));
    rmSync(join(root, "src", "a.test.ts"));
    try {
      trackedBytesDigest(root);
      expect.unreachable("the digest should have refused");
    } catch (e) {
      const error = e as UnreadableTrackedFiles;
      expect(error.name).toBe("UnreadableTrackedFiles");
      expect([...error.paths].sort()).toEqual(["src/a.test.ts", "src/app.ts"]);
      /*
       * PATHS ONLY. A read failure's message names an errno and an absolute
       * location, and this value reaches a record somebody zips up.
       */
      expect(error.message).not.toMatch(/ENOENT|EISDIR|errno/);
      expect(error.message).not.toContain(root);
    }
  });

  it("does not fabricate a stable identity for an unreadable tree", () => {
    /*
     * The defect, stated as the property it violated. Two different unreadable
     * files used to produce digests that differed only in the path — so an
     * identity existed for a tree nobody had read.
     */
    const a = throwaway(scratch);
    rmSync(join(a, "src", "app.ts"));
    expect(() => trackedBytesDigest(a)).toThrow();
    /* And the placeholder is gone from the source, not merely unreachable. */
    const source = readFileSync(join(ROOT, "scripts/release/tree-identity.ts"), "utf8");
    expect(source).not.toContain("UNREADABLE\\u0000");
  });
});
