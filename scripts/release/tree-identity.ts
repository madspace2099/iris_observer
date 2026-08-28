/**
 * Bind a gate result to the bytes it actually measured.
 *
 * ## The sequence this exists to refuse
 *
 * The runner recorded HEAD and nothing else, and never required a clean tree.
 * So this worked:
 *
 *   1. edit runtime code, or weaken a test, without committing;
 *   2. run the gates green at HEAD H;
 *   3. `git checkout .` — the tree is clean at H again;
 *   4. package at H.
 *
 * The packager saw a clean tree, a matching HEAD and a green record, and every
 * one of those was true. The record simply described different bytes.
 *
 * HEAD is not an identity for what ran. `HEAD` names a commit; the gate reads
 * the WORKING TREE. Those coincide only while the tree is clean, and nothing
 * was checking. What is recorded now is the commit's tree hash and a digest
 * over every tracked input as the index sees it, taken with the tree proven
 * clean — so the digest describes the bytes on disk, not merely a commit.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { suiteInventoryDigestOf } from "./gate-contract";

export interface TreeIdentity {
  readonly branch: string;
  readonly head: string;
  /** `HEAD^{tree}` — the commit's own content identity. */
  readonly treeId: string;
  /** sha256 over `mode blob-sha path` for every tracked file, sorted. */
  readonly inputsDigest: string;
  /** How many tracked files that digest covers. */
  readonly trackedFiles: number;
  /** sha256 over the sorted list of test files the suite is expected to collect. */
  readonly suiteInventoryDigest: string;
  /** The expected suite basenames, sorted. */
  readonly suiteInventory: readonly string[];
}

