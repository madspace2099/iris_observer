/**
 * The bounded diagnostic matrix for the runner-level exit.
 *
 * The failure appears when the test phase follows format-check, type-check and
 * lint. Four isolated test-only runs were clean, which proves only that the
 * isolated shape is not the reproducing one — running the test command by
 * itself does not reproduce the CONTEXT, so it could never have settled the
 * question either way.
 *
 * This runs the sequences that differ from each other in exactly one respect,
 * records SANITIZED metadata for every one of them, and classifies each
 * independently. IT NEVER COLLAPSES RUNS INTO A VERDICT and it never rewrites
 * `.release/gate-results.json`: a later clean run does not replace an earlier
 * failure, and this file exists partly to make that impossible to do by
 * accident.
 *
 *   pnpm release:diagnose            one pass of the matrix
 *   pnpm release:diagnose --runs=3   three passes, reported separately
 *   pnpm release:diagnose --only=e   one case, repeated
 *
 * Written to `.release/runner-matrix.json`, which is gitignored — this is
 * diagnostic evidence, not a tracked claim.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT, git } from "./facts";
import {
  runProcess,
  sanitize,
  summarizeReport,
  type ProcessResult,
  type VitestReport,
} from "./gate-run";
import type { RunnerDiagnostics } from "./vitest-runner-reporter";

const NEEDS_SHELL = process.platform === "win32";
/* POSIX-relative: Vite resolves a reporter specifier, and a Windows absolute
   path with backslashes is not one. */
const REPORTER = "./scripts/release/vitest-runner-reporter.ts";
const VITEST_BIN = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");

/** One command in a sequence, and how it is launched. */
interface Step {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly shell: boolean;
}

/** A pnpm script, launched the way the gate runner launches it. */
const viaPnpm = (script: string): Step => ({
  label: `pnpm ${script}`,
  command: "pnpm",
  args: [script],
  shell: NEEDS_SHELL,
});

/** The same work, launched without a shell and without the pnpm wrapper. */
const direct = (label: string, args: readonly string[]): Step => ({
  label,
  command: process.execPath,
  args,
  shell: false,
});

const tsc = (project: string): readonly string[] => [
  join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc"),
  "-p",
  project,
  "--noEmit",
];

export interface MatrixCase {
  readonly id: string;
  readonly what: string;
  readonly before: readonly Step[];
  /** How the test phase itself is launched. */
  readonly testLaunch: "pnpm-shell" | "direct-node";
  readonly poolOverride?: string;
  readonly maxWorkers?: string;
}

/**
 * Seven cases, each differing from another in one respect.
 *
 * a-e vary only how much runs before the test phase, which is the variable the
 * observed failure correlates with. f and g vary how the test phase is
 * LAUNCHED, holding the sequence fixed — a pnpm shim invoked through a shell
 * has its own exit-status semantics, and ruling that in or out matters before
 * anything is attributed to Vitest.
 */
export const CASES: readonly MatrixCase[] = [
  { id: "a", what: "test alone", before: [], testLaunch: "pnpm-shell" },
  {
    id: "b",
    what: "format:check -> test",
    before: [viaPnpm("format:check")],
    testLaunch: "pnpm-shell",
  },
  { id: "c", what: "typecheck -> test", before: [viaPnpm("typecheck")], testLaunch: "pnpm-shell" },
  { id: "d", what: "lint -> test", before: [viaPnpm("lint")], testLaunch: "pnpm-shell" },
  {
    id: "e",
    what: "format:check -> typecheck -> lint -> test  (THE GATE SEQUENCE)",
    before: [viaPnpm("format:check"), viaPnpm("typecheck"), viaPnpm("lint")],
    testLaunch: "pnpm-shell",
  },
  {
    id: "f",
    what: "the same sequence, every command direct, no shell",
    before: [
      direct("prettier --check", [
        join(REPO_ROOT, "node_modules", "prettier", "bin", "prettier.cjs"),
        "--check",
        ".",
      ]),
      direct("tsc scripts", tsc("tsconfig.scripts.json")),
      direct("tsc tests", tsc("tsconfig.tests.json")),
      direct("eslint", [join(REPO_ROOT, "node_modules", "eslint", "bin", "eslint.js"), "."]),
    ],
    testLaunch: "direct-node",
  },
  {
    id: "g",
    what: "the gate sequence, test launched directly rather than through pnpm",
    before: [viaPnpm("format:check"), viaPnpm("typecheck"), viaPnpm("lint")],
    testLaunch: "direct-node",
  },
];

