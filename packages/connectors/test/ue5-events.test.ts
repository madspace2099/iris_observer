import { describe, expect, it } from "vitest";

import { foldUe5Sessions, UNATTRIBUTED_AGENT_ID, type Ue5EventRow } from "../src/ue5-events";

/**
 * Expected values below are written out by hand from the event stream, never
 * computed with the helper under test.
 *
 * The stream is the one the shipped plugin (third InsightAnalytics drop) sends:
 * its event names, its hierarchy-path feature ids, and its habit of sending
 * every `TrackEvent` property as a string.
 */

const SESSION = "7a1c9f6e-2c7a-4a4e-9b31-0000000000aa";
const AGENT = "3f0c2f6e-aaaa-4bbb-8ccc-000000000001";

let sequence = 0;
function at(
  clock: string,
  name: string,
  properties: Record<string, unknown> = {},
  entity: { type: string; id: string } | null = null,
  session: string = SESSION,
): Ue5EventRow {
  sequence += 1;
  return {
    event_name: name,
    occurred_at: `2026-09-16T${clock}.000Z`,
    session_id: session,
    sequence,
    agent_id: AGENT,
    entity_type: entity?.type ?? null,
    entity_id: entity?.id ?? null,
    properties,
  };
}

const unit = (id: string) => ({ type: "unit", id });
const feature = (id: string) => ({ type: "feature", id });

function meeting(): Ue5EventRow[] {
  sequence = 0;
  return [
    at("10:00:00", "session.started", { client_platform: "Windows" }),
    at("10:00:05", "feature.opened", { category: "Residences" }, feature("Main|Residences")),
    at("10:01:00", "unit.view.started", { unit_id: "A-204", building: "A" }, unit("A-204")),
    at("10:03:00", "unit.view.ended", { unit_id: "A-204", duration_seconds: "120" }, unit("A-204")),
    at(
      "10:03:05",
      "unit.favourite_added",
      { unit_id: "A-204", is_favorite: "true" },
      unit("A-204"),
    ),
    at("10:03:10", "unit.document_opened", { document_type: "floorplan_pdf" }, unit("A-204")),
    at("10:03:20", "unit.balcony_viewed", {}, unit("A-204")),
    at("10:04:00", "unit.view.started", { unit_id: "A-204" }, unit("A-204")),
    at("10:04:45", "unit.view.ended", { unit_id: "A-204", duration_seconds: "45" }, unit("A-204")),
    at("10:05:00", "unit.view.started", { unit_id: "B-101" }, unit("B-101")),
    at("10:05:30", "unit.view.ended", { unit_id: "B-101", duration_seconds: 30 }, unit("B-101")),
    at("10:05:40", "unit.favourite_added", {}, unit("B-101")),
    at("10:05:50", "unit.favourite_removed", {}, unit("B-101")),
    at("10:06:00", "filter.applied", {
      min_price: 150000,
      max_price: 320000,
      min_surface: 0,
      max_surface: 0,
      selected_buildings: ["A", "B"],
      filtered_count: 14,
    }),
    at("10:07:00", "environment.weather_changed", { weather_type: "Rain", time_of_day: "Evening" }),
    at("10:08:00", "feature.closed", { duration_ms: "475000" }, feature("Main|Residences")),
    at("10:08:05", "feature.opened", {}, feature("Main|Surroundings|Schools")),
    at("10:09:00", "screenshot.created", { screenshot_type: "standard" }),
    at("10:09:30", "screenshot.created", { screenshot_type: "standard" }),
    at("10:10:00", "feature.opened", {}, feature("Main|Residences")),
    at("10:11:00", "meeting.outcome_set", { outcome: "Follow-up needed", previous_outcome: "" }),
    at("10:11:30", "agent.rating", { rating_score: "4", rating_label: "Good" }),
    at("10:12:00", "session.ended", { duration_seconds: "720", end_reason: "agent" }),
  ];
}

describe("one showroom meeting folds to one session", () => {
  const [session, ...rest] = foldUe5Sessions(meeting(), "prj_northgate");

  it("is exactly one session, under the read model's project id", () => {
    expect(rest).toHaveLength(0);
    expect(session?.sessionId).toBe(SESSION);
    expect(session?.meetingId).toBe(SESSION);
    expect(session?.projectId).toBe("prj_northgate");
    expect(session?.channel).toBe("showroom");
  });

  it("names the agent the envelope named and no buyer", () => {
    expect(session?.agentId).toBe(AGENT);
    expect(session?.contactId, "a visitor subject is not a contact").toBeNull();
  });

  it("takes its span from the first event and `session.ended`", () => {
    expect(session?.startedAt).toBe("2026-09-16T10:00:00.000Z");
    expect(session?.endedAt).toBe("2026-09-16T10:12:00.000Z");
    expect(session?.durationSeconds).toBe(720);
  });

  it("reads the outcome and the rating, both sent as strings", () => {
    expect(session?.outcome).toBe("follow_up_needed");
    expect(session?.irisRating).toBe(4);
  });

  it("adds up each unit's views and dwell without inventing any", () => {
    expect(session?.units).toEqual([
      {
        unitId: "A-204",
        unitCode: "A-204",
        views: 2,
        dwellSeconds: 165,
        longestViewSeconds: 120,
        favourited: true,
        pdfOpened: true,
        balconyViews: 1,
        floorCutViews: 0,
        screenshots: 0,
        comparedWith: [],
        keptFromComparison: null,
        shared: false,
      },
      {
        unitId: "B-101",
        unitCode: "B-101",
        views: 1,
        dwellSeconds: 30,
        longestViewSeconds: 30,
        favourited: false,
        pdfOpened: false,
        balconyViews: 0,
        floorCutViews: 0,
        screenshots: 0,
        comparedWith: [],
        keptFromComparison: null,
        shared: false,
      },
    ]);
  });

  it("turns feature events into timed steps, and marks a return", () => {
    expect(session?.timingUnavailable).toBe(false);
    expect(
      session?.steps.map((s) => [s.ordinal, s.sectionId, s.itemLabel, s.dwellSeconds, s.isReturn]),
    ).toEqual([
      [1, "residences", null, 475, false],
      [2, "surroundings", "Schools", null, false],
      [3, "residences", null, null, true],
    ]);
    expect(session?.steps[0]?.enteredAt).toBe("2026-09-16T10:00:05.000Z");
  });

  it("records the scene change against the section that was open", () => {
    expect(session?.environment).toEqual([
      { timeOfDay: "evening", weather: "rain", duringSectionId: "residences" },
    ]);
  });

  it("keeps an applied range and drops the untouched zero-to-zero one", () => {
    expect(session?.filters).toEqual([
      { field: "price", value: "150000–320000", matches: 14, availability: "legacy_available" },
      { field: "building", value: "A, B", matches: 14, availability: "legacy_available" },
    ]);
  });

  it("counts screenshots", () => {
    expect(session?.screenshots).toBe(2);
  });
});

