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

/** This file lives in `scripts/release/`, so the repository root is two up. */
const REPO_ROOT_FOR_PATTERNS = join(import.meta.dirname, "..", "..");
import { scanProblems, describeScan, type ControlCharacterScan } from "./control-chars";
import { isOperationId, GATE_ABANDONED } from "./release-operation";

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
/**
 * The one canonical rendering of the test totals.
 *
 * A renderer AND a parser, because the verdict has to survive sanitization and
 * the sanitizer refuses arbitrary slash-containing strings — for good reason,
 * since a path is slash-shaped. The delivered `c1b80f0` archive lost its
 * `pnpm test` verdict to exactly that rule: the canonical form ends
 * "/ 45 files", the generic text filter dropped it, the key vanished from the
 * staged record, and nothing re-validated the projection. So this shape is
 * recognised explicitly rather than being let through a widened filter.
 */
export function renderTestVerdict(t: {
  passed: number;
  skipped: number;
  failed: number;
  files: number;
}): string {
  return `${String(t.passed)} passed, ${String(t.skipped)} skipped, ${String(t.failed)} failed / ${String(t.files)} files`;
}

const TEST_VERDICT = /^(\d{1,7}) passed, (\d{1,7}) skipped, (\d{1,7}) failed \/ (\d{1,5}) files$/;

/**
 * What a RED test gate says, rendered from structured measurements.
 *
 * ## Why a red verdict needs a canonical form at all
 *
 * The runner used to write `FAILED — ` followed by whatever reasons it had
 * collected: free prose, assembled from a list that grows. The sanitizer then
 * refused it — correctly, by its own rules, since arbitrary text can carry a
 * path or a message — and the staged projection lost the gate entirely. A red
 * record therefore could not be projected at all, so the projection of a red
 * record could never be structurally valid, so structural validation of a red
 * attempt could never pass. The `ddefa50` gate demonstrated exactly that.
 *
 * The fix is the same one the green verdict got: RECOGNITION, NOT PERMISSION.
 * A red verdict has one shape, rendered from numbers, and the sanitizer matches
 * that shape rather than trusting prose.
 *
 * ## What it must convey
 *
 * Six measurements, in a fixed order, because a reader who sees only "FAILED"
 * learns nothing and a reader who sees only "0 failed" is actively misled —
 * zero failed ASSERTIONS beside six failed SUITES is the exact shape a hook
 * timeout or a collection error makes.
 */
export function renderFailedVerdict(t: {
  passed: number;
  skipped: number;
  failed: number;
  files: number;
  status: number | null;
  reportSuccess: boolean;
  failedSuites: number;
  runtimeErrorSuites: number;
}): string {
  return (
    `FAILED — ${String(t.passed)} passed, ${String(t.skipped)} skipped, ` +
    `${String(t.failed)} failed assertions / ${String(t.files)} files; ` +
    `exit status ${t.status === null ? "none" : String(t.status)}; ` +
    `report ${t.reportSuccess ? "successful" : "unsuccessful"}; ` +
    `${String(t.failedSuites)} failed suites; ` +
    `${String(t.runtimeErrorSuites)} runtime-error suites`
  );
}

const FAILED_VERDICT =
  /^FAILED — (\d{1,7}) passed, (\d{1,7}) skipped, (\d{1,7}) failed assertions \/ (\d{1,5}) files; exit status (none|\d{1,5}); report (successful|unsuccessful); (\d{1,5}) failed suites; (\d{1,5}) runtime-error suites$/;

/** The eight measurements a canonical red verdict states, or nothing. */
export function parseFailedVerdict(value: unknown): {
  passed: number;
  skipped: number;
  failed: number;
  files: number;
  status: number | null;
  reportSuccess: boolean;
  failedSuites: number;
  runtimeErrorSuites: number;
} | null {
  if (typeof value !== "string") return null;
  const m = FAILED_VERDICT.exec(value);
  if (m === null) return null;
  const [, passed, skipped, failed, files, status, report, suites, runtime] = m;
  return {
    passed: Number(passed),
    skipped: Number(skipped),
    failed: Number(failed),
    files: Number(files),
    status: status === "none" ? null : Number(status),
    reportSuccess: report === "successful",
    failedSuites: Number(suites),
    runtimeErrorSuites: Number(runtime),
  };
}

/** Is this the canonical form of either outcome? */
export const isCanonicalTestVerdict = (value: unknown): boolean =>
  parseTestVerdict(value) !== null || parseFailedVerdict(value) !== null;

/** The four numbers a canonical test verdict states, or nothing. */
export function parseTestVerdict(
  value: unknown,
): { passed: number; skipped: number; failed: number; files: number } | null {
  if (typeof value !== "string") return null;
  const m = TEST_VERDICT.exec(value);
  if (m === null) return null;
  const [, passed, skipped, failed, files] = m;
  return {
    passed: Number(passed),
    skipped: Number(skipped),
    failed: Number(failed),
    files: Number(files),
  };
}

/**
 * What each gate's verdict must say when it is clean.
 *
 * Prose is DERIVED from the measurement, never accepted as one. The old rule
 * only refused a verdict containing the word FAILED, so "BROKEN" beside green
 * process metadata passed — a sentence nobody wrote on purpose, accepted
 * because it did not contain the one word being looked for.
 *
 * `pnpm test` and `raw-NUL scan` are absent here: both are rendered from
 * structured counts and checked against them separately.
 */
export const CANONICAL_VERDICTS: Readonly<Record<string, string>> = {
  "pnpm format:check": "clean",
  "pnpm typecheck": "0 errors",
  "pnpm lint": "clean",
  "pnpm build": "clean",
  "secret audit": "clean",
  "wrappers vs sources": "every body byte-identical",
};

export const REQUIRED_PHASE = "test";
export const REQUIRED_POOL = "forks";
export const REQUIRED_WORKERS = 4;

/**
 * Which half of the contract is being asked about.
 *
 * STRUCTURE is "is this evidence": every required measurement present, every
 * field correctly typed, every duplicated fact agreeing with its copy.
 * ACCEPTANCE is "is this evidence green".
 *
 * They were one list, and that is exactly how a missing measurement hid. The
 * runner skipped contract validation entirely once a gate had already failed —
 * because a red record was expected to fail it — so nobody noticed the record
 * was ALSO structurally incomplete: `observedPeakWorkers` was computed and
 * never written down, and the first green run would have refused to publish.
 *
 * A red record may fail acceptance. It may not fail structure. One failure
 * must not suppress evidence about another.
 */
