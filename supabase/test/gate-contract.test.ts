import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  acquireAttempt,
  publishAttempt,
  AttemptRefused,
  readAttemptLock,
  lockProblems,
  isAttemptId,
  GATE_LOCK_PATH,
  gateRecordProblems,
  sanitizedRecord,
  FORBIDDEN_STAGED_FIELDS,
  GATE_IN_PROGRESS,
  isInProgress,
  REQUIRED_GATES,
  GATE_RECORD_PATH,
  readGateRecord,
  type GateRecord,
} from "../../scripts/release/gate-contract";
import { packagingProblems } from "../../scripts/release/build-package";
import { readGateResultsFromDisk } from "../../scripts/release/facts";
import { syntheticGateRecord, greenGateRecord } from "./support/synthetic-gate-record";

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
/**
 * Per-file counts that add up, because the contract now checks the arithmetic.
 */
function evenPerFile(files: number, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 1; i < files; i += 1) out[`suite-${String(i).padStart(2, "0")}.test.ts`] = 1;
  out[`suite-${String(files).padStart(2, "0")}.test.ts`] = total - (files - 1);
  return out;
}

const HEAD = "1111111111111111111111111111111111111111";
const OTHER = "2222222222222222222222222222222222222222";

const cleanProcess = { ok: true, status: 0, signal: null, errorCode: null };

/** A record that should pass, so every failure case differs by one thing. */
/**
 * The green record these cases are calibrated against.
 *
 * STRUCTURE FROM THE SHARED BUILDER, numbers from here. Three files kept their
 * own full copy of a green record, and every field the contract learned to
 * require had to be added to all three; the ones that were missed failed as
 * "the contract is broken" rather than "this fixture is stale". Only the counts
 * this file actually asserts on are stated locally.
 */
