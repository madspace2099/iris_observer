import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * THE STAGED DETECTOR MUST ACTUALLY RUN WHERE IT IS STAGED.
 *
 * The `3b746f4` archive contained both `generators/gate-contract.ts` and
 * `generators/secret-patterns.json`, and the module resolved its data file at
 * `../../scripts/release/secret-patterns.json` — a path relative to the
 * repository it came from. Outside that layout there is no such directory, so
 * the archive shipped a detector and its definitions and could not execute one
 * against the other.
 *
 * Checking filenames would not have caught it: both files were present and
 * correctly named. Only running the thing catches it, so that is what happens
 * here — the module is copied into a fresh temporary directory OUTSIDE the
 * repository, imported there, and made to detect real secret-shaped values.
 *
 * The repository copy is then RENAMED for the duration, so a fallback to it
 * cannot silently rescue the staged layout and let this pass for the wrong
 * reason.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const TSX = join(
  ROOT,
  "node_modules",
  ".pnpm",
  "tsx@4.23.12",
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);

describe("the staged evidence module is self-contained", () => {
  const scratch = mkdtempSync(join(tmpdir(), "observer-staged-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  /**
   * Stage the generator and its data the way `build-package.ts` stages them:
   * side by side in `generators/`, with nothing else around them.
   */
  const stageGenerators = (): string => {
    const out = mkdtempSync(join(scratch, "pkg-"));
    const generators = join(out, "generators");
    mkdirSync(generators, { recursive: true });
    for (const file of [
      "gate-contract.ts",
      "secret-patterns.json",
      "control-chars.ts",
      "release-operation.ts",
    ]) {
      cpSync(join(ROOT, "scripts", "release", file), join(generators, file));
    }
    return generators;
  };

  /** Run one expression inside the staged module, in the staged directory. */
  const runStaged = (body: string): string => {
    const generators = stageGenerators();
    const script = join(generators, "probe.mts");
    writeFileSync(script, body, "utf8");
    return execFileSync(process.execPath, [TSX, script], {
      cwd: generators,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  };

  it("resolves its data file beside itself when staged", () => {
    const out = runStaged(
      [
        'import { secretPatternsPath } from "./gate-contract";',
        "const path = secretPatternsPath();",
        'process.stdout.write(path.split(/[\\\\/]/).slice(-2).join("/"));',
      ].join("\n"),
    );
    expect(out).toBe("generators/secret-patterns.json");
  });

  it("detects a hostile value in serialized evidence, from the staged copy", () => {
    /*
     * The fixture is ASSEMBLED at runtime so no tracked file holds a complete
     * secret-shaped literal.
     */
    const out = runStaged(
      [
        'import { secretPatternsIn } from "./gate-contract";',
        'const hostile = JSON.stringify({ gates: { build: "AKIA" + "ABCDEFGH".repeat(2) } });',
        'const clean = JSON.stringify({ gates: { build: "clean" } });',
        "process.stdout.write(JSON.stringify({",
        "  hostile: secretPatternsIn(hostile),",
        "  clean: secretPatternsIn(clean),",
        "}));",
      ].join("\n"),
    );
    const result = JSON.parse(out) as { hostile: string[]; clean: string[] };
    expect(result.hostile).toContain("aws-access-key");
    expect(result.clean).toEqual([]);
  });

  it("consults no repository-side copy, proven by taking it away", () => {
    /*
     * THE CONTROL THAT MAKES THE OTHER TWO MEAN ANYTHING. Without it, a staged
     * module quietly falling back to the repository would pass every check
     * above while remaining unable to run anywhere else.
     */
    const generators = stageGenerators();
    const script = join(generators, "probe.mts");
    writeFileSync(
      script,
      [
        'import { secretPatternsIn, secretPatternsPath } from "./gate-contract";',
        'const found = secretPatternsIn("sb_secret_" + "a1B2c3D4".repeat(4));',
        "process.stdout.write(JSON.stringify({ found, path: secretPatternsPath() }));",
      ].join("\n"),
      "utf8",
    );

    const real = join(ROOT, "scripts", "release", "secret-patterns.json");
    const hidden = join(scratch, "secret-patterns.json.parked");
    cpSync(real, hidden);
    rmSync(real);
    try {
      const out = execFileSync(process.execPath, [TSX, script], {
        cwd: generators,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      }).trim();
      const result = JSON.parse(out) as { found: string[]; path: string };
      expect(result.found).toContain("supabase-secret");
      expect(result.path).not.toContain("scripts");
    } finally {
      /* Restored unconditionally: a test may not leave the tree modified. */
      cpSync(hidden, real);
      rmSync(hidden);
    }

    expect(readFileSync(real, "utf8").length).toBeGreaterThan(0);
  });

  it("still resolves the repository copy in a source checkout", () => {
    /*
     * The fallback is not dead code — it is how the module works when nothing
     * has staged it, which is every ordinary run of the gate.
     */
    const here = execFileSync(
      process.execPath,
      [
        TSX,
        "-e",
        [
          'import { secretPatternsPath } from "./scripts/release/gate-contract";',
          'process.stdout.write(secretPatternsPath().split(/[\\\\/]/).slice(-3).join("/"));',
        ].join("\n"),
      ],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    expect(here).toBe("scripts/release/secret-patterns.json");
  });
});
