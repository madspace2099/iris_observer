import { describe, expect, it } from "vitest";
import {
  captureEvidence,
  EvidenceRefused,
  sanitizedRecord,
  gateRecordProblems,
  stagedRecordProblems,
  secretPatternsIn,
  parseTestVerdict,
  renderTestVerdict,
  CANONICAL_VERDICTS,
  REQUIRED_GATES,
  FORBIDDEN_STAGED_FIELDS,
  GATE_IN_PROGRESS,
  type GateRecord,
} from "../../scripts/release/gate-contract";
import { greenGateRecord } from "./support/synthetic-gate-record";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE ARCHIVE MUST CARRY EVIDENCE ITS OWN CONTRACT ACCEPTS.
 *
 * The delivered `c1b80f0` package was physically sound and its staged
 * `gate-results.json` had no `pnpm test` gate in it at all. Nothing had lied:
 * the SOURCE record was validated, the archive shipped a PROJECTION of it, and
 * the sanitizer had silently dropped the canonical verdict because
 * `1450 passed, 1 skipped, 0 failed / 45 files` contains a slash and the
 * generic text filter refuses slash-shaped strings as possible paths.
 *
 * Validating one object and shipping another is the whole defect, and it is not
 * specific to that one field. So the projection — the exact bytes — is what
 * these cases examine.
 */

const HEAD = "5555555555555555555555555555555555555555";
const green = (overrides: Partial<GateRecord> = {}): GateRecord =>
  greenGateRecord(HEAD, { overrides: Object.keys(overrides).length > 0 ? overrides : undefined });

const withGates = (gates: Record<string, string>): GateRecord => {
  const base = greenGateRecord(HEAD);
  return { ...base, gates: { ...base.gates, ...gates } };
};

const staged = (record: GateRecord): Record<string, unknown> =>
  sanitizedRecord(record) as Record<string, unknown>;

describe("the canonical test verdict survives sanitization", () => {
  it("renders and parses the same shape", () => {
    const verdict = renderTestVerdict({ passed: 1450, skipped: 1, failed: 0, files: 45 });
    expect(verdict).toBe("1450 passed, 1 skipped, 0 failed / 45 files");
    expect(parseTestVerdict(verdict)).toEqual({ passed: 1450, skipped: 1, failed: 0, files: 45 });
  });

  it("keeps the verdict the previous archive lost", () => {
    const verdict = "1450 passed, 1 skipped, 0 failed / 45 files";
    const record = withGates({ "pnpm test": verdict });
    expect((staged(record)["gates"] as Record<string, string>)["pnpm test"]).toBe(verdict);
  });

  it("refuses a near-miss rather than passing it through", () => {
    /*
     * RECOGNITION, NOT PERMISSION. The exception exists because the verdict has
     * one exact shape; anything that merely resembles it is still filtered, and
     * a slash-carrying string that is not the canonical verdict cannot ride
     * through on the exception.
     */
    for (const nearMiss of [
      "1450 passed, 1 skipped, 0 failed / 45 file",
      "1450 passed, 1 skipped, 0 failed/45 files",
      "1450 passed, 1 skipped / 45 files",
      "1450 passed, 1 skipped, 0 failed / 45 files ",
      "clean / C:/Users/someone/secret.txt",
      "1450 passed, 1 skipped, 0 failed / 45 files; also /etc/passwd",
    ]) {
      expect(parseTestVerdict(nearMiss)).toBeNull();
      const gates = staged(withGates({ "pnpm test": nearMiss }))["gates"] as Record<string, string>;
      expect(gates["pnpm test"]).not.toBe(nearMiss);
    }
  });

  it("refuses verdict-shaped values that are not strings", () => {
    for (const bad of [null, undefined, 1450, { passed: 1450 }, ["1450 passed"]]) {
      expect(parseTestVerdict(bad)).toBeNull();
    }
  });
});

describe("the staged projection is complete and independently valid", () => {
  it("stages every required gate", () => {
    const gates = staged(green())["gates"] as Record<string, string>;
    for (const gate of REQUIRED_GATES) expect(Object.keys(gates)).toContain(gate);
  });

  it("passes the same contract the source record had to pass", () => {
    expect(stagedRecordProblems(staged(green()) as GateRecord, HEAD)).toEqual([]);
  });

  it("carries no forbidden field at any depth", () => {
    const json = JSON.stringify(staged(green()));
    for (const field of FORBIDDEN_STAGED_FIELDS) {
      expect(json).not.toContain(`"${field}"`);
    }
  });

  it("refuses when a required gate has been deleted from the record", () => {
    for (const gate of REQUIRED_GATES) {
      const base = greenGateRecord(HEAD);
      const gates = { ...base.gates };
      delete gates[gate];
      expect(() => captureEvidence({ ...base, gates }, HEAD)).toThrow(EvidenceRefused);
    }
  });

  it("refuses an arbitrary verdict where a canonical one is required", () => {
    for (const [gate, canonical] of Object.entries(CANONICAL_VERDICTS)) {
      expect(() => captureEvidence(withGates({ [gate]: "fine" }), HEAD)).toThrow(EvidenceRefused);
      /* And the real one still passes, so this is not a blanket refusal. */
      expect(() => captureEvidence(withGates({ [gate]: canonical }), HEAD)).not.toThrow();
    }
  });
});