export type RecordCheck = "structure" | "acceptance";

/** Does this pass want that category? An absent category wants both. */
const asks = (check: RecordCheck | undefined, kind: RecordCheck): boolean =>
  check === undefined || check === kind;

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
  readonly configuredMinWorkers?: number | null;
  readonly configuredMaxWorkers?: number | null;
  /**
   * The largest number of modules executing at one moment.
   *
   * MEASURED, not configured. The reporter has counted this all along and the
   * record discarded it, so the evidence could state only what the pool was
   * told — and a bound honoured is precisely what a bound cannot prove about
   * itself. Required now, and required not to exceed the bound.
   */
  readonly observedPeakWorkers?: number | null;
  readonly reasons?: readonly string[];
}

export interface GateRecord {
  /**
   * Which OPERATION produced this record. Local operational state only.
   *
   * A random id is required to prove ownership and must never reach the
   * archive: two identical green runs at one commit would otherwise produce
   * different archive bytes, which contradicts the reproducibility the package
   * claims. See {@link stagedRecordProblems}.
   */
  readonly operationId?: string;
  readonly head?: string;
  /** The branch the operation ran on. */
  readonly branch?: string;
  /**
   * The identity of the bytes the gate actually measured.
   *
   * HEAD alone is not one. The gate reads the WORKING TREE; HEAD names a
   * commit; the two coincide only while the tree is clean, and nothing used to
   * check. A record could be produced from edited files, the edits reverted,
   * and the result packaged at a commit it never described.
   */
  readonly treeId?: string;
  readonly inputsDigest?: string;
  /** Every suite the repository expects to be collected, by basename. */
  readonly expectedSuites?: readonly string[];
  /** A digest of that inventory, so a filtered run cannot look complete. */
  readonly suiteInventoryDigest?: string;
  /**
   * Structured control-character evidence, over the tracked working tree.
   *
   * Required. The previous contract read only the free-text verdict, so both
   * `"8 FOUND"` and `"BROKEN"` permitted packaging: neither contains the word
   * the string check looked for. Numbers cannot be misread that way.
   */
  readonly controlCharacterScan?: ControlCharacterScan;
  readonly tests?: {
    /** passed + skipped + failed, as the runner counted them. */
    readonly total?: number;
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

/**
 * What recovery leaves behind: a result deliberately invalidated by a human.
 *
 * Recovery from an interrupted operation cannot simply remove the lock. There
 * is a gap between taking the mutex and writing the in-progress marker, and an
 * operation that dies inside it leaves the PREVIOUS green record in place — so
 * clearing only the lock makes a superseded record packageable again. The
 * tombstone closes that: it is not a result, and nothing packages until a new
 * gate completes.
 */
export function isAbandoned(record: GateRecord | null): boolean {
  return (record as { status?: unknown } | null)?.status === GATE_ABANDONED;
}

/*
 * THE ATTEMPT LOCK LIVED HERE AND HAS MOVED.
 *
 * It became a RELEASE OPERATION mutex — see `release-operation.ts` — because a
 * lock only the gate takes cannot exclude the packager, and the packager was
 * the process that needed excluding: it read the record, read the lock, saw the
 * gate free, and then built while holding nothing at all.
 */

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
export function testTotalsProblems(record: GateRecord, check?: RecordCheck): readonly string[] {
  const problems: string[] = [];
  const t = record.tests;
  if (t === undefined) return asks(check, "structure") ? ["no test totals recorded"] : [];

  const typing: string[] = [];
  for (const [field, value] of [
    ["passed", t.passed],
    ["skipped", t.skipped],
    ["failed", t.failed],
    ["files", t.files],
  ] as const) {
    if (!isCount(value)) typing.push(`tests.${field} is not a count: ${JSON.stringify(value)}`);
  }
  if (typing.length > 0) return asks(check, "structure") ? typing : [];

  const passed = t.passed ?? 0;
  const skipped = t.skipped ?? 0;
  const failed = t.failed ?? 0;
  const files = t.files ?? 0;
  const total = passed + skipped + failed;

  /* A failing count is a real result, correctly recorded: acceptance, not shape. */
  if (failed !== 0 && asks(check, "acceptance")) {
    problems.push(`tests.failed is ${String(failed)}`);
  }

  /*
   * ZERO FAILED ASSERTIONS IS NOT GLOBAL CLEANLINESS.
   *
   * This is the misreading the `ddefa50` gate exposed. Six failed SUITE
   * results with three distinct basenames and zero failed assertions is a
   * perfectly coherent record — it is what a hook timeout, a collection error
   * or a refusal thrown from shared setup produces. Treating the assertion
   * count as a verdict on the run made that shape look internally
   * inconsistent, so a genuine failure was reported as a malformed record.
   *
   * They are separate measurements of separate things, and each is checked
   * against the fields that actually duplicate it.
   */
  if (asks(check, "acceptance")) {
    const t2 = record.testGate;
    if ((t2?.reportedFailedSuites ?? 0) !== 0) {
      problems.push(
        `${String(t2?.reportedFailedSuites)} failed suite result(s) — separate from failed assertions`,
      );
    }
    if ((t2?.runtimeErrorSuites ?? 0) !== 0) {
      problems.push(
        `${String(t2?.runtimeErrorSuites)} runtime-error suite(s) — a suite that failed with no failed assertion`,
      );
    }
  }

  const structural: string[] = [];

  /*
   * A RUN THAT COLLECTED NOTHING IS NOT A RUN AT ALL.
   *
   * `0 passed, 0 skipped, 0 failed / 0 files` beside an empty `perFile` was
   * internally consistent and satisfied every arithmetic check. A stray path
   * argument or a glob that matched nothing produces exactly that record, and
   * it used to package. It is a STRUCTURAL fault — the evidence is incomplete —
   * so a red record is held to it too.
   */
  if (files === 0) structural.push("tests.files is 0 — the run collected no suites at all");
  if (total === 0) structural.push("tests collected no tests at all");

  const perFile = t.perFile;
  if (perFile === undefined || perFile === null || typeof perFile !== "object") {
    structural.push("tests.perFile not recorded");
    return [...problems, ...(asks(check, "structure") ? structural : [])];
  }
  if (Array.isArray(perFile)) {
    structural.push("tests.perFile is an array, not a per-suite map");
    return [...problems, ...(asks(check, "structure") ? structural : [])];
  }

  const entries = Object.entries(perFile);
  if (new Set(entries.map(([label]) => label)).size !== entries.length) {
    structural.push("tests.perFile has duplicate labels");
  }

  /*
   * THE COLLECTED INVENTORY MUST BE THE EXPECTED ONE. The counts above prove a
   * run collected something; only this proves it collected the repository.
   */
  const expected = record.expectedSuites;
  if (!Array.isArray(expected) || expected.some((x) => typeof x !== "string")) {
    structural.push("expectedSuites is not recorded as a list of suite names");
  } else {
    const want = [...expected].sort();
    const got = entries.map(([label]) => label).sort();
    const missing = want.filter((x) => !got.includes(x));
    const extra = got.filter((x) => !want.includes(x));
    if (missing.length > 0) {
      structural.push(
        `${String(missing.length)} expected suite(s) were not collected: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}`,
      );
    }
    if (extra.length > 0) {
      structural.push(
        `${String(extra.length)} collected suite(s) are not in the expected inventory: ${extra.slice(0, 6).join(", ")}${extra.length > 6 ? ", …" : ""}`,
      );
    }
  }

  for (const [label, count] of entries) {
    if (!SAFE_LABEL.test(label)) {
      structural.push(`tests.perFile has an unsafe label: ${JSON.stringify(label.slice(0, 32))}`);
    }
    if (!isCount(count)) structural.push(`tests.perFile[${label}] is not a count`);
  }
  if (entries.length !== files) {
    structural.push(
      `tests.perFile has ${String(entries.length)} entries but tests.files is ${String(files)}`,
    );
  }
  const summed = entries.reduce((a, [, n]) => a + (isCount(n) ? n : 0), 0);
  if (summed !== total) {
    structural.push(`tests.perFile sums to ${String(summed)}, not ${String(total)}`);
  }

  /*
   * THE TOTALS AND THE GATE MUST BE ONE MEASUREMENT.
   *
   * A record that says nothing failed while its own gate says six suites did is
   * not evidence, whichever half is right — so this is a consistency check and
   * a red record is held to it as well.
   */
  const gate = record.testGate;
  if (gate !== undefined) {
    /*
     * A COUNT WITHOUT IDENTITIES IS A NUMBER. The skipped count moved from 24
     * to 23 between two runs of one commit and the record could not say which
     * case had moved, because the identities were never cross-checked against
     * the count that summarised them.
     */
    const failedIds = gate.failedTests;
    if (Array.isArray(failedIds) && failedIds.length !== failed) {
      structural.push(
        `${String(failedIds.length)} failed-test identities for ${String(failed)} failed tests`,
      );
    }
    const skippedIds = gate.skippedTests;
    if (Array.isArray(skippedIds) && skippedIds.length !== skipped) {
      structural.push(
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
          structural.push(`${what} identity has an unsafe suite name`);
          continue;
        }
        if (typeof title !== "string" || title.length === 0 || title.length > 200) {
          structural.push(`${what} identity has no usable title`);
          continue;
        }
        const key = `${suite} > ${title}`;
        if (seen.has(key)) structural.push(`duplicate ${what} identity: ${suite}`);
        seen.add(key);
      }
    }
    /*
     * SAME-SOURCE DUPLICATES ONLY.
     *
     * `tests.failed` and `countedFailedTests` count the same thing — failed
     * ASSERTIONS — so they must agree, and a disagreement is a malformed
     * record. Failed suite results, runtime-error suites, `reportSuccess` and
     * the process status count different things, and requiring them to agree
     * with the assertion count made every genuine suite-level failure look
     * structurally broken. That is what happened at `ddefa50`.
     */
    const counted = gate.countedFailedTests;
    if (isCount(counted) && counted !== failed) {
      structural.push(
        `tests.failed is ${String(failed)} but countedFailedTests is ${String(counted)} — the same measurement recorded twice, differently`,
      );
    }
    const reported = gate.reportedFailedTests;
    if (isCount(reported) && reported !== failed) {
      structural.push(
        `tests.failed is ${String(failed)} but reportedFailedTests is ${String(reported)} — the same measurement recorded twice, differently`,
      );
    }
  }

  /*
   * THE VERDICT STRING IS THE SAME MEASUREMENT AS THE NUMBERS.
   *
   * Only when it IS a test verdict. A red run records `FAILED — …` there, which
   * is a correct statement of what happened and not a rendering of the totals;
   * comparing it against the canonical rendering would fail every red record
   * for a reason that is not a structural fault.
   */
  /*
   * THE VERDICT IS A RENDERING OF THE NUMBERS BESIDE IT — IN EITHER OUTCOME.
   *
   * A green run renders one canonical shape and a red run renders another. Both
   * are built from these same measurements, so both can be checked against
   * them, and anything that is neither is prose that got into a field where a
   * measurement belongs. "BROKEN" and "8 FOUND" both passed a check that only
   * looked for the word FAILED.
   *
   * An earlier edition exempted anything beginning with FAILED, which meant a
   * red verdict could say whatever it liked — including numbers that
   * contradicted the record it sat in.
   */
  const verdict = record.gates?.["pnpm test"];
  const verdictGate = record.testGate;
  const green = renderTestVerdict({ passed, skipped, failed, files });
  const red = renderFailedVerdict({
    passed,
    skipped,
    failed,
    files,
    status: verdictGate?.status ?? null,
    reportSuccess: verdictGate?.reportSuccess === true,
    failedSuites: verdictGate?.reportedFailedSuites ?? 0,
    runtimeErrorSuites: verdictGate?.runtimeErrorSuites ?? 0,
  });
  if (verdict === undefined) {
    structural.push("no pnpm test verdict recorded");
  } else if (verdict !== green && verdict !== red) {
    structural.push(
      `the pnpm test verdict ${JSON.stringify(verdict)} is not the canonical rendering ` +
        `of the structured results (expected ${JSON.stringify(green)} or ${JSON.stringify(red)})`,
    );
  }

  return [...problems, ...(asks(check, "structure") ? structural : [])];
}

export function cleanProcessProblems(
  p: RecordedProcess,
  label: string,
  check?: RecordCheck,
): readonly string[] {
  const problems: string[] = [];

  /*
   * PRESENCE IS STRUCTURE; THE VALUE IS ACCEPTANCE. "The runner did not record
   * it" and "the runner recorded it as fine" are different facts, and a red
   * record still has to say which of the two it means.
   */
  if (p.ok === undefined) {
    if (asks(check, "structure")) problems.push(`${label}: ok not recorded`);
  } else if (p.ok !== true && asks(check, "acceptance")) {
    problems.push(`${label}: ok is false`);
  }

  if (p.status === undefined) {
    if (asks(check, "structure")) problems.push(`${label}: status not recorded`);
  } else if (p.status !== 0 && asks(check, "acceptance")) {
    problems.push(`${label}: exit status ${String(p.status)}`);
  }

  /* `null` is a recorded absence of a signal. `undefined` is no record at all. */
  if (p.signal === undefined) {
    if (asks(check, "structure")) problems.push(`${label}: signal not recorded`);
  } else if (p.signal !== null && asks(check, "acceptance")) {
    problems.push(`${label}: signal ${p.signal}`);
  }

  if (p.errorCode === undefined) {
    if (asks(check, "structure")) problems.push(`${label}: errorCode not recorded`);
  } else if (p.errorCode !== null && asks(check, "acceptance")) {
    problems.push(`${label}: spawn error ${p.errorCode}`);
  }

  return problems;
}

/** Do two recorded process triples describe the same outcome? */
export function processTriplesAgree(
  a: Pick<RecordedProcess, "status" | "signal" | "errorCode">,
  b: Pick<RecordedProcess, "status" | "signal" | "errorCode">,
): boolean {
  return a.status === b.status && a.signal === b.signal && a.errorCode === b.errorCode;
}

export function runnerEvidenceProblems(
  t: RecordedTestGate,
  check?: RecordCheck,
): readonly string[] {
  const structural: string[] = [];
  const acceptance: string[] = [];

  /* ---- unhandled runner errors ---------------------------------------- */

  if (t.reportedUnhandledErrors === undefined || t.reportedUnhandledErrors === null) {
    structural.push("unhandled runner errors were not measured — rerun `pnpm release:gates`");
  } else if (!Number.isInteger(t.reportedUnhandledErrors) || t.reportedUnhandledErrors < 0) {
    structural.push(
      `reportedUnhandledErrors is not a count: ${JSON.stringify(t.reportedUnhandledErrors)}`,
    );
  } else if (t.reportedUnhandledErrors > 0) {
    const ids = [
      ...(t.sanitizedUnhandledErrorNames ?? []),
      ...(t.sanitizedUnhandledErrorCodes ?? []),
    ]
      .filter((x) => x !== "(none)")
      .join(", ");
    acceptance.push(
      `${String(t.reportedUnhandledErrors)} unhandled runner error(s)${ids === "" ? "" : `: ${ids}`}`,
    );
  } else {
    /*
     * ZERO MEANS BOTH LISTS ARE EMPTY. `["(none)"]` is a placeholder somebody
     * wrote where a measurement belongs, and a count of zero beside a non-empty
     * identity list is evidence disagreeing with itself.
     */
    for (const [field, value] of [
      ["sanitizedUnhandledErrorNames", t.sanitizedUnhandledErrorNames],
      ["sanitizedUnhandledErrorCodes", t.sanitizedUnhandledErrorCodes],
    ] as const) {
      if (Array.isArray(value) && value.length !== 0) {
        structural.push(
          `reportedUnhandledErrors is 0 but ${field} names ${String(value.length)} — a placeholder is not an empty measurement`,
        );
      }
    }
  }

  /* ---- the observed peak, which is a MEASUREMENT ------------------------ */

  /*
   * THE FIELD THAT HID.
   *
   * The reporter has counted peak concurrent modules — one per worker, so the
   * real concurrency — all along, and the persisted record enumerated its
   * fields explicitly and simply left this one out. Nothing noticed, because
   * the runner skipped contract validation once a gate had already failed, and
   * the first green run would have refused to publish.
   *
   * PRESENCE AND SHAPE ARE STRUCTURE. Whether a value is a plausible peak for a
   * green run is acceptance. A red record must still say what it observed.
   */
  const peak = t.observedPeakWorkers;
  if (peak === undefined || peak === null) {
    structural.push(
      "observedPeakWorkers not recorded — the reporter measures it, so an absent value means the record threw a measurement away",
    );
  } else if (!isCount(peak)) {
    structural.push(`observedPeakWorkers is not a non-negative integer: ${JSON.stringify(peak)}`);
  } else {
    if (peak > REQUIRED_WORKERS) {
      structural.push(
        `observedPeakWorkers is ${String(peak)}, above the configured maximum of ${String(REQUIRED_WORKERS)} — the pool did not honour what it was told`,
      );
    }
    if (peak < 1) {
      /*
       * A completed run executed at least one module, so a peak of zero beside
       * a non-empty result contradicts the run itself. It is not a refusal to
       * accept a green result — it is a refusal to believe the evidence.
       */
      acceptance.push(
        "observedPeakWorkers is 0 — a run that collected tests cannot have had no module executing",
      );
    }
  }

  /* ---- the report's own three facts ------------------------------------ */

  for (const [field, value] of [
    ["reportWritten", t.reportWritten],
    ["reportParsed", t.reportParsed],
    ["reportCompleted", t.reportCompleted],
  ] as const) {
    if (value === undefined) structural.push(`${field} not recorded`);
    else if (value !== true) acceptance.push(`${field} is false`);
  }

  /*
   * TYPES BEFORE VALUES. A string has a `length`, so a field that should be an
   * array and is not would otherwise be read for one.
   */
  for (const [field, value] of [
    ["sanitizedUnhandledErrorNames", t.sanitizedUnhandledErrorNames],
    ["sanitizedUnhandledErrorCodes", t.sanitizedUnhandledErrorCodes],
    ["failedSuiteNames", t.failedSuiteNames],
    ["failedTests", t.failedTests],
    ["skippedTests", t.skippedTests],
    ["reasons", t.reasons],
  ] as const) {
    if (!Array.isArray(value)) structural.push(`${field} is not an array`);
  }

  /* Zero unhandled errors and a non-empty identity list cannot both be true. */
  const unhandled = t.reportedUnhandledErrors;
  const names = Array.isArray(t.sanitizedUnhandledErrorNames) ? t.sanitizedUnhandledErrorNames : [];
  const codes = Array.isArray(t.sanitizedUnhandledErrorCodes) ? t.sanitizedUnhandledErrorCodes : [];
  const identified =
    names.filter((n) => n !== "(none)").length + codes.filter((c) => c !== "(none)").length;
  if (unhandled === 0 && identified > 0) {
    structural.push("reportedUnhandledErrors is 0 but unhandled-error identities were recorded");
  }
  if (isCount(unhandled) && unhandled > 0 && identified === 0) {
    structural.push(
      `reportedUnhandledErrors is ${String(unhandled)} but no identity was recorded for any of them`,
    );
  }

  /*
   * The three process facts under their explicit names, cross-checked against
   * the ones already recorded. A record that disagrees with itself is not
   * evidence, whichever half is right — structure, not acceptance.
   */
  if (t.processStatus === undefined) structural.push("processStatus not recorded");
  else if (t.processStatus !== t.status) {
    structural.push(
      `processStatus ${String(t.processStatus)} disagrees with status ${String(t.status)}`,
    );
  }
  if (t.processSignal === undefined) structural.push("processSignal not recorded");
  else if (t.processSignal !== (t.signal ?? null)) {
    structural.push("processSignal disagrees with signal");
  }
  if (t.processErrorCode === undefined) structural.push("processErrorCode not recorded");
  else if (t.processErrorCode !== (t.errorCode ?? null)) {
    structural.push("processErrorCode disagrees with errorCode");
  }

  /* ---- the bound this release claims ------------------------------------ */

  /*
   * THE CONCURRENCY BOUND IS PART OF THE ACCEPTANCE, NOT A NOTE ON IT.
   *
   * The runner-level exit was reproduced under the pool's default sizing and
   * has not been reproduced under four workers. That correction is only worth
   * anything if the record proves the run it describes actually used it. Being
   * RECORDED is structure; being the required value is acceptance.
   */
  if (t.phase === undefined) structural.push("phase not recorded");
  else if (t.phase !== REQUIRED_PHASE) {
    acceptance.push(`phase is ${JSON.stringify(t.phase)}, not ${JSON.stringify(REQUIRED_PHASE)}`);
  }

  if (t.workerPool === undefined || t.workerPool === null) {
    structural.push("workerPool not recorded");
  } else if (t.workerPool !== REQUIRED_POOL) {
    acceptance.push(`workerPool is ${JSON.stringify(t.workerPool)}, not ${REQUIRED_POOL}`);
  }

  /*
   * BOTH BOUNDS, AND THEY ARE CONFIGURATION — never an observed concurrency.
   * The forks pool keeps `minWorkers` processes alive independently of
   * `maxWorkers`, so a ceiling alone does not describe the pool.
   */
  for (const [field, value] of [
    ["workerCount", t.workerCount],
    ["configuredMinWorkers", t.configuredMinWorkers],
    ["configuredMaxWorkers", t.configuredMaxWorkers],
  ] as const) {
    if (value === undefined || value === null) {
      structural.push(`${field} not recorded — the run may have been unbounded`);
    } else if (!isCount(value)) {
      structural.push(`${field} is not a count: ${JSON.stringify(value)}`);
    } else if (value !== REQUIRED_WORKERS) {
      acceptance.push(
        `${field} is ${String(value)}, not ${String(REQUIRED_WORKERS)} — ` +
          `this record did not come from a run bounded the way the release claims`,
      );
    }
  }

  /* The observed peak may not exceed what the pool was configured for. */
  if (isCount(peak) && isCount(t.configuredMaxWorkers) && peak > t.configuredMaxWorkers) {
    structural.push(
      `observedPeakWorkers is ${String(peak)}, above the configured maximum of ${String(t.configuredMaxWorkers)} recorded beside it`,
    );
  }

  const runner = t.runner;
  if (runner === undefined || runner === null) structural.push("runner not recorded");
  else if (!RUNNER_IDENTITY.test(runner)) {
    structural.push(
      `runner identity is not a bounded name and version: ${JSON.stringify(runner.slice(0, 40))}`,
    );
  }

  if (check === "structure") return structural;
  if (check === "acceptance") return acceptance;
  return [...structural, ...acceptance];
}

/**
 * Which contract a record is being read under.
 *
 * `operational` is the file on disk beside the lock: it must name the operation
 * that produced it, because a record left by an operation that lost the mutex
 * has to be distinguishable from one left by the operation that held it.
 * `staged` is the projection that goes into the archive: it must NOT carry the
 * random operation id or any other volatile value, because two identical green
 * runs at one commit would otherwise produce different archive bytes.
 *
 * Both require every measurement. The difference is operational identity, not
 * strictness.
 */
export type RecordMode = "operational" | "staged";

/** Every reason the LOCAL operational record may not be used. */
export function gateRecordProblems(record: GateRecord | null, head: string): readonly string[] {
  return recordProblems(record, head, "operational");
}

/**
 * Every reason the record is not EVIDENCE, whether or not it is green.
 *
 * Every completed attempt is held to this, red ones included. A red record may
 * correctly fail green acceptance; it may not omit a measurement, contradict
 * itself, or carry a field of the wrong type. The runner used to skip contract
 * validation altogether once a gate had failed — because a red record was
 * expected to fail it — and that is how `observedPeakWorkers` was computed for
 * weeks and never written down.
 */
export function structuralRecordProblems(
  record: GateRecord | null,
  head: string,
  mode: RecordMode = "operational",
): readonly string[] {
  return recordProblems(record, head, mode, "structure");
}

/**
 * Every reason the STAGED projection may not be shipped.
 *
 * Identical to the operational contract except that operational identity is
 * forbidden rather than required, and the deterministic identity of the
 * measured tree is required in its place.
 */
export function stagedRecordProblems(record: GateRecord | null, head: string): readonly string[] {
  return recordProblems(record, head, "staged");
}

function recordProblems(
  record: GateRecord | null,
  head: string,
  mode: RecordMode,
  check?: RecordCheck,
): readonly string[] {
  /*
   * THE LIFECYCLE STATES COME FIRST AND ARE NEITHER CATEGORY.
   *
   * A missing file, a tombstone and an in-progress marker are not records at
   * all, so there is nothing to check the structure of and nothing to accept.
   */
  if (record === null)
    return [`${GATE_RECORD_PATH} is missing or unreadable — run \`pnpm release:gates\``];

  if (isAbandoned(record)) {
    return [
      "the canonical result was tombstoned by an explicit recovery: an operation was " +
        "interrupted and its result deliberately invalidated. Nothing is packageable " +
        "until a new gate completes — run `pnpm release:gates`.",
    ];
  }

  if (isInProgress(record)) {
    const id = (record as { operationId?: unknown }).operationId;
    const owner = isOperationId(id)
      ? ` (operation ${id})`
      : " (by an operation that did not identify itself)";
    return [
      `a gate operation was started and did not finish${owner}. The previous result ` +
        "was invalidated when it began, and nothing has replaced it — run " +
        "`pnpm release:gates` again.",
    ];
  }

  const structural: string[] = [];
  const acceptance: string[] = [];

  const operationId = (record as { operationId?: unknown }).operationId;
  if (mode === "operational") {
    /*
     * WHICH OPERATION PRODUCED THIS. Without it a record is anonymous: nothing
     * connects the bytes on disk to the run that measured them.
     */
    if (!isOperationId(operationId)) {
      structural.push(
        "the record does not name the operation that produced it — rerun `pnpm release:gates`",
      );
    }
  } else if (operationId !== undefined) {
    structural.push(
      "the staged projection carries an operation id — a random value in the archive makes " +
        "two identical runs at one commit produce different bytes",
    );
  }

  /*
   * WHAT WAS MEASURED, NOT MERELY WHERE. A record bound only to HEAD cannot
   * tell a clean commit from the same commit measured with uncommitted edits in
   * place, and reverting the edits afterwards leaves every other check happy.
   */
  for (const [field, value] of [
    ["treeId", record.treeId],
    ["inputsDigest", record.inputsDigest],
  ] as const) {
    if (typeof value !== "string" || !/^[0-9a-f]{40,64}$/.test(value)) {
      structural.push(
        `${field} is not recorded as a digest — the record is not bound to the bytes it measured`,
      );
    }
  }
  if (typeof record.suiteInventoryDigest !== "string" || record.suiteInventoryDigest === "") {
    structural.push("suiteInventoryDigest is not recorded — a filtered run would look complete");
  }

  if (record.head !== head) {
    structural.push(
      `recorded at ${String(record.head).slice(0, 7) || "nothing"}, not at ${head.slice(0, 7)} — rerun \`pnpm release:gates\``,
    );
  }

  for (const gate of REQUIRED_GATES) {
    const outcome = record.gates?.[gate];
    if (outcome === undefined) {
      structural.push(`${gate}: no result recorded`);
      continue;
    }
    /*
     * Case-SENSITIVE, and deliberately. The runner writes the literal word
     * FAILED for a failure, while a clean test gate reads "… 0 failed / 45
     * files" — a case-insensitive match rejected every green record it saw.
     */
    if (/FAILED/.test(outcome)) acceptance.push(`${gate}: ${outcome}`);

    /*
     * AND the verdict must be the canonical one, not merely free of the word
     * FAILED. "BROKEN" contains no such word and used to pass. A gate that
     * recorded a genuine failure states it here, so a non-canonical verdict is
     * only an acceptance problem when the gate did not fail.
     */
    const canonical = CANONICAL_VERDICTS[gate];
    if (canonical !== undefined && outcome !== canonical && !/FAILED/.test(outcome)) {
      acceptance.push(
        `${gate}: verdict ${JSON.stringify(outcome)} is not the canonical ${JSON.stringify(canonical)}`,
      );
    }
    /*
     * AND A RED TEST VERDICT IS AN ACCEPTANCE FAILURE ON ITS OWN.
     *
     * It is structurally valid — it says exactly what happened — and it must
     * never be packaged. Without this, a canonical red verdict beside a record
     * whose other fields were somehow clean would have nothing to refuse it.
     */
    if (gate === "pnpm test" && parseFailedVerdict(outcome) !== null) {
      acceptance.push(`pnpm test: ${outcome}`);
    }

    /* The scan gates have no process of their own; the rest must have one. */
    if (gate === CONTROL_CHARACTER_GATE) continue;
    const proc = record.processes?.[gate];
    if (proc === undefined) {
      structural.push(`${gate}: no process metadata recorded`);
      continue;
    }
    structural.push(...cleanProcessProblems(proc, gate, "structure"));
    acceptance.push(...cleanProcessProblems(proc, gate, "acceptance"));
  }

  structural.push(...testTotalsProblems(record, "structure"));
  acceptance.push(...testTotalsProblems(record, "acceptance"));
  structural.push(
    ...scanProblems(record.controlCharacterScan, "controlCharacterScan", "structure"),
  );
  acceptance.push(
    ...scanProblems(record.controlCharacterScan, "controlCharacterScan", "acceptance"),
  );

  const scan = record.controlCharacterScan;
  if (scan !== undefined && typeof scan.scannedFiles === "number") {
    /*
     * The verdict must describe THIS scan, not merely look clean. Comparing
     * against the clean form alone let a dirty scan sit beside a clean sentence
     * without the mismatch being reported. Structure: the two halves are one
     * measurement whether or not it found anything.
     */
    const expected = describeScan(scan);
    const recorded = record.gates?.[CONTROL_CHARACTER_GATE];
    if (recorded !== expected) {
      structural.push(
        `${CONTROL_CHARACTER_GATE}: verdict ${JSON.stringify(recorded)} does not match the structured evidence (expected ${JSON.stringify(expected)})`,
      );
    }
  }

  const t = record.testGate;
  if (t === undefined) {
    structural.push("no sanitized test-gate record");
  } else {
    /* ---- what the report said, which is a result rather than a shape ---- */
    if (t.reportSuccess === undefined) structural.push("reportSuccess not recorded");
    else if (t.reportSuccess !== true) {
      acceptance.push(`test report success=${String(t.reportSuccess)}`);
    }
    for (const [field, value, describe] of [
      [
        "reportedFailedTests",
        t.reportedFailedTests,
        (n: number) => `test report names ${String(n)} failed test(s)`,
      ],
      [
        "countedFailedTests",
        t.countedFailedTests,
        (n: number) => `${String(n)} failed test(s) counted from results`,
      ],
      [
        "reportedFailedSuites",
        t.reportedFailedSuites,
        (n: number) => `test report names ${String(n)} failed suite(s)`,
      ],
      [
        "runtimeErrorSuites",
        t.runtimeErrorSuites,
        (n: number) => `${String(n)} suite(s) failed with no failed assertion`,
      ],
    ] as const) {
      if (value === undefined || value === null) structural.push(`${field} not recorded`);
      else if (!isCount(value)) structural.push(`${field} is not a count`);
      else if (value !== 0) acceptance.push(describe(value));
    }

    if (t.failedSuiteNames === undefined) {
      structural.push("no failed-suite identities recorded");
    } else if (t.failedSuiteNames.length !== 0) {
      acceptance.push(`failing suite(s): ${t.failedSuiteNames.join(", ")}`);
    }
    if (t.failedTests === undefined) {
      structural.push("no failed-test identities recorded — rerun `pnpm release:gates`");
    } else if (t.failedTests.length !== 0) {
      acceptance.push(
        `failing test(s): ${t.failedTests.map((f) => `${f.suite} > ${f.title}`).join("; ")}`,
      );
    }
    if (t.skippedTests === undefined) {
      structural.push("no skipped-test identities recorded — rerun `pnpm release:gates`");
    }

    /*
     * THE TEST GATE'S OWN PROCESS, RECORDED THREE TIMES.
     *
     * The same outcome sits in `processes["pnpm test"]`, in the `testGate`
     * triple, and in the `processStatus/Signal/ErrorCode` triple. Copies
     * checked separately are copies that can disagree, and this contract once
     * accepted a record whose spawned process said status 0 while both
     * `testGate` copies said 1.
     */
    structural.push(...cleanProcessProblems(t, "test gate", "structure"));
    acceptance.push(...cleanProcessProblems(t, "test gate", "acceptance"));
    structural.push(
      ...cleanProcessProblems(
        {
          ok: t.ok,
          status: t.processStatus,
          signal: t.processSignal,
          errorCode: t.processErrorCode,
        },
        "test gate (process fields)",
        "structure",
      ).filter((m) => !m.includes(": ok ")),
    );
    acceptance.push(
      ...cleanProcessProblems(
        {
          ok: t.ok,
          status: t.processStatus,
          signal: t.processSignal,
          errorCode: t.processErrorCode,
        },
        "test gate (process fields)",
        "acceptance",
      ).filter((m) => !m.includes(": ok ")),
    );

    const own = { status: t.status, signal: t.signal, errorCode: t.errorCode };
    const copy = {
      status: t.processStatus,
      signal: t.processSignal,
      errorCode: t.processErrorCode,
    };
    if (!processTriplesAgree(own, copy)) {
      structural.push("the test gate's two process triples disagree with each other");
    }
    const spawned = record.processes?.["pnpm test"];
    if (spawned === undefined) structural.push("no spawned-process record for pnpm test");
    else if (!processTriplesAgree(own, spawned)) {
      structural.push("the test gate disagrees with the process that ran it");
    }

    structural.push(...runnerEvidenceProblems(t, "structure"));
    acceptance.push(...runnerEvidenceProblems(t, "acceptance"));

    if (t.reasons === undefined) structural.push("no gate reasons recorded");
    else if (t.reasons.length !== 0) {
      acceptance.push(`test gate not clean: ${t.reasons.join("; ")}`);
    }
  }

  if (check === "structure") return structural;
  if (check === "acceptance") return acceptance;
  return [...structural, ...acceptance];
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
/** `0 in 339 files` or `8 FOUND in 3 file(s)` — the scan's own two shapes. */
const SCAN_VERDICT = /^(\d{1,7} in \d{1,7} files|\d{1,7} FOUND in \d{1,7} file\(s\))$/;

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
    const raw = record.gates?.[gate];
    /*
     * THE DEFECT THIS EXISTS TO PREVENT.
     *
     * `safeText` refuses slash-containing strings because a path is
     * slash-shaped, and the canonical test verdict ends "/ 45 files". So the
     * key was dropped, silently, and the delivered `c1b80f0` archive shipped a
     * staged record with no `pnpm test` gate at all — one its own contract
     * would have rejected, had anything validated the projection.
     *
     * The fix is recognition, not permission: the two measurement-derived
     * verdicts are matched against their exact canonical shapes, and everything
     * else still goes through the generic filter unchanged.
     */
    /*
     * BOTH CANONICAL SHAPES. A green verdict ends "/ 45 files"; a red one is
     * rendered from the same numbers plus the four facts that distinguish a
     * suite-level failure from an assertion failure. Neither is prose, and
     * neither can carry a path, a message or an environment value: every field
     * in both is a number or a fixed word.
     *
     * A red record whose verdict cannot be projected has a projection that can
     * never be structurally valid, which is how structural validation of a red
     * attempt became impossible to pass.
     */
    if (gate === "pnpm test" && isCanonicalTestVerdict(raw)) {
      gates[gate] = raw as string;
      continue;
    }
    if (gate === CONTROL_CHARACTER_GATE && typeof raw === "string" && SCAN_VERDICT.test(raw)) {
      gates[gate] = raw;
      continue;
    }
    const verdict = safeText(raw, 120);
    if (verdict !== null) gates[gate] = verdict;
  }

