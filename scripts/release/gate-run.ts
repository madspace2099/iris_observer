/**
 * Running a gate, and deciding whether it passed, as two separate things.
 *
 * The test gate exited non-zero twice in five runs while Vitest's JSON report
 * declared every test passing. The runner recorded the single word `FAILED`,
 * printed a transient tail, and discarded the only three facts that could tell
 * a runner-level exit apart from a suite result: the exit status, the
 * terminating signal, and the spawn error code. An intermittent failure that
 * leaves no evidence is an intermittent failure nobody can investigate.
 *
 * So: {@link runProcess} keeps sanitized process metadata, {@link classifyTestGate}
 * decides fail-closed from that metadata plus the report, and neither of them
 * ever puts child output into anything persisted.
 *
 * ## What is deliberately NOT retained
 *
 * `stdout` and `stderr`. A gate runs the whole application's test suite and its
 * production build; either could print an environment value, a URL, a header or
 * a key that some future code path logs. A bounded tail on the local console is
 * useful and ephemeral; the same bytes in `.release/gate-results.json` are a
 * file somebody commits, zips and hands to a reviewer.
 */

import { spawnSync } from "node:child_process";

/** Sanitized process metadata. No output, ever. */
export interface ProcessResult {
  /** Exited normally with status 0. */
  readonly ok: boolean;
  /** Exit status, or null when the process was signalled or never started. */
  readonly status: number | null;
  /** Terminating signal, where the platform reports one. */
  readonly signal: string | null;
  /** Spawn failure code — ENOENT, EACCES, EINVAL — or null. */
  readonly errorCode: string | null;
}

/** The console tail, kept beside the result and never persisted. */
export interface ProcessRun extends ProcessResult {
  readonly output: string;
}

export interface SpawnOptions {
  readonly cwd: string;
  readonly shell?: boolean;
  readonly maxBuffer?: number;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Run a child process and report what happened to it.
 *
 * `spawnSync` rather than `execFileSync`, because `execFileSync` communicates
 * failure by throwing and the interesting fields then have to be dug out of an
 * error object — which is how they came to be dropped in the first place. Here
 * they are the return value.
 */
export function runProcess(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): ProcessRun {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    shell: options.shell ?? false,
    ...(options.env === undefined ? {} : { env: options.env }),
  });

  const errorCode =
    result.error === undefined || result.error === null
      ? null
      : ((result.error as NodeJS.ErrnoException).code ?? result.error.name);

  return {
    ok: result.error === undefined && result.status === 0 && result.signal === null,
    status: result.status,
    signal: result.signal,
    errorCode,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

/** Strip the console tail. What may be written to disk. */
export const sanitize = (run: ProcessRun): ProcessResult => ({
  ok: run.ok,
  status: run.status,
  signal: run.signal,
  errorCode: run.errorCode,
});

/**
 * What a Vitest JSON report says about itself.
 *
 * SUITE-LEVEL evidence is here because discarding it cost a diagnosis. A hook
 * timeout fails the SUITE and records no failed assertion, so a summary of
 * `reportSuccess=false, failedTests=0` looked like a runner-level fault for as
 * long as nobody kept `numFailedTestSuites` and the name of the file. Keeping
 * both turned an unexplained intermittent exit into a one-line answer.
 */
export interface ReportSummary {
  readonly reportSuccess: boolean | null;
  readonly reportedFailedTests: number | null;
  /** Failures counted from the assertion results, independently of the summary. */
  readonly countedFailedTests: number | null;
  /** `numFailedTestSuites`, which a hook failure moves and a test failure does not. */
  readonly reportedFailedSuites: number | null;
  /**
   * Suites that failed while recording NO failed assertion — a hook error, a
   * collection error, a timeout. Derived, because Vitest has no field for it.
   */
  readonly runtimeErrorSuites: number | null;
  /**
   * BASENAMES ONLY of the failing suites. No path, no message, no output: the
   * name identifies the file to look in, and everything else a failure carries
   * is exactly what must not reach a file somebody zips and hands over.
   */
  readonly failedSuiteNames: readonly string[];
}

export interface TestGateResult extends ProcessResult, ReportSummary {
  /** Every reason this gate is not clean. Empty means clean. */
  readonly reasons: readonly string[];
}

/**
 * Fail-closed, and every condition is independent.
 *
 * A process that exits 0 while its report declares failure fails. A report
 * declaring success while the process exited non-zero fails. A missing or
 * unparseable report fails. Two independent counts of failed tests are kept,
 * because a summary field and the assertion results are two claims and this
 * release has been bitten by trusting one of a pair.
 *
 * There is no retry. A run that failed stays failed: re-running until the
 * answer is green is how an intermittent fault becomes an invisible one.
 */
export function classifyTestGate(process_: ProcessResult, report: ReportSummary): TestGateResult {
  const reasons: string[] = [];

  if (process_.errorCode !== null) reasons.push(`process error ${process_.errorCode}`);
  if (process_.signal !== null) reasons.push(`terminated by signal ${process_.signal}`);
  if (process_.status !== 0) reasons.push(`exit status ${String(process_.status)}`);
  if (report.reportSuccess === null) reasons.push("no readable JSON report");
  else if (report.reportSuccess !== true) reasons.push("report declares failure");
  if ((report.reportedFailedTests ?? 0) > 0) {
    reasons.push(`report names ${String(report.reportedFailedTests)} failed test(s)`);
  }
  if ((report.countedFailedTests ?? 0) > 0) {
    reasons.push(`${String(report.countedFailedTests)} failed test(s) counted from results`);
  }
  /*
   * Suite-level counts fail INDEPENDENTLY, and deliberately so — including when
   * `reportSuccess` is true. A hook timeout moves these and moves nothing else,
   * so a rule that only consulted the summary would keep missing exactly the
   * fault that took a milestone to find.
   */
  if ((report.reportedFailedSuites ?? 0) > 0) {
    reasons.push(`report names ${String(report.reportedFailedSuites)} failed suite(s)`);
  }
  if ((report.runtimeErrorSuites ?? 0) > 0) {
    reasons.push(
      `${String(report.runtimeErrorSuites)} suite(s) failed with no failed assertion — hook, collection or timeout`,
    );
  }
  if (report.failedSuiteNames.length > 0) {
    reasons.push(`failing suite(s): ${report.failedSuiteNames.join(", ")}`);
  }

  return { ...process_, ...report, reasons };
}

/** A report summary for a run that produced nothing readable. */
export const NO_REPORT: ReportSummary = {
  reportSuccess: null,
  reportedFailedTests: null,
  countedFailedTests: null,
  reportedFailedSuites: null,
  runtimeErrorSuites: null,
  failedSuiteNames: [],
};

/** A one-line summary for the console and for the persisted record. */
export function describe(result: TestGateResult): string {
  const bits = [
    `status=${String(result.status)}`,
    `signal=${String(result.signal)}`,
    `errorCode=${String(result.errorCode)}`,
    `reportSuccess=${String(result.reportSuccess)}`,
    `reportedFailedTests=${String(result.reportedFailedTests)}`,
    `countedFailedTests=${String(result.countedFailedTests)}`,
    `reportedFailedSuites=${String(result.reportedFailedSuites)}`,
    `runtimeErrorSuites=${String(result.runtimeErrorSuites)}`,
    `failedSuites=[${result.failedSuiteNames.join(",")}]`,
  ];
  return bits.join(" ");
}