export interface CaseResult {
  readonly id: string;
  readonly what: string;
  readonly pass: number;
  /** Sanitized results of the commands that ran BEFORE the test phase. */
  readonly before: readonly { readonly label: string; readonly result: ProcessResult }[];
  readonly processStatus: number | null;
  readonly processSignal: string | null;
  readonly processErrorCode: string | null;
  readonly reportWritten: boolean;
  readonly reportParsed: boolean;
  readonly reportCompleted: boolean;
  readonly reportSuccess: boolean | null;
  readonly failedTests: number | null;
  readonly failedSuites: number | null;
  readonly runtimeErrorSuites: number | null;
  readonly totalTests: number | null;
  readonly skippedTests: number | null;
  readonly reportedUnhandledErrors: number | null;
  readonly sanitizedUnhandledErrorNames: readonly string[];
  readonly sanitizedUnhandledErrorCodes: readonly string[];
  readonly pool: string | null;
  readonly maxWorkers: number | null;
  readonly durationMs: number | null;
  readonly testLaunch: string;
  /** The shape, named. This is what a reader compares across rows. */
  readonly shape: string;
}

/**
 * Name the shape rather than judge it.
 *
 * `RUNNER-LEVEL EXIT` is the one under investigation: the process failed and
 * every test-level measurement says the run was clean. Naming it separately
 * from `TEST FAILURE` is the whole point — they were indistinguishable in the
 * record for three milestones.
 */
export function classifyShape(r: {
  processStatus: number | null;
  processSignal: string | null;
  reportSuccess: boolean | null;
  failedTests: number | null;
  failedSuites: number | null;
  reportedUnhandledErrors: number | null;
}): string {
  const clean = r.processStatus === 0 && r.processSignal === null;
  const testsClean =
    r.reportSuccess === true && (r.failedTests ?? 1) === 0 && (r.failedSuites ?? 1) === 0;

  if (clean && testsClean) return "CLEAN";
  if (!clean && !testsClean) return "TEST FAILURE";
  if (!clean && testsClean) {
    if ((r.reportedUnhandledErrors ?? 0) > 0) return "RUNNER-LEVEL EXIT (unhandled errors)";
    return "RUNNER-LEVEL EXIT (unexplained)";
  }
  return "GREEN PROCESS, RED REPORT";
}

function runOneCase(c: MatrixCase, pass: number): CaseResult {
  const before = c.before.map((s) => ({
    label: s.label,
    result: sanitize(runProcess(s.command, s.args, { cwd: REPO_ROOT, shell: s.shell })),
  }));

  const stamp = `${String(process.pid)}-${String(Date.now())}`;
  const reportFile = join(tmpdir(), `observer-matrix-report-${stamp}.json`);
  const diagFile = join(tmpdir(), `observer-matrix-diag-${stamp}.json`);

  const args = [
    "run",
    "--reporter=json",
    `--outputFile.json=${reportFile}`,
    `--reporter=${REPORTER}`,
    ...(c.poolOverride === undefined ? [] : [`--pool=${c.poolOverride}`]),
    ...(c.maxWorkers === undefined ? [] : [`--maxWorkers=${c.maxWorkers}`]),
  ];

  const spawned =
    c.testLaunch === "pnpm-shell"
      ? runProcess("pnpm", ["exec", "vitest", ...args], {
          cwd: REPO_ROOT,
          shell: NEEDS_SHELL,
          env: { ...process.env, OBSERVER_RUNNER_DIAGNOSTICS: diagFile },
        })
      : runProcess(process.execPath, [VITEST_BIN, ...args], {
          cwd: REPO_ROOT,
          shell: false,
          env: { ...process.env, OBSERVER_RUNNER_DIAGNOSTICS: diagFile },
        });

  const reportWritten = existsSync(reportFile);
  let report: VitestReport | null = null;
  if (reportWritten) {
    try {
      report = JSON.parse(readFileSync(reportFile, "utf8")) as VitestReport;
    } catch {
      report = null;
    }
  }
  const summary = report === null ? null : summarizeReport(report);
  const counts =
    report === null
      ? null
      : report.testResults.reduce(
          (acc, f) => {
            for (const a of f.assertionResults) {
              acc.total += 1;
              if (a.status !== "passed" && a.status !== "failed") acc.skipped += 1;
            }
            return acc;
          },
          { total: 0, skipped: 0 },
        );

  let diag: RunnerDiagnostics | null = null;
  if (existsSync(diagFile)) {
    try {
      diag = JSON.parse(readFileSync(diagFile, "utf8")) as RunnerDiagnostics;
    } catch {
      diag = null;
    }
  }

  rmSync(reportFile, { force: true });
  rmSync(diagFile, { force: true });

  const partial = {
    processStatus: spawned.status,
    processSignal: spawned.signal,
    reportSuccess: summary?.reportSuccess ?? null,
    failedTests: summary?.countedFailedTests ?? null,
    failedSuites: summary?.reportedFailedSuites ?? null,
    reportedUnhandledErrors: diag?.reportedUnhandledErrors ?? null,
  };

  return {
    id: c.id,
    what: c.what,
    pass,
    before,
    processStatus: spawned.status,
    processSignal: spawned.signal,
    processErrorCode: spawned.errorCode,
    reportWritten,
    reportParsed: report !== null,
    reportCompleted: diag?.completed ?? false,
    reportSuccess: summary?.reportSuccess ?? null,
    failedTests: summary?.countedFailedTests ?? null,
    failedSuites: summary?.reportedFailedSuites ?? null,
    runtimeErrorSuites: summary?.runtimeErrorSuites ?? null,
    totalTests: counts?.total ?? null,
    skippedTests: counts?.skipped ?? null,
    reportedUnhandledErrors: diag?.reportedUnhandledErrors ?? null,
    sanitizedUnhandledErrorNames: diag?.sanitizedUnhandledErrorNames ?? [],
    sanitizedUnhandledErrorCodes: diag?.sanitizedUnhandledErrorCodes ?? [],
    pool: diag?.pool ?? null,
    maxWorkers: diag?.maxWorkers ?? null,
    durationMs: diag?.durationMs ?? null,
    testLaunch: c.testLaunch,
    shape: classifyShape(partial),
  };
}

