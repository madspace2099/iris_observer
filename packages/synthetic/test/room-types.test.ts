import { afterAll, describe, expect, it } from "vitest";
import type { ShowroomSession } from "@observer/contracts";
import type { SegmentInterest, ViewContext } from "@observer/readmodels";
import { VIEWERS, provideCatalogue, syntheticRepository } from "@observer/synthetic";
import { buildRoomTypes } from "../src/showroom/room-types";
import { viewContext } from "./view-context";

/**
 * THE ROOM TYPES, BY HAND (ADR-0056).
 *
 * A seven-flat catalogue and forty meetings small enough to count on paper:
 * every figure below is the count written out beside it, not a figure the
 * builder produced and the test copied back.
 */

const PROJECT = "prj_roomtypes1";
provideCatalogue(PROJECT, [
  flat("A-1", 1, "sold"),
  flat("A-2", 1, "available"),
  flat("B-1", 2, "sold"),
  flat("B-2", 2, "reserved"),
  flat("B-3", 2, "available"),
  flat("B-4", 2, "available"),
  flat("C-1", 3, "available"),
]);
afterAll(() => provideCatalogue(PROJECT, null));

function flat(code: string, rooms: number, status: "sold" | "reserved" | "available") {
  return {
    code,
    block: code[0] ?? "A",
    floor: 1,
    rooms,
    areaSqm: 50,
    orientation: "S" as const,
    price: 1,
    status,
  };
}

function context(crm: boolean): ViewContext {
  return viewContext({
    tenant: { slug: "test" },
    project: {
      id: PROJECT,
      slug: "rooms",
      locale: "en-GB",
      timeZone: "UTC",
      connectedSources: crm ? ["catalogue", "crm"] : ["catalogue"],
    },
  });
}

