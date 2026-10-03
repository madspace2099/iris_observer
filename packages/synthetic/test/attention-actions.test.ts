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
});

/*
 * EVERY RAISED CARD OPENS A LIST OF EXACTLY WHAT IT COUNTS (R04-4, FEJEZET1).
 *
 * The read model holds every subject, and the screen names the first five and
 * counts the rest, so the subjects a state carries are the whole of what its
 * detail counts. A unit check opens the register narrowed to those units, and
 * the no-CRM state opens the meeting register for the period, which is every
 * presentation it is about. A silent source is technical diagnostics, kept to
 * an administrator's area by the plan, and has no reader list here.
 *
 * Each project is read by a viewer who holds it: the agency manager does not
 * hold Riverside, the developer holds no Beta project.
 */
const HOLDERS: ReadonlyArray<readonly [string, string, (typeof VIEWERS)[keyof typeof VIEWERS]]> = [
  ["alpha", "northgate", VIEWERS.developer],
  ["alpha", "riverside", VIEWERS.developer],
  ["alpha", "ister-tower", VIEWERS.developer],
  ["beta", "kingsford", VIEWERS.agencyManager],
];
const UNIT_KINDS: readonly string[] = ["demand_dropping", "viewed_never_shortlisted"];

describe("every raised state's list", () => {
  it("holds as many rows as the card counts, and the card opens it", async () => {
    const units: string[] = [];
    let noCrm = 0;
    for (const [tenantSlug, projectSlug, viewer] of HOLDERS) {
      for (const period of PERIODS) {
        const query = {
          viewer,
          tenantSlug,
          projectSlug,
          period,
          language: DEFAULT_LANGUAGE,
        } as const;
        const root = `/${tenantSlug}/${projectSlug}`;
        for (const state of (await repo.getAttention(query)).states) {
          const where = `${projectSlug} ${period} ${state.kind}`;
          if (state.kind === "source_offline") continue;
          if (state.kind === "crm_verification_missing") {
            noCrm += 1;
            expect(state.alert.actionHref, where).toBe(`${root}/meetings`);
            const register = await repo.getMeetings(query, {
              agentId: null,
              channel: null,
              outcome: null,
            });
            expect(register.rows.length, where).toBe(state.alert.evidence?.observationCount);
            continue;
          }
          expect(state.subjects.length, where).toBe(state.alert.evidence?.observationCount);
          if (!UNIT_KINDS.includes(state.kind)) continue;
          units.push(`${where} ${state.subjects.length}`);
          expect(state.alert.actionHref, where).toBe(`${root}/units?check=${state.kind}&shown=all`);
          const codes = (await repo.getUnitAttention(query, null)).rows.map((row) => row.unitCode);
          for (const subject of state.subjects) expect(codes, where).toContain(subject.id);
        }
      }
    }
    expect(
      units.length,
      "no unit check was raised anywhere, so nothing was measured",
    ).toBeGreaterThan(0);
    expect(noCrm, "the no-CRM state was never raised").toBeGreaterThan(0);
  });
});
