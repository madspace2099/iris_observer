import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  runProcess,
  sanitize,
  classifyTestGate,
  describe as describeGate,
  NO_REPORT,
  safeTitle,
  boundIdentities,
  summarizeReport,
  runnerEvidenceReasons,
  NO_RUNNER_EVIDENCE,
  type RunnerEvidence,
  type VitestAssertion,
  type VitestReport,
  MAX_TITLE,
  MAX_IDENTITIES,
  type ProcessResult,
  type ReportSummary,
} from "../../scripts/release/gate-run";
import { syntheticGateRecord } from "./support/synthetic-gate-record";
import { safeIdentity, summarizeUnhandled } from "../../scripts/release/vitest-runner-reporter";
import { classifyShape } from "../../scripts/release/runner-matrix";

/**
 * The gate runner keeps evidence, decides fail-closed, and persists no output.
 *
 * The test gate exited non-zero twice in five runs while Vitest's JSON report
 * declared every test passing. The runner recorded the single word `FAILED`,
 * printed a transient tail, and discarded the three facts that could have told
 * a runner-level exit apart from a suite result: the exit status, the
 * terminating signal, and the spawn error code. An intermittent failure that
 * leaves no evidence is one nobody can investigate — and the temptation, once
 * it is invisible, is to re-run until it goes green.
 *
 * These fixtures drive real child processes, because the behaviour under test
 * is what `spawnSync` reports and not what a mock would be told to say.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const node = process.execPath;
const HEAD_FIXTURE = "3333333333333333333333333333333333333333";

const clean: ProcessResult = { ok: true, status: 0, signal: null, errorCode: null };

/**
 * Runner-level evidence for a run that had none of the new problems.
 *
 * Every fixture below that is ABOUT the report or the process holds this
 * constant, so those cases keep testing one axis at a time. The cases that are
 * about the runner axis vary it explicitly and call `classifyTestGate` direct.
 */
const cleanRunner: RunnerEvidence = {
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
};

/** Holds the runner axis clean unless a case says otherwise. */
const classify = (
  process_: ProcessResult,
  report: ReportSummary,
  runner: RunnerEvidence = cleanRunner,
): ReturnType<typeof classifyTestGate> => classifyTestGate(process_, report, runner);
const passing: ReportSummary = {
  ...NO_REPORT,
  reportSuccess: true,
  reportedFailedTests: 0,
  countedFailedTests: 0,
  reportedFailedSuites: 0,
  runtimeErrorSuites: 0,
};

describe("runProcess reports what happened to the child", () => {
  it("records a clean exit", () => {
    const r = runProcess(node, ["-e", "process.exit(0)"], { cwd: ROOT });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(0);
    expect(r.signal).toBeNull();
    expect(r.errorCode).toBeNull();
  });

  it("records a known non-zero exit code", () => {
    const r = runProcess(node, ["-e", "process.exit(3)"], { cwd: ROOT });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(3);
    expect(r.signal).toBeNull();
    expect(r.errorCode).toBeNull();
  });

  it("records a spawn failure by its error code", () => {
    const r = runProcess("observer-no-such-command-exists", [], { cwd: ROOT });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("ENOENT");
  });

  /*
   * The only skip left in this repository's suites, and the reason is IN THE
   * TITLE on purpose: the persisted record carries a skipped test as a suite
   * basename plus a bounded title and nothing else, so a title that does not
   * say why leaves a reader with a count and no explanation. This one is
   * inapplicable by platform rather than by repository state, so the skipped
   * count is deterministic for a given platform.
   */
  it.runIf(process.platform !== "win32")(
    "records termination by signal (POSIX only; skipped on win32)",
    () => {
      /*
       * Windows has no signal delivery in the sense `spawnSync` reports, so
       * asserting it there would be asserting the harness rather than the
       * runner — and this suite runs on Windows.
       */
      const r = runProcess(node, ["-e", "process.kill(process.pid, 'SIGTERM')"], { cwd: ROOT });
      expect(r.ok).toBe(false);
      expect(r.signal).toBe("SIGTERM");
    },
  );

  it("keeps the child's output beside the result, not inside it", () => {
    const r = runProcess(node, ["-e", "console.log('observer-fixture-marker')"], { cwd: ROOT });
    expect(r.output).toContain("observer-fixture-marker");
    expect(Object.keys(sanitize(r)).sort()).toEqual(["errorCode", "ok", "signal", "status"]);
  });
});

