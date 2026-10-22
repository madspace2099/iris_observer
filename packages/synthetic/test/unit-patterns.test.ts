import { afterEach, describe, expect, it } from "vitest";

import type { ShowroomSession } from "@observer/contracts";
import { DEFAULT_LANGUAGE, type OverviewQuery, type Viewer } from "@observer/readmodels";

import { SyntheticObserverRepository, VIEWERS } from "../src";
import type { PlacedSale } from "../src/deals";
import { catalogueFor, provideCatalogue, type RawUnit } from "../src/pulse";
import {
  bandChance,
  buildUnitAttentionPatterns,
  spanChance,
  type UnitPatternSales,
} from "../src/showroom/unit-patterns";
import { viewContext } from "./view-context";

/**
 * WHAT THE MOST-OPENED FLATS SHARE (ADR-0051). Every figure below is worked out
 * by hand from the catalogue and the meetings in this file, never read back from
 * the function under test.
 *
 * Twelve flats: block A faces south, block B north; floors 1 to 6, one flat per
 * block on each; one room on floors 1–2, two on 3–5, three on 6. Area is 39 m²
 * plus the floor for one room, 52 m² plus twice the floor for two, 80 m² for
 * three. Price is €100,000 + €10,000 a floor + €5,000 in block A. Sold: A-301,
 * A-601, B-101; reserved: A-501.
 */
const PROJECT_ID = "prj_patterns001";

function unit(block: "A" | "B", floor: number): RawUnit {
  const rooms = floor <= 2 ? 1 : floor <= 5 ? 2 : 3;
  const code = `${block}-${String(floor)}01`;
  return {
    code,
    block,
    floor,
    rooms,
    areaSqm: rooms === 1 ? 39 + floor : rooms === 2 ? 52 + 2 * floor : 80,
    orientation: block === "A" ? "S" : "N",
    price: 100_000 + floor * 10_000 + (block === "A" ? 5_000 : 0),
    status: ["A-301", "A-601", "B-101"].includes(code)
      ? "sold"
      : code === "A-501"
        ? "reserved"
        : "available",
  };
}

const CATALOGUE: RawUnit[] = [1, 2, 3, 4, 5, 6].flatMap((floor) => [
  unit("A", floor),
  unit("B", floor),
]);

