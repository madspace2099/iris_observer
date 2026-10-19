import { describe, expect, it } from "vitest";
import { VIEWERS, syntheticRepository } from "@observer/synthetic";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";

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
