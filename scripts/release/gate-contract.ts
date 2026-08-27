/**
 * What a gate record has to contain before a package may be built from it.
 *
 * The packager used to render section 7 from whatever `.release/gate-results.json`
 * happened to hold, and to build happily when it held nothing at all: a missing
 * file produced "GATES NOT RECORDED", a file from another commit produced a
 * "STALE" banner, and both went into an archive that otherwise looked complete.
 * A reviewer receiving that archive has a package whose verification evidence
 * says, in small print, that there is none.
 *
 * So the record is now a precondition rather than a decoration. It must exist,
 * name the exact HEAD being packaged, and be clean on every required gate —
 * process status, signal, spawn error, report verdict, failed tests, failed
 * suites and runtime-error suites, each checked independently.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { scanProblems, describeScan, type ControlCharacterScan } from "./control-chars";

/**
 * The gate whose result is a measurement rather than a verdict.
 *
 * It has no child process of its own — the runner scans in-process — so it is
 * exempt from the process checks and subject to the structured ones instead.
 */
export const CONTROL_CHARACTER_GATE = "raw-NUL scan";

/**
 * The conditions a green record must have been produced under.
 *
 * Four workers is a measured number, not a preference: the runner-level exit
 * was reproduced under the pool's default sizing, and the bounded matrix put
 * every four-worker run's parent stall far below every default run's. Naming
 * the numbers here means a record from an unbounded run cannot be packaged as
 * evidence for a bounded one.
 */
/**
 * The one canonical rendering of the test totals.
 *
 * A renderer AND a parser, because the verdict has to survive sanitization and
 * the sanitizer refuses arbitrary slash-containing strings — for good reason,
 * since a path is slash-shaped. The delivered `c1b80f0` archive lost its
 * `pnpm test` verdict to exactly that rule: the canonical form ends
 * "/ 45 files", the generic text filter dropped it, the key vanished from the
 * staged record, and nothing re-validated the projection. So this shape is
 * recognised explicitly rather than being let through a widened filter.
 */
export function renderTestVerdict(t: {
  passed: number;
  skipped: number;
  failed: number;
  files: number;
}): string {
  return `${String(t.passed)} passed, ${String(t.skipped)} skipped, ${String(t.failed)} failed / ${String(t.files)} files`;
}

const TEST_VERDICT = /^(\d{1,7}) passed, (\d{1,7}) skipped, (\d{1,7}) failed \/ (\d{1,5}) files$/;

/** The four numbers a canonical test verdict states, or nothing. */
export function parseTestVerdict(
  value: unknown,
): { passed: number; skipped: number; failed: number; files: number } | null {
  if (typeof value !== "string") return null;
  const m = TEST_VERDICT.exec(value);
  if (m === null) return null;
  const [, passed, skipped, failed, files] = m;
  return {
    passed: Number(passed),
    skipped: Number(skipped),
    failed: Number(failed),
    files: Number(files),
  };
}

/**
 * What each gate's verdict must say when it is clean.
 *
 * Prose is DERIVED from the measurement, never accepted as one. The old rule
 * only refused a verdict containing the word FAILED, so "BROKEN" beside green
 * process metadata passed — a sentence nobody wrote on purpose, accepted
 * because it did not contain the one word being looked for.
 *
 * `pnpm test` and `raw-NUL scan` are absent here: both are rendered from
 * structured counts and checked against them separately.
 */
export const CANONICAL_VERDICTS: Readonly<Record<string, string>> = {
  "pnpm format:check": "clean",
  "pnpm typecheck": "0 errors",
  "pnpm lint": "clean",
  "pnpm build": "clean",
  "secret audit": "clean",
  "wrappers vs sources": "every body byte-identical",
};

export const REQUIRED_PHASE = "test";
export const REQUIRED_POOL = "forks";
export const REQUIRED_WORKERS = 4;

/** `vitest 3.2.7` — a bounded name and a version, and nothing else. */
const RUNNER_IDENTITY = /^[a-z][a-z0-9-]{0,23} [0-9]{1,3}(\.[0-9]{1,4}){0,3}$/;

/**
 * Every gate that must have run, under the key the runner records it as.
 *
 * Named here rather than inferred from whatever the record contains, because a
 * gate that silently stopped being run would otherwise silently stop being
 * required.
 */
export const REQUIRED_GATES: readonly string[] = [
  "pnpm format:check",
  "pnpm typecheck",
  "pnpm lint",
  "pnpm test",
  "pnpm build",
  "secret audit",
  "raw-NUL scan",
  "wrappers vs sources",
];

export interface RecordedProcess {
  readonly ok?: boolean;
  readonly status?: number | null;
  readonly signal?: string | null;
  readonly errorCode?: string | null;
}

export interface RecordedTestGate extends RecordedProcess {
  readonly reportSuccess?: boolean | null;
  readonly reportedFailedTests?: number | null;
  readonly countedFailedTests?: number | null;
  readonly reportedFailedSuites?: number | null;
  readonly runtimeErrorSuites?: number | null;
  readonly failedSuiteNames?: readonly string[];
  /** Identities of the failing tests. Must be present, and must be empty. */
  readonly failedTests?: readonly { readonly suite: string; readonly title: string }[];
  /**
   * Identities of the skipped tests. Present so a changed skip COUNT can be
   * explained rather than noticed; not required to be empty, because skipping
   * a platform-specific test is correct behaviour.
   */
  readonly skippedTests?: readonly { readonly suite: string; readonly title: string }[];
  /*
   * RUNNER-LEVEL EVIDENCE, required.
   *
   * Vitest 3.2.7 sets exit code 1 when its unhandled-error list is non-empty,
   * and its JSON reporter discards that list and computes `success` without
   * it. Every field above can therefore say the run was clean while the
   * process says it failed — which is the record this contract could not
   * explain at `7d941ba`. Absent is a refusal, because "not measured" and
   * "measured as none" are different facts and only one is evidence.
   */
  readonly reportedUnhandledErrors?: number | null;
  readonly sanitizedUnhandledErrorNames?: readonly string[];
  readonly sanitizedUnhandledErrorCodes?: readonly string[];
  readonly reportWritten?: boolean;
  readonly reportParsed?: boolean;
  readonly reportCompleted?: boolean;
  readonly processStatus?: number | null;
  readonly processSignal?: string | null;
  readonly processErrorCode?: string | null;
  readonly phase?: string;
  readonly durationMs?: number | null;
  readonly runner?: string | null;
  readonly workerPool?: string | null;
  readonly workerCount?: number | null;
  readonly configuredMinWorkers?: number | null;
  readonly configuredMaxWorkers?: number | null;
  /** Only if something reliably measured it. Absent means unmeasured. */
  readonly observedPeakWorkers?: number | null;
  readonly reasons?: readonly string[];
}

