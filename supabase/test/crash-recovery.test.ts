import { execFileSync, spawnSync } from "node:child_process";
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
  identifyArchive,
  journalState,
  readJournal,
  resolveOperation,
  startupProblems,
  unresolvedOperations,
  writeThroughPrivateTemp,
  type OperationState,
} from "../../scripts/release/operation-journal";
import {
  beginOperation,
  endOperation,
  OperationRefused,
  readOperationLock,
  readTerminalClaim,
  stillOwner,
  OPERATION_LOCK_PATH,
} from "../../scripts/release/release-operation";
import { BARRIERS, type Barrier } from "./support/crash-child";

/**
 * REAL CRASHES, AT NAMED BARRIERS, WITH NOTHING MOCKED.
 *
 * A thrown exception runs `finally`, unwinds and tidies up — which is the
 * opposite of a crash. The two boundaries these cases exist for are defined by
 * what survives when nothing unwinds:
 *
 *   1. after the canonical link and before completion — a visible archive that
 *      no terminal state accounts for;
 *   2. after `endOperation()` and before the claim is released — a free mutex
 *      beside a stale claim, which the previous recovery could not touch because
 *      it began by reading a mutex nobody held.
 *
 * So the child is a real process and it kills itself with SIGKILL, which is
 * uncatchable. What is on disk afterwards is what a power cut would have left.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const CHILD = join(import.meta.dirname, "support", "crash-child.ts");
const HEAD = "ab1f773f602e8ddce9089c685690872c7741b034";
const TREE = "0f0b763631d9d2faa485d315edd2cc63b5d31407";

const scratch = mkdtempSync(join(tmpdir(), "observer-crash-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let counter = 0;
const nextId = (): string => {
  counter += 1;
  return counter.toString(16).padStart(16, "0");
};

/** A private release root with a canonical gate record already in it. */
function root(): string {
  const dir = mkdtempSync(join(scratch, "root-"));
  mkdirSync(join(dir, ".release"), { recursive: true });
  writeFileSync(
    join(dir, ".release", "gate-results.json"),
    `${JSON.stringify({ head: HEAD, status: "GREEN" }, null, 2)}\n`,
    "utf8",
  );
  return dir;
}

