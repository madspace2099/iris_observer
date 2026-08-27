/**
 * The single entry point that builds a review package from nothing.
 *
 *   pnpm release:package            build, check, write the archive
 *   pnpm release:package --verify   build three times under three time zones
 *                                   and prove the bytes are identical
 *
 * ## Why this replaces four scripts that lived inside the output
 *
 * The documented sequence was `bundle.mjs`, `evidence.mjs`, `package.mjs`,
 * `zip.mjs` — and the first of those began by deleting the directory containing
 * the other three, along with the hand-authored evidence, none of which it
 * recreated. The second command in the instructions no longer existed by the
 * time a reader reached it. It also hard-coded one machine's temporary path and
 * required seven earlier review archives to be present.
 *
 * Everything this needs is now tracked: the templates in `docs/release/`, the
 * recorded observation in `live-snapshot.ts`, the migrations, the verifiers.
 * Nothing is read from a previous package, and the staging directory is deleted
 * and rebuilt on every run precisely so that a stale file cannot survive into
 * an archive.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { facts, render, git, REPO_ROOT, strip, execSha, fileShaAt, MIGRATIONS_DIR } from "./facts";
import { walk, writeZip } from "./zip";
import { scanText, inScope } from "./secret-recipes";
import { WRAPPERS, renderWrapper, extractBody } from "./wrap-migration";
import { DEPLOYMENTS, LIVE, INVENTORY_UNCHANGED_IN, DELIVERED_ARCHIVES } from "./live-snapshot";

const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const say = (s: string): void => {
  console.log(s);
};

class Refusal extends Error {}

/* -------------------------------------------------------------------------
   1. The package must describe a real, clean commit.
------------------------------------------------------------------------- */

function requireCleanHead(): { head: string; short: string } {
  /*
   * The identity check first, and deliberately: it is the cheap one, and a
   * caller who named the wrong commit wants to hear THAT, not a list of
   * unrelated uncommitted files.
   */
  const head = git("rev-parse", "HEAD");
  const expected = process.env["RELEASE_EXPECT_HEAD"];
  if (expected !== undefined && expected !== "" && !head.startsWith(expected)) {
    throw new Refusal(`HEAD is ${head.slice(0, 7)}, not the expected ${expected}`);
  }

  const dirty = git("status", "--porcelain=v1")
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.includes(".release/"));
  if (dirty.length > 0) {
    throw new Refusal(
      `the working tree is not clean, so the package would describe a commit that does not\n` +
        `contain what it ships:\n${dirty.map((l) => `  ${l}`).join("\n")}`,
    );
  }
  return { head, short: head.slice(0, 7) };
}

/* -------------------------------------------------------------------------
   2. Staging: every input from a tracked source.
------------------------------------------------------------------------- */

function stage(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "patches"), { recursive: true });
  mkdirSync(join(dir, "supabase-migrations"), { recursive: true });
  mkdirSync(join(dir, "generators"), { recursive: true });

  execFileSync(
    "git",
    ["format-patch", "1ee5d2d..HEAD", "-o", join(dir, "patches"), "--no-signature", "-q"],
    {
      cwd: REPO_ROOT,
    },
  );

  const copyAll = (from: string, to: string, filter: (f: string) => boolean): void => {
    for (const f of readdirSync(join(REPO_ROOT, from)).sort()) {
      if (filter(f)) copyFileSync(join(REPO_ROOT, from, f), join(dir, to, f));
    }
  };

  const isSql = (f: string): boolean => f.endsWith(".sql");
  copyAll("_sql-to-paste", ".", isSql);
  copyAll(MIGRATIONS_DIR, "supabase-migrations", isSql);
  copyAll("supabase/verifiers", "supabase-migrations", isSql);
  copyAll("supabase/prerequisites", "supabase-migrations", isSql);
  copyAll("scripts/release", "generators", (f) => f.endsWith(".ts"));
  copyAll("docs/release", "generators", (f) => f.endsWith(".txt"));
}

/* -------------------------------------------------------------------------
   3. Rendering, and the checks that refuse a bad package.
------------------------------------------------------------------------- */

interface Rendered {
  readonly name: string;
  readonly text: string;
}

