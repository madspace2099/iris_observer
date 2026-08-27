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
import { createHash } from "node:crypto";
import { freemem, totalmem } from "node:os";

/** Longest stored identity. Beyond this the value is refused, not truncated. */
const MAX_IDENTITY = 40;

/**
 * A name or code, in the shape real ones have.
 *
 * NO HYPHEN, and this is the correction the suite's own fixture forced. The
 * first version of this allowed `[A-Za-z0-9_.$-]{1,64}`, which admits
 * `sk-proj-…` in full — an allow-list wide enough to pass a credential is not
 * an allow-list. Node's error codes and V8's class names are words joined by
 * underscores or nothing at all: `Error`, `TypeError`, `AggregateError`,
 * `ERR_IPC_CHANNEL_CLOSED`, `ENOENT`, `EPIPE`.
 */
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.$]{0,39}$/;

/**
 * And no long unbroken run, which is the shape a token has and a name does not.
 *
 * `sb_secret_…` would satisfy the identifier rule — underscores and letters —
 * so shape alone is not enough. Every real code and class name here is words
 * with separators: the longest run in `ERR_IPC_CHANNEL_CLOSED` is seven, and
 * `AggregateError` is fourteen. A credential is one continuous run.
 */
const TOKEN_RUN = /[A-Za-z0-9]{16,}/;
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
  if (raw.length > MAX_IDENTITY) return "(unnamed)";
  if (!IDENTIFIER.test(raw)) return "(unnamed)";
  if (TOKEN_RUN.test(raw)) return "(unnamed)";
  return raw;
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

/**
 * The one message shape this file is allowed to read anything out of.
 *
 * Vitest's RPC layer throws `[vitest-worker]: Timeout calling "onTaskUpdate"` —
 * an entirely machine-generated sentence with no user content in it, and the
 * two things worth keeping are the subsystem and the method. An ALLOW-LIST
 * rather than a parse: a message that does not match this exact shape yields
 * nothing at all, so there is no extraction step for another message to be
 * dragged through. The method name is additionally re-checked by
 * {@link safeIdentity} before it is stored.
 */
const RPC_TIMEOUT =
  /^\[(vitest-worker|vitest-pool|vitest-browser)\]: Timeout calling "([A-Za-z]{1,40})"$/;

/** A stable handle for "this error again", carrying none of the error. */
function fingerprint(subsystem: string, operation: string, name: string, code: string): string {
  return createHash("sha256")
    .update([subsystem, operation, name, code].join("|"))
    .digest("hex")
    .slice(0, 12);
}

export interface RunnerDiagnostics {
  /** How many unhandled errors Vitest collected. The exit code follows this. */
  readonly reportedUnhandledErrors: number;
  /** Bounded class names — `Error`, `TypeError`, `AggregateError`. */
  readonly sanitizedUnhandledErrorNames: readonly string[];
  /** Bounded machine codes — `ERR_IPC_CHANNEL_CLOSED`, `EPIPE`, or `(none)`. */
  readonly sanitizedUnhandledErrorCodes: readonly string[];
  /**
   * Owning subsystem, from Vitest's own vocabulary — `vitest-worker`.
   *
   * Established without a path: the value is one of three literals this file
   * allow-lists, never a module location.
   */
  readonly sanitizedUnhandledErrorSubsystems: readonly string[];
  /** The RPC method that timed out — `onTaskUpdate`. Says which phase it was. */
  readonly sanitizedUnhandledErrorOperations: readonly string[];
  /** Stable handle for "this error again". Carries none of the error. */
  readonly unhandledErrorFingerprints: readonly string[];
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
  /**
   * Least free memory sampled while the run was in progress, in MB.
   *
   * Sampled in the VITEST PARENT, which is the process that has to answer a
   * worker's RPC inside its timeout — so a low reading here and an RPC timeout
   * are two readings of one condition. It under-samples exactly when the loop
   * is starved, which makes it a floor and not an exact minimum, and that is
   * the direction that keeps it honest.
   */
  readonly minFreeMemMb: number | null;
  readonly totalMemMb: number;
  readonly memorySamples: number;
  /** Proof this file was written by the run it claims to describe. */
  readonly completed: true;
}

