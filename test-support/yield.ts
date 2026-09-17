import { beforeEach } from "vitest";

/**
 * LET THE WORKER READ ITS PARENT'S REPLIES BEFORE EVERY TEST.
 *
 * A Vitest worker reports progress to its parent over an RPC with a sixty-second
 * deadline kept on the worker's side, and it can only read the parent's reply
 * from its event loop. A synchronous hook followed by synchronous tests is ONE
 * stretch as far as that loop is concerned: awaiting an already-settled promise
 * is a microtask, and microtasks never reach the poll phase. So the rule in
 * `vitest.config.ts`, that no synchronous stretch may approach sixty seconds, was
 * being broken by stretches that were each well inside it.
 *
 * Found on 2026-09-18, when the whole suite passed 3564 tests and still exited 1
 * on two `Timeout calling "onTaskUpdate"` errors, with nothing else running. The
 * release suites build a package synchronously in a hook (about 45 seconds under
 * the four-worker suite, and growing with the repository) and then run
 * synchronous tests, one of which scans the branch's history for another 40.
 *
 * Reproduced with one file and one worker: a hook and a test that each block for
 * 35 seconds. Measured there, on Windows: ONE turn of the loop is not enough and
 * the run still fails; five turns pass. A reply on the worker's IPC pipe takes
 * more than one poll to be read whole and delivered, so the loop is turned a few
 * times and not once. `setImmediate` and not a timer, because the check phase
 * follows the poll phase directly and the cost is microseconds: 411 fast tests
 * run in the same 1.7 seconds with this file as without.
 *
 * ponytail: this separates stretches, it does not shorten one. A single hook or
 * test that blocks for sixty seconds by itself still fails; when the package
 * build or the history scan gets there, run it in a child process.
 */
beforeEach(async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
});
