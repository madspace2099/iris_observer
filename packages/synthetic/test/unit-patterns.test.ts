import { afterEach, describe, expect, it } from "vitest";

import type { ShowroomSession } from "@observer/contracts";
import {
  DEFAULT_LANGUAGE,
  type AssistedSale,
  type OverviewQuery,
  type Viewer,
} from "@observer/readmodels";

import { SyntheticObserverRepository, VIEWERS } from "../src";
import { catalogueFor, provideCatalogue, type RawUnit } from "../src/pulse";
import { buildUnitAttentionPatterns, type UnitPatternSales } from "../src/showroom/unit-patterns";
import { viewContext } from "./view-context";

/**
 * WHAT THE MOST-OPENED FLATS SHARE (ADR-0051). Every figure below is worked out
 * by hand from the catalogue and the meetings in this file, never read back from
 * the function under test.
 *
 * Twelve flats: block A faces south, block B north; floors 1 to 6, one flat per
 * block on each; one room on floors 1–2, two on 3–5, three on 6. Price is
 * €100,000 + €10,000 a floor + €5,000 in block A.
 */
const PROJECT_ID = "prj_patterns001";

function unit(block: "A" | "B", floor: number, status: RawUnit["status"] = "available"): RawUnit {
  const rooms = floor <= 2 ? 1 : floor <= 5 ? 2 : 3;
  const area = rooms === 1 ? 39 + floor : rooms === 2 ? 52 + 2 * floor : 80;
  return {
    code: `${block}-${String(floor)}01`,
    block,
    floor,
    rooms,
    areaSqm: area,
    orientation: block === "A" ? "S" : "N",
    price: 100_000 + floor * 10_000 + (block === "A" ? 5_000 : 0),
    status,
  };
}

const CATALOGUE: RawUnit[] = [1, 2, 3, 4, 5, 6].flatMap((floor) => [
  unit("A", floor, floor === 4 ? "sold" : floor === 5 ? "reserved" : "available"),
  unit("B", floor, floor === 1 ? "sold" : "available"),
]);

/** Meetings opened per flat; B-401 is shortlisted once, which orders its tie with A-601. */
const OPENINGS: Record<string, number> = {
  "A-301": 6,
  "A-401": 5,
  "A-501": 4,
  "B-401": 3,
  "A-601": 3,
  "B-101": 1,
};

