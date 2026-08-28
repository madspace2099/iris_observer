/**
 * Every value an evidence file can state, resolved once from three sources:
 * git, the recorded live snapshot, and the packaged bytes themselves.
 *
 * The rule this module exists to enforce: NO ARTEFACT CARRIES ITS OWN COPY OF A
 * CHANGING VALUE. The previous package stated the oldest bucket age in three
 * files and got two of them wrong, and named `c6fdc73` as the current candidate
 * one commit after it stopped being one — with a perfectly correct file hash,
 * which is why hash-prefix validation did not notice. A value rendered from
 * here cannot disagree with itself, and the semantic checks in
 * `build-package.ts` then re-read the RENDERED text to confirm the rendering
 * actually happened.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  LIVE,
  DEPLOYMENTS,
  RETENTION_THRESHOLD_HOURS,
  OLDEST_BUCKET_HISTORY,
  INVENTORY_RECORDED_IN,
  LAST_VERCEL_ENUMERATION,
  DELIVERED_ARCHIVES,
  outcomeOf,
  OLDEST_BUCKET_HISTORY_PROVENANCE,
  renderCatalogueFact,
  DEPLOYMENT_INVENTORY_PROVENANCE,
} from "./live-snapshot";
import { HISTORICAL_CONTROL_CHAR_COMMITS } from "./transport-safe";
import {
  renderMappingTable,
  renderObservedMapping,
  APPROVED_PROJECT_REF,
  PEPPER_STATE,
  PRODUCTION_RUNTIME_STATE,
  OBSERVATION_MUTATION_STATUS,
  PRODUCTION_TRANSITION,
  KNOWN_EXTERNAL_ACTIVITY,
  EXTERNAL_ACTIVITY_COMPLETENESS,
  THIS_MILESTONE_EXTERNAL_ACCESS,
} from "./preflight";

export const REPO_ROOT = join(import.meta.dirname, "..", "..");

export const git = (...args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd: REPO_ROOT, encoding: "utf8" }).trim();

/**
 * A file's exact bytes at a commit — untrimmed, unlike {@link git}.
 *
 * `git()` trims, which is right for a SHA or a branch name and silently wrong
 * for a file: the missing trailing newline changes the digest, so every
 * historical file hash came out different from the hash of the same file on
 * disk and every artefact looked "changed". Use this whenever the result is
 * going into a hash.
 */
export const gitShowBytes = (commit: string, path: string): Buffer =>
  execFileSync("git", ["show", `${commit}:${path}`], {
    cwd: REPO_ROOT,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });

/** SHA-256 of a file exactly as it stood at a commit. */
export const fileShaAt = (commit: string, path: string): string =>
  createHash("sha256").update(gitShowBytes(commit, path)).digest("hex");

/**
 * What "unchanged" is measured against: the commit of the last DELIVERED
 * bundle, not `HEAD~1`.
 *
 * A milestone is several commits. Comparing with the immediate parent reports
 * "unchanged" for a file this milestone edited two commits ago, which is true
 * of the last commit and useless to a reviewer — who is holding the previous
 * ZIP and wants to know what moved since THAT. Falls back to the parent only
 * if no bundle has been delivered yet.
 *
 * THE BASELINE IS ITS OWN FACT. It is the most recent archive HANDED OVER —
 * not the most recent one accepted, and not the point Vercel was last
 * enumerated for. Those three had drifted apart: five archives were delivered
 * after `e18f860` without being declared here, so every "unchanged since"
 * line in this package was measured against a baseline five deliveries stale
 * while claiming to span the milestone. The list is the single input, so
 * declaring a delivery moves the baseline and nothing else has to be edited.
 */
export function baselineCommit(): string {
  const last = DELIVERED_ARCHIVES[DELIVERED_ARCHIVES.length - 1]?.bundle;
  if (last === undefined) return git("rev-parse", "HEAD~1");
  return git("rev-parse", last);
}

const sha256 = (path: string): string =>
  createHash("sha256")
    .update(readFileSync(join(REPO_ROOT, path)))
    .digest("hex");

/** Executable SQL only: comments stripped, whitespace collapsed. */
export const strip = (sql: string): string =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const execSha = (commit: string, path: string): string =>
  createHash("sha256")
    .update(strip(git("show", `${commit}:${path}`)))
    .digest("hex");

export const MIGRATIONS_DIR = "supabase/migrations";
export const M4 = `${MIGRATIONS_DIR}/20260826140000_observer_bucket_retention.sql`;
export const CONTRACT = `${MIGRATIONS_DIR}/20260826090000_observer_audit_facade_cleanup.sql`;

const NUMBER_WORD = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
] as const;

const word = (n: number): string => NUMBER_WORD[n] ?? String(n);

/** Wrap a comma-separated list to a fixed width, with a hanging indent. */
function wrap(items: readonly string[], lead: string, indent: string, width = 78): string {
  const out: string[] = [];
  let line = lead;
  items.forEach((item, i) => {
    const piece = item + (i === items.length - 1 ? "." : ",");
    if (line.length + 1 + piece.length > width && line.trim() !== lead.trim()) {
      out.push(line);
      line = indent + piece;
    } else {
      line = line === lead ? line + piece : `${line} ${piece}`;
    }
  });
  out.push(line);
  return out.join("\n");
}

export interface GateResults {
  readonly head: string;
  readonly tests: {
    readonly total: number;
    readonly passed: number;
    readonly skipped: number;
    readonly failed: number;
    readonly files: number;
    readonly perFile: Readonly<Record<string, number>>;
  };
  /**
   * Identities, so a skipped COUNT is never printed without saying which test.
   *
   * The count moved from 24 to 23 between two runs of the same commit, and the
   * record of the time could not say which case had moved — because the guards
   * that produced most of those skips were conditioned on the state of an
   * untracked directory rather than on the platform.
   */
  readonly testGate?: {
    readonly failedTests?: readonly { readonly suite: string; readonly title: string }[];
    readonly skippedTests?: readonly { readonly suite: string; readonly title: string }[];
    /*
     * CONFIGURATION, kept separate from the observation below it. These are
     * what the pool was told; none of them is a count of anything that
     * happened.
     */
    readonly workerPool?: string | null;
    readonly configuredMinWorkers?: number | null;
    readonly configuredMaxWorkers?: number | null;
    /** MEASURED: peak modules executing at once, one per worker. */
    readonly observedPeakWorkers?: number | null;
  };
  readonly gates: Readonly<Record<string, string>>;
}

