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
import {
  REQUIRED_GATES,
  GATE_IN_PROGRESS,
  GATE_RECORD_PATH,
  renderTestVerdict,
  renderFailedVerdict,
  gateRecordProblems,
  stagedRecordProblems,
  structuralRecordProblems,
  sanitizedRecord,
  type GateRecord,
} from "./gate-contract";
import {
  beginOperation,
  endOperation,
  withTerminalPhase,
  assertOwner,
  discardOwnFiles,
  evidenceFileProblems,
  OperationRefused,
  type Operation,
} from "./release-operation";
import { treeIdentity, treeProblems, TreeBinding } from "./tree-identity";
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

/**
 * Mark the canonical result invalid for the duration of this attempt.
 *
 * Written synchronously, before the first gate, and carrying the attempt id
 * and the HEAD it was started at, so a reader of an abandoned marker can tell
 * WHICH attempt abandoned it rather than only that one did.
 */
function beginAttempt(op: Operation): void {
  /*
   * ONLY THIS OPERATION'S OWN FILES. The pending path is attempt-specific, so
   * clearing it cannot destroy a newer operation's finished-but-unpublished
   * result — which the single shared `gate-results.json.pending` allowed.
   */
  discardOwnFiles(REPO_ROOT, op);
  const safety = evidenceFileProblems(REPO_ROOT, GATE_RECORD_PATH);
  if (safety.length > 0) throw new OperationRefused(safety.join("; "));
  writeFileSync(
    RECORD_PATH,
    `${JSON.stringify(
      {
        status: GATE_IN_PROGRESS,
        operationId: op.operationId,
        head: op.head,
        treeId: op.treeId,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
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
    configuredMinWorkers: d?.configuredMinWorkers ?? null,
    configuredMaxWorkers: d?.configuredMaxWorkers ?? null,
    /*
     * MEASURED. The reporter counts modules executing at once — one per worker,
     * so the real concurrency — and this record used to drop it on the floor
     * and then describe the CONFIGURED bound as though it were observed.
     */
    observedPeakWorkers: d?.peakConcurrentModules ?? null,
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

  /*
   * THE TREE, BEFORE THE MUTEX.
   *
   * A gate reads the WORKING TREE and used to record only HEAD. So this worked:
   * edit runtime code without committing, run the gates green at H, restore the
   * tree, package at H. Every later check was satisfied — clean tree, matching
   * HEAD, green record — and the record described different bytes.
   *
   * Refusing here rather than at publication means a dirty tree costs no suite
   * run at all, and the identity taken now is what publication compares.
   */
  const identity = treeIdentity(REPO_ROOT);
  const head = identity.head;
  console.log(
    `running the gates at ${head.slice(0, 7)} on ${identity.branch} (tree ${identity.treeId.slice(0, 12)})`,
  );

  const unclean = treeProblems(REPO_ROOT);
  if (unclean.length > 0) {
    console.log("");
    console.log("  REFUSING: the gate would measure bytes the commit does not contain.");
    for (const problem of unclean) console.log(`    ${problem}`);
    process.exit(1);
  }

  /*
   * ONE RELEASE OPERATION AT A TIME, HELD FOR THE WHOLE LIFETIME.
   *
   * Gate and package take the same mutex. The packager used to read the record,
   * read the lock, see the gate free and then build holding nothing — so a gate
   * could start, invalidate the record, fail, and the packager would still
   * finish an archive from the green record it had captured before any of that.
   */
  let op: Operation;
  try {
    op = beginOperation(REPO_ROOT, "gate", head, identity.treeId);
  } catch (e) {
    console.log("");
    console.log(`  ${(e as Error).message}`);
    process.exit(1);
  }
  const binding = new TreeBinding(REPO_ROOT, {
    branch: identity.branch,
    head,
    treeId: identity.treeId,
    inputsDigest: identity.inputsDigest,
  });
  binding.sample("before the first gate");
  beginAttempt(op);

  const gates: Record<string, string> = {};
  const processes: Record<string, ProcessResult> = {};
  let failed = 0;

  const record = (label: string, key: string, args: readonly string[], pass = "clean"): void => {
    const r = run(label, pnpm, args, NEEDS_SHELL);
    /*
     * SAMPLED AROUND EVERY STEP. A change present at any sample refuses
     * publication even if the tree is restored afterwards. A change made and
     * undone entirely between two samples is not observed — no filesystem
     * watch is involved — and that limit is stated rather than described away.
     */
    binding.sample(`after ${label}`);
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
  /*
   * RENDERED BY THE CONTRACT, not by a template beside it. The contract parses
   * this exact shape and compares it against the structured totals, and two
   * independent renderings of one format are two places it can drift.
   */
  /*
   * BOTH OUTCOMES RENDERED FROM THE NUMBERS, BY THE CONTRACT.
   *
   * The red verdict used to be `FAILED — ` followed by whatever reasons the
   * classifier had collected — free prose, from a list that grows. The
   * sanitizer refused it, correctly by its own rules, so the staged projection
   * of a red record lost its test gate entirely and could never be structurally
   * valid. The reasons still reach the local console; the RECORD carries the
   * measurements, in one canonical order, and nothing else.
   */
  gates["pnpm test"] =
    gate.reasons.length === 0
      ? renderTestVerdict(c)
      : renderFailedVerdict({
          passed: c.passed,
          skipped: c.skipped,
          failed: c.failed,
          files: c.files,
          status: gate.status,
          reportSuccess: gate.reportSuccess === true,
          failedSuites: gate.reportedFailedSuites ?? 0,
          runtimeErrorSuites: gate.runtimeErrorSuites ?? 0,
        });
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

  /*
   * BUILT ONCE, IN MEMORY, WHILE THIS OPERATION STILL OWNS THE MUTEX.
   *
   * The preserved copy of a failing record used to be made by re-reading the
   * canonical path AFTER publication and release. A new operation could replace
   * that file in the interval, so `gate-results-FAILED-<A>` could contain B's
   * marker. These are the only bytes either destination gets.
   */
  const built: GateRecord = {
    operationId: op.operationId,
    head,
    branch: identity.branch,
    /* MEASURED, never inferred from a test's title. */
    platform: process.platform,
    treeId: identity.treeId,
    inputsDigest: identity.inputsDigest,
    suiteInventoryDigest: identity.suiteInventoryDigest,
    expectedSuites: identity.suiteInventory,
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
      /*
       * AND HOW MANY EACH BOUNDED LIST DROPPED. Written even when zero: the
       * contract reconciles retained + omitted against the measured count, and
       * an absent field is the absence of a measurement rather than a zero.
       */
      failedSuiteNamesOmitted: gate.failedSuiteNamesOmitted,
      /*
       * HOW MANY RESULTS THOSE NAMES STAND FOR. Distinct basenames and failing
       * results are different counts — six results across three files is a real
       * shape — so the record says how many results its names account for, and
       * the contract holds that to the reported total.
       */
      failedSuiteResultsAccounted: gate.failedSuiteResultsAccounted,
      /* Identity only: basename plus bounded, sanitized title. */
      failedTests: gate.failedTests,
      failedTestsOmitted: gate.failedTestsOmitted,
      skippedTests: gate.skippedTests,
      skippedTestsOmitted: gate.skippedTestsOmitted,
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
      /*
       * CONFIGURATION, NOT AN OBSERVED PEAK. These are the bounds the pool
       * was given. No reliable measurement of actual peak concurrency is
       * persisted, so none is claimed.
       */
      workerCount: gate.workerCount,
      configuredMinWorkers: gate.configuredMinWorkers,
      configuredMaxWorkers: gate.configuredMaxWorkers,
      /*
       * MEASURED, AND ALMOST LOST.
       *
       * The reporter counts peak concurrent modules — one per worker, so the
       * real concurrency — and `readRunnerEvidence` has carried it since the
       * milestone that added it. This literal enumerates its fields explicitly
       * and simply left this one out, so the value was computed on every run
       * and written down on none. Nothing caught it: the runner skipped
       * contract validation once a gate had already failed, and the first green
       * run would have refused to publish.
       */
      observedPeakWorkers: gate.observedPeakWorkers,
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
  };
  const bytes = `${JSON.stringify(built, null, 2)}\n`;

  const missing = REQUIRED_GATES.filter(
    (g) => processes[g] === undefined && gates[g] === undefined,
  );
  if (missing.length > 0) {
    console.log(`  RECORDED NO RESULT FOR: ${missing.join(", ")}`);
    failed += 1;
  }

  /*
   * THE TREE MUST STILL BE THE ONE THIS OPERATION MEASURED.
   *
   * Every sample is consulted, not only the last: a modification that was
   * present at any point during the run refuses publication even if the tree
   * was restored before this check.
   */
  binding.sample("before publication");
  if (binding.everBroken.length > 0) {
    console.log("");
    console.log("  TRACKED CONTENT CHANGED DURING THE GATE, so this result describes bytes");
    console.log("  that were not the commit's. Restoring them afterwards does not fix that.");
    for (const breach of binding.everBroken.slice(0, 8)) console.log(`    ${breach}`);
    failed += 1;
  }

  /*
   * THE FULL CONTRACT, HERE, WHILE OWNERSHIP HOLDS.
   *
   * A gate that exits 0 with a record the packager will reject has reported
   * the wrong thing. Both contracts run: the operational one over the record
   * about to be written, and the staged one over the projection that would go
   * into an archive.
   */
  /*
   * STRUCTURE ALWAYS; ACCEPTANCE ONLY WHEN THERE IS SOMETHING TO ACCEPT.
   *
   * This used to be skipped entirely once a gate had failed — a red record was
   * expected to fail the contract, so consulting it looked pointless. That is
   * how a missing measurement stayed invisible: the record was ALSO
   * structurally incomplete, and nothing said so until the first green run
   * would have refused to publish. One failure must not suppress evidence
   * about another.
   */
  const structure = [
    ...structuralRecordProblems(built, head),
    ...structuralRecordProblems(sanitizedRecord(built) as GateRecord, head, "staged"),
  ];
  if (structure.length > 0) {
    console.log("");
    console.log("  THE RECORD THIS RUN PRODUCED IS STRUCTURALLY INCOMPLETE:");
    console.log("  (this is separate from whether the gates passed — a red record still has");
    console.log("   to record every measurement it claims to have taken)");
    for (const problem of structure) console.log(`    ${problem}`);
    failed += 1;
  }

  const contract = failed > 0 ? [] : gateRecordProblems(built, head);
  const projection =
    failed > 0 ? [] : stagedRecordProblems(sanitizedRecord(built) as GateRecord, head);
  if (contract.length > 0 || projection.length > 0) {
    console.log("");
    console.log("  THE RECORD THIS RUN PRODUCED DOES NOT SATISFY THE RELEASE CONTRACT:");
    for (const problem of [...contract, ...projection]) console.log(`    ${problem}`);
    failed += 1;
  }

  /*
   * PRESERVE FIRST, FROM THESE EXACT BYTES, WHILE STILL THE OWNER.
   *
   * Never by re-reading the canonical path: that path belongs to whoever owns
   * the mutex next, and reading it after release is how a preserved failure
   * came to hold somebody else's record.
   */
  if (failed > 0) {
    assertOwner(REPO_ROOT, op);
    const preserved = join(
      REPO_ROOT,
      ".release",
      `gate-results-FAILED-${head.slice(0, 7)}-${op.operationId}.json`,
    );
    writeFileSync(preserved, bytes, "utf8");
    console.log("");
    console.log(`  the failing record is preserved at ${preserved.slice(REPO_ROOT.length + 1)}`);
    console.log("  it is untracked and is NOT packaged: it preserves the record for whoever");
    console.log("  holds this working directory, and is not evidence a reviewer can open.");
  }

  /*
   * PUBLICATION VALIDATES WHAT IS ABOUT TO BECOME CANONICAL.
   *
   * Not the object in memory — the BYTES on disk, read back. Six things have to
   * agree before a rename makes them the answer: this operation still owns the
   * mutex and is a gate; the pending record names this operation; it names this
   * HEAD; it names this tree; it parses; and it satisfies the contract. Any one
   * of them failing means the file is not this operation's finished result, and
   * renaming it would publish something nobody measured.
   */
  try {
    /*
     * THE SAME ARBITRATION THE PACKAGER USES, AND IT WAS MISSING HERE.
     *
     * Package publication and recovery contend for one terminal claim; the gate
     * record publisher took no claim at all. So a recovery could tombstone the
     * canonical record in the interval between this operation's last ownership
     * check and its rename, and the rename would then overwrite the tombstone —
     * a recovered operation publishing a result anyway, which is the exact
     * failure the claim exists to prevent, in the other publisher.
     *
     * The hold spans validation, the canonical rename and `endOperation()`, and
     * is released last. Recovery cannot enter until this operation is finished.
     */
    withTerminalPhase(REPO_ROOT, op, "publish", () => {
      assertOwner(REPO_ROOT, op);
      if (op.kind !== "gate")
        throw new OperationRefused("only a gate operation may publish a record");
      writeFileSync(join(REPO_ROOT, op.pendingPath), bytes, "utf8");

      const readBack = JSON.parse(
        readFileSync(join(REPO_ROOT, op.pendingPath), "utf8"),
      ) as GateRecord;
      const mismatches: string[] = [];
      if (readBack.operationId !== op.operationId) mismatches.push("operation id");
      if (readBack.head !== op.head) mismatches.push("head");
      if (readBack.treeId !== op.treeId) mismatches.push("tree identity");
      if (mismatches.length > 0) {
        throw new OperationRefused(
          `the pending record does not describe this operation (${mismatches.join(", ")})`,
        );
      }
      if (failed === 0) {
        const late = gateRecordProblems(readBack, op.head);
        if (late.length > 0) {
          throw new OperationRefused(
            `the pending record does not satisfy the contract: ${late.join("; ")}`,
          );
        }
      }

      assertOwner(REPO_ROOT, op);
      renameSync(join(REPO_ROOT, op.pendingPath), RECORD_PATH);
      endOperation(REPO_ROOT, op);
    });
  } catch (e) {
    if (!(e instanceof OperationRefused)) throw e;
    discardOwnFiles(REPO_ROOT, op);
    console.log("");
    console.log(`  ${e.message}`);
    console.log("  this operation measured a complete result and is discarding it rather than");
    console.log("  publishing over whatever owns the record now.");
    process.exit(1);
  }

  console.log("");
  console.log(
    `  recorded to .release/gate-results.json at ${head.slice(0, 7)} (${String(binding.sampleCount)} tree samples)`,
  );
  if (failed > 0) {
    console.log(`  ${failed} GATE(S) FAILED`);
    process.exit(1);
  }
}

main();
