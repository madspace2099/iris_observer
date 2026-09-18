/**
 * A real release operation that dies at a named barrier.
 *
 * ## Why a child process rather than a thrown exception
 *
 * A mocked throw runs `finally` blocks, unwinds cleanly and lets the process
 * tidy up after itself — which is exactly what a crash does not do. The two
 * boundaries this exists for are defined by what is left BEHIND when nothing
 * unwinds: a canonical archive with no journal completion, or a released mutex
 * beside a stale terminal claim. Only a process that stops executing can
 * produce those.
 *
 * So this is a real script, run as a real child, and `process.kill(pid,
 * "SIGKILL")` from inside it at the barrier. SIGKILL is uncatchable: no
 * handler, no `finally`, no flush. What remains on disk afterwards is what a
 * power cut would have left.
 */

import { linkSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendJournal,
  identifyArchive,
  type JournalContext,
} from "../../../scripts/release/operation-journal";
import {
  beginOperation,
  endOperation,
  enterTerminalPhase,
  releaseTerminalPhase,
  type Operation,
} from "../../../scripts/release/release-operation";

/** Every point at which this child may be killed, named so a test can say which. */
export const BARRIERS = Object.freeze([
  "before-lock",
  "after-lock",
  "after-journal-started",
  "after-pending",
  "after-gate-green",
  "during-staging",
  "after-package-verified",
  "after-canonical-link",
  "after-published-record",
  "after-end-operation",
  "never",
] as const);

export type Barrier = (typeof BARRIERS)[number];

const HEAD = "ab1f773f602e8ddce9089c685690872c7741b034";
const TREE = "0f0b763631d9d2faa485d315edd2cc63b5d31407";
const DIGEST = "0".repeat(64);

/** Stop dead. Uncatchable, so nothing unwinds and nothing is tidied up. */
function die(): never {
  process.kill(process.pid, "SIGKILL");
  /* Unreachable; SIGKILL does not return. */
  throw new Error("unreachable");
}

export function runToBarrier(root: string, barrier: Barrier, operationId: string): void {
  const context: JournalContext = { branch: "release/observer-demo-rc1", inputsDigest: DIGEST };

  if (barrier === "before-lock") die();

  const op: Operation = beginOperation(root, "package", HEAD, TREE, operationId);
  if (barrier === "after-lock") die();

  appendJournal(root, op, context, "started", { note: "crash fixture" });
  if (barrier === "after-journal-started") die();

  mkdirSync(join(root, ".release"), { recursive: true });
  writeFileSync(join(root, op.pendingPath), '{"pending":true}\n', "utf8");
  if (barrier === "after-pending") die();

  appendJournal(root, op, context, "gate-green", { note: "crash fixture" });
  if (barrier === "after-gate-green") die();

  appendJournal(root, op, context, "package-staging", { note: "crash fixture" });
  if (barrier === "during-staging") die();

  /* A private candidate, exactly as the packager builds one. */
  mkdirSync(join(root, "_review"), { recursive: true });
  const privateRel = `_review/.candidate-${operationId}.zip`;
  writeFileSync(join(root, privateRel), `candidate bytes for ${operationId}\n`, "utf8");
  const candidate = identifyArchive(root, privateRel);
  appendJournal(root, op, context, "package-verified", {
    archive: candidate,
    note: "crash fixture",
  });
  if (barrier === "after-package-verified") die();

  const canonicalRel = `_review/IRIS-Observer-${HEAD.slice(0, 7)}-review.zip`;
  const hold = enterTerminalPhase(root, op, "publish");

  appendJournal(root, op, context, "publishing", {
    archive: { ...candidate, path: canonicalRel },
    note: "crash fixture",
  });
  /*
   * A HARD LINK, exactly as the packager publishes. The canonical path and the
   * private candidate are then the SAME inode, which is what makes "is this file
   * the one that operation created?" a question with an answer.
   */
  linkSync(join(root, privateRel), join(root, canonicalRel));
  if (barrier === "after-canonical-link") die();

  appendJournal(root, op, context, "published", {
    archive: identifyArchive(root, canonicalRel),
    note: "crash fixture",
  });
  if (barrier === "after-published-record") die();

  endOperation(root, op);
  if (barrier === "after-end-operation") die();

  releaseTerminalPhase(root, hold);
}

/* Invoked as a child: `tsx crash-child.ts <root> <barrier> <operationId>`. */
if (process.argv[1]?.endsWith("crash-child.ts")) {
  const [, , root, barrier, operationId] = process.argv;
  runToBarrier(root ?? "", (barrier ?? "never") as Barrier, operationId ?? "0".repeat(16));
}
