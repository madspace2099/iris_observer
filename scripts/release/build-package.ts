/**
 * The single entry point that builds a review package from nothing.
 *
 *   pnpm release:package            build, check, write the archive
 *   pnpm release:package --verify   build three times under three time zones
 *                                   and prove the bytes are identical
 *
 * ## Why this replaces four scripts that lived inside the output
 *
 * The documented sequence was `bundle.mjs`, `evidence.mjs`, `package.mjs`,
 * `zip.mjs` — and the first of those began by deleting the directory containing
 * the other three, along with the hand-authored evidence, none of which it
 * recreated. The second command in the instructions no longer existed by the
 * time a reader reached it. It also hard-coded one machine's temporary path and
 * required seven earlier review archives to be present.
 *
 * Everything this needs is now tracked: the templates in `docs/release/`, the
 * recorded observation in `live-snapshot.ts`, the migrations, the verifiers.
 * Nothing is read from a previous package, and the staging directory is deleted
 * and rebuilt on every run precisely so that a stale file cannot survive into
 * an archive.
 */

import {
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  readdirSync,
  existsSync,
  mkdtempSync,
  linkSync,
  lstatSync,
} from "node:fs";
import { join, relative, sep, resolve, basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import {
  facts,
  render,
  git,
  useCapturedGateResults,
  REPO_ROOT,
  strip,
  execSha,
  fileShaAt,
  baselineCommit,
  snapshotRecordChanged,
  MIGRATIONS_DIR,
  RED_GATE_ATTEMPTS,
  HISTORY_REPAIR,
} from "./facts";
import { walk, writeZip, scanArchive } from "./zip";
import {
  beginOperation,
  adoptOperation,
  isOperationId,
  inspectPath,
  pathContainmentProblems,
  safeMkdir,
  assertOwner,
  endOperation,
  OperationRefused,
  withTerminalPhase,
  type Operation,
} from "./release-operation";
import { treeIdentity, treeProblems, TreeBinding } from "./tree-identity";
import { scanText, inScope } from "./secret-recipes";
import { WRAPPERS, renderWrapper, extractBody } from "./wrap-migration";
import { DEPLOYMENTS, LIVE, LAST_VERCEL_ENUMERATION, DELIVERED_ARCHIVES } from "./live-snapshot";
import {
  readGateRecord,
  REQUIRED_BRANCH,
  gateRecordProblems,
  captureEvidence,
  type CapturedEvidence,
  type GateRecord,
} from "./gate-contract";
import { scanDirectory, describeScan, type ControlCharacterScan } from "./control-chars";
import {
  isDeclaredHistorical,
  transportSafeNote,
  controlByteDistribution,
  type ControlByteDistribution,
} from "./transport-safe";

/**
 * The authorised local-history rewrite, declared rather than inferred.
 *
 * `base` is the last commit that was already pushed or deployed and therefore
 * untouchable; `head` is the single commit the two local-only commits above it
 * were rewritten into. Naming both is what lets the packager RECOMPUTE the
 * equality REVIEW §1A claims, instead of accepting a hand-copied digest.
 */
const REWRITE = { base: "7ac84fa", head: "c16b94f" } as const;

const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const say = (s: string): void => {
  console.log(s);
};

class Refusal extends Error {}

/* -------------------------------------------------------------------------
   1. The package must describe a real, clean commit.
------------------------------------------------------------------------- */

export interface PreconditionInput {
  readonly head: string;
  /** `RELEASE_EXPECT_HEAD`, when the caller pinned one. */
  readonly expectedHead: string | undefined;
  /** Porcelain status lines, already filtered of `.release/`. */
  readonly dirty: readonly string[];
  /** Whatever `gateRecordProblems` said about the record. */
  readonly gateProblems: readonly string[];
  /**
   * Whether this packager OWNS the release mutex, and what is wrong if not.
   *
   * REQUIRED, not optional, and no longer a point-in-time reading of the lock.
   * Reading the lock, seeing it free, and then building holds nothing: a gate
   * can start immediately afterwards, invalidate the record this packager
   * already captured, fail, and leave the packager finishing an archive from a
   * result that no longer exists. The packager holds the mutex for its whole
   * life instead, and this field carries the reason it does not.
   */
  readonly lockProblems: readonly string[];
  /** Every reason the tree is not the one the gate record describes. */
  readonly treeProblems: readonly string[];
}

/**
 * Every reason this commit may not be packaged, from inputs rather than the
 * world.
 *
 * Pure, and that is the point. When these checks read `process.env`, the
 * working tree and `.release/` directly, the only way to test them was to
 * arrange the real repository into each state — so the tests that covered them
 * were guarded on conditions like "a current green gate record exists", and
 * skipped whenever it did not. That guard was circular: the record only exists
 * after the gate completes, so a fresh commit's own gate run skipped the tests
 * that verify its packager. Twenty-two tests, silently not run, on the commit
 * whose package they were meant to check.
 */
export function packagingProblems(input: PreconditionInput): readonly string[] {
  const problems: string[] = [];

  /*
   * The identity check first, and deliberately: it is the cheap one, and a
   * caller who named the wrong commit wants to hear THAT, not a list of
   * unrelated uncommitted files.
   */
  if (input.expectedHead !== undefined && input.expectedHead !== "") {
    if (!input.head.startsWith(input.expectedHead)) {
      problems.push(`HEAD is ${input.head.slice(0, 7)}, not the expected ${input.expectedHead}`);
    }
  }

  if (input.dirty.length > 0) {
    problems.push(
      `CLEAN TREE: the working tree is not clean, so the package would describe a commit\n` +
        `that does not ` +
        `contain what it ships:\n${input.dirty.map((l) => `  ${l}`).join("\n")}`,
    );
  }

  /*
   * CURRENT, GREEN GATE EVIDENCE, OR NO PACKAGE.
   *
   * The packager used to build from whatever the record held — including
   * nothing, which rendered as "GATES NOT RECORDED" inside an archive that
   * otherwise looked complete. A reviewer then holds a package whose
   * verification section says, in small print, that there is none.
   */
  /*
   * A RUNNING ATTEMPT, BEFORE THE RECORD IT IS ABOUT TO REPLACE.
   *
   * Reported first because a caller who packages during a gate run wants to
   * hear that, not a description of a record that is changing under them —
   * and in the window before the new attempt writes its marker, the record on
   * disk is still the PREVIOUS attempt's green one, which would package.
   */
  if (input.lockProblems.length > 0) {
    problems.push(
      `this packager does not own the release operation, so nothing on disk may be packaged:\n` +
        input.lockProblems.map((p) => `  ${p}`).join("\n"),
    );
  }

  /*
   * THE TREE THE RECORD DESCRIBES, NOT MERELY A CLEAN ONE.
   *
   * A clean tree at the right HEAD was accepted while the record had been
   * produced from uncommitted edits that were reverted afterwards. The record
   * carries the identity of what it measured, and this compares it.
   */
  if (input.treeProblems.length > 0) {
    problems.push(
      `RECORD TREE: the working tree is not the one the gate measured:\n` +
        input.treeProblems.map((p) => `  ${p}`).join("\n"),
    );
  }

  if (input.gateProblems.length > 0) {
    problems.push(
      `GATE RECORD: the gate record is not current and clean:\n${input.gateProblems.map((p) => `  ${p}`).join("\n")}\n\n` +
        `  Run:  pnpm release:gates\n` +
        `  then: pnpm release:package --verify`,
    );
  }

  return problems;
}

/**
 * Where the gate record is read from.
 *
 * Production passes nothing and reads the real `.release/gate-results.json`. A
 * test passes its own temporary root holding a synthetic record — which then
 * goes through {@link gateRecordProblems} exactly as a real one does. There is
 * no test-only path that skips validation; the only thing injected is WHERE the
 * record is read, never WHETHER it is checked.
 */
export interface BuildOptions {
  readonly gateRecordRoot?: string;
  /**
   * The operation this build runs under.
   *
   * A build MUST own the release mutex. A test that supplies its own gate
   * record root supplies its own operation too; the real packager begins one
   * and the three time-zone children ADOPT the parent's rather than trying to
   * become independent owners — which would refuse, correctly, since the
   * parent holds it.
   */
  readonly operation?: Operation;
  /** Where the archive is written. Defaults to `outDir`; a staging directory
   * during a real package, so nothing lands at the distributable path until
   * every check has passed. */
  readonly archiveDir?: string;
}

function requireCleanHead(options: BuildOptions = {}): {
  head: string;
  short: string;
  evidence: CapturedEvidence;
} {
  const head = git("rev-parse", "HEAD");
  const root = options.gateRecordRoot ?? REPO_ROOT;
  const op = options.operation;

  /*
   * READ ONCE. Everything after this point uses the captured projection, so no
   * later step can see a different record than the one that was validated —
   * and nothing re-reads `.release/gate-results.json` during the build.
   */
  const record = readGateRecord(root);

  const problems = packagingProblems({
    head,
    expectedHead: process.env["RELEASE_EXPECT_HEAD"],
    dirty: git("status", "--porcelain=v1")
      .split("\n")
      .filter((l) => l.trim().length > 0 && !l.includes(".release/")),
    gateProblems: gateRecordProblems(record, head),
    /*
     * OWNERSHIP, RE-ASSERTED. Not a reading of the lock: a demand that this
     * process is still the owner at the moment the evidence is read.
     */
    lockProblems: ownershipProblems(root, op, head, record?.treeId),
    /*
     * The tree must be the one the record measured. A synthetic record in a
     * test root describes a tree nobody claims to have measured, so the
     * comparison applies to the real repository only.
     */
    treeProblems: root === REPO_ROOT ? recordTreeProblems(record) : [],
  });
  if (problems.length > 0) throw new Refusal(problems.join("\n\n"));

  /*
   * The projection is validated by the SAME contract before anything may stage
   * or render it. The delivered `c1b80f0` archive validated the source and
   * shipped a projection that had silently lost its `pnpm test` verdict.
   */
  let evidence: CapturedEvidence;
  try {
    evidence = captureEvidence(record, head);
  } catch (e) {
    throw new Refusal((e as Error).message);
  }

  return { head, short: head.slice(0, 7), evidence };
}

/**
 * Where one deterministic rebuild is allowed to write.
 *
 * DERIVED, NEVER PASSED IN. The child interface used to take a directory from
 * the command line — `--child <anything>` — so a caller could aim a rebuild at
 * any path the process could write, during a live package operation, with the
 * parent's operation id lending it an air of legitimacy.
 *
 * A child destination is now a function of three things it cannot choose: the
 * repository root, the operation id, and a bounded SLOT identifier naming which
 * of the three time-zone rebuilds it is. Everything else is refused.
 */
export const REBUILD_SLOTS = Object.freeze(["utc", "budapest", "new-york"] as const);

export type RebuildSlot = (typeof REBUILD_SLOTS)[number];

export function isRebuildSlot(value: unknown): value is RebuildSlot {
  return typeof value === "string" && (REBUILD_SLOTS as readonly string[]).includes(value);
}

/**
 * The one directory a child of this operation may write to.
 *
 * Inside the operation's own staging tree, so it is removed by the same cleanup
 * that removes everything else this operation made, and so it can never be the
 * distributable path.
 */
export function rebuildSlotDir(operationId: string, slot: RebuildSlot): string {
  if (!isOperationId(operationId)) {
    throw new Refusal("a rebuild slot needs a well-formed operation id");
  }
  if (!isRebuildSlot(slot)) {
    throw new Refusal(`${JSON.stringify(slot)} is not one of the declared rebuild slots`);
  }
  return join(REPO_ROOT, "_review", `.staging-${operationId}`, "rebuild", slot);
}

/**
 * Create a directory with every ancestor checked, wherever it sits.
 *
 * ## Why the containment root is not always the repository
 *
 * The real packager writes into `_review` beneath this repository, and every
 * component from the repository root down must be proved — `_review` itself is
 * exactly the link an attacker would plant. But `build()` also takes an
 * arbitrary `outDir`, and the suites that exercise it build into their own
 * temporary trees. Rooting the walk at the repository there produced a path
 * beginning `../..`, which the traversal rule refuses — correctly, and about
 * the wrong thing.
 *
 * So the root is chosen from where the target actually is: the repository when
 * the target is inside it, and otherwise the deepest EXISTING ancestor of the
 * target itself. Either way every component that exists is lstatted and no
 * create passes through a link.
 */
function safeMkdirAt(target: string): void {
  const fromRepo = relative(REPO_ROOT, target).split(sep).join("/");
  if (fromRepo !== "" && !fromRepo.startsWith("..")) {
    safeMkdir(REPO_ROOT, fromRepo);
    return;
  }
  let base = dirname(target);
  const tail: string[] = [basename(target)];
  while (!existsSync(base) && dirname(base) !== base) {
    tail.unshift(basename(base));
    base = dirname(base);
  }
  safeMkdir(base, tail.join("/"));
}

/**
 * A file object, as the filesystem knows it, plus the bytes it held.
 *
 * ## Why a pathname was not enough
 *
 * The archive was hashed, rebuilt three times, inflated and checked — and then
 * published by PATHNAME: `linkSync(first.archive, distributable)`, with no
 * re-read. The operation-private staging path is derived from the operation id
 * and is therefore predictable, so a local process could replace or rewrite
 * that file between the last verification and the link, and the canonical
 * archive would then hold bytes nobody checked, published under the SHA this
 * build had already reported.
 *
 * ## What this can and cannot promise
 *
 * Binding to device and inode proves the object linked is the object hashed:
 * a REPLACEMENT (unlink-and-recreate, rename-over) changes the inode and is
 * caught. It does not by itself catch a same-user process writing THROUGH the
 * existing inode, so the bytes are re-hashed under the terminal hold as well,
 * and the canonical path is re-hashed after the link.
 *
 * Between the final hash and the link there remains an interval no same-user
 * check can close: a process with write access to the file can modify it at any
 * instant, including after the last read. That is a property of running as the
 * same user on a shared filesystem, not something this code can assert away.
 * It is narrowed to a few syscalls and stated here rather than dressed up as a
 * guarantee.
 */
export interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly sha: string;
}

