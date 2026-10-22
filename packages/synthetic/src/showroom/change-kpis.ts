import {
  SHOWROOM_SECTIONS,
  sectionLabel,
  type InsightSource,
  type SectionId,
  type ShowroomSession,
} from "@observer/contracts";
import {
  duration,
  type ChangeKpi,
  type ChangeKpiTrend,
  type ChangeKpisView,
  type ViewContext,
} from "@observer/readmodels";
import { AGENT_MIN_SAMPLE, getMetric } from "@observer/metrics";
import { median } from "../deals";
import { count, dayLabel, shareDisplay } from "../format";
import { zoneParts, zonedInstant } from "../time";
import { reachedEarly, usedCompare } from "./project";
import { fullyTimed, sectionSeconds, sliceSpan } from "./views3";

/**
 * SALES FLOW'S SCREEN OF FIGURES (ADR-0060, the owner, 2026-10-22).
 *
 * Eight figures of the period's meetings, each set against the same figure
 * computed seven calendar days earlier — "if the average computed today is
 * higher than the one computed 7 calendar days ago, the trend is rising, so a
 * green arrow up". Medians, not means; shares with their denominators; the
 * definitions are the registry's (`packages/metrics`, `CHANGE_FIGURES`).
 */

/** How far back the comparison window ends, in calendar days in the project's zone. */
export const CHANGE_SHIFT_DAYS = 7;
/** A share that moved less than two points has not moved. */
export const RATE_STEP = 0.02;
/** A median that moved less than five per cent of where it stood has not moved. */
export const MEDIAN_STEP = 0.05;

const DERIVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"];
const AGO = `${String(CHANGE_SHIFT_DAYS)} days ago`;

interface Span {
  readonly from: number;
  readonly to: number;
}

/** The same wall-clock reading, `CHANGE_SHIFT_DAYS` calendar days earlier in the zone. */
function calendarDaysBefore(at: number, timeZone: string): number {
  const p = zoneParts(at, timeZone);
  const shifted = zonedInstant(
    p.year,
    p.month,
    p.day - CHANGE_SHIFT_DAYS,
    p.hour,
    p.minute,
    p.second,
    timeZone,
  );
  return shifted.getTime() + (at % 1000);
}

/**
 * The window the figures are read over, and the one their arrows are set
 * against: the period's own slice (`sliceSpan`, as every other surface reads
 * it), and a window of the same length ending seven calendar days earlier.
 */
export function changeWindows(context: ViewContext): { current: Span; earlier: Span } {
  const current = sliceSpan(context, new Date(context.generatedAt));
  const zone = context.project.timeZone;
  return {
    current,
    earlier: {
      from: calendarDaysBefore(current.from, zone),
      to: calendarDaysBefore(current.to, zone),
    },
  };
}

/* --- what each figure measures --------------------------------------------- */

/** Every opening and action the showroom records in one meeting. Not clicks: none are recorded. */
export function interactionsOf(session: ShowroomSession): number {
  return (
    session.steps.length +
    session.screenshots +
    session.units.reduce(
      (sum, u) =>
        sum +
        u.views +
        (u.pdfOpened ? 1 : 0) +
        u.floorCutViews +
        u.balconyViews +
        (u.favourited ? 1 : 0),
      0,
    )
  );
}

/**
 * The section the meetings spent the most timed seconds in, over the meetings
 * the source timed whole. A tie goes to the section more of them opened, then
 * to the inventory's order. Null when nothing was timed.
 */
export function topSection(
  sessions: readonly ShowroomSession[],
): { readonly sectionId: SectionId; readonly share: number; readonly timed: number } | null {
  const timed = sessions.filter(fullyTimed);
  const rows = SHOWROOM_SECTIONS.map((section, order) => ({
    sectionId: section.id as SectionId,
    order,
    seconds: timed.reduce((sum, s) => sum + sectionSeconds(s, section.id), 0),
    reach: timed.filter((s) => s.steps.some((step) => step.sectionId === section.id)).length,
  }));
  const total = rows.reduce((sum, r) => sum + r.seconds, 0);
  const top = [...rows].sort(
    (a, b) => b.seconds - a.seconds || b.reach - a.reach || a.order - b.order,
  )[0];
  if (top === undefined || total === 0) return null;
  return { sectionId: top.sectionId, share: top.seconds / total, timed: timed.length };
}

/* --- the arrow --------------------------------------------------------------- */

type Better = "up" | null;

/**
 * Up, down or no change, from two readings of one figure. `step` is the
 * smallest move that counts; `relative` reads it as a share of the earlier
 * value (a median), otherwise as a difference (a share of meetings).
 */
