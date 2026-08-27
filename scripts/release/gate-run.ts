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
import { basename } from "node:path";

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
/**
 * The identity of one non-passing test. Identity ONLY.
 *
 * A gate that recorded counts and suite basenames could say three tests failed
 * and not which three, so the failures could not be looked at afterwards — the
 * JSON report is deleted once the counts are out of it. A title and a basename
 * are enough to find the test again; everything else a failure carries is
 * unbounded text from a run that may have touched anything.
 */
export interface TestIdentity {
  /** Basename of the file. Never a path — a path identifies the machine. */
  readonly suite: string;
  /** The full title path, bounded and stripped of control characters. */
  readonly title: string;
}

/** Longest stored title. Beyond this the tail is dropped, not wrapped. */
export const MAX_TITLE = 160;
/** Most identities stored per list. A longer list is a different problem. */
export const MAX_IDENTITIES = 25;

/**
 * A title fit to persist.
 *
 * Control characters and line breaks collapse to single spaces — a stored
 * title must not be able to carry an invisible byte into the record that the
 * package-level scan then refuses, and a multi-line title would break every
 * reader that assumes one line.
 */
export function safeTitle(raw: string): string {
  const flattened = [...raw]
    .map((ch) => ((ch.codePointAt(0) ?? 32) < 32 || ch === "\u007f" ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return flattened.length > MAX_TITLE ? `${flattened.slice(0, MAX_TITLE - 1)}…` : flattened;
}

/** Bound a list of identities, and say so in the record when it was cut. */
export function boundIdentities(all: readonly TestIdentity[]): readonly TestIdentity[] {
  if (all.length <= MAX_IDENTITIES) return all;
  return [
    ...all.slice(0, MAX_IDENTITIES - 1),
    { suite: "…", title: `and ${String(all.length - (MAX_IDENTITIES - 1))} more` },
  ];
}

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
  /**
   * WHICH tests failed, by identity. Bounded, sanitized, no message, no
   * expected or received value, no stack, no path, no output.
   */
  readonly failedTests: readonly TestIdentity[];
  /**
   * WHICH tests were skipped. Here because the skipped COUNT drifted between
   * two runs of the same commit with no way to say which test moved, and an
   * unexplained count is an unexplained result.
   */
  readonly skippedTests: readonly TestIdentity[];
}

/* -------------------------------------------------------------------------
   The Vitest report, and the only four things taken out of it.
------------------------------------------------------------------------- */

/**
 * Just enough of Vitest's JSON report to summarise it.
 *
 * `failureMessages` is deliberately ABSENT from this interface even though the
 * reporter emits it. A failure message is the assertion's `expected` and
 * `received` rendered as text, and this repository's own suites assert over
 * environment names, resolver inputs and fixture values — so a failing test can
 * put an arbitrary string into that field, and the record is a file somebody
 * zips and hands to a reviewer. Not naming it is not enough on its own, which
 * is why {@link summarizeReport} is built from named fields rather than by
 * copying an object through, and why `gate-runner.test.ts` drives a report
 * carrying a secret-shaped message through it and asserts the message is gone.
 */
export interface VitestAssertion {
  readonly status: string;
  readonly title?: string;
  readonly fullName?: string;
}

export interface VitestFile {
  readonly name: string;
  readonly status?: string;
  readonly assertionResults: readonly VitestAssertion[];
}

export interface VitestReport {
  readonly testResults: readonly VitestFile[];
  readonly success?: boolean;
  readonly numFailedTests?: number;
  readonly numFailedTestSuites?: number;
}

/** Basename only — never a path, a message or any of the child's output. */
export const safeSuiteName = (name: string): string => basename(name);

/**
 * The report, reduced to what may be persisted.
 *
 * Pure, and separated from reading the file so it can be driven with a report
 * that no run would produce: one whose failure carries something that looks
 * like a credential. The construction below is the guarantee — every field of
 * the result is named here, so a field added to the reporter later arrives in
 * the record only if somebody adds it on purpose.
 */
export function summarizeReport(report: VitestReport): ReportSummary {
  let counted = 0;
  let runtimeErrors = 0;
  const failedSuites: string[] = [];
  /*
   * Identity only, and built here rather than left in the report: the report is
   * deleted as soon as the counts are out of it, and a record saying three
   * tests failed without saying which three cannot be investigated.
   */
  const failedTests: TestIdentity[] = [];
  const skippedTests: TestIdentity[] = [];

  for (const f of report.testResults) {
    const suite = safeSuiteName(f.name);
    for (const a of f.assertionResults) {
      const identity = { suite, title: safeTitle(a.fullName ?? a.title ?? "(untitled)") };
      if (a.status === "failed") failedTests.push(identity);
      else if (a.status !== "passed") skippedTests.push(identity);
    }
    const failedHere = f.assertionResults.filter((a) => a.status === "failed").length;
    counted += failedHere;
    if (f.status === "failed") {
      failedSuites.push(suite);
      /*
       * A suite that failed while recording no failed assertion is a hook
       * error, a collection error or a timeout. Vitest has no field for it, and
       * not deriving it is what made the hook timeout look like a runner-level
       * fault for a whole milestone.
       */
      if (failedHere === 0) runtimeErrors += 1;
    }
  }

  return {
    reportSuccess: report.success ?? null,
    reportedFailedTests: report.numFailedTests ?? null,
    countedFailedTests: counted,
    reportedFailedSuites: report.numFailedTestSuites ?? null,
    runtimeErrorSuites: runtimeErrors,
    failedSuiteNames: failedSuites.sort(),
    failedTests: boundIdentities(failedTests),
    skippedTests: boundIdentities(skippedTests),
  };
}

/**
 * What the JSON report structurally cannot say about the run.
 *
 * Vitest 3.2.7's JSON reporter takes the unhandled-error list as `_errors` and
 * discards it, computes `success` without reference to it, and writes an object
 * with no field for it — while Vitest sets `process.exitCode = 1` whenever that
 * list is non-empty. So the one condition capable of producing `status=1` beside
 * `reportSuccess=true, failedTests=0, failedSuites=0` was invisible to the only
 * artefact the gate read, and the gate could record the failure without being
 * able to name it. This is what closes that gap.
 *
 * Every field is IDENTITY OR MEASUREMENT. Names and codes come from the
 * allow-listed sanitizer in `vitest-runner-reporter.ts`; nothing here can carry
 * a message, a stack, a path or any output.
 */
export interface RunnerEvidence {
  /** Which phase this describes. One gate, one phase, named rather than assumed. */
  readonly phase: string;
  /** The report file existed after the run. */
  readonly reportWritten: boolean;
  /** It parsed as JSON. */
  readonly reportParsed: boolean;
  /** The diagnostics reporter reached `onTestRunEnd` and wrote its sidecar. */
  readonly reportCompleted: boolean;
  /** How many unhandled errors Vitest collected. The exit code follows this. */
  readonly reportedUnhandledErrors: number | null;
  /** Bounded class names — `Error`, `TypeError`. */
  readonly sanitizedUnhandledErrorNames: readonly string[];
  /** Bounded machine codes — `ERR_IPC_CHANNEL_CLOSED`, `EPIPE`. */
  readonly sanitizedUnhandledErrorCodes: readonly string[];
  /** The same three process facts, under the names the diagnosis asked for. */
  readonly processStatus: number | null;
  readonly processSignal: string | null;
  readonly processErrorCode: string | null;
  /** Wall time the runner itself measured. */
  readonly durationMs: number | null;
  /** `vitest <version>`, read from the installed package. */
  readonly runner: string | null;
  /** The pool Vitest resolved — `forks`, `threads`, `vmThreads`. */
  readonly workerPool: string | null;
  /** The concurrency bound, where Vitest exposes one. */
  readonly workerCount: number | null;
}

/** Evidence for a run that produced no runner diagnostics at all. */
export const NO_RUNNER_EVIDENCE: RunnerEvidence = {
  phase: "test",
  reportWritten: false,
  reportParsed: false,
  reportCompleted: false,
  reportedUnhandledErrors: null,
  sanitizedUnhandledErrorNames: [],
  sanitizedUnhandledErrorCodes: [],
  processStatus: null,
  processSignal: null,
  processErrorCode: null,
  durationMs: null,
  runner: null,
  workerPool: null,
  workerCount: null,
};

/**
 * Every reason the runner evidence refuses the gate, independently.
 *
 * ABSENT IS NOT CLEAN. `reportedUnhandledErrors: null` means the run was not
 * measured for the condition that produced this milestone's failure, and a gate
 * that treated "not measured" as "none" would be the same blindness with an
 * extra field.
 */
export function runnerEvidenceReasons(e: RunnerEvidence): readonly string[] {
  const reasons: string[] = [];
  if (!e.reportWritten) reasons.push("no JSON report file was written");
  if (!e.reportParsed) reasons.push("the JSON report did not parse");
  if (!e.reportCompleted) {
    reasons.push("the runner diagnostics reporter did not complete — unhandled errors unmeasured");
  }
  if (e.reportedUnhandledErrors === null) {
    reasons.push("unhandled runner errors were not measured");
  } else if (e.reportedUnhandledErrors > 0) {
    const ids = [...e.sanitizedUnhandledErrorNames, ...e.sanitizedUnhandledErrorCodes]
      .filter((s) => s !== "(none)")
      .join(", ");
    reasons.push(
      `${String(e.reportedUnhandledErrors)} unhandled runner error(s)${ids === "" ? "" : `: ${ids}`}`,
    );
  }
  return reasons;
}

export interface TestGateResult extends ProcessResult, ReportSummary, RunnerEvidence {
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
export function classifyTestGate(
  process_: ProcessResult,
  report: ReportSummary,
  runner: RunnerEvidence,
): TestGateResult {
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
  for (const t of report.failedTests) {
    reasons.push(`failed: ${t.suite} > ${t.title}`);
  }

  /*
   * RUNNER-LEVEL EVIDENCE, INDEPENDENTLY, and this is the whole correction.
   *
   * An unhandled error sets Vitest's exit code and leaves `success` true and
   * both failure counts at zero. Every condition above would therefore say the
   * run was clean, and only `exit status 1` would say otherwise — which is
   * exactly the record that could not be explained. These reasons name it.
   */
  reasons.push(...runnerEvidenceReasons(runner));

  return { ...process_, ...report, ...runner, reasons };
}

/** A report summary for a run that produced nothing readable. */
export const NO_REPORT: ReportSummary = {
  reportSuccess: null,
  reportedFailedTests: null,
  countedFailedTests: null,
  reportedFailedSuites: null,
  runtimeErrorSuites: null,
  failedSuiteNames: [],
  failedTests: [],
  skippedTests: [],
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
    `unhandledErrors=${String(result.reportedUnhandledErrors)}`,
    `pool=${String(result.workerPool)}`,
  ];
  return bits.join(" ");
}
