#!/usr/bin/env node
/**
 * Prove that nothing on a frozen surface moved.
 *
 * ## Why this file exists rather than a checked-in list of hashes
 *
 * Phase 1 made one claim over and over: schema, contracts, ingestion and the
 * UE5 wire contract did not move, in any of twelve rounds. That claim carried
 * the weight of the whole phase, and it was checked by an ad-hoc `node -e`
 * retyped each time against a hash file under `_review/`, which is git-ignored.
 *
 * Two things were wrong with that, and the second is worse than the first.
 * Retyping the check meant it could be retyped wrong — and on 2026-09-21 it was:
 * a parser looking for 64-character hashes met a file of 16-character ones,
 * matched nothing, and printed "nothing deviated". A check that examines zero
 * files and reports success is worse than no check, because it produces
 * confidence. It was caught only because the script printed its denominator,
 * which is the repository's own first page rule applied to itself.
 *
 * The deeper problem was that both the checker and the hashes lived on one
 * machine. A claim nobody else can re-run is an assertion, not evidence.
 *
 * So there is no hash file. The baseline is a **commit**, the surfaces are
 * declared below, and the comparison is `git diff` against that commit. Anybody
 * with the repository can re-run it and get the same answer, and there is
 * nothing to regenerate, drift or lose.
 *
 * ## Usage
 *
 *   node scripts/frozen-surfaces.mjs                  # against the default base
 *   node scripts/frozen-surfaces.mjs --base <ref>     # against another ref
 *   node scripts/frozen-surfaces.mjs --list           # what counts as frozen
 *
 * Exit 0 when nothing on a frozen surface differs, 1 when something does, and 1
 * when the comparison examined no files at all — which is the failure mode this
 * script was written after.
 */

import { execFileSync } from "node:child_process";

/**
 * The frozen surfaces.
 *
 * A path here is a promise that a phase does not touch it. Adding one is cheap;
 * removing one should be a decision somebody records, because the value of the
 * list is that it did not change when it was inconvenient.
 */
const FROZEN = Object.freeze([
  "supabase/migrations",
  "supabase/README.md",
  "packages/contracts/src",
  "packages/sources/src",
  "docs/ue5-contract",
  "docs/ue5-ingestion-contract.md",
  "docs/ue5-integration-handoff.md",
]);

/**
 * The commit the frozen surfaces are frozen AS OF.
 *
 * Phase 1's baseline, and the answer to "unchanged since when". A later phase
 * that legitimately moves one of these surfaces moves this too, in the same
 * commit, so the pairing stays readable in the history.
 */
const DEFAULT_BASE = "aac1866485da5d872a93653e781e56a4fac6d441";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function arg(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

if (process.argv.includes("--list")) {
  for (const path of FROZEN) console.log(path);
  process.exit(0);
}

const base = arg("--base") ?? DEFAULT_BASE;

let baseResolved;
try {
  baseResolved = git("rev-parse", "--verify", `${base}^{commit}`).trim();
} catch {
  console.error(`frozen-surfaces: cannot resolve base ref "${base}".`);
  process.exit(1);
}

/*
 * AGAINST THE WORKING TREE, NOT AGAINST HEAD.
 *
 * The first version of this file compared the base to `HEAD`, and its own
 * mutation probe walked straight through it: a frozen migration edited on disk
 * is not in HEAD, so two commits agreed with each other while the file the
 * reader would actually load had changed. That is the same defect as the
 * vacuous parse this script replaced — a check that does not examine what it
 * says it examines — arrived at from the opposite direction.
 *
 * One ref and no second one means "base versus what is on disk now", which is
 * the question being asked. `--` separates the ref from the paths so a path
 * that looks like a ref cannot be read as one, and every frozen path is passed
 * explicitly, so a surface deleted outright still registers as a difference
 * rather than silently contributing nothing.
 */
const modified = git("diff", "--name-only", baseResolved, "--", ...FROZEN)
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

/*
 * A file nobody tracked yet is still a file that arrived on a frozen surface,
 * and `git diff` cannot see one. A new migration dropped into the directory is
 * exactly the change this script exists to notice.
 */
const untracked = git("ls-files", "--others", "--exclude-standard", "--", ...FROZEN)
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const changed = [...modified, ...untracked].sort();

/*
 * The denominator. Counted from the base rather than from the working tree,
 * because a surface someone deleted would otherwise shrink the number it is
 * meant to be measured against.
 */
const tracked = git("ls-tree", "-r", "--name-only", baseResolved, "--", ...FROZEN)
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

console.log(
  `base:                 ${baseResolved.slice(0, 7)}  (${base === baseResolved ? "explicit" : base})`,
);
console.log(`frozen surfaces:      ${FROZEN.length}`);
console.log(`files under them:     ${tracked.length}`);
console.log(`changed since base:   ${changed.length}`);

if (tracked.length === 0) {
  console.error(
    "\nfrozen-surfaces: the base commit holds no files on any frozen surface, so this run " +
      "compared nothing. That is not a pass — check the paths above against the repository.",
  );
  process.exit(1);
}

if (changed.length > 0) {
  console.error("\nfrozen-surfaces: a frozen surface moved.\n");
  for (const file of changed) console.error(`  CHANGED  ${file}`);
  console.error(
    "\nIf one of these was meant to move, move DEFAULT_BASE in this file in the same commit, " +
      "so the history says when the surface was unfrozen and by what.",
  );
  process.exit(1);
}

console.log("\n— nothing on a frozen surface moved —");
