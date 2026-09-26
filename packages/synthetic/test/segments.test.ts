import { describe, expect, it } from "vitest";
import type { OverviewQuery, Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";
import { catalogueFor, roomCounts, roomLabel } from "../src/pulse";

import { DEFAULT_LANGUAGE } from "@observer/readmodels";
/**
 * Room segments follow the catalogue.
 *
 * The parity scale on Project says "X% of looking time on Y% of stock". For
 * that sentence to be true, every unit in the stock has to belong to some
 * row — which a hand-written two-entry segment list could not promise once a
 * catalogue held a one-room or a four-room flat. These tests pin the
 * derivation to the stock rather than to any count in particular, so a
 * catalogue arriving from a CRM with five counts passes them unchanged.
 */

const repo = new SyntheticObserverRepository();

function query(viewer: Viewer, tenantSlug: string, projectSlug: string): OverviewQuery {
  return { viewer, tenantSlug, projectSlug, period: "quarter_to_date", language: DEFAULT_LANGUAGE };
}

const ISTER = query(VIEWERS.developer as Viewer, "alpha", "ister-tower");
const NORTHGATE = query(VIEWERS.developer as Viewer, "alpha", "northgate");

describe("roomCounts and roomLabel", () => {
  it("lists each count once, ascending, whatever order the stock is in", () => {
    expect(
      roomCounts([{ rooms: 3 }, { rooms: 1 }, { rooms: 3 }, { rooms: 4 }, { rooms: 1 }]),
    ).toEqual([1, 3, 4]);
    expect(roomCounts([])).toEqual([]);
  });

  it("spells the counts it has a word for and falls back to the number", () => {
    expect(roomLabel(1)).toBe("One-room");
    expect(roomLabel(4)).toBe("Four-room");
    expect(roomLabel(7)).toBe("7-room");
  });
});

describe("project segments", () => {
  it("has one segment per room count the catalogue contains, smallest first", async () => {
    const catalogue = catalogueFor("prj_istertower1");
    const counts = roomCounts(catalogue);
    // The fixture must exercise more than the two counts the old constant had,
    // or this test would pass against the constant too.
    expect(counts.length).toBeGreaterThan(2);

    const view = await repo.getProjectView(ISTER, null);
    expect(view.segments.map((s) => s.rooms)).toEqual(counts);
    expect(view.segments.map((s) => s.id)).toEqual(counts.map((n) => `rooms-${n}`));
    expect(view.segments.map((s) => s.label)).toEqual(counts.map(roomLabel));
  });

  it("accounts for every available unit exactly once across the segments", async () => {
    const available = catalogueFor("prj_istertower1").filter((u) => u.status === "available");
    const view = await repo.getProjectView(ISTER, null);
    const counted = view.segments.reduce((sum, s) => sum + s.availableUnits, 0);
    expect(counted).toBe(available.length);
    const stock = view.segments.reduce((sum, s) => sum + s.stockShare, 0);
    expect(stock).toBeCloseTo(1, 6);
  });

  it("still gives a two-count scheme exactly two segments", async () => {
    // Northgate's stacking plan alternates two- and three-room units by rule,
    // so the derivation must reproduce the two segments that scheme always had.
    const view = await repo.getProjectView(NORTHGATE, null);
    expect(view.segments.map((s) => s.id)).toEqual(["rooms-2", "rooms-3"]);
  });

  it("opens the first segment when none is asked for, and nothing for one the stock lacks", async () => {
    const byDefault = await repo.getProjectView(ISTER, null);
    expect(byDefault.selectedSegment?.id).toBe(byDefault.segments[0]?.id);

    const asked = await repo.getProjectView(ISTER, "rooms-4");
    expect(asked.selectedSegment?.rooms).toBe(4);

    const absent = await repo.getProjectView(ISTER, "rooms-9");
    expect(absent.selectedSegment).toBeNull();
  });

  it("never names a count by hand in the verdict", async () => {
    const view = await repo.getProjectView(ISTER, null);
    const named = view.segments.find((s) => view.verdict.startsWith(s.label));
    // Either the verdict leads with a segment that exists, or it is the
    // bare meeting count because no segment cleared the sentence floor.
    expect(named !== undefined || /^\d/.test(view.verdict)).toBe(true);
  });
});

describe("audience room choices", () => {
  it("offers only the counts the project has, in the same order as Project", async () => {
    const view = await repo.getAudience(ISTER, {
      rooms: null,
      favouritedOnly: true,
      placeCategory: null,
      minimumPlaceSeconds: 25,
    });
    expect(view.roomChoices.map((c) => c.rooms)).toEqual(
      roomCounts(catalogueFor("prj_istertower1")),
    );
    expect(view.roomChoices.map((c) => c.label)).toEqual(
      view.roomChoices.map((c) => roomLabel(c.rooms)),
    );
  });

  it("matches a four-room criterion against four-room units only", async () => {
    const fourRoom = new Set(
      catalogueFor("prj_istertower1")
        .filter((u) => u.rooms === 4)
        .map((u) => u.code),
    );
    const view = await repo.getAudience(ISTER, {
      rooms: 4,
      favouritedOnly: false,
      placeCategory: null,
      minimumPlaceSeconds: 0,
    });
    expect(view.description).toContain("a four-room unit");
    for (const m of view.matches) {
      const codes = m.because.split(" · ")[0]?.split(", ") ?? [];
      expect(
        codes.some((c) => fourRoom.has(c)),
        m.because,
      ).toBe(true);
    }
  });
});

describe("pulse segments", () => {
  it("derives the rooms dimension from the stock and keeps the pinned ratios only where they exist", async () => {
    const pulse = await repo.getProjectPulse(ISTER);
    const rooms = pulse.segments.filter((s) => s.dimension === "rooms");
    expect(rooms.map((s) => s.id)).toEqual(
      roomCounts(catalogueFor("prj_istertower1")).map((n) => `rooms-${n}`),
    );
    const byId = new Map(rooms.map((s) => [s.id, s.conversionRatio]));
    expect(byId.get("rooms-2")).toBe(0.5);
    expect(byId.get("rooms-3")).toBe(1.3);
    expect(byId.get("rooms-1")).toBeNull();
    expect(byId.get("rooms-4")).toBeNull();
  });
});