export interface GateRecord {
  /** Which attempt produced this record. Required for a finished one. */
  readonly attemptId?: string;
  readonly head?: string;
  /**
   * Structured control-character evidence, over the tracked working tree.
   *
   * Required. The previous contract read only the free-text verdict, so both
   * `"8 FOUND"` and `"BROKEN"` permitted packaging: neither contains the word
   * the string check looked for. Numbers cannot be misread that way.
   */
  readonly controlCharacterScan?: ControlCharacterScan;
  readonly tests?: {
    readonly passed?: number;
    readonly skipped?: number;
    readonly failed?: number;
    readonly files?: number;
    readonly perFile?: Readonly<Record<string, number>>;
  };
  readonly testGate?: RecordedTestGate;
  readonly processes?: Readonly<Record<string, RecordedProcess>>;
  readonly gates?: Readonly<Record<string, string>>;
}

export const GATE_RECORD_PATH = ".release/gate-results.json";

/**
 * The marker a gate attempt leaves in place of the record while it runs.
 *
 * `run-gates.ts` used to write only at the very end. A run that crashed, was
 * killed, or was interrupted therefore left the PREVIOUS record untouched — and
 * if that record was green at the same HEAD, the packager accepted it. The
 * archive would then carry verification evidence from a run that had been
 * superseded by one nobody saw finish.
 *
 * So the canonical result is invalidated synchronously before the first gate
 * starts, and the finished record is renamed into place only once every result
 * is in hand. Anything that stops in between leaves this, which is not a
 * packageable record.
 */
export const GATE_IN_PROGRESS = "IN_PROGRESS";

/** Is this file the in-progress marker rather than a result? */
export function isInProgress(record: GateRecord | null): boolean {
  return (record as { status?: unknown } | null)?.status === GATE_IN_PROGRESS;
}

/**
 * The file that says an attempt owns the gate right now.
 *
 * The marker alone was not enough. It says "an attempt is in progress" and
 * nothing about WHOSE, so two runners could each write it, each run the whole
 * suite, and each rename its own result over the other's — the second one
 * publishing a record for a tree the first had already measured differently.
 * Neither would notice, and the archive would carry whichever finished last.
 *
 * The lock is created EXCLUSIVELY (`wx`): the filesystem decides the winner,
 * not a read-then-write that can interleave. It carries the attempt's own id,
 * so publication can check that the attempt about to rename its result still
 * holds the gate.
 */
export const GATE_LOCK_PATH = ".release/gate-attempt.lock";

/** A bounded attempt id: exactly 16 lowercase hex characters. */
const ATTEMPT_ID = /^[0-9a-f]{16}$/;

export function isAttemptId(value: unknown): value is string {
  return typeof value === "string" && ATTEMPT_ID.test(value);
}

export interface AttemptLock {
  readonly attemptId: string;
  readonly head: string;
  readonly startedAt: string;
}

/** The lock as it sits on disk, or null when there is none. */
export function readAttemptLock(root: string): AttemptLock | null {
  const path = join(root, GATE_LOCK_PATH);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AttemptLock;
  } catch {
    /*
     * FAIL CLOSED. An unreadable lock is not an absent one — a half-written
     * file is exactly what an attempt killed mid-write leaves behind. It is
     * reported as a held lock whose owner cannot be identified, which refuses
     * everything, rather than as free.
     */
    return Object.freeze({ attemptId: "", head: "", startedAt: "" });
  }
}

/**
 * Why this lock forbids proceeding. Empty means the gate is free.
 *
 * A lock that exists at all forbids it. There is deliberately no age at which
 * a lock becomes ignorable: "stale" is a guess about a process this one cannot
 * see, and guessing wrong means two runners publishing over each other. A
 * human deletes the file, having decided the other attempt is really gone.
 */
export function lockProblems(lock: AttemptLock | null): readonly string[] {
  if (lock === null) return [];
  const who = isAttemptId(lock.attemptId)
    ? `attempt ${lock.attemptId}`
    : "an attempt whose id is missing or malformed";
  const when =
    typeof lock.startedAt === "string" && lock.startedAt !== ""
      ? lock.startedAt
      : "an unrecorded time";
  const at =
    typeof lock.head === "string" && lock.head.length >= 7
      ? lock.head.slice(0, 7)
      : "an unrecorded commit";
  return [
    `the gate is held by ${who}, started at ${when} on ${at}. Only one attempt may ` +
      `run at a time. If that attempt is really gone, delete ${GATE_LOCK_PATH} — ` +
      `this is never done automatically, because an age is a guess about a ` +
      `process this one cannot see.`,
  ];
}

/** A gate attempt may not proceed. Carries only the reason, never a path secret. */
export class AttemptRefused extends Error {}

/**
 * Take exclusive ownership of the gate, or refuse.
 *
 * `wx` is the whole mechanism: the filesystem creates the file or fails, and it
 * decides the winner. A read-then-write can interleave between the read and
 * the write, and then two runners each believe they own the gate, each run the
 * whole suite, and each rename its own result over the other's.
 *
 * An existing lock is NEVER taken over, at any age. This process cannot see
 * whether the other one is alive, so every timeout is a guess, and guessing
 * wrong is exactly the failure the lock exists to prevent. The refusal names
 * the file and leaves the decision to a human.
 */
