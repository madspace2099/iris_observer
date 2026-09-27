import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import {
  scanFiles,
  scanDirectory,
  scanProblems,
  countControlCharacters,
  describeScan,
  isForbiddenControl,
} from "../../scripts/release/control-chars";
import {
  gateRecordProblems,
  CONTROL_CHARACTER_GATE,
  type GateRecord,
} from "../../scripts/release/gate-contract";
import {
  isDeclaredHistorical,
  patchCommit,
  HISTORICAL_CONTROL_CHAR_COMMITS,
} from "../../scripts/release/transport-safe";
import { greenGateRecord, cleanScan } from "./support/synthetic-gate-record";

/**
 * Invisible control characters, and the two places they got through.
 *
 * The gate contract accepted ANY prose for the scan verdict unless it contained
 * the uppercase word FAILED. `"8 FOUND"` does not, and neither does `"BROKEN"`,
 * so both permitted packaging. A gate whose result is a MEASUREMENT cannot be
 * checked by reading a sentence.
 *
 * And the scan itself ran only over tracked files, before the packager had
 * staged anything. The delivered `1b8b912` archive contained eight backspace
 * bytes across three patch files while the package reported "control-char scan
 * 0" — a true statement about the working tree and a false impression about the
 * archive.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const BS = String.fromCharCode(8);
const HEAD_FIXTURE = "1111111111111111111111111111111111111111";

const scratch = mkdtempSync(join(tmpdir(), "observer-controlchars-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("what counts as a forbidden control character", () => {
  it.each([
    ["NUL", 0],
    ["backspace", 8],
    ["vertical tab", 11],
    ["form feed", 12],
    ["escape", 27],
    ["unit separator", 31],
  ])("%s is forbidden", (_why, code) => {
    expect(isForbiddenControl(code)).toBe(true);
  });

  it.each([
    ["tab", 9],
    ["newline", 10],
    ["carriage return", 13],
    ["space", 32],
    ["A", 65],
  ])("%s is allowed", (_why, code) => {
    expect(isForbiddenControl(code)).toBe(false);
  });

  it("counts every occurrence, not every file", () => {
    expect(countControlCharacters(Buffer.from(`a${BS}b${BS}c`, "utf8"))).toBe(2);
    expect(countControlCharacters(Buffer.from("clean\ttext\r\n", "utf8"))).toBe(0);
  });
});

describe("the structured scan is checked as data, not as prose", () => {
  const clean = cleanScan(12);

  it("accepts well-formed clean evidence", () => {
    expect(scanProblems(clean, "scan")).toEqual([]);
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["a string", "0 in any tracked file"],
    ["a number", 0],
  ])("refuses %s evidence", (_why, value) => {
    expect(scanProblems(value, "scan")).not.toEqual([]);
  });

  it.each([
    ["a missing count", { scannedFiles: 12, affectedFiles: [] }],
    ["a missing file list", { scannedFiles: 12, foundCharacters: 0 }],
    ["a missing scanned count", { foundCharacters: 0, affectedFiles: [] }],
    ["a negative count", { scannedFiles: 12, foundCharacters: -1, affectedFiles: [] }],
    ["a fractional count", { scannedFiles: 12, foundCharacters: 0.5, affectedFiles: [] }],
    ["a stringified count", { scannedFiles: 12, foundCharacters: "0", affectedFiles: [] }],
    ["a non-array file list", { scannedFiles: 12, foundCharacters: 0, affectedFiles: "none" }],
    ["a file list of non-strings", { scannedFiles: 12, foundCharacters: 0, affectedFiles: [1] }],
    ["scanning nothing at all", { scannedFiles: 0, foundCharacters: 0, affectedFiles: [] }],
  ])("refuses %s", (_why, value) => {
    expect(scanProblems(value, "scan")).not.toEqual([]);
  });

  it("refuses a non-zero count", () => {
    expect(
      scanProblems({ scannedFiles: 12, foundCharacters: 8, affectedFiles: ["a.patch"] }, "scan"),
    ).not.toEqual([]);
  });

  it("refuses a zero count beside a non-empty file list", () => {
    /* The two halves disagreeing is its own reason, not a rounding of either. */
    const problems = scanProblems(
      { scannedFiles: 12, foundCharacters: 0, affectedFiles: ["a.patch"] },
      "scan",
    );
    expect(problems.join(" ")).toMatch(/count and file list disagree/);
  });

  it("refuses a non-zero count beside an empty file list", () => {
    const problems = scanProblems(
      { scannedFiles: 12, foundCharacters: 3, affectedFiles: [] },
      "scan",
    );
    expect(problems.join(" ")).toMatch(/count and file list disagree/);
  });

  it("describes a clean and a dirty scan differently", () => {
    expect(describeScan(clean)).toBe("0 in 12 files");
    const dirty = { ...cleanScan(12), foundCharacters: 8, affectedFiles: ["a", "b"] };
    expect(describeScan(dirty)).toBe("8 FOUND in 2 file(s)");
  });
});