  const scan = record.controlCharacterScan;

  return {
    /*
     * THE OPERATION ID IS DELIBERATELY ABSENT.
     *
     * It is a random 16-hex value, so carrying it here made two identical green
     * runs at one commit produce different archive bytes — while the package
     * claimed to be reproducible from tracked inputs. Ownership needs it;
     * measurement evidence does not. What replaces it is the identity of the
     * bytes that were measured, which is the same for every run of the same
     * tree and is what reproducibility is actually about.
     */
    head: bounded(record.head, 40),
    branch: safeText(record.branch, 64),
    treeId: bounded(record.treeId, 64),
    inputsDigest: bounded(record.inputsDigest, 64),
    suiteInventoryDigest: bounded(record.suiteInventoryDigest, 64),
    expectedSuites: stageStrings(record.expectedSuites, 64),
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
      configuredMinWorkers: isCount(t?.configuredMinWorkers) ? t.configuredMinWorkers : null,
      configuredMaxWorkers: isCount(t?.configuredMaxWorkers) ? t.configuredMaxWorkers : null,
      observedPeakWorkers: isCount(t?.observedPeakWorkers) ? t.observedPeakWorkers : null,
      reasons: stageStrings(t?.reasons, 160),
      /* durationMs is deliberately absent. See the note above. */
    },
    controlCharacterScan: {
      /*
       * COMPLETENESS TRAVELS WITH THE RESULT. A staged scan that carried only
       * what it read, and not what it was asked to read, could not express the
       * difference between "checked everything" and "could not open eleven".
       */
      requestedFiles: isCount(scan?.requestedFiles) ? scan.requestedFiles : null,
      scannedFiles: isCount(scan?.scannedFiles) ? scan.scannedFiles : null,
      readFailures: isCount(scan?.readFailures) ? scan.readFailures : null,
      unreadableFiles: stageStrings(scan?.unreadableFiles, 120),
      foundCharacters: isCount(scan?.foundCharacters) ? scan.foundCharacters : null,
      affectedFiles: stageStrings(scan?.affectedFiles, 120),
    },
    processes,
    gates,
  };
}

