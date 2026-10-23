import {
  CORE_SECTION_IDS,
  OUTCOME_LABELS,
  SECTION_IDS,
  hasProgressed,
  outcomeIsUnknown,
  sectionLabel,
  type MeetingOutcome,
  type SectionId,
  type ShowroomSession,
} from "@observer/contracts";
import type {
  ActivityMatrix,
  DeliveredDeals,
  AgentCharts,
  AgentRadar,
  BehaviourFunnel,
  FeatureUsage,
  FeatureUsageProfile,
  PresenterComparison,
  FlowCharts,
  BehaviourStep,
  JourneyFlowModel,
  JourneyFunnel,
  KpiFigure,
  KpiGroup,
  KpiPanel,
  KpiWindowId,
  MeetingLens,
  OutcomeComposition,
  PlanVerdict,
  ProjectCharts,
  RankedRow,
  SalesPlan,
  SalesWindow,
  StockPart,
  TrendSeries,
  ViewContext,
} from "@observer/readmodels";
import { SALES_PACE_MIN_SAMPLE } from "@observer/metrics";
import { dealsFor } from "../deals";
import {
  KPI_WINDOWS,
  duration,
  type Language,
  addressOf,
  type ProjectAddress,
  replayHref,
  agentDetailHref,
  summariseSaleCycles,
  seatSeries,
} from "@observer/readmodels";
import { catalogueFor } from "../pulse";
import {
  count,
  clockLabel,
  dayLabel,
  evidenceRef,
  monthLabel,
  monthYearLabel,
  percent,
  shareDisplay,
  signedPercent,
  signedPoints,
} from "../format";
import { endOfDayIn, monthKeyIn, startOfMonthIn, startOfWeekIn, zoneParts } from "../time";
import { presenterName, presentersIn } from "./sessions";
import { AGENT_MIN_SAMPLE, getMetric } from "@observer/metrics";
import { showroomSaleCycleInputs } from "./sale-cycles";
import { meetings, progressedFigure, sliceSpan, suppressionNoteFor } from "./views3";
import { ASSOCIATION_DISCLAIMER } from "./project";

/**
 * The figures behind the chart vocabulary.
 *
 * Everything here is derived from the same session stream every other surface
 * reads. No figure is stored, so a new question can be asked of meetings that
 * have already happened — which is the property the legacy dashboard's
 * pre-aggregated counters permanently lack.
 */

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[m - 1] as number) + (s[m] as number)) / 2 : (s[m] as number);
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function within(sessions: readonly ShowroomSession[], from: number, to: number): ShowroomSession[] {
  return sessions.filter((s) => {
    const at = Date.parse(s.startedAt);
    return at >= from && at < to;
  });
}

/* --- KPI cards over a chosen window ----------------------------------------- */

/**
 * The summary row's four groups (R05 item 2, approved by Máté on 2026-09-24).
 *
 * Measured before any was built. Two hold a figure this row already draws. Two
 * hold none, and are printed empty with what is missing:
 * - Conversion. The deal ladder is stock, not path (`deal-source.ts`), and the
 *   registry's `flow.stage_conversion` is defined but computed nowhere.
 *   Progressing is a meeting ratio, which the plan excludes as conversion.
 * - Cycle time. `sale-cycle.ts` is rendered nowhere, and P2-06 is blocked on
 *   the inputs named below.
 *
 * "Typical length" belongs to none. It measures workload, and under Volume the
 * group's name would say something untrue about it, so it stays in the row
 * outside the groups.
 */
/** Below this many meetings in a window, its figures are shown and its comparisons judge nothing. */
const KPI_FLOOR = 5;

const KPI_GROUPS: readonly KpiGroup[] = [
  {
    id: "volume",
    label: "Volume",
    definition:
      "How much the showroom was used: the presentations given, and the units opened in them.",
    figureIds: ["presentations", "units"],
    missing: null,
  },
  {
    id: "progress",
    label: "Progress",
    definition:
      "How far the meetings went: of those with an outcome recorded, the share that ended at a follow-up or better.",
    figureIds: ["progressed"],
    missing: null,
  },
  {
    id: "conversion",
    label: "Conversion",
    /*
     * The registry's own words for `flow.stage_conversion`, then why it is
     * empty: behind the `i`, so the card itself reads one short line.
     */
    definition:
      "The share of buyers who move forward from each rung to the next, counted by when they entered it. Not measured yet: the deal ladder counts where each deal stands, not the path it took. Progress counts meetings, not deals.",
    figureIds: [],
    missing: "Not measured yet.",
  },
  {
    id: "cycle_time",
    label: "Cycle time",
    /*
     * End to end, as `flow.sales_cycle_duration` says, and no more. Where the
     * cycle starts is the open decision: the registry counts from a buyer's
     * first contact, while P2-06 measured from a unit's first opening.
     */
    definition: "How long a sale took, end to end.",
    figureIds: [],
    missing:
      "Blocked. It needs each unit's first opening across its whole history, and a decision on whether the cycle starts at a buyer's first contact or at the unit's first showing.",
  },
];

export function buildKpis(
  all: readonly ShowroomSession[],
  today: Date,
  windowId: KpiWindowId,
  locale: string,
  timeZone: string,
  language: Language,
  /** The CRM's deals, for the cycle; null where no CRM is connected. */
  deals: DeliveredDeals | null = null,
): KpiPanel {
  const spec = KPI_WINDOWS.find((w) => w.id === windowId) ?? KPI_WINDOWS[2];
  const day = 24 * 60 * 60 * 1000;
  // The window closes at the end of the project's own day, not UTC's.
  const to = endOfDayIn(today, timeZone).getTime();
  const from = to - spec.days * day;
  const previousFrom = from - spec.days * day;

  const now = within(all, from, to);
  const before = within(all, previousFrom, from);

  /*
   * The recent shape.
   *
   * Eight equal slices of the chosen window, so a sparkline on "this year" is
   * eight months and on "this week" is eight days. The same figure, at the
   * resolution the window deserves.
   */
  const slices = 8;
  const sliceMs = (spec.days * day) / slices;
  const buckets = Array.from({ length: slices }, (_, i) =>
    within(all, from + i * sliceMs, from + (i + 1) * sliceMs),
  );

  /*
   * Every card gets its own shape, not just the count.
   *
   * A sparkline on three cards and a blank on the fourth reads as missing data
   * rather than as a design choice. Where a slice has nothing to measure — no
   * timed session, no recorded outcome — the series carries the last value it
   * had, because a drop to zero would be read as a collapse rather than as
   * silence. Slices before the first measured one take its value for the same
   * reason, and a window with no measured slice has no shape at all: a level
   * line at nought would state a zero nothing measured.
   */
  const seriesOf = (measure: (slice: readonly ShowroomSession[]) => number | null): number[] => {
    const values = buckets.map(measure);
    const first = values.find((v): v is number => v !== null);
    if (first === undefined) return [];
    let carried = first;
    return values.map((value) => (carried = value ?? carried));
  };

  const points = buckets.map((b) => b.length);

  const durations = now.filter((s) => !s.timingUnavailable).map((s) => s.durationSeconds);
  const beforeDurations = before.filter((s) => !s.timingUnavailable).map((s) => s.durationSeconds);
  const medNow = durations.length === 0 ? null : median(durations);
  const medBefore = beforeDurations.length === 0 ? null : median(beforeDurations);

  const decided = now.filter((s) => !outcomeIsUnknown(s.outcome));
  const decidedBefore = before.filter((s) => !outcomeIsUnknown(s.outcome));
  const progressed = share(decided.filter((s) => hasProgressed(s.outcome)).length, decided.length);
  const progressedBefore = share(
    decidedBefore.filter((s) => hasProgressed(s.outcome)).length,
    decidedBefore.length,
  );

  const units = now.reduce((a, s) => a + s.units.length, 0);
  const unitsBefore = before.reduce((a, s) => a + s.units.length, 0);

  const presentationsDelta =
    before.length === 0
      ? null
      : signedPercent((now.length - before.length) / before.length, locale);
  // Two shares set against each other differ in points, not per cent.
  const progressedDelta =
    decidedBefore.length === 0 || decided.length === 0
      ? null
      : signedPoints(progressed - progressedBefore);

  /*
   * No verdict below the floor. Under five meetings on either side the caveat
   * below says the comparisons are not verdicts, so the colour does not give
   * one either: "Today, 2 against 3" was drawn red. A change the printed delta
   * rounds to "no change" is flat too, or 56.2% against 56.0% was green.
   */
  const tone = (
    a: number,
    b: number,
    better: "up" | "down",
    sample: number,
    earlierSample: number,
    delta: string | null,
  ): "good" | "bad" | "flat" => {
    if (delta === null || delta === "no change") return "flat";
    if (a === b || sample < KPI_FLOOR || earlierSample < KPI_FLOOR) return "flat";
    return a > b === (better === "up") ? "good" : "bad";
  };

  /*
   * Spelled once. Every card carries the window it answers to, and three of
   * them used to leave it to the chip row above — which is the same distance
   * "Progressing" already decided was too far.
   */
  const windowWords = spec.label.toLowerCase();

  const figures: KpiFigure[] = [
    {
      id: "presentations",
      label: "Presentations",
      measurementId: "showroom.presentations",
      value: count(now.length, locale),
      /*
       * The window, on the card.
       *
       * "Progressing" below has named its own window since the round that
       * noticed why it had to — this figure and the Sales Flow headline are
       * two different claims over two different spans, and the chip row that
       * sets this one sits several lines away. The rule was right and was
       * applied to one figure out of four: a reader meeting "Presentations 41"
       * above a page whose other counts are quarter-to-date had nothing on the
       * card to tell them why 41 is not 74.
       */
      qualifier:
        before.length === 0
          ? `${windowWords} · no earlier window`
          : `${windowWords} · ${count(before.length, locale)} before`,
      delta: presentationsDelta,
      tone: tone(now.length, before.length, "up", now.length, before.length, presentationsDelta),
      points,
    },
    {
      id: "duration",
      label: "Typical length",
      measurementId: null,
      // Null, not zero: a window with no timed session has no median to report.
      value: medNow === null ? "—" : duration(medNow, language),
      qualifier:
        medBefore === null
          ? `${windowWords} · no earlier median`
          : `${windowWords} · ${duration(medBefore, language)} before`,
      delta:
        medNow === null || medBefore === null || medBefore === 0
          ? null
          : signedPercent((medNow - medBefore) / medBefore, locale),
      // Neutral always, not `tone(medNow, medBefore, "up")": a longer median
      // is not a win and a shorter one is not a loss -- this is a
      // descriptive measure with no earned direction, the same reason
      // "How many, not how well" keeps Presentations-given volume neutral
      // elsewhere on this page. Colouring it good/bad was a copy-paste of
      // the up-is-good rule the genuinely directional figures use.
      tone: "flat",
      points: seriesOf((slice) => {
        const timed = slice.filter((s) => !s.timingUnavailable).map((s) => s.durationSeconds);
        return timed.length === 0 ? null : median(timed);
      }),
    },
    {
      id: "progressed",
      label: "Progressing",
      measurementId: null,
      value: decided.length === 0 ? "—" : percent(progressed, locale),
      // The window named here, not just on the chip row above the card — this
      // figure and the Sales Flow headline are two genuinely different claims
      // (different windows, different denominators), and a reader comparing
      // them needs that on the card itself, not several lines away.
      qualifier:
        decided.length === 0
          ? `no outcome recorded, ${spec.label.toLowerCase()}`
          : `${count(decided.length, locale)} with an outcome, ${spec.label.toLowerCase()}`,
      delta: progressedDelta,
      tone: tone(
        progressed,
        progressedBefore,
        "up",
        decided.length,
        decidedBefore.length,
        progressedDelta,
      ),
      points: seriesOf((slice) => {
        const known = slice.filter((s) => !outcomeIsUnknown(s.outcome));
        return known.length === 0
          ? null
          : Math.round(
              share(known.filter((s) => hasProgressed(s.outcome)).length, known.length) * 100,
            );
      }),
    },
    {
      id: "units",
      label: "Units opened",
      measurementId: "showroom.units_opened",
      value: count(units, locale),
      qualifier: `${windowWords} · ${count(new Set(now.flatMap((s) => s.units.map((u) => u.unitCode))).size, locale)} distinct`,
      delta: unitsBefore === 0 ? null : signedPercent((units - unitsBefore) / unitsBefore, locale),
      // Neutral, same reasoning as Typical length above: which units get
      // opened is decided by buyer interest, not by the showroom, so a
      // count moving either way earns no verdict here.
      tone: "flat",
      points: seriesOf((slice) => slice.reduce((a, s) => a + s.units.length, 0)),
    },
  ];

  const cycle = saleCycleFigure(deals, all, from, to, windowWords, locale);
  if (cycle !== null) figures.push(cycle);

  return {
    window: spec.id,
    windowLabel: spec.label,
    figures,
    caveat:
      now.length === 0
        ? `No meetings fall inside ${spec.label.toLowerCase()}. That is an observation about the window, not a gap in the data.`
        : now.length < KPI_FLOOR
          ? `${meetings(now.length, locale, language)} is too few to read a rate from. The figures are shown; the comparisons are not verdicts.`
          : null,
    groups: KPI_GROUPS.map((group) =>
      group.id === "cycle_time" ? cycleTimeGroup(deals !== null) : group,
    ),
    ungrouped: ["duration"],
  };
}

