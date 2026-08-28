/**
 * Patches whose bytes cannot travel as text, and what is done about them.
 *
 * The delivered `1b8b912` archive contained eight literal BACKSPACE bytes,
 * spread over three patch files, while the package reported "control-char scan
 * 0". Both halves of that are explicable and neither is acceptable.
 *
 *   * THE PATCHES ARE FAITHFUL. Those bytes are in the repository's history:
 *     they are the REMOVED lines of the three commits that removed them. A
 *     diff that did not contain them would be a wrong diff.
 *   * THE SCAN WAS IN THE WRONG PLACE. It ran over tracked files before the
 *     packager had staged anything, so it never saw a patch at all.
 *
 * History is not rewritten to fix this, and the patches are not quietly
 * excluded from the scan. Each DECLARED patch is converted to a byte-exact
 * base64 sidecar and the raw file is not shipped, so the archive is entirely
 * free of C0 bytes and the original bytes are still recoverable exactly.
 *
 * ## Why a declared list rather than "anything containing a control character"
 *
 * Converting whatever happens to contain a control character would turn the
 * package-level scan into a formatting step: an accidental byte in a NEW patch
 * would be silently encoded away instead of refused. The commits below are
 * named individually, so a control character anywhere else — including in a
 * patch from any other commit — still fails the build.
 */

/**
 * Commits whose patches legitimately contain C0 bytes, and why.
 *
 * Each removed a raw BACKSPACE that a shell-escaping slip had written into a
 * regular expression, so the removal shows the byte on a `-` line.
 */
export const HISTORICAL_CONTROL_CHAR_COMMITS: readonly { sha: string; why: string }[] = [
  {
    sha: "a0226f7e0c78191b5e58e59221ac01e63375b030",
    why: "removes two backspaces from the gate-contract FAILED matcher",
  },
  {
    sha: "9e00a4f18a1902d8a4312e5cf49e2c8abc89fdf0",
    why: "removes two backspaces from a test regex and adds the widened scan",
  },
  {
    sha: "1b8b912f273c6b2a60114db7de4f5965bce786e6",
    why: "removes a backspace from the REVIEW paragraph describing backspaces",
  },
];

/** The commit a `git format-patch` file was generated from, or null. */
export function patchCommit(contents: string): string | null {
  const match = /^From ([0-9a-f]{40}) /m.exec(contents);
  return match?.[1] ?? null;
}

/** Is this patch one of the declared historical cases? */
export function isDeclaredHistorical(contents: string): boolean {
  const sha = patchCommit(contents);
  if (sha === null) return false;
  return HISTORICAL_CONTROL_CHAR_COMMITS.some((c) => c.sha === sha);
}

/** Where a patch's forbidden bytes actually sit. Measured, never assumed. */
export interface ControlByteDistribution {
  readonly added: number;
  readonly removed: number;
  readonly context: number;
}

/**
 * Count forbidden C0 bytes per diff-line kind in one patch's decoded text.
 *
 * The explanation that shipped beside these patches said all three commits
 * REMOVE backspaces and that the bytes occur only on removed lines. Measured,
 * that is false for two of the three: one patch's bytes are entirely on ADDED
 * lines, and another has them on both. The mechanism was always right and the
 * story about it was wrong, so the story is now computed.
 */
export function controlByteDistribution(contents: string): ControlByteDistribution {
  let added = 0;
  let removed = 0;
  let context = 0;
  for (const line of contents.split("\n")) {
    let here = 0;
    for (const ch of line) {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) here += 1;
    }
    if (here === 0) continue;
    if (line.startsWith("+")) added += here;
    else if (line.startsWith("-")) removed += here;
    else context += here;
  }
  return { added, removed, context };
}

/** The note that ships beside the encoded patches. */
export function transportSafeNote(
  encoded: readonly string[],
  measured: readonly { readonly name: string; readonly bytes: ControlByteDistribution }[] = [],
): string {
  const describe = (b: ControlByteDistribution): string => {
    const parts: string[] = [];
    if (b.added > 0) parts.push(`${String(b.added)} on added line(s)`);
    if (b.removed > 0) parts.push(`${String(b.removed)} on removed line(s)`);
    if (b.context > 0) parts.push(`${String(b.context)} on context line(s)`);
    return parts.length === 0 ? "none" : parts.join(", ");
  };

  return [
    "TRANSPORT-SAFE PATCH ENCODING",
    "",
    "Some patches in this series contain literal C0 control bytes — BACKSPACE,",
    "0x08. A patch is encoded because its DECODED BYTES CONTAIN FORBIDDEN C0",
    "CHARACTERS, wherever in the diff they occur: added lines, removed lines or",
    "context alike. Nothing about the encoding decision depends on which.",
    "",
    "AN EARLIER EDITION OF THIS NOTE SAID OTHERWISE. It claimed all three",
    "commits REMOVE backspaces and that every byte sits on a removed line.",
    "Measured, that is false for two of the three. The mechanism was always",
    "sound; the explanation of it was not, so it is now computed from the",
    "decoded patches rather than written down once and carried forward.",
    "",
    "WHERE THE BYTES ACTUALLY ARE, measured from these exact files:",
    "",
    ...(measured.length === 0
      ? ["  (not measured for this build)"]
      : measured.map((m) => `  ${m.name}  ${describe(m.bytes)}`)),
    "",
    "A text archive must not carry invisible control characters, and rewriting",
    "history to avoid them is not on the table. So each affected patch ships",
    "base64-encoded instead of raw:",
    "",
    ...encoded.map((name) => `  ${name}`),
    "",
    "THESE FILES ARE NOT DIRECTLY `git am` APPLICABLE. Decode first — the",
    "decoded bytes are byte-for-byte the original patch, so the recovered file",
    "is applicable and its SHA-256 is the SHA-256 of the patch git produced:",
    "",
    "  base64 -d 0000-example.patch.base64 > 0000-example.patch",
    "  git am 0000-example.patch",
    "",
    "Every other patch in this directory is raw and directly applicable. The",
    "manifest lists whatever is actually present, encoded or not, so the hashes",
    "verify against the files as shipped.",
    "",
  ].join("\n");
}