export function acquireAttempt(root: string, head: string, id?: string): string {
  const attemptId = id ?? randomBytes(8).toString("hex");
  if (!isAttemptId(attemptId)) throw new AttemptRefused("the attempt id is not well formed");
  mkdirSync(join(root, ".release"), { recursive: true });
  try {
    writeFileSync(
      join(root, GATE_LOCK_PATH),
      `${JSON.stringify({ attemptId, head, startedAt: new Date().toISOString() }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  } catch {
    const held = lockProblems(readAttemptLock(root));
    throw new AttemptRefused(
      held.length > 0 ? held.join(" ") : "the gate is held and the lock could not be read",
    );
  }
  return attemptId;
}

/**
 * Publish this attempt's finished result, if this attempt still holds the gate.
 *
 * Not ceremony. Between acquiring the lock and finishing a suite that takes
 * minutes, somebody may have deleted the lock by hand and started another
 * attempt. That attempt owns the record now, and this one must discard its
 * measurements rather than rename them over a newer run's.
 *
 * The rename is the atomic step, and the lock is released only AFTER it: a
 * window where the gate is free and the record is still the old one would let
 * a packager read a result this attempt had already superseded.
 */
export function publishAttempt(root: string, attemptId: string): void {
  const recordPath = join(root, GATE_RECORD_PATH);
  const pendingPath = `${recordPath}.pending`;
  const lock = readAttemptLock(root);
  if (lock === null || lock.attemptId !== attemptId) {
    rmSync(pendingPath, { force: true });
    throw new AttemptRefused(
      "this attempt no longer holds the gate: it measured a complete result and is " +
        "discarding it rather than publishing over whatever owns the record now",
    );
  }
  renameSync(pendingPath, recordPath);
  rmSync(join(root, GATE_LOCK_PATH), { force: true });
}

/** The record as it sits on disk, or null when there is none to read. */
export function readGateRecord(root: string): GateRecord | null {
  const path = join(root, GATE_RECORD_PATH);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as GateRecord;
  } catch {
    return null;
  }
}

/**
 * Every reason this record may not be packaged. Empty means it may.
 *
 * Fail-closed throughout: an absent field is a failure, not a pass, because
 * "the runner did not record it" and "the runner recorded it as fine" are
 * different facts and only one of them is evidence.
 */
/**
 * The runner-level half of the test gate, checked as data.
 *
 * Separated from {@link gateRecordProblems} because it is a different KIND of
 * claim: everything else there is about tests, and this is about the process
 * that ran them. A run can be clean on every test-level field and still have
 * exited 1, and for three milestones the record had no way to say so.
 */
/**
 * All four fields present, and all four exactly clean.
 *
 * ABSENT IS NOT CLEAN, and the old rule said it was. `signal` and `errorCode`
 * were each compared against both `null` AND `undefined`, so a record that
 * simply omitted them satisfied the check — a process the runner never managed
 * to describe read exactly like one that exited cleanly. `ok` was not consulted
 * at all.
 */
/** A count: a non-negative integer, and nothing that merely looks like one. */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** A test-file label fit to persist: a basename, bounded, no path, no control byte. */
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * The rendered totals, checked as arithmetic rather than read as a sentence.
 *
 * The contract validated the test GATE and never the `tests` object the archive
 * prints. So a record could say "1340 passed, 1 skipped, 0 failed / 45 files"
 * beside per-file counts summing to something else entirely, and section 7 of
 * the package would print the sentence.
 */
export function testTotalsProblems(record: GateRecord): readonly string[] {
  const problems: string[] = [];
  const t = record.tests;
  if (t === undefined) return ["no test totals recorded"];

  for (const [field, value] of [
    ["passed", t.passed],
    ["skipped", t.skipped],
    ["failed", t.failed],
    ["files", t.files],
  ] as const) {
    if (!isCount(value)) problems.push(`tests.${field} is not a count: ${JSON.stringify(value)}`);
  }
  if (problems.length > 0) return problems;

  const passed = t.passed ?? 0;
  const skipped = t.skipped ?? 0;
  const failed = t.failed ?? 0;
  const files = t.files ?? 0;
  const total = passed + skipped + failed;

  if (failed !== 0) problems.push(`tests.failed is ${String(failed)}`);

  const perFile = t.perFile;
  if (perFile === undefined || typeof perFile !== "object") {
    problems.push("tests.perFile not recorded");
    return problems;
  }
  const entries = Object.entries(perFile);
  for (const [label, count] of entries) {
    if (!SAFE_LABEL.test(label)) {
      problems.push(`tests.perFile has an unsafe label: ${JSON.stringify(label.slice(0, 32))}`);
    }
    if (!isCount(count)) problems.push(`tests.perFile[${label}] is not a count`);
  }
  if (entries.length !== files) {
    problems.push(
      `tests.perFile has ${String(entries.length)} entries but tests.files is ${String(files)}`,
    );
  }
  const summed = entries.reduce((a, [, n]) => a + (isCount(n) ? n : 0), 0);
  if (summed !== total) {
    problems.push(`tests.perFile sums to ${String(summed)}, not ${String(total)}`);
  }

  const gate = record.testGate;
  if (gate !== undefined) {
    const failedIds = gate.failedTests;
    if (Array.isArray(failedIds) && failedIds.length !== failed) {
      problems.push(
        `${String(failedIds.length)} failed-test identities for ${String(failed)} failed tests`,
      );
    }
    const skippedIds = gate.skippedTests;
    if (Array.isArray(skippedIds) && skippedIds.length !== skipped) {
      problems.push(
        `${String(skippedIds.length)} skipped-test identities for ${String(skipped)} skipped tests`,
      );
    }
    for (const [what, list] of [
      ["failed", failedIds],
      ["skipped", skippedIds],
    ] as const) {
      if (!Array.isArray(list)) continue;
      const seen = new Set<string>();
      for (const id of list) {
        const suite = (id as { suite?: unknown }).suite;
        const title = (id as { title?: unknown }).title;
        if (typeof suite !== "string" || !SAFE_LABEL.test(suite)) {
          problems.push(`${what} identity has an unsafe suite name`);
          continue;
        }
        if (typeof title !== "string" || title.length === 0 || title.length > 200) {
          problems.push(`${what} identity has no usable title`);
          continue;
        }
        const key = `${suite} > ${title}`;
        if (seen.has(key)) problems.push(`duplicate ${what} identity: ${suite}`);
        seen.add(key);
      }
    }

    /*
     * EVERY zero-failure claim, cross-checked against every other one. A run is
     * clean or it is not; six fields saying so and one saying otherwise is a
     * record that cannot be believed in either direction.
     */
    const claims: [string, unknown][] = [
      ["reportSuccess", gate.reportSuccess === true],
      ["reportedFailedTests", gate.reportedFailedTests === 0],
      ["countedFailedTests", gate.countedFailedTests === 0],
      ["reportedFailedSuites", gate.reportedFailedSuites === 0],
      ["runtimeErrorSuites", gate.runtimeErrorSuites === 0],
      ["failedSuiteNames", (gate.failedSuiteNames ?? ["unrecorded"]).length === 0],
      ["reportedUnhandledErrors", gate.reportedUnhandledErrors === 0],
      ["processStatus", gate.processStatus === 0],
    ];
    const disagreeing = claims.filter(([, ok]) => ok !== true).map(([name]) => name);
    if (failed === 0 && disagreeing.length > 0) {
      problems.push(
        `tests.failed is 0 but ${disagreeing.join(", ")} disagree${disagreeing.length === 1 ? "s" : ""}`,
      );
    }
  }

  /* The verdict string must be the canonical rendering of those numbers. */
  const verdict = record.gates?.["pnpm test"];
  const canonical = `${String(passed)} passed, ${String(skipped)} skipped, ${String(failed)} failed / ${String(files)} files`;
  if (verdict !== canonical) {
    problems.push(
      `the pnpm test verdict ${JSON.stringify(verdict)} is not the canonical rendering ` +
        `of the structured results (expected ${JSON.stringify(canonical)})`,
    );
  }

  return problems;
}

export function cleanProcessProblems(p: RecordedProcess, label: string): readonly string[] {
  const problems: string[] = [];

  if (p.ok === undefined) problems.push(`${label}: ok not recorded`);
  else if (p.ok !== true) problems.push(`${label}: ok is false`);

  if (p.status === undefined) problems.push(`${label}: status not recorded`);
  else if (p.status !== 0) problems.push(`${label}: exit status ${String(p.status)}`);

  /* `null` is a recorded absence of a signal. `undefined` is no record at all. */
  if (p.signal === undefined) problems.push(`${label}: signal not recorded`);
  else if (p.signal !== null) problems.push(`${label}: signal ${p.signal}`);

  if (p.errorCode === undefined) problems.push(`${label}: errorCode not recorded`);
  else if (p.errorCode !== null) problems.push(`${label}: spawn error ${p.errorCode}`);

  return problems;
}

/** Do two recorded process triples describe the same outcome? */
export function processTriplesAgree(
  a: Pick<RecordedProcess, "status" | "signal" | "errorCode">,
  b: Pick<RecordedProcess, "status" | "signal" | "errorCode">,
): boolean {
  return a.status === b.status && a.signal === b.signal && a.errorCode === b.errorCode;
}

export function runnerEvidenceProblems(t: RecordedTestGate): readonly string[] {
  const problems: string[] = [];

  if (t.reportedUnhandledErrors === undefined || t.reportedUnhandledErrors === null) {
    problems.push("unhandled runner errors were not measured — rerun `pnpm release:gates`");
  } else if (!Number.isInteger(t.reportedUnhandledErrors) || t.reportedUnhandledErrors < 0) {
    problems.push(
      `reportedUnhandledErrors is not a count: ${JSON.stringify(t.reportedUnhandledErrors)}`,
    );
  } else if (t.reportedUnhandledErrors > 0) {
    const ids = [
      ...(t.sanitizedUnhandledErrorNames ?? []),
      ...(t.sanitizedUnhandledErrorCodes ?? []),
    ]
      .filter((s) => s !== "(none)")
      .join(", ");
    problems.push(
      `${String(t.reportedUnhandledErrors)} unhandled runner error(s)${ids === "" ? "" : `: ${ids}`}`,
    );
  }

  for (const [field, value] of [
    ["reportWritten", t.reportWritten],
    ["reportParsed", t.reportParsed],
    ["reportCompleted", t.reportCompleted],
  ] as const) {
    if (value === undefined) problems.push(`${field} not recorded`);
    else if (value !== true) problems.push(`${field} is false`);
  }

  /*
   * TYPES BEFORE VALUES. A string has a `length`, so a field that should be an
   * array and is not would otherwise be read for one — and a sanitizer that
   * turned a malformed field into an empty array would make "not recorded" and
   * "recorded as none" indistinguishable all over again.
   */
  for (const [field, value] of [
    ["sanitizedUnhandledErrorNames", t.sanitizedUnhandledErrorNames],
    ["sanitizedUnhandledErrorCodes", t.sanitizedUnhandledErrorCodes],
    ["failedSuiteNames", t.failedSuiteNames],
    ["failedTests", t.failedTests],
    ["skippedTests", t.skippedTests],
    ["reasons", t.reasons],
  ] as const) {
    if (!Array.isArray(value)) problems.push(`${field} is not an array`);
  }

  /* Zero unhandled errors and a non-empty identity list cannot both be true. */
  const unhandled = t.reportedUnhandledErrors;
  const names = Array.isArray(t.sanitizedUnhandledErrorNames) ? t.sanitizedUnhandledErrorNames : [];
  const codes = Array.isArray(t.sanitizedUnhandledErrorCodes) ? t.sanitizedUnhandledErrorCodes : [];
  const identified =
    names.filter((n) => n !== "(none)").length + codes.filter((c) => c !== "(none)").length;
  if (unhandled === 0 && identified > 0) {
    problems.push("reportedUnhandledErrors is 0 but unhandled-error identities were recorded");
  }
  if (isCount(unhandled) && unhandled > 0 && identified === 0) {
    problems.push(
      `reportedUnhandledErrors is ${String(unhandled)} but no identity was recorded for any of them`,
    );
  }

  /*
   * The three process facts under their explicit names, cross-checked against
   * the ones already recorded. A record that disagrees with itself is not
   * evidence, whichever half is right.
   */
  if (t.processStatus === undefined) problems.push("processStatus not recorded");
  else if (t.processStatus !== t.status) {
    problems.push(
      `processStatus ${String(t.processStatus)} disagrees with status ${String(t.status)}`,
    );
  }
  if (t.processSignal === undefined) problems.push("processSignal not recorded");
  else if (t.processSignal !== (t.signal ?? null)) {
    problems.push("processSignal disagrees with signal");
  }
  if (t.processErrorCode === undefined) problems.push("processErrorCode not recorded");
  else if (t.processErrorCode !== (t.errorCode ?? null)) {
    problems.push("processErrorCode disagrees with errorCode");
  }

  /*
   * THE CONCURRENCY BOUND IS PART OF THE ACCEPTANCE, NOT A NOTE ON IT.
   *
   * The runner-level exit was reproduced under the pool's default sizing and
   * has not been reproduced under four workers. That correction is only worth
   * anything if the record proves the run it describes actually used it — and
   * the contract accepted this field missing, null, or set to anything at all.
   * A record from an unbounded run would then have been packaged as evidence
   * for a bounded one.
   *
   * It is not proof that recurrence is impossible. It is the guarantee that a
   * green record was produced under the conditions this release claims.
   */
  if (t.phase === undefined) problems.push("phase not recorded");
  else if (t.phase !== REQUIRED_PHASE) {
    problems.push(`phase is ${JSON.stringify(t.phase)}, not ${JSON.stringify(REQUIRED_PHASE)}`);
  }

  if (t.workerPool === undefined || t.workerPool === null) problems.push("workerPool not recorded");
  else if (t.workerPool !== REQUIRED_POOL) {
    problems.push(`workerPool is ${JSON.stringify(t.workerPool)}, not ${REQUIRED_POOL}`);
  }

  /*
   * BOTH BOUNDS, AND THEY ARE CONFIGURATION.
   *
   * The forks pool keeps `minWorkers` processes alive independently of
   * `maxWorkers`, so a ceiling alone does not describe the pool. Recording both
   * proves what the pool was TOLD. It is not an observed peak, nothing here
   * measures one, and this contract does not pretend otherwise.
   */
  for (const [field, value] of [
    ["workerCount", t.workerCount],
    ["configuredMinWorkers", t.configuredMinWorkers],
    ["configuredMaxWorkers", t.configuredMaxWorkers],
  ] as const) {
    if (value === undefined || value === null) {
      problems.push(`${field} not recorded — the run may have been unbounded`);
    } else if (value !== REQUIRED_WORKERS) {
      problems.push(
        `${field} is ${String(value)}, not ${String(REQUIRED_WORKERS)} — ` +
          `this record did not come from a run bounded the way the release claims`,
      );
    }
  }

  /*
   * If an observed peak is ever recorded it must not exceed the bound. Absent
   * is fine: the evidence then proves configuration only, and says so.
   */
  if (t.observedPeakWorkers !== undefined && t.observedPeakWorkers !== null) {
    if (!isCount(t.observedPeakWorkers)) {
      problems.push("observedPeakWorkers is not a count");
    } else if (t.observedPeakWorkers > REQUIRED_WORKERS) {
      problems.push(
        `observedPeakWorkers is ${String(t.observedPeakWorkers)}, above the bound of ${String(REQUIRED_WORKERS)}`,
      );
    }
  }

  /*
   * The runner's identity, bounded. It says which Vitest produced the record,
   * and every conclusion about that reporter's behaviour is version-specific.
   */
  if (t.runner === undefined || t.runner === null) problems.push("runner not recorded");
  else if (!RUNNER_IDENTITY.test(t.runner)) {
    problems.push(
      `runner identity is not a bounded name: ${JSON.stringify(t.runner.slice(0, 32))}`,
    );
  }

  return problems;
}

export function gateRecordProblems(record: GateRecord | null, head: string): readonly string[] {
  if (record === null)
    return [`${GATE_RECORD_PATH} is missing or unreadable — run \`pnpm release:gates\``];

  if (isInProgress(record)) {
    const id = (record as { attemptId?: unknown }).attemptId;
    const owner = isAttemptId(id)
      ? ` (attempt ${id})`
      : " (by an attempt that did not identify itself)";
    return [
      `a gate attempt was started and did not finish${owner}. The previous result ` +
        "was invalidated when it began, and nothing has replaced it — run " +
        "`pnpm release:gates` again.",
    ];
  }

  const problems: string[] = [];
  /*
   * WHICH ATTEMPT PRODUCED THIS. Without it a record is anonymous: nothing
   * connects the bytes on disk to the run that measured them, and a record
   * left by an attempt that lost the gate is indistinguishable from one left
   * by the attempt that held it.
   */
  if (!isAttemptId((record as { attemptId?: unknown }).attemptId)) {
    problems.push(
      "the record does not name the attempt that produced it — rerun `pnpm release:gates`",
    );
  }
  if (record.head !== head) {
    problems.push(
      `recorded at ${String(record.head).slice(0, 7) || "nothing"}, not at ${head.slice(0, 7)} — rerun \`pnpm release:gates\``,
    );
  }

  for (const gate of REQUIRED_GATES) {
    const outcome = record.gates?.[gate];
    if (outcome === undefined) {
      problems.push(`${gate}: no result recorded`);
      continue;
    }
    /*
     * Case-SENSITIVE, and deliberately. The runner writes the literal word
     * FAILED for a failure, while a clean test gate reads "… 0 failed / 40
     * files" — a case-insensitive match rejected every green record it saw.
     *
     * IT IS ALSO NOT ENOUGH ON ITS OWN. A string check can only reject prose it
     * recognises: `"8 FOUND"` and `"BROKEN"` both passed it, because neither
     * contains the word it looks for. Gates whose result is a measurement carry
     * STRUCTURED evidence as well, checked below, and the string is then only a
     * label that has to match what the structure says.
     */
    if (/FAILED/.test(outcome)) problems.push(`${gate}: ${outcome}`);

    /*
     * AND the verdict must be the canonical one, not merely free of the word
     * FAILED. "BROKEN" contains no such word and used to pass.
     */
    const canonical = CANONICAL_VERDICTS[gate];
    if (canonical !== undefined && outcome !== canonical) {
      problems.push(
        `${gate}: verdict ${JSON.stringify(outcome)} is not the canonical ${JSON.stringify(canonical)}`,
      );
    }

    /* The scan gates have no process of their own; the rest must have one. */
    if (gate === CONTROL_CHARACTER_GATE) continue;
    const p = record.processes?.[gate];
    if (p === undefined) {
      problems.push(`${gate}: no process metadata recorded`);
      continue;
    }
    problems.push(...cleanProcessProblems(p, gate));
  }

  /*
   * The control-character gate, structurally.
   *
   * Every field present and correctly typed, zero characters, an empty file
   * list, the two halves agreeing with each other, and a recorded verdict that
   * matches what the structure says. Absent, malformed, negative, non-integer
   * or non-zero all refuse.
   */
  problems.push(...testTotalsProblems(record));
  problems.push(...scanProblems(record.controlCharacterScan, "controlCharacterScan"));
  const scan = record.controlCharacterScan;
  if (scan !== undefined && typeof scan.scannedFiles === "number") {
    /*
     * The verdict must describe THIS scan, not merely look clean. Comparing
     * against the clean form alone let a dirty scan sit beside a clean
     * sentence without the mismatch being reported.
     */
    const expected = describeScan(scan);
    const recorded = record.gates?.[CONTROL_CHARACTER_GATE];
    if (recorded !== expected) {
      problems.push(
        `${CONTROL_CHARACTER_GATE}: verdict ${JSON.stringify(recorded)} does not match the structured evidence (expected ${JSON.stringify(expected)})`,
      );
    }
  }

  const t = record.testGate;
  if (t === undefined) {
    problems.push("no sanitized test-gate record");
  } else {
    if (t.reportSuccess !== true) problems.push(`test report success=${String(t.reportSuccess)}`);
    if ((t.reportedFailedTests ?? 1) !== 0) {
      problems.push(`test report names ${String(t.reportedFailedTests)} failed test(s)`);
    }
    if ((t.countedFailedTests ?? 1) !== 0) {
      problems.push(`${String(t.countedFailedTests)} failed test(s) counted from results`);
    }
    if ((t.reportedFailedSuites ?? 1) !== 0) {
      problems.push(`test report names ${String(t.reportedFailedSuites)} failed suite(s)`);
    }
    if ((t.runtimeErrorSuites ?? 1) !== 0) {
      problems.push(`${String(t.runtimeErrorSuites)} suite(s) failed with no failed assertion`);
    }
    if ((t.failedSuiteNames ?? ["unrecorded"]).length !== 0) {
      problems.push(`failing suite(s): ${(t.failedSuiteNames ?? []).join(", ")}`);
    }
    if (t.failedTests === undefined) {
      problems.push("no failed-test identities recorded — rerun `pnpm release:gates`");
    } else if (t.failedTests.length !== 0) {
      problems.push(
        `failing test(s): ${t.failedTests.map((f) => `${f.suite} > ${f.title}`).join("; ")}`,
      );
    }
    if (t.skippedTests === undefined) {
      problems.push("no skipped-test identities recorded — rerun `pnpm release:gates`");
    }

    /*
     * THE TEST GATE'S OWN PROCESS, RECORDED THREE TIMES.
     *
     * The same outcome sits in `processes["pnpm test"]`, in the `testGate`
     * triple, and in the `processStatus/Signal/ErrorCode` triple added while
     * the runner-level exit was being diagnosed. Copies checked separately are
     * copies that can disagree, and this contract accepted a record whose
     * spawned process said status 0 while both `testGate` copies said 1: the
     * duplicated fields agreed with each other, so nothing looked wrong.
     */
    problems.push(...cleanProcessProblems(t, "test gate"));
    problems.push(
      ...cleanProcessProblems(
        {
          ok: t.ok,
          status: t.processStatus,
          signal: t.processSignal,
          errorCode: t.processErrorCode,
        },
        "test gate (process fields)",
      ).filter((m) => !m.includes(": ok ")),
    );

    const own = { status: t.status, signal: t.signal, errorCode: t.errorCode };
    const copy = {
      status: t.processStatus,
      signal: t.processSignal,
      errorCode: t.processErrorCode,
    };
    if (!processTriplesAgree(own, copy)) {
      problems.push("the test gate's two process triples disagree with each other");
    }
    const spawned = record.processes?.["pnpm test"];
    if (spawned === undefined) problems.push("no spawned-process record for pnpm test");
    else if (!processTriplesAgree(own, spawned)) {
      problems.push("the test gate disagrees with the process that ran it");
    }

    problems.push(...runnerEvidenceProblems(t));
    if ((t.reasons ?? ["unrecorded"]).length !== 0) {
      problems.push(`test gate not clean: ${(t.reasons ?? []).join("; ")}`);
    }
  }

  return problems;
}

/**
 * The record with nothing in it that could carry a secret.
 *
 * This is what goes into the archive: counts, verdicts, sanitized process
 * metadata and suite BASENAMES. No stdout, no stderr, no environment value, no
 * command line, no failure message, no path.
 */
/** A short, printable, single-line string, or nothing. */
function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > max) return null;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return null;
  }
  return value;
}

