import { describe, expect, it } from "vitest";
import { PROJECTS, TENANTS, VIEWERS } from "../src/world";
import { syntheticRepository } from "../src/repository";
import { sessionsForProject, showroomSessions } from "../src/showroom/sessions";
import type { PeriodPreset, Viewer } from "@observer/readmodels";

/**
 * Tenant and project isolation.
 *
 * Every one of these failed before the datasets were separated: the generator
 * stamped one hard-coded project id onto every session and `sessionsInPeriod`
 * filtered on dates alone, so Northgate, Riverside and Kingsford rendered the
 * same presentation counts, the same progression rate, the same unit demand and
 * the same agent results.
 *
 * A demonstration that shows one developer another developer's figures is worse
 * than one that shows nothing, because the reader has no way to tell.
 */

/*
 * `VIEWERS` is a record keyed by role, not a list.
 *
 * Looked up by display name anyway, because that is what the assertions below
 * read as — "Petra cannot see Kingsford" is a sentence about a person, and a
 * test that says `VIEWERS.developer` makes the reader hold the mapping in their
 * head while checking a boundary.
 */
function viewer(name: string): Viewer {
  const found = Object.values(VIEWERS).find((v) => v.displayName === name);
  if (found === undefined) throw new Error(`No viewer named ${name}`);
  return found as Viewer;
}

const PERIOD: PeriodPreset = "quarter_to_date";

function query(v: Viewer, tenantSlug: string, projectSlug: string) {
  return { viewer: v, tenantSlug, projectSlug, period: PERIOD };
}

describe("every session belongs to exactly one project", () => {
  it("stamps a real project id, not a placeholder", () => {
    const known = new Set(PROJECTS.map((p) => p.id as string));
    const stamped = new Set(showroomSessions().map((s) => s.projectId));

    for (const id of stamped) {
      expect(known.has(id), `${id} is not a project in this world`).toBe(true);
    }
  });

  it("gives every project its own sessions", () => {
    const byProject = new Map<string, number>();
    for (const s of showroomSessions()) {
      byProject.set(s.projectId, (byProject.get(s.projectId) ?? 0) + 1);
    }
    // Every project in the world has data of its own. A project with none is a
    // project whose screens will borrow someone else's.
    for (const project of PROJECTS) {
      expect(
        byProject.get(project.id as string) ?? 0,
        `${project.slug} has no sessions`,
      ).toBeGreaterThan(0);
    }
  });

  it("never lets one meeting id appear under two projects", () => {
    const owner = new Map<string, string>();
    for (const s of showroomSessions()) {
      const existing = owner.get(s.meetingId);
      expect(existing === undefined || existing === s.projectId).toBe(true);
      owner.set(s.meetingId, s.projectId);
    }
  });
});

describe("two projects under one developer do not share records", () => {
  const petra = viewer("Petra Novák");

  it("reports different presentation counts", async () => {
    const northgate = await syntheticRepository.getHome(query(petra, "alpha", "northgate"));
    const riverside = await syntheticRepository.getHome(query(petra, "alpha", "riverside"));

    expect(northgate.meetingCount).not.toBe(riverside.meetingCount);
  });

  it("reports different figures, not just a different count", async () => {
    const northgate = await syntheticRepository.getHome(query(petra, "alpha", "northgate"));
    const riverside = await syntheticRepository.getHome(query(petra, "alpha", "riverside"));

    /*
     * The whole opening screen must differ.
     *
     * Not the verdict sentence, though — two projects may honestly both need a
     * look, and asserting that they never agree would be asserting noise.
     */
    expect(JSON.stringify(northgate.figures)).not.toBe(JSON.stringify(riverside.figures));
    expect(northgate.because).not.toBe(riverside.because);
  });

  it("draws unit demand from its own building", async () => {
    const northgate = await syntheticRepository.getUnitAttention(
      query(petra, "alpha", "northgate"),
      null,
    );
    const riverside = await syntheticRepository.getUnitAttention(
      query(petra, "alpha", "riverside"),
      null,
    );

    const codes = (rows: readonly { unitCode: string }[]) => rows.map((r) => r.unitCode).join(",");
    expect(codes(northgate.rows)).not.toBe(codes(riverside.rows));
  });

  it("changes the evidence bundle when the project changes", async () => {
    const northgate = await syntheticRepository.getSessionSlice(query(petra, "alpha", "northgate"));
    const riverside = await syntheticRepository.getSessionSlice(query(petra, "alpha", "riverside"));

    const ids = (slice: { sessions: readonly { meetingId: string }[] }) =>
      new Set(slice.sessions.map((s) => s.meetingId));

    const a = ids(northgate);
    const b = ids(riverside);
    for (const id of a) expect(b.has(id), `${id} appears in both projects`).toBe(false);
  });
});

