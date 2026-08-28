/**
 * Recover from an interrupted release operation, bound to that exact operation.
 *
 *   pnpm release:recover                  say what holds the mutex
 *   pnpm release:recover --operation=<id> recover that operation, and only it
 *   pnpm release:recover --operation=<id> --terminal-claim
 *                                          quarantine an ABANDONED terminal
 *                                          claim, having established that the
 *                                          process holding it is gone
 *
 * ## Why deleting the lock was never recovery
 *
 * The refusal used to end "if that operation is really gone, delete the lock".
 * That is unsafe, and the reason is a gap of a few milliseconds: an operation
 * takes the mutex BEFORE it writes the in-progress marker, so one that dies in
 * between leaves the PREVIOUS green record untouched. Removing only the lock
 * then makes a superseded record packageable again — at the right commit, with
 * a clean tree, passing every check the packager makes.
 *
 * So recovery is one operation with four steps, and it names the operation it
 * recovers so a stale instruction cannot clear a live one:
 *
 *   1. validate the exact active operation identity;
 *   2. tombstone the canonical result, atomically;
 *   3. quarantine only that operation's pending state;
 *   4. release only that operation's lock.
 *
 * Packaging then refuses until a new gate completes, because a tombstone is not
 * a result.
 */

import { REPO_ROOT } from "./facts";
import { GATE_RECORD_PATH } from "./gate-contract";
import {
  readOperationLock,
  recoverOperation,
  recoverTerminalClaim,
  readTerminalClaim,
  endOperation,
  pendingPathFor,
  OPERATION_LOCK_PATH,
  OperationRefused,
} from "./release-operation";
import { resolveOperation, unresolvedOperations, RESOLVE_COMMAND } from "./operation-journal";
import { verifyArchiveIntegrity } from "./build-package";
import { join } from "node:path";

/**
 * Resolve one operation by name, whatever it crashed in the middle of.
 *
 * Deliberately BEFORE every other check in this command, because the states it
 * exists for are exactly the ones the other checks cannot read: a crash after
 * `endOperation()` leaves no mutex, so anything that begins by reading the mutex
 * refuses and the operation stays stuck forever.
 */
function resolve(operationId: string): void {
  const outcome = resolveOperation(REPO_ROOT, operationId, {
    /*
     * The complete integrity routine, on the exact canonical file. An archive
     * is finalised only if it is this operation's own inode AND passes every
     * check a reviewer would run.
     */
    verifyArchive: (rel) => {
      try {
        verifyArchiveIntegrity(join(REPO_ROOT, rel), REPO_ROOT);
        return [];
      } catch (e) {
        return [(e as Error).message];
      }
    },
    /*
     * Release only what still belongs to this operation. Neither is required to
     * be present: the whole point is that a crash may have left either, both or
     * neither behind.
     */
    releaseOwnership: (entry) => {
      const steps: string[] = [];
      const claim = readTerminalClaim(REPO_ROOT);
      if (claim !== null && claim.operationId === entry.operationId) {
        steps.push(...recoverTerminalClaim(REPO_ROOT, entry.operationId));
      }
      const lock = readOperationLock(REPO_ROOT);
      if (lock.kind === "held" && lock.lock.operationId === entry.operationId) {
        endOperation(REPO_ROOT, {
          kind: lock.lock.kind,
          operationId: entry.operationId,
          head: lock.lock.head,
          treeId: lock.lock.treeId,
          token: lock.token,
          pendingPath: pendingPathFor(entry.operationId),
        });
        steps.push(`released the ${lock.lock.kind} mutex held by ${entry.operationId}`);
      }
      return steps;
    },
  });
  console.log(`operation ${outcome.operationId}: ${String(outcome.from)} -> ${outcome.to}`);
  for (const step of outcome.steps) console.log(`  ${step}`);
}