function line(r: CaseResult): string {
  const unhandled = r.reportedUnhandledErrors === null ? "?" : String(r.reportedUnhandledErrors);
  const ids = [...r.sanitizedUnhandledErrorNames, ...r.sanitizedUnhandledErrorCodes]
    .filter((s) => s !== "(none)")
    .join("/");
  return (
    `  ${r.id}.${String(r.pass)}  status=${String(r.processStatus)} ` +
    `success=${String(r.reportSuccess)} failed=${String(r.failedTests)} ` +
    `suites=${String(r.failedSuites)} unhandled=${unhandled}` +
    `${ids === "" ? "" : ` [${ids}]`}  ${r.shape}`
  );
}

function main(): void {
  const runsArg = process.argv.find((a) => a.startsWith("--runs="));
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const runs = runsArg === undefined ? 1 : Math.max(1, Math.min(5, Number(runsArg.split("=")[1])));
  const only = onlyArg?.split("=")[1];
  const cases = only === undefined ? CASES : CASES.filter((c) => c.id === only);

  const head = git("rev-parse", "HEAD");
  console.log(
    `runner diagnostic matrix at ${head.slice(0, 7)} — ${String(cases.length)} case(s) x ${String(runs)}`,
  );
  console.log("  NOTHING HERE IS A VERDICT. Every run is reported; none replaces another.");
  console.log("");

  const results: CaseResult[] = [];
  for (let pass = 1; pass <= runs; pass += 1) {
    for (const c of cases) {
      process.stdout.write(`  ${c.id}.${String(pass)}  ${c.what} … `);
      const r = runOneCase(c, pass);
      results.push(r);
      console.log("");
      console.log(line(r));
    }
  }

  console.log("");
  const runnerLevel = results.filter((r) => r.shape.startsWith("RUNNER-LEVEL"));
  console.log(
    `  ${String(runnerLevel.length)}/${String(results.length)} runs showed the runner-level shape`,
  );
  for (const r of runnerLevel) console.log(line(r));

  mkdirSync(join(REPO_ROOT, ".release"), { recursive: true });
  writeFileSync(
    join(REPO_ROOT, ".release", "runner-matrix.json"),
    `${JSON.stringify({ head, results }, null, 2)}\n`,
    "utf8",
  );
  console.log("");
  console.log("  recorded to .release/runner-matrix.json");
}

if (process.argv[1] !== undefined && process.argv[1].includes("runner-matrix")) main();