/*
 * CYCLE TIME, FROM THE SHOWROOM (R05-4, Máté 2026-10-02).
 *
 * The definition is Máté's sentence. Without a CRM no sale has a Sold date, so
 * the group is printed empty and says why rather than drawn at zero.
 */
const CYCLE_DEFINITION =
  "Measured from the first recorded showroom opening to the date the deal entered the Sold stage.";

function cycleTimeGroup(crm: boolean): KpiGroup {
  return {
    id: "cycle_time",
    label: "Cycle time",
    definition: CYCLE_DEFINITION,
    figureIds: crm ? ["sale_cycle"] : [],
    missing: crm ? null : "No CRM is connected, so no sale has a Sold date to measure to.",
  };
}

/** The cycle over the window's sales, by the shared calculator; null without a CRM. */
function saleCycleFigure(
  deals: DeliveredDeals | null,
  history: readonly ShowroomSession[],
  from: number,
  to: number,
  windowWords: string,
  locale: string,
): KpiFigure | null {
  if (deals === null) return null;
  const minimum = getMetric("flow.showroom_sale_cycle")?.minimumSampleSize ?? 10;
  const summary = summariseSaleCycles(
    showroomSaleCycleInputs(deals, history, { from, to }),
    minimum,
  );
  const days = (n: number) =>
    `${count(Math.round(n), locale)} ${Math.round(n) === 1 ? "day" : "days"}`;
  const measured = `${count(summary.measured, locale)} of ${count(summary.examined, locale)} sales measured`;
  const medianDays = summary.state === "ok" ? summary.medianDays : null;
  return {
    id: "sale_cycle",
    label: "Sales cycle",
    measurementId: "flow.showroom_sale_cycle",
    /* Below the floor the value says there is no median, and the counts it rests on qualify it. */
    value:
      summary.examined === 0 ? "No sale" : medianDays === null ? "Too few sales" : days(medianDays),
    qualifier:
      summary.examined === 0
        ? windowWords
        : medianDays !== null && summary.p80Days !== null
          ? `median · 80% within ${days(summary.p80Days)} · ${measured}`
          : `${count(summary.measured, locale)} measured, ${count(minimum, locale)} needed · ${windowWords}`,
    delta: null,
    tone: "flat",
    points: [],
  };
}

