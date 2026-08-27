/**
 * What a gate record has to contain before a package may be built from it.
 *
 * The packager used to render section 7 from whatever `.release/gate-results.json`
 * happened to hold, and to build happily when it held nothing at all: a missing
 * file produced "GATES NOT RECORDED", a file from another commit produced a
 * "STALE" banner, and both went into an archive that otherwise looked complete.
 * A reviewer receiving that archive has a package whose verification evidence
 * says, in small print, that there is none.
 *
 * So the record is now a precondition rather than a decoration. It must exist,
 * name the exact HEAD being packaged, and be clean on every required gate —
 * process status, signal, spawn error, report verdict, failed tests, failed
 * suites and runtime-error suites, each checked independently.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scanProblems, describeScan, type ControlCharacterScan } from "./control-chars";

/**
 * The gate whose result is a measurement rather than a verdict.
 *
 * It has no child process of its own — the runner scans in-process — so it is
 * exempt from the process checks and subject to the structured ones instead.
 */
export const CONTROL_CHARACTER_GATE = "raw-NUL scan";

/**
 * The conditions a green record must have been produced under.
 *
 * Four workers is a measured number, not a preference: the runner-level exit
 * was reproduced under the pool's default sizing, and the bounded matrix put
 * every four-worker run's parent stall far below every default run's. Naming
 * the numbers here means a record from an unbounded run cannot be packaged as
 * evidence for a bounded one.
 */
export const REQUIRED_PHASE = "test";
export const REQUIRED_POOL = "forks";
export const REQUIRED_WORKERS = 4;

/** `vitest 3.2.7` — a bounded name and a version, and nothing else. */
const RUNNER_IDENTITY = /^[a-z][a-z0-9-]{0,23} [0-9]{1,3}(\.[0-9]{1,4}){0,3}$/;

/**
 * Every gate that must have run, under the key the runner records it as.
 *
 * Named here rather than inferred from whatever the record contains, because a
 * gate that silently stopped being run would otherwise silently stop being
 * required.
 */
export const REQUIRED_GATES: readonly string[] = [
  "pnpm format:check",
  "pnpm typecheck",
  "pnpm lint",
  "pnpm test",
  "pnpm build",
  "secret audit",
  "raw-NUL scan",
  "wrappers vs sources",
];

export interface RecordedProcess {
  readonly ok?: boolean;
  readonly status?: number | null;
  readonly signal?: string | null;
  readonly errorCode?: string | null;
}

export interface RecordedTestGate extends RecordedProcess {
  readonly reportSuccess?: boolean | null;
  readonly reportedFailedTests?: number | null;
  readonly countedFailedTests?: number | null;
  readonly reportedFailedSuites?: number | null;
  readonly runtimeErrorSuites?: number | null;
  readonly failedSuiteNames?: readonly string[];
  /** Identities of the failing tests. Must be present, and must be empty. */
  readonly failedTests?: readonly { readonly suite: string; readonly title: string }[];
  /**
   * Identities of the skipped tests. Present so a changed skip COUNT can be
   * explained rather than noticed; not required to be empty, because skipping
   * a platform-specific test is correct behaviour.
   */
  readonly skippedTests?: readonly { readonly suite: string; readonly title: string }[];
  /*
   * RUNNER-LEVEL EVIDENCE, required.
   *
   * Vitest 3.2.7 sets exit code 1 when its unhandled-error list is non-empty,
   * and its JSON reporter discards that list and computes `success` without
   * it. Every field above can therefore say the run was clean while the
   * process says it failed — which is the record this contract could not
   * explain at `7d941ba`. Absent is a refusal, because "not measured" and
   * "measured as none" are different facts and only one is evidence.
   */
  readonly reportedUnhandledErrors?: number | null;
  readonly sanitizedUnhandledErrorNames?: readonly string[];
  readonly sanitizedUnhandledErrorCodes?: readonly string[];
  readonly reportWritten?: boolean;
  readonly reportParsed?: boolean;
  readonly reportCompleted?: boolean;
  readonly processStatus?: number | null;
  readonly processSignal?: string | null;
  readonly processErrorCode?: string | null;
  readonly phase?: string;
  readonly durationMs?: number | null;
  readonly runner?: string | null;
  readonly workerPool?: string | null;
  readonly workerCount?: number | null;
  readonly reasons?: readonly string[];
}