describe("classifyTestGate fails closed", () => {
  it("passes only when the process and the report both agree", () => {
    expect(classify(clean, passing).reasons).toEqual([]);
  });

  it("fails on a non-zero exit even when the report says success", () => {
    /* Exactly the intermittent case this refactor exists to make visible. */
    const r = classify({ ...clean, ok: false, status: 1 }, passing);
    expect(r.reasons).toContain("exit status 1");
  });

  it("fails on a signal even when the report says success", () => {
    const r = classify({ ...clean, ok: false, status: null, signal: "SIGKILL" }, passing);
    expect(r.reasons).toContain("terminated by signal SIGKILL");
  });

  it("fails on a spawn error", () => {
    const r = classify({ ...clean, ok: false, errorCode: "EINVAL" }, passing);
    expect(r.reasons).toContain("process error EINVAL");
  });

  it("fails when no readable report was produced", () => {
    const r = classify(clean, NO_REPORT);
    expect(r.reasons).toContain("no readable JSON report");
  });

  it("fails when the process succeeds but the report declares failure", () => {
    const r = classify(clean, { ...passing, reportSuccess: false });
    expect(r.reasons).toContain("report declares failure");
  });

  it("fails on a reported failed test", () => {
    const r = classify(clean, { ...passing, reportedFailedTests: 2 });
    expect(r.reasons).toContain("report names 2 failed test(s)");
  });

  it("fails on a counted failed test even when the summary says none", () => {
    /*
     * Two independent counts, because a summary field and the assertion results
     * are two claims, and this release has already been bitten once by trusting
     * one of a pair.
     */
    const r = classify(clean, { ...passing, countedFailedTests: 1 });
    expect(r.reasons).toContain("1 failed test(s) counted from results");
  });

  it("reports every reason, not the first", () => {
    const r = classify(
      { ok: false, status: 7, signal: null, errorCode: null },
      { ...passing, reportSuccess: false, reportedFailedTests: 4, countedFailedTests: 4 },
    );
    expect(r.reasons).toHaveLength(4);
  });

  it("carries the process and report metadata through to the result", () => {
    const r = classify({ ok: false, status: 9, signal: null, errorCode: null }, passing);
    expect(r.status).toBe(9);
    expect(r.reportSuccess).toBe(true);
    expect(describeGate(r)).toContain("status=9");
    expect(describeGate(r)).toContain("reportSuccess=true");
  });
});

/** Every field the diagnosis needed, and that the runner must therefore keep. */
const PERSISTED_METADATA = [
  "ok",
  "status",
  "signal",
  "errorCode",
  "reportSuccess",
  "reportedFailedTests",
  "countedFailedTests",
  "reportedFailedSuites",
  "runtimeErrorSuites",
  "failedSuiteNames",
  "failedTests",
  "skippedTests",
  /* The runner-level half, which is why this milestone exists. */
  "reportedUnhandledErrors",
  "sanitizedUnhandledErrorNames",
  "sanitizedUnhandledErrorCodes",
  "reportWritten",
  "reportParsed",
  "reportCompleted",
  "processStatus",
  "processSignal",
  "processErrorCode",
  "phase",
  "durationMs",
  "runner",
  "workerPool",
  "workerCount",
] as const;