/* --- when meetings happen ---------------------------------------------------- */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function buildActivity(
  sessions: readonly ShowroomSession[],
  timeZone: string,
): ActivityMatrix {
  const hours = Array.from({ length: 10 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`);
  const cells: Record<string, number> = {};
  let counted = 0;
  /* The dial's twenty-four hours, counted in the grid's own pass from the same clock reading. */
  const day = Array.from({ length: 24 }, () => 0);

  for (const s of sessions) {
    /*
     * The office's weekday and hour, not UTC's. Read in UTC, a 09:10 meeting
     * in Bratislava landed in a 07:00 cell the grid does not have and fell
     * out of `meetingsCounted` altogether.
     */
    const at = zoneParts(s.startedAt, timeZone);
    day[at.hour % 24] = (day[at.hour % 24] ?? 0) + 1;
    const weekday = WEEKDAYS[at.weekday];
    const hour = `${String(at.hour).padStart(2, "0")}:00`;
    if (weekday === undefined || !hours.includes(hour)) continue;
    cells[`${weekday}|${hour}`] = (cells[`${weekday}|${hour}`] ?? 0) + 1;
    counted += 1;
  }

  /*
   * Every tie is named, never the first of a sort: "Thu at 13:00 and Sun at
   * 15:00" both held six. A tie of more than three names no slot or day, as
   * the dial below would not call one hour of many the busiest either.
   */
  const peakCell = Math.max(0, ...Object.values(cells));
  const busiestSlots = WEEKDAYS.flatMap((d) =>
    hours.flatMap((h) =>
      peakCell > 0 && cells[`${d}|${h}`] === peakCell ? [[d, h] as const] : [],
    ),
  );
  const perDay = WEEKDAYS.map((d) => ({
    weekday: d,
    meetings: hours.reduce((a, h) => a + (cells[`${d}|${h}`] ?? 0), 0),
  }));
  const fewest = Math.min(...perDay.map((d) => d.meetings));
  const quietDays = perDay.filter((d) => d.meetings === fewest).map((d) => d.weekday);

  const clock = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  const peak = Math.max(0, ...day);
  const tied = day.flatMap((n, h) => (peak > 0 && n === peak ? [h] : []));

  return {
    rows: [...WEEKDAYS],
    columns: hours,
    cells,
    busiest:
      busiestSlots.length === 0 || busiestSlots.length > 3
        ? null
        : { ...slotWords(busiestSlots), meetings: peakCell, slots: busiestSlots.length },
    quietest:
      quietDays.length > 3
        ? null
        : { weekday: AND.format(quietDays), meetings: fewest, days: quietDays.length },
    meetingsCounted: counted,
    day: {
      hours: day.map((count, hour) => ({ hour, label: clock(hour), count })),
      peak,
      total: sessions.length,
      busiest:
        tied.length === 0
          ? null
          : {
              display: AND.format(tied.map((h) => `${clock(h)}–${clock(h + 1)}`)),
              count: peak,
              hours: tied.length,
            },
      outsideGrid: sessions.length - counted,
    },
  };
}

/**
 * Tied weekday-hour slots as `{ weekday, hour }`, so "`weekday` at `hour`"
 * names every one: one hour shared ("Tue and Thu" at "14:00"), one day shared
 * ("Thu" at "11:00 and 14:00"), or each slot whole ("Thu at 13:00 and Sun" at
 * "15:00").
 */
function slotWords(slots: readonly (readonly [string, string])[]): {
  weekday: string;
  hour: string;
} {
  const days = [...new Set(slots.map(([d]) => d))];
  const hours = [...new Set(slots.map(([, h]) => h))];
  if (hours.length === 1) return { weekday: AND.format(days), hour: hours[0] ?? "" };
  if (days.length === 1) return { weekday: days[0] ?? "", hour: AND.format(hours) };
  const last = slots[slots.length - 1]?.[1] ?? "";
  const named = AND.format(slots.map(([d, h]) => `${d} at ${h}`));
  return { weekday: named.slice(0, -` at ${last}`.length), hour: last };
}

/* --- what precedes a poor outcome --------------------------------------------- */

/* `did` follows "The 19 meetings that ended "not interested"" in the lead. */
const BEHAVIOURS = [
  {
    id: "reached_surroundings",
    label: "Reached Surroundings at all",
    did: "reached Surroundings",
    test: (s: ShowroomSession) => s.steps.some((x) => x.sectionId === "surroundings"),
  },
  {
    id: "opened_amenities",
    label: "Opened Amenities",
    did: "opened Amenities",
    test: (s: ShowroomSession) => s.steps.some((x) => x.sectionId === "amenities"),
  },
  {
    id: "three_units",
    label: "Opened three or more units",
    did: "opened three or more units",
    test: (s: ShowroomSession) => s.units.length >= 3,
  },
  {
    id: "shortlisted",
    label: "Shortlisted anything",
    did: "shortlisted anything",
    test: (s: ShowroomSession) => s.units.some((u) => u.favourited),
  },
  {
    id: "used_compare",
    label: "Used Compare",
    did: "used Compare",
    test: (s: ShowroomSession) => s.steps.some((x) => x.sectionId === "compare"),
  },
  {
    id: "returned",
    label: "Returned to a section before closing",
    did: "returned to a section",
    test: (s: ShowroomSession) => s.steps.some((x) => x.isReturn),
  },
] as const;

/*
 * WHY THEY ENDED SO (ADR-0053). The owner, 2026-10-22: which feature was opened
 * how often is not enough; he wants to see whose the meetings were, how long
 * they ran and how much was opened in them. Each typical figure is a median
 * over the meetings on a side that can answer it, set beside the same median of
 * every other recorded meeting; the floor is the registry's, per side.
 *
 * "Features opened" is every opening of a showroom section, a return counted
 * again (`steps`): the showroom records openings, not clicks or taps, and a
 * click count is a measure the event contract does not carry.
 */
const COHORT_FIGURES: readonly {
  readonly id: "length" | "features_opened" | "apartments_opened";
  readonly metricId: string;
  readonly label: string;
  /** The meetings on a side that can answer it, and what they are called in a sample. */
  readonly answers: (s: ShowroomSession) => boolean;
  readonly sample: string;
  readonly value: (s: ShowroomSession) => number;
  /** A length is said as a duration; a count as a number. */
  readonly isDuration: boolean;
  /** Following "The 19 meetings that ended "not interested"", for a group below and above the others. */
  readonly fewer: string;
  readonly more: string;
}[] = [
  {
    id: "length",
    metricId: "flow.not_interested_length",
    label: "Median length",
    answers: (s) => !s.timingUnavailable,
    sample: "timed",
    value: (s) => s.durationSeconds,
    isDuration: true,
    fewer: "ran shorter",
    more: "ran longer",
  },
  {
    id: "features_opened",
    metricId: "flow.not_interested_interactions",
    label: "Median features opened",
    answers: () => true,
    sample: "meetings",
    value: (s) => s.steps.length,
    isDuration: false,
    fewer: "opened fewer features",
    more: "opened more features",
  },
  {
    id: "apartments_opened",
    metricId: "flow.not_interested_interactions",
    label: "Median apartments opened",
    answers: () => true,
    sample: "meetings",
    value: (s) => s.units.length,
    isDuration: false,
    fewer: "opened fewer apartments",
    more: "opened more apartments",
  },
];

/** A typical figure or a behaviour is said in the lead once it differs by this much: relative for a median, in points for a share. */
const LEAD_GAP = 0.15;

export function buildBehaviourFunnel(
  sessions: readonly ShowroomSession[],
  locale: string,
  language: Language,
  at: ProjectAddress,
  periodLabel: string,
): BehaviourFunnel {
  const cohort = sessions.filter((s) => s.outcome === "not_interested");
  const rest = sessions.filter(
    (s) => s.outcome !== "not_interested" && !outcomeIsUnknown(s.outcome),
  );

  /*
   * Each band is the meetings that did this **and** everything above it.
   *
   * The first version counted each behaviour independently, which produced a
   * shape where band four was wider than band three and the arithmetic between
   * them read as a loss that had not happened. A funnel means survival, so the
   * bands have to nest; otherwise the shape is a lie no caption can undo.
   *
   * Each band still carries its own standalone rate, and the same rate among
   * every other recorded meeting, because "86% shortlisted something" only
   * means anything beside the figure for everyone else.
   */
  const rate = (xs: readonly ShowroomSession[], test: (s: ShowroomSession) => boolean) =>
    xs.length === 0 ? null : percent(share(xs.filter(test).length, xs.length), locale);

  /*
   * Nobody in the group is not a group that did nothing. Drawn, it was seven
   * bands at nought under a red "0%", which reads as a finding; it is the
   * absence of one, and says so.
   */
  if (cohort.length === 0) {
    return {
      cohortLabel: `Ended "not interested" · ${meetings(0, locale, language)}`,
      steps: [],
      empty:
        sessions.length === 0
          ? "No meeting was recorded in this period, so there is no group to describe."
          : `None of the ${meetings(sessions.length, locale, language)} in this period ended "not interested", so there is no group to describe.`,
      comparisonLabel: `every other recorded meeting · ${count(rest.length, locale)}`,
      disclaimer: "",
      lead: null,
      figures: [],
      byAgent: [],
      reach: [],
      reachOf: "",
    };
  }

  let surviving: readonly ShowroomSession[] = cohort;
  const steps: BehaviourStep[] = [
    {
      id: "all",
      label: "Meetings in this group",
      count: cohort.length,
      note: null,
      comparisonNote: null,
    },
  ];

  for (const b of BEHAVIOURS) {
    surviving = surviving.filter(b.test);
    steps.push({
      id: b.id,
      label: b.label,
      count: surviving.length,
      note: rate(cohort, b.test),
      comparisonNote: rate(rest, b.test),
    });
  }

  const n = (v: number) => count(v, locale);
  const group = meetings(cohort.length, locale, language);
  const others = `${n(rest.length)} other recorded ${rest.length === 1 ? "meeting" : "meetings"}`;
  const floor = (metricId: string) => getMetric(metricId)?.minimumSampleSize ?? AGENT_MIN_SAMPLE;

  /*
   * Whose they were: every presenter of the period in the roster's order, the
   * rings' order, so a name stands where it stood in the rows above. Each
   * count is of the group; each rate of the presenter's own recorded meetings,
   * and only from the floor up.
   */
  const root = `/${at.tenantSlug}/${at.projectSlug}`;
  const byAgent = presentersIn(sessions, language)
    .filter((p) => sessions.some((s) => s.agentId === p.id))
    .map((p) => {
      const mine = cohort.filter((s) => s.agentId === p.id).length;
      const recorded = sessions.filter(
        (s) => s.agentId === p.id && !outcomeIsUnknown(s.outcome),
      ).length;
      const belowMinimum = recorded < AGENT_MIN_SAMPLE;
      const rate = belowMinimum ? null : share(mine, recorded);
      return {
        agentId: p.id,
        name: p.name,
        count: mine,
        recordedDisplay: `${n(recorded)} recorded`,
        display:
          recorded === 0
            ? "no outcome recorded"
            : rate === null
              ? `${n(mine)} of ${n(recorded)} · no rate, ${n(AGENT_MIN_SAMPLE - recorded)} short of ${n(AGENT_MIN_SAMPLE)}`
              : `${n(mine)} of ${n(recorded)} · ${shareDisplay(rate, locale)}`,
        share: rate,
        belowMinimum,
        href:
          mine === 0
            ? null
            : `${root}/meetings?agent=${encodeURIComponent(p.id)}&outcome=not_interested`,
      };
    });

  /*
   * Each typical figure, and the lead's clause where it differs enough to say.
   * Set beside the others' only where both sides clear the floor; below it the
   * group's own median stands alone with its sample and how far short it is,
   * the raw figure the doctrine keeps under a floor, and no comparison.
   */
  const reachFloor = floor("flow.not_interested_reach");
  const compared = cohort.length >= reachFloor && rest.length >= reachFloor;
  const short = reachFloor - Math.min(cohort.length, rest.length);
  const differs: { readonly gap: number; readonly text: string }[] = [];
  const figures = COHORT_FIGURES.map((f) => {
    const mine = cohort
      .filter(f.answers)
      .map(f.value)
      .sort((a, b) => a - b);
    const theirs = rest
      .filter(f.answers)
      .map(f.value)
      .sort((a, b) => a - b);
    const minimum = floor(f.metricId);
    const say = (v: number) => (f.isDuration ? duration(v, language) : typical(v, locale));
    const base = { id: f.id, metricId: f.metricId, label: f.label };
    if (mine.length === 0) {
      return { ...base, value: "No median", qualifier: `no ${f.sample} meeting in the group` };
    }
    const g = median(mine);
    if (mine.length < minimum || theirs.length < minimum) {
      /*
       * The shortfall is said once, in the lead. A figure short by what the
       * lead already said only says it is not compared; one whose own sample
       * falls further short (fewer timed meetings) says by how much.
       */
      const shortBy = minimum - Math.min(mine.length, theirs.length);
      const leadSaidIt = !compared && minimum === reachFloor && shortBy === short;
      /* Where the others are the short side, they are named: "of 25 timed · 5 short" read as the 25. */
      const shortSide = theirs.length < mine.length ? `the others' ${n(theirs.length)} are ` : "";
      return {
        ...base,
        value: say(g),
        qualifier: leadSaidIt
          ? `of ${n(mine.length)} ${f.sample} · not compared`
          : `of ${n(mine.length)} ${f.sample} · not compared, ${shortSide}${n(shortBy)} short of ${n(minimum)}`,
      };
    }
    const o = median(theirs);
    const sizes = `${n(mine.length)} and ${n(theirs.length)} ${f.sample}`;
    if (o > 0 && Math.abs(g - o) / o >= LEAD_GAP) {
      /* The lead's own sample is the recorded meetings; a figure resting on fewer says so. */
      const own =
        mine.length === cohort.length && theirs.length === rest.length ? "" : `, ${sizes}`;
      differs.push({
        gap: Math.abs(g - o) / o,
        text: `${g < o ? f.fewer : f.more} (${say(g)} against ${say(o)}${own})`,
      });
    }
    return { ...base, value: say(g), qualifier: `others ${say(o)} · ${sizes}` };
  });

  /* Each behaviour on its own, the widest gap first: what the old band's "on its own · elsewhere" meant. */
  const gapOf = (r: { readonly share: number; readonly comparisonShare: number }) =>
    Math.abs(r.share - r.comparisonShare);
  const reach = compared
    ? BEHAVIOURS.map((b) => {
        const g = share(cohort.filter(b.test).length, cohort.length);
        const o = share(rest.filter(b.test).length, rest.length);
        return {
          id: b.id,
          label: b.label,
          share: g,
          comparisonShare: o,
          text: `${b.label}: ${shareDisplay(g, locale)} of the not-interested meetings, against ${shareDisplay(o, locale)} of the others.`,
        };
      }).sort((a, b) => gapOf(b) - gapOf(a))
    : [];

  /* At most the two widest typical differences, then the widest behaviour. */
  const said = [...differs].sort((a, b) => b.gap - a.gap).map((c) => c.text);
  said.splice(2);
  const widest = reach[0];
  if (widest !== undefined && gapOf(widest) >= LEAD_GAP) {
    const did = BEHAVIOURS.find((b) => b.id === widest.id)?.did ?? widest.label;
    said.push(
      `${did} ${widest.share < widest.comparisonShare ? "less" : "more"} often (${shareDisplay(widest.share, locale)} against ${shareDisplay(widest.comparisonShare, locale)})`,
    );
  }

  const period = periodLabel.toLowerCase();
  const points = n(Math.round(LEAD_GAP * 100));
  /* The one place the shortfall is said: the figures and the behaviours below only say "not compared". */
  const lead = !compared
    ? `${group} ended "not interested", ${period}. A comparison with the ${others} needs ${n(reachFloor)} on each side: ${cohort.length < reachFloor ? "this group is" : "the others are"} ${n(short)} short.`
    : said.length === 0
      ? `The ${group} that ended "not interested" looked much like the ${others}, ${period}: no median differs by ${percent(LEAD_GAP, locale)} or more, no share by ${points} points.`
      : `The ${group} that ended "not interested" ${AND.format(said)} than the ${others}, ${period}: what they had in common, not why.`;

  return {
    cohortLabel: `Ended "not interested" · ${group}`,
    steps,
    empty: null,
    comparisonLabel: `every other recorded meeting · ${count(rest.length, locale)}`,
    /* What a reader needs behind the `i`, and no more (the owner: "where there is a lot of text, SIMPLIFY"). */
    disclaimer: `The meetings that ended "not interested" against every other meeting with an outcome recorded. The two are compared only where each has ${n(reachFloor)} meetings, and a presenter's rate only from ${n(AGENT_MIN_SAMPLE)} recorded. Features opened counts every section opening. This is what the group had in common, not why it ended so.`,
    lead,
    figures,
    byAgent,
    reach,
    reachOf: compared
      ? `Of the ${n(cohort.length)} not-interested meetings and the ${n(rest.length)} others; the widest gap first.`
      : "Not compared at this sample.",
  };
}

