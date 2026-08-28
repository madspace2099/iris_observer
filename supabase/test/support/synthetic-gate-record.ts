import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlCharacterScan } from "../../../scripts/release/control-chars";
import {
  gateRecordProblems,
  REQUIRED_GATES,
  APPROVED_SKIP,
  suiteInventoryDigestOf,
  renderTestVerdict,
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
 * The skips a green record may carry on a given platform.
 *
 * Exactly one on win32 — the signal case `spawnSync` cannot report there — and
 * none anywhere else. A fixture that always carried one skip described a record
 * only a win32 contract would accept, and one where every test was skipped
 * would have satisfied the previous contract entirely.
 */
const approvedSkips = (platform: string): { suite: string; title: string }[] =>
  platform === APPROVED_SKIP.platform
    ? [{ suite: APPROVED_SKIP.suite, title: APPROVED_SKIP.title }]
    : [];

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
  /** Which platform this record claims to have been measured on. */
  readonly platform?: string;
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
  const skips = approvedSkips(options.platform ?? process.platform).length;
  gates["pnpm test"] = renderTestVerdict({
    passed: 1201 - skips,
    skipped: skips,
    failed: 0,
    files: 43,
  });
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
    /*
     * DERIVED, because the contract recomputes it. A constant here would be a
     * fixture asserting the digest of something else, which is exactly the
     * filtered-inventory shape the binding exists to refuse.
     */
    suiteInventoryDigest: suiteInventoryDigestOf(Object.keys(perFile(43, 1201))),
    /* The platform this record claims to have been measured on. */
    platform: options.platform ?? process.platform,
    expectedSuites: Object.keys(perFile(43, 1201)).sort(),
    controlCharacterScan: cleanScan(scannedFiles),
    /*
     * TOTALS THAT FOLLOW THE PLATFORM. One hard-coded skip described a record
     * only a win32 contract would accept, and the total was absent entirely —
     * so the staged projection could not re-check its own arithmetic.
     */
    tests: {
      total: 1201,
      passed: 1201 - approvedSkips(options.platform ?? process.platform).length,
      skipped: approvedSkips(options.platform ?? process.platform).length,
      failed: 0,
      files: 43,
      perFile: perFile(43, 1201),
    },
    testGate: {
      ...cleanProcess,
      reportSuccess: true,
      reportedFailedTests: 0,
      countedFailedTests: 0,
      reportedFailedSuites: 0,
      runtimeErrorSuites: 0,
      failedSuiteNames: [],
      /*
       * NOTHING WAS DROPPED, SAID RATHER THAN LEFT OUT. The contract refuses an
       * absent omission count: a bounded list without one cannot be reconciled
       * with the measurement beside it, and "not recorded" is not "none".
       */
      failedSuiteNamesOmitted: 0,
      /* No failing results, so the names account for none of them. */
      failedSuiteResultsAccounted: 0,
      failedTests: [],
      failedTestsOmitted: 0,
      skippedTests: approvedSkips(options.platform ?? process.platform),
      skippedTestsOmitted: 0,
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