describe("two developers do not share records", () => {
  const petra = viewer("Petra Novák");
  const tomas = Object.values(VIEWERS).find((v) => v.role === "agency_manager");

  it("keeps Kingsford's figures out of Northgate", async () => {
    expect(tomas).toBeDefined();
    const alpha = await syntheticRepository.getHome(query(petra, "alpha", "northgate"));
    const beta = await syntheticRepository.getHome(query(tomas as Viewer, "beta", "kingsford"));

    expect(alpha.meetingCount).not.toBe(beta.meetingCount);
  });

  it("refuses a project the viewer does not hold", async () => {
    // Petra is Alpha's developer. Beta's project is not hers to read, and the
    // repository must raise rather than return an empty, plausible-looking page.
    await expect(syntheticRepository.getHome(query(petra, "beta", "kingsford"))).rejects.toThrow();
  });

  it("keeps identical slugs in different tenants apart", async () => {
    // `alpha` and `beta` both resolve a project by slug; the tenant must be
    // part of the lookup, or one developer's slug reaches the other's data.
    const northgate = PROJECTS.find((p) => p.slug === "northgate");
    const kingsford = PROJECTS.find((p) => p.slug === "kingsford");
    expect(northgate?.tenantId).not.toBe(kingsford?.tenantId);
    expect(TENANTS.length).toBeGreaterThan(1);
  });
});

describe("missing data is stated, never borrowed and never zero", () => {
  const petra = viewer("Petra Novák");

  it("says Riverside has no CRM rather than reporting nil outcomes", async () => {
    const project = PROJECTS.find((p) => p.slug === "riverside");
    expect(project?.connectedSources).not.toContain("crm");

    const flow = await syntheticRepository.getSalesFlow(query(petra, "alpha", "riverside"));
    /*
     * Without a CRM there is no outcome to report.
     *
     * The wrong answer is 0% progressed, which reads as "nobody progressed"
     * when the truth is "nothing recorded it". Every outcome must fall into the
     * unknown bucket.
     */
    const recorded = flow.outcomes
      .filter((o) => o.outcome !== "skipped")
      .reduce((a, o) => a + o.count, 0);
    expect(recorded).toBe(0);

    // And the opening screen must say so rather than printing 0%.
    const home = await syntheticRepository.getHome(query(petra, "alpha", "riverside"));
    const rate = home.figures.find((f) => f.id === "progressed");
    expect(rate?.value).not.toBe("0%");
    expect(rate?.better).toBe("neither");
    expect(home.because).toMatch(/no progression rate can be computed/i);
  });

  it("does not invent a previous period for a project that has none", async () => {
    const tomas = Object.values(VIEWERS).find((v) => v.role === "agency_manager") as Viewer;
    const home = await syntheticRepository.getHome(query(tomas, "beta", "kingsford"));
    // Three weeks live. "0% in the previous period" would be a measurement of
    // a period that does not exist.
    const rate = home.figures.find((f) => f.id === "progressed");
    expect(rate?.against).not.toMatch(/in the previous period/i);
  });

  it("suppresses a verdict on Kingsford for want of sample", async () => {
    const tomas = Object.values(VIEWERS).find((v) => v.role === "agency_manager") as Viewer;
    const home = await syntheticRepository.getHome(query(tomas, "beta", "kingsford"));

    // Three weeks live. A confident verdict on this much data would be a lie.
    expect(home.meetingCount).toBeLessThan(60);
  });
});

/* --- one page, one set of meetings ------------------------------------------ */

describe("figures read together count the same meetings", () => {
  /*
   * The briefing said "I reviewed 74 showroom presentations quarter to date"
   * and the Ask Observer answer beneath it said "Measured across 73 meetings",
   * on the same screen, about the same period. `getHome` read `throughToday`
   * and `getShowroomOverview` read `current`, and on a to-date period those
   * differ by whatever happened today.
   *
   * The Sales Flow page reads `getSalesFlow` and `getShowroomOverview`
   * together, so it carried both numbers for the same reason.
   */
  for (const [tenantSlug, projectSlug] of [
    ["alpha", "northgate"],
    ["alpha", "riverside"],
  ] as const) {
    it(`agrees between the briefing and the period summary on ${projectSlug}`, async () => {
      const query = {
        viewer: VIEWERS.developer,
        tenantSlug,
        projectSlug,
        period: "quarter_to_date" as const,
      };
      const home = await syntheticRepository.getHome(query);
      const overview = await syntheticRepository.getShowroomOverview(query);

      expect(overview.meetingCount).toBe(home.meetingCount);
    });

    it(`agrees between the sales flow and the period summary on ${projectSlug}`, async () => {
      const query = {
        viewer: VIEWERS.developer,
        tenantSlug,
        projectSlug,
        period: "quarter_to_date" as const,
      };
      const flow = await syntheticRepository.getSalesFlow(query);
      const overview = await syntheticRepository.getShowroomOverview(query);

      expect(overview.meetingCount).toBe(flow.meetingCount);
    });
  }
});

