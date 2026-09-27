import { describe, expect, it } from "vitest";
import { attentionIndex, attentionIndexDisplay, inIndexPopulation } from "../src/attention-index";

/**
 * THE ATTENTION INDEX, ON STOCK AND LOOKS WRITTEN OUT BY HAND.
 *
 * One population in both shares: the units the period ends with unsold. Every
 * expected figure below is counted from the lists in the test, not taken from
 * the function.
 */
type U = { code: string; status: "available" | "reserved" | "sold"; rooms: number };

// Six units: two two-room available, one two-room reserved, one two-room sold,
// two three-room available. Unsold: five, of which three are two-room.
const STOCK: readonly U[] = [
  { code: "A-1", status: "available", rooms: 2 },
  { code: "A-2", status: "available", rooms: 2 },
  { code: "A-3", status: "reserved", rooms: 2 },
  { code: "A-4", status: "sold", rooms: 2 },
  { code: "B-1", status: "available", rooms: 3 },
  { code: "B-2", status: "available", rooms: 3 },
];

const twoRoom = (u: U) => u.rooms === 2;

describe("the attention index", () => {
  it("takes one population, the unsold stock, on both sides", () => {
    const reading = attentionIndex(
      STOCK,
      [
        { unitCode: "A-1", dwellSeconds: 100 },
        { unitCode: "A-3", dwellSeconds: 50 }, // reserved: in the population
        { unitCode: "A-4", dwellSeconds: 400 }, // sold: in neither share
        { unitCode: "B-1", dwellSeconds: 50 },
      ],
      twoRoom,
    );
    // Looking time on unsold units: 100 + 50 + 50 = 200; two-room part 150.
    expect(reading.populationSeconds).toBe(200);
    expect(reading.segmentSeconds).toBe(150);
    expect(reading.attentionShare).toBeCloseTo(0.75, 10);
    // Unsold units: 5; two-room among them: 3.
    expect(reading.populationUnits).toBe(5);
    expect(reading.segmentUnits).toBe(3);
    expect(reading.stockShare).toBeCloseTo(0.6, 10);
    // 0.75 / 0.6
    expect(reading.index).toBeCloseTo(1.25, 10);
  });

  it("counts looking time on a code the catalogue does not hold on neither side", () => {
    const reading = attentionIndex(
      STOCK,
      [
        { unitCode: "A-1", dwellSeconds: 60 },
        { unitCode: "Z-9", dwellSeconds: 1000 },
        { unitCode: "B-2", dwellSeconds: 60 },
      ],
      twoRoom,
    );
    expect(reading.populationSeconds).toBe(120);
    expect(reading.index).toBeCloseTo(0.5 / 0.6, 10);
  });

  it("has no index where the segment holds no unsold unit", () => {
    const sold: readonly U[] = [
      { code: "S-1", status: "sold", rooms: 4 },
      { code: "B-1", status: "available", rooms: 3 },
    ];
    const reading = attentionIndex(
      sold,
      [{ unitCode: "B-1", dwellSeconds: 30 }],
      (u) => u.rooms === 4,
    );
    expect(reading.index).toBeNull();
    expect(reading.stockShare).toBe(0);
  });

  it("has no index where nobody looked at the unsold stock", () => {
    const reading = attentionIndex(STOCK, [{ unitCode: "A-4", dwellSeconds: 90 }], twoRoom);
    expect(reading.populationSeconds).toBe(0);
    expect(reading.index).toBeNull();
  });

  it("keeps a reserved unit in the population and a sold one out", () => {
    expect(inIndexPopulation({ code: "x", status: "reserved" })).toBe(true);
    expect(inIndexPopulation({ code: "x", status: "available" })).toBe(true);
    expect(inIndexPopulation({ code: "x", status: "sold" })).toBe(false);
  });

  it("prints two decimals everywhere", () => {
    expect(attentionIndexDisplay(1.4)).toBe("1.40×");
    expect(attentionIndexDisplay(0.505)).toMatch(/^0\.5\d×$/);
  });
});
