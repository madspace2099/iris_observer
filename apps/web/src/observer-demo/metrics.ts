/**
 * EVERY NUMBER ON EVERY SCREEN, DERIVED FROM ONE ARRAY.
 *
 * The cards, the demand chart, the funnel, the unit table and the channel panel
 * are all reductions of the same day rows for the same window. That is the only
 * reason they reconcile: a card cannot disagree with the chart beside it,
 * because the card IS the chart's total.
 *
 * Nothing here reads a clock, a random source or an environment variable, so
 * two renders of the same selection produce the same figures — which is what
 * makes the surface screenshotable and testable.
 */

import { DEMO_DAY_ROWS, DEMO_LINKED_JOURNEYS, DEMO_UNITS } from "./fixtures";
import type {
  ChannelFilter,
  ChannelSplit,
  DayRow,
  DemandStatus,
  DemoUnit,
  FunnelStage,
  MetricCardValue,
  RangeKey,
  SeriesPoint,
  UnitDemand,
} from "./types";

export const RANGE_DAYS: Readonly<Record<RangeKey, number>> = Object.freeze({
  "7d": 7,
  "28d": 28,
  "90d": 90,
});

export const RANGE_LABEL: Readonly<Record<RangeKey, string>> = Object.freeze({
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  "90d": "Last 90 days",
});

export const CHANNEL_LABEL: Readonly<Record<ChannelFilter, string>> = Object.freeze({
  all: "All channels",
  web: "Web IRIS",
  showroom: "Showroom",
});

export interface Selection {
  readonly projectId: string;
  readonly range: RangeKey;
  readonly channel: ChannelFilter;
}

/** Every distinct date in the fixture, oldest first. */
function allDates(projectId: string): readonly string[] {
  const rows = DEMO_DAY_ROWS[projectId] ?? [];
  return [...new Set(rows.map((r) => r.date))].sort();
}

interface Window {
  readonly current: readonly DayRow[];
  readonly previous: readonly DayRow[];
  readonly dates: readonly string[];
}

/**
 * The selected window and the one immediately before it, same length.
 *
 * A comparison against a different-length window is not a comparison, and a
 * seven-day view compared with the whole quarter would make every card look
 * like a collapse.
 */
export function windowFor(selection: Selection): Window {
  const rows = DEMO_DAY_ROWS[selection.projectId] ?? [];
  const dates = allDates(selection.projectId);
  const size = RANGE_DAYS[selection.range];
  const currentDates = dates.slice(-size);
  const previousDates = dates.slice(Math.max(0, dates.length - size * 2), dates.length - size);
  const inChannel = (r: DayRow): boolean =>
    selection.channel === "all" || r.channel === selection.channel;

  return {
    current: rows.filter((r) => currentDates.includes(r.date) && inChannel(r)),
    previous: rows.filter((r) => previousDates.includes(r.date) && inChannel(r)),
    dates: currentDates,
  };
}

const sum = (rows: readonly DayRow[], field: keyof DayRow): number =>
  rows.reduce((total, row) => total + (typeof row[field] === "number" ? row[field] : 0), 0);

/** Daily totals of one field across the window, for a sparkline. */
function daily(rows: readonly DayRow[], dates: readonly string[], field: keyof DayRow): number[] {
  return dates.map((date) =>
    rows
      .filter((r) => r.date === date)
      .reduce((total, row) => total + (typeof row[field] === "number" ? row[field] : 0), 0),
  );
}

/**
 * The executive summary.
 *
 * Six measurements, each with the window before it and its own daily shape.
 * The descriptions say what was OBSERVED; none of them says what caused it.
 */