describe("what the fold refuses to make up", () => {
  it("attributes a session nobody signed into to nobody, and keeps it", () => {
    sequence = 0;
    const rows = [at("09:00:00", "session.started"), at("09:04:00", "screenshot.created")].map(
      (r) => ({ ...r, agent_id: null }),
    );
    const [session] = foldUe5Sessions(rows, "prj_x");
    expect(session?.agentId).toBe(UNATTRIBUTED_AGENT_ID);
    expect(session?.outcome, "no outcome was set").toBe("skipped");
    expect(session?.irisRating).toBeNull();
    expect(session?.endedAt, "no `session.ended`: the last event").toBe("2026-09-16T09:04:00.000Z");
    expect(session?.durationSeconds).toBe(240);
    expect(session?.timingUnavailable, "no step was ever reported").toBe(true);
  });

  it("gives a view that never ended no dwell rather than an estimate", () => {
    sequence = 0;
    const [session] = foldUe5Sessions(
      [
        at("09:00:00", "unit.view.started", { unit_id: "C-7" }),
        at("09:30:00", "screenshot.created"),
      ],
      "prj_x",
    );
    expect(session?.units[0]?.views).toBe(1);
    expect(session?.units[0]?.dwellSeconds).toBe(0);
  });

  it("does not count a view twice when a build sends both the pair and `unit.viewed`", () => {
    sequence = 0;
    const [session] = foldUe5Sessions(
      [
        at("09:00:00", "unit.view.started", { unit_id: "C-7" }),
        at("09:01:00", "unit.view.ended", { unit_id: "C-7", duration_seconds: 60 }),
        at("09:01:00", "unit.viewed", { unit_id: "C-7", duration_ms: 60000 }),
      ],
      "prj_x",
    );
    expect(session?.units[0]?.views).toBe(1);
    expect(session?.units[0]?.dwellSeconds).toBe(60);
  });

  it("reads the single `unit.viewed` event when that is all a build sends", () => {
    sequence = 0;
    const [session] = foldUe5Sessions(
      [at("09:00:00", "unit.viewed", { unit_id: "C-7", duration_ms: 90000 })],
      "prj_x",
    );
    expect(session?.units[0]?.views).toBe(1);
    expect(session?.units[0]?.dwellSeconds).toBe(90);
  });

  it("rejects a rating outside one to five and an outcome it does not know", () => {
    sequence = 0;
    const [session] = foldUe5Sessions(
      [
        at("09:00:00", "agent.rating", { rating_score: "9" }),
        at("09:00:10", "meeting.outcome_set", { outcome: "Signed in blood" }),
      ],
      "prj_x",
    );
    expect(session?.irisRating).toBeNull();
    expect(session?.outcome).toBe("skipped");
  });

  it("drops a feature it cannot place rather than guessing a section", () => {
    sequence = 0;
    const [session] = foldUe5Sessions(
      [at("09:00:00", "feature.opened", {}, feature("Main|Settings|Language"))],
      "prj_x",
    );
    expect(session?.steps).toHaveLength(0);
  });
});

describe("many sessions in one read", () => {
  it("separates interleaved sessions, orders each by sequence and the set by start", () => {
    const later = "7a1c9f6e-2c7a-4a4e-9b31-0000000000bb";
    sequence = 0;
    const rows = [
      at("11:00:00", "session.started", {}, null, later),
      at("08:00:00", "session.started"),
      at("11:05:00", "unit.view.started", { unit_id: "Z-1" }, null, later),
      at("08:10:00", "session.ended", { duration_seconds: 600 }),
    ];
    /* Delivered backwards: the fold must not depend on arrival order. */
    const sessions = foldUe5Sessions([...rows].reverse(), "prj_x");
    expect(sessions.map((s) => s.sessionId)).toEqual([SESSION, later]);
    expect(sessions[0]?.durationSeconds).toBe(600);
    expect(sessions[1]?.units.map((u) => u.unitCode)).toEqual(["Z-1"]);
  });

  it("folds nothing from nothing", () => {
    expect(foldUe5Sessions([], "prj_x")).toEqual([]);
  });
});
