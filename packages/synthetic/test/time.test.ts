import { describe, expect, it } from "vitest";
import { clockLabel, dayLabel, monthLabel, monthYearLabel } from "../src/format";
import { bucketBounds } from "../src/showroom/views3";
import {
  endOfDayIn,
  monthKeyIn,
  startOfDayIn,
  startOfMonthIn,
  startOfWeekIn,
  zoneOffsetMs,
  zoneParts,
  zonedInstant,
} from "../src/time";

/**
 * Every date a surface prints, and every "today" it cuts, is the project's.
 *
 * These pin the arithmetic against instants whose wall-clock reading in
 * Bratislava and London is known by hand, in summer and in winter, so a
 * process running in UTC (Vercel) and one running in Central Europe (this
 * desk) produce the same labels for the same meeting. The QA sweep found the
 * labels reading the host clock: a 10:30 meeting became "08:30" on a UTC host.
 */

const BRATISLAVA = "Europe/Bratislava";
const LONDON = "Europe/London";

describe("zoneParts — the wall clock of the zone, not the host", () => {
  it("09:00 on Monday 24 August 2026 in Bratislava is 07:00Z", () => {
    expect(zoneParts("2026-08-24T07:00:00.000Z", BRATISLAVA)).toEqual({
      year: 2026,
      month: 8,
      day: 24,
      hour: 9,
      minute: 0,
      second: 0,
      weekday: 0,
    });
  });

  it("late evening UTC is already the next day east of it", () => {
    const p = zoneParts("2026-08-23T22:30:00.000Z", BRATISLAVA);
    expect([p.day, p.hour, p.minute]).toEqual([24, 0, 30]);
  });

  it("counts the week from Monday", () => {
    expect(zoneParts("2026-08-30T10:00:00.000Z", BRATISLAVA).weekday).toBe(6); // Sunday
    expect(zoneParts("2026-08-25T10:00:00.000Z", BRATISLAVA).weekday).toBe(1); // Tuesday
  });
});

describe("zonedInstant — a wall-clock reading back to an instant", () => {
  it("inverts the reading in summer, in winter, and in a second zone", () => {
    expect(zonedInstant(2026, 8, 24, 9, 0, 0, BRATISLAVA).toISOString()).toBe(
      "2026-08-24T07:00:00.000Z",
    );
    expect(zonedInstant(2026, 1, 15, 9, 0, 0, BRATISLAVA).toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
    expect(zonedInstant(2026, 8, 24, 9, 0, 0, LONDON).toISOString()).toBe(
      "2026-08-24T08:00:00.000Z",
    );
    expect(zonedInstant(2026, 8, 24, 9, 0, 0, "UTC").toISOString()).toBe(
      "2026-08-24T09:00:00.000Z",
    );
  });

  it("knows the offset in force: two hours in summer, one in winter, none in UTC", () => {
    expect(zoneOffsetMs(Date.parse("2026-08-24T07:00:00Z"), BRATISLAVA)).toBe(2 * 3_600_000);
    expect(zoneOffsetMs(Date.parse("2026-01-15T07:00:00Z"), BRATISLAVA)).toBe(3_600_000);
    expect(zoneOffsetMs(Date.parse("2026-01-15T07:00:00Z"), "UTC")).toBe(0);
  });

  it("normalises a month outside 1..12 the way a calendar does", () => {
    expect(zonedInstant(2026, 0, 1, 0, 0, 0, "UTC").toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(zonedInstant(2026, 13, 1, 0, 0, 0, "UTC").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("the starts of a day, a week and a month", () => {
  const today = new Date("2026-08-24T07:00:00.000Z"); // Monday, 09:00 in Bratislava

  it("a day starts at local midnight and ends a millisecond before the next", () => {
    expect(startOfDayIn(today, BRATISLAVA).toISOString()).toBe("2026-08-23T22:00:00.000Z");
    expect(endOfDayIn(today, BRATISLAVA).toISOString()).toBe("2026-08-24T21:59:59.999Z");
  });

  it("a week starts on its Monday, from any day in it", () => {
    const monday = "2026-08-23T22:00:00.000Z";
    expect(startOfWeekIn(today, BRATISLAVA).toISOString()).toBe(monday);
    expect(startOfWeekIn(Date.parse("2026-08-30T10:00:00Z"), BRATISLAVA).toISOString()).toBe(
      monday,
    );
  });

  it("a month starts on its first, and steps to the month before", () => {
    expect(startOfMonthIn(today, BRATISLAVA).toISOString()).toBe("2026-07-31T22:00:00.000Z");
    expect(startOfMonthIn(today, BRATISLAVA, -1).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("the month key is the zone's month: half past midnight on 1 August is August", () => {
    expect(monthKeyIn("2026-07-31T22:30:00.000Z", BRATISLAVA)).toBe("2026-08");
    expect(monthKeyIn("2026-07-31T22:30:00.000Z", "UTC")).toBe("2026-07");
  });
});

describe("bucketBounds cut in the project's zone", () => {
  it("today, this week and this month all start at the project's midnight", () => {
    const bounds = bucketBounds(new Date("2026-08-24T07:00:00.000Z"), BRATISLAVA);
    const at = (id: string) => bounds.find((b) => b.id === id)?.from;
    expect(at("today")).toBe(Date.parse("2026-08-23T22:00:00.000Z"));
    expect(at("this_week")).toBe(Date.parse("2026-08-23T22:00:00.000Z")); // it is a Monday
    expect(at("this_month")).toBe(Date.parse("2026-07-31T22:00:00.000Z"));
    expect(at("last_month")).toBe(Date.parse("2026-06-30T22:00:00.000Z"));
  });

  it("a meeting at 00:30 local on the day counts as today, not yesterday", () => {
    const bounds = bucketBounds(new Date("2026-08-24T07:00:00.000Z"), BRATISLAVA);
    const today = bounds.find((b) => b.id === "today");
    const at = Date.parse("2026-08-23T22:30:00.000Z");
    expect(at >= (today?.from ?? Infinity) && at < (today?.to ?? -Infinity)).toBe(true);
  });

  it("keeps its UTC arithmetic when no zone is given", () => {
    const bounds = bucketBounds(new Date(Date.UTC(2027, 4, 1)));
    expect(bounds.find((b) => b.id === "today")?.from).toBe(Date.UTC(2027, 4, 1));
  });
});

describe("labels print the zone's clock", () => {
  const at = "2026-08-24T07:00:00.000Z";

  it("the same instant reads 09:00 in Bratislava and 08:00 in London", () => {
    expect(clockLabel(at, "en-GB", BRATISLAVA)).toBe("09:00");
    expect(clockLabel(at, "en-GB", LONDON)).toBe("08:00");
    expect(clockLabel(at, "en-GB", "UTC")).toBe("07:00");
  });

  it("a day label can differ by zone across midnight", () => {
    expect(dayLabel("2026-08-23T22:30:00.000Z", "en-GB", BRATISLAVA)).toBe("24 Aug");
    expect(dayLabel("2026-08-23T22:30:00.000Z", "en-GB", "UTC")).toBe("23 Aug");
  });

  it("month labels follow the zone too", () => {
    expect(monthLabel("2026-07-31T22:30:00.000Z", "en-GB", BRATISLAVA)).toBe("Aug");
    expect(monthYearLabel("2026-07-31T22:30:00.000Z", "en-GB", BRATISLAVA)).toBe("Aug 2026");
    expect(monthYearLabel("2026-07-31T22:30:00.000Z", "en-GB", "UTC")).toBe("Jul 2026");
  });
});
