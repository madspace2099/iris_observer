import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { scanText, inScope, EXEMPT, EXEMPT_SUFFIX } from "../../scripts/release/secret-recipes";

/**
 * No operator-facing artefact may hand somebody a command that makes a secret
 * and lets them read it.
 *
 * ## What the first version of this test got wrong
 *
 * It required a generator pattern AND a separate print pattern on the SAME
 * LINE, and its comment claimed that caught the OpenSSL random generator. It
 * did not. A generator whose default destination is standard output needs no
 * print statement at all: the bare command, `uuidgen`, a pipeline reading the
 * kernel random device, and the PowerShell equivalents all put the value on the
 * terminal while a check looking for `console.log` sees nothing.
 *
 * The corrected detector, shared with the packager in
 * `scripts/release/secret-recipes.ts`, separates SELF-PRINTING commands — an
 * offence on their own — from PAIRED ones, which need a generator plus an
 * emitter. `supabase/test/fixtures/` holds both directions, because a rule
 * asserted only in the negative is a rule nobody has seen work.
 *
 * ## What must keep passing
 *
 * `randomUUID()` is where `X-Observer-Request-Id` comes from, and that value is
 * deliberately NOT a secret. The runbook has to be able to say so. A bare API
 * name in prose is fine; the same name behind an interpreter flag or beside a
 * `console.log` is not.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const FIXTURES = join(import.meta.dirname, "fixtures");

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** Every tracked file, from git rather than from a directory walk. */
function trackedFiles(): readonly string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((f) => f.length > 0);
}

describe("the detector catches what it claims to catch", () => {
  const positives = readFileSync(join(FIXTURES, "secret-recipe-positive.md"), "utf8");
  const found = scanText(positives);

  it("reports every recipe in the positive fixture", () => {
    /* Nine single-line recipes plus one split across an indented block. */
    expect(found.length).toBeGreaterThanOrEqual(9);
  });

  it.each([
    ["openssl rand -hex", "self-printing"],
    ["openssl rand -base64", "self-printing"],
    ["uuidgen", "self-printing"],
    ["xxd -p", "self-printing"],
    ["Get-Random", "self-printing"],
    ["NewGuid", "self-printing"],
    ["randomBytes(32).toString", "paired"],
    ["randomUUID())", "paired"],
    ["secrets.token_hex", "paired"],
  ])("catches %s as %s", (needle, kind) => {
    const hit = found.find((o) => o.text.includes(needle));
    expect(hit, `${needle} was not detected at all`).toBeDefined();
    expect(hit?.kind).toBe(kind);
  });

  it("catches a recipe split across lines inside one indented block", () => {
    const block = [
      '    node -e "',
      "      const { randomBytes } = require('crypto');",
      "      console.log(x);",
      '    "',
    ].join("\n");
    expect(scanText(block).length).toBeGreaterThan(0);
  });

  it("reports nothing in the negative fixture", () => {
    const negatives = readFileSync(join(FIXTURES, "secret-recipe-negative.md"), "utf8");
    expect(scanText(negatives).map((o) => `${o.line}: ${o.text}`)).toEqual([]);
  });

  it.each([
    "The request id comes from randomUUID(), which is not a secret.",
    "a correlation handle produced by crypto.randomUUID()",
    "Generate the pepper in your password manager and paste it into Vercel.",
    "The command puts it in the shell history, which is why it is gone.",
  ])("permits the descriptive line: %s", (line) => {
    expect(scanText(line)).toEqual([]);
  });
});

describe("the exemptions are narrow and deliberate", () => {
  it("exempts patch history, because a removal patch contains what it removed", () => {
    expect(EXEMPT.test("patches/0015-remove-the-recipe.patch")).toBe(true);
    expect(EXEMPT_SUFFIX.test("0015-remove-the-recipe.patch")).toBe(true);
    expect(inScope("patches/0015-remove-the-recipe.patch")).toBe(false);
  });

  it("exempts the fixtures, and the detector module that names every pattern", () => {
    expect(inScope("supabase/test/fixtures/secret-recipe-positive.md")).toBe(false);
    expect(inScope("scripts/release/secret-recipes.ts")).toBe(false);
  });

  it("exempts nothing else that carries operator instructions", () => {
    for (const path of [
      "docs/18-deployment.md",
      ".env.example",
      "supabase/README.md",
      "docs/release/REVIEW.txt",
    ]) {
      expect(inScope(path), path).toBe(true);
    }
  });
});

describe("no tracked operator file carries a runnable secret recipe", () => {
  const files = trackedFiles().filter(inScope);

  it("finds the operator-facing files to check", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(".env.example");
    expect(files).toContain("docs/18-deployment.md");
    /* The evidence templates are tracked now, so they are in scope too. */
    expect(files).toContain("docs/release/REVIEW.txt");
  });

  it.each(files)("%s", (file) => {
    const offences = scanText(readFileSync(join(ROOT, file), "utf8"));
    expect(
      offences.map((o) => `${file}:${o.line} (${o.kind})`),
      offences.map((o) => o.text).join(" | "),
    ).toEqual([]);
  });
});

describe("the generated package carries no runnable secret recipe", () => {
  /*
   * The packager runs this same check before it writes an archive, and refuses
   * on a finding. This asserts the result over whatever package is currently
   * staged, so a reviewer with the bundle on disk sees the same answer without
   * rebuilding it.
   */
  const head = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dir = join(ROOT, "_review", head);
  const present = existsSync(dir) && statSync(dir).isDirectory();

  it.runIf(present)(`finds none in the staged ${head} package`, () => {
    /*
     * The CURRENT package only. `_review/` accumulates the staging directory of
     * every bundle ever built, and an earlier one legitimately contains the
     * recipe a later milestone removed — asserting over all of them would be
     * asserting that history was rewritten.
     */
    for (const path of walk(dir)) {
      const name = relative(dir, path).split(sep).join("/");
      if (!inScope(name)) continue;
      const offences = scanText(readFileSync(path, "utf8"));
      expect(
        offences.map((o) => `${name}:${o.line}`),
        offences.map((o) => o.text).join(" | "),
      ).toEqual([]);
    }
  });
});

describe("the artefacts still say where a pepper does come from", () => {
  it("names the password manager and Vercel, so nobody invents their own", () => {
    for (const file of [
      ".env.example",
      "docs/18-deployment.md",
      "docs/release/PEPPER-CONTRACT.txt",
    ]) {
      const text = readFileSync(join(ROOT, file), "utf8");
      expect(text, file).toMatch(/password manager/i);
      expect(text, file).toMatch(/Vercel/i);
    }
  });

  it("says why the recipe was removed, so it is not helpfully restored", () => {
    const doc = readFileSync(join(ROOT, "docs/18-deployment.md"), "utf8");
    /* Whitespace-tolerant: Prettier rewraps this prose. */
    expect(doc).toMatch(/deliberately no command/i);
    expect(doc).toMatch(/scrollback\s+buffer\s+is\s+not\s+a\s+secret\s+store/i);
  });
});