/** Gate results written by `scripts/release/run-gates.ts`, if that has run. */
/**
 * The evidence THIS BUILD captured, if a build is in progress.
 *
 * Set once by the packager and read by the renderers, so the documents and the
 * staged `gate-results.json` come from one object rather than two reads of a
 * file that can change between them. Outside a build it is null and the
 * renderers fall back to reading the record, which is right for the local
 * console but never for an archive.
 */
let captured: GateResults | null = null;

/** Install the captured projection for the duration of one build. */
export function useCapturedGateResults(record: unknown): void {
  captured = record as GateResults | null;
}

export function readGateResults(): GateResults | null {
  if (captured !== null) return captured;
  return readGateResultsFromDisk();
}

/**
 * Exported and rooted so the behaviour can be TESTED, not just described.
 *
 * The three conditions below were previously covered by assertions that read
 * this function's source text and matched patterns in it. That proves the
 * source says something; it does not prove the reader does it, and the defect
 * these guard against cost an authoritative gate run. A root parameter lets a
 * test build each shape in a temporary directory and observe the answer,
 * without touching the working `.release/` a real gate writes to.
 */
export function readGateResultsFromDisk(root: string = REPO_ROOT): GateResults | null {
  const path = join(root, ".release", "gate-results.json");
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }

  /*
   * AN ATTEMPT IN PROGRESS IS NOT A RESULT.
   *
   * The gate runner invalidates the canonical record synchronously before its
   * first gate, so while the TEST gate is running this file holds the marker
   * rather than a record — and the test gate is precisely when the suites that
   * render this evidence execute. Reading the marker as a result made every
   * rendering throw on its missing `tests`, which turned an evidence-freshness
   * check into four failed assertions and three failed suites.
   *
   * Null is the honest answer: there is no current result, and `gateBlock`
   * already knows how to say so.
   */
  if ((parsed as { status?: unknown } | null)?.status === "IN_PROGRESS") return null;

  const record = parsed as GateResults;
  /* A record without totals cannot be rendered, whatever else it contains. */
  if (record.tests === undefined || record.tests.perFile === undefined) return null;
  return record;
}

export interface PackageShape {
  /** Files staged before `hashes.txt` is added. */
  readonly stagedFiles: number;
}

/** The results table, rendered from what the gate runner actually recorded. */
function gateBlock(): string {
  const r = readGateResults();
  if (r === null) {
    return [
      "  GATES NOT RECORDED. Run `pnpm release:gates` before packaging; this table",
      "  is rendered from what that run measured, never from memory.",
    ].join("\n");
  }
  const head = git("rev-parse", "HEAD");
  const stale =
    r.head === head
      ? ""
      : `  RECORDED AT ${r.head.slice(0, 7)}, NOT AT ${head.slice(0, 7)} — STALE.\n`;
  const perFile = Object.entries(r.tests.perFile)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([f, n]) => `                                 ${String(n).padStart(4)}  ${f}`);
  /*
   * WHICH tests were skipped, never just how many.
   *
   * The identities come from the record; the reason comes from the title,
   * because the record stores a basename and a bounded title and nothing else,
   * and a skip whose title does not say why leaves a reader with a number.
   */
  /*
   * CONFIGURATION AND OBSERVATION, ON SEPARATE LINES.
   *
   * The bounds are what the pool was TOLD. The peak is what happened. Printing
   * a configured value where a reader expects a measurement is how "four
   * workers" came to be reported as though somebody had counted them.
   */
  const bounds = [
    `min ${String(r.testGate?.configuredMinWorkers ?? "not recorded")}`,
    `max ${String(r.testGate?.configuredMaxWorkers ?? "not recorded")}`,
    `pool ${String(r.testGate?.workerPool ?? "not recorded")}`,
  ].join(", ");
  const peak = r.testGate?.observedPeakWorkers;
  const peakLine =
    peak === undefined || peak === null ? "NOT MEASURED" : `${String(peak)} concurrent modules`;

  const skipped = r.testGate?.skippedTests ?? [];
  const skippedLines =
    r.tests.skipped === 0
      ? ["                                       none"]
      : skipped.length === 0
        ? ["                                       NOT RECORDED — rerun `pnpm release:gates`"]
        : skipped.map((s) => `                                       ${s.suite}  ${s.title}`);
  return [
    `  worker bounds (configured)     ${bounds}`,
    `  peak concurrency (observed)    ${peakLine}`,
    `${stale}  pnpm test                      ${r.tests.passed} passed, ${r.tests.skipped} skipped, ` +
      `${r.tests.failed} failed / ${r.tests.files} files`,
    ...perFile,
    "                                 skipped, by identity:",
    ...skippedLines,
    /* pnpm test is the header line above; do not print it twice. */
    ...Object.entries(r.gates)
      .filter(([g]) => g !== "pnpm test")
      .map(([g, v]) => `  ${g.padEnd(30)} ${v}`),
  ].join("\n");
}

interface RepeatRun {
  readonly status: number | null;
  readonly signal: string | null;
  readonly errorCode: string | null;
  readonly reportSuccess: boolean | null;
  readonly reportedFailedTests: number | null;
  readonly countedFailedTests: number | null;
  readonly reasons: readonly string[];
}

/**
 * The bounded repeated gate diagnostic, if `pnpm release:gates:repeat` has run.
 *
 * Reported whether or not the fault recurred. A run of green results is not
 * evidence that an intermittent failure was fixed, and saying so is the whole
 * point of printing the count rather than a verdict.
 */
