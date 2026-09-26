import { describe, expect, it } from "vitest";

import type { ShowroomSession } from "@observer/contracts";

import { buildTrend } from "../src/showroom/charts";
import { seriesOver, weeklyBuckets } from "../src/showroom/screens";
import { periodsAt } from "../src/time";

/**
 * ONE WEEK, WHEREVER A MEETING IS COUNTED.
 *
 * Two functions cut meetings into weeks: `weeklyBuckets` for the agent and unit
 * pages, `buildTrend` for Sales Flow. They drifted apart once. The buckets
 * stepped seven days from the moment the period opened, so the year 2026, which
 * opens on a Thursday, ran Thursday to Wednesday on one page and Monday to
 * Sunday on the next. These cases hold both to the same week.
 *
 * Every expected instant is written out with its offset, and every weekday and
 * wall-clock reading is taken with `Intl.DateTimeFormat` directly, never with
 * the helpers under test, so no case grades its own homework.
 */

const ZONE = "Europe/Bratislava";
const LOCALE = "en-GB";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const wall = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** What the zone's wall clock reads at an instant, as Intl reads it. */
function reading(at: number): Readonly<Record<string, string>> {
  return Object.fromEntries(wall.formatToParts(new Date(at)).map((p) => [p.type, p.value]));
}

/** The zone's calendar date at an instant, as midnight UTC of that date: whole days, for counting days. */
function calendarDay(at: number): number {
  const r = reading(at);
  return Date.UTC(Number(r.year), Number(r.month) - 1, Number(r.day));
}

function meeting(startedAt: string): ShowroomSession {
  return {
    sessionId: `ses_${startedAt}`,
    meetingId: `mtg_${startedAt}`,
    projectId: "prj_x",
    agentId: "agt_x",
    channel: "showroom",
    contactId: null,
    startedAt,
    endedAt: startedAt,
    durationSeconds: 0,
    outcome: "interested",
    steps: [],
    units: [],
    environment: [],
    filters: [],
    places: [],
    screenshots: 0,
    irisRating: null,
    priorMeetings: 0,
    timingUnavailable: false,
  };
}

describe("weeklyBuckets cuts a period into calendar weeks", () => {
  it("year to date 2026: the first week is cut at 1 January and ends on Monday 5 January", () => {
    /* A year to date short enough that the twelve-week cap keeps its first week. */
    const ytd = periodsAt(new Date("2026-02-20T12:00:00+01:00"), ZONE).year_to_date;
    expect(Date.parse(ytd.from)).toBe(Date.parse("2026-01-01T00:00:00+01:00"));

    const buckets = weeklyBuckets(ytd.from, ytd.to, LOCALE, ZONE);
    expect(buckets[0]).toEqual({
      from: Date.parse("2026-01-01T00:00:00+01:00"),
      to: Date.parse("2026-01-05T00:00:00+01:00"),
      label: "1 Jan",
    });
    expect(calendarDay(buckets[0]?.to ?? 0) - calendarDay(buckets[0]?.from ?? 0)).toBe(4 * DAY);
    expect(buckets[1]).toEqual({
      from: Date.parse("2026-01-05T00:00:00+01:00"),
      to: Date.parse("2026-01-12T00:00:00+01:00"),
      label: "5 Jan",
    });
    /* The last is cut where the period ends: this morning, a Friday. */
    expect(buckets[buckets.length - 1]).toEqual({
      from: Date.parse("2026-02-16T00:00:00+01:00"),
      to: Date.parse("2026-02-20T00:00:00+01:00"),
      label: "16 Feb",
    });
  });

  it("every week but the first starts on a Monday, at local midnight, and the weeks meet end to start", () => {
    const ytd = periodsAt(new Date("2026-02-20T12:00:00+01:00"), ZONE).year_to_date;
    const buckets = weeklyBuckets(ytd.from, ytd.to, LOCALE, ZONE);
    expect(buckets).toHaveLength(8);
    expect(reading(buckets[0]?.from ?? 0).weekday).toBe("Thu");
    for (const bucket of buckets.slice(1)) {
      const r = reading(bucket.from);
      expect([r.weekday, r.hour, r.minute, r.second]).toEqual(["Mon", "00", "00", "00"]);
    }
    buckets.slice(1).forEach((bucket, i) => expect(bucket.from).toBe(buckets[i]?.to));
  });

  it("on the synthetic world's own year to date the cap keeps twelve whole Monday weeks, the last ending with the period", () => {
    const ytd = periodsAt(new Date("2026-08-24T12:00:00+02:00"), ZONE).year_to_date;
    const buckets = weeklyBuckets(ytd.from, ytd.to, LOCALE, ZONE);
    expect(buckets).toHaveLength(12);
    expect(buckets[0]?.from).toBe(Date.parse("2026-06-01T00:00:00+02:00"));
    expect(buckets[0]?.label).toBe("1 Jun");
    expect(buckets[11]?.to).toBe(Date.parse("2026-08-24T00:00:00+02:00"));
    for (const bucket of buckets) {
      const r = reading(bucket.from);
      expect([r.weekday, r.hour, r.minute, r.second]).toEqual(["Mon", "00", "00", "00"]);
      expect(calendarDay(bucket.to) - calendarDay(bucket.from)).toBe(7 * DAY);
    }
  });

  const CLOCK_CHANGES = [
    {
      name: "spring forward, 29 March",
      from: "2026-03-01T00:00:00+01:00",
      to: "2026-04-15T00:00:00+02:00",
      monday: "2026-03-23T00:00:00+01:00",
      nextMonday: "2026-03-30T00:00:00+02:00",
      hours: 167,
    },
    {
      name: "fall back, 25 October",
      from: "2026-10-01T00:00:00+02:00",
      to: "2026-11-15T00:00:00+01:00",
      monday: "2026-10-19T00:00:00+02:00",
      nextMonday: "2026-10-26T00:00:00+01:00",
      hours: 169,
    },
  ];

  for (const change of CLOCK_CHANGES) {
    it(`the week across the clock change (${change.name}) covers seven calendar days, not 7 × 24 hours`, () => {
      const buckets = weeklyBuckets(change.from, change.to, LOCALE, ZONE);
      const at = buckets.findIndex((b) => b.from === Date.parse(change.monday));
      const week = buckets[at];
      expect(week?.to).toBe(Date.parse(change.nextMonday));
      expect(((week?.to ?? 0) - (week?.from ?? 0)) / HOUR).toBe(change.hours);
      expect(calendarDay(week?.to ?? 0) - calendarDay(week?.from ?? 0)).toBe(7 * DAY);
      /* And the week after it still opens at Monday midnight, not an hour off. */
      const r = reading(buckets[at + 1]?.from ?? 0);
      expect([r.weekday, r.hour, r.minute, r.second]).toEqual(["Mon", "00", "00", "00"]);
    });
  }
});

