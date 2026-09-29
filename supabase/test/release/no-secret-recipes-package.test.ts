import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanText, inScope } from "../../../scripts/release/secret-recipes";
import { build } from "../../../scripts/release/build-package";
import { openPackageOperation, type TestPackageOperation } from "../support/package-operation";

/**
 * A RELEASE SUITE: it needs the prepared release workspace, and runs only under
 * `pnpm test:release`.
 *
 * A freshly generated package, scanned for a runnable secret recipe. The
 * detector itself is tested portably in `../no-secret-recipes.test.ts`.
 *
 * Everything under `supabase/test/release/` is excluded from `pnpm test` and
 * from CI by its location, not by a flag (`vitest.release.config.ts`). Moved
 * here on 2026-09-27 from the portable suite, where a fresh clone could never
 * pass it: see `docs/23-phase2-acceptance.md` on the two numbers.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : [p];
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
