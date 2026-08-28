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
  suiteInventoryDigestOf,
  renderFailedVerdict,
  parseFailedVerdict,
  structuralRecordProblems,
  CANONICAL_VERDICTS,
  REQUIRED_GATES,
  FORBIDDEN_STAGED_FIELDS,
  GATE_IN_PROGRESS,
  type GateRecord,
} from "../../scripts/release/gate-contract";
import { greenGateRecord } from "./support/synthetic-gate-record";
import { packagingProblems } from "../../scripts/release/build-package";
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
    const record = greenGateRecord(HEAD) as { treeId: string };
    const evidence = captureEvidence(record as GateRecord, HEAD);
    const before = evidence.json;
    /*
     * The branch is now pinned to the release branch by the contract, so a
     * mutation there is refused rather than merely different. The tree id is a
     * staged field with no fixed value, which is what this case needs.
     */
    record.treeId = "9".repeat(40);
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

/**
 * A RED RECORD IS EVIDENCE, AND THE `ddefa50` GATE PROVED IT WAS NOT TREATED AS
 * ONE.
 *
 * That attempt recorded a genuine failure — three suites refusing from shared
 * setup, so six failed suite results with zero failed assertions — and the
 * contract reported the record itself as malformed. Two defects did it:
 *
 *   1. the red verdict was free prose, which the sanitizer refused, so the
 *      staged projection of a red record lost its test gate and could never be
 *      structurally valid;
 *
 *   2. zero failed ASSERTIONS was cross-checked against failed SUITES,
 *      `reportSuccess` and the process status as though all four counted the
 *      same thing, so the exact shape of a hook timeout read as a contradiction.
 *
 * Both are corrected here, and neither correction touches green acceptance.
 */