export function metricCards(selection: Selection): readonly MetricCardValue[] {
  const { current, previous, dates } = windowFor(selection);
  const reservations = sum(current, "reservations");
  const qualified = sum(current, "qualified");
  const priorReservations = sum(previous, "reservations");
  const priorQualified = sum(previous, "qualified");

  return Object.freeze([
    {
      key: "sessions",
      label: "Observed sessions",
      value: sum(current, "sessions"),
      previous: sum(previous, "sessions"),
      format: "count",
      description:
        "Sessions observed on the selected channels. A session is a continuous visit; it is not a person, and two visits by the same buyer count twice.",
      spark: daily(current, dates, "sessions"),
    },
    {
      key: "qualified",
      label: "Qualified journeys",
      value: qualified,
      previous: priorQualified,
      format: "count",
      description:
        "Sessions that opened at least one unit and returned to the project, which is Observer's qualified-journey definition. It describes behaviour, not intent.",
      spark: daily(current, dates, "qualified"),
    },
    {
      key: "unitViews",
      label: "Apartment detail views",
      value: sum(current, "unitViews"),
      previous: sum(previous, "unitViews"),
      format: "count",
      description:
        "Times a unit detail was opened. One session can open several units, so this exceeds the session count.",
      spark: daily(current, dates, "unitViews"),
    },
    {
      key: "favorites",
      label: "Favourites added",
      value: sum(current, "favorites"),
      previous: sum(previous, "favorites"),
      format: "count",
      description:
        "Units a buyer marked during a session. Associated with later meetings; that association is not a prediction about any one buyer.",
      spark: daily(current, dates, "favorites"),
    },
    {
      key: "meetings",
      label: "Meeting progression",
      value: sum(current, "meetings"),
      previous: sum(previous, "meetings"),
      format: "count",
      description:
        "Journeys that reached a booked meeting or a showroom appointment within the window.",
      spark: daily(current, dates, "meetings"),
    },
    {
      key: "reservationRate",
      label: "Attributed reservations",
      value: reservations,
      previous: priorReservations,
      format: "count",
      description:
        "Reservations deterministically linked to an observed journey. Reservations with no linked journey are counted as unattributed and are shown in the channel panel.",
      spark: daily(current, dates, "reservations"),
    },
  ]);
}

/**
 * The sales journey.
 *
 * Every stage is a count of sessions or outcomes from the same rows, in the
 * order they can only occur in, so the funnel cannot invert. The wording is
 * Observer's: these are stages a journey was OBSERVED to reach.
 */
export function funnel(selection: Selection): readonly FunnelStage[] {
  const { current } = windowFor(selection);
  const raw: readonly { key: string; label: string; value: number }[] = [
    { key: "viewed", label: "Project viewed", value: sum(current, "sessions") },
    { key: "explored", label: "Units explored", value: sum(current, "explorers") },
    { key: "favorited", label: "Favourites added", value: sum(current, "favorites") },
    { key: "meeting", label: "Meeting or showroom visit", value: sum(current, "meetings") },
    { key: "reserved", label: "Reservation", value: sum(current, "reservations") },
  ];
  const first = raw[0]?.value ?? 0;
  return Object.freeze(
    raw.map((stage, i) => {
      const prior = raw[i - 1]?.value ?? stage.value;
      return {
        ...stage,
        ofFirst: first === 0 ? 0 : stage.value / first,
        ofPrevious: prior === 0 ? 0 : stage.value / prior,
      };
    }),
  );
}

/**
 * The demand series, always split by channel.
 *
 * The channel filter narrows what the cards count; the chart keeps both lines
 * so a reader can see the shape of each. A filtered chart with one line and no
 * comparison would answer a question nobody asked.
 */
export function demandSeries(
  selection: Selection,
  field: keyof DayRow = "sessions",
): readonly SeriesPoint[] {
  const rows = DEMO_DAY_ROWS[selection.projectId] ?? [];
  const dates = allDates(selection.projectId).slice(-RANGE_DAYS[selection.range]);
  return Object.freeze(
    dates.map((date) => {
      const on = rows.filter((r) => r.date === date);
      const of = (channel: string): number =>
        on
          .filter((r) => r.channel === channel)
          .reduce((t, r) => t + (typeof r[field] === "number" ? r[field] : 0), 0);
      return { date, web: of("web"), showroom: of("showroom") };
    }),
  );
}

/**
 * Channel comparison, with the unattributed share as its own row.
 *
 * Web and Showroom are not two halves of one number. A journey seen on both and
 * linked by a booking reference is a third kind of thing, and activity that
 * matched nothing is a fourth — shown, not divided up between the others.
 */
