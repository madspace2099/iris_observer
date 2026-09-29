import { describe, expect, it } from "vitest";
import type { PeriodPreset } from "@observer/readmodels";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * A FINDING'S NEXT STEP OPENS WHAT THE FINDING NAMES.
 *
 * Sales Flow's "5 of 39 meetings ended with no outcome recorded" offered "See
 * the meetings" and opened all 39; What needs attention's twin state was
 * corrected to the filtered register in 24e573e and this one was missed. And
 * "Compare the cohorts" asked Presentation DNA for `?compare=cohorts`, which
 * it does not read, so it opened the default comparison of two agents.
 */
const repo = new SyntheticObserverRepository();
const PERIODS: readonly PeriodPreset[] = [
  "last_28_days",
  "quarter_to_date",
  "last_quarter",
  "year_to_date",
];
/** The modes `presentation/page.tsx` reads, written out: a test that imported them would agree with anything. */
const PRESENTATION_MODES = ["agents", "cohorts", "periods"];

const query = (period: PeriodPreset, projectSlug = "northgate") =>
  ({
    viewer: VIEWERS.agencyManager,
    tenantSlug: "alpha",
    projectSlug,
    period,
    language: DEFAULT_LANGUAGE,
  }) as const;

describe("Sales Flow's unrecorded-outcome finding", () => {
  it("opens a register of exactly the meetings it counts", async () => {
    let raised = 0;
    for (const period of PERIODS) {
      const finding = (await repo.getSalesFlow(query(period))).findings.find(
        (f) => f.id === "flow-unrecorded",
      );
      if (finding === undefined) continue;
      raised += 1;
      expect(finding.nextStep?.href, period).toBe("/alpha/northgate/meetings?outcome=skipped");
      const register = await repo.getMeetings(query(period), {
        agentId: null,
        channel: null,
        outcome: "skipped",
      });
      expect(register.rows.length, period).toBe(finding.evidence.observationCount);
    }
    expect(raised, "never raised, so nothing was measured").toBeGreaterThan(0);
  });
});

describe("the showroom overview's cohort finding", () => {
  it("asks Presentation DNA for a mode it reads", async () => {
    let seen = 0;
    for (const period of PERIODS) {
      for (const projectSlug of ["northgate", "ister-tower"]) {
        const finding = (await repo.getShowroomOverview(query(period, projectSlug))).findings.find(
          (f) => f.id === "behaviour_outcome_association",
        );
        if (finding === undefined) continue;
        seen += 1;
        const url = new URL(finding.nextStep?.href ?? "", "http://observer.test");
        expect(url.pathname).toMatch(/\/presentation$/);
        expect(PRESENTATION_MODES).toContain(url.searchParams.get("mode"));
        expect(url.searchParams.get("mode")).toBe("cohorts");
      }
    }
    expect(seen, "never raised, so nothing was measured").toBeGreaterThan(0);
  });
});
