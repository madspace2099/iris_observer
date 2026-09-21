import { afterEach, describe, expect, it } from "vitest";
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

/*
 * ============================================================================
 * THE REMAINING CONTRACT — added on the harden pass that followed the QA
 * sweep. The sixteen tests above prove the arithmetic is correct in the
 * ordinary case; these prove five properties the sweep's own fix report
 * asserted but had not yet pinned: host independence, non-mutation of the
 * instant handed in, the half-open period boundary, the week/month/year/
 * leap edges, the two DST irregularities, and the explicit invalid-zone
 * failure. Each is verified against an expectation computed independently
 * of the function under test — either by hand from the IANA rules the
 * `describe` names, or with a second, more primitive `Intl` call that does
 * not go through `time.ts` at all.
 * ============================================================================
 */

describe("host independence — the SERVER's zone must never leak into a reading", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("a bare Date getter DOES move with the host zone (the control: proves the toggle below is real)", () => {
    process.env.TZ = "America/New_York";
    const nyHour = new Date("2026-08-24T07:00:00.000Z").getHours();
    process.env.TZ = "Pacific/Kiritimati";
    const kiritimatiHour = new Date("2026-08-24T07:00:00.000Z").getHours();
    expect(nyHour).not.toBe(kiritimatiHour);
  });

  it("zoneParts, zonedInstant and every label read the same across four wildly different host zones", () => {
    const at = "2026-08-24T07:00:00.000Z"; // 09:00 in Bratislava, on a Monday
    const hosts = ["UTC", "America/New_York", "Pacific/Kiritimati", "Asia/Kolkata"];
    const readings = hosts.map((host) => {
      process.env.TZ = host;
      return {
        parts: zoneParts(at, BRATISLAVA),
        clock: clockLabel(at, "en-GB", BRATISLAVA),
        day: dayLabel(at, "en-GB", BRATISLAVA),
        instant: zonedInstant(2026, 8, 24, 9, 0, 0, BRATISLAVA).toISOString(),
        bucket: bucketBounds(new Date(at), BRATISLAVA).find((b) => b.id === "today")?.from,
      };
    });
    // Every host produced the identical reading — the assertion is that the
    // array collapses to one distinct value, not a pinned literal, so this
    // does not silently stop testing anything if the shared expectation
    // above ever needs to change.
    const distinct = new Set(readings.map((r) => JSON.stringify(r)));
    expect(distinct.size).toBe(1);
    expect(readings[0]?.clock).toBe("09:00");
  });
});

describe("the instant handed in is read, never rewritten", () => {
  it("a Date object passed to zoneParts / startOfDayIn / zonedInstant's own callers is untouched afterwards", () => {
    const source = new Date("2026-08-24T07:00:00.000Z");
    const before = source.getTime();
    zoneParts(source, BRATISLAVA);
    startOfDayIn(source, BRATISLAVA);
    startOfWeekIn(source, BRATISLAVA);
    startOfMonthIn(source, BRATISLAVA);
    endOfDayIn(source, BRATISLAVA);
    monthKeyIn(source, BRATISLAVA);
    expect(source.getTime()).toBe(before);
  });

  it("formatting the same source instant twice, in two different zones, never changes what the first call returned", () => {
    const source = "2026-08-24T07:00:00.000Z";
    const first = clockLabel(source, "en-GB", BRATISLAVA);
    clockLabel(source, "en-GB", LONDON); // a second read, in a different zone
    clockLabel(source, "en-GB", "Pacific/Kiritimati"); // and a third, at the far side of the globe
    expect(clockLabel(source, "en-GB", BRATISLAVA)).toBe(first);
  });
});

describe("a period is a half-open interval: [from, to) — a boundary instant is counted exactly once", () => {
  it("23:59:59.999 local belongs to today; 00:00:00.000 the next local day does not", () => {
    const bounds = bucketBounds(new Date("2026-08-24T07:00:00.000Z"), BRATISLAVA); // Monday
    const today = bounds.find((b) => b.id === "today");
    if (today === undefined) throw new Error("no 'today' bucket");
    const lastMsOfToday = zonedInstant(2026, 8, 24, 23, 59, 59, BRATISLAVA).getTime() + 999;
    const firstMsOfTomorrow = zonedInstant(2026, 8, 25, 0, 0, 0, BRATISLAVA).getTime();
    expect(lastMsOfToday).toBe(today.to - 1);
    expect(lastMsOfToday >= today.from && lastMsOfToday < today.to).toBe(true);
    expect(firstMsOfTomorrow).toBe(today.to);
    expect(firstMsOfTomorrow >= today.from && firstMsOfTomorrow < today.to).toBe(false);
  });

  it("the same instant is never counted by two adjacent buckets", () => {
    // this_week's own end is "today"'s own end (see buildPeriods/bucketBounds),
    // so the boundary that matters is the day/week seam a caller could double-count
    // across, not two of THIS function's own rows (which are deliberately
    // overlapping windows -- today/this_week/this_month all share their `to`).
    const bounds = bucketBounds(new Date("2026-08-24T07:00:00.000Z"), BRATISLAVA);
    const today = bounds.find((b) => b.id === "today");
    const yesterday = bounds.find((b) => b.id === "yesterday");
    if (today === undefined || yesterday === undefined) throw new Error("missing bucket");
    expect(yesterday.to).toBe(today.from);
  });
});