/** Anything that looks like a location, a message or an environment value. */
/** `0 in 339 files` or `8 FOUND in 3 file(s)` — the scan's own two shapes. */
const SCAN_VERDICT = /^(\d{1,7} in \d{1,7} files|\d{1,7} FOUND in \d{1,7} file\(s\))$/;

const FORBIDDEN_SHAPE =
  /(^|[^A-Za-z])([A-Za-z]:[\\/]|\.\.[\\/]|\/\/|https?:|file:|postgres(ql)?:|[A-Z][A-Z0-9_]{4,}=)/;

/** A value fit for the archive: bounded, printable, and not location-shaped. */
function safeText(value: unknown, max: number): string | null {
  const text = bounded(value, max);
  if (text === null) return null;
  if (FORBIDDEN_SHAPE.test(text)) return null;
  if (/[\\/]/.test(text) && !SAFE_LABEL.test(text)) return null;
  return text;
}

/** One process, rebuilt from exactly its four allowed fields. */
function stageProcess(p: RecordedProcess | undefined): unknown {
  if (p === undefined) return null;
  return {
    ok: p.ok === true,
    status: typeof p.status === "number" ? p.status : null,
    signal: bounded(p.signal, 16),
    errorCode: bounded(p.errorCode, 32),
  };
}

