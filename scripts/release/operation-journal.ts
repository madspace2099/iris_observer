/**
 * A DURABLE, PER-OPERATION JOURNAL, AND THE STATE MACHINE IT RECORDS.
 *
 * ## The two states the previous protocol could reach and not describe
 *
 * The mutex, the terminal claim and the canonical result were three independent
 * facts, and nothing wrote down which of them an operation had reached. Two
 * crash boundaries were independently reproduced:
 *
 *   1. A crash AFTER the canonical archive link and BEFORE `endOperation()`.
 *      The ZIP is on disk and correct; the mutex and claim are gone with the
 *      process; and the gate record can then be tombstoned by a recovery that
 *      believes nothing was published. A visible canonical archive beside a
 *      terminal state saying that operation was abandoned is not a state either
 *      side is entitled to produce.
 *
 *   2. A crash AFTER `endOperation()` and BEFORE the claim was released. The
 *      mutex is free and a stale claim remains. Recovery refused, because
 *      recovery began by reading a mutex that nobody held; a new operation then
 *      took the mutex and could not enter the terminal phase. Both were blocked,
 *      permanently, with no command that resolved it.
 *
 * Neither is a locking bug. Both are the absence of a record: nothing on disk
 * said what the dead process had achieved, so nothing could decide what was
 * safe to do next.
 *
 * ## What this is
 *
 * One append-only file per operation, written before each externally visible
 * transition and never rewritten. Each line carries the full identity of the
 * operation — id, kind, branch, HEAD, tree, tracked-input digest — so a reader
 * can tell whether a journal describes THIS repository at THIS commit, and the
 * archive's identity where one exists. The last line is the state.
 *
 * The journal is the authority. The mutex still serialises operations and the
 * terminal claim still arbitrates the last phase; what changed is that neither
 * is asked a question it cannot answer. "Was anything published?" is answered
 * by the journal and by the file, never inferred from which lock survived.
 */

import { createHash } from "node:crypto";
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  OperationRefused,
  RELEASE_DIR,
  inspectPath,
  isOperationId,
  pathContainmentProblems,
  type Operation,
  type OperationKind,
} from "./release-operation";

/**
 * Every state an operation may be in, and nothing else.
 *
 * TERMINAL states are `published`, `failed` and `recovered`: an operation in one
 * of them is finished and blocks nothing. Everything else is unresolved and
 * refuses a new operation until a person resolves it by name.
 */
export const OPERATION_STATES = Object.freeze([
  "started",
  "gate-red",
  "gate-green",
  "package-staging",
  "package-verified",
  "publishing",
  "published",
  "failed",
  "recovered",
] as const);

export type OperationState = (typeof OPERATION_STATES)[number];

export const TERMINAL_STATES: readonly OperationState[] = Object.freeze([
  "published",
  "failed",
  "recovered",
]);

export const isTerminalState = (s: OperationState): boolean => TERMINAL_STATES.includes(s);

/**
 * Which transitions are legal.
 *
 * Written down so an impossible sequence is a refusal rather than a state
 * nobody has reasoned about. `failed` is reachable from everywhere because a
 * refusal can happen at any point; `recovered` is reachable only through the
 * explicit recovery command.
 */
const ALLOWED: Readonly<Record<OperationState, readonly OperationState[]>> = Object.freeze({
  started: ["gate-red", "gate-green", "package-staging", "failed", "recovered"],
  /*
   * A GATE OPERATION COMPLETES BY PUBLISHING ITS RECORD, red or green. The
   * archive field stays null there: what a gate publishes is a canonical
   * result, not a file anybody receives.
   */
  "gate-red": ["published", "failed", "recovered"],
  "gate-green": ["package-staging", "published", "failed", "recovered"],
  "package-staging": ["package-verified", "failed", "recovered"],
  "package-verified": ["publishing", "failed", "recovered"],
  publishing: ["published", "failed", "recovered"],
  published: [],
  failed: [],
  recovered: [],
});

/** The identity of an archive, as the filesystem and a digest know it. */
export interface ArchiveIdentity {
  /** Repository-relative, slash-separated. */
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly sha: string;
}

