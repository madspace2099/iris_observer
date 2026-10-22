import { describe, expect, it } from "vitest";

import type { CrmDeal } from "@observer/contracts";
import type { DeliveredDeals, SalesWindow, Viewer } from "@observer/readmodels";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";

import { buildSalesPlan } from "../src/showroom/charts";
import { SyntheticObserverRepository } from "../src/repository";
import { VIEWERS } from "../src/world";

/**
 * SOLD AGAINST THE PLAN (ADR-0055), WORKED OUT BY HAND.
 *
 * Twenty flats: 9 sold, 3 reserved, 8 available, so 11 not yet sold. Today is
 * 1 July 2026, 10:00 UTC, so the pace window opens 2 April 2026 10:00. A month
 * is 30.4375 days.
 *
 *   six distinct flats dated at purchase inside the window: 6 / 90 × 30.4375
 *     = 2.029 → "2.0" a month
 *   to 31 Dec 2026, 183 days = 6.012 months: 11 / 6.012 = 1.830 → "1.8"
 *   at the current pace: 11 × 90 / 6 = 165 days → 13 Dec 2026 → "Dec 2026"
 *   to 30 Sep 2026, 91 days = 2.990 months: 11 / 2.990 = 3.679 → "3.7"
 */

const TODAY = new Date("2026-07-01T10:00:00Z");

const UNITS = [
  ...Array.from({ length: 9 }, () => ({ status: "sold" })),
  ...Array.from({ length: 3 }, () => ({ status: "reserved" })),
  ...Array.from({ length: 8 }, () => ({ status: "available" })),
];

function deal(
  id: string,
  unitCode: string | null,
  stage: CrmDeal["stage"],
  at: string | null,
): CrmDeal {
  return {
    externalId: id,
    unitCode,
    subjectKey: null,
    stage,
    stageRaw: stage ?? "?",
    stageEnteredAt: at,
    openedAt: null,
    updatedAt: null,
    won: stage === "purchase",
    lost: false,
  };
}

const IN_WINDOW = [
  deal("D1", "U1", "purchase", "2026-04-10T09:00:00+00:00"),
  deal("D2", "U2", "purchase", "2026-05-01T09:00:00+00:00"),
  deal("D3", "U3", "purchase", "2026-05-20T09:00:00+00:00"),
  deal("D4", "U4", "purchase", "2026-06-01T09:00:00+00:00"),
  deal("D5", "U5", "purchase", "2026-06-15T09:00:00+00:00"),
  deal("D6", "U6", "purchase", "2026-06-30T09:00:00+00:00"),
];

const NOISE = [
  deal("D7", "U7", "purchase", "2026-03-01T09:00:00+00:00"), // before the window
  deal("D8", "U8", "purchase", null), // undated
  deal("D9", "U9", "reservation", "2026-06-20T09:00:00+00:00"), // not a sale
  deal("D10", "U1", "purchase", "2026-06-02T09:00:00+00:00"), // U1 again: one flat sells once
  deal("D11", "U11", "purchase", "2026-07-02T09:00:00+00:00"), // after today
];

const deals = (list: readonly CrmDeal[], extra: Partial<DeliveredDeals> = {}): DeliveredDeals => ({
  connector: "synthetic",
  deals: list,
  fetchedAt: TODAY.toISOString(),
  ...extra,
});

const YEAR: SalesWindow = { startsOn: "2026-01-01", sellOutBy: "2026-12-31" };

function plan(overrides: Partial<Parameters<typeof buildSalesPlan>[0]> = {}) {
  return buildSalesPlan({
    units: UNITS,
    deals: deals([...IN_WINDOW, ...NOISE]),
    crmConnected: true,
    window: YEAR,
    today: TODAY,
    locale: "en-GB",
    timeZone: "UTC",
    ...overrides,
  });
}

