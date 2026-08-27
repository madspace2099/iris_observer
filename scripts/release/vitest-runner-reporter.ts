/**
 * A reporter that records what the JSON reporter structurally cannot.
 *
 * ## Why this file exists
 *
 * The authoritative gate at `7d941ba` recorded a real failure — exit status 1 —
 * beside a report declaring complete success: 1265 passed, 1 skipped, 0 failed
 * tests, 0 failed suites, 0 runtime-error suites. That shape looked like a
 * fault in the runner for three milestones. It is not. Vitest 3.2.7's own
 * source says exactly what produces it:
 *
 *     // JsonReporter
 *     async onFinished(files = …, _errors = [], coverageMap) { … }
 *     const success = !!(files.length > 0 || passWithNoTests)
 *                     && numFailedTestSuites === 0 && numFailedTests === 0;
 *
 *     // Vitest
 *     _checkUnhandledErrors(errors) {
 *       if (errors.length && !config.dangerouslyIgnoreUnhandledErrors)
 *         process.exitCode = 1;
 *     }
 *
 * The JSON reporter takes the unhandled-error list as `_errors` and DISCARDS
 * it; its `success` field is computed without reference to it; and the object
 * it writes has no field for it at all. So an unhandled error sets the exit
 * code and leaves no trace whatsoever in the only artefact the gate was
 * reading. The gate was not wrong to fail — it was blind to the one condition
 * that could explain why.
 *
 * Every other `process.exitCode = 1` path in Vitest either implies a failed
 * test or suite (which `success` would then report), or aborts before a report
 * with 43 files could be written. This is the only one that is compatible with
 * the recorded shape.
 *
 * ## What it may write
 *
 * IDENTITY ONLY, on the same terms as every other persisted gate field: a
 * bounded, character-restricted error class name and a bounded machine code
 * such as `ERR_IPC_CHANNEL_CLOSED`. Never a message, a stack, a path, a URL,
 * stdout, stderr, an environment value, or an expected/received value — an
 * unhandled error's message is arbitrary text from a process that may have
 * touched anything, and this file's output is staged into an archive.
 *
 * The allow-list is the guarantee. A name that is not a plain identifier does
 * not get shortened or escaped; it is replaced outright.
 */

import { writeFileSync } from "node:fs";

/** Longest stored identity. Beyond this the value is refused, not truncated. */
const MAX_IDENTITY = 64;
/** Most distinct identities stored. A longer list is a different problem. */
const MAX_IDENTITIES = 10;

/**
 * A plain identifier, or nothing.
 *
 * Deliberately stricter than the title sanitizer used for test names: a test
 * title is authored in this repository, while an error name can come from any
 * dependency and, for a thrown non-Error, can be arbitrary text. Anything that
 * is not `[A-Za-z0-9_.$-]{1,64}` is replaced rather than cleaned, so there is
 * no cleaning step for a crafted value to survive.
 */
export function safeIdentity(raw: unknown): string {
  if (typeof raw !== "string") return "(none)";
  return /^[A-Za-z0-9_.$-]{1,64}$/.test(raw) && raw.length <= MAX_IDENTITY ? raw : "(unnamed)";
}

/** Sorted, de-duplicated and bounded, so the field cannot grow without limit. */
export function boundedIdentities(all: readonly string[]): readonly string[] {
  const unique = [...new Set(all)].sort();
  return unique.length <= MAX_IDENTITIES
    ? unique
    : [
        ...unique.slice(0, MAX_IDENTITIES - 1),
        `and ${String(unique.length - (MAX_IDENTITIES - 1))} more`,
      ];
}

export interface RunnerDiagnostics {
  /** How many unhandled errors Vitest collected. The exit code follows this. */
  readonly reportedUnhandledErrors: number;
  /** Bounded class names — `Error`, `TypeError`, `AggregateError`. */
  readonly sanitizedUnhandledErrorNames: readonly string[];
  /** Bounded machine codes — `ERR_IPC_CHANNEL_CLOSED`, `EPIPE`. */
  readonly sanitizedUnhandledErrorCodes: readonly string[];
  /** Vitest's own end-of-run state: `passed`, `failed` or `interrupted`. */
  readonly runState: string;
  /** How many test modules the run ended with. */
  readonly moduleCount: number;
  /** Wall time from `onInit` to `onTestRunEnd`. */
  readonly durationMs: number;
  /** The pool that actually ran the tests, as Vitest resolved it. */
  readonly pool: string;
  /** Resolved concurrency bound, where Vitest exposes one. */
  readonly maxWorkers: number | null;
  /** Proof this file was written by the run it claims to describe. */
  readonly completed: true;
}

interface ErrorLike {
  readonly name?: unknown;
  readonly code?: unknown;
  readonly constructor?: { readonly name?: unknown };
}

/** Reduce Vitest's error list to identities. Exported so a fixture can drive it. */
export function summarizeUnhandled(errors: readonly unknown[]): {
  names: readonly string[];
  codes: readonly string[];
} {
  const names: string[] = [];
  const codes: string[] = [];
  for (const raw of errors) {
    const e = (raw ?? {}) as ErrorLike;
    const name = typeof e.name === "string" ? e.name : e.constructor?.name;
    names.push(safeIdentity(name));
    codes.push(safeIdentity(e.code));
  }
  return { names: boundedIdentities(names), codes: boundedIdentities(codes) };
}

/**
 * Written to the path in `OBSERVER_RUNNER_DIAGNOSTICS`, or nowhere.
 *
 * Opt-in by environment rather than always-on, so an ordinary `pnpm test` is
 * unchanged and nothing appears on disk unless a caller asked for it.
 */
export default class RunnerDiagnosticsReporter {
  private start = Date.now();
  private pool = "unknown";
  private maxWorkers: number | null = null;

  onInit(ctx: unknown): void {
    this.start = Date.now();
    const config = (ctx as { config?: Record<string, unknown> } | undefined)?.config;
    const pool = config?.["pool"];
    if (typeof pool === "string") this.pool = pool;
    const workers = config?.["maxWorkers"];
    if (typeof workers === "number") this.maxWorkers = workers;
  }

  onTestRunEnd(
    testModules: readonly unknown[],
    unhandledErrors: readonly unknown[],
    reason: unknown,
  ): void {
    const out = process.env["OBSERVER_RUNNER_DIAGNOSTICS"];
    if (out === undefined || out === "") return;

    const { names, codes } = summarizeUnhandled(unhandledErrors);
    const diagnostics: RunnerDiagnostics = {
      reportedUnhandledErrors: unhandledErrors.length,
      sanitizedUnhandledErrorNames: names,
      sanitizedUnhandledErrorCodes: codes,
      runState: safeIdentity(reason),
      moduleCount: testModules.length,
      durationMs: Date.now() - this.start,
      pool: this.pool,
      maxWorkers: this.maxWorkers,
      completed: true,
    };
    writeFileSync(out, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
  }
}
