import { describe, expect, it } from "vitest";
import {
  CatalogueSnapshotSchema,
  CatalogueUnitSchema,
  compassFor,
  diffCatalogue,
  parseDisposition,
  placementOf,
  type CatalogueUnit,
} from "../src/catalogue";

function unit(over: Partial<CatalogueUnit> & { code: string }): CatalogueUnit {
  return {
    externalId: `ext-${over.code}`,
    building: "A",
    floor: 3,
    rooms: 2,
    layout: "2+kk",
    kitchen: "kitchenette",
    unitType: "flat",
    areas: { interiorSqm: 54.2, exteriorSqm: 6.1, grossSqm: null },
    price: { withVat: 6050000, withoutVat: 5000000, currency: "CZK" },
    orientation: ["J"],
    status: "available",
    statusRaw: "0",
    availableFrom: null,
    updatedAt: null,
    ...over,
  };
}

describe("parseDisposition", () => {
  it("reads the Czech convention, kitchen corner and separate kitchen alike", () => {
    expect(parseDisposition("2+kk")).toEqual({ rooms: 2, kitchen: "kitchenette" });
    expect(parseDisposition("3+1")).toEqual({ rooms: 3, kitchen: "separate" });
    expect(parseDisposition(" 1 + KK ")).toEqual({ rooms: 1, kitchen: "kitchenette" });
  });

  it("takes a bare count as a count and says nothing about the kitchen", () => {
    expect(parseDisposition("4")).toEqual({ rooms: 4, kitchen: null });
  });

  it("refuses to guess at anything else and leaves the label to the row", () => {
    expect(parseDisposition("atyp")).toEqual({ rooms: null, kitchen: null });
    expect(parseDisposition("2+kk+garden")).toEqual({ rooms: null, kitchen: null });
    expect(parseDisposition("")).toEqual({ rooms: null, kitchen: null });
    expect(parseDisposition(null)).toEqual({ rooms: null, kitchen: null });
  });
});

describe("the unit schema", () => {
  it("accepts a fully described flat and a sparsely described one", () => {
    expect(CatalogueUnitSchema.safeParse(unit({ code: "A-101" })).success).toBe(true);
    const sparse = CatalogueUnitSchema.safeParse(
      unit({
        code: "P-7",
        building: null,
        floor: null,
        rooms: null,
        layout: null,
        kitchen: null,
        unitType: "parking",
        areas: { interiorSqm: null, exteriorSqm: null, grossSqm: null },
        price: { withVat: null, withoutVat: null, currency: null },
        orientation: [],
        status: "unknown",
        statusRaw: "99",
      }),
    );
    expect(sparse.success ? null : sparse.error.issues).toBeNull();
  });

  it("refuses a field it does not know, so a connector cannot smuggle one through", () => {
    const parsed = CatalogueUnitSchema.safeParse({ ...unit({ code: "A-1" }), owner: "x" });
    expect(parsed.success).toBe(false);
  });

  it("refuses a currency that is not ISO 4217 upper case", () => {
    const parsed = CatalogueUnitSchema.safeParse(
      unit({ code: "A-1", price: { withVat: 1, withoutVat: 1, currency: "czk" } }),
    );
    expect(parsed.success).toBe(false);
  });

  it("scopes a snapshot to a tenant, a project and a connector", () => {
    const parsed = CatalogueSnapshotSchema.safeParse({
      tenantId: "tnt_aabbccdd11",
      projectId: "prj_istertower1",
      connector: "realpad",
      fetchedAt: "2026-09-07T10:00:00.000+02:00",
      units: [unit({ code: "A-101" })],
    });
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
    expect(CatalogueSnapshotSchema.safeParse({}).success).toBe(false);
  });
});

describe("diffCatalogue", () => {
  it("is silent when nothing changed", () => {
    const a = [unit({ code: "A-101" }), unit({ code: "A-102" })];
    expect(
      diffCatalogue(
        a,
        a.map((u) => ({ ...u })),
      ),
    ).toEqual([]);
  });

  it("reports additions, withdrawals and field-level changes, in code order", () => {
    const before = [unit({ code: "B-2" }), unit({ code: "A-101" })];
    const after = [
      unit({ code: "A-101", status: "reserved", statusRaw: "2" }),
      unit({ code: "C-9" }),
    ];
    const changes = diffCatalogue(before, after);
    expect(changes.map((c) => [c.code, c.kind])).toEqual([
      ["A-101", "changed"],
      ["B-2", "withdrawn"],
      ["C-9", "added"],
    ]);
    expect(changes[0]?.changedFields).toEqual(["status", "statusRaw"]);
    expect(changes[1]?.after).toBeNull();
    expect(changes[2]?.before).toBeNull();
  });

  it("sees a change inside a nested field", () => {
    const before = [unit({ code: "A-101" })];
    const after = [
      unit({ code: "A-101", price: { withVat: 6100000, withoutVat: 5041322, currency: "CZK" } }),
    ];
    expect(diffCatalogue(before, after)[0]?.changedFields).toEqual(["price"]);
  });
});

describe("compassFor and placementOf", () => {
  it("reads the tenant's mapping first and an exact compass code second, never a guess", () => {
    expect(compassFor(["J"], { J: "S" })).toBe("S");
    expect(compassFor(["sv"], { SV: "NE" })).toBe("NE");
    expect(compassFor(["sw"], {})).toBe("SW");
    // Czech S is north; without a mapping it is not read as south.
    expect(compassFor(["S"], { S: "N" })).toBe("N");
    expect(compassFor(["Z"], {})).toBeNull();
    expect(compassFor([], {})).toBeNull();
  });

  it("places a fully described flat with no gaps", () => {
    const placed = placementOf(unit({ code: "A-101" }), { J: "S" });
    expect(placed).toEqual({
      ok: true,
      floor: 3,
      rooms: 2,
      areaSqm: 54.2,
      price: 6050000,
      orientation: "S",
      status: "available",
      gaps: [],
    });
  });

  it("draws a sparse unit and names each thing the catalogue did not state", () => {
    /*
     * A unit for sale is drawn whatever it lacks; the read models say the
     * absence in words. Only a status the surfaces have no word for keeps a
     * unit off them, and that is the one refusal left.
     */
    const sparse = placementOf(
      unit({
        code: "P-7",
        floor: null,
        rooms: null,
        unitType: "parking",
        areas: { interiorSqm: null, exteriorSqm: null, grossSqm: 12 },
        price: { withVat: null, withoutVat: null, currency: "CZK" },
        orientation: ["Z"],
        status: "available",
        statusRaw: "0",
      }),
      {},
    );
    expect(sparse).toEqual({
      ok: true,
      floor: null,
      rooms: null,
      areaSqm: 12,
      price: null,
      orientation: null,
      status: "available",
      gaps: ["no floor", "no room count", "no price", "orientation code not mapped (Z)"],
    });

    const notForSale = placementOf(
      unit({ code: "P-8", status: "not_for_sale", statusRaw: "4", orientation: [] }),
      {},
    );
    expect(notForSale).toEqual({ ok: false, reasons: ["status not for sale"] });
  });

  it("collapses a pre-reservation onto reserved, which is what the surfaces draw", () => {
    const placed = placementOf(unit({ code: "A-1", status: "pre_reserved", statusRaw: "1" }), {
      J: "S",
    });
    expect(placed.ok && placed.status).toBe("reserved");
  });
});
