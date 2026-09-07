import { describe, expect, it } from "vitest";
import type { CatalogueUnit } from "@observer/contracts";
import type { CatalogueSource, OverviewQuery, Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";
import { rawUnitsFromCatalogue } from "../src/catalogue-overlay";

/**
 * A connector's catalogue standing in for the synthetic one.
 *
 * What must hold: the stock is the delivered stock and nothing else changes
 * its shape; a delivered unit carries no invented attention, change or intent;
 * a unit the product cannot draw is named rather than guessed; and a
 * repository composed without a source shows the synthetic catalogue again.
 */

function query(viewer: Viewer, tenantSlug: string, projectSlug: string): OverviewQuery {
  return { viewer, tenantSlug, projectSlug, period: "quarter_to_date" };
}

const ISTER = query(VIEWERS.developer as Viewer, "alpha", "ister-tower");
const NORTHGATE = query(VIEWERS.developer as Viewer, "alpha", "northgate");

function unit(code: string, over: Partial<CatalogueUnit> = {}): CatalogueUnit {
  return {
    code,
    externalId: code,
    building: "A",
    floor: 2,
    rooms: 1,
    layout: "1+kk",
    kitchen: "kitchenette",
    unitType: "flat",
    areas: { interiorSqm: 34, exteriorSqm: null, grossSqm: null },
    price: { withVat: 4200000, withoutVat: null, currency: "CZK" },
    orientation: ["J"],
    status: "available",
    statusRaw: "0",
    availableFrom: null,
    updatedAt: null,
    ...over,
  };
}

const DELIVERED = {
  connector: "csv" as const,
  orientationMap: { J: "S", SV: "NE" },
  units: [
    unit("C-1"),
    unit("C-2", { rooms: 4, floor: 5, orientation: ["SV"], status: "reserved", statusRaw: "2" }),
    unit("C-3", { rooms: 4, floor: 6, status: "sold", statusRaw: "3" }),
    // A unit the sheet says almost nothing about: no floor, no count, no price.
    unit("P-1", {
      rooms: null,
      layout: null,
      kitchen: null,
      unitType: "parking",
      floor: null,
      price: { withVat: null, withoutVat: null, currency: "CZK" },
    }),
    unit("C-4", { orientation: ["Z"] }),
  ],
};

const source: CatalogueSource = {
  async catalogueFor(project) {
    return project.slug === "ister-tower" ? DELIVERED : null;
  },
};

describe("rawUnitsFromCatalogue", () => {
  it("draws every unit for sale and names what each was stated without", () => {
    const overlay = rawUnitsFromCatalogue(DELIVERED.units, DELIVERED.orientationMap);
    expect(
      overlay.units.map((u) => [u.code, u.floor, u.rooms, u.price, u.orientation, u.status]),
    ).toEqual([
      ["C-1", 2, 1, 4200000, "S", "available"],
      ["C-2", 5, 4, 4200000, "NE", "reserved"],
      ["C-3", 6, 4, 4200000, "S", "sold"],
      ["P-1", null, null, null, "S", "available"],
      ["C-4", 2, 1, 4200000, null, "available"],
    ]);
    expect(overlay.unplaced).toEqual([]);
    expect(overlay.gaps).toEqual([
      { code: "P-1", gap: "no floor" },
      { code: "P-1", gap: "no room count" },
      { code: "P-1", gap: "no price" },
      { code: "C-4", gap: "orientation code not mapped (Z)" },
    ]);
  });

  it("keeps a unit off the surfaces only for a status they have no word for", () => {
    const overlay = rawUnitsFromCatalogue(
      [unit("X-1", { status: "not_for_sale", statusRaw: "4" })],
      DELIVERED.orientationMap,
    );
    expect(overlay.units).toEqual([]);
    expect(overlay.unplaced).toEqual([{ code: "X-1", reason: "status not for sale" }]);
  });
});

describe("a repository composed with a catalogue source", () => {
  const repo = new SyntheticObserverRepository({ catalogueSource: source });

  it("builds the project's segments from the delivered stock, unstated counts as their own row", async () => {
    const view = await repo.getProjectView(ISTER, null);
    expect(view.segments.map((s) => s.id)).toEqual(["rooms-1", "rooms-4", "rooms-unstated"]);
    expect(view.segments.map((s) => s.label)).toEqual([
      "One-room",
      "Four-room",
      "Rooms not stated",
    ]);
    expect(view.segments.map((s) => s.rooms)).toEqual([1, 4, null]);
    expect(view.segments.map((s) => s.availableUnits)).toEqual([2, 0, 1]);
  });

  it("draws the delivered stock with no invented attention", async () => {
    const pulse = await repo.getProjectPulse(ISTER);
    const units = pulse.floors.flatMap((f) => f.units);
    expect(units.map((u) => u.code).sort()).toEqual(["C-1", "C-2", "C-3", "C-4", "P-1"]);
    for (const u of units) {
      expect(u.attention).toBe(0);
      expect(u.meaningfulViews).toBe(0);
      expect(u.uniqueContacts).toBe(0);
      expect(u.trend).toBe("flat");
      expect(u.change).toBeNull();
      expect(u.intent).toBeNull();
    }
    expect(pulse.totals).toMatchObject({ units: 5, available: 3, reserved: 1, sold: 1 });
    expect(pulse.totals.soldInPeriod).toBeNull();
    for (const s of pulse.segments) expect(s.conversionRatio).toBeNull();
    expect(pulse.evidence.observationCount).toBe(0);
  });

  it("draws a unit the catalogue barely describes, and says so in words", async () => {
    const pulse = await repo.getProjectPulse(ISTER);
    // Top floor first; the units with no stated floor sit in one last row.
    expect(pulse.floors.map((f) => f.label)).toEqual(["L6", "L5", "L2", "Floor not stated"]);
    const last = pulse.floors[pulse.floors.length - 1];
    expect(last?.floor).toBeNull();
    expect(last?.units.map((u) => u.code)).toEqual(["P-1"]);
    const p1 = last?.units[0];
    expect(p1).toMatchObject({ rooms: null, price: null, priceDisplay: "Not stated" });
    const c4 = pulse.floors.flatMap((f) => f.units).find((u) => u.code === "C-4");
    expect(c4?.orientation).toBeNull();
    expect(pulse.segments.find((s) => s.id === "rooms-unstated")).toMatchObject({
      label: "Rooms not stated",
      unitIds: [p1?.unitId],
      available: 1,
    });

    const detail = await repo.getUnitDetail(ISTER, "P-1");
    expect(detail.unit).toMatchObject({
      floor: null,
      rooms: null,
      price: null,
      priceDisplay: "Not stated",
      pricePerSqmDisplay: "Price not stated",
    });
    expect(detail.headline).toContain("Rooms not stated");

    const register = await repo.getUnitAttention(ISTER, null);
    const row = register.rows.find((r) => r.unitCode === "P-1");
    expect(row).toMatchObject({ rooms: null, floor: null, priceDisplay: "Not stated" });
  });

  it("lets no invented session touch a delivered unit", async () => {
    // The synthetic sessions still exist — the showroom surfaces keep their
    // demonstration — but they touch synthetic units, so every delivered
    // segment shows the attention it has actually earned: none.
    const flow = await repo.getSalesFlow(ISTER);
    expect(flow.meetingCount).toBeGreaterThan(0);

    const view = await repo.getProjectView(ISTER, null);
    for (const segment of view.segments) {
      expect(segment.meetings).toBe(0);
      expect(segment.attentionShare).toBe(0);
      expect(segment.index).toBe(0);
    }
    expect(view.verdict).toMatch(/meetings?/);
  });

  it("offers the delivered counts to the audience builder", async () => {
    const audience = await repo.getAudience(ISTER, {
      rooms: null,
      favouritedOnly: true,
      placeCategory: null,
      minimumPlaceSeconds: 25,
    });
    expect(audience.roomChoices.map((c) => c.rooms)).toEqual([1, 4]);
  });

  it("leaves a project the source has nothing for on its synthetic stock", async () => {
    const view = await repo.getProjectView(NORTHGATE, null);
    expect(view.segments.map((s) => s.id)).toEqual(["rooms-2", "rooms-3"]);
  });

  it("restores the synthetic catalogue for a repository composed without a source", async () => {
    await repo.getProjectPulse(ISTER);
    const plain = new SyntheticObserverRepository();
    const pulse = await plain.getProjectPulse(ISTER);
    expect(pulse.floors.flatMap((f) => f.units).some((u) => u.code.startsWith("IT-"))).toBe(true);
    expect(pulse.totals.soldInPeriod).not.toBeNull();
  });
});
