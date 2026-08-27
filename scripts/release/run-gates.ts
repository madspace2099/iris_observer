/**
 * Runs every release gate and records what it MEASURED, not what somebody
 * remembered.
 *
 *   pnpm release:gates              run every gate once
 *   pnpm release:gates --repeat=5   run only the test gate, N times, and
 *                                   record what happened to each process
 *
 * The output, `.release/gate-results.json`, is what renders section 7 of
 * `REVIEW.txt`. Test counts used to be typed into that document by hand, which
 * is the same class of defect as a hand-copied bucket age: correct on the day,
 * silently wrong on the next. `facts.ts` refuses to render a table from results
 * recorded at a different commit, and says so in the document rather than
 * quietly using them.
 *
 * ## Nothing here persists child output
 *
 * A gate runs the whole test suite and a production build. Either could print
 * an environment value or a URL that some future code path logs, and
 * `.release/gate-results.json` is a file somebody zips and hands to a reviewer.
 * A bounded tail reaches the local console; only sanitized process metadata
 * reaches the disk. See `gate-run.ts`.
 */

import { writeFileSync, mkdirSync, readFileSync, rmSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT, git } from "./facts";
import {
  runProcess,
  sanitize,
  classifyTestGate,
  describe as describeGate,
  NO_REPORT,
  summarizeReport,
  safeSuiteName,
  type VitestReport,
  type ProcessResult,
  type ReportSummary,
  type TestGateResult,
  type RunnerEvidence,
} from "./gate-run";
import type { RunnerDiagnostics } from "./vitest-runner-reporter";
import { REQUIRED_GATES, GATE_IN_PROGRESS, GATE_RECORD_PATH } from "./gate-contract";
import { scanFiles, describeScan, type ControlCharacterScan } from "./control-chars";

/**
 * `shell` is per-call, and both settings are load-bearing on Windows.
 *
 * Node refuses to spawn a `.cmd` shim directly — EINVAL, since the
 * argument-injection hardening in Node 20 — so every `pnpm` gate came back
 * "FAILED" with no output, which looks exactly like six real failures. Running
 * those through a shell fixes it. Running an EXECUTABLE through a shell breaks
 * it the other way: `process.execPath` is `C:\Program Files\nodejs\node.exe`,
 * and the shell splits it at the space.
 */
const pnpm = "pnpm";
const NEEDS_SHELL = process.platform === "win32";

const RECORD_PATH = join(REPO_ROOT, GATE_RECORD_PATH);
const PENDING_PATH = `${RECORD_PATH}.pending`;

/**
 * Mark the canonical result invalid for the duration of this attempt.
 *
 * Written synchronously, before the first gate, and carrying the HEAD it was
 * started at so a reader can tell which attempt abandoned it.
 */