/**
 * Identify a regular file exactly, or refuse.
 *
 * `lstat`, so a symlink is seen as a link rather than as its target, and a
 * device, socket or FIFO planted at the path is refused rather than read.
 */
export function identifyFile(path: string): FileIdentity {
  const st = lstatSync(path);
  if (st.isSymbolicLink()) {
    throw new Refusal(`${path} is a symbolic link, and a release artefact may not be one`);
  }
  if (!st.isFile()) {
    throw new Refusal(`${path} is not a regular file`);
  }
  return Object.freeze({ dev: st.dev, ino: st.ino, size: st.size, sha: sha256File(path) });
}

/** Every way two identities differ, named individually. */
export function identityProblems(
  what: string,
  expected: FileIdentity,
  actual: FileIdentity,
): readonly string[] {
  const problems: string[] = [];
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    problems.push(
      `${what} is a different file object from the one that was verified ` +
        `(device/inode ${String(expected.dev)}/${String(expected.ino)} became ` +
        `${String(actual.dev)}/${String(actual.ino)})`,
    );
  }
  if (actual.size !== expected.size) {
    problems.push(
      `${what} is ${String(actual.size)} bytes and the verified archive was ${String(expected.size)}`,
    );
  }
  if (actual.sha !== expected.sha) {
    problems.push(
      `${what} hashes to ${actual.sha} and the verified archive hashed to ${expected.sha}`,
    );
  }
  return problems;
}

/**
 * Every reason a resolved child destination may not be written to.
 *
 * ## Why lexical containment was not containment
 *
 * The previous edition compared `resolve()`d strings and then inspected the
 * LEAF. Both are blind to an ancestor: make `_review` a symbolic link to
 * somewhere else and `_review/.staging-<id>/rebuild/utc` still resolves,
 * lexically, to a path "beneath the repository" — while every byte a child
 * writes lands wherever that link points. The leaf inspection sees only a
 * directory that does not exist yet, which is exactly the safe-looking answer.
 *
 * So every component of the chain is lstatted from the repository root
 * outwards, and the deepest component that actually exists must realpath-
 * resolve inside the root. See `pathContainmentProblems`.
 */
export function rebuildSlotProblems(
  operationId: string,
  slot: unknown,
  requested: string | undefined,
): readonly string[] {
  const problems: string[] = [];
  if (!isRebuildSlot(slot)) {
    problems.push(`CHILD: ${JSON.stringify(slot)} is not a declared rebuild slot`);
    return problems;
  }
  const allowed = rebuildSlotDir(operationId, slot);
  if (requested !== undefined && resolve(requested) !== resolve(allowed)) {
    problems.push(
      "CHILD: a rebuild destination was supplied on the command line; destinations are " +
        "derived from the operation and the slot, never chosen by the caller",
    );
  }
  const rel = relative(REPO_ROOT, allowed).split(sep).join("/");
  if (rel.startsWith("..") || rel.length === 0) {
    problems.push("CHILD: the resolved destination is outside this operation's staging tree");
    return problems;
  }
  const expected = `_review/.staging-${operationId}/`;
  if (!rel.startsWith(expected)) {
    problems.push("CHILD: the resolved destination is outside this operation's staging tree");
  }
  /* EVERY COMPONENT, not the leaf: _review, the staging root and rebuild too. */
  for (const problem of pathContainmentProblems(REPO_ROOT, rel)) {
    problems.push(`CHILD: ${problem}`);
  }
  const state = inspectPath(REPO_ROOT, rel);
  if (state.kind === "unsafe") problems.push(`CHILD: ${state.why}`);
  return problems;
}

/**
 * Every reason this process may not act as the release operation's owner.
 *
 * FIVE THINGS HAVE TO AGREE, and each of them names itself when it does not.
 * A refusal that says only "cannot package" is a refusal somebody reads as the
 * one they were expecting — which is exactly how an ownership failure spent a
 * milestone disguised as the dirty-tree refusal that came before it.
 */
export function ownershipProblems(
  root: string,
  op: Operation | undefined,
  head: string,
  recordTreeId: string | undefined,
): readonly string[] {
  if (op === undefined) {
    return [
      "OWNERSHIP: no release operation was begun. A packager that does not hold the mutex " +
        "is a packager whose evidence can be replaced under it while it builds.",
    ];
  }
  if (op.kind !== "package") {
    return [
      `OWNERSHIP: the release operation is a ${op.kind} operation, not a package operation — ` +
        "a gate holds the mutex to measure, and measuring is not building",
    ];
  }
  try {
    assertOwner(root, op);
  } catch (e) {
    return [`OWNERSHIP: ${(e as Error).message}`];
  }

  const problems: string[] = [];
  if (op.head !== head) {
    problems.push(
      `OWNERSHIP: the package operation was begun at ${op.head.slice(0, 7)}, and this build is at ${head.slice(0, 7)}`,
    );
  }
  if (recordTreeId !== undefined && op.treeId !== recordTreeId) {
    problems.push(
      `OWNERSHIP: the package operation was begun against tree ${op.treeId.slice(0, 12)}, and the gate record describes tree ${recordTreeId.slice(0, 12)}`,
    );
  }
  return problems;
}

/**
 * Compare the record's recorded tree identity with the tree here and now.
 *
 * The gate records what it measured; this recomputes it. A record produced from
 * uncommitted edits that were reverted afterwards has a different
 * `inputsDigest` from the clean tree the packager sees, and that is the only
 * signal that distinguishes it from an honest one.
 */
/**
 * THREE NAMES FOR ONE BRANCH, AND ALL THREE MUST AGREE.
 *
 * The checkout's branch, the branch the gate recorded, and the one branch a
 * release may be cut from. A detached HEAD at the right commit and a second
 * branch pointing at the same commit are both refused: the commit being right
 * is not the same as the release being cut from where it claims. HEAD alone
 * cannot tell those apart, which is why the archive at `20ff3e0` could stage
 * `branch: null` beside prose naming the release branch.
 *
 * A free function over two strings so the rule can be exercised at every shape
 * — detached, a second branch at the same commit, a disagreeing record — none
 * of which can be produced by checking out this repository during its own test
 * run.
 */
