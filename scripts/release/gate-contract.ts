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

import { readFileSync, existsSync } from "node:fs";
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
  readonly reasons?: readonly string[];
}

export interface GateRecord {
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

  if (!Array.isArray(t.sanitizedUnhandledErrorNames)) {
    problems.push("sanitizedUnhandledErrorNames not recorded");
  }
  if (!Array.isArray(t.sanitizedUnhandledErrorCodes)) {
    problems.push("sanitizedUnhandledErrorCodes not recorded");
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

  return problems;
}

export function gateRecordProblems(record: GateRecord | null, head: string): readonly string[] {
  if (record === null)
    return [`${GATE_RECORD_PATH} is missing or unreadable — run \`pnpm release:gates\``];

  const problems: string[] = [];
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

    /* The scan gates have no process of their own; the rest must have one. */
    if (gate === CONTROL_CHARACTER_GATE) continue;
    const p = record.processes?.[gate];
    if (p === undefined) {
      problems.push(`${gate}: no process metadata recorded`);
      continue;
    }
    if (p.status !== 0) problems.push(`${gate}: exit status ${String(p.status)}`);
    if (p.signal !== null && p.signal !== undefined) problems.push(`${gate}: signal ${p.signal}`);
    if (p.errorCode !== null && p.errorCode !== undefined) {
      problems.push(`${gate}: spawn error ${p.errorCode}`);
    }
  }

  /*
   * The control-character gate, structurally.
   *
   * Every field present and correctly typed, zero characters, an empty file
   * list, the two halves agreeing with each other, and a recorded verdict that
   * matches what the structure says. Absent, malformed, negative, non-integer
   * or non-zero all refuse.
   */
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
export function sanitizedRecord(record: GateRecord): unknown {
  return {
    head: record.head,
    tests: record.tests,
    testGate: record.testGate,
    /* Counts and paths. A path locates a file; its contents are unbounded. */
    controlCharacterScan: record.controlCharacterScan,
    processes: record.processes,
    gates: record.gates,
  };
}
