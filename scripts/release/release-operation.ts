/**
 * One mutually exclusive release operation at a time, and only its owner acts.
 *
 * ## What the previous design could not prevent
 *
 * The packager read the green record, read the lock, saw the gate free, and
 * then built without holding anything. That check-then-act sequence still
 * accepts a wrong package:
 *
 *   1. a green record exists at HEAD;
 *   2. the packager reads it and sees no lock;
 *   3. a gate attempt acquires the lock and invalidates the canonical record;
 *   4. that attempt fails;
 *   5. the packager finishes an archive from the record it captured in step 2.
 *
 * A second lock read does not fix it: any number of point-in-time reads leaves
 * gaps between them. Gate execution and package construction are the same kind
 * of thing — a release operation — and they take one mutex for their whole
 * lifetime.
 *
 * ## How ownership is proved
 *
 * The lock is created with `wx`, so the filesystem picks the winner rather than
 * a read-then-write that can interleave. Creation also captures the lock file's
 * IDENTITY — device, inode, birth time, size — and keeps it in memory, never on
 * disk. Every later assertion re-inspects the path and compares both the
 * identity and the recorded operation id.
 *
 * That is what closes the publication race. Under the old protocol A read the
 * lock, saw its own id, and then deleted whatever was at that path; if a human
 * had replaced A's lock with B's in between, A deleted B's lock. A forged file
 * carrying A's id is a DIFFERENT file object, so it fails the identity check.
 *
 * ## The residual window, stated rather than denied
 *
 * Between the last identity check and the unlink that releases the lock there
 * is a window of microseconds. Entering it requires a human to delete this
 * operation's lock and another operation to create one inside that window,
 * having not done so at any earlier point. No portable filesystem primitive
 * available to Node closes it — there is no compare-and-unlink. It is named
 * here rather than described as impossible.
 */

import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";

export const RELEASE_DIR = ".release";
export const OPERATION_LOCK_PATH = ".release/release-operation.lock";

/** What a release operation is doing. Both take the same mutex. */
export type OperationKind = "gate" | "package";

export const OPERATION_KINDS: readonly OperationKind[] = ["gate", "package"];

/** A bounded operation id: exactly 16 lowercase hex characters. */
const OPERATION_ID = /^[0-9a-f]{16}$/;

export function isOperationId(value: unknown): value is string {
  return typeof value === "string" && OPERATION_ID.test(value);
}

/** A release operation may not proceed. Carries a reason, never a secret. */
export class OperationRefused extends Error {}

/* --------------------------------------------------------------------------
 * Path safety
 * ------------------------------------------------------------------------ */

/**
 * What is actually at an evidence path.
 *
 * `existsSync` answers a different question than the one that matters here. It
 * follows links, so a dangling symbolic link reads as ABSENT — and absent is
 * the one state that means "free to proceed". A link pointing at a file outside
 * the repository reads as present and ordinary. Neither is safe, and neither is
 * distinguishable from the safe case through a boolean.
 */
export type PathState =
  | { readonly kind: "absent" }
  | { readonly kind: "file"; readonly stat: Stats }
  | { readonly kind: "dir"; readonly stat: Stats }
  | { readonly kind: "unsafe"; readonly why: string };

/** `lstat`, never `stat`: a link must be seen as a link, not as its target. */
export function inspectPath(root: string, rel: string): PathState {
  const path = join(root, rel);
  let st: Stats;
  try {
    st = lstatSync(path);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "absent" };
    return { kind: "unsafe", why: `${rel} could not be inspected (${code ?? "unknown error"})` };
  }
  if (st.isSymbolicLink()) return { kind: "unsafe", why: `${rel} is a symbolic link` };
  if (st.isDirectory()) return { kind: "dir", stat: st };
  if (!st.isFile()) return { kind: "unsafe", why: `${rel} is not a regular file` };
  return { kind: "file", stat: st };
}

/** Is `path` genuinely inside `root` once every link has been resolved? */
function contained(root: string, path: string): boolean {
  let realRoot: string;
  let realPath: string;
  try {
    realRoot = realpathSync(resolve(root));
    realPath = realpathSync(resolve(path));
  } catch {
    return false;
  }
  return realPath === realRoot || realPath.startsWith(realRoot + sep);
}

/**
 * Every reason a release-controlled path is not safe to write, ANCESTORS
 * INCLUDED.
 *
 * ## What inspecting only the leaf could not see
 *
 * `inspectPath` lstats the final component and refuses a link there, and
 * `contained` resolves the whole path — but `contained` returns FALSE for a
 * path that does not exist yet, so every caller creating something new fell
 * back to a lexical `resolve()` check. A lexical check cannot see through an
 * ancestor: make `_review` a symlink to somewhere else and
 * `_review/.staging-<id>/rebuild/utc` still resolves, lexically, to a path
 * "beneath the repository" — while every byte written lands outside it.
 *
 * Recursive `mkdirSync` makes that worse, because it will happily traverse an
 * existing ancestor link on its way to creating the leaf.
 *
 * So each component is walked from the root outwards and lstatted:
 *
 *   - a symlink anywhere in the chain is refused, target unexamined;
 *   - an existing non-directory ancestor is refused;
 *   - the deepest EXISTING ancestor must realpath-resolve inside the root, so
 *     the part that does exist is proven to be this repository's;
 *   - everything below the deepest existing ancestor does not exist yet and
 *     therefore cannot redirect anything.
 *
 * A dangling symlink is caught by the first rule: `lstat` sees the link itself,
 * where `existsSync` would report it absent and invite a create through it.
 */
