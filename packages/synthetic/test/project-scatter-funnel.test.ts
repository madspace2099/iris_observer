import { describe, expect, it } from "vitest";
import type { ShowroomSession } from "@observer/contracts";
import { VIEWERS, syntheticRepository } from "@observer/synthetic";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";

import { buildJourney } from "../src/showroom/charts";

/**
 * The project page's two drawn forms, composed in the read model (ADR-0012):
 * the journey as a funnel, and attention × conversion as a scatter. The page
 * only places what these carry; this proves they carry it honestly. The print
 * site is `e2e/project-denominators.spec.ts`.
 */

const QUERY = {
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "quarter_to_date" as const,
  language: DEFAULT_LANGUAGE,
};

const [view, charts] = await Promise.all([
  syntheticRepository.getProjectView(QUERY, null),
  syntheticRepository.getProjectCharts(QUERY),
]);
const funnel = charts.journey.funnel;

describe("the journey funnel", () => {
  it("has bands to draw on the fixture", () => {
    expect(funnel.steps.length, "the guards below would pass on nothing").toBeGreaterThan(1);
  });

  it("never widens", () => {
    funnel.steps.forEach((step, i) => {
      expect(step.count).toBeLessThanOrEqual(funnel.steps[i - 1]?.count ?? step.count);
    });
  });

  it("states every share out of the first band", () => {
    const first = funnel.steps[0]?.count ?? 0;
    expect(funnel.steps.map((s) => s.share)).toEqual(funnel.steps.map((s) => s.count / first));
  });

  it("draws no band as wide as the one above it, and names any it merged", () => {
    const repeated = charts.journey.stages.filter(
      (s, i) => s.count === charts.journey.stages[i - 1]?.count,
    );
    expect(funnel.steps.length + repeated.length).toBe(charts.journey.stages.length);
    for (const stage of repeated) expect(funnel.merged).toContain(`"${stage.label}" is not drawn`);
  });

  it("says what its shares are out of", () => {
    expect(funnel.of).toContain(`the ${funnel.steps[0]?.countDisplay ?? "?"} meetings presented`);
  });
});

