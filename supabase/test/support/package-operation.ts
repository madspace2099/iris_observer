import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  gateRecordProblems,
  stagedRecordProblems,
  structuralRecordProblems,
  sanitizedRecord,
  readGateRecord,
  type GateRecord,
} from "../../../scripts/release/gate-contract";
import {
  beginOperation,
  endOperation,
  stillOwner,
  type Operation,
} from "../../../scripts/release/release-operation";
import { syntheticGateRecord } from "./synthetic-gate-record";

/**
 * A real package operation, in a temporary root a test owns outright.
 *
 * ## The circle this breaks, and how it broke the gate
 *
 * `build()` may run only under a valid package operation: the mutex is held for
 * the whole build, so a gate cannot invalidate the record underneath it. That
 * invariant is production behaviour and stays exactly as it is — the fix is not
 * to make ownership optional, and there is deliberately no test-only switch
 * past {@link ownershipProblems}.
 *
 * The three suites that exercise the packager were never given an operation, so
 * every one of them refused at collection time. On a dirty development tree the
 * refusal they hit first was the CLEAN-TREE one, which was expected, so the
 * ownership refusal underneath it stayed invisible until the authoritative gate
 * at `3094443` ran on a clean commit and three suites failed with zero failed
 * assertions.
 *
 * So this helper arranges the real thing:
 *
 *   1. a private temporary release root, made by this helper and nobody else;
 *   2. a synthetic green gate record written into it;
 *   3. that record verified through the REAL source and staged contracts;
 *   4. a genuine package operation taken through the REAL operation API;
 *   5. the root and the exact ownership token `build()` requires;
 *   6. release of only its own operation;
 *   7. removal of only its own files.
 *
 * Nothing here reads, writes, deletes or recovers this repository's real
 * `.release` state.
 */
export interface TestPackageOperation {
  /** The temporary release root holding this operation's gate record. */
  readonly root: string;
  /** The genuine operation, as `build({ operation })` requires it. */
  readonly operation: Operation;
  /** The HEAD the record and the operation both name. */
  readonly head: string;
  /** Release only this operation, and remove only this operation's files. */
  close(): void;
}

/** The tree identity a synthetic record claims, so the two agree. */
export const SYNTHETIC_TREE = "1234567890abcdef1234567890abcdef12345678";

export interface PackageOperationOptions {
  /** Take a `gate` operation instead, to prove packaging refuses under one. */
  readonly kind?: "gate" | "package";
  /** Begin the operation at a different HEAD, to prove the mismatch refuses. */
  readonly operationHead?: string;
  /** Begin the operation against a different tree, likewise. */
  readonly operationTree?: string;
}

/**
 * Open a package operation over a fresh temporary root.
 *
 * The contracts run here on purpose. A synthetic record that could not pass the
 * real contract would make every test built on it meaningless, and the failure
 * would look like a packager bug rather than a fixture bug.
 */
export function openPackageOperation(
  scratch: string,
  head: string,
  options: PackageOperationOptions = {},
): TestPackageOperation {
  const root = mkdtempSync(join(scratch, "op-"));
  syntheticGateRecord(root, head);

  const record = readGateRecord(root);
  const source = gateRecordProblems(record, head);
  if (source.length > 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`the synthetic record fails the source contract: ${source.join("; ")}`);
  }
  const staged = stagedRecordProblems(sanitizedRecord(record as GateRecord) as GateRecord, head);
  if (staged.length > 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`the synthetic projection fails the staged contract: ${staged.join("; ")}`);
  }
  const structure = structuralRecordProblems(record, head);
  if (structure.length > 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`the synthetic record is structurally incomplete: ${structure.join("; ")}`);
  }

  const operation = beginOperation(
    root,
    options.kind ?? "package",
    options.operationHead ?? head,
    options.operationTree ?? SYNTHETIC_TREE,
  );

  return {
    root,
    operation,
    head,
    close(): void {
      /*
       * ONLY ITS OWN. `endOperation` refuses unless this exact operation still
       * holds the mutex, and the removal is of the directory this helper made.
       * A test cannot reach another test's operation from here.
       */
      if (stillOwner(root, operation)) endOperation(root, operation);
      rmSync(root, { recursive: true, force: true });
    },
  };
}
