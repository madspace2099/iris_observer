import { describe, expect, it } from "vitest";

import type { CrmDeal, ShowroomSession } from "@observer/contracts";
import { DEFAULT_IRIS_ASSIST_POLICY } from "@observer/metrics";
import {
  DEFAULT_LANGUAGE,
  type DeliveredDeals,
  type IrisLedSalesView,
  type OverviewQuery,
  type Viewer,
} from "@observer/readmodels";

import { SyntheticObserverRepository, VIEWERS } from "../src";
import { buildIrisLedSales, type IrisLedCatalogue } from "../src/iris-led";
import { syntheticDeals } from "../src/deals";
import { sessionsForProject } from "../src/showroom/sessions";
import { PROJECTS, TODAY } from "../src/world";
import { viewContext } from "./view-context";

/**
 * IRIS-LED SALES (ADR-0049): every figure below is worked out by hand from the
 * dates in this file, never read back from the function under test. The rule is
 * about ORDER, so the cases sit on its edges: a showing before the period, one
 * after the sale, a sale outside the period, a sale with no date, a sale with no
 * flat, and a flat only the catalogue saw change.
 */

const PERIOD = { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" };

function meeting(
  id: string,
  startedAt: string,
  agentId: string,
  ...codes: string[]
): ShowroomSession {
  return {
    sessionId: id,
    meetingId: id,
    projectId: "prj_testproject",
    agentId,
    channel: "showroom",
    contactId: null,
    startedAt,
    endedAt: startedAt,
    durationSeconds: 0,
    outcome: "interested",
    steps: [],
    units: codes.map((code) => ({
      unitId: code,
      unitCode: code,
      views: 1,
      dwellSeconds: 60,
      longestViewSeconds: 60,
      favourited: false,
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

function deal(
  externalId: string,
  unitCode: string | null,
  stage: CrmDeal["stage"],
  stageEnteredAt: string | null,
): CrmDeal {
  return {
    externalId,
    unitCode,
    subjectKey: null,
    stage,
    stageRaw: stage ?? "unmapped",
    stageEnteredAt,
    openedAt: null,
    updatedAt: null,
    won: stage === "purchase",
    lost: stage === "lost",
  };
}

const SESSIONS = [
  meeting("m1", "2026-08-20T10:00:00.000Z", "agt_a", "A-1"),
  meeting("m2", "2026-09-05T10:00:00.000Z", "agt_b", "A-1", "B-2"),
  meeting("m3", "2026-09-09T10:00:00.000Z", "agt_a", "A-1"),
  meeting("m4", "2026-09-12T10:00:00.000Z", "agt_b", "C-3"),
  meeting("m6", "2026-09-19T22:00:00.000Z", "agt_a", "F-6"),
];

const DEALS: DeliveredDeals = {
  connector: "realpad",
  fetchedAt: "2026-09-30T06:00:00.000Z",
  deals: [
    deal("R-1", "A-1", "reservation", "2026-09-10T10:00:00.000Z"),
    deal("R-2", "B-2", "purchase", "2026-09-25T10:00:00.000Z"),
    deal("R-3", "C-3", "reservation", "2026-09-11T10:00:00.000Z"),
    deal("R-4", "D-4", "purchase", "2026-08-30T10:00:00.000Z"),
    deal("R-5", "E-5", "reservation", null),
    deal("R-6", null, "purchase", "2026-09-15T10:00:00.000Z"),
    deal("R-7", null, "purchase", "2026-07-15T10:00:00.000Z"),
    deal("N-1", "A-1", "negotiation", "2026-09-10T10:00:00.000Z"),
    deal("W-1", "F-6", "reservation", null),
  ],
  stageObservedAt: { "W-1": "2026-09-20T10:00:00.000Z" },
};

const CATALOGUE: IrisLedCatalogue = {
  connector: "csv",
  fromDemonstrationCrm: false,
  units: [
    { code: "A-1", status: "reserved" },
    { code: "G-7", status: "sold" },
    { code: "H-8", status: "reserved" },
    { code: "J-9", status: "available" },
    { code: "K-10", status: "sold" },
  ],
  statusObservedAt: { "G-7": "2026-09-18T06:00:00.000Z", "K-10": "2026-06-01T06:00:00.000Z" },
};

function build(
  deals: DeliveredDeals | null,
  catalogue: IrisLedCatalogue = CATALOGUE,
  sessions: readonly ShowroomSession[] = SESSIONS,
): IrisLedSalesView {
  return buildIrisLedSales({
    context: viewContext(),
    deals,
    catalogue,
    sessions,
    window: PERIOD,
    policy: DEFAULT_IRIS_ASSIST_POLICY,
    unitHref: (code) => (code === "A-1" ? "/t/p/units/A-1" : null),
    meetingHref: (id) => `/t/p/meetings/${id}`,
    agentName: (id) => (id === "agt_a" ? "Anna Test" : "Bela Test"),
    agentHref: (id) => (id === "agt_a" ? "/t/p/agents/agt_a" : null),
  });
}

const CAUSAL =
  /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves|thanks to)\b/i;

describe("which of the period's sales the showroom showed first", () => {
  const view = build(DEALS);
  const row = (id: string) => [...view.sales, ...view.neverShown].find((s) => s.id === id);

  it("places the period's dated sales that name a flat, and the catalogue's witnessed change", () => {
    /* R-1, R-2, R-3, W-1 from the CRM; G-7 from the catalogue. R-4 and K-10 fall before the period. */
    expect(view.counts.sales).toBe(5);
    expect([...view.sales, ...view.neverShown].map((s) => s.id).sort()).toEqual(
      ["R-1", "R-2", "R-3", "W-1", "unit:G-7"].sort(),
    );
  });

  it("counts what it cannot place beside the figures, and says why", () => {
    expect(view.counts.unplacedNoDate, "R-5 has no date and no witnessed move").toBe(1);
    expect(view.counts.unplacedNoUnit, "R-6 names no flat; R-7 is outside the period").toBe(1);
    expect(view.counts.catalogueUndated, "H-8 is reserved with no date; A-1 is the CRM's").toBe(1);
    expect(view.unplacedNote).toBe(
      "1 sale the CRM states carries no date Observer could use, so no period holds it. 1 sale dated in this period names no flat, so no showing can be placed against it. The catalogue lists 1 more flat as reserved or sold with no date for the change; it is not counted.",
    );
  });

  it("counts every showing before the change, in the period and before it", () => {
    /* A-1: m1 on 20 Aug (before the period), m2 and m3 in it; the sale is 10 Sep 10:00. */
    const sale = row("R-1");
    expect(sale?.showings.map((s) => s.meetingId)).toEqual(["m1", "m2", "m3"]);
    expect(sale?.showingsDisplay).toBe("3: 2 in the period, 1 before it");
    expect(sale?.firstShownDisplay).toBe("20 Aug");
    expect(sale?.lastShownDisplay).toBe("9 Sept");
    expect(sale?.daysFromLastShowing).toBe(1);
    expect(sale?.gapDisplay).toBe("24 hours");
    expect(sale?.verdict).toBe("shown_in_window");
    expect(sale?.verdictLabel).toBe("Shown within 72 hours");
    expect(sale?.agents.map((a) => a.name)).toEqual(["Anna Test", "Bela Test"]);
    expect(sale?.agents[1]?.href, "Bela presented nothing in the period").toBeNull();
    expect(sale?.unitHref).toBe("/t/p/units/A-1");
    expect(sale?.statement).toBe(
      "A-1 was opened in 3 IRIS presentations before its reservation date, the last 24 hours before it, by Anna Test.",
    );
  });

  it("keeps the 72-hour verdict as a column, and states the lag of an earlier showing", () => {
    /* B-2: shown 5 Sep 10:00, purchased 25 Sep 10:00. Twenty days. */
    const sale = row("R-2");
    expect(sale?.verdict).toBe("shown_earlier");
    expect(sale?.daysFromLastShowing).toBe(20);
    expect(sale?.showingsDisplay).toBe("1, all in the period");
    expect(sale?.dateWhose).toBe("the CRM's date");
  });

  it("never counts a showing after the change", () => {
    const sale = row("R-3");
    expect(sale?.verdict).toBe("not_shown");
    expect(sale?.showings).toEqual([]);
    expect(sale?.statement).toBe("No IRIS presentation opened C-3 before its reservation date.");
  });

  it("dates a witnessed move by its sync and a catalogue change by its sync, and says so", () => {
    expect(row("W-1")?.dateBasis).toBe("first_observed");
    expect(row("W-1")?.dateWhose).toBe("first seen by a deals sync");
    expect(row("W-1")?.statement).toBe(
      "F-6 was opened in 1 IRIS presentation before Observer first saw its reservation, the last 12 hours before it, by Anna Test.",
    );
    expect(row("unit:G-7")?.changeLabel).toBe("Marked sold");
    expect(row("unit:G-7")?.dateWhose).toBe("first seen by a catalogue sync");
    expect(row("unit:G-7")?.statement).toBe(
      "No IRIS presentation opened G-7 before Observer first saw it marked sold.",
    );
  });

  it("states the totals with their denominators", () => {
    /* Shown before: R-1, R-2, W-1. Within 72 hours: R-1 (24 h), W-1 (12 h). */
    expect(view.counts.shownBefore).toBe(3);
    expect(view.counts.withinWindow).toBe(2);
    expect(view.counts.notShown).toBe(2);
    expect(view.headline).toBe(
      "3 of 5 sales in this period were shown in IRIS before their status changed (60%).",
    );
    const figure = (id: string) => view.figures.find((f) => f.id === id);
    expect(figure("led")).toMatchObject({ value: "3 of 5", of: "60% of the period's sales" });
    expect(figure("window")).toMatchObject({ value: "2 of 5", of: "40%, the IRIS-assisted rule" });
    /* Showings 3, 1, 1: median 1. Days to the change 1, 20, 0: median 1. */
    expect(figure("showings")).toMatchObject({ value: "1", of: "across 3 IRIS-led sales" });
    expect(figure("gap")).toMatchObject({ value: "1 day", of: "across 3 IRIS-led sales" });
    /* m1, m2, m3 for A-1; m2 again for B-2; m6 for F-6. */
    expect(view.verdictMeetings).toBe(4);
  });

  it("lists the shown sales newest change first, and the never-shown ones beside them", () => {
    expect(view.sales.map((s) => s.id)).toEqual(["R-2", "W-1", "R-1"]);
    expect(view.neverShown.map((s) => s.id)).toEqual(["unit:G-7", "R-3"]);
    expect(view.neverShownNote).toBe(
      "2 of 5 sales in this period had no IRIS presentation open the flat before the change. They are in the denominator above.",
    );
  });

  it("colours by presenter in name order and places the timeline on a stretched scale", () => {
    expect(view.agents.map((a) => [a.name, a.index])).toEqual([
      ["Anna Test", 0],
      ["Bela Test", 1],
    ]);
    /* The longest gap is m1 to R-1, 21 days: position = 1 - ln(1 + days) / ln(22). */
    const a1 = row("R-1")?.showings ?? [];
    expect(a1[0]?.position).toBeCloseTo(0, 6);
    expect(a1[2]?.position).toBeCloseTo(1 - Math.LN2 / Math.log(22), 6);
    expect(view.axis.windowStart).toBeCloseTo(1 - Math.log(4) / Math.log(22), 6);
    expect(view.axis.ticks.map((t) => t.label)).toEqual(["Change", "72 h", "1 week"]);
    expect(a1[0]?.label).toBe("A-1 shown 20 Aug by Anna Test, 21 days before the reservation.");
  });

  it("names where it read from, and what", () => {
    expect(view.source).toEqual({
      connector: "realpad",
      name: "REALPAD",
      readAtDisplay: "30 Sept",
      reads: [
        "deal stages, and the date it states for each reservation and purchase",
        "unit availability from the uploaded sheet, a change dated by the sync that first saw it",
      ],
      note: "Read from REALPAD, last read 30 Sept: deal stages, and the date it states for each reservation and purchase; unit availability from the uploaded sheet, a change dated by the sync that first saw it. Showings are read from every IRIS meeting on this project, whatever the period.",
    });
    expect(view.tableCaption).toBe(
      "3 sales shown in IRIS before their status changed, newest change first. Each date is the CRM's where it states one, else the sync that first saw the change.",
    );
  });

  it("asserts no cause anywhere", () => {
    const rows = [...view.sales, ...view.neverShown];
    for (const prose of [
      view.headline,
      view.definition,
      view.caveat,
      view.neverShownNote,
      view.unplacedNote ?? "",
      view.axis.caption,
      ...view.figures.flatMap((f) => [f.label, f.value, f.of]),
      ...rows.flatMap((r) => [r.statement, ...r.showings.map((s) => s.label)]),
    ]) {
      expect(prose, prose).not.toMatch(CAUSAL);
    }
    expect(view.caveat).toContain("Sequence, not cause.");
    expect(view.caveat).toContain("not linked to the visitor in the room");
  });
});

describe("below the sample floor, and with nothing connected", () => {
  it("gives counts without shares below the policy's minimum", () => {
    const view = build(
      {
        ...DEALS,
        deals: DEALS.deals.filter((d) => d.externalId === "R-1" || d.externalId === "R-3"),
      },
      { ...CATALOGUE, connector: null, units: [] },
    );
    expect(view.counts.sales).toBe(2);
    expect(view.headline).toBe(
      "1 of 2 sales in this period was shown in IRIS before its status changed. A share is stated from 5 sales.",
    );
    expect(view.figures.find((f) => f.id === "led")).toMatchObject({
      value: "1 of 2",
      of: "no share below 5 sales",
    });
    expect(view.figures.map((f) => f.of).join(" ")).not.toMatch(/%/);
  });

  it("says no CRM is connected rather than drawing an empty period", () => {
    const view = build(null, { ...CATALOGUE, connector: null, statusObservedAt: {} });
    expect(view.source).toBeNull();
    expect(view.figures).toEqual([]);
    expect(view.headline).toBe(
      "No CRM is connected to this project, so there is no sale to place against a showing.",
    );
  });

  it("reads a delivered catalogue alone as a connection: availability changes are sales", () => {
    const view = build(null);
    expect(view.source?.name).toBe("the catalogue from the uploaded sheet");
    expect(view.counts.sales).toBe(1);
    expect(view.neverShown.map((s) => s.id)).toEqual(["unit:G-7"]);
  });
});

describe("on Shark Residence, through the repository", () => {
  const shark = PROJECTS.find((p) => p.slug === "shark-residence");
  const query: OverviewQuery = {
    viewer: VIEWERS.developerShark as Viewer,
    tenantSlug: "shark",
    projectSlug: "shark-residence",
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  };

  it("counts the demonstration CRM's sales dated in the quarter, as the deals themselves say", async () => {
    const view = await new SyntheticObserverRepository().getIrisLedSales(query);
    const sessions = sessionsForProject(shark?.id as string);
    const from = Date.parse(view.context.period.from);
    const inQuarter = syntheticDeals(sessions, TODAY).deals.filter(
      (d) =>
        (d.stage === "reservation" || d.stage === "purchase") &&
        d.stageEnteredAt !== null &&
        Date.parse(d.stageEnteredAt) >= from,
    );
    expect(view.source?.name).toBe("the demonstration CRM");
    expect(view.counts.sales).toBe(inQuarter.filter((d) => d.unitCode !== null).length);
    expect(view.counts.unplacedNoUnit).toBe(inQuarter.filter((d) => d.unitCode === null).length);
    expect(view.counts.sales).toBe(view.sales.length + view.neverShown.length);

    /* Each sale's showings, recounted from the meetings: every one opened the flat at or before the change. */
    for (const sale of view.sales) {
      const deal = inQuarter.find((d) => d.externalId === sale.id);
      const at = Date.parse(deal?.stageEnteredAt ?? "");
      const expected = sessions.filter(
        (s) => Date.parse(s.startedAt) <= at && s.units.some((u) => u.unitCode === sale.unitCode),
      );
      expect(sale.showings.length, sale.unitCode).toBe(expected.length);
    }
  });

  it("refuses a reader who does not hold the project", async () => {
    await expect(
      new SyntheticObserverRepository().getIrisLedSales({
        ...query,
        viewer: VIEWERS.developer as Viewer,
      }),
    ).rejects.toThrow();
  });
});
