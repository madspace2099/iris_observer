import { describe, expect, it } from "vitest";
import type { PeriodPreset } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

import { DEFAULT_LANGUAGE } from "@observer/readmodels";
/**
 * A LIST CUT WITHOUT SAYING SO, AND A FOOT THAT COUNTS WHAT IS NOT THERE.
 *
 * The unit page's "Meetings that opened it" took the first eight of the
 * meetings that opened the unit and captioned them as all of them ("Meetings
 * in year to date that opened IT-A-12-07.") — photographed on 2026-09-23 with
 * the unit register counting 59. No other surface lists a unit's meetings (the
 * meeting register has no unit filter), so a cut there also made the rest
 * unreachable. The cut is gone: the page lists what the register counts.
 *
 * The agent report's register section, which a developer is not shown, kept
 * its "n = 8 meetings listed" foot under a section drawn blank. A section
 * that lists nothing lists nothing; the foot goes with the rows.
 */

const repo = new SyntheticObserverRepository();
const PERIODS: readonly PeriodPreset[] = ["last_28_days", "year_to_date"];
const PROJECTS = [
  { tenantSlug: "alpha", projectSlug: "northgate" },
  { tenantSlug: "alpha", projectSlug: "ister-tower" },
  { tenantSlug: "beta", projectSlug: "kingsford" },
] as const;

describe("the unit page lists every meeting that opened the unit", () => {
  it("lists as many meetings as the unit register counts for it", async () => {
    const wrong: string[] = [];
    let pastEight = 0;
    for (const where of PROJECTS) {
      for (const period of PERIODS) {
        const query = {
          viewer: VIEWERS.agencyManager,
          ...where,
          period,
          language: DEFAULT_LANGUAGE,
        };
        const register = await repo.getUnitAttention(query, null);
        /* Every unit the cut could bite, and a few it could not, so over-listing is caught too. */
        const opened = register.rows.filter((row) => row.meetings > 0);
        const checked = [
          ...opened.filter((row) => row.meetings > 8),
          ...opened.filter((row) => row.meetings <= 8).slice(0, 3),
        ];
        for (const row of checked) {
          if (row.meetings > 8) pastEight += 1;
          const detail = await repo.getUnitDetail(query, row.unitCode);
          if (detail.relatedMeetings.length !== row.meetings) {
            wrong.push(
              `${where.projectSlug} · ${period} · ${row.unitCode}: the register counts ${row.meetings}, the page lists ${detail.relatedMeetings.length}`,
            );
          }
        }
      }
    }
    // Guards the guard: with no unit past eight meetings, a cut at eight is invisible.
    expect(pastEight, "no unit was opened in more than eight meetings").toBeGreaterThan(0);
    expect(wrong, wrong.slice(0, 8).join("\n")).toEqual([]);
  });

  /*
   * The same page's timeline keeps forty entries, from the most recent meetings
   * first — a busy unit has hundreds — and its note said nothing about it. The
   * cut stays, because a page of hundreds of entries is not a page; the note
   * now says it and out of how many. Every meeting is at least one entry (the
   * unit was opened), so the total can be checked against the register.
   */
  it("says out of how many timeline entries it shows forty", async () => {
    const silent: string[] = [];
    let capped = 0;
    for (const where of PROJECTS) {
      const query = {
        viewer: VIEWERS.agencyManager,
        ...where,
        period: "year_to_date" as const,
        language: DEFAULT_LANGUAGE,
      };
      const register = await repo.getUnitAttention(query, null);
      for (const row of register.rows.filter((r) => r.meetings > 8)) {
        const detail = await repo.getUnitDetail(query, row.unitCode);
        if (detail.timeline.length < 40) continue;
        capped += 1;
        const total = Number(
          /, of ([\d,]+)\./.exec(detail.timelineNote)?.[1]?.replace(/,/g, "") ?? NaN,
        );
        if (!(total > 40 && total >= row.meetings)) {
          silent.push(
            `${where.projectSlug} · ${row.unitCode}: "${detail.timelineNote.slice(-90)}"`,
          );
        }
      }
    }
    expect(
      capped,
      "no unit's timeline reached the cap, so the statement is never needed",
    ).toBeGreaterThan(0);
    expect(silent, silent.slice(0, 5).join("\n")).toEqual([]);
  });
});

describe("a register section left blank counts nothing as listed", () => {
  const where = {
    tenantSlug: "alpha",
    projectSlug: "northgate",
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  } as const;

  it("prints no listed-meetings foot on the section a developer is not shown", async () => {
    const report = await repo.getReportScope(
      { viewer: VIEWERS.developer, ...where },
      { agentId: "agt_lucia" },
    );
    const section = report.sections.find((s) => s.id === "agent-meetings");
    expect(section?.availability).toBe("unavailable");
    expect(section?.sampleSize, "a blank section claims meetings as listed").toBeNull();
  });

  it("and the sales team's section still counts the meetings it lists", async () => {
    const report = await repo.getReportScope(
      { viewer: VIEWERS.agencyManager, ...where },
      { agentId: "agt_lucia" },
    );
    const section = report.sections.find((s) => s.id === "agent-meetings");
    expect(section?.availability).toBe("ready");
    expect(section?.sampleSize ?? 0).toBeGreaterThan(0);
  });
});
