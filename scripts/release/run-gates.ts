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

import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT, git } from "./facts";
import {
  runProcess,
  sanitize,
  classifyTestGate,
  describe as describeGate,
  NO_REPORT,
  safeTitle,
  boundIdentities,
  type TestIdentity,
  type ProcessResult,
  type ReportSummary,
  type TestGateResult,
} from "./gate-run";
import { REQUIRED_GATES } from "./gate-contract";
import { scanFiles, describeScan, type ControlCharacterScan } from "./control-chars";

interface VitestAssertion {
  readonly status: string;
  readonly title?: string;
  readonly fullName?: string;
}

interface VitestFile {
  readonly name: string;
  readonly status?: string;
  readonly assertionResults: readonly VitestAssertion[];
}

interface VitestReport {
  readonly testResults: readonly VitestFile[];
  readonly success?: boolean;
  readonly numFailedTests?: number;
  readonly numFailedTestSuites?: number;
}

/** Basename only — never a path, a message or any of the child's output. */
const safeSuiteName = (name: string): string => basename(name);

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

/** Tail length for the local console. Never written to disk. */
const TAIL = 40;

const run = (
  label: string,
  command: string,
  args: readonly string[],
  shell = false,
): { result: ProcessResult; output: string } => {
  process.stdout.write(`  ${label.padEnd(24)}`);
  const r = runProcess(command, args, { cwd: REPO_ROOT, shell });
  console.log(r.ok ? "clean" : "FAILED");
  return { result: sanitize(r), output: r.output };
};

/** Read the JSON report, if the reporter managed to write one. */
function readReport(path: string): { report: VitestReport | null; summary: ReportSummary } {
  if (!existsSync(path)) return { report: null, summary: NO_REPORT };
  try {
    const report = JSON.parse(readFileSync(path, "utf8")) as VitestReport;
    let counted = 0;
    let runtimeErrors = 0;
    const failedSuites: string[] = [];
    /*
     * Identity only, and built here rather than left in the report: the report
     * is deleted as soon as the counts are out of it, and a record saying three
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
        failedSuites.push(safeSuiteName(f.name));
        /*
         * A suite that failed while recording no failed assertion is a hook
         * error, a collection error or a timeout. Vitest has no field for it,
         * and not deriving it is what made the hook timeout look like a
         * runner-level fault for a whole milestone.
         */
        if (failedHere === 0) runtimeErrors += 1;
      }
    }
    return {
      report,
      summary: {
        reportSuccess: report.success ?? null,
        reportedFailedTests: report.numFailedTests ?? null,
        countedFailedTests: counted,
        reportedFailedSuites: report.numFailedTestSuites ?? null,
        runtimeErrorSuites: runtimeErrors,
        failedSuiteNames: failedSuites.sort(),
        failedTests: boundIdentities(failedTests),
        skippedTests: boundIdentities(skippedTests),
      },
    };
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
  const reportFile = join(tmpdir(), `observer-vitest-${process.pid}-${Date.now()}.json`);
  const spawned = run(
    "pnpm test",
    pnpm,
    ["exec", "vitest", "run", "--reporter=json", `--outputFile=${reportFile}`],
    NEEDS_SHELL,
  );
  const { report, summary } = readReport(reportFile);
  rmSync(reportFile, { force: true });
  return { gate: classifyTestGate(spawned.result, summary), output: spawned.output, report };
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
    perFile[basename(f.name).replace(/\.test\.ts$/, "")] = f.assertionResults.length;
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
    join(REPO_ROOT, ".release", "gate-results.json"),
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
