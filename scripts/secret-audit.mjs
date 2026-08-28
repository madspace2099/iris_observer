#!/usr/bin/env node
/**
 * Secret audit.
 *
 * Scans the working tree, the browser bundle, the staged diff and the history
 * this branch added, for anything shaped like a credential.
 *
 * **It never prints a match.** Reporting a secret to prove a secret leaked is
 * the same leak again, in a place more people read. Output is a filename, a
 * line number and the name of the rule that fired.
 *
 * Exit 0 clean, 1 findings, 2 clean but the browser bundle was not built — an
 * unbuilt tree is "did not look", which is not the same result as "nothing
 * there" and must not be reported as one.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/*
 * What a credential looks like.
 *
 * LOADED, NOT RESTATED. These rules were written out here and again inside the
 * release gate's staged-record detector, with a test that claimed the two were
 * synchronised while reading only one of them. They had already diverged. The
 * definitions now live in one file both systems read, so "in step" is a fact
 * about the code rather than a claim in a comment.
 *
 * Prefix-anchored wherever the vendor publishes a prefix. A generic "long
 * base64-ish string" rule fires on every lockfile hash, and a scanner people
 * learn to ignore is not a control.
 */
export const PATTERNS_FILE = "scripts/release/secret-patterns.json";

export function loadRules(scope) {
  const doc = JSON.parse(readFileSync(resolve(ROOT, PATTERNS_FILE), "utf8"));
  return doc.rules
    .filter((r) => r.scopes.includes(scope))
    .map((r) => ({ name: r.name, pattern: new RegExp(r.pattern) }));
}

const RULES = loadRules("audit");

/** The file whose whole job is to describe the rules, and so matches them. */
const SELF = new Set(["scripts/secret-audit.mjs", PATTERNS_FILE]);

const SKIP_DIR =
  /(^|\/)(node_modules|\.git|\.next|dist|coverage|playwright-report|test-results)(\/|$)/;
const BINARY = /\.(png|jpg|jpeg|gif|webp|avif|ico|pdf|woff2?|ttf|otf|zip|mp4|webm|map)$/i;

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
}

function scanText(label, text) {
  const found = [];
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) found.push({ label, line: i + 1, rule: rule.name });
    }
  }
  return found;
}

function scanFile(path) {
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  if (SELF.has(rel) || BINARY.test(rel)) return [];
  try {
    if (statSync(path).size > 8 * 1024 * 1024) return [];
    return scanText(rel, readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

const findings = [];

/* 1. Everything git knows about, tracked or not, that is not ignored. */
const listed = git(["ls-files", "--cached", "--others", "--exclude-standard"])
  .split("\n")
  .map((p) => p.trim())
  .filter((p) => p.length > 0 && !SKIP_DIR.test(p));

for (const rel of listed) findings.push(...scanFile(resolve(ROOT, rel)));

/* 2. The staged diff, which is what a commit would actually carry. */
findings.push(...scanText("<staged diff>", git(["diff", "--cached"])));

/*
 * 3. The history this branch added on top of the remote, COMMIT BY COMMIT.
 *
 * ## Why one commit at a time
 *
 * The previous edition concatenated a single `git log -p` and reported a line
 * number inside it — a number naming nothing a person could act on. Scanning
 * each commit separately means a finding names the commit that introduced it,
 * which is what somebody needs in order to fix it.
 *
 * ## Why there is no exemption here
 *
 * A commit whose diff or message carries a secret-shaped assignment fails, and
 * there is no list of commits that may carry one. An earlier attempt at this
 * milestone added exactly such a list — one entry, by full SHA, for a test
 * fixture — and then needed a second entry for the commit message that
 * described the first. That is the shape of a control being negotiated away one
 * case at a time, and the operator refused it: the local history was repaired
 * instead, and the commits carrying the pattern no longer exist on this branch.
 *
 * `git show` prints the commit message as well as the diff, so both are
 * scanned by the same pass. Neither has an exception.
 */
const range = git(["rev-parse", "--verify", "--quiet", "origin/main"]).trim()
  ? "origin/main..HEAD"
  : "HEAD";
const commits = git(["rev-list", range])
  .split("\n")
  .map((c) => c.trim())
  .filter((c) => c.length > 0);
for (const sha of commits) {
  findings.push(...scanText(`<commit ${sha.slice(0, 7)}>`, git(["show", "--no-color", sha])));
}

/*
 * 4. The browser bundle.
 *
 * The one place where a leaked key stops being a repository problem and starts
 * being a published one. `.next/static` is what ships to the browser;
 * `.next/server` is scanned too, because a server bundle is still a build
 * artefact somebody may copy somewhere.
 */
let bundleFiles = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (!BINARY.test(entry.name)) {
      bundleFiles += 1;
      findings.push(...scanFile(full));
    }
  }
}

for (const root of ["apps/web/.next/static", "apps/web/.next/server"]) {
  walk(resolve(ROOT, root));
}

const report = findings.filter(
  (f, i, all) => all.findIndex((g) => g.label === f.label && g.line === f.line) === i,
);

const bundle =
  bundleFiles === 0
    ? "NOT SCANNED — no build present, run `pnpm --filter @observer/web build` first"
    : `${bundleFiles} files`;

if (report.length === 0) {
  console.log("secret audit: clean");
  console.log(`  working tree     ${listed.length} files`);
  console.log(`  staged diff      scanned`);
  console.log(`  history          ${range}`);
  console.log(`  browser bundle   ${bundle}`);
  process.exit(bundleFiles === 0 ? 2 : 0);
}

console.log(`secret audit: ${report.length} finding(s)`);
for (const f of report) {
  // Filename, line and rule name. Never the match itself.
  console.log(`  ${f.label}:${f.line} — ${f.rule}`);
}
console.log(`  browser bundle   ${bundle}`);
process.exit(1);