/** One identity, rebuilt from a validated basename and a bounded title. */
function stageIdentity(id: unknown): { suite: string; title: string } | null {
  const suite = (id as { suite?: unknown } | null)?.suite;
  const title = (id as { title?: unknown } | null)?.title;
  if (typeof suite !== "string" || !SAFE_LABEL.test(suite)) return null;
  const safeTitle = safeText(title, 200);
  if (safeTitle === null) return null;
  return { suite, title: safeTitle };
}

const stageIdentities = (list: unknown): { suite: string; title: string }[] =>
  (Array.isArray(list) ? list : [])
    .map(stageIdentity)
    .filter((x): x is { suite: string; title: string } => x !== null)
    .sort((a, b) => a.suite.localeCompare(b.suite) || a.title.localeCompare(b.title));

const stageStrings = (list: unknown, max: number): string[] =>
  (Array.isArray(list) ? list : [])
    .map((v) => safeText(v, max))
    .filter((v): v is string => v !== null)
    .sort();

/**
 * The record as the ARCHIVE sees it, rebuilt field by field.
 *
 * ## Why this is not a projection of the input
 *
 * It used to return `{ head, tests, testGate, controlCharacterScan, processes,
 * gates }` — whole nested objects, handed straight through. Any field a future
 * runner added inside one of them travelled into the package unread: a
 * `testGate.stdout`, an `environment`, a message someone thought would be
 * useful. The staged record is a file somebody zips and hands to a reviewer, so
 * "everything except what we thought to exclude" is the wrong default.
 *
 * Nothing here spreads an input object. Every value is copied by name, through
 * a check that bounds its length, refuses control characters, and refuses
 * anything shaped like a path, a URL, a connection string or an environment
 * assignment. Keys and arrays are sorted, so the same results always serialise
 * to the same bytes.
 *
 * ## Why the duration is not here
 *
 * `durationMs` is honest and useful and VOLATILE. Two clean runs of the same
 * commit differ by seconds, so including it meant the documented two-command
 * rebuild could not reproduce the archive's bytes — the package would claim
 * determinism it did not have. Timing stays in the local record; the staged
 * projection carries only what a second clean run at the same commit would
 * produce identically.
 */