export interface GateRecord {
  readonly head?: string;
  /**
   * Structured control-character evidence, over the tracked working tree.
   *
   * Required. The previous contract read only the free-text verdict, so both
   * `"8 FOUND"` and `"BROKEN"` permitted packaging: neither contains the word
   * the string check looked for. Numbers cannot be misread that way.
   */
  readonly controlCharacterScan?: ControlCharacterScan;
  readonly tests?: {
    readonly passed?: number;
    readonly skipped?: number;
    readonly failed?: number;
    readonly files?: number;
    readonly perFile?: Readonly<Record<string, number>>;
  };
  readonly testGate?: RecordedTestGate;
  readonly processes?: Readonly<Record<string, RecordedProcess>>;
  readonly gates?: Readonly<Record<string, string>>;
}

export const GATE_RECORD_PATH = ".release/gate-results.json";

/**
 * The marker a gate attempt leaves in place of the record while it runs.
 *
 * `run-gates.ts` used to write only at the very end. A run that crashed, was
 * killed, or was interrupted therefore left the PREVIOUS record untouched — and
 * if that record was green at the same HEAD, the packager accepted it. The
 * archive would then carry verification evidence from a run that had been
 * superseded by one nobody saw finish.
 *
 * So the canonical result is invalidated synchronously before the first gate
 * starts, and the finished record is renamed into place only once every result
 * is in hand. Anything that stops in between leaves this, which is not a
 * packageable record.
 */
export const GATE_IN_PROGRESS = "IN_PROGRESS";

/** Is this file the in-progress marker rather than a result? */
export function isInProgress(record: GateRecord | null): boolean {
  return (record as { status?: unknown } | null)?.status === GATE_IN_PROGRESS;
}

/** The record as it sits on disk, or null when there is none to read. */
export function readGateRecord(root: string): GateRecord | null {
  const path = join(root, GATE_RECORD_PATH);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as GateRecord;
  } catch {
    return null;
  }
}

/**
 * Every reason this record may not be packaged. Empty means it may.
 *
 * Fail-closed throughout: an absent field is a failure, not a pass, because
 * "the runner did not record it" and "the runner recorded it as fine" are
 * different facts and only one of them is evidence.
 */
/**
 * The runner-level half of the test gate, checked as data.
 *
 * Separated from {@link gateRecordProblems} because it is a different KIND of
 * claim: everything else there is about tests, and this is about the process
 * that ran them. A run can be clean on every test-level field and still have
 * exited 1, and for three milestones the record had no way to say so.
 */
/**
 * All four fields present, and all four exactly clean.
 *
 * ABSENT IS NOT CLEAN, and the old rule said it was. `signal` and `errorCode`
 * were each compared against both `null` AND `undefined`, so a record that
 * simply omitted them satisfied the check — a process the runner never managed
 * to describe read exactly like one that exited cleanly. `ok` was not consulted
 * at all.
 */
/** A count: a non-negative integer, and nothing that merely looks like one. */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** A test-file label fit to persist: a basename, bounded, no path, no control byte. */
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * The rendered totals, checked as arithmetic rather than read as a sentence.
 *
 * The contract validated the test GATE and never the `tests` object the archive
 * prints. So a record could say "1340 passed, 1 skipped, 0 failed / 45 files"
 * beside per-file counts summing to something else entirely, and section 7 of
 * the package would print the sentence.
 */
