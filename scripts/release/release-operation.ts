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
import { randomBytes } from "node:crypto";

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
 * Every reason `.release` may not be read or written. Empty means it may.
 *
 * An ABSENT directory is fine — no evidence has been recorded yet. A directory
 * that is a link, or that resolves outside the repository, is not: evidence
 * would be read from, and written to, somewhere this repository does not own.
 */
export function releaseDirProblems(root: string): readonly string[] {
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
}

const tokenOf = (st: Stats): OwnerToken => ({
  dev: st.dev,
  ino: st.ino,
  birthtimeMs: st.birthtimeMs,
  size: st.size,
});

const sameToken = (a: OwnerToken, b: OwnerToken): boolean =>
  a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs && a.size === b.size;

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

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(root, OPERATION_LOCK_PATH), "utf8"));
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
  return { kind: "held", lock, token: tokenOf(state.stat) };
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

  const done: string[] = [];
  const owner = state.lock;
  const op: Operation = Object.freeze({
    kind: owner.kind,
    operationId,
    head: owner.head,
    treeId: owner.treeId,
    token: state.token,
    pendingPath: pendingPathFor(operationId),
  });

  /* 1. Tombstone the canonical result, atomically, whatever it currently is. */
  const safety = evidenceFileProblems(root, recordPath);
  if (safety.length > 0) throw new OperationRefused(safety.join("; "));
  const tombstone = {
    status: GATE_ABANDONED,
    operationId,
    kind: owner.kind,
    head: owner.head,
    abandonedAt: new Date().toISOString(),
  };
  const tmp = `${recordPath}.recovering-${operationId}`;
  writeFileSync(join(root, tmp), `${JSON.stringify(tombstone, null, 2)}\n`, "utf8");
  renameSync(join(root, tmp), join(root, recordPath));
  done.push(`tombstoned ${recordPath} — no result is packageable until a new gate completes`);

  /* 2. Quarantine only THIS operation's pending file. */
  if (inspectPath(root, op.pendingPath).kind === "file") {
    const quarantine = quarantinePathFor(operationId);
    renameSync(join(root, op.pendingPath), join(root, quarantine));
    done.push(`quarantined ${op.pendingPath} to ${quarantine}`);
  } else {
    done.push(`no pending result belonged to ${operationId}`);
  }

  /* 3. Release only this exact operation. */
  endOperation(root, op);
  done.push(`released ${owner.kind} operation ${operationId}`);
  return done;
}
