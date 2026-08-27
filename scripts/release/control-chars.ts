/**
 * Finding invisible control characters, and saying so in numbers.
 *
 * Two failures brought this module into existence, and they are different
 * failures with the same cause.
 *
 *   1. A shell-escaping slip put literal BACKSPACE bytes inside regular
 *      expressions in this repository. `\x08FAILED\x08` renders in an editor as
 *      `FAILED` and matches nothing, so a gate check was silently disabled while
 *      the then-current scan — which looked for 0x00 alone — reported clean.
 *
 *   2. When the scan was widened, it still ran only over TRACKED FILES, before
 *      the packager had staged anything. The delivered archive contained eight
 *      backspace bytes in three patch files, and the package said
 *      "control-char scan 0". Those bytes are in the repository's history — they
 *      are the removed lines of the commits that removed them — so the patches
 *      are faithful and the SCAN was in the wrong place.
 *
 * So the result is STRUCTURED rather than prose. "0 in any tracked file" and
 * "8 FOUND" are both strings; a gate contract that reads strings has to guess
 * which of them means clean, and the previous one guessed by looking for the
 * word FAILED — which "8 FOUND" does not contain.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Sanitized, structured evidence. Counts and paths, never file contents.
 *
 * A path is enough to find the file; the bytes around a control character are
 * unbounded text from a file that might hold anything.
 */
export interface ControlCharacterScan {
  readonly scannedFiles: number;
  readonly foundCharacters: number;
  readonly affectedFiles: readonly string[];
}

/** Tab, newline and carriage return are the only ones a text file may hold. */
export const isForbiddenControl = (byte: number): boolean =>
  byte < 32 && byte !== 9 && byte !== 10 && byte !== 13;

/** How many forbidden control characters these bytes contain. */
export function countControlCharacters(bytes: Buffer): number {
  let found = 0;
  for (const byte of bytes) if (isForbiddenControl(byte)) found += 1;
  return found;
}

/** Every file under `dir`, relative and slash-separated. */
function walkRelative(dir: string): readonly string[] {
  const out: string[] = [];
  const recurse = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) recurse(path);
      else out.push(relative(dir, path).split(sep).join("/"));
    }
  };
  recurse(dir);
  return out;
}

/** Scan an explicit list of files, relative to a root. */
export function scanFiles(root: string, files: readonly string[]): ControlCharacterScan {
  const affected: string[] = [];
  let found = 0;
  let scanned = 0;
  for (const file of files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(root, file));
    } catch {
      continue; /* deleted between listing and reading; not this gate's problem */
    }
    scanned += 1;
    const here = countControlCharacters(bytes);
    if (here > 0) {
      found += here;
      affected.push(file);
    }
  }
  return { scannedFiles: scanned, foundCharacters: found, affectedFiles: affected.sort() };
}

/** Scan every file in a directory tree — the staged package, for instance. */
export function scanDirectory(dir: string): ControlCharacterScan {
  return scanFiles(dir, walkRelative(dir));
}

/**
 * Is this structured evidence both well-formed and clean?
 *
 * Every reason it is not, so a caller can print all of them. Fail-closed on an
 * absent or wrongly typed field: "the scan did not record it" and "the scan
 * recorded nothing wrong" are different facts, and only one is evidence.
 */
export function scanProblems(scan: unknown, label: string): readonly string[] {
  const problems: string[] = [];
  if (scan === null || typeof scan !== "object") {
    return [`${label}: no structured control-character evidence`];
  }
  const s = scan as Partial<ControlCharacterScan>;

  const wholeNumber = (value: unknown, field: string): number | null => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      problems.push(`${label}.${field} is not a non-negative integer: ${JSON.stringify(value)}`);
      return null;
    }
    return value;
  };

  const scanned = wholeNumber(s.scannedFiles, "scannedFiles");
  const found = wholeNumber(s.foundCharacters, "foundCharacters");

  if (!Array.isArray(s.affectedFiles) || s.affectedFiles.some((f) => typeof f !== "string")) {
    problems.push(`${label}.affectedFiles is not an array of strings`);
  } else if (s.affectedFiles.length > 0) {
    problems.push(
      `${label}: ${s.affectedFiles.length} affected file(s): ${s.affectedFiles.join(", ")}`,
    );
  }

  if (scanned !== null && scanned === 0) problems.push(`${label}: scanned no files at all`);
  if (found !== null && found !== 0)
    problems.push(`${label}: ${String(found)} control character(s)`);

  /*
   * The two halves must agree. A zero count beside a non-empty file list, or a
   * non-zero count beside an empty one, means the evidence is internally
   * inconsistent — which is its own reason to refuse, separate from either
   * value being wrong.
   */
  if (found !== null && Array.isArray(s.affectedFiles)) {
    const listed = s.affectedFiles.length;
    if ((found === 0) !== (listed === 0)) {
      problems.push(
        `${label}: count and file list disagree — ${String(found)} character(s), ${String(listed)} file(s)`,
      );
    }
  }

  return problems;
}

/** The one-line form for a console and for a gate verdict. */
export const describeScan = (scan: ControlCharacterScan): string =>
  scan.foundCharacters === 0
    ? `0 in ${String(scan.scannedFiles)} files`
    : `${String(scan.foundCharacters)} FOUND in ${String(scan.affectedFiles.length)} file(s)`;

/** The exact verdict string a clean scan must record, for the gate contract. */
export const cleanVerdict = (scan: ControlCharacterScan): string =>
  `0 in ${String(scan.scannedFiles)} files`;