export function branchProblems(recorded: unknown, actual: string): readonly string[] {
  const problems: string[] = [];
  if (actual !== REQUIRED_BRANCH) {
    problems.push(
      `the checkout is on ${actual === "HEAD" ? "a detached HEAD" : actual}, not ${REQUIRED_BRANCH}`,
    );
  }
  if (recorded !== actual) {
    problems.push(
      `the gate recorded branch ${JSON.stringify(recorded)} and this checkout is on ${JSON.stringify(actual)}`,
    );
  }
  return problems;
}

function recordTreeProblems(record: GateRecord | null): readonly string[] {
  if (record === null) return [];
  const now = treeIdentity(REPO_ROOT);
  const problemsOfBranch = [...branchProblems(record.branch, now.branch)];
  const problems = [
    ...treeProblems(REPO_ROOT, {
      branch: now.branch,
      head: now.head,
      treeId: now.treeId,
      inputsDigest: now.inputsDigest,
    }),
  ];
  if (record.treeId !== now.treeId) {
    problems.push(
      `the record was measured against tree ${String(record.treeId).slice(0, 12) || "nothing"}, and this tree is ${now.treeId.slice(0, 12)}`,
    );
  }
  if (record.inputsDigest !== now.inputsDigest) {
    problems.push(
      "the record's tracked-inputs digest does not match this tree — the gate measured " +
        "different bytes, and reverting them afterwards does not change what was measured",
    );
  }
  if (record.suiteInventoryDigest !== now.suiteInventoryDigest) {
    problems.push(
      "the record's expected-suite inventory does not match this tree — suites were added " +
        "or removed since the gate ran",
    );
  }
  return [...problemsOfBranch, ...problems];
}

/**
 * Every tracked file the package copied, and where it came from.
 *
 * Recorded during staging so the copies can be checked against the commit
 * rather than against the working tree they were read from.
 */
/**
 * ONE STAGING INVENTORY, BUILT WHILE COPYING AND FROZEN WHEN COPYING ENDS.
 *
 * The previous edition kept a MUTABLE MODULE GLOBAL, cleared at the top of each
 * staging run. Three rebuilds run in child processes and the parent stages too,
 * so "the inventory" was whichever run last wrote to it — and a check reading
 * it afterwards was reading state, not a record of what a particular staging
 * copied. An inventory that can be appended to after validation is not evidence
 * about the thing that was validated.
 */
export interface StagingInventory {
  readonly entries: readonly StagedOrigin[];
}

const emptyInventory: StagingInventory = Object.freeze({ entries: Object.freeze([]) });

/**
 * Prove every staged copy is byte-identical to HEAD's own tree object.
 *
 * ## Why sampling the working tree was not enough
 *
 * The tree was sampled before the build and again before publication, so a
 * change made after the first sample and restored before the last left no
 * trace — and the bytes copied into the archive in between were the changed
 * ones. Sampling more often narrows that window; it cannot close it, because
 * the thing sampled is not the thing copied.
 *
 * This compares the thing copied. Each staged file is read back and matched
 * against `git show HEAD:<origin>`, so a modification during staging is caught
 * no matter when it was restored — and the archive either carries the commit's
 * bytes or it is refused.
 */
export interface StagedOrigin {
  /** The tracked path in HEAD the copy was taken from. */
  readonly origin: string;
  /** Where the copy sits inside the staging directory, in POSIX form. */
  readonly staged: string;
}

/**
 * The one staged directory whose sources are GENERATED and deliberately not
 * tracked.
 *
 * `_sql-to-paste/` holds the paste-ready wrappers `wrap-migration.ts` writes
 * from the tracked migration sources; `.gitignore` excludes it on purpose, so
 * "must equal HEAD" is the wrong rule for it — there is nothing in HEAD to
 * equal. It is not unchecked: the `wrappers vs sources` gate proves each
 * wrapper is a verbatim copy of the tracked SQL it wraps, and the package
 * re-checks that independently.
 *
 * NAMED, not inferred. A rule that skipped anything git happened not to know
 * about would let an untracked file into the archive by being untracked, which
 * is the smuggling case this whole check exists to refuse.
 */
/**
 * The EXACT generated files a package may stage, and where each comes from.
 *
 * ## What "the directory is declared generated" let through
 *
 * The previous rule accepted any origin whose first path component was
 * `_sql-to-paste`. Independently proven, that accepted an arbitrary
 * `_sql-to-paste/evil.sql` — a file in no commit, checked by nothing, copied
 * into the archive because of the directory it sat in. It also accepted
 * deliberately WRONG bytes under a legitimate wrapper name, because the only
 * wrapper check in this file (`wrapperCheck`) reads the live repository copy
 * rather than the staged one. A later read of the working tree is not evidence
 * about bytes copied earlier.
 *
 * The allow-list is now derived from `WRAPPERS` itself, so it cannot drift, and
 * every entry is checked as a wrapper rather than waved through as generated.
 */
export type GeneratedOrigin =
  /** A paste wrapper: header plus a body that must equal its tracked source. */
  | { readonly kind: "wrapper"; readonly spec: (typeof WRAPPERS)[number] }
  /** A verbatim copy of a tracked verifier or prerequisite. */
  | { readonly kind: "verbatim"; readonly source: string }
  /**
   * A file with NO tracked source at all.
   *
   * `observer-verify-2.sql` and `observer-behaviour-2.sql` exist only in this
   * working directory: they are in no commit, no verifier directory holds them,
   * and nothing in the repository generates them. The package has shipped them
   * for many rounds, and the previous edition reported all eleven files here as
   * "generated (wrappers vs sources)" — which was true of four, true in a
   * different way of five, and simply false of these two.
   *
   * They are DECLARED rather than quietly accepted or silently dropped.
   * Dropping them would change what the archive contains; accepting them by
   * directory is what let an arbitrary file in. Declaring them means the count
   * a reviewer reads distinguishes "checked against a commit" from "shipped
   * with no source this repository can check it against".
   */
  | { readonly kind: "unsourced"; readonly why: string };

export const GENERATED_ORIGINS: ReadonlyMap<string, GeneratedOrigin> = new Map<
  string,
  GeneratedOrigin
>([
  ...WRAPPERS.map((spec) => [`_sql-to-paste/${spec.out}`, { kind: "wrapper", spec }] as const),
  [
    "_sql-to-paste/observer-cron-health.sql",
    { kind: "verbatim", source: "supabase/verifiers/observer-cron-health.sql" },
  ],
  [
    "_sql-to-paste/observer-contract-readiness.sql",
    { kind: "verbatim", source: "supabase/verifiers/observer-contract-readiness.sql" },
  ],
  [
    "_sql-to-paste/observer-http-compat-proof.sql",
    { kind: "verbatim", source: "supabase/verifiers/observer-http-compat-proof.sql" },
  ],
  [
    "_sql-to-paste/observer-ai-readiness.sql",
    { kind: "verbatim", source: "supabase/verifiers/observer-ai-readiness.sql" },
  ],
  [
    "_sql-to-paste/observer-cron-prerequisite.sql",
    { kind: "verbatim", source: "supabase/prerequisites/observer-cron-prerequisite.sql" },
  ],
  [
    "_sql-to-paste/observer-verify-2.sql",
    {
      kind: "unsourced",
      why: "no tracked source exists anywhere in the repository for this file",
    },
  ],
  [
    "_sql-to-paste/observer-behaviour-2.sql",
    {
      kind: "unsourced",
      why: "no tracked source exists anywhere in the repository for this file",
    },
  ],
]);

/**
 * Every reason one STAGED wrapper is not the wrapper it claims to be.
 *
 * Both halves are checked against the STAGED BYTES: the whole file must equal
 * `renderWrapper(spec)`, and the body between `begin;` and `commit;` must equal
 * the tracked source EXACTLY AS HEAD HOLDS IT — not as the working tree holds
 * it now, because a wrapper edited during staging and restored afterwards would
 * otherwise pass on the restored copy.
 */
export function stagedWrapperProblems(
  stagedPath: string,
  spec: (typeof WRAPPERS)[number],
): readonly string[] {
  const problems: string[] = [];
  let staged: string;
  try {
    staged = readFileSync(stagedPath, "utf8");
  } catch {
    return [`${spec.out} was recorded as staged and cannot be read`];
  }
  if (staged !== renderWrapper(spec)) {
    problems.push(`the staged ${spec.out} is not what renderWrapper produces for its source`);
  }
  let committed: Buffer;
  try {
    committed = execFileSync("git", ["show", `HEAD:${spec.source}`], {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "buffer",
    });
  } catch {
    return [...problems, `${spec.source} is not in HEAD, so ${spec.out} cannot be checked`];
  }
  let body: string;
  try {
    body = extractBody(staged);
  } catch {
    return [...problems, `the staged ${spec.out} has no begin;/commit; pair`];
  }
  if (!Buffer.from(body, "utf8").equals(committed)) {
    problems.push(`the staged ${spec.out} body is not byte-identical to HEAD:${spec.source}`);
  }
  return problems;
}

/**
 * Every category the origin check found, so none can hide inside another.
 *
 * The previous edition reported one number, "generated", for eleven files that
 * were verified three different ways — four against `renderWrapper`, five
 * against a tracked verifier, and two against nothing at all, because nothing
 * tracked exists to compare them with. One number cannot say that.
 */
export interface StagedOriginResult {
  readonly problems: readonly string[];
  /** Copies proved byte-identical to HEAD. */
  readonly matchedHead: number;
  /** Paste wrappers whose staged bytes match renderWrapper and HEAD's source. */
  readonly wrappers: number;
  /** Verbatim copies proved byte-identical to HEAD's verifier or prerequisite. */
  readonly verbatim: number;
  /** Declared files with no tracked source. NOT verified, and never counted as such. */
  readonly unsourced: number;
}

