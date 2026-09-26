import { describe, expect, it } from "vitest";
import { zoneParts } from "../src/time";
import {
  agentsForProject,
  sessionsForProject,
  showroomPaceRehearsal,
  showroomSessions,
} from "../src/showroom/sessions";

/**
 * THE REHEARSAL'S CONTRACT.
 *
 * `showroomPaceRehearsal` draws volume for a drawing to be judged at: every
 * presenter, every day, three to five meetings. What must hold, checked
 * against its output rather than against the generator's helpers:
 *
 *   - the pace is the one asked for, presenter by presenter and day by day;
 *   - the meetings sit inside working hours on the project's own clock, and
 *     no presenter holds two at once;
 *   - it is deterministic, and a date draws the same meetings in any span;
 *   - it is never the record: its identifiers cannot name a recorded meeting,
 *     and drawing it leaves the recorded world exactly as it was.
 */

const NORTHGATE = "prj_northgate01";
const TZ = "Europe/Bratislava";
const PACE = { from: "2026-03-01", to: "2026-08-24", min: 3, max: 5 } as const;

const localDate = (iso: string) => {
  const p = zoneParts(iso, TZ);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

describe("the pace asked for", () => {
  const rehearsal = showroomPaceRehearsal(NORTHGATE, PACE);
  const roster = agentsForProject(NORTHGATE).map((a) => a.id);

  it("gives every presenter three to five meetings on every one of the 177 days", () => {
    const perSeatDay = new Map<string, number>();
    for (const s of rehearsal) {
      const key = `${s.agentId}|${localDate(s.startedAt)}`;
      perSeatDay.set(key, (perSeatDay.get(key) ?? 0) + 1);
    }
    // 1 March to 24 August 2026 inclusive is 177 days, counted by hand; four presenters.
    expect(roster).toHaveLength(4);
    expect(perSeatDay.size).toBe(177 * 4);
    const counts = [...perSeatDay.values()];
    expect(Math.min(...counts)).toBe(3);
    expect(Math.max(...counts)).toBe(5);
    expect(new Set(counts)).toEqual(new Set([3, 4, 5]));
  });

  it("draws only the project's own presenters", () => {
    expect(new Set(rehearsal.map((s) => s.agentId))).toEqual(new Set(roster));
    expect(rehearsal.every((s) => s.projectId === NORTHGATE)).toBe(true);
  });

  it("starts every meeting between 09:00 and 17:59 on the project's clock", () => {
    for (const s of rehearsal) {
      const { hour } = zoneParts(s.startedAt, TZ);
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(18);
    }
  });

  it("never gives one presenter two meetings at once", () => {
    for (const id of roster) {
      const theirs = rehearsal
        .filter((s) => s.agentId === id)
        .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
      for (let i = 1; i < theirs.length; i += 1) {
        expect(Date.parse(theirs[i]!.startedAt)).toBeGreaterThanOrEqual(
          Date.parse(theirs[i - 1]!.endedAt),
        );
      }
    }
  });

  it("goes through the same outcome model as the record, so every outcome appears", () => {
    const outcomes = new Set(rehearsal.map((s) => s.outcome));
    for (const id of [
      "purchase",
      "reservation",
      "interested",
      "follow_up_needed",
      "presentation_only",
      "not_interested",
      "skipped",
    ]) {
      expect(outcomes.has(id as never)).toBe(true);
    }
  });
});

describe("deterministic, and the same date draws the same meetings", () => {
  it("returns the memoised array for the same pace", () => {
    expect(showroomPaceRehearsal(NORTHGATE, PACE)).toBe(showroomPaceRehearsal(NORTHGATE, PACE));
  });

  it("draws August's meetings identically whether the span starts in March or in August", () => {
    const august = (from: string) =>
      showroomPaceRehearsal(NORTHGATE, { ...PACE, from }).filter((s) =>
        localDate(s.startedAt).startsWith("2026-08"),
      );
    const long = august("2026-03-01");
    const short = august("2026-08-01");
    expect(short.length).toBeGreaterThan(0);
    expect(JSON.stringify(short)).toBe(JSON.stringify(long));
  });
});

describe("never the record", () => {
  it("names no recorded meeting, and names each of its own once", () => {
    const recorded = new Set(showroomSessions().map((s) => s.meetingId));
    const ids = showroomPaceRehearsal(NORTHGATE, PACE).map((s) => s.meetingId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => recorded.has(id))).toBe(false);
    expect(ids.every((id) => /^mtg_ngr\d{10}$/.test(id))).toBe(true);
  });

  it("leaves the recorded world exactly as it was", () => {
    const before = JSON.stringify(showroomSessions());
    const beforeProject = JSON.stringify(sessionsForProject(NORTHGATE));
    showroomPaceRehearsal(NORTHGATE, { ...PACE, from: "2026-05-01" });
    expect(JSON.stringify(showroomSessions())).toBe(before);
    expect(JSON.stringify(sessionsForProject(NORTHGATE))).toBe(beforeProject);
  });

  it("refuses a project it has no dataset for, and a pace that is not one", () => {
    expect(() => showroomPaceRehearsal("prj_nowhere", PACE)).toThrow(/No synthetic dataset/);
    expect(() => showroomPaceRehearsal(NORTHGATE, { ...PACE, min: 0 })).toThrow(/pace/);
    expect(() => showroomPaceRehearsal(NORTHGATE, { ...PACE, min: 5, max: 3 })).toThrow(/pace/);
    expect(() => showroomPaceRehearsal(NORTHGATE, { ...PACE, from: "2026-09-01" })).toThrow(
      /calendar dates in order/,
    );
    expect(() => showroomPaceRehearsal(NORTHGATE, { ...PACE, to: "24/08/2026" })).toThrow(
      /calendar dates in order/,
    );
  });
});