export interface JournalEntry {
  readonly state: OperationState;
  readonly at: string;
  readonly operationId: string;
  readonly kind: OperationKind;
  readonly branch: string;
  readonly head: string;
  readonly treeId: string;
  readonly inputsDigest: string;
  /** Present from `publishing` onwards; null everywhere else. */
  readonly archive: ArchiveIdentity | null;
  /** One short line. Never a message, a path outside the repository or output. */
  readonly note: string;
}

const SAFE_NOTE = /^[A-Za-z0-9 ,.:;()/_-]{0,160}$/;

export function journalPathFor(operationId: string): string {
  return `${RELEASE_DIR}/journal-${operationId}.jsonl`;
}

/** Identify a file exactly, or refuse. `lstat`, so a link is seen as a link. */
export function identifyArchive(root: string, rel: string): ArchiveIdentity {
  const problems = pathContainmentProblems(root, rel);
  if (problems.length > 0) throw new OperationRefused(problems.join("; "));
  const path = join(root, rel);
  const st = lstatSync(path);
  if (st.isSymbolicLink()) throw new OperationRefused(`${rel} is a symbolic link`);
  if (!st.isFile()) throw new OperationRefused(`${rel} is not a regular file`);
  return Object.freeze({
    path: rel,
    dev: st.dev,
    ino: st.ino,
    size: st.size,
    sha: createHash("sha256").update(readFileSync(path)).digest("hex"),
  });
}

/** Every way two archive identities differ. Empty means the same file, unchanged. */
export function archiveIdentityProblems(
  expected: ArchiveIdentity,
  actual: ArchiveIdentity,
): readonly string[] {
  const problems: string[] = [];
  if (expected.path !== actual.path) problems.push("the archive is at a different path");
  if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
    problems.push("the archive is a different file object");
  }
  if (expected.size !== actual.size) problems.push("the archive is a different size");
  if (expected.sha !== actual.sha) problems.push("the archive hashes differently");
  return problems;
}

function validEntry(value: unknown): JournalEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const state = v.state;
  if (typeof state !== "string" || !(OPERATION_STATES as readonly string[]).includes(state)) {
    return null;
  }
  for (const field of ["at", "branch", "head", "treeId", "inputsDigest", "note"] as const) {
    if (typeof v[field] !== "string") return null;
  }
  if (!isOperationId(v.operationId)) return null;
  if (v.kind !== "gate" && v.kind !== "package") return null;
  if (!SAFE_NOTE.test(v.note as string)) return null;
  const archive = v.archive;
  if (archive !== null) {
    if (typeof archive !== "object" || archive === null || Array.isArray(archive)) return null;
    const a = archive as Record<string, unknown>;
    if (typeof a.path !== "string" || typeof a.sha !== "string") return null;
    for (const n of ["dev", "ino", "size"] as const) {
      if (typeof a[n] !== "number" || !Number.isFinite(a[n])) return null;
    }
  }
  return Object.freeze(v as unknown as JournalEntry);
}

/**
 * Read one operation's journal.
 *
 * A malformed line makes the WHOLE journal unreadable rather than being
 * skipped: a journal with a hole in it cannot say what happened, and guessing
 * around the hole is how a recovery decides something nobody recorded.
 */
