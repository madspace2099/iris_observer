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
 * Run:  pnpm release:wrappers          rewrite every wrapper
 *       pnpm release:wrappers --check  fail if any is stale, change nothing
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
  let stale = 0;

  for (const spec of WRAPPERS) {
    const path = join(REPO_ROOT, "_sql-to-paste", spec.out);
    const wanted = renderWrapper(spec);
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;

    if (current === wanted) {
      console.log(`  unchanged  ${spec.out}`);
      continue;
    }
    stale += 1;
    if (check) {
      console.log(`  STALE      ${spec.out}`);
      continue;
    }
    writeFileSync(path, wanted, "utf8");
    console.log(`  rewritten  ${spec.out}`);
  }

  if (check && stale > 0) {
    console.log(`\n${stale} wrapper(s) do not match their source. Run: pnpm release:wrappers`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("wrap-migration.ts")) main();
