import { describe, expect, it } from "vitest";
import { KPI_WINDOWS } from "@observer/readmodels";
import type { KpiPanel, OverviewQuery, Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * The summary row in the plan's four groups (R05 item 2), approved by Máté on
 * 2026-09-24 under `docs/observer-visual-baseline.md:280`.
 *
 * Measured before any group was built. Volume and Progress each hold a figure
 * the row already drew. Conversion and Cycle time hold none:
 * - the deal ladder is stock, not path;
 * - `flow.stage_conversion` is computed nowhere;
 * - Progressing is a meeting ratio, which the plan excludes as conversion;
 * - the sale cycle is blocked (P2-06).
 * So those two are printed empty with what is missing, never dropped.
 * "Typical length" stays outside the groups: it measures workload, and filed
 * under Volume the group's name would say something untrue about it.
 *
 * This is a regrouping, not a recomputation. The figures themselves are
 * untouched; `kpi-window.test.ts` still holds what each one says.
 */

const repo = new SyntheticObserverRepository();

const PROJECTS = ["ister-tower", "northgate", "riverside"] as const;

function query(projectSlug: string): OverviewQuery {
  return {
    viewer: VIEWERS.developer as Viewer,
    tenantSlug: "alpha",
    projectSlug,
    period: "quarter_to_date",
  };
}

const CAUSAL =
  /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;

async function everyPanel(): Promise<readonly { readonly at: string; readonly kpis: KpiPanel }[]> {
  const panels: { at: string; kpis: KpiPanel }[] = [];
  for (const projectSlug of PROJECTS) {
    for (const window of KPI_WINDOWS) {
      const charts = await repo.getFlowCharts(query(projectSlug), window.id);
      panels.push({ at: `${projectSlug}/${window.id}`, kpis: charts.kpis });
    }
  }
  return panels;
}

describe("the summary row in four groups", () => {
  it("has panels to check, so the assertions below examine something", async () => {
    expect((await everyPanel()).length).toBe(PROJECTS.length * KPI_WINDOWS.length);
  });

  it("names the four groups in the plan's order", async () => {
    for (const { at, kpis } of await everyPanel()) {
      expect(
        kpis.groups.map((g) => g.id),
        at,
      ).toEqual(["volume", "progress", "conversion", "cycle_time"]);
    }
  });

  it("places every figure the row draws exactly once, and no figure it does not draw", async () => {
    for (const { at, kpis } of await everyPanel()) {
      const placed = [...kpis.groups.flatMap((g) => g.figureIds), ...kpis.ungrouped].sort();
      expect(placed, at).toEqual(kpis.figures.map((f) => f.id).sort());
    }
  });

  it("files the measured figures, and leaves Typical length outside the groups", async () => {
    for (const { at, kpis } of await everyPanel()) {
      const ids = Object.fromEntries(kpis.groups.map((g) => [g.id, g.figureIds]));
      expect(ids, at).toEqual({
        volume: ["presentations", "units"],
        progress: ["progressed"],
        conversion: [],
        cycle_time: [],
      });
      expect(kpis.ungrouped, at).toEqual(["duration"]);
    }
  });

  it("prints an empty group with what is missing, and only an empty one", async () => {
    for (const { at, kpis } of await everyPanel()) {
      for (const group of kpis.groups) {
        expect(group.missing === null, `${at} ${group.id}`).toBe(group.figureIds.length > 0);
      }
      const missing = Object.fromEntries(kpis.groups.map((g) => [g.id, g.missing ?? ""]));
      expect(missing.conversion, at).toMatch(/not the path it took/);
      expect(missing.conversion, at).toMatch(/not computed/);
      expect(missing.cycle_time, at).toMatch(/first opening across its whole history/);
      expect(missing.cycle_time, at).toMatch(/where the cycle starts|whether the cycle starts/);
      for (const text of Object.values(missing)) expect(text, at).not.toMatch(/no data/i);
    }
  });

  it("adds no figure: a group's words carry no digit, and no causal claim", async () => {
    for (const { at, kpis } of await everyPanel()) {
      for (const group of kpis.groups) {
        for (const text of [group.label, group.definition, group.missing ?? ""]) {
          expect(text, `${at} ${group.id}`).not.toMatch(/\d/);
          expect(CAUSAL.test(text), `${at} ${group.id}: "${text}"`).toBe(false);
        }
      }
    }
  });
});