/* --- agents across several dimensions ------------------------------------------ */

/** A median as the reader sees it: whole where it is whole, one decimal where two middles split. */
function typical(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/*
 * The six measures of the agent page's radar, each over a set of meetings, in
 * words for a reader who has not met the metric vocabulary: "typical" where
 * the figure is a median, "how often" where it is a share. Coaching no longer
 * draws them (ADR-0057): its one chart reads the parts of the showroom.
 */
const RADAR_AXES: readonly {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly measure: (mine: readonly ShowroomSession[]) => number;
}[] = [
  {
    id: "coverage",
    label: "Coverage",
    note: "How many of the main parts of the presentation a typical meeting reached.",
    measure: (mine) =>
      median(
        mine.map((s) =>
          share(
            CORE_SECTION_IDS.filter((c) => s.steps.some((x) => x.sectionId === c)).length,
            CORE_SECTION_IDS.length,
          ),
        ),
      ),
  },
  {
    id: "depth",
    label: "Depth",
    note: "How many steps a typical meeting took through the presentation.",
    measure: (mine) => median(mine.map((s) => s.steps.length)),
  },
  {
    id: "units",
    label: "Units",
    note: "How many apartments a typical meeting opened.",
    measure: (mine) => median(mine.map((s) => s.units.length)),
  },
  {
    id: "compare",
    label: "Compare",
    note: "How often a meeting used the side-by-side comparison.",
    measure: (mine) =>
      share(mine.filter((s) => s.steps.some((x) => x.sectionId === "compare")).length, mine.length),
  },
  {
    id: "returns",
    label: "Returns",
    note: "How often a meeting went back to a part it had already shown.",
    measure: (mine) =>
      share(mine.filter((s) => s.steps.some((x) => x.isReturn)).length, mine.length),
  },
  {
    id: "places",
    label: "Places",
    note: "How many named places a typical meeting stopped at.",
    measure: (mine) => median(mine.map((s) => s.places.length)),
  },
];

/** "A, B and C": the readings are English sentences, whatever locale formats their figures. */
const AND = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

/*
 * PER-AGENT IDENTITY, NOT STATUS, AND ONE COLOUR PER PERSON.
 *
 * The kit's six agent hues (`--d-series-*`, chosen clear of the verdict
 * colours), by seat order: the order `presentersIn` returns people in, never
 * the period's workload, so a person keeps one colour on every chart that
 * draws people. The four-step ramp this replaces gave the fifth agent the
 * first one's colour.
 */
// ponytail: colours wrap after six agents, and an agent with no meeting in the period shifts the colours of everyone after them; key the colour on the roster seat if a project grows past six presenters.
function seatTone(seat: number): string {
  return `var(--d-series-${seatSeries(seat)})`;
}

export function buildAgentCharts(
  sessions: readonly ShowroomSession[],
  at: ProjectAddress,
  locale: string,
  language: Language,
): AgentCharts {
  const raw = presentersIn(sessions, language).flatMap((a) => {
    const mine = sessions.filter((s) => s.agentId === a.id);
    if (mine.length === 0) return [];
    return [
      {
        id: a.id,
        label: a.name,
        meetings: mine.length,
        /*
         * The floor is on the verdict. A radar shape scaled against the
         * strongest colleague is a comparison, and a median in the workload
         * list is the figure the agent page returns as `insufficient` below
         * the floor; both used to be drawn from four meetings.
         */
        belowMinimum: mine.length < AGENT_MIN_SAMPLE,
        values: RADAR_AXES.map((axis) => axis.measure(mine)),
      },
    ];
  });

  /*
   * Each axis is normalised against the strongest agent on it.
   *
   * Without that, "median units opened" at 4 and "share using Compare" at 0.6
   * would be plotted on the same 0–1 radius and the shape would be nonsense.
   * The axis note says what each one is, because a normalised radar with no
   * note is a decoration.
   */
  const peaks = RADAR_AXES.map((_, i) => Math.max(...raw.map((r) => r.values[i] ?? 0), 0.0001));

  const profiles = raw.map((r, i) => {
    const values = r.values.map((v, axis) => v / (peaks[axis] ?? 1));
    /*
     * One number, one place. Above the floor the label carries the count
     * beside the shape. Below it the note carries the count — "19 meetings
     * in this period, 1 short of the 20…" — so the label is the name alone,
     * or the card read "19 meetings — 19 meetings in this period".
     */
    const label = r.belowMinimum
      ? r.label
      : `${r.label} · ${meetings(r.meetings, locale, language)}`;
    return {
      id: r.id,
      label,
      tone: seatTone(i),
      values,
      belowMinimum: r.belowMinimum,
      note: r.belowMinimum ? suppressionNoteFor(r.meetings, locale, "sentence", language) : null,
      reading: r.belowMinimum
        ? null
        : `${label}: ${AND.format(RADAR_AXES.map((axis, a) => `${axis.label} ${percent(values[a] ?? 0, locale)}`))} of the strongest presenter in the period on each, drawn or not.`,
    };
  });
  const notDrawn = profiles.filter((p) => p.belowMinimum).map((p) => p.label);
  const floor = count(AGENT_MIN_SAMPLE, locale);

  const radar: AgentRadar = {
    axes: RADAR_AXES.map((a) => a.label),
    axisNotes: RADAR_AXES.map((a) => a.note),
    profiles,
    summary: [
      ...profiles.flatMap((p) => (p.reading === null ? [] : [p.reading])),
      ...(profiles.some((p) => !p.belowMinimum)
        ? []
        : [`No agent reached ${floor} meetings in this period, so no shape is drawn.`]),
      ...(notDrawn.length === 0
        ? []
        : [`Not drawn, under ${floor} meetings: ${AND.format(notDrawn)}.`]),
    ].join(" "),
  };

  /*
   * Ordered by how many presentations each agent gave — not by how they ended.
   *
   * An ordered list is read as a ranking whatever the header says, so the thing
   * it is ordered by has to be one that can be ranked without implying a verdict
   * on a person. Volume is workload. Outcome rate is not on this list at all;
   * it is on the rings, where every agent is drawn to the same scale and none
   * is above another (ADR-0023).
   */
  const ranked: RankedRow[] = raw
    .map((r) => {
      const mine = sessions.filter((s) => s.agentId === r.id);
      const timed = mine.filter((s) => !s.timingUnavailable).map((s) => s.durationSeconds);
      return {
        id: r.id,
        label: r.label,
        /* The slot is one line wide: the short form, "8 of 20 meetings". The sentence stands on the card. */
        sub: r.belowMinimum
          ? suppressionNoteFor(r.meetings, locale, "short", language)
          : timed.length === 0
            ? "no timed session"
            : `median ${duration(median(timed), language)}`,
        value: mine.length,
        display: count(mine.length, locale),
        href: agentDetailHref(at, r.id),
      };
    })
    .sort((a, b) => b.value - a.value);

  return { radar, ranked, featureUsage: buildFeatureUsage(sessions, locale, language) };
}

/* --- which parts of the showroom an agent uses ------------------------------------- */

/*
 * Ten ways of using the showroom, in the order a reader meets them: the seven
 * the current build can answer, then the three it cannot.
 *
 * A measured axis is the part of an agent's meetings that used the tool at
 * least once, read from fields every session already carries. An axis the
 * build cannot answer carries what is missing and why, in the words a KPI
 * group with nothing to measure uses — and no value at all. A session that
 * happens to hold something shaped like it (a Surroundings place the build
 * marks `requires_ue5_v2_event`, a demonstration filter) is not read: that
 * would be inventing the measurement the axis says does not exist.
 */
type FeatureAxis = {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly used: ((s: ShowroomSession) => boolean) | null;
  /** Coaching's row name (ADR-0057): the part as something a meeting did. */
  readonly plain: string;
  /** The same in the middle of a sentence: "They differ most in comparing two apartments…". */
  readonly doing: string;
  readonly missing: string | null;
};

const FEATURE_AXES: readonly FeatureAxis[] = [
  {
    id: "locating",
    label: "Locating",
    note: "How many of their meetings stopped on a named place in Amenities.",
    used: (s) => s.places.some((p) => p.section === "amenities"),
    plain: "Stop at a named place in Amenities",
    doing: "stopping at a named place in Amenities",
    missing: null,
  },
  {
    id: "comparing",
    label: "Comparing",
    note: "How many of their meetings put one apartment beside another in Compare. How long the comparison stayed open is not recorded. The radar's Compare counts a meeting that reached the Compare section at all.",
    used: (s) => s.units.some((u) => u.comparedWith.length > 0),
    plain: "Compare two apartments side by side",
    doing: "comparing two apartments side by side",
    missing: null,
  },
  {
    id: "shortlisting",
    label: "Shortlisting",
    note: "How many of their meetings marked an apartment as a favourite.",
    used: (s) => s.units.some((u) => u.favourited),
    plain: "Mark an apartment as a favourite",
    doing: "marking an apartment as a favourite",
    missing: null,
  },
  {
    id: "capturing",
    label: "Capturing",
    note: "How many of their meetings took a screenshot of an apartment.",
    used: (s) => s.units.some((u) => u.screenshots > 0),
    plain: "Take a screenshot of an apartment",
    doing: "taking a screenshot of an apartment",
    missing: null,
  },
  {
    id: "slicing",
    label: "Slicing",
    note: "How many of their meetings opened an apartment's floor cut.",
    used: (s) => s.units.some((u) => u.floorCutViews > 0),
    plain: "Open an apartment's floor cut",
    doing: "opening an apartment's floor cut",
    missing: null,
  },
  {
    id: "reading",
    label: "Reading",
    note: "How many of their meetings opened an apartment's PDF.",
    used: (s) => s.units.some((u) => u.pdfOpened),
    plain: "Open an apartment's PDF",
    doing: "opening an apartment's PDF",
    missing: null,
  },
  {
    id: "sharing",
    label: "Sharing",
    note: "How many of their meetings shared an apartment.",
    used: (s) => s.units.some((u) => u.shared),
    plain: "Share an apartment",
    doing: "sharing an apartment",
    missing: null,
  },
  {
    id: "exploring",
    label: "Exploring",
    note: "How many of their meetings stopped on a named place in Surroundings.",
    used: null,
    plain: "Stop at a named place in Surroundings",
    doing: "stopping at a named place in Surroundings",
    missing:
      "Not measured yet. The showroom records Surroundings as a section reached, not place by place.",
  },
  {
    id: "filtering",
    label: "Filtering",
    note: "How many of their meetings filtered the apartments on show.",
    used: null,
    plain: "Filter the apartments on show",
    doing: "filtering the apartments on show",
    missing: "Not measured yet. The showroom does not record filtering.",
  },
  {
    id: "walking",
    label: "Walking",
    note: "How many of their meetings walked the site in spaceman mode.",
    used: null,
    plain: "Walk the site in spaceman mode",
    doing: "walking the site in spaceman mode",
    missing: "Not measured yet. The showroom does not record spaceman mode.",
  },
];

/*
 * HOW THE AGENTS DIFFER: COACHING'S ONE QUESTION (the owner, 2026-10-22, ADR-0057).
 *
 * Coaching drew two lenses beside three lists of sentences, and the owner
 * could not tell what the panel wanted to show. One question now, on one
 * measure that needs no scaling against a colleague: the share of each drawn
 * agent's own meetings that used a part of the showroom. The rows run from the
 * widest gap between agents to the narrowest; the three widest that have a gap
 * name who sits at each end, with the meetings each figure is of; the widest is
 * the headline. Below two drawn there is no gap to name: no row is drawn, and
 * the headline says why. A description at the stated sample sizes, never a
 * cause or a rank.
 */

/*
 * Two marks closer than this share of the scale take separate lanes. A dot is
 * 14px; on a 360 phone the track is about 210px, so 7 points is a dot's width.
 * ponytail: one gap for every width, so a desktop row stacks dots that would
 * have fitted side by side; a gap per width is the upgrade if that reads badly.
 */
const LANE_GAP = 0.07;

/** Each share's lane, in the shares' order: the lowest lane whose last mark is a gap away. */
export function markLanes(shares: readonly number[]): number[] {
  const last: number[] = [];
  const lanes = shares.map(() => 0);
  /* Low to high; a stable sort keeps a tie in seat order, the first on the line. */
  for (const k of [...shares.keys()].sort((a, b) => (shares[a] ?? 0) - (shares[b] ?? 0))) {
    const share = shares[k] ?? 0;
    const free = last.findIndex((at) => share - at >= LANE_GAP - 1e-9);
    const lane = free === -1 ? last.length : free;
    last[lane] = share;
    lanes[k] = lane;
  }
  return lanes;
}

function comparePresenters(
  drawn: readonly FeatureUsageProfile[],
  measured: readonly { readonly axis: FeatureAxis; readonly i: number }[],
  locale: string,
  language: Language,
): PresenterComparison {
  const floor = count(AGENT_MIN_SAMPLE, locale);
  const rows = measured
    .map(({ axis, i }) => {
      const marks = drawn.map((p) => {
        const value = p.values[i] ?? 0;
        return { agentId: p.id, share: value, display: percent(value, locale) };
      });
      const values = marks.map((m) => m.share);
      const high = Math.max(...values);
      const low = Math.min(...values);
      return { axis, marks, high, low, spread: values.length === 0 ? 0 : high - low };
    })
    /* A stable sort: a tie keeps the parts' own order. */
    .sort((a, b) => b.spread - a.spread);

  /* Everyone at an end, in seat order; the noun goes with the last count: "39 and 25 meetings". */
  const end = (row: (typeof rows)[number], value: number) => {
    const at = drawn.filter((_, k) => row.marks[k]?.share === value);
    return {
      agentIds: at.map((p) => p.id),
      names: AND.format(at.map((p) => p.label)),
      share: percent(value, locale),
      of: `of ${AND.format(at.map((p, k) => (k === at.length - 1 ? meetings(p.meetings, locale, language) : count(p.meetings, locale))))}`,
    };
  };
  const shaped = rows.map((row, k) => {
    const lanes = markLanes(row.marks.map((m) => m.share));
    return {
      id: row.axis.id,
      label: row.axis.plain,
      marks: row.marks.map((m, j) => ({ ...m, lane: lanes[j] ?? 0 })),
      lanes: Math.max(0, ...lanes) + 1,
      ends: k < 3 && row.spread > 0 ? { high: end(row, row.high), low: end(row, row.low) } : null,
    };
  });

  const [only] = drawn;
  const widest = shaped[0]?.ends;
  const doing = rows[0]?.axis.doing ?? "";
  return {
    headline:
      only === undefined
        ? `No agent reached ${floor} meetings in this period, so nobody is compared.`
        : drawn.length === 1
          ? `Only ${only.label} reached ${floor} meetings in this period, so no two agents are compared.`
          : widest == null
            ? `The ${count(drawn.length, locale)} agents drawn used every part of the showroom in the same share of their meetings.`
            : `They differ most in ${doing}: ${widest.high.names} did it in ${widest.high.share} ${widest.high.of}, ${widest.low.names} in ${widest.low.share} ${widest.low.of}.`,
    /* One agent alone is a profile, not a comparison: their page draws it. */
    rows: drawn.length < 2 ? [] : shaped,
    method: [
      "Each row is one part of the showroom; each dot is an agent, at the share of their own meetings that used it at least once.",
      "The rows run from the widest gap between agents to the narrowest.",
      `Only agents with ${floor} meetings or more in the period are drawn; the others are named under the chart.`,
      `Not measured yet, so not drawn: ${AND.format(FEATURE_AXES.filter((a) => a.used === null).map((a) => a.doing))}.`,
      "A different way of presenting, not a better one.",
      ASSOCIATION_DISCLAIMER,
    ].join(" "),
  };
}

export function buildFeatureUsage(
  sessions: readonly ShowroomSession[],
  locale: string,
  language: Language,
): FeatureUsage {
  const profiles = presentersIn(sessions, language)
    .filter((agent) => sessions.some((s) => s.agentId === agent.id))
    .map((agent, seat) => {
      const mine = sessions.filter((s) => s.agentId === agent.id);
      const belowMinimum = mine.length < AGENT_MIN_SAMPLE;
      return {
        id: agent.id,
        label: agent.name,
        /* The seat is counted over the same presenters the radar counts, so the colours match. */
        tone: seatTone(seat),
        meetings: mine.length,
        values: FEATURE_AXES.map((axis) =>
          axis.used === null ? null : share(mine.filter(axis.used).length, mine.length),
        ),
        belowMinimum,
        note: belowMinimum ? suppressionNoteFor(mine.length, locale, "sentence", language) : null,
      };
    });
  const drawn = profiles.filter((p) => !p.belowMinimum);
  const notDrawn = profiles.filter((p) => p.belowMinimum).map((p) => p.label);
  const floor = count(AGENT_MIN_SAMPLE, locale);
  const measured = FEATURE_AXES.flatMap((axis, i) => (axis.used === null ? [] : [{ axis, i }]));
  /* The measured axes only: an axis the build cannot answer is never ranked or set beside anyone. */
  const comparison = comparePresenters(drawn, measured, locale, language);
  const [only] = drawn;
  return {
    axes: FEATURE_AXES.map(({ id, label, note, missing }) => ({ id, label, note, missing })),
    profiles,
    /* The chart in the rows' own words and order: what a sighted reader sees, heard. */
    summary: [
      only === undefined
        ? `No agent reached ${floor} meetings in this period, so nobody is drawn.`
        : comparison.rows.length === 0
          ? `Only ${only.label} reached ${floor} meetings in this period, so no chart is drawn.`
          : `${count(drawn.length, locale)} agents drawn, each at the share of their own meetings that used a part of the showroom at least once, the widest gap first.`,
      ...(comparison.rows.length === 0 ? [] : drawn).map(
        (p) =>
          `${p.label} · ${meetings(p.meetings, locale, language)}: ${AND.format(comparison.rows.map((r) => `${r.label} ${r.marks.find((m) => m.agentId === p.id)?.display ?? ""}`))}.`,
      ),
      `Not measured yet: ${AND.format(FEATURE_AXES.filter((a) => a.used === null).map((a) => a.doing))}.`,
      ...(notDrawn.length === 0
        ? []
        : [`Not drawn, under ${floor} meetings: ${AND.format(notDrawn)}.`]),
    ].join(" "),
    comparison,
  };
}

/* --- ordered lists -------------------------------------------------------------- */

export function buildLongestMeetings(
  sessions: readonly ShowroomSession[],
  at: ProjectAddress,
  locale: string,
  timeZone: string,
  language: Language,
): RankedRow[] {
  return [...sessions]
    .filter((s) => !s.timingUnavailable)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 8)
    .map((s) => ({
      id: s.meetingId,
      label: dayLabel(s.startedAt, locale, timeZone),
      sub: `${presenterName(s.projectId, s.agentId, language)} · ${s.steps.length} steps · ${OUTCOME_LABELS[s.outcome]}`,
      value: s.durationSeconds,
      display: duration(s.durationSeconds, language),
      href: replayHref(at, s.meetingId),
      agentId: s.agentId,
    }));
}

