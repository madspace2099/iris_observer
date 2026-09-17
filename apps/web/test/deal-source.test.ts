import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@observer/readmodels";

/**
 * WHICH SYNC INSTANTS MAY STAND IN FOR A CRM'S MISSING STAGE DATE.
 *
 * The fallback that lets IRIS-assisted sales work on a CRM that states no stage
 * instant is only honest if it is narrow. The dangerous row is `opened`: the
 * first sync of a connector sees every historical sale at once, and treating
 * that instant as "when it sold" would date a sale from last year to the day the
 * connector was switched on, and call last week's showing the thing that came
 * just before it.
 */

const TWIN = "11111111-1111-4111-8111-111111111111";
const project = {
  id: "prj_ister",
  slug: "ister-tower",
  name: "ISTER TOWER",
} as unknown as ProjectSummary;

const service = {
  list: vi.fn(),
  dealSummary: vi.fn(),
  currentDeals: vi.fn(),
  recentDealChanges: vi.fn(),
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

const { liveDealSource, forgetDealMemo } = await import("../src/lib/connectors/deal-source");

const deal = (externalId: string, stage: string) => ({ externalId, stage });
const change = (
  external_id: string,
  kind: string,
  to_stage: string,
  observed_at: string,
  connector = "realpad",
) => ({ external_id, kind, to_stage, observed_at, connector });

beforeEach(() => {
  forgetDealMemo();
  vi.clearAllMocks();
  service.list.mockResolvedValue([{ kind: "realpad", enabled: true }]);
  service.dealSummary.mockResolvedValue(
    new Map([["realpad", { outcome: "ok", at: "2026-09-17T06:00:00.000Z" }]]),
  );
});

describe("the sync instants a deal source hands the read models", () => {
  it("dates a deal only by a move it witnessed onto the stage the deal still stands on", async () => {
    service.currentDeals.mockResolvedValue([
      deal("WITNESSED", "reservation"),
      deal("OPENED", "purchase"),
      deal("MOVED-ON", "purchase"),
      deal("OTHER-CRM", "reservation"),
    ]);
    /* Newest first, as the facade answers. */
    service.recentDealChanges.mockResolvedValue([
      change("MOVED-ON", "stage_changed", "purchase", "2026-09-15T06:00:00.000Z"),
      change("WITNESSED", "stage_changed", "reservation", "2026-09-10T06:00:00.000Z"),
      change("MOVED-ON", "stage_changed", "reservation", "2026-09-05T06:00:00.000Z"),
      change("WITNESSED", "stage_changed", "negotiation", "2026-09-01T06:00:00.000Z"),
      change("OTHER-CRM", "stage_changed", "reservation", "2026-09-02T06:00:00.000Z", "monday"),
      change("OPENED", "opened", "purchase", "2026-08-20T06:00:00.000Z"),
    ]);

    const delivered = await liveDealSource.dealsFor(project);
    expect(delivered?.stageObservedAt).toEqual({
      WITNESSED: "2026-09-10T06:00:00.000Z",
      /* The move onto the stage it is on NOW, not the earlier one it has since left. */
      "MOVED-ON": "2026-09-15T06:00:00.000Z",
    });
    expect(service.recentDealChanges).toHaveBeenCalledWith(TWIN, 1000);
  });

  it("hands over nothing to stand in when no move was witnessed", async () => {
    service.currentDeals.mockResolvedValue([deal("OPENED", "purchase")]);
    service.recentDealChanges.mockResolvedValue([
      change("OPENED", "opened", "purchase", "2026-08-20T06:00:00.000Z"),
    ]);
    expect((await liveDealSource.dealsFor(project))?.stageObservedAt).toEqual({});
  });
});
