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
  readonly reasons?: readonly string[];
}

export interface GateRecord {
  readonly head?: string;
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
     */
    if (/FAILED/.test(outcome)) problems.push(`${gate}: ${outcome}`);

    /* The scan gates have no process of their own; the rest must have one. */
    if (gate === "raw-NUL scan") continue;
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
    processes: record.processes,
    gates: record.gates,
  };
}