describe("the ddefa50 red shape is evidence, not a malformed record", () => {
  const head = "d".repeat(40);

  /** The gate result exactly as `ddefa50` recorded it. */
  const ddefa50 = (): GateRecord => {
    const base = greenGateRecord(head);
    const tests = {
      total: 1578,
      passed: 1554,
      skipped: 24,
      failed: 0,
      files: 47,
      perFile: base.tests?.perFile ?? {},
    };
    const testGate = {
      ...base.testGate,
      ok: false,
      status: 1,
      processStatus: 1,
      reportSuccess: false,
      reportedFailedTests: 0,
      countedFailedTests: 0,
      reportedFailedSuites: 6,
      runtimeErrorSuites: 3,
      failedSuiteNames: [
        "control-chars.test.ts",
        "no-secret-recipes.test.ts",
        "package-generation.test.ts",
      ],
      observedPeakWorkers: 4,
      reasons: ["exit status 1", "report declares failure"],
    };
    return {
      ...base,
      tests,
      testGate,
      processes: {
        ...base.processes,
        "pnpm test": { ok: false, status: 1, signal: null, errorCode: null },
      },
      gates: {
        ...base.gates,
        "pnpm test": renderFailedVerdict({
          passed: 1554,
          skipped: 24,
          failed: 0,
          files: 47,
          status: 1,
          reportSuccess: false,
          failedSuites: 6,
          runtimeErrorSuites: 3,
        }),
      },
    } as GateRecord;
  };

  /**
   * The same shape, with every count agreeing with every other count.
   *
   * A fixture that contradicts itself would be refused for being malformed —
   * which is precisely the confusion these cases exist to remove, so the
   * numbers here are derived rather than asserted.
   */
  const shaped = (): GateRecord => {
    const r = ddefa50();
    const FILES = 47;
    const PASSED = 1554;
    const SKIPPED = 24;
    const perFile: Record<string, number> = {};
    const each = Math.floor((PASSED + SKIPPED) / FILES);
    for (let i = 1; i < FILES; i += 1)
      perFile[`suite-${String(i).padStart(2, "0")}.test.ts`] = each;
    perFile[`suite-${String(FILES).padStart(2, "0")}.test.ts`] =
      PASSED + SKIPPED - each * (FILES - 1);
    const skippedTests = Array.from({ length: SKIPPED }, (_, i) => ({
      suite: "package-generation.test.ts",
      title: `skipped because shared setup refused (${String(i + 1)})`,
    }));
    return {
      ...r,
      expectedSuites: Object.keys(perFile).sort(),
      /* Derived, because the contract recomputes it from the names beside it. */
      suiteInventoryDigest: suiteInventoryDigestOf(Object.keys(perFile)),
      tests: {
        total: PASSED + SKIPPED,
        passed: PASSED,
        skipped: SKIPPED,
        failed: 0,
        files: FILES,
        perFile,
      },
      testGate: { ...r.testGate, skippedTests },
      gates: {
        ...r.gates,
        "pnpm test": renderFailedVerdict({
          passed: PASSED,
          skipped: SKIPPED,
          failed: 0,
          files: FILES,
          status: 1,
          reportSuccess: false,
          failedSuites: 6,
          runtimeErrorSuites: 3,
        }),
      },
    } as GateRecord;
  };

  it("renders the canonical red verdict the milestone specifies", () => {
    expect(
      renderFailedVerdict({
        passed: 1554,
        skipped: 24,
        failed: 0,
        files: 47,
        status: 1,
        reportSuccess: false,
        failedSuites: 6,
        runtimeErrorSuites: 3,
      }),
    ).toBe(
      "FAILED — 1554 passed, 24 skipped, 0 failed assertions / 47 files; " +
        "exit status 1; report unsuccessful; 6 failed suites; 3 runtime-error suites",
    );
  });

  it("1. is structurally valid", () => {
    const problems = structuralRecordProblems(shaped(), head);
    expect(problems).toEqual([]);
  });

  it("2. keeps a structurally valid sanitized projection", () => {
    const staged = sanitizedRecord(shaped()) as GateRecord;
    expect(structuralRecordProblems(staged, head, "staged")).toEqual([]);
    /* And the verdict itself survived, which is the defect this closes. */
    const gates = (staged as unknown as { gates: Record<string, string> }).gates;
    expect(parseFailedVerdict(gates["pnpm test"])).not.toBeNull();
  });

  it("3. is red on acceptance, for the reasons that are actually true", () => {
    const problems = gateRecordProblems(shaped(), head).join(" ");
    expect(problems).toMatch(/failed suite result/);
    expect(problems).toMatch(/runtime-error suite/);
    expect(problems).toMatch(/test report success=false/);
    expect(problems).toMatch(/exit status 1/);
  });

  it("4. cannot be packaged", () => {
    const refusal = packagingProblems({
      head,
      expectedHead: undefined,
      dirty: [],
      gateProblems: gateRecordProblems(shaped(), head),
      lockProblems: [],
      treeProblems: [],
    });
    expect(refusal.join(" ")).toMatch(/GATE RECORD:/);
    expect(() => captureEvidence(shaped(), head)).toThrow(EvidenceRefused);
  });

  it("5. does not let zero failed assertions hide suite or runtime failures", () => {
    /*
     * The exact misreading. Zero is the CORRECT number of failed assertions for
     * a suite that never ran its tests, and it must not read as cleanliness.
     */
    const r = shaped();
    expect(r.tests?.failed).toBe(0);
    expect(gateRecordProblems(r, head).join(" ")).toMatch(/6 failed suite result/);
  });

  it("6. accepts six failed suite results beside three distinct basenames", () => {
    const r = shaped();
    expect(r.testGate?.reportedFailedSuites).toBe(6);
    expect(new Set(r.testGate?.failedSuiteNames ?? []).size).toBe(3);
    expect(structuralRecordProblems(r, head)).toEqual([]);
  });

  it("7. refuses a missing red verdict", () => {
    const r = shaped() as { gates: Record<string, string> };
    const gates = { ...r.gates };
    delete gates["pnpm test"];
    expect(structuralRecordProblems({ ...r, gates } as GateRecord, head).join(" ")).toMatch(
      /pnpm test: no result recorded/,
    );
  });

  it("8. refuses a green-looking verdict beside red measurements", () => {
    const r = shaped();
    const green = {
      ...r,
      gates: {
        ...r.gates,
        "pnpm test": renderTestVerdict({
          passed: 1554,
          skipped: 24,
          failed: 0,
          files: r.tests?.files ?? 0,
        }),
      },
    } as GateRecord;
    /*
     * Structurally it is one of the two canonical shapes and its numbers agree,
     * so shape alone cannot refuse it — ACCEPTANCE does, on every field that
     * actually recorded the failure.
     */
    expect(gateRecordProblems(green, head).join(" ")).toMatch(/failed suite result/);
  });

  it("9. refuses a plausible near-miss verdict", () => {
    const r = shaped();
    for (const near of [
      "FAILED — 1554 passed, 24 skipped, 0 failed / 47 files; exit status 1; report unsuccessful; 6 failed suites; 3 runtime-error suites",
      "FAILED — 1554 passed, 24 skipped, 0 failed assertions / 47 files; exit status 1; report unsuccessful; 6 failed suites",
      "FAILED — exit status 1; report declares failure",
      "FAILED",
    ]) {
      const record = { ...r, gates: { ...r.gates, "pnpm test": near } } as GateRecord;
      expect(structuralRecordProblems(record, head).join(" "), near.slice(0, 40)).toMatch(
        /not the canonical rendering/,
      );
    }
  });

  it("10. keeps assertion failure and suite-level failure separate", () => {
    const r = shaped();
    /* Same-source duplicates must agree; different measurements need not. */
    const inconsistent = {
      ...r,
      testGate: { ...r.testGate, countedFailedTests: 3 },
    } as GateRecord;
    expect(structuralRecordProblems(inconsistent, head).join(" ")).toMatch(
      /the same measurement recorded twice, differently/,
    );
    /* Whereas six failed suites beside zero failed assertions is fine. */
    expect(structuralRecordProblems(r, head)).toEqual([]);
  });

  it("11. records status 1 with reportSuccess true and no failures, and refuses it", () => {
    const r = shaped();
    const odd = {
      ...r,
      testGate: {
        ...r.testGate,
        reportSuccess: true,
        reportedFailedSuites: 0,
        runtimeErrorSuites: 0,
        failedSuiteNames: [],
        reasons: [],
      },
      gates: {
        ...r.gates,
        "pnpm test": renderFailedVerdict({
          passed: 1554,
          skipped: 24,
          failed: 0,
          files: r.tests?.files ?? 0,
          status: 1,
          reportSuccess: true,
          failedSuites: 0,
          runtimeErrorSuites: 0,
        }),
      },
    } as GateRecord;
    /* Structurally recordable — this is the shape the runner-level exit made. */
    expect(structuralRecordProblems(odd, head)).toEqual([]);
    /* And never acceptable: the process said 1. */
    expect(gateRecordProblems(odd, head).join(" ")).toMatch(/exit status 1/);
  });

  it("12. keeps observedPeakWorkers in the red projection", () => {
    const staged = sanitizedRecord(shaped()) as { testGate?: { observedPeakWorkers?: unknown } };
    expect(staged.testGate?.observedPeakWorkers).toBe(4);
  });

  it("13. lets nothing hostile survive sanitization", () => {
    const r = shaped();
    const hostile = {
      ...r,
      testGate: {
        ...r.testGate,
        failedSuiteNames: [
          "C:/Users/someone/secret.txt",
          "https://example.invalid/token",
          "AKIA" + "ABCDEFGH".repeat(2),
          "at Object.<anonymous> (/app/src/index.ts:12:9)",
        ],
      },
    } as GateRecord;
    /*
     * TWO INDEPENDENT CONTROLS, AND THEY CATCH DIFFERENT THINGS.
     *
     * The sanitizer filters by SHAPE: a path, a URL, a stack frame and an
     * assignment are all refused as forms. The secret detector runs over the
     * FINISHED BYTES at capture, because an allowlisted field is not a licence
     * for its value — and a bare vendor-prefixed key has no forbidden shape.
     */
    const staged = sanitizedRecord(hostile);
    const json = JSON.stringify(staged);
    expect(json).not.toContain("secret.txt");
    expect(json).not.toContain("https://");
    expect(json).not.toContain("at Object");

    /* And the value the shape filter cannot see is refused at capture. */
    expect(() => captureEvidence(hostile, head)).toThrow(EvidenceRefused);
    expect(secretPatternsIn(json)).toContain("aws-access-key");
  });

  it("14. still reports a missing structural field on an already-red record", () => {
    const r = shaped() as { testGate: Record<string, unknown> };
    const gate = { ...r.testGate };
    delete gate["observedPeakWorkers"];
    const record = { ...r, testGate: gate } as unknown as GateRecord;
    const structure = structuralRecordProblems(record, head).join(" ");
    const acceptance = gateRecordProblems(record, head).join(" ");
    expect(structure).toMatch(/observedPeakWorkers not recorded/);
    /* And the genuine failure is still reported beside it. */
    expect(acceptance).toMatch(/failed suite result/);
  });

  it("keeps green acceptance exactly as strict as it was", () => {
    /* The clean record still passes both layers, unchanged. */
    const clean = greenGateRecord(head);
    expect(structuralRecordProblems(clean, head)).toEqual([]);
    expect(gateRecordProblems(clean, head)).toEqual([]);
    /* And every single acceptance condition still refuses on its own. */
    const breaks: [string, Partial<Record<string, unknown>>][] = [
      ["ok", { ok: false }],
      ["status", { status: 1 }],
      ["signal", { signal: "SIGTERM" }],
      ["errorCode", { errorCode: "ENOENT" }],
      ["reportSuccess", { reportSuccess: false }],
      ["reportedFailedSuites", { reportedFailedSuites: 1 }],
      ["runtimeErrorSuites", { runtimeErrorSuites: 1 }],
      ["reportedUnhandledErrors", { reportedUnhandledErrors: 1 }],
    ];
    for (const [what, patch] of breaks) {
      const broken = { ...clean, testGate: { ...clean.testGate, ...patch } } as GateRecord;
      expect(gateRecordProblems(broken, head), what).not.toEqual([]);
    }
  });
});