export function testTotalsProblems(record: GateRecord): readonly string[] {
  const problems: string[] = [];
  const t = record.tests;
  if (t === undefined) return ["no test totals recorded"];

  for (const [field, value] of [
    ["passed", t.passed],
    ["skipped", t.skipped],
    ["failed", t.failed],
    ["files", t.files],
  ] as const) {
    if (!isCount(value)) problems.push(`tests.${field} is not a count: ${JSON.stringify(value)}`);
  }
  if (problems.length > 0) return problems;

  const passed = t.passed ?? 0;
  const skipped = t.skipped ?? 0;
  const failed = t.failed ?? 0;
  const files = t.files ?? 0;
  const total = passed + skipped + failed;

  if (failed !== 0) problems.push(`tests.failed is ${String(failed)}`);

  const perFile = t.perFile;
  if (perFile === undefined || typeof perFile !== "object") {
    problems.push("tests.perFile not recorded");
    return problems;
  }
  const entries = Object.entries(perFile);
  for (const [label, count] of entries) {
    if (!SAFE_LABEL.test(label)) {
      problems.push(`tests.perFile has an unsafe label: ${JSON.stringify(label.slice(0, 32))}`);
    }
    if (!isCount(count)) problems.push(`tests.perFile[${label}] is not a count`);
  }
  if (entries.length !== files) {
    problems.push(
      `tests.perFile has ${String(entries.length)} entries but tests.files is ${String(files)}`,
    );
  }
  const summed = entries.reduce((a, [, n]) => a + (isCount(n) ? n : 0), 0);
  if (summed !== total) {
    problems.push(`tests.perFile sums to ${String(summed)}, not ${String(total)}`);
  }

  const gate = record.testGate;
  if (gate !== undefined) {
    const failedIds = gate.failedTests;
    if (Array.isArray(failedIds) && failedIds.length !== failed) {
      problems.push(
        `${String(failedIds.length)} failed-test identities for ${String(failed)} failed tests`,
      );
    }
    const skippedIds = gate.skippedTests;
    if (Array.isArray(skippedIds) && skippedIds.length !== skipped) {
      problems.push(
        `${String(skippedIds.length)} skipped-test identities for ${String(skipped)} skipped tests`,
      );
    }
    for (const [what, list] of [
      ["failed", failedIds],
      ["skipped", skippedIds],
    ] as const) {
      if (!Array.isArray(list)) continue;
      const seen = new Set<string>();
      for (const id of list) {
        const suite = (id as { suite?: unknown }).suite;
        const title = (id as { title?: unknown }).title;
        if (typeof suite !== "string" || !SAFE_LABEL.test(suite)) {
          problems.push(`${what} identity has an unsafe suite name`);
          continue;
        }
        if (typeof title !== "string" || title.length === 0 || title.length > 200) {
          problems.push(`${what} identity has no usable title`);
          continue;
        }
        const key = `${suite} > ${title}`;
        if (seen.has(key)) problems.push(`duplicate ${what} identity: ${suite}`);
        seen.add(key);
      }
    }

    /*
     * EVERY zero-failure claim, cross-checked against every other one. A run is
     * clean or it is not; six fields saying so and one saying otherwise is a
     * record that cannot be believed in either direction.
     */
    const claims: [string, unknown][] = [
      ["reportSuccess", gate.reportSuccess === true],
      ["reportedFailedTests", gate.reportedFailedTests === 0],
      ["countedFailedTests", gate.countedFailedTests === 0],
      ["reportedFailedSuites", gate.reportedFailedSuites === 0],
      ["runtimeErrorSuites", gate.runtimeErrorSuites === 0],
      ["failedSuiteNames", (gate.failedSuiteNames ?? ["unrecorded"]).length === 0],
      ["reportedUnhandledErrors", gate.reportedUnhandledErrors === 0],
      ["processStatus", gate.processStatus === 0],
    ];
    const disagreeing = claims.filter(([, ok]) => ok !== true).map(([name]) => name);
    if (failed === 0 && disagreeing.length > 0) {
      problems.push(
        `tests.failed is 0 but ${disagreeing.join(", ")} disagree${disagreeing.length === 1 ? "s" : ""}`,
      );
    }
  }

  /* The verdict string must be the canonical rendering of those numbers. */
  const verdict = record.gates?.["pnpm test"];
  const canonical = `${String(passed)} passed, ${String(skipped)} skipped, ${String(failed)} failed / ${String(files)} files`;
  if (verdict !== canonical) {
    problems.push(
      `the pnpm test verdict ${JSON.stringify(verdict)} is not the canonical rendering ` +
        `of the structured results (expected ${JSON.stringify(canonical)})`,
    );
  }

  return problems;
}

