import { describe, expect, it } from "vitest";

import type { CrmDeal, ShowroomSession } from "@observer/contracts";
import type { IrisAssistPolicy } from "@observer/metrics";
import type { DeliveredDeals } from "@observer/readmodels";

import { buildAssistedSales } from "../src/deals";

/**
 * Every expectation here is worked out by hand from the dates below. The rule
 * under test is about ORDER and ELAPSED TIME, so the cases sit on its edges:
 * exactly on the window, a minute past it, a showing after the sale, and the
 * sales the rule must refuse to place.
 */

const POLICY: IrisAssistPolicy = {
  version: "1.0.0",
  effectiveFrom: "2026-09-17T00:00:00.000+00:00",
  tenantId: null,
  windowHours: 72,
  minimumSales: 5,
};

function meeting(id: string, startedAt: string, ...codes: string[]): ShowroomSession {
  return {
    sessionId: id,
    meetingId: id,
    projectId: "prj_x",
    agentId: "agt_x",
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

const delivered = (deals: CrmDeal[]): DeliveredDeals => ({
  connector: "realpad",
  deals,
  fetchedAt: "2026-09-17T12:00:00.000Z",
});

const build = (deals: DeliveredDeals | null, sessions: ShowroomSession[]) =>
  buildAssistedSales(
    deals,
    sessions,
    POLICY,
    "en-GB",
    "Europe/Bratislava",
    (code) => (code === "A-1" ? "/alpha/x/units/A-1" : null),
    (id) => `/alpha/x/meetings/${id}`,
  );

describe("which sales followed a showing", () => {
  const sessions = [
    meeting("m-early", "2026-08-01T10:00:00.000Z", "A-1", "B-2"),
    meeting("m-late", "2026-09-08T10:00:00.000Z", "A-1"),
    meeting("m-edge", "2026-09-07T12:00:00.000Z", "C-3"),
    meeting("m-past", "2026-09-07T11:59:00.000Z", "D-4"),
    meeting("m-after", "2026-09-12T09:00:00.000Z", "E-5"),
  ];
  const view = build(
    delivered([
      deal("R-1", "A-1", "reservation", "2026-09-10T10:00:00.000Z"),
      deal("R-2", "B-2", "purchase", "2026-09-10T10:00:00.000Z"),
      deal("R-3", "C-3", "reservation", "2026-09-10T12:00:00.000Z"),
      deal("R-4", "D-4", "reservation", "2026-09-10T12:00:00.000Z"),
      deal("R-5", "E-5", "reservation", "2026-09-11T09:00:00.000Z"),
      deal("R-6", "F-6", "reservation", null),
      deal("R-7", null, "purchase", "2026-09-10T10:00:00.000Z"),
      deal("N-1", "A-1", "negotiation", "2026-09-10T10:00:00.000Z"),
      deal("L-1", "A-1", "lost", "2026-09-10T10:00:00.000Z"),
    ]),
    sessions,
  );
  if (view.source !== "crm") throw new Error("expected a connected view");
  const bySale = new Map(view.sales.map((s) => [s.externalId, s]));

  it("counts only deals at reservation or purchase that name a unit and carry a date", () => {
    expect(view.datedSales).toBe(5);
    expect(view.unplaced, "R-6 has no date and R-7 names no unit").toBe(2);
    expect([...bySale.keys()].sort()).toEqual(["R-1", "R-2", "R-3", "R-4", "R-5"]);
  });

  it("measures from the LAST showing before the date, not the first", () => {
    /* A-1 was opened on 1 Aug and again on 8 Sep; the sale is dated 10 Sep 10:00. 48 hours. */
    const sale = bySale.get("R-1");
    expect(sale?.verdict).toBe("shown_in_window");
    expect(sale?.lagHours).toBe(48);
    expect(sale?.lagDisplay).toBe("2 days before");
    expect(sale?.meetingHref).toBe("/alpha/x/meetings/m-late");
    expect(sale?.unitHref).toBe("/alpha/x/units/A-1");
    expect(sale?.statement).toBe(
      "IRIS-assisted sale. A-1 was opened in an IRIS presentation 2 days before its reservation date.",
    );
  });

  it("states the lag of a showing that came too early, and does not count it", () => {
    /* B-2 was opened on 1 Aug 10:00; the sale is dated 10 Sep 10:00. Forty days. */
    const sale = bySale.get("R-2");
    expect(sale?.verdict).toBe("shown_earlier");
    expect(sale?.lagHours).toBe(960);
    expect(sale?.lagDisplay).toBe("40 days before");
    expect(sale?.unitHref, "a code the catalogue does not hold gets no link").toBeNull();
    expect(sale?.statement).toBe(
      "B-2 was last opened in an IRIS presentation 40 days before its purchase date, outside the 72 hours this counts.",
    );
  });

  it("includes a showing exactly on the window and excludes one a minute past it", () => {
    expect(bySale.get("R-3")?.lagHours).toBe(72);
    expect(bySale.get("R-3")?.verdict).toBe("shown_in_window");
    expect(bySale.get("R-4")?.verdict).toBe("shown_earlier");
  });

  it("never counts a showing that came after the sale", () => {
    const sale = bySale.get("R-5");
    expect(sale?.verdict).toBe("not_shown");
    expect(sale?.lagHours).toBeNull();
    expect(sale?.meetingHref).toBeNull();
    expect(sale?.statement).toBe("No IRIS presentation opened E-5 before its reservation date.");
  });

  it("states the share once there are enough dated sales, with its denominator", () => {
    expect(view.assisted).toBe(2);
    expect(view.shownEarlier).toBe(2);
    expect(view.notShown).toBe(1);
    expect(view.shareDisplay).toBe("40%");
    expect(view.headline).toBe(
      "2 of 5 dated sales (40%) followed an IRIS showing of the unit within 72 hours.",
    );
  });

  it("reads the early showings by their median and says what could not be placed", () => {
    /* The two early lags are 40 days and 3 days and a minute: median 21.5, printed as 22 days. */
    expect(view.note).toContain("2 more were shown earlier than that, a median of 22 days before");
    expect(view.note).toContain("1 was not opened in IRIS before the date at all.");
    expect(view.note).toContain("2 sales carry no stage date or name no unit");
    expect(view.note).toContain("REALPAD");
  });

  it("lists the sale soonest after its showing first, and a never-shown one last", () => {
    expect(view.sales.map((s) => s.externalId)).toEqual(["R-1", "R-3", "R-4", "R-2", "R-5"]);
  });

  it("asserts no cause anywhere", () => {
    const CAUSAL =
      /\b(because|caused|causes|causing|drives|drove|leads to|led to|results in|resulted in|due to|therefore|proves)\b/i;
    for (const prose of [view.headline, view.note, ...view.sales.map((s) => s.statement)]) {
      expect(prose, prose).not.toMatch(CAUSAL);
    }
  });
});

describe("what it refuses to say on too little", () => {
  it("gives the count and withholds the share below the minimum", () => {
    const view = build(delivered([deal("R-1", "A-1", "reservation", "2026-09-10T10:00:00.000Z")]), [
      meeting("m", "2026-09-09T10:00:00.000Z", "A-1"),
    ]);
    if (view.source !== "crm") throw new Error("expected a connected view");
    expect(view.shareDisplay).toBeNull();
    expect(view.headline).toBe(
      "1 of 1 dated sales followed an IRIS showing of the unit within 72 hours. 4 more dated sales are needed before a share is stated.",
    );
    expect(view.sales[0]?.lagDisplay).toBe("24 hours before");
  });

  it("says there is nothing to place when the CRM dates no sale", () => {
    const view = build(
      delivered([deal("N-1", "A-1", "negotiation", "2026-09-10T10:00:00.000Z")]),
      [],
    );
    if (view.source !== "crm") throw new Error("expected a connected view");
    expect(view.datedSales).toBe(0);
    expect(view.shareDisplay).toBeNull();
    expect(view.headline).toMatch(/^The CRM dates no reservation or purchase yet/);
  });

  it("says the CRM is not connected rather than reporting nought of nought", () => {
    const view = build(null, []);
    expect(view.source).toBe("not_connected");
  });
});
