/**
 * Calendar arithmetic in a named time zone, without a library.
 *
 * Every instant Observer stores is UTC; every instant a person reads is in the
 * project's own zone (`ProjectSummary.timeZone`). The two used to be confused
 * at every seam: labels were printed with the HOST's zone, so a 10:30 meeting
 * in Bratislava read "08:30" from a UTC server, and "today", "this week" and
 * the activity heatmap's hour columns were cut at UTC midnight and UTC hours,
 * two hours off the sales office's day. None of that was a data problem, and
 * all of it looked like one.
 *
 * `Intl.DateTimeFormat` is the only zone database a runtime is guaranteed to
 * carry, so the parts of a local wall-clock reading come from it, and the
 * inverse (a wall-clock reading back to an instant) is the usual two-pass
 * offset search — exact everywhere except inside a DST gap, where the hour
 * does not exist and the instant after the gap is answered.
 *
 * ## Three policies worth stating rather than leaving accidental
 *
 * **The host's own zone never leaks in.** Every function here takes an
 * explicit IANA zone and reads it only through `Intl.DateTimeFormat`'s own
 * `timeZone` option — never through a bare `Date` getter (`getHours`,
 * `toLocaleString` with no zone, `getTimezoneOffset`), which is what would
 * read the *host's* clock. A server in UTC and a desk in Bratislava must
 * produce byte-identical output for the same instant and the same project
 * zone; `time.test.ts` proves it by mutating `process.env.TZ` mid-process
 * and confirming these functions do not move while `Date`'s own local
 * getters do.
 *
 * **An unrecognised zone fails loudly.** `Intl.DateTimeFormat` throws
 * `RangeError: Invalid time zone specified` for a zone name it does not
 * know, and nothing here catches that. A project record with a corrupted or
 * mistyped `timeZone` must stop the request, not silently fall back to
 * the host's zone and publish a wrong number that reads as a real one.
 *
 * **A DST gap or an ambiguous hour resolves deterministically, not
 * correctly** — because for those sixty-odd minutes a year, "correctly"
 * has no single answer. `zonedInstant` is asked for a wall-clock reading
 * that either never happened (spring forward: 02:00–02:59 do not occur)
 * or happened twice (fall back: they occur once at each offset). Two facts
 * about what it does, both pinned by `time.test.ts` against readings taken
 * independently with `Intl.DateTimeFormat` directly rather than by asking
 * this module to grade its own homework:
 *   - **The gap** resolves to the instant reading the same minute past the
 *     hour once the clock has finished jumping — asking for the 02:30 that
 *     never happened returns the 03:30 that follows it.
 *   - **The repeated hour** resolves to its second, later occurrence — the
 *     one at the offset already in force once the ambiguity is over.
 * Both are stable across repeated calls with the same input. Neither
 * matters to any actual Observer date: every generated meeting sits inside
 * ordinary working hours, nowhere near a transition.
 */

export interface ZoneParts {
  readonly year: number;
  /** 1 to 12, the way a person counts, not the way `Date` does. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** 0 is Monday, 6 is Sunday: the week a sales office counts in. */
  readonly weekday: number;
}

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timeZone);
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

/** The wall-clock reading of an instant in a zone. */
export function zoneParts(at: Date | number | string, timeZone: string): ZoneParts {
  const parts = formatter(timeZone).formatToParts(new Date(at));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: WEEKDAY_INDEX[value("weekday")] ?? 0,
  };
}

/** How far the zone's wall clock stands ahead of UTC at an instant, in ms. */
export function zoneOffsetMs(at: Date | number, timeZone: string): number {
  const p = zoneParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const instant = new Date(at).getTime();
  return asUtc - (instant - (instant % 1000));
}

/**
 * The instant at which a zone's wall clock reads the given date and time.
 *
 * Two passes: the offset in force at the guessed instant places the reading,
 * and the offset in force at THAT instant corrects it across a DST edge.
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = wall - zoneOffsetMs(wall, timeZone);
  const second_ = wall - zoneOffsetMs(first, timeZone);
  return new Date(second_);
}

/** Local midnight at the start of the day the instant falls on. */
export function startOfDayIn(at: Date | number, timeZone: string): Date {
  const p = zoneParts(at, timeZone);
  return zonedInstant(p.year, p.month, p.day, 0, 0, 0, timeZone);
}

/** The last millisecond of the day the instant falls on, in the zone. */
export function endOfDayIn(at: Date | number, timeZone: string): Date {
  const p = zoneParts(at, timeZone);
  return new Date(zonedInstant(p.year, p.month, p.day + 1, 0, 0, 0, timeZone).getTime() - 1);
}

