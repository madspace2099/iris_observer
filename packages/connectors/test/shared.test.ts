import { describe, expect, it } from "vitest";
import { mapStatus, readInstant, readNumber, readOrientation } from "../src/shared";

describe("readNumber", () => {
  it("reads the ways a European sheet writes a number", () => {
    expect(readNumber("6.050.000,00")).toBe(6050000);
    expect(readNumber("5 000 000")).toBe(5000000);
    expect(readNumber("5 000 000")).toBe(5000000);
    expect(readNumber("6,1")).toBe(6.1);
    expect(readNumber("1,234.5")).toBe(1234.5);
    expect(readNumber("142886.48")).toBe(142886.48);
    expect(readNumber(80)).toBe(80);
  });

  it("answers null, never zero, for anything that is not a number", () => {
    expect(readNumber("")).toBeNull();
    expect(readNumber("n/a")).toBeNull();
    expect(readNumber(null)).toBeNull();
    expect(readNumber(Number.NaN)).toBeNull();
  });
});

describe("mapStatus", () => {
  it("recognises a word that spells a canonical status on its own", () => {
    expect(mapStatus("Sold", {})).toBe("sold");
    expect(mapStatus("not for sale", {})).toBe("not_for_sale");
    expect(mapStatus("pre-reserved", {})).toBe("pre_reserved");
  });

  it("uses the tenant's mapping first and says unknown for the rest", () => {
    const map = { foglalt: "reserved", szabad: "available" } as const;
    expect(mapStatus("Foglalt", map)).toBe("reserved");
    expect(mapStatus("szabad", map)).toBe("available");
    expect(mapStatus("eladva?", map)).toBe("unknown");
    expect(mapStatus(null, map)).toBe("unknown");
  });
});

describe("readOrientation and readInstant", () => {
  it("splits compass codes on the separators the sources use and keeps them verbatim", () => {
    expect(readOrientation("SV, J")).toEqual(["SV", "J"]);
    expect(readOrientation("S-E/W")).toEqual(["S-E", "W"]);
    expect(readOrientation(["N", "E"])).toEqual(["N", "E"]);
    expect(readOrientation(null)).toEqual([]);
  });

  it("keeps an instant only when it carries its offset", () => {
    expect(readInstant("2026-07-14T09:30:00+00:00")).toBe("2026-07-14T09:30:00+00:00");
    expect(readInstant("2026-07-14T09:30:00Z")).toBe("2026-07-14T09:30:00Z");
    expect(readInstant("2026-07-14")).toBeNull();
    expect(readInstant("2026-07-14 09:30")).toBeNull();
    expect(readInstant(null)).toBeNull();
  });
});
