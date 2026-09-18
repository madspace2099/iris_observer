import { describe, expect, it } from "vitest";
import { csvCatalogue, parseCsv } from "../src/csv";

const SHEET = [
  "Kód;Épület;Emelet;Szobák;Terület;Ár (bruttó);Tájolás;Státusz",
  "A-101;A;1;2+kk;54,2;45 000 000;D;szabad",
  'A-102;A;1;3;71,0;"61 500 000";Ny;foglalt',
  ";A;2;2;50;;;",
  "A-101;A;3;1;30;20 000 000;K;szabad",
  "",
].join("\r\n");

const CONFIG = {
  columns: {
    code: "Kód",
    building: "Épület",
    floor: "Emelet",
    rooms: "Szobák",
    interiorSqm: "Terület",
    priceWithVat: "Ár (bruttó)",
    orientation: "Tájolás",
    status: "Státusz",
  },
  statusMap: { szabad: "available", foglalt: "reserved" } as const,
  currency: "HUF",
};

describe("parseCsv", () => {
  it("handles quoted fields, doubled quotes and both line endings", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("detects a semicolon separator from the header", () => {
    expect(parseCsv("x;y\n1;2")).toEqual([
      ["x", "y"],
      ["1", "2"],
    ]);
  });
});

describe("csvCatalogue", () => {
  it("reads a Hungarian sheet by its own column names", () => {
    const { units, rejected } = csvCatalogue(SHEET, CONFIG);
    expect(units.map((u) => u.code)).toEqual(["A-101", "A-102"]);

    const a101 = units[0]!;
    expect(a101).toMatchObject({
      building: "A",
      floor: 1,
      rooms: 2,
      layout: "2+kk",
      kitchen: "kitchenette",
      orientation: ["D"],
      status: "available",
      statusRaw: "szabad",
    });
    expect(a101.areas.interiorSqm).toBe(54.2);
    expect(a101.price).toEqual({ withVat: 45000000, withoutVat: null, currency: "HUF" });

    const a102 = units[1]!;
    expect(a102.rooms).toBe(3);
    expect(a102.layout).toBeNull();
    expect(a102.kitchen).toBeNull();
    expect(a102.status).toBe("reserved");
    expect(a102.price.withVat).toBe(61500000);

    expect(rejected).toEqual([
      { line: 4, reason: "no unit code" },
      { line: 5, reason: "duplicate unit code A-101" },
    ]);
  });

  it("matches headers regardless of case and surrounding space", () => {
    const { units } = csvCatalogue("  CODE ;Status\nB-1;Sold", {
      columns: { code: "code", status: "status" },
      statusMap: {},
      currency: null,
    });
    expect(units[0]?.code).toBe("B-1");
    expect(units[0]?.status).toBe("sold");
    expect(units[0]?.price.currency).toBeNull();
  });

  it("is empty, not broken, for an empty sheet", () => {
    expect(csvCatalogue("", CONFIG)).toEqual({ units: [], rejected: [] });
  });
});