const git = (root: string, ...args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * Which files the suite is expected to collect.
 *
 * Derived from the tracked inventory rather than from a Vitest run, so an
 * accidentally filtered run — one path argument, one stray `--project`, a
 * glob that matched nothing — produces a COLLECTED inventory that disagrees
 * with this one instead of a small green record that packages happily.
 */
export function expectedSuiteFiles(root: string): readonly string[] {
  return git(root, "ls-files", "-z")
    .split("\0")
    .filter((f) => /\.test\.tsx?$/.test(f))
    .sort();
}

/**
 * A digest over the ACTUAL BYTES of every tracked working-tree file.
 *
 * ## Why the index was not enough
 *
 * The identity used to hash `git ls-files -s`, which lists what the INDEX
 * holds: mode, blob id and path. That describes what git has been told, not
 * what is on disk — and the gate reads what is on disk. The two coincide only
 * while nothing has been hidden from git, and git offers two supported ways to
 * hide exactly that:
 *
 *   assume-unchanged   git promises not to look at the file
 *   skip-worktree      git treats the worktree copy as absent
 *
 * Under either flag a tracked file can be edited freely, `git status` stays
 * silent, `git diff` stays empty, and `ls-files -s` reports the unchanged blob
 * — so every check the release made would pass while the gate measured
 * different bytes and the packager copied them into the archive.
 *
 * So this reads the files. Path, mode, byte length and the bytes themselves,
 * in canonical path order, hashed once.
 */
export function trackedBytesDigest(root: string): string {
  const hash = createHash("sha256");
  const entries = git(root, "ls-files", "-s", "-z")
    .split("\0")
    .filter((e) => e.length > 0)
    .map((e) => {
      /* "<mode> <blob> <stage>\t<path>" */
      const tab = e.indexOf("\t");
      const meta = e.slice(0, tab).split(" ");
      return { mode: meta[0] ?? "", path: e.slice(tab + 1) };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  for (const { mode, path } of entries) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(root, path));
    } catch {
      /*
       * A tracked file that cannot be read is not a file this digest can
       * describe. Recording it as a distinct, stable marker keeps the digest
       * deterministic while making the absence part of the identity.
       */
      hash.update(`${path}\u0000${mode}\u0000UNREADABLE\u0000`);
      continue;
    }
    hash.update(`${path}\u0000${mode}\u0000${String(bytes.length)}\u0000`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

/**
 * Tracked paths git has been told to stop looking at.
 *
 * Both flags are legitimate tools and neither belongs anywhere near a release
 * measurement: their entire purpose is to make a modified tracked file look
 * unmodified, which is precisely the state this evidence must be able to see.
 */
export function hiddenTrackedPaths(root: string): readonly string[] {
  return (
    git(root, "ls-files", "-v")
      .split("\n")
      /*
       * LOWERCASE TAGS MEAN assume-unchanged; `S` MEANS skip-worktree, and it is
       * capital. Filtering on lowercase alone saw one of the two flags and missed
       * the other — which is the more thorough of the two at hiding a change.
       */
      .filter((line) => /^[a-zS]/.test(line))
      .map((line) => ({ tag: line[0] ?? "", path: line.slice(2).trim() }))
      .filter(({ tag }) => tag === "h" || tag === "s" || tag === "S")
      .map(({ tag, path }) => `${path} (${tag === "h" ? "assume-unchanged" : "skip-worktree"})`)
  );
}

/** The basename Vitest reports for a suite, which is what the record stores. */
export const suiteLabel = (file: string): string =>
  (file.split("/").pop() ?? file).replace(/\.test\.tsx?$/, "");

/** Everything that identifies the bytes a gate is about to measure. */
export function treeIdentity(root: string): TreeIdentity {
  const files = expectedSuiteFiles(root);
  return Object.freeze({
    branch: git(root, "rev-parse", "--abbrev-ref", "HEAD").trim(),
    head: git(root, "rev-parse", "HEAD").trim(),
    treeId: git(root, "rev-parse", "HEAD^{tree}").trim(),
    inputsDigest: trackedBytesDigest(root),
    trackedFiles: git(root, "ls-files", "-z")
      .split("\0")
      .filter((f) => f.length > 0).length,
    /*
     * OVER THE NAMES THE RECORD CARRIES, not over the paths.
     *
     * The digest used to be taken over file PATHS while the record stored
     * LABELS, so nothing could recompute it from the record — and a binding
     * nothing can recompute binds nothing. It is now a function of exactly the
     * list that travels in the evidence, canonically sorted, so the contract
     * recomputes it during source and staged validation and the packager
     * recomputes it again from the repository itself.
     */
    suiteInventoryDigest: suiteInventoryDigestOf(files.map(suiteLabel)),
    suiteInventory: Object.freeze(files.map(suiteLabel).sort()),
  });
}

export interface TreeExpectation {
  readonly branch: string;
  readonly head: string;
  readonly treeId: string;
  readonly inputsDigest: string;
}

/**
 * Every reason the tree is not the one this operation may measure or package.
 *
 * FAIL CLOSED on all four axes. A clean tree with the wrong HEAD, the right
 * HEAD with an unstaged edit, and a matching HEAD whose index disagrees with
 * the commit are three different lies and each of them produced a package that
 * described something other than what shipped.
 */
export function treeProblems(root: string, expected?: TreeExpectation): readonly string[] {
  const problems: string[] = [];
  const now = treeIdentity(root);

  /*
   * UNSTAGED AND STAGED, SEPARATELY. `git status --porcelain` collapses them
   * into one report; asking git twice says which one moved, and a caller who
   * staged an edit deserves to hear that rather than "the tree is dirty".
   */
  const dirty = (...args: readonly string[]): boolean => {
    try {
      execFileSync("git", [...args], { cwd: root, stdio: "ignore" });
      return false;
    } catch {
      return true;
    }
  };
  if (dirty("diff", "--quiet")) {
    problems.push("the working tree has unstaged changes to tracked files");
  }
  if (dirty("diff", "--cached", "--quiet")) {
    problems.push("the index has staged changes not present in HEAD");
  }

  /*
   * AND NOTHING MAY BE HIDDEN FROM GIT.
   *
   * `assume-unchanged` and `skip-worktree` make an edited tracked file look
   * pristine to `git status`, `git diff` and `ls-files -s` alike. A release
   * cannot measure what it has been told not to look at.
   */
  const hidden = hiddenTrackedPaths(root);
  if (hidden.length > 0) {
    problems.push(
      `${String(hidden.length)} tracked file(s) are hidden from git and cannot be measured: ` +
        `${hidden.slice(0, 6).join(", ")}${hidden.length > 6 ? ", …" : ""}`,
    );
  }

  /*
   * UNTRACKED INPUTS COUNT. `.release/` and `_review/` are ignored, so they do
   * not appear here; anything that does is a file the gate can read and the
   * commit does not contain.
   */
  const untracked = git(root, "status", "--porcelain=v1", "--untracked-files=all")
    .split("\n")
    .filter((l) => l.startsWith("??"))
    .map((l) => l.slice(3).trim())
    .filter((l) => l.length > 0);
  if (untracked.length > 0) {
    problems.push(
      `${String(untracked.length)} untracked file(s) the commit does not contain: ` +
        `${untracked.slice(0, 8).join(", ")}${untracked.length > 8 ? ", …" : ""}`,
    );
  }

  if (expected !== undefined) {
    if (now.branch !== expected.branch) {
      problems.push(`on branch ${now.branch}, not ${expected.branch}`);
    }
    if (now.head !== expected.head) {
      problems.push(`HEAD is ${now.head.slice(0, 7)}, not ${expected.head.slice(0, 7)}`);
    }
    if (now.treeId !== expected.treeId) {
      problems.push(
        `the commit tree is ${now.treeId.slice(0, 12)}, not ${expected.treeId.slice(0, 12)}`,
      );
    }
    if (now.inputsDigest !== expected.inputsDigest) {
      problems.push(
        "the tracked inputs digest changed since this operation began — tracked content was " +
          "modified during the run, and restoring it afterwards does not make the measurement " +
          "describe the bytes that were measured",
      );
    }
  }

  return problems;
}

/**
 * A sampler an operation carries for its whole life.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. It compares the tracked inputs at each
 * sample point against the identity taken when the operation began, so a
 * modification that is present at any sample is caught and refuses publication
 * even if the tree is restored afterwards. A modification made and undone
 * entirely BETWEEN two samples is not observed — no filesystem watch is
 * involved — and that limit is stated rather than described away. Samples are
 * taken before the first gate, around every gate step, and immediately before
 * publication.
 */
export class TreeBinding {
  private readonly root: string;
  readonly expected: TreeExpectation;
  private samples = 0;
  private breaches: string[] = [];

  constructor(root: string, expected: TreeExpectation) {
    this.root = root;
    this.expected = expected;
  }

  /** Take a sample. Returns the problems seen at this point, and remembers them. */
  sample(label: string): readonly string[] {
    this.samples += 1;
    const problems = treeProblems(this.root, this.expected);
    for (const p of problems) this.breaches.push(`${label}: ${p}`);
    return problems;
  }

  get sampleCount(): number {
    return this.samples;
  }

  /** Every breach seen at ANY sample, so a restored tree does not erase one. */
  get everBroken(): readonly string[] {
    return this.breaches;
  }
}
