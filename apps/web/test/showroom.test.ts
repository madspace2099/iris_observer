import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORE_SECTION_IDS,
  INSIGHT_SOURCES,
  SECTION_IDS,
  hasProgressed,
  isShowroomRooted,
  isUngroundedInterpretation,
  outcomeIsUnknown,
} from "@observer/contracts";
import {
  SYNTHETIC_AGENTS,
  buildLane,
  buildMeetingReplay,
  buildPresentationIntelligence,
  buildShowroomOverview,
  buildStorytelling,
  buildUnitAttention,
  sessionsInPeriod,
  showroomSessions,
} from "@observer/synthetic";
import { syntheticRepository } from "@observer/synthetic";
import { VIEWERS } from "@observer/synthetic";

/**
 * The guards that keep the Showroom Intelligence refocus from eroding.
 *
 * Each of these encodes a decision that would otherwise depend on whoever
 * writes the next surface remembering it. ADR-0023 in particular is the kind of
 * rule that decays into a comment within two milestones unless a test fails.
 */

const QUERY = {
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "quarter_to_date" as const,
};

async function overview() {
  return syntheticRepository.getShowroomOverview(QUERY);
}

/* --- ADR-0023 -------------------------------------------------------------- */

describe("showroom is the primary source", () => {
  it("never leads a surface with a finding that is only CRM outcome data", async () => {
    const view = await overview();
    expect(isShowroomRooted(view.verdictSources)).toBe(true);
    for (const finding of view.findings) {
      expect(isShowroomRooted(finding.sources), `${finding.id} is not showroom-rooted`).toBe(true);
    }
    for (const change of view.changes) {
      expect(isShowroomRooted(change.sources), `${change.id} is not showroom-rooted`).toBe(true);
    }
  });

  it("keeps CRM outcomes out of the headline figures", async () => {
    const view = await overview();
    // The figure strip is the loudest thing after the verdict. Nothing derived
    // from a deal stage belongs in it.
    const ids = view.figures.map((f) => f.metricId);
    expect(ids.every((id) => id.startsWith("showroom."))).toBe(true);
    expect(ids).not.toContain("exec.units_sold");
    expect(ids).not.toContain("exec.revenue");
  });

  it("still admits outcomes as cohort context", async () => {
    const view = await overview();
    expect(view.outcomeContext.length).toBeGreaterThan(0);
    expect(view.outcomeContext.reduce((a, o) => a + o.count, 0)).toBe(view.meetingCount);
  });

  it("refuses an answer whose sources are only outcome or only interpretation", () => {
    expect(isShowroomRooted(["CRM_OUTCOME_CONTEXT"])).toBe(false);
    expect(isShowroomRooted(["WEBIRIS_CONTEXT"])).toBe(false);
    expect(isUngroundedInterpretation(["AI_INTERPRETATION"])).toBe(true);
    expect(isUngroundedInterpretation(["AI_INTERPRETATION", "IRIS_SHOWROOM_OBSERVED"])).toBe(false);
  });

  it("does not put the conversion funnel in the primary navigation", async () => {
    const { PRIMARY_NAV } = await import("../src/lib/routes");
    expect(PRIMARY_NAV.map((n) => n.key)).toEqual([
      "showroom",
      "presentation",
      "units",
      "storytelling",
    ]);
  });
});

/* --- no causal language ----------------------------------------------------- */

const CAUSAL =
  /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;

describe("association, never cause", () => {
  it("emits no causal wording anywhere in the read models", async () => {
    const view = await overview();
    const presentation = await syntheticRepository.getPresentationIntelligence(QUERY, {
      mode: "cohorts",
      left: null,
      right: null,
    });
    const storytelling = await syntheticRepository.getStorytelling(QUERY);
    const units = await syntheticRepository.getUnitAttention(QUERY, "A-402");

    const prose = [
      view.verdict,
      view.verdictDetail,
      ...view.findings.flatMap((f) => [f.statement, f.soWhat, f.baseline ?? "", f.caveat ?? ""]),
      ...view.changes.map((c) => c.detail),
      presentation.comparison?.disclaimer ?? "",
      ...presentation.findings.flatMap((f) => [f.statement, f.soWhat]),
      ...storytelling.findings.flatMap((f) => [f.statement, f.soWhat]),
      ...(units.selected?.findings ?? []).flatMap((f) => [f.statement, f.soWhat]),
    ];

    for (const sentence of prose) {
      expect(CAUSAL.test(sentence), `causal wording: "${sentence}"`).toBe(false);
    }
  });

  it("states the disclaimer on every cohort and agent comparison", async () => {
    for (const mode of ["cohorts", "agents", "periods"] as const) {
      const view = await syntheticRepository.getPresentationIntelligence(QUERY, {
        mode,
        left: "agt_monika",
        right: "agt_akhilesh",
      });
      expect(view.comparison?.disclaimer, mode).toMatch(/associations, not/i);
    }
  });

  it("shows both sample sizes on every stated difference", async () => {
    const view = await syntheticRepository.getPresentationIntelligence(QUERY, {
      mode: "agents",
      left: "agt_monika",
      right: "agt_akhilesh",
    });
    for (const d of view.comparison?.differences ?? []) {
      expect(d.sampleLeft).toBeGreaterThan(0);
      expect(d.sampleRight).toBeGreaterThan(0);
    }
  });
});