/**
 * The evidence a package is built from: validated, projected, validated again.
 *
 * ## Why capture exists
 *
 * The old flow read `.release/gate-results.json`, validated THAT object, and
 * then separately called `sanitizedRecord` to produce what actually went into
 * the archive. Two different objects, one validated and one shipped. When the
 * projection dropped the `pnpm test` verdict, nothing noticed: the thing that
 * passed the contract was not the thing that was staged.
 *
 * Now there is one object. It is read once, checked, projected, and the
 * PROJECTION is checked by the same contract before anything may use it. What
 * the documents render from and what the archive contains are the same bytes,
 * and both have satisfied the release contract.
 */
export interface CapturedEvidence {
  /** The sanitized projection — the only object a build may stage or render. */
  readonly staged: StagedRecord;
  /** Exactly the bytes written into the archive. */
  readonly json: string;
  readonly head: string;
}

/** The projection's shape, so callers cannot mistake it for the source. */
export type StagedRecord = ReturnType<typeof sanitizedRecord>;

export class EvidenceRefused extends Error {}

/**
 * Read once, validate, project, validate the projection, freeze.
 *
 * Both validations use the SAME contract. A projection that would be refused as
 * a record is refused as a projection — which is the check the delivered
 * archive did not have.
 */
/**
 * The repository's own secret patterns, applied to the finished bytes.
 *
 * ONE DEFINITION, LOADED FROM DISK. This list used to be typed out here beside
 * a second copy in `scripts/secret-audit.mjs`, under a test that asserted the
 * two stayed synchronised — and never read the auditor. They had diverged:
 * this copy carried a wider assignment rule the auditor did not have. Both
 * systems now read `secret-patterns.json`, so the claim is structural.
 *
 * An allowlisted FIELD is not a licence for its VALUE. Every field in the
 * projection is one somebody decided was safe to carry, and a decision about a
 * field name says nothing about what ends up inside it. So the serialized
 * result goes through the detector, and a match refuses the build rather than
 * reporting what matched.
 */