/* --- a first period is not a bad period ------------------------------------- */

describe("a project with no history claims no comparison", () => {
  /*
   * Kingsford has been selling three weeks, so "last month" is a month in
   * which it did not exist. The briefing read "41 meetings this month against
   * 0 last month" — arithmetically true, and inviting exactly the comparison
   * it should not: 41 against nothing is a first period, not growth.
   *
   * The progression figure had already been corrected for this. The volume
   * figure beside it was still making the claim.
   */
  const query = {
    viewer: VIEWERS.agencyManager,
    tenantSlug: "beta",
    projectSlug: "kingsford",
    period: "quarter_to_date" as const,
  };

  it("does not compare volume against a period that does not exist", async () => {
    const home = await syntheticRepository.getHome(query);
    expect(home.because).not.toMatch(/against 0 last (month|week)/i);
    expect(home.because).toMatch(/no earlier period/i);
  });

  it("shows no arrow on a figure with nothing to move from", async () => {
    const home = await syntheticRepository.getHome(query);
    const volume = home.figures.find((f) => f.id === "meetings");

    expect(volume?.against).toMatch(/no earlier period/i);
    expect(volume?.direction).toBe("flat");
    expect(volume?.better).toBe("neither");
  });

  it("still compares volume where a baseline exists", async () => {
    const home = await syntheticRepository.getHome({
      viewer: VIEWERS.developer,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "quarter_to_date" as const,
    });
    const volume = home.figures.find((f) => f.id === "meetings");

    expect(volume?.against).toMatch(/last (month|week)/i);
    expect(volume?.better).toBe("up");
  });
});

/* --- one period, one count -------------------------------------------------- */

describe("every surface counts the same period identically", () => {
  /*
   * There were two slices: `current`, running to the period's stated end, and
   * `throughToday`, running to the end of today. Two slices meant two answers
   * to "how many meetings are in this period", and both reached the screen —
   * the briefing said 74 quarter-to-date while Presentation DNA said 73.
   *
   * `throughToday` also ignored the period's end, so **Last completed quarter
   * reported every meeting in the dataset** on the three surfaces that read it.
   * That one was not a rounding difference: 132 against 58.
   */
  const PRESETS = ["quarter_to_date", "last_28_days", "last_quarter", "year_to_date"] as const;

  for (const period of PRESETS) {
    it(`agrees across surfaces on ${period}`, async () => {
      const query = {
        viewer: VIEWERS.developer,
        tenantSlug: "alpha",
        projectSlug: "northgate",
        period,
      };
      const counts = await Promise.all([
        syntheticRepository.getHome(query).then((v) => v.meetingCount),
        syntheticRepository.getSalesFlow(query).then((v) => v.meetingCount),
        syntheticRepository.getShowroomOverview(query).then((v) => v.meetingCount),
        syntheticRepository.getProjectView(query, null).then((v) => v.meetingCount),
      ]);

      expect(new Set(counts).size, `counts disagree: ${counts.join(", ")}`).toBe(1);
      expect(counts[0]).toBeGreaterThan(0);
    });
  }

  it("does not let a completed period keep growing", async () => {
    const query = {
      viewer: VIEWERS.developer,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "last_quarter" as const,
    };
    const completed = await syntheticRepository.getHome(query);
    const everything = showroomSessions().filter((s) => s.projectId === "prj_northgate01");

    // A finished quarter is history. It cannot contain the whole dataset.
    expect(completed.meetingCount).toBeLessThan(everything.length);
  });
});

/* --- the KPI window is not a back door -------------------------------------- */

