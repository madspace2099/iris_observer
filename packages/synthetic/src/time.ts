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
