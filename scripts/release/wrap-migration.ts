/**
 * Regenerates the paste wrappers in `_sql-to-paste/` from the migration
 * sources, so a wrapper can never drift from the file it claims to quote.
 *
 * The wrappers were hand-maintained. That worked until a migration's comments
 * changed and the wrapper kept the old text with a header still asserting
 * "byte-identical to that file" — a claim the reader has no way to check and
 * the repository had no way to enforce. Generating them makes the assertion
 * mechanical: the body IS the source, spliced between `begin;` and `commit;`,
 * and the header's sha256 is computed from the same bytes.
 *
 * It writes the verbatim copies too (`VERBATIM`), so the whole directory is
 * generated: nothing in it is kept in step by hand.
 *
 * Run:  pnpm release:wrappers          rewrite every staged file
 *       pnpm release:wrappers --check  fail if any is missing or stale, change nothing
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const REPO_ROOT = join(import.meta.dirname, "..", "..");
const PROJECT = "IRIS OBSERVER  (ref tfcchobwobpadenampyh)";

interface WrapperSpec {
  /** Output file, relative to `_sql-to-paste/`. */
  readonly out: string;
  /** Migration source, relative to the repository root. */
  readonly source: string;
  /** The first header line, after `-- `. */
  readonly title: string;
  /** Header lines after the sha256 block, each rendered as a `-- ` comment. */
  readonly notes: readonly string[];
}

export const WRAPPERS: readonly WrapperSpec[] = [
  {
    out: "observer-migration-2-expand.sql",
    source: "supabase/migrations/20260825205000_observer_audit_provenance.sql",
    title: "IRIS Observer — migration 2, EXPAND: audit provenance (ALREADY APPLIED)",
    notes: [
      "Everything between BEGIN and COMMIT is byte-identical to that file.",
      "ALREADY APPLIED to the live database on 2026-08-26. Immutable from here.",
      "Included for review only. Do not re-apply.",
    ],
  },
  {
    out: "observer-migration-2-contract.sql",
    source: "supabase/migrations/20260826090000_observer_audit_facade_cleanup.sql",
    title: "IRIS Observer — migration 2, CONTRACT: remove the superseded facades",
    notes: [
      "Everything between BEGIN and COMMIT is byte-identical to that file.",
      "The NOTIFY inside is delivered by PostgreSQL only on a successful COMMIT.",
      "",
      "DO NOT APPLY until the deployment inventory permits it. Two capabilities",
      "are classified separately: a legacy-facade caller may be DELETED OR",
      "PROTECTED, because this migration removes the function it calls; a build",
      "that reaches thirteen-argument admission and writes pseudonym_version = 1",
      "MUST BE DELETED, because this migration does not close that path at all.",
    ],
  },
  {
    out: "observer-migration-3-forward.sql",
    source: "supabase/migrations/20260826120000_observer_exact_retry_and_pseudonym_scope.sql",
    title:
      "IRIS Observer — migration 3, FORWARD: exact retry, tenant-scoped pseudonyms, coherent pairs",
    notes: [
      "Everything between BEGIN and COMMIT is byte-identical to that file.",
      "The NOTIFY inside is delivered by PostgreSQL only on a successful COMMIT.",
      "Apply after migration 2, and after the Cron prerequisite. Rerunnable.",
    ],
  },
  {
    out: "observer-migration-4-retention.sql",
    source: "supabase/migrations/20260826140000_observer_bucket_retention.sql",
    title:
      "IRIS Observer — migration 4, RETENTION: one hourly pg_cron job, nothing in the request path",
    notes: [
      "Everything between BEGIN and COMMIT is byte-identical to that file.",
      "The NOTIFY inside is delivered by PostgreSQL only on a successful COMMIT.",
      "",
      "PRECONDITION: pg_cron. Run observer-cron-prerequisite.sql FIRST. This",
      "migration refuses to apply without it rather than creating a cleanup",
      "function that nothing runs — which is the defect it exists to fix.",
      "",
      "IT OWNS ONE JOB NAME: observer-prune-ai-rate-buckets. It will not modify or",
      "delete any other cron job. A differently named job that appears to target",
      "Observer retention STOPS this migration before it writes anything.",
      "",
      "Apply after migration 3. Rerunnable: it converges on exactly one job.",
    ],
  },
];