export function pathContainmentProblems(root: string, rel: string): readonly string[] {
  const parts = rel.split(/[\\/]+/).filter((x) => x.length > 0 && x !== ".");
  if (parts.length === 0) return [`${JSON.stringify(rel)} names no path beneath the release root`];
  if (parts.includes("..")) {
    return [`${rel} contains a parent traversal, which a release path may never do`];
  }

  let realRoot: string;
  try {
    realRoot = realpathSync(resolve(root));
  } catch {
    return [`the release root ${root} cannot be resolved`];
  }

  let deepestExisting = realRoot;
  let walked = resolve(root);
  for (let i = 0; i < parts.length; i += 1) {
    walked = join(walked, parts[i] ?? "");
    const here = parts.slice(0, i + 1).join("/");
    let st: Stats;
    try {
      st = lstatSync(walked);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      /*
       * ENOENT is the ordinary "not created yet". ENOTDIR means an ANCESTOR is
       * a file, which is a refusal rather than an absence.
       */
      if (code === "ENOENT") break;
      if (code === "ENOTDIR") return [`${here} sits beneath something that is not a directory`];
      return [`${here} could not be inspected (${code ?? "unknown error"})`];
    }
    if (st.isSymbolicLink()) {
      return [
        `${here} is a symbolic link, and a release path may not pass through one — ` +
          "its target is deliberately not examined, because examining it is how a link " +
          "becomes a way in",
      ];
    }
    if (i < parts.length - 1 && !st.isDirectory()) {
      return [`${here} is not a directory, so nothing may be created beneath it`];
    }
    try {
      deepestExisting = realpathSync(walked);
    } catch {
      return [`${here} exists but cannot be resolved`];
    }
  }

  if (deepestExisting !== realRoot && !deepestExisting.startsWith(realRoot + sep)) {
    return [`${rel} resolves outside the release root once links are followed`];
  }
  return [];
}

/**
 * Create a directory, having proved every ancestor is safe first.
 *
 * `mkdirSync(..., { recursive: true })` traverses whatever ancestors already
 * exist, links included. Checking afterwards is too late: the traversal is the
 * thing that had to be prevented.
 */
export function safeMkdir(root: string, rel: string): void {
  const problems = pathContainmentProblems(root, rel);
  if (problems.length > 0) throw new OperationRefused(problems.join("; "));
  mkdirSync(join(root, rel), { recursive: true });
  /* And again, because the create itself is what a racing link would target. */
  const after = pathContainmentProblems(root, rel);
  if (after.length > 0) throw new OperationRefused(after.join("; "));
}

/**
 * Every reason `.release` may not be read or written. Empty means it may.
 *
 * An ABSENT directory is fine — no evidence has been recorded yet. A directory
 * that is a link, or that resolves outside the repository, is not: evidence
 * would be read from, and written to, somewhere this repository does not own.
 */
export function releaseDirProblems(root: string): readonly string[] {
  /* Ancestors first: `.release` is one component, but the root may not be. */
  const chain = pathContainmentProblems(root, RELEASE_DIR);
  if (chain.length > 0) return [`${chain[0] ?? ""} — evidence may not be read or written`];
  const state = inspectPath(root, RELEASE_DIR);
  if (state.kind === "absent") return [];
  if (state.kind === "unsafe") return [`${state.why} — evidence may not be read or written`];
  if (state.kind !== "dir") return [`${RELEASE_DIR} is not a directory`];
  if (!contained(root, join(root, RELEASE_DIR))) {
    return [`${RELEASE_DIR} resolves outside the repository — evidence would not be this one's`];
  }
  return [];
}

/**
 * Every reason one evidence FILE may not be read or written.
 *
 * Absent is allowed; the caller decides what absence means. Anything present
 * that is not a plain regular file inside the repository is refused.
 */
export function evidenceFileProblems(root: string, rel: string): readonly string[] {
  const dir = releaseDirProblems(root);
  if (dir.length > 0) return dir;
  const chain = pathContainmentProblems(root, rel);
  if (chain.length > 0) return chain;
  const state = inspectPath(root, rel);
  if (state.kind === "absent" || state.kind === "file") {
    if (state.kind === "file" && !contained(root, join(root, rel))) {
      return [`${rel} resolves outside the repository`];
    }
    return [];
  }
  if (state.kind === "unsafe") return [state.why];
  return [`${rel} is a directory where a file belongs`];
}

/* --------------------------------------------------------------------------
 * The lock
 * ------------------------------------------------------------------------ */

export interface OperationLock {
  readonly kind: OperationKind;
  readonly operationId: string;
  readonly head: string;
  readonly treeId: string;
  readonly startedAt: string;
}

/**
 * The lock file's identity, as the filesystem knows it.
 *
 * Held in memory by the owner and never written down. Content can be forged;
 * a file object cannot be re-created with the same inode and birth time.
 */
export interface OwnerToken {
  readonly dev: number;
  readonly ino: number;
  readonly birthtimeMs: number;
  readonly size: number;
  /**
   * Whether the object is a regular file, so a type change is a difference.
   */
  readonly isFile: boolean;
  /**
   * A digest of the lock's COMPLETE BYTES.
   *
   * ## The rewrite this closes
   *
   * The token was device, inode, birth time and SIZE. A lock rewritten IN PLACE
   * — same inode, same length — therefore compared equal, and the recorded HEAD
   * or tree could be replaced by an equal-length alternative that this process
   * would then accept as its own. Both are hex strings of fixed width, so
   * equal-length substitution is not a contrivance; it is the natural shape of
   * the attack.
   *
   * Hashing the bytes makes the content part of the identity. An operation now
   * owns a specific file holding specific bytes, and anything else is somebody
   * else's lock.
   */
  readonly digest: string;
}