export function sanitizedRecord(record: GateRecord): unknown {
  const t = record.testGate;
  const tests = record.tests;

  const perFile: Record<string, number> = {};
  for (const [label, count] of Object.entries(tests?.perFile ?? {})) {
    if (SAFE_LABEL.test(label) && isCount(count)) perFile[label] = count;
  }

  const processes: Record<string, unknown> = {};
  for (const gate of [...REQUIRED_GATES].sort()) {
    if (gate === CONTROL_CHARACTER_GATE) continue;
    const staged = stageProcess(record.processes?.[gate]);
    if (staged !== null) processes[gate] = staged;
  }

  const gates: Record<string, string> = {};
  for (const gate of [...REQUIRED_GATES].sort()) {
    const raw = record.gates?.[gate];
    /*
     * THE DEFECT THIS EXISTS TO PREVENT.
     *
     * `safeText` refuses slash-containing strings because a path is
     * slash-shaped, and the canonical test verdict ends "/ 45 files". So the
     * key was dropped, silently, and the delivered `c1b80f0` archive shipped a
     * staged record with no `pnpm test` gate at all — one its own contract
     * would have rejected, had anything validated the projection.
     *
     * The fix is recognition, not permission: the two measurement-derived
     * verdicts are matched against their exact canonical shapes, and everything
     * else still goes through the generic filter unchanged.
     */
    if (gate === "pnpm test" && parseTestVerdict(raw) !== null) {
      gates[gate] = raw as string;
      continue;
    }
    if (gate === CONTROL_CHARACTER_GATE && typeof raw === "string" && SCAN_VERDICT.test(raw)) {
      gates[gate] = raw;
      continue;
    }
    const verdict = safeText(raw, 120);
    if (verdict !== null) gates[gate] = verdict;
  }

  const scan = record.controlCharacterScan;

  return {
    /*
     * THE ATTEMPT, CARRIED. The staged projection has to pass the same
     * contract as the source record, and a record that does not name its
     * attempt fails it — so dropping this field here would refuse every
     * package rather than ship an anonymous one.
     */
    attemptId: isAttemptId(record.attemptId) ? record.attemptId : null,
    head: bounded(record.head, 40),
    tests: {
      passed: isCount(tests?.passed) ? tests.passed : null,
      skipped: isCount(tests?.skipped) ? tests.skipped : null,
      failed: isCount(tests?.failed) ? tests.failed : null,
      files: isCount(tests?.files) ? tests.files : null,
      perFile: Object.fromEntries(Object.entries(perFile).sort(([a], [b]) => a.localeCompare(b))),
    },
    testGate: {
      ok: t?.ok === true,
      status: typeof t?.status === "number" ? t.status : null,
      signal: bounded(t?.signal, 16),
      errorCode: bounded(t?.errorCode, 32),
      reportSuccess: typeof t?.reportSuccess === "boolean" ? t.reportSuccess : null,
      reportedFailedTests: isCount(t?.reportedFailedTests) ? t.reportedFailedTests : null,
      countedFailedTests: isCount(t?.countedFailedTests) ? t.countedFailedTests : null,
      reportedFailedSuites: isCount(t?.reportedFailedSuites) ? t.reportedFailedSuites : null,
      runtimeErrorSuites: isCount(t?.runtimeErrorSuites) ? t.runtimeErrorSuites : null,
      failedSuiteNames: stageStrings(t?.failedSuiteNames, 64),
      failedTests: stageIdentities(t?.failedTests),
      skippedTests: stageIdentities(t?.skippedTests),
      reportedUnhandledErrors: isCount(t?.reportedUnhandledErrors)
        ? t.reportedUnhandledErrors
        : null,
      sanitizedUnhandledErrorNames: stageStrings(t?.sanitizedUnhandledErrorNames, 40),
      sanitizedUnhandledErrorCodes: stageStrings(t?.sanitizedUnhandledErrorCodes, 40),
      reportWritten: t?.reportWritten === true,
      reportParsed: t?.reportParsed === true,
      reportCompleted: t?.reportCompleted === true,
      processStatus: typeof t?.processStatus === "number" ? t.processStatus : null,
      processSignal: bounded(t?.processSignal, 16),
      processErrorCode: bounded(t?.processErrorCode, 32),
      phase: safeText(t?.phase, 16),
      runner: safeText(t?.runner, 32),
      workerPool: safeText(t?.workerPool, 16),
      workerCount: isCount(t?.workerCount) ? t.workerCount : null,
      configuredMinWorkers: isCount(t?.configuredMinWorkers) ? t.configuredMinWorkers : null,
      configuredMaxWorkers: isCount(t?.configuredMaxWorkers) ? t.configuredMaxWorkers : null,
      reasons: stageStrings(t?.reasons, 160),
      /* durationMs is deliberately absent. See the note above. */
    },
    controlCharacterScan: {
      scannedFiles: isCount(scan?.scannedFiles) ? scan.scannedFiles : null,
      foundCharacters: isCount(scan?.foundCharacters) ? scan.foundCharacters : null,
      affectedFiles: stageStrings(scan?.affectedFiles, 120),
    },
    processes,
    gates,
  };
}

