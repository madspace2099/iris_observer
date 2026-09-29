import { describe, expect, it } from "vitest";
import {
  hungarianRoomAdjective,
  hungarianRoomAdjectiveAfterCount,
  slovakRoomAdjective,
} from "../src/words";

/**
 * THE ADJECTIVE A ROOM COUNT MAKES.
 *
 * Every expected word is written out here, from the approved text of rounds
 * L5c and L5d: in Slovak the stem from the rooms and the ending from the count
 * of flats, in Hungarian the adjective from the rooms alone; to ten rooms the
 * word, from eleven and for a half room the figure with a decimal comma, and in
 * Hungarian "db" between a count and a figure.
 */

/** A room count no flat can have. A half room, ten or fifty are flats. */
const IMPOSSIBLE_ROOMS = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  0,
  -1,
  -1.5,
] as const;

/** A count of flats is a whole number above nought. */
const NOT_A_COUNT_OF_FLATS = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY] as const;

const ONE_TO_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

describe("slovakRoomAdjective", () => {
  it("takes its ending from the count of flats", () => {
    expect(slovakRoomAdjective(2, 1)).toBe("dvojizbový");
    expect(slovakRoomAdjective(2, 3)).toBe("dvojizbové");
    expect(slovakRoomAdjective(2, 5)).toBe("dvojizbových");
  });

  it("writes the stem out from one to ten rooms", () => {
    expect(ONE_TO_TEN.map((rooms) => slovakRoomAdjective(rooms, 2))).toEqual([
      "jednoizbové",
      "dvojizbové",
      "trojizbové",
      "štvorizbové",
      "päťizbové",
      "šesťizbové",
      "sedemizbové",
      "osemizbové",
      "deväťizbové",
      "desaťizbové",
    ]);
  });

  it("writes the figure from eleven rooms, with the ending still agreeing", () => {
    expect(slovakRoomAdjective(10, 2)).toBe("desaťizbové");
    expect(slovakRoomAdjective(11, 1)).toBe("11-izbový");
    expect(slovakRoomAdjective(11, 2)).toBe("11-izbové");
    expect(slovakRoomAdjective(12, 5)).toBe("12-izbových");
    expect(slovakRoomAdjective(50, 2)).toBe("50-izbové");
  });

  it("writes a half room as the figure with a decimal comma, in all three endings", () => {
    expect(slovakRoomAdjective(1.5, 1)).toBe("1,5-izbový");
    expect(slovakRoomAdjective(1.5, 2)).toBe("1,5-izbové");
    expect(slovakRoomAdjective(1.5, 5)).toBe("1,5-izbových");
    expect(slovakRoomAdjective(2.5, 3)).toBe("2,5-izbové");
  });

  it("refuses only a room count no flat can have", () => {
    for (const rooms of IMPOSSIBLE_ROOMS) {
      expect(() => slovakRoomAdjective(rooms, 1), String(rooms)).toThrow(RangeError);
    }
  });

  it("refuses a count of flats that is not a whole number above nought", () => {
    for (const unitCount of NOT_A_COUNT_OF_FLATS) {
      expect(() => slovakRoomAdjective(2, unitCount), String(unitCount)).toThrow(RangeError);
    }
  });
});

describe("hungarianRoomAdjective", () => {
  it("writes the word out from one to ten rooms", () => {
    expect(ONE_TO_TEN.map(hungarianRoomAdjective)).toEqual([
      "egyszobás",
      "kétszobás",
      "háromszobás",
      "négyszobás",
      "ötszobás",
      "hatszobás",
      "hétszobás",
      "nyolcszobás",
      "kilencszobás",
      "tízszobás",
    ]);
  });

  it("writes the figure from eleven rooms and for a half room", () => {
    expect(hungarianRoomAdjective(11)).toBe("11 szobás");
    expect(hungarianRoomAdjective(50)).toBe("50 szobás");
    expect(hungarianRoomAdjective(1.5)).toBe("1,5 szobás");
    expect(hungarianRoomAdjective(2.5)).toBe("2,5 szobás");
  });

  it("refuses only a room count no flat can have", () => {
    for (const rooms of IMPOSSIBLE_ROOMS) {
      expect(() => hungarianRoomAdjective(rooms), String(rooms)).toThrow(RangeError);
    }
  });
});

describe("hungarianRoomAdjectiveAfterCount", () => {
  it('puts "db" between a count and a figure, so two figures never meet', () => {
    expect(hungarianRoomAdjectiveAfterCount(11)).toBe("db 11 szobás");
    expect(hungarianRoomAdjectiveAfterCount(1.5)).toBe("db 1,5 szobás");
  });

  it("needs no db where the word is written out", () => {
    expect(ONE_TO_TEN.map(hungarianRoomAdjectiveAfterCount)).toEqual(
      ONE_TO_TEN.map(hungarianRoomAdjective),
    );
  });

  it("refuses what the adjective refuses", () => {
    for (const rooms of IMPOSSIBLE_ROOMS) {
      expect(() => hungarianRoomAdjectiveAfterCount(rooms), String(rooms)).toThrow(RangeError);
    }
  });
});
