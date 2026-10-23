import { describe, expect, it } from "vitest";

import type { CatalogueUnit, CrmDeal } from "@observer/contracts";
import type { DeliveredDeals, SalesWindow, Viewer } from "@observer/readmodels";
import { DEFAULT_LANGUAGE } from "@observer/readmodels";

import { buildSalesPlan } from "../src/showroom/charts";
import { SyntheticObserverRepository } from "../src/repository";
import { VIEWERS } from "../src/world";

/**
 * SOLD AGAINST THE PLAN (ADR-0055), WORKED OUT BY HAND.
 *
 * Twenty flats, U1 to U20. The CRM's deals make 9 of them sold (U1–U8, U11),
 * 3 reserved (U9, U12, U13) and leave 8 available, so 11 are not yet sold.
 * Today is 1 July 2026, 10:00 UTC, so the pace window opens 2 April 2026
 * 10:00. A month is 30.4375 days.
 *
 *   six flats whose first purchase is dated inside the window (U1–U6):
 *     6 / 90 × 30.4375 = 2.029 → "2.0" a month
 *   to 31 Dec 2026, 183 days = 6.012 months: 11 / 6.012 = 1.830 → "1.8"
 *   at the current pace: 11 × 90 / 6 = 165 days → 13 Dec 2026 → "Dec 2026"
 *   to 30 Sep 2026, 91 days = 2.990 months: 11 / 2.990 = 3.679 → "3.7"
 */

const TODAY = new Date("2026-07-01T10:00:00Z");

const UNITS = Array.from({ length: 20 }, (_, i) => ({ code: `U${String(i + 1)}` }));

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
    lost: stage === "lost",
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

const SECOND_PURCHASE = deal("D10", "U1", "purchase", "2026-06-02T09:00:00+00:00");