export function cleanProcessProblems(p: RecordedProcess, label: string): readonly string[] {
  const problems: string[] = [];

  if (p.ok === undefined) problems.push(`${label}: ok not recorded`);
  else if (p.ok !== true) problems.push(`${label}: ok is false`);

  if (p.status === undefined) problems.push(`${label}: status not recorded`);
  else if (p.status !== 0) problems.push(`${label}: exit status ${String(p.status)}`);

  /* `null` is a recorded absence of a signal. `undefined` is no record at all. */
  if (p.signal === undefined) problems.push(`${label}: signal not recorded`);
  else if (p.signal !== null) problems.push(`${label}: signal ${p.signal}`);

  if (p.errorCode === undefined) problems.push(`${label}: errorCode not recorded`);
  else if (p.errorCode !== null) problems.push(`${label}: spawn error ${p.errorCode}`);

  return problems;
}

/** Do two recorded process triples describe the same outcome? */
export function processTriplesAgree(
  a: Pick<RecordedProcess, "status" | "signal" | "errorCode">,
  b: Pick<RecordedProcess, "status" | "signal" | "errorCode">,
): boolean {
  return a.status === b.status && a.signal === b.signal && a.errorCode === b.errorCode;
}

export function runnerEvidenceProblems(t: RecordedTestGate): readonly string[] {
  const problems: string[] = [];

  if (t.reportedUnhandledErrors === undefined || t.reportedUnhandledErrors === null) {
    problems.push("unhandled runner errors were not measured — rerun `pnpm release:gates`");
  } else if (!Number.isInteger(t.reportedUnhandledErrors) || t.reportedUnhandledErrors < 0) {
    problems.push(
      `reportedUnhandledErrors is not a count: ${JSON.stringify(t.reportedUnhandledErrors)}`,
    );
  } else if (t.reportedUnhandledErrors > 0) {
    const ids = [
      ...(t.sanitizedUnhandledErrorNames ?? []),
      ...(t.sanitizedUnhandledErrorCodes ?? []),
    ]
      .filter((s) => s !== "(none)")
      .join(", ");
    problems.push(
      `${String(t.reportedUnhandledErrors)} unhandled runner error(s)${ids === "" ? "" : `: ${ids}`}`,
    );
  }

  for (const [field, value] of [
    ["reportWritten", t.reportWritten],
    ["reportParsed", t.reportParsed],
    ["reportCompleted", t.reportCompleted],
  ] as const) {
    if (value === undefined) problems.push(`${field} not recorded`);
    else if (value !== true) problems.push(`${field} is false`);
  }

  if (!Array.isArray(t.sanitizedUnhandledErrorNames)) {
    problems.push("sanitizedUnhandledErrorNames not recorded");
  }
  if (!Array.isArray(t.sanitizedUnhandledErrorCodes)) {
    problems.push("sanitizedUnhandledErrorCodes not recorded");
  }

  /*
   * The three process facts under their explicit names, cross-checked against
   * the ones already recorded. A record that disagrees with itself is not
   * evidence, whichever half is right.
   */
  if (t.processStatus === undefined) problems.push("processStatus not recorded");
  else if (t.processStatus !== t.status) {
    problems.push(
      `processStatus ${String(t.processStatus)} disagrees with status ${String(t.status)}`,
    );
  }
  if (t.processSignal === undefined) problems.push("processSignal not recorded");
  else if (t.processSignal !== (t.signal ?? null)) {
    problems.push("processSignal disagrees with signal");
  }
  if (t.processErrorCode === undefined) problems.push("processErrorCode not recorded");
  else if (t.processErrorCode !== (t.errorCode ?? null)) {
    problems.push("processErrorCode disagrees with errorCode");
  }

  /*
   * THE CONCURRENCY BOUND IS PART OF THE ACCEPTANCE, NOT A NOTE ON IT.
   *
   * The runner-level exit was reproduced under the pool's default sizing and
   * has not been reproduced under four workers. That correction is only worth
   * anything if the record proves the run it describes actually used it — and
   * the contract accepted this field missing, null, or set to anything at all.
   * A record from an unbounded run would then have been packaged as evidence
   * for a bounded one.
   *
   * It is not proof that recurrence is impossible. It is the guarantee that a
   * green record was produced under the conditions this release claims.
   */
  if (t.phase === undefined) problems.push("phase not recorded");
  else if (t.phase !== REQUIRED_PHASE) {
    problems.push(`phase is ${JSON.stringify(t.phase)}, not ${JSON.stringify(REQUIRED_PHASE)}`);
  }

  if (t.workerPool === undefined || t.workerPool === null) problems.push("workerPool not recorded");
  else if (t.workerPool !== REQUIRED_POOL) {
    problems.push(`workerPool is ${JSON.stringify(t.workerPool)}, not ${REQUIRED_POOL}`);
  }

  if (t.workerCount === undefined || t.workerCount === null) {
    problems.push("workerCount not recorded — the run may have been unbounded");
  } else if (t.workerCount !== REQUIRED_WORKERS) {
    problems.push(
      `workerCount is ${String(t.workerCount)}, not ${String(REQUIRED_WORKERS)} — ` +
        `this record did not come from a run bounded the way the release claims`,
    );
  }

  /*
   * The runner's identity, bounded. It says which Vitest produced the record,
   * and every conclusion about that reporter's behaviour is version-specific.
   */
  if (t.runner === undefined || t.runner === null) problems.push("runner not recorded");
  else if (!RUNNER_IDENTITY.test(t.runner)) {
    problems.push(
      `runner identity is not a bounded name: ${JSON.stringify(t.runner.slice(0, 32))}`,
    );
  }

  return problems;
}

