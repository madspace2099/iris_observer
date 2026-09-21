import { describe, expect, it } from "vitest";
import type { UnitAttentionRow } from "@observer/readmodels";
import { areaWord, aspectWord, floorWord, roomsWord } from "@observer/readmodels";
import { ROOMS_UNSTATED, filterRows, roomsKey, sortRows } from "../src/components/units/register";

/**
 * A unit the catalogue barely describes still has a place in the register.
 *
 * What must hold: a count, a floor or an area the source did not state is a
 * word, never a zero; the rooms filter can pick those units out rather than
 * losing them in "Any"; and ordering by a column puts the unstated after the
 * stated, because absent is not smallest.
 */

function row(unitCode: string, over: Partial<UnitAttentionRow> = {}): UnitAttentionRow {
  return {
    unitId: `unt_${unitCode.toLowerCase()}`,
    unitCode,
    status: "available",
    rooms: 2,
    areaSqm: 60,
    orientation: "S",
    floor: 3,
    priceDisplay: "€200,000",
    meetings: 1,
    views: 1,
    medianDwellSeconds: 30,
    totalDwellSeconds: 30,
    repeatViews: 0,
    favourites: 0,
    pdfOpens: 0,
    balconyViews: 0,
    floorCutViews: 0,
    screenshots: 0,
    comparisonAppearances: 0,
    comparisonWins: null,
    shares: 0,
    trend: "flat",
    trendDisplay: "flat",
    attention: 0.5,
    ...over,
  } as UnitAttentionRow;
}

const ROWS = [
  row("A-1"),
  row("P-1", {
    rooms: null,
    floor: null,
    areaSqm: null,
    orientation: null,
    priceDisplay: "Not stated",
  }),
  row("B-1", { rooms: 1, floor: 1, areaSqm: 40 }),
];

describe("the words for what a catalogue did not state", () => {
  it("say the absence rather than a figure", () => {
    expect(roomsWord(null)).toBe("Rooms not stated");
    expect(roomsWord(1)).toBe("1 room");
    expect(roomsWord(3)).toBe("3 rooms");
    expect(areaWord(null)).toBe("Area not stated");
    expect(areaWord(54.5)).toBe("54.5 m²");
    expect(floorWord(null)).toBe("Floor not stated");
    expect(floorWord(4)).toBe("Floor 4");
    expect(aspectWord(null)).toBe("Aspect not stated");
    expect(aspectWord("SW")).toBe("facing SW");
  });
});

describe("the register with an unstated unit", () => {
  it("filters unstated counts as their own choice", () => {
    expect(roomsKey(null)).toBe(ROOMS_UNSTATED);
    expect(roomsKey(2)).toBe("2");
    const query = { q: "", scope: "all", status: "all", rooms: ROOMS_UNSTATED } as Parameters<
      typeof filterRows
    >[1];
    expect(filterRows(ROWS, query).map((r) => r.unitCode)).toEqual(["P-1"]);
    expect(filterRows(ROWS, { ...query, rooms: "2" }).map((r) => r.unitCode)).toEqual(["A-1"]);
  });

  it("searches without reading an unstated aspect as text", () => {
    const query = { q: "s", scope: "all", status: "all", rooms: "all" } as Parameters<
      typeof filterRows
    >[1];
    expect(filterRows(ROWS, query).map((r) => r.unitCode)).toEqual(["A-1", "B-1"]);
  });

  it("orders the unstated after every stated value, whichever way the column runs", () => {
    const query = (sort: string, dir: string) =>
      ({ q: "", scope: "all", status: "all", rooms: "all", sort, dir }) as Parameters<
        typeof sortRows
      >[1];
    expect(sortRows(ROWS, query("rooms", "ascending")).map((r) => r.unitCode)).toEqual([
      "B-1",
      "A-1",
      "P-1",
    ]);
    expect(sortRows(ROWS, query("rooms", "descending")).map((r) => r.unitCode)).toEqual([
      "A-1",
      "B-1",
      "P-1",
    ]);
    expect(sortRows(ROWS, query("floor", "ascending")).map((r) => r.unitCode)).toEqual([
      "B-1",
      "A-1",
      "P-1",
    ]);
  });
});