function renderEvidence(dir: string, stagedFiles: number): readonly Rendered[] {
  const values = facts({ stagedFiles });
  const out: Rendered[] = [];
  const unused = new Set(Object.keys(values));

  for (const file of readdirSync(join(REPO_ROOT, "docs/release")).sort()) {
    if (!file.endsWith(".txt")) continue;
    const template = readFileSync(join(REPO_ROOT, "docs/release", file), "utf8");
    for (const token of template.match(/\{\{([A-Z0-9_]+)\}\}/g) ?? [])
      unused.delete(token.slice(2, -2));
    const { out: text, missing } = render(template, values);
    if (missing.length > 0) {
      throw new Refusal(`${file} has unresolved placeholders: ${missing.join(" ")}`);
    }
    writeFileSync(join(dir, file), text, "utf8");
    out.push({ name: file, text });
  }

  if (unused.size > 0) {
    throw new Refusal(
      `facts() defines values no template uses: ${[...unused].sort().join(" ")}.\n` +
        `A fact nobody states is a fact nobody checks.`,
    );
  }
  return out;
}

/**
 * Do the rendered artefacts agree with git and with the recorded snapshot?
 *
 * THIS IS THE CHECK THE LAST PACKAGE NEEDED. Its hash accounting passed on a
 * file that named `c6fdc73` as the current candidate one commit after it
 * stopped being one: the prose was stale and its file hash was correct, which
 * is exactly the failure a hash cannot see.
 */
function semanticChecks(rendered: readonly Rendered[]): readonly string[] {
  const problems: string[] = [];
  const head = git("rev-parse", "HEAD");
  const short = head.slice(0, 7);
  const parentShort = git("rev-parse", "HEAD~1").slice(0, 7);
  const find = (name: string): string => rendered.find((r) => r.name === name)?.text ?? "";

  const compat = find("COMPATIBILITY-EVIDENCE.txt");
  const review = find("REVIEW.txt");
  const retention = find("RETENTION-EVIDENCE.txt");
  const all = rendered.map((r) => r.text).join("\n");

  const require_ = (ok: boolean, why: string): void => {
    if (!ok) problems.push(why);
  };

  /* Current HEAD. */
  require_(
    compat.includes(head),
    "COMPATIBILITY-EVIDENCE.txt does not state the full current HEAD",
  );
  require_(review.includes(head), "REVIEW.txt does not state the full current HEAD");
  require_(
    compat.includes(`  ${short}    not deployed`),
    `the compatibility table does not name ${short} as the current candidate`,
  );

  /* Remote and deployed heads. */
  for (const ref of ["origin/release/observer-demo-rc1", "origin/main"] as const) {
    const sha = git("rev-parse", ref);
    require_(all.includes(sha), `no artefact states ${ref} (${sha.slice(0, 7)})`);
  }

  /* Local-only classification: every unpushed commit named, none deployed. */
  const localOnly = git("log", "--format=%h", "origin/release/observer-demo-rc1..HEAD")
    .split("\n")
    .filter((l) => l.length > 0);
  const deployed = new Set(DEPLOYMENTS.map((d) => d.sha));
  for (const c of localOnly) {
    require_(compat.includes(c), `COMPATIBILITY-EVIDENCE.txt omits local-only commit ${c}`);
    if (!deployed.has(c)) {
      const block = /NOT DEPLOYED:[\s\S]*?\./.exec(compat)?.[0] ?? "";
      require_(block.includes(c), `${c} is not deployed but is missing from the NOT DEPLOYED set`);
    }
  }
  /*
   * Bounded to the block itself. An unbounded lazy match ran on to the end of
   * the document and found a deployed SHA in a later section, reporting a
   * contradiction that was not there.
   */
  const notDeployedBlock = /NOT DEPLOYED:[^.]*\./.exec(compat)?.[0] ?? "";
  for (const sha of deployed) {
    require_(
      !notDeployedBlock.includes(sha),
      `the NOT DEPLOYED set names ${sha}, which is deployed`,
    );
  }

  /* The live observation: one timestamp, one bucket age, everywhere. */
  require_(
    retention.includes(LIVE.observedAt),
    "RETENTION-EVIDENCE.txt does not state the observation timestamp",
  );
  require_(review.includes(LIVE.observedAt), "REVIEW.txt does not state the observation timestamp");
  for (const [name, text] of [
    ["RETENTION-EVIDENCE.txt", retention],
    ["REVIEW.txt", review],
    ["COMPATIBILITY-EVIDENCE.txt", compat],
  ] as const) {
    const hours = [...text.matchAll(/oldest[^\n]*?(\d+)\s*hours|(\d+)\s*hours[^\n]*?rising/gi)]
      .map((m) => Number(m[1] ?? m[2]))
      .filter((n) => Number.isFinite(n));
    for (const h of hours) {
      require_(
        h === LIVE.oldestBucketHours,
        `${name} states an oldest-bucket age of ${h} hours; the snapshot says ${LIVE.oldestBucketHours}`,
      );
    }
  }

  /* The inventory provenance must name the bundle it is anchored to. */
  require_(
    INVENTORY_UNCHANGED_IN.length > 0 &&
      all.includes(INVENTORY_UNCHANGED_IN[INVENTORY_UNCHANGED_IN.length - 1] ?? ""),
    "no artefact names the bundle the deployment inventory was last enumerated for",
  );

  /* Executable SQL: the claim and the computed hashes must agree. */
  const contractPath = `${MIGRATIONS_DIR}/20260826090000_observer_audit_facade_cleanup.sql`;
  const now = createHash("sha256")
    .update(strip(readFileSync(join(REPO_ROOT, contractPath), "utf8")))
    .digest("hex");
  require_(
    now === execSha(`${parentShort}`, contractPath),
    "the contract migration's executable SQL changed since the previous commit",
  );
  require_(
    review.includes(now),
    "REVIEW.txt does not state the contract migration's executable SQL hash",
  );

  return problems;
}