export function stagedOriginResult(
  dir: string,
  inventory: StagingInventory = emptyInventory,
): StagedOriginResult {
  const problems: string[] = [];
  const origins = inventory.entries;
  let matchedHead = 0;
  let wrappers = 0;
  let verbatim = 0;
  let unsourced = 0;
  if (origins.length === 0) {
    return {
      problems: ["no staged file recorded its tracked origin — the copies cannot be checked"],
      matchedHead: 0,
      wrappers: 0,
      verbatim: 0,
      unsourced: 0,
    };
  }

  for (const { origin, staged } of origins) {
    const path = join(dir, ...staged.split("/"));
    if (!existsSync(path)) {
      problems.push(`${staged} was recorded as staged and is not present`);
      continue;
    }
    let committed: Buffer | null = null;
    try {
      committed = execFileSync("git", ["show", `HEAD:${origin}`], {
        cwd: REPO_ROOT,
        maxBuffer: 64 * 1024 * 1024,
        encoding: "buffer",
      });
    } catch {
      committed = null;
    }
    if (committed === null) {
      /*
       * NOT IN HEAD. Allowed only from a directory declared generated, and
       * counted separately even then — a number that says "eleven files were
       * not checked against a commit" is evidence; silence is not.
       */
      const declared = GENERATED_ORIGINS.get(origin);
      if (declared !== undefined) {
        if (declared.kind === "wrapper") {
          const wrong = stagedWrapperProblems(path, declared.spec);
          if (wrong.length > 0) problems.push(...wrong);
          else wrappers += 1;
          continue;
        }
        if (declared.kind === "verbatim") {
          /*
           * A VERBATIM COPY, compared with HEAD's bytes for its source — not
           * with the working tree's, for the same reason every other staged
           * file is compared with the commit.
           */
          let source: Buffer;
          try {
            source = execFileSync("git", ["show", `HEAD:${declared.source}`], {
              cwd: REPO_ROOT,
              maxBuffer: 64 * 1024 * 1024,
              encoding: "buffer",
            });
          } catch {
            problems.push(`${declared.source} is not in HEAD, so ${origin} cannot be checked`);
            continue;
          }
          if (!readFileSync(path).equals(source)) {
            problems.push(`${origin} is not byte-identical to HEAD:${declared.source}`);
          } else verbatim += 1;
          continue;
        }
        /*
         * DECLARED UNSOURCED. Counted separately and never counted as verified:
         * the whole point of the field is that this package cannot check it.
         */
        unsourced += 1;
        continue;
      }
      problems.push(`${origin} is staged and is not in HEAD`);
      continue;
    }
    if (!readFileSync(path).equals(committed)) {
      problems.push(
        `${staged} does not match HEAD:${origin} — the working tree changed between the ` +
          "gate and this staging, and restoring it afterwards does not change what was copied",
      );
      continue;
    }
    matchedHead += 1;
  }
  return { problems, matchedHead, wrappers, verbatim, unsourced };
}

export function stagedOriginProblems(
  dir: string,
  inventory: StagingInventory = emptyInventory,
): readonly string[] {
  return stagedOriginResult(dir, inventory).problems;
}

/** Build an inventory from plain entries, so a test can drive the checks. */
export function stagingInventoryOf(entries: readonly StagedOrigin[]): StagingInventory {
  return Object.freeze({ entries: Object.freeze([...entries]) });
}

/**
 * Whether an inventory COVERS a complete package staging, in both directions.
 *
 * Separate from the per-entry byte checks because it asks a different question.
 * Those answer "is this copy the bytes it claims to be"; this answers "is this
 * the set of things a package stages at all" — and the two failed in different
 * ways. The per-entry check was one-way: it verified everything recorded and
 * said nothing about a file somebody added, or about a declared wrapper that
 * had quietly stopped being staged.
 *
 * The wrapper set is derived from `WRAPPERS`, so missing and surplus are both
 * detectable and are named separately.
 */