function gateRepeatBlock(): string {
  const path = join(REPO_ROOT, "docs", "release", "gate-repeat-evidence.json");
  if (!existsSync(path)) {
    return [
      "NO REPEATED-DIAGNOSTIC EVIDENCE IS TRACKED. docs/release/gate-repeat-evidence.json",
      "is the only source this paragraph reads; an untracked local file is never",
      "consulted, because a package must not depend on an input nobody declared.",
    ].join("\n");
  }
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    head: string;
    runs: readonly RepeatRun[];
  };
  const dirty = data.runs.filter((r) => r.reasons.length > 0);
  const head = data.head.slice(0, 7);
  const lines = data.runs.map(
    (r, i) =>
      `    run ${i + 1}  status=${String(r.status)} signal=${String(r.signal)} ` +
      `errorCode=${String(r.errorCode)} reportSuccess=${String(r.reportSuccess)} ` +
      `reportedFailed=${String(r.reportedFailedTests)} countedFailed=${String(r.countedFailedTests)}`,
  );
  const verdict =
    dirty.length === 0
      ? [
          `  IT DID NOT RECUR in ${data.runs.length} runs at ${head}. THAT ALONE IS NOT A FIX:`,
          "  a fault absent from a bounded sample has not been explained. Where this",
          "  package claims one was fixed, the claim rests on the cause being found and",
          "  the fix verified, never on a run of green results.",
        ]
      : [
          `  IT RECURRED in ${dirty.length} of ${data.runs.length} runs at ${head}:`,
          ...dirty.map((r) => `    ${r.reasons.join("; ")}`),
        ];

  return [
    `THE BOUNDED REPEATED DIAGNOSTIC — ${data.runs.length} runs of the test gate at ${head}:`,
    "",
    ...lines,
    "",
    ...verdict,
  ].join("\n");
}

/**
 * The three control-character results, reported separately.
 *
 * Summarising them as one number is how an archive came to say
 * "control-char scan 0" while shipping eight backspace bytes in its own patch
 * files: the tracked-tree number was true and the impression it left was not.
 */
function controlCharBlock(): string {
  const r = readGateResults();
  const scan = (
    r as unknown as {
      controlCharacterScan?: { scannedFiles: number; foundCharacters: number };
    } | null
  )?.controlCharacterScan;
  const tracked =
    scan === undefined
      ? "  tracked working tree     NOT RECORDED"
      : `  tracked working tree     ${String(scan.foundCharacters)} in ${String(scan.scannedFiles)} tracked files`;
  return [
    tracked,
    "  staged package           enforced by the packager; refuses on any finding",
    "  written archive          enforced by the packager; refuses and deletes",
    "",
    "THE SECOND AND THIRD NUMBERS ARE NOT IN THIS FILE, and cannot be. This",
    "document is inside the directory being scanned and inside the archive being",
    "scanned, so stating their totals here would change the thing measured — the",
    "same reason the archive does not contain its own SHA-256. Both are computed",
    "at build time, both refuse the build on any finding, and both are printed by",
    "the packager and stated in the covering report.",
    "",
    "WHAT THE TRACKED NUMBER DOES NOT COVER. Patches, rendered evidence, the",
    "staged gate record and the copied generators do not exist when that gate",
    "runs. Three declared historical patches legitimately contain BACKSPACE on",
    "their removed lines — the commits that removed those bytes — and they ship",
    "base64-encoded rather than raw. See patches/TRANSPORT-SAFE.txt: the encoded",
    "files are byte-exact and NOT directly git am applicable until decoded.",
  ].join("\n");
}

export const SNAPSHOT_FILE = "scripts/release/live-snapshot.ts";

/**
 * Was the recorded observation actually re-read this round, or carried forward?
 *
 * DERIVED, never asserted. The previous package said "no Supabase query was
 * made this round" in one file and "verified by one live query, the only
 * external access this milestone made" in another, with "re-read this round"
 * and "the oldest bucket is now 49 hours" in two more. Those cannot all be
 * true, and no amount of careful prose prevents the next one: a freshness claim
 * is a sentence, and sentences get carried forward.
 *
 * `live-snapshot.ts` is the only place a live reading may be recorded, so
 * comparing its bytes with the last delivered bundle answers the question
 * mechanically. A package cannot claim a carried-forward snapshot was read
 * during the current milestone, because the claim is computed from whether the
 * file changed.
 */
/**
 * What comparing two copies of the snapshot file can establish.
 *
 * THREE ANSWERS, AND NONE OF THEM IS "FRESH". The states used to be called
 * `refreshed` and `carried-forward`, and "refreshed" was a claim about a query
 * having been run — which a byte comparison cannot see. A changed constant is
 * equally consistent with somebody editing the file.
 *
 * So they are named for what is actually compared: the record's bytes.
 */
export type SnapshotProvenanceState =
  "record changed" | "record unchanged" | "comparison unavailable";

/**
 * Just the LIVE object literal, not the whole file.
 *
 *  also carries bookkeeping — the delivered-archive hashes,
 * the inventory provenance — that changes every milestone without anything
 * being re-read. Comparing the whole file therefore reported a change on a
 * round where no query was made, which is the exact fail-open this check
 * exists to prevent. The reading is the object; the rest is not.
 */
/**
 * THE SIX RECORDED VALUES, not the text that spells them.
 *
 * ## Why this stopped being a substring
 *
 * It used to slice out the `LIVE` object literal and compare the characters.
 * That works only while the literal keeps its name and its formatting — and the
 * six query fields have just been split out of `LIVE` into `SNAPSHOT_RESULT`,
 * away from five values the query never selected. Nothing was queried and no
 * number changed, yet a text comparison reports COMPARISON UNAVAILABLE (the old
 * name is gone) or RECORD CHANGED (the new text differs), and either would be a
 * statement about a rename dressed as a statement about a reading.
 *
 * So the fields are read by name and compared as values. The comparison is
 * still only about recorded bytes and still cannot say whether a query ran;
 * what it no longer does is answer a question about formatting.
 */