const tokenOfBytes = (st: Stats, bytes: Buffer): OwnerToken => ({
  dev: st.dev,
  ino: st.ino,
  birthtimeMs: st.birthtimeMs,
  size: st.size,
  isFile: st.isFile(),
  digest: createHash("sha256").update(bytes).digest("hex"),
});

const sameToken = (a: OwnerToken, b: OwnerToken): boolean =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.birthtimeMs === b.birthtimeMs &&
  a.size === b.size &&
  a.isFile === b.isFile &&
  a.digest === b.digest;

/**
 * Three states, because two cannot express what is on disk.
 *
 * `readAttemptLock` used to return null for an absent lock AND for a lock whose
 * content parsed to JSON `null`, so a file containing four bytes read as "the
 * gate is free". Only genuinely absent is free.
 */
export type LockState =
  | { readonly kind: "free" }
  | { readonly kind: "held"; readonly lock: OperationLock; readonly token: OwnerToken }
  | { readonly kind: "unsafe"; readonly why: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function validLock(value: unknown): OperationLock | null {
  if (!isPlainObject(value)) return null;
  const { kind, operationId, head, treeId, startedAt } = value;
  if (kind !== "gate" && kind !== "package") return null;
  if (!isOperationId(operationId)) return null;
  if (typeof head !== "string" || !/^[0-9a-f]{40}$/.test(head)) return null;
  if (typeof treeId !== "string" || !/^[0-9a-f]{40}$/.test(treeId)) return null;
  if (typeof startedAt !== "string" || startedAt === "") return null;
  return Object.freeze({ kind, operationId, head, treeId, startedAt });
}

/** What the lock path currently holds. Never throws. */
export function readOperationLock(root: string): LockState {
  const dir = releaseDirProblems(root);
  if (dir.length > 0) return { kind: "unsafe", why: dir.join("; ") };

  const state = inspectPath(root, OPERATION_LOCK_PATH);
  if (state.kind === "absent") return { kind: "free" };
  if (state.kind === "unsafe") return { kind: "unsafe", why: state.why };
  if (state.kind !== "file") {
    return { kind: "unsafe", why: `${OPERATION_LOCK_PATH} is a directory, not a lock` };
  }
  if (!contained(root, join(root, OPERATION_LOCK_PATH))) {
    return { kind: "unsafe", why: `${OPERATION_LOCK_PATH} resolves outside the repository` };
  }

  /* READ ONCE, and hash exactly those bytes: two reads can differ. */
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(root, OPERATION_LOCK_PATH));
  } catch {
    return { kind: "unsafe", why: `${OPERATION_LOCK_PATH} could not be read` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return {
      kind: "unsafe",
      why: `${OPERATION_LOCK_PATH} is present but does not parse — an operation killed mid-write leaves exactly this`,
    };
  }
  const lock = validLock(parsed);
  if (lock === null) {
    return {
      kind: "unsafe",
      why: `${OPERATION_LOCK_PATH} is present but does not describe an operation`,
    };
  }
  return { kind: "held", lock, token: tokenOfBytes(state.stat, bytes) };
}

const RECOVERY = `run \`pnpm release:recover --operation=<id>\`, which validates that exact operation, tombstones the canonical result and releases only that lock. Deleting the lock by hand is not recovery: it leaves the previous green record packageable, which is the state the tombstone exists to prevent`;

/**
 * Every reason a NEW operation of this kind may not begin. Empty means it may.
 *
 * Held by anything at all forbids it, in both directions: a gate refuses while
 * packaging owns the operation and packaging refuses while a gate owns it.
 * There is no age at which a lock becomes ignorable — this process cannot see
 * whether the other one is alive, so every timeout is a guess, and guessing
 * wrong is the failure the lock exists to prevent.
 */
export function lockStateProblems(state: LockState, wanted: OperationKind): readonly string[] {
  if (state.kind === "free") return [];
  if (state.kind === "unsafe") {
    return [`the release operation lock is unsafe: ${state.why}. To clear it, ${RECOVERY}.`];
  }
  const held = state.lock;
  const mine = held.kind === wanted ? "another" : "a";
  return [
    `a ${held.kind} operation owns the release mutex (${mine} operation, id ${held.operationId}, ` +
      `started ${held.startedAt} on ${held.head.slice(0, 7)}), so no ${wanted} may begin. ` +
      `If that operation is really gone, ${RECOVERY}.`,
  ];
}

/* --------------------------------------------------------------------------
 * Owning an operation
 * ------------------------------------------------------------------------ */

export interface Operation {
  readonly kind: OperationKind;
  readonly operationId: string;
  readonly head: string;
  readonly treeId: string;
  readonly token: OwnerToken;
  /** Attempt-specific, so no two operations can write the same pending file. */
  readonly pendingPath: string;
}

/** Where THIS operation may write its pending result. Never shared. */
export function pendingPathFor(operationId: string): string {
  return `${RELEASE_DIR}/pending-${operationId}.json`;
}

/** Where THIS operation's quarantined pending result goes. */
export function quarantinePathFor(operationId: string): string {
  return `${RELEASE_DIR}/quarantine-${operationId}.json`;
}

/**
 * Take the release mutex for the whole life of this operation, or refuse.
 *
 * The `wx` create is the decision point. Everything after it verifies that the
 * file the filesystem created is still the file this operation owns.
 */
