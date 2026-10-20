import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@observer/readmodels";

/**
 * WHICH SYNC INSTANTS MAY DATE A FLAT'S MOVE OFF THE MARKET (ADR-0049).
 *
 * The catalogue states no date for a status change, so IRIS-led sales date one
 * by the two syncs around it — and only a move WITNESSED between two syncs, from
 * a status the mapping knows to reserved or sold, with the CRM's own word
 * changing too. A flat first seen already sold, or one whose old word was only
 * mapped later, must stay undated: either would mint a sale on a sync's day.
 */

const TWIN = "22222222-2222-4222-8222-222222222222";
const project = {
  id: "prj_ister",
  slug: "ister-tower",
  name: "ISTER TOWER",
} as unknown as ProjectSummary;

const service = {
  list: vi.fn(),
  currentUnits: vi.fn(),
  recentChanges: vi.fn(),
};

vi.mock("../src/lib/sources/control-plane", () => ({
  CONTROL_PLANE_ACCOUNT: "acct_test",
  controlPlane: () =>
    Promise.resolve({
      ok: true,
      admin: {
        projectsForAccount: () =>
          Promise.resolve({
            ok: true,
            value: [{ project_id: TWIN, slug: "ister-tower", name: "Ister Tower" }],
          }),
      },
    }),
}));
vi.mock("../src/lib/connectors/live", () => ({
  liveConnectorService: () => Promise.resolve(service),
}));

const { liveCatalogueSource, forgetCatalogueMemo } =
  await import("../src/lib/connectors/catalogue-source");

const unit = (code: string, status: string) => ({ code, status });
/* A status as a unit row holds it: the mapped word and the CRM's own. */
const was = (status: string, statusRaw: string = status) => ({ status, statusRaw });
const change = (
  code: string,
  kind: string,
  fields: string[],
  before: { status: string; statusRaw: string } | null,
  after: { status: string; statusRaw: string },
  fetched_at: string,
  connector = "realpad",
) => ({
  code,
  kind,
  changed_fields: fields,
  before_unit: before,
  after_unit: after,
  fetched_at,
  connector,
});

beforeEach(() => {
  forgetCatalogueMemo();
  vi.clearAllMocks();
  service.list.mockResolvedValue([
    { kind: "realpad", enabled: true, lastSync: { outcome: "ok" }, config: {} },
  ]);
});

describe("the moves off the market a catalogue hands IRIS-led sales", () => {
  it("dates a flat by its witnessed move off the market, and nothing else", async () => {
    service.currentUnits.mockResolvedValue([
      unit("SOLD-SEEN", "sold"),
      unit("SOLD-ADDED", "sold"),
      unit("PRICE-LATER", "reserved"),
      unit("REVERTED", "available"),
      unit("OTHER-CRM", "sold"),
      unit("REMAPPED", "sold"),
      unit("FROM-UNKNOWN", "sold"),
    ]);
    /* Newest first, as the façade answers. */
    service.recentChanges.mockResolvedValue([
      change(
        "PRICE-LATER",
        "changed",
        ["price"],
        was("reserved"),
        was("reserved"),
        "2026-09-20T06:00:00.000Z",
      ),
      change(
        "REVERTED",
        "changed",
        ["status"],
        was("sold"),
        was("available"),
        "2026-09-18T06:00:00.000Z",
      ),
      /* The admin mapped "Prodáno": the CRM's word did not move, so nothing sold that day. */
      change(
        "REMAPPED",
        "changed",
        ["status"],
        was("unknown", "Prodáno"),
        was("sold", "Prodáno"),
        "2026-09-18T06:00:00.000Z",
      ),
      change(
        "SOLD-SEEN",
        "changed",
        ["status", "price"],
        was("reserved"),
        was("sold"),
        "2026-09-15T06:00:00.000Z",
      ),
      /* From a word nobody had mapped: it may already have been reserved. */
      change(
        "FROM-UNKNOWN",
        "changed",
        ["status"],
        was("unknown", "Rezervováno"),
        was("sold", "Prodáno"),
        "2026-09-15T06:00:00.000Z",
      ),
      change(
        "PRICE-LATER",
        "changed",
        ["status"],
        was("available"),
        was("reserved"),
        "2026-09-12T06:00:00.000Z",
      ),
      change(
        "REVERTED",
        "changed",
        ["status"],
        was("available"),
        was("sold"),
        "2026-09-10T06:00:00.000Z",
      ),
      change(
        "SOLD-SEEN",
        "changed",
        ["status"],
        was("available"),
        was("reserved"),
        "2026-09-05T06:00:00.000Z",
      ),
      change(
        "OTHER-CRM",
        "changed",
        ["status"],
        was("available"),
        was("sold"),
        "2026-09-04T06:00:00.000Z",
        "monday",
      ),
      change("SOLD-ADDED", "added", [], null, was("sold"), "2026-08-01T06:00:00.000Z"),
    ]);

    const delivered = await liveCatalogueSource.catalogueFor(project);
    expect(delivered?.statusChanges).toEqual({
      /* Reserved on the 5th, sold on the 15th: the move off the market is the 5th. Monday's sync is another connector's. */
      "SOLD-SEEN": {
        at: "2026-09-05T06:00:00.000Z",
        to: "reserved",
        seenBefore: "2026-08-01T06:00:00.000Z",
      },
      /* A later price change does not move the date of the reservation. */
      "PRICE-LATER": {
        at: "2026-09-12T06:00:00.000Z",
        to: "reserved",
        seenBefore: "2026-09-10T06:00:00.000Z",
      },
    });
    expect(service.recentChanges).toHaveBeenCalledWith(TWIN, 1000);
  });

  it("keeps the catalogue when its changes cannot be read, with no flat dated", async () => {
    service.currentUnits.mockResolvedValue([unit("A-1", "sold")]);
    service.recentChanges.mockRejectedValue(new Error("statement timeout"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const delivered = await liveCatalogueSource.catalogueFor(project);
    expect(delivered?.units).toEqual([unit("A-1", "sold")]);
    expect(delivered?.statusChanges).toEqual({});
    error.mockRestore();
  });
});