describe("captured evidence cannot change after it is validated", () => {
  it("returns the exact bytes it validated", () => {
    const evidence = captureEvidence(green(), HEAD);
    expect(evidence.json).toBe(`${JSON.stringify(evidence.staged, null, 2)}\n`);
    expect(evidence.head).toBe(HEAD);
  });

  it("is unaffected by a later mutation of the source record", () => {
    /*
     * READ ONCE. The packager captures the projection and everything after that
     * point uses the capture, so a record edited mid-build — by a gate run
     * starting, or by hand — cannot reach the archive.
     */
    const record = greenGateRecord(HEAD) as { branch: string };
    const evidence = captureEvidence(record as GateRecord, HEAD);
    const before = evidence.json;
    record.branch = "some-other-branch";
    expect(evidence.json).toBe(before);
    expect(captureEvidence(record as GateRecord, HEAD).json).not.toBe(before);
  });

  it("produces identical bytes for two runs that differ only in their operation id", () => {
    /*
     * THE REPRODUCIBILITY CLAIM, MADE TRUE.
     *
     * The projection used to carry the random 16-hex operation id, so two
     * identical green runs at one commit produced different archive bytes while
     * the package described itself as deterministic from tracked inputs. The id
     * is operational state; it proves ownership and says nothing about what was
     * measured.
     */
    const a = greenGateRecord(HEAD, { operationId: "00112233445566aa" });
    const b = greenGateRecord(HEAD, { operationId: "ffeeddccbbaa9988" });
    expect(a.operationId).not.toBe(b.operationId);
    expect(captureEvidence(a, HEAD).json).toBe(captureEvidence(b, HEAD).json);
    expect(captureEvidence(a, HEAD).json).not.toContain("00112233445566aa");
  });

  it("keeps every volatile field out of the staged bytes", () => {
    const json = captureEvidence(green(), HEAD).json;
    for (const volatile of ["operationId", "attemptId", "startedAt", "durationMs", "pid"]) {
      expect(json, volatile).not.toContain(`"${volatile}"`);
    }
  });

  it("refuses an in-progress marker, however green the previous record was", () => {
    const marker = { status: GATE_IN_PROGRESS, head: HEAD } as unknown as GateRecord;
    expect(() => captureEvidence(marker, HEAD)).toThrow(EvidenceRefused);
  });

  it("refuses a record from another commit", () => {
    expect(() => captureEvidence(green(), "6".repeat(40))).toThrow(EvidenceRefused);
  });

  it("refuses nothing at all", () => {
    expect(() => captureEvidence(null, HEAD)).toThrow(EvidenceRefused);
  });
});

describe("hostile records are refused rather than reshaped", () => {
  const hostile: readonly { readonly what: string; readonly record: GateRecord }[] = [
    {
      what: "a failed run wearing a green verdict",
      record: withGates({ "pnpm test": "1450 passed, 1 skipped, 3 failed / 45 files" }),
    },
    {
      what: "totals that do not add up",
      record: {
        ...greenGateRecord(HEAD),
        tests: { passed: 1, skipped: 0, failed: 0, files: 2, perFile: { "a.test.ts": 1 } },
      },
    },
    {
      what: "an array where a count belongs",
      record: {
        ...greenGateRecord(HEAD),
        tests: {
          passed: [1200] as unknown as number,
          skipped: 1,
          failed: 0,
          files: 43,
          perFile: { "a.test.ts": 1201 },
        },
      },
    },
    {
      what: "a control-character scan claiming zero of nothing",
      record: {
        ...greenGateRecord(HEAD),
        controlCharacterScan: { scannedFiles: 0, foundCharacters: 0, affectedFiles: [] },
      },
    },
    {
      what: "an omitted process result",
      record: { ...greenGateRecord(HEAD), processes: {} },
    },
    {
      what: "a process that reports both success and a non-zero status",
      record: {
        ...greenGateRecord(HEAD),
        processes: {
          ...greenGateRecord(HEAD).processes,
          "pnpm test": { ok: true, status: 1, signal: null, errorCode: null },
        },
      },
    },
  ];

  for (const { what, record } of hostile) {
    it(`refuses ${what}`, () => {
      expect(() => captureEvidence(record, HEAD)).toThrow(EvidenceRefused);
    });
  }
});