export function gateRecordProblems(record: GateRecord | null, head: string): readonly string[] {
  if (record === null)
    return [`${GATE_RECORD_PATH} is missing or unreadable — run \`pnpm release:gates\``];

  if (isInProgress(record)) {
    return [
      "a gate attempt was started and did not finish. The previous result was " +
        "invalidated when it began, and nothing has replaced it — run `pnpm release:gates` again.",
    ];
  }

  const problems: string[] = [];
  if (record.head !== head) {
    problems.push(
      `recorded at ${String(record.head).slice(0, 7) || "nothing"}, not at ${head.slice(0, 7)} — rerun \`pnpm release:gates\``,
    );
  }

  for (const gate of REQUIRED_GATES) {
    const outcome = record.gates?.[gate];
    if (outcome === undefined) {
      problems.push(`${gate}: no result recorded`);
      continue;
    }
    /*
     * Case-SENSITIVE, and deliberately. The runner writes the literal word
     * FAILED for a failure, while a clean test gate reads "… 0 failed / 40
     * files" — a case-insensitive match rejected every green record it saw.
     *
     * IT IS ALSO NOT ENOUGH ON ITS OWN. A string check can only reject prose it
     * recognises: `"8 FOUND"` and `"BROKEN"` both passed it, because neither
     * contains the word it looks for. Gates whose result is a measurement carry
     * STRUCTURED evidence as well, checked below, and the string is then only a
     * label that has to match what the structure says.
     */
    if (/FAILED/.test(outcome)) problems.push(`${gate}: ${outcome}`);

    /* The scan gates have no process of their own; the rest must have one. */
    if (gate === CONTROL_CHARACTER_GATE) continue;
    const p = record.processes?.[gate];
    if (p === undefined) {
      problems.push(`${gate}: no process metadata recorded`);
      continue;
    }
    problems.push(...cleanProcessProblems(p, gate));
  }

  /*
   * The control-character gate, structurally.
   *
   * Every field present and correctly typed, zero characters, an empty file
   * list, the two halves agreeing with each other, and a recorded verdict that
   * matches what the structure says. Absent, malformed, negative, non-integer
   * or non-zero all refuse.
   */
  problems.push(...testTotalsProblems(record));
  problems.push(...scanProblems(record.controlCharacterScan, "controlCharacterScan"));
  const scan = record.controlCharacterScan;
  if (scan !== undefined && typeof scan.scannedFiles === "number") {
    /*
     * The verdict must describe THIS scan, not merely look clean. Comparing
     * against the clean form alone let a dirty scan sit beside a clean
     * sentence without the mismatch being reported.
     */
    const expected = describeScan(scan);
    const recorded = record.gates?.[CONTROL_CHARACTER_GATE];
    if (recorded !== expected) {
      problems.push(
        `${CONTROL_CHARACTER_GATE}: verdict ${JSON.stringify(recorded)} does not match the structured evidence (expected ${JSON.stringify(expected)})`,
      );
    }
  }

  const t = record.testGate;
  if (t === undefined) {
    problems.push("no sanitized test-gate record");
  } else {
    if (t.reportSuccess !== true) problems.push(`test report success=${String(t.reportSuccess)}`);
    if ((t.reportedFailedTests ?? 1) !== 0) {
      problems.push(`test report names ${String(t.reportedFailedTests)} failed test(s)`);
    }
    if ((t.countedFailedTests ?? 1) !== 0) {
      problems.push(`${String(t.countedFailedTests)} failed test(s) counted from results`);
    }
    if ((t.reportedFailedSuites ?? 1) !== 0) {
      problems.push(`test report names ${String(t.reportedFailedSuites)} failed suite(s)`);
    }
    if ((t.runtimeErrorSuites ?? 1) !== 0) {
      problems.push(`${String(t.runtimeErrorSuites)} suite(s) failed with no failed assertion`);
    }
    if ((t.failedSuiteNames ?? ["unrecorded"]).length !== 0) {
      problems.push(`failing suite(s): ${(t.failedSuiteNames ?? []).join(", ")}`);
    }
    if (t.failedTests === undefined) {
      problems.push("no failed-test identities recorded — rerun `pnpm release:gates`");
    } else if (t.failedTests.length !== 0) {
      problems.push(
        `failing test(s): ${t.failedTests.map((f) => `${f.suite} > ${f.title}`).join("; ")}`,
      );
    }
    if (t.skippedTests === undefined) {
      problems.push("no skipped-test identities recorded — rerun `pnpm release:gates`");
    }

    /*
     * THE TEST GATE'S OWN PROCESS, RECORDED THREE TIMES.
     *
     * The same outcome sits in `processes["pnpm test"]`, in the `testGate`
     * triple, and in the `processStatus/Signal/ErrorCode` triple added while
     * the runner-level exit was being diagnosed. Copies checked separately are
     * copies that can disagree, and this contract accepted a record whose
     * spawned process said status 0 while both `testGate` copies said 1: the
     * duplicated fields agreed with each other, so nothing looked wrong.
     */
    problems.push(...cleanProcessProblems(t, "test gate"));
    problems.push(
      ...cleanProcessProblems(
        {
          ok: t.ok,
          status: t.processStatus,
          signal: t.processSignal,
          errorCode: t.processErrorCode,
        },
        "test gate (process fields)",
      ).filter((m) => !m.includes(": ok ")),
    );

    const own = { status: t.status, signal: t.signal, errorCode: t.errorCode };
    const copy = {
      status: t.processStatus,
      signal: t.processSignal,
      errorCode: t.processErrorCode,
    };
    if (!processTriplesAgree(own, copy)) {
      problems.push("the test gate's two process triples disagree with each other");
    }
    const spawned = record.processes?.["pnpm test"];
    if (spawned === undefined) problems.push("no spawned-process record for pnpm test");
    else if (!processTriplesAgree(own, spawned)) {
      problems.push("the test gate disagrees with the process that ran it");
    }

    problems.push(...runnerEvidenceProblems(t));
    if ((t.reasons ?? ["unrecorded"]).length !== 0) {
      problems.push(`test gate not clean: ${(t.reasons ?? []).join("; ")}`);
    }
  }

  return problems;
}