describe("nothing that could carry a secret is persisted", () => {
  it("the sanitized shape has no output fields", () => {
    const r = runProcess(node, ["-e", "console.log('x')"], { cwd: ROOT });
    const persisted = JSON.stringify(sanitize(r));
    expect(persisted).not.toContain("stdout");
    expect(persisted).not.toContain("stderr");
    expect(persisted).not.toContain("output");
  });

  /*
   * READ FROM THE RUNNER, NOT FROM THE DEVELOPER'S `.release/`.
   *
   * This claim used to be checked by opening the real
   * `.release/gate-results.json` and skipping when it was absent — so it ran on
   * a machine that had already gated this commit and nowhere else, and it made
   * the suite's skipped count depend on a gitignored file that a clone does not
   * have. It also read state no test is supposed to touch.
   *
   * The claim has two halves and they are now checked where each one lives: the
   * persisted SHAPE, in the runner's own source, and the no-output property,
   * over a record in that shape written into a temporary root this test owns.
   */
  const persistedLiteral = (): string => {
    const source = readFileSync(join(ROOT, "scripts/release/run-gates.ts"), "utf8");
    const literal = /gate-results\.json"\),[\s\S]*?\n {4}"utf8",\n {2}\);/.exec(source)?.[0];
    expect(literal, "the persisted object literal was not found in run-gates.ts").toBeDefined();
    /*
     * Comments stripped: the literal carries one that says "Never stdout,
     * stderr or an env value", and a prose promise not to persist a field is
     * not the field. What is checked below is what is actually written.
     */
    return (literal ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  };

  it.each(PERSISTED_METADATA)("the runner persists %s", (field) => {
    expect(persistedLiteral(), field).toContain(`${field}:`);
  });

  it("and persists nothing that could carry child output beside it", () => {
    for (const forbidden of ["stdout", "stderr", "output"]) {
      expect(persistedLiteral(), forbidden).not.toContain(forbidden);
    }
  });

  it("a record in that shape serializes with the metadata and without output", () => {
    const root = mkdtempSync(join(tmpdir(), "observer-gate-record-"));
    try {
      syntheticGateRecord(root, HEAD_FIXTURE);
      const raw = readFileSync(join(root, ".release", "gate-results.json"), "utf8");
      const parsed = JSON.parse(raw) as { testGate?: Record<string, unknown> };
      /* The evidence is there… */
      expect(parsed.testGate).toBeDefined();
      for (const field of PERSISTED_METADATA) {
        expect(parsed.testGate, field).toHaveProperty(field);
      }
      /* …and the output is not. */
      for (const forbidden of ["stdout", "stderr", "output"]) {
        expect(raw, forbidden).not.toContain(forbidden);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a failing gate stays failing however often it is classified", () => {
    /*
     * The property that matters: no amount of re-asking turns an observed
     * failure into a clean result. Asserted by asking repeatedly, because a
     * retry loop is how an intermittent fault becomes an invisible one.
     */
    const failing: ProcessResult = { ok: false, status: 1, signal: null, errorCode: null };
    for (let i = 0; i < 50; i += 1) {
      expect(classify(failing, passing).reasons).toEqual(["exit status 1"]);
    }
  });

  it("the runner invokes the test gate once per verdict", () => {
    /*
     * Two call sites and no more: one in `main`, one in the repeated
     * diagnostic — which reports every run and collapses none of them into a
     * single verdict. A third would be a retry.
     */
    const source = readFileSync(join(ROOT, "scripts/release/run-gates.ts"), "utf8");
    expect((source.match(/\} = runTestGate\(\)/g) ?? []).length).toBe(2);
  });
});

/**
 * Suite-level evidence, kept because discarding it cost a diagnosis.
 *
 * A hook timeout fails the SUITE and records no failed assertion. For as long
 * as the runner kept only `reportSuccess` and the failed-TEST counts, that shape
 * — exit 1, `success: false`, zero failed tests — looked like a runner-level
 * fault, and it took a milestone to find out it was a 30-second budget in one
 * of this repository's own tests.
 */
describe("suite-level failures are their own evidence", () => {
  it("fails on a failed suite that recorded no failed assertion", () => {
    const r = classify(clean, {
      ...passing,
      reportedFailedSuites: 1,
      runtimeErrorSuites: 1,
    });
    expect(r.reasons).toContain("report names 1 failed suite(s)");
    expect(r.reasons).toContain(
      "1 suite(s) failed with no failed assertion — hook, collection or timeout",
    );
  });

  it("fails on a runtime-error suite alone", () => {
    const r = classify(clean, { ...passing, runtimeErrorSuites: 2 });
    expect(r.reasons.join(" ")).toMatch(/2 suite\(s\) failed with no failed assertion/);
  });

  it("fails on a non-zero failed-suite count even when the report claims success", () => {
    /*
     * Independent of `reportSuccess`, and deliberately: the summary can say the
     * run succeeded while a suite did not, and only one of those is worth
     * trusting.
     */
    const r = classify(clean, { ...passing, reportSuccess: true, reportedFailedSuites: 1 });
    expect(r.reasons).not.toEqual([]);
  });

  it("names the failing suites, by basename only", () => {
    const r = classify(clean, {
      ...passing,
      failedSuiteNames: ["package-generation.test.ts"],
    });
    expect(r.reasons.join(" ")).toContain("package-generation.test.ts");
    /* A basename, never a path — a path is machine-identifying detail. */
    expect(r.reasons.join(" ")).not.toMatch(/[/\\]/);
  });

  it("still fails on a non-zero exit with a wholly successful report", () => {
    /* The observation that remains unresolved. It must not read as clean. */
    const r = classify({ ...clean, ok: false, status: 1 }, passing);
    expect(r.reasons).toEqual(["exit status 1"]);
  });

  it("carries the suite fields into the one-line summary", () => {
    const line = describeGate(
      classify(clean, {
        ...passing,
        reportedFailedSuites: 1,
        failedSuiteNames: ["a.test.ts"],
      }),
    );
    expect(line).toContain("reportedFailedSuites=1");
    expect(line).toContain("runtimeErrorSuites=0");
    expect(line).toContain("failedSuites=[a.test.ts]");
  });

  it("persists no message, output, URL or environment value with a failure", () => {
    const r = classify(
      { ok: false, status: 1, signal: null, errorCode: null },
      {
        ...passing,
        reportSuccess: false,
        reportedFailedSuites: 1,
        failedSuiteNames: ["b.test.ts"],
      },
    );
    const persisted = JSON.stringify({
      ok: r.reasons.length === 0,
      status: r.status,
      signal: r.signal,
      errorCode: r.errorCode,
      reportSuccess: r.reportSuccess,
      reportedFailedTests: r.reportedFailedTests,
      countedFailedTests: r.countedFailedTests,
      reportedFailedSuites: r.reportedFailedSuites,
      runtimeErrorSuites: r.runtimeErrorSuites,
      failedSuiteNames: r.failedSuiteNames,
      reasons: r.reasons,
    });
    for (const forbidden of ["stdout", "stderr", "output", "https://", "SUPABASE", "OPENAI"]) {
      expect(persisted, forbidden).not.toContain(forbidden);
    }
  });
});

/**
 * Assertion identity is retained; everything else a failure carries is not.
 *
 * The record kept counts and suite basenames, so a gate could report that three
 * tests failed and leave no way to say which three — the JSON report is deleted
 * as soon as the counts are out of it. A title and a basename close that gap.
 * They are also the only two things safe to keep: a failure message is
 * unbounded text from a run that may have touched anything at all.
 */
describe("what a failing test is allowed to leave behind", () => {
  it("keeps the identity", () => {
    const r = classify(clean, {
      ...passing,
      failedTests: [{ suite: "a.test.ts", title: "outer > inner" }],
    });
    expect(r.reasons.join(" ")).toContain("a.test.ts > outer > inner");
  });

  it("flattens control characters and line breaks out of a title", () => {
    /*
     * A stored title must not carry an invisible byte into the record that the
     * package-level scan then refuses, and a multi-line title breaks every
     * reader that assumes one line.
     */
    const messy = `one${String.fromCharCode(8)}two\nthree\r\nfour\tfive`;
    const safe = safeTitle(messy);
    expect(safe).toBe("one two three four five");
    for (const ch of safe) expect((ch.codePointAt(0) ?? 32) >= 32).toBe(true);
  });

  it("bounds a very long title rather than storing it whole", () => {
    const safe = safeTitle("x".repeat(MAX_TITLE * 3));
    expect(safe.length).toBe(MAX_TITLE);
    expect(safe.endsWith("…")).toBe(true);
  });

  it("bounds the number of identities, and says it did", () => {
    const many = Array.from({ length: MAX_IDENTITIES + 40 }, (_, i) => ({
      suite: "a.test.ts",
      title: `case ${String(i)}`,
    }));
    const bounded = boundIdentities(many);
    expect(bounded.length).toBe(MAX_IDENTITIES);
    /* 24 kept plus the summary line, so 41 of the 65 are accounted for by it. */
    expect(bounded.at(-1)?.title).toBe(`and ${String(many.length - (MAX_IDENTITIES - 1))} more`);
  });

  it("keeps a short list whole", () => {
    const few = [{ suite: "a.test.ts", title: "one" }];
    expect(boundIdentities(few)).toEqual(few);
  });

  /**
   * ASSEMBLED AT RUN TIME, never written down.
   *
   * The first version of this fixture contained the literal
   * `OPENAI_API_KEY` followed by `=` and a value, and `pnpm audit:secrets`
   * flagged it — correctly. The auditor has one exemption, for the file whose
   * job is to describe its own rules, and no general allowlist, on the stated
   * grounds that "a scanner people learn to ignore is not a control". A test
   * that exists to prove secret-shaped text is excluded must not be the thing
   * that puts secret-shaped text in the repository.
   *
   * So each fixture is built from parts. The strings exist for the length of
   * the assertion and appear nowhere in any tracked file.
   */
  const secretShaped = (): readonly (readonly [string, string])[] => {
    const zeros = "0".repeat(24);
    return [
      ["a bearer token", `Bearer ${["sk", "live", zeros].join("-")}`],
      ["a connection string", `postgres://user:${"pw"}${zeros}@db.example.test:5432/postgres`],
      ["an expected/received dump", `expected '${["sb", "secret", zeros].join("_")}' to be 'x'`],
      ["a stack frame", "at Object.<anonymous> (C:/Users/someone/repo/src/x.ts:12:9)"],
      ["a URL", `https://${"tfcchobwobpadenampyh"}.supabase.co/rest/v1/observer`],
      [
        "an env assignment",
        `${["OPENAI", "API", "KEY"].join("_")}=${["sk", "proj", zeros].join("-")}`,
      ],
    ];
  };

  it.each(secretShaped())("never lets %s reach the persisted record", (_why, secretish) => {
    /*
     * The model has nowhere to put it. There is no message field, no expected,
     * no received, no stack and no output — so a failure carrying any of these
     * cannot serialise them even by accident.
     */
    const r = classify(clean, {
      ...passing,
      failedTests: [{ suite: "a.test.ts", title: safeTitle("outer > inner") }],
    });
    const persisted = JSON.stringify({
      ok: r.reasons.length === 0,
      status: r.status,
      signal: r.signal,
      errorCode: r.errorCode,
      reportSuccess: r.reportSuccess,
      reportedFailedTests: r.reportedFailedTests,
      countedFailedTests: r.countedFailedTests,
      reportedFailedSuites: r.reportedFailedSuites,
      runtimeErrorSuites: r.runtimeErrorSuites,
      failedSuiteNames: r.failedSuiteNames,
      failedTests: r.failedTests,
      skippedTests: r.skippedTests,
      reportedUnhandledErrors: r.reportedUnhandledErrors,
      sanitizedUnhandledErrorNames: r.sanitizedUnhandledErrorNames,
      sanitizedUnhandledErrorCodes: r.sanitizedUnhandledErrorCodes,
      reportWritten: r.reportWritten,
      reportParsed: r.reportParsed,
      reportCompleted: r.reportCompleted,
      processStatus: r.processStatus,
      processSignal: r.processSignal,
      processErrorCode: r.processErrorCode,
      phase: r.phase,
      durationMs: r.durationMs,
      runner: r.runner,
      workerPool: r.workerPool,
      workerCount: r.workerCount,
      reasons: r.reasons,
    });
    expect(persisted).not.toContain(secretish);
    for (const forbidden of ["message", "expected", "received", "stack", "stdout", "stderr"]) {
      expect(persisted, forbidden).not.toContain(forbidden);
    }
  });

  it("the persisted shape has no field a message could live in", () => {
    const keys = Object.keys({
      ...clean,
      ...passing,
      ...cleanRunner,
      reasons: [],
    }).sort();
    expect(keys).toEqual([
      "countedFailedTests",
      "durationMs",
      "errorCode",
      "failedSuiteNames",
      "failedTests",
      "ok",
      "phase",
      "processErrorCode",
      "processSignal",
      "processStatus",
      "reasons",
      "reportCompleted",
      "reportParsed",
      "reportSuccess",
      "reportWritten",
      "reportedFailedSuites",
      "reportedFailedTests",
      "reportedUnhandledErrors",
      "runner",
      "runtimeErrorSuites",
      "sanitizedUnhandledErrorCodes",
      "sanitizedUnhandledErrorNames",
      "signal",
      "skippedTests",
      "status",
      "workerCount",
      "workerPool",
    ]);
  });

  it("the runner deletes the JSON report after extracting the identities", () => {
    const source = readFileSync(join(ROOT, "scripts/release/run-gates.ts"), "utf8");
    expect(source).toMatch(/rmSync\(reportFile, \{ force: true \}\)/);
    /* And never persists the report itself. */
    expect(source).not.toMatch(/failureMessages/);
  });
});

/**
 * A failure message is untrusted text, and it never reaches the record.
 *
 * The persisted record is a file somebody zips and hands to a reviewer. A
 * Vitest failure message is the assertion's `expected` and `received` rendered
 * as prose — and this repository's own suites assert over environment names,
 * resolver inputs and fixture values, so a failing test can put an arbitrary
 * string into that field. `summarizeReport` is pure precisely so that claim can
 * be driven with a report no real run would produce.
 *
 * ## Why the fixture is assembled rather than written
 *
 * A tracked file containing the complete literal would itself be a finding in
 * this repository's secret audit — which is exactly what happened to an earlier
 * fixture here and cost an authorised history rewrite to undo. The value below
 * is built from fragments at run time: it has the shape the auditor looks for
 * once assembled, and no tracked byte carries it. It is not, and never was, a
 * credential.
 */
describe("a secret-shaped failure message cannot reach the persisted record", () => {
  const secretShaped = (): string => ["sk", "proj", "A".repeat(20) + "b7Q".repeat(8)].join("-");

  /** Proof the fixture is worth asserting about: it matches the auditor's rule. */
  const AUDIT_RULE = /\bsk-(proj|svcacct|admin)-[A-Za-z0-9_-]{24,}/;

  const reportCarrying = (message: string): VitestReport => ({
    success: false,
    numFailedTests: 1,
    numFailedTestSuites: 1,
    testResults: [
      {
        name: join(ROOT, "supabase", "test", "supabase-resolver.test.ts"),
        status: "failed",
        assertionResults: [
          {
            status: "failed",
            title: "refuses a malformed origin",
            fullName: "the resolver > refuses a malformed origin",
            /* The field the reporter really emits, and the interface omits. */
            failureMessages: [message],
          } as VitestAssertion,
        ],
      },
    ],
  });

  it("the fixture really does have the shape the auditor refuses", () => {
    expect(AUDIT_RULE.test(secretShaped())).toBe(true);
  });

  it("no tracked file carries the assembled literal", () => {
    /*
     * The check that keeps this fixture honest. `git grep -I` over tracked text
     * finds nothing, because the value exists only once the three fragments are
     * joined at run time.
     */
    let out = "";
    try {
      out = execFileSync("git", ["grep", "-I", "-l", "-F", "-e", secretShaped()], {
        cwd: ROOT,
        encoding: "utf8",
      });
    } catch {
      /* Exit 1 is git grep's "no match", which is the passing case. */
      out = "";
    }
    expect(out.trim()).toBe("");
  });

  it("the summary carries no failure message at all", () => {
    const persisted = JSON.stringify(summarizeReport(reportCarrying(secretShaped())));
    expect(persisted).not.toContain(secretShaped());
    expect(persisted).not.toContain("failureMessages");
    expect(AUDIT_RULE.test(persisted)).toBe(false);
  });

  it("survives classification and the persisted testGate shape unchanged", () => {
    /*
     * End to end, through the same two calls the runner makes: a message that
     * reached `classifyTestGate` and then the record would be in the archive.
     */
    const gate = classify(
      { ok: false, status: 1, signal: null, errorCode: null },
      summarizeReport(reportCarrying(secretShaped())),
    );
    const persisted = JSON.stringify(gate);
    expect(persisted).not.toContain(secretShaped());
    expect(AUDIT_RULE.test(persisted)).toBe(false);
    /* And the failure is still reported — silence is not sanitization. */
    expect(gate.reasons.length).toBeGreaterThan(0);
    expect(gate.failedTests).toHaveLength(1);
  });

  it("keeps the identity, and only the identity", () => {
    const { failedTests } = summarizeReport(reportCarrying(secretShaped()));
    expect(failedTests[0]).toEqual({
      suite: "supabase-resolver.test.ts",
      title: "the resolver > refuses a malformed origin",
    });
    /* A basename, so the record does not name anybody's home directory. */
    expect(JSON.stringify(failedTests)).not.toContain(ROOT);
  });

  it("holds when the message is the whole of a very long, control-laden failure", () => {
    const nasty = [
      "expected ",
      String.fromCharCode(0),
      secretShaped(),
      String.fromCharCode(8).repeat(4),
      "x".repeat(4000),
    ].join("");
    const persisted = JSON.stringify(summarizeReport(reportCarrying(nasty)));
    expect(persisted).not.toContain(secretShaped());
    expect(persisted).not.toContain("xxxxxxxxxx");
    for (const code of [0, 8]) {
      expect(persisted.includes(String.fromCharCode(code))).toBe(false);
    }
  });

  it("bounds a title too, since a title is the one thing it does keep", () => {
    const long = summarizeReport({
      testResults: [
        {
          name: "a.test.ts",
          status: "failed",
          assertionResults: [{ status: "failed", fullName: "t".repeat(500) }],
        },
      ],
    });
    expect((long.failedTests[0]?.title ?? "").length).toBeLessThanOrEqual(MAX_TITLE);
  });
});

/**
 * The shape that took three milestones to name.
 *
 * `status=1` beside `reportSuccess=true`, zero failed tests, zero failed suites
 * and zero runtime-error suites. Every test-level field says the run was clean;
 * the process says it failed; and the record could say only "exit status 1".
 *
 * Vitest 3.2.7 produces it from exactly one condition. Its JSON reporter takes
 * the unhandled-error list as `_errors` and discards it, computes `success`
 * from failed tests and suites alone, and writes an object with no field for
 * it — while `_checkUnhandledErrors` sets `process.exitCode = 1` whenever that
 * list is non-empty. So the gate was reading the one artefact that structurally
 * cannot express the thing it needed to know.
 */
describe("an unhandled runner error is a failure in its own right", () => {
  const withUnhandled = (over: Partial<RunnerEvidence> = {}): RunnerEvidence => ({
    ...cleanRunner,
    reportedUnhandledErrors: 1,
    sanitizedUnhandledErrorNames: ["Error"],
    sanitizedUnhandledErrorCodes: ["ERR_IPC_CHANNEL_CLOSED"],
    ...over,
  });

  it("fails a report that declares complete success", () => {
    /* The exact recorded shape: nothing test-level is wrong with this run. */
    const r = classifyTestGate({ ...clean, ok: false, status: 1 }, passing, withUnhandled());
    expect(r.reportSuccess).toBe(true);
    expect(r.countedFailedTests).toBe(0);
    expect(r.reportedFailedSuites).toBe(0);
    expect(r.runtimeErrorSuites).toBe(0);
    expect(r.reasons).toContain("exit status 1");
    expect(r.reasons.join(" ")).toMatch(/1 unhandled runner error\(s\)/);
  });

  it("names the sanitized identity, so the failure can be investigated", () => {
    const r = classifyTestGate(clean, passing, withUnhandled());
    expect(r.reasons.join(" ")).toContain("ERR_IPC_CHANNEL_CLOSED");
    expect(r.reasons.join(" ")).toContain("Error");
  });

  it("fails even when the process somehow exited zero", () => {
    /*
     * Independent of the exit code, deliberately. Trusting one of a pair is
     * what this repository keeps correcting; an unhandled error is a fact
     * about the run whatever the status happened to be.
     */
    const r = classifyTestGate(clean, passing, withUnhandled());
    expect(r.reasons.join(" ")).toMatch(/unhandled runner error/);
  });

  it("passes a run with none", () => {
    expect(classifyTestGate(clean, passing, cleanRunner).reasons).toEqual([]);
  });

  it("treats unmeasured as a refusal, not as none", () => {
    /* "Not measured" and "measured as none" are different facts. */
    expect(runnerEvidenceReasons(NO_RUNNER_EVIDENCE).join(" ")).toMatch(
      /unhandled runner errors were not measured/,
    );
    expect(
      runnerEvidenceReasons({ ...cleanRunner, reportedUnhandledErrors: null }).join(" "),
    ).toMatch(/not measured/);
  });

  it.each([
    ["the report file was never written", { reportWritten: false }, /no JSON report file/],
    ["the report did not parse", { reportParsed: false }, /did not parse/],
    ["the diagnostics reporter never finished", { reportCompleted: false }, /did not complete/],
  ])("refuses when %s", (_why, over, expected) => {
    expect(runnerEvidenceReasons({ ...cleanRunner, ...over }).join(" ")).toMatch(expected);
  });

  it("reports every runner reason, not the first", () => {
    const reasons = runnerEvidenceReasons({
      ...cleanRunner,
      reportWritten: false,
      reportParsed: false,
      reportCompleted: false,
      reportedUnhandledErrors: null,
    });
    expect(reasons).toHaveLength(4);
  });

  it("carries the runner metadata through to the result", () => {
    const r = classifyTestGate(clean, passing, withUnhandled({ workerPool: "forks" }));
    expect(r.workerPool).toBe("forks");
    expect(r.runner).toBe("vitest 3.2.7");
    expect(describeGate(r)).toContain("unhandledErrors=1");
    expect(describeGate(r)).toContain("pool=forks");
  });
});

/**
 * The reporter's sanitizer, which is the only thing standing between an
 * arbitrary thrown value and a file that gets zipped and handed over.
 *
 * An unhandled error can be any value at all. Its `name` is not necessarily a
 * class name — for a thrown object it is whatever the thrower put there. So the
 * rule is an ALLOW-LIST rather than a cleaning pass: there is no escaping step
 * for a crafted value to survive.
 */
describe("runner error identities are allow-listed, not cleaned", () => {
  it.each([
    ["Error", "Error"],
    ["TypeError", "TypeError"],
    ["ERR_IPC_CHANNEL_CLOSED", "ERR_IPC_CHANNEL_CLOSED"],
    ["AggregateError", "AggregateError"],
    ["ERR_UNHANDLED_REJECTION", "ERR_UNHANDLED_REJECTION"],
  ])("keeps the plain identifier %s", (raw, expected) => {
    expect(safeIdentity(raw)).toBe(expected);
  });

  it.each([
    /*
     * THE CASE THAT FOUND THE HOLE. The first allow-list was
     * `[A-Za-z0-9_.$-]{1,64}`, which admits this in full: hyphens were
     * permitted and sixty-four characters is longer than an API key. An
     * allow-list wide enough to pass a credential is not an allow-list.
     */
    ["a hyphenated key", ["sk", "proj", "0".repeat(30)].join("-")],
    ["an underscored key", ["sb", "secret", "A".repeat(24)].join("_")],
    ["a long unbroken run", "A".repeat(20)],
    ["a hyphen anywhere at all", "Some-Error"],
    ["a sentence", "connect ECONNREFUSED 127.0.0.1:5432"],
    ["a path", "C:/Users/someone/repo/src/x.ts"],
    ["a URL", "https://example.test/x"],
    [
      "an assignment",
      ["OPENAI", "API", "KEY"].join("_") + "=" + ["sk", "proj", "A".repeat(30)].join("-"),
    ],
    ["a newline", "Error\nat Object.<anonymous>"],
    ["a NUL", "Error" + String.fromCharCode(0)],
    ["something too long", "E".repeat(200)],
  ])("replaces %s outright", (_why, raw) => {
    expect(safeIdentity(raw)).toBe("(unnamed)");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 7],
    ["an object", { toString: () => "Error" }],
  ])("reports %s as absent", (_why, raw) => {
    expect(safeIdentity(raw)).toBe("(none)");
  });

  it("summarizes a real error list to names and codes", () => {
    const e = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ERR_IPC_CHANNEL_CLOSED",
    });
    const { names, codes } = summarizeUnhandled([e]);
    expect(names).toEqual(["Error"]);
    expect(codes).toEqual(["ERR_IPC_CHANNEL_CLOSED"]);
    expect(JSON.stringify({ names, codes })).not.toContain("ECONNREFUSED");
    expect(JSON.stringify({ names, codes })).not.toContain("127.0.0.1");
  });

  it("never lets a message reach the summary, however it is carried", () => {
    const zeros = "0".repeat(30);
    const nasty = Object.assign(new Error("x"), {
      name: `${["sk", "proj", zeros].join("-")}`,
      code: `postgres://user:pw${zeros}@db.example.test:5432/postgres`,
    });
    const summary = JSON.stringify(summarizeUnhandled([nasty]));
    expect(summary).not.toContain("sk-proj-");
    expect(summary).not.toContain("postgres://");
    expect(summary).toContain("(unnamed)");
  });

  it("de-duplicates and bounds the lists", () => {
    const many = Array.from({ length: 40 }, (_v, i) =>
      Object.assign(new Error("x"), { name: `E${String(i)}` }),
    );
    const { names } = summarizeUnhandled(many);
    expect(names).toHaveLength(10);
    expect(names.at(-1)).toBe("and 31 more");
  });

  it("collapses forty identical errors to one identity", () => {
    const same = Array.from({ length: 40 }, () =>
      Object.assign(new Error("x"), { code: "ERR_IPC_CHANNEL_CLOSED" }),
    );
    expect(summarizeUnhandled(same).codes).toEqual(["ERR_IPC_CHANNEL_CLOSED"]);
  });

  it("survives a thrown non-object by falling back to its constructor", () => {
    /*
     * A thrown value need not be an Error. A string has no name property, so the
     * fallback reports String — an identity, and still not the value.
     */
    expect(summarizeUnhandled([null, undefined, "boom", 7]).names).toEqual([
      "Number",
      "Object",
      "String",
    ]);
    expect(JSON.stringify(summarizeUnhandled(["boom"]))).not.toContain("boom");
  });
});

