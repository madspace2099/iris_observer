import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@observer/readmodels";

/**
 * WHICH SYNC INSTANTS MAY DATE A FLAT'S AVAILABILITY CHANGE (ADR-0049).
 *
 * The catalogue states no date for a status change, so IRIS-led sales date one
 * by the sync that first saw it — and only a change WITNESSED between two syncs
 * onto the status the flat still has. A flat first seen already sold was
 * `added`, on the day the connector was switched on, and must stay undated.
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
const change = (
  code: string,
  kind: string,
  fields: string[],
  after: string | null,
  fetched_at: string,
  connector = "realpad",
) => ({
  code,
  kind,
  changed_fields: fields,
  after_unit: after === null ? null : { status: after },
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

describe("the sync instants a catalogue hands IRIS-led sales", () => {
  it("dates a flat only by a status change it witnessed onto the status it still has", async () => {
    service.currentUnits.mockResolvedValue([
      unit("SOLD-SEEN", "sold"),
      unit("SOLD-ADDED", "sold"),
      unit("PRICE-LATER", "reserved"),
      unit("REVERTED", "available"),
      unit("OTHER-CRM", "sold"),
    ]);
    /* Newest first, as the façade answers. */
    service.recentChanges.mockResolvedValue([
      change("PRICE-LATER", "changed", ["price"], "reserved", "2026-09-20T06:00:00.000Z"),
      change("REVERTED", "changed", ["status"], "available", "2026-09-18T06:00:00.000Z"),
      change("SOLD-SEEN", "changed", ["status", "price"], "sold", "2026-09-15T06:00:00.000Z"),
      change("PRICE-LATER", "changed", ["status"], "reserved", "2026-09-12T06:00:00.000Z"),
      change("REVERTED", "changed", ["status"], "sold", "2026-09-10T06:00:00.000Z"),
      change("SOLD-SEEN", "changed", ["status"], "reserved", "2026-09-05T06:00:00.000Z"),
      change("OTHER-CRM", "changed", ["status"], "sold", "2026-09-04T06:00:00.000Z", "monday"),
      change("SOLD-ADDED", "added", [], "sold", "2026-08-01T06:00:00.000Z"),
    ]);

    const delivered = await liveCatalogueSource.catalogueFor(project);
    expect(delivered?.statusObservedAt).toEqual({
      /* Its latest status change, onto the status it holds now. */
      "SOLD-SEEN": "2026-09-15T06:00:00.000Z",
      /* A later price change does not move the date of the reservation. */
      "PRICE-LATER": "2026-09-12T06:00:00.000Z",
      /* Back on the market: its move to available, never the sale it has left. */
      REVERTED: "2026-09-18T06:00:00.000Z",
    });
    expect(service.recentChanges).toHaveBeenCalledWith(TWIN, 1000);
  });
});