export function readJournal(root: string, operationId: string): readonly JournalEntry[] {
  if (!isOperationId(operationId)) {
    throw new OperationRefused("the operation id is not the bounded 16-hex shape");
  }
  const rel = journalPathFor(operationId);
  const state = inspectPath(root, rel);
  if (state.kind === "absent") return [];
  if (state.kind !== "file") {
    throw new OperationRefused(
      state.kind === "unsafe" ? state.why : `${rel} is a directory where a journal belongs`,
    );
  }
  const lines = readFileSync(join(root, rel), "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
  const entries: JournalEntry[] = [];
  for (const [i, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new OperationRefused(`${rel} line ${String(i + 1)} is not readable JSON`);
    }
    const entry = validEntry(parsed);
    if (entry === null) throw new OperationRefused(`${rel} line ${String(i + 1)} is malformed`);
    if (entry.operationId !== operationId) {
      throw new OperationRefused(`${rel} line ${String(i + 1)} names a different operation`);
    }
    entries.push(entry);
  }
  return Object.freeze(entries);
}

/** The state an operation is in, or null when it has no journal. */
export function journalState(root: string, operationId: string): OperationState | null {
  const entries = readJournal(root, operationId);
  return entries.length === 0 ? null : (entries[entries.length - 1]?.state ?? null);
}

export interface JournalContext {
  readonly branch: string;
  readonly inputsDigest: string;
}

/**
 * Append one state, having proved the transition is legal.
 *
 * Written BEFORE the transition it describes wherever the transition is
 * externally visible — the journal must never be behind the world. A journal
 * that is ahead is recoverable; one that is behind is a published archive
 * nobody recorded.
 */
export function appendJournal(
  root: string,
  op: Operation,
  context: JournalContext,
  state: OperationState,
  options: { readonly archive?: ArchiveIdentity | null; readonly note?: string } = {},
): JournalEntry {
  const rel = journalPathFor(op.operationId);
  const problems = pathContainmentProblems(root, rel);
  if (problems.length > 0) throw new OperationRefused(problems.join("; "));

  const existing = readJournal(root, op.operationId);
  const last = existing[existing.length - 1];
  if (last === undefined) {
    if (state !== "started") {
      throw new OperationRefused(`an operation's journal must open with "started", not ${state}`);
    }
  } else if (!(ALLOWED[last.state] ?? []).includes(state)) {
    throw new OperationRefused(
      `${op.operationId} cannot move from ${last.state} to ${state}; that transition is not one this protocol has`,
    );
  }

  const note = options.note ?? "";
  if (!SAFE_NOTE.test(note)) {
    throw new OperationRefused("a journal note may not carry that shape of text");
  }

  const entry: JournalEntry = Object.freeze({
    state,
    at: new Date().toISOString(),
    operationId: op.operationId,
    kind: op.kind,
    branch: context.branch,
    head: op.head,
    treeId: op.treeId,
    inputsDigest: context.inputsDigest,
    archive: options.archive ?? null,
    note,
  });

  mkdirSync(join(root, RELEASE_DIR), { recursive: true });
  /* Exclusive on the first write, so two operations cannot share a journal. */
  if (existing.length === 0) {
    writeFileSync(join(root, rel), `${JSON.stringify(entry)}\n`, { encoding: "utf8", flag: "wx" });
  } else {
    appendFileSync(join(root, rel), `${JSON.stringify(entry)}\n`, "utf8");
  }
  return entry;
}

export interface UnresolvedOperation {
  readonly operationId: string;
  readonly state: OperationState;
  readonly entry: JournalEntry;
}

/**
 * Every operation whose journal has not reached a terminal state.
 *
 * This is what a new operation consults. The previous protocol asked "is the
 * mutex free?", which a crashed operation answers yes to while leaving a
 * published archive, a stale claim or both.
 */
export function unresolvedOperations(root: string): readonly UnresolvedOperation[] {
  const dir = inspectPath(root, RELEASE_DIR);
  if (dir.kind !== "dir") return [];
  const out: UnresolvedOperation[] = [];
  for (const name of readdirSync(join(root, RELEASE_DIR)).sort()) {
    const m = /^journal-([0-9a-f]{16})\.jsonl$/.exec(name);
    if (m === null) continue;
    const id = m[1] ?? "";
    const entries = readJournal(root, id);
    const last = entries[entries.length - 1];
    if (last === undefined || isTerminalState(last.state)) continue;
    out.push({ operationId: id, state: last.state, entry: last });
  }
  return Object.freeze(out);
}

/** The command a person runs to resolve one operation. Quoted, never guessed at. */
export const RESOLVE_COMMAND = (id: string): string =>
  `pnpm release:recover --operation=${id} --resolve`;

/**
 * Every reason a new operation may not start.
 *
 * Names the exact command for each unresolved operation, because "something is
 * stuck" without the command is what makes people delete lock files by hand.
 */
export function startupProblems(root: string): readonly string[] {
  const problems = unresolvedOperations(root).map(
    (u) =>
      `operation ${u.operationId} is unresolved in state ${u.state} (recorded ${u.entry.at}). ` +
      `Resolve it explicitly: ${RESOLVE_COMMAND(u.operationId)}`,
  );

  /*
   * AND THE TWO RESIDUES A JOURNAL ALONE CANNOT SEE.
   *
   * A crash between taking the mutex and writing the first journal line leaves
   * a lock with no journal at all; a crash after `endOperation()` leaves a
   * stale claim beside a journal that is already terminal. Neither appears in
   * the unresolved list, and both block the next operation — which is exactly
   * the pair of states that had no command to clear them.
   */
  const lock = readOperationLockFor(root);
  if (lock !== null && journalState(root, lock) === null) {
    problems.push(
      `operation ${lock} holds the release mutex and has no journal, so it died before ` +
        `recording anything. Resolve it explicitly: ${RESOLVE_COMMAND(lock)}`,
    );
  }
  const claim = readTerminalClaimFor(root);
  if (claim !== null) {
    const state = journalState(root, claim);
    if (state === null || isTerminalState(state)) {
      problems.push(
        `operation ${claim} left a terminal claim behind${
          state === null ? " with no journal" : ` after reaching ${state}`
        }. Resolve it explicitly: ${RESOLVE_COMMAND(claim)}`,
      );
    }
  }
  return problems;
}

/** The operation id holding the mutex, or null. Reads nothing else. */
function readOperationLockFor(root: string): string | null {
  const state = inspectPath(root, `${RELEASE_DIR}/release-operation.lock`);
  if (state.kind !== "file") return null;
  try {
    const v = JSON.parse(
      readFileSync(join(root, RELEASE_DIR, "release-operation.lock"), "utf8"),
    ) as Record<string, unknown>;
    return isOperationId(v.operationId) ? v.operationId : null;
  } catch {
    return null;
  }
}

/** The operation id holding the terminal claim, or null. */
function readTerminalClaimFor(root: string): string | null {
  const state = inspectPath(root, `${RELEASE_DIR}/release-terminal.claim`);
  if (state.kind !== "file") return null;
  try {
    const v = JSON.parse(
      readFileSync(join(root, RELEASE_DIR, "release-terminal.claim"), "utf8"),
    ) as Record<string, unknown>;
    return isOperationId(v.operationId) ? v.operationId : null;
  } catch {
    return null;
  }
}

export interface ResolutionOutcome {
  readonly operationId: string;
  readonly from: OperationState | null;
  readonly to: OperationState | "already-terminal";
  readonly steps: readonly string[];
}

/**
 * Resolve one operation, by name, whatever it crashed in the middle of.
 *
 * ## What makes this different from the previous recovery
 *
 *   - It does NOT require owning the stale operation's mutex. That requirement
 *     is what made a crash after `endOperation()` unrecoverable.
 *   - It is IDEMPOTENT. Running it twice reports the terminal state the first
 *     run reached and changes nothing.
 *   - It is FAIL-CLOSED about archives. It finalises a `publishing` operation
 *     only when the canonical file is the exact object that operation recorded
 *     — same device, inode, size and digest — and it removes a canonical path
 *     only when it has proved the same thing. A pre-existing or foreign archive
 *     is never touched, and no archive is ever deleted to tidy up.
 *   - It has no timeout and no age check. A slow operation and a dead one look
 *     identical from outside, and the difference is a person's knowledge.
 */
export function resolveOperation(
  root: string,
  operationId: string,
  hooks: {
    /** Prove the canonical archive is intact. Throws or returns problems. */
    readonly verifyArchive?: (rel: string) => readonly string[];
    /** Release this operation's lock and claim, if they are still its own. */
    readonly releaseOwnership?: (entry: JournalEntry) => readonly string[];
  } = {},
): ResolutionOutcome {
  if (!isOperationId(operationId)) {
    throw new OperationRefused("the operation id to resolve is not the bounded 16-hex shape");
  }
  const entries = readJournal(root, operationId);
  const last = entries[entries.length - 1];
  if (last === undefined) {
    /*
     * NO JOURNAL AT ALL — a crash between taking the mutex and the first
     * journal line. There is nothing to finalise and nothing to reason about,
     * so the only safe act is to release what this operation demonstrably holds
     * and record nothing about what it achieved, because it achieved nothing.
     */
    const steps = [
      ...(hooks.releaseOwnership?.({
        state: "started",
        at: new Date().toISOString(),
        operationId,
        kind: "package",
        branch: "",
        head: "",
        treeId: "",
        inputsDigest: "",
        archive: null,
        note: "",
      }) ?? []),
    ];
    if (steps.length === 0) {
      throw new OperationRefused(
        `no journal exists for ${operationId} and it holds nothing; there is nothing to resolve`,
      );
    }
    return Object.freeze({
      operationId,
      from: null,
      to: "recovered" as const,
      steps: Object.freeze([
        ...steps,
        `${operationId} recorded nothing before it died; released what it held and nothing else`,
      ]),
    });
  }
  const steps: string[] = [];
  if (isTerminalState(last.state)) {
    /* IDEMPOTENT: say so and change nothing. */
    return Object.freeze({
      operationId,
      from: last.state,
      to: "already-terminal" as const,
      steps: Object.freeze([`${operationId} is already ${last.state}; nothing was changed`]),
    });
  }

  const context: JournalContext = { branch: last.branch, inputsDigest: last.inputsDigest };
  const op: Operation = Object.freeze({
    kind: last.kind,
    operationId,
    head: last.head,
    treeId: last.treeId,
    /*
     * A PLACEHOLDER TOKEN, and it is never used to assert ownership.
     *
     * Resolution deliberately does NOT require owning the stale operation’s
     * mutex — that requirement is what made a crash after `endOperation()`
     * unrecoverable. Releasing ownership is a hook the caller supplies, and it
     * does its own checking against the real lock.
     */
    token: { dev: 0, ino: 0, birthtimeMs: 0, size: 0, isFile: false, digest: "" },
    pendingPath: `${RELEASE_DIR}/pending-${operationId}.json`,
  });

  /*
   * THE ONE STATE WHERE AN ARCHIVE MAY ALREADY BE VISIBLE.
   *
   * `publishing` was written BEFORE the link, so a crash anywhere around it
   * leaves this state and possibly a canonical file. Whether that file is this
   * operation's is a question about bytes and inodes, not about locks.
   */
  let to: OperationState = "recovered";
  if (last.state === "publishing" && last.archive !== null) {
    const declared = last.archive;
    const present = inspectPath(root, declared.path);
    if (present.kind === "absent") {
      steps.push(`no archive at ${declared.path}; the publication did not complete`);
      to = "failed";
    } else if (present.kind !== "file") {
      throw new OperationRefused(
        `${declared.path} is not a regular file; refusing to reason about it`,
      );
    } else {
      const actual = identifyArchive(root, declared.path);
      const drift = archiveIdentityProblems(declared, actual);
      if (drift.length > 0) {
        /*
         * FAIL CLOSED, AND TOUCH NOTHING. The file at that path is not the one
         * this operation created, so it belongs to somebody else — possibly a
         * previous, fully verified delivery.
         */
        throw new OperationRefused(
          `${declared.path} exists and is not the archive ${operationId} recorded: ` +
            `${drift.join("; ")}. Nothing has been moved or removed.`,
        );
      }
      const problems = hooks.verifyArchive?.(declared.path) ?? [];
      if (problems.length > 0) {
        throw new OperationRefused(
          `${declared.path} is this operation's file and does not pass verification: ` +
            `${problems.join("; ")}. Nothing has been moved or removed.`,
        );
      }
      steps.push(
        `${declared.path} is the exact archive ${operationId} recorded and verifies; finalising`,
      );
      to = "published";
    }
  }

  const ownership = hooks.releaseOwnership?.(last) ?? [];
  steps.push(...ownership);

  appendJournal(root, op, context, to, {
    archive: to === "published" ? last.archive : null,
    note: to === "published" ? "finalised by explicit resolution" : "resolved by operator",
  });
  steps.push(`${operationId} is now ${to}`);
  return Object.freeze({ operationId, from: last.state, to, steps: Object.freeze(steps) });
}

/*
 * `privateTempPath` and `writeThroughPrivateTemp` live in `release-operation`,
 * beside the containment primitives they are built from, and are re-exported
 * here because this module is where the safe-write discipline is described.
 */
export { privateTempPath, writeThroughPrivateTemp } from "./release-operation";
