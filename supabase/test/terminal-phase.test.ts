import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  beginOperation,
  endOperation,
  enterTerminalPhase,
  inspectPath,
  OperationRefused,
  pathContainmentProblems,
  readTerminalClaim,
  recoverOperation,
  recoverTerminalClaim,
  releaseTerminalPhase,
  safeMkdir,
  stillOwner,
  terminalQuarantinePathFor,
  terminalReleaseProblems,
  withTerminalPhase,
  GATE_ABANDONED,
  TERMINAL_CLAIM_PATH,
  type Operation,
} from "../../scripts/release/release-operation";
import { GATE_RECORD_PATH } from "../../scripts/release/gate-contract";
import { walk } from "../../scripts/release/zip";
import { scanDirectory } from "../../scripts/release/control-chars";

/**
 * THE ONE INTERVAL IN WHICH A CANONICAL RESULT MAY CHANGE.
 *
 * ## The interleaving these cases exist to forbid
 *
 * Publication used to hold the terminal claim across the rename alone.
 * Independently reproduced, that permitted a publish and a recovery to BOTH
 * partly succeed:
 *
 *   1. the package operation takes the publish claim;
 *   2. the archive is published;
 *   3. the package releases the terminal claim;
 *   4. recovery acquires the terminal claim;
 *   5. recovery tombstones the canonical gate record and releases the mutex;
 *   6. the published archive remains;
 *   7. the publisher's later `endOperation()` fails.
 *
 * A canonical archive beside an ABANDONED gate record is not an outcome either
 * side is entitled to produce, and step 3 is what made it reachable.
 *
 * ## Why these are barriers rather than threads
 *
 * Every case below drives the REAL protocol and stops it at a named point, then
 * runs the real recovery against that exact state. A thread race would exercise
 * the same code and prove nothing repeatable: a barrier says which interleaving
 * was tested, and a failure names the barrier rather than a timing.
 */

const HEAD = "03f43a783025420dc5641c004ff49edd21b40a21";
const TREE = "1234567890abcdef1234567890abcdef12345678";

const scratch = mkdtempSync(join(tmpdir(), "observer-terminal-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A release root nobody else can reach, with a canonical record already in it. */
function root(): string {
  const dir = mkdtempSync(join(scratch, "root-"));
  mkdirSync(join(dir, ".release"), { recursive: true });
  writeFileSync(
    join(dir, GATE_RECORD_PATH),
    `${JSON.stringify({ head: HEAD, status: "GREEN" }, null, 2)}\n`,
    "utf8",
  );
  return dir;
}

const recordOf = (dir: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dir, GATE_RECORD_PATH), "utf8")) as Record<string, unknown>;

const abandoned = (dir: string): boolean => recordOf(dir).status === GATE_ABANDONED;

/** The canonical artefact a publisher would have created. */
const publishArchive = (dir: string): string => {
  const path = join(dir, "published.zip");
  writeFileSync(path, "canonical bytes\n", "utf8");
  return path;
};

