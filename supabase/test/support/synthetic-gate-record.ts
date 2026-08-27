import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlCharacterScan } from "../../../scripts/release/control-chars";
import {
  gateRecordProblems,
  REQUIRED_GATES,
  CANONICAL_VERDICTS,
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

/**
 * A complete, clean control-character scan over `files` files.
 *
 * The scan now records what it was ASKED to read as well as what it read, so
 * a fixture that states only the second is describing a scan the contract
 * refuses. One builder, so the next field lands in one place.
 */
export const cleanScan = (files: number): ControlCharacterScan => ({
  requestedFiles: files,
  scannedFiles: files,
  readFailures: 0,
  unreadableFiles: [],
  foundCharacters: 0,
  affectedFiles: [],
});

export interface SyntheticOptions {
  /** Overrides merged over the green record, for the refusal cases. */
  readonly overrides?: Partial<GateRecord>;
  /** How many files the control-character scan claims to have looked at. */
  readonly scannedFiles?: number;
  /** The operation this record claims to come from. */
  readonly operationId?: string;
}

/**
 * Per-file counts that add up.
 *
 * The contract now checks the arithmetic — entries equal files, values sum to
 * the total — so a fixture with an empty map beside a count of 43 is no longer
 * something a green record can say.
 */
function perFile(files: number, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 1; i < files; i += 1) out[`suite-${String(i).padStart(2, "0")}.test.ts`] = 1;
  out[`suite-${String(files).padStart(2, "0")}.test.ts`] = total - (files - 1);
  return out;
}

/** A green record naming `head`, as the runner would have written it. */
export function greenGateRecord(head: string, options: SyntheticOptions = {}): GateRecord {
  const scannedFiles = options.scannedFiles ?? 333;
  const gates: Record<string, string> = {};
  const processes: Record<string, typeof cleanProcess> = {};
  for (const gate of REQUIRED_GATES) {
    /*
     * THE CANONICAL VERDICT, from the contract itself. A fixture that wrote
     * "clean" for every gate was asserting a shape the contract no longer
     * accepts, and reading the table here means the fixture cannot drift from
     * it again.
     */
    const canonical = CANONICAL_VERDICTS[gate];
    if (canonical !== undefined) gates[gate] = canonical;
    processes[gate] = { ...cleanProcess };
  }
  gates["pnpm test"] = "1200 passed, 1 skipped, 0 failed / 43 files";
  gates["raw-NUL scan"] = `0 in ${String(scannedFiles)} files`;

  return {
    /* A record names the attempt that produced it, so the fixture does too. */
    /* A record names the operation that produced it, so the fixture does too. */
    operationId: options.operationId ?? "00112233445566aa",
    head,
    branch: "release/observer-demo-rc1",
    /* The identity of the bytes the gate measured, not merely where. */
    treeId: "1234567890abcdef1234567890abcdef12345678",
    inputsDigest: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    suiteInventoryDigest: "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    expectedSuites: Object.keys(perFile(43, 1201)).sort(),
    controlCharacterScan: cleanScan(scannedFiles),
    tests: { passed: 1200, skipped: 1, failed: 0, files: 43, perFile: perFile(43, 1201) },
    testGate: {
      ...cleanProcess,
      reportSuccess: true,
      reportedFailedTests: 0,
      countedFailedTests: 0,
      reportedFailedSuites: 0,
      runtimeErrorSuites: 0,
      failedSuiteNames: [],
      failedTests: [],
      skippedTests: [{ suite: "platform.test.ts", title: "skipped on this platform" }],
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
      workerCount: 4,
      observedPeakWorkers: 4,
      configuredMinWorkers: 4,
      configuredMaxWorkers: 4,
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
