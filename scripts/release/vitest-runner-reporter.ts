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

import { writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { freemem, totalmem } from "node:os";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { join } from "node:path";

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

/**
 * Sorted, de-duplicated and bounded — by retaining some and counting the rest.
 *
 * A fabricated "and N more" entry in an identity list is a name that identifies
 * nothing, and it made the list's length disagree with the count beside it.
 * What is dropped is now reported as a number.
 */
export interface BoundedNames {
  readonly retained: readonly string[];
  readonly omitted: number;
}

export function boundedIdentities(all: readonly string[]): BoundedNames {
  const unique = [...new Set(all)].sort();
  if (unique.length <= MAX_IDENTITIES) return { retained: unique, omitted: 0 };
  return {
    retained: unique.slice(0, MAX_IDENTITIES),
    omitted: unique.length - MAX_IDENTITIES,
  };
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
  /**
   * How many distinct values each of the five lists above had to drop.
   *
   * Recorded rather than absorbed, because the bound is this file's decision
   * and not a fact about the run. Zero is the ordinary case and is written out
   * anyway: an absent field and a field saying nothing was dropped are
   * different claims, and only one of them can be checked.
   */
  readonly sanitizedUnhandledErrorsOmitted: UnhandledOmissions;
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
  /**
   * How late the PARENT's event loop ran, in milliseconds.
   *
   * This is the measurement the diagnosis needed and did not have. A worker's
   * `onTaskUpdate` RPC is answered on this loop; if the loop is blocked past the
   * RPC deadline the call times out, and Vitest records that as an unhandled
   * error. Free memory was only ever a proxy for this — one that saturated at
   * a megabyte in runs that failed AND in runs that were clean, and therefore
   * could not discriminate. Loop delay is the thing itself.
   */
  readonly loopDelayP95Ms: number | null;
  readonly loopDelayMaxMs: number | null;
  readonly loopDelayMeanMs: number | null;
  /** Peak modules executing at once — one per worker, so the real concurrency. */
  readonly peakConcurrentModules: number;
  /**
   * Peak PGlite-heavy modules executing at once.
   *
   * Multiplied by {@link RunnerDiagnostics.pglitePeakOpen} this is the peak
   * number of WASM Postgres instances alive across the whole run — the figure
   * a worker bound actually changes, and the one a per-worker peak cannot show.
   */
  readonly peakConcurrentPgliteModules: number;
  /** Configured bound, as Vitest resolved it. */
  readonly configuredMaxWorkers: number | null;
  readonly configuredMinWorkers: number | null;
  /** Summed from every worker's own count. Must balance on a completed run. */
  readonly pgliteCreated: number | null;
  readonly pgliteClosed: number | null;
  /** The largest number alive at one moment in any single worker. */
  readonly pglitePeakOpen: number | null;
  readonly pgliteFilesReporting: number | null;
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

/**
 * How many DISTINCT values the bound dropped, per list.
 *
 * Each list is de-duplicated separately, so each can lose a different number,
 * and one shared number would be a guess about four of them. A reader adding
 * a list's length to its entry here gets the number of distinct values the run
 * actually produced — which is the claim a fabricated "and N more" entry made
 * unverifiable, because that entry was itself counted as a value.
 */
export interface UnhandledOmissions {
  readonly names: number;
  readonly codes: number;
  readonly subsystems: number;
  readonly operations: number;
  readonly fingerprints: number;
}

export interface UnhandledSummary {
  readonly names: readonly string[];
  readonly codes: readonly string[];
  readonly subsystems: readonly string[];
  readonly operations: readonly string[];
  readonly fingerprints: readonly string[];
  readonly omitted: UnhandledOmissions;
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

  const bound = {
    names: boundedIdentities(names),
    codes: boundedIdentities(codes),
    subsystems: boundedIdentities(subsystems),
    operations: boundedIdentities(operations),
    fingerprints: boundedIdentities(fingerprints),
  };
  return {
    names: bound.names.retained,
    codes: bound.codes.retained,
    subsystems: bound.subsystems.retained,
    operations: bound.operations.retained,
    fingerprints: bound.fingerprints.retained,
    omitted: {
      names: bound.names.omitted,
      codes: bound.codes.omitted,
      subsystems: bound.subsystems.omitted,
      operations: bound.operations.omitted,
      fingerprints: bound.fingerprints.omitted,
    },
  };
}

/**
 * Written to the path in `OBSERVER_RUNNER_DIAGNOSTICS`, or nowhere.
 *
 * Opt-in by environment rather than always-on, so an ordinary `pnpm test` is
 * unchanged and nothing appears on disk unless a caller asked for it.
 */
/**
 * The suites that boot a WASM Postgres, by BASENAME.
 *
 * A basename, never a path: the same rule every other identity in this file
 * follows. It is a list rather than a heuristic because "does this file import
 * PGlite" is not something a reporter can ask, and a wrong guess here would
 * silently mis-state the concurrency the whole comparison turns on.
 * `pglite-lifecycle.test.ts` is included — it opens real instances too.
 */
export const PGLITE_SUITES: readonly string[] = [
  "activate.test.ts",
  "activation-credential.test.ts",
  "admin.test.ts",
  "ai-readiness.test.ts",
  "analytics-events.test.ts",
  "audit-contract.test.ts",
  "authenticate.test.ts",
  "contract-readiness.test.ts",
  "credential-grants.test.ts",
  "cron-health.test.ts",
  "heartbeat.test.ts",
  "http-proof.test.ts",
  "ingest.test.ts",
  "journey.test.ts",
  "model-budget-grants.test.ts",
  "operations.test.ts",
  "pglite-adapter.test.ts",
  "pglite-lifecycle.test.ts",
  "source-operations.test.ts",
  "source-spine-grants.test.ts",
];

/** True when a Vitest module is one of {@link PGLITE_SUITES}. */
export function isPgliteModule(module: unknown): boolean {
  const id = (module as { moduleId?: unknown } | undefined)?.moduleId;
  if (typeof id !== "string") return false;
  const base = id.split(/[\\/]/).pop() ?? "";
  return PGLITE_SUITES.includes(base);
}

/** What one worker recorded about its own PGlite instances. */
interface PgliteStats {
  readonly created?: unknown;
  readonly closed?: unknown;
  readonly peakOpen?: unknown;
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Collect what the workers wrote, then remove it.
 *
 * Each worker writes its own file, so nothing depends on concurrent appends
 * being atomic. The files carry three integers each — no name, no path, no
 * output — and are deleted once summed.
 */
function collectPgliteStats(dir: string): {
  created: number;
  closed: number;
  peakOpen: number;
  files: number;
} | null {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  let created = 0;
  let closed = 0;
  let peakOpen = 0;
  let files = 0;
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const s = JSON.parse(readFileSync(join(dir, name), "utf8")) as PgliteStats;
      created += count(s.created);
      closed += count(s.closed);
      peakOpen = Math.max(peakOpen, count(s.peakOpen));
      files += 1;
    } catch {
      /* A malformed file is not evidence; it is also not a reason to stop. */
    }
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Diagnostic scratch. Failing to remove it must not fail the run. */
  }
  return { created, closed, peakOpen, files };
}

export default class RunnerDiagnosticsReporter {
  private start = Date.now();
  private pool = "unknown";
  private maxWorkers: number | null = null;
  private minWorkers: number | null = null;
  private minFree: number | null = null;
  private samples = 0;
  private sampler: NodeJS.Timeout | null = null;
  private loop: IntervalHistogram | null = null;
  private running = 0;
  private peakModules = 0;
  private runningPglite = 0;
  private peakPgliteModules = 0;

  onInit(ctx: unknown): void {
    this.start = Date.now();
    const config = (ctx as { config?: Record<string, unknown> } | undefined)?.config;
    const pool = config?.["pool"];
    if (typeof pool === "string") this.pool = pool;
    const workers = config?.["maxWorkers"];
    if (typeof workers === "number") this.maxWorkers = workers;
    const least = config?.["minWorkers"];
    if (typeof least === "number") this.minWorkers = least;

    if (process.env["OBSERVER_RUNNER_DIAGNOSTICS"] === undefined) return;

    /*
     * 10 ms resolution: the RPC deadline is measured in seconds, so anything
     * finer would be recording scheduler noise rather than the stalls that
     * miss it.
     */
    this.loop = monitorEventLoopDelay({ resolution: 10 });
    this.loop.enable();
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

  /*
   * One module runs per worker at a time, so the peak number executing at once
   * IS the peak worker count. Vitest exposes no other way to observe what the
   * pool actually did, as opposed to what it was configured to do.
   *
   * The PGlite-heavy modules are counted separately, because the concurrency
   * that matters is not how many workers exist but how many are each holding a
   * WASM Postgres. A per-worker peak cannot show that: it reads 3 at every
   * setting, since the bound changes how many workers there are and not what
   * one of them does.
   */
  onTestModuleStart(module: unknown): void {
    this.running += 1;
    this.peakModules = Math.max(this.peakModules, this.running);
    if (isPgliteModule(module)) {
      this.runningPglite += 1;
      this.peakPgliteModules = Math.max(this.peakPgliteModules, this.runningPglite);
    }
  }

  onTestModuleEnd(module: unknown): void {
    this.running = Math.max(0, this.running - 1);
    if (isPgliteModule(module)) this.runningPglite = Math.max(0, this.runningPglite - 1);
  }

  onTestRunEnd(
    testModules: readonly unknown[],
    unhandledErrors: readonly unknown[],
    reason: unknown,
  ): void {
    if (this.sampler !== null) clearInterval(this.sampler);
    const loop = this.loop;
    if (loop !== null) loop.disable();
    const ms = (n: number): number => Math.round((n / 1_000_000) * 100) / 100;
    const statsDir = process.env["OBSERVER_PGLITE_STATS"];
    const stats = statsDir === undefined ? null : collectPgliteStats(statsDir);
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
      sanitizedUnhandledErrorsOmitted: summary.omitted,
      runState: safeIdentity(reason),
      moduleCount: testModules.length,
      durationMs: Date.now() - this.start,
      pool: this.pool,
      maxWorkers: this.maxWorkers,
      minFreeMemMb: this.minFree,
      totalMemMb: Math.round(totalmem() / 1_048_576),
      memorySamples: this.samples,
      loopDelayP95Ms: loop === null ? null : ms(loop.percentile(95)),
      loopDelayMaxMs: loop === null ? null : ms(loop.max),
      loopDelayMeanMs: loop === null ? null : ms(loop.mean),
      peakConcurrentModules: this.peakModules,
      peakConcurrentPgliteModules: this.peakPgliteModules,
      configuredMaxWorkers: this.maxWorkers,
      configuredMinWorkers: this.minWorkers,
      pgliteCreated: stats?.created ?? null,
      pgliteClosed: stats?.closed ?? null,
      pglitePeakOpen: stats?.peakOpen ?? null,
      pgliteFilesReporting: stats?.files ?? null,
      completed: true,
    };
    writeFileSync(out, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
  }
}