function main(): void {
  /*
   * UNRESOLVED OPERATIONS FIRST, because they are what blocks everything and
   * because a crash may have left no mutex for the code below to read.
   */
  const stuck = unresolvedOperations(REPO_ROOT);
  const arg0 = process.argv.find((a) => a.startsWith("--operation="));
  if (process.argv.includes("--resolve")) {
    if (arg0 === undefined) {
      console.log("--resolve needs --operation=<id>. Unresolved operations:");
      for (const u of stuck) console.log(`  ${u.operationId}  ${u.state}  ${u.entry.at}`);
      process.exit(1);
    }
    try {
      resolve(arg0.slice("--operation=".length));
    } catch (e) {
      if (!(e instanceof OperationRefused)) throw e;
      console.log(`RESOLUTION REFUSED — ${e.message}`);
      process.exit(1);
    }
    return;
  }
  if (stuck.length > 0) {
    console.log("one or more operations are unresolved:");
    console.log("");
    for (const u of stuck) {
      console.log(`  ${u.operationId}  ${u.state}  recorded ${u.entry.at}`);
      console.log(`    ${RESOLVE_COMMAND(u.operationId)}`);
    }
    console.log("");
    console.log("Resolution is explicit and operation-bound. It never takes an operation");
    console.log("away on a timer, never deletes an archive it cannot prove is that");
    console.log("operation's own, and running it twice changes nothing the second time.");
    return;
  }
  const state = readOperationLock(REPO_ROOT);

  if (state.kind === "free") {
    console.log("no release operation owns the mutex; there is nothing to recover.");
    return;
  }

  if (state.kind === "unsafe") {
    console.log(`the lock cannot be read: ${state.why}`);
    console.log("");
    console.log(`  Inspect ${OPERATION_LOCK_PATH} by hand before anything else touches it.`);
    console.log("  No operation can be identified, so no operation can be recovered, and");
    console.log("  clearing an unidentifiable lock is exactly the guess this refuses to make.");
    process.exit(1);
  }

  const held = state.lock;
  const arg = process.argv.find((a) => a.startsWith("--operation="));
  if (arg === undefined) {
    console.log(`a ${held.kind} operation owns the release mutex:`);
    console.log("");
    console.log(`  operation   ${held.operationId}`);
    console.log(`  kind        ${held.kind}`);
    console.log(`  started     ${held.startedAt}`);
    console.log(`  head        ${held.head.slice(0, 7)}`);
    console.log(`  tree        ${held.treeId.slice(0, 12)}`);
    console.log("");
    console.log("If that operation is really gone — you can see it is not running — recover it:");
    console.log("");
    console.log(`  pnpm release:recover --operation=${held.operationId}`);
    console.log("");
    console.log("That tombstones the canonical result, quarantines this operation's pending");
    console.log("state, and releases only this lock. Packaging stays refused until a new gate");
    console.log("completes, because the previous green record may be one this operation had");
    console.log("already begun to replace.");

    /*
     * AND THE TERMINAL CLAIM, SEPARATELY, because it is a separate decision.
     *
     * A publisher inside its terminal phase and a process that died holding the
     * claim leave the same file. Recovery will not take the phase from either,
     * so quarantining the claim is an act the operator performs deliberately —
     * after establishing the process is gone — rather than something recovery
     * decides on their behalf with a timeout.
     */
    const claim = readTerminalClaim(REPO_ROOT);
    if (claim !== null) {
      console.log("");
      console.log(`A TERMINAL CLAIM IS ALSO PRESENT: ${claim.action} for ${claim.operationId},`);
      console.log(`claimed ${claim.claimedAt}. Recovery will not take it.`);
      console.log("");
      console.log("If that process is gone too, quarantine the claim first — it is moved aside,");
      console.log("never deleted, and nothing about a published archive is inferred from it:");
      console.log("");
      console.log(`  pnpm release:recover --operation=${held.operationId} --terminal-claim`);
    }
    return;
  }

  const operationId = arg.slice("--operation=".length);
  try {
    /*
     * THE CLAIM FIRST, AND ONLY WHEN ASKED. Quarantining it is a decision about
     * whether a process is alive, which nothing here can observe.
     */
    if (process.argv.includes("--terminal-claim")) {
      const moved = recoverTerminalClaim(REPO_ROOT, operationId);
      console.log(`terminal claim for ${operationId}:`);
      for (const step of moved) console.log(`  ${step}`);
      console.log("");
      console.log("  Now run the same command without --terminal-claim to recover the operation.");
      return;
    }
    const done = recoverOperation(REPO_ROOT, operationId, GATE_RECORD_PATH);
    console.log(`recovered ${held.kind} operation ${operationId}:`);
    for (const step of done) console.log(`  ${step}`);
    console.log("");
    console.log("  Run `pnpm release:gates` before packaging anything.");
  } catch (e) {
    if (!(e instanceof OperationRefused)) throw e;
    console.log(`RECOVERY REFUSED — ${e.message}`);
    process.exit(1);
  }
}

main();