export function beginOperation(
  root: string,
  kind: OperationKind,
  head: string,
  treeId: string,
  id?: string,
): Operation {
  const operationId = id ?? randomBytes(8).toString("hex");
  if (!isOperationId(operationId)) {
    throw new OperationRefused("the operation id is not the bounded 16-hex shape");
  }

  const unsafe = releaseDirProblems(root);
  if (unsafe.length > 0) throw new OperationRefused(unsafe.join("; "));

  mkdirSync(join(root, RELEASE_DIR), { recursive: true });
  /* Created after the mkdir, so a link planted as `.release` is caught above. */
  const stillUnsafe = releaseDirProblems(root);
  if (stillUnsafe.length > 0) throw new OperationRefused(stillUnsafe.join("; "));

  const lock: OperationLock = Object.freeze({
    kind,
    operationId,
    head,
    treeId,
    startedAt: new Date().toISOString(),
  });

  try {
    writeFileSync(join(root, OPERATION_LOCK_PATH), `${JSON.stringify(lock, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch {
    const held = lockStateProblems(readOperationLock(root), kind);
    throw new OperationRefused(
      held.length > 0 ? held.join(" ") : "the release mutex is held and the lock could not be read",
    );
  }

  /* Read back what we created, so the token describes the real file object. */
  const state = readOperationLock(root);
  if (state.kind !== "held" || state.lock.operationId !== operationId) {
    throw new OperationRefused(
      "the lock this operation created is not the lock now at that path — refusing rather than proceeding",
    );
  }
  return Object.freeze({
    kind,
    operationId,
    head,
    treeId,
    token: state.token,
    pendingPath: pendingPathFor(operationId),
  });
}

/**
 * Join an operation somebody else owns, for a child process that must not own
 * one of its own.
 *
 * The three time-zone rebuilds are part of ONE package operation. If each tried
 * to acquire the mutex they would refuse — correctly, since the parent holds it
 * — so they verify the parent's ownership instead and never release it.
 */
export function adoptOperation(root: string, kind: OperationKind, operationId: string): Operation {
  const state = readOperationLock(root);
  if (state.kind !== "held") {
    throw new OperationRefused(
      `this process was told to work under ${kind} operation ${operationId}, and no operation owns the release mutex`,
    );
  }
  if (state.lock.operationId !== operationId || state.lock.kind !== kind) {
    throw new OperationRefused(
      `this process was told to work under ${kind} operation ${operationId}, and the mutex is owned by ${state.lock.kind} operation ${state.lock.operationId}`,
    );
  }
  return Object.freeze({
    kind,
    operationId,
    head: state.lock.head,
    treeId: state.lock.treeId,
    token: state.token,
    pendingPath: pendingPathFor(operationId),
  });
}

/** Throw unless this exact operation still owns the mutex, right now. */
/**
 * Every field an ownership assertion compares, named individually.
 *
 * The token covers device, inode, birth time, size, file type and the complete
 * bytes; these are the DECLARED facts inside those bytes, checked separately so
 * a refusal says which one moved rather than only that something did.
 */
export function ownerFieldProblems(lock: OperationLock, op: Operation): readonly string[] {
  const problems: string[] = [];
  if (lock.operationId !== op.operationId) problems.push("a different operation id");
  if (lock.kind !== op.kind) problems.push("a different operation kind");
  if (lock.head !== op.head) problems.push("a different HEAD");
  if (lock.treeId !== op.treeId) problems.push("a different tree identity");
  return problems;
}

export function assertOwner(root: string, op: Operation): void {
  const state = readOperationLock(root);
  if (state.kind === "free") {
    throw new OperationRefused(
      `${op.kind} operation ${op.operationId} no longer owns the release mutex: the lock is gone`,
    );
  }
  if (state.kind === "unsafe") {
    throw new OperationRefused(
      `${op.kind} operation ${op.operationId} cannot confirm ownership: ${state.why}`,
    );
  }
  if (state.lock.operationId !== op.operationId || state.lock.kind !== op.kind) {
    throw new OperationRefused(
      `${op.kind} operation ${op.operationId} no longer owns the release mutex: it is owned by ${state.lock.kind} operation ${state.lock.operationId}`,
    );
  }
  if (!sameToken(state.token, op.token)) {
    throw new OperationRefused(
      `${op.kind} operation ${op.operationId} no longer owns the release mutex: the lock file carries this id but is a different file object`,
    );
  }
}

/** Does this operation still own the mutex? Never throws. */
export function stillOwner(root: string, op: Operation): boolean {
  try {
    assertOwner(root, op);
    return true;
  } catch {
    return false;
  }
}

/**
 * Release the mutex — only if this exact operation still holds it.
 *
 * Never a blind delete. An operation that lost ownership leaves the lock alone;
 * whatever holds it now is entitled to it.
 */
export function endOperation(root: string, op: Operation): void {
  assertOwner(root, op);
  rmSync(join(root, OPERATION_LOCK_PATH), { force: true });
}

/** Remove only the files this operation created, whatever else is going on. */
export function discardOwnFiles(root: string, op: Operation): void {
  for (const rel of [op.pendingPath]) {
    if (inspectPath(root, rel).kind === "file") rmSync(join(root, rel), { force: true });
  }
}

/**
 * Run `body` while holding the mutex, and release it exactly once.
 *
 * If the body fails, this operation's own pending file goes with it and nothing
 * belonging to another operation is touched. If ownership was lost, the lock is
 * left where it is and the loss is reported rather than swallowed.
 */
export function withOperation<T>(
  root: string,
  kind: OperationKind,
  head: string,
  treeId: string,
  body: (op: Operation) => T,
): T {
  const op = beginOperation(root, kind, head, treeId);
  let out: T;
  try {
    out = body(op);
  } catch (e) {
    /*
     * The body's failure is the useful error. Release is still attempted, and a
     * release that refuses because ownership was already lost is REPORTED here
     * rather than thrown: throwing from a cleanup path replaces the real cause
     * with a consequence of it.
     */
    discardOwnFiles(root, op);
    try {
      endOperation(root, op);
    } catch (lost) {
      process.stderr.write(`  ownership was already lost: ${(lost as Error).message}
`);
    }
    throw e;
  }
  endOperation(root, op);
  return out;
}

/* --------------------------------------------------------------------------
 * The terminal phase
 * ------------------------------------------------------------------------ */

/**
 * THE TERMINAL PHASE: the one interval in which a canonical result may change.
 *
 * ## The interleaving this exists to make impossible
 *
 * Publication used to hold a claim across the rename ALONE. Independently
 * reproduced, that permitted:
 *
 *   1. the package operation takes the publish claim;
 *   2. the archive is published;
 *   3. the package releases the terminal claim;
 *   4. RECOVERY acquires the terminal claim;
 *   5. recovery tombstones the canonical gate record and releases the mutex;
 *   6. the published archive remains;
 *   7. the publisher's later `endOperation()` fails.
 *
 * Both halves partly succeeded, and the result on disk — a canonical archive
 * beside an ABANDONED gate record — is exactly the state neither is allowed to
 * produce. The window was between step 3 and step 7: the publisher had let go
 * of the terminal phase while it still had work that could fail.
 *
 * So the hold now spans FINAL VALIDATION, CANONICAL PUBLICATION, the
 * operation's own cleanup, and `endOperation()`. The claim is released last.
 * Recovery cannot enter the terminal phase until the publishing operation has
 * completed or has been explicitly recovered — and "explicitly" is the whole of
 * {@link recoverTerminalClaim}, because a process that dies holding the claim
 * would otherwise make recovery impossible: recovery takes the same claim, with
 * the same `wx` create, against a file that is already there.
 */
export const TERMINAL_CLAIM_PATH = ".release/release-terminal.claim";

export type TerminalAction = "publish" | "recover";

/** Where a recovered terminal claim is kept. Recovery quarantines; it never deletes. */
export function terminalQuarantinePathFor(operationId: string): string {
  return `${RELEASE_DIR}/terminal-quarantine-${operationId}.claim`;
}

export interface TerminalClaim {
  readonly action: TerminalAction;
  readonly operationId: string;
  readonly claimedAt: string;
  /**
   * An unpredictable value written by whoever created this claim.
   *
   * The release callback used to delete the PATHNAME. A claim replaced between
   * creation and release — by a recovery that quarantined it and a second
   * operation that then created its own — would be deleted by the first
   * operation, which never held it. Comparing this value and the file's
   * identity is what makes "release the claim I created" a checkable statement
   * rather than an assumption about a name.
   */
  readonly nonce: string;
}

/** What a process holds while it is inside the terminal phase. Never written down whole. */
export interface TerminalHold {
  readonly action: TerminalAction;
  readonly operationId: string;
  readonly nonce: string;
  /** The claim file's identity when this hold created it. */
  readonly token: OwnerToken;
}

const NONCE = /^[0-9a-f]{32}$/;

export function readTerminalClaim(root: string): TerminalClaim | null {
  const state = inspectPath(root, TERMINAL_CLAIM_PATH);
  if (state.kind !== "file") return null;
  try {
    const parsed = JSON.parse(readFileSync(join(root, TERMINAL_CLAIM_PATH), "utf8")) as unknown;
    if (!isPlainObject(parsed)) return null;
    const { action, operationId, claimedAt, nonce } = parsed;
    if (action !== "publish" && action !== "recover") return null;
    if (!isOperationId(operationId)) return null;
    if (typeof claimedAt !== "string") return null;
    if (typeof nonce !== "string" || !NONCE.test(nonce)) return null;
    return Object.freeze({ action, operationId, claimedAt, nonce });
  } catch {
    return null;
  }
}

/**
 * Enter the terminal phase, or refuse.
 *
 * The `wx` create is the arbitration. Everything after it proves the file the
 * filesystem created is the one this call wrote.
 */
export function enterTerminalPhase(
  root: string,
  op: Operation,
  action: TerminalAction,
): TerminalHold {
  const safety = evidenceFileProblems(root, TERMINAL_CLAIM_PATH);
  if (safety.length > 0) throw new OperationRefused(safety.join("; "));

  const path = join(root, TERMINAL_CLAIM_PATH);
  const nonce = randomBytes(16).toString("hex");
  const claim: TerminalClaim = Object.freeze({
    action,
    operationId: op.operationId,
    claimedAt: new Date().toISOString(),
    nonce,
  });

  try {
    writeFileSync(path, `${JSON.stringify(claim, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch {
    const held = readTerminalClaim(root);
    throw new OperationRefused(
      held === null
        ? `the terminal phase is held and the claim could not be read; ${action} may not proceed. ` +
            TERMINAL_RECOVERY
        : `the terminal phase is held by ${held.action} for operation ${held.operationId} ` +
            `(claimed ${held.claimedAt}); ${action} may not proceed. ${TERMINAL_RECOVERY}`,
    );
  }

  /* Read back, so a claim this call did not actually create is not acted on. */
  const readBack = readTerminalClaim(root);
  const state = inspectPath(root, TERMINAL_CLAIM_PATH);
  if (
    readBack === null ||
    readBack.operationId !== op.operationId ||
    readBack.action !== action ||
    readBack.nonce !== nonce ||
    state.kind !== "file"
  ) {
    throw new OperationRefused(
      "the terminal claim at that path is not the one this operation just created",
    );
  }

  /*
   * AND THE MUTEX, WHILE THE CLAIM IS HELD. An operation that lost the lock
   * before reaching here releases the claim and refuses, having published or
   * recovered nothing.
   */
  const hold: TerminalHold = Object.freeze({
    action,
    operationId: op.operationId,
    nonce,
    token: tokenOfBytes(state.stat, readFileSync(join(root, TERMINAL_CLAIM_PATH))),
  });
  try {
    assertOwner(root, op);
  } catch (e) {
    releaseTerminalPhase(root, hold);
    throw e;
  }
  return hold;
}

const TERMINAL_RECOVERY = `If the holding process is gone, run \`pnpm release:recover --operation=<id>\`, which validates that the mutex and the terminal claim describe the same operation and quarantines the claim rather than deleting it. There is deliberately no age-based takeover: a slow publisher and a dead one look identical from here`;

/**
 * Every reason this hold may NOT release the claim it is holding.
 *
 * Empty means the file on disk is still the exact object this hold created, and
 * only then is it removed. A replaced claim is left alone: deleting it would
 * remove a claim belonging to somebody else, which is the failure mode this
 * whole protocol exists to prevent.
 */
export function terminalReleaseProblems(root: string, hold: TerminalHold): readonly string[] {
  const state = inspectPath(root, TERMINAL_CLAIM_PATH);
  if (state.kind === "absent") {
    return ["the terminal claim is already gone — this hold did not release it"];
  }
  if (state.kind !== "file") {
    return [state.kind === "unsafe" ? state.why : `${TERMINAL_CLAIM_PATH} is a directory`];
  }
  if (
    !sameToken(tokenOfBytes(state.stat, readFileSync(join(root, TERMINAL_CLAIM_PATH))), hold.token)
  ) {
    return [
      "the terminal claim on disk is a different file object from the one this hold " +
        "created — it has been replaced, and this hold will not delete somebody else's claim",
    ];
  }
  const claim = readTerminalClaim(root);
  if (claim === null) return ["the terminal claim is no longer readable"];
  if (claim.nonce !== hold.nonce) {
    return ["the terminal claim carries a different nonce — it is not the one this hold created"];
  }
  if (claim.operationId !== hold.operationId || claim.action !== hold.action) {
    return ["the terminal claim describes a different operation or action"];
  }
  return [];
}

/** Release the claim this hold created, and only that one. */
export function releaseTerminalPhase(root: string, hold: TerminalHold): readonly string[] {
  const problems = terminalReleaseProblems(root, hold);
  if (problems.length > 0) return problems;
  rmSync(join(root, TERMINAL_CLAIM_PATH), { force: true });
  return [];
}

/**
 * Run the whole terminal phase under one hold, and release it last.
 *
 * The body is where final validation, canonical publication, private cleanup
 * and `endOperation()` all belong. Nothing between them may run while the
 * terminal phase is unheld.
 */
export function withTerminalPhase<T>(
  root: string,
  op: Operation,
  action: TerminalAction,
  body: (hold: TerminalHold) => T,
): T {
  const hold = enterTerminalPhase(root, op, action);
  let result: T | undefined;
  let bodyError: unknown = null;
  try {
    result = body(hold);
  } catch (e) {
    bodyError = e;
  }
  const problems = releaseTerminalPhase(root, hold);

  if (bodyError !== null) {
    if (problems.length > 0 && bodyError instanceof Error) {
      /* Both, because a stale claim needs recovering whatever else went wrong. */
      throw new OperationRefused(
        `${bodyError.message}\n\nand the terminal claim could not be released: ${problems.join("; ")}. ${TERMINAL_RECOVERY}`,
      );
    }
    throw bodyError;
  }
  if (problems.length > 0) {
    throw new OperationRefused(`${problems.join("; ")}. ${TERMINAL_RECOVERY}`);
  }
  return result as T;
}

/**
 * Recover a terminal claim abandoned by a process that is gone.
 *
 * ## Why this cannot be an age check
 *
 * A publisher inside its terminal phase and a publisher that died inside it
 * look identical from outside: a claim file, and no way to ask the process. Any
 * timeout would eventually take the phase away from a live publisher mid-link,
 * which is the thing the phase exists to prevent. So the operator names the
 * operation, and this refuses unless the whole of the state agrees.
 *
 * It QUARANTINES rather than deletes, for the same reason recovery quarantines
 * a pending record: the claim is the only surviving evidence of what the dead
 * process was doing, including whether it had already published.
 */
export function recoverTerminalClaim(root: string, operationId: string): readonly string[] {
  if (!isOperationId(operationId)) {
    throw new OperationRefused("the operation id to recover is not the bounded 16-hex shape");
  }
  const safety = evidenceFileProblems(root, TERMINAL_CLAIM_PATH);
  if (safety.length > 0) throw new OperationRefused(safety.join("; "));

  const before = inspectPath(root, TERMINAL_CLAIM_PATH);
  if (before.kind === "absent") return ["no terminal claim was held"];
  const beforeBytes =
    before.kind === "file" ? readFileSync(join(root, TERMINAL_CLAIM_PATH)) : Buffer.alloc(0);
  if (before.kind !== "file") {
    throw new OperationRefused(
      before.kind === "unsafe"
        ? `${before.why} — the terminal claim is not a regular file and is not touched`
        : `${TERMINAL_CLAIM_PATH} is a directory and is not touched`,
    );
  }

  const claim = readTerminalClaim(root);
  if (claim === null) {
    throw new OperationRefused(
      `${TERMINAL_CLAIM_PATH} exists and is malformed, so no operation can be identified from ` +
        "it. Inspect it by hand; nothing here will guess what it meant.",
    );
  }
  if (claim.operationId !== operationId) {
    throw new OperationRefused(
      `the terminal claim is held by operation ${claim.operationId}, not ${operationId} — ` +
        "recovery names the operation it recovers, so a stale instruction cannot clear a live one",
    );
  }

  /*
   * THE MUTEX AND THE CLAIM MUST DESCRIBE THE SAME OPERATION. A claim naming an
   * operation that no longer owns the lock is not evidence of an interrupted
   * terminal phase; it is a state nobody has explained, and guessing is what
   * this module refuses to do.
   */
  const lock = readOperationLock(root);
  if (lock.kind === "free") {
    throw new OperationRefused(
      "a terminal claim exists while no operation owns the mutex — these describe different " +
        "states and recovery will not reconcile them by guessing",
    );
  }
  if (lock.kind === "unsafe") {
    throw new OperationRefused(`the lock cannot be read: ${lock.why}`);
  }
  if (lock.lock.operationId !== operationId) {
    throw new OperationRefused(
      `the terminal claim names ${operationId} and the mutex is owned by ${lock.lock.operationId} — ` +
        "the two describe different operations and neither is recovered here",
    );
  }

  /* The file must not have changed while all of that was being read. */
  const after = inspectPath(root, TERMINAL_CLAIM_PATH);
  const claimPath = join(root, TERMINAL_CLAIM_PATH);
  if (
    after.kind !== "file" ||
    before.kind !== "file" ||
    !sameToken(
      tokenOfBytes(after.stat, readFileSync(claimPath)),
      tokenOfBytes(before.stat, beforeBytes),
    )
  ) {
    throw new OperationRefused(
      "the terminal claim changed while it was being inspected — nothing was moved",
    );
  }

  const quarantine = terminalQuarantinePathFor(operationId);
  const dest = evidenceFileProblems(root, quarantine);
  if (dest.length > 0) throw new OperationRefused(dest.join("; "));
  if (inspectPath(root, quarantine).kind !== "absent") {
    throw new OperationRefused(
      `${quarantine} already exists; a previous recovery of this operation is already recorded ` +
        "and is not overwritten",
    );
  }
  renameSync(join(root, TERMINAL_CLAIM_PATH), join(root, quarantine));
  return [
    `quarantined the ${claim.action} terminal claim for ${operationId} to ${quarantine}`,
    /*
     * SAID PLAINLY, because it is the one thing recovery cannot determine. A
     * process can die after `linkSync` and before releasing the claim, and the
     * canonical archive is then already published and correct. Nothing here
     * removes it, and nothing here asserts it is absent.
     */
    "whether that operation had already published a canonical archive is NOT determined here; " +
      "no archive was inspected, moved or removed",
  ];
}

/* --------------------------------------------------------------------------
 * Recovery
 * ------------------------------------------------------------------------ */

/** What a tombstoned canonical result says. Not a record, and not packageable. */
export const GATE_ABANDONED = "ABANDONED";

/**
 * Recover from an interrupted operation, bound to that exact operation.
 *
 * Deleting the lock by hand was documented as recovery and is not. There is a
 * gap between taking the mutex and writing the in-progress marker; an operation
 * that dies inside it leaves the PREVIOUS green record in place, so removing
 * only the lock makes a superseded record packageable again.
 *
 * So recovery does four things in one place, in this order: validate the exact
 * operation, tombstone the canonical result, quarantine only that operation's
 * pending file, and release only that lock. Packaging then refuses until a new
 * complete green gate exists, because a tombstone is not a result.
 */
export function recoverOperation(
  root: string,
  operationId: string,
  recordPath: string,
): readonly string[] {
  if (!isOperationId(operationId)) {
    throw new OperationRefused("the operation id to recover is not the bounded 16-hex shape");
  }
  const state = readOperationLock(root);
  if (state.kind === "free") {
    throw new OperationRefused(
      "no operation owns the release mutex, so there is nothing to recover",
    );
  }
  if (state.kind === "unsafe") {
    throw new OperationRefused(
      `the lock cannot be read, so no operation can be identified: ${state.why}. ` +
        `Inspect ${OPERATION_LOCK_PATH} by hand before anything else touches it.`,
    );
  }
  if (state.lock.operationId !== operationId) {
    throw new OperationRefused(
      `the mutex is owned by ${state.lock.kind} operation ${state.lock.operationId}, not ${operationId} — ` +
        `recovery names the operation it recovers, so that a stale instruction cannot clear a live one`,
    );
  }

  const owner = state.lock;
  const op: Operation = Object.freeze({
    kind: owner.kind,
    operationId,
    head: owner.head,
    treeId: owner.treeId,
    token: state.token,
    pendingPath: pendingPathFor(operationId),
  });

  const done: string[] = [];

  /*
   * A TERMINAL CLAIM STOPS RECOVERY DEAD, AND MUST.
   *
   * ## Why this is not quarantined automatically
   *
   * A process that died holding the claim and a publisher currently inside its
   * terminal phase leave the SAME state: a claim file naming this operation,
   * beside a mutex naming this operation. Nothing on disk distinguishes them,
   * and quarantining the claim here — which an earlier draft of this correction
   * did — takes the terminal phase away from a live publisher mid-link. That is
   * the failure this whole protocol exists to prevent, reintroduced by the
   * recovery that was supposed to prevent it.
   *
   * So it refuses, and says exactly what a person must do instead. Quarantining
   * an abandoned claim is a SEPARATE, explicitly requested act
   * ({@link recoverTerminalClaim}, `--terminal-claim` on the recover command), which
   * an operator performs only once they know the holding process is gone. There
   * is no timeout that would decide it for them.
   */
  const claimState = inspectPath(root, TERMINAL_CLAIM_PATH);
  if (claimState.kind !== "absent") {
    const held = readTerminalClaim(root);
    throw new OperationRefused(
      `a terminal claim is present${held === null ? " and is malformed" : ` (${held.action} for operation ${held.operationId})`}. ` +
        "A publisher may be inside its terminal phase right now, and nothing here can tell " +
        "that apart from a process that died holding it — so recovery will not take it. " +
        "Confirm the holding process is gone, then run " +
        `\`pnpm release:recover --operation=${operationId} --terminal-claim\`, which quarantines the ` +
        "claim without deleting it, and run recovery again.",
    );
  }

  /*
   * THEN THE TERMINAL PHASE ITSELF, held across every step below.
   *
   * Publication takes the same claim and holds it through `endOperation()`, so
   * a recovery cannot land between a publisher's last check and its completion
   * — which is precisely the interval that let a publish and a recovery both
   * partly succeed, leaving a canonical archive beside an ABANDONED record.
   */
  return withTerminalPhase(root, op, "recover", () =>
    recoverUnderClaim(root, op, owner, recordPath, done),
  );
}

function recoverUnderClaim(
  root: string,
  op: Operation,
  owner: OperationLock,
  recordPath: string,
  done: string[],
): readonly string[] {
  /* 1. Tombstone the canonical result, atomically, whatever it currently is. */
  const safety = evidenceFileProblems(root, recordPath);
  if (safety.length > 0) throw new OperationRefused(safety.join("; "));
  const tombstone = {
    status: GATE_ABANDONED,
    operationId: op.operationId,
    kind: owner.kind,
    head: owner.head,
    abandonedAt: new Date().toISOString(),
  };
  /*
   * THROUGH AN UNPREDICTABLE PRIVATE PATH, NEVER A DERIVED SIBLING.
   *
   * This wrote \`<record>.recovering-<operation>\`, a name derived entirely from
   * public information and therefore plantable in advance. A reproduced attack
   * planted a SYMLINK there: the write followed it and clobbered a file outside
   * the repository, and the rename then installed that link as the canonical
   * gate record.
   *
   * {@link writeThroughPrivateTemp} uses sixteen unpredictable bytes, an
   * exclusive create, restrictive permissions, a containment walk of every
   * component, and an identity check of the exact object immediately before the
   * rename.
   */
  writeThroughPrivateTemp(root, recordPath, `${JSON.stringify(tombstone, null, 2)}\n`, "tombstone");
  done.push(`tombstoned ${recordPath} — no result is packageable until a new gate completes`);

  /* 2. Quarantine only THIS operation's pending file. */
  if (inspectPath(root, op.pendingPath).kind === "file") {
    const quarantine = quarantinePathFor(op.operationId);
    renameSync(join(root, op.pendingPath), join(root, quarantine));
    done.push(`quarantined ${op.pendingPath} to ${quarantine}`);
  } else {
    done.push(`no pending result belonged to ${op.operationId}`);
  }

  /* 3. Release only this exact operation. */
  endOperation(root, op);
  done.push(`released ${owner.kind} operation ${op.operationId}`);
  return done;
}

/**
 * A private, unpredictable, operation-owned temporary path inside `.release`.
 *
 * ## The predictable sibling this replaces
 *
 * Recovery wrote `gate-results.json.recovering-<operation>` and then renamed it
 * over the canonical record. The name is derived entirely from public
 * information, so it can be pre-planted — and a reproduced attack planted a
 * symlink there, which the write followed to clobber a file outside the
 * repository and then installed as the canonical gate record.
 *
 * The name now carries 16 unpredictable bytes, the create is exclusive, and the
 * object created is re-identified before it is renamed anywhere.
 */
export function privateTempPath(prefix: string): string {
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(prefix)) {
    throw new OperationRefused("a private temporary prefix must be a short lowercase name");
  }
  return `${RELEASE_DIR}/.tmp-${prefix}-${randomBytes(16).toString("hex")}`;
}

/**
 * Write bytes to a private path and rename them onto `destination`, safely.
 *
 * Every mutation is preceded by a containment walk and an identity check of the
 * exact object about to be moved, so a path swapped between validation and
 * rename is caught rather than followed.
 */
export function writeThroughPrivateTemp(
  root: string,
  destination: string,
  bytes: string,
  prefix: string,
): void {
  for (const rel of [destination]) {
    const problems = pathContainmentProblems(root, rel);
    if (problems.length > 0) throw new OperationRefused(problems.join("; "));
    const state = inspectPath(root, rel);
    if (state.kind === "unsafe") throw new OperationRefused(state.why);
    if (state.kind === "dir") {
      throw new OperationRefused(`${rel} is a directory where a regular file belongs`);
    }
  }

  const temp = privateTempPath(prefix);
  const tempProblems = pathContainmentProblems(root, temp);
  if (tempProblems.length > 0) throw new OperationRefused(tempProblems.join("; "));

  mkdirSync(join(root, RELEASE_DIR), { recursive: true, mode: 0o700 });
  writeFileSync(join(root, temp), bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });

  /* The object just created must still be the one about to be renamed. */
  const created = inspectPath(root, temp);
  if (created.kind !== "file") {
    throw new OperationRefused("the private temporary file is not the object that was created");
  }
  const before = { dev: created.stat.dev, ino: created.stat.ino };

  /* And the destination must still be safe at the last possible instant. */
  const lateProblems = pathContainmentProblems(root, destination);
  if (lateProblems.length > 0) throw new OperationRefused(lateProblems.join("; "));
  const lateState = inspectPath(root, destination);
  if (lateState.kind === "unsafe") throw new OperationRefused(lateState.why);
  if (lateState.kind === "dir") {
    throw new OperationRefused(`${destination} became a directory`);
  }

  const again = inspectPath(root, temp);
  if (again.kind !== "file" || again.stat.dev !== before.dev || again.stat.ino !== before.ino) {
    throw new OperationRefused("the private temporary file changed identity before the rename");
  }
  renameSync(join(root, temp), join(root, destination));
}
