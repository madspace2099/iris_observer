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

/**
 * WHAT THIS EXPECTS, STATED SO IT CAN BE DISAGREED WITH.
 *
 * The Briefing leads with the rank-1 state's title whenever any state is
 * raised. Its button is the state's own action when the state has one, and the
 * register of warnings when it does not. "Clear" only when no check is raised
 * at all.
 *
 * The previous version of this file expected something else, and the difference
 * is the point. It allowed: *a project with four raised states, one of them a
 * warning at rank 1, may correctly say that nothing needs a decision, provided
 * that warning has no link.* Nobody would sign that sentence, and nobody was
 * asked to — a mutation proved the test could fail, which was read as proof
 * that it guarded the right thing. It does not follow, and it did not.
 *
 * So what this one ALLOWS is written down too: a leading state with no action
 * of its own may send the reader to `/attention` rather than to itself. That is
 * a real door — every role that can open the Briefing can open that register,
 * checked against `SURFACES` and identical on both — and the button says where
 * it goes rather than repeating "Look at it" over a different destination.
 */
describe("the Briefing leads with whatever the attention screen ranked first", () => {
  it.each(PROJECTS)("%s/%s", async (tenantSlug, projectSlug) => {
    const q = query(tenantSlug, projectSlug);
    const [home, attention] = await Promise.all([repo.getHome(q), repo.getAttention(q)]);

    const leading = actionWorthTaking(attention);

    if (leading === null) {
      /* Nothing raised. The only condition that earns the word "Clear". */
      expect(home.alert).toBeNull();
      return;
    }

    expect(home.alert).not.toBeNull();
    expect(home.alert?.text).toBe(leading.alert.title);

    if (leading.alert.actionHref === null) {
      /*
       * No action of its own, so the register — and the label has to say so.
       * A reader told "Look at it" who lands on a list has been misled by one
       * word, which is cheaper to prevent here than to explain there.
       */
      expect(home.alert?.href).toBe(`/${tenantSlug}/${projectSlug}/attention`);
      expect(home.alert?.actionLabel).not.toBe("Look at it");
    } else {
      expect(home.alert?.href).toBe(leading.alert.actionHref);
    }
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
