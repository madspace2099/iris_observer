import { describe, expect, it } from "vitest";
import type { OverviewQuery, Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

import { DEFAULT_LANGUAGE } from "@observer/readmodels";
/**
 * No project reports more sales inside the period than it has made in total.
 *
 * ## Why this is a list of projects and not one assertion
 *
 * `soldInPeriod` was the literal `7` for every observed project with a
 * non-empty catalogue. Seven is Northgate's scenario figure. Ister Tower sold
 * three flats and reported seven of them in the period; Kingsford Yard — a
 * different tenant, and a scheme that exists in this world precisely because
 * "almost nothing moved yet" — sold none and reported seven. Two surfaces draw
 * the sentence, so two screens said something arithmetically impossible.
 *
 * The comment above the literal named the failure exactly ("rather than
 * inheriting Northgate's number by default") and then guarded the empty
 * catalogue, which is the one project the number could never reach. A reason
 * can be present, well written, and watching the wrong edge — so the guard is
 * not a comment this time, and it walks every project the repository holds
 * rather than the three somebody remembered.
 */

const PROJECTS = [
  { tenant: "alpha", project: "ister-tower", viewer: "developer" },
  { tenant: "alpha", project: "northgate", viewer: "developer" },
  { tenant: "alpha", project: "riverside", viewer: "developer" },
  { tenant: "beta", project: "kingsford", viewer: "agencyManager" },
] as const;

function query(
  viewerKey: (typeof PROJECTS)[number]["viewer"],
  t: string,
  p: string,
): OverviewQuery {
  return {
    viewer: VIEWERS[viewerKey] as Viewer,
    tenantSlug: t,
    projectSlug: p,
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  };
}

describe("sold in the period, against sold in total", () => {
  const repo = new SyntheticObserverRepository();

  it.each(PROJECTS)("$tenant/$project", async ({ tenant, project, viewer }) => {
    const { totals } = await repo.getProjectPulse(query(viewer, tenant, project));

    if (totals.soldInPeriod === null) return;

    expect(
      totals.soldInPeriod,
      `${tenant}/${project} reports ${totals.soldInPeriod} sold in the period out of ${totals.sold} sold in all`,
    ).toBeLessThanOrEqual(totals.sold);
  });

  it("every project the repository can reach, not only the four named above", async () => {
    /*
     * The list is the scope, and a list can go stale. This walks the port so a
     * project added later is covered without anybody remembering to add it —
     * and it asserts the walk found something, because a loop over an empty
     * list passes while proving nothing.
     */
    const impossible: string[] = [];
    let reached = 0;

    for (const viewer of Object.values(VIEWERS) as Viewer[]) {
      for (const tenant of await repo.listTenants(viewer)) {
        for (const p of await repo.listProjects(viewer, tenant.id)) {
          reached += 1;
          const { totals } = await repo.getProjectPulse({
            viewer,
            tenantSlug: tenant.slug,
            projectSlug: p.slug,
            period: "quarter_to_date",
            language: DEFAULT_LANGUAGE,
          });
          if (totals.soldInPeriod !== null && totals.soldInPeriod > totals.sold) {
            const line = `${tenant.slug}/${p.slug}: ${totals.soldInPeriod} in the period, ${totals.sold} in all`;
            /* A project reachable by two roles is one project, not two. */
            if (!impossible.includes(line)) impossible.push(line);
          }
        }
      }
    }

    expect(reached, "the walk reached no project, so it proved nothing").toBeGreaterThan(0);
    expect(impossible, "a project reports more sales in the period than it has made").toEqual([]);
  });
});

describe("whose figure it is", () => {
  const repo = new SyntheticObserverRepository();

  it("Northgate keeps the figure its scenario states", async () => {
    const { totals } = await repo.getProjectPulse(query("developer", "alpha", "northgate"));
    expect(totals.soldInPeriod).toBe(7);
  });

  /*
   * Riverside is on this list because the mutation put it there.
   *
   * Restoring the inheritance failed five assertions and passed three, and
   * Riverside was one of the three: it has eight sales in all, so seven in the
   * period satisfies `soldInPeriod <= sold` and the arithmetic guard sees
   * nothing wrong. Only naming the projects whose scenario states no figure
   * catches a number that is impossible for the scheme rather than impossible
   * in itself. Two assertions, two different halves — which is why a mutation
   * is read by WHICH assertion failed and not by whether the test went red.
   */
  it.each([
    { tenant: "alpha", project: "ister-tower", viewer: "developer" },
    { tenant: "alpha", project: "riverside", viewer: "developer" },
    { tenant: "beta", project: "kingsford", viewer: "agencyManager" },
  ] as const)("$project states none, and gets none rather than Northgate's", async (p) => {
    const { totals } = await repo.getProjectPulse(query(p.viewer, p.tenant, p.project));

    /*
     * `null` and not nought. "We did not observe how many sold in this window"
     * and "none sold in this window" are different sentences, and the three
     * surfaces that read this word the first one.
     */
    expect(totals.soldInPeriod).toBeNull();
  });
});
