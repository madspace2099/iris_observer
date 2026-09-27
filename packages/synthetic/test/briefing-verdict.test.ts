import { describe, expect, it } from "vitest";
import { hasProgressed, outcomeIsUnknown, type ShowroomSession } from "@observer/contracts";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";
import { VIEWERS, showroomSessions, syntheticRepository } from "../src";
import { buildAttention } from "../src/showroom/attention";
import { buildHome } from "../src/showroom/views3";

/**
 * THE BRIEFING'S VERDICT: ONE WINDOW, AND NONE BELOW THE SAMPLE.
 *
 * Decided 2026-09-27. The sentence named a month's meetings beside the whole
 * period's progression ("32 meetings this month … 40% progressing", where
 * Sales Flow gave the month 45%). And the signal read "on course" with no
 * earlier period at all, from thresholds nobody had named — four meetings
 * were enough.
 *
 * Expected rates come from the fixture between dates written out here, not
 * from the bucketing under test.
 */
const query = (period: "quarter_to_date" | "last_quarter" | "year_to_date") => ({
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period,
  language: DEFAULT_LANGUAGE,
});

const between = (from: string, to: string): readonly ShowroomSession[] =>
  showroomSessions().filter(
    (s) =>
      s.projectId === "prj_northgate01" &&
      Date.parse(s.startedAt) >= Date.parse(from) &&
      Date.parse(s.startedAt) <= Date.parse(to),
  );

const rateOf = (sessions: readonly ShowroomSession[]) => {
  const recorded = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  return recorded.filter((s) => hasProgressed(s.outcome)).length / recorded.length;
};
const pct = (x: number) => `${String(Math.round(x * 100))}%`;

/* The synthetic world's day is Monday 24 August 2026, in Bratislava (UTC+2). */
const AUGUST = between("2026-08-01T00:00:00+02:00", "2026-08-24T23:59:59.999+02:00");
const JULY_FIRST_24_DAYS = between("2026-07-01T00:00:00+02:00", "2026-07-24T23:59:59.999+02:00");

describe("the Briefing's sentence", () => {
  it("states the progression of the window whose meetings it counts", async () => {
    const home = await syntheticRepository.getHome(query("quarter_to_date"));
    expect(home.because).toContain(`${String(AUGUST.length)} meetings this month`);
    expect(home.because).toContain(
      `${pct(rateOf(AUGUST))} of the recorded meetings this month progressing against ${pct(
        rateOf(JULY_FIRST_24_DAYS),
      )} last month`,
    );
  });
});

describe("the Briefing's verdict", () => {
  it("gives none with no earlier period to compare against", async () => {
    for (const period of ["last_quarter", "year_to_date"] as const) {
      const home = await syntheticRepository.getHome(query(period));
      expect(home.signal, period).toBe("no_verdict");
      expect(home.verdict, period).toBe(
        "There is no earlier period to compare against, so there is no verdict.",
      );
    }
  });

  it(`gives none below ${String(AGENT_MIN_SAMPLE)} recorded outcomes, however they lean`, async () => {
    const home = await syntheticRepository.getHome(query("quarter_to_date"));
    const { context } = home;
    const today = new Date(context.generatedAt);
    /* Four meetings this month, every one progressed, against a full baseline. */
    const four = AUGUST.filter((s) => hasProgressed(s.outcome)).slice(0, 4);
    expect(four).toHaveLength(4);
    const previous = between("2026-04-01T00:00:00+02:00", "2026-05-24T23:59:59.999+02:00");
    const small = buildHome(
      context,
      [...JULY_FIRST_24_DAYS, ...four],
      previous,
      today,
      buildAttention(context, four, previous),
    );
    expect(small.signal).toBe("no_verdict");
    expect(small.verdict).toBe(
      `4 recorded outcomes this month; ${String(AGENT_MIN_SAMPLE)} needed for a verdict.`,
    );
  });
});