describe("the gate contract refuses on the scan, structurally", () => {
  /*
   * ONE FIXTURE, SHARED. This file kept its own copy of a green record, and so
   * did two others. Every field the contract learns to require has to be added
   * to all of them, and the ones that are missed fail as "the contract is
   * broken" rather than "this fixture is stale" — which is exactly what
   * happened when canonical verdicts, the worker bounds and the attempt id
   * landed. The shared builder is the only place a green record is described.
   */
  const record = (overrides: Partial<GateRecord> = {}): GateRecord =>
    greenGateRecord(HEAD_FIXTURE, {
      scannedFiles: 300,
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    });

  it("accepts a clean, well-formed record", () => {
    expect(gateRecordProblems(record(), HEAD_FIXTURE)).toEqual([]);
  });

  it("refuses one or more control characters", () => {
    const gates = { ...record().gates, [CONTROL_CHARACTER_GATE]: "1 FOUND in 1 file(s)" };
    const problems = gateRecordProblems(
      record({
        controlCharacterScan: { ...cleanScan(300), foundCharacters: 1, affectedFiles: ["a.patch"] },
        gates,
      }),
      HEAD_FIXTURE,
    );
    expect(problems.join(" ")).toMatch(/1 control character/);
  });

  it.each(['"8 FOUND"', '"BROKEN"'])(
    "refuses the verdict %s that the old string check let through",
    (verdict) => {
      /*
       * Neither contains the word FAILED, which is the whole reason a free-text
       * contract could not be trusted with a measurement.
       */
      const gates = { ...record().gates, [CONTROL_CHARACTER_GATE]: JSON.parse(verdict) as string };
      const clean = record();
      expect(gateRecordProblems({ ...clean, gates }, HEAD_FIXTURE)).not.toEqual([]);
    },
  );

  it("refuses FOUND text with no structured evidence at all", () => {
    const base = record();
    const gates = { ...base.gates, [CONTROL_CHARACTER_GATE]: "8 FOUND" };
    const stripped = { ...base, gates };
    delete (stripped as { controlCharacterScan?: unknown }).controlCharacterScan;
    expect(gateRecordProblems(stripped, HEAD_FIXTURE).join(" ")).toMatch(
      /no structured control-character evidence/,
    );
  });

  it("refuses a missing structured field", () => {
    expect(
      gateRecordProblems(
        record({
          controlCharacterScan: { scannedFiles: 300, foundCharacters: 0 } as never,
        }),
        HEAD_FIXTURE,
      ),
    ).not.toEqual([]);
  });

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
  ])("refuses a %s count", (_why, value) => {
    expect(
      gateRecordProblems(
        record({
          controlCharacterScan: {
            ...cleanScan(300),
            foundCharacters: value,
            affectedFiles: [],
          },
        }),
        HEAD_FIXTURE,
      ),
    ).not.toEqual([]);
  });

  it("refuses a non-empty file list beside a zero count", () => {
    expect(
      gateRecordProblems(
        record({
          controlCharacterScan: {
            ...cleanScan(300),
            foundCharacters: 0,
            affectedFiles: ["docs/release/REVIEW.txt"],
          },
        }),
        HEAD_FIXTURE,
      ),
    ).not.toEqual([]);
  });

  it("refuses a clean-looking verdict paired with a non-zero structured count", () => {
    /*
     * The case that matters most: the sentence says one thing and the numbers
     * say another. The numbers win, and the mismatch is itself reported.
     */
    const problems = gateRecordProblems(
      record({
        controlCharacterScan: { ...cleanScan(300), foundCharacters: 8, affectedFiles: ["p.patch"] },
      }),
      HEAD_FIXTURE,
    );
    expect(problems.join(" ")).toMatch(/8 control character/);
    expect(problems.join(" ")).toMatch(/does not match the structured evidence/);
  });

  it("refuses a verdict that does not match a clean structure", () => {
    const gates = { ...record().gates, [CONTROL_CHARACTER_GATE]: "0 in 7 files" };
    expect(gateRecordProblems(record({ gates }), HEAD_FIXTURE).join(" ")).toMatch(
      /does not match the structured evidence/,
    );
  });
});