export function directionOf(
  now: number,
  then: number,
  step: number,
  relative: boolean,
): "up" | "down" | "flat" {
  const delta = now - then;
  // A hair under the step, so 0.50 − 0.48 (0.0200…018 or 0.0199…98 in floating point) is two points.
  const reach = step - 1e-9;
  const moved = relative
    ? then === 0
      ? delta !== 0
      : Math.abs(delta) / then >= reach
    : Math.abs(delta) >= reach;
  if (!moved) return "flat";
  return delta > 0 ? "up" : "down";
}

function trendOf(direction: "up" | "down" | "flat", better: Better, then: string): ChangeKpiTrend {
  const tone =
    direction === "flat" || better === null ? "neutral" : direction === better ? "good" : "bad";
  if (direction === "flat") {
    return {
      direction,
      tone,
      display: `unchanged from ${AGO}`,
      spoken: `Unchanged: ${then} ${AGO}.`,
    };
  }
  return {
    direction,
    tone,
    display: `from ${then}, ${AGO}`,
    spoken: `${direction === "up" ? "Up" : "Down"} from ${then}, ${AGO}.`,
  };
}

/* --- the screen -------------------------------------------------------------- */

export function buildChangeKpis(
  context: ViewContext,
  current: readonly ShowroomSession[],
  earlier: readonly ShowroomSession[],
): ChangeKpisView {
  const locale = context.project.locale;
  const zone = context.project.timeZone;
  const floor = AGENT_MIN_SAMPLE;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const windows = changeWindows(context);
  const meetings = (n: number) => `${count(n, locale)} ${n === 1 ? "meeting" : "meetings"}`;
  const days = (span: Span) =>
    `${dayLabel(new Date(span.from), locale, zone)} – ${dayLabel(new Date(span.to), locale, zone)}`;

  const view = {
    meetings: current.length,
    earlierMeetings: earlier.length,
    minimumSample: floor,
    sources: DERIVED,
    basis: `Each arrow sets the figure against the same figure ${AGO}: ${days(windows.earlier)}, ${meetings(earlier.length)}. A share that moved under ${String(Math.round(RATE_STEP * 100))} points, or a median under ${String(Math.round(MEDIAN_STEP * 100))}% of where it stood, is unchanged.`,
  };

  if (current.length === 0) {
    return {
      ...view,
      kpis: [],
      empty: `${context.period.label} holds no meeting, so there is no figure to show.`,
      withheld: null,
    };
  }

  /*
   * Said once for the screen: the policy-version refusal (docs/10-policies.md
   * §1) and a window short of the floor take every arrow away together.
   */
  const shortOf = (n: number, where: string) =>
    `${meetings(n)} ${where}, ${String(floor - n)} short of ${String(floor)}`;
  const windowsShort = [
    current.length < floor ? shortOf(current.length, "in this window") : null,
    earlier.length < floor ? shortOf(earlier.length, AGO) : null,
  ].filter((part): part is string => part !== null);
  const refusal = context.attribution.comparisonRefusal;
  const withheld =
    refusal !== null
      ? `No arrows: this comparison is refused. ${refusal} Both windows have to be measured under a compatible attribution policy.`
      : windowsShort.length > 0
        ? `No arrows below ${String(floor)} meetings a window: ${windowsShort.join("; ")}.`
        : null;

  const metric = (id: string) => {
    const found = getMetric(id);
    if (found === undefined) throw new Error(`${id} is not declared in the metric registry`);
    return found;
  };

  /** One figure's frame: its words from the registry, and its own floor in this window. */
  const frame = (
    metricId: string,
    href: string | null,
    sample: string,
    answering: number,
  ): Pick<ChangeKpi, "id" | "metricId" | "label" | "definition" | "href" | "sample" | "short"> => {
    const m = metric(metricId);
    return {
      id: metricId.replace(/^flow\./, ""),
      metricId,
      label: m.displayName,
      definition: `${m.businessDefinition} ${m.calculation}`,
      href,
      sample,
      short:
        answering < floor
          ? `raw figure, ${String(floor - answering)} short of ${String(floor)}`
          : null,
    };
  };

  /** No arrow for this figure alone: one of its windows is short of the floor. */
  const ownShortfall = (now: number, then: number): ChangeKpiTrend | null => {
    if (now >= floor && then >= floor) return null;
    const words =
      then < floor
        ? `${count(then, locale)} of the ${String(floor)} meetings needed, ${AGO}`
        : `${count(now, locale)} of the ${String(floor)} meetings needed, now`;
    return {
      direction: null,
      tone: "neutral",
      display: `no arrow: ${words}`,
      spoken: `No arrow: ${words}.`,
    };
  };

  const rate = (
    metricId: string,
    href: string,
    test: (s: ShowroomSession) => boolean,
    better: Better,
  ): ChangeKpi => {
    const part = current.filter(test).length;
    const now = part / current.length;
    const then = earlier.length === 0 ? 0 : earlier.filter(test).length / earlier.length;
    return {
      ...frame(
        metricId,
        href,
        `${count(part, locale)} of ${meetings(current.length)}`,
        current.length,
      ),
      display: shareDisplay(now, locale),
      unit: null,
      isName: false,
      trend:
        withheld !== null
          ? null
          : trendOf(directionOf(now, then, RATE_STEP, false), better, shareDisplay(then, locale)),
    };
  };

  const middle = (
    metricId: string,
    href: string,
    of: (s: ShowroomSession) => number,
    better: Better,
    show: (value: number) => string,
    answers: (s: ShowroomSession) => boolean = () => true,
    unitOf: ((value: number) => string) | null = null,
  ): ChangeKpi => {
    const nowSet = current.filter(answers);
    const thenSet = earlier.filter(answers);
    const now = median(nowSet.map(of));
    const then = median(thenSet.map(of));
    /* The figure and its unit apart, so the unit can be set smaller; whole in the arrow's words. */
    const said = (value: number) =>
      unitOf === null ? show(value) : `${show(value)} ${unitOf(value)}`;
    const sample =
      nowSet.length === current.length
        ? `median of ${meetings(current.length)}`
        : `median of ${count(nowSet.length, locale)} of ${meetings(current.length)}, timed`;
    return {
      ...frame(metricId, href, sample, nowSet.length),
      // Null only when no meeting here can answer it: absent, never nought.
      display: now === null ? "—" : show(now),
      unit: now === null || unitOf === null ? null : unitOf(now),
      isName: false,
      trend:
        withheld !== null
          ? null
          : (ownShortfall(nowSet.length, thenSet.length) ??
            (now === null || then === null
              ? null
              : trendOf(directionOf(now, then, MEDIAN_STEP, true), better, said(then)))),
    };
  };

  const top = topSection(current);
  const topThen = topSection(earlier);
  const timedNow = current.filter(fullyTimed).length;
  const timedThen = earlier.filter(fullyTimed).length;
  const named = top !== null && timedNow >= floor;
  const topFigure: ChangeKpi = {
    ...frame(
      "flow.top_feature",
      `${base}/storytelling`,
      top === null
        ? `no timed presentation time · ${meetings(current.length)}`
        : `${shareDisplay(top.share, locale)} of presentation time · ${
            timedNow === current.length
              ? meetings(current.length)
              : `${count(timedNow, locale)} of ${meetings(current.length)} timed`
          }`,
      timedNow,
    ),
    // A top is a rank, and below the floor nothing is ranked (docs/10-policies.md §6).
    display: named ? sectionLabel(top.sectionId) : "—",
    unit: null,
    isName: named,
    trend:
      withheld !== null
        ? null
        : (ownShortfall(timedNow, timedThen) ??
          (top === null || topThen === null
            ? null
            : top.sectionId === topThen.sectionId
              ? {
                  direction: "flat",
                  tone: "neutral",
                  display: `the top ${AGO} too`,
                  spoken: `Also the top feature ${AGO}.`,
                }
              : {
                  direction: null,
                  tone: "neutral",
                  display: `${sectionLabel(topThen.sectionId)} ${AGO}`,
                  spoken: `${sectionLabel(topThen.sectionId)} was the top feature ${AGO}.`,
                })),
  };

  const whole = (value: number) => count(value, locale);

  return {
    ...view,
    empty: null,
    withheld,
    kpis: [
      rate("flow.compare_use", `${base}/presentation`, usedCompare, "up"),
      rate(
        "flow.surroundings_early",
        `${base}/presentation`,
        (s) => reachedEarly(s, "surroundings"),
        null,
      ),
      middle(
        "flow.presentation_depth",
        `${base}/storytelling`,
        (s) => s.steps.length,
        null,
        whole,
        () => true,
        (v) => (v === 1 ? "step" : "steps"),
      ),
      middle("flow.interactions_per_meeting", `${base}/meetings`, interactionsOf, "up", whole),
      middle(
        "flow.presentation_length",
        `${base}/meetings`,
        (s) => s.durationSeconds,
        null,
        (v) => duration(v, context.language),
        (s) => !s.timingUnavailable,
      ),
      topFigure,
      middle("flow.screenshots_per_meeting", `${base}/meetings`, (s) => s.screenshots, "up", whole),
      middle(
        "flow.favourites_per_meeting",
        `${base}/units`,
        (s) => s.units.filter((u) => u.favourited).length,
        "up",
        whole,
      ),
    ],
  };
}
