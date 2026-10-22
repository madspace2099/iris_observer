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
const OTHER = "prj_roomtypes2";
afterAll(() => {
  provideCatalogue(PROJECT, null);
  provideCatalogue(OTHER, null);
});

function flat(code: string, rooms: number | null, status: "sold" | "reserved" | "available") {
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

function context(crm: boolean, project = PROJECT): ViewContext {
  return viewContext({
    tenant: { slug: "test" },
    period: { label: "Quarter to date" },
    project: {
      id: project,
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
  rooms: number | null,
  index: number | null,
  meetings: number,
  unitsOpened: number,
  rates: Readonly<Record<string, number>>,
): SegmentInterest {
  const label =
    rooms === null
      ? "Rooms not stated"
      : ({ 1: "One-room", 2: "Two-room", 3: "Three-room", 4: "Four-room" }[rooms] ?? "");
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
/* The period's presentations: forty, the set the readings' meeting shares are of. */
const view = buildRoomTypes(context(true), SEGMENTS, HISTORY, TODAY, 40);
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
    expect(view.types.map((t) => [t.soldDisplay, t.soldShareDisplay])).toEqual([
      ["1 sold", "50%"],
      ["1 sold", "25%"],
      ["0 sold", "0%"],
    ]);
    expect(view.flatsDisplay).toBe("7 flats");
    expect(view.projectSoldDisplay).toBe("2 of 7 sold · 29%");
  });

  it("states sold as unavailable without a CRM, never as nought", () => {
    const none = buildRoomTypes(context(false), SEGMENTS, HISTORY, TODAY, 40);
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
    /*
     * The owner's spans, a week to total, named by their length: "Quarter"
     * beside the page's "Quarter to date" named two spans.
     */
    expect(view.windows.map((w) => w.name)).toEqual([
      "7 days",
      "30 days",
      "91 days",
      "182 days",
      "365 days",
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
    /* 26 Jun – 25 Jul holds the first meeting, 1 Jul: part of thirty days, not thirty. */
    expect(month.changeAgainst).toBe(
      "No change is shown: the project's first meeting, on 1 Jul, falls inside the 30 days before.",
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

  it("does not compare with time before that starts ahead of the first meeting", () => {
    /*
     * The first meeting moved to 12 Aug. The 7 days before the week, 11–17
     * Aug, then hold eleven meetings (the 12th's and the 14th's ten): over the
     * floor, but six days of a week, so no change is shown.
     */
    const late = buildRoomTypes(
      context(true),
      SEGMENTS,
      [...HISTORY.slice(0, -1), meeting(12, [])],
      TODAY,
      40,
    );
    const week = late.windows.find((w) => w.id === "week");
    expect(week?.changeAgainst).toBe(
      "No change is shown: the project's first meeting, on 12 Aug, falls inside the 7 days before.",
    );
    expect(week?.shares.map((s) => s.change)).toEqual([null, null, null]);
    expect(week?.reading).not.toContain("moved most");
  });

  it("draws the week as its 7 days and the 7 before, the sets of its change", () => {
    /*
     * 11–17 Aug: one-room 5/10, two-room 5/10, three-room 0/10. 18–24 Aug:
     * 3/10, 6/10, 4/10. The points are the change column's two sets.
     */
    const trend = window("week").trend;
    expect(trend.parts.map((p) => [p.label, p.meetings])).toEqual([
      ["17 Aug", 10],
      ["24 Aug", 10],
    ]);
    expect(trend.series.map((s) => s.values)).toEqual([
      [0.5, 0.3],
      [0.5, 0.6],
      [0, 0.4],
    ]);
    expect(trend.caption).toBe(
      "One point is one 7-day stretch: the last 7 days and the 7 before them.",
    );
    expect(trend.empty).toBeNull();
  });

  it("says why there is no line when no stretch reaches the floor", () => {
    /*
     * Four meetings, all on 19 Aug, the first: the week's line starts there,
     * 19–24 Aug in two stretches of three days, and the busiest holds four.
     */
    const few = buildRoomTypes(context(true), SEGMENTS, HISTORY.slice(0, 4), TODAY, 4);
    expect(few.windows[0]?.trend.empty).toBe(
      "Too few meetings a 3-day stretch to draw a line: a point needs 10, and the busiest 3-day stretch had 4.",
    );
    expect(few.windows[0]?.trend.caption).toBe(
      "One point is one 3-day stretch, from the first meeting on 19 Aug.",
    );
  });

  it("claims no first meeting before there is one", () => {
    const none = buildRoomTypes(context(true), SEGMENTS, [], TODAY, 0);
    /* 30 days in five stretches of six; 365 in twelve of 30.4, said as 30. */
    expect(none.windows.map((w) => w.trend.caption)).toEqual([
      "One point is one 7-day stretch: the last 7 days and the 7 before them.",
      "One point is one 6-day stretch.",
      "One point is one 7-day stretch.",
      "One point is one 14-day stretch.",
      "One point is one 30-day stretch.",
      "One point is one day.",
    ]);
    expect(none.windows[1]?.reading).toBe("No meeting in the last 30 days.");
  });

  it("starts a long window's line at the first meeting, and says so", () => {
    /* 1 Jul to the end of 24 Aug is 55 days: twelve stretches of 4.6, said as five. */
    expect(window("year").trend.caption).toBe(
      "One point is one 5-day stretch, from the first meeting on 1 Jul.",
    );
    expect(window("year").trend.parts).toHaveLength(12);
  });

  it("ranks nothing under the floor", () => {
    const few = buildRoomTypes(context(true), SEGMENTS, HISTORY.slice(0, 4), TODAY, 4);
    expect(few.windows[0]?.reading).toBe(
      "4 meetings in the last 7 days: too few to rank the types, 6 short of 10.",
    );
    expect(few.windows[0]?.shares.every((s) => s.change === null)).toBe(true);
  });
});

describe("interest against sales", () => {
  it("names no sold direction less than a flat from the project's rate", () => {
    /*
     * Project 2 of 7 sold. One-room 1 of 2 against 2 × 2/7 = 0.57: 0.43 of a
     * flat above. Two-room 1 of 4 against 4 × 2/7 = 1.14: 0.14 below. Both
     * read as the project's rate, whatever their shares say.
     */
    expect(
      view.readings.map((r) => [r.lookedAtDisplay, r.soldDisplay, r.verdict, r.headline, r.action]),
    ).toEqual([
      ["0.80×", "1 of 2 · 50%", "in_line", "Less time on it, selling at the project's rate", null],
      ["1.50×", "1 of 4 · 25%", "in_line", "More time on it, selling at the project's rate", null],
      ["2.00×", "0 of 1 · 0%", null, "Too few meetings for a reading", null],
    ]);
    expect(view.readings[2]?.basis).toBe("5 meetings opened one · 15 short of 20");
    expect(view.soldAgainst).toBe("Sold, against the project's 29%");
    expect(view.periodDisplay).toBe("Quarter to date · 40 presentations");
  });

  it("names a direction a flat or more away, and suggests showing a type more only where it is shown less", () => {
    /*
     * Twenty flats, six sold: the project's rate 30%.
     *   One-room   4 flats, 3 sold: 4 × 0.3 = 1.2, so 1.8 above.
     *   Two-room   8 flats, 1 sold: 2.4, so 1.4 below.
     *   Three-room 4 flats, 2 sold: 1.2, so 0.8 above: the project's rate.
     *   Four-room  4 flats, 0 sold: 1.2, so 1.2 below.
     * One-room's 25 meetings are 25% of 100 presentations, above its 20% of
     * the stock: already shown, so no "show it more". Of 200, 12.5%: it is.
     */
    provideCatalogue(OTHER, [
      ...["A-1", "A-2", "A-3"].map((c) => flat(c, 1, "sold")),
      flat("A-4", 1, "available"),
      flat("B-1", 2, "sold"),
      ...["B-2", "B-3", "B-4", "B-5", "B-6", "B-7", "B-8"].map((c) => flat(c, 2, "available")),
      ...["C-1", "C-2"].map((c) => flat(c, 3, "sold")),
      ...["C-3", "C-4"].map((c) => flat(c, 3, "available")),
      ...["D-1", "D-2", "D-3", "D-4"].map((c) => flat(c, 4, "available")),
    ]);
    const segments = [
      segment("rooms-1", 1, 0.8, 25, 30, {}),
      segment("rooms-2", 2, 1.5, 25, 30, {}),
      segment("rooms-3", 3, 2, 25, 30, {}),
      segment("rooms-4", 4, 0.5, 20, 30, {}),
    ];
    const read = (periodMeetings: number) =>
      buildRoomTypes(context(true, OTHER), segments, [], TODAY, periodMeetings).readings.map(
        (r) => [r.verdict, r.headline, r.action],
      );
    expect(read(100)).toEqual([
      ["shown_less_selling", "Less time on it, but selling well", null],
      ["wanted_slow", "More time on it, but selling less", "Check the price and what is promised."],
      ["in_line", "More time on it, selling at the project's rate", null],
      ["neither", "Less time on it, and selling less", "Rethink how it is offered."],
    ]);
    expect(read(200)[0]).toEqual([
      "shown_less_selling",
      "Less time on it, but selling well",
      "Show it more in presentations.",
    ]);
  });

  it("gives no reading to a type nobody looked at", () => {
    const unseen = SEGMENTS.map((s) => (s.id === "rooms-1" ? { ...s, index: null } : s));
    const r = buildRoomTypes(context(true), unseen, HISTORY, TODAY, 40).readings[0];
    expect([r?.verdict, r?.headline, r?.lookedAtDisplay]).toEqual([
      null,
      "No reading: nobody looked at its unsold flats",
      "—",
    ]);
  });
});

describe("the room types side by side", () => {
  it("links no audience for flats whose room count is not stated", () => {
    provideCatalogue(OTHER, [flat("X-1", null, "available"), flat("B-1", 2, "available")]);
    const v = buildRoomTypes(
      context(true, OTHER),
      [segment("rooms-unknown", null, null, 0, 0, {}), segment("rooms-2", 2, null, 0, 0, {})],
      [],
      TODAY,
      0,
    );
    expect(v.columns.map((c) => c.audienceHref)).toEqual([null, "/test/rooms/audience?rooms=2"]);
  });

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
