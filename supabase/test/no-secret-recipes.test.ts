import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanText, inScope, EXEMPT, EXEMPT_SUFFIX } from "../../scripts/release/secret-recipes";
import { build } from "../../scripts/release/build-package";
import { openPackageOperation, type TestPackageOperation } from "./support/package-operation";

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
   * BUILT HERE, not found here.
   *
   * This used to scan `_review/<head>` and skip when that directory did not
   * exist — which is to say it skipped on every machine that had not already
   * packaged this exact commit, including the release gate that runs BEFORE
   * packaging. The one run where the check mattered was the one where it never
   * executed. The suite now generates its own package, into its own temporary
   * directory, from its own synthetic gate evidence, and scans that.
   *
   * The packager runs this same check internally and refuses on a finding; this
   * asserts it independently, so a regression in the packager's own check is
   * still visible.
   */
  const scratch = mkdtempSync(join(tmpdir(), "observer-secret-pkg-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const fullHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const short = fullHead.slice(0, 7);
  let staged = "";

  let owned: TestPackageOperation | undefined;

  beforeAll(() => {
    owned = openPackageOperation(scratch, fullHead);
    build(join(scratch, "out"), { gateRecordRoot: owned.root, operation: owned.operation });
    staged = join(scratch, "out", short);
  }, 240_000);

  afterAll(() => {
    owned?.close();
  });

  it("stages files to check in the first place", () => {
    expect(
      walk(staged).filter((p) => inScope(relative(staged, p).split(sep).join("/"))).length,
    ).toBeGreaterThan(10);
  });

  it("finds no runnable recipe anywhere in the freshly generated package", () => {
    const offences: string[] = [];
    for (const path of walk(staged)) {
      const name = relative(staged, path).split(sep).join("/");
      if (!inScope(name)) continue;
      for (const o of scanText(readFileSync(path, "utf8"))) {
        offences.push(`${name}:${String(o.line)} (${o.kind})`);
      }
    }
    expect(offences).toEqual([]);
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

/**
 * THE HISTORY SCAN HAS NO EXEMPTIONS AT ALL.
 *
 * An earlier attempt at this milestone declared one commit by SHA, so that a
 * transient test fixture could stay in history. It then needed a second entry
 * for the commit message describing the first — which is what a control looks
 * like while it is being negotiated away one case at a time. The operator
 * refused it and authorised a local-only history repair instead.
 *
 * What survives is the diagnostic improvement: the scan runs commit by commit,
 * so a finding names the commit that introduced it rather than a line number in
 * a concatenated log. What must not survive is any way to make a finding stop
 * being one.
 */
describe("the secret auditor exempts nothing", () => {
  const source = readFileSync(
    join(import.meta.dirname, "..", "..", "scripts", "secret-audit.mjs"),
    "utf8",
  );

  it("declares no commit, path or pattern as permitted", () => {
    /* No SHA-shaped literal anywhere: that is what a declaration would need. */
    expect(source).not.toMatch(/[0-9a-f]{40}/);
    expect(source).not.toMatch(/HISTORICAL_SECRET|declaredCommits|EXEMPT_PATHS|allowPattern/);
    /* And nothing skips a commit. */
    expect(source).not.toMatch(/continue;/);
  });

  it("scans every commit in the range, diff and message alike", () => {
    expect(source).toContain('git(["rev-list", range])');
    expect(source).toContain('git(["show", "--no-color", sha])');
    /*
     * `git show` prints the message above the diff, so one pass covers both —
     * which is why the message that described the fixture was caught at all.
     */
    expect(source).toMatch(/prints the commit message as well as the diff/);
  });

  it("attributes a finding to a commit a person can act on", () => {
    expect(source).toMatch(/<commit \${sha\.slice\(0, 7\)}>/);
    expect(source).not.toContain("<history ");
  });

  it("still scans the working tree, the staged diff and the bundle unconditionally", () => {
    expect(source).toContain('scanText("<staged diff>", git(["diff", "--cached"]))');
    expect(source).toContain("for (const rel of listed) findings.push(...scanFile(");
    /*
     * The ONE thing the auditor does not scan is itself and the pattern file it
     * loads, which pre-dates this milestone: a scanner that matched its own
     * rules would report every pattern it knows.
     */
    expect(source).toContain('const SELF = new Set(["scripts/secret-audit.mjs", PATTERNS_FILE]);');
  });

  it("finds nothing anywhere, including in this branch's history", () => {
    /*
     * THE PROOF THE DECLARATION WAS UNNECESSARY. The repaired history contains
     * no commit carrying the shape, so the scan is clean with nothing exempted.
     */
    const out = execFileSync(process.execPath, ["scripts/secret-audit.mjs"], {
      cwd: join(import.meta.dirname, "..", ".."),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    expect(out).toContain("secret audit: clean");
    expect(out).toMatch(/history\s+origin\/main\.\.HEAD/);
  });
});
