import { describe, expect, it } from "vitest";
import { mapShowroomSession } from "../src/supabase-showroom";

/*
 * `mapShowroomSession` is the trust boundary for Akhilesh's live Supabase
 * telemetry (`packages/connectors/src/supabase-showroom.ts`'s own docblock).
 * No test exercised it before this file — added here rather than by
 * re-querying the live source again, using the shapes that docblock already
 * documents as confirmed live.
 */

const BASE_ROW = {
  session_id: "sess_001",
  created_at: "2026-08-24T08:00:00.000Z",
  session_data: {
    SessionStartTime: "2026.08.24-08.00.00",
    SessionEndTime: "2026.08.24-08.12.30",
  },
};

describe("mapShowroomSession — rejection contract", () => {
  it("rejects a row with no session id", () => {
    expect(mapShowroomSession({ ...BASE_ROW, session_id: undefined }, "prj_1", "agt_1")).toBeNull();
  });

  it("rejects a row with no session_data", () => {
    expect(
      mapShowroomSession(
        { session_id: "sess_002", created_at: BASE_ROW.created_at },
        "prj_1",
        "agt_1",
      ),
    ).toBeNull();
  });

  it("rejects a row where neither the source nor the row timestamp parses", () => {
    const row = {
      session_id: "sess_003",
      session_data: { SessionOutcome: "purchase" },
    };
    expect(mapShowroomSession(row, "prj_1", "agt_1")).toBeNull();
  });

  it("falls back to the row's created_at when the source timestamp is malformed", () => {
    const row = {
      session_id: "sess_004",
      created_at: "2026-08-24T08:00:00.000Z",
      session_data: { SessionStartTime: "not-a-timestamp" },
    };
    const mapped = mapShowroomSession(row, "prj_1", "agt_1");
    expect(mapped?.startedAt).toBe("2026-08-24T08:00:00.000Z");
  });
});

describe("mapShowroomSession — outcome word mapping", () => {
  it("maps a recognised outcome word case- and space-insensitively", () => {
    const row = {
      ...BASE_ROW,
      session_data: { ...BASE_ROW.session_data, SessionOutcome: "Follow-Up Needed" },
    };
    expect(mapShowroomSession(row, "prj_1", "agt_1")?.outcome).toBe("follow_up_needed");
  });

  it("maps an unrecognised outcome word to skipped rather than guessing", () => {
    const row = {
      ...BASE_ROW,
      session_data: { ...BASE_ROW.session_data, SessionOutcome: "something new" },
    };
    expect(mapShowroomSession(row, "prj_1", "agt_1")?.outcome).toBe("skipped");
  });
});

describe("mapShowroomSession — filter ranges", () => {
  it("keeps a genuine range on every dimension, sharing the one combined match count", () => {
    const row = {
      ...BASE_ROW,
      session_data: {
        ...BASE_ROW.session_data,
        FilterUsage: {
          FloorRange: { Min: 5, Max: 30 },
          PriceRange: { Min: 197399, Max: 1578526 },
          SurfaceRange: { Min: 25, Max: 240 },
          SelectedRooms: [1, 2, 3],
          FilteredApartmentCount: 33,
        },
      },
    };
    const filters = mapShowroomSession(row, "prj_1", "agt_1")?.filters ?? [];
    expect(filters).toEqual(
      expect.arrayContaining([
        { field: "floor", value: "5–30", matches: 33, availability: "legacy_available" },
        { field: "price", value: "197399–1578526", matches: 33, availability: "legacy_available" },
        { field: "surface", value: "25–240", matches: 33, availability: "legacy_available" },
        { field: "rooms", value: "1, 2, 3", matches: 33, availability: "legacy_available" },
      ]),
    );
  });

  /*
   * The regression this file exists to pin down: a dimension the buyer never
   * opened serialises as `{Min: 0, Max: 0}`, not as an absent field (the
   * source's range struct is default-constructed). Before this fix, three
   * untouched dimensions on one session rendered as three simultaneous
   * "0–0" filter rows applied to every meeting that carried a FilterUsage
   * block at all — a zero rendered as if it were a buyer's answer, which is
   * exactly what "never render an absent value as zero" forbids.
   */
  it("does not report a range still sitting on its zero default as an applied filter", () => {
    const row = {
      ...BASE_ROW,
      session_data: {
        ...BASE_ROW.session_data,
        FilterUsage: {
          FloorRange: { Min: 0, Max: 0 },
          PriceRange: { Min: 0, Max: 0 },
          SurfaceRange: { Min: 0, Max: 0 },
          FilteredApartmentCount: 0,
        },
      },
    };
    const filters = mapShowroomSession(row, "prj_1", "agt_1")?.filters ?? [];
    expect(filters.map((f) => f.field)).toEqual([]);
  });

  it("still reports a range whose real minimum happens to be zero", () => {
    // Zero-to-zero is never genuine; zero-to-something is an ordinary ground-floor filter.
    const row = {
      ...BASE_ROW,
      session_data: {
        ...BASE_ROW.session_data,
        FilterUsage: { FloorRange: { Min: 0, Max: 3 }, FilteredApartmentCount: 4 },
      },
    };
    const filters = mapShowroomSession(row, "prj_1", "agt_1")?.filters ?? [];
    expect(filters).toEqual([
      { field: "floor", value: "0–3", matches: 4, availability: "legacy_available" },
    ]);
  });

  it("marks the missing half of a partial range rather than guessing it", () => {
    const row = {
      ...BASE_ROW,
      session_data: {
        ...BASE_ROW.session_data,
        FilterUsage: { PriceRange: { Max: 250_000 }, FilteredApartmentCount: 9 },
      },
    };
    const filters = mapShowroomSession(row, "prj_1", "agt_1")?.filters ?? [];
    expect(filters).toEqual([
      { field: "price", value: "?–250000", matches: 9, availability: "legacy_available" },
    ]);
  });

  it("reports no filters at all when the session carries no FilterUsage block", () => {
    expect(mapShowroomSession(BASE_ROW, "prj_1", "agt_1")?.filters).toEqual([]);
  });
});
