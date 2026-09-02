/**
 * A read-only check that the repository is ready for an authoritative gate.
 *
 *   pnpm release:readiness
 *
 * THIS IS NOT THE GATE. It runs nothing, measures nothing about the code, and
 * produces no evidence anything may be packaged from. It answers one question —
 * "would starting the authoritative gate right now be starting it under the
 * conditions the milestone requires?" — and it exists because every one of
 * those conditions has been got wrong at least once:
 *
 *   * a gate run at the wrong commit, because HEAD had moved;
 *   * a gate run with edits in the tree, which then measured bytes no commit
 *     contained;
 *   * a gate run while a lock from an interrupted attempt was still held;
 *   * a package built beside an older archive at the same distributable path.
 *
 * It writes nothing at all.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./facts";
import { treeIdentity, treeProblems } from "./tree-identity";
import { readOperationLock, lockStateProblems } from "./release-operation";

function main(): void {
  const identity = treeIdentity(REPO_ROOT);
  const problems: string[] = [];

  console.log("release readiness (read-only; this is NOT the authoritative gate)");
  console.log("");
  console.log(`  branch      ${identity.branch}`);
  console.log(`  head        ${identity.head}`);
  console.log(`  tree        ${identity.treeId}`);
  console.log(`  inputs      ${identity.inputsDigest.slice(0, 32)}…`);
  console.log(`  tracked     ${String(identity.trackedFiles)} files`);
  console.log(`  suites      ${String(identity.suiteInventory.length)} expected`);

  const tree = treeProblems(REPO_ROOT);
  console.log(`  clean       ${tree.length === 0 ? "yes" : "NO"}`);
  problems.push(...tree);

  const lock = readOperationLock(REPO_ROOT);
  const held = lockStateProblems(lock, "gate");
  console.log(`  mutex       ${lock.kind === "free" ? "free" : lock.kind.toUpperCase()}`);
  problems.push(...held);

  /*
   * A SAME-HEAD ARCHIVE AT THE DISTRIBUTABLE PATH.
   *
   * Not fatal by itself — it may be a package built at this commit already —
   * but it is reported, because a refusal that leaves one behind is exactly the
   * failure mode the packager now cleans up after, and a leftover is
   * indistinguishable from a verified archive by looking at it.
   */
  const short = identity.head.slice(0, 7);
  const archive = join(REPO_ROOT, "_review", `IRIS-Observer-${short}-review.zip`);
  console.log(`  same-HEAD   ${existsSync(archive) ? `PRESENT at _review/ for ${short}` : "none"}`);
  if (existsSync(archive)) {
    problems.push(
      `an archive for ${short} already exists at the distributable path — remove or ` +
        "rename it before packaging, so a new build cannot be confused with it",
    );
  }

  /* Any leftover staging directory is an operation that did not clean up. */
  const reviewDir = join(REPO_ROOT, "_review");
  const staging = existsSync(reviewDir)
    ? readdirSync(reviewDir).filter((e) => e.startsWith(".staging-"))
    : [];
  console.log(
    `  staging     ${staging.length === 0 ? "clean" : `${String(staging.length)} left behind`}`,
  );
  for (const dir of staging) {
    problems.push(`a package operation left _review/${dir} behind`);
  }

  console.log("");
  if (problems.length === 0) {
    console.log("READY. The authoritative gate may be started at this commit.");
    return;
  }
  console.log("NOT READY:");
  for (const problem of problems) console.log(`  ${problem}`);
  process.exit(1);
}

main();