describe("the secret detector runs over the finished bytes", () => {
  /*
   * AN ALLOWLISTED FIELD IS NOT A LICENCE FOR ITS VALUE. Every staged field is
   * one somebody decided was safe to carry; a decision about a field name says
   * nothing about what ends up inside it.
   *
   * The positive fixtures below are synthetic and deliberately incomplete —
   * each is assembled at runtime from fragments so no tracked file and no
   * commit contains a whole secret-shaped literal.
   */
  const fake = (prefix: string, body: string, n: number): string => prefix + body.repeat(n);

  it("names the pattern and never the text", () => {
    const matched = secretPatternsIn(fake("sk-proj-", "a1B2c3D4", 6));
    expect(matched).toContain("openai-key");
    expect(matched.join(" ")).not.toContain("a1B2c3D4");
  });

  it("finds a secret-shaped string nested anywhere in the projection", () => {
    const record = withGates({ "pnpm build": fake("sk-proj-", "a1B2c3D4", 6) });
    /* It fails the canonical-verdict check first, so aim at a free-text field. */
    const withSuite = greenGateRecord(HEAD);
    const poisoned = {
      ...withSuite,
      testGate: {
        ...withSuite.testGate,
        failedSuiteNames: [fake("AKIA", "ABCDEFGH", 2)],
      },
    } as GateRecord;
    expect(() => captureEvidence(record, HEAD)).toThrow(EvidenceRefused);
    expect(secretPatternsIn(JSON.stringify(poisoned))).toContain("aws-access-key");
  });

  it("does not fire on the ordinary contents of a green record", () => {
    expect(secretPatternsIn(captureEvidence(green(), HEAD).json)).toEqual([]);
  });

  it("stays in step with the audit script it borrows its patterns from", () => {
    /*
     * Both lists are read, so a pattern added to the gate and forgotten here —
     * or the reverse — is visible rather than silent.
     */
    expect(secretPatternsIn(fake("sk-proj-", "a1B2c3D4", 6))).not.toEqual([]);
    expect(secretPatternsIn(fake("sb_secret_", "a1B2c3D4", 4))).toContain("supabase-secret");
    /* Assembled, so no tracked file holds the whole marker the audit looks for. */
    const dashes = "-".repeat(5);
    expect(secretPatternsIn(`${dashes}BEGIN PRIVATE ${"KEY"}${dashes}`)).toContain(
      "private-key-block",
    );
  });
});

/**
 * ONE DESCRIPTION OF A GREEN RECORD, AND NO MORE.
 *
 * Three files each held a full copy. Every field the contract learned to
 * require — canonical verdicts, both worker bounds, the attempt id — had to be
 * added to all three, and the ones that were missed failed as "the contract is
 * broken" rather than "this fixture is stale". Each copy is a place the
 * calibration can drift out of step with the rule it calibrates.
 */
describe("one description of a green record", () => {
  const ROOT = join(import.meta.dirname, "..", "..");
  const fixtureUsers = [
    "supabase/test/gate-contract.test.ts",
    "supabase/test/control-chars.test.ts",
    "supabase/test/gate-evidence.test.ts",
  ];

  it("builds every gate-record fixture from the shared builder", () => {
    for (const file of fixtureUsers) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source, file).toContain("greenGateRecord");
    }
  });

  it("keeps the whole-record description in the builder alone", () => {
    /*
     * The marker is a field nothing overrides one at a time: an empty
     * `sanitizedUnhandledErrorNames` appears only where a complete runner
     * evidence object is being written out. Individual overrides — a single
     * field flipped to prove the contract refuses it — are the point of these
     * files and are not what this guards against.
     */
    /* Assembled, so this file does not match its own detector. */
    const marker = `sanitizedUnhandled${"ErrorNames"}: []`;
    for (const file of fixtureUsers) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source.includes(marker), file).toBe(false);
    }
    const support = readFileSync(
      join(ROOT, "supabase/test/support/synthetic-gate-record.ts"),
      "utf8",
    );
    expect(support.includes(marker)).toBe(true);
  });

  it("proves the shared builder satisfies the contract it calibrates", () => {
    expect(gateRecordProblems(greenGateRecord(HEAD), HEAD)).toEqual([]);
  });
});
