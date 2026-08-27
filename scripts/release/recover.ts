/**
 * Recover from an interrupted release operation, bound to that exact operation.
 *
 *   pnpm release:recover                  say what holds the mutex
 *   pnpm release:recover --operation=<id> recover that operation, and only it
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
  OPERATION_LOCK_PATH,
  OperationRefused,
} from "./release-operation";

function main(): void {
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
    return;
  }

  const operationId = arg.slice("--operation=".length);
  try {
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
