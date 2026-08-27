import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  gateRecordProblems,
  REQUIRED_GATES,
  type GateRecord,
} from "../../../scripts/release/gate-contract";

/**
 * A structurally valid gate record, owned by one test, in one temporary root.
 *
 * ## The circle this breaks
 *
 * The packager refuses without a current green `.release/gate-results.json`,
 * and that is right: an archive whose verification section says there is no
 * verification is worse than no archive. But the tests that exercise the
 * packager were guarded on the same condition — so they only ran when a green
 * record for the SAME commit already existed, which only happens after that
 * commit's gate has completed. A fresh commit's own authoritative gate
 * therefore skipped the twenty-two tests that verify its packager — seven here
 * and fifteen in `package-generation.test.ts` — and the accepted `7ac84fa`
 * package never exercised them at all.
 *
 * The fix is not to relax the precondition. It is to let a test own its own
 * evidence: this writes a record into a temporary root the test controls, and
 * `build({ gateRecordRoot })` reads it from there. THE RECORD STILL GOES
 * THROUGH `gateRecordProblems` UNCHANGED — what is injected is where the record
 * is read, never whether it is checked, and {@link syntheticGateRecord} asserts
 * that the record it produces satisfies the real contract before returning.
 *
 * Nothing here touches the developer's real `.release/` directory.
 */

const cleanProcess = { ok: true, status: 0, signal: null, errorCode: null } as const;

export interface SyntheticOptions {
  /** Overrides merged over the green record, for the refusal cases. */
  readonly overrides?: Partial<GateRecord>;
  /** How many files the control-character scan claims to have looked at. */
  readonly scannedFiles?: number;
}

/** A green record naming `head`, as the runner would have written it. */
export function greenGateRecord(head: string, options: SyntheticOptions = {}): GateRecord {
  const scannedFiles = options.scannedFiles ?? 333;
  const gates: Record<string, string> = {};
  const processes: Record<string, typeof cleanProcess> = {};
  for (const gate of REQUIRED_GATES) {
    gates[gate] = "clean";
    processes[gate] = { ...cleanProcess };
  }
  gates["pnpm test"] = "1200 passed, 1 skipped, 0 failed / 43 files";
  gates["raw-NUL scan"] = `0 in ${String(scannedFiles)} files`;

  return {
    head,
    controlCharacterScan: { scannedFiles, foundCharacters: 0, affectedFiles: [] },
    tests: { passed: 1200, skipped: 1, failed: 0, files: 43, perFile: {} },
    testGate: {
      ...cleanProcess,
      reportSuccess: true,
      reportedFailedTests: 0,
      countedFailedTests: 0,
      reportedFailedSuites: 0,
      runtimeErrorSuites: 0,
      failedSuiteNames: [],
      failedTests: [],
      skippedTests: [],
      phase: "test",
      reportWritten: true,
      reportParsed: true,
      reportCompleted: true,
      reportedUnhandledErrors: 0,
      sanitizedUnhandledErrorNames: [],
      sanitizedUnhandledErrorCodes: [],
      processStatus: 0,
      processSignal: null,
      processErrorCode: null,
      durationMs: 164_000,
      runner: "vitest 3.2.7",
      workerPool: "forks",
      workerCount: null,
      reasons: [],
    },
    processes,
    gates,
    ...options.overrides,
  };
}

/**
 * Write a synthetic record into `root/.release/`, and prove it is acceptable.
 *
 * The assertion is the load-bearing part: a synthetic record that could not
 * pass the real contract would make every test built on it meaningless, and the
 * failure would look like a packager bug rather than a fixture bug.
 */
export function syntheticGateRecord(
  root: string,
  head: string,
  options: SyntheticOptions = {},
): string {
  const record = greenGateRecord(head, options);
  if (options.overrides === undefined) {
    const problems = gateRecordProblems(record, head);
    if (problems.length > 0) {
      throw new Error(
        `the synthetic gate record does not satisfy the real contract: ${problems.join("; ")}`,
      );
    }
  }
  mkdirSync(join(root, ".release"), { recursive: true });
  writeFileSync(
    join(root, ".release", "gate-results.json"),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
  return root;
}