describe("the week boundary: Sunday's last local instant against Monday's first", () => {
  it("belong to different weeks, one Monday apart", () => {
    const sundayNight = zonedInstant(2026, 8, 30, 23, 59, 59, BRATISLAVA); // 999ms short of Monday
    const mondayMorning = zonedInstant(2026, 8, 31, 0, 0, 0, BRATISLAVA);
    const sundayWeekStart = startOfWeekIn(sundayNight, BRATISLAVA);
    const mondayWeekStart = startOfWeekIn(mondayMorning, BRATISLAVA);
    expect(sundayWeekStart.toISOString()).toBe("2026-08-23T22:00:00.000Z"); // the Monday just past
    expect(mondayWeekStart.toISOString()).toBe("2026-08-30T22:00:00.000Z"); // the new Monday
    expect(mondayWeekStart.getTime() - sundayWeekStart.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("month-end, year-end and the leap day", () => {
  it("stepping back from January crosses a YEAR boundary, not just a month one", () => {
    const inJanuary = zonedInstant(2027, 1, 15, 12, 0, 0, BRATISLAVA);
    expect(startOfMonthIn(inJanuary, BRATISLAVA, -1).toISOString()).toBe(
      startOfMonthIn(zonedInstant(2026, 12, 15, 12, 0, 0, BRATISLAVA), BRATISLAVA).toISOString(),
    );
    expect(startOfMonthIn(inJanuary, BRATISLAVA, -1).toISOString()).toBe(
      "2026-11-30T23:00:00.000Z",
    );
  });

  it("31 December 23:30 local and 1 January the same real hour later are in different months and different years", () => {
    // Bratislava is winter-offset (+1h) on both sides of this instant --
    // no DST edge here, purely the calendar rolling over.
    const at = zonedInstant(2026, 12, 31, 23, 30, 0, BRATISLAVA);
    expect(monthKeyIn(at, BRATISLAVA)).toBe("2026-12");
    const anHourLater = new Date(at.getTime() + 60 * 60 * 1000);
    expect(monthKeyIn(anHourLater, BRATISLAVA)).toBe("2027-01");
    expect(zoneParts(anHourLater, BRATISLAVA).year).toBe(2027);
  });

  it("29 February exists in 2028 (a leap year) and round-trips through zonedInstant/zoneParts", () => {
    const leapDay = zonedInstant(2028, 2, 29, 12, 0, 0, BRATISLAVA);
    expect(zoneParts(leapDay, BRATISLAVA)).toMatchObject({ year: 2028, month: 2, day: 29 });
    // One JS calendar-rollover fact, not this module's own logic: asking for
    // day 30 in a 29-day February rolls into March, the same way Date.UTC
    // always has. Recorded here because startOfMonthIn/bucketBounds build on
    // that behaviour rather than reimplementing calendar length tables.
    const rolledOver = zonedInstant(2028, 2, 30, 12, 0, 0, BRATISLAVA);
    expect(zoneParts(rolledOver, BRATISLAVA)).toMatchObject({ year: 2028, month: 3, day: 1 });
  });

  it("a period cut inside a leap February clips its own 'last month' ceiling to 29 days, not 28", () => {
    // Mirrors views3.test.ts's "a shorter previous month cannot be clipped
    // past its own length" -- that test pins the UTC-only default and a
    // NON-leap February (2027, 28 days) for the case where the ceiling BITES;
    // this is the project-zone path, and it checks the other side: once
    // "today" is far enough into March that the elapsed-day count would
    // clip past 28, a leap February's real 29-day length is the ceiling
    // that's used, not a hard-coded 28.
    const endOfMarch = zonedInstant(2028, 3, 31, 9, 0, 0, BRATISLAVA);
    const bounds = bucketBounds(endOfMarch, BRATISLAVA);
    const lastMonth = bounds.find((b) => b.id === "last_month");
    if (lastMonth === undefined) throw new Error("no 'last_month' bucket");
    // 31 elapsed days in March is more than February 2028's own 29, so the
    // ceiling is what's reported -- unclipped, and it is the leap length.
    expect(lastMonth.label).toBe("Last month");
    const spanDays = (lastMonth.to - lastMonth.from) / (24 * 60 * 60 * 1000);
    expect(spanDays).toBe(29);

    // A few days earlier -- 9 elapsed days in March, less than February's 29
    // -- the clip DOES bite, to exactly the elapsed count, not to 28.
    const nineDaysIntoMarch = zonedInstant(2028, 3, 9, 9, 0, 0, BRATISLAVA);
    const clipped = bucketBounds(nineDaysIntoMarch, BRATISLAVA).find((b) => b.id === "last_month");
    if (clipped === undefined) throw new Error("no 'last_month' bucket");
    expect(clipped.label).toBe("Last month, first 9 days");
    expect((clipped.to - clipped.from) / (24 * 60 * 60 * 1000)).toBe(9);
  });
});

describe("daylight saving in Europe/Bratislava, 2026 — the two irregular hours a year", () => {
  /*
   * Ground truth for both transitions, taken independently of zonedInstant
   * with a second, more primitive Intl call (see the harden-pass session
   * transcript for the probe) and confirmed against the IANA database's
   * own published rule for Central Europe: clocks spring forward at 01:00
   * UTC on the last Sunday of March, and fall back at 01:00 UTC on the last
   * Sunday of October.
   */
  it("the missing hour: 02:00-02:59 on 29 March never occurs, and asking for it lands 30 minutes into the hour that follows the gap", () => {
    const requested = zonedInstant(2026, 3, 29, 2, 30, 0, BRATISLAVA);
    expect(requested.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // Its OWN wall-clock reading -- verified via zoneParts, which recomputes
    // from the instant rather than reusing the request -- is 03:30, not the
    // 02:30 that was asked for and does not exist.
    expect(zoneParts(requested, BRATISLAVA)).toMatchObject({ hour: 3, minute: 30 });
    // Deterministic: no drift between repeated calls with the same input.
    expect(zonedInstant(2026, 3, 29, 2, 30, 0, BRATISLAVA).getTime()).toBe(requested.getTime());
    // Ordered sanely around the gap: the last valid instant before it, and
    // the first valid instant after, both land where a calendar says they
    // should, with the gap itself contributing exactly one hour between them.
    const justBefore = zonedInstant(2026, 3, 29, 1, 59, 0, BRATISLAVA);
    const justAfter = zonedInstant(2026, 3, 29, 3, 0, 0, BRATISLAVA);
    expect(justAfter.getTime() - justBefore.getTime()).toBe(60 * 1000);
  });

  it("the repeated hour: 02:00-02:59 on 25 October occurs twice, and asking for it resolves to the later, post-transition occurrence", () => {
    const requested = zonedInstant(2026, 10, 25, 2, 30, 0, BRATISLAVA);
    expect(requested.toISOString()).toBe("2026-10-25T01:30:00.000Z");
    expect(zoneParts(requested, BRATISLAVA)).toMatchObject({ hour: 2, minute: 30 });
    expect(zonedInstant(2026, 10, 25, 2, 30, 0, BRATISLAVA).getTime()).toBe(requested.getTime());
    // The EARLIER occurrence of the same wall-clock reading is a real,
    // different instant, one hour before the one this function returns --
    // proof the function picked a side rather than averaging or drifting.
    const earlierOccurrence = new Date(requested.getTime() - 60 * 60 * 1000);
    expect(zoneParts(earlierOccurrence, BRATISLAVA)).toMatchObject({ hour: 2, minute: 30 });
    expect(earlierOccurrence.getTime()).not.toBe(requested.getTime());
  });

  it("a repeated local-clock LABEL names two different real instants without merging them", () => {
    // The two real instants behind "02:30" on 25 October, an hour apart in
    // absolute time -- established independently, not by calling zonedInstant.
    const first = new Date("2026-10-25T00:30:00.000Z"); // 02:30 CEST
    const second = new Date("2026-10-25T01:30:00.000Z"); // 02:30 CET, an hour later
    expect(first.getTime()).not.toBe(second.getTime());
    // Both really do print the same label -- that is what "ambiguous" means
    // for a civil clock with no UTC offset in the display, on any calendar
    // app, not a defect this module could fix by choosing a different label.
    expect(clockLabel(first, "en-GB", BRATISLAVA)).toBe("02:30");
    expect(clockLabel(second, "en-GB", BRATISLAVA)).toBe("02:30");
    // What must NOT happen: the two instants collapsing into one when kept
    // as instants rather than as labels. Every consumer in this codebase
    // sorts and keys sessions by `startedAt` (an ISO instant), never by a
    // rendered label, which is exactly what keeps this ambiguity harmless.
    expect(second.getTime() - first.getTime()).toBe(60 * 60 * 1000);
  });
});

describe("an unrecognised time zone fails loudly rather than reading the host's own", () => {
  it("throws instead of silently falling back to the process's default zone", () => {
    const hostHourBefore = new Date("2026-08-24T07:00:00.000Z").getHours();
    expect(() => zoneParts("2026-08-24T07:00:00.000Z", "Not/AZone")).toThrow(/invalid time zone/i);
    expect(() => zonedInstant(2026, 8, 24, 9, 0, 0, "Not/AZone")).toThrow(/invalid time zone/i);
    expect(() => clockLabel("2026-08-24T07:00:00.000Z", "en-GB", "")).toThrow(/invalid time zone/i);
    // The failure is the point, not a side effect that also happened to
    // change something -- confirm the host's own reading is untouched.
    expect(new Date("2026-08-24T07:00:00.000Z").getHours()).toBe(hostHourBefore);
  });
});