export function stagingCoverageProblems(
  dir: string,
  inventory: StagingInventory,
): readonly string[] {
  const problems: string[] = [];
  const origins = inventory.entries;

  const seen = new Set<string>();
  for (const { staged } of origins) {
    if (seen.has(staged)) problems.push(`${staged} is claimed by more than one origin`);
    seen.add(staged);
  }

  const stagedWrappers = new Set(
    origins.map((o) => o.origin).filter((o) => o.startsWith("_sql-to-paste/")),
  );
  for (const expected of GENERATED_ORIGINS.keys()) {
    if (!stagedWrappers.has(expected)) problems.push(`${expected} is declared and was not staged`);
  }
  for (const actual of stagedWrappers) {
    if (!GENERATED_ORIGINS.has(actual)) {
      problems.push(
        `${actual} is not one of the ${String(GENERATED_ORIGINS.size)} declared generated files — ` +
          "a file is not generated evidence merely because of the directory it sits in",
      );
    }
  }

  /*
   * AND EVERY STAGED FILE HAS AN ORIGIN. The evidence documents and the
   * manifest are written by this build rather than copied, so they are named
   * here as the only files allowed to have no origin; anything else present in
   * the staging tree and absent from the inventory arrived from somewhere this
   * build cannot account for.
   */
  const rendered = new Set([
    "hashes.txt",
    "gate-results.json",
    ...readdirSync(join(REPO_ROOT, "docs/release"))
      .filter((f) => f.endsWith(".txt"))
      .map((f) => f),
  ]);
  for (const path of walk(dir)) {
    const name = relative(dir, path).split(sep).join("/");
    if (rendered.has(name)) continue;
    /*
     * `patches/` is written by `git format-patch` during this build rather than
     * copied from anywhere, so those files have no origin by construction. They
     * are not unchecked: the transport-safe declaration governs which may carry
     * control bytes, and the chain is regenerated and replayed by the suite.
     */
    if (name.startsWith("patches/")) continue;
    if (!seen.has(name)) {
      problems.push(`${name} is staged and no inventory entry names it`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------
   2. Staging: every input from a tracked source.
------------------------------------------------------------------------- */

function stage(dir: string, evidence: CapturedEvidence | null): StagingInventory {
  rmSync(dir, { recursive: true, force: true });
  /*
   * THE STAGING SUBDIRECTORIES, each checked to its root first. `dir` is inside
   * the operation's own staging tree, which `safeMkdir` has already proved, but
   * these are created afterwards and a link planted at one of them in between
   * would redirect every copy that follows.
   */
  for (const sub of ["patches", "supabase-migrations", "generators"]) {
    safeMkdirAt(join(dir, sub));
  }

  execFileSync(
    "git",
    ["format-patch", "1ee5d2d..HEAD", "-o", join(dir, "patches"), "--no-signature", "-q"],
    {
      cwd: REPO_ROOT,
    },
  );

  encodeDeclaredPatches(join(dir, "patches"));

  /* LOCAL to this staging run, and frozen when it ends. */
  const recorded: StagedOrigin[] = [];
  const copyAll = (from: string, to: string, filter: (f: string) => boolean): void => {
    for (const f of readdirSync(join(REPO_ROOT, from)).sort()) {
      if (!filter(f)) continue;
      copyFileSync(join(REPO_ROOT, from, f), join(dir, to, f));
      /*
       * WHERE IT CAME FROM, so the copy can be checked against the COMMIT
       * rather than against the working tree it was read from.
       */
      recorded.push({
        origin: `${from}/${f}`,
        staged: to === "." ? f : `${to}/${f}`,
      });
    }
  };

  const isSql = (f: string): boolean => f.endsWith(".sql");
  copyAll("_sql-to-paste", ".", isSql);
  copyAll(MIGRATIONS_DIR, "supabase-migrations", isSql);
  copyAll("supabase/verifiers", "supabase-migrations", isSql);
  copyAll("supabase/prerequisites", "supabase-migrations", isSql);
  copyAll("scripts/release", "generators", (f) => f.endsWith(".ts"));
  /*
   * AND THE DATA THOSE GENERATORS READ.
   *
   * `gate-contract.ts` was staged and `secret-patterns.json` was not, because
   * only `.ts` was copied from this directory. The archive therefore shipped a
   * secret detector that loads a file the archive does not contain: a reader
   * running it from the package gets a module-not-found error, and the "one
   * definition, loaded by both systems" claim was true of the repository and
   * false of the thing handed over.
   */
  copyAll("scripts/release", "generators", (f) => f.endsWith(".json"));
  copyAll("docs/release", "generators", (f) => f.endsWith(".txt"));
  copyAll("docs/release", "generators", (f) => f.endsWith(".json"));

  /*
   * THE CAPTURED PROJECTION, WRITTEN VERBATIM.
   *
   * Not re-read, not re-projected, not re-serialised. The bytes staged here are
   * the bytes the contract validated, and the same object rendered the
   * documents — because the archive that shipped a staged record with no
   * `pnpm test` gate got there by validating one object and staging another.
   */
  if (evidence === null) throw new Refusal("no captured evidence to stage");
  writeFileSync(join(dir, "gate-results.json"), evidence.json, "utf8");

  return Object.freeze({ entries: Object.freeze([...recorded]) });
}

/**
 * Replace the DECLARED historical patches with byte-exact base64 sidecars.
 *
 * Only the commits named in `transport-safe.ts`. A control character in any
 * other patch — or anywhere else in the package — is a failure, not something
 * to encode away, which is why this is keyed on the commit rather than on
 * "whatever happens to contain one".
 */
function encodeDeclaredPatches(patchDir: string): void {
  const encoded: string[] = [];
  const measured: { name: string; bytes: ControlByteDistribution }[] = [];
  for (const file of readdirSync(patchDir).sort()) {
    if (!file.endsWith(".patch")) continue;
    const path = join(patchDir, file);
    const bytes = readFileSync(path);
    const text = bytes.toString("utf8");
    if (!isDeclaredHistorical(text)) continue;

    /*
     * MEASURED BEFORE ENCODING, from the very bytes about to be encoded. The
     * note beside these files used to describe where the control characters
     * sat, and described them wrongly for two of the three patches, so it now
     * reports what was counted rather than what somebody remembered.
     */
    measured.push({ name: `${file}.base64`, bytes: controlByteDistribution(text) });

    /* Wrapped, so the sidecar is ordinary text rather than one enormous line. */
    const body64 = bytes.toString("base64").replace(/(.{76})/g, "$1\n");
    writeFileSync(`${path}.base64`, `${body64}\n`, "utf8");
    rmSync(path);
    encoded.push(`${file}.base64`);
  }
  if (encoded.length > 0) {
    writeFileSync(
      join(patchDir, "TRANSPORT-SAFE.txt"),
      transportSafeNote(encoded, measured),
      "utf8",
    );
  }
}

/* -------------------------------------------------------------------------
   3. Rendering, and the checks that refuse a bad package.
------------------------------------------------------------------------- */

interface Rendered {
  readonly name: string;
  readonly text: string;
}

function renderEvidence(dir: string, stagedFiles: number): readonly Rendered[] {
  const values = facts({ stagedFiles });
  const out: Rendered[] = [];
  const unused = new Set(Object.keys(values));

  for (const file of readdirSync(join(REPO_ROOT, "docs/release")).sort()) {
    if (!file.endsWith(".txt")) continue;
    const template = readFileSync(join(REPO_ROOT, "docs/release", file), "utf8");
    for (const token of template.match(/\{\{([A-Z0-9_]+)\}\}/g) ?? [])
      unused.delete(token.slice(2, -2));
    const { out: text, missing } = render(template, values);
    if (missing.length > 0) {
      throw new Refusal(`${file} has unresolved placeholders: ${missing.join(" ")}`);
    }
    writeFileSync(join(dir, file), text, "utf8");
    out.push({ name: file, text });
  }

  if (unused.size > 0) {
    throw new Refusal(
      `facts() defines values no template uses: ${[...unused].sort().join(" ")}.\n` +
        `A fact nobody states is a fact nobody checks.`,
    );
  }
  return out;
}

/**
 * Do the rendered artefacts agree with git and with the recorded snapshot?
 *
 * THIS IS THE CHECK THE LAST PACKAGE NEEDED. Its hash accounting passed on a
 * file that named `c6fdc73` as the current candidate one commit after it
 * stopped being one: the prose was stale and its file hash was correct, which
 * is exactly the failure a hash cannot see.
 */
function semanticChecks(rendered: readonly Rendered[]): readonly string[] {
  const problems: string[] = [];
  const head = git("rev-parse", "HEAD");
  const short = head.slice(0, 7);
  const parentShort = baselineCommit().slice(0, 7);
  const find = (name: string): string => rendered.find((r) => r.name === name)?.text ?? "";

  const compat = find("COMPATIBILITY-EVIDENCE.txt");
  const review = find("REVIEW.txt");
  const retention = find("RETENTION-EVIDENCE.txt");
  const all = rendered.map((r) => r.text).join("\n");

  const require_ = (ok: boolean, why: string): void => {
    if (!ok) problems.push(why);
  };

  /* Current HEAD. */
  require_(
    compat.includes(head),
    "COMPATIBILITY-EVIDENCE.txt does not state the full current HEAD",
  );
  require_(review.includes(head), "REVIEW.txt does not state the full current HEAD");
  require_(
    compat.includes(`  ${short}    not deployed`),
    `the compatibility table does not name ${short} as the current candidate`,
  );

  /* Remote and deployed heads. */
  for (const ref of ["origin/release/observer-demo-rc1", "origin/main"] as const) {
    const sha = git("rev-parse", ref);
    require_(all.includes(sha), `no artefact states ${ref} (${sha.slice(0, 7)})`);
  }

  /* Local-only classification: every unpushed commit named, none deployed. */
  const localOnly = git("log", "--format=%h", "origin/release/observer-demo-rc1..HEAD")
    .split("\n")
    .filter((l) => l.length > 0);
  const deployed = new Set(DEPLOYMENTS.map((d) => d.sha));
  for (const c of localOnly) {
    require_(compat.includes(c), `COMPATIBILITY-EVIDENCE.txt omits local-only commit ${c}`);
    if (!deployed.has(c)) {
      const block = /NOT DEPLOYED:[\s\S]*?\./.exec(compat)?.[0] ?? "";
      require_(block.includes(c), `${c} is not deployed but is missing from the NOT DEPLOYED set`);
    }
  }
  /*
   * Bounded to the block itself. An unbounded lazy match ran on to the end of
   * the document and found a deployed SHA in a later section, reporting a
   * contradiction that was not there.
   */
  const notDeployedBlock = /NOT DEPLOYED:[^.]*\./.exec(compat)?.[0] ?? "";
  for (const sha of deployed) {
    require_(
      !notDeployedBlock.includes(sha),
      `the NOT DEPLOYED set names ${sha}, which is deployed`,
    );
  }

  /* The live observation: one timestamp, one bucket age, everywhere. */
  require_(
    retention.includes(LIVE.observedAt),
    "RETENTION-EVIDENCE.txt does not state the observation timestamp",
  );
  require_(review.includes(LIVE.observedAt), "REVIEW.txt does not state the observation timestamp");
  for (const [name, text] of [
    ["RETENTION-EVIDENCE.txt", retention],
    ["REVIEW.txt", review],
    ["COMPATIBILITY-EVIDENCE.txt", compat],
  ] as const) {
    const hours = [...text.matchAll(/oldest[^\n]*?(\d+)\s*hours|(\d+)\s*hours[^\n]*?rising/gi)]
      .map((m) => Number(m[1] ?? m[2]))
      .filter((n) => Number.isFinite(n));
    for (const h of hours) {
      require_(
        h === LIVE.oldestBucketHours,
        `${name} states an oldest-bucket age of ${h} hours; the snapshot says ${LIVE.oldestBucketHours}`,
      );
    }
  }

  /*
   * The inventory provenance must name the bundle Vercel was actually
   * enumerated for — an explicit field, NOT the last entry of the list of
   * bundles that merely carried the recording forward. Deriving one from the
   * other is how "last enumerated for e18f860" got written about an
   * enumeration that happened at f1dbffd.
   */
  require_(
    all.includes(LAST_VERCEL_ENUMERATION),
    `no artefact names ${LAST_VERCEL_ENUMERATION}, the bundle the inventory was last enumerated for`,
  );

  /*
   * SNAPSHOT FRESHNESS, derived rather than believed.
   *
   * The previous package asserted "no Supabase query was made this round",
   * "verified by one live query, the only external access this milestone made",
   * "re-read this round" and "the oldest bucket is now N hours" — four claims
   * that cannot all hold. Freshness language is only permitted when
   * `live-snapshot.ts` actually changed since the last delivered bundle. A
   * document may still QUOTE the wording it is retracting; it may not assert it.
   */
  if (!snapshotRecordChanged(baselineCommit())) {
    const FRESH =
      /re-read this round|read this round|the only external access this milestone made|still rising|is now \d+ hours|oldest bucket is now/gi;
    for (const { name, text } of rendered) {
      for (const m of text.matchAll(FRESH)) {
        const around = text.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 200);
        const retracting =
          /cannot all be true|asserted|earlier edition|an earlier|those cannot/i.test(around);
        require_(
          retracting,
          `${name} claims freshness ("${m[0]}") for a snapshot that was carried forward, not re-read`,
        );
      }
    }
  }

  /*
   * A NAMED PRESERVED RECORD MUST EXIST.
   *
   * The evidence now names the two red gate attempts that preceded the
   * authorised history repair, and points at the files holding their sanitized
   * records. A document naming a record the repository does not hold is worse
   * than one that says nothing — so the rendered text is read back and each
   * named path is checked.
   *
   * The records are deliberately NOT packaged: they are local operational state
   * for whoever holds this working directory, not evidence a reviewer can open.
   * What is checked is that the claim about them is true here.
   */
  for (const attempt of RED_GATE_ATTEMPTS) {
    require_(
      review.includes(attempt.record),
      `REVIEW.txt does not name the preserved record for ${attempt.commit}`,
    );
    require_(
      existsSync(join(REPO_ROOT, attempt.record)),
      `${attempt.record} is named in the evidence and is not in this repository`,
    );
    require_(
      review.includes(attempt.commit),
      `REVIEW.txt does not name the red gate attempt at ${attempt.commit}`,
    );
  }
  /*
   * AND THE REPAIR DOES NOT RETRACT THEM. Two red results and a history repair
   * are different facts, and the document must not read as though the second
   * undid the first.
   */
  require_(
    !HISTORY_REPAIR.retractsGateResults && review.includes("does not retract either gate result"),
    "REVIEW.txt does not say that the history repair leaves both gate results standing",
  );

  /* Executable SQL: the claim and the computed hashes must agree. */
  const contractPath = `${MIGRATIONS_DIR}/20260826090000_observer_audit_facade_cleanup.sql`;
  const now = createHash("sha256")
    .update(strip(readFileSync(join(REPO_ROOT, contractPath), "utf8")))
    .digest("hex");
  require_(
    now === execSha(`${parentShort}`, contractPath),
    "the contract migration's executable SQL changed since the previous commit",
  );
  require_(
    review.includes(now),
    "REVIEW.txt does not state the contract migration's executable SQL hash",
  );

  return problems;
}

/**
 * Every hex token of eight or more characters in an evidence file must be a
 * prefix of a hash this package can account for. Pure-decimal runs are
 * migration timestamps and are skipped.
 */
/**
 * Every hash-shaped token in a piece of evidence.
 *
 * `[0-9a-f]{8,}` with at least one letter in it — a run of digits alone is a
 * timestamp, not a digest. Exported so a fast test can apply the SAME rule the
 * packager applies, rather than a second copy of it that can drift.
 */
export function hashTokens(text: string): readonly { line: number; token: string }[] {
  const found: { line: number; token: string }[] = [];
  text.split("\n").forEach((line, i) => {
    for (const token of line.match(/[0-9a-f]{8,}/g) ?? []) {
      if (!/[a-f]/.test(token)) continue;
      found.push({ line: i + 1, token });
    }
  });
  return found;
}

/**
 * Every digest this repository can account for, without building anything.
 *
 * EXPORTED, so a fast test applies the same allow-set the packager applies
 * rather than a narrower copy that turns into a list of exceptions. The
 * packager adds one thing to it — the hash of every file it just staged — and
 * that is permissiveness a DOCUMENT should never need: a document citing a
 * digest that exists only inside the archive being built is citing something a
 * reader cannot check.
 */
export function accountableHashes(): ReadonlySet<string> {
  const allowed = new Set<string>();

  const m4 = `${MIGRATIONS_DIR}/20260826140000_observer_bucket_retention.sql`;
  const contract = `${MIGRATIONS_DIR}/20260826090000_observer_audit_facade_cleanup.sql`;
  for (const c of ["HEAD", "HEAD~1", "bb574b6", "7e3c00a", "ee954b8", "c6fdc73", "f1dbffd"]) {
    for (const path of [m4, contract]) {
      allowed.add(execSha(c, path));
      allowed.add(fileShaAt(c, path));
    }
  }
  for (const line of git("rev-list", "1ee5d2d^..HEAD").split("\n")) {
    const sha = line.trim();
    if (sha.length === 0) continue;
    allowed.add(sha);
    /*
     * And the TREE each commit points at. REVIEW §1A cites one to show that
     * rewriting the two local-only commits changed no content: identical trees
     * either side of the rewrite is a stronger claim than "the diff looked the
     * same", and a citation nothing can account for should fail the build.
     */
    allowed.add(git("rev-parse", `${sha}^{tree}`));
  }
  /*
   * The net diff across the authorised rewrite, hashed. COMPUTED, never copied:
   * if the equality the review claims ever stopped holding, this token would
   * become unaccounted for and refuse the package instead of ageing quietly
   * into prose that nobody rechecks.
   */
  allowed.add(
    createHash("sha256")
      .update(
        execFileSync("git", ["diff", `${REWRITE.base}..${REWRITE.head}`], {
          cwd: REPO_ROOT,
          maxBuffer: 64 * 1024 * 1024,
        }),
      )
      .digest("hex"),
  );
  for (const ref of ["origin/release/observer-demo-rc1", "origin/main"])
    allowed.add(git("rev-parse", ref));
  /* The migration-4 paste wrapper as verified in the previous review. */
  allowed.add("a2ec32264583f5d57b87d0db089d4a707de8b317786624084a4e4a2b61b1eef5");
  /*
   * The archives already handed over. Declared in live-snapshot.ts rather than
   * recovered by opening seven ZIPs, which is what made the previous packager
   * unable to run in a fresh clone.
   */
  for (const a of DELIVERED_ARCHIVES) allowed.add(a.sha256);

  return allowed;
}

/** Every hash-shaped token in `text` that nothing in `allowed` accounts for. */
export function unaccountedTokens(
  name: string,
  text: string,
  allowed: ReadonlySet<string>,
): readonly string[] {
  const problems: string[] = [];
  for (const { line, token } of hashTokens(text)) {
    if (![...allowed].some((h) => h.startsWith(token))) {
      problems.push(`${name}:${String(line)}  ${token}  accounted for by nothing in this package`);
    }
  }
  return problems;
}

function hashAccounting(dir: string, rendered: readonly Rendered[]): readonly string[] {
  const allowed = new Set<string>(accountableHashes());
  /* Plus what this build just staged, which only the build can know. */
  for (const p of walk(dir)) allowed.add(sha256File(p));

  const problems: string[] = [];
  let checked = 0;
  for (const { name, text } of rendered) {
    checked += hashTokens(text).length;
    problems.push(...unaccountedTokens(name, text, allowed));
  }
  say(`  hash accounting          ${checked} tokens, ${problems.length} unaccounted`);
  return problems;
}

/**
 * Verify an inflated archive against the `hashes.txt` it contains.
 *
 * EVERY DIRECTION. A manifest that lists a file the archive lacks, an archive
 * carrying a file the manifest does not list, a digest that does not match, or
 * a path listed twice — each is its own failure, and each was invisible to a
 * check that compared one outer checksum against itself.
 */
/**
 * Everything a reviewer would run against an archive, run against THIS one.
 *
 * Extracted so it can be applied twice: once to the archive this build wrote,
 * and again to the file at the canonical path after publication. Those are two
 * different objects until something proves otherwise, and only the second is
 * the one anybody receives.
 */
export interface ArchiveIntegrity {
  readonly entries: number;
  readonly manifestChecked: number;
  readonly scannedFiles: number;
}

/**
 * Every staged path and the digest of its bytes, taken once validation passes.
 *
 * ## Why the archive is compared with a map rather than with the directory
 *
 * The ZIP is written from the staging directory, and the directory is still on
 * disk afterwards. Comparing the inflated archive with the directory therefore
 * compares it with whatever the directory holds NOW — which is the same
 * time-of-check/time-of-use gap the staged-origin check exists to close, moved
 * one step later.
 *
 * So the moment validation succeeds, the exact bytes are reduced to a frozen
 * map, and everything afterwards is held to that.
 */
export type ByteMap = ReadonlyMap<string, string>;

export function byteMapOf(dir: string): ByteMap {
  const map = new Map<string, string>();
  for (const path of walk(dir)) {
    map.set(relative(dir, path).split(sep).join("/"), sha256File(path));
  }
  return map;
}

/** Every way an inflated tree differs from the snapshot that was validated. */
export function byteMapProblems(expected: ByteMap, actual: ByteMap): readonly string[] {
  const problems: string[] = [];
  for (const [name, sha] of expected) {
    const got = actual.get(name);
    if (got === undefined) problems.push(`${name} was staged and is not in the archive`);
    else if (got !== sha) problems.push(`${name} does not hold the bytes that were validated`);
  }
  for (const name of actual.keys()) {
    /* The manifest is written after the snapshot and is verified separately. */
    if (name === "hashes.txt") continue;
    if (!expected.has(name)) problems.push(`${name} is in the archive and was never staged`);
  }
  return problems;
}

export function verifyArchiveIntegrity(
  archive: string,
  work: string,
  expected?: ByteMap,
): ArchiveIntegrity {
  execFileSync("unzip", ["-t", archive], { cwd: work, stdio: "ignore" });

  const inflated = mkdtempSync(join(tmpdir(), "observer-verify-"));
  try {
    execFileSync("unzip", ["-q", archive, "-d", inflated], { stdio: "ignore" });
    const problems = verifyEmbeddedManifest(inflated);
    if (problems.length > 0) {
      throw new Refusal(
        `the archive's own manifest does not verify:\n${problems.map((x) => `  ${x}`).join("\n")}`,
      );
    }
    const scan = scanDirectory(inflated);
    if (
      scan.foundCharacters !== 0 ||
      scan.readFailures !== 0 ||
      scan.scannedFiles !== scan.requestedFiles
    ) {
      throw new Refusal(
        `the inflated archive scan is not complete and clean: ${describeScan(scan)}`,
      );
    }

    /*
     * AND THE INFLATED TREE IS THE VALIDATED SNAPSHOT, byte for byte, in both
     * directions. A file that was staged and is absent, a file whose bytes
     * changed, and a file that appeared from nowhere are three different
     * failures and all three are named.
     */
    if (expected !== undefined) {
      const drift = byteMapProblems(expected, byteMapOf(inflated));
      if (drift.length > 0) {
        throw new Refusal(
          "the archive does not hold the bytes that were validated:\n" +
            drift
              .slice(0, 12)
              .map((x) => `  ${x}`)
              .join("\n"),
        );
      }
    }
    /*
     * AND THE STANDARD CHECKER, ON THE MANIFEST ITSELF.
     *
     * Exit zero AND empty stderr: a checker that prints warnings while exiting
     * zero has not verified anything quietly.
     */
    const check = spawnSync("sha256sum", ["-c", "hashes.txt"], {
      cwd: inflated,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (check.status !== 0) {
      throw new Refusal(
        `sha256sum -c hashes.txt failed inside the inflated archive (status ${String(check.status)})`,
      );
    }
    if ((check.stderr ?? "") !== "") {
      throw new Refusal(
        "sha256sum -c hashes.txt wrote to stderr inside the inflated archive; a manifest " +
          "check that warns has not verified silently",
      );
    }
    const manifestChecked = (check.stdout ?? "")
      .split("\n")
      .filter((l) => l.endsWith(": OK")).length;
    return {
      entries: scanArchive(archive).entries,
      manifestChecked,
      scannedFiles: scan.scannedFiles,
    };
  } finally {
    rmSync(inflated, { recursive: true, force: true });
  }
}

export function verifyEmbeddedManifest(root: string): readonly string[] {
  const problems: string[] = [];
  const manifestPath = join(root, "hashes.txt");
  if (!existsSync(manifestPath)) return ["hashes.txt is not in the archive"];

  const listed = new Map<string, string>();
  for (const line of readFileSync(manifestPath, "utf8").split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue;
    const m = /^([0-9a-f]{64})\s+(.+)$/.exec(line.trim());
    if (m === null) {
      problems.push(
        `manifest line is not a digest and a path: ${JSON.stringify(line.slice(0, 60))}`,
      );
      continue;
    }
    const [, digest, path] = m;
    if (listed.has(path ?? "")) problems.push(`${String(path)} is listed twice`);
    listed.set(path ?? "", digest ?? "");
  }

  const present = new Set(
    walk(root)
      .map((f) => relative(root, f).split(sep).join("/"))
      .filter((f) => f !== "hashes.txt"),
  );

  for (const [path, digest] of listed) {
    if (!present.has(path)) {
      problems.push(`${path} is manifested and absent from the archive`);
      continue;
    }
    const actual = sha256File(join(root, ...path.split("/")));
    if (actual !== digest) problems.push(`${path} does not match its manifested digest`);
  }
  for (const path of present) {
    if (!listed.has(path)) problems.push(`${path} is in the archive and not manifested`);
  }
  return problems;
}

function recipeCheck(dir: string): readonly string[] {
  const problems: string[] = [];
  for (const path of walk(dir)) {
    const name = relative(dir, path).split(sep).join("/");
    if (!inScope(name)) continue;
    for (const o of scanText(readFileSync(path, "utf8"))) {
      problems.push(`${name}:${o.line}  ${o.kind}  ${o.text.slice(0, 90)}`);
    }
  }
  return problems;
}

/**
 * The REPOSITORY wrappers, checked against the repository sources.
 *
 * A hygiene check on the working tree, and deliberately NOT evidence about what
 * was staged. It reads `_sql-to-paste/` live, so a wrapper edited during staging
 * and restored before this runs would pass here while the archive carried the
 * edited bytes. `stagedWrapperProblems` is the staged-byte check, and neither
 * substitutes for the other.
 */
function wrapperCheck(): readonly string[] {
  const problems: string[] = [];
  for (const spec of WRAPPERS) {
    const path = join(REPO_ROOT, "_sql-to-paste", spec.out);
    if (!existsSync(path)) {
      problems.push(`${spec.out} is missing; run pnpm release:wrappers`);
      continue;
    }
    const wrapper = readFileSync(path, "utf8");
    if (wrapper !== renderWrapper(spec)) problems.push(`${spec.out} does not match its source`);
    if (extractBody(wrapper) !== readFileSync(join(REPO_ROOT, spec.source), "utf8")) {
      problems.push(`${spec.out} body is not byte-identical to ${spec.source}`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------
   4. The manifest, in a form a standard checker consumes silently.
------------------------------------------------------------------------- */

function writeManifest(dir: string, head: string): number {
  const files = walk(dir)
    .map((p) => relative(dir, p).split(sep).join("/"))
    .filter((n) => n !== "hashes.txt")
    .sort();

  const lines = [
    "# IRIS OBSERVER — SHA-256 MANIFEST",
    `# Commit ${head}`,
    "#",
    "# Every prose line here starts with '#', so a standard checker consumes this",
    "# file without warnings:",
    "#",
    "#   sha256sum -c hashes.txt        (POSIX)",
    "#   Get-FileHash -Algorithm SHA256 (Windows, one file at a time)",
    "#",
    "# hashes.txt is not listed in hashes.txt: a file cannot contain its own",
    "# digest. Neither is the archive's SHA-256, for the same reason one level up",
    "# — embedding it would change the bytes it describes. The packager prints it",
    "# and the covering report states it; distribute it ALONGSIDE the archive.",
    "#",
    ...files.map((n) => `${sha256File(join(dir, n))}  ${n}`),
    `# ${files.length} files.`,
    "",
  ];
  writeFileSync(join(dir, "hashes.txt"), lines.join("\n"), "utf8");
  return files.length;
}

/* -------------------------------------------------------------------------
   5. Build.
------------------------------------------------------------------------- */

export function build(
  outDir: string,
  options: BuildOptions = {},
): {
  archive: string;
  sha: string;
  entries: number;
  manifest: number;
  /** The finished-directory scan, so a caller can report it separately. */
  staged: ControlCharacterScan;
  /** The same measurement taken from the written archive, inflated. */
  inArchive: { entries: number; foundCharacters: number; affectedFiles: string[] };
  /** The exact bytes that passed validation, frozen before the ZIP was written. */
  validated: ByteMap;
} {
  const { head, short, evidence } = requireCleanHead(options);
  say(`building the ${short} package`);
  const archiveDir = options.archiveDir ?? outDir;

  /*
   * The documents render from the captured projection too, so section 7 and
   * the staged `gate-results.json` cannot describe different runs.
   */
  useCapturedGateResults(evidence.staged);
  try {
    return buildFrom(outDir, short, head, evidence, archiveDir);
  } finally {
    useCapturedGateResults(null);
  }
}

function buildFrom(
  outDir: string,
  short: string,
  head: string,
  evidence: CapturedEvidence,
  archiveDir: string,
): {
  archive: string;
  sha: string;
  entries: number;
  manifest: number;
  staged: ControlCharacterScan;
  inArchive: { entries: number; foundCharacters: number; affectedFiles: string[] };
  /** The exact bytes that passed validation, frozen before the ZIP was written. */
  validated: ByteMap;
} {
  const dir = join(outDir, short);
  /*
   * THE STAGING ROOT, CHECKED TO THE REPOSITORY ROOT BEFORE ANYTHING IS COPIED.
   * `outDir` is `_review` or an operation slot beneath it, and either can be
   * redirected by a link at any ancestor. Every component is lstatted here.
   */
  safeMkdirAt(dir);
  const inventory = stage(dir, evidence);
  const copied = walk(dir).length;
  /* The evidence files are staged too; they are written by the render below. */
  const evidenceCount = readdirSync(join(REPO_ROOT, "docs/release")).filter((f) =>
    f.endsWith(".txt"),
  ).length;
  const stagedFiles = copied + evidenceCount;
  say(
    `  staged                   ${copied} copied + ${evidenceCount} rendered = ${stagedFiles} files`,
  );

  const rendered = renderEvidence(dir, stagedFiles);
  say(`  rendered                 ${rendered.length} evidence files, no placeholder left`);

  const problems = [
    ...semanticChecks(rendered).map((p) => `semantic:  ${p}`),
    ...hashAccounting(dir, rendered).map((p) => `hash:      ${p}`),
    ...recipeCheck(dir).map((p) => `recipe:    ${p}`),
    ...wrapperCheck().map((p) => `wrapper:   ${p}`),
  ];
  if (problems.length > 0) {
    throw new Refusal(
      `${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join("\n")}`,
    );
  }
  say("  semantic, hash, recipe and wrapper checks all pass");

  /*
   * THE PACKAGE-LEVEL SCAN, and it runs before anything is hashed or written.
   *
   * The tracked-file gate cannot see this: it runs over the working tree,
   * while patches, rendered evidence and the staged gate record are all
   * produced here. That gap is exactly how an archive shipped eight backspace
   * bytes under the heading "control-char scan 0".
   */
  const staged = scanDirectory(dir);
  say(`  staged scan              ${describeScan(staged)}`);
  if (staged.foundCharacters > 0) {
    throw new Refusal(
      `the staged package contains ${String(staged.foundCharacters)} control character(s) in:\n` +
        staged.affectedFiles.map((f) => `  ${f}`).join("\n"),
    );
  }

  const manifest = writeManifest(dir, head);
  /*
   * Again, with `hashes.txt` present. The manifest is generated text like any
   * other, and a scan that stopped before it would be a scan with a hole in it
   * the size of the last file written.
   */
  /*
   * BEFORE ANYTHING IS ARCHIVED. A staged copy that does not match the commit
   * means the package would carry bytes the gate never measured.
   */
  const coverage = stagingCoverageProblems(dir, inventory);
  if (coverage.length > 0) {
    throw new Refusal(
      `the staging inventory does not cover the staged tree:\n${coverage
        .slice(0, 12)
        .map((x) => `  ${x}`)
        .join("\n")}`,
    );
  }
  const origins = stagedOriginResult(dir, inventory);
  if (origins.problems.length > 0) {
    throw new Refusal(
      `the staged copies do not match HEAD:\n${origins.problems.map((x) => `  ${x}`).join("\n")}`,
    );
  }
  say(
    `  staged origins           ${String(origins.matchedHead)} match HEAD, ` +
      `${String(origins.wrappers)} wrapper(s), ${String(origins.verbatim)} verbatim copy(ies), ` +
      `${String(origins.unsourced)} declared unsourced`,
  );

  /*
   * THE VALIDATED SNAPSHOT. Everything from here on is held to these exact
   * bytes rather than to the directory they came from.
   */
  const validated = byteMapOf(dir);

  const finished = scanDirectory(dir);
  if (finished.foundCharacters > 0) {
    throw new Refusal(
      `the finished package contains ${String(finished.foundCharacters)} control character(s) in:\n` +
        finished.affectedFiles.map((f) => `  ${f}`).join("\n"),
    );
  }

  const archive = join(archiveDir, `IRIS-Observer-${short}-review.zip`);
  /*
   * CHECKED BEFORE IT IS CREATED. `mkdirSync(..., { recursive: true })` walks
   * whatever ancestors exist, links included, so a check afterwards is too late
   * — the traversal is the thing that had to be prevented.
   */
  safeMkdirAt(archiveDir);
  const when = new Date(git("show", "-s", "--format=%cI", "HEAD"));
  const entries = writeZip(dir, archive, when).length;

  /*
   * And once more from the ARCHIVE, inflated. The staged directory and the
   * archive hold the same bytes, so this is almost the same measurement — and
   * "almost" is what shipped eight backspaces last time. A number reported for
   * the archive is now a measurement of the archive.
   */
  const inArchive = scanArchive(archive);
  say(
    `  archive scan             ${inArchive.foundCharacters === 0 ? `0 in ${String(inArchive.entries)} entries` : `${String(inArchive.foundCharacters)} FOUND`}`,
  );
  if (inArchive.foundCharacters > 0) {
    /* Delete it: an archive that failed its own check must not be deliverable. */
    rmSync(archive, { force: true });
    const where = inArchive.affectedFiles.map((f) => `  ${f}`).join("\n");
    throw new Refusal(
      `the written archive contains ${String(inArchive.foundCharacters)} control character(s) in:\n${where}`,
    );
  }

  return {
    archive,
    sha: sha256File(archive),
    entries,
    manifest,
    staged: finished,
    inArchive,
    validated,
  };
}

function main(): void {
  /*
   * VERIFICATION IS NOT A FLAG.
   *
   * `--verify` was optional and ordinary `pnpm release:package` published the
   * canonical archive without it — so the one command a person is most likely
   * to type was the one that produced an unverified deliverable. There is no
   * public invocation that publishes without complete verification any more.
   */
  const outDir = join(REPO_ROOT, "_review");

  /*
   * THE TREE FIRST, THEN THE MUTEX, THEN ANYTHING ELSE.
   *
   * Refusing here costs nothing. Refusing after a full build costs a build, and
   * the reason for refusing would be the same.
   */
  const identity = treeIdentity(REPO_ROOT);
  const unclean = treeProblems(REPO_ROOT);
  if (unclean.length > 0) {
    say("");
    say("PACKAGE GENERATION REFUSED — the tree is not the one any gate measured:");
    for (const problem of unclean) say(`  ${problem}`);
    process.exit(1);
  }

  let op: Operation;
  try {
    op = beginOperation(REPO_ROOT, "package", identity.head, identity.treeId);
  } catch (e) {
    say("");
    say(`PACKAGE GENERATION REFUSED — ${(e as Error).message}`);
    process.exit(1);
  }

  const binding = new TreeBinding(REPO_ROOT, {
    branch: identity.branch,
    head: identity.head,
    treeId: identity.treeId,
    inputsDigest: identity.inputsDigest,
  });

  /*
   * NOTHING LANDS AT THE DISTRIBUTABLE PATH UNTIL EVERY CHECK HAS PASSED.
   *
   * The previous packager wrote `_review/IRIS-Observer-<short>-review.zip`
   * first and verified afterwards, so a failed determinism check left a
   * complete, plausible, unverified archive exactly where a person looks for
   * one. It also compared only the three CHILD hashes with each other and never
   * with the archive it had actually written — the one it reported and the one
   * a reviewer receives.
   */
  const staging = join(outDir, `.staging-${op.operationId}`);
  const short = identity.head.slice(0, 7);
  const distributable = join(outDir, `IRIS-Observer-${short}-review.zip`);

  const cleanUp = (): void => {
    /*
     * ONLY WHAT THIS OPERATION CREATED.
     *
     * The previous edition deleted the canonical same-HEAD archive whenever
     * this attempt had not published — so a LATER failing attempt destroyed an
     * EARLIER verified deliverable it had never touched. A failure has no
     * business removing somebody else's result, and "same HEAD" is not
     * ownership: an archive at that path may be a fully verified artefact from
     * a previous, successful operation.
     *
     * The staging directory is named for this operation and is the only thing
     * this operation made. Publication is a no-clobber link, so an unpublished
     * failure cannot have left anything at the distributable path either.
     */
    rmSync(staging, { recursive: true, force: true });
  };

  try {
    binding.sample("before the build");
    const first = build(outDir, { operation: op, archiveDir: staging });
    say("");
    say(
      `  archive   ${relative(REPO_ROOT, distributable).split(sep).join("/")} (not yet published)`,
    );
    say(`  entries   ${first.entries} (${first.manifest} in the manifest, plus hashes.txt)`);
    /* Three results, three lines. Never one number standing for all of them. */
    say(`  control   tracked tree: see the gate record`);
    say(`            staged package: ${describeScan(first.staged)}`);
    say(
      `            written archive: ${String(first.inArchive.foundCharacters)} in ${String(first.inArchive.entries)} entries`,
    );
    say(`  SHA-256   ${first.sha}`);

    {
      say("");
      say("  rebuilding under three time zones, and comparing all four hashes:");
      const hashes: { readonly label: string; readonly sha: string }[] = [
        { label: "written archive", sha: first.sha },
      ];
      const zones: readonly { tz: string; slot: RebuildSlot }[] = [
        { tz: "UTC", slot: "utc" },
        { tz: "Europe/Budapest", slot: "budapest" },
        { tz: "America/New_York", slot: "new-york" },
      ];
      for (const { tz, slot } of zones) {
        assertOwner(REPO_ROOT, op);
        /* Through tsx: this file is TypeScript and bare node cannot load it. */
        const out = execFileSync(
          process.execPath,
          [
            join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
            process.argv[1] ?? "",
            "--child",
            `--slot=${slot}`,
            `--operation=${op.operationId}`,
          ],
          { cwd: REPO_ROOT, encoding: "utf8", env: { ...process.env, TZ: tz } },
        ).trim();
        const sha = out.split("\n").pop() ?? "";
        hashes.push({ label: `TZ=${tz}`, sha });
      }
      for (const h of hashes) say(`    ${h.label.padEnd(22)} ${h.sha}`);
      const same = hashes.every((h) => h.sha === first.sha && /^[0-9a-f]{64}$/.test(h.sha));
      say(`    all four identical: ${same ? "YES" : "NO"}`);
      if (!same) {
        throw new Refusal(
          "the archive that would be distributed is not the archive three independent " +
            "rebuilds produce — the determinism claim is false for these bytes",
        );
      }

      /*
       * THE ARCHIVE'S OWN INTEGRITY, from the tools a reviewer would use, and
       * from ONE routine — so the checks run here and the checks run on the
       * published file cannot drift apart.
       */
      const integrity = verifyArchiveIntegrity(first.archive, staging, first.validated);
      say("    unzip -t                passed");
      say(
        `    embedded manifest       ${String(integrity.scannedFiles)} files, ` +
          `sha256sum -c: ${String(integrity.manifestChecked)} OK, 0 stderr`,
      );

      /*
       * AND SEPARATELY, THE OUTER ZIP'S OWN CHECKSUM. Reported as its own line
       * because it is a different claim about a different object: the archive
       * as a file, rather than the manifest inside it.
       */
      const listing = `${first.sha}  ${basename(first.archive)}\n`;
      const sumFile = join(staging, "SHA256SUMS");
      writeFileSync(sumFile, listing, "utf8");
      execFileSync("sha256sum", ["-c", "SHA256SUMS"], {
        cwd: dirname(first.archive),
        stdio: "ignore",
      });
      say("    outer zip checksum      sha256sum -c SHA256SUMS: passed");
    }

    /*
     * THE EXACT OBJECT THAT WAS JUST VERIFIED, bound before anything else runs.
     * Everything published is checked against this, not against a pathname.
     */
    const verified = identifyFile(first.archive);
    if (verified.sha !== first.sha) {
      throw new Refusal(
        `the archive changed between being hashed and being identified: ${first.sha} became ${verified.sha}`,
      );
    }

    /* Last: the tree, ownership, and only then the atomic publication. */
    binding.sample("before publication");
    if (binding.everBroken.length > 0) {
      throw new Refusal(
        "tracked content changed while the package was being built:\n" +
          binding.everBroken
            .slice(0, 8)
            .map((b) => `  ${b}`)
            .join("\n"),
      );
    }
    /*
     * THE TERMINAL PHASE, HELD THROUGH COMPLETION.
     *
     * Not merely across the link. The hold spans final validation, the
     * canonical publication, this operation's own cleanup and
     * `endOperation()`, and is released last — because releasing it after the
     * link but before completion let a recovery tombstone the gate record and
     * release the mutex while the published archive stayed on disk. A canonical
     * archive beside an ABANDONED record is not an outcome either side may
     * produce, and it was reachable.
     */
    withTerminalPhase(REPO_ROOT, op, "publish", () => {
      /*
       * REVALIDATE THE EXACT CANDIDATE, under the hold, before anything is
       * linked. The identity was taken when the archive was verified; if the
       * object or its bytes have changed since, this is not the thing that was
       * checked.
       */
      const now = identifyFile(first.archive);
      const drift = identityProblems("the archive about to be published", verified, now);
      if (drift.length > 0) {
        throw new Refusal(
          "the verified archive is not the file about to be published:\n" +
            drift.map((x) => `  ${x}`).join("\n") +
            "\nNothing has been published and no previous archive has been touched.",
        );
      }

      /*
       * NO-CLOBBER, ATOMICALLY. `link` fails if the destination exists, so an
       * archive already at that path is never overwritten and never deleted:
       * it is reported, and this operation refuses rather than replacing a
       * result it did not produce.
       */
      if (existsSync(distributable)) {
        throw new Refusal(
          `an archive already exists at ${relative(REPO_ROOT, distributable).split(sep).join("/")}. ` +
            `Its SHA-256 is ${sha256File(distributable)} and this build produced ${first.sha}. ` +
            "Nothing has been deleted or replaced. Move or remove the existing archive " +
            "deliberately if it is to be superseded.",
        );
      }
      linkSync(first.archive, distributable);

      /*
       * AND THE CANONICAL PATH NAMES THE SAME OBJECT. A hard link shares the
       * inode, so this is checkable rather than assumed — and the bytes are
       * hashed again from the canonical path, which is the file a reviewer will
       * actually open.
       */
      const canonical = identifyFile(distributable);
      const mismatch = identityProblems("the canonical archive", verified, canonical);
      if (mismatch.length > 0) {
        /*
         * The link is removed and the SOURCE is left alone: this operation
         * created the canonical path in this same hold, so removing it restores
         * exactly the state it found. No previously delivered archive can be
         * at this path — the no-clobber check above proved it was absent.
         */
        rmSync(distributable, { force: true });
        throw new Refusal(
          "the canonical path does not name the verified archive:\n" +
            mismatch.map((x) => `  ${x}`).join("\n"),
        );
      }

      /*
       * THE REQUIRED INTEGRITY CHECKS, ON THE FINAL CANDIDATE — the same
       * routine, against the file a reviewer receives rather than against the
       * one this build happened to write.
       */
      const finalIntegrity = verifyArchiveIntegrity(distributable, staging, first.validated);
      if (finalIntegrity.entries !== first.inArchive.entries) {
        rmSync(distributable, { force: true });
        throw new Refusal(
          `the canonical archive holds ${String(finalIntegrity.entries)} entries and the ` +
            `verified one held ${String(first.inArchive.entries)}`,
        );
      }

      rmSync(first.archive, { force: true });

      /* Operation-private cleanup, still inside the hold. */
      cleanUp();

      /*
       * AND COMPLETION, LAST. Only after this does the terminal phase end, so
       * no recovery can observe a published archive beside a live operation it
       * is entitled to tombstone.
       */
      endOperation(REPO_ROOT, op);
    });
    say("");
    say(`  published ${relative(REPO_ROOT, distributable).split(sep).join("/")}`);
  } catch (e) {
    cleanUp();
    try {
      endOperation(REPO_ROOT, op);
    } catch {
      /* Ownership already lost; the lock belongs to whoever holds it now. */
    }
    if (e instanceof Refusal || e instanceof OperationRefused) {
      say("");
      say(`PACKAGE GENERATION REFUSED — ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

/* A child run prints only its archive hash, so the parent can compare. */
if (process.argv.includes("--child")) {
  /*
   * A CHILD CHOOSES NOTHING.
   *
   * It is told which operation it belongs to and which of the three rebuild
   * slots it is; both are validated, and the destination is derived from them.
   * A directory on the command line is refused outright rather than used —
   * being told where to write is exactly the capability this interface must
   * not have while a package operation is live.
   */
  const arg = (name: string): string | undefined => {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found === undefined ? undefined : found.slice(name.length + 3);
  };
  const operationId = arg("operation") ?? "";
  const slot = arg("slot");
  /* A bare positional after --child is the old interface, and is refused. */
  const positional = process.argv[process.argv.indexOf("--child") + 1];
  const supplied =
    positional !== undefined && !positional.startsWith("--") ? positional : undefined;

  const problems = rebuildSlotProblems(operationId, slot, supplied);
  if (problems.length > 0) {
    say(problems.join("\n"));
    process.exit(1);
  }

  /*
   * UNDER THE PARENT'S OWNERSHIP, never its own. A child that tried to take the
   * mutex would refuse — correctly, the parent holds it — so it verifies the
   * parent's ownership instead, and never releases it and never publishes.
   */
  const op = adoptOperation(REPO_ROOT, "package", operationId);
  const destination = rebuildSlotDir(operationId, slot as RebuildSlot);
  safeMkdirAt(destination);
  say(build(destination, { operation: op, archiveDir: destination }).sha);
} else if (process.argv[1]?.endsWith("build-package.ts")) {
  main();
}