describe("the historical patches travel base64, and only those", () => {
  it("declares the commits by full SHA, with a reason each", () => {
    expect(HISTORICAL_CONTROL_CHAR_COMMITS.length).toBeGreaterThan(0);
    for (const entry of HISTORICAL_CONTROL_CHAR_COMMITS) {
      expect(entry.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });

  it("reads the commit out of a patch header", () => {
    const sha = HISTORICAL_CONTROL_CHAR_COMMITS[0]?.sha ?? "";
    expect(patchCommit(`From ${sha} Mon Sep 17 00:00:00 2001\nSubject: x\n`)).toBe(sha);
    expect(patchCommit("no header here")).toBeNull();
  });

  it("recognises a declared patch and nothing else", () => {
    const sha = HISTORICAL_CONTROL_CHAR_COMMITS[0]?.sha ?? "";
    expect(isDeclaredHistorical(`From ${sha} Mon Sep 17 00:00:00 2001\n`)).toBe(true);
    expect(isDeclaredHistorical(`From ${"0".repeat(40)} Mon Sep 17 00:00:00 2001\n`)).toBe(false);
    expect(isDeclaredHistorical("From nowhere\n")).toBe(false);
  });

  it("every declared commit exists in this repository", () => {
    for (const entry of HISTORICAL_CONTROL_CHAR_COMMITS) {
      const type = execFileSync("git", ["cat-file", "-t", entry.sha], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();
      expect(type, entry.sha).toBe("commit");
    }
  });
});

describe("scanning a directory", () => {
  it("finds an injected character and names the file", () => {
    const dir = join(scratch, "scan");
    mkdirSync(join(dir, "nested"), { recursive: true });
    writeFileSync(join(dir, "clean.txt"), "nothing here\n", "utf8");
    writeFileSync(join(dir, "nested", "dirty.txt"), `before${BS}after\n`, "utf8");

    const scan = scanDirectory(dir);
    expect(scan.scannedFiles).toBe(2);
    expect(scan.foundCharacters).toBe(1);
    expect(scan.affectedFiles).toEqual(["nested/dirty.txt"]);
  });

  it("reports paths with forward slashes, whatever the platform uses", () => {
    const dir = join(scratch, "slashes");
    mkdirSync(join(dir, "a", "b"), { recursive: true });
    writeFileSync(join(dir, "a", "b", "c.txt"), `x${BS}\n`, "utf8");
    expect(scanDirectory(dir).affectedFiles).toEqual(["a/b/c.txt"]);
  });

  it("skips a file that disappears between listing and reading", () => {
    expect(scanFiles(scratch, ["definitely-not-here.txt"]).scannedFiles).toBe(0);
  });
});

/* The packager's own refusal moved to `release/control-chars-package.test.ts` (2026-09-27). */