const NOISE = [
  deal("D7", "U7", "purchase", "2026-03-01T09:00:00+00:00"), // sold, before the window
  deal("D8", "U8", "purchase", null), // sold, undated
  deal("D9", "U9", "reservation", "2026-06-20T09:00:00+00:00"), // reserved, not a sale
  SECOND_PURCHASE, // U1 again: one flat sells once, on its first purchase
  deal("D11", "U11", "purchase", "2026-07-02T09:00:00+00:00"), // sold, dated after today
  deal("D12", "U12", "reservation", "2026-05-02T09:00:00+00:00"),
  deal("D13", "U13", "reservation", null),
  deal("D14", "U10", "lost", "2026-06-10T09:00:00+00:00"), // lost: still available
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
  it("counts every flat, and splits it by the CRM's deal stage for each", () => {
    const p = plan();
    expect(p.total).toBe(20);
    expect(p.parts.map((x) => [x.id, x.count, x.share])).toEqual([
      ["sold", 9, 0.45],
      ["reserved", 3, 0.15],
      ["available", 8, 0.4],
    ]);
    expect(p.stockNote).toBeNull();
  });

  it("reads the CRM, never the catalogue's own status", () => {
    // The catalogue calls fifteen flats sold; the CRM has a purchase on nine.
    const catalogue = UNITS.map((u, i) => ({ ...u, status: i < 15 ? "sold" : "available" }));
    expect(plan({ units: catalogue }).parts.map((x) => x.count)).toEqual([9, 3, 8]);
  });

  it("counts a deal that names no catalogued flat in words, and nowhere else", () => {
    const p = plan({
      deals: deals([
        ...IN_WINDOW,
        ...NOISE,
        deal("D20", "U99", "purchase", "2026-06-05T09:00:00+00:00"),
        deal("D21", null, "reservation", null),
        deal("D22", null, "meeting", null),
      ]),
    });
    expect(p.parts.map((x) => x.count)).toEqual([9, 3, 8]);
    expect(p.pace?.sales).toBe(6);
    expect(p.stockNote).toBe(
      "2 reservations or purchases in the CRM name no flat in the catalogue, not counted.",
    );
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

  it("with a CRM that delivers no deals, has no split and no pace either", () => {
    const p = plan({ deals: null });
    expect(p.parts).toEqual([]);
    expect(p.pace).toBeNull();
    expect(p.verdictText).toBe("Unavailable: the CRM delivers no deals");
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
    expect(p.verdictText).toBe("On pace");
    expect(p.summary).toContain("selling 2.0 a month, 1.8 a month needed");
  });

  it("is behind when the date needs more than is selling, and keeps both paces as figures", () => {
    const p = plan({ window: { startsOn: "2026-01-01", sellOutBy: "2026-09-30" } });
    expect(p.pace?.neededDisplay).toBe("3.7");
    expect(p.pace?.sellingDisplay).toBe("2.0");
    expect(p.verdict).toBe("behind");
    expect(p.verdictText).toBe("Behind");
  });

  it("states no pace and no verdict below five dated sales, and still the pace needed", () => {
    /* Four flats sold, so 16 unsold: 16 / 6.012 = 2.661 → "2.7". */
    const p = plan({ deals: deals(IN_WINDOW.slice(0, 4)) });
    expect(p.pace?.sales).toBe(4);
    expect(p.pace?.sellingDisplay).toBeNull();
    expect(p.pace?.sellsOutDisplay).toBeNull();
    expect(p.pace?.neededDisplay).toBe("2.7");
    expect(p.verdict).toBe("too_few_sales");
    expect(p.verdictText).toBe("Too few dated sales to judge the pace (4 of 5)");
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

  it("dates a flat by its first purchase: a second purchase deal is not a new sale", () => {
    /* 15 July: the window opens 16 April, after U1's first purchase and before its second. */
    const p = plan({
      deals: deals([IN_WINDOW[0] as CrmDeal, SECOND_PURCHASE]),
      today: new Date("2026-07-15T10:00:00Z"),
    });
    expect(p.parts[0]?.count).toBe(1);
    expect(p.pace?.sales).toBe(0);
  });

  it("always looks back 90 days, whenever selling began", () => {
    const p = plan({ window: { startsOn: "2026-06-17", sellOutBy: "2026-12-31" } });
    expect(p.pace).toMatchObject({ days: 90, sales: 6, sellingDisplay: "2.0" });
  });

  it("says when selling starts, before it does, and states no pace", () => {
    const p = plan({ window: { startsOn: "2026-08-01", sellOutBy: "2027-06-30" } });
    expect(p.verdict).toBe("not_started");
    expect(p.verdictText).toBe("Selling starts on 1 Aug 2026");
    expect(p.window?.remainingDisplay).toBe("Starts in 1 month");
    expect(p.window?.elapsed).toBe(0);
    expect(p.pace).toBeNull();
  });

  it("on the sell-out day itself, the date has not passed: one day is left", () => {
    /* 11 flats in one day: 11 / (1 / 30.4375) = 334.8 a month. */
    const p = plan({ window: { startsOn: "2026-01-01", sellOutBy: "2026-07-01" } });
    expect(p.verdict).toBe("behind");
    expect(p.window?.remainingDisplay).toBe("1 day left");
    expect(p.pace?.neededDisplay).toBe("334.8");
  });

  it("says the date has passed from the day after, with what is left", () => {
    const p = plan({ window: { startsOn: "2026-01-01", sellOutBy: "2026-06-30" } });
    expect(p.verdict).toBe("date_passed");
    expect(p.verdictText).toBe("Past the sell-out date, 11 flats unsold");
    expect(p.window?.remainingDisplay).toBe("Past the date");
    expect(p.window?.elapsed).toBe(1);
    expect(p.pace?.neededDisplay).toBeNull();
    expect(p.pace?.sellingDisplay).toBe("2.0");
  });

  it("is sold out when the CRM has a purchase on every flat", () => {
    const p = plan({
      deals: deals(UNITS.map((u, i) => deal(`P${String(i)}`, u.code, "purchase", null))),
    });
    expect(p.verdict).toBe("sold_out");
    expect(p.parts.map((x) => x.count)).toEqual([20, 0, 0]);
    expect(p.pace?.sellsOutDisplay).toBeNull();
  });
});

describe("Shark Residence, on the demonstration's own day", () => {
  /*
   * 24 Aug 2026. 60 flats. The demonstration CRM has a purchase on 29 of them
   * (ten of them reservations signed three weeks on) and a reservation (and no
   * purchase) on 3, so 28 are available and 31 not yet sold. 19 of the 29 were
   * first purchased since 26 May: 19 / 90 × 30.4375 = 6.426 → "6.4". 31 unsold
   * over the 310 days to 30 Jun 2027 (10.185 months) = 3.044 → "3.0". At the
   * current pace 31 × 90 / 19 = 146.8 → 147 days → 18 Jan 2027. 224 of 534
   * days gone.
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
    expect(p.parts.map((x) => x.count)).toEqual([29, 3, 28]);
    /* The demonstration CRM's one reservation whose buyer's every flat was taken. */
    expect(p.stockNote).toBe(
      "1 reservation or purchase in the CRM names no flat in the catalogue, not counted.",
    );
    expect(p.window).toMatchObject({
      startsOnDisplay: "12 Jan 2026",
      sellOutByDisplay: "30 Jun 2027",
      remainingDisplay: "10 months left",
    });
    expect(p.window?.elapsed).toBeCloseTo(224 / 534, 6);
    expect(p.pace).toMatchObject({
      sales: 19,
      days: 90,
      sellingDisplay: "6.4",
      neededDisplay: "3.0",
      sellsOutDisplay: "Jan 2027",
      basis: "19 sales dated in the last 90 days",
    });
    expect(p.verdictText).toBe("On pace");
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
    /* The CRM's four purchases and two reservations, not the catalogue's statuses. */
    expect(charts.plan.parts.map((x) => x.count)).toEqual([4, 2, 42]);
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
    // 129 days = 4.238 months: 31 / 4.238 = 7.314 → "7.3", above the 6.4 selling.
    expect(charts.plan.pace?.neededDisplay).toBe("7.3");
    expect(charts.plan.verdictText).toBe("Behind");
  });

  it("counts a delivered flat no unit surface places, as a flat still to sell", async () => {
    const charts = await new SyntheticObserverRepository({
      catalogueSource: {
        catalogueFor: async () => ({
          connector: "realpad",
          orientationMap: {},
          units: (["available", "sold", "delayed", "unknown", "not_for_sale"] as const).map(
            (status, i): CatalogueUnit => ({
              code: `X-${String(i + 1)}`,
              externalId: `X-${String(i + 1)}`,
              building: "X",
              floor: 1,
              rooms: 2,
              layout: "2+kk",
              kitchen: "kitchenette",
              unitType: "flat",
              areas: { interiorSqm: 50, exteriorSqm: null, grossSqm: null },
              price: { withVat: null, withoutVat: null, currency: null },
              orientation: [],
              status,
              statusRaw: status,
              availableFrom: null,
              updatedAt: null,
            }),
          ),
        }),
      },
    }).getProjectCharts({
      viewer: VIEWERS.developerShark as Viewer,
      tenantSlug: "shark",
      projectSlug: "shark-residence",
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    });
    // available, sold, delayed, unknown: four flats to sell; not for sale is none of them.
    expect(charts.plan.total).toBe(4);
  });
});
