import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runProcess,
  sanitize,
  classifyTestGate,
  describe as describeGate,
  NO_REPORT,
  type ProcessResult,
  type ReportSummary,
} from "../../scripts/release/gate-run";

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

const clean: ProcessResult = { ok: true, status: 0, signal: null, errorCode: null };
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

  it.runIf(process.platform !== "win32")("records termination by signal", () => {
    /*
     * POSIX only. Windows has no signal delivery in the sense `spawnSync`
     * reports, so asserting it there would be asserting the harness rather than
     * the runner — and this suite runs on Windows.
     */
    const r = runProcess(node, ["-e", "process.kill(process.pid, 'SIGTERM')"], { cwd: ROOT });
    expect(r.ok).toBe(false);
    expect(r.signal).toBe("SIGTERM");
  });

  it("keeps the child's output beside the result, not inside it", () => {
    const r = runProcess(node, ["-e", "console.log('observer-fixture-marker')"], { cwd: ROOT });
    expect(r.output).toContain("observer-fixture-marker");
    expect(Object.keys(sanitize(r)).sort()).toEqual(["errorCode", "ok", "signal", "status"]);
  });
});

describe("classifyTestGate fails closed", () => {
  it("passes only when the process and the report both agree", () => {
    expect(classifyTestGate(clean, passing).reasons).toEqual([]);
  });

  it("fails on a non-zero exit even when the report says success", () => {
    /* Exactly the intermittent case this refactor exists to make visible. */
    const r = classifyTestGate({ ...clean, ok: false, status: 1 }, passing);
    expect(r.reasons).toContain("exit status 1");
  });

  it("fails on a signal even when the report says success", () => {
    const r = classifyTestGate({ ...clean, ok: false, status: null, signal: "SIGKILL" }, passing);
    expect(r.reasons).toContain("terminated by signal SIGKILL");
  });

  it("fails on a spawn error", () => {
    const r = classifyTestGate({ ...clean, ok: false, errorCode: "EINVAL" }, passing);
    expect(r.reasons).toContain("process error EINVAL");
  });

  it("fails when no readable report was produced", () => {
    const r = classifyTestGate(clean, NO_REPORT);
    expect(r.reasons).toContain("no readable JSON report");
  });

  it("fails when the process succeeds but the report declares failure", () => {
    const r = classifyTestGate(clean, { ...passing, reportSuccess: false });
    expect(r.reasons).toContain("report declares failure");
  });

  it("fails on a reported failed test", () => {
    const r = classifyTestGate(clean, { ...passing, reportedFailedTests: 2 });
    expect(r.reasons).toContain("report names 2 failed test(s)");
  });

  it("fails on a counted failed test even when the summary says none", () => {
    /*
     * Two independent counts, because a summary field and the assertion results
     * are two claims, and this release has already been bitten once by trusting
     * one of a pair.
     */
    const r = classifyTestGate(clean, { ...passing, countedFailedTests: 1 });
    expect(r.reasons).toContain("1 failed test(s) counted from results");
  });

  it("reports every reason, not the first", () => {
    const r = classifyTestGate(
      { ok: false, status: 7, signal: null, errorCode: null },
      { ...passing, reportSuccess: false, reportedFailedTests: 4, countedFailedTests: 4 },
    );
    expect(r.reasons).toHaveLength(4);
  });

  it("carries the process and report metadata through to the result", () => {
    const r = classifyTestGate({ ok: false, status: 9, signal: null, errorCode: null }, passing);
    expect(r.status).toBe(9);
    expect(r.reportSuccess).toBe(true);
    expect(describeGate(r)).toContain("status=9");
    expect(describeGate(r)).toContain("reportSuccess=true");
  });
});

describe("nothing that could carry a secret is persisted", () => {
  const path = join(ROOT, ".release", "gate-results.json");

  it("the sanitized shape has no output fields", () => {
    const r = runProcess(node, ["-e", "console.log('x')"], { cwd: ROOT });
    const persisted = JSON.stringify(sanitize(r));
    expect(persisted).not.toContain("stdout");
    expect(persisted).not.toContain("stderr");
    expect(persisted).not.toContain("output");
  });

  it.runIf(existsSync(join(ROOT, ".release", "gate-results.json")))(
    "the recorded gate results carry metadata and no child output",
    () => {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw) as { testGate?: Record<string, unknown> };
      /* The evidence is there… */
      expect(parsed.testGate).toBeDefined();
      for (const field of [
        "ok",
        "status",
        "signal",
        "errorCode",
        "reportSuccess",
        "reportedFailedTests",
        "countedFailedTests",
      ]) {
        expect(parsed.testGate, field).toHaveProperty(field);
      }
      /* …and the output is not. */
      for (const forbidden of ["stdout", "stderr", "output"]) {
        expect(raw, forbidden).not.toContain(forbidden);
      }
    },
  );

  it("a failing gate stays failing however often it is classified", () => {
    /*
     * The property that matters: no amount of re-asking turns an observed
     * failure into a clean result. Asserted by asking repeatedly, because a
     * retry loop is how an intermittent fault becomes an invisible one.
     */
    const failing: ProcessResult = { ok: false, status: 1, signal: null, errorCode: null };
    for (let i = 0; i < 50; i += 1) {
      expect(classifyTestGate(failing, passing).reasons).toEqual(["exit status 1"]);
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
    const r = classifyTestGate(clean, {
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
    const r = classifyTestGate(clean, { ...passing, runtimeErrorSuites: 2 });
    expect(r.reasons.join(" ")).toMatch(/2 suite\(s\) failed with no failed assertion/);
  });

  it("fails on a non-zero failed-suite count even when the report claims success", () => {
    /*
     * Independent of `reportSuccess`, and deliberately: the summary can say the
     * run succeeded while a suite did not, and only one of those is worth
     * trusting.
     */
    const r = classifyTestGate(clean, { ...passing, reportSuccess: true, reportedFailedSuites: 1 });
    expect(r.reasons).not.toEqual([]);
  });

  it("names the failing suites, by basename only", () => {
    const r = classifyTestGate(clean, {
      ...passing,
      failedSuiteNames: ["package-generation.test.ts"],
    });
    expect(r.reasons.join(" ")).toContain("package-generation.test.ts");
    /* A basename, never a path — a path is machine-identifying detail. */
    expect(r.reasons.join(" ")).not.toMatch(/[\/]/);
  });

  it("still fails on a non-zero exit with a wholly successful report", () => {
    /* The observation that remains unresolved. It must not read as clean. */
    const r = classifyTestGate({ ...clean, ok: false, status: 1 }, passing);
    expect(r.reasons).toEqual(["exit status 1"]);
  });

  it("carries the suite fields into the one-line summary", () => {
    const line = describeGate(
      classifyTestGate(clean, {
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
    const r = classifyTestGate(
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