function sessions(total: number, openings: Record<string, number> = OPENINGS): ShowroomSession[] {
  return Array.from({ length: total }, (_, i): ShowroomSession => ({
    sessionId: `s${String(i)}`,
    meetingId: `m${String(i)}`,
    projectId: PROJECT_ID,
    agentId: "agt_test",
    channel: "showroom",
    contactId: null,
    startedAt: `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
    endedAt: `2026-08-${String(i + 1).padStart(2, "0")}T11:00:00.000Z`,
    durationSeconds: 3600,
    outcome: "interested",
    steps: [],
    units: Object.entries(openings)
      .filter(([, n]) => n > i)
      .map(([code]) => ({
        unitId: code,
        unitCode: code,
        views: 1,
        dwellSeconds: 60,
        longestViewSeconds: 60,
        favourited: code === "B-401" && i === 0,
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
  }));
}

const SOLD_IN_WINDOW: AssistedSale = {
  externalId: "deal-1",
  unitCode: "A-401",
  unitHref: null,
  stage: "purchase",
  stageLabel: "Purchase",
  stageDateDisplay: "12 Aug 2026",
  dateBasis: "crm_stated",
  verdict: "shown_in_window",
  verdictLabel: "IRIS-assisted sale",
  lagHours: 20,
  lagDisplay: "20 hours before",
  lagShort: "20 hours",
  windowShare: 0.7,
  meetingHref: null,
  statement: "IRIS-assisted sale.",
};

/* A-401 has a dated sale; A-501 is reserved with no date in the CRM. */
const SALES: UnitPatternSales = {
  connected: true,
  demonstration: false,
  windowHours: 72,
  saleOf: (code) => (code === "A-401" ? SOLD_IN_WINDOW : null),
};

const context = () =>
  viewContext({
    project: { id: PROJECT_ID, slug: "patterns", locale: "en-GB", currency: "EUR" },
    tenant: { slug: "test" },
  });

afterEach(() => provideCatalogue(PROJECT_ID, null));

describe("what the most-opened flats share", () => {
  it("ranks by meetings, a tie by shortlisting, and says so", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const view = buildUnitAttentionPatterns(context(), sessions(10), SALES);

    expect(view.state).toBe("ok");
    expect(view.meetings).toBe(10);
    expect(view.opened).toBe(6);
    expect(view.top.map((f) => [f.unitCode, f.meetings])).toEqual([
      ["A-301", 6],
      ["A-401", 5],
      ["A-501", 4],
      ["B-401", 3],
      ["A-601", 3],
    ]);
    expect(view.ranking).toBe(
      "A-301 (6 of 10 meetings), A-401 (5), A-501 (4), B-401 (3), A-601 (3)",
    );
    expect(view.tieNote).toBe(
      "B-401 and A-601 were each opened in 3 meetings. A tie is ordered by times shortlisted, then by unit code, and the list stops at 5.",
    );
    expect(view.top[0]?.href).toBe("/test/patterns/units/A-301");
  });

  it("reports an attribute the top concentrates on, against the whole catalogue", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const view = buildUnitAttentionPatterns(context(), sessions(10), SALES);

    /*
     * South and block A pick the same four flats out of the top and the same six
     * out of the catalogue: one fact, said once. Two rooms: A-301, A-401, A-501
     * and B-401, against the six flats on floors 3–5.
     */
    expect(view.patterns.map((p) => p.statement)).toEqual([
      "4 of the 5 most-opened flats face south and are in block A, against 50% of the 12 flats in the catalogue.",
      "4 of the 5 have two rooms, against 50% of the 12 flats in the catalogue.",
    ]);
    expect(view.patterns[0]?.unitCodes).toEqual(["A-301", "A-401", "A-501", "A-601"]);
    expect(view.patterns[1]).toMatchObject({
      topCount: 4,
      topTotal: 5,
      baseCount: 6,
      baseTotal: 12,
    });

    /*
     * Floors 3, 4, 5, 4, 6: three on the middle storeys (3–4) is 60%, under the
     * bar. So are the prices (three of five in €130,000–€145,000) and the areas.
     * Each is said as the span the flats cover instead.
     */
    expect(view.ranges).toEqual([
      "The most-opened flats stand on floors 3 to 6; 67% of the 12 flats in the catalogue fall in that range.",
      "The most-opened flats are priced from €135,000 to €165,000; 58% of the 12 flats in the catalogue fall in that range.",
      "The most-opened flats measure from 58 to 80 m²; 67% of the 12 flats in the catalogue fall in that range.",
    ]);
    expect(view.note).toBeNull();
  });

  it("states conversion by the catalogue's status and each flat's own dated sale", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const view = buildUnitAttentionPatterns(context(), sessions(10), SALES);
    expect(view.conversion).toEqual([
      "2 of the 5 are reserved or sold now, against 25% of the 12 flats in the catalogue.",
      "Of the 1 whose sale the CRM dates, 1 followed an IRIS showing within 72 hours.",
      "The CRM states no sale date for A-501, so it cannot be placed against a showing.",
    ]);
    expect(view.top.find((f) => f.unitCode === "A-401")?.sale?.verdictLabel).toBe(
      "IRIS-assisted sale",
    );

    const noCrm = buildUnitAttentionPatterns(context(), sessions(10), {
      ...SALES,
      connected: false,
    });
    expect(noCrm.conversion[1]).toBe(
      "No CRM is connected to this project, so none of their sales can be placed against a showing.",
    );
  });

  it("never puts an unstated attribute in a band", () => {
    /*
     * Block A states no aspect: as a value of its own it would be four of five
     * against half. B-501 states no price, so the prices are read over the 11
     * that do: €135,000–€165,000 holds 135, 140, 145, 155, 160 and 165.
     */
    provideCatalogue(
      PROJECT_ID,
      CATALOGUE.map((u) =>
        u.block === "A"
          ? { ...u, orientation: null }
          : u.code === "B-501"
            ? { ...u, price: null }
            : u,
      ),
    );
    const view = buildUnitAttentionPatterns(context(), sessions(10), SALES);
    expect(view.patterns.map((p) => p.statement)).toContain(
      "4 of the 5 most-opened flats are in block A, against 50% of the 12 flats in the catalogue.",
    );
    expect(view.patterns.some((p) => /face|null/.test(p.statement))).toBe(false);
    expect(view.top[0]?.attributesDisplay).toContain("Aspect not stated");
    expect(view.ranges).toContain(
      "The most-opened flats are priced from €135,000 to €165,000; 55% of the 11 priced flats in the catalogue fall in that range.",
    );
  });

  it("says plainly when the flats share nothing the catalogue does not", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const spread = { "B-101": 5, "A-201": 4, "B-301": 3, "A-401": 2, "B-501": 1 };
    const view = buildUnitAttentionPatterns(context(), sessions(10, spread), SALES);
    expect(view.patterns).toEqual([]);
    expect(view.note).toBe(
      "The 5 most-opened flats share no single attribute more than the catalogue does.",
    );
  });

  it("compares nothing below the sample floor, and says how far short", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const thin = buildUnitAttentionPatterns(context(), sessions(9), SALES);
    expect(thin.state).toBe("insufficient");
    expect(thin.patterns).toEqual([]);
    expect(thin.conversion).toEqual([]);
    expect(thin.note).toBe(
      "Only 9 meetings in the period, 1 short of the 10 a pattern needs, so no attribute is compared.",
    );
    /* The flats are still listed, as raw counts. */
    expect(thin.top).toHaveLength(5);

    const narrow = buildUnitAttentionPatterns(
      context(),
      sessions(10, { "A-301": 10, "B-301": 2 }),
      SALES,
    );
    expect(narrow.state).toBe("insufficient");
    expect(narrow.note).toBe(
      "Only 2 flats were opened in the period; a pattern needs at least 3, so no attribute is compared.",
    );
  });
});

describe("on Shark Residence, quarter to date", () => {
  const query: OverviewQuery = {
    viewer: VIEWERS.developerShark as Viewer,
    tenantSlug: "shark",
    projectSlug: "shark-residence",
    period: "quarter_to_date",
    language: DEFAULT_LANGUAGE,
  };

  it("leads with what the five most-opened flats share, in descending order", async () => {
    const repo = new SyntheticObserverRepository();
    const view = await repo.getUnitAttentionPatterns(query);
    const slice = await repo.getSessionSlice(query);

    /* Recounted from the period's meetings, not read from the view. */
    const opened = (code: string) =>
      slice.sessions.filter((s) => s.units.some((u) => u.unitCode === code)).length;
    expect(view.meetings).toBe(slice.sessions.length);
    expect(view.top.map((f) => f.unitCode)).toEqual(["S-503", "S-403", "S-603", "S-501", "H-401"]);
    for (const flat of view.top) expect(flat.meetings, flat.unitCode).toBe(opened(flat.unitCode));
    const counts = view.top.map((f) => f.meetings);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(view.ranking).toBe(
      `S-503 (29 of ${String(slice.sessions.length)} meetings), S-403 (23), S-603 (22), S-501 (22), H-401 (18)`,
    );

    /* The catalogue's shares, counted here from the catalogue itself. */
    const catalogue = catalogueFor("prj_sharkres001");
    const pct = (n: number) => `${String(Math.round((100 * n) / catalogue.length))}%`;
    const middle = catalogue.filter((u) => u.floor !== null && u.floor >= 4 && u.floor <= 7);
    const twoRoom = catalogue.filter((u) => u.rooms === 2);
    const south = catalogue.filter((u) => u.orientation === "S");
    expect(view.patterns.map((p) => p.statement)).toEqual([
      `All 5 most-opened flats are on the middle floors, 4 to 7, against ${pct(middle.length)} of the 60 flats in the catalogue.`,
      `All 5 have two rooms, against ${pct(twoRoom.length)} of the 60 flats in the catalogue.`,
      `4 of the 5 face south and are in block S, against ${pct(south.length)} of the 60 flats in the catalogue.`,
    ]);
    const held = catalogue.filter((u) => u.status !== "available");
    expect(view.conversion[0]).toBe(
      `4 of the 5 are reserved or sold now, against ${pct(held.length)} of the 60 flats in the catalogue.`,
    );
    /* The demonstration CRM's deals are made from meetings, and the reader is told. */
    expect(view.caveats.join(" ")).toMatch(/demonstration CRM makes each of its deals/);
  });
});