/* --- composition over months ------------------------------------------------------ */

/**
 * Kept identical to `OUTCOME_TONE` in `apps/web/src/showroom/charts.tsx` on
 * purpose -- both name the same six `--outcome-*` custom properties
 * (`packages/ui/src/iris.css`) rather than each declaring their own
 * `color-mix()`, which is what let the two drift apart before. `skipped` is
 * the unrecorded grey, which a chart draws as a hatch, never as a rung.
 */
const OUTCOME_COLOURS: Record<MeetingOutcome, string> = {
  purchase: "var(--outcome-purchase)",
  reservation: "var(--outcome-reservation)",
  interested: "var(--outcome-interested)",
  follow_up_needed: "var(--outcome-follow-up)",
  presentation_only: "var(--outcome-presentation-only)",
  not_interested: "var(--outcome-not-interested)",
  skipped: "var(--outcome-unrecorded)",
};

export function buildComposition(
  sessions: readonly ShowroomSession[],
  locale: string,
  timeZone: string,
  /** The period's slice (`sliceSpan`); without one, every month is taken as whole. */
  span: { readonly from: number; readonly to: number } = { from: -Infinity, to: Infinity },
  language: Language = "en",
): OutcomeComposition {
  const months = new Map<string, ShowroomSession[]>();
  for (const s of sessions) {
    // The office's month: a meeting late on 31 July is a July meeting there.
    const key = monthKeyIn(s.startedAt, timeZone);
    months.set(key, [...(months.get(key) ?? []), s]);
  }

  const order: MeetingOutcome[] = [
    "purchase",
    "reservation",
    "interested",
    "follow_up_needed",
    "presentation_only",
    "not_interested",
    "skipped",
  ];

  return {
    columns: [...months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, xs]) => {
        const at = xs[0]?.startedAt ?? `${key}-15T12:00:00.000Z`;
        /*
         * A month the period cuts says which of its days it holds. August on
         * the 24th stood beside a whole July as "Aug", and its shorter column
         * read as a falling month: a part against a whole, the comparison the
         * weekly line below no longer draws either.
         */
        const start = startOfMonthIn(Date.parse(at), timeZone).getTime();
        const end = startOfMonthIn(Date.parse(at), timeZone, 1).getTime() - 1;
        const first = Math.max(start, span.from);
        const last = Math.min(end, span.to);
        const month = monthLabel(at, locale, timeZone);
        return {
          label:
            first === start && last === end
              ? month
              : `${month} ${String(zoneParts(first, timeZone).day)}–${String(zoneParts(last, timeZone).day)}`,
          total: xs.length,
          parts: Object.fromEntries(
            order.map((o) => [o, xs.filter((s) => s.outcome === o).length]),
          ),
          figure: progressedFigure(xs, locale, language),
        };
      }),
    keys: order.map((o) => ({ id: o, label: OUTCOME_LABELS[o], colour: OUTCOME_COLOURS[o] })),
  };
}

