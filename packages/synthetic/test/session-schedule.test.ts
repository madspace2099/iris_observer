import { describe, expect, it } from "vitest";
import { zoneParts } from "../src/time";
import { PROJECTS } from "../src/world";
import {
  PROJECT_DATASETS,
  provideSessions,
  sessionsForProject,
  showroomSessions,
} from "../src/showroom/sessions";

/**
 * THE GENERATOR'S OWN CONTRACT — separate from `time.ts` itself.
 *
 * `showroomSessions()` used to place every meeting with `setUTCHours(9..16)`,
 * which is the project's working day only for a project sitting on UTC. The
 * harden pass moved that placement onto `zonedInstant`, reading each
 * project's own zone. What must still be true, checked here against the
 * generator's own output rather than against `time.ts`'s unit tests:
 *
 *   - the same four things a caller can observe about ANY fixture generator
 *     — determinism, unchanged identifiers, unchanged non-temporal facts —
 *     still hold;
 *   - the working hours it generates are the project's own 09:00-16:59, not
 *     the host's or UTC's;
 *   - a project with real delivered sessions (the connector overlay) never
 *     passes through this generator at all, so nothing here can touch an
 *     imported record.
 */

const zoneOf = new Map(PROJECTS.map((p) => [p.id as string, p.timeZone]));

describe("determinism: the generator is pure", () => {
  it("returns the same sessions on repeated calls (the module-level cache, and the seed behind it)", () => {
    const first = showroomSessions();
    const second = showroomSessions();
    expect(second).toBe(first); // memoised: literally the same array
    expect(first.length).toBeGreaterThan(0);
  });
});

describe("identifiers do not encode time", () => {
  it("session and meeting ids are the dataset code plus a sequential index, not a timestamp", () => {
    for (const session of showroomSessions()) {
      const dataset = PROJECT_DATASETS.find((d) => d.projectId === session.projectId);
      expect(dataset).toBeDefined();
      const prefix = dataset?.code ?? "";
      expect(session.sessionId).toMatch(new RegExp(`^ses_${prefix}\\d{4}$`));
      expect(session.meetingId).toMatch(new RegExp(`^mtg_${prefix}\\d{4}$`));
    }
  });

  it("changing when a session is scheduled does not change how many exist per project or their outcomes' shape", () => {
    // A structural check that the harden pass's `zonedInstant` substitution
    // did not, by itself, drop or duplicate sessions: every session still
    // carries exactly the fields the read models depend on, and the total
    // matches what each dataset's own period list declares.
    for (const dataset of PROJECT_DATASETS) {
      const own = showroomSessions().filter((s) => s.projectId === dataset.projectId);
      const declared = dataset.periods.reduce((sum, p) => sum + p.meetings, 0);
      expect(own.length).toBe(declared);
      for (const s of own) {
        expect(typeof s.agentId).toBe("string");
        expect(typeof s.outcome).toBe("string");
        expect(Array.isArray(s.steps)).toBe(true);
      }
    }
  });
});

describe("working hours are the PROJECT's, not the host's or UTC's", () => {
  it("every session starts between 09:00 and 16:59 in its own project's zone", () => {
    let checked = 0;
    for (const session of showroomSessions()) {
      const timeZone = zoneOf.get(session.projectId);
      expect(timeZone, `no project zone found for ${session.projectId}`).toBeDefined();
      const parts = zoneParts(session.startedAt, timeZone as string);
      expect(
        parts.hour,
        `${session.meetingId} started at hour ${parts.hour} local`,
      ).toBeGreaterThanOrEqual(9);
      expect(
        parts.hour,
        `${session.meetingId} started at hour ${parts.hour} local`,
      ).toBeLessThanOrEqual(16);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("Kingsford (Europe/London) and the three Bratislava projects agree on 'working hours' in their OWN zone even though they differ in UTC", () => {
    const kingsford = PROJECTS.find((p) => p.slug === "kingsford");
    const northgate = PROJECTS.find((p) => p.slug === "northgate");
    expect(kingsford?.timeZone).toBe("Europe/London");
    expect(northgate?.timeZone).toBe("Europe/Bratislava");

    const kingsfordSessions = showroomSessions().filter((s) => s.projectId === kingsford?.id);
    const northgateSessions = showroomSessions().filter((s) => s.projectId === northgate?.id);
    expect(kingsfordSessions.length).toBeGreaterThan(0);
    expect(northgateSessions.length).toBeGreaterThan(0);

    // London is an hour behind Bratislava for most of the year, so the SAME
    // local working-hour rule places their sessions at different UTC hours.
    // If the generator were still cutting hours in UTC (the pre-fix
    // behaviour), this difference would not exist.
    const utcHours = (sessions: typeof kingsfordSessions) =>
      new Set(sessions.map((s) => new Date(s.startedAt).getUTCHours()));
    const kingsfordUtc = utcHours(kingsfordSessions);
    const northgateUtc = utcHours(northgateSessions);
    const overlap = [...kingsfordUtc].filter((h) => northgateUtc.has(h));
    // Both still land in a plausible business-hours UTC band, but they are
    // not the identical set -- London's 09:00-16:59 and Bratislava's do not
    // coincide in UTC for most of the year.
    expect(overlap.length).toBeLessThan(Math.min(kingsfordUtc.size, northgateUtc.size));
  });
});

describe("the connector overlay never passes through this generator", () => {
  it("a project with delivered (overlay) sessions reads exactly those, unmodified, regardless of the generator's own state", () => {
    const fixed: (typeof PROJECT_DATASETS)[number] | undefined = PROJECT_DATASETS[0];
    if (fixed === undefined) throw new Error("no project dataset fixture available");
    const overlayProjectId = "prj_test_overlay_only";
    const delivered = [
      {
        sessionId: "ses_overlay0001",
        meetingId: "mtg_overlay0001",
        projectId: overlayProjectId,
        agentId: "agt_overlay",
        channel: "showroom" as const,
        contactId: null,
        startedAt: "2026-08-24T07:00:00.000Z",
        endedAt: "2026-08-24T07:10:00.000Z",
        durationSeconds: 600,
        outcome: "presentation_only" as const,
        steps: [],
        units: [],
        environment: [],
        filters: [],
        places: [],
        screenshots: 0,
        irisRating: null,
        priorMeetings: 0,
        timingUnavailable: false,
      },
    ];
    try {
      // Force the generator to have already run (and cached), then set the
      // overlay -- proving order does not matter and nothing merges.
      showroomSessions();
      provideSessions(overlayProjectId, delivered);
      const read = sessionsForProject(overlayProjectId);
      expect(read).toBe(delivered); // the literal array, untouched
      expect(read[0]?.startedAt).toBe("2026-08-24T07:00:00.000Z"); // unrewritten instant
    } finally {
      provideSessions(overlayProjectId, null); // never leak fixture state into later test files
    }
  });
});