describe("the summary window ignores the period, never the project", () => {
  /*
   * `getFlowCharts` passed `showroomSessions()` — every meeting in every
   * project of every tenant — as the set the KPI window reads, because the
   * window must be able to say "all time" without being clipped to the
   * selected period.
   *
   * So Northgate's Sales Flow reported 98 presentations this month above a
   * chart reading 32, and the 98 counted Riverside and Beta Development's
   * Kingsford. A developer was shown a competitor's volume inside their own
   * headline figure, on a page whose route, read model and tool had all been
   * scoped correctly. The isolation tests checked the read models; nothing
   * checked the charts.
   */
  const WINDOWS = ["today", "week", "month", "quarter", "half", "year", "all"] as const;

  async function kpis(tenantSlug: string, projectSlug: string, viewer: Viewer, window: string) {
    const charts = await syntheticRepository.getFlowCharts(
      { viewer, tenantSlug, projectSlug, period: "quarter_to_date" as const },
      window as never,
    );
    return charts.kpis.figures;
  }

  it("never counts more meetings than the project has", async () => {
    const northgate = sessionsForProject("prj_northgate01").length;

    for (const window of WINDOWS) {
      const cards = await kpis("alpha", "northgate", VIEWERS.developer, window);
      const presentations = cards.find((k) => /presentation/i.test(k.label));
      const value = Number(String(presentations?.value ?? "0").replace(/[^0-9]/g, ""));

      expect(
        value,
        `${window} counts ${value} of ${northgate} Northgate meetings`,
      ).toBeLessThanOrEqual(northgate);
    }
  });

  it("gives two projects different summaries", async () => {
    const [north, river] = await Promise.all([
      kpis("alpha", "northgate", VIEWERS.developer, "all"),
      kpis("alpha", "riverside", VIEWERS.developer, "all"),
    ]);

    expect(JSON.stringify(north)).not.toBe(JSON.stringify(river));
  });

  it("never lets one developer's window reach another developer's project", async () => {
    const kingsford = sessionsForProject("prj_beta0000001").length;
    const riverside = sessionsForProject("prj_riversidew1").length;
    const northgate = sessionsForProject("prj_northgate01").length;

    const cards = await kpis("alpha", "northgate", VIEWERS.developer, "all");
    const presentations = cards.find((k) => /presentation/i.test(k.label));
    const value = Number(String(presentations?.value ?? "0").replace(/[^0-9]/g, ""));

    expect(kingsford).toBeGreaterThan(0);
    expect(value).toBe(northgate);
    expect(value).not.toBe(northgate + riverside + kingsford);
  });
});

/* --- the catalogue belongs to the project ----------------------------------- */

describe("a project shows its own stock", () => {
  /*
   * `RAW_CATALOGUE` is a module constant pinned to `prj_northgate01`, and four
   * builders read it directly: the unit list, the segment breakdown, the
   * audience filter and the sales-plan bullet chart.
   *
   * So Riverside Walk and Kingsford Yard both rendered Northgate's
   * forty-eight apartments, with Northgate's sold count against Northgate's
   * target. Beta Development — a different developer — was looking at Alpha's
   * stock, on a page whose route, session data and read model had all been
   * scoped correctly in the previous milestone. The catalogue never was.
   */
  const CASES = [
    ["alpha", "northgate", VIEWERS.developer, /^[ABC]-/],
    ["alpha", "riverside", VIEWERS.developer, /^[RW]-/],
    ["beta", "kingsford", VIEWERS.agencyManager, /^K-/],
  ] as const;

  for (const [tenantSlug, projectSlug, viewer, codePattern] of CASES) {
    it(`${projectSlug} lists only its own units`, async () => {
      const view = await syntheticRepository.getUnitAttention(
        { viewer, tenantSlug, projectSlug, period: "quarter_to_date" as const },
        null,
      );

      expect(view.rows.length).toBeGreaterThan(0);
      for (const row of view.rows) {
        expect(row.unitCode, `${projectSlug} shows ${row.unitCode}`).toMatch(codePattern);
      }
    });
  }

  it("gives three projects three different sales plans", async () => {
    const plans = await Promise.all(
      CASES.map(([tenantSlug, projectSlug, viewer]) =>
        syntheticRepository
          .getProjectCharts({ viewer, tenantSlug, projectSlug, period: "quarter_to_date" as const })
          .then((c) => c.targets.map((t) => `${t.actual}/${t.total}`).join(" ")),
      ),
    );

    expect(new Set(plans).size, `plans: ${plans.join(" | ")}`).toBe(plans.length);
  });

  it("never puts one developer's unit count on another's plan", async () => {
    const [alpha, beta] = await Promise.all([
      syntheticRepository.getProjectCharts({
        viewer: VIEWERS.developer,
        tenantSlug: "alpha",
        projectSlug: "northgate",
        period: "quarter_to_date" as const,
      }),
      syntheticRepository.getProjectCharts({
        viewer: VIEWERS.agencyManager,
        tenantSlug: "beta",
        projectSlug: "kingsford",
        period: "quarter_to_date" as const,
      }),
    ]);

    expect(alpha.targets[0]?.total).not.toBe(beta.targets[0]?.total);
  });
});