/** Meetings opened per flat; B-501 is shortlisted once, which orders its tie with A-301. */
const OPENINGS: Record<string, number> = {
  "A-501": 6,
  "B-601": 5,
  "A-601": 4,
  "B-501": 3,
  "A-301": 3,
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
        favourited: code === "B-501" && i === 0,
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

function sale(
  unitCode: string,
  stage: "reservation" | "purchase",
  at: string,
  verdict: PlacedSale["verdict"],
  dateBasis: PlacedSale["dateBasis"] = "crm_stated",
): PlacedSale {
  const day = new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return {
    at: Date.parse(at),
    externalId: `deal-${unitCode}`,
    unitCode,
    unitHref: null,
    stage,
    stageLabel: stage === "purchase" ? "Purchase" : "Reservation",
    stageDateDisplay: day,
    dateBasis,
    verdict,
    verdictLabel: verdict,
    lagHours: null,
    lagDisplay: "",
    lagShort: "",
    windowShare: 0,
    meetingHref: null,
    statement: "",
  };
}

/*
 * The period opens on 1 August. A-601's purchase is in it; B-601's reservation
 * came before it, dated by the sync, on a flat the catalogue still lists; A-501
 * has a sale the CRM does not date; A-301 is sold with no CRM sale at all.
 */
const SALES: UnitPatternSales = {
  connected: true,
  demonstration: false,
  windowHours: 72,
  saleOf: (code) =>
    code === "A-601"
      ? sale("A-601", "purchase", "2026-08-09T12:00:00.000Z", "shown_in_window")
      : code === "B-601"
        ? sale(
            "B-601",
            "reservation",
            "2026-07-20T12:00:00.000Z",
            "shown_earlier",
            "first_observed",
          )
        : code === "A-501"
          ? "undated"
          : null,
};

const context = () =>
  viewContext({
    project: { id: PROJECT_ID, slug: "patterns", locale: "en-GB", currency: "EUR" },
    tenant: { slug: "test" },
    period: { from: "2026-08-01T00:00:00.000Z" },
  });

afterEach(() => provideCatalogue(PROJECT_ID, null));

describe("the chance a line is said against", () => {
  it("is the binomial tail for a band and the sample range for a span", () => {
    /* 4 of 5 in half the catalogue: 5·(1/2)^5 + (1/2)^5 = 6/32. */
    expect(bandChance(4, 5, 0.5)).toBeCloseTo(0.1875, 10);
    expect(bandChance(5, 5, 0.5)).toBeCloseTo(1 / 32, 10);
    /* 4 of 5 in a third: 5·(1/3)^4·(2/3) + (1/3)^5 = 11/243. */
    expect(bandChance(4, 5, 1 / 3)).toBeCloseTo(11 / 243, 10);
    /* Five flats inside 35% of the catalogue: 5·0.35^4 − 4·0.35^5. */
    expect(spanChance(5, 0.35)).toBeCloseTo(0.0540225, 6);
  });
});

describe("what the most-opened flats share", () => {
  it("ranks by meetings, a tie by shortlisting, and says so", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const view = buildUnitAttentionPatterns(context(), sessions(10), SALES);

    expect(view.state).toBe("ok");
    expect(view.meetings).toBe(10);
    expect(view.opened).toBe(6);
    expect(view.top.map((f) => [f.unitCode, f.meetings])).toEqual([
      ["A-501", 6],
      ["B-601", 5],
      ["A-601", 4],
      ["B-501", 3],
      ["A-301", 3],
    ]);
    expect(view.ranking).toBe(
      "A-501 (6 of 10 meetings), B-601 (5), A-601 (4), B-501 (3), A-301 (3)",
    );
    expect(view.tieNote).toBe(
      "B-501 and A-301 were each opened in 3 meetings. A tie is ordered by times shortlisted, then by unit code, and the list stops at 5.",
    );
    expect(view.top[0]?.href).toBe("/test/patterns/units/A-501");
    expect(view.top[0]?.attributesDisplay).toBe(
      "2 rooms · 62 m² · facing south · floor 5 · block A · €155,000",
    );
  });

  it("says a band only where chance would rarely fill it, and names the exception", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const view = buildUnitAttentionPatterns(context(), sessions(10), SALES);

    /*
     * Floors 5, 6, 6, 5, 3: four of five on the upper storeys (5–6), which hold
     * 4 of the 12 flats; chance fills that 11/243 of the time. South and block A
     * are three of five each, under the 70% bar.
     */
    expect(view.patterns.map((p) => p.statement)).toEqual([
      "4 of the 5 most-opened flats are on the upper floors, 5 to 6 (all but A-301), against 33% of the 12 flats in the catalogue.",
    ]);
    expect(view.patterns[0]).toMatchObject({
      topCount: 4,
      topTotal: 5,
      baseCount: 4,
      baseTotal: 12,
      baseNoun: "flats in the catalogue",
      unitCodes: ["A-501", "B-601", "A-601", "B-501"],
    });

    /*
     * Prices €135,000–€165,000 hold 7 of the 12 (A 135–165, B 140–160); areas
     * 58–80 m² hold the 8 flats on floors 3–6. Five flats drawn at random span
     * that little most of the time, so each is a range, not a pattern.
     */
    expect(view.ranges).toEqual([
      "They are priced €135,000 to €165,000, a range that holds 58% of the catalogue.",
      "They measure 58 to 80 m², a range that holds 67% of the catalogue.",
    ]);
    expect(view.note).toBeNull();
  });

  it("does not say four of five in half the catalogue, which chance gives one time in five", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    /* A-301, A-401, A-501, A-601 and B-401: four in block A, facing south, against six of twelve. */
    const view = buildUnitAttentionPatterns(
      context(),
      sessions(10, { "A-301": 6, "A-401": 5, "A-501": 4, "A-601": 3, "B-401": 2 }),
      SALES,
    );
    expect(view.patterns.map((p) => p.id)).toEqual([]);
  });

  it("merges two attributes only where the flats, the base and its size agree", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const allA = {
      "A-101": 5,
      "A-201": 4,
      "A-301": 2,
      "A-401": 2,
      "A-501": 2,
      "B-101": 2,
      "B-201": 2,
    };
    const view = buildUnitAttentionPatterns(context(), sessions(10, allA), SALES);
    /* All five in block A, facing south: six of twelve, so chance gives it 1/32. */
    expect(view.patterns.map((p) => p.statement)).toEqual([
      "All 5 most-opened flats face south and are in block A, against 50% of the 12 flats in the catalogue.",
    ]);
    expect(view.tieNote).toBe(
      "A-301, A-401, A-501 and 2 more were each opened in 2 meetings. A tie is ordered by times shortlisted, then by unit code, and the list stops at 5.",
    );

    /*
     * B-101 states no aspect: south is then 6 of the 11 that state one, block A
     * still 6 of 12. The same six flats, two denominators: two lines.
     */
    provideCatalogue(
      PROJECT_ID,
      CATALOGUE.map((u) => (u.code === "B-101" ? { ...u, orientation: null } : u)),
    );
    const split = buildUnitAttentionPatterns(context(), sessions(10, allA), SALES);
    expect(split.patterns.map((p) => p.statement)).toEqual([
      "All 5 most-opened flats are in block A, against 50% of the 12 flats in the catalogue.",
      "All 5 face south, against 55% of the 11 flats in the catalogue that state an aspect.",
    ]);
    expect(split.patterns[1]?.baseNoun).toBe("flats in the catalogue that state an aspect");

    /* A studio is a studio, not a flat with "no rooms". */
    provideCatalogue(
      PROJECT_ID,
      CATALOGUE.map((u) => (u.block === "A" ? { ...u, rooms: 0 } : u)),
    );
    const studios = buildUnitAttentionPatterns(context(), sessions(10, allA), SALES);
    expect(studios.patterns[0]?.statement).toBe(
      "All 5 most-opened flats are studios, face south and are in block A, against 50% of the 12 flats in the catalogue.",
    );
    expect(studios.patterns[0]?.label).toBe("Studios · Facing south · Block A");
  });

  it("states conversion by the catalogue's status and each flat's own sale, split at the period", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const view = buildUnitAttentionPatterns(context(), sessions(10), SALES);
    /* Held in the top: A-501, A-601, A-301; in the catalogue: those and B-101, 4 of 12. */
    expect(view.conversion).toEqual([
      "3 of the 5 are reserved or sold now, against 33% of the catalogue.",
      "A-601's purchase (9 Aug) followed an IRIS showing within 72 hours.",
      "B-601's reservation (20 Jul) predates the period; the catalogue still lists B-601 as available.",
      "The CRM holds a sale of A-501 with no date, so it cannot be placed against a showing.",
      "The CRM holds no sale of A-301; the catalogue lists it as reserved or sold.",
    ]);
    expect(view.salesNote).toBe(
      "The CRM states no date for the sale of B-601, so it is dated by the sync that first saw it, up to one sync late: the time after a showing reads longer than it was, never shorter.",
    );
    expect(view.top.find((f) => f.unitCode === "B-601")?.sale).toMatchObject({
      beforePeriod: true,
      dateBasis: "first_observed",
    });

    /* Three sales in the period: one sentence, the still-listed flat inside it. */
    const inPeriod = buildUnitAttentionPatterns(context(), sessions(10), {
      ...SALES,
      saleOf: (code) =>
        code === "A-601"
          ? sale("A-601", "purchase", "2026-08-09T12:00:00.000Z", "shown_in_window")
          : code === "B-601"
            ? sale("B-601", "reservation", "2026-08-20T12:00:00.000Z", "shown_earlier")
            : code === "A-501"
              ? sale("A-501", "reservation", "2026-08-21T12:00:00.000Z", "not_shown")
              : null,
    });
    expect(inPeriod.conversion[1]).toBe(
      "Of the 3 sales dated since the period began, 1 followed an IRIS showing within 72 hours; 1 was shown earlier; 1 was not shown in IRIS before it; the catalogue still lists B-601 as available.",
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
     * Block A states no aspect, so the aspects stated are block B's: north, two
     * of the five. B-501 states no price, so the prices are read over the 11
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
    expect(view.patterns.some((p) => /face|null/.test(p.statement))).toBe(false);
    expect(view.top[0]?.attributesDisplay).toContain("aspect not stated");
    expect(view.ranges).toContain(
      "They are priced €135,000 to €165,000, a range that holds 55% of the 11 priced flats in the catalogue; 1 of the 5 does not state it.",
    );
  });

  it("says plainly when the flats share nothing chance would not give", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const spread = { "B-101": 5, "A-201": 4, "B-301": 3, "A-401": 2, "B-501": 1 };
    const view = buildUnitAttentionPatterns(context(), sessions(10, spread), SALES);
    expect(view.patterns).toEqual([]);
    expect(view.note).toBe(
      "The 5 most-opened flats share no single attribute more than the 12 flats in the catalogue do.",
    );
    /* Floors 1–5 hold 10 of 12; prices €110,000–€150,000 hold 9; 40–62 m² hold 10. */
    expect(view.ranges).toEqual([
      "They stand on floors 1 to 5, a range that holds 83% of the catalogue.",
      "They are priced €110,000 to €150,000, a range that holds 75% of the catalogue.",
      "They measure 40 to 62 m², a range that holds 83% of the catalogue.",
    ]);
    expect(view.conversion[0]).toBe(
      "1 of the 5 is reserved or sold now, against 33% of the catalogue.",
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

    expect(buildUnitAttentionPatterns(context(), sessions(1), SALES).note).toBe(
      "Only 1 meeting in the period, 9 short of the 10 a pattern needs, so no attribute is compared.",
    );
    expect(buildUnitAttentionPatterns(context(), [], SALES).note).toBe(
      "No meetings were recorded in the period, so no attribute is compared.",
    );

    const narrow = buildUnitAttentionPatterns(
      context(),
      sessions(10, { "A-301": 10, "B-301": 2 }),
      SALES,
    );
    expect(narrow.state).toBe("insufficient");
    expect(narrow.note).toBe(
      "Only 2 flats were opened in the period; a pattern needs at least 3, so no attribute is compared.",
    );
    expect(buildUnitAttentionPatterns(context(), sessions(10, { "A-301": 10 }), SALES).note).toBe(
      "Only 1 flat was opened in the period; a pattern needs at least 3, so no attribute is compared.",
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
    const within = (pick: (u: RawUnit) => number | null, low: number, high: number) =>
      catalogue.filter((u) => {
        const v = pick(u);
        return v !== null && v >= low && v <= high;
      }).length;
    const area = within((u) => u.areaSqm, 59, 65);
    const middle = within((u) => u.floor, 4, 7);
    const twoRoom = catalogue.filter((u) => u.rooms === 2).length;
    const priced = within((u) => u.price, 191_000, 218_000);
    expect(view.patterns.map((p) => p.statement)).toEqual([
      `All 5 most-opened flats measure 59 to 65 m², against ${pct(area)} of the 60 flats in the catalogue.`,
      `All 5 are on the middle floors, 4 to 7, against ${pct(middle)} of the catalogue.`,
      `All 5 have two rooms, against ${pct(twoRoom)} of the catalogue.`,
    ]);
    /* The owner's own example: the price they share, against the catalogue's share in it. */
    expect(view.ranges).toEqual([
      `They are priced €191,000 to €218,000, a range that holds ${pct(priced)} of the catalogue.`,
    ]);

    const held = catalogue.filter((u) => u.status !== "available");
    expect(view.conversion[0]).toBe(
      `4 of the 5 are reserved or sold now, against ${pct(held.length)} of the catalogue.`,
    );
    /* H-401 (26 Mar) and S-501 (10 Feb) were sold or reserved before the quarter's meetings. */
    expect(view.conversion).toContain(
      "S-501's reservation (10 Feb) and H-401's purchase (26 Mar) predate the period.",
    );
    /* The demonstration CRM's deals are made from meetings, and the reader is told. */
    expect(view.salesNote).toMatch(/demonstration CRM makes each of its deals/);
  });
});