export const SECRET_PATTERNS_FILE = "scripts/release/secret-patterns.json";

interface SecretRule {
  readonly name: string;
  readonly pattern: string;
  readonly scopes: readonly string[];
}

export function secretRules(scope: string): readonly { name: string; pattern: RegExp }[] {
  const raw = readFileSync(join(REPO_ROOT_FOR_PATTERNS, SECRET_PATTERNS_FILE), "utf8");
  const doc = JSON.parse(raw) as { rules: readonly SecretRule[] };
  return doc.rules
    .filter((r) => r.scopes.includes(scope))
    .map((r) => ({ name: r.name, pattern: new RegExp(r.pattern) }));
}

/** Which patterns match these bytes. Names only — never what matched. */
export function secretPatternsIn(text: string): readonly string[] {
  return secretRules("staged")
    .filter((r) => r.pattern.test(text))
    .map((r) => r.name);
}

export function captureEvidence(record: GateRecord | null, head: string): CapturedEvidence {
  const sourceProblems = gateRecordProblems(record, head);
  if (sourceProblems.length > 0) {
    throw new EvidenceRefused(
      `the gate record is not current and clean:\n${sourceProblems.map((x) => `  ${x}`).join("\n")}`,
    );
  }

  const staged = sanitizedRecord(record as GateRecord);
  const stagedProblems = stagedRecordProblems(staged as GateRecord, head);
  if (stagedProblems.length > 0) {
    throw new EvidenceRefused(
      "the SANITIZED PROJECTION does not satisfy the release contract, so the archive would " +
        "carry evidence the contract rejects:\n" +
        stagedProblems.map((x) => `  ${x}`).join("\n"),
    );
  }

  const json = `${JSON.stringify(staged, null, 2)}\n`;

  /*
   * LAST, OVER THE FINISHED BYTES. Not over the fields, and not over the
   * source — over exactly what would be written into the archive.
   */
  const matched = secretPatternsIn(json);
  if (matched.length > 0) {
    throw new EvidenceRefused(
      `the sanitized projection matches ${String(matched.length)} secret pattern(s): ${matched.join(", ")}. ` +
        `The matching text is deliberately not reported.`,
    );
  }

  return Object.freeze({ staged, json, head });
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
  "operationId",
];