/**
 * The record with nothing in it that could carry a secret.
 *
 * This is what goes into the archive: counts, verdicts, sanitized process
 * metadata and suite BASENAMES. No stdout, no stderr, no environment value, no
 * command line, no failure message, no path.
 */
/** A short, printable, single-line string, or nothing. */
function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > max) return null;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return null;
  }
  return value;
}

/** Anything that looks like a location, a message or an environment value. */
const FORBIDDEN_SHAPE =
  /(^|[^A-Za-z])([A-Za-z]:[\\/]|\.\.[\\/]|\/\/|https?:|file:|postgres(ql)?:|[A-Z][A-Z0-9_]{4,}=)/;

/** A value fit for the archive: bounded, printable, and not location-shaped. */
function safeText(value: unknown, max: number): string | null {
  const text = bounded(value, max);
  if (text === null) return null;
  if (FORBIDDEN_SHAPE.test(text)) return null;
  if (/[\\/]/.test(text) && !SAFE_LABEL.test(text)) return null;
  return text;
}

/** One process, rebuilt from exactly its four allowed fields. */
function stageProcess(p: RecordedProcess | undefined): unknown {
  if (p === undefined) return null;
  return {
    ok: p.ok === true,
    status: typeof p.status === "number" ? p.status : null,
    signal: bounded(p.signal, 16),
    errorCode: bounded(p.errorCode, 32),
  };
}