function liveBlock(text: string): string {
  const FIELDS = [
    "observedAt",
    "buckets",
    "oldestBucketHours",
    "newestBucketHours",
    "auditRows",
    "auditVersion1Rows",
  ] as const;
  const values = FIELDS.map((field) => {
    const m = new RegExp(`\\b${field}:\\s*("[^"]*"|[0-9]+)`).exec(text);
    if (m === null) throw new Error(`no ${field} in ${SNAPSHOT_FILE}`);
    return `${field}=${m[1] ?? ""}`;
  });
  return values.join("\n");
}

export function snapshotState(baseline: string): SnapshotProvenanceState {
  try {
    const then = liveBlock(gitShowBytes(baseline, SNAPSHOT_FILE).toString("utf8"));
    const now = liveBlock(readFileSync(join(REPO_ROOT, SNAPSHOT_FILE), "utf8"));
    return then === now ? "record unchanged" : "record changed";
  } catch {
    /*
     * The baseline has no copy of the file, so the comparison cannot be made.
     * That is UNKNOWN, not "new and therefore refreshed": answering the second
     * way would silently license every freshness claim in the package. It also
     * means DELIVERED_ARCHIVES is stale, which the provenance text says.
     */
    return "comparison unavailable";
  }
}

/**
 * Did the recorded snapshot CHANGE since the baseline archive?
 *
 * Not "was it refreshed": a changed constant is equally consistent with an edit,
 * and this can never distinguish the two. It answers the only question a byte
 * comparison can answer, and the packager uses it to refuse a document that
 * claims a new reading while the file it came from has not moved.
 */
export function snapshotRecordChanged(baseline: string): boolean {
  return snapshotState(baseline) === "record changed";
}

function snapshotProvenance(baseline: string, headShort: string, parentShort: string): string {
  const state = snapshotState(baseline);
  if (state === "comparison unavailable") {
    return [
      `OBSERVED AT ${LIVE.observedAt}. PROVENANCE UNPROVEN: ${SNAPSHOT_FILE} has no`,
      `copy at ${parentShort}, so no comparison could be made. That also means the`,
      "declared list of delivered bundles is stale. Treat the reading as neither",
      "confirmed fresh nor confirmed carried forward; the current live state is",
      "UNKNOWN either way.",
    ].join("\n");
  }
  if (state === "record changed") {
    return [
      `OBSERVED AT ${LIVE.observedAt}.`,
      "",
      `RECORD CHANGED since ${parentShort}: the LIVE reading in ${SNAPSHOT_FILE}`,
      "differs from its copy there. THAT ALONE DOES NOT PROVE A LIVE RE-READ — a",
      "changed constant is equally consistent with somebody editing it, or with",
      "the file being restructured around the same values.",
      "",
      "WHAT THAT COMPARISON DOES AND DOES NOT ESTABLISH. It has exactly three",
      "outcomes — RECORD UNCHANGED, RECORD CHANGED, COMPARISON UNAVAILABLE — and",
      "all three are about the recorded bytes. IT CANNOT ESTABLISH WHETHER A QUERY",
      "WAS EXECUTED. Git history is evidence about a file, never about whether a",
      "network call happened.",
      "",
      "That this milestone made no external access is therefore an OPERATOR",
      "DECLARATION, stated as one in REVIEW.txt, and not something derived here.",
    ].join("\n");
  }
  return [
    `OBSERVED AT ${LIVE.observedAt}.`,
    "",
    `RECORD UNCHANGED since ${parentShort}: the LIVE reading in ${SNAPSHOT_FILE}`,
    `is byte-identical to its copy there, so the values in this package at`,
    `${headShort} are the ones that were observed at that timestamp and have not`,
    "been edited since. The comparison is over the reading rather than the whole",
    "file, which also carries bookkeeping that changes without anything being",
    "re-read.",
    "",
    "WHAT THAT COMPARISON DOES AND DOES NOT ESTABLISH. It has exactly three",
    "outcomes — RECORD UNCHANGED, RECORD CHANGED, COMPARISON UNAVAILABLE — and",
    "all three are about the recorded bytes. IT CANNOT ESTABLISH WHETHER A QUERY",
    "WAS EXECUTED. An unchanged record is consistent with no query having been",
    "run and equally with one having been run and returned the same values; a",
    "changed record is consistent with a live re-read and equally with somebody",
    "editing the constant. Git history is evidence about a file, never about",
    "whether a network call happened.",
    "",
    "That this milestone made no external access is therefore an OPERATOR",
    "DECLARATION, stated as one in REVIEW.txt, and not something derived here.",
    "",
    "WHAT IS PROVEN. A read-only snapshot was taken at",
    `${LIVE.observedAt}, it contained the values below, and those values reached`,
    "this package unaltered. It is NOT proven that they still hold: the current",
    "live state is UNKNOWN until the authorised rollout preflight reads it again.",
  ].join("\n");
}

/** Every placeholder an evidence template may use, resolved. */
/**
 * THE DECLARED STATE OBJECTS, RENDERED — not merely declared beside the prose.
 *
 * ## What "decorative" meant here
 *
 * `PEPPER_STATE`, `PRODUCTION_RUNTIME_STATE`, `OBSERVATION_MUTATION_STATUS`,
 * `DEPLOYMENT_INVENTORY_PROVENANCE` and `OLDEST_BUCKET_HISTORY_PROVENANCE` were
 * declared, exported, frozen, and asserted by tests — and NOTHING RENDERED THEM.
 * The evidence documents stated the same facts as hand-written prose, so the
 * constants proved only that a constant existed with a given value. Changing
 * one changed a test and changed no document; changing the document changed no
 * constant. Two independent copies of a changing fact is exactly the defect
 * this module exists to prevent, and the release apparatus had it in its own
 * findings.
 *
 * Everything below is a rendering source. The template carries placeholders,
 * `render()` reports any placeholder left behind, and the semantic checks in
 * `build-package.ts` re-read the RENDERED text — so a value that stops matching
 * its constant now stops the package.
 */
