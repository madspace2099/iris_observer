import { describe, expect, it } from "vitest";

import type { CatalogueUnit, ShowroomSession, ShowroomUnitInteraction } from "@observer/contracts";
import type {
  CatalogueSource,
  OverviewQuery,
  ShowroomSessionSource,
  Viewer,
} from "@observer/readmodels";

import { SyntheticObserverRepository, VIEWERS } from "../src/index";

/**
 * THE BUILDING, LIT BY THE PROJECT'S OWN MEETINGS.
 *
 * A delivered catalogue used to be dark whatever the showroom sent: invented
 * attention was rightly refused for real flats and nothing took its place. Where
 * a project's meetings are its own, a unit's light is what those meetings did to
 * it, joined on the unit's code and counted by the showroom's dwell policy.
 */

const NOW = new Date("2026-09-18T09:30:00.000Z");
const ISTER: OverviewQuery = {
  viewer: VIEWERS.developer as Viewer,
  tenantSlug: "alpha",
  projectSlug: "ister-tower",
  period: "last_28_days",
};

function unit(code: string, floor: number): CatalogueUnit {
  return {
    code,
    externalId: code,
    building: "A",
    floor,
    rooms: 2,
    layout: "2+kk",
    kitchen: "kitchenette",
    unitType: "flat",
    areas: { interiorSqm: 54, exteriorSqm: null, grossSqm: null },
    price: { withVat: 210000, withoutVat: null, currency: "EUR" },
    orientation: ["J"],
    status: "available",
    statusRaw: "0",
    availableFrom: null,
    updatedAt: null,
  };
}

const catalogue: CatalogueSource = {
  catalogueFor: async (project) =>
    project.slug === "ister-tower"
      ? {
          connector: "csv",
          orientationMap: { J: "S" },
          units: [unit("A-101", 1), unit("A-201", 2), unit("A-301", 3)],
        }
      : null,
};

function touch(unitCode: string, dwellSeconds: number): ShowroomUnitInteraction {
  return {
    unitId: unitCode,
    unitCode,
    views: 1,
    dwellSeconds,
    longestViewSeconds: dwellSeconds,
    favourited: false,
    pdfOpened: false,
    balconyViews: 0,
    floorCutViews: 0,
    screenshots: 0,
    comparedWith: [],
    keptFromComparison: null,
    shared: false,
  };
}

function meeting(
  id: string,
  day: string,
  units: readonly ShowroomUnitInteraction[],
): ShowroomSession {
  return {
    sessionId: id,
    meetingId: id,
    projectId: "prj_istertower1",
    agentId: "AG-1",
    channel: "showroom",
    contactId: null,
    startedAt: `${day}T10:00:00.000Z`,
    endedAt: `${day}T10:20:00.000Z`,
    durationSeconds: 1200,
    outcome: "interested",
    steps: [],
    units: [...units],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

const sessions: ShowroomSessionSource = {
  sessionsFor: async (project) =>
    project.slug === "ister-tower"
      ? {
          connector: "ue5_events",
          fetchedAt: NOW.toISOString(),
          sessions: [
            /* Two meetings looked at A-201 properly; one of them also glanced at A-101. */
            meeting("7a1c9f6e-2c7a-4a4e-9b31-0000000000d1", "2026-09-16", [
              touch("A-201", 180),
              touch("A-101", 4),
            ]),
            meeting("7a1c9f6e-2c7a-4a4e-9b31-0000000000d2", "2026-09-17", [
              touch("A-201", 95),
              touch("A-301", 60),
              /* A code the catalogue does not hold. */
              touch("Z-999", 300),
            ]),
          ],
        }
      : null,
};

function unitsOf(pulse: Awaited<ReturnType<SyntheticObserverRepository["getProjectPulse"]>>) {
  return new Map(pulse.floors.flatMap((f) => f.units).map((u) => [u.code, u]));
}

describe("a delivered catalogue with the project's own meetings", () => {
  const repository = new SyntheticObserverRepository({
    catalogueSource: catalogue,
    sessionSource: sessions,
    now: () => NOW,
  });

  it("lights each unit by the meetings that looked at it properly", async () => {
    const pulse = await repository.getProjectPulse(ISTER);
    const units = unitsOf(pulse);

    expect(units.get("A-201")?.meaningfulViews).toBe(2);
    expect(units.get("A-301")?.meaningfulViews).toBe(1);
    expect(units.get("A-101")?.meaningfulViews, "a four-second glance is not a view").toBe(0);

    expect(pulse.peakViews).toBe(2);
    expect(units.get("A-201")?.attention).toBe(1);
    expect(units.get("A-301")?.attention).toBe(0.5);
    expect(units.get("A-101")?.attention).toBe(0);
  });

  it("counts people as meetings, and claims no intent it cannot know", async () => {
    const units = unitsOf(await repository.getProjectPulse(ISTER));
    expect(units.get("A-201")?.uniqueContacts).toBe(2);
    expect(units.get("A-201")?.intent).toBeNull();
    expect(units.get("A-201")?.change).toBeNull();
    /* Nothing in the baseline period, so what there is now is a rise. */
    expect(units.get("A-201")?.trend).toBe("rising");
    expect(units.get("A-101")?.trend).toBe("flat");
  });

  it("rests its evidence on the views it counted, and lights nothing for an unknown code", async () => {
    const pulse = await repository.getProjectPulse(ISTER);
    expect(pulse.evidence.observationCount).toBe(3);
    expect(unitsOf(pulse).has("Z-999")).toBe(false);
  });
});

describe("a delivered catalogue with no meetings of the project's own", () => {
  it("stays dark, as before, rather than borrowing the scenario's light", async () => {
    const pulse = await new SyntheticObserverRepository({
      catalogueSource: catalogue,
    }).getProjectPulse(ISTER);
    expect([...unitsOf(pulse).values()].every((u) => u.meaningfulViews === 0)).toBe(true);
    expect(pulse.evidence.observationCount).toBe(0);
  });
});