describe("publication and recovery are mutually exclusive through completion", () => {
  it("BARRIER: recovery before terminal entry wins, and the publisher cannot then enter", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);

    /* Recovery runs first, completely. */
    const done = recoverOperation(dir, op.operationId, GATE_RECORD_PATH);
    expect(done.join(" ")).toMatch(/tombstoned/);
    expect(abandoned(dir)).toBe(true);
    expect(stillOwner(dir, op)).toBe(false);

    /* The publisher no longer owns the mutex, so it cannot enter the phase. */
    expect(() => enterTerminalPhase(dir, op, "publish")).toThrow(OperationRefused);
    /* And it left no claim behind on the way out. */
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("absent");
  });

  it("BARRIER: recovery while publication is held refuses, and nothing is tombstoned", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const hold = enterTerminalPhase(dir, op, "publish");
    try {
      expect(() => recoverOperation(dir, op.operationId, GATE_RECORD_PATH)).toThrow(
        /a terminal claim is present/,
      );
      /* The canonical record is untouched: exactly one side may act. */
      expect(abandoned(dir)).toBe(false);
      expect(stillOwner(dir, op)).toBe(true);
    } finally {
      expect(releaseTerminalPhase(dir, hold)).toEqual([]);
    }
  });

  it("BARRIER: recovery after the link but before completion still cannot run", () => {
    /*
     * THE EXACT REPRODUCED SEQUENCE. The archive is published and the operation
     * has not finished. Under the delivered code the claim was already released
     * here and recovery walked straight in; under this one the phase is still
     * held, so recovery refuses and the two outcomes stay exclusive.
     */
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const hold = enterTerminalPhase(dir, op, "publish");
    const archive = publishArchive(dir);
    try {
      expect(() => recoverOperation(dir, op.operationId, GATE_RECORD_PATH)).toThrow(
        OperationRefused,
      );
      /* THE STATE THAT MUST NEVER EXIST. */
      expect(existsSync(archive) && abandoned(dir)).toBe(false);
      expect(abandoned(dir)).toBe(false);
    } finally {
      endOperation(dir, op);
      expect(releaseTerminalPhase(dir, hold)).toEqual([]);
    }
    /* Completed cleanly: the archive stands and the record is not a tombstone. */
    expect(existsSync(archive)).toBe(true);
    expect(abandoned(dir)).toBe(false);
  });

  it("BARRIER: recovery after clean completion has nothing to recover", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const archive = withTerminalPhase(dir, op, "publish", () => {
      const path = publishArchive(dir);
      endOperation(dir, op);
      return path;
    });
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("absent");

    /* No mutex is held, so there is no operation to recover. */
    expect(() => recoverOperation(dir, op.operationId, GATE_RECORD_PATH)).toThrow(
      /no operation owns the release mutex/,
    );
    expect(existsSync(archive)).toBe(true);
    expect(abandoned(dir)).toBe(false);
  });

  it("BARRIER: a publisher that lost ownership refuses to enter, releasing its claim", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    /* Somebody else recovers the operation out from under it. */
    recoverOperation(dir, op.operationId, GATE_RECORD_PATH);
    expect(abandoned(dir)).toBe(true);

    expect(() => enterTerminalPhase(dir, op, "publish")).toThrow(OperationRefused);
    /*
     * AND IT LEFT NOTHING. A publisher that refuses on the ownership check must
     * not strand the claim it briefly created; the next operation would then be
     * unable to enter at all.
     */
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("absent");
  });

  it("BARRIER: two competing recovery calls — exactly one tombstones", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);

    const first = recoverOperation(dir, op.operationId, GATE_RECORD_PATH);
    expect(first.join(" ")).toMatch(/tombstoned/);

    /* The second finds no mutex and refuses rather than tombstoning again. */
    expect(() => recoverOperation(dir, op.operationId, GATE_RECORD_PATH)).toThrow(
      /no operation owns the release mutex/,
    );
    const after = recordOf(dir);
    expect(after.status).toBe(GATE_ABANDONED);
    expect(after.operationId).toBe(op.operationId);
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("absent");
  });

  it("BARRIER: the gate record rename races recovery, and the phase decides", () => {
    /*
     * The gate publisher had NO terminal claim at all, so a recovery could
     * tombstone the record in the interval between its last ownership check and
     * its rename — and the rename would then overwrite the tombstone. Holding
     * the phase across both is what makes that unreachable.
     */
    const dir = root();
    const op = beginOperation(dir, "gate", HEAD, TREE);

    withTerminalPhase(dir, op, "publish", () => {
      /* Recovery cannot enter while the rename is pending. */
      expect(() => recoverOperation(dir, op.operationId, GATE_RECORD_PATH)).toThrow(
        OperationRefused,
      );
      writeFileSync(
        join(dir, GATE_RECORD_PATH),
        `${JSON.stringify({ head: HEAD, status: "GREEN", operationId: op.operationId }, null, 2)}\n`,
        "utf8",
      );
      endOperation(dir, op);
    });

    expect(abandoned(dir)).toBe(false);
    expect(recordOf(dir).operationId).toBe(op.operationId);
  });

  it("holds the phase across endOperation, not merely across the rename", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    let heldAtEnd = false;
    withTerminalPhase(dir, op, "publish", () => {
      publishArchive(dir);
      endOperation(dir, op);
      /* Still held AFTER the operation ended — that is the whole correction. */
      heldAtEnd = inspectPath(dir, TERMINAL_CLAIM_PATH).kind === "file";
    });
    expect(heldAtEnd).toBe(true);
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("absent");
  });
});