interface ErrorLike {
  readonly name?: unknown;
  readonly code?: unknown;
  /** Read ONLY through {@link RPC_TIMEOUT}, and never stored. */
  readonly message?: unknown;
  readonly constructor?: { readonly name?: unknown };
}

export interface UnhandledSummary {
  readonly names: readonly string[];
  readonly codes: readonly string[];
  readonly subsystems: readonly string[];
  readonly operations: readonly string[];
  readonly fingerprints: readonly string[];
}

/** Reduce Vitest's error list to identities. Exported so a fixture can drive it. */
export function summarizeUnhandled(errors: readonly unknown[]): UnhandledSummary {
  const names: string[] = [];
  const codes: string[] = [];
  const subsystems: string[] = [];
  const operations: string[] = [];
  const fingerprints: string[] = [];

  for (const raw of errors) {
    const e = (raw ?? {}) as ErrorLike;
    const name = safeIdentity(typeof e.name === "string" ? e.name : e.constructor?.name);
    const code = safeIdentity(e.code);

    /*
     * The ONLY thing read out of a message, and only when the whole message is
     * one exact machine-generated shape. Anything else contributes `(none)`,
     * so a message that is not this one is not parsed at all.
     */
    const matched = typeof e.message === "string" ? RPC_TIMEOUT.exec(e.message) : null;
    /*
     * The subsystem is NOT re-checked by `safeIdentity`: it contains a hyphen,
     * which that rule now refuses, and it does not need checking — the regex
     * admits three exact literals and nothing else. The operation is re-checked,
     * because `[A-Za-z]{1,40}` is a shape rather than a fixed set.
     */
    const subsystem = matched?.[1] ?? "(none)";
    const operation = matched === null ? "(none)" : safeIdentity(matched[2]);

    names.push(name);
    codes.push(code);
    subsystems.push(subsystem);
    operations.push(operation);
    fingerprints.push(fingerprint(subsystem, operation, name, code));
  }

  return {
    names: boundedIdentities(names),
    codes: boundedIdentities(codes),
    subsystems: boundedIdentities(subsystems),
    operations: boundedIdentities(operations),
    fingerprints: boundedIdentities(fingerprints),
  };
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
  private minFree: number | null = null;
  private samples = 0;
  private sampler: NodeJS.Timeout | null = null;

  onInit(ctx: unknown): void {
    this.start = Date.now();
    const config = (ctx as { config?: Record<string, unknown> } | undefined)?.config;
    const pool = config?.["pool"];
    if (typeof pool === "string") this.pool = pool;
    const workers = config?.["maxWorkers"];
    if (typeof workers === "number") this.maxWorkers = workers;

    if (process.env["OBSERVER_RUNNER_DIAGNOSTICS"] === undefined) return;
    /*
     * `unref`ed, so sampling can never be the reason a process stays alive —
     * measuring a lifecycle problem must not create one.
     */
    this.sampler = setInterval(() => {
      const free = Math.round(freemem() / 1_048_576);
      this.minFree = this.minFree === null ? free : Math.min(this.minFree, free);
      this.samples += 1;
    }, 250);
    this.sampler.unref();
  }

  onTestRunEnd(
    testModules: readonly unknown[],
    unhandledErrors: readonly unknown[],
    reason: unknown,
  ): void {
    if (this.sampler !== null) clearInterval(this.sampler);
    const out = process.env["OBSERVER_RUNNER_DIAGNOSTICS"];
    if (out === undefined || out === "") return;

    const summary = summarizeUnhandled(unhandledErrors);
    const diagnostics: RunnerDiagnostics = {
      reportedUnhandledErrors: unhandledErrors.length,
      sanitizedUnhandledErrorNames: summary.names,
      sanitizedUnhandledErrorCodes: summary.codes,
      sanitizedUnhandledErrorSubsystems: summary.subsystems,
      sanitizedUnhandledErrorOperations: summary.operations,
      unhandledErrorFingerprints: summary.fingerprints,
      runState: safeIdentity(reason),
      moduleCount: testModules.length,
      durationMs: Date.now() - this.start,
      pool: this.pool,
      maxWorkers: this.maxWorkers,
      minFreeMemMb: this.minFree,
      totalMemMb: Math.round(totalmem() / 1_048_576),
      memorySamples: this.samples,
      completed: true,
    };
    writeFileSync(out, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
  }
}
