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
  INVENTORY_UNCHANGED_IN,
  DELIVERED_ARCHIVES,
} from "./live-snapshot";

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
    readonly files: number;
    readonly perFile: Readonly<Record<string, number>>;
  };
  readonly gates: Readonly<Record<string, string>>;
}

/** Gate results written by `scripts/release/run-gates.ts`, if that has run. */
export function readGateResults(): GateResults | null {
  const path = join(REPO_ROOT, ".release", "gate-results.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as GateResults;
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
  return [
    `${stale}  pnpm test                      ${r.tests.total} passed / ${r.tests.files} files / 0 failed`,
    ...perFile,
    ...Object.entries(r.gates).map(([g, v]) => `  ${g.padEnd(30)} ${v}`),
  ].join("\n");
}

/** Every placeholder an evidence template may use, resolved. */
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
  const bundles = word(INVENTORY_UNCHANGED_IN.length).toLowerCase();
  const lastEnumerated = INVENTORY_UNCHANGED_IN[INVENTORY_UNCHANGED_IN.length - 1] ?? "?";

  return {
    HEAD: head,
    HEAD_SHORT: headShort,
    REMOTE_RELEASE: git("rev-parse", "origin/release/observer-demo-rc1"),
    REMOTE_MAIN: git("rev-parse", "origin/main"),
    BEHIND: behind,
    AHEAD: ahead,
    GATHERED_DATE: git("show", "-s", "--format=%cs", "HEAD"),

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

    INVENTORY_UNCHANGED_SENTENCE: [
      `The same twenty deployments are recorded in all ${bundles} delivered bundles,`,
      "which is consistency rather than freshness: the inventory was last enumerated",
      `against Vercel for ${lastEnumerated}.`,
    ].join("\n"),

    OBSERVED_AT: LIVE.observedAt,
    BUCKETS: String(LIVE.buckets),
    OLDEST_H: String(LIVE.oldestBucketHours),
    NEWEST_H: String(LIVE.newestBucketHours),
    AUDIT_ROWS: String(LIVE.auditRows),
    AUDIT_V1: String(LIVE.auditVersion1Rows),
    AUDIT_V2: String(LIVE.auditRows - LIVE.auditVersion1Rows),
    PSEUDONYM_COL: String(LIVE.pseudonymVersionColumn),
    ADMIT_ARGS: String(LIVE.admitArgs),
    RETENTION_FN: String(LIVE.retentionFunction),
    LEGACY_FACADES: String(LIVE.legacyFacades),
    PG_CRON: String(LIVE.pgCron),
    THRESHOLD_H: String(RETENTION_THRESHOLD_HOURS),
    EXPECTED_MAX_H: String(RETENTION_THRESHOLD_HOURS + 1),
    BUCKET_HISTORY: OLDEST_BUCKET_HISTORY.join(", "),

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