describe("the stock", () => {
  it("counts every flat, and splits it by the CRM's status", () => {
    const p = plan();
    expect(p.total).toBe(20);
    expect(p.parts.map((x) => [x.id, x.count, x.share])).toEqual([
      ["sold", 9, 0.45],
      ["reserved", 3, 0.15],
      ["available", 8, 0.4],
    ]);
    expect(p.stockNote).toBeNull();
  });

  it("without a CRM, keeps the total and says why the split is missing, never zero", () => {
    const p = plan({ crmConnected: false });
    expect(p.total).toBe(20);
    expect(p.parts).toEqual([]);
    expect(p.stockNote).toBe("Sold, reserved and available flats are read from the CRM.");
    expect(p.verdictText).toBe("Unavailable: the CRM is not connected");
    expect(p.pace).toBeNull();
    expect(p.verdict).toBe("unavailable");
  });

  it("without a catalogue, has no total at all", () => {
    const p = plan({ units: [] });
    expect(p.total).toBeNull();
    expect(p.parts).toEqual([]);
    expect(p.verdictText).toBe("No unit catalogue has reached this project");
  });
});

describe("the window", () => {
  it("formats the configured dates and the time gone", () => {
    const w = plan().window;
    expect(w?.startsOnDisplay).toBe("1 Jan 2026");
    expect(w?.sellOutByDisplay).toBe("31 Dec 2026");
    // 181 of 364 days.
    expect(w?.elapsed).toBeCloseTo(181 / 364, 6);
    expect(w?.remainingDisplay).toBe("6 months left");
  });

  it("is absent, and says so, where no date is set; never invented", () => {
    const p = plan({ window: null });
    expect(p.window).toBeNull();
    expect(p.verdict).toBe("no_date");
    expect(p.verdictText).toBe("No sell-out date set");
    expect(p.pace?.neededDisplay).toBeNull();
    // The pace still stands on its own: 90 days, six sales.
    expect(p.pace?.sellingDisplay).toBe("2.0");
  });
});

describe("the pace and the verdict", () => {
  it("is on pace when selling is at least what the date needs", () => {
    const p = plan();
    expect(p.pace).toMatchObject({
      sales: 6,
      days: 90,
      minimum: 5,
      sellingDisplay: "2.0",
      neededDisplay: "1.8",
      sellsOutDisplay: "Dec 2026",
      basis: "6 sales dated in the last 90 days · 1 sale with no date, not counted",
    });
    expect(p.verdict).toBe("on_pace");
    expect(p.verdictText).toBe("On pace: needs 1.8 a month, selling 2.0");
  });

  it("is behind when the date needs more than is selling, and says both", () => {
    const p = plan({ window: { startsOn: "2026-01-01", sellOutBy: "2026-09-30" } });
    expect(p.pace?.neededDisplay).toBe("3.7");
    expect(p.verdict).toBe("behind");
    expect(p.verdictText).toBe("Behind: needs 3.7 a month, selling 2.0");
  });

  it("states no pace and no verdict below five dated sales", () => {
    const p = plan({ deals: deals(IN_WINDOW.slice(0, 4)) });
    expect(p.pace?.sales).toBe(4);
    expect(p.pace?.sellingDisplay).toBeNull();
    expect(p.pace?.sellsOutDisplay).toBeNull();
    expect(p.pace?.neededDisplay).toBe("1.8");
    expect(p.verdict).toBe("too_few_sales");
    expect(p.verdictText).toBe("Too few sales to judge the pace: 4 in 90 days, 5 needed");
  });

  it("dates a sale the CRM leaves undated by the sync that saw it", () => {
    const undated = deal("D12", "U12", "purchase", null);
    const p = plan({
      deals: deals([...IN_WINDOW.slice(0, 4), undated], {
        stageObservedAt: { D12: "2026-06-25T06:00:00+00:00" },
      }),
    });
    expect(p.pace?.sales).toBe(5);
    expect(p.pace?.basis).toBe("5 sales dated in the last 90 days");
  });

  it("looks back only as far as selling began", () => {
    /*
     * Since 2 May: 60 days. Inside them U3, U4, U5, U6, and U1's second deal
     * (2 June; its first, 10 April, is before the window): 5 flats.
     * 5 / 60 × 30.4375 = 2.536 → "2.5".
     */
    const p = plan({ window: { startsOn: "2026-05-02", sellOutBy: "2026-12-31" } });
    expect(p.pace).toMatchObject({
      days: 60,
      sales: 5,
      sellingDisplay: "2.5",
      basis: "5 sales dated in the last 60 days · 1 sale with no date, not counted",
    });
    expect(p.verdict).toBe("on_pace");
  });

  it("says when selling starts, before it does", () => {
    const p = plan({ window: { startsOn: "2026-08-01", sellOutBy: "2027-06-30" } });
    expect(p.verdict).toBe("not_started");
    expect(p.verdictText).toBe("Selling starts on 1 Aug 2026");
    expect(p.window?.remainingDisplay).toBe("Starts in 1 month");
    expect(p.window?.elapsed).toBe(0);
  });

  it("says the date has passed, with what is left", () => {
    const p = plan({ window: { startsOn: "2026-01-01", sellOutBy: "2026-06-30" } });
    expect(p.verdict).toBe("date_passed");
    expect(p.verdictText).toBe("The sell-out date has passed with 11 flats unsold");
    expect(p.window?.elapsed).toBe(1);
    expect(p.pace?.neededDisplay).toBeNull();
  });

  it("is sold out when nothing is left", () => {
    const p = plan({ units: UNITS.map(() => ({ status: "sold" })) });
    expect(p.verdict).toBe("sold_out");
    expect(p.pace?.sellsOutDisplay).toBeNull();
  });

  it("does not guess a pace where the CRM delivers no deals", () => {
    const p = plan({ deals: null });
    expect(p.parts).toHaveLength(3);
    expect(p.pace).toBeNull();
    expect(p.verdictText).toBe("Pace unknown: the CRM delivers no dated sale");
  });
});