let serial = 0;
/** A meeting on `day` of `month` (2026, UTC; August unless said) that opened the given flats. */
function meeting(day: number, codes: readonly string[], month = 8): ShowroomSession {
  serial += 1;
  const at = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T10:00:00Z`;
  return {
    sessionId: `ses_${serial}`,
    meetingId: `mtg_${serial}`,
    projectId: PROJECT,
    agentId: "agt_x",
    channel: "showroom",
    contactId: null,
    startedAt: at,
    endedAt: at,
    durationSeconds: 3600,
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

const times = <T>(k: number, make: () => T): T[] => Array.from({ length: k }, make);

/*
 * The last seven days (18–24 Aug): ten meetings, five on the 19th and five on
 * the 20th. Six opened B-1 (two-room), three of those also A-1 (one-room);
 * four opened C-1 (three-room). One-room 3/10, two-room 6/10, three-room 4/10.
 *
 * The seven days before (11–17 Aug): ten meetings, all on the 14th. Five
 * opened B-2 (two-room), five A-2 (one-room). One-room 5/10, two-room 5/10,
 * three-room 0/10.
 *
 * And one meeting on 1 July that opened nothing: the project's first, so the
 * last 30 days (26 Jul – 24 Aug) start where they say, and the 30 days before
 * them hold one meeting.
 */
const HISTORY: ShowroomSession[] = [
  ...times(3, () => meeting(19, ["B-1", "A-1"])),
  ...times(2, () => meeting(19, ["B-1"])),
  meeting(20, ["B-1"]),
  ...times(4, () => meeting(20, ["C-1"])),
  ...times(5, () => meeting(14, ["B-2"])),
  ...times(5, () => meeting(14, ["A-2"])),
  meeting(1, [], 7),
];

function segment(
  id: string,
  rooms: number,
  index: number | null,
  meetings: number,
  unitsOpened: number,
  rates: Readonly<Record<string, number>>,
): SegmentInterest {
  const label = { 1: "One-room", 2: "Two-room", 3: "Three-room" }[rooms] ?? "";
  return {
    id,
    label,
    rooms,
    index,
    meetings,
    unitsOpened,
    examinedHow: Object.entries(rates).map(([act, rate]) => ({
      id: act,
      label:
        {
          balcony: "Balcony view",
          plan: "Floor plan opened",
          floor_cut: "Floor cut",
          screenshot: "Screenshot",
          shared: "Shared",
        }[act] ?? act,
      rate,
      otherRate: 0,
    })),
  } as unknown as SegmentInterest;
}

const SEGMENTS = [
  segment("rooms-1", 1, 0.8, 25, 30, {
    balcony: 0.5,
    plan: 0.2,
    floor_cut: 0.1,
    screenshot: 0,
    shared: 0.1,
  }),
  segment("rooms-2", 2, 1.5, 25, 40, {
    balcony: 0.25,
    plan: 0.4,
    floor_cut: 0.1,
    screenshot: 0.05,
    shared: 0.1,
  }),
  segment("rooms-3", 3, 2, 5, 8, {
    balcony: 0.9,
    plan: 0.9,
    floor_cut: 0.9,
    screenshot: 0.9,
    shared: 0.9,
  }),
];

const TODAY = new Date("2026-08-24T12:00:00Z");
const view = buildRoomTypes(context(true), SEGMENTS, HISTORY, TODAY);
const window = (id: string) => {
  const w = view.windows.find((x) => x.id === id);
  if (w === undefined) throw new Error(id);
  return w;
};

describe("the stock, from the catalogue and the CRM", () => {
  it("counts each room type's flats, sold and reserved", () => {
    expect(view.types.map((t) => [t.label, t.flats, t.sold, t.reserved])).toEqual([
      ["One-room", 2, 1, 0],
      ["Two-room", 4, 1, 1],
      ["Three-room", 1, 0, 0],
    ]);
    /* 2 of 7, 4 of 7, 1 of 7; 1 of 2, 1 of 4, 0 of 1. */
    expect(view.types.map((t) => t.stockShareDisplay)).toEqual(["29%", "57%", "14%"]);
    expect(view.types.map((t) => t.soldDisplay)).toEqual([
      "1 sold · 50%",
      "1 sold · 25%",
      "0 sold · 0%",
    ]);
    expect(view.flatsDisplay).toBe("7 flats");
    expect(view.projectSoldDisplay).toBe("2 of 7 sold · 29%");
  });

  it("states sold as unavailable without a CRM, never as nought", () => {
    const none = buildRoomTypes(context(false), SEGMENTS, HISTORY, TODAY);
    expect(none.types.map((t) => [t.sold, t.reserved, t.soldDisplay])).toEqual([
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
    expect(none.soldUnavailable).toContain("none is connected");
    expect(none.readings.map((r) => [r.verdict, r.headline])).toEqual(
      times(3, () => [null, "No reading: no CRM says what sold"]),
    );
  });
});

describe("interest, window by window", () => {
  it("offers Sales Flow's windows without Today, the last 30 days first shown", () => {
    expect(view.windows.map((w) => w.label)).toEqual([
      "Last 7 days",
      "Last 30 days",
      "Last 91 days",
      "Last 182 days",
      "Last 365 days",
      "All time",
    ]);
    /* The switch's own words are the owner's: a week, a month, a quarter, a half-year, a year, total. */
    expect(view.windows.map((w) => w.name)).toEqual([
      "Week",
      "Month",
      "Quarter",
      "Half-year",
      "Year",
      "All time",
    ]);
    expect(view.defaultWindow).toBe("month");
  });

  it("shares the last seven days' meetings by room type, and moves them against the seven before", () => {
    const week = window("week");
    expect(week.meetingsDisplay).toBe("10 meetings in the last 7 days");
    expect(week.shares.map((s) => [s.opened, s.shareDisplay, s.change?.display])).toEqual([
      [3, "30%", "−20 pts"],
      [6, "60%", "+10 pts"],
      [4, "40%", "+40 pts"],
    ]);
    expect(week.changeAgainst).toBe("Change in points against the 7 days before (10 meetings).");
    expect(week.reading).toBe(
      "Two-room flats were opened in the most meetings: 60%. Then three-room 40% and one-room 30%. Three-room moved most: +40 pts.",
    );
  });

  it("does not move a window whose time before is under the floor", () => {
    /* 26 Jul – 24 Aug: the twenty in August. One-room 3+5, two-room 6+5, three-room 4, of 20. */
    const month = window("month");
    expect(month.shares.map((s) => [s.shareDisplay, s.change])).toEqual([
      ["40%", null],
      ["55%", null],
      ["20%", null],
    ]);
    expect(month.changeAgainst).toBe(
      "No change is shown: the 30 days before hold 1 meeting, 9 short of 10.",
    );
    /* 25 Jul – 24 Aug before that: nothing. */
    expect(window("quarter").changeAgainst).toBe(
      "No meeting in the 91 days before, so no change is shown.",
    );
    expect(window("all").changeAgainst).toBe("All time has no time before it to compare with.");
  });

  it("draws a stretch of the line only from its own meetings, at the floor", () => {
    /* Five 6-day stretches to 24 Aug; the 14th's ten and the 19th–20th's ten each make one point. */
    const trend = window("month").trend;
    expect(trend.parts.map((p) => [p.label, p.meetings])).toEqual([
      ["31 Jul", 0],
      ["6 Aug", 0],
      ["12 Aug", 0],
      ["18 Aug", 10],
      ["24 Aug", 10],
    ]);
    expect(trend.series.map((s) => s.values)).toEqual([
      [null, null, null, 0.5, 0.3],
      [null, null, null, 0.5, 0.6],
      [null, null, null, 0, 0.4],
    ]);
    /* What a point says when pointed at: its share of its stretch's meetings, rounded by the read model. */
    expect(trend.series[0]?.points).toEqual([
      null,
      null,
      null,
      "50% of 10 meetings",
      "30% of 10 meetings",
    ]);
    expect(trend.caption).toBe(
      "One point is one 6-day stretch. 3 with fewer than 10 meetings are left out.",
    );
    expect(trend.empty).toBeNull();
  });

  it("says why there is no line when no day reaches the floor", () => {
    expect(window("week").trend.empty).toBe(
      "Too few meetings a day to draw a line: a point needs 10, and the busiest day had 5.",
    );
  });

  it("starts a long window's line at the first meeting, and says so", () => {
    /* 1 Jul to the end of 24 Aug is 55 days: twelve stretches of 4.6, said as five. */
    expect(window("year").trend.caption).toBe(
      "One point is one 5-day stretch, from the first meeting on 1 Jul.",
    );
    expect(window("year").trend.parts).toHaveLength(12);
  });

  it("ranks nothing under the floor", () => {
    const few = buildRoomTypes(context(true), SEGMENTS, HISTORY.slice(0, 4), TODAY);
    expect(few.windows[0]?.reading).toBe(
      "4 meetings in the last 7 days: too few to rank the types, 6 short of 10.",
    );
    expect(few.windows[0]?.shares.every((s) => s.change === null)).toBe(true);
  });
});

describe("interest against sales", () => {
  it("reads each type from its index and its sold share against the project's", () => {
    /* Project 2 of 7 sold. One-room 0.80× and 1 of 2; two-room 1.50× and 1 of 4. */
    expect(
      view.readings.map((r) => [r.lookedAtDisplay, r.soldDisplay, r.verdict, r.headline]),
    ).toEqual([
      ["0.80×", "50%", "shown_less_selling", "Selling well, looked at less"],
      ["1.50×", "25%", "wanted_slow", "Wanted, but selling less"],
      ["2.00×", "0%", null, "Too few meetings for a reading"],
    ]);
    expect(view.readings[2]?.basis).toBe("5 meetings opened one · 15 short of 20");
    expect(view.soldAgainst).toBe("Sold, against the project's 29%");
  });

  it("gives no reading to a type nobody looked at", () => {
    const unseen = SEGMENTS.map((s) => (s.id === "rooms-1" ? { ...s, index: null } : s));
    const r = buildRoomTypes(context(true), unseen, HISTORY, TODAY).readings[0];
    expect([r?.verdict, r?.headline, r?.lookedAtDisplay]).toEqual([
      null,
      "No reading: nobody looked at its unsold flats",
      "—",
    ]);
  });
});

describe("the room types side by side", () => {
  it("states each column's set and marks a row's highest only at the floor", () => {
    expect(view.columns.map((c) => [c.openingsDisplay, c.shortNote])).toEqual([
      ["30 openings", null],
      ["40 openings", null],
      ["8 openings", "too few to compare · 12 short of 20"],
    ]);
    const marks = Object.fromEntries(
      view.rows.map((r) => [r.id, r.cells.map((c) => `${c.display}${c.highest ? "*" : ""}`)]),
    );
    expect(marks).toEqual({
      /* Three-room's 90% is under the floor: never the highest. */
      balcony: ["50%*", "25%", "90%"],
      plan: ["20%", "40%*", "90%"],
      /* A tie between the only two at the floor marks nothing. */
      floor_cut: ["10%", "10%", "90%"],
      screenshot: ["0%", "5%*", "90%"],
      shared: ["10%", "10%", "90%"],
    });
  });
});

describe("on the fixture", () => {
  it("reads the catalogue's own room counts, and every window's shares have their set", async () => {
    const shark = await syntheticRepository.getRoomTypes({
      viewer: VIEWERS.developerShark,
      tenantSlug: "shark",
      projectSlug: "shark-residence",
      period: "quarter_to_date",
      language: "en",
    });
    expect(shark.types.map((t) => t.label)).toEqual([
      "One-room",
      "Two-room",
      "Three-room",
      "Four-room",
    ]);
    expect(shark.types.reduce((a, t) => a + t.flats, 0)).toBe(60);
    for (const w of shark.windows) expect(w.meetingsDisplay).toMatch(/^\d+ meetings? in /);
  });
});
