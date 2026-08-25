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
  FlowCharts,
  BehaviourStep,
  JourneyFlowModel,
  KpiFigure,
  KpiPanel,
  KpiWindowId,
  OutcomeComposition,
  ProjectCharts,
  RankedRow,
  SalesTarget,
  TrendSeries,
  ViewContext,
} from "@observer/readmodels";
import { KPI_WINDOWS } from "@observer/readmodels";
import { catalogueFor } from "../pulse";
import { count, evidenceRef, percent, signedPercent } from "../format";
import { SYNTHETIC_AGENTS, agentById } from "./sessions";
import { meetings } from "./views3";

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

export function buildKpis(
  all: readonly ShowroomSession[],
  today: Date,
  windowId: KpiWindowId,
  locale: string,
): KpiPanel {
  const spec = KPI_WINDOWS.find((w) => w.id === windowId) ?? KPI_WINDOWS[2];
  const day = 24 * 60 * 60 * 1000;
  const end = new Date(today);
  end.setUTCHours(23, 59, 59, 999);
  const to = end.getTime();
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

  const figures: KpiFigure[] = [
    {
      id: "presentations",
      label: "Presentations",
      measurementId: "showroom.presentations",
      value: count(now.length, locale),
      qualifier:
        before.length === 0 ? "no earlier window" : `${count(before.length, locale)} before`,
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
      qualifier: medBefore === null ? "no earlier median" : `${duration(medBefore)} before`,
      delta:
        medNow === null || medBefore === null || medBefore === 0
          ? null
          : signedPercent((medNow - medBefore) / medBefore, locale),
      tone: medNow === null || medBefore === null ? "flat" : tone(medNow, medBefore, "up"),
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
      qualifier:
        decided.length === 0
          ? "no outcome recorded"
          : `${count(decided.length, locale)} with an outcome`,
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
      qualifier: `${count(new Set(now.flatMap((s) => s.units.map((u) => u.unitCode))).size, locale)} distinct`,
      delta: unitsBefore === 0 ? null : signedPercent((units - unitsBefore) / unitsBefore, locale),
      tone: tone(units, unitsBefore, "up"),
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
          ? `${meetings(now.length, locale)} is too few to read a rate from. The figures are shown; the comparisons are not verdicts.`
          : null,
  };
}

/* --- when meetings happen ---------------------------------------------------- */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function buildActivity(sessions: readonly ShowroomSession[]): ActivityMatrix {
  const hours = Array.from({ length: 10 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`);
  const cells: Record<string, number> = {};
  let counted = 0;

  for (const s of sessions) {
    const at = new Date(s.startedAt);
    const weekday = WEEKDAYS[(at.getUTCDay() + 6) % 7];
    const hour = `${String(at.getUTCHours()).padStart(2, "0")}:00`;
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
    cohortLabel: `Ended "not interested" · ${meetings(cohort.length, locale)}`,
    steps,
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

const RADAR_TONES = ["var(--accent)", "var(--gain)", "var(--watch)", "var(--loss)"];

export function buildAgentCharts(
  sessions: readonly ShowroomSession[],
  base: string,
  locale: string,
): AgentCharts {
  const raw = SYNTHETIC_AGENTS.flatMap((a) => {
    const mine = sessions.filter((s) => s.agentId === a.id);
    if (mine.length === 0) return [];
    return [
      {
        id: a.id,
        label: a.name,
        meetings: mine.length,
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
      label: `${r.label} · ${meetings(r.meetings, locale)}`,
      tone: RADAR_TONES[i % RADAR_TONES.length] ?? "var(--accent)",
      values: r.values.map((v, axis) => v / (peaks[axis] ?? 1)),
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
        sub: timed.length === 0 ? "no timed session" : `median ${duration(median(timed))}`,
        value: mine.length,
        display: count(mine.length, locale),
        href: `${base}/agents?agent=${r.id}`,
      };
    })
    .sort((a, b) => b.value - a.value);

  return { radar, ranked };
}

/* --- ordered lists -------------------------------------------------------------- */

export function buildLongestMeetings(
  sessions: readonly ShowroomSession[],
  base: string,
  locale: string,
): RankedRow[] {
  return [...sessions]
    .filter((s) => !s.timingUnavailable)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 8)
    .map((s) => ({
      id: s.meetingId,
      label: new Date(s.startedAt).toLocaleDateString(locale, { day: "numeric", month: "short" }),
      sub: `${agentById(s.agentId)?.name ?? s.agentId} · ${s.steps.length} steps · ${OUTCOME_LABELS[s.outcome]}`,
      value: s.durationSeconds,
      display: duration(s.durationSeconds),
      href: `${base}/meetings/${s.meetingId}`,
    }));
}

/* --- composition over months ------------------------------------------------------ */

const OUTCOME_COLOURS: Record<MeetingOutcome, string> = {
  purchase: "var(--gain)",
  reservation: "color-mix(in oklab, var(--gain) 70%, var(--accent))",
  interested: "var(--accent)",
  follow_up_needed: "color-mix(in oklab, var(--accent) 55%, var(--ink-3))",
  presentation_only: "var(--ink-3)",
  not_interested: "var(--loss)",
  skipped: "color-mix(in oklab, var(--ink-3) 45%, transparent)",
};

export function buildComposition(
  sessions: readonly ShowroomSession[],
  locale: string,
): OutcomeComposition {
  const months = new Map<string, ShowroomSession[]>();
  for (const s of sessions) {
    const at = new Date(s.startedAt);
    const key = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
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
        label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString(locale, { month: "short" }),
        total: xs.length,
        parts: Object.fromEntries(order.map((o) => [o, xs.filter((s) => s.outcome === o).length])),
      })),
    keys: order.map((o) => ({ id: o, label: OUTCOME_LABELS[o], colour: OUTCOME_COLOURS[o] })),
  };
}

/* --- meetings per week, with the moment something changed ------------------------ */

export function buildTrend(sessions: readonly ShowroomSession[], locale: string): TrendSeries {
  const weeks = new Map<number, number>();
  const day = 24 * 60 * 60 * 1000;
  for (const s of sessions) {
    const at = Date.parse(s.startedAt);
    const week = Math.floor(at / (7 * day));
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }

  const ordered = [...weeks.entries()].sort((a, b) => a[0] - b[0]);
  const points = ordered.map(([week, value]) => ({
    label: new Date(week * 7 * day).toLocaleDateString(locale, { day: "numeric", month: "short" }),
    value,
  }));

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
export function buildTargets(projectId: string, today: Date, locale: string): SalesTarget[] {
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

  const format = (d: Date) => d.toLocaleDateString(locale, { month: "short", year: "numeric" });

  return [
    {
      id: "sold",
      label: "Sold",
      total,
      actual: sold,
      target: total,
      pace,
      startedOn: format(startedOn),
      targetDate: format(targetDate),
      note: `${sold} of ${total} sold. A straight line from ${format(startedOn)} to ${format(targetDate)} wants ${Math.round(pace)} by now.`,
    },
    {
      id: "committed",
      label: "Sold or reserved",
      total,
      actual: sold + reserved,
      target: total,
      pace,
      startedOn: format(startedOn),
      targetDate: format(targetDate),
      note: `${sold + reserved} of ${total} sold or reserved. A reservation is not a sale, so both figures are shown.`,
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
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const charts = buildAgentCharts(sessions, base, locale);

  return {
    context,
    kpis: buildKpis(all, today, windowId, locale),
    activity: buildActivity(sessions),
    composition: buildComposition(sessions, locale),
    trend: buildTrend(sessions, locale),
    funnel: buildBehaviourFunnel(sessions, locale),
    rankedAgents: charts.ranked,
    longestMeetings: buildLongestMeetings(sessions, base, locale),
    evidence: evidenceRef("flow-charts", "observed_sequence", `${base}/flow`, sessions.length),
  };
}

export function buildProjectCharts(
  projectId: string,
  sessions: readonly ShowroomSession[],
  today: Date,
  locale: string,
): ProjectCharts {
  return {
    targets: buildTargets(projectId, today, locale),
    journey: buildJourney(sessions, locale),
  };
}

export { SECTION_IDS, sectionLabel, type SectionId };
