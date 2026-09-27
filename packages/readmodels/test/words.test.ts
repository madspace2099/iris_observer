import { describe, expect, it } from "vitest";
import { hungarianRoomAdjective, slovakRoomAdjective } from "../src/words";

/**
 * THE ADJECTIVE A ROOM COUNT MAKES.
 *
 * Every expected word is written out here, from the approved text of round
 * L5c: in Slovak the stem from the rooms and the ending from the count of
 * flats, in Hungarian the adjective from the rooms alone, and from seven rooms
 * the figure in both.
 */

const NOT_WHOLE_ABOVE_NOUGHT = [0, -1, 1.5, Number.NaN] as const;

describe("slovakRoomAdjective", () => {
  it("takes its ending from the count of flats", () => {
    expect(slovakRoomAdjective(2, 1)).toBe("dvojizbový");
    expect(slovakRoomAdjective(2, 3)).toBe("dvojizbové");
    expect(slovakRoomAdjective(2, 5)).toBe("dvojizbových");
  });

  it("has a stem of its own for one to six rooms", () => {
    expect([1, 2, 3, 4, 5, 6].map((rooms) => slovakRoomAdjective(rooms, 2))).toEqual([
      "jednoizbové",
      "dvojizbové",
      "trojizbové",
      "štvorizbové",
      "päťizbové",
      "šesťizbové",
    ]);
  });

  it("writes the figure from seven rooms, with the ending still agreeing", () => {
    expect(slovakRoomAdjective(6, 2)).toBe("šesťizbové");
    expect(slovakRoomAdjective(7, 2)).toBe("7-izbové");
    expect(slovakRoomAdjective(7, 1)).toBe("7-izbový");
    expect(slovakRoomAdjective(12, 5)).toBe("12-izbových");
  });

  it("refuses a room count that is not a whole number above nought", () => {
    for (const rooms of NOT_WHOLE_ABOVE_NOUGHT) {
      expect(() => slovakRoomAdjective(rooms, 1)).toThrow(RangeError);
    }
  });

  it("refuses a count of flats that is not a whole number above nought", () => {
    for (const unitCount of NOT_WHOLE_ABOVE_NOUGHT) {
      expect(() => slovakRoomAdjective(2, unitCount)).toThrow(RangeError);
    }
  });
});

describe("hungarianRoomAdjective", () => {
  it("has a word of its own for one to six rooms", () => {
    expect([1, 2, 3, 4, 5, 6].map(hungarianRoomAdjective)).toEqual([
      "egyszobás",
      "kétszobás",
      "háromszobás",
      "négyszobás",
      "ötszobás",
      "hatszobás",
    ]);
  });

  it("writes the figure from seven rooms", () => {
    expect(hungarianRoomAdjective(6)).toBe("hatszobás");
    expect(hungarianRoomAdjective(7)).toBe("7 szobás");
    expect(hungarianRoomAdjective(12)).toBe("12 szobás");
  });

  it("refuses a room count that is not a whole number above nought", () => {
    for (const rooms of NOT_WHOLE_ABOVE_NOUGHT) {
      expect(() => hungarianRoomAdjective(rooms)).toThrow(RangeError);
    }
  });
});