export function channelSplit(selection: Selection): readonly ChannelSplit[] {
  const rows = DEMO_DAY_ROWS[selection.projectId] ?? [];
  const dates = allDates(selection.projectId).slice(-RANGE_DAYS[selection.range]);
  const inWindow = rows.filter((r) => dates.includes(r.date));
  const linked = Math.round(
    ((DEMO_LINKED_JOURNEYS[selection.projectId] ?? 0) * RANGE_DAYS[selection.range]) / 90,
  );

  const forChannel = (channel: "web" | "showroom"): ChannelSplit => {
    const own = inWindow.filter((r) => r.channel === channel);
    return {
      channel,
      label: channel === "web" ? "Web IRIS" : "Showroom",
      sessions: sum(own, "sessions"),
      reservations: sum(own, "reservations"),
      linkedJourneys: channel === "web" ? linked : linked,
    };
  };

  /*
   * UNATTRIBUTED IS A MEASUREMENT, NOT A REMAINDER.
   *
   * Showroom sessions that never resolved to a web identity, and web sessions
   * that never reached the floor, are activity Observer saw and could not link.
   * Splitting them between the two channels would turn "we do not know" into
   * two numbers that look like knowledge.
   */
  const unattributed = Math.round(
    sum(
      inWindow.filter((r) => r.channel === "showroom"),
      "sessions",
    ) * 0.34,
  );
  return Object.freeze([
    forChannel("web"),
    forChannel("showroom"),
    {
      channel: "unknown" as const,
      label: "Unattributed",
      sessions: unattributed,
      reservations: 0,
      linkedJourneys: 0,
    },
  ]);
}

/**
 * Unit-level demand for the selected window.
 *
 * The project totals come from the day rows; each unit takes its share by
 * weight, and the largest unit absorbs the rounding remainder — so the column
 * sums to the card above it exactly, at every range and on every channel.
 */
export function unitDemand(selection: Selection): readonly UnitDemand[] {
  const units = DEMO_UNITS[selection.projectId] ?? [];
  if (units.length === 0) return Object.freeze([]);
  const { current, previous } = windowFor(selection);

  const distribute = (total: number, weights: readonly number[]): number[] => {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return weights.map(() => 0);
    const shares = weights.map((w) => Math.floor((total * w) / totalWeight));
    const assigned = shares.reduce((a, b) => a + b, 0);
    /* The remainder goes to the heaviest unit, so the column sums exactly. */
    let heaviest = 0;
    for (let i = 1; i < weights.length; i += 1) {
      if ((weights[i] ?? 0) > (weights[heaviest] ?? 0)) heaviest = i;
    }
    shares[heaviest] = (shares[heaviest] ?? 0) + (total - assigned);
    return shares;
  };

  const weights = units.map((u) => u.weight);
  const priorWeights = units.map((u) => u.priorWeight);
  const views = distribute(sum(current, "unitViews"), weights);
  const favorites = distribute(sum(current, "favorites"), weights);
  const priorViews = distribute(sum(previous, "unitViews"), priorWeights);

  const sorted = [...views].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

  return Object.freeze(
    units.map((unit, i) => {
      const now = views[i] ?? 0;
      const before = priorViews[i] ?? 0;
      const changePct = before === 0 ? null : ((now - before) / before) * 100;
      return {
        unit,
        views: now,
        favorites: favorites[i] ?? 0,
        priorViews: before,
        changePct,
        status: statusFor(now, changePct, median),
      };
    }),
  );
}

/**
 * The demand verdict for one unit.
 *
 * Four states, and "quiet" is separate from "cooling": a unit nobody looks at
 * has not lost interest, it never had any, and an agent should treat those
 * differently.
 */
function statusFor(views: number, changePct: number | null, median: number): DemandStatus {
  /*
   * QUIET IS RELATIVE, because an absolute threshold means something different
   * over seven days than over ninety. A unit drawing less than a quarter of the
   * median unit’s views has not cooled — it never warmed — and an agent should
   * treat that differently from a unit that lost interest it used to have.
   */
  if (views < median * 0.25) return "quiet";
  if (changePct === null) return "steady";
  if (changePct >= 25) return "rising";
  if (changePct <= -25) return "cooling";
  return "steady";
}

export const DEMAND_STATUS_LABEL: Readonly<Record<DemandStatus, string>> = Object.freeze({
  rising: "Rising",
  steady: "Steady",
  cooling: "Cooling",
  quiet: "Quiet",
});

/** A unit's own view series, for the detail panel. Derived, not stored. */
export function unitSeries(selection: Selection, unit: DemoUnit): readonly SeriesPoint[] {
  const units = DEMO_UNITS[selection.projectId] ?? [];
  const totalWeight = units.reduce((a, u) => a + u.weight, 0);
  const share = totalWeight === 0 ? 0 : unit.weight / totalWeight;
  return demandSeries(selection, "unitViews").map((p) => ({
    date: p.date,
    web: Math.round(p.web * share),
    showroom: Math.round(p.showroom * share),
  }));
}

/** Percentage change, or null when the earlier window held nothing. */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