function externalActivityBlock(): string {
  const rows = KNOWN_EXTERNAL_ACTIVITY.map((e) => {
    const when = e.when === "UNKNOWN" ? "date UNKNOWN" : e.when;
    return [
      `  ${when} — ${e.actor}, ${e.system}`,
      `      ${e.action}`,
      `      changed: ${e.mutation}`,
    ].join("\n");
  });
  const reads = KNOWN_EXTERNAL_ACTIVITY.length;
  const changed = KNOWN_EXTERNAL_ACTIVITY.filter((e) => e.mutation !== "none").length;
  return [
    `${String(reads)} KNOWN external interaction(s), of which ${String(changed)} changed`,
    `something. COMPLETENESS: ${EXTERNAL_ACTIVITY_COMPLETENESS} — nothing in this`,
    "repository can establish that no other external call was ever made, so this is",
    "a partial list said to be partial rather than a complete one asserted to be:",
    "",
    ...rows,
  ].join("\n");
}

/** The pepper finding, from the constant rather than from prose beside it. */
function pepperLine(): string {
  return (
    `${PEPPER_STATE.state} / ${PEPPER_STATE.finding} / ${PEPPER_STATE.verdict}` +
    ` — observed ${PEPPER_STATE.observedOn}`
  );
}

function productionRuntimeLine(): string {
  return (
    `${PRODUCTION_RUNTIME_STATE.state} / ${PRODUCTION_RUNTIME_STATE.verdict}` +
    ` — no Production-scoped ${PRODUCTION_RUNTIME_STATE.missing.join(" and no Production-scoped ")}` +
    `, observed ${PRODUCTION_RUNTIME_STATE.observedOn}`
  );
}

/**
 * How many patches ship, and how many of them are encoded.
 *
 * DERIVED FROM THE CHAIN, not written down. The evidence said "three of them"
 * and the declared list has grown to five since; a count in prose goes stale in
 * exactly the way a count computed from `git rev-list` and the declared list
 * cannot. The base is the same commit `format-patch` is run from, so the two
 * numbers describe the same series.
 */
function patchSummary(): string {
  const total = Number(git("rev-list", "--count", "1ee5d2d..HEAD"));
  const encoded = HISTORICAL_CONTROL_CHAR_COMMITS.length;
  return (
    `${String(total)} patches, of which ${String(encoded)} ship base64-encoded and ` +
    `${String(total - encoded)} ship raw`
  );
}

function deploymentInventoryLine(): string {
  const d = DEPLOYMENT_INVENTORY_PROVENANCE;
  return [
    `last enumerated for the ${d.lastEnumeratedFor} bundle, at NOT RECORDED.`,
    `At the carried-forward enumeration, the newest recorded deployment was`,
    `${d.newestAtThatEnumeration}. Whether the inventory is still accurate is ${d.currentlyAccurate}.`,
  ].join("\n    ");
}

/**
 * The two gate results that preceded the authorised history repair.
 *
 * DECLARED, because a document naming a preserved record must name one that is
 * actually there. `build-package.ts` re-reads the rendered text and refuses a
 * package whose evidence names a record file the repository does not hold.
 */
export interface RedGateAttempt {
  /** The commit the gate ran at. */
  readonly commit: string;
  /** Where its sanitized record is preserved, relative to the repository. */
  readonly record: string;
  /** Why it was refused, in one line, naming no pattern. */
  readonly why: string;
}

export const RED_GATE_ATTEMPTS: readonly RedGateAttempt[] = [
  {
    commit: "abeca3a",
    record: ".release/gate-results-FAILED-abeca3a-3064e88a1d30bd14.json",
    why: "a tracked test file carried a forbidden secret-shaped assignment",
  },
  {
    commit: "ebeb916",
    record: ".release/gate-results-FAILED-ebeb916-94ad69855e655aaf.json",
    why: "the commit message describing the fix reproduced the same shape",
  },
];

/**
 * The one authorised local-history repair, and what it was and was not.
 *
 * The alternative was an audit exemption, and the operator rejected it: one
 * entry had already been added for the fixture commit and a second would have
 * been needed for the message commit, which is a control being negotiated away
 * one case at a time.
 */
export const HISTORY_REPAIR = Object.freeze({
  protectedBase: "03f43a7",
  /*
   * HOW MANY COMMITS WERE REPLACED. A count of things that no longer exist on
   * this branch cannot be derived from it, so it is declared — and it is the
   * only number here that is.
   */
  replacedCommits: 9,
  /* Neither red result is retracted by the repair. */
  retractsGateResults: false,
  /* Neither red commit was ever handed over, so neither is a delivery. */
  affectsDeliveryCounts: false,
});

/**
 * The commits that REPLACED them, derived from the branch rather than typed.
 *
 * ## The number this removes
 *
 * `replacementCommits: 1` was written into the declaration and "replaced by
 * one" into the prose, and by the time the archive shipped there were three.
 * The repair had needed a second commit for the evidence and a third for the
 * hash accounting, and neither the constant nor the sentence moved with them.
 *
 * That is precisely the defect this apparatus exists to remove: a count typed
 * beside the thing instead of taken from it. It is derived now, and the
 * rendered prose says however many there are.
 */
export function historyReplacementCommits(): readonly string[] {
  return git("log", "--format=%h", `${HISTORY_REPAIR.protectedBase}..HEAD`)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .reverse();
}

/** The old and new ranges and tree identities, all derived. */
export function historyRepairFacts(): Readonly<Record<string, string>> {
  const replacements = historyReplacementCommits();
  const base = HISTORY_REPAIR.protectedBase;
  return {
    HISTORY_BASE: base,
    HISTORY_REPLACED_COUNT: String(HISTORY_REPAIR.replacedCommits),
    HISTORY_REPLACEMENT_COUNT: String(replacements.length),
    HISTORY_REPLACEMENT_LIST: replacements.join(", "),
    HISTORY_OLD_RANGE: `${base}..ebeb916`,
    HISTORY_NEW_RANGE: `${base}..${git("rev-parse", "--short", "HEAD")}`,
    HISTORY_OLD_TREE: "799515f23a680f10b1f9c494f0f02ff23304ab40",
    HISTORY_NEW_TREE: git("rev-parse", "HEAD^{tree}"),
  };
}