/**
 * THE COUNTS A BOUNDED LIST CANNOT SPEAK FOR.
 *
 * Every rule here exists because the record used to describe a truncated list
 * as though it were the whole truth — by appending a fabricated identity, and
 * by comparing list LENGTHS with measured counts that the bound had already
 * made unequal. The list and the number beside it are now checked as one claim.
 */
describe("bounded evidence is reconciled with what was measured", () => {
  const head = "3b746f43db7d3d79d709274f939ce8c3474df9dd";

  /** A green record with its test gate patched. */
  const withGate = (patch: Record<string, unknown>): GateRecord => {
    const clean = greenGateRecord(head);
    return { ...clean, testGate: { ...clean.testGate, ...patch } } as GateRecord;
  };

  it("accepts the clean record, which drops nothing and says so", () => {
    expect(structuralRecordProblems(greenGateRecord(head), head)).toEqual([]);
  });

  it("refuses a record whose omission count is missing", () => {
    for (const field of ["failedSuiteNamesOmitted", "failedTestsOmitted", "skippedTestsOmitted"]) {
      const clean = greenGateRecord(head);
      const gate = { ...clean.testGate } as Record<string, unknown>;
      delete gate[field];
      const record = { ...clean, testGate: gate } as GateRecord;
      expect(structuralRecordProblems(record, head).join(" "), field).toMatch(
        new RegExp(`${field} not recorded`),
      );
    }
  });

  it("refuses an omission count that is not a count", () => {
    for (const bad of [-1, 1.5, "3", null, Number.NaN]) {
      const record = withGate({ failedTestsOmitted: bad });
      expect(structuralRecordProblems(record, head).join(" "), JSON.stringify(bad)).toMatch(
        /failedTestsOmitted (is not a count|not recorded)/,
      );
    }
  });

  it("requires retained identities plus omitted to equal the measurement", () => {
    /* Twenty-six skips: twenty-five retained, one omitted, and the total says 26. */
    const clean = greenGateRecord(head);
    const skipped = Array.from({ length: 25 }, (_v, i) => ({
      suite: "a.test.ts",
      title: `case ${String(i)}`,
    }));
    const consistent = {
      ...clean,
      tests: { ...clean.tests, total: 1201, passed: 1175, skipped: 26, failed: 0 },
      testGate: { ...clean.testGate, skippedTests: skipped, skippedTestsOmitted: 1 },
    } as GateRecord;
    /* The arithmetic rule is satisfied — 25 + 1 = 26 — so it is not raised. */
    expect(structuralRecordProblems(consistent, head).join(" ")).not.toMatch(
      /skipped-test identities plus/,
    );

    /* Claiming zero omissions for the same list contradicts the measurement. */
    const contradictory = {
      ...consistent,
      testGate: { ...clean.testGate, skippedTests: skipped, skippedTestsOmitted: 0 },
    } as GateRecord;
    expect(structuralRecordProblems(contradictory, head).join(" ")).toMatch(
      /25 skipped-test identities plus 0 omitted for 26 skipped tests/,
    );
  });

  it("refuses omissions claimed by a list that never filled the bound", () => {
    const clean = greenGateRecord(head);
    const record = {
      ...clean,
      tests: { ...clean.tests, total: 1201, passed: 1198, skipped: 3, failed: 0 },
      testGate: {
        ...clean.testGate,
        skippedTests: [{ suite: "a.test.ts", title: "one" }],
        skippedTestsOmitted: 2,
      },
    } as GateRecord;
    expect(structuralRecordProblems(record, head).join(" ")).toMatch(
      /nothing was dropped for want of room/,
    );
  });

  it("refuses a fabricated identity standing in for the ones that were dropped", () => {
    /*
     * The exact record the previous bound produced. It is refused twice over:
     * the suite name is not a safe label, and twenty-five entries plus a
     * declared zero omissions do not account for twenty-six skips.
     */
    const clean = greenGateRecord(head);
    const skipped = [
      ...Array.from({ length: 24 }, (_v, i) => ({
        suite: "a.test.ts",
        title: `case ${String(i)}`,
      })),
      { suite: "…", title: "and 2 more" },
    ];
    const record = {
      ...clean,
      tests: { ...clean.tests, total: 1201, passed: 1175, skipped: 26, failed: 0 },
      testGate: { ...clean.testGate, skippedTests: skipped, skippedTestsOmitted: 0 },
    } as GateRecord;
    const problems = structuralRecordProblems(record, head).join(" ");
    expect(problems).toMatch(/unsafe suite name/);
    expect(problems).toMatch(/25 skipped-test identities plus 0 omitted for 26 skipped tests/);
  });

  it("checks the recorded total against the three numbers it summarises", () => {
    const clean = greenGateRecord(head);
    const record = { ...clean, tests: { ...clean.tests, total: 9999 } } as GateRecord;
    expect(structuralRecordProblems(record, head).join(" ")).toMatch(
      /tests\.total is 9999 but passed \+ skipped \+ failed is/,
    );
  });

  it("refuses a total that is not a count at all", () => {
    for (const bad of [-1, 2.5, "1201", null]) {
      const clean = greenGateRecord(head);
      const record = { ...clean, tests: { ...clean.tests, total: bad } } as GateRecord;
      expect(structuralRecordProblems(record, head).join(" "), JSON.stringify(bad)).toMatch(
        /tests\.total is not a count/,
      );
    }
  });

  it("refuses more failing suite names than there were failing suites", () => {
    const record = withGate({
      reportedFailedSuites: 1,
      failedSuiteNames: ["a.test.ts", "b.test.ts", "c.test.ts"],
      failedSuiteNamesOmitted: 0,
    });
    expect(structuralRecordProblems(record, head).join(" ")).toMatch(
      /3 failing suite name\(s\) for 1 failed suite result\(s\)/,
    );
  });

  it("refuses failing suites that name no file to look in", () => {
    const record = withGate({
      reportedFailedSuites: 6,
      failedSuiteNames: [],
      failedSuiteNamesOmitted: 0,
    });
    expect(structuralRecordProblems(record, head).join(" ")).toMatch(
      /6 failed suite result\(s\) and no suite named/,
    );
  });

  it("accepts several results sharing one basename", () => {
    /* Six failing results in three files is the shape ddefa50 actually had. */
    const record = withGate({
      reportedFailedSuites: 6,
      failedSuiteNames: ["a.test.ts", "b.test.ts", "c.test.ts"],
      failedSuiteNamesOmitted: 0,
    });
    expect(structuralRecordProblems(record, head).join(" ")).not.toMatch(/failing suite name/);
  });

  it("treats an unrecorded platform as a structural fault, not a failed run", () => {
    for (const bad of [undefined, "", "plan9", 3]) {
      const clean = greenGateRecord(head);
      const record = { ...clean, platform: bad } as GateRecord;
      expect(structuralRecordProblems(record, head).join(" "), JSON.stringify(bad)).toMatch(
        /is not recorded as one this release recognises/,
      );
    }
  });

  it("counts a dropped skip as a skip when checking the approved set", () => {
    /*
     * A skip the bound did not list is still a skip. Reading only the retained
     * list would let an unapproved skip past by being the twenty-sixth.
     */
    const clean = greenGateRecord(head);
    const record = {
      ...clean,
      testGate: { ...clean.testGate, skippedTestsOmitted: 4 },
    } as GateRecord;
    expect(gateRecordProblems(record, head).join(" ")).toMatch(/skipped test\(s\) on/);
  });
});