function greenRecord(): GateRecord {
  const base = greenGateRecord(HEAD);
  return {
    ...base,
    controlCharacterScan: { scannedFiles: 300, foundCharacters: 0, affectedFiles: [] },
    tests: { passed: 1000, skipped: 2, failed: 0, files: 40, perFile: evenPerFile(40, 1002) },
    testGate: {
      ...base.testGate,
      skippedTests: [
        { suite: "platform.test.ts", title: "skipped on this platform" },
        { suite: "platform.test.ts", title: "also skipped here" },
      ],
    },
    gates: {
      ...base.gates,
      "pnpm test": "1000 passed, 2 skipped, 0 failed / 40 files",
      "raw-NUL scan": "0 in 300 files",
    },
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

/**
 * The contradictions the contract used to accept.
 *
 * Each of these produced a packageable record. None of them is exotic: they are
 * the shapes a partially-written, partially-copied or partially-recorded run
 * actually takes.
 */
describe("every process field fails closed", () => {
  const gateNames = REQUIRED_GATES.filter((g) => g !== "raw-NUL scan");

  it("accepts the green record it is calibrated against", () => {
    expect(gateRecordProblems(greenRecord(), HEAD)).toEqual([]);
  });

  it.each(gateNames)("refuses a non-zero status on %s", (gate) => {
    const r = greenRecord();
    const processes = {
      ...r.processes,
      [gate]: { ok: false, status: 7, signal: null, errorCode: null },
    };
    expect(gateRecordProblems({ ...r, processes }, HEAD).join(" ")).toMatch(/exit status 7/);
  });

  it.each(gateNames)("refuses a terminating signal on %s", (gate) => {
    const r = greenRecord();
    const processes = {
      ...r.processes,
      [gate]: { ok: false, status: null, signal: "SIGKILL", errorCode: null },
    };
    expect(gateRecordProblems({ ...r, processes }, HEAD).join(" ")).toMatch(/signal SIGKILL/);
  });

  it.each(gateNames)("refuses a spawn error on %s", (gate) => {
    const r = greenRecord();
    const processes = {
      ...r.processes,
      [gate]: { ok: false, status: null, signal: null, errorCode: "ENOENT" },
    };
    expect(gateRecordProblems({ ...r, processes }, HEAD).join(" ")).toMatch(/spawn error ENOENT/);
  });

  it.each(["ok", "status", "signal", "errorCode"])(
    "refuses a process with %s missing — absent is not clean",
    (field) => {
      /*
       * This is the exact hole: `signal` and `errorCode` were each compared
       * against BOTH null and undefined, so omitting them read as clean, and
       * `ok` was never consulted at all.
       */
      const r = greenRecord();
      const p: Record<string, unknown> = { ok: true, status: 0, signal: null, errorCode: null };
      delete p[field];
      const processes = { ...r.processes, "pnpm build": p };
      expect(gateRecordProblems({ ...r, processes }, HEAD).join(" ")).toMatch(
        new RegExp(`${field} not recorded`),
      );
    },
  );

  it("refuses ok:false even when the triple looks clean", () => {
    const r = greenRecord();
    const processes = {
      ...r.processes,
      "pnpm lint": { ok: false, status: 0, signal: null, errorCode: null },
    };
    expect(gateRecordProblems({ ...r, processes }, HEAD).join(" ")).toMatch(/ok is false/);
  });
});

describe("the test gate's three copies must agree", () => {
  it("REFUSES THE RECORDED CONTRADICTION: process 0, both testGate copies 1", () => {
    /*
     * The duplicated fields agreed with each other, so the record passed while
     * the process that ran the tests said it had exited 1.
     */
    const r = greenRecord();
    const bad = {
      ...r,
      testGate: { ...r.testGate, ok: false, status: 1, processStatus: 1, reasons: [] },
    };
    const problems = gateRecordProblems(bad, HEAD).join(" ");
    expect(problems).toMatch(/exit status 1/);
    expect(problems).toMatch(/disagrees with the process that ran it/);
  });

  it("refuses when the two testGate triples disagree with each other", () => {
    const r = greenRecord();
    const bad = { ...r, testGate: { ...r.testGate, processStatus: 3 } };
    expect(gateRecordProblems(bad, HEAD).join(" ")).toMatch(/disagree/);
  });

  it("refuses when the test gate disagrees with its spawned process", () => {
    const r = greenRecord();
    const processes = {
      ...r.processes,
      "pnpm test": { ok: true, status: 5, signal: null, errorCode: null },
    };
    expect(gateRecordProblems({ ...r, processes }, HEAD).join(" ")).toMatch(
      /disagrees with the process that ran it/,
    );
  });

  it("refuses when there is no spawned process for the test gate at all", () => {
    const r = greenRecord();
    const processes = { ...r.processes };
    delete (processes as Record<string, unknown>)["pnpm test"];
    expect(gateRecordProblems({ ...r, processes }, HEAD).join(" ")).toMatch(
      /no (process metadata recorded|spawned-process record)/,
    );
  });

  it("refuses a missing or false testGate.ok", () => {
    const r = greenRecord();
    const noOk: Record<string, unknown> = { ...r.testGate };
    delete noOk["ok"];
    expect(gateRecordProblems({ ...r, testGate: noOk }, HEAD).join(" ")).toMatch(/ok not recorded/);
    expect(
      gateRecordProblems({ ...r, testGate: { ...r.testGate, ok: false } }, HEAD).join(" "),
    ).toMatch(/ok is false/);
  });
});

describe("the four-worker bound is part of acceptance", () => {
  it.each([
    ["phase", "phase not recorded"],
    ["workerPool", "workerPool not recorded"],
    ["workerCount", "workerCount not recorded"],
    ["runner", "runner not recorded"],
  ])("refuses a record with %s missing", (field, expected) => {
    const r = greenRecord();
    const t: Record<string, unknown> = { ...r.testGate };
    delete t[field];
    expect(gateRecordProblems({ ...r, testGate: t }, HEAD).join(" ")).toContain(expected);
  });

  it.each([
    ["null workerCount", { workerCount: null }, /workerCount not recorded/],
    ["eight workers", { workerCount: 8 }, /workerCount is 8, not 4/],
    ["one worker", { workerCount: 1 }, /workerCount is 1, not 4/],
    ["a threads pool", { workerPool: "threads" }, /workerPool is "threads"/],
    ["a null pool", { workerPool: null }, /workerPool not recorded/],
    ["the wrong phase", { phase: "build" }, /phase is "build"/],
  ])("refuses %s", (_why, over, expected) => {
    const r = greenRecord();
    expect(
      gateRecordProblems({ ...r, testGate: { ...r.testGate, ...over } }, HEAD).join(" "),
    ).toMatch(expected);
  });

  it.each([
    ["a path", "C:/Users/someone/vitest"],
    ["a sentence", "vitest 3.2.7 (patched by hand)"],
    ["something unbounded", "v".repeat(200)],
  ])("refuses a runner identity that is %s", (_why, runner) => {
    const r = greenRecord();
    expect(
      gateRecordProblems({ ...r, testGate: { ...r.testGate, runner } }, HEAD).join(" "),
    ).toMatch(/runner identity is not a bounded name/);
  });
});

/**
 * The staged record is reconstructed, not forwarded.
 *
 * `sanitizedRecord` used to return `{ head, tests, testGate, … }` — whole nested
 * objects handed straight through. Anything a future runner added inside one of
 * them travelled into the archive unread. The fixtures below inject exactly
 * that, at the top level and into every nested section.
 *
 * Every hostile value is ASSEMBLED AT RUN TIME. A tracked file holding a
 * complete secret-shaped literal is a finding in this repository's own audit,
 * which is how an earlier fixture came to need a history rewrite.
 */
describe("the staged record is reconstructed from an allowlist", () => {
  const hostile = (): Record<string, unknown> => ({
    stdout: "everything the child printed",
    stderr: "and everything it complained about",
    environment: { [["OPENAI", "API", "KEY"].join("_")]: ["sk", "proj", "0".repeat(30)].join("-") },
    message: "expected one value to be another",
    stack: "at Object.anonymous (C:/Users/someone/repo/src/x.ts:12:9)",
    cwd: "C:/Users/someone/repo",
    url: `https://${"tfcchobwobpadenampyh"}.supabase.co/rest/v1/observer`,
    command: `postgres://user:pw${"0".repeat(20)}@db.example.test:5432/postgres`,
  });

  const marker = "everything the child printed";
  const staged = (record: unknown): string => JSON.stringify(sanitizedRecord(record as never));

  it("drops unexpected fields injected at the top level", () => {
    const out = staged({ ...greenRecord(), ...hostile() });
    for (const field of FORBIDDEN_STAGED_FIELDS) expect(out, field).not.toContain(`"${field}"`);
    expect(out).not.toContain(marker);
  });

  it.each(["testGate", "tests", "controlCharacterScan"])(
    "drops unexpected fields injected into %s",
    (section) => {
      const r = greenRecord() as unknown as Record<string, unknown>;
      const out = staged({ ...r, [section]: { ...(r[section] as object), ...hostile() } });
      for (const field of FORBIDDEN_STAGED_FIELDS) expect(out, field).not.toContain(`"${field}"`);
      expect(out).not.toContain(marker);
    },
  );

  it("drops unexpected fields injected into a process entry", () => {
    const r = greenRecord();
    const processes = {
      ...r.processes,
      "pnpm build": { ...(r.processes ?? {})["pnpm build"], ...hostile() },
    };
    const out = staged({ ...r, processes });
    for (const field of FORBIDDEN_STAGED_FIELDS) expect(out, field).not.toContain(`"${field}"`);
    expect(out).not.toContain(marker);
  });

  it("never carries a secret-shaped value, however it is nested", () => {
    const r = greenRecord();
    const out = staged({
      ...r,
      testGate: {
        ...r.testGate,
        ...hostile(),
        sanitizedUnhandledErrorNames: [String(hostile()["url"])],
      },
    });
    expect(out).not.toContain("sk-proj-");
    expect(out).not.toContain("postgres://");
    expect(out).not.toContain("supabase.co");
    expect(out).not.toMatch(/[A-Z]:\//);
  });

  it("refuses a title that is a path or carries a control character", () => {
    const r = greenRecord();
    const out = staged({
      ...r,
      testGate: {
        ...r.testGate,
        skippedTests: [
          { suite: "a.test.ts", title: "C:/Users/someone/repo/a.test.ts" },
          { suite: "a.test.ts", title: `bad${String.fromCharCode(0)}title` },
          { suite: "../escape.test.ts", title: "fine" },
          { suite: "ok.test.ts", title: "kept" },
        ],
      },
    });
    expect(out).toContain("kept");
    expect(out).not.toContain("Users");
    expect(out).not.toContain("escape.test.ts");
    expect(out.includes(String.fromCharCode(0))).toBe(false);
  });

  it("stages only the required process and gate names", () => {
    const r = greenRecord();
    const extra = { ok: true, status: 0, signal: null, errorCode: null };
    const out = JSON.parse(
      staged({
        ...r,
        processes: { ...r.processes, "some other gate": extra },
        gates: { ...r.gates, "some other gate": "clean" },
      }),
    ) as { processes: Record<string, unknown>; gates: Record<string, unknown> };
    expect(Object.keys(out.processes)).not.toContain("some other gate");
    expect(Object.keys(out.gates)).not.toContain("some other gate");
  });

  it("canonicalizes key order, so equal results serialize equally", () => {
    const r = greenRecord();
    const shuffled = {
      ...r,
      gates: Object.fromEntries(Object.entries(r.gates ?? {}).reverse()),
      processes: Object.fromEntries(Object.entries(r.processes ?? {}).reverse()),
    };
    expect(staged(shuffled)).toBe(staged(r));
  });
});

describe("volatile timing is not part of the acceptance evidence", () => {
  it("two clean records differing only in duration stage identically", () => {
    /*
     * The archive claimed byte determinism from the documented two-command
     * rebuild while carrying `durationMs`, which differs on every run. Either
     * the claim goes or the field does; the field is the one nothing depends on.
     */
    const a = greenRecord();
    const b = { ...a, testGate: { ...a.testGate, durationMs: 999_999 } };
    expect(JSON.stringify(sanitizedRecord(b))).toBe(JSON.stringify(sanitizedRecord(a)));
  });

  it("does not stage the duration at all", () => {
    expect(JSON.stringify(sanitizedRecord(greenRecord()))).not.toContain("durationMs");
  });

  it("keeps the duration in the local record, where it is useful", () => {
    expect(greenRecord().testGate?.durationMs).toBeGreaterThan(0);
  });
});

describe("an unfinished attempt is not a packageable record", () => {
  const inProgress = { status: GATE_IN_PROGRESS, head: HEAD } as unknown as GateRecord;

  it("refuses the in-progress marker", () => {
    const problems = gateRecordProblems(inProgress, HEAD);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/started and did not finish/);
    expect(problems[0]).toMatch(/pnpm release:gates/);
  });

  it("refuses it even at the exact HEAD being packaged", () => {
    /*
     * The whole point: the record it replaced was green AT THIS HEAD, so every
     * other check would have passed and the archive would have carried
     * verification evidence from a superseded run.
     */
    expect(gateRecordProblems(inProgress, HEAD)).not.toEqual([]);
  });

  it("recognises the marker for what it is", () => {
    expect(isInProgress(inProgress)).toBe(true);
    expect(isInProgress(greenRecord())).toBe(false);
    expect(isInProgress(null)).toBe(false);
  });
});

describe("the verdict string must be the canonical rendering", () => {
  it.each([
    ["BROKEN", "BROKEN"],
    ["8 FOUND", "8 FOUND"],
    [
      "a clean-looking sentence with the wrong numbers",
      "999 passed, 0 skipped, 0 failed / 1 files",
    ],
    ["a plausible near-miss", "1000 passed, 2 skipped, 0 failed / 41 files"],
  ])("refuses the pnpm test verdict %s", (_why, verdict) => {
    const r = greenRecord();
    const problems = gateRecordProblems(
      { ...r, gates: { ...r.gates, "pnpm test": verdict } },
      HEAD,
    );
    expect(problems.join(" ")).toMatch(/not the canonical rendering/);
  });

  it("refuses totals whose per-file counts do not add up", () => {
    const r = greenRecord();
    const bad = { ...r, tests: { ...r.tests, perFile: { "one.test.ts": 3 } } };
    const problems = gateRecordProblems(bad, HEAD).join(" ");
    expect(problems).toMatch(/perFile has 1 entries but tests.files is 40/);
    expect(problems).toMatch(/perFile sums to 3, not 1002/);
  });

  it("refuses a zero-failure claim contradicted by any single field", () => {
    for (const over of [
      { reportSuccess: false },
      { reportedFailedTests: 2 },
      { countedFailedTests: 1 },
      { reportedFailedSuites: 1 },
      { runtimeErrorSuites: 1 },
      { failedSuiteNames: ["a.test.ts"] },
      { reportedUnhandledErrors: 1 },
    ]) {
      const r = greenRecord();
      expect(
        gateRecordProblems({ ...r, testGate: { ...r.testGate, ...over } }, HEAD),
        JSON.stringify(over),
      ).not.toEqual([]);
    }
  });

  it("refuses identity counts that disagree with the totals", () => {
    const r = greenRecord();
    const bad = { ...r, testGate: { ...r.testGate, skippedTests: [] } };
    expect(gateRecordProblems(bad, HEAD).join(" ")).toMatch(
      /0 skipped-test identities for 2 skipped tests/,
    );
  });

  it("refuses duplicate identities", () => {
    const r = greenRecord();
    const dup = { suite: "a.test.ts", title: "same" };
    const bad = { ...r, testGate: { ...r.testGate, skippedTests: [dup, dup] } };
    expect(gateRecordProblems(bad, HEAD).join(" ")).toMatch(/duplicate skipped identity/);
  });

  it("refuses an unsafe per-file label", () => {
    const r = greenRecord();
    const perFile = { ...(r.tests?.perFile ?? {}), "C:/Users/someone/a.test.ts": 1 };
    expect(gateRecordProblems({ ...r, tests: { ...r.tests, perFile } }, HEAD).join(" ")).toMatch(
      /unsafe label/,
    );
  });
});

/**
 * A gate attempt that never finished must not leave a packageable record.
 *
 * `run-gates.ts` wrote once, at the very end. A run that crashed, was killed,
 * or was interrupted therefore left the PREVIOUS record untouched — and if that
 * record was green at the same HEAD, the packager took it. The archive would
 * then carry verification evidence from a run that had been superseded by one
 * nobody saw finish.
 *
 * The sequence below is the whole claim, end to end and on disk: a green record
 * exists, an attempt begins, the attempt dies, packaging refuses — at the same
 * HEAD, where every other check would have passed.
 */
describe("an aborted attempt invalidates the record it replaced", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-abort-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const recordPath = (root: string): string => join(root, ".release", "gate-results.json");

  /** A root holding a green record for `head`, exactly as the runner leaves it. */
  function rootWithGreenRecord(head: string): string {
    const root = mkdtempSync(join(scratch, "root-"));
    syntheticGateRecord(root, head);
    return root;
  }

  it("starts from a record that genuinely packages", () => {
    const head = "4444444444444444444444444444444444444444";
    const root = rootWithGreenRecord(head);
    expect(gateRecordProblems(readGateRecord(root), head)).toEqual([]);
  });

  it("refuses once an attempt has begun and not finished", () => {
    const head = "4444444444444444444444444444444444444444";
    const root = rootWithGreenRecord(head);
    expect(gateRecordProblems(readGateRecord(root), head)).toEqual([]);

    /*
     * What `beginAttempt` writes, synchronously, before the first gate runs.
     * Nothing else happens: this IS the aborted attempt.
     */
    writeFileSync(
      recordPath(root),
      `${JSON.stringify({ status: GATE_IN_PROGRESS, head, startedAt: "2026-08-27T00:00:00.000Z" }, null, 2)}\n`,
      "utf8",
    );

    const problems = gateRecordProblems(readGateRecord(root), head);
    expect(problems).not.toEqual([]);
    expect(problems.join(" ")).toMatch(/started and did not finish/);
  });

  it("refuses through the packager's own precondition, not just the contract", () => {
    const head = "4444444444444444444444444444444444444444";
    const root = rootWithGreenRecord(head);
    writeFileSync(
      recordPath(root),
      `${JSON.stringify({ status: GATE_IN_PROGRESS, head }, null, 2)}\n`,
      "utf8",
    );
    const problems = packagingProblems({
      head,
      expectedHead: undefined,
      dirty: [],
      gateProblems: gateRecordProblems(readGateRecord(root), head),
      lockProblems: [],
    });
    expect(problems.join(" ")).toMatch(/gate record is not current and clean/);
    expect(problems.join(" ")).toMatch(/started and did not finish/);
  });

  it("leaves no half-written record where the canonical one belongs", () => {
    /*
     * The finished record is built at a pending path and RENAMED into place, so
     * a process that dies mid-write leaves a truncated file BESIDE the record
     * rather than in place of it. Observed, not read off the source: the
     * canonical path keeps the previous bytes until the rename happens.
     */
    const root = mkdtempSync(join(tmpdir(), "observer-atomic-"));
    const id = acquireAttempt(root, HEAD);
    mkdirSync(join(root, ".release"), { recursive: true });
    const canonical = join(root, GATE_RECORD_PATH);
    writeFileSync(canonical, '{"before":true}', "utf8");
    writeFileSync(`${canonical}.pending`, '{"truncated', "utf8");
    expect(readFileSync(canonical, "utf8")).toBe('{"before":true}');
    publishAttempt(root, id);
    expect(readFileSync(canonical, "utf8")).toBe('{"truncated');
    /* And a file that does not parse reads as no record at all. */
    expect(readGateRecord(root)).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it("invalidates the canonical record before the first gate, not after", () => {
    const source = readFileSync(join(ROOT, "scripts/release/run-gates.ts"), "utf8");
    const acquire = source.indexOf("acquireAttempt(REPO_ROOT, head)");
    const begin = source.indexOf("beginAttempt(head, attemptId)");
    const firstGate = source.indexOf('record("pnpm format:check"');
    expect(acquire).toBeGreaterThan(0);
    /* Ownership first, so a runner that loses the race destroys nothing. */
    expect(begin).toBeGreaterThan(acquire);
    expect(firstGate).toBeGreaterThan(begin);
    /* And publication goes through the owner check, never a bare rename. */
    expect(source).toContain("publishAttempt(REPO_ROOT, attemptId)");
    expect(source).not.toMatch(/renameSync\(/);
  });

  it("does not erase separately preserved historical failure evidence", () => {
    /*
     * Invalidating the CANONICAL result is not the same as destroying history.
     * `beginAttempt` touches one path and the pending file beside it, and
     * nothing that carries a preserved failure.
     */
    const source = readFileSync(join(ROOT, "scripts/release/run-gates.ts"), "utf8");
    const body = /function beginAttempt[\s\S]*?\n}/.exec(source)?.[0] ?? "";
    expect(body).toContain("RECORD_PATH");
    expect(body).toMatch(/rmSync\(PENDING_PATH/);
    /*
     * No RECURSIVE removal — the only `recursive` in this function is the
     * `mkdirSync` that creates the directory — and nothing aimed at the
     * directory itself.
     */
    const removals = body.match(/rmSync\([^;]*\);/g) ?? [];
    expect(removals).toHaveLength(1);
    expect(removals[0]).toContain("PENDING_PATH");
    expect(removals[0]).not.toContain("recursive");
    expect(body).not.toMatch(/rmSync\(\s*join\(REPO_ROOT, "\.release"\)/);
  });
});

/**
 * Rendering must survive the runner's own invalidation window.
 *
 * The gate runner marks the canonical record invalid before its first gate, so
 * while the TEST gate runs the file holds a marker rather than a record — and
 * the test gate is exactly when the suites that render this evidence execute.
 * Reading the marker as a result made every rendering throw on its missing
 * `tests`, which is how one correction produced four failed assertions and
 * three failed suites in an authoritative run.
 */
describe("the evidence renderer tolerates an attempt in progress", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-render-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  /*
   * BEHAVIOUR, NOT SOURCE TEXT. These used to grep this function's body for
   * patterns, which proves what the source says and not what the reader does —
   * and the defect they guard against cost an authoritative gate run. Each now
   * writes the shape into a temporary root and reads the answer back.
   */
  const rootHolding = (body: string): string => {
    const root = mkdtempSync(join(scratch, "root-"));
    mkdirSync(join(root, ".release"), { recursive: true });
    writeFileSync(join(root, ".release", "gate-results.json"), body, "utf8");
    return root;
  };

  it("treats the in-progress marker as no result rather than a broken one", () => {
    const marker = { status: GATE_IN_PROGRESS, head: HEAD, startedAt: "2026-08-27T00:00:00.000Z" };
    expect(readGateResultsFromDisk(rootHolding(JSON.stringify(marker)))).toBeNull();
  });

  it("treats a record with no totals as no result", () => {
    expect(readGateResultsFromDisk(rootHolding(JSON.stringify({ head: HEAD })))).toBeNull();
    const noPerFile = { head: HEAD, tests: { total: 1, passed: 1 } };
    expect(readGateResultsFromDisk(rootHolding(JSON.stringify(noPerFile)))).toBeNull();
  });

  it("does not let a malformed file throw out of the reader", () => {
    expect(readGateResultsFromDisk(rootHolding("{ this is not json"))).toBeNull();
    expect(readGateResultsFromDisk(rootHolding(""))).toBeNull();
  });

  it("answers null when there is no record at all, rather than throwing", () => {
    expect(readGateResultsFromDisk(mkdtempSync(join(scratch, "empty-")))).toBeNull();
  });

  it("still returns a well-formed record, so the guards are not blanket refusal", () => {
    const record = {
      head: HEAD,
      tests: { total: 3, passed: 3, skipped: 0, failed: 0, files: 1, perFile: { "a.test.ts": 3 } },
    };
    const read = readGateResultsFromDisk(rootHolding(JSON.stringify(record)));
    expect(read).not.toBeNull();
    expect(read?.tests.passed).toBe(3);
  });
});

/**
 * ONE ATTEMPT AT A TIME, AND ONLY THE OWNER PUBLISHES.
 *
 * The in-progress marker said an attempt was running and nothing about WHOSE.
 * Two runners could each write it, each run the whole suite, and each rename
 * its own result into place — the second publishing measurements of a tree the
 * first had already measured differently, with nothing on disk to show that it
 * had happened. The archive would carry whichever finished last.
 *
 * Every case below drives the real functions against a real temporary root.
 * None of them touches this repository's own `.release/` directory.
 */
describe("the gate admits one attempt at a time", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-lock-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const freshRoot = (): string => mkdtempSync(join(scratch, "root-"));
  const lockFile = (root: string): string => join(root, GATE_LOCK_PATH);
  const pendingFile = (root: string): string => `${join(root, GATE_RECORD_PATH)}.pending`;

  it("gives the gate to the first attempt and refuses the second", () => {
    const root = freshRoot();
    const first = acquireAttempt(root, HEAD);
    expect(isAttemptId(first)).toBe(true);
    expect(() => acquireAttempt(root, HEAD)).toThrow(AttemptRefused);
  });

  it("tells the refused attempt who holds the gate, and leaves the lock alone", () => {
    const root = freshRoot();
    const holder = acquireAttempt(root, HEAD);
    let message = "";
    try {
      acquireAttempt(root, HEAD);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(holder);
    expect(message).toContain(GATE_LOCK_PATH);
    /* The loser must not clear the winner lock on its way out. */
    expect(readAttemptLock(root)?.attemptId).toBe(holder);
  });

  it("issues a different id to every attempt", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 25; i += 1) ids.add(acquireAttempt(freshRoot(), HEAD));
    expect(ids.size).toBe(25);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("refuses an attempt id that is not the bounded shape", () => {
    for (const bad of ["", "short", "g".repeat(16), "0".repeat(17), "A".repeat(16)]) {
      expect(() => acquireAttempt(freshRoot(), HEAD, bad)).toThrow(AttemptRefused);
    }
  });

  it("treats an abruptly terminated attempt as still holding the gate", () => {
    /*
     * FAIL CLOSED. A killed runner leaves its lock behind, and there is no age
     * at which this process may assume the other one is gone — it cannot see
     * it. The next attempt refuses until a human decides and deletes the file.
     */
    const root = freshRoot();
    acquireAttempt(root, HEAD);
    expect(() => acquireAttempt(root, HEAD)).toThrow(AttemptRefused);
    rmSync(lockFile(root), { force: true });
    expect(isAttemptId(acquireAttempt(root, HEAD))).toBe(true);
  });

  it("treats an unreadable lock as held rather than absent", () => {
    const root = freshRoot();
    mkdirSync(join(root, ".release"), { recursive: true });
    writeFileSync(lockFile(root), "{ half written", "utf8");
    expect(lockProblems(readAttemptLock(root))).not.toEqual([]);
    expect(() => acquireAttempt(root, HEAD)).toThrow(AttemptRefused);
  });

  it("reports a free gate as free", () => {
    expect(lockProblems(readAttemptLock(freshRoot()))).toEqual([]);
  });

  it("refuses to package while an attempt holds the gate", () => {
    const root = freshRoot();
    syntheticGateRecord(root, HEAD);
    /* Green, current and clean — and still not packageable, because of the lock. */
    expect(gateRecordProblems(readGateRecord(root), HEAD)).toEqual([]);
    acquireAttempt(root, HEAD);
    const problems = packagingProblems({
      head: HEAD,
      expectedHead: undefined,
      dirty: [],
      gateProblems: gateRecordProblems(readGateRecord(root), HEAD),
      lockProblems: lockProblems(readAttemptLock(root)),
    });
    expect(problems.join(" ")).toMatch(/holds the gate/);
  });

  it("packages again once the gate is free", () => {
    const root = freshRoot();
    syntheticGateRecord(root, HEAD);
    acquireAttempt(root, HEAD);
    rmSync(lockFile(root), { force: true });
    expect(
      packagingProblems({
        head: HEAD,
        expectedHead: undefined,
        dirty: [],
        gateProblems: gateRecordProblems(readGateRecord(root), HEAD),
        lockProblems: lockProblems(readAttemptLock(root)),
      }),
    ).toEqual([]);
  });

  it("lets the owning attempt publish, and frees the gate afterwards", () => {
    const root = freshRoot();
    const id = acquireAttempt(root, HEAD);
    mkdirSync(join(root, ".release"), { recursive: true });
    writeFileSync(pendingFile(root), JSON.stringify({ attemptId: id, head: HEAD }), "utf8");
    publishAttempt(root, id);
    expect((readGateRecord(root) as { attemptId?: string } | null)?.attemptId).toBe(id);
    expect(existsSync(pendingFile(root))).toBe(false);
    expect(readAttemptLock(root)).toBeNull();
    /* And the gate is genuinely free, not merely reported free. */
    expect(isAttemptId(acquireAttempt(root, HEAD))).toBe(true);
  });

  it("refuses a publication from an attempt that no longer holds the gate", () => {
    /*
     * A ran for minutes; somebody deleted its lock and started B. The result A
     * is holding describes a tree B has since re-measured, so A discards it
     * rather than renaming it over the gate B owns.
     */
    const root = freshRoot();
    const a = acquireAttempt(root, HEAD);
    rmSync(lockFile(root), { force: true });
    const b = acquireAttempt(root, HEAD);
    expect(b).not.toBe(a);
    writeFileSync(pendingFile(root), JSON.stringify({ attemptId: a, head: HEAD }), "utf8");
    expect(() => publishAttempt(root, a)).toThrow(AttemptRefused);
    /* Discarded, not left lying around for the next run to publish. */
    expect(existsSync(pendingFile(root))).toBe(false);
    expect(existsSync(join(root, GATE_RECORD_PATH))).toBe(false);
    expect(readAttemptLock(root)?.attemptId).toBe(b);
  });

  it("refuses a publication when no attempt holds the gate at all", () => {
    const root = freshRoot();
    const id = acquireAttempt(root, HEAD);
    rmSync(lockFile(root), { force: true });
    writeFileSync(pendingFile(root), JSON.stringify({ attemptId: id, head: HEAD }), "utf8");
    expect(() => publishAttempt(root, id)).toThrow(AttemptRefused);
  });

  it("does not let an old green record survive beside a newer attempt", () => {
    /*
     * An old green record, a marker, and a newer `.pending` beside it is
     * exactly what an interrupted attempt leaves. The pending file is not the
     * record and nothing reads it; the marker is what the packager sees.
     */
    const root = freshRoot();
    syntheticGateRecord(root, HEAD);
    const id = acquireAttempt(root, HEAD);
    writeFileSync(
      join(root, GATE_RECORD_PATH),
      `${JSON.stringify({ status: GATE_IN_PROGRESS, attemptId: id, head: HEAD })}\n`,
      "utf8",
    );
    writeFileSync(pendingFile(root), JSON.stringify({ attemptId: id, head: HEAD }), "utf8");
    const problems = gateRecordProblems(readGateRecord(root), HEAD);
    expect(problems.join(" ")).toMatch(/started and did not finish/);
    expect(problems.join(" ")).toContain(id);
  });

  it("refuses a finished record that does not name its attempt", () => {
    const anonymous = { ...greenRecord() } as Record<string, unknown>;
    delete anonymous["attemptId"];
    expect(gateRecordProblems(anonymous as GateRecord, HEAD).join(" ")).toMatch(
      /does not name the attempt/,
    );
    for (const bad of ["", "nope", 16, null, {}]) {
      const record = { ...greenRecord(), attemptId: bad } as unknown as GateRecord;
      expect(gateRecordProblems(record, HEAD).join(" ")).toMatch(/does not name the attempt/);
    }
  });

  it("carries the attempt id into the staged projection, which must pass too", () => {
    const staged = sanitizedRecord(greenRecord()) as { attemptId?: unknown };
    expect(staged.attemptId).toBe("00112233445566aa");
    expect(gateRecordProblems(staged as GateRecord, HEAD)).toEqual([]);
  });
});
