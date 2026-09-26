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
  AgentCharts,
  AgentRadar,
  BehaviourFunnel,
  FeatureUsage,
  FlowCharts,
  BehaviourStep,
  JourneyFlowModel,
  KpiFigure,
  KpiGroup,
  KpiPanel,
  KpiWindowId,
  OutcomeComposition,
  ProjectCharts,
  RankedRow,
  SalesTarget,
  TrendSeries,
  ViewContext,
} from "@observer/readmodels";
import { DEFAULT_LANGUAGE, KPI_WINDOWS, type Language } from "@observer/readmodels";
import { catalogueFor } from "../pulse";
import {
  count,
  dayLabel,
  evidenceRef,
  monthLabel,
  monthYearLabel,
  percent,
  signedPercent,
} from "../format";
import { endOfDayIn, monthKeyIn, startOfWeekIn, zoneParts } from "../time";
import { presenterName, presentersIn } from "./sessions";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { meetings, suppressionNoteFor } from "./views3";

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

function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return m === 0
    ? `${Math.round(seconds)}s`
    : `${m}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
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
  language: Language = DEFAULT_LANGUAGE,
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
   * silence.
   */
  const seriesOf = (measure: (slice: readonly ShowroomSession[]) => number | null): number[] => {
    let carried = 0;
    return buckets.map((slice) => {
      const value = measure(slice);
      if (value !== null) carried = value;
      return carried;
    });
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
      value: medNow === null ? "—" : duration(medNow),
      qualifier:
        medBefore === null
          ? `${windowWords} · no earlier median`
          : `${windowWords} · ${duration(medBefore)} before`,
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
    groups: KPI_GROUPS,
    ungrouped: ["duration"],
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

  for (const s of sessions) {
    /*
     * The office's weekday and hour, not UTC's. Read in UTC, a 09:10 meeting
     * in Bratislava landed in a 07:00 cell the grid does not have and fell
     * out of `meetingsCounted` altogether.
     */
    const at = zoneParts(s.startedAt, timeZone);
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
  language: Language = DEFAULT_LANGUAGE,
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

const RADAR_AXES = [
  { label: "Coverage", note: "share of core sections reached" },
  { label: "Depth", note: "median steps per meeting" },
  { label: "Units", note: "median units opened" },
  { label: "Compare", note: "share of meetings using Compare" },
  { label: "Returns", note: "share returning to a section" },
  { label: "Places", note: "median named places stopped on" },
] as const;

/*
 * PER-AGENT IDENTITY, NOT STATUS.
 *
 * This used to be `["var(--accent)", "var(--gain)", "var(--watch)",
 * "var(--loss)"]` — the product's own good/watch/poor status tokens,
 * reassigned as arbitrary per-agent colours with no relationship to
 * performance. An agent third in whatever order the data returned them
 * inherited "watch" amber and a fourth inherited "loss" red, on a screen
 * that also draws a real outcome-quality legend in the same hues right next
 * to this chart. Evidence/identity and status are the doctrine's own named
 * orthogonal axes; a shape a reader can compare across agents should not
 * borrow the palette of a different, unrelated judgment.
 *
 * A restrained ramp instead: the brand accent, then two blends toward
 * neutral ink, so every agent is still a distinct, legible line without
 * reaching for a colour this product uses to mean something else.
 */
const RADAR_TONES = [
  "var(--accent)",
  "color-mix(in srgb, var(--accent) 55%, var(--ink))",
  "var(--ink-2)",
  "color-mix(in srgb, var(--accent) 30%, var(--ink-3))",
];

export function buildAgentCharts(
  sessions: readonly ShowroomSession[],
  base: string,
  locale: string,
  language: Language = DEFAULT_LANGUAGE,
): AgentCharts {
  const raw = presentersIn(sessions).flatMap((a) => {
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
        values: [
          median(
            mine.map((s) =>
              share(
                CORE_SECTION_IDS.filter((c) => s.steps.some((x) => x.sectionId === c)).length,
                CORE_SECTION_IDS.length,
              ),
            ),
          ),
          median(mine.map((s) => s.steps.length)),
          median(mine.map((s) => s.units.length)),
          share(
            mine.filter((s) => s.steps.some((x) => x.sectionId === "compare")).length,
            mine.length,
          ),
          share(mine.filter((s) => s.steps.some((x) => x.isReturn)).length, mine.length),
          median(mine.map((s) => s.places.length)),
        ],
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

  const radar: AgentRadar = {
    axes: RADAR_AXES.map((a) => a.label),
    axisNotes: RADAR_AXES.map((a) => a.note),
    profiles: raw.map((r, i) => ({
      id: r.id,
      /*
       * One number, one place. Above the floor the label carries the count
       * beside the shape. Below it the note carries the count — "19 meetings
       * in this period, 1 short of the 20…" — so the label is the name alone,
       * or the card read "19 meetings — 19 meetings in this period".
       */
      label: r.belowMinimum ? r.label : `${r.label} · ${meetings(r.meetings, locale, language)}`,
      tone: RADAR_TONES[i % RADAR_TONES.length] ?? "var(--accent)",
      values: r.values.map((v, axis) => v / (peaks[axis] ?? 1)),
      belowMinimum: r.belowMinimum,
      note: r.belowMinimum ? suppressionNoteFor(r.meetings, locale, "sentence", language) : null,
    })),
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
            : `median ${duration(median(timed))}`,
        value: mine.length,
        display: count(mine.length, locale),
        href: `${base}/agents/${r.id}`,
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
  readonly missing: string | null;
}[] = [
  {
    id: "locating",
    label: "Locating",
    note: "How many of their meetings stopped on a named place in Amenities.",
    used: (s) => s.places.some((p) => p.section === "amenities"),
    missing: null,
  },
  {
    id: "comparing",
    label: "Comparing",
    note: "How many of their meetings put one apartment beside another in Compare. How long the comparison stayed open is not recorded.",
    used: (s) => s.units.some((u) => u.comparedWith.length > 0),
    missing: null,
  },
  {
    id: "shortlisting",
    label: "Shortlisting",
    note: "How many of their meetings marked an apartment as a favourite.",
    used: (s) => s.units.some((u) => u.favourited),
    missing: null,
  },
  {
    id: "capturing",
    label: "Capturing",
    note: "How many of their meetings took a screenshot of an apartment.",
    used: (s) => s.units.some((u) => u.screenshots > 0),
    missing: null,
  },
  {
    id: "slicing",
    label: "Slicing",
    note: "How many of their meetings opened an apartment's floor cut.",
    used: (s) => s.units.some((u) => u.floorCutViews > 0),
    missing: null,
  },
  {
    id: "reading",
    label: "Reading",
    note: "How many of their meetings opened an apartment's PDF.",
    used: (s) => s.units.some((u) => u.pdfOpened),
    missing: null,
  },
  {
    id: "sharing",
    label: "Sharing",
    note: "How many of their meetings shared an apartment.",
    used: (s) => s.units.some((u) => u.shared),
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
  language: Language = DEFAULT_LANGUAGE,
): FeatureUsage {
  return {
    axes: FEATURE_AXES.map(({ id, label, note, missing }) => ({ id, label, note, missing })),
    profiles: presentersIn(sessions).flatMap((agent) => {
      const mine = sessions.filter((s) => s.agentId === agent.id);
      if (mine.length === 0) return [];
      const belowMinimum = mine.length < AGENT_MIN_SAMPLE;
      return [
        {
          id: agent.id,
          label: agent.name,
          meetings: mine.length,
          values: FEATURE_AXES.map((axis) =>
            axis.used === null ? null : share(mine.filter(axis.used).length, mine.length),
          ),
          belowMinimum,
          note: belowMinimum ? suppressionNoteFor(mine.length, locale, "sentence", language) : null,
        },
      ];
    }),
  };
}

/* --- ordered lists -------------------------------------------------------------- */

export function buildLongestMeetings(
  sessions: readonly ShowroomSession[],
  base: string,
  locale: string,
  timeZone: string,
): RankedRow[] {
  return [...sessions]
    .filter((s) => !s.timingUnavailable)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 8)
    .map((s) => ({
      id: s.meetingId,
      label: dayLabel(s.startedAt, locale, timeZone),
      sub: `${presenterName(s.projectId, s.agentId)} · ${s.steps.length} steps · ${OUTCOME_LABELS[s.outcome]}`,
      value: s.durationSeconds,
      display: duration(s.durationSeconds),
      href: `${base}/meetings/${s.meetingId}`,
    }));
}

/* --- composition over months ------------------------------------------------------ */

/**
 * Kept identical to `OUTCOME_TONE` in `apps/web/src/showroom/charts.tsx` on
 * purpose -- both name the same six `--outcome-*` custom properties
 * (`packages/ui/src/iris.css`) rather than each declaring their own
 * `color-mix()`, which is what let the two drift apart before. `skipped`
 * still resolves to the heatmap's own empty-cell treatment's colour, not a
 * seventh ladder rung.
 */
const OUTCOME_COLOURS: Record<MeetingOutcome, string> = {
  purchase: "var(--outcome-purchase)",
  reservation: "var(--outcome-reservation)",
  interested: "var(--outcome-interested)",
  follow_up_needed: "var(--outcome-follow-up)",
  presentation_only: "var(--outcome-presentation-only)",
  not_interested: "var(--outcome-not-interested)",
  skipped: "color-mix(in oklab, var(--ink-3) 45%, transparent)",
};

export function buildComposition(
  sessions: readonly ShowroomSession[],
  locale: string,
  timeZone: string,
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
      .map(([key, xs]) => ({
        label: monthLabel(xs[0]?.startedAt ?? `${key}-15T12:00:00.000Z`, locale, timeZone),
        total: xs.length,
        parts: Object.fromEntries(order.map((o) => [o, xs.filter((s) => s.outcome === o).length])),
      })),
    keys: order.map((o) => ({ id: o, label: OUTCOME_LABELS[o], colour: OUTCOME_COLOURS[o] })),
  };
}

/* --- meetings per week, with the moment something changed ------------------------ */

export function buildTrend(
  sessions: readonly ShowroomSession[],
  locale: string,
  timeZone: string,
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
      points.push({
        label: dayLabel(new Date(week), locale, timeZone),
        value: weeks.get(week) ?? 0,
      });
      // Seven days on, re-anchored to Monday midnight so a clock change inside
      // the week cannot drift the next start by an hour.
      week = startOfWeekIn(week + 7 * day + 12 * 60 * 60 * 1000, timeZone).getTime();
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
): JourneyFlowModel {
  const opened = sessions.filter((s) => s.units.length > 0);
  const shortlisted = opened.filter((s) => s.units.some((u) => u.favourited));
  const progressed = shortlisted.filter((s) => hasProgressed(s.outcome));

  return {
    stages: [
      { id: "all", label: "Presented", count: sessions.length },
      { id: "opened", label: "Opened a unit", count: opened.length },
      { id: "shortlisted", label: "Shortlisted one", count: shortlisted.length },
      { id: "progressed", label: "Progressed", count: progressed.length },
    ],
    links: [
      { from: "all", to: "opened", count: opened.length },
      { from: "opened", to: "shortlisted", count: shortlisted.length },
      { from: "shortlisted", to: "progressed", count: progressed.length },
    ],
    droppedLabel: `${count(sessions.length - progressed.length, locale)} did not reach the end of this path`,
    note: "Each band is what survived the previous step. A meeting that stopped is not a failure — most presentations are not meant to close on the day.",
  };
}

/* --- the bundles ------------------------------------------------------------------- */

export function buildFlowCharts(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  all: readonly ShowroomSession[],
  today: Date,
  windowId: KpiWindowId,
): FlowCharts {
  const locale = context.project.locale;
  const timeZone = context.project.timeZone;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const charts = buildAgentCharts(sessions, base, locale, context.language);

  return {
    context,
    kpis: buildKpis(all, today, windowId, locale, timeZone, context.language),
    activity: buildActivity(sessions, timeZone),
    composition: buildComposition(sessions, locale, timeZone),
    trend: buildTrend(sessions, locale, timeZone),
    funnel: buildBehaviourFunnel(sessions, locale, context.language),
    rankedAgents: charts.ranked,
    longestMeetings: buildLongestMeetings(sessions, base, locale, timeZone),
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
    journey: buildJourney(sessions, locale),
  };
}

export { SECTION_IDS, sectionLabel, type SectionId };
