import { describe, expect, it } from "vitest";
import type { PeriodPreset } from "@observer/readmodels";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * A RAISED STATE OPENS THE MEETINGS IT COUNTS.
 *
 * "Meetings ending without a recorded outcome" said nine of 74 and its action
 * opened the whole register, 74 rows. It now opens the register filtered to
 * the outcome it names, and the list holds as many rows as the card counts —
 * on every project and period where the state is raised.
 */
const repo = new SyntheticObserverRepository();
const CELLS: ReadonlyArray<readonly [string, string]> = [
  ["alpha", "northgate"],
  ["alpha", "ister-tower"],
  ["beta", "kingsford"],
];
const PERIODS: readonly PeriodPreset[] = [
  "last_28_days",
  "quarter_to_date",
  "last_quarter",
  "year_to_date",
];
const TITLE = "Meetings ending without a recorded outcome";

describe("the unrecorded-outcome state's action", () => {
  it("opens a register of exactly the meetings it counts", async () => {
    let raised = 0;
    for (const [tenantSlug, projectSlug] of CELLS) {
      for (const period of PERIODS) {
        const query = {
          viewer: VIEWERS.agencyManager,
          tenantSlug,
          projectSlug,
          period,
          language: DEFAULT_LANGUAGE,
        } as const;
        const state = (await repo.getAttention(query)).states.find((s) => s.alert.title === TITLE);
        if (state === undefined) continue;
        raised += 1;
        const where = `${projectSlug} ${period}`;
        expect(state.alert.actionHref, where).toBe(
          `/${tenantSlug}/${projectSlug}/meetings?outcome=skipped`,
        );
        const register = await repo.getMeetings(query, {
          agentId: null,
          channel: null,
          outcome: "skipped",
        });
        expect(register.rows.length, where).toBe(state.alert.evidence?.observationCount);
      }
    }
    expect(raised, "the state was never raised, so nothing was measured").toBeGreaterThan(0);
  });
});

/*
 * AN ACTION THAT SAYS "THOSE" OPENS THOSE.
 *
 * "Units shortlisted with no follow-up recorded" counted 41 of 67 and offered
 * "Open those meetings", which opened the whole register: 74 rows. The register
 * has no filter for that set, so the action now says what it opens. Any label
 * promising "those" must open a register holding exactly the rows counted.
 */
describe("an action that promises the counted meetings", () => {
  it("opens exactly them, or does not promise them", async () => {
    let checked = 0;
    for (const [tenantSlug, projectSlug] of CELLS) {
      for (const period of PERIODS) {
        const query = {
          viewer: VIEWERS.agencyManager,
          tenantSlug,
          projectSlug,
          period,
          language: DEFAULT_LANGUAGE,
        } as const;
        for (const state of (await repo.getAttention(query)).states) {
          const { actionLabel, actionHref, evidence } = state.alert;
          if (actionLabel === null || actionHref === null || !/\bthose\b/i.test(actionLabel)) {
            continue;
          }
          checked += 1;
          const outcome = new URL(actionHref, "http://observer.test").searchParams.get("outcome");
          const register = await repo.getMeetings(query, {
            agentId: null,
            channel: null,
            outcome: outcome as never,
          });
          expect(register.rows.length, `${projectSlug} ${period} ${state.alert.title}`).toBe(
            evidence?.observationCount,
          );
        }
      }
    }
    // No label promises "those" today; the rule stands for the next one that does.
    void checked;
  });

  it("names the register it opens for the shortlisted follow-up state", async () => {
    const state = (
      await repo.getAttention({
        viewer: VIEWERS.agencyManager,
        tenantSlug: "alpha",
        projectSlug: "northgate",
        period: "quarter_to_date",
        language: DEFAULT_LANGUAGE,
      })
    ).states.find((s) => s.alert.title === "Units shortlisted with no follow-up recorded");
    expect(state?.alert.actionHref).toBe("/alpha/northgate/meetings");
    expect(state?.alert.actionLabel).toBe("Open the meeting register");
  });
});