/**
 * The evidence a package is built from: validated, projected, validated again.
 *
 * ## Why capture exists
 *
 * The old flow read `.release/gate-results.json`, validated THAT object, and
 * then separately called `sanitizedRecord` to produce what actually went into
 * the archive. Two different objects, one validated and one shipped. When the
 * projection dropped the `pnpm test` verdict, nothing noticed: the thing that
 * passed the contract was not the thing that was staged.
 *
 * Now there is one object. It is read once, checked, projected, and the
 * PROJECTION is checked by the same contract before anything may use it. What
 * the documents render from and what the archive contains are the same bytes,
 * and both have satisfied the release contract.
 */
export interface CapturedEvidence {
  /** The sanitized projection — the only object a build may stage or render. */
  readonly staged: StagedRecord;
  /** Exactly the bytes written into the archive. */
  readonly json: string;
  readonly head: string;
}

/** The projection's shape, so callers cannot mistake it for the source. */
export type StagedRecord = ReturnType<typeof sanitizedRecord>;

export class EvidenceRefused extends Error {}

/**
 * Read once, validate, project, validate the projection, freeze.
 *
 * Both validations use the SAME contract. A projection that would be refused as
 * a record is refused as a projection — which is the check the delivered
 * archive did not have.
 */
/**
 * The repository's own secret patterns, applied to the finished bytes.
 *
 * An allowlisted FIELD is not a licence for its VALUE. Every field in the
 * projection is one somebody decided was safe to carry, and a decision about a
 * field name says nothing about what ends up inside it — a suite basename, an
 * error code, a verdict string are all attacker-influenced in principle and
 * developer-influenced in practice. So the serialized result goes through the
 * same detector the secret-audit gate runs, and a match refuses the build
 * rather than reporting what matched.
 *
 * Kept in step with `scripts/secret-audit.mjs` by a test that reads both.
 */