/** Local midnight on the Monday of the week the instant falls in. */
export function startOfWeekIn(at: Date | number, timeZone: string): Date {
  const p = zoneParts(at, timeZone);
  return zonedInstant(p.year, p.month, p.day - p.weekday, 0, 0, 0, timeZone);
}

/**
 * Local midnight on the first of a month, counted from the month the instant
 * falls in. `offset` steps months: `-1` is the month before, `1` the one after.
 * `Date.UTC` normalises month 0 and month 13 for us.
 */
export function startOfMonthIn(at: Date | number, timeZone: string, offset = 0): Date {
  const p = zoneParts(at, timeZone);
  return zonedInstant(p.year, p.month + offset, 1, 0, 0, 0, timeZone);
}

/** `YYYY-MM` of the instant in the zone. Sorts as text in calendar order. */
export function monthKeyIn(at: Date | number | string, timeZone: string): string {
  const p = zoneParts(at, timeZone);
  return `${String(p.year)}-${String(p.month).padStart(2, "0")}`;
}

/* --- the period presets, against a real today ------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The four period presets, resolved against an actual day in the project's zone.
 *
 * The synthetic world's periods are constants, because its today never moves.
 * A project a real source delivers for runs on the clock, and its periods have
 * to be derived — with the same shapes those constants have, which is what
 * `periods.test.ts` holds this to: handed the synthetic today, it returns the
 * synthetic constants to the millisecond.
 *
 * Every bound is a local midnight. "To date" ends at midnight THIS MORNING;
 * the repository extends a still-running period through the end of today.
 * A part-period's baseline is clipped to the same number of elapsed days,
 * because comparing a part-quarter with a whole one is the commonest false
 * alarm a dashboard raises.
 */
export function periodsAt(
  today: Date,
  timeZone: string,
): Record<
  "last_28_days" | "quarter_to_date" | "last_quarter" | "year_to_date",
  {
    readonly label: string;
    readonly from: string;
    readonly to: string;
    readonly baselineLabel: string;
    readonly baselineFrom: string;
    readonly baselineTo: string;
    readonly baselineClipped: boolean;
  }
> {
  const p = zoneParts(today, timeZone);
  const midnight = (year: number, month: number, day: number): Date =>
    zonedInstant(year, month, day, 0, 0, 0, timeZone);
  const iso = (at: Date): string => at.toISOString();

  const thisMorning = midnight(p.year, p.month, p.day);
  /* 1, 4, 7 or 10. `zonedInstant` normalises a month below 1 into the year before. */
  const quarterMonth = Math.floor((p.month - 1) / 3) * 3 + 1;
  const quarterStart = midnight(p.year, quarterMonth, 1);
  const elapsedDays = Math.round((thisMorning.getTime() - quarterStart.getTime()) / DAY_MS);

  return {
    last_28_days: {
      label: "Last 28 days",
      from: iso(midnight(p.year, p.month, p.day - 28)),
      to: iso(thisMorning),
      baselineLabel: "the previous 28 days",
      baselineFrom: iso(midnight(p.year, p.month, p.day - 56)),
      baselineTo: iso(midnight(p.year, p.month, p.day - 28)),
      baselineClipped: false,
    },
    quarter_to_date: {
      label: "Quarter to date",
      from: iso(quarterStart),
      to: iso(thisMorning),
      baselineLabel: `the same ${String(elapsedDays)} ${elapsedDays === 1 ? "day" : "days"} of the previous quarter`,
      baselineFrom: iso(midnight(p.year, quarterMonth - 3, 1)),
      baselineTo: iso(midnight(p.year, quarterMonth - 3, 1 + elapsedDays)),
      baselineClipped: true,
    },
    last_quarter: {
      label: "Last completed quarter",
      from: iso(midnight(p.year, quarterMonth - 3, 1)),
      to: iso(quarterStart),
      baselineLabel: "the quarter before it",
      baselineFrom: iso(midnight(p.year, quarterMonth - 6, 1)),
      baselineTo: iso(midnight(p.year, quarterMonth - 3, 1)),
      baselineClipped: false,
    },
    year_to_date: {
      label: "Year to date",
      from: iso(midnight(p.year, 1, 1)),
      to: iso(thisMorning),
      baselineLabel: "the same period last year",
      baselineFrom: iso(midnight(p.year - 1, 1, 1)),
      baselineTo: iso(midnight(p.year - 1, p.month, p.day)),
      baselineClipped: true,
    },
  };
}