/**
 * The diagnostic matrix names shapes; it does not judge them.
 *
 * Distinguishing a RUNNER-LEVEL EXIT from a TEST FAILURE is the entire point:
 * they were indistinguishable in the record, and a reader comparing rows needs
 * the difference stated rather than inferred from four numbers.
 */
describe("the diagnostic matrix distinguishes the shapes", () => {
  const base = {
    processStatus: 0,
    processSignal: null,
    reportSuccess: true,
    failedTests: 0,
    failedSuites: 0,
    reportedUnhandledErrors: 0,
  };

  it("names a clean run", () => {
    expect(classifyShape(base)).toBe("CLEAN");
  });

  it("names the recorded shape, with its cause", () => {
    expect(classifyShape({ ...base, processStatus: 1, reportedUnhandledErrors: 1 })).toBe(
      "RUNNER-LEVEL EXIT (unhandled errors)",
    );
  });

  it("says so when the runner-level exit has no measured cause", () => {
    expect(classifyShape({ ...base, processStatus: 1 })).toBe("RUNNER-LEVEL EXIT (unexplained)");
  });

  it("does not call a failed test a runner-level exit", () => {
    expect(classifyShape({ ...base, processStatus: 1, reportSuccess: false, failedTests: 3 })).toBe(
      "TEST FAILURE",
    );
  });

  it("names a green process beside a red report", () => {
    expect(classifyShape({ ...base, reportSuccess: false })).toBe("GREEN PROCESS, RED REPORT");
  });

  it("treats an unmeasured count as unexplained rather than as none", () => {
    expect(classifyShape({ ...base, processStatus: 1, reportedUnhandledErrors: null })).toBe(
      "RUNNER-LEVEL EXIT (unexplained)",
    );
  });
});
