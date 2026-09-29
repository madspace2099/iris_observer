import { describe, expect, it } from "vitest";
import {
  SURROUNDINGS,
  type MeasurementAvailability,
  type PlaceCategory,
  type ShowroomPlaceInteraction,
  type ShowroomSession,
} from "@observer/contracts";
import type { AudienceCriteria, ViewContext } from "@observer/readmodels";
import { showroomSessions } from "../src/showroom/sessions";
import { buildAudience } from "../src/showroom/views3";

/**
 * An audience stands only on places whose presentation was recorded (P2-18).
 *
 * The contract says of Surroundings points of interest that `availability` is
 * `requires_ue5_v2_event` "and every surface reading them says so"
 * (`ShowroomPlaceInteraction`). `buildAudience` read them on category and dwell
 * alone: on Northgate, year to date, every one of the 29 meetings on the
 * transport list stood on Surroundings stops and an airport, none of them
 * recorded.
 *
 * ## The numbers are a measurement, not a recomputation
 *
 * Measured on 2026-09-24 before the gate, over every synthetic meeting of every
 * project — family places, 25 seconds, any unit, merely opened: 125 meetings.
 * Classified by SECTION, which the gate does not read: 47 on amenities only, 52
 * on both, 26 on Surroundings only, and 12 of those 26 held the Surroundings
 * kindergarten. The gate reads AVAILABILITY and has to keep 47 + 52 = 99. The
 * literals below are that measurement; nothing here recomputes them.
 */

const FAMILY: AudienceCriteria = {
  rooms: null,
  favouritedOnly: false,
  placeCategory: "family",
  minimumPlaceSeconds: 25,
};

function contextFor(projectId: string): ViewContext {
  return {
    tenant: { slug: "test-tenant" },
    project: {
      id: projectId,
      slug: "test-project",
      locale: "en-GB",
      timeZone: "Europe/Bratislava",
    },
  } as unknown as ViewContext;
}

describe("the synthetic world, against the measurement", () => {
  const all = showroomSessions();
  const projects = [...new Set(all.map((s) => s.projectId))];
  const matches = projects.flatMap(
    (projectId) =>
      buildAudience(
        contextFor(projectId),
        all.filter((s) => s.projectId === projectId),
        FAMILY,
      ).matches,
  );
  const sessionOf = new Map(all.map((s) => [s.meetingId, s]));

  it("keeps the 99 meetings a recorded family place holds", () => {
    expect(matches.length).toBe(99);
  });

  it("keeps none of the 26 only Surroundings held — checked by section, which the gate does not read", () => {
    const surroundingsOnly = matches.filter(
      (m) =>
        !sessionOf
          .get(m.meetingId)
          ?.places.some(
            (p) => p.section === "amenities" && p.category === "family" && p.dwellSeconds >= 25,
          ),
    );
    expect(surroundingsOnly.length).toBe(0);
  });

  it("names no Surroundings place as why a meeting matched", () => {
    const naming = matches.filter((m) => SURROUNDINGS.some((p) => m.because.includes(p.name)));
    expect(naming.map((m) => m.because)).toEqual([]);
  });

  it("says on every row what it stands on", () => {
    const said = new Set(matches.map((m) => `${m.source} · ${m.availability}`));
    expect([...said]).toEqual(["IRIS_SHOWROOM_OBSERVED · legacy_available"]);
  });
});

