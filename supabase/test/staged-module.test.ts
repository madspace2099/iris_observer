import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { trackedBytesDigest } from "../../scripts/release/tree-identity";

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

  it("consults no repository-side copy, proven inside an isolated decoy tree", () => {
    /*
     * THE CONTROL THAT MAKES THE OTHER TWO MEAN ANYTHING — and the way it used
     * to be performed was the defect.
     *
     * ## What deleting the real file did
     *
     * This case used to delete the TRACKED
     * `scripts/release/secret-patterns.json` and restore it afterwards. Under
     * four workers, the release suites run beside this one: another suite
     * staging or scanning the repository during that window observes the file
     * missing, and the failure it reports is about a file this test moved. The
     * tree sample taken after the run cannot detect it either — delete-and-
     * restore leaves the same bytes, which is exactly the shape the whole
     * staged-origin correction exists to refuse.
     *
     * ## What replaces it
     *
     * A DECOY REPOSITORY, built entirely in a temporary directory: the same
     * layout the module's fallback looks for
     * (`<root>/scripts/release/secret-patterns.json`), with the staged copy two
     * levels below it. The fallback path is therefore reachable and the file it
     * would reach is deliberately absent — proving the staged module never
     * consults it — while the real repository is not touched at all.
     */
    const decoy = mkdtempSync(join(scratch, "decoy-"));
    const generators = join(decoy, "scripts", "release", "generators");
    mkdirSync(generators, { recursive: true });
    for (const file of ["gate-contract.ts", "control-chars.ts", "release-operation.ts"]) {
      cpSync(join(ROOT, "scripts", "release", file), join(generators, file));
    }
    cpSync(
      join(ROOT, "scripts", "release", "secret-patterns.json"),
      join(generators, "secret-patterns.json"),
    );
    /*
     * The decoy's OWN repository-side copy is deliberately absent. The
     * fallback resolves `../../scripts/release/secret-patterns.json` from the
     * module, which lands inside this decoy — and finds nothing there.
     */
    const fallback = join(decoy, "scripts", "release", "scripts", "release");
    mkdirSync(fallback, { recursive: true });
    expect(existsSync(join(fallback, "secret-patterns.json"))).toBe(false);

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
    const out = execFileSync(process.execPath, [TSX, script], {
      cwd: generators,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
    const result = JSON.parse(out) as { found: string[]; path: string };
    expect(result.found).toContain("supabase-secret");
    /* It resolved the adjacent copy, not anything above it. */
    expect(result.path.split(/[\\/]/).slice(-2).join("/")).toBe("generators/secret-patterns.json");
  });

  it("refuses to run when neither the adjacent nor the repository copy exists", () => {
    /*
     * The other half of the control: with NO patterns file anywhere the module
     * can reach, it must fail rather than silently detecting nothing. A
     * detector that quietly matches no patterns is worse than one that is
     * missing, because it reports clean.
     */
    const decoy = mkdtempSync(join(scratch, "bare-"));
    const generators = join(decoy, "scripts", "release", "generators");
    mkdirSync(generators, { recursive: true });
    for (const file of ["gate-contract.ts", "control-chars.ts", "release-operation.ts"]) {
      cpSync(join(ROOT, "scripts", "release", file), join(generators, file));
    }
    const script = join(generators, "probe.mts");
    writeFileSync(
      script,
      [
        'import { secretPatternsIn } from "./gate-contract";',
        'process.stdout.write(JSON.stringify(secretPatternsIn("anything")));',
      ].join("\n"),
      "utf8",
    );
    expect(() =>
      execFileSync(process.execPath, [TSX, script], {
        cwd: generators,
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("mutates no tracked file, which is what makes it safe beside the other suites", () => {
    /*
     * Stated as a property of the SOURCE, because the failure it guards against
     * is a window during a parallel run rather than a state afterwards: a
     * delete-and-restore leaves the tree byte-identical and is invisible to any
     * check that runs when this file is finished.
     */
    const source = readFileSync(join(import.meta.dirname, "staged-module.test.ts"), "utf8");
    /*
     * No write, copy or removal whose DESTINATION is inside the repository.
     * Reading from `ROOT` is what staging is; writing to it is the defect. So
     * this looks at where each call writes: the sole argument of `rmSync`, and
     * the destination of the others.
     */
    const destructive = [
      ...source.matchAll(/\brmSync\(\s*(join\(ROOT[^)]*\)[^,)]*)/g),
      ...source.matchAll(/\b(?:cpSync|renameSync)\([^,]+,\s*(join\(ROOT[^)]*\))/g),
      ...source.matchAll(/\bwriteFileSync\(\s*(join\(ROOT[^)]*\))/g),
    ];
    expect(destructive.map((m) => m[1] ?? "")).toEqual([]);
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

/**
 * NO TRACKED FILE MOVES WHILE THE RELEASE SUITES RUN BESIDE EACH OTHER.
 *
 * ## Why this is not covered by a before/after comparison
 *
 * The defect was a WINDOW, not a state. `staged-module.test.ts` deleted the
 * tracked `scripts/release/secret-patterns.json` and restored it, so the tree
 * was byte-identical afterwards and every check that ran when the file was
 * finished saw nothing. What could see it was another suite staging or scanning
 * the repository during those few hundred milliseconds — under four workers,
 * exactly what happens.
 *
 * So this runs the release-critical suites TOGETHER, in both orders, while a
 * sampler watches the tracked digest throughout. A single differing sample is
 * a failure, and it names the interval rather than the end state.
 */
describe("the release suites do not disturb the tree they measure", () => {
  const ROOT_DIR = join(import.meta.dirname, "..", "..");
  const VITEST = join(ROOT_DIR, "node_modules", "vitest", "vitest.mjs");

  /*
   * THE SUITES THAT TOUCH THE RELEASE TREE. `staged-module` is the one that
   * used to mutate it; the other two stage, scan and build beside it, which is
   * what made the mutation dangerous rather than merely untidy.
   */
  const SUITES = [
    "supabase/test/staged-module.test.ts",
    "supabase/test/release-operation.test.ts",
    "supabase/test/gate-evidence.test.ts",
  ];

  /* This case runs the suites itself; it must not recurse into its own file. */
  const CHILD = "OBSERVER_TREE_WATCH_CHILD";

  /**
   * The WHOLE tracked digest, before and after.
   *
   * Expensive — it reads every tracked file — so it is taken twice, not on a
   * timer. Sampling it every hundred milliseconds would spend more of the run
   * hashing than the suites spend working, and would distort the very timing
   * the case is about.
   */
  const wholeTree = (): string => trackedBytesDigest(ROOT_DIR);

  /**
   * The release directories, cheaply, ON A TIMER.
   *
   * This is the half a before/after comparison cannot make. A delete-and-
   * restore leaves the tree byte-identical at the end and is visible only WHILE
   * it is happening, so something has to look during the run — and it has to be
   * cheap enough to look often. Everything a release suite could plausibly
   * write to lives under these two directories.
   */
  const watched = ["scripts/release", "docs/release"];
  const sample = (): string => {
    const h = createHash("sha256");
    for (const dir of watched) {
      for (const name of readdirSync(join(ROOT_DIR, dir)).sort()) {
        const path = join(ROOT_DIR, dir, name);
        h.update(`${dir}/${name}\u0000`);
        try {
          h.update(readFileSync(path));
        } catch {
          h.update("UNREADABLE-DURING-RUN");
        }
        h.update("\u0000");
      }
    }
    return h.digest("hex");
  };

  it.each([
    ["declared order", SUITES],
    ["reverse order", [...SUITES].reverse()],
  ])(
    "leaves every tracked byte untouched throughout, in %s",
    async (_order, suites) => {
      /* The child run of these suites must not re-enter this case. */
      if (process.env[CHILD] === "1") return;
      const before = wholeTree();
      const firstSample = sample();
      const samples: string[] = [];
      let running = true;

      const sampler = (async (): Promise<void> => {
        while (running) {
          samples.push(sample());
          await new Promise((r) => setTimeout(r, 100));
        }
      })();

      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              VITEST,
              "run",
              ...suites,
              "--testNamePattern",
              "^(?!.*untouched throughout).*",
              /*
               * BOUNDED, because this runs INSIDE a four-worker suite. Eight
               * workers between parent and child is the load that made a
               * worker miss its own onTaskUpdate deadline last milestone, and
               * a regression test is not worth reintroducing that.
               */
              "--maxWorkers=2",
              "--minWorkers=2",
            ],
            {
              cwd: ROOT_DIR,
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, [CHILD]: "1" },
            },
          );
          /* Captured, so a failure here names what failed rather than a number. */
          let log = "";
          child.stdout?.on("data", (c: Buffer) => (log += c.toString()));
          child.stderr?.on("data", (c: Buffer) => (log += c.toString()));
          child.on("error", reject);
          child.on("exit", (code) => {
            if (code === 0) resolve();
            else
              reject(
                new Error(`the suites exited ${String(code)}:
${log.slice(-4000)}`),
              );
          });
        });
      } finally {
        running = false;
        await sampler;
      }

      expect(wholeTree()).toBe(before);
      /*
       * AND EVERY SAMPLE IN BETWEEN. A delete-and-restore is invisible to a
       * before/after comparison by construction; it is visible only here.
       */
      expect(samples.length).toBeGreaterThan(10);
      expect([...new Set(samples)]).toEqual([firstSample]);
    },
    600_000,
  );
});