/* A meeting that opened `units` units, shortlisted one when `kept`, and recorded `outcome`. */
function meeting(
  n: number,
  units: number,
  kept: boolean,
  outcome: ShowroomSession["outcome"],
): ShowroomSession {
  return {
    sessionId: `ses_${n}`,
    meetingId: `mtg_${n}`,
    projectId: "prj_x",
    agentId: "agt_x",
    channel: "showroom",
    contactId: null,
    startedAt: "2026-10-01T10:00:00Z",
    endedAt: "2026-10-01T11:00:00Z",
    durationSeconds: 3600,
    outcome,
    steps: [],
    units: Array.from({ length: units }, (_, i) => ({
      unitId: `unt_${i}`,
      unitCode: `A-${i}`,
      views: 1,
      dwellSeconds: 60,
      longestViewSeconds: 60,
      favourited: kept && i === 0,
      pdfOpened: false,
      balconyViews: 0,
      floorCutViews: 0,
      screenshots: 0,
      comparedWith: [],
      keptFromComparison: null,
      shared: false,
    })),
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

describe("the journey funnel's last stage is an outcome, and absent is never nought", () => {
  const sessions = [
    meeting(1, 0, false, "skipped"),
    meeting(2, 2, false, "not_interested"),
    meeting(3, 1, true, "reservation"),
    meeting(4, 1, true, "presentation_only"),
    meeting(5, 1, true, "skipped"),
  ];

  it("draws no Progressed band on a project with no CRM, and says why", () => {
    const journey = buildJourney(sessions, "en-GB", false);
    expect(journey.stages.map((s) => s.id)).toEqual(["all", "opened", "shortlisted"]);
    expect(journey.funnel.steps.map((s) => s.id)).toEqual(["all", "opened", "shortlisted"]);
    expect(journey.funnel.merged).toContain('"Progressed" is not drawn: no CRM is connected');
    expect(journey.droppedLabel).toBe("2 did not reach the end of this path");
  });

  it("does not count an unrecorded outcome as a stop, and says how many there are", () => {
    const journey = buildJourney(sessions, "en-GB", true);
    expect(journey.funnel.steps.map((s) => [s.id, s.count])).toEqual([
      ["all", 5],
      ["opened", 4],
      ["shortlisted", 3],
      ["progressed", 1],
    ]);
    expect(journey.funnel.of).toContain(
      "1 of the 3 that shortlisted one has no recorded outcome, so whether it progressed is not known",
    );
    expect(journey.droppedLabel).toBe(
      "3 did not reach the end of this path, and 1 has no recorded outcome",
    );
  });

  it("names a stage no meeting reached once, rather than 'all 0 reached it'", () => {
    const journey = buildJourney(
      [meeting(1, 0, false, "skipped"), meeting(2, 0, false, "interested")],
      "en-GB",
      true,
    );
    expect(journey.funnel.steps.map((s) => s.id)).toEqual(["all"]);
    expect(journey.funnel.merged).toBe(
      'No meeting reached "Opened a unit", so it and every stage after it are not drawn.',
    );
  });

  it("does not say no meeting reached Progressed while outcomes are unrecorded", () => {
    const some = buildJourney(
      [
        meeting(1, 1, true, "skipped"),
        meeting(2, 1, true, "skipped"),
        meeting(3, 1, true, "not_interested"),
      ],
      "en-GB",
      true,
    );
    expect(some.funnel.merged).toContain(
      '"Progressed" is not drawn: none of the 1 recorded outcome among those that shortlisted one is a progression.',
    );
    expect(some.funnel.of).toContain("2 of the 3 that shortlisted one have no recorded outcome");

    const none = buildJourney(
      [meeting(1, 1, true, "skipped"), meeting(2, 1, true, "skipped")],
      "en-GB",
      true,
    );
    expect(none.funnel.merged).toContain(
      '"Progressed" is not drawn: none of the 2 that shortlisted one has a recorded outcome.',
    );
  });

  it("names the last stage alone when only it is empty", () => {
    const journey = buildJourney(
      [meeting(1, 1, true, "not_interested"), meeting(2, 1, false, "interested")],
      "en-GB",
      true,
    );
    expect(journey.funnel.steps.map((s) => s.id)).toEqual(["all", "shortlisted"]);
    expect(journey.funnel.merged).toBe(
      '"Opened a unit" is not drawn: all 2 at "Presented" reached it, so nobody stopped between the two. No meeting reached "Progressed", so it is not drawn.',
    );
  });
});

describe("the attention × conversion scatter", () => {
  it("places exactly the segments with a quadrant", () => {
    expect(view.scatter.points.map((p) => p.id).sort()).toEqual(
      view.segments
        .filter((s) => s.conversion.quadrant !== null)
        .map((s) => s.id)
        .sort(),
    );
  });

  it("has points on the fixture", () => {
    expect(view.scatter.points.length, "the guards would pass on an empty chart").toBeGreaterThan(
      0,
    );
  });

  it("prints each point's index with what it is a multiple of, and the set its rate stands on", () => {
    for (const p of view.scatter.points) {
      expect(p.display).toBe(
        `${p.index.toFixed(2)}× attention for its share of stock · ${new Intl.NumberFormat(
          "en-GB",
          {
            style: "percent",
            maximumFractionDigits: 0,
          },
        ).format(p.share)} converted against ${new Intl.NumberFormat("en-GB", {
          style: "percent",
          maximumFractionDigits: 0,
        }).format(view.scatter.projectShare ?? 0)} · n = ${p.decided}`,
      );
    }
  });

  it("opens the segment from each point", () => {
    for (const p of view.scatter.points) {
      expect(p.href).toBe(`/alpha/northgate/project?segment=${p.id}`);
    }
  });

  it("names what each axis measures, in the words each point's line uses", () => {
    expect(view.scatter.axes).toEqual({
      attention: "Attention for its share of stock",
      conversion: "Decided meetings that progressed",
    });
    for (const p of view.scatter.points) {
      expect(p.display.toLowerCase()).toContain(view.scatter.axes.attention.toLowerCase());
    }
  });

  it("keeps every point inside its axis", () => {
    for (const p of view.scatter.points) expect(p.index).toBeLessThanOrEqual(view.scatter.indexMax);
  });

  it("lists an indexed segment it does not place, with the reason", () => {
    const placed = new Set(view.scatter.points.map((p) => p.id));
    const unplaced = view.segments.filter((s) => s.index !== null && !placed.has(s.id));
    expect(view.scatter.offChart.map((o) => o.id)).toEqual(unplaced.map((s) => s.id));
    for (const o of view.scatter.offChart) expect(o.reason.length).toBeGreaterThan(0);
  });
});