describe("Shark Residence, on the demonstration's own day", () => {
  /*
   * 24 Aug 2026. 60 flats: 24 sold, 12 reserved, 24 available (the catalogue
   * the demonstration CRM's deals stand behind). 14 distinct flats dated at
   * purchase since 26 May: 14 / 90 × 30.4375 = 4.735 → "4.7". 36 unsold over
   * the 310 days to 30 Jun 2027 (10.185 months) = 3.535 → "3.5". At the current
   * pace 36 × 90 / 14 = 231 days → 12 Apr 2027. 224 of 534 days gone.
   */
  it("reads the configured window and the demonstration CRM", async () => {
    const charts = await new SyntheticObserverRepository().getProjectCharts({
      viewer: VIEWERS.developerShark as Viewer,
      tenantSlug: "shark",
      projectSlug: "shark-residence",
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    });
    const p = charts.plan;
    expect(p.total).toBe(60);
    expect(p.parts.map((x) => x.count)).toEqual([24, 12, 24]);
    expect(p.window).toMatchObject({
      startsOnDisplay: "12 Jan 2026",
      sellOutByDisplay: "30 Jun 2027",
      remainingDisplay: "10 months left",
    });
    expect(p.window?.elapsed).toBeCloseTo(224 / 534, 6);
    expect(p.pace).toMatchObject({
      sales: 14,
      days: 90,
      sellingDisplay: "4.7",
      neededDisplay: "3.5",
      sellsOutDisplay: "Apr 2027",
      basis: "14 sales dated in the last 90 days",
    });
    expect(p.verdictText).toBe("On pace: needs 3.5 a month, selling 4.7");
  });

  it("has no plan on a project that configures none", async () => {
    const charts = await new SyntheticObserverRepository().getProjectCharts({
      viewer: VIEWERS.developer as Viewer,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    });
    expect(charts.plan.window).toBeNull();
    expect(charts.plan.verdictText).toBe("No sell-out date set");
    /* The pace still stands on its dated sales; e2e/p219-screens.spec.ts reads this line. */
    expect(charts.plan.pace?.basis).toMatch(/^\d+ sales? dated in the last \d+ days/);
  });

  it("puts a window kept in Observer in front of the configuration", async () => {
    const charts = await new SyntheticObserverRepository({
      salesWindowSource: {
        windowFor: async (id) =>
          id === "prj_sharkres001" ? { startsOn: "2026-01-12", sellOutBy: "2026-12-31" } : null,
      },
    }).getProjectCharts({
      viewer: VIEWERS.developerShark as Viewer,
      tenantSlug: "shark",
      projectSlug: "shark-residence",
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    });
    // 129 days = 4.238 months: 36 / 4.238 = 8.494 → "8.5".
    expect(charts.plan.verdictText).toBe("Behind: needs 8.5 a month, selling 4.7");
  });
});
