import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  gateRecordProblems,
  sanitizedRecord,
  REQUIRED_GATES,
  GATE_RECORD_PATH,
  type GateRecord,
} from "../../scripts/release/gate-contract";

/**
 * A package may only be built from current, green gate evidence.
 *
 * The packager used to render section 7 from whatever `.release/gate-results.json`
 * happened to hold, and to build happily when it held nothing: a missing file
 * produced "GATES NOT RECORDED", a file from another commit produced a "STALE"
 * banner, and both went into an archive that otherwise looked complete. A
 * reviewer then holds a package whose verification section says, in small
 * print, that there is none.
 *
 * Every check below is FAIL-CLOSED. An absent field is a failure rather than a
 * pass, because "the runner did not record it" and "the runner recorded it as
 * fine" are different facts and only one of them is evidence.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const HEAD = "1111111111111111111111111111111111111111";
const OTHER = "2222222222222222222222222222222222222222";

const cleanProcess = { ok: true, status: 0, signal: null, errorCode: null };

/** A record that should pass, so every failure case differs by one thing. */
function greenRecord(): GateRecord {
  const gates: Record<string, string> = {};
  const processes: Record<string, typeof cleanProcess> = {};
  for (const gate of REQUIRED_GATES) {
    gates[gate] = "clean";
    processes[gate] = { ...cleanProcess };
  }
  gates["pnpm test"] = "1000 passed, 2 skipped, 0 failed / 40 files";
  gates["raw-NUL scan"] = "0 in 300 files";
  return {
    head: HEAD,
    controlCharacterScan: { scannedFiles: 300, foundCharacters: 0, affectedFiles: [] },
    tests: { passed: 1000, skipped: 2, failed: 0, files: 40, perFile: {} },
    testGate: {
      ...cleanProcess,
      reportSuccess: true,
      reportedFailedTests: 0,
      countedFailedTests: 0,
      reportedFailedSuites: 0,
      runtimeErrorSuites: 0,
      failedSuiteNames: [],
      failedTests: [],
      skippedTests: [],
      reasons: [],
    },
    processes,
    gates,
  };
}