/** One identity, rebuilt from a validated basename and a bounded title. */
function stageIdentity(id: unknown): { suite: string; title: string } | null {
  const suite = (id as { suite?: unknown } | null)?.suite;
  const title = (id as { title?: unknown } | null)?.title;
  if (typeof suite !== "string" || !SAFE_LABEL.test(suite)) return null;
  const safeTitle = safeText(title, 200);
  if (safeTitle === null) return null;
  return { suite, title: safeTitle };
}

const stageIdentities = (list: unknown): { suite: string; title: string }[] =>
  (Array.isArray(list) ? list : [])
    .map(stageIdentity)
    .filter((x): x is { suite: string; title: string } => x !== null)
    .sort((a, b) => a.suite.localeCompare(b.suite) || a.title.localeCompare(b.title));

const stageStrings = (list: unknown, max: number): string[] =>
  (Array.isArray(list) ? list : [])
    .map((v) => safeText(v, max))
    .filter((v): v is string => v !== null)
    .sort();

/**
 * The record as the ARCHIVE sees it, rebuilt field by field.
 *
 * ## Why this is not a projection of the input
 *
 * It used to return `{ head, tests, testGate, controlCharacterScan, processes,
 * gates }` — whole nested objects, handed straight through. Any field a future
 * runner added inside one of them travelled into the package unread: a
 * `testGate.stdout`, an `environment`, a message someone thought would be
 * useful. The staged record is a file somebody zips and hands to a reviewer, so
 * "everything except what we thought to exclude" is the wrong default.
 *
 * Nothing here spreads an input object. Every value is copied by name, through
 * a check that bounds its length, refuses control characters, and refuses
 * anything shaped like a path, a URL, a connection string or an environment
 * assignment. Keys and arrays are sorted, so the same results always serialise
 * to the same bytes.
 *
 * ## Why the duration is not here
 *
 * `durationMs` is honest and useful and VOLATILE. Two clean runs of the same
 * commit differ by seconds, so including it meant the documented two-command
 * rebuild could not reproduce the archive's bytes — the package would claim
 * determinism it did not have. Timing stays in the local record; the staged
 * projection carries only what a second clean run at the same commit would
 * produce identically.
 */
