import { beforeAll, describe, expect, it } from "vitest";
import type { CrmDeal } from "@observer/contracts";
import { DEFAULT_LANGUAGE, KPI_WINDOWS } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";
import { dealsFor } from "../src/deals";

/**
 * THE SALES CYCLE, WHERE IT IS SHOWN (R05-4, R07-4, DONTESEK1, Máté 2026-10-02).
 *
 * Sales Flow's Cycle time group and a sold unit's page read the one shared
 * calculator. The sales are taken from the CRM's deals directly, not through
 * the helper under test, and every loop asserts it had something to examine.
 */
const repo = new SyntheticObserverRepository();
const at = (projectSlug: string) =>
  ({
    viewer: VIEWERS.agencyManager,
    tenantSlug: "alpha",
    projectSlug,
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  }) as const;

let sold: readonly CrmDeal[] = [];
beforeAll(async () => {
  /* The deals are provided when the repository first reads the project. */
  await repo.getSalesFlow(at("northgate"));
  sold = (dealsFor("prj_northgate01")?.deals ?? []).filter(
    (d) => d.stage === "purchase" && d.unitCode !== null,
  );
});

describe("Sales Flow's Cycle time group", () => {
  it("draws a figure where a CRM states Sold dates, never more sales than the CRM holds", async () => {
    expect(sold.length, "the world holds sales to measure").toBeGreaterThan(0);
    for (const window of KPI_WINDOWS) {
      const { kpis } = await repo.getFlowCharts(at("northgate"), window.id);
      const group = kpis.groups.find((g) => g.id === "cycle_time");
      expect(group?.definition).toBe(
        "Measured from the first recorded showroom opening to the date the deal entered the Sold stage.",
      );
      expect(group?.figureIds, window.id).toEqual(["sale_cycle"]);
      const figure = kpis.figures.find((f) => f.id === "sale_cycle");
      if (figure === undefined) throw new Error(`${window.id}: no figure`);
      if (figure.value === "No sale") continue;
      const counted = /(\d+) of (\d+) sales measured/.exec(
        `${figure.value} ${figure.qualifier ?? ""}`,
      );
      if (counted !== null) {
        expect(Number(counted[2]), window.id).toBeLessThanOrEqual(sold.length);
        expect(Number(counted[1]), window.id).toBeLessThanOrEqual(Number(counted[2]));
      } else {
        expect(figure.qualifier, window.id).toMatch(/needed for a median/);
      }
    }
  });

  it("is printed empty with the reason where no CRM is connected", async () => {
    for (const window of KPI_WINDOWS) {
      const { kpis } = await repo.getFlowCharts(at("ister-tower"), window.id);
      const group = kpis.groups.find((g) => g.id === "cycle_time");
      expect(group?.figureIds, window.id).toEqual([]);
      expect(group?.missing, window.id).toMatch(/No CRM is connected/);
      expect(
        kpis.figures.some((f) => f.id === "sale_cycle"),
        window.id,
      ).toBe(false);
    }
  });
});

describe("a sold unit's page", () => {
  it("carries every sale's cycle from the calculator, and an unsold unit carries none", async () => {
    expect(sold.length).toBeGreaterThan(0);
    let measured = 0;
    for (const deal of sold) {
      const code = deal.unitCode ?? "";
      const view = await repo.getUnitDetail(at("northgate"), code);
      expect(view.saleCycle, code).not.toBeNull();
      expect(view.saleCycle?.unitCode, code).toBe(code);
      if (view.saleCycle?.kind === "measured") {
        measured += 1;
        expect(view.saleCycle.days, code).toBeGreaterThanOrEqual(0);
      }
    }
    expect(measured, "at least one sale has a duration").toBeGreaterThan(0);

    const soldCodes = new Set(sold.map((d) => d.unitCode));
    const register = await repo.getUnitAttention(at("northgate"), null);
    const unsold = register.rows.find((r) => !soldCodes.has(r.unitCode));
    if (unsold === undefined) throw new Error("every unit sold");
    expect((await repo.getUnitDetail(at("northgate"), unsold.unitCode)).saleCycle).toBeNull();
  });

  it("carries none on a project with no CRM", async () => {
    const register = await repo.getUnitAttention(at("ister-tower"), null);
    const first = register.rows[0];
    if (first === undefined) throw new Error("no unit");
    expect((await repo.getUnitDetail(at("ister-tower"), first.unitCode)).saleCycle).toBeNull();
  });
});
