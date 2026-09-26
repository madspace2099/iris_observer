import { describe, expect, it } from "vitest";
import { actionWorthTaking, DEFAULT_LANGUAGE } from "@observer/readmodels";
import type { OverviewQuery, Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * Contract invariants that more than one surface depends on.
 *
 * ## The class this file exists for
 *
 * `AttentionState.rank` said "1-based, severity first and size second. Stated
 * so two surfaces agree" from the day it was written. It had two readers and
 * one of them read it, and for three projects out of four the Briefing printed
 * "Nothing in this period is waiting on a decision from you" while What needs
 * attention raised a warning about the same period. Nothing was broken; nothing
 * had ever held it together.
 *
 * So the defect was never a missing import. It was **a contract stating an
 * invariant with no test behind it**, which is a promise in prose. This file
 * holds the ones that can actually be broken.
 *
 * ## Why only the ones with two or more readers
 *
 * A promise with a single consumer cannot be broken between surfaces, because
 * there is no second surface to disagree with. It is worth writing down and it
 * is not worth a test. The ones below each have two or more, which is what
 * turns a sentence in a docblock into something a reader can catch the product
 * getting wrong.
 */

const repo = new SyntheticObserverRepository();

function query(tenantSlug: string, projectSlug: string): OverviewQuery {
  return {
    viewer: VIEWERS.developer as Viewer,
    tenantSlug,
    projectSlug,
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  };
}

const PROJECTS = [
  ["alpha", "ister-tower"],
  ["alpha", "northgate"],
  ["alpha", "riverside"],
] as const;

/* --- 1. the one this round added, checked before the ones it went looking for --- */

describe("actionWorthTaking picks by the contract's rank", () => {
  /*
   * Checked first on purpose. This function was written yesterday with a
   * docblock that promises something, which is the exact shape the rest of this
   * file is auditing; exempting it would be the failure under a different name.
   * Cross-surface agreement is guarded in `briefing-attention-parity.test.ts`;
   * what is asserted here is the rule itself, against an order no fixture makes.
   */
  it("reads rank rather than array position", () => {
    const view = {
      states: [
        { rank: 2, alert: { title: "second" } },
        { rank: 1, alert: { title: "first" } },
      ],
    } as unknown as Parameters<typeof actionWorthTaking>[0];

    expect(actionWorthTaking(view)?.alert.title).toBe("first");
  });

  it("says nothing when nothing is raised", () => {
    const empty = { states: [] } as unknown as Parameters<typeof actionWorthTaking>[0];
    expect(actionWorthTaking(empty)).toBeNull();
  });
});

/* --- 2. "Must agree with connectedSources on the project" --- */

describe("a source's connected flag agrees with the project's connectedSources", () => {
  /*
   * `ProjectSource.connected` (context.ts) says it "Must agree with
   * `connectedSources` on the project: the same fact told twice that disagrees
   * with itself is worse than the fact being missing."
   *
   * Both sides are hand-written, in two places, per project. Eight screens read
   * `connectedSources` to decide whether to draw a CRM column at all; the
   * project page reads the per-source rows to say which installation is quiet.
   * A project whose rows and list drifted apart would tell one screen the CRM is
   * connected and another that it is not, and each would look right alone.
   */
  it.each(PROJECTS)("%s/%s", async (tenantSlug, projectSlug) => {
    const { context } = await repo.getHome(query(tenantSlug, projectSlug));
    const { project } = context;

    const kindsOfConnectedRows = [
      ...new Set(project.sources.filter((s) => s.connected).map((s) => s.kind)),
    ].sort();
    const declared = [...project.connectedSources].sort();

    expect(kindsOfConnectedRows).toEqual(declared);
  });

  it("holds for a project whose sources are not all connected", async () => {
    /*
     * The direction that matters. Two lists agreeing when everything is
     * connected proves very little — the interesting projects are the ones with
     * a gap, which is also what makes their screens worth reading.
     */
    const withGap: string[] = [];
    for (const [tenantSlug, projectSlug] of PROJECTS) {
      const { context } = await repo.getHome(query(tenantSlug, projectSlug));
      if (context.project.sources.some((s) => !s.connected)) withGap.push(projectSlug);
    }
    expect(withGap.length).toBeGreaterThan(0);
  });
});

/* --- 3. "the same UnitAttentionRow the list returns, built by the same projection" --- */

describe("a unit's page and the unit list agree about the unit", () => {
  /*
   * `UnitDetailView` (screens.ts) says "`attention` below is the same
   * `UnitAttentionRow` the list returns, built by the same projection, so the
   * page and the table cannot disagree about a count."
   *
   * Four client-side consumers read the row type. The claim is about the
   * projection, not the type, and a type cannot hold it: two builders returning
   * the same shape with different numbers satisfy the compiler completely.
   */
  it.each(PROJECTS)("%s/%s", async (tenantSlug, projectSlug) => {
    const q = query(tenantSlug, projectSlug);
    const list = await repo.getUnitAttention(q, null);
    expect(list.rows.length).toBeGreaterThan(0);

    /* A handful is enough to catch a divergent projection, and keeps the run short. */
    for (const row of list.rows.slice(0, 5)) {
      const detail = await repo.getUnitDetail(q, row.unitCode);
      expect(detail.attention).toEqual(row);
    }
  });
});
