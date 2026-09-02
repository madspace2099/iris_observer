/**
 * One detector for "this file hands an operator a command that makes a secret
 * and lets them read it", used by both the test suite and the packager.
 *
 * ## Why the first version was too weak
 *
 * It required a generator pattern AND a separate print pattern on the same
 * line, and its comment claimed that caught `openssl rand`. It did not. These
 * all generate random material and put it on the terminal with no `console.log`
 * anywhere in sight:
 *
 *   - `openssl rand -hex 32`
 *   - `uuidgen`
 *   - `head -c 32 /dev/urandom | xxd -p`
 *   - `[System.Guid]::NewGuid()` in PowerShell, whose value is the output
 *
 * A generator whose DEFAULT destination is standard output does not need a
 * print statement to leak. The corrected rule splits the two cases:
 *
 *   SELF-PRINTING  the command is both the generator and the invocation, so
 *                  running it writes the value out. Always an offence.
 *   PAIRED         a library call plus something that emits it. An offence
 *                  when both are present.
 *
 * ## What must still be allowed
 *
 * `randomUUID()` is the source of `X-Observer-Request-Id`, which is a
 * correlation handle and deliberately NOT a secret. The runbook has to be able
 * to say so. A bare API name in prose is therefore fine; the same name behind
 * `node -e` or beside a `console.log` is not.
 */

/**
 * Commands that both generate and emit. Matching one of these is enough.
 *
 * `Get-Random` and `New-Guid` return a value that PowerShell prints by default;
 * `openssl rand` and `uuidgen` write to stdout unless redirected; anything
 * reading `/dev/urandom` in a documented recipe is being read by a person.
 */
export const SELF_PRINTING =
  /openssl\s+rand\b|\buuidgen\b|\/dev\/urandom|\bGet-Random\b|\bNew-Guid\b|\[System\.Guid\]::NewGuid|RNGCryptoServiceProvider|RandomNumberGenerator|\bpwgen\b|\bmkpasswd\b/i;

/** Library calls that produce random material but do not emit it by themselves. */
export const GENERATOR =
  /randomBytes|randomUUID|secrets\.token_\w+|\bos\.urandom\b|SecureRandom|crypto\.getRandomValues/i;

/** Something that runs a snippet rather than describing it. */
export const INVOCATION =
  /\bnode\s+(?:-e|--eval)\b|\bpython3?\s+-c\b|\bdeno\s+eval\b|\bruby\s+-e\b|\bperl\s+-e\b/i;

/**
 * Something that puts a value where a person or a log can read it.
 *
 * Ruby's `puts` is deliberately absent. It is also an ordinary English
 * verb, and it fired on a paragraph explaining that a command "puts it in the
 * shell history" — flagging the very sentence that removed the recipe. A real
 * Ruby one-liner is caught by INVOCATION instead.
 */
export const PRINT =
  /console\.log|process\.stdout|\becho\b|Write-Host|Write-Output|\|\s*tee\b|\bprintf\b|\bprint\s*\(|\bpbcopy\b|\bclip\.exe\b|Set-Clipboard/i;

export interface Offence {
  readonly line: number;
  readonly text: string;
  readonly kind: "self-printing" | "paired";
}

/**
 * Does this one stretch of text hand somebody a runnable secret recipe?
 *
 * Evaluated over a single line and over each block of consecutive non-blank
 * lines, because a fenced recipe is often split across lines: the `node -e` and
 * the `console.log` need not share one. A blank line ends a block, so unrelated
 * paragraphs are never joined.
 */
function offendingKind(text: string): Offence["kind"] | null {
  if (SELF_PRINTING.test(text)) return "self-printing";
  if (GENERATOR.test(text) && (INVOCATION.test(text) || PRINT.test(text))) return "paired";
  return null;
}

/** Every runnable secret recipe in one file's contents. */
export function scanText(contents: string): readonly Offence[] {
  const lines = contents.split("\n");
  const found = new Map<number, Offence>();

  lines.forEach((line, i) => {
    const kind = offendingKind(line);
    if (kind) found.set(i + 1, { line: i + 1, text: line.trim(), kind });
  });

  /* Blocks of consecutive non-blank lines, so a split recipe cannot hide. */
  let start = -1;
  for (let i = 0; i <= lines.length; i += 1) {
    const blank = i === lines.length || (lines[i] ?? "").trim() === "";
    if (!blank && start === -1) start = i;
    if (blank && start !== -1) {
      const block = lines.slice(start, i);
      /*
       * Only INDENTED blocks. A command in documentation is fenced or indented;
       * text at column zero is prose, and joining a whole paragraph produced a
       * match on a passage that mentioned an API name in one sentence and
       * console.log in another. Narrowed here rather than by weakening what
       * counts as an offence.
       */
      const indented = block.every((l) => /^\s/.test(l));
      const kind = indented ? offendingKind(block.join(" ")) : null;
      if (kind && !block.some((_, j) => found.has(start + j + 1))) {
        found.set(start + 1, { line: start + 1, text: block.join(" ").trim().slice(0, 160), kind });
      }
      start = -1;
    }
  }

  return [...found.values()].sort((a, b) => a.line - b.line);
}

/** Files whose contents are operator-facing rather than source or history. */
export const OPERATOR_FILE = /\.(md|txt|sql|example|env|ya?ml|json)$|(^|\/)\.env\./i;

/**
 * Deliberate exemptions, each for a reason that is not "it was inconvenient".
 *
 *   patches/, *.patch   the recorded history of the repository. A patch that
 *                       REMOVES a bad line necessarily contains that line, and
 *                       rewriting history to satisfy a linter is worse than
 *                       the linter being narrow.
 *   fixtures/           the detector's own positive fixtures. A test that
 *                       proves a recipe is caught has to contain one.
 *   this module         it names every pattern it looks for.
 */
export const EXEMPT = /(^|\/)patches\//i;
export const EXEMPT_SUFFIX = /\.patch$|(^|\/)fixtures\/|(^|\/)secret-recipes\.ts$/i;

/** Is this path in scope, given where it sits? */
export function inScope(path: string): boolean {
  if (EXEMPT.test(path) || EXEMPT_SUFFIX.test(path)) return false;
  if (/^node_modules\//.test(path)) return false;
  return OPERATOR_FILE.test(path);
}