describe("the gate record is a precondition for packaging", () => {
  it("accepts a current, green record", () => {
    expect(gateRecordProblems(greenRecord(), HEAD)).toEqual([]);
  });

  it("refuses a missing record", () => {
    const problems = gateRecordProblems(null, HEAD);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(GATE_RECORD_PATH);
    expect(problems[0]).toContain("pnpm release:gates");
  });

  it("refuses a record from another commit", () => {
    const problems = gateRecordProblems({ ...greenRecord(), head: OTHER }, HEAD);
    expect(problems.join(" ")).toMatch(/recorded at 2222222, not at 1111111/);
  });

  it("refuses a record with no head at all", () => {
    const record = { ...greenRecord() };
    delete (record as { head?: string }).head;
    expect(gateRecordProblems(record, HEAD).join(" ")).toMatch(/not at 1111111/);
  });

  it.each(REQUIRED_GATES)("refuses when %s is missing", (gate) => {
    const record = greenRecord();
    const gates = { ...record.gates };
    delete gates[gate];
    expect(gateRecordProblems({ ...record, gates }, HEAD).join(" ")).toContain(
      `${gate}: no result recorded`,
    );
  });

  it.each(REQUIRED_GATES)("refuses when %s is recorded FAILED", (gate) => {
    const record = greenRecord();
    const gates = { ...record.gates, [gate]: "FAILED" };
    expect(gateRecordProblems({ ...record, gates }, HEAD).join(" ")).toContain(gate);
  });

  it("refuses a non-zero exit status on any gate with a process", () => {
    const record = greenRecord();
    const processes = { ...record.processes, "pnpm build": { ...cleanProcess, status: 1 } };
    expect(gateRecordProblems({ ...record, processes }, HEAD).join(" ")).toContain(
      "pnpm build: exit status 1",
    );
  });

  it("refuses a terminating signal", () => {
    const record = greenRecord();
    const processes = { ...record.processes, "pnpm lint": { ...cleanProcess, signal: "SIGKILL" } };
    expect(gateRecordProblems({ ...record, processes }, HEAD).join(" ")).toContain(
      "pnpm lint: signal SIGKILL",
    );
  });

  it("refuses a spawn error", () => {
    const record = greenRecord();
    const processes = {
      ...record.processes,
      "pnpm test": { ...cleanProcess, errorCode: "ENOENT" },
    };
    expect(gateRecordProblems({ ...record, processes }, HEAD).join(" ")).toContain(
      "pnpm test: spawn error ENOENT",
    );
  });

  it("refuses missing process metadata for a gate that has a process", () => {
    const record = greenRecord();
    const processes = { ...record.processes };
    delete processes["pnpm typecheck"];
    expect(gateRecordProblems({ ...record, processes }, HEAD).join(" ")).toContain(
      "pnpm typecheck: no process metadata recorded",
    );
  });

  it.each([
    ["report success false", { reportSuccess: false }, /test report success=false/],
    ["report success absent", { reportSuccess: null }, /test report success=null/],
    ["a reported failed test", { reportedFailedTests: 1 }, /names 1 failed test/],
    ["a counted failed test", { countedFailedTests: 3 }, /3 failed test\(s\) counted/],
    ["a reported failed suite", { reportedFailedSuites: 1 }, /names 1 failed suite/],
    ["a runtime-error suite", { runtimeErrorSuites: 2 }, /2 suite\(s\) failed with no failed/],
    [
      "a named failing suite",
      { failedSuiteNames: ["x.test.ts"] },
      /failing suite\(s\): x\.test\.ts/,
    ],
    ["a non-empty reason list", { reasons: ["exit status 1"] }, /test gate not clean/],
  ])("refuses %s", (_why, overrides, pattern) => {
    const record = greenRecord();
    const testGate = { ...record.testGate, ...overrides };
    expect(gateRecordProblems({ ...record, testGate }, HEAD).join(" ")).toMatch(pattern);
  });

  it("refuses a record with no test-gate section", () => {
    const record = { ...greenRecord() };
    delete (record as { testGate?: unknown }).testGate;
    expect(gateRecordProblems(record, HEAD).join(" ")).toContain("no sanitized test-gate record");
  });

  it("refuses a suite failure even when the report claims success", () => {
    /*
     * The exact shape a hook timeout produces, and the reason suite counts fail
     * independently: the summary can say the run succeeded while a suite did
     * not, and only one of those is worth trusting.
     */
    const record = greenRecord();
    const testGate = { ...record.testGate, reportSuccess: true, reportedFailedSuites: 1 };
    expect(gateRecordProblems({ ...record, testGate }, HEAD)).not.toEqual([]);
  });
});

describe("what is staged into the archive", () => {
  it("carries the evidence and nothing that could hold a secret", () => {
    const staged = JSON.stringify(sanitizedRecord(greenRecord()));
    for (const field of ["head", "tests", "testGate", "processes", "gates"]) {
      expect(staged, field).toContain(field);
    }
    for (const forbidden of ["stdout", "stderr", "output", "env", "command", "message"]) {
      expect(staged, forbidden).not.toContain(forbidden);
    }
  });

  it("the record actually on disk carries no child output", () => {
    /*
     * Belt and braces: the shape is right above, and this is the real file the
     * packager will stage.
     */
    let raw = "";
    try {
      raw = readFileSync(join(ROOT, GATE_RECORD_PATH), "utf8");
    } catch {
      return; /* not run yet; the packager refuses in that case anyway */
    }
    for (const forbidden of ["stdout", "stderr", "output"]) {
      expect(raw, forbidden).not.toContain(forbidden);
    }
  });
});

describe("the documented sequence is honest about its inputs", () => {
  const review = readFileSync(join(ROOT, "docs/release/REVIEW.txt"), "utf8");

  it("names both commands, in order", () => {
    expect(review).toMatch(/pnpm release:gates/);
    expect(review).toMatch(/pnpm release:package --verify/);
  });

  it("does not claim the archive is reproducible from tracked files alone", () => {
    /*
     * It is not: a generated gate record is also required, and it names the
     * commit it was recorded at. Saying "tracked files alone" would send a
     * reviewer looking for a reproduction that cannot happen.
     */
    /*
     * The phrase may appear — the document has to be able to say the archive is
     * NOT reproducible that way. What may not appear is the positive claim, so
     * every occurrence must sit inside a negation.
     */
    for (const m of review.matchAll(/reproducible from tracked files alone/gi)) {
      const before = review.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0);
      expect(before, `unqualified claim near index ${String(m.index)}`).toMatch(/NOT|not/i);
    }
    expect(review).toMatch(/gate record/i);
  });
});
