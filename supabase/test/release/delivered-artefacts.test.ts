import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { RED_GATE_ATTEMPTS } from "../../../scripts/release/facts";
import {
  DEPLOYMENTS,
  INVENTORY_RECORDED_IN,
  DELIVERED_ARCHIVES,
} from "../../../scripts/release/live-snapshot";

/**
 * A RELEASE SUITE: it needs the prepared release workspace, and runs only under
 * `pnpm test:release`.
 *
 * What the evidence says about deliveries, checked against the delivered archives
 * in `_review/` and the gate records in `.release/`, both gitignored: this
 * machine's record of what was handed over. The declarations themselves are
 * checked portably in `../artefact-consistency.test.ts`.
 *
 * Everything under `supabase/test/release/` is excluded from `pnpm test` and
 * from CI by its location, not by a flag (`vitest.release.config.ts`). Moved
 * here on 2026-09-27 from the portable suite, where a fresh clone could never
 * pass it: see `docs/23-phase2-acceptance.md` on the two numbers.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");

describe("the deployment inventory's provenance, against the archives on disk", () => {
  const archives = existsSync(join(ROOT, "_review"))
    ? readdirSync(join(ROOT, "_review")).filter((f) => f.endsWith(".zip"))
    : [];

  /*
   * Checked over the DECLARED bundles only, and only those whose archive
   * happens to be on this machine.
   *
   * Not over every `.zip` in `_review/`: that directory also accumulates the
   * intermediate archives a packaging session writes on the way to the one that
   * is actually handed over, and an unshipped build artefact is not a delivery.
   * An absent archive is passed over rather than failed, because packaging must
   * never depend on an earlier ZIP nobody declared as an input — that was one of
   * the reasons the documented rebuild could not be run twice.
   */
  const present = INVENTORY_RECORDED_IN.filter((b) =>
    archives.includes(`IRIS-Observer-${b}-review.zip`),
  );

  const inventoryOf = (bundle: string): string | null => {
    let text = "";
    try {
      text = execFileSync(
        "unzip",
        [
          "-p",
          join(ROOT, "_review", `IRIS-Observer-${bundle}-review.zip`),
          "COMPATIBILITY-EVIDENCE.txt",
        ],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
    } catch {
      return null;
    }
    /*
     * BOTH HEADINGS, because the heading changed and this did not.
     *
     * The section used to be "EVERY READY VERCEL DEPLOYMENT, BY SHA" and was
     * renamed to say the reading is HISTORICAL rather than current — a correct
     * change, and it silently broke this extractor for every archive built
     * afterwards: the regex matched nothing, `inventoryOf` returned null, and
     * the case reported "no readable inventory" for a bundle whose table was
     * perfectly intact.
     *
     * An extractor pinned to prose is a check that a rename can disable, so it
     * accepts either wording and the case would fail loudly if a future one
     * appeared.
     */
    const section =
      /EVERY (?:READY VERCEL DEPLOYMENT|VERCEL DEPLOYMENT READY)[\s\S]*?NOT DEPLOYED/.exec(
        text,
      )?.[0] ?? "";
    const urls = section.match(/iris-observer-[a-z0-9]+-/g) ?? [];
    return urls.length > 0 ? urls.join(",") : null;
  };

  /*
   * UNCONDITIONAL, and compared against the DECLARATION rather than pairwise.
   *
   * These were two `it.runIf` tests, gated on how many delivered archives
   * happened to be in this machine's gitignored `_review/` — so the suite's
   * skipped count moved with the contents of a directory that is not in the
   * repository. Comparing each present archive against `DEPLOYMENTS` needs no
   * second archive to compare with, so the guard is gone and the check is
   * stronger: pairwise equality was satisfied by two bundles that agreed with
   * each other and disagreed with the recorded snapshot.
   */
  it("every delivered bundle on disk records the declared deployment inventory", () => {
    let checked = 0;
    let reference: string | null = null;
    for (const bundle of present) {
      const inventory = inventoryOf(bundle);
      expect(inventory, `${bundle} has no readable inventory`).toBeTruthy();
      expect((inventory ?? "").split(","), bundle).toHaveLength(DEPLOYMENTS.length);
      if (reference === null) reference = inventory;
      else expect(inventory, bundle).toBe(reference);
      checked += 1;
    }
    expect(checked, "no delivered archive was available to check").toBeGreaterThan(0);
  });

  it("those declared hashes match the archives that are on disk", () => {
    /*
     * The declaration is what packaging uses, so it must not drift from the
     * files it names. Any archive that is missing is skipped, not assumed.
     */
    let checked = 0;
    for (const a of DELIVERED_ARCHIVES) {
      const path = join(ROOT, "_review", `IRIS-Observer-${a.bundle}-review.zip`);
      if (!existsSync(path)) continue;
      expect(createHash("sha256").update(readFileSync(path)).digest("hex"), a.bundle).toBe(
        a.sha256,
      );
      checked += 1;
    }
    expect(checked, "no delivered archive was available to check").toBeGreaterThan(0);
  });
});

describe("the red gate attempts the evidence names", () => {
  it("are records this workspace holds", () => {
    for (const attempt of RED_GATE_ATTEMPTS) {
      expect(existsSync(join(ROOT, attempt.record)), attempt.record).toBe(true);
    }
  });
});
