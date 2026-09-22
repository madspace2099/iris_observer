import { afterEach, describe, expect, it } from "vitest";
import type { ShowroomSession, ShowroomUnitInteraction } from "@observer/contracts";
import type { ViewContext } from "@observer/readmodels";
import { buildMeetingReplay } from "../src/showroom/project";
import { provideCatalogue, type RawUnit } from "../src/pulse";

/**
 * The replay says what the catalogue and the session together know about the
 * units it opened — in the read model, and in every shape the sentence takes.
 *
 * ## Why every case is constructed
 *
 * The fixtures contain no code the catalogue does not hold (measured across
 * every project: nought), so a fixture-driven test would never exercise the
 * guard that keeps an unknown code out of the room bands. And the shapes that
 * matter most are the ones a fixture makes rare: a meeting that opened one
 * unit, a meeting that shortlisted nothing. So the sessions are hand-built, in
 * the shape `views3.test.ts` established, against a catalogue this file
 * provides and takes away again.
 *
 * ## What "nought" has to mean
 *
 * "Nothing was shortlisted" is a thing that happened. It is not the "not
 * observed" shape, because the showroom did observe the meeting and saw no
 * shortlist — and on the smallest scheme that is one meeting in five. A
 * sentence that rendered it as an absence would tell a fifth of readers the
 * data was missing when the answer was no.
 */

const PROJECT_ID = "prj_test_replay_units"; // never a real project: isolation is provable, not coincidental

function unit(
  unitCode: string,
  over: Partial<ShowroomUnitInteraction> = {},
): ShowroomUnitInteraction {
  return {
    unitId: `u-${unitCode}`,
    unitCode,
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
    ...over,
  };
}

function session(units: readonly ShowroomUnitInteraction[]): ShowroomSession {
  return {
    sessionId: "s-1",
    meetingId: "mtg_test",
    projectId: PROJECT_ID,
    agentId: "agent_test",
    channel: "showroom",
    contactId: null,
    startedAt: "2026-03-12T14:30:00.000Z",
    endedAt: "2026-03-12T15:00:00.000Z",
    durationSeconds: 1800,
    outcome: "presentation_only",
    steps: [],
    units,
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

function raw(code: string, rooms: number | null): RawUnit {
  return {
    code,
    block: "A",
    floor: 1,
    rooms,
    areaSqm: 60,
    orientation: "S",
    price: 200_000,
    status: "available",
  };
}

/* `project.id`, the slugs, `locale` and `timeZone` are what `buildMeetingReplay` reads. */
const CONTEXT = {
  tenant: { slug: "test-tenant" },
  project: { id: PROJECT_ID, slug: "test-project", locale: "en-GB", timeZone: "Europe/Bratislava" },
} as unknown as ViewContext;

/** A catalogue of four: three with a room count, one that states none. */
const CATALOGUE: readonly RawUnit[] = [
  raw("A-1", 2),
  raw("A-2", 2),
  raw("A-3", 3),
  raw("A-4", null),
];

describe("the replay's units, joined in the read model", () => {
  afterEach(() => {
    provideCatalogue(PROJECT_ID, null); // never leak a fixture catalogue into another file
  });

  it("several: bands by room count, and the shortlist counted", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const replay = buildMeetingReplay(
      CONTEXT,
      session([unit("A-1", { favourited: true }), unit("A-2", { favourited: true }), unit("A-3")]),
    );

    expect(replay.unitsViewed.opened).toBe(3);
    expect(replay.unitsViewed.byRooms, "the room bands are not what the catalogue states").toEqual([
      { rooms: 2, count: 2 },
      { rooms: 3, count: 1 },
    ]);
    expect(replay.unitsViewed.shortlisted).toBe(2);
    expect(replay.unitsViewed.sentence).toBe(
      "3 units opened: 2 with 2 rooms, 1 with 3 rooms; 2 shortlisted.",
    );
  });

  it("one: the singular is a sentence, not a plural with a one in it", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const replay = buildMeetingReplay(CONTEXT, session([unit("A-1", { favourited: true })]));

    expect(replay.unitsViewed.opened).toBe(1);
    expect(replay.unitsViewed.sentence, "one unit is worded as if it were several").toBe(
      "1 unit opened: 1 with 2 rooms; 1 shortlisted.",
    );
  });

  it("nought shortlisted: an answer, worded as what happened", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const replay = buildMeetingReplay(CONTEXT, session([unit("A-1"), unit("A-3")]));

    expect(replay.unitsViewed.shortlisted).toBe(0);
    expect(
      replay.unitsViewed.sentence,
      "a shortlist of nought is worded as an absence rather than as an answer",
    ).toBe("2 units opened: 1 with 2 rooms, 1 with 3 rooms; nothing was shortlisted.");
    expect(replay.unitsViewed.sentence).not.toMatch(/not observed|unavailable/i);
  });

  it("nought opened: the whole sentence is the answer", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const replay = buildMeetingReplay(CONTEXT, session([]));

    expect(replay.unitsViewed.opened).toBe(0);
    expect(replay.unitsViewed.byRooms).toEqual([]);
    expect(replay.unitsViewed.sentence).toBe("No unit was opened.");
  });

  it("a code the catalogue does not hold stays in `opened` and is named, never banded", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const replay = buildMeetingReplay(
      CONTEXT,
      session([unit("A-1"), unit("Z-99", { favourited: true })]),
    );

    expect(replay.unitsViewed.opened, "an unknown code was dropped from the count").toBe(2);
    expect(replay.unitsViewed.notInCatalogue, "an unknown code was not named as such").toBe(1);
    expect(
      replay.unitsViewed.byRooms,
      "an unknown code was folded into a room band it does not belong to",
    ).toEqual([{ rooms: 2, count: 1 }]);
    /* The shortlist is the session's, not the catalogue's: the unknown code still counts. */
    expect(replay.unitsViewed.shortlisted).toBe(1);
    expect(replay.unitsViewed.sentence).toBe(
      "2 units opened: 1 with 2 rooms, 1 not in the catalogue; 1 shortlisted.",
    );
  });

  it("a code the catalogue holds without a room count is a third thing, not a band and not unknown", () => {
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const replay = buildMeetingReplay(CONTEXT, session([unit("A-4")]));

    expect(replay.unitsViewed.roomsUnstated).toBe(1);
    expect(replay.unitsViewed.notInCatalogue).toBe(0);
    expect(replay.unitsViewed.byRooms).toEqual([]);
    expect(replay.unitsViewed.sentence).toBe(
      "1 unit opened: 1 with rooms not stated; nothing was shortlisted.",
    );
  });

  it("the three counts and the bands account for every opened unit", () => {
    /*
     * Guards the guard. Each of the assertions above could pass with a count
     * quietly dropped somewhere else; this one says the parts sum to the whole.
     */
    provideCatalogue(PROJECT_ID, CATALOGUE);
    const replay = buildMeetingReplay(
      CONTEXT,
      session([unit("A-1"), unit("A-2"), unit("A-3"), unit("A-4"), unit("Z-99")]),
    );
    const v = replay.unitsViewed;
    const banded = v.byRooms.reduce((n, b) => n + b.count, 0);

    expect(banded + v.roomsUnstated + v.notInCatalogue, "the parts do not sum to `opened`").toBe(
      v.opened,
    );
    expect(v.opened).toBe(5);
  });
});