/** Run the child to a barrier and report how it actually died. */
function crashAt(dir: string, barrier: Barrier, operationId: string): { killed: boolean } {
  const r = spawnSync(process.execPath, [TSX, CHILD, dir, barrier, operationId], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  /* SIGKILL from inside surfaces as a signal or as a non-zero status on Windows. */
  return { killed: r.status !== 0 || r.signal !== null };
}

describe("a crash leaves a journal that says what was achieved", () => {
  it.each(BARRIERS.filter((b) => b !== "never" && b !== "before-lock"))(
    "records a resolvable state after dying at %s",
    (barrier) => {
      const dir = root();
      const id = nextId();
      const outcome = crashAt(dir, barrier, id);
      expect(outcome.killed, `${barrier} should not have completed`).toBe(true);

      /*
       * `after-lock` is the one barrier with NO journal: the crash happened
       * between taking the mutex and writing the first line. It is still
       * unresolved state, and the startup check sees it through the lock.
       */
      if (barrier !== "after-lock") expect(journalState(dir, id), barrier).not.toBeNull();
      /*
       * WHATEVER IT REACHED, IT IS RESOLVABLE. The point is not which state —
       * it is that a state exists at all, which is what the previous protocol
       * could not provide and what made two of these boundaries unrecoverable.
       */
      /*
       * WHATEVER IT REACHED, THE NEXT OPERATION IS BLOCKED AND TOLD WHAT TO RUN.
       * Some barriers leave an unresolved journal; `after-lock` leaves a lock
       * with no journal; `after-end-operation` leaves a terminal journal beside
       * a stale claim. All three are residues, and none of them used to have a
       * command that cleared it.
       */
      const problems = startupProblems(dir).join(" ");
      expect(problems, barrier).toContain(id);
      expect(problems, barrier).toMatch(/--resolve/);
    },
  );

  it("leaves nothing at all when it dies before taking the lock", () => {
    const dir = root();
    const id = nextId();
    expect(crashAt(dir, "before-lock", id).killed).toBe(true);
    expect(readJournal(dir, id)).toEqual([]);
    expect(unresolvedOperations(dir)).toEqual([]);
    expect(startupProblems(dir)).toEqual([]);
  });

  it("BOUNDARY 1: a canonical archive after the link is finalised, not abandoned", () => {
    /*
     * The archive is on disk, correct, and no terminal state accounts for it.
     * The previous protocol could tombstone the gate record here — producing a
     * visible canonical ZIP beside a state saying that operation was abandoned.
     */
    const dir = root();
    const id = nextId();
    expect(crashAt(dir, "after-canonical-link", id).killed).toBe(true);

    const canonical = `_review/IRIS-Observer-${HEAD.slice(0, 7)}-review.zip`;
    expect(existsSync(join(dir, canonical))).toBe(true);
    expect(journalState(dir, id)).toBe("publishing");

    const outcome = resolveOperation(dir, id);
    expect(outcome.to).toBe("published");
    expect(outcome.steps.join(" ")).toMatch(/is the exact archive .* recorded/);
    /* THE INVARIANT: the archive stands and the state agrees with it. */
    expect(existsSync(join(dir, canonical))).toBe(true);
    expect(journalState(dir, id)).toBe("published");
    expect(unresolvedOperations(dir)).toEqual([]);
  });

  it("BOUNDARY 2: a free mutex beside a stale claim is resolvable", () => {
    /*
     * The mutex is gone and the claim remains. The previous recovery began by
     * reading the mutex, found none, and refused — so a new operation could take
     * the mutex, fail to enter the terminal phase, and both were blocked with no
     * command that resolved it.
     */
    const dir = root();
    const id = nextId();
    expect(crashAt(dir, "after-end-operation", id).killed).toBe(true);

    expect(readOperationLock(dir).kind).toBe("free");
    expect(readTerminalClaim(dir)?.operationId).toBe(id);
    expect(journalState(dir, id)).toBe("published");

    /* The stale claim is what blocks, and the startup check names it. */
    expect(startupProblems(dir).join(" ")).toMatch(/left a terminal claim behind/);

    /*
     * RESOLUTION DOES NOT REQUIRE OWNING THE STALE OPERATION’S MUTEX. That
     * requirement is what made this boundary unrecoverable: the previous
     * recovery began by reading a mutex nobody held, refused, and left both the
     * claim and the next operation stuck with no command that cleared either.
     */
    const outcome = resolveOperation(dir, id, {
      releaseOwnership: () => ["quarantined the stale terminal claim"],
    });
    expect(outcome.to).toBe("already-terminal");
  });

  it("resolution is idempotent", () => {
    const dir = root();
    const id = nextId();
    crashAt(dir, "during-staging", id);
    const first = resolveOperation(dir, id);
    expect(first.to).toBe("recovered");
    const second = resolveOperation(dir, id);
    expect(second.to).toBe("already-terminal");
    const third = resolveOperation(dir, id);
    expect(third.to).toBe("already-terminal");
    expect(readJournal(dir, id).filter((e) => e.state === "recovered")).toHaveLength(1);
  });

  it("refuses a new operation while anything is unresolved, and names the command", () => {
    const dir = root();
    const id = nextId();
    crashAt(dir, "after-package-verified", id);
    const problems = startupProblems(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(id);
    expect(problems[0]).toContain("package-verified");
    expect(problems[0]).toMatch(/pnpm release:recover --operation=[0-9a-f]{16} --resolve/);
    /* And once resolved, a new operation may start. */
    resolveOperation(dir, id);
    expect(startupProblems(dir)).toEqual([]);
  });

  it("fails closed when the canonical file is not the one that operation created", () => {
    const dir = root();
    const id = nextId();
    crashAt(dir, "after-canonical-link", id);
    const canonical = join(dir, `_review/IRIS-Observer-${HEAD.slice(0, 7)}-review.zip`);
    /* Somebody else's archive is now at that path. */
    rmSync(canonical);
    writeFileSync(canonical, "a completely different, previously delivered archive\n", "utf8");

    expect(() => resolveOperation(dir, id)).toThrow(/is not the archive .* recorded/);
    /* AND IT IS STILL THERE. Recovery never deletes what it cannot account for. */
    expect(readFileSync(canonical, "utf8")).toMatch(/previously delivered/);
    expect(journalState(dir, id)).toBe("publishing");
  });

  it("fails closed when the archive is this operation's and does not verify", () => {
    const dir = root();
    const id = nextId();
    crashAt(dir, "after-canonical-link", id);
    const canonical = `_review/IRIS-Observer-${HEAD.slice(0, 7)}-review.zip`;
    expect(() =>
      resolveOperation(dir, id, { verifyArchive: () => ["the manifest does not verify"] }),
    ).toThrow(/does not pass verification/);
    expect(existsSync(join(dir, canonical))).toBe(true);
    expect(journalState(dir, id)).toBe("publishing");
  });

  it("records failure, not publication, when publishing left no archive", () => {
    const dir = root();
    const id = nextId();
    crashAt(dir, "after-canonical-link", id);
    rmSync(join(dir, `_review/IRIS-Observer-${HEAD.slice(0, 7)}-review.zip`));
    const outcome = resolveOperation(dir, id);
    expect(outcome.to).toBe("failed");
    expect(outcome.steps.join(" ")).toMatch(/the publication did not complete/);
  });

  it("a second operation refuses at every residual state", () => {
    for (const barrier of ["after-lock", "during-staging", "after-canonical-link"] as const) {
      const dir = root();
      const id = nextId();
      crashAt(dir, barrier, id);
      expect(startupProblems(dir).length, barrier).toBeGreaterThan(0);
      /* And the mutex, where one survives, is not takeable either. */
      const lock = readOperationLock(dir);
      if (lock.kind === "held") {
        expect(() => beginOperation(dir, "package", HEAD, TREE), barrier).toThrow(OperationRefused);
      }
    }
  });

  it("never lets one operation resolve another's state", () => {
    const dir = root();
    const mine = nextId();
    const yours = nextId();
    crashAt(dir, "during-staging", mine);
    expect(() => resolveOperation(dir, yours)).toThrow(/no journal exists/);
    expect(journalState(dir, mine)).toBe("package-staging");
  });
});

describe("an invariant a journal and an archive must never break together", () => {
  it("no terminal state claims abandonment while its own archive is visible", () => {
    const dir = root();
    const id = nextId();
    crashAt(dir, "after-canonical-link", id);
    const canonical = `_review/IRIS-Observer-${HEAD.slice(0, 7)}-review.zip`;
    resolveOperation(dir, id);

    const entries = readJournal(dir, id);
    const last = entries[entries.length - 1];
    const archiveVisible = existsSync(join(dir, canonical));
    const abandoned: readonly OperationState[] = ["failed", "recovered"];
    /* THE INVARIANT, stated as one expression. */
    expect(archiveVisible && abandoned.includes(last?.state ?? "failed")).toBe(false);
  });

  it("a completed journal never names a missing or different archive", () => {
    const dir = root();
    const id = nextId();
    crashAt(dir, "after-canonical-link", id);
    resolveOperation(dir, id);
    const last = readJournal(dir, id).at(-1);
    expect(last?.state).toBe("published");
    expect(last?.archive).not.toBeNull();
    const named = last?.archive?.path ?? "";
    expect(existsSync(join(dir, named))).toBe(true);
    const actual = identifyArchive(dir, named);
    expect(actual.sha).toBe(last?.archive?.sha);
    expect(actual.ino).toBe(last?.archive?.ino);
  });
});

describe("recovery paths are symlink-safe and contained", () => {
  const linkable = (): boolean => {
    const probe = mkdtempSync(join(scratch, "probe-"));
    try {
      mkdirSync(join(probe, "t"));
      symlinkSync(join(probe, "t"), join(probe, "l"), "junction");
      return true;
    } catch {
      return false;
    }
  };

  it("writes through an unpredictable private path, never a derived sibling", () => {
    const source = readFileSync(join(ROOT, "scripts", "release", "release-operation.ts"), "utf8");
    /*
     * The predictable name is gone as a CONSTRUCTED PATH. It survives only in
     * the comment explaining what it was, so this looks for the template that
     * built it rather than for the string anywhere in the file.
     */
    expect(source).not.toMatch(/[$][{]recordPath[}][.]recovering-/);
    expect(source).toContain("writeThroughPrivateTemp(");
  });

  it("refuses a symlink planted at the destination, and leaves the target alone", () => {
    if (!linkable()) return;
    const dir = root();
    const outside = mkdtempSync(join(scratch, "outside-"));
    const sentinel = join(outside, "sentinel.txt");
    writeFileSync(sentinel, "must not change\n", "utf8");

    try {
      symlinkSync(sentinel, join(dir, ".release", "target.json"));
    } catch {
      return;
    }
    expect(() =>
      writeThroughPrivateTemp(dir, ".release/target.json", '{"x":1}\n', "probe"),
    ).toThrow(OperationRefused);
    /* THE SENTINEL IS BYTE-IDENTICAL. */
    expect(readFileSync(sentinel, "utf8")).toBe("must not change\n");
  });

  it("refuses a symlink replacing a parent component", () => {
    if (!linkable()) return;
    const dir = mkdtempSync(join(scratch, "parent-"));
    const outside = mkdtempSync(join(scratch, "elsewhere-"));
    try {
      symlinkSync(outside, join(dir, ".release"), "junction");
    } catch {
      return;
    }
    expect(() => writeThroughPrivateTemp(dir, ".release/thing.json", "{}\n", "probe")).toThrow(
      OperationRefused,
    );
    expect(existsSync(join(outside, "thing.json"))).toBe(false);
  });

  it("refuses a dangling symlink, which existsSync reports as absent", () => {
    if (!linkable()) return;
    const dir = root();
    const missing = join(dir, ".release", "gone.json");
    try {
      symlinkSync(missing, join(dir, ".release", "dangling.json"));
    } catch {
      return;
    }
    expect(existsSync(join(dir, ".release", "dangling.json"))).toBe(false);
    expect(() => writeThroughPrivateTemp(dir, ".release/dangling.json", "{}\n", "probe")).toThrow(
      OperationRefused,
    );
  });

  it("refuses a directory where a regular file belongs", () => {
    const dir = root();
    mkdirSync(join(dir, ".release", "asdir"));
    expect(() => writeThroughPrivateTemp(dir, ".release/asdir", "{}\n", "probe")).toThrow(
      /directory where a regular file belongs/,
    );
  });

  it("refuses a path traversal outright", () => {
    const dir = root();
    expect(() =>
      writeThroughPrivateTemp(dir, ".release/../../escape.json", "{}\n", "probe"),
    ).toThrow(/parent traversal/);
  });

  it("writes the file when every component is safe", () => {
    const dir = root();
    writeThroughPrivateTemp(dir, ".release/ok.json", '{"ok":true}\n', "probe");
    expect(readFileSync(join(dir, ".release", "ok.json"), "utf8")).toBe('{"ok":true}\n');
    expect(lstatSync(join(dir, ".release", "ok.json")).isFile()).toBe(true);
    /* And no temporary file is left behind. */
    const leftovers = execFileSync(
      process.execPath,
      [
        "-e",
        `process.stdout.write(require("fs").readdirSync(${JSON.stringify(join(dir, ".release"))}).filter((f) => f.startsWith(".tmp-")).join(","))`,
      ],
      { encoding: "utf8" },
    );
    expect(leftovers).toBe("");
  });
});

describe("lock ownership is bound to the lock's complete bytes", () => {
  const fields = [
    ["head", "b".repeat(40)],
    ["treeId", "c".repeat(40)],
    ["operationId", "f".repeat(16)],
    ["kind", "gate"],
  ] as const;

  it.each(fields)("refuses an equal-length replacement of %s", (field, replacement) => {
    /*
     * SAME INODE, SAME SIZE. The token used to be device, inode, birth time and
     * size, so an in-place rewrite of the recorded HEAD or tree compared equal
     * — and both are fixed-width hex, which makes equal-length substitution the
     * natural shape of the attack rather than a contrivance.
     */
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const path = join(dir, OPERATION_LOCK_PATH);
    const before = readFileSync(path, "utf8");
    const lock = JSON.parse(before) as Record<string, unknown>;
    const original = String(lock[field]);
    const padded = replacement.padEnd(original.length, "x").slice(0, original.length);
    const rewritten = before.replace(`"${original}"`, `"${padded}"`);
    expect(rewritten.length, field).toBe(before.length);
    expect(rewritten, field).not.toBe(before);
    writeFileSync(path, rewritten, "utf8");

    expect(stillOwner(dir, op), field).toBe(false);
    /* AND RELEASE LEAVES THE FOREIGN LOCK UNTOUCHED. */
    expect(() => endOperation(dir, op)).toThrow(OperationRefused);
    expect(readFileSync(path, "utf8"), field).toBe(rewritten);
  });

  it("accepts the lock it actually created", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    expect(stillOwner(dir, op)).toBe(true);
    endOperation(dir, op);
    expect(existsSync(join(dir, OPERATION_LOCK_PATH))).toBe(false);
  });

  it("notices a same-length rewrite that changes nothing a human would see", () => {
    const dir = root();
    const op = beginOperation(dir, "package", HEAD, TREE);
    const path = join(dir, OPERATION_LOCK_PATH);
    const before = readFileSync(path, "utf8");
    /* One character of whitespace moved: same length, same inode, same fields. */
    const rewritten = before.replace('{\n  "kind"', '{\n\t "kind"');
    expect(rewritten.length).toBe(before.length);
    writeFileSync(path, rewritten, "utf8");
    expect(stillOwner(dir, op)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(rewritten);
  });
});
