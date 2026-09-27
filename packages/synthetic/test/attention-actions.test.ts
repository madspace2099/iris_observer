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