/**
 * The verbatim copies: tracked files staged byte for byte, under the name the
 * package ships them as.
 *
 * They used to be copied by hand. Nothing regenerated them, so when the compat
 * proof's source changed on 2026-09-24 its staged copy went stale, and the
 * release check that caught the mismatch could not name a remedy, because
 * there was none. `GENERATED_ORIGINS` in `build-package.ts` derives its
 * verbatim entries from this list, so the builder's allow-list and the
 * generator cannot drift apart.
 *
 * `supabase/release-evidence/` holds the two that are neither verifiers nor
 * prerequisites: release evidence a reviewer pastes, tracked at the exact bytes
 * every previous archive shipped.
 */
export const VERBATIM: readonly { readonly out: string; readonly source: string }[] = [
  { out: "observer-cron-health.sql", source: "supabase/verifiers/observer-cron-health.sql" },
  {
    out: "observer-contract-readiness.sql",
    source: "supabase/verifiers/observer-contract-readiness.sql",
  },
  {
    out: "observer-http-compat-proof.sql",
    source: "supabase/verifiers/observer-http-compat-proof.sql",
  },
  { out: "observer-ai-readiness.sql", source: "supabase/verifiers/observer-ai-readiness.sql" },
  {
    out: "observer-cron-prerequisite.sql",
    source: "supabase/prerequisites/observer-cron-prerequisite.sql",
  },
  { out: "observer-verify-2.sql", source: "supabase/release-evidence/observer-verify-2.sql" },
  { out: "observer-behaviour-2.sql", source: "supabase/release-evidence/observer-behaviour-2.sql" },
];

/** The exact bytes a wrapper should contain, given the source on disk. */
export function renderWrapper(spec: WrapperSpec, root = REPO_ROOT): string {
  const body = readFileSync(join(root, spec.source), "utf8");
  const sha = createHash("sha256")
    .update(readFileSync(join(root, spec.source)))
    .digest("hex");

  const header = [
    `-- ${spec.title}`,
    "--",
    `-- Target project : ${PROJECT}`,
    `-- Source         : ${spec.source}`,
    `-- sha256         : ${sha}`,
    "--",
    ...spec.notes.map((n) => (n === "" ? "--" : `-- ${n}`)),
    "",
  ];

  return `${header.join("\n")}\nbegin;\n${body}\ncommit;\n`;
}

/**
 * The body a wrapper actually carries: everything strictly between the first
 * `begin;` line and the final `commit;` line, with the single newline each
 * splice adds removed. It must equal the source byte for byte.
 */
export function extractBody(wrapper: string): string {
  const lines = wrapper.split("\n");
  const first = lines.indexOf("begin;");
  const last = lines.lastIndexOf("commit;");
  if (first === -1 || last === -1 || last <= first)
    throw new Error("wrapper has no begin;/commit; pair");
  /* lines[last - 1] is the blank line the splice adds before `commit;`. */
  return `${lines.slice(first + 1, last - 1).join("\n")}\n`;
}

function main(): void {
  const check = process.argv.includes("--check");
  const dir = join(REPO_ROOT, "_sql-to-paste");
  /*
   * Gitignored and never tracked, so a fresh clone has no such directory, and
   * the first write used to die on ENOENT: the generator could not make its
   * own output (measured 2026-09-24).
   */
  if (!check) mkdirSync(dir, { recursive: true });
  let stale = 0;

  const staged = [
    ...WRAPPERS.map((spec) => ({
      out: spec.out,
      wanted: Buffer.from(renderWrapper(spec), "utf8"),
    })),
    ...VERBATIM.map((v) => ({ out: v.out, wanted: readFileSync(join(REPO_ROOT, v.source)) })),
  ];
  for (const { out, wanted } of staged) {
    const path = join(dir, out);
    const current = existsSync(path) ? readFileSync(path) : null;

    if (current !== null && current.equals(wanted)) {
      console.log(`  unchanged  ${out}`);
      continue;
    }
    stale += 1;
    if (check) {
      console.log(`  ${current === null ? "MISSING" : "STALE  "}    ${out}`);
      continue;
    }
    writeFileSync(path, wanted);
    console.log(`  rewritten  ${out}`);
  }

  if (check && stale > 0) {
    console.log(
      `\n${stale} staged file(s) missing or not matching their source. Run: pnpm release:wrappers`,
    );
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("wrap-migration.ts")) main();