/**
 * Every hex token of eight or more characters in an evidence file must be a
 * prefix of a hash this package can account for. Pure-decimal runs are
 * migration timestamps and are skipped.
 */
function hashAccounting(dir: string, rendered: readonly Rendered[]): readonly string[] {
  const allowed = new Set<string>();
  for (const p of walk(dir)) allowed.add(sha256File(p));

  const m4 = `${MIGRATIONS_DIR}/20260826140000_observer_bucket_retention.sql`;
  const contract = `${MIGRATIONS_DIR}/20260826090000_observer_audit_facade_cleanup.sql`;
  for (const c of ["HEAD", "HEAD~1", "bb574b6", "7e3c00a", "ee954b8", "c6fdc73", "f1dbffd"]) {
    for (const path of [m4, contract]) {
      allowed.add(execSha(c, path));
      allowed.add(fileShaAt(c, path));
    }
  }
  for (const line of git("rev-list", "1ee5d2d^..HEAD").split("\n")) allowed.add(line.trim());
  for (const ref of ["origin/release/observer-demo-rc1", "origin/main"])
    allowed.add(git("rev-parse", ref));
  /* The migration-4 paste wrapper as verified in the previous review. */
  allowed.add("a2ec32264583f5d57b87d0db089d4a707de8b317786624084a4e4a2b61b1eef5");
  /*
   * The archives already handed over. Declared in live-snapshot.ts rather than
   * recovered by opening seven ZIPs, which is what made the previous packager
   * unable to run in a fresh clone.
   */
  for (const a of DELIVERED_ARCHIVES) allowed.add(a.sha256);

  const problems: string[] = [];
  let checked = 0;
  for (const { name, text } of rendered) {
    text.split("\n").forEach((line, i) => {
      for (const token of line.match(/[0-9a-f]{8,}/g) ?? []) {
        if (!/[a-f]/.test(token)) continue; /* a timestamp, not a hash */
        checked += 1;
        if (![...allowed].some((h) => h.startsWith(token))) {
          problems.push(`${name}:${i + 1}  ${token}  accounted for by nothing in this package`);
        }
      }
    });
  }
  say(`  hash accounting          ${checked} tokens, ${problems.length} unaccounted`);
  return problems;
}

function recipeCheck(dir: string): readonly string[] {
  const problems: string[] = [];
  for (const path of walk(dir)) {
    const name = relative(dir, path).split(sep).join("/");
    if (!inScope(name)) continue;
    for (const o of scanText(readFileSync(path, "utf8"))) {
      problems.push(`${name}:${o.line}  ${o.kind}  ${o.text.slice(0, 90)}`);
    }
  }
  return problems;
}