/* --- meetings per week, with the moment something changed ------------------------ */

export function buildTrend(
  sessions: readonly ShowroomSession[],
  locale: string,
  timeZone: string,
  /** The period's slice (`sliceSpan`); without one, every week the meetings fall in is drawn. */
  span: { readonly from: number; readonly to: number } = { from: -Infinity, to: Infinity },
): TrendSeries {
  /*
   * Weeks start on the project's Monday, at its own midnight. They used to
   * be epoch weeks — `floor(ms / 7 days)`, which begin on a Thursday in UTC —
   * so every point was labelled with a Thursday and "the week" ran Thursday
   * to Wednesday, which no sales office counts.
   *
   * A week with no meetings is drawn at zero rather than left out. Leaving it
   * out put two weeks with a quiet fortnight between them side by side, and
   * the annotation below then called that gap a week-on-week change. Zero
   * meetings in a week is a real reading, not an absent one.
   */
  const weeks = new Map<number, number>();
  for (const s of sessions) {
    const week = startOfWeekIn(Date.parse(s.startedAt), timeZone).getTime();
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }

  const starts = [...weeks.keys()].sort((a, b) => a - b);
  const first = starts[0];
  const last = starts[starts.length - 1];
  const points: { label: string; value: number }[] = [];
  if (first !== undefined && last !== undefined) {
    const day = 24 * 60 * 60 * 1000;
    for (let week = first; week <= last;) {
      // Seven days on, re-anchored to Monday midnight so a clock change inside
      // the week cannot drift the next start by an hour.
      const next = startOfWeekIn(week + 7 * day + 12 * 60 * 60 * 1000, timeZone).getTime();
      /*
       * Only a week the period holds whole is a point. The week still running
       * — one day old on a Monday — was drawn as a week and marked "±9 against
       * the week before", and a quarter that ends on a Wednesday ended on a
       * two-day week marked the same way: part-weeks against whole ones, the
       * comparison Sales Flow says it never makes.
       */
      if (week >= span.from && next - 1 <= span.to) {
        points.push({
          label: dayLabel(new Date(week), locale, timeZone),
          value: weeks.get(week) ?? 0,
        });
      }
      week = next;
    }
  }

  /*
   * The annotation is the largest week-on-week change.
   *
   * A line without one is a shape; a line with one points at a date somebody
   * can go and ask about. It is described as a change, never as a cause.
   */
  let annotationIndex = -1;
  let biggest = 0;
  for (let i = 1; i < points.length; i += 1) {
    const delta = (points[i]?.value ?? 0) - (points[i - 1]?.value ?? 0);
    if (Math.abs(delta) > Math.abs(biggest)) {
      biggest = delta;
      annotationIndex = i;
    }
  }

  return {
    points,
    /* The change with its sign: "+7" or "−7", never "±7", which says neither. */
    annotation:
      annotationIndex < 1 || Math.abs(biggest) < 3
        ? null
        : {
            index: annotationIndex,
            text: `${biggest > 0 ? "+" : "−"}${Math.abs(biggest)} against the week before`,
          },
    valueLabel: "Meetings per week",
  };
}

/* --- sold against the plan (ADR-0055) ------------------------------------------------ */

/** A month, in days: the calendar's average, so a pace and a deadline count months alike. */
const MONTH_DAYS = 365.25 / 12;
/** How far back the pace looks. */
const PACE_DAYS = 90;