const SECRET_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "openai-key", pattern: /\bsk-(proj|svcacct|admin)-[A-Za-z0-9_-]{24,}/ },
  { name: "openai-legacy-key", pattern: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: "fal-key", pattern: /\bfal-[A-Za-z0-9-]{20,}/ },
  { name: "supabase-secret", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private-key-block", pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    name: "bearer-literal",
    pattern: /Authorization["'\s:]+\s*(Bearer|Key)\s+[A-Za-z0-9._-]{20,}/,
  },
  { name: "assigned-secret", pattern: /[A-Z][A-Z0-9_]{4,}\s*[=:]\s*["']?[A-Za-z0-9/+_-]{20,}/ },
];

/** Which patterns match these bytes. Names only — never what matched. */
export function secretPatternsIn(text: string): readonly string[] {
  return SECRET_PATTERNS.filter((r) => r.pattern.test(text)).map((r) => r.name);
}

export function captureEvidence(record: GateRecord | null, head: string): CapturedEvidence {
  const sourceProblems = gateRecordProblems(record, head);
  if (sourceProblems.length > 0) {
    throw new EvidenceRefused(
      `the gate record is not current and clean:\n${sourceProblems.map((x) => `  ${x}`).join("\n")}`,
    );
  }

  const staged = sanitizedRecord(record as GateRecord);
  const stagedProblems = gateRecordProblems(staged as GateRecord, head);
  if (stagedProblems.length > 0) {
    throw new EvidenceRefused(
      "the SANITIZED PROJECTION does not satisfy the release contract, so the archive would " +
        "carry evidence the contract rejects:\n" +
        stagedProblems.map((x) => `  ${x}`).join("\n"),
    );
  }

  const json = `${JSON.stringify(staged, null, 2)}\n`;

  /*
   * LAST, OVER THE FINISHED BYTES. Not over the fields, and not over the
   * source — over exactly what would be written into the archive.
   */
  const matched = secretPatternsIn(json);
  if (matched.length > 0) {
    throw new EvidenceRefused(
      `the sanitized projection matches ${String(matched.length)} secret pattern(s): ${matched.join(", ")}. ` +
        `The matching text is deliberately not reported.`,
    );
  }

  return Object.freeze({ staged, json, head });
}

/**
 * Field names the staged record must never contain, at any depth.
 *
 * A denylist beside an allowlist is not redundancy: the allowlist decides what
 * is copied, and this proves the decision held after a future edit. Asserted by
 * the package tests over the real serialized bytes.
 */
export const FORBIDDEN_STAGED_FIELDS: readonly string[] = [
  "stdout",
  "stderr",
  "output",
  "environment",
  "env",
  "message",
  "stack",
  "cmd",
  "command",
  "argv",
  "cwd",
  "path",
  "url",
  "durationMs",
];
