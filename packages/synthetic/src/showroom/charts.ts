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
  CoachingReading,
  FeatureUsage,
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
  ProjectCharts,
  RankedRow,
  SalesTarget,
  TrendSeries,
  ViewContext,
} from "@observer/readmodels";
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
} from "../format";
import { endOfDayIn, monthKeyIn, startOfMonthIn, startOfWeekIn, zoneParts } from "../time";
import { presenterName, presentersIn } from "./sessions";
import { AGENT_MIN_SAMPLE, getMetric } from "@observer/metrics";
import { showroomSaleCycleInputs } from "./sale-cycles";
import { meetings, progressedFigure, sliceSpan, suppressionNoteFor } from "./views3";
import { ASSOCIATION_DISCLAIMER, behaviourTest, outcomeSplit } from "./project";

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
    // The registry's own words for `flow.stage_conversion`.
    definition:
      "The share of buyers who move forward from each rung to the next, counted by when they entered it rather than when they moved.",
    figureIds: [],
    missing:
      "Not measured yet. The deal ladder counts where each deal stands, not the path it took, and the stage-to-stage figure is defined but not computed. Progress above is about meetings, not deals.",
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

  const tone = (a: number, b: number, better: "up" | "down"): "good" | "bad" | "flat" => {
    if (a === b) return "flat";
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
      delta:
        before.length === 0
          ? null
          : signedPercent((now.length - before.length) / before.length, locale),
      tone: tone(now.length, before.length, "up"),
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
      delta:
        decidedBefore.length === 0 || decided.length === 0
          ? null
          : signedPercent(progressed - progressedBefore, locale),
      tone: tone(progressed, progressedBefore, "up"),
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
        : now.length < 5
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
  return {
    id: "sale_cycle",
    label: "Sales cycle",
    measurementId: "flow.showroom_sale_cycle",
    value:
      summary.examined === 0
        ? "No sale"
        : summary.state === "ok" && summary.medianDays !== null
          ? days(summary.medianDays)
          : measured,
    qualifier:
      summary.examined === 0
        ? windowWords
        : summary.state === "ok" && summary.p80Days !== null
          ? `median · 80% within ${days(summary.p80Days)} · ${measured}`
          : `${count(minimum, locale)} measured sales needed for a median · ${windowWords}`,
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

  const busiest = Object.entries(cells).sort((a, b) => b[1] - a[1])[0];
  const perDay = WEEKDAYS.map((d) => ({
    weekday: d,
    meetings: hours.reduce((a, h) => a + (cells[`${d}|${h}`] ?? 0), 0),
  }));
  const quietest = [...perDay].sort((a, b) => a.meetings - b.meetings)[0];

  const clock = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  const peak = Math.max(0, ...day);
  const tied = day.flatMap((n, h) => (peak > 0 && n === peak ? [h] : []));

  return {
    rows: [...WEEKDAYS],
    columns: hours,
    cells,
    busiest:
      busiest === undefined
        ? null
        : {
            weekday: busiest[0].split("|")[0] ?? "",
            hour: busiest[0].split("|")[1] ?? "",
            meetings: busiest[1],
          },
    quietest: quietest ?? null,
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

/* --- what precedes a poor outcome --------------------------------------------- */

const BEHAVIOURS = [
  {
    id: "reached_surroundings",
    label: "Reached Surroundings at all",
    test: (s: ShowroomSession) => s.steps.some((x) => x.sectionId === "surroundings"),
  },
  {
    id: "opened_amenities",
    label: "Opened Amenities",
    test: (s: ShowroomSession) => s.steps.some((x) => x.sectionId === "amenities"),
  },
  {
    id: "three_units",
    label: "Opened three or more units",
    test: (s: ShowroomSession) => s.units.length >= 3,
  },
  {
    id: "shortlisted",
    label: "Shortlisted anything",
    test: (s: ShowroomSession) => s.units.some((u) => u.favourited),
  },
  {
    id: "used_compare",
    label: "Used Compare",
    test: (s: ShowroomSession) => s.steps.some((x) => x.sectionId === "compare"),
  },
  {
    id: "returned",
    label: "Returned to a section before closing",
    test: (s: ShowroomSession) => s.steps.some((x) => x.isReturn),
  },
] as const;

export function buildBehaviourFunnel(
  sessions: readonly ShowroomSession[],
  locale: string,
  language: Language,
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

  return {
    cohortLabel: `Ended "not interested" · ${meetings(cohort.length, locale, language)}`,
    steps,
    empty: null,
    comparisonLabel: `every other recorded meeting · ${count(rest.length, locale)}`,
    disclaimer:
      "Each band is the meetings that did everything above it as well, so the bands narrow. Beside each is that behaviour on its own, in this group and in every other recorded meeting. This describes what the group had in common, at the stated sample sizes. It is not evidence that any of these behaviours produced the outcome — buyers who arrive uninterested are also shown less.",
  };
}

/* --- agents across several dimensions ------------------------------------------ */

/**
 * One measure a chart of agents is drawn on, as IRIS's reading uses it: the
 * figure over any set of meetings, that figure in words beside its
 * denominator, and — where the measure is something a meeting did or did not
 * do — that test, so the project's outcomes can be split by it.
 */
interface ReadingAxis {
  readonly id: string;
  readonly label: string;
  readonly measure: (mine: readonly ShowroomSession[]) => number;
  /** "25% of 26 meetings reached Compare": `n` is the count already in words. */
  readonly say: (value: number, n: string, locale: string) => string;
  /**
   * The same figure once the sentence has said what it counts: "76% of 33",
   * "5 across 33 meetings". `n` is the count already formatted, or several
   * joined ("33 and 40") where agents tie.
   */
  readonly brief: (value: number, n: string, locale: string) => string;
  /**
   * The habit as a yes or no per meeting, worded to follow "Meetings that",
   * and only where it is one of the cohort comparison's own behaviours.
   * Otherwise why no outcome is set beside it, worded to follow the label.
   */
  readonly split: { readonly test: (s: ShowroomSession) => boolean; readonly did: string } | string;
}

/** A median as the reader sees it: whole where it is whole, one decimal where two middles split. */
function typical(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** A split taken from the cohort comparison's own named behaviour, so the two can never test different things. */
function behaviour(id: string, did: string): Exclude<ReadingAxis["split"], string> {
  const test = behaviourTest(id);
  if (test === undefined) throw new Error(`The cohort comparison has no behaviour "${id}".`);
  return { test, did };
}

/** A share's brief form, "76% of 33"; every set it is said of clears the floor, so it is never one meeting. */
function shareOf(value: number, n: string, locale: string): string {
  return `${percent(value, locale)} of ${n}`;
}

/** A typical figure's brief form, "5 across 33 meetings". */
function across(value: string, n: string): string {
  return `${value} across ${n} meetings`;
}

/** Why a median axis has no outcome beside it. */
const TYPICAL = "is a typical figure per meeting, not something a meeting did or did not do";

/*
 * The six measures, each over a set of meetings, in words for a reader who has
 * not met the metric vocabulary: "typical" where the figure is a median, "how
 * often" where it is a share.
 */
const RADAR_AXES: readonly (ReadingAxis & { readonly note: string })[] = [
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
    say: (v, n, locale) =>
      `a typical meeting reached ${percent(v, locale)} of the main parts, across ${n}`,
    brief: (v, n, locale) => across(percent(v, locale), n),
    split: TYPICAL,
  },
  {
    id: "depth",
    label: "Depth",
    note: "How many steps a typical meeting took through the presentation.",
    measure: (mine) => median(mine.map((s) => s.steps.length)),
    say: (v, n, locale) => `a typical meeting took ${typical(v, locale)} steps, across ${n}`,
    brief: (v, n, locale) => across(typical(v, locale), n),
    split: TYPICAL,
  },
  {
    id: "units",
    label: "Units",
    note: "How many apartments a typical meeting opened.",
    measure: (mine) => median(mine.map((s) => s.units.length)),
    say: (v, n, locale) => `a typical meeting opened ${typical(v, locale)} apartments, across ${n}`,
    brief: (v, n, locale) => across(typical(v, locale), n),
    split: behaviour("four_plus_units", "opened four or more apartments"),
  },
  {
    id: "compare",
    label: "Compare",
    note: "How often a meeting used the side-by-side comparison.",
    measure: (mine) =>
      share(mine.filter((s) => s.steps.some((x) => x.sectionId === "compare")).length, mine.length),
    say: (v, n, locale) => `${percent(v, locale)} of ${n} reached Compare`,
    brief: shareOf,
    split: behaviour("compare_used", "reached Compare"),
  },
  {
    id: "returns",
    label: "Returns",
    note: "How often a meeting went back to a part it had already shown.",
    measure: (mine) =>
      share(mine.filter((s) => s.steps.some((x) => x.isReturn)).length, mine.length),
    say: (v, n, locale) => `${percent(v, locale)} of ${n} went back to a part already shown`,
    brief: shareOf,
    split: behaviour("returns_before_end", "went back to a part already shown"),
  },
  {
    id: "places",
    label: "Places",
    note: "How many named places a typical meeting stopped at.",
    measure: (mine) => median(mine.map((s) => s.places.length)),
    say: (v, n, locale) =>
      `a typical meeting stopped at ${typical(v, locale)} named places, across ${n}`,
    brief: (v, n, locale) => across(typical(v, locale), n),
    split: TYPICAL,
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

/*
 * IRIS'S READING OF A CHART THAT DRAWS EVERY AGENT AT ONCE.
 *
 * The owner, on Coaching (2026-10-20): the reader learns nothing from charts
 * alone; the system should say what it sees between the agents. Three things,
 * each a description with its denominators, never a cause and never a verdict
 * on a person:
 *
 *   - where the drawn agents differ most: the widest spreads, as the chart
 *     scales them, with who sits at each end;
 *   - each drawn agent's most distinctive habit: the measure on which they
 *     stand furthest from everyone else's meetings in the period;
 *   - what meetings with that habit came to across the whole project: the
 *     cohort comparison's split (`outcomeSplit`), at both sample sizes, only
 *     for a habit that is one of its behaviours, and only where each side,
 *     and each of its own cohorts, clears the floor.
 *
 * The floor holds throughout: nobody under it is described, the rest of the
 * team is not a comparison under it either, and the closing line is the
 * comparison's own disclaimer.
 */
function readAgents(
  sessions: readonly ShowroomSession[],
  people: readonly {
    readonly id: string;
    readonly name: string;
    readonly tone: string;
    readonly belowMinimum: boolean;
  }[],
  axes: readonly ReadingAxis[],
  /** Per axis, what the chart divides a figure by: its strongest presenter, or 1 for a share. */
  scale: readonly number[],
  locale: string,
  language: Language,
): CoachingReading {
  const floor = count(AGENT_MIN_SAMPLE, locale);
  const n = (k: number) => meetings(k, locale, language);
  const unit = (i: number) => scale[i] || 1;
  const drawn = people
    .filter((p) => !p.belowMinimum)
    .map((p) => {
      const mine = sessions.filter((s) => s.agentId === p.id);
      return { ...p, mine, values: axes.map((axis) => axis.measure(mine)) };
    });
  const at = (values: readonly number[], i: number) => values[i] ?? 0;

  /*
   * Everyone at an end, not the first of them in seat order: medians are whole
   * numbers, so ties are common. "Monika Kováčová and Martin Kováč, 8 across 60
   * and 81 meetings"; the plural word is the last count's, "26 and 30 meetings".
   */
  type Drawn = (typeof drawn)[number];
  const names = (group: readonly Drawn[]) => AND.format(group.map((p) => p.name));
  const counts = (group: readonly Drawn[]) =>
    AND.format(group.map((p) => count(p.mine.length, locale)));
  const countsInWords = (group: readonly Drawn[]) =>
    AND.format(
      group.map((p, k) =>
        k === group.length - 1 ? n(p.mine.length) : count(p.mine.length, locale),
      ),
    );
  const differences =
    drawn.length < 2
      ? []
      : axes
          .map((axis, i) => {
            const values = drawn.map((p) => at(p.values, i));
            const min = Math.min(...values);
            const max = Math.max(...values);
            const lo = drawn.filter((p) => at(p.values, i) === min);
            const hi = drawn.filter((p) => at(p.values, i) === max);
            return { axis, min, max, lo, hi, spread: (max - min) / unit(i) };
          })
          .filter((d) => d.spread > 0)
          /* A stable sort: a tie keeps the chart's own axis order. */
          .sort((a, b) => b.spread - a.spread)
          .slice(0, 3)
          .map(({ axis, min, max, lo, hi }) => ({
            id: axis.id,
            text: `${axis.label}: ${names(lo)}, ${axis.say(min, countsInWords(lo), locale)}; ${names(hi)}, ${axis.brief(max, counts(hi), locale)}.`,
          }));

  const chosen: ReadingAxis[] = [];
  const habits = drawn.map((p) => {
    const who = { agentId: p.id, name: p.name, tone: p.tone };
    const rest = sessions.filter((s) => s.agentId !== p.id);
    if (rest.length < AGENT_MIN_SAMPLE) {
      return {
        ...who,
        text: `${p.name}: everyone else held ${n(rest.length)}, under ${floor}, so nothing is set beside them.`,
      };
    }
    const team = axes.map((axis) => axis.measure(rest));
    const far = axes.map((_, i) => Math.abs(at(p.values, i) - at(team, i)) / unit(i));
    const furthest = far.indexOf(Math.max(...far));
    const axis = axes[furthest];
    if (axis === undefined || at(far, furthest) === 0) {
      return {
        ...who,
        text: `${p.name} sits at the rest of the team's own figure on every measure.`,
      };
    }
    if (!chosen.includes(axis)) chosen.push(axis);
    return {
      ...who,
      text: `${p.name} differs most from the rest of the team on ${axis.label}: ${axis.say(at(p.values, furthest), n(p.mine.length), locale)}; the rest of the team, ${axis.brief(at(team, furthest), count(rest.length, locale), locale)}.`,
    };
  });

  const outcomes = chosen.map((axis) => {
    if (typeof axis.split === "string") {
      return { id: axis.id, text: `${axis.label} ${axis.split}, so no outcome is set beside it.` };
    }
    const split = outcomeSplit(sessions, axis.split.test);
    const yes = split.with;
    const no = split.without;
    if (yes.meetings < AGENT_MIN_SAMPLE || no.meetings < AGENT_MIN_SAMPLE) {
      return {
        id: axis.id,
        text: `Meetings that ${axis.split.did}, and those that did not, are not set beside their outcomes: ${count(yes.meetings, locale)} and ${count(no.meetings, locale)} have an outcome recorded, and each side needs ${floor}.`,
      };
    }
    /*
     * Presentation DNA reads the same meetings the other way round, split by
     * outcome, and keeps the floor on its two cohorts: where it refuses, this
     * refuses too, so the link beside it never opens on a refusal.
     */
    const progressed = yes.progressed + no.progressed;
    const didNot = yes.meetings + no.meetings - progressed;
    if (progressed < AGENT_MIN_SAMPLE || didNot < AGENT_MIN_SAMPLE) {
      return {
        id: axis.id,
        text: `Meetings that ${axis.split.did} are not set beside their outcomes: of ${count(progressed + didNot, locale)} with an outcome recorded, ${count(progressed, locale)} progressed further and ${count(didNot, locale)} did not, and each needs ${floor}.`,
      };
    }
    return {
      id: axis.id,
      text: `Meetings that ${axis.split.did} progressed further in ${percent(share(yes.progressed, yes.meetings), locale)} of ${count(yes.meetings, locale)} with an outcome recorded; those that did not, ${percent(share(no.progressed, no.meetings), locale)} of ${count(no.meetings, locale)}.`,
    };
  });

  const [only] = drawn;
  /* The rest of the team stands as a comparison only at the floor; the habit line says so where it does not. */
  const othersStand = only !== undefined && sessions.length - only.mine.length >= AGENT_MIN_SAMPLE;
  return {
    differences,
    habits,
    outcomes,
    note:
      drawn.length === 0
        ? `No agent reached ${floor} meetings in this period, so nothing is compared between agents.`
        : drawn.length === 1 && only !== undefined
          ? `Only ${only.name} reached ${floor} meetings in this period, so no two agents are set side by side${othersStand ? "; their habit is read against everyone else's meetings instead." : "."}`
          : null,
    caveat: ASSOCIATION_DISCLAIMER,
  };
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
    reading: readAgents(
      sessions,
      raw.map((r, i) => ({
        id: r.id,
        name: r.label,
        tone: seatTone(i),
        belowMinimum: r.belowMinimum,
      })),
      RADAR_AXES,
      peaks,
      locale,
      language,
    ),
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
const FEATURE_AXES: readonly {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly used: ((s: ShowroomSession) => boolean) | null;
  /** The habit in words that follow "Meetings that"; on a measured axis only. */
  readonly did?: string;
  readonly missing: string | null;
}[] = [
  {
    id: "locating",
    label: "Locating",
    note: "How many of their meetings stopped on a named place in Amenities.",
    used: (s) => s.places.some((p) => p.section === "amenities"),
    did: "stopped on a named place in Amenities",
    missing: null,
  },
  {
    id: "comparing",
    label: "Comparing",
    note: "How many of their meetings put one apartment beside another in Compare. How long the comparison stayed open is not recorded. The radar's Compare counts a meeting that reached the Compare section at all.",
    used: (s) => s.units.some((u) => u.comparedWith.length > 0),
    did: "put one apartment beside another in Compare",
    missing: null,
  },
  {
    id: "shortlisting",
    label: "Shortlisting",
    note: "How many of their meetings marked an apartment as a favourite.",
    used: (s) => s.units.some((u) => u.favourited),
    did: "marked an apartment as a favourite",
    missing: null,
  },
  {
    id: "capturing",
    label: "Capturing",
    note: "How many of their meetings took a screenshot of an apartment.",
    used: (s) => s.units.some((u) => u.screenshots > 0),
    did: "took a screenshot of an apartment",
    missing: null,
  },
  {
    id: "slicing",
    label: "Slicing",
    note: "How many of their meetings opened an apartment's floor cut.",
    used: (s) => s.units.some((u) => u.floorCutViews > 0),
    did: "opened an apartment's floor cut",
    missing: null,
  },
  {
    id: "reading",
    label: "Reading",
    note: "How many of their meetings opened an apartment's PDF.",
    used: (s) => s.units.some((u) => u.pdfOpened),
    did: "opened an apartment's PDF",
    missing: null,
  },
  {
    id: "sharing",
    label: "Sharing",
    note: "How many of their meetings shared an apartment.",
    used: (s) => s.units.some((u) => u.shared),
    did: "shared an apartment",
    missing: null,
  },
  {
    id: "exploring",
    label: "Exploring",
    note: "How many of their meetings stopped on a named place in Surroundings.",
    used: null,
    missing:
      "Not measured yet. Surroundings is recorded only as a section reached, never place by place; the contract's word for it is requires_ue5_v2_event.",
  },
  {
    id: "filtering",
    label: "Filtering",
    note: "How many of their meetings filtered the apartments on show.",
    used: null,
    missing:
      "Not measured yet. The contract has a place for a filter, but the current build sends no filter event at all.",
  },
  {
    id: "walking",
    label: "Walking",
    note: "How many of their meetings walked the site in spaceman mode.",
    used: null,
    missing: "Not measured yet. Spaceman mode is not modelled in the contract at all.",
  },
];

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
  return {
    axes: FEATURE_AXES.map(({ id, label, note, missing }) => ({ id, label, note, missing })),
    profiles,
    summary: [
      drawn.length === 0
        ? `No agent reached ${floor} meetings in this period, so no line is drawn.`
        : `${count(drawn.length, locale)} ${drawn.length === 1 ? "line" : "lines"}, one per agent, each the share of their meetings that used a tool at least once.`,
      ...drawn.map(
        (p) =>
          `${p.label} · ${meetings(p.meetings, locale, language)}: ${AND.format(measured.map(({ axis, i }) => `${axis.label} ${percent(p.values[i] ?? 0, locale)}`))}.`,
      ),
      `Not measured: ${AND.format(FEATURE_AXES.filter((a) => a.used === null).map((a) => a.label))}.`,
      ...(notDrawn.length === 0
        ? []
        : [`Not drawn, under ${floor} meetings: ${AND.format(notDrawn)}.`]),
    ].join(" "),
    /* The measured axes only: an axis the build cannot answer is never ranked or set beside anyone. */
    reading: readAgents(
      sessions,
      profiles.map((p) => ({
        id: p.id,
        name: p.label,
        tone: p.tone,
        belowMinimum: p.belowMinimum,
      })),
      measured.map(({ axis }) => {
        const used = axis.used ?? (() => false);
        const did = axis.did ?? axis.label;
        return {
          id: axis.id,
          label: axis.label,
          measure: (mine: readonly ShowroomSession[]) =>
            share(mine.filter(used).length, mine.length),
          say: (v: number, n: string, locale: string) => `${percent(v, locale)} of ${n} ${did}`,
          brief: shareOf,
          /*
           * None of these is one of the cohort comparison's behaviours (its
           * Compare is a section reached, its Shortlist a section opened), so
           * no outcome is computed for them here that Presentation DNA does not
           * show.
           */
          split: "is not one of the behaviours Presentation DNA compares",
        };
      }),
      measured.map(() => 1),
      locale,
      language,
    ),
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
    const delta = Math.abs((points[i]?.value ?? 0) - (points[i - 1]?.value ?? 0));
    if (delta > biggest) {
      biggest = delta;
      annotationIndex = i;
    }
  }

  return {
    points,
    annotation:
      annotationIndex < 1 || biggest < 3
        ? null
        : {
            index: annotationIndex,
            text: `${biggest > 0 ? "±" : ""}${biggest} against the week before`,
          },
    valueLabel: "Meetings per week",
  };
}

/* --- progress against the plan ---------------------------------------------------- */

/**
 * The project's own sales plan.
 *
 * MADSPACE has not supplied a real one, so this is derived from the catalogue
 * and a stated target date, and the surface says so. What matters is the shape
 * of the answer: actual, target, and where a straight-line plan wanted this to
 * be by now — because 33% sold is neither good nor bad until you know the plan
 * expected 41%.
 */
export function buildTargets(
  projectId: string,
  today: Date,
  locale: string,
  timeZone: string,
  crmConnected: boolean,
): SalesTarget[] {
  // This project's stock. The sales plan was Northgate's on every project.
  const catalogue = catalogueFor(projectId);
  const total = catalogue.length;
  const sold = catalogue.filter((u) => u.status === "sold").length;
  const reserved = catalogue.filter((u) => u.status === "reserved").length;

  const startedOn = new Date("2026-01-15T00:00:00Z");
  const targetDate = new Date("2028-06-30T00:00:00Z");
  const elapsed = today.getTime() - startedOn.getTime();
  const span = targetDate.getTime() - startedOn.getTime();
  const pace = (elapsed / span) * total;

  const format = (d: Date) => monthYearLabel(d, locale, timeZone);

  /*
   * SOLD AND RESERVED ARE CRM OUTCOMES, NOT CATALOGUE ATTRIBUTES.
   *
   * The catalogue can be connected on a project whose CRM is not — Riverside
   * Walk is built to prove exactly that split. `sold`/`reserved` on a unit
   * records a closed deal, which is a fact the CRM tells and the catalogue
   * cannot originate on its own, so `catalogue`'s own figures are read here
   * only when `crmConnected` says the project actually has that source.
   */
  const soldActual = crmConnected ? sold : null;
  const committedActual = crmConnected ? sold + reserved : null;

  return [
    {
      id: "sold",
      label: "Sold",
      total,
      actual: soldActual,
      target: total,
      pace,
      startedOn: format(startedOn),
      targetDate: format(targetDate),
      note:
        soldActual === null
          ? "Unavailable — this project's CRM is not connected, and sold counts come from CRM outcomes."
          : `${soldActual} of ${total} sold. A straight line from ${format(startedOn)} to ${format(targetDate)} wants ${Math.round(pace)} by now.`,
    },
    {
      id: "committed",
      label: "Sold or reserved",
      total,
      actual: committedActual,
      target: total,
      pace,
      startedOn: format(startedOn),
      targetDate: format(targetDate),
      note:
        committedActual === null
          ? "Unavailable — this project's CRM is not connected, and reservations come from CRM outcomes."
          : `${committedActual} of ${total} sold or reserved. A reservation is not a sale, so both figures are shown.`,
    },
  ];
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
    { id: "all", label: "Presented", count: sessions.length },
    { id: "opened", label: "Opened a unit", count: opened.length },
    { id: "shortlisted", label: "Shortlisted one", count: shortlisted.length },
    ...(progressed === null
      ? []
      : [{ id: "progressed", label: "Progressed", count: progressed.length }]),
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
    }),
  };
}

/**
 * The same stages as one narrowing path. Every stage is a subset of the one
 * before it, so no band is wider than the band above; a stage nobody stopped
 * before would add a band exactly as wide as the last, and is named instead.
 * So is a stage no meeting reached, once: every stage after it is empty too.
 */
function journeyFunnel(
  stages: readonly { readonly id: string; readonly label: string; readonly count: number }[],
  locale: string,
  more: {
    readonly merged: string | null;
    readonly of: string | null;
    /** Said instead of "No meeting reached" when only the last stage is empty and that is not known. */
    readonly lastEmpty: string | null;
  },
): JourneyFunnel {
  const first = stages[0];
  if (first === undefined || first.count === 0) {
    return {
      steps: [],
      merged: null,
      of: "No meeting was presented in this period, so there is no journey to draw.",
    };
  }
  const empty = stages.findIndex((s) => s.count === 0);
  const reached = empty === -1 ? stages : stages.slice(0, empty);
  const drawn = reached.filter((s, i) => s.count !== reached[i - 1]?.count);
  const merged = reached.flatMap((s, i) => {
    const before = reached[i - 1];
    return before === undefined || drawn.includes(s)
      ? []
      : [
          `"${s.label}" is not drawn: all ${count(s.count, locale)} at "${before.label}" reached it, so nobody stopped between the two.`,
        ];
  });
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
    steps: drawn.map((s) => ({
      id: s.id,
      label: s.label,
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
      };
    });

  const period = context.period.label.toLowerCase();
  const notDrawnWords = `Not drawn: ${n(notDrawn.purchase)} that ended "${OUTCOME_LABELS.purchase}", a deal already closed; ${n(notDrawn.presentationOnly)} "${OUTCOME_LABELS.presentation_only}" and ${n(notDrawn.unrecorded)} with no outcome recorded, which the rule gives no size.`;
  return {
    agents,
    outcomes,
    days,
    months,
    meetings,
    total: sessions.length,
    notDrawn,
    nearest,
    /* An empty period, or one whose every outcome the rule leaves unsized, says so rather than describing bubbles it does not draw. */
    lead:
      sessions.length === 0
        ? "No meeting in this period, so no bubble is drawn."
        : largest === undefined || meetings.length === 0
          ? `${n(sessions.length)} meetings, ${period}, and none ended in an outcome the rule sizes, so no bubble is drawn. ${notDrawnWords}`
          : `${n(sessions.length)} meetings, ${period}, ${n(meetings.length)} of them drawn: one bubble each, in the colour of the agent who presented it and the size of the outcome recorded at its end. ${
              largest.count === 0
                ? `None ended "${largest.label}", the largest size and the nearest a purchase.`
                : largest.count === 1
                  ? `The largest, the one that ended "${largest.label}", is the nearest a purchase.`
                  : `The largest, the ${n(largest.count)} that ended "${largest.label}", are the nearest a purchase.`
            } ${notDrawnWords}`,
    note: "The sizes follow the order of the outcome ladder; they are not a computed likelihood. The outcome is the one the agent recorded in the room, not the CRM's stage. A week of one agent is not a sample: how each agent's meetings end, at its sample size, is further down this page.",
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
    funnel: buildBehaviourFunnel(sessions, locale, context.language),
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
): ProjectCharts {
  return {
    targets: buildTargets(projectId, today, locale, timeZone, crmConnected),
    journey: buildJourney(sessions, locale, crmConnected),
  };
}

export { SECTION_IDS, sectionLabel, type SectionId };