describe("an abandoned terminal claim is recovered, never taken", () => {
  /** Leave a claim behind exactly as a process that died holding it would. */
  const abandonedClaim = (dir: string, op: Operation): void => {
    enterTerminalPhase(dir, op, "publish");
    /* No release: the process is gone. */
  };

  it("makes recovery possible at all, which it was not", () => {
    /*
     * Recovery enters the terminal phase with the same exclusive create
     * publication uses. A claim left by a dead process therefore made recovery
     * structurally impossible — the create always failed against the file the
     * dead process left. That is a deadlock, not a safety property.
     */
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    abandonedClaim(dir, op);

    /* Ordinary recovery refuses while the claim is there, and says what to do. */
    expect(() => recoverOperation(dir, op.operationId, GATE_RECORD_PATH)).toThrow(
      /--terminal-claim/,
    );

    /* The explicit act, then the recovery it unblocks. */
    const moved = recoverTerminalClaim(dir, op.operationId);
    expect(moved.join(" ")).toMatch(/quarantined the publish terminal claim/);
    const done = recoverOperation(dir, op.operationId, GATE_RECORD_PATH);
    expect(done.join(" ")).toMatch(/tombstoned/);
    expect(abandoned(dir)).toBe(true);
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("absent");
  });

  it("quarantines rather than deleting, and says nothing about a published archive", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    abandonedClaim(dir, op);
    const archive = publishArchive(dir);

    const done = recoverTerminalClaim(dir, op.operationId);
    const quarantine = terminalQuarantinePathFor(op.operationId);
    expect(inspectPath(dir, quarantine).kind).toBe("file");
    expect(readTerminalClaim(dir)).toBeNull();
    /*
     * A crash AFTER canonical publication and BEFORE claim release is a real
     * state, and recovery cannot tell it from a crash before. It touches no
     * archive and asserts nothing about one.
     */
    expect(existsSync(archive)).toBe(true);
    expect(done.join(" ")).toMatch(/NOT determined here/);
    expect(done.join(" ")).toMatch(/no archive was inspected, moved or removed/);
  });

  it("refuses an operation id that is not the one holding the claim", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    abandonedClaim(dir, op);
    expect(() => recoverTerminalClaim(dir, "0".repeat(16))).toThrow(
      /terminal claim is held by operation/,
    );
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("file");
  });

  it("refuses when the mutex and the claim describe different operations", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    abandonedClaim(dir, op);
    /* Rewrite the lock so it names somebody else. */
    const lockPath = join(dir, ".release/release-operation.lock");
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      lockPath,
      `${JSON.stringify({ ...lock, operationId: "a".repeat(16) }, null, 2)}\n`,
      "utf8",
    );
    expect(() => recoverTerminalClaim(dir, op.operationId)).toThrow(
      /the two describe different operations/,
    );
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("file");
  });

  it("refuses a claim with no mutex behind it", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    abandonedClaim(dir, op);
    rmSync(join(dir, ".release/release-operation.lock"));
    expect(() => recoverTerminalClaim(dir, op.operationId)).toThrow(
      /while no operation owns the mutex/,
    );
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("file");
  });

  it("refuses a malformed claim rather than guessing what it meant", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    writeFileSync(join(dir, TERMINAL_CLAIM_PATH), "{ not json", "utf8");
    expect(() => recoverTerminalClaim(dir, op.operationId)).toThrow(/exists and is malformed/);
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("file");
  });

  it("refuses a claim that is a directory, and one that is a symbolic link", () => {
    const asDir = root();
    beginOperation(asDir, "package", HEAD, TREE);
    mkdirSync(join(asDir, TERMINAL_CLAIM_PATH));
    expect(() => recoverTerminalClaim(asDir, "0".repeat(16))).toThrow(/directory/);

    const asLink = root();
    const op = beginOperation(asLink, "package", HEAD, TREE);
    const target = join(asLink, ".release", "elsewhere.json");
    writeFileSync(target, "{}\n", "utf8");
    try {
      symlinkSync(target, join(asLink, TERMINAL_CLAIM_PATH));
    } catch {
      /* Unprivileged Windows cannot create links; the directory case covers the rule. */
      return;
    }
    expect(() => recoverTerminalClaim(asLink, op.operationId)).toThrow(/symbolic link/);
  });

  it("refuses to overwrite a quarantine that already exists", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    abandonedClaim(dir, op);
    recoverTerminalClaim(dir, op.operationId);
    /* A second abandoned claim from the same operation must not clobber the first. */
    enterTerminalPhase(dir, op, "recover");
    expect(() => recoverTerminalClaim(dir, op.operationId)).toThrow(/already exists/);
  });

  it("returns cleanly when there is no claim at all", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    expect(recoverTerminalClaim(dir, op.operationId).join(" ")).toMatch(/no terminal claim/);
  });
});