export function sanitizedRecord(record: GateRecord): unknown {
  const t = record.testGate;
  const tests = record.tests;

  const perFile: Record<string, number> = {};
  for (const [label, count] of Object.entries(tests?.perFile ?? {})) {
    if (SAFE_LABEL.test(label) && isCount(count)) perFile[label] = count;
  }

  const processes: Record<string, unknown> = {};
  for (const gate of [...REQUIRED_GATES].sort()) {
    if (gate === CONTROL_CHARACTER_GATE) continue;
    const staged = stageProcess(record.processes?.[gate]);
    if (staged !== null) processes[gate] = staged;
  }

  const gates: Record<string, string> = {};
  for (const gate of [...REQUIRED_GATES].sort()) {
    const verdict = safeText(record.gates?.[gate], 120);
    if (verdict !== null) gates[gate] = verdict;
  }

  const scan = record.controlCharacterScan;

  return {
    head: bounded(record.head, 40),
    tests: {
      passed: isCount(tests?.passed) ? tests.passed : null,
      skipped: isCount(tests?.skipped) ? tests.skipped : null,
      failed: isCount(tests?.failed) ? tests.failed : null,
      files: isCount(tests?.files) ? tests.files : null,
      perFile: Object.fromEntries(Object.entries(perFile).sort(([a], [b]) => a.localeCompare(b))),
    },
    testGate: {
      ok: t?.ok === true,
      status: typeof t?.status === "number" ? t.status : null,
      signal: bounded(t?.signal, 16),
      errorCode: bounded(t?.errorCode, 32),
      reportSuccess: typeof t?.reportSuccess === "boolean" ? t.reportSuccess : null,
      reportedFailedTests: isCount(t?.reportedFailedTests) ? t.reportedFailedTests : null,
      countedFailedTests: isCount(t?.countedFailedTests) ? t.countedFailedTests : null,
      reportedFailedSuites: isCount(t?.reportedFailedSuites) ? t.reportedFailedSuites : null,
      runtimeErrorSuites: isCount(t?.runtimeErrorSuites) ? t.runtimeErrorSuites : null,
      failedSuiteNames: stageStrings(t?.failedSuiteNames, 64),
      failedTests: stageIdentities(t?.failedTests),
      skippedTests: stageIdentities(t?.skippedTests),
      reportedUnhandledErrors: isCount(t?.reportedUnhandledErrors)
        ? t.reportedUnhandledErrors
        : null,
      sanitizedUnhandledErrorNames: stageStrings(t?.sanitizedUnhandledErrorNames, 40),
      sanitizedUnhandledErrorCodes: stageStrings(t?.sanitizedUnhandledErrorCodes, 40),
      reportWritten: t?.reportWritten === true,
      reportParsed: t?.reportParsed === true,
      reportCompleted: t?.reportCompleted === true,
      processStatus: typeof t?.processStatus === "number" ? t.processStatus : null,
      processSignal: bounded(t?.processSignal, 16),
      processErrorCode: bounded(t?.processErrorCode, 32),
      phase: safeText(t?.phase, 16),
      runner: safeText(t?.runner, 32),
      workerPool: safeText(t?.workerPool, 16),
      workerCount: isCount(t?.workerCount) ? t.workerCount : null,
      reasons: stageStrings(t?.reasons, 160),
      /* durationMs is deliberately absent. See the note above. */
    },
    controlCharacterScan: {
      scannedFiles: isCount(scan?.scannedFiles) ? scan.scannedFiles : null,
      foundCharacters: isCount(scan?.foundCharacters) ? scan.foundCharacters : null,
      affectedFiles: stageStrings(scan?.affectedFiles, 120),
    },
    processes,
    gates,
  };
}

/**
 * Field names the staged record must never contain, at any depth.
 *
 * A denylist beside an allowlist is not redundancy: the allowlist decides what
 * is copied, and this proves the decision held after a future edit. Asserted by
 * the package tests over the real serialized bytes.
 */
export const FORBIDDEN_STAGED_FIELDS: readonly string[] = [
  "stdout",
  "stderr",
  "output",
  "environment",
  "env",
  "message",
  "stack",
  "cmd",
  "command",
  "argv",
  "cwd",
  "path",
  "url",
  "durationMs",
];
