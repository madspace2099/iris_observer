import { describe, expect, it } from "vitest";
import {
  ProjectIdSchema,
  TenantIdSchema,
  type CatalogueSnapshot,
  type CatalogueUnit,
} from "@observer/contracts";
import { refusal } from "../src/http";
import { memoryCatalogueStore, runCatalogueSync } from "../src/sync";

const SCOPE = {
  tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
  projectId: ProjectIdSchema.parse("prj_istertower1"),
};

function unit(code: string, over: Partial<CatalogueUnit> = {}): CatalogueUnit {
  return {
    code,
    externalId: code,
    building: "A",
    floor: 1,
    rooms: 2,
    layout: "2+kk",
    kitchen: "kitchenette",
    unitType: "flat",
    areas: { interiorSqm: 50, exteriorSqm: null, grossSqm: null },
    price: { withVat: 1, withoutVat: null, currency: "EUR" },
    orientation: [],
    status: "available",
    statusRaw: "0",
    availableFrom: null,
    updatedAt: null,
    ...over,
  };
}

function snapshot(units: CatalogueUnit[], at = "2026-09-07T10:00:00.000+00:00"): CatalogueSnapshot {
  return { ...SCOPE, connector: "csv", fetchedAt: at, units };
}

describe("runCatalogueSync", () => {
  it("records everything as added on the first fetch and only the difference afterwards", async () => {
    const store = memoryCatalogueStore();
    const first = await runCatalogueSync(
      async () => ({ ok: true, snapshot: snapshot([unit("A-1"), unit("A-2")]) }),
      store,
      SCOPE,
      "csv",
    );
    expect(first).toMatchObject({ ok: true, fetched: 2 });
    if (!first.ok) return;
    expect(first.changes.map((c) => c.kind)).toEqual(["added", "added"]);

    const second = await runCatalogueSync(
      async () => ({
        ok: true,
        snapshot: snapshot(
          [unit("A-1", { status: "sold", statusRaw: "3" }), unit("A-3")],
          "2026-09-07T11:00:00.000+00:00",
        ),
      }),
      store,
      SCOPE,
      "csv",
    );
    if (!second.ok) throw new Error("expected a report");
    expect(second.changes.map((c) => [c.code, c.kind])).toEqual([
      ["A-1", "changed"],
      ["A-2", "withdrawn"],
      ["A-3", "added"],
    ]);
    expect(store.history).toHaveLength(5);
    expect((await store.readCurrent(SCOPE, "csv")).map((u) => u.code)).toEqual(["A-1", "A-3"]);
  });

  it("passes a refusal through untouched and writes nothing", async () => {
    const store = memoryCatalogueStore();
    const outcome = await runCatalogueSync(
      async () => refusal("unauthorised", "refused"),
      store,
      SCOPE,
      "realpad",
    );
    expect(outcome).toMatchObject({ ok: false, reason: "unauthorised" });
    expect(store.snapshots.size).toBe(0);
  });

  it("lists the status words the mapping did not cover, once each", async () => {
    const store = memoryCatalogueStore();
    const outcome = await runCatalogueSync(
      async () => ({
        ok: true,
        snapshot: snapshot([
          unit("A-1", { status: "unknown", statusRaw: "Eladva" }),
          unit("A-2", { status: "unknown", statusRaw: "Eladva" }),
          unit("A-3", { status: "unknown", statusRaw: "Alku alatt" }),
          unit("A-4"),
        ]),
      }),
      store,
      SCOPE,
      "monday",
    );
    if (!outcome.ok) throw new Error("expected a report");
    expect(outcome.unknownStatuses).toEqual(["Alku alatt", "Eladva"]);
  });
});