describe("a hold releases the claim it created, and only that one", () => {
  it("releases its own", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const hold = enterTerminalPhase(dir, op, "publish");
    expect(terminalReleaseProblems(dir, hold)).toEqual([]);
    expect(releaseTerminalPhase(dir, hold)).toEqual([]);
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("absent");
  });

  it("will not delete a claim replaced just before it releases", () => {
    /*
     * THE DEFECT THIS CLOSES. The release callback deleted the PATHNAME. A
     * claim quarantined by a recovery and replaced by a second operation's own
     * claim would be deleted by the first operation — which never held it, and
     * whose delete would then strand the second operation.
     */
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const hold = enterTerminalPhase(dir, op, "publish");

    /* Somebody quarantines it and creates a new one in its place. */
    recoverTerminalClaim(dir, op.operationId);
    const replacement = enterTerminalPhase(dir, op, "recover");

    const problems = releaseTerminalPhase(dir, hold);
    expect(problems.join(" ")).toMatch(/different file object|different nonce/);
    /* The replacement is still there: nothing of somebody else's was removed. */
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("file");
    expect(readTerminalClaim(dir)?.nonce).toBe(replacement.nonce);
    expect(releaseTerminalPhase(dir, replacement)).toEqual([]);
  });

  it("notices a claim rewritten in place with a different nonce", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const hold = enterTerminalPhase(dir, op, "publish");
    const claim = readTerminalClaim(dir);
    expect(claim).not.toBeNull();
    writeFileSync(
      join(dir, TERMINAL_CLAIM_PATH),
      `${JSON.stringify({ ...claim, nonce: "f".repeat(32) }, null, 2)}\n`,
      "utf8",
    );
    expect(releaseTerminalPhase(dir, hold).join(" ")).toMatch(
      /different file object|different nonce/,
    );
  });

  it("reports an already-absent claim rather than silently succeeding", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const hold = enterTerminalPhase(dir, op, "publish");
    rmSync(join(dir, TERMINAL_CLAIM_PATH));
    expect(releaseTerminalPhase(dir, hold).join(" ")).toMatch(/already gone/);
  });

  it("carries an unpredictable nonce, not a value another process could guess", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const first = enterTerminalPhase(dir, op, "publish");
    releaseTerminalPhase(dir, first);
    const second = enterTerminalPhase(dir, op, "publish");
    releaseTerminalPhase(dir, second);
    expect(first.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(second.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(first.nonce).not.toBe(second.nonce);
  });

  it("does not take the phase away from a live holder after any interval", () => {
    /*
     * There is deliberately no age-based takeover. A slow publisher inside its
     * terminal phase and a dead one look identical from outside, and any
     * timeout would eventually take the phase away from a live one mid-link.
     */
    const source = readFileSync(
      join(import.meta.dirname, "..", "..", "scripts/release/release-operation.ts"),
      "utf8",
    );
    expect(source).toMatch(/no age-based takeover|There is deliberately no age-based takeover/);
    expect(source).not.toMatch(/claimedAt.*getTime\(\)|Date\.now\(\) - .*claimed/);
  });
});