function wrapperCheck(): readonly string[] {
  const problems: string[] = [];
  for (const spec of WRAPPERS) {
    const path = join(REPO_ROOT, "_sql-to-paste", spec.out);
    if (!existsSync(path)) {
      problems.push(`${spec.out} is missing; run pnpm release:wrappers`);
      continue;
    }
    const wrapper = readFileSync(path, "utf8");
    if (wrapper !== renderWrapper(spec)) problems.push(`${spec.out} does not match its source`);
    if (extractBody(wrapper) !== readFileSync(join(REPO_ROOT, spec.source), "utf8")) {
      problems.push(`${spec.out} body is not byte-identical to ${spec.source}`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------
   4. The manifest, in a form a standard checker consumes silently.
------------------------------------------------------------------------- */

function writeManifest(dir: string, head: string): number {
  const files = walk(dir)
    .map((p) => relative(dir, p).split(sep).join("/"))
    .filter((n) => n !== "hashes.txt")
    .sort();

  const lines = [
    "# IRIS OBSERVER — SHA-256 MANIFEST",
    `# Commit ${head}`,
    "#",
    "# Every prose line here starts with '#', so a standard checker consumes this",
    "# file without warnings:",
    "#",
    "#   sha256sum -c hashes.txt        (POSIX)",
    "#   Get-FileHash -Algorithm SHA256 (Windows, one file at a time)",
    "#",
    "# hashes.txt is not listed in hashes.txt: a file cannot contain its own",
    "# digest. Neither is the archive's SHA-256, for the same reason one level up",
    "# — embedding it would change the bytes it describes. The packager prints it",
    "# and the covering report states it; distribute it ALONGSIDE the archive.",
    "#",
    ...files.map((n) => `${sha256File(join(dir, n))}  ${n}`),
    `# ${files.length} files.`,
    "",
  ];
  writeFileSync(join(dir, "hashes.txt"), lines.join("\n"), "utf8");
  return files.length;
}

/* -------------------------------------------------------------------------
   5. Build.
------------------------------------------------------------------------- */

export function build(outDir: string): {
  archive: string;
  sha: string;
  entries: number;
  manifest: number;
} {
  const { head, short } = requireCleanHead();
  say(`building the ${short} package`);

  const dir = join(outDir, short);
  stage(dir);
  const copied = walk(dir).length;
  /* The evidence files are staged too; they are written by the render below. */
  const evidenceCount = readdirSync(join(REPO_ROOT, "docs/release")).filter((f) =>
    f.endsWith(".txt"),
  ).length;
  const stagedFiles = copied + evidenceCount;
  say(
    `  staged                   ${copied} copied + ${evidenceCount} rendered = ${stagedFiles} files`,
  );

  const rendered = renderEvidence(dir, stagedFiles);
  say(`  rendered                 ${rendered.length} evidence files, no placeholder left`);

  const problems = [
    ...semanticChecks(rendered).map((p) => `semantic:  ${p}`),
    ...hashAccounting(dir, rendered).map((p) => `hash:      ${p}`),
    ...recipeCheck(dir).map((p) => `recipe:    ${p}`),
    ...wrapperCheck().map((p) => `wrapper:   ${p}`),
  ];
  if (problems.length > 0) {
    throw new Refusal(
      `${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join("\n")}`,
    );
  }
  say("  semantic, hash, recipe and wrapper checks all pass");

  const manifest = writeManifest(dir, head);
  const archive = join(outDir, `IRIS-Observer-${short}-review.zip`);
  const when = new Date(git("show", "-s", "--format=%cI", "HEAD"));
  const entries = writeZip(dir, archive, when).length;

  return { archive, sha: sha256File(archive), entries, manifest };
}

function main(): void {
  const verify = process.argv.includes("--verify");
  const outDir = join(REPO_ROOT, "_review");

  try {
    const first = build(outDir);
    say("");
    say(`  archive   ${relative(REPO_ROOT, first.archive).split(sep).join("/")}`);
    say(`  entries   ${first.entries} (${first.manifest} in the manifest, plus hashes.txt)`);
    say(`  SHA-256   ${first.sha}`);

    if (verify) {
      say("");
      say("  rebuilding under three time zones to test the determinism claim:");
      const scratch = join(tmpdir(), `observer-release-${process.pid}`);
      const hashes: string[] = [];
      for (const tz of ["UTC", "Europe/Budapest", "America/New_York"]) {
        /* Through tsx: this file is TypeScript and bare node cannot load it. */
        const out = execFileSync(
          process.execPath,
          [
            join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
            process.argv[1] ?? "",
            "--child",
            scratch,
          ],
          { cwd: REPO_ROOT, encoding: "utf8", env: { ...process.env, TZ: tz } },
        ).trim();
        const sha = out.split("\n").pop() ?? "";
        hashes.push(sha);
        say(`    TZ=${tz.padEnd(18)} ${sha}`);
      }
      rmSync(scratch, { recursive: true, force: true });
      const same = hashes.every((h) => h === hashes[0]);
      say(`    identical across zones: ${same ? "YES" : "NO"}`);
      if (!same) throw new Refusal("the archive is not reproducible across time zones");
    }
  } catch (e) {
    if (e instanceof Refusal) {
      say("");
      say(`PACKAGE GENERATION REFUSED — ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

/* A child run prints only its archive hash, so the parent can compare. */
if (process.argv.includes("--child")) {
  const scratch = process.argv[process.argv.indexOf("--child") + 1] ?? tmpdir();
  mkdirSync(scratch, { recursive: true });
  say(build(scratch).sha);
} else if (process.argv[1]?.endsWith("build-package.ts")) {
  main();
}