export function facts(shape: PackageShape): Readonly<Record<string, string>> {
  const head = git("rev-parse", "HEAD");
  const headShort = head.slice(0, 7);
  /* The last delivered bundle, so "unchanged" spans the whole milestone. */
  const parent = baselineCommit();
  const parentShort = parent.slice(0, 7);
  const [behind = "0", ahead = "0"] = git(
    "rev-list",
    "--left-right",
    "--count",
    "origin/release/observer-demo-rc1...HEAD",
  ).split(/\s+/);

  const [startBehind = "0", startAhead = "0"] = git(
    "rev-list",
    "--left-right",
    "--count",
    `origin/release/observer-demo-rc1...${parent}`,
  ).split(/\s+/);

  const localOnly = git("log", "--format=%h %s", "origin/release/observer-demo-rc1..HEAD")
    .split("\n")
    .filter((l) => l.length > 0)
    .reverse();
  const localOnlyShorts = localOnly.map((l) => l.split(" ")[0] ?? "");

  const deployedShas = new Set(DEPLOYMENTS.map((d) => d.sha));
  const notDeployed = localOnlyShorts.filter((s) => !deployedShas.has(s));

  /* Every migration source, compared against the previous release commit. */
  const migrationRows = readdirSync(join(REPO_ROOT, MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      const path = `${MIGRATIONS_DIR}/${f}`;
      const nowFile = sha256(path);
      const thenFile = fileShaAt(parent, path);
      const nowExec = createHash("sha256")
        .update(strip(readFileSync(join(REPO_ROOT, path), "utf8")))
        .digest("hex");
      return {
        f,
        nowFile,
        fileSame: nowFile === thenFile,
        execSame: nowExec === execSha(parent, path),
      };
    });

  const changedFiles = migrationRows.filter((r) => !r.fileSame);
  const changedExec = migrationRows.filter((r) => !r.execSame);

  const migrationsBlock = migrationRows
    .map(
      (r) =>
        `  ${r.fileSame ? "unchanged" : "comments "}  ${r.nowFile.slice(0, 16)}…  ${r.f}` +
        (r.fileSame
          ? ""
          : `\n              executable SQL identical: ${r.execSame ? "YES" : "NO"}`),
    )
    .join("\n");

  const contractExecNow = createHash("sha256")
    .update(strip(readFileSync(join(REPO_ROOT, CONTRACT), "utf8")))
    .digest("hex");
  const contractExecParent = execSha(parent, CONTRACT);

  const executableSqlBlock = [
    "EXECUTABLE SQL, PROVEN RATHER THAN PROMISED. Comments stripped, whitespace",
    "collapsed, hashed either side of the edit:",
    "",
    `  at ${parentShort}  ${contractExecParent}`,
    `  at ${headShort}  ${contractExecNow}`,
    "",
    `  identical: ${contractExecParent === contractExecNow ? "YES" : "NO"}`,
    "",
    "  the statements that survive, as the parser sees them:",
    ...strip(readFileSync(join(REPO_ROOT, CONTRACT), "utf8"))
      .split("; ")
      .map((s) => `    ${s}${s.endsWith(";") ? "" : ";"}`),
    "",
    `${word(changedFiles.length)} migration file${changedFiles.length === 1 ? "" : "s"} changed since the last`,
    "delivered bundle:",
    ...(changedFiles.length > 0 ? changedFiles.map((r) => `  ${r.f}`) : ["  (none)"]),
    "",
    changedExec.length === 0
      ? "NO EXECUTABLE SQL CHANGED AT ALL."
      : `${changedExec.length} CHANGED EXECUTABLY, which this milestone forbids.`,
  ].join("\n");

  const m4ExecNow = createHash("sha256")
    .update(strip(readFileSync(join(REPO_ROOT, M4), "utf8")))
    .digest("hex");
  const m4ExecStable = execSha("7e3c00a", M4);

  const m4HistoryBlock = [
    "WHEN THE EXECUTABLE SQL LAST CHANGED, stated plainly rather than implied. It",
    "changed at 7e3c00a — the cron-ownership rewrite, which stopped the migration",
    "deleting jobs it does not own:",
    "",
    `  at bb574b6   executable ${execSha("bb574b6", M4)}`,
    `  at 7e3c00a   executable ${m4ExecStable}`,
    "",
    `Since 7e3c00a it has been ${m4ExecStable}`,
    "through a326a87, 189f8d8, ee954b8, c6fdc73, f1dbffd and HEAD:",
    `  unchanged, confirmed by comparison here: ${m4ExecStable === m4ExecNow ? "YES" : "NO"}`,
    "",
    "The file itself last changed at c6fdc73, in comments only. An edition of this",
    "document quoted the pre-edit FILE hashes as evidence of byte-identity; those",
    "were not the hashes of the files it shipped. Naming a hash the package does",
    "not contain is how an evidence file stops being evidence.",
  ].join("\n");

  /*
   * Every packaged artefact, compared with the same path at the previous
   * release commit. This replaces a TYPED list of hashes that named 444b01d9
   * for the contract migration after that file had changed — a hash that was
   * correct on the day somebody wrote it and wrong by the next commit.
   */
  const artefactPaths = [
    ...readdirSync(join(REPO_ROOT, MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `${MIGRATIONS_DIR}/${f}`),
    ...readdirSync(join(REPO_ROOT, "supabase/verifiers"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `supabase/verifiers/${f}`),
    "supabase/prerequisites/observer-cron-prerequisite.sql",
  ];
  const artefactRows = artefactPaths.map((path) => {
    const now = sha256(path);
    let then: string | null = null;
    try {
      then = fileShaAt(parent, path);
    } catch {
      then = null; /* new in this commit */
    }
    const state = then === null ? "NEW      " : then === now ? "unchanged" : "changed  ";
    return `  ${state}  ${now.slice(0, 16)}…  ${path.split("/").pop() ?? path}`;
  });

  const cronHealth = sha256("supabase/verifiers/observer-cron-health.sql");
  const cronHealthWrapper = sha256("_sql-to-paste/observer-cron-health.sql");
  /* Prior deliveries, excluding the candidate this package will become. */
  const priorBundles = INVENTORY_RECORDED_IN.filter((b) => b !== headShort);
  const bundles = word(priorBundles.length).toLowerCase();
  /* Rejections are the only outcome with evidence; nothing else is named. */
  const rejected = DELIVERED_ARCHIVES.map((a) => a.bundle).filter(
    (b) => outcomeOf(b) === "rejected",
  );
  const lastDelivered = `\`${DELIVERED_ARCHIVES.at(-1)?.bundle ?? "none"}\``;

  return {
    HEAD: head,
    HEAD_SHORT: headShort,
    REMOTE_RELEASE: git("rev-parse", "origin/release/observer-demo-rc1"),
    REMOTE_MAIN: git("rev-parse", "origin/main"),
    BEHIND: behind,
    AHEAD: ahead,
    /*
     * The bundle the inventory was actually enumerated for. Rendered beside the
     * observation timestamp so "rendered for this commit" cannot be read as
     * "gathered for this commit" — the enumeration is older than both.
     */
    LAST_ENUMERATION: LAST_VERCEL_ENUMERATION,
    /*
     * Rendered from the one recorded observation through the real classifier,
     * so a document cannot state a verdict the rule would not reach.
     */
    OBSERVED_MAPPING_BLOCK: renderObservedMapping(APPROVED_PROJECT_REF),

    /*
     * WHERE THIS MILESTONE STARTED, DERIVED FROM THE DELIVERY LIST.
     *
     * Section 0 carried a hard-coded start HEAD and a hard-coded "0 / 10", and
     * both went stale the moment another bundle was delivered — it still named
     * `f1dbffd` after eight further deliveries, describing a round that ended
     * long ago as "this round". The start of a milestone is the commit of the
     * last archive handed over, which is exactly what `baselineCommit()` is,
     * so nothing here has to be edited when one is declared.
     */
    START_HEAD: parent,
    START_BEHIND: startBehind,
    START_AHEAD: startAhead,

    LOCAL_ONLY_SENTENCE: wrap(
      localOnlyShorts,
      `${word(localOnlyShorts.length)} commits exist only on this machine: `,
      "",
    ),
    LOCAL_ONLY_BLOCK: [
      "  LOCAL ONLY (not pushed, not deployed)",
      ...localOnly.map((l) => {
        const [short = "", ...rest] = l.split(" ");
        return `    ${short}  ${rest.join(" ")}`;
      }),
    ].join("\n"),
    NOT_DEPLOYED_BLOCK: wrap(notDeployed, "  NOT DEPLOYED: ", "  "),

    /*
     * SIX FACTS, SEPARATED, AND EVERY COUNT DERIVED.
     *
     * One list was doing the work of all of them, and the words were used
     * interchangeably: a package called itself the successor to ten
     * DELIVERED bundles while its own most recent predecessor had been
     * reviewed and REJECTED, and while the baseline it measured against was
     * five deliveries stale. A typed count is a count that goes stale, so
     * every number below is read from the declaration.
     */
    PROVENANCE_BLOCK: [
      `  handed over          ${word(DELIVERED_ARCHIVES.length).toLowerCase()} archives, ${headShort} excluded — it does not`,
      "                       exist until this one is built.",
      `  independently        NONE recorded. ${word(rejected.length)} ${rejected.length === 1 ? "is" : "are"} known to have been`,
      `  accepted             REJECTED: ${rejected.map((b) => `\`${b}\``).join(", ")}${rejected.length > 0 ? `, the most recent of` : ""}`,
      `                       them. The rest are UNREVIEWED, which is not`,
      "                       acceptance — absence of a rejection is only",
      "                       absence of a rejection.",
      `  current candidate    ${headShort}. ${lastDelivered} is a PRIOR DELIVERED AND`,
      "                       REJECTED candidate, not this one.",
      "  byte-comparison      the most recent archive handed over. It follows",
      `  baseline             the list, so declaring a delivery moves it: it is`,
      `                       ${parentShort} here. It had been pinned to \`e18f860\``,
      "                       while five later archives went out, so every",
      '                       "unchanged since" line spanned the wrong interval.',
      `  inventory recorded   ${word(priorBundles.length).toLowerCase()} bundles carry the same recorded Vercel`,
      "  in                   inventory. Later identical tables prove the table",
      "                       was carried forward, and nothing else.",
      `  last ENUMERATED      \`${LAST_VERCEL_ENUMERATION}\`, and not since. An explicit constant.`,
      "                       Moving it requires a real Vercel enumeration,",
      "                       which is an external access with its own",
      "                       authorisation.",
    ].join("\n"),

    INVENTORY_UNCHANGED_SENTENCE: [
      "",
      `RECORDED IDENTICALLY in ${bundles} archives handed over before this one, and`,
      "again in this candidate — which is consistency, not freshness, and not",
      "acceptance. These are separate facts and only some are established here:",
      "",
      `  recorded in           ${bundles} prior archives + this candidate`,
      `  handed over           ${String(DELIVERED_ARCHIVES.length)} archives, of which ` +
        `${String(DELIVERED_ARCHIVES.filter((a) => outcomeOf(a.bundle) === "rejected").length)} were reviewed and REJECTED`,
      "  independently accepted  NONE recorded — absence of a rejection is not",
      "                        acceptance, so no archive is called accepted here",
      `  last ENUMERATED for   ${LAST_VERCEL_ENUMERATION}, and not since`,
      `  byte-comparison base  ${parentShort}`,
      "  currently accurate    UNKNOWN — no Vercel enumeration in this milestone",
      "",
      "An earlier edition derived the enumeration point from the last entry of the",
      "recorded-in list, which grows every milestone while the enumeration stays",
      "where it was. It therefore claimed the inventory had been enumerated for a",
      "bundle three deliveries after the last time anybody looked.",
    ].join("\n"),

    OBSERVED_AT: LIVE.observedAt,
    SNAPSHOT_PROVENANCE: snapshotProvenance(parent, headShort, parentShort),
    PROJECT_MAPPING_TABLE: renderMappingTable(),
    BUCKETS: String(LIVE.buckets),
    OLDEST_H: String(LIVE.oldestBucketHours),
    NEWEST_H: String(LIVE.newestBucketHours),
    AUDIT_ROWS: String(LIVE.auditRows),
    AUDIT_V1: String(LIVE.auditVersion1Rows),
    AUDIT_V2: String(LIVE.auditRows - LIVE.auditVersion1Rows),
    /*
     * NOT FIELDS OF THE SNAPSHOT QUERY, and they never were.
     *
     * `SNAPSHOT_QUERY` selects six columns: the observation time, the bucket
     * count, the oldest and newest bucket ages, and two audit-row counts. These
     * five came from somewhere else, at some other time, by some other means,
     * and nothing recorded which — so they render as UNKNOWN beside the carried
     * value rather than as observations of that query.
     */
    PSEUDONYM_COL: renderCatalogueFact("pseudonymVersionColumn"),
    ADMIT_ARGS: renderCatalogueFact("admitArgs"),
    RETENTION_FN: renderCatalogueFact("retentionFunction"),
    LEGACY_FACADES: renderCatalogueFact("legacyFacades"),
    PG_CRON: renderCatalogueFact("pgCron"),
    THRESHOLD_H: String(RETENTION_THRESHOLD_HOURS),
    EXPECTED_MAX_H: String(RETENTION_THRESHOLD_HOURS + 1),
    BUCKET_HISTORY: OLDEST_BUCKET_HISTORY.join(", "),
    BUCKET_HISTORY_PROVENANCE: OLDEST_BUCKET_HISTORY_PROVENANCE,

    /*
     * THE TWO RED ATTEMPTS AND THE REPAIR THAT FOLLOWED THEM.
     *
     * Rendered from the declaration rather than typed into the document,
     * because these are the identifiers of preserved records: a document that
     * names a record file which is not there, or names the wrong commit, is
     * worse than one that says nothing.
     */
    RED_FIRST: RED_GATE_ATTEMPTS[0]?.commit ?? "UNKNOWN",
    RED_FIRST_RECORD: RED_GATE_ATTEMPTS[0]?.record ?? "UNKNOWN",
    RED_SECOND: RED_GATE_ATTEMPTS[1]?.commit ?? "UNKNOWN",
    RED_SECOND_RECORD: RED_GATE_ATTEMPTS[1]?.record ?? "UNKNOWN",
    ...historyRepairFacts(),
    PATCH_SUMMARY: patchSummary(),

    /* Rendered from the declared state, so neither can drift from the other. */
    EXTERNAL_ACTIVITY_BLOCK: externalActivityBlock(),
    THIS_MILESTONE_EXTERNAL: THIS_MILESTONE_EXTERNAL_ACCESS.statement,
    OBSERVATION_MUTATION_STATUS,
    PRODUCTION_TRANSITION_LINE:
      `${PRODUCTION_TRANSITION.variable} in ${PRODUCTION_TRANSITION.environment}: ` +
      `${PRODUCTION_TRANSITION.from}, then ${PRODUCTION_TRANSITION.to}. ` +
      `Actor ${PRODUCTION_TRANSITION.actor}, time ${PRODUCTION_TRANSITION.occurredAt}.`,
    PEPPER_STATE_LINE: pepperLine(),
    PEPPER_VERDICT: PEPPER_STATE.verdict,
    PRODUCTION_RUNTIME_LINE: productionRuntimeLine(),
    PRODUCTION_RUNTIME_VERDICT: PRODUCTION_RUNTIME_STATE.verdict,
    DEPLOYMENT_INVENTORY_LINE: deploymentInventoryLine(),

    M4_SOURCE_SHA: sha256(M4),
    M4_WRAPPER_SHA: sha256("_sql-to-paste/observer-migration-4-retention.sql"),
    M4_EXEC_SHA: m4ExecNow,
    M4_HISTORY_BLOCK: m4HistoryBlock,
    CRON_HEALTH_SHA: cronHealth,
    CRON_HEALTH_WRAPPER_SHA: cronHealthWrapper,
    CRON_HEALTH_VERDICT:
      cronHealth === cronHealthWrapper
        ? "the two are identical, as a verbatim copy must be"
        : "the two are DIFFERENT — the copy is not verbatim",
    MIGRATIONS_BLOCK: migrationsBlock,
    EXECUTABLE_SQL_BLOCK: executableSqlBlock,
    ARTEFACT_STATE_BLOCK: artefactRows.join("\n"),
    DELIVERED_ARCHIVES_BLOCK: DELIVERED_ARCHIVES.map(
      (a) => `  ${a.sha256}  IRIS-Observer-${a.bundle}-review.zip`,
    ).join("\n"),

    GATE_BLOCK: gateBlock(),
    CONTROL_CHAR_BLOCK: controlCharBlock(),
    GATE_REPEAT_BLOCK: gateRepeatBlock(),
    ARCHIVE_ENTRIES: String(shape.stagedFiles + 1),
    MANIFEST_FILES: String(shape.stagedFiles),
  };
}

/** Render one template, and report any placeholder left behind. */
export function render(
  text: string,
  values: Readonly<Record<string, string>>,
): { readonly out: string; readonly missing: readonly string[] } {
  const used = new Set<string>();
  const out = text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole: string, key: string) => {
    const value = values[key];
    if (value === undefined) return whole;
    used.add(key);
    return value;
  });
  return { out, missing: [...new Set(out.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [])] };
}
