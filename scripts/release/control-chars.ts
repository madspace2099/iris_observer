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
  /**
   * How many files the scan was ASKED to read.
   *
   * Separate from `scannedFiles` because they can differ, and the difference is
   * the whole point: the scanner used to catch a read failure and continue,
   * with a comment saying a file deleted between listing and reading was not
   * this gate's problem. It is exactly this gate's problem. "I could not read
   * eleven tracked files" and "I read every tracked file and found nothing"
   * were reported by the same number.
   */
  readonly requestedFiles: number;
  readonly scannedFiles: number;
  readonly readFailures: number;
  /** Bounded identities of what could not be read. Basenames, never paths. */
  readonly unreadableFiles: readonly string[];
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
  const unreadable: string[] = [];
  let found = 0;
  let scanned = 0;
  for (const file of files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(root, file));
    } catch {
      /*
       * RECORDED, NOT SKIPPED. A tracked file that cannot be read is a file
       * this scan did not check, and a gate that reports "clean" over a set it
       * could not read is reporting the wrong thing. The basename is kept so
       * the count can be acted on; the path is not, because a path is
       * machine-identifying detail in evidence somebody zips up.
       */
      unreadable.push(file.split("/").pop() ?? "unnamed");
      continue;
    }
    scanned += 1;
    const here = countControlCharacters(bytes);
    if (here > 0) {
      found += here;
      affected.push(file);
    }
  }
  return {
    requestedFiles: files.length,
    scannedFiles: scanned,
    readFailures: unreadable.length,
    unreadableFiles: unreadable.sort(),
    foundCharacters: found,
    affectedFiles: affected.sort(),
  };
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
  const requested = wholeNumber(s.requestedFiles, "requestedFiles");
  const failures = wholeNumber(s.readFailures, "readFailures");
  const found = wholeNumber(s.foundCharacters, "foundCharacters");

  /*
   * COMPLETENESS, BEFORE CLEANLINESS. A scan that read fewer files than it was
   * asked to has not established anything about the ones it missed.
   */
  if (requested !== null && scanned !== null && scanned !== requested) {
    problems.push(
      `${label}: read ${String(scanned)} of ${String(requested)} requested file(s) — the rest were not checked`,
    );
  }
  if (failures !== null && failures !== 0) {
    problems.push(`${label}: ${String(failures)} file(s) could not be read`);
  }
  if (!Array.isArray(s.unreadableFiles) || s.unreadableFiles.some((f) => typeof f !== "string")) {
    problems.push(`${label}.unreadableFiles is not an array of strings`);
  } else if (failures !== null && s.unreadableFiles.length !== failures) {
    problems.push(
      `${label}: ${String(failures)} read failure(s) but ${String(s.unreadableFiles.length)} named`,
    );
  }

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