describe("the connecting guard: a meeting falls in the same week on every page", () => {
  /*
   * Periods that open on a Monday, so no week is cut at the start and every
   * label is the week's Monday — the label `buildTrend` gives the same week.
   * The meetings sit on a week's edges: its first and last moments, both clock
   * changes, and the hour of 25 October that happens twice.
   */
  const CASES = [
    {
      from: "2025-12-29T00:00:00+01:00",
      to: "2026-03-16T00:00:00+01:00",
      meetings: [
        "2026-01-01T09:00:00+01:00",
        "2026-01-04T23:59:59+01:00",
        "2026-01-05T00:00:00+01:00",
        "2026-02-15T12:00:00+01:00",
        "2026-03-15T23:59:59+01:00",
      ],
    },
    {
      from: "2026-03-16T00:00:00+01:00",
      to: "2026-06-01T00:00:00+02:00",
      meetings: [
        "2026-03-29T01:59:59+01:00",
        "2026-03-29T03:00:00+02:00",
        "2026-03-30T00:00:00+02:00",
        "2026-03-30T00:30:00+02:00",
        "2026-05-31T23:59:59+02:00",
      ],
    },
    {
      from: "2026-10-05T00:00:00+02:00",
      to: "2026-12-28T00:00:00+01:00",
      meetings: [
        "2026-10-25T02:30:00+02:00",
        "2026-10-25T02:30:00+01:00",
        "2026-10-26T00:00:00+01:00",
        "2026-12-27T23:59:59+01:00",
      ],
    },
  ];

  for (const period of CASES) {
    for (const at of period.meetings) {
      it(`${at} is filed under the Monday buildTrend files it under`, () => {
        const holding = weeklyBuckets(period.from, period.to, LOCALE, ZONE).filter(
          (b) => Date.parse(at) >= b.from && Date.parse(at) < b.to,
        );
        const trend = buildTrend([meeting(at)], LOCALE, ZONE).points;
        expect(holding).toHaveLength(1);
        expect(trend).toHaveLength(1);
        expect(holding[0]?.label).toBe(trend[0]?.label);
      });
    }

    it(`${period.from}: both count the same meetings in the same weeks`, () => {
      const meetings = period.meetings.map(meeting);
      const bucketed = seriesOver(meetings, weeklyBuckets(period.from, period.to, LOCALE, ZONE));
      const trended = new Map(
        buildTrend(meetings, LOCALE, ZONE).points.map((p) => [p.label, p.value]),
      );
      for (const week of bucketed) {
        expect(week.value).toBe(trended.get(week.label) ?? 0);
      }
      expect(bucketed.reduce((a, w) => a + w.value, 0)).toBe(meetings.length);
    });
  }
});

describe("seriesOver", () => {
  it("counts a meeting on a boundary once: in the week it opens, never the one it closes", () => {
    /* [1 Jan, 5 Jan), [5 Jan, 12 Jan), [12 Jan, 19 Jan): 19 January is a Monday and the period's end. */
    const buckets = weeklyBuckets(
      "2026-01-01T00:00:00+01:00",
      "2026-01-19T00:00:00+01:00",
      LOCALE,
      ZONE,
    );
    const series = seriesOver(
      [
        meeting("2025-12-31T23:59:59.999+01:00"), // before the period: in no week
        meeting("2026-01-01T00:00:00+01:00"), // the period's first instant: the first week
        meeting("2026-01-04T23:59:59.999+01:00"), // the first week's last instant
        meeting("2026-01-05T00:00:00+01:00"), // a boundary: the week it opens
        meeting("2026-01-12T00:00:00+01:00"), // a boundary: the week it opens
        meeting("2026-01-19T00:00:00+01:00"), // the period's end, open: in no week
      ],
      buckets,
    );
    expect(series).toEqual([
      { label: "1 Jan", value: 2 },
      { label: "5 Jan", value: 1 },
      { label: "12 Jan", value: 1 },
    ]);
  });
});