/** "2026-08-24": the project's calendar day at an instant. */
function isoDayIn(at: Date, timeZone: string): string {
  const p = zoneParts(at, timeZone);
  return `${String(p.year)}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Whole days from one calendar date to another. */
function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** A calendar date some days on. */
function isoDayAfter(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "12 Jan 2026" for a calendar date, read as the date it is (not as an instant in a zone). */
function calendarDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** "Apr 2027" for a calendar date. */
function calendarMonth(day: string, locale: string): string {
  return monthYearLabel(`${day}T12:00:00Z`, locale, "UTC");
}

/** One decimal, in the project's locale: "4.7". */
function oneDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

const flats = (n: number, locale: string) => `${count(n, locale)} ${n === 1 ? "flat" : "flats"}`;
const sales = (n: number, locale: string) => `${count(n, locale)} ${n === 1 ? "sale" : "sales"}`;

/** "10 months left", "12 days left": the time to a date still ahead. */
function timeLeft(days: number, locale: string): string {
  const months = Math.round(days / MONTH_DAYS);
  if (months >= 1) return `${count(months, locale)} ${months === 1 ? "month" : "months"} left`;
  return `${count(days, locale)} ${days === 1 ? "day" : "days"} left`;
}

const STOCK_LABELS = { sold: "Sold", reserved: "Reserved", available: "Available" } as const;

/**
 * WHERE THE PROJECT STANDS AGAINST ITS OWN PLAN, IN THREE ANSWERS.
 *
 * The owner, recording the Shark demo (2026-10-22): the block must say how many
 * flats there are, how many are sold — both read from the CRM — and how long
 * the sales run, against a date by which everything must be sold.
 *
 *   - **The stock.** Every flat for sale in the catalogue the project's
 *     connector delivers. Which are sold and reserved is the CRM's deal stage
 *     for that flat now: a purchase deal makes it sold, a reservation deal and
 *     no purchase reserved; available is every other flat. The catalogue's own
 *     status is not read (review, 2026-10-22: it disagreed with the CRM). A
 *     deal naming no catalogued flat is counted in words. Without a CRM, or a
 *     CRM that delivers no deals, the split is unavailable, never zero.
 *   - **The window.** The project's configured start and sell-out-by dates,
 *     and how much of that time has gone. None configured: none is drawn.
 *     "By" includes the day itself.
 *   - **The pace.** Flats whose first purchase the CRM dates in the last 90
 *     days, a month; the pace the unsold flats need to be gone by the date;
 *     and when they would be gone at the current pace. Below the floor no pace
 *     is stated and no verdict given; before selling starts, no pace at all.
 *
 * Every figure is computed here and formatted here; the page draws them.
 */
export function buildSalesPlan(input: {
  /** Every flat for sale in the catalogue, by code. */
  readonly units: readonly { readonly code: string }[];
  readonly deals: DeliveredDeals | null;
  readonly crmConnected: boolean;
  readonly window: SalesWindow | null;
  readonly today: Date;
  readonly locale: string;
  readonly timeZone: string;
}): SalesPlan {
  const { units, deals, crmConnected, window, today, locale, timeZone } = input;
  const todayIso = isoDayIn(today, timeZone);
  const minimum = SALES_PACE_MIN_SAMPLE;

  /* --- the stock: the CRM's deal stage for each catalogued flat ---------------- */

  const codes = new Set(units.map((u) => u.code));
  /** Each sold flat's first dated purchase; null where the CRM dates none of its purchases. */
  const firstSale = new Map<string, number | null>();
  const held = new Set<string>();
  let unmatched = 0;
  for (const deal of deals?.deals ?? []) {
    if (deal.stage !== "purchase" && deal.stage !== "reservation") continue;
    if (deal.unitCode === null || !codes.has(deal.unitCode)) {
      unmatched += 1;
      continue;
    }
    if (deal.stage === "reservation") {
      held.add(deal.unitCode);
      continue;
    }
    const at = Date.parse(deal.stageEnteredAt ?? deals?.stageObservedAt?.[deal.externalId] ?? "");
    const t = Number.isNaN(at) ? null : at;
    const was = firstSale.get(deal.unitCode) ?? null;
    firstSale.set(deal.unitCode, was === null ? t : t === null ? was : Math.min(was, t));
  }

  const total = codes.size === 0 ? null : codes.size;
  const known = total !== null && crmConnected && deals !== null;
  const sold = firstSale.size;
  const reserved = [...held].filter((code) => !firstSale.has(code)).length;
  const unsold = total === null ? 0 : total - sold;

  const parts: StockPart[] =
    total === null || !known
      ? []
      : (
          [
            ["sold", sold],
            ["reserved", reserved],
            ["available", total - sold - reserved],
          ] as const
        ).map(([id, n]) => ({ id, label: STOCK_LABELS[id], count: n, share: n / total }));

  const stockNote =
    total === null
      ? "Flats are counted from the project's unit catalogue."
      : !crmConnected
        ? "Sold, reserved and available flats are read from the CRM."
        : deals === null
          ? "The CRM delivers no deals for this project, so sold and reserved flats are unavailable."
          : unmatched === 0
            ? null
            : `${count(unmatched, locale)} ${unmatched === 1 ? "reservation or purchase" : "reservations or purchases"} in the CRM ${unmatched === 1 ? "names" : "name"} no flat in the catalogue, not counted.`;

  /* --- the window ------------------------------------------------------------ */

  const started = window === null || window.startsOn <= todayIso;
  /* "Sell out by 30 June" includes 30 June: the date has passed only from the day after. */
  const passed = window !== null && window.sellOutBy < todayIso;
  /* Whole days to the date, the last day counting as one. */
  const daysLeft = window === null ? 0 : Math.max(1, daysFrom(todayIso, window.sellOutBy));
  const windowModel =
    window === null
      ? null
      : (() => {
          const span = daysFrom(window.startsOn, window.sellOutBy);
          const gone = daysFrom(window.startsOn, todayIso);
          return {
            startsOn: window.startsOn,
            sellOutBy: window.sellOutBy,
            startsOnDisplay: calendarDay(window.startsOn, locale),
            sellOutByDisplay: calendarDay(window.sellOutBy, locale),
            elapsed: span <= 0 ? 1 : Math.min(1, Math.max(0, gone / span)),
            remainingDisplay: !started
              ? `Starts in ${timeLeft(-gone, locale).replace(/ left$/, "")}`
              : passed
                ? "Past the date"
                : timeLeft(daysLeft, locale),
          };
        })();

  /* --- the pace: always the trailing 90 days ---------------------------------- */

  const from = today.getTime() - PACE_DAYS * DAY_MS;
  let paceSales = 0;
  let undated = 0;
  for (const t of firstSale.values()) {
    if (t === null) undated += 1;
    else if (t > from && t <= today.getTime()) paceSales += 1;
  }
  const enough = paceSales >= minimum;
  const perMonth = (paceSales / PACE_DAYS) * MONTH_DAYS;
  const neededPerMonth =
    window === null || passed || !started || unsold === 0 ? null : unsold / (daysLeft / MONTH_DAYS);
  const sellingDisplay = enough ? oneDecimal(perMonth, locale) : null;
  const neededDisplay = neededPerMonth === null ? null : oneDecimal(neededPerMonth, locale);
  const sellsOutDisplay =
    enough && unsold > 0
      ? calendarMonth(isoDayAfter(todayIso, Math.round((unsold * PACE_DAYS) / paceSales)), locale)
      : null;

  /* Before selling starts there is no pace to state, whatever the CRM dated earlier. */
  const pace =
    !known || !started
      ? null
      : {
          sales: paceSales,
          days: PACE_DAYS,
          minimum,
          sellingDisplay,
          neededDisplay,
          sellsOutDisplay,
          basis: `${sales(paceSales, locale)} dated in the last ${count(PACE_DAYS, locale)} days${
            undated === 0 ? "" : ` · ${sales(undated, locale)} with no date, not counted`
          }`,
        };

  /* --- the one line ---------------------------------------------------------- */

  const [verdict, verdictText]: readonly [PlanVerdict, string] =
    total === null
      ? ["unavailable", "No unit catalogue has reached this project"]
      : !crmConnected
        ? ["unavailable", "Unavailable: the CRM is not connected"]
        : deals === null
          ? ["unavailable", "Unavailable: the CRM delivers no deals"]
          : unsold === 0
            ? ["sold_out", "Sold out"]
            : windowModel === null
              ? ["no_date", "No sell-out date set"]
              : !started
                ? ["not_started", `Selling starts on ${windowModel.startsOnDisplay}`]
                : passed
                  ? ["date_passed", `Past the sell-out date, ${flats(unsold, locale)} unsold`]
                  : !enough
                    ? [
                        "too_few_sales",
                        `Too few dated sales to judge the pace (${count(paceSales, locale)} of ${count(minimum, locale)})`,
                      ]
                    : Math.round(perMonth * 10) >= Math.round((neededPerMonth ?? 0) * 10)
                      ? ["on_pace", "On pace"]
                      : ["behind", "Behind"];

  const definition =
    "Flats: every flat for sale in the project's catalogue. Sold: a flat the CRM has a purchase deal for. Reserved: a reservation deal and no purchase; a reservation is not a sale. Available: every other flat. " +
    `Selling: flats whose first purchase the CRM dates in the last ${count(PACE_DAYS, locale)} days, a month. ` +
    "Needed: the flats not yet sold, over the months left to the sell-out date. On pace when selling is at least what is needed; " +
    `below ${count(minimum, locale)} dated sales no pace is stated. The sales window is the project's own, set by the developer's company admin.`;

  const summary = [
    total === null
      ? stockNote
      : parts.length === 0
        ? `${flats(total, locale)}. ${stockNote ?? ""}`
        : `${flats(total, locale)}: ${parts.map((p) => `${count(p.count, locale)} ${p.label.toLowerCase()}`).join(", ")}.${stockNote === null ? "" : ` ${stockNote}`}`,
    windowModel === null
      ? "No sell-out date set."
      : `Sales window ${windowModel.startsOnDisplay} to ${windowModel.sellOutByDisplay}, ${windowModel.remainingDisplay.toLowerCase()}.`,
    pace === null
      ? null
      : `${pace.basis}${sellingDisplay === null ? "" : `: selling ${sellingDisplay} a month`}${
          neededDisplay === null ? "" : `, ${neededDisplay} a month needed`
        }.`,
    `${verdictText}${sellsOutDisplay === null ? "" : `; at this pace the project sells out in ${sellsOutDisplay}`}.`,
  ]
    .filter((s): s is string => s !== null)
    .join(" ");

  return {
    total,
    parts,
    stockNote,
    window: windowModel,
    pace,
    verdict,
    verdictText,
    definition,
    summary,
  };
}

/* --- where journeys go, and where they stop ---------------------------------------- */

export function buildJourney(
  sessions: readonly ShowroomSession[],
  locale: string,
  crmConnected: boolean,
): JourneyFlowModel {
  const opened = sessions.filter((s) => s.units.length > 0);
  const shortlisted = opened.filter((s) => s.units.some((u) => u.favourited));
  /*
   * "Progressed" is a recorded outcome, and a project records one only through
   * its CRM: without one the stage is not drawn at all rather than drawn at
   * nought. With one, a shortlisted meeting whose outcome was not recorded is
   * not known to have stopped, so it is counted in words, not as a drop.
   */
  const progressed = crmConnected ? shortlisted.filter((s) => hasProgressed(s.outcome)) : null;
  const unrecorded = crmConnected
    ? shortlisted.filter((s) => outcomeIsUnknown(s.outcome)).length
    : 0;
  const stages = [
    {
      id: "all",
      label: "Presented",
      phrase: sessions.length === 1 ? "presentation" : "presentations",
      count: sessions.length,
    },
    { id: "opened", label: "Opened a unit", phrase: "opened a flat", count: opened.length },
    {
      id: "shortlisted",
      label: "Shortlisted one",
      phrase: "shortlisted a flat",
      count: shortlisted.length,
    },
    ...(progressed === null
      ? []
      : [
          {
            id: "progressed",
            label: "Progressed",
            phrase: "progressed",
            count: progressed.length,
          },
        ]),
  ];
  const end = stages[stages.length - 1]?.count ?? 0;
  const one = unrecorded === 1;
  const recorded = shortlisted.length - unrecorded;

  return {
    stages,
    links: stages.slice(1).map((to, i) => ({
      from: stages[i]?.id ?? "",
      to: to.id,
      count: to.count,
    })),
    droppedLabel: `${count(sessions.length - end - unrecorded, locale)} did not reach the end of this path${
      unrecorded === 0
        ? ""
        : `, and ${count(unrecorded, locale)} ${one ? "has" : "have"} no recorded outcome`
    }`,
    note: "Each band is what survived the previous step. A meeting that stopped is not a failure — most presentations are not meant to close on the day.",
    funnel: journeyFunnel(stages, locale, {
      merged: crmConnected
        ? null
        : `"Progressed" is not drawn: no CRM is connected to this project, so no meeting carries an outcome.`,
      /*
       * An empty "Progressed" with outcomes unrecorded is not a stage nobody
       * reached: what is known is that no recorded outcome is a progression.
       */
      lastEmpty:
        unrecorded === 0
          ? null
          : recorded === 0
            ? `"Progressed" is not drawn: none of the ${count(shortlisted.length, locale)} that shortlisted one has a recorded outcome.`
            : `"Progressed" is not drawn: none of the ${count(recorded, locale)} recorded ${recorded === 1 ? "outcome" : "outcomes"} among those that shortlisted one is a progression.`,
      of:
        unrecorded === 0
          ? null
          : `${count(unrecorded, locale)} of the ${count(shortlisted.length, locale)} that shortlisted one ${one ? "has" : "have"} no recorded outcome, so whether ${one ? "it" : "they"} progressed is not known; "Progressed" counts recorded outcomes only.`,
      notes:
        unrecorded === 0
          ? {}
          : {
              progressed: `${count(unrecorded, locale)} ${one ? "has" : "have"} no recorded outcome`,
            },
    }),
  };
}

/**
 * The same stages as one narrowing path. Every stage is a subset of the one
 * before it, so no band is wider than the band above. Every stage some meeting
 * reached is drawn, one as wide as the band above it included: "150 opened a
 * flat" says plainly what a merged stage's sentence had to explain, and the
 * owner could not read the merged path (ADR-0056). A stage no meeting reached
 * is named instead, once: every stage after it is empty too.
 */
function journeyFunnel(
  stages: readonly {
    readonly id: string;
    readonly label: string;
    readonly phrase: string;
    readonly count: number;
  }[],
  locale: string,
  more: {
    readonly merged: string | null;
    readonly of: string | null;
    /** Said instead of "No meeting reached" when only the last stage is empty and that is not known. */
    readonly lastEmpty: string | null;
    /** A step's short note, by stage id: what its count leaves out. */
    readonly notes: Readonly<Record<string, string>>;
  },
): JourneyFunnel {
  const first = stages[0];
  if (first === undefined || first.count === 0) {
    return {
      title: "How far a presentation gets",
      steps: [],
      merged: null,
      of: "No meeting was presented in this period, so there is no journey to draw.",
    };
  }
  const empty = stages.findIndex((s) => s.count === 0);
  const reached = empty === -1 ? stages : stages.slice(0, empty);
  const merged: string[] = [];
  const none = stages[empty];
  if (none !== undefined) {
    const last = empty === stages.length - 1;
    merged.push(
      last && more.lastEmpty !== null
        ? more.lastEmpty
        : `No meeting reached "${none.label}", so it ${last ? "is" : "and every stage after it are"} not drawn.`,
    );
  }
  if (more.merged !== null) merged.push(more.merged);
  const of = `Each share is out of the first band: the ${count(first.count, locale)} ${first.count === 1 ? "meeting" : "meetings"} presented in the period.`;
  return {
    title: `How far ${count(first.count, locale)} ${first.phrase} got`,
    steps: reached.map((s) => ({
      id: s.id,
      label: s.label,
      phrase: s.phrase,
      note: more.notes[s.id] ?? null,
      count: s.count,
      countDisplay: count(s.count, locale),
      share: s.count / first.count,
      shareDisplay: shareDisplay(s.count / first.count, locale),
    })),
    merged: merged.length === 0 ? null : merged.join(" "),
    of: more.of === null ? of : `${of} ${more.of}`,
  };
}

/* --- the bundles ------------------------------------------------------------------- */

/* --- every meeting by who presented it and how it ended --------------------------- */

/**
 * The bubble rule, as the owner gave it: one bubble per meeting, its size the
 * outcome recorded at its end — the further up the ladder, the larger. A
 * purchase is a deal already closed, so it is not drawn; the rule gives
 * "presentation only" and an unrecorded outcome no size, so they are counted
 * beside the lens rather than drawn.
 */
const LENS_DIAMETER: readonly (readonly [MeetingOutcome, number])[] = [
  ["reservation", 100],
  ["interested", 70],
  ["follow_up_needed", 50],
  ["not_interested", 25],
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The period's recorded meetings for the bubble lens. The agents are the
 * radar's seats, so a bubble wears the colour its presenter wears on every
 * chart; the days are every calendar day of the period in the project's own
 * zone; a month the period starts inside says how many of its days come
 * before it (`lead`), so the lens can shade them rather than stretch the rest.
 */
export function buildMeetingLens(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  span: { readonly from: number; readonly to: number },
): MeetingLens {
  const locale = context.project.locale;
  const timeZone = context.project.timeZone;
  const at = addressOf(context);
  const n = (k: number) => count(k, locale);

  const agents = presentersIn(sessions, context.language)
    .filter((p) => sessions.some((s) => s.agentId === p.id))
    .map((p) => ({ id: p.id, label: p.name, short: p.name.split(" ")[0] ?? p.name }));
  const seatOf = new Map(agents.map((a, i) => [a.id, i]));
  const outcomes = LENS_DIAMETER.map(([id, diameter]) => ({
    id,
    label: OUTCOME_LABELS[id],
    diameter,
    count: sessions.filter((s) => s.outcome === id).length,
  }));
  const sizeOf = new Map(outcomes.map((o, i) => [o.id as string, i]));

  /* Calendar days as UTC midnights of the project's own dates: a day is a date, whatever the clock. */
  const dateOf = (instant: number | string) => {
    const p = zoneParts(instant, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day);
  };
  const first = dateOf(span.from);
  const lastDay = dateOf(Math.max(span.from, span.to - 1));
  const dayCount = Math.round((lastDay - first) / DAY_MS) + 1;
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(first + i * DAY_MS);
    return { label: dayLabel(d, locale, "UTC"), weekday: weekday.format(d), date: d.getUTCDate() };
  });

  const monthShort = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const monthLong = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const months: MeetingLens["months"][number][] = [];
  for (let i = 0; i < dayCount;) {
    const d = new Date(first + i * DAY_MS);
    const length = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const held = Math.min(length - d.getUTCDate() + 1, dayCount - i);
    months.push({
      label: monthShort.format(d),
      long: monthLong.format(d),
      first: i,
      held,
      length,
      lead: d.getUTCDate() - 1,
    });
    i += held;
  }

  const sized = sessions.filter((s) => sizeOf.has(s.outcome));
  const meetings = sized.map((s) => ({
    id: s.meetingId,
    a: seatOf.get(s.agentId) ?? 0,
    d: Math.round((dateOf(s.startedAt) - first) / DAY_MS),
    o: sizeOf.get(s.outcome) ?? 0,
    t: clockLabel(s.startedAt, "en-GB", timeZone),
    u: s.units.filter((u) => u.favourited).map((u) => u.unitCode),
    href: replayHref(at, s.meetingId),
  }));

  const notDrawn = {
    purchase: sessions.filter((s) => s.outcome === "purchase").length,
    presentationOnly: sessions.filter((s) => s.outcome === "presentation_only").length,
    unrecorded: sessions.filter((s) => outcomeIsUnknown(s.outcome)).length,
  };
  const [largest] = outcomes;
  const nearest = sized
    .filter((s) => s.outcome === largest?.id)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 3)
    .map((s) => {
      const shortlisted = s.units.filter((u) => u.favourited).map((u) => u.unitCode);
      return {
        id: s.meetingId,
        label: `${dayLabel(s.startedAt, locale, timeZone)} · ${agents[seatOf.get(s.agentId) ?? 0]?.label ?? ""}`,
        value:
          shortlisted.length === 0
            ? "none shortlisted"
            : `${shortlisted[0] ?? ""}${shortlisted.length > 1 ? ` +${n(shortlisted.length - 1)}` : ""}`,
        href: replayHref(at, s.meetingId),
        agentId: s.agentId,
      };
    });

  const period = context.period.label.toLowerCase();
  const notDrawnWords = `Not drawn: ${n(notDrawn.purchase)} "${OUTCOME_LABELS.purchase}", a deal already closed; ${n(notDrawn.presentationOnly)} "${OUTCOME_LABELS.presentation_only}" and ${n(notDrawn.unrecorded)} with no outcome recorded.`;
  return {
    agents,
    outcomes,
    days,
    months,
    meetings,
    total: sessions.length,
    notDrawn,
    nearest,
    /*
     * An empty period, or one whose every outcome the rule leaves unsized, says
     * so rather than describing bubbles it does not draw. The lead stays in
     * view and the rule's detail goes behind the `i`, both short.
     */
    lead:
      sessions.length === 0
        ? "No meeting in this period, so no bubble is drawn."
        : largest === undefined || meetings.length === 0
          ? `${n(sessions.length)} meetings, ${period}, and none ended in an outcome the rule sizes, so no bubble is drawn.`
          : `${n(meetings.length)} of ${n(sessions.length)} meetings drawn, ${period}: one bubble each, coloured by presenter, sized by outcome. ${
              largest.count === 0
                ? `None ended "${largest.label}", the nearest a purchase.`
                : largest.count === 1
                  ? `The largest, the one that ended "${largest.label}", is the nearest a purchase.`
                  : `The ${n(largest.count)} largest ended "${largest.label}", the nearest a purchase.`
            }`,
    note: `${sessions.length === 0 ? "" : `${notDrawnWords} `}The sizes follow the outcome ladder, not a computed likelihood, and the outcome is the one recorded in the room.`,
    summary: `${n(sessions.length)} meetings, ${period}: ${n(meetings.length)} drawn as bubbles, ${AND.format(outcomes.map((o) => `${o.label} ${n(o.count)}`))}. By agent: ${AND.format(agents.map((a, i) => `${a.label} ${n(meetings.filter((m) => m.a === i).length)}`))}. ${notDrawnWords}`,
    stripLabel: "The period, a column per day: move the lens",
  };
}

export function buildFlowCharts(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  all: readonly ShowroomSession[],
  today: Date,
  windowId: KpiWindowId,
  deals: DeliveredDeals | null = null,
): FlowCharts {
  const locale = context.project.locale;
  const timeZone = context.project.timeZone;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const charts = buildAgentCharts(sessions, addressOf(context), locale, context.language);
  const span = sliceSpan(context, today);
  /*
   * A running slice ends at the end of today in UTC, which in Bratislava is
   * two hours into tomorrow; a month's label names the project's own days, so
   * it stops at the end of the project's today.
   */
  const monthSpan = {
    from: span.from,
    to: Math.min(span.to, endOfDayIn(today, timeZone).getTime()),
  };

  return {
    context,
    kpis: buildKpis(all, today, windowId, locale, timeZone, context.language, deals),
    activity: buildActivity(sessions, timeZone),
    composition: buildComposition(sessions, locale, timeZone, monthSpan, context.language),
    trend: buildTrend(sessions, locale, timeZone, span),
    funnel: buildBehaviourFunnel(
      sessions,
      locale,
      context.language,
      addressOf(context),
      context.period.label,
    ),
    rankedAgents: charts.ranked,
    longestMeetings: buildLongestMeetings(
      sessions,
      addressOf(context),
      locale,
      timeZone,
      context.language,
    ),
    lens: buildMeetingLens(context, sessions, monthSpan),
    evidence: evidenceRef("flow-charts", "observed_sequence", `${base}/flow`, sessions.length),
  };
}

export function buildProjectCharts(
  projectId: string,
  sessions: readonly ShowroomSession[],
  today: Date,
  locale: string,
  timeZone: string,
  crmConnected: boolean,
  window: SalesWindow | null,
  /** Delivered flats for sale whose status no surface draws (delayed, unknown): still flats to sell. */
  unplacedForSale: readonly { readonly code: string }[] = [],
): ProjectCharts {
  return {
    plan: buildSalesPlan({
      units: [...catalogueFor(projectId), ...unplacedForSale],
      deals: dealsFor(projectId),
      crmConnected,
      window,
      today,
      locale,
      timeZone,
    }),
    journey: buildJourney(sessions, locale, crmConnected),
  };
}

export { SECTION_IDS, sectionLabel, type SectionId };