/* --- the dataset ------------------------------------------------------------ */

describe("the synthetic dataset", () => {
  it("is deterministic", () => {
    const a = showroomSessions();
    const b = showroomSessions();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is large enough to carry a pattern", () => {
    const all = showroomSessions();
    expect(all.length).toBeGreaterThanOrEqual(120);
    expect(new Set(all.map((s) => s.agentId)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(all.flatMap((s) => s.units.map((u) => u.unitCode))).size).toBeGreaterThanOrEqual(40);
  });

  it("holds two comparable periods", () => {
    const current = sessionsInPeriod("2026-07-01", "2026-08-24");
    const previous = sessionsInPeriod("2026-04-01", "2026-06-30");
    expect(current.length).toBeGreaterThan(30);
    expect(previous.length).toBeGreaterThan(30);
  });

  it("contains sessions the source cannot time, and says so rather than inventing", () => {
    const blind = showroomSessions().filter((s) => s.timingUnavailable);
    expect(blind.length).toBeGreaterThan(0);
    for (const session of blind) {
      for (const step of session.steps) {
        expect(step.enteredAt).toBeNull();
        expect(step.dwellSeconds).toBeNull();
      }
    }
  });

  it("contains visits below the meaningful-dwell threshold", () => {
    // Without these the one metric that separates "presented" from "clicked"
    // can never fire, which is the flattery the legacy dashboard was built on.
    const glances = showroomSessions()
      .flatMap((s) => s.steps)
      .filter((s) => s.dwellSeconds !== null && s.dwellSeconds < 15);
    expect(glances.length).toBeGreaterThan(10);
  });

  /**
   * The rule the brief states explicitly: no perfect correlations.
   *
   * The behavioural signals must be detectable and must not be destiny. If
   * either side of this test fails the dataset is teaching the product to make
   * a causal claim.
   */
  it("associates behaviour with outcome without making it deterministic", () => {
    const all = showroomSessions().filter((s) => !outcomeIsUnknown(s.outcome));
    const order = (s: (typeof all)[number]) => s.steps.map((x) => x.sectionId);
    const early = (s: (typeof all)[number]) => {
      const o = order(s);
      const i = o.indexOf("surroundings");
      return i >= 0 && i < Math.max(1, Math.ceil(o.length / 3));
    };
    const compared = (s: (typeof all)[number]) => order(s).includes("compare");

    const both = all.filter((s) => early(s) && compared(s));
    const rest = all.filter((s) => !(early(s) && compared(s)));
    const rate = (xs: typeof all) => xs.filter((s) => hasProgressed(s.outcome)).length / xs.length;

    const lift = rate(both) / rate(rest);
    expect(lift).toBeGreaterThan(1.05);
    expect(lift, "the association is too strong to be honest").toBeLessThan(2.2);

    // Exceptions in both directions. A dataset without them is a rule.
    expect(rest.filter((s) => s.outcome === "purchase" || s.outcome === "reservation").length).toBeGreaterThan(0);
    expect(all.filter((s) => !hasProgressed(s.outcome) && early(s) && compared(s)).length).toBeGreaterThan(0);
  });

  it("gives every agent exceptions to their own tendencies", () => {
    for (const agent of SYNTHETIC_AGENTS) {
      const mine = showroomSessions().filter((s) => s.agentId === agent.id);
      const withCompare = mine.filter((s) => s.steps.some((x) => x.sectionId === "compare"));
      expect(withCompare.length, `${agent.name} never uses Compare`).toBeGreaterThan(0);
      expect(withCompare.length, `${agent.name} always uses Compare`).toBeLessThan(mine.length);
    }
  });
});

/* --- honest absence --------------------------------------------------------- */

describe("unknown is never rendered as zero", () => {
  it("returns null rather than zero for dwell the source cannot report", () => {
    const blind = showroomSessions().filter((s) => s.timingUnavailable);
    expect(blind.length).toBeGreaterThan(0);

    // A lane built only from timing-blind sessions must report that it does not
    // know the dwell. Zero would be a claim that no time was spent, which is a
    // different and false statement.
    const lane = buildLane("blind", "Legacy import", blind);
    expect(lane.steps.length).toBeGreaterThan(0);
    for (const step of lane.steps) {
      expect(step.medianDwellSeconds, step.sectionId).toBeNull();
      expect(step.availability, step.sectionId).toBe("requires_ue5_v2_event");
    }

    // The sequence, by contrast, is fully known — that is the whole point.
    for (const step of lane.steps) expect(step.reachRate).toBeGreaterThan(0);
  });

  it("marks a unit that was never compared as unknown, not as zero wins", async () => {
    const view = await syntheticRepository.getUnitAttention(QUERY, null);
    const never = view.rows.find((r) => r.comparisonAppearances === 0);
    expect(never?.comparisonWins).toBeNull();
  });

  it("states the gaps on a replay rather than leaving blanks", async () => {
    const replay = await syntheticRepository.getMeetingReplay({
      viewer: VIEWERS.developer,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      meetingId: "mtg_0001" as never,
    });
    expect(replay.gaps.length).toBeGreaterThan(0);
    for (const gap of replay.gaps) expect(gap.length).toBeGreaterThan(20);
  });
});

/* --- provenance is machine-readable ---------------------------------------- */

describe("source classification", () => {
  it("is carried on every finding, not only in the wording", async () => {
    const view = await overview();
    for (const finding of view.findings) {
      expect(finding.sources.length).toBeGreaterThan(0);
      for (const source of finding.sources) {
        expect(INSIGHT_SOURCES).toContain(source);
      }
    }
  });

  it("labels the outcome step of a replay as CRM context", async () => {
    const replay = await syntheticRepository.getMeetingReplay({
      viewer: VIEWERS.developer,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      meetingId: "mtg_0100" as never,
    });
    const outcome = replay.steps.find((s) => s.kind === "outcome");
    expect(outcome?.sources).toEqual(["CRM_OUTCOME_CONTEXT"]);
  });
});

/* --- the section inventory --------------------------------------------------- */

describe("the section inventory", () => {
  it("makes skip detection possible", () => {
    // "Which sections were skipped" is unanswerable without knowing which
    // sections exist. The legacy analytics has no inventory, which is why the
    // audit marks skip detection as only partially derivable there.
    expect(SECTION_IDS.length).toBeGreaterThan(0);
    expect(CORE_SECTION_IDS.length).toBeGreaterThan(0);
    expect(CORE_SECTION_IDS.every((id) => SECTION_IDS.includes(id))).toBe(true);
  });
});

/* --- the AI boundary --------------------------------------------------------- */

const webRoot = resolve(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("the model never sees a secret or a database", () => {
  it("never exposes FAL_KEY to the client", () => {
    const sources = walk(join(webRoot, "src")).filter((f) => /\.tsx?$/.test(f));
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("NEXT_PUBLIC_FAL");
      if (text.includes("FAL_KEY")) {
        // Anything reading the key must be server-only, and a client component
        // cannot import a module that declares it.
        expect(text, `${file} reads FAL_KEY without server-only`).toContain('import "server-only"');
        expect(text, `${file} reads FAL_KEY in a client component`).not.toContain('"use client"');
      }
    }
  });

  it("disables web search on the model route", () => {
    const provider = readFileSync(join(webRoot, "src/lib/ai/provider.ts"), "utf8");
    expect(provider).toContain("enable_web_search: false");
  });

  it("gives the model no tool that writes", async () => {
    const { TOOLS } = await import("../src/lib/ai/tools");
    expect(TOOLS.length).toBeGreaterThanOrEqual(10);
    const tools = readFileSync(join(webRoot, "src/lib/ai/tools.ts"), "utf8");
    // The tool layer reads through the repository port and nothing else.
    expect(tools).not.toMatch(/\b(INSERT|UPDATE|DELETE|drizzle|sql`)/i);
  });

  it("keeps the causal guard on the model's prose", async () => {
    const { CAUSAL_PATTERNS } = await import("../src/lib/ai/agent");
    expect(CAUSAL_PATTERNS.test("Showing Surroundings caused the purchase")).toBe(true);
    expect(CAUSAL_PATTERNS.test("Meetings that progressed were associated with earlier use")).toBe(
      false,
    );
  });
});

/* --- the projections hold together ------------------------------------------ */

describe("projections", () => {
  it("builds every surface without throwing on an empty slice", () => {
    const context = {
      viewer: VIEWERS.developer,
      tenant: { id: "tnt_alpha" as never, slug: "alpha", name: "Alpha" },
      project: {
        id: "prj_northgate" as never,
        slug: "northgate",
        name: "Northgate",
        locale: "en-GB",
        currency: "EUR",
      },
      period: {
        preset: "quarter_to_date" as const,
        label: "Quarter to date",
        from: "2030-01-01",
        to: "2030-01-02",
        baselineLabel: "before",
        baselineFrom: "2029-01-01",
        baselineTo: "2029-01-02",
        baselineClipped: false,
      },
      generatedAt: "2030-01-02T00:00:00.000Z",
    } as never;

    expect(() => buildShowroomOverview(context, [], [])).not.toThrow();
    expect(() => buildStorytelling(context, [])).not.toThrow();
    expect(() => buildUnitAttention(context, [], [], null)).not.toThrow();
    expect(() => buildPresentationIntelligence(context, [], [], "agents", null, null)).not.toThrow();
    const session = showroomSessions()[0];
    expect(session).toBeDefined();
    if (session !== undefined) expect(() => buildMeetingReplay(context, session)).not.toThrow();
  });
});