describe("one meeting at a time", () => {
  const PROJECT_ID = "prj_test_audience_places"; // never a real project

  function place(
    placeName: string,
    section: ShowroomPlaceInteraction["section"],
    availability: MeasurementAvailability,
    dwellSeconds: number,
    category: PlaceCategory = "family",
  ): ShowroomPlaceInteraction {
    return {
      placeId: `place_${placeName}`,
      placeName,
      category,
      section,
      dwellSeconds,
      availability,
    };
  }

  function meeting(
    meetingId: string,
    places: readonly ShowroomPlaceInteraction[],
  ): ShowroomSession {
    return {
      sessionId: `s-${meetingId}`,
      meetingId,
      projectId: PROJECT_ID,
      agentId: "agent_test",
      channel: "showroom",
      contactId: null,
      startedAt: "2026-03-12T14:30:00.000Z",
      endedAt: "2026-03-12T15:00:00.000Z",
      durationSeconds: 1_800,
      outcome: "presentation_only",
      steps: [],
      units: [
        {
          unitId: "unit_a101",
          unitCode: "A-101",
          views: 1,
          dwellSeconds: 60,
          longestViewSeconds: 60,
          favourited: false,
          pdfOpened: false,
          balconyViews: 0,
          floorCutViews: 0,
          screenshots: 0,
          comparedWith: [],
          keptFromComparison: null,
          shared: false,
        },
      ],
      environment: [],
      filters: [],
      places,
      screenshots: 0,
      irisRating: null,
      priorMeetings: 0,
      timingUnavailable: false,
    };
  }

  const KINDERGARTEN_NEARBY = place(
    "Materská škola Miletičova 37",
    "surroundings",
    "requires_ue5_v2_event",
    90,
  );
  const SURROUNDINGS_ONLY = meeting("mtg_surroundings", [KINDERGARTEN_NEARBY]);
  const AMENITY = meeting("mtg_amenity", [
    place("Materská škola", "amenities", "legacy_available", 30),
  ]);
  const BOTH = meeting("mtg_both", [
    KINDERGARTEN_NEARBY,
    place("Park", "amenities", "legacy_available", 30),
  ]);
  /** The section reached and nothing more: `docs/16` §2.6 calls it partially derivable. */
  const SECTION_ONLY = meeting("mtg_section", [
    place("Surroundings", "surroundings", "partially_derivable", 120),
  ]);
  const MEETINGS = [SURROUNDINGS_ONLY, AMENITY, BOTH, SECTION_ONLY];

  it("selects a meeting only on a recorded place", () => {
    const view = buildAudience(contextFor(PROJECT_ID), MEETINGS, FAMILY);
    expect(view.matches.map((m) => m.meetingId)).toEqual(["mtg_amenity", "mtg_both"]);
  });

  it("names only the recorded place as why it matched", () => {
    const view = buildAudience(contextFor(PROJECT_ID), MEETINGS, FAMILY);
    const both = view.matches.find((m) => m.meetingId === "mtg_both");
    expect(both?.because).toBe("A-101 · Park 30s");
  });

  it("names no unrecorded place when no kind of place was asked for", () => {
    const view = buildAudience(contextFor(PROJECT_ID), MEETINGS, {
      ...FAMILY,
      placeCategory: null,
    });
    expect(view.matches.map((m) => m.because)).toEqual([
      "A-101",
      "A-101 · Materská škola 30s",
      "A-101 · Park 30s",
      "A-101",
    ]);
  });

  describe("no list, and the input it is missing", () => {
    const TRAM_STOP = place(
      "Električková zastávka Herlianska",
      "surroundings",
      "requires_ue5_v2_event",
      60,
      "transport",
    );
    const TRANSPORT = { ...FAMILY, placeCategory: "transport" as const };
    const unavailable = (meetings: readonly ShowroomSession[], criteria: AudienceCriteria) =>
      buildAudience(contextFor(PROJECT_ID), meetings, criteria).unavailable;

    it("names both inputs when no meeting has a recorded place", () => {
      // The live connectors' shape today: `places: []` on every meeting.
      const said = unavailable([meeting("mtg_live", [])], TRANSPORT);
      expect(said?.missing).toMatch(/UE5 v2 event/);
      expect(said?.missing).toMatch(/legacy Amenities items mapped to places/);
    });

    it("names the UE5 v2 event when the kind was reached only where nothing is recorded", () => {
      const said = unavailable([meeting("mtg_tram", [TRAM_STOP]), AMENITY], TRANSPORT);
      expect(said?.missing).toMatch(/UE5 v2 event/);
      expect(said?.missing).not.toMatch(/Amenities/);
    });

    it("keeps a list, empty, when the kind can be recorded and nobody lingered on it", () => {
      const view = buildAudience(contextFor(PROJECT_ID), [AMENITY], {
        ...FAMILY,
        placeCategory: "convenience",
      });
      expect([view.unavailable, view.total]).toEqual([null, 0]);
    });

    it("keeps a list when the kind has a recorded place, or when no kind was asked for", () => {
      expect(unavailable(MEETINGS, FAMILY)).toBeNull();
      expect(unavailable([meeting("mtg_live", [])], { ...FAMILY, placeCategory: null })).toBeNull();
    });
  });
});
