import { describe, expect, it } from "vitest";
import { actionWorthTaking } from "@observer/readmodels";
import type { OverviewQuery, Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * The Briefing and What needs attention answer from one checklist.
 *
 * ## Why this is a test and not a comment
 *
 * `AttentionState.rank` has said "1-based, severity first and size second.
 * Stated so two surfaces agree" since it was written. It had two readers, and
 * only one of them read it: **What needs attention** listed the ranked states,
 * while **Briefing** scanned presenters for an outcome flag of its own and
 * called the first `concern` it met "the one thing worth acting on".
 *
 * Nothing was visibly wrong. Two computations over the same period agree right
 * up until they do not, and the day they disagree is the day a reader stops
 * believing either screen. So the requirement is not "they show the same thing
 * today" — that is what was already true — but "one of them cannot change
 * without the other". That is a claim about the call graph, and the only honest
 * way to hold it is a test that breaks when the sharing breaks.
 *
 * `actionWorthTaking` is applied here to the attention view directly. If the
 * Briefing ever grows a second opinion, this file fails without anybody having
 * to notice the divergence on screen.
 */

const repo = new SyntheticObserverRepository();

function query(tenantSlug: string, projectSlug: string): OverviewQuery {
  return {
    viewer: VIEWERS.developer as Viewer,
    tenantSlug,
    projectSlug,
    period: "quarter_to_date",
  };
}

/* Three projects, because one agreeing pair could be a coincidence. */
const PROJECTS = [
  ["alpha", "ister-tower"],
  ["alpha", "northgate"],
  ["alpha", "riverside"],
] as const;

describe("the Briefing leads with whatever the attention screen ranked first", () => {
  it.each(PROJECTS)("%s/%s", async (tenantSlug, projectSlug) => {
    const q = query(tenantSlug, projectSlug);
    const [home, attention] = await Promise.all([repo.getHome(q), repo.getAttention(q)]);

    const leading = actionWorthTaking(attention);

    if (leading === null || leading.alert.actionHref === null) {
      /*
       * Nothing raised, or nothing openable.
       *
       * **A KNOWN GAP IS ASSERTED HERE, AND IT IS NOT A DESIRED STATE.** The
       * second half of that condition is the one to distrust: when the
       * highest-ranked state has no `actionHref`, the Briefing falls back to
       * null and draws "Nothing in this period is waiting on a decision from
       * you". On Riverside that sentence sits over four raised states, one of
       * them a warning at rank 1 — the no-CRM branch, which has nowhere to send
       * a reader and so carries no href.
       *
       * P2-02 narrowed the contradiction it set out to close and did not shut
       * it. This assertion describes what the product does today so the test
       * stays honest; it does not endorse it. Closing it is a Briefing change —
       * what to say when the thing worth acting on cannot be opened — and it is
       * recorded as an open item rather than left for this file to bless.
       */
      expect(home.alert).toBeNull();
      return;
    }

    expect(home.alert).not.toBeNull();
    expect(home.alert?.text).toBe(leading.alert.title);
    expect(home.alert?.href).toBe(leading.alert.actionHref);
  });

  it("never leads with a state the attention screen did not raise", async () => {
    /*
     * The direction that matters for trust. A Briefing showing something
     * absent from the attention list is the failure a reader would notice and
     * could not explain, so it is asserted separately from the equality above.
     */
    for (const [tenantSlug, projectSlug] of PROJECTS) {
      const q = query(tenantSlug, projectSlug);
      const [home, attention] = await Promise.all([repo.getHome(q), repo.getAttention(q)]);
      if (home.alert === null) continue;

      const titles = attention.states.map((state) => state.alert.title);
      expect(titles).toContain(home.alert.text);
    }
  });

  it("ranks by the contract's own field rather than by array position", () => {
    /*
     * `actionWorthTaking` reads `rank` instead of taking `states[0]`, so a
     * builder that ranked correctly and emitted out of order cannot hand the
     * two surfaces different leads. Checked against a shuffled copy, since no
     * fixture produces one.
     */
    const view = {
      context: null,
      states: [
        { rank: 3, alert: { title: "third" } },
        { rank: 1, alert: { title: "first" } },
        { rank: 2, alert: { title: "second" } },
      ],
    } as unknown as Parameters<typeof actionWorthTaking>[0];

    expect(actionWorthTaking(view)?.alert.title).toBe("first");
  });
});
