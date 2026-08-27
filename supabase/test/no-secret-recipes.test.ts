import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No tracked file may hand an operator a command that prints a secret.
 *
 * Every artefact in this release promises that the pepper never travels through
 * shell output, terminal history, a captured log or an assistant's context —
 * and three of them then offered
 *
 *     node -e "console.log(crypto.randomBytes(32).toString('hex'))"
 *
 * as the way to make one. That single line puts the value in all four places at
 * once. `.env.example`, `docs/18-deployment.md` and the packaged pepper
 * contract all carried it, so the promise and the instructions were in the same
 * repository contradicting each other.
 *
 * The rule is narrow and mechanical: a tracked, operator-facing file must not
 * contain a command that GENERATES random material AND WRITES IT OUT. Reasoning
 * about secrets is fine — this file is full of it — so the check looks for the
 * pairing, not for the word.
 */

const ROOT = join(import.meta.dirname, "..", "..");

/** Every tracked file, from git rather than from a directory walk. */
function trackedFiles(): readonly string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\0").filter((f) => f.length > 0);
}

/**
 * Operator-facing: documentation, examples, operator SQL and env templates.
 *
 * Source and tests are excluded because a test that asserts the absence of a
 * recipe has to name the recipe, and this file is the proof.
 */
const OPERATOR = /\.(md|txt|sql|example|env|ya?ml|json)$|(^|\/)\.env\./i;
const EXCLUDED = /^(node_modules|_review|_sql-to-paste)\//;

/**
 * A generator paired with an output.
 *
 * `randomBytes`, `randomUUID`, `openssl rand`, `head -c … /dev/urandom` and the
 * PowerShell equivalents, on a line that also prints — `console.log`, `echo`,
 * `Write-Host`, a bare `openssl rand -hex` with no redirection, `| tee`.
 */
const GENERATORS =
  /randomBytes|randomUUID|openssl\s+rand|\/dev\/urandom|RNGCryptoServiceProvider|Get-Random|uuidgen/i;
const PRINTS = /console\.log|process\.stdout|\becho\b|Write-Host|Write-Output|\|\s*tee\b|printf/i;

describe("no tracked operator file prints generated secret material", () => {
  const files = trackedFiles().filter((f) => OPERATOR.test(f) && !EXCLUDED.test(f));

  it("finds the operator-facing files to check", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(".env.example");
    expect(files).toContain("docs/18-deployment.md");
  });

  it.each(files)("%s carries no generate-and-print recipe", (file) => {
    const lines = readFileSync(join(ROOT, file), "utf8").split("\n");

    const offenders = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => GENERATORS.test(line) && PRINTS.test(line));

    expect(
      offenders.map((o) => `${file}:${o.n}`),
      offenders.map((o) => o.line.trim()).join(" | "),
    ).toEqual([]);
  });

  it("still tells the operator where a pepper does come from", () => {
    /*
     * Removing the recipe without replacing it would leave somebody to invent
     * their own, which is how a `date | md5sum` pepper gets created.
     */
    for (const file of [".env.example", "docs/18-deployment.md"]) {
      const text = readFileSync(join(ROOT, file), "utf8");
      expect(text, file).toMatch(/password manager/i);
      expect(text, file).toMatch(/Vercel/i);
    }
  });

  it("says why the recipe was removed, so it is not helpfully restored", () => {
    const doc = readFileSync(join(ROOT, "docs/18-deployment.md"), "utf8");
    // Whitespace-tolerant: Prettier rewraps this prose.
    expect(doc).toMatch(/deliberately no command/i);
    expect(doc).toMatch(/scrollback\s+buffer\s+is\s+not\s+a\s+secret\s+store/i);
  });
});
