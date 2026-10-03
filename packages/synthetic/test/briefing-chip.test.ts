import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, PERIOD_PRESETS } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * A BRIEFING VERDICT NAMES ITS COMPARISON (R02-1, DONTESEK1, Máté 2026-10-02).
 *
 * Every verdict on the Briefing is a comparison with an earlier window, so the
 * read model says which window and which way both measures moved. Without a
 * verdict there is nothing to name. Read on every project and period the
 * synthetic world holds for the agency manager, who holds both tenants.
 */
const repo = new SyntheticObserverRepository();
const PROJECTS = [
  ["alpha", "northgate"],
  ["alpha", "riverside"],
  ["alpha", "ister-tower"],
  ["beta", "kingsford"],
] as const;

describe("the Briefing chip's comparison", () => {
  it("is named exactly when there is a verdict, and moves the way the signal says", async () => {
    let verdicts = 0;
    for (const [tenantSlug, projectSlug] of PROJECTS) {
      for (const period of PERIOD_PRESETS) {
        const home = await repo
          .getHome({
            viewer: VIEWERS.agencyManager,
            tenantSlug,
            projectSlug,
            period,
            language: DEFAULT_LANGUAGE,
          })
          .catch(() => null);
        if (home === null) continue;
        const where = `${projectSlug} ${period}`;
        /* The sentence makes no course claim: there is no named plan (FEJEZET1). */
        expect(home.verdict, where).not.toMatch(/on course/i);
        if (home.signal === "no_verdict") {
          expect(home.comparedWith, where).toBeNull();
          expect(home.movement, where).toBeNull();
          expect(home.verdict, where).not.toMatch(/^Against /);
          continue;
        }
        verdicts += 1;
        expect(home.comparedWith, where).toMatch(/\S/);
        expect(home.comparedWith, where).not.toMatch(/^in /);
        /* The sentence names the window the chip names. */
        expect(home.verdict, where).toMatch(new RegExp(`^Against ${home.comparedWith}, `));
        if (home.signal === "good") expect(home.movement, where).toBe("above");
        if (home.signal === "poor") expect(home.movement, where).toBe("below");
        if (home.signal === "attention")
          expect(["in_line", "mixed"], where).toContain(home.movement);
      }
    }
    /* The loop proves nothing if the world held no verdict at all. */
    expect(verdicts).toBeGreaterThan(0);
  });
});