describe("release paths are contained by every component, not by their leaf", () => {
  const linkable = (): boolean => {
    const probe = mkdtempSync(join(scratch, "probe-"));
    try {
      mkdirSync(join(probe, "target"));
      symlinkSync(join(probe, "target"), join(probe, "link"), "junction");
      return true;
    } catch {
      return false;
    }
  };

  it("accepts an ordinary chain", () => {
    const dir = root();
    expect(pathContainmentProblems(dir, "_review/.staging-abc/rebuild/utc")).toEqual([]);
    safeMkdir(dir, "_review/.staging-abc/rebuild/utc");
    expect(lstatSync(join(dir, "_review/.staging-abc/rebuild/utc")).isDirectory()).toBe(true);
  });

  it("refuses a parent traversal outright", () => {
    const dir = root();
    expect(pathContainmentProblems(dir, "_review/../../elsewhere").join(" ")).toMatch(
      /parent traversal/,
    );
  });

  it("refuses a file where a directory ancestor belongs", () => {
    const dir = root();
    writeFileSync(join(dir, "_review"), "not a directory\n", "utf8");
    expect(pathContainmentProblems(dir, "_review/.staging-abc/rebuild/utc").join(" ")).toMatch(
      /is not a directory|not a directory/,
    );
  });

  it.each([
    ["_review", "_review"],
    ["the operation staging root", "_review/.staging-abc"],
    ["rebuild", "_review/.staging-abc/rebuild"],
    ["a slot parent", "_review/.staging-abc/rebuild"],
  ])("refuses a symbolic link at %s", (_what, linkAt) => {
    if (!linkable()) return;
    const dir = root();
    const outside = mkdtempSync(join(scratch, "outside-"));
    const parts = linkAt.split("/");
    for (let i = 0; i < parts.length - 1; i += 1) {
      mkdirSync(join(dir, ...parts.slice(0, i + 1)), { recursive: true });
    }
    symlinkSync(outside, join(dir, ...parts), "junction");

    const problems = pathContainmentProblems(dir, "_review/.staging-abc/rebuild/utc");
    expect(problems.join(" ")).toMatch(/symbolic link/);
    /* And nothing is created through it. */
    expect(() => safeMkdir(dir, "_review/.staging-abc/rebuild/utc")).toThrow(OperationRefused);
    expect(existsSync(join(outside, "utc"))).toBe(false);
  });

  it("refuses a dangling symbolic link, which existsSync reports as absent", () => {
    if (!linkable()) return;
    const dir = root();
    mkdirSync(join(dir, "_review"), { recursive: true });
    const missing = join(dir, "_review", "gone");
    try {
      symlinkSync(missing, join(dir, "_review", ".staging-abc"), "junction");
    } catch {
      return;
    }
    /* The classic hole: absent to existsSync, a link to lstat. */
    expect(existsSync(join(dir, "_review", ".staging-abc"))).toBe(false);
    expect(pathContainmentProblems(dir, "_review/.staging-abc/rebuild/utc").join(" ")).toMatch(
      /symbolic link/,
    );
  });

  it("refuses an inflated tree containing a directory symlink, rather than following it", () => {
    if (!linkable()) return;
    const dir = mkdtempSync(join(scratch, "inflated-"));
    const outside = mkdtempSync(join(scratch, "elsewhere-"));
    writeFileSync(join(outside, "secret.txt"), "not part of the package\n", "utf8");
    writeFileSync(join(dir, "real.txt"), "packaged\n", "utf8");
    symlinkSync(outside, join(dir, "linked"), "junction");

    /*
     * Both walkers refuse rather than descending. `statSync` follows a link, so
     * a link to a directory used to be recursed into and everything beneath it
     * manifested, hashed and archived as though it belonged to the tree.
     */
    expect(() => walk(dir)).toThrow(/symbolic link/);
    expect(() => scanDirectory(dir)).toThrow(/symbolic link/);
  });

  it("does not let recursive mkdir cross an unchecked ancestor", () => {
    const source = readFileSync(
      join(import.meta.dirname, "..", "..", "scripts/release/build-package.ts"),
      "utf8",
    );
    /*
     * Every release-controlled directory goes through the checked helper. The
     * doc comments explain what `mkdirSync(..., { recursive: true })` does
     * wrong, so this looks for a CALL — a line whose code begins with it —
     * rather than for the string anywhere in the file.
     */
    const calls = source.split("\n").filter((line) => /^\s*(await )?mkdirSync\(/.test(line));
    expect(calls).toEqual([]);
    expect(source).toContain("safeMkdir(REPO_ROOT");
  });
});

describe("the recover CLI can reach the terminal claim", () => {
  it("documents the separate, explicit claim quarantine", () => {
    /*
     * Running the CLI here would report on THIS repository's real `.release`
     * state, which is not this test's business. The contract it must state is
     * in the source: quarantining an abandoned terminal claim is a separate
     * flag, performed after a person establishes the holding process is gone.
     */
    const source = readFileSync(
      join(import.meta.dirname, "..", "..", "scripts/release/recover.ts"),
      "utf8",
    );
    expect(source).toContain("--terminal-claim");
    expect(source).toContain("recoverTerminalClaim(REPO_ROOT, operationId)");
    expect(source).toMatch(/Recovery will not take it/);
    expect(source).toMatch(/moved aside,/);
  });

  it("refuses ordinary recovery while any terminal claim is present", () => {
    /*
     * A live publisher and a dead one leave the same file, so recovery takes
     * neither. An earlier draft of this correction quarantined the claim
     * automatically — which takes the terminal phase away from a live publisher
     * mid-link, reintroducing exactly the failure the phase exists to prevent.
     */
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    enterTerminalPhase(dir, op, "publish");
    expect(() => recoverOperation(dir, op.operationId, GATE_RECORD_PATH)).toThrow(
      /a terminal claim is present/,
    );
    expect(abandoned(dir)).toBe(false);
    expect(inspectPath(dir, TERMINAL_CLAIM_PATH).kind).toBe("file");
  });
});