function beginAttempt(head: string): void {
  mkdirSync(join(REPO_ROOT, ".release"), { recursive: true });
  rmSync(PENDING_PATH, { force: true });
  writeFileSync(
    RECORD_PATH,
    `${JSON.stringify({ status: GATE_IN_PROGRESS, head, startedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

/** Tail length for the local console. Never written to disk. */
const TAIL = 40;

const run = (
  label: string,
  command: string,
  args: readonly string[],
  shell = false,
  env?: NodeJS.ProcessEnv,
): { result: ProcessResult; output: string } => {
  process.stdout.write(`  ${label.padEnd(24)}`);
  const r = runProcess(command, args, {
    cwd: REPO_ROOT,
    shell,
    ...(env === undefined ? {} : { env }),
  });
  console.log(r.ok ? "clean" : "FAILED");
  return { result: sanitize(r), output: r.output };
};

/*
 * POSIX-relative, because Vite resolves a reporter SPECIFIER and a Windows
 * absolute path with backslashes is not one.
 */
const RUNNER_REPORTER = "./scripts/release/vitest-runner-reporter.ts";

/** `vitest <version>`, read rather than assumed. */
const RUNNER_VERSION = ((): string | null => {
  try {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "node_modules", "vitest", "package.json"), "utf8"),
    ) as { version?: string };
    return `vitest ${pkg.version ?? "unknown"}`;
  } catch {
    return null;
  }
})();

/**
 * The sidecar the diagnostics reporter wrote, or an absence that fails closed.
 *
 * Absence is not cleanliness: a run whose unhandled-error count was never
 * measured is a run that could exit 1 for the one reason the JSON report cannot
 * express, which is precisely the record this milestone had to explain.
 */
function readRunnerEvidence(
  path: string,
  process_: ProcessResult,
  reportWritten: boolean,
  reportParsed: boolean,
): RunnerEvidence {
  let d: RunnerDiagnostics | null = null;
  if (existsSync(path)) {
    try {
      d = JSON.parse(readFileSync(path, "utf8")) as RunnerDiagnostics;
    } catch {
      d = null;
    }
  }
  return {
    phase: "test",
    reportWritten,
    reportParsed,
    reportCompleted: d?.completed ?? false,
    reportedUnhandledErrors: d?.reportedUnhandledErrors ?? null,
    sanitizedUnhandledErrorNames: d?.sanitizedUnhandledErrorNames ?? [],
    sanitizedUnhandledErrorCodes: d?.sanitizedUnhandledErrorCodes ?? [],
    processStatus: process_.status,
    processSignal: process_.signal,
    processErrorCode: process_.errorCode,
    durationMs: d?.durationMs ?? null,
    runner: RUNNER_VERSION,
    workerPool: d?.pool ?? null,
    workerCount: d?.maxWorkers ?? null,
  };
}

/**
 * Read the JSON report, if the reporter managed to write one.
 *
 * Reading only. Everything that decides what may be persisted lives in
 * `summarizeReport`, which is pure and therefore testable against a report no
 * real run would produce — including one whose failure carries a credential.
 */
function readReport(path: string): { report: VitestReport | null; summary: ReportSummary } {
  if (!existsSync(path)) return { report: null, summary: NO_REPORT };
  try {
    const report = JSON.parse(readFileSync(path, "utf8")) as VitestReport;
    return { report, summary: summarizeReport(report) };
  } catch {
    return { report: null, summary: NO_REPORT };
  }
}

/** One execution of the test gate: spawn, read the report, classify. */
function runTestGate(): {
  gate: TestGateResult;
  output: string;
  report: VitestReport | null;
} {
  const stamp = `${String(process.pid)}-${String(Date.now())}`;
  const reportFile = join(tmpdir(), `observer-vitest-${stamp}.json`);
  const diagFile = join(tmpdir(), `observer-runner-${stamp}.json`);
  const spawned = run(
    "pnpm test",
    pnpm,
    [
      "exec",
      "vitest",
      "run",
      "--reporter=json",
      `--outputFile.json=${reportFile}`,
      `--reporter=${RUNNER_REPORTER}`,
    ],
    NEEDS_SHELL,
    { ...process.env, OBSERVER_RUNNER_DIAGNOSTICS: diagFile },
  );
  const reportWritten = existsSync(reportFile);
  const { report, summary } = readReport(reportFile);
  const runner = readRunnerEvidence(diagFile, spawned.result, reportWritten, report !== null);
  rmSync(reportFile, { force: true });
  rmSync(diagFile, { force: true });
  return {
    gate: classifyTestGate(spawned.result, summary, runner),
    output: spawned.output,
    report,
  };
}

function counts(report: VitestReport | null): {
  total: number;
  passed: number;
  skipped: number;
  failed: number;
  files: number;
  perFile: Record<string, number>;
} {
  const perFile: Record<string, number> = {};
  let total = 0;
  let passed = 0;
  let skipped = 0;
  let failed = 0;
  let files = 0;
  for (const f of report?.testResults ?? []) {
    perFile[safeSuiteName(f.name).replace(/\.test\.ts$/, "")] = f.assertionResults.length;
    total += f.assertionResults.length;
    files += 1;
    /*
     * Counted separately, because they are not the same claim. Reporting every
     * collected case as "passed" overstated the suite by the number of guarded
     * cases — small, and exactly the class of number this release keeps
     * correcting elsewhere.
     */
    for (const a of f.assertionResults) {
      if (a.status === "passed") passed += 1;
      else if (a.status === "failed") failed += 1;
      else skipped += 1;
    }
  }
  return { total, passed, skipped, failed, files, perFile };
}

/**
 * The bounded repeated diagnostic.
 *
 * Runs only the test gate, N times, and prints what happened to each process.
 * It exists to characterise the intermittent non-zero exit — not to retry until
 * the answer is green, which is why it reports every run and never collapses
 * them into one verdict.
 */
function repeat(times: number): void {
  console.log(`test gate, ${times} runs — recording process metadata for each`);
  const runs: TestGateResult[] = [];
  for (let i = 1; i <= times; i += 1) {
    process.stdout.write(`  run ${i}/${times}  `);
    const { gate } = runTestGate();
    runs.push(gate);
    console.log(
      `    ${describeGate(gate)}${gate.reasons.length > 0 ? `  [${gate.reasons.join("; ")}]` : ""}`,
    );
  }
  const clean = runs.filter((r) => r.reasons.length === 0).length;
  console.log("");
  console.log(`  ${clean}/${times} clean`);
  mkdirSync(join(REPO_ROOT, ".release"), { recursive: true });
  writeFileSync(
    join(REPO_ROOT, ".release", "gate-repeat.json"),
    `${JSON.stringify({ head: git("rev-parse", "HEAD"), runs }, null, 2)}\n`,
    "utf8",
  );
  console.log("  recorded to .release/gate-repeat.json");
}

function main(): void {
  const repeatArg = process.argv.find((a) => a.startsWith("--repeat="));
  if (repeatArg !== undefined) {
    const n = Number(repeatArg.split("=")[1]);
    repeat(Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 5);
    return;
  }

  const head = git("rev-parse", "HEAD");
  console.log(`running the gates at ${head.slice(0, 7)}`);

  /*
   * INVALIDATE FIRST, SYNCHRONOUSLY, BEFORE ANY GATE RUNS.
   *
   * The previous result stops being the answer the moment a new attempt begins.
   * Writing this marker before the first gate means an attempt that crashes, is
   * killed, or is interrupted cannot leave an older green record at the same
   * HEAD sitting there packageable.
   */
  beginAttempt(head);

  const gates: Record<string, string> = {};
  const processes: Record<string, ProcessResult> = {};
  let failed = 0;

  const record = (label: string, key: string, args: readonly string[], pass = "clean"): void => {
    const r = run(label, pnpm, args, NEEDS_SHELL);
    gates[key] = r.result.ok ? pass : "FAILED";
    processes[key] = r.result;
    if (!r.result.ok) {
      failed += 1;
      console.log(r.output.split("\n").slice(-TAIL).join("\n"));
    }
  };

  record("pnpm format:check", "pnpm format:check", ["format:check"]);
  record("pnpm typecheck", "pnpm typecheck", ["typecheck"], "0 errors");
  record("pnpm lint", "pnpm lint", ["lint"]);

  const { gate, output, report } = runTestGate();
  const c = counts(report);
  processes["pnpm test"] = sanitize({ ...gate, output: "" });
  gates["pnpm test"] =
    gate.reasons.length === 0
      ? `${c.passed} passed, ${c.skipped} skipped, ${c.failed} failed / ${c.files} files`
      : `FAILED — ${gate.reasons.join("; ")}`;
  if (gate.reasons.length > 0) {
    failed += 1;
    console.log(`  ${describeGate(gate)}`);
    console.log(output.split("\n").slice(-TAIL).join("\n"));
  }

  record("pnpm build", "pnpm build", ["build"]);
  record("secret audit", "secret audit", ["audit:secrets"]);

  /*
   * Every C0 control character, over every TRACKED file — and the result is
   * structured, not prose.
   *
   * This gate is one of three. It covers the working tree; the packager scans
   * the finished staging directory and the archive it is about to write, and
   * all three are reported separately. Summarising them as one number is how
   * a package came to say "control-char scan 0" while shipping eight backspace
   * bytes in its own patch files.
   */
  const controlScan = scanFiles(
    REPO_ROOT,
    git("ls-files", "-z")
      .split("\0")
      .filter((f) => f.length > 0),
  );
  console.log(`  ${"control-char scan".padEnd(24)}${describeScan(controlScan)}`);
  gates["raw-NUL scan"] = describeScan(controlScan);
  if (controlScan.foundCharacters > 0) failed += 1;

  /* The wrappers must still match their sources. */
  const wrappers = run("wrappers match source", process.execPath, [
    join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
    join(REPO_ROOT, "scripts", "release", "wrap-migration.ts"),
    "--check",
  ]);
  gates["wrappers vs sources"] = wrappers.result.ok ? "every body byte-identical" : "FAILED";
  processes["wrappers vs sources"] = wrappers.result;
  if (!wrappers.result.ok) failed += 1;

  mkdirSync(join(REPO_ROOT, ".release"), { recursive: true });
  writeFileSync(
    PENDING_PATH,
    `${JSON.stringify(
      {
        head,
        tests: {
          total: c.total,
          passed: c.passed,
          skipped: c.skipped,
          failed: c.failed,
          files: c.files,
          perFile: c.perFile,
        },
        /* Sanitized process metadata. Never stdout, stderr or an env value. */
        testGate: {
          ok: gate.reasons.length === 0,
          status: gate.status,
          signal: gate.signal,
          errorCode: gate.errorCode,
          reportSuccess: gate.reportSuccess,
          reportedFailedTests: gate.reportedFailedTests,
          countedFailedTests: gate.countedFailedTests,
          /* Suite-level evidence. Basenames only; see gate-run.ts. */
          reportedFailedSuites: gate.reportedFailedSuites,
          runtimeErrorSuites: gate.runtimeErrorSuites,
          failedSuiteNames: gate.failedSuiteNames,
          /* Identity only: basename plus bounded, sanitized title. */
          failedTests: gate.failedTests,
          skippedTests: gate.skippedTests,
          /*
           * RUNNER-LEVEL EVIDENCE. Vitest's JSON reporter discards the
           * unhandled-error list and computes `success` without it, while
           * Vitest sets exit code 1 whenever that list is non-empty — so
           * without these fields a record can say the run failed and be unable
           * to say why. Identities only: allow-listed class names and machine
           * codes, never a message, a stack or a path.
           */
          phase: gate.phase,
          reportWritten: gate.reportWritten,
          reportParsed: gate.reportParsed,
          reportCompleted: gate.reportCompleted,
          reportedUnhandledErrors: gate.reportedUnhandledErrors,
          sanitizedUnhandledErrorNames: gate.sanitizedUnhandledErrorNames,
          sanitizedUnhandledErrorCodes: gate.sanitizedUnhandledErrorCodes,
          processStatus: gate.processStatus,
          processSignal: gate.processSignal,
          processErrorCode: gate.processErrorCode,
          durationMs: gate.durationMs,
          runner: gate.runner,
          workerPool: gate.workerPool,
          workerCount: gate.workerCount,
          reasons: gate.reasons,
        },
        /*
         * Structured, so the gate contract reads numbers rather than guessing
         * which prose means clean. "8 FOUND" contains no word a string check
         * was looking for.
         */
        controlCharacterScan: controlScan satisfies ControlCharacterScan,
        processes,
        gates,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  /*
   * ATOMIC. Every result is in hand, the file is complete on disk, and only
   * now does it become the canonical record — one rename, which either happens
   * or does not.
   */
  renameSync(PENDING_PATH, RECORD_PATH);

  const missing = REQUIRED_GATES.filter(
    (g) => processes[g] === undefined && gates[g] === undefined,
  );
  if (missing.length > 0) {
    console.log(`  RECORDED NO RESULT FOR: ${missing.join(", ")}`);
    failed += 1;
  }

  console.log("");
  console.log(`  recorded to .release/gate-results.json at ${head.slice(0, 7)}`);
  if (failed > 0) {
    console.log(`  ${failed} GATE(S) FAILED`);
    process.exit(1);
  }
}

main();
