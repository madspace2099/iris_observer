import "server-only";

import { notFound } from "next/navigation";

import { credentialWord, installationAnswer, type InstallationAnswer } from "@/lib/madspace/format";
import { locateSource, projectSummaries, type ProjectSummary } from "@/lib/madspace/estate";
import {
  diagnosticsEstate,
  quarantineActivity,
  queuePressure,
  queueUnmeasured,
  recentErrorCodes,
  recentHeartbeats,
  recentVerifications,
  requiringAttention,
  type DiagnosticSource,
} from "@/lib/madspace/diagnostics";
import {
  CONTROL_PLANE_ACCOUNT,
  CONTROL_PLANE_ACCOUNT_NAME,
  controlPlane,
  sourceViews,
  HEALTH_LABEL,
  HEALTH_TONE,
  runningLocally,
  type SourceView,
} from "@/lib/sources/control-plane";
import { demonstrationEstate } from "@/lib/sources/seed";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";
import type { CredentialStatusRow } from "@observer/sources";
import type { MarkTone } from "@/components/madspace/StatusMark";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import { hasProgressed, outcomeIsUnknown, type ShowroomSession } from "@observer/contracts";
import type {
  AgentDetailView,
  AgentOutcomeRing,
  BehaviourFunnel,
  ActivityMatrix,
  KpiFigure,
  KpiWindowId,
  OutcomeComposition,
  OutcomeSlice,
  TrendSeries,
  PeriodPreset,
  RadarProfile,
  RankedRow,
  SalesTarget,
  SegmentInterest,
  Viewer,
} from "@observer/readmodels";
import { repository } from "@/lib/repository";

/**
 * ONE READ, EVERY SCREEN, EVERY VARIANT.
 *
 * The lab exists to choose a visual direction, and that choice only means
 * something if the candidates are looking at identical facts. So there is one
 * loader, it runs the SAME path the live screens use, and every screen in every
 * variant receives the whole bundle and takes what it needs.
 *
 * Loading everything at once rather than per screen is deliberate. The
 * demonstration estate is one project and one source, so the cost is nothing,
 * and it removes the only way three variants of one screen could ever disagree:
 * three separate reads taken at three separate moments.
 *
 * ## What is NOT here
 *
 * No second read model, no fixture, no per-variant shaping. Nothing in this file
 * decides what a state means, what a verdict is called or how an absent value
 * reads; `control-plane.ts`, `diagnostics.ts` and `format.ts` decide all of
 * that, and the live screens get it from the same place. A variant that wanted
 * a figure this does not return would be a variant asking to show something the
 * product does not know, and the answer to that is no rather than a prop.
 */

export interface LabSource {
  readonly view: SourceView;
  readonly credential: CredentialStatusRow | null;
  readonly answer: InstallationAnswer;
  readonly healthLabel: string;
  readonly healthTone: MarkTone;
  readonly projectName: string | null;
  readonly credentialLabel: string;
  readonly now: Date;
}

/** The diagnostics screen's six sections, already selected and ordered. */
export interface LabDiagnostics {
  readonly total: number;
  readonly attention: readonly DiagnosticSource[];
  readonly heartbeats: readonly DiagnosticSource[];
  readonly verifications: readonly DiagnosticSource[];
  readonly pressure: readonly DiagnosticSource[];
  readonly unmeasured: number;
  readonly quarantines: readonly DiagnosticSource[];
  readonly errors: readonly DiagnosticSource[];
}

/**
 * The activation panel's state.
 *
 * `code` is the one value in the whole lab that is not read from the database,
 * and it cannot be: the plaintext exists on the server for the length of one
 * return statement and is never stored, which is the entire point of the
 * design. So it is a correctly SHAPED sample, marked as one, and every variant
 * has to label it. Everything else here is the real credential row.
 */
export interface LabActivation {
  readonly credential: CredentialStatusRow | null;
  readonly state: string;
  readonly tone: MarkTone;
  readonly sampleCode: string;
  readonly isSample: true;
}

/**
 * One source anywhere in the account, with the name of the project holding it.
 *
 * The Sources list is the only screen whose subject is the whole account's
 * installations rather than one project's or one machine's, so it is the only
 * one that needs the project name travelling beside the row: without it every
 * row would name a machine and none would say where it stands.
 *
 * `projectName` is nullable for the reason `DiagnosticSource` gives — a screen
 * that silently prints a uuid where a name should be teaches the reader that
 * the two are interchangeable.
 */
export interface EstateSource {
  readonly view: SourceView;
  readonly projectName: string | null;
}

export interface LabEstate {
  readonly accountName: string;
  readonly local: boolean;
  readonly projects: readonly ProjectSummary[];
  readonly project: ProjectSummary | null;
  /** Every source under the demonstration project, for Project detail. */
  readonly sources: readonly SourceView[];
  /** Every source in the account, for the Sources list. */
  readonly estate: readonly EstateSource[];
  readonly source: LabSource;
  readonly diagnostics: LabDiagnostics;
  readonly activation: LabActivation;
  readonly now: Date;
}

/**
 * A code shaped exactly like a real one, and obviously not one.
 *
 * `obs.<selector>.<secret>`, the format `secrets.ts` mints. The body spells out
 * what it is rather than looking like entropy, because a sample that looks real
 * is a sample somebody eventually tries to use.
 */
const SAMPLE_CODE = "obs.SAMPLEonlyNOTaREALcode.thisVALUEisDRAWNforREVIEWandGRANTSnothing";

const CREDENTIAL_TONE: Readonly<Record<string, MarkTone>> = {
  active: "good",
  revoked: "operator",
  superseded: "none",
  expired: "wrong",
};

/**
 * The estate, read as the live screens read it.
 *
 * `notFound()` rather than a friendly empty state on every failure. This route
 * is a development instrument, and a lab that renders a placeholder when the
 * data is missing is a lab that can show a layout for facts that are not there.
 * If it cannot read the estate it should draw nothing at all.
 */
export async function labEstate(): Promise<LabEstate> {
  if (!localControlPlaneEnabled()) notFound();

  const plane = await controlPlane();
  if (!plane.ok) notFound();

  const estate = await demonstrationEstate(plane.admin);
  if (estate === null) notFound();

  const located = await locateSource(plane.admin, estate.sourceId);
  if (located === null) notFound();

  const now = new Date();
  const sources = await sourceViews(plane.admin, located.project_id, now);
  const view = sources.find((candidate) => candidate.status.source_id === estate.sourceId);
  if (view === undefined) notFound();

  const credentialResult = await plane.admin.credentialStatus({
    account: CONTROL_PLANE_ACCOUNT,
    source: estate.sourceId,
  });
  const credential = credentialResult.ok ? credentialResult.value : null;

  const projects = await projectSummaries(plane.admin);
  const project = projects.find((row) => row.projectId === view.status.project_id) ?? null;

  /*
   * The whole account's sources, through `sourceViews` once per project.
   *
   * There is no account-wide variant of that function and this deliberately
   * does not add one: `sourceViews` is what the live screens read, and it is
   * what carries ACTIVATION — the one of the three states that cannot be
   * derived from the operations row, because it comes from the credential.
   * `diagnosticsEstate` reads the account in a single query and would have been
   * cheaper, but it never reads credentials, so a Sources list built on it
   * could only have shown two of the three states honestly and would have had
   * to infer the third. Four extra round trips on a development instrument is
   * the correct price for not inferring it.
   */
  const estateSources = (
    await Promise.all(
      projects.map(async (summary) => {
        const rows = await sourceViews(plane.admin, summary.projectId, now);
        return rows.map((row) => ({ view: row, projectName: summary.name }));
      }),
    )
  ).flat();

  /*
   * Read with an empty filter. Diagnostics has a real filter control and this
   * lab is not prototyping it: the point is what the screen looks like holding
   * a whole account, and a filtered read would quietly narrow what the three
   * variants are being judged on.
   */
  const diagnostics = await diagnosticsEstate(
    plane.admin,
    { project: null, environment: null, health: null },
    now,
  );

  const credentialState = credential?.state ?? "";

  return {
    accountName: CONTROL_PLANE_ACCOUNT_NAME,
    local: runningLocally(),
    projects,
    project,
    sources,
    estate: estateSources,
    source: {
      view,
      credential,
      answer: installationAnswer(view, now),
      healthLabel: HEALTH_LABEL[view.health],
      healthTone: HEALTH_TONE[view.health],
      projectName: project?.name ?? null,
      credentialLabel: credentialWord(credentialState).word,
      now,
    },
    diagnostics: {
      total: diagnostics.all.length,
      attention: requiringAttention(diagnostics),
      heartbeats: recentHeartbeats(diagnostics),
      verifications: recentVerifications(diagnostics),
      pressure: queuePressure(diagnostics),
      unmeasured: queueUnmeasured(diagnostics),
      quarantines: quarantineActivity(diagnostics),
      errors: recentErrorCodes(diagnostics),
    },
    activation: {
      credential,
      state: credentialWord(credentialState).word,
      tone: CREDENTIAL_TONE[credentialState] ?? "none",
      sampleCode: SAMPLE_CODE,
      isSample: true,
    },
    now,
  };
}

/* --- the registry -------------------------------------------------------------- */

export const VARIANTS = ["a", "b", "c"] as const;
export type Variant = (typeof VARIANTS)[number];

export const VARIANT_NAME: Readonly<Record<Variant, string>> = {
  a: "Canonical light",
  b: "Graphite console",
  c: "Hybrid executive",
};

export const SCREENS = [
  "projects",
  "sources",
  "project-detail",
  "source-detail",
  "activation",
  "diagnostics",
] as const;

export type Screen = (typeof SCREENS)[number];

export const SCREEN_NAME: Readonly<Record<Screen, string>> = {
  projects: "Projects",
  sources: "Sources",
  "project-detail": "Project detail",
  "source-detail": "Source detail",
  activation: "Activation and source actions",
  diagnostics: "Diagnostics",
};

export function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value);
}

export function isScreen(value: string): value is Screen {
  return (SCREENS as readonly string[]).includes(value);
}

/** Every screen takes the whole estate. One prop, so no screen can drift. */
export interface LabScreenProps {
  readonly estate: LabEstate;
  readonly screenName: string;
  readonly variantName: string;
}

/* ============================================================================
 * VARIANT D. THE CHART GALLERY: ONE READ, EVERY CARD.
 *
 * Variants A, B and C draw the control plane. D draws the product's charts under
 * one treatment, read from the same repository every Observer screen reads
 * (`@/lib/repository`), for one project in one period, once. The rule above
 * holds here too: one loader, the live path, and the variant takes what it needs.
 *
 * ## Everything a card states is decided in this file
 *
 * Every card has the same anatomy: a title, the drawing, two figures and a
 * ranking of three rows. Every figure and every row is composed here. The
 * variant folder draws; it never counts, sums, divides or orders. Where a form
 * needs an aggregate the read models do not carry — hours collapsed out of the
 * weekday grid, an agent-by-hour count, a numeric share where the read model
 * prints a sentence — it is computed here from the port's own session slice
 * (`getSessionSlice`, which exists so that a consumer computes "from the same
 * facts every surface reads") and checked against the read model's own figure
 * before anything is drawn. A mismatch throws: a lab that drew a layout for
 * figures it could not reproduce would be showing facts that are not there.
 *
 * ## What is deliberately not here
 *
 * No buyer's name: the slice carries contact ids and nothing here reads them.
 * No shape, rank or comparison below the agent floor (`AGENT_MIN_SAMPLE`): the
 * profile is withheld with the read model's own sentence, as Sales Agents does.
 * No invented value: a card with nothing honest to rank says so instead.
 * ========================================================================= */

/*
 * Where the gallery reads, and why it is not the review index's project.
 *
 * The lab only exists where the local control plane runs, and there ISTER TOWER
 * is the control plane's twin: its meetings are the ones the plane delivered,
 * four of them when this was written, by one presenter below the floor. Every
 * radar, line and ranking would be withheld, which is the product behaving
 * correctly and a gallery showing nothing. Northgate has no twin, so it reads
 * the same on every machine, and over the year to date every one of its four
 * presenters stands above `AGENT_MIN_SAMPLE` (measured: 42, 33, 32 and 25), so
 * the forms that compare agents have something to draw without a floor bent.
 */
const D_TENANT = "alpha";
const D_PROJECT = "northgate";
const D_PERIOD: PeriodPreset = "year_to_date";
/** Sales Flow's default KPI window, so the KPI card says what that page says. */
const D_WINDOW: KpiWindowId = "month";
/** Beyond this many lines a parallel-coordinates plot stops being read; above it the gallery cuts, and says so. */
const D_PARALLEL_MAX = 15;
/** The attention × conversion frame's four cells, in `QuadrantMatrix`'s own words. */
export const D_QUADRANT_NAME: Readonly<Record<string, string>> = {
  hero: "Hero",
  mispriced: "Mispriced or oversold",
  hidden_gem: "Hidden gem",
  dead_stock: "Dead stock",
};

export interface DFigure {
  readonly label: string;
  readonly value: string;
  /** What the value is out of, or its qualifier, in words. */
  readonly of: string | null;
  /** A read model's own delta and tone, carried untouched; null where it states none. */
  readonly delta: string | null;
  readonly tone: "good" | "bad" | "flat" | null;
}

export interface DRankRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

/**
 * What a card says besides its drawing.
 *
 * `note` and `summary` are required for the reason `ChartFrame` requires them,
 * and they mean what they mean there: the note is the metric's definition,
 * precise enough to argue with — what is counted, over which set, what is left
 * out — and it is printed; the summary is what a reader who cannot see the
 * drawing is told instead, and it is not.
 */
export interface DFacts {
  /** The one sentence the card leads with, where the drawing has one thing to say; it describes, never explains. */
  readonly lead?: string;
  readonly note: string;
  readonly summary: string;
  readonly figures: readonly [DFigure, DFigure];
  readonly rankingTitle: string;
  readonly ranking: readonly DRankRow[];
  /** What orders the ranking, or why it holds fewer than three rows. */
  readonly rankingNote: string | null;
  /** A second ranking, where a question has two ends worth reading. */
  readonly alsoRanking?: {
    readonly title: string;
    readonly rows: readonly DRankRow[];
    readonly note: string | null;
  };
}

export interface DWithheld {
  readonly id: string;
  readonly label: string;
  readonly note: string;
}

export interface DRadarCard {
  readonly axes: readonly string[];
  readonly axisNotes: readonly string[];
  readonly profiles: readonly RadarProfile[];
  readonly withheld: readonly DWithheld[];
  readonly facts: DFacts;
}

export interface DParallelCard {
  readonly axes: readonly string[];
  readonly axisNotes: readonly string[];
  readonly lines: readonly {
    readonly id: string;
    readonly label: string;
    readonly values: readonly number[];
  }[];
  readonly withheld: readonly DWithheld[];
  /** Null when every eligible line is drawn. */
  readonly cut: { readonly drawn: number; readonly of: number } | null;
  readonly facts: DFacts;
}

export interface DHeatCard {
  readonly activity: ActivityMatrix;
  /** The grid's own sentence: what it counts, and how its shade reads. */
  readonly caption: string;
  /**
   * Where the shade starts and how it steps. `floor` is the grid's least count
   * over its peak, on the terms the product sets each cell's `--v`; `steps` is
   * how many shades the stepped grid has, one per count where the range allows.
   */
  readonly scale: { readonly floor: string; readonly steps: number };
  readonly facts: DFacts;
}

export interface DHourCount {
  readonly hour: number;
  readonly label: string;
  readonly count: number;
}

export interface DRadialCard {
  readonly hours: readonly DHourCount[];
  readonly peak: number;
  readonly total: number;
  readonly facts: DFacts;
}

export interface DPunchCard {
  readonly agents: readonly {
    readonly id: string;
    readonly label: string;
    readonly meetings: number;
  }[];
  readonly hours: readonly { readonly hour: number; readonly label: string }[];
  readonly cells: readonly {
    readonly agentId: string;
    readonly hour: number;
    readonly count: number;
  }[];
  readonly peak: number;
  readonly facts: DFacts;
}

export interface DDumbbellRow {
  readonly id: string;
  readonly label: string;
  /** This behaviour on its own, in the group. The read model prints it as `note`. */
  readonly share: number;
  readonly shareDisplay: string;
  /** The same behaviour among every other recorded meeting. The read model prints it as `comparisonNote`. */
  readonly comparisonShare: number;
  readonly comparisonDisplay: string;
}

export interface DDumbbellCard {
  readonly cohortLabel: string;
  readonly comparisonLabel: string;
  readonly rows: readonly DDumbbellRow[];
  /** The read model's own sentence when the group is empty; null otherwise. */
  readonly empty: string | null;
  readonly facts: DFacts;
}

/** One band of a funnel: its count, and its width as a share of the funnel's first band. */
export interface DFunnelStep {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly countDisplay: string;
  readonly share: number;
  readonly shareDisplay: string;
}

export interface DJourneyCard {
  readonly steps: readonly DFunnelStep[];
  /** The stages nobody stopped before, which would add a band as wide as the last: named here, not drawn. Null when every stage is drawn. */
  readonly merged: string | null;
  readonly facts: DFacts;
}

export interface DOutcomeFunnel {
  readonly id: string;
  readonly label: string;
  /** The outcome's own colour, as the read model's composition keys carry it. */
  readonly colour: string;
  readonly meetings: number;
  readonly meetingsDisplay: string;
  /** Null below the floor, where `withheld` stands instead of the funnel. */
  readonly steps: readonly DFunnelStep[] | null;
  readonly withheld: string | null;
}

export interface DOutcomeFunnelsCard {
  /** The bands' names, shared by every funnel, in the read model's order. */
  readonly stepLabels: readonly string[];
  readonly groups: readonly DOutcomeFunnel[];
  readonly facts: DFacts;
}

export interface DScatterCard {
  readonly points: readonly {
    readonly id: string;
    readonly label: string;
    readonly index: number;
    readonly share: number;
    readonly decided: number;
    readonly quadrant: string;
    /** "1.45× · 37% of 114": the point's position, and the decided meetings its rate is out of. */
    readonly display: string;
  }[];
  /** The segments off the chart, named, and why; or, when none is, that every segment is on it. */
  readonly offChart: string;
  readonly projectShare: number | null;
  readonly projectShareDisplay: string | null;
  /** The attention axis runs from nought to here: at least 2.00×, else the largest index, rounded up to a half. */
  readonly indexMax: number;
  readonly facts: DFacts;
}

export interface LabChartsD {
  readonly projectName: string;
  readonly period: PeriodPreset;
  readonly periodLabel: string;
  readonly windowLabel: string;
  readonly minimum: number;
  readonly radarBasic: DRadarCard;
  readonly radarSimple: DRadarCard;
  readonly radarMultiply: DRadarCard;
  readonly journeyFunnel: DJourneyCard;
  readonly scatter: DScatterCard;
  readonly ring: {
    readonly slices: readonly OutcomeSlice[];
    readonly total: number;
    readonly facts: DFacts;
  };
  readonly funnelMultiply: DOutcomeFunnelsCard;
  readonly heatmapBasic: DHeatCard;
  readonly heatmapGradient: DHeatCard;
  readonly bullet: { readonly targets: readonly SalesTarget[]; readonly facts: DFacts };
  readonly stacked: { readonly composition: OutcomeComposition; readonly facts: DFacts };
  readonly trend: {
    readonly agentLabel: string;
    /** Null below the floor: a line is read as a direction whatever is written under it. */
    readonly series: TrendSeries | null;
    readonly note: string | null;
    readonly facts: DFacts;
  };
  readonly sparkline: { readonly series: TrendSeries; readonly facts: DFacts };
  readonly ranked: { readonly rows: readonly RankedRow[]; readonly facts: DFacts };
  readonly kpi: { readonly figure: KpiFigure; readonly facts: DFacts };
  readonly sequence: {
    readonly agentLabel: string;
    readonly sections: AgentDetailView["profile"]["sections"];
    readonly showTeam: boolean;
    readonly note: string | null;
    readonly facts: DFacts;
  } | null;
  readonly parallel: DParallelCard;
  readonly radial: DRadialCard;
  readonly punch: DPunchCard;
  readonly dumbbell: DDumbbellCard;
}

/**
 * The behaviours the Sales Flow funnel tests, one per step id.
 *
 * Written out again because the read model keeps its list private to the
 * synthetic package, which nothing outside the composition root may import.
 * The copy is held to the original by `behaviourShares`: every share computed
 * here must print exactly as the read model printed it, or the gallery refuses.
 * An id this map does not know is refused the same way rather than guessed at.
 */
const D_BEHAVIOURS: Readonly<Record<string, (s: ShowroomSession) => boolean>> = {
  reached_surroundings: (s) => s.steps.some((x) => x.sectionId === "surroundings"),
  opened_amenities: (s) => s.steps.some((x) => x.sectionId === "amenities"),
  three_units: (s) => s.units.length >= 3,
  shortlisted: (s) => s.units.some((u) => u.favourited),
  used_compare: (s) => s.steps.some((x) => x.sectionId === "compare"),
  returned: (s) => s.steps.some((x) => x.isReturn),
};

function refuse(what: string): never {
  throw new Error(`Design lab D could not reproduce ${what}; nothing is drawn.`);
}

function same(what: string, ours: unknown, theirs: unknown): void {
  if (ours !== theirs) {
    refuse(`${what} (computed ${String(ours)}, the read model says ${String(theirs)})`);
  }
}

function figure(
  label: string,
  value: string,
  of: string | null = null,
  delta: string | null = null,
  tone: DFigure["tone"] = null,
): DFigure {
  return { label, value, of, delta, tone };
}

/** The three largest by `value`, largest first; ties keep the input's order. Zeros are not a ranking. */
function topThree<T>(
  items: readonly T[],
  value: (item: T) => number,
  row: (item: T) => DRankRow,
): DRankRow[] {
  return items
    .map((item, i) => ({ item, i, v: value(item) }))
    .filter((e) => e.v > 0)
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, 3)
    .map((e) => row(e.item));
}

/** "a, b and c": the lab's words are English whatever locale formats its figures. */
const listWords = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });
const listOrWords = new Intl.ListFormat("en-GB", { style: "long", type: "disjunction" });
function list(items: readonly string[]): string {
  return listWords.format(items);
}
function listOr(items: readonly string[]): string {
  return listOrWords.format(items);
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** "16:00–17:00". A bucket is a span of time, and printed as one; "16:00" names an instant. */
function hourSpan(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_FROM_MONDAY: Readonly<Record<string, number>> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * The project's calendar date an instant falls on, as midnight UTC of that
 * date, and its weekday counted from Monday. Whole dates rather than instants,
 * so that stepping a week is adding seven days and a clock change cannot move
 * a boundary by an hour.
 */
function calendarReader(timeZone: string): (at: Date) => { day: number; weekday: number } {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  return (at) => {
    const parts = new Map(format.formatToParts(at).map((p) => [p.type, p.value]));
    const weekday = WEEKDAY_FROM_MONDAY[parts.get("weekday") ?? ""];
    if (weekday === undefined) refuse(`the weekday of ${at.toISOString()}`);
    return {
      day: Date.UTC(
        Number(parts.get("year")),
        Number(parts.get("month")) - 1,
        Number(parts.get("day")),
      ),
      weekday,
    };
  };
}

/** ISO 8601: a week belongs to the year its Thursday falls in, and week 1 holds that year's first Thursday. */
function isoWeek(monday: number): string {
  const thursday = new Date(monday + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year} W${String(week).padStart(2, "0")}`;
}

/** The session's own hour in the project's time zone — the office's hour, as the weekday grid reads it. */
function hourReader(timeZone: string): (iso: string) => number {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });
  return (iso) => Number(format.format(new Date(iso)));
}

interface BehaviourShares {
  readonly cohort: number;
  readonly rest: number;
  readonly rows: readonly DDumbbellRow[];
}

/**
 * The funnel's two printed rates per behaviour, as numbers.
 *
 * The group is the meetings that ended "not interested"; the comparison is every
 * other meeting with an outcome recorded. Both are recomputed from the slice,
 * and each must format to the read model's own `note` and `comparisonNote`.
 */
function behaviourShares(
  funnel: BehaviourFunnel,
  sessions: readonly ShowroomSession[],
  pct: (v: number) => string,
  what: string,
): BehaviourShares {
  const cohort = sessions.filter((s) => s.outcome === "not_interested");
  const rest = sessions.filter(
    (s) => s.outcome !== "not_interested" && !outcomeIsUnknown(s.outcome),
  );
  if (funnel.steps.length > 0) {
    same(`${what}: the group's size`, cohort.length, funnel.steps[0]?.count);
  }

  const rows: DDumbbellRow[] = [];
  for (const step of funnel.steps) {
    if (step.id === "all") continue;
    const test = D_BEHAVIOURS[step.id];
    if (test === undefined) refuse(`${what}: a behaviour this gallery does not know, "${step.id}"`);
    if (cohort.length === 0 || rest.length === 0) continue;
    const share = cohort.filter(test).length / cohort.length;
    const comparisonShare = rest.filter(test).length / rest.length;
    same(`${what}: "${step.label}" in the group`, pct(share), step.note);
    same(`${what}: "${step.label}" elsewhere`, pct(comparisonShare), step.comparisonNote);
    rows.push({
      id: step.id,
      label: step.label,
      share,
      shareDisplay: pct(share),
      comparisonShare,
      comparisonDisplay: pct(comparisonShare),
    });
  }
  return { cohort: cohort.length, rest: rest.length, rows };
}

/**
 * Variant D's whole read.
 *
 * The viewer is the lab's own: the layout has already refused anybody who is
 * not MADSPACE, and the repository applies that viewer's grants like any page.
 */
export async function labChartsD(viewer: Viewer): Promise<LabChartsD> {
  const query = { viewer, tenantSlug: D_TENANT, projectSlug: D_PROJECT, period: D_PERIOD };

  const [flow, charts, projectCharts, projectView, agentCharts, slice] = await Promise.all([
    repository.getSalesFlow(query),
    repository.getFlowCharts(query, D_WINDOW),
    repository.getProjectCharts(query),
    repository.getProjectView(query, null),
    repository.getAgentCharts(query),
    repository.getSessionSlice(query),
  ]);

  const { locale, timeZone, name: projectName } = flow.context.project;
  const periodLabel = flow.context.period.label;
  const period = periodLabel.toLowerCase();
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const n = (v: number) => number.format(v);
  const pct = (v: number) => percent.format(v);
  const meetings = (v: number) => `${n(v)} ${v === 1 ? "meeting" : "meetings"}`;

  const sessions = slice.sessions;
  same("the period's meetings", sessions.length, flow.meetingCount);

  /*
   * Days, for printing a week or a span as the interval it is. The dates are
   * whole days held as midnight UTC, so they are printed in UTC; the zone was
   * applied when each was read. A running period is read through today, as the
   * repository reads it, so its last day is today and not the day before.
   */
  const calendar = calendarReader(timeZone);
  const dates = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const { from: periodFrom, to: periodTo } = flow.context.period;
  const today = Date.parse(flow.context.generatedAt);
  const periodRunning = Date.parse(periodTo) >= today - DAY_MS;
  const periodFirstDay = calendar(new Date(periodFrom)).day;
  const periodLastDay = calendar(new Date(periodRunning ? today : Date.parse(periodTo) - 1)).day;
  /** Seven days from `first` as dates, "13–19 Jul", cut to the days the series holds, and how many those are. */
  const sevenDays = (first: number, lastDay: number) => {
    const from = Math.max(first, periodFirstDay);
    const to = Math.min(first + 6 * DAY_MS, lastDay);
    const held = Math.round((to - from) / DAY_MS) + 1;
    return {
      range: dates.formatRange(new Date(from), new Date(to)),
      part: held < 7 ? `${n(held)} of 7 days` : null,
    };
  };
  /** "2026 W29 (13–19 Jul)", and "2026 W35 (24 Aug, 1 of 7 days)" where the period holds part of the week. */
  const weekSpan = (monday: number) => {
    const days = sevenDays(monday, periodLastDay);
    return `${isoWeek(monday)} (${days.range}${days.part === null ? "" : `, ${days.part}`})`;
  };

  /* --- who presented, by workload ------------------------------------------- */

  const nameOf = new Map(flow.rings.map((r) => [r.agentId, r.name]));
  const byWorkload: readonly AgentOutcomeRing[] = [...flow.rings].sort(
    (a, b) => b.meetings - a.meetings,
  );
  const workloadRows = topThree(
    byWorkload,
    (r) => r.meetings,
    (r) => ({ id: r.agentId, label: r.name, value: meetings(r.meetings) }),
  );
  const workloadNote = "Ordered by how many they presented, never by how they ended.";

  /* --- the radar, three ways, and parallel coordinates ------------------------ */

  const meetingsOf = new Map(agentCharts.ranked.map((r) => [r.id, r.value]));
  const radar = agentCharts.radar;
  const drawn = radar.profiles
    .filter((p) => !p.belowMinimum)
    .sort((a, b) => (meetingsOf.get(b.id) ?? 0) - (meetingsOf.get(a.id) ?? 0));
  const withheld: DWithheld[] = radar.profiles
    .filter((p) => p.belowMinimum)
    .map((p) => ({ id: p.id, label: nameOf.get(p.id) ?? p.label, note: p.note ?? "" }));

  const withheldFigure = figure(
    "Below the floor",
    n(withheld.length),
    `under ${n(AGENT_MIN_SAMPLE)} meetings, so not drawn`,
  );
  const radarNote =
    "Each spoke is scaled to the strongest agent on it. Wider is a different way of presenting, not a better one.";
  /* The definition all four agent-shape cards print; the six measures themselves are listed under each drawing. */
  const shapeNote = (scale: string) =>
    `Six measures of how an agent presented ${period}, each defined under the drawing. Every value is divided by the highest any agent reached on the same measure, so ${scale}. An agent under ${n(AGENT_MIN_SAMPLE)} meetings is not drawn.`;
  const radarDefinition = shapeNote(
    "a spoke's outer end is the strongest agent on it and the centre is nought",
  );
  const shapeOf = (id: string, values: readonly number[]) =>
    `${nameOf.get(id) ?? id}: ${list(radar.axes.map((axis, i) => `${axis} ${pct(values[i] ?? 0)}`))} of the strongest`;
  const withheldWords =
    withheld.length === 0
      ? ""
      : ` Not drawn, under ${n(AGENT_MIN_SAMPLE)} meetings: ${list(withheld.map((w) => w.label))}.`;

  const profileCard = (profile: RadarProfile | undefined): DRadarCard => {
    if (profile === undefined) {
      return {
        axes: radar.axes,
        axisNotes: radar.axisNotes,
        profiles: [],
        withheld,
        facts: {
          note: radarDefinition,
          summary: `No agent presented ${n(AGENT_MIN_SAMPLE)} meetings ${period}, so no shape is drawn.${withheldWords}`,
          figures: [
            figure("Profiles drawn", n(0), `of ${n(radar.profiles.length)} agents`),
            withheldFigure,
          ],
          rankingTitle: "Where this profile reaches furthest",
          ranking: [],
          rankingNote: `Nobody presented ${n(AGENT_MIN_SAMPLE)} meetings in ${period}.`,
        },
      };
    }
    const name = nameOf.get(profile.id) ?? profile.label;
    return {
      axes: radar.axes,
      axisNotes: radar.axisNotes,
      profiles: [profile],
      withheld,
      facts: {
        note: radarDefinition,
        summary: `${shapeOf(profile.id, profile.values)}, over ${meetings(meetingsOf.get(profile.id) ?? 0)}.${withheldWords}`,
        figures: [
          figure("Meetings", n(meetingsOf.get(profile.id) ?? 0), `${name}, ${period}`),
          withheldFigure,
        ],
        rankingTitle: "Where this profile reaches furthest",
        ranking: topThree(
          radar.axes.map((axis, i) => ({ axis, v: profile.values[i] ?? 0 })),
          (e) => e.v,
          (e) => ({ id: e.axis, label: e.axis, value: `${pct(e.v)} of the strongest` }),
        ),
        rankingNote: radarNote,
      },
    };
  };

  const radarMultiply: DRadarCard = {
    axes: radar.axes,
    axisNotes: radar.axisNotes,
    profiles: drawn,
    withheld,
    facts: {
      note: radarDefinition,
      summary: `${n(drawn.length)} shapes overlaid. ${drawn.map((p) => `${shapeOf(p.id, p.values)}.`).join(" ")}${withheldWords}`,
      figures: [
        figure("Profiles overlaid", n(drawn.length), `of ${n(radar.profiles.length)} agents`),
        withheldFigure,
      ],
      rankingTitle: "Presentations given",
      ranking: workloadRows,
      rankingNote: workloadNote,
    },
  };

  const lines = drawn.slice(0, D_PARALLEL_MAX).map((p) => ({
    id: p.id,
    label: nameOf.get(p.id) ?? p.label,
    values: p.values,
  }));
  const spread = radar.axes.map((axis, i) => {
    const values = lines.map((l) => l.values[i] ?? 0);
    return { axis, v: values.length < 2 ? 0 : Math.max(...values) - Math.min(...values) };
  });
  const parallel: DParallelCard = {
    axes: radar.axes,
    axisNotes: radar.axisNotes,
    lines,
    withheld,
    cut: drawn.length > D_PARALLEL_MAX ? { drawn: D_PARALLEL_MAX, of: drawn.length } : null,
    facts: {
      note: shapeNote("an axis's top is the strongest agent on it and its foot is nought"),
      summary: `${n(lines.length)} lines, one per agent. ${lines.map((l) => `${shapeOf(l.id, l.values)}.`).join(" ")}${withheldWords}`,
      figures: [
        figure("Lines drawn", n(lines.length), `of ${n(radar.profiles.length)} agents`),
        withheldFigure,
      ],
      rankingTitle: "Where the drawn agents differ most",
      ranking: topThree(
        spread,
        (e) => e.v,
        (e) => ({ id: e.axis, label: e.axis, value: `${pct(e.v)} apart` }),
      ),
      rankingNote:
        lines.length < 2
          ? "One line has nothing to differ from."
          : "The gap between the highest and lowest drawn line on each axis, as a share of the strongest.",
    },
  };

  /* --- the journey, as a funnel --------------------------------------------------- */

  /*
   * One path, narrowing: every link carries exactly the stage it enters, and no
   * stage is wider than the one before it. The read model builds it that way;
   * a funnel drawn over anything else would draw a shape the data does not have.
   */
  const journey = projectCharts.journey;
  const stageCount = new Map(journey.stages.map((s) => [s.id, s.count]));
  for (const l of journey.links) {
    same(`the journey's "${l.from}" to "${l.to}" link`, l.count, stageCount.get(l.to));
  }
  journey.stages.forEach((s, i) => {
    const before = journey.stages[i - 1];
    if (before !== undefined && s.count > before.count) {
      refuse(`a journey that narrows ("${s.label}" holds more than "${before.label}")`);
    }
  });
  /* A stage nobody stopped before would add a band exactly as wide as the last: it is named, not drawn. */
  const drawnStages = journey.stages.filter((s, i) => s.count !== journey.stages[i - 1]?.count);
  const firstStage = drawnStages[0];
  if (firstStage === undefined || firstStage.count === 0) {
    refuse("a journey with a meeting in it");
  }
  const lastStage = drawnStages[drawnStages.length - 1] ?? firstStage;
  const journeySteps: DFunnelStep[] = drawnStages.map((s) => ({
    id: s.id,
    label: s.label,
    count: s.count,
    countDisplay: n(s.count),
    share: s.count / firstStage.count,
    shareDisplay: pct(s.count / firstStage.count),
  }));
  const mergedStages = journey.stages.flatMap((s, i) => {
    const before = journey.stages[i - 1];
    return before === undefined || drawnStages.includes(s)
      ? []
      : [
          `"${s.label}" is not drawn: all ${meetings(s.count)} at "${before.label}" reached it, so nobody stopped between the two.`,
        ];
  });
  const stops = journeySteps.flatMap((to, i) => {
    const from = journeySteps[i - 1];
    return from === undefined
      ? []
      : [{ id: `${from.id}-${to.id}`, from, to, lost: from.count - to.count }];
  });
  const lastStop = stops[stops.length - 1];
  /* What each stage counts, as `buildJourney` tests it; a stage this does not know is refused rather than described. */
  const progressedWords = listOr(
    charts.composition.keys.filter((k) => hasProgressed(k.id)).map((k) => `"${k.label}"`),
  );
  const stageWords: Readonly<Record<string, string>> = {
    all: `every meeting ${period}`,
    opened: "a meeting in which at least one unit was opened",
    shortlisted: "one of those in which at least one unit was favourited",
    progressed: `one of those whose recorded outcome is ${progressedWords}`,
  };
  const journeyNote = `${journey.stages
    .map((s) => {
      const words = stageWords[s.id];
      if (words === undefined) refuse(`a journey stage this gallery does not know, "${s.id}"`);
      return `"${s.label}" is ${words}`;
    })
    .join(
      "; ",
    )}. A band is what reached that step, and the share beside it is out of the first band.`;
  const journeyFunnel: DJourneyCard = {
    steps: journeySteps,
    merged: mergedStages.length === 0 ? null : mergedStages.join(" "),
    facts: {
      note: journeyNote,
      summary: `${journeySteps.map((s) => `${s.label} ${s.countDisplay}, ${s.shareDisplay} of the first band`).join("; ")}.`,
      lead:
        lastStop === undefined
          ? undefined
          : `Of the ${meetings(lastStop.from.count)} at "${lastStop.from.label}", ${n(lastStop.lost)} stopped at the last step, before "${lastStop.to.label}".`,
      figures: [
        figure(firstStage.label, n(firstStage.count), periodLabel),
        figure(
          lastStage.label,
          n(lastStage.count),
          `${pct(lastStage.count / firstStage.count)} of ${firstStage.label.toLowerCase()}`,
        ),
      ],
      rankingTitle: "Where journeys stop",
      ranking: topThree(
        stops,
        (d) => d.lost,
        (d) => ({ id: d.id, label: `${d.from.label} to ${d.to.label}`, value: `−${n(d.lost)}` }),
      ),
      rankingNote: journey.note,
    },
  };

  /* --- attention against conversion, as points ---------------------------------- */

  const segments: readonly SegmentInterest[] = projectView.segments;
  const projectShares = [...new Set(segments.map((s) => s.conversion.projectShare))];
  if (projectShares.length > 1) refuse("one project conversion share for every segment");
  const projectShare = projectShares[0] ?? null;
  const placed = segments.filter(
    (s) => s.conversion.quadrant !== null && s.conversion.share !== null,
  );
  /*
   * The segments off the chart, by name, and why, in plain words rather than
   * the read model's terse reason; where the reason is not the floor, the read
   * model's own words stand. The floor's why is arithmetic: below it, one
   * decided meeting more or less moves a segment's rate by more than a
   * twentieth, enough to carry it across the project's line.
   */
  const offChart = segments.filter((s) => !placed.includes(s));
  const floorWhy = `The system leaves a segment off below ${n(AGENT_MIN_SAMPLE)} decided meetings, where one meeting more or less would move its rate by more than ${n(Math.round(100 / AGENT_MIN_SAMPLE))} percentage points.`;
  const offChartWords =
    offChart.length === 0
      ? `Every segment is on the chart, ${n(placed.length)} of ${n(segments.length)}: each has at least ${n(AGENT_MIN_SAMPLE)} decided meetings. ${floorWhy}`
      : `Not on the chart: ${list(
          offChart.map((s) =>
            s.conversion.decided < s.conversion.minimum
              ? `${s.label}, with ${n(s.conversion.decided)} decided ${s.conversion.decided === 1 ? "meeting" : "meetings"}, ${n(s.conversion.minimum - s.conversion.decided)} short of the ${n(s.conversion.minimum)} it needs`
              : `${s.label}, because ${(s.conversion.withheld ?? "no rate can be read").replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}`,
          ),
        )}. ${floorWhy}`;
  const scatter: DScatterCard = {
    points: placed.map((s) => ({
      id: s.id,
      label: s.label,
      index: s.index,
      share: s.conversion.share ?? 0,
      decided: s.conversion.decided,
      quadrant: s.conversion.quadrant ?? "",
      display: `${s.index.toFixed(2)}× · ${pct(s.conversion.share ?? 0)} of ${n(s.conversion.decided)}`,
    })),
    offChart: offChartWords,
    projectShare,
    projectShareDisplay: projectShare === null ? null : pct(projectShare),
    indexMax: Math.max(2, Math.ceil(Math.max(0, ...segments.map((s) => s.index)) * 2) / 2),
    facts: {
      note: `${projectView.matrixNote} A decided meeting is one that opened a unit of the segment and recorded an outcome. The upright line is parity, 1.00×; the level line is the project's share.`,
      summary: `${placed
        .map(
          (s) =>
            `${s.label}: ${s.index.toFixed(2)}× the attention its share of stock would give it, and ${pct(s.conversion.share ?? 0)} of its ${n(s.conversion.decided)} decided meetings progressed: ${D_QUADRANT_NAME[s.conversion.quadrant ?? ""] ?? "no cell"}.`,
        )
        .join(" ")}${offChart.length === 0 ? "" : ` ${offChartWords}`}`,
      figures: [
        figure("Segments on the chart", n(placed.length), `of ${n(segments.length)}`),
        figure(
          "Project conversion",
          projectShare === null ? "Unavailable" : pct(projectShare),
          "every decided meeting",
        ),
      ],
      rankingTitle: "Most attention for their stock",
      ranking: topThree(
        segments,
        (s) => s.index,
        (s) => ({ id: s.id, label: s.label, value: `${s.index.toFixed(2)}×` }),
      ),
      rankingNote: "Share of looking time over share of stock; 1.00× is attention matching supply.",
    },
  };

  /* --- the outcome ring ------------------------------------------------------------ */

  const recorded = flow.outcomes.filter((s) => !outcomeIsUnknown(s.outcome));
  const recordedCount = recorded.reduce((a, s) => a + s.count, 0);
  const ring = {
    slices: flow.outcomes,
    total: flow.meetingCount,
    facts: {
      note: `Every meeting ${period} by the outcome recorded at its end. Each share is out of all ${meetings(flow.meetingCount)}, the ${n(flow.meetingCount - recordedCount)} with no outcome recorded included, so the recorded outcomes add up to less than the whole.`,
      summary: `${meetings(flow.meetingCount)} ${period}: ${list(flow.outcomes.map((s) => `${s.label} ${n(s.count)} (${pct(s.share)})`))}.`,
      figures: [
        figure("Meetings", n(flow.meetingCount), periodLabel),
        figure("Outcome recorded", n(recordedCount), `of ${n(flow.meetingCount)}`),
      ] as const,
      rankingTitle: "Most frequent outcomes",
      ranking: topThree(
        recorded,
        (s) => s.count,
        (s) => ({ id: s.outcome, label: s.label, value: `${n(s.count)} · ${pct(s.share)}` }),
      ),
      rankingNote: "Shares of every meeting in the period, recorded or not.",
    },
  };

  /* --- behaviour: one funnel per outcome, and the dumbbell ----------------------- */

  const funnel = charts.funnel;
  const now = behaviourShares(funnel, sessions, pct, periodLabel);
  const groupFigure = figure("In the group", n(now.cohort), `ended "not interested", ${period}`);
  const restFigure = figure("Compared with", n(now.rest), "every other recorded meeting");

  /*
   * The read model draws one group, the meetings that ended "not interested".
   * The same bands over every outcome's own meetings, nested the same way: each
   * band is the meetings that did this and everything above it. Below the floor
   * a group's shape is not drawn, because the shape is what gets compared, and
   * the floor is the product's documented minimum for exactly that — the same
   * 20 the agent screens read.
   */
  if (funnel.steps.length === 0) refuse("the behaviour funnel's bands: its own group is empty");
  const outcomeGroups: DOutcomeFunnel[] = charts.composition.keys
    .filter((k) => !outcomeIsUnknown(k.id))
    .map((k) => {
      const group = sessions.filter((s) => s.outcome === k.id);
      same(
        `the "${k.label}" meetings`,
        group.length,
        flow.outcomes.find((o) => o.outcome === k.id)?.count ?? 0,
      );
      const base = { id: k.id, label: k.label, colour: k.colour, meetings: group.length };
      const meetingsDisplay = meetings(group.length);
      if (group.length < AGENT_MIN_SAMPLE) {
        return {
          ...base,
          meetingsDisplay,
          steps: null,
          withheld: `${n(AGENT_MIN_SAMPLE - group.length)} short of the ${n(AGENT_MIN_SAMPLE)} meetings a funnel needs, so none is drawn.`,
        };
      }
      let surviving = group;
      const steps = funnel.steps.map((step) => {
        if (step.id !== "all") {
          const test = D_BEHAVIOURS[step.id];
          if (test === undefined) refuse(`a behaviour this gallery does not know, "${step.id}"`);
          surviving = surviving.filter(test);
        }
        return {
          id: step.id,
          label: step.label,
          count: surviving.length,
          countDisplay: n(surviving.length),
          share: surviving.length / group.length,
          shareDisplay: pct(surviving.length / group.length),
        };
      });
      return { ...base, meetingsDisplay, steps, withheld: null };
    });
  /* The read model's own group, band for band: the copy of its tests must nest the way its own do. */
  const readModelsGroup = outcomeGroups.find((g) => g.id === "not_interested");
  readModelsGroup?.steps?.forEach((s, i) =>
    same(`the "not interested" funnel's "${s.label}" band`, s.count, funnel.steps[i]?.count),
  );

  const drawnGroups = outcomeGroups.filter((g) => g.steps !== null);
  const inDrawn = drawnGroups.reduce((a, g) => a + g.meetings, 0);
  const inSmaller = outcomeGroups.reduce((a, g) => a + (g.steps === null ? g.meetings : 0), 0);
  const bandGaps =
    drawnGroups.length < 2
      ? []
      : funnel.steps.flatMap((step, i) => {
          if (step.id === "all") return [];
          const widths = drawnGroups.map((g) => g.steps?.[i]?.share ?? 0);
          const lo = Math.min(...widths);
          const hi = Math.max(...widths);
          return [{ id: step.id, label: step.label, lo, hi, v: hi - lo }];
        });
  const funnelMultiply: DOutcomeFunnelsCard = {
    stepLabels: funnel.steps.map((s) => s.label),
    groups: outcomeGroups,
    facts: {
      note: `A group is the meetings ${period} that ended with one outcome recorded; the ${n(sessions.length - inDrawn - inSmaller)} with no outcome recorded are in none. Each band counts the group's meetings that did this and every behaviour above it, so the bands narrow, and the first band is the whole group. A group under ${n(AGENT_MIN_SAMPLE)} meetings is counted, not drawn. What a group's meetings had in common is not evidence that any behaviour produced the outcome.`,
      summary: `${drawnGroups
        .map(
          (g) =>
            `${g.label}, ${g.meetingsDisplay}: ${list((g.steps ?? []).map((s) => `${s.label} ${s.countDisplay}`))}.`,
        )
        .join(" ")}${
        drawnGroups.length === outcomeGroups.length
          ? ""
          : ` Counted, not drawn: ${list(
              outcomeGroups
                .filter((g) => g.steps === null)
                .map((g) => `${g.label} ${g.meetingsDisplay}`),
            )}.`
      }`,
      figures: [
        figure(
          "Funnels drawn",
          n(drawnGroups.length),
          `of ${n(outcomeGroups.length)} outcomes; each holds ${n(AGENT_MIN_SAMPLE)} meetings or more`,
        ),
        figure(
          "Meetings in them",
          n(inDrawn),
          `of ${n(sessions.length)}; ${n(inSmaller)} in smaller groups, ${n(sessions.length - inDrawn - inSmaller)} with no outcome recorded`,
        ),
      ],
      rankingTitle: "Where the drawn funnels differ most",
      ranking: topThree(
        bandGaps,
        (g) => g.v,
        (g) => ({ id: g.id, label: g.label, value: `${pct(g.lo)} to ${pct(g.hi)}` }),
      ),
      rankingNote:
        drawnGroups.length < 2
          ? "Fewer than two funnels are drawn, so there is nothing to set side by side."
          : "A band's width in its own group, the narrowest group against the widest. The bands nest, so each carries every band above it. It describes the groups; it does not explain the outcomes.",
    },
  };

  /*
   * A gap between two shares is in percentage points, taken between the shares
   * as printed, so that 18% against 41% reads as 23 and the sentence can be
   * checked against the drawing by eye. The rounding is held to the printed
   * figure, or the gallery refuses.
   */
  const points = (share: number) => Math.round(share * 100);
  const gaps = now.rows
    .map((r) => {
      same(`"${r.label}" in the group, as printed`, pct(points(r.share) / 100), r.shareDisplay);
      same(
        `"${r.label}" elsewhere, as printed`,
        pct(points(r.comparisonShare) / 100),
        r.comparisonDisplay,
      );
      return {
        r,
        v: Math.abs(points(r.share) - points(r.comparisonShare)),
        less: r.share < r.comparisonShare,
      };
    })
    .sort((a, b) => b.v - a.v);
  const widest = gaps[0];
  const restGaps = gaps.slice(1);
  const dumbbell: DDumbbellCard = {
    cohortLabel: funnel.cohortLabel,
    comparisonLabel: funnel.comparisonLabel,
    rows: now.rows,
    empty: funnel.empty,
    facts: {
      lead:
        widest === undefined
          ? undefined
          : `In the group, "${widest.r.label}" happened ${n(widest.v)} percentage points ${widest.less ? "less" : "more"} often than in every other recorded meeting: ${widest.r.shareDisplay} against ${widest.r.comparisonDisplay}.${restGaps.length === 0 ? "" : ` The other ${n(restGaps.length)} behaviours differ by ${n(Math.max(...restGaps.map((g) => g.v)))} percentage points or less.`}`,
      note: `Each behaviour on its own, not nested: the share of the ${meetings(now.cohort)} ${period} that ended "not interested" which showed it, against the same share among the ${n(now.rest)} other meetings with an outcome recorded. Meetings with no outcome recorded are in neither. It describes the group; it does not explain it.`,
      summary:
        now.rows.length === 0
          ? (funnel.empty ?? "There is no group to describe.")
          : `${now.rows.map((r) => `${r.label}: ${r.shareDisplay} in the group, ${r.comparisonDisplay} in every other recorded meeting`).join("; ")}.`,
      figures: [groupFigure, restFigure],
      rankingTitle: "Widest gaps, in percentage points",
      ranking: topThree(
        gaps,
        (g) => g.v,
        (g) => ({
          id: g.r.id,
          label: g.r.label,
          value: `${n(g.v)} ${g.less ? "less" : "more"} often`,
        }),
      ),
      rankingNote:
        "A gap is the difference between the two printed shares, in percentage points; less or more often is the group's against every other recorded meeting's.",
    },
  };

  /* --- when meetings happen: the grid two ways, the dial, the punch card ---------- */

  const activity = charts.activity;
  const cell = (r: string, c: string) => activity.cells[`${r}|${c}`] ?? 0;
  const hourSums = activity.columns.map((c) => ({
    id: c,
    hour: Number(c.slice(0, 2)),
    v: activity.rows.reduce((a, r) => a + cell(r, c), 0),
  }));
  const slots = activity.rows.flatMap((r) =>
    activity.columns.map((c) => ({
      id: `${r}|${c}`,
      label: `${r} ${hourSpan(Number(c.slice(0, 2)))}`,
      v: cell(r, c),
    })),
  );
  const firstHour = Number((activity.columns[0] ?? "00").slice(0, 2));
  const lastHour = Number((activity.columns[activity.columns.length - 1] ?? "00").slice(0, 2));
  /* The grid's reach as a span: its last column is the hour from 18:00, so it runs to 19:00. */
  const gridSpan = `${hourLabel(firstHour)}–${hourLabel((lastHour + 1) % 24)}`;
  const inGrid = figure(
    "Meetings in the grid",
    n(activity.meetingsCounted),
    `of ${n(flow.meetingCount)}; the grid runs ${gridSpan}`,
  );
  const outsideGrid = flow.meetingCount - activity.meetingsCounted;
  const gridNote = `Meetings ${period} by weekday and the hour they started, in the project's own time zone (${timeZone}), for the meetings that started within ${gridSpan}. ${outsideGrid === 0 ? "Every meeting started inside those hours." : `The ${meetings(outsideGrid)} that started outside those hours are not in the grid.`}`;
  const inTheGrid = `${n(activity.meetingsCounted)} of ${meetings(flow.meetingCount)} started inside the grid.`;
  const busiestSlot =
    activity.busiest === null
      ? null
      : `${activity.busiest.weekday} ${hourSpan(Number(activity.busiest.hour.slice(0, 2)))}`;

  /*
   * The shade runs over the counts the grid holds, least to most, not from
   * nought. A nought is drawn apart, as an outlined cell, and a ramp that began
   * at nought spent its darkest shades on counts no cell has, which is how a 1
   * and a 3 came to look alike. The product hands each cell `--v`, its count over
   * the peak to three places; the floor is the least count on the same terms,
   * and the stylesheet stretches the ramp between the two.
   */
  const heatCounts = Object.values(activity.cells).filter((v) => v > 0);
  const heatPeak = Math.max(0, ...heatCounts);
  const heatLeast = heatCounts.length === 0 ? 0 : Math.min(...heatCounts);
  const heatRange = heatPeak - heatLeast + 1;
  const heatScale = {
    floor: heatLeast === heatPeak ? "0" : (heatLeast / heatPeak).toFixed(3),
    /* One shade per count while the range allows it; past seven counts, seven equal parts of it. */
    steps: Math.min(7, Math.max(2, heatRange)),
  };
  const heatCaption = (shade: string) =>
    `Meetings by weekday and starting hour, across ${meetings(activity.meetingsCounted)}. ${shade} An outlined cell had none; every other cell prints its count.`;
  const faintToBright = `from ${n(heatLeast)}, the faintest, to ${n(heatPeak)}, the brightest.`;

  const heatmapBasic: DHeatCard = {
    activity,
    caption: heatCaption(
      heatRange <= 7
        ? `The shade steps once per count, ${faintToBright}`
        : `The shade steps in seven equal parts of the range, ${faintToBright}`,
    ),
    scale: heatScale,
    facts: {
      note: gridNote,
      summary: `${inTheGrid} By weekday: ${list(activity.rows.map((r) => `${r} ${n(activity.columns.reduce((a, c) => a + cell(r, c), 0))}`))}.${activity.busiest === null ? "" : ` The busiest slot is ${busiestSlot ?? ""}, with ${meetings(activity.busiest.meetings)}.`}`,
      figures: [
        inGrid,
        activity.busiest === null
          ? figure("Meetings in the busiest slot", "None", "no meeting in the grid")
          : figure("Meetings in the busiest slot", n(activity.busiest.meetings), busiestSlot),
      ],
      rankingTitle: "Busiest slots",
      ranking: topThree(
        slots,
        (s) => s.v,
        (s) => ({ id: s.id, label: s.label, value: meetings(s.v) }),
      ),
      rankingNote: "Weekday, and the hour the meetings started in, in the project's own time zone.",
    },
  };
  const heatmapGradient: DHeatCard = {
    activity,
    caption: heatCaption(`Brightness runs continuously ${faintToBright}`),
    scale: heatScale,
    facts: {
      note: gridNote,
      summary: `${inTheGrid} By starting hour: ${list(hourSums.map((h) => `${hourSpan(h.hour)} ${n(h.v)}`))}.${activity.quietest === null ? "" : ` The quietest weekday is ${activity.quietest.weekday}, with ${meetings(activity.quietest.meetings)}.`}`,
      figures: [
        inGrid,
        activity.quietest === null
          ? figure("Quietest weekday", "None", null)
          : figure(
              "Quietest weekday",
              activity.quietest.weekday,
              meetings(activity.quietest.meetings),
            ),
      ],
      rankingTitle: "Busiest hours",
      ranking: topThree(
        hourSums,
        (h) => h.v,
        (h) => ({ id: h.id, label: hourSpan(h.hour), value: meetings(h.v) }),
      ),
      rankingNote: "Every weekday added together, hour by hour.",
    },
  };
  const hourOf = hourReader(timeZone);
  const hourCounts = Array.from({ length: 24 }, () => 0);
  const agentHour = new Map<string, number>();
  for (const s of sessions) {
    const h = hourOf(s.startedAt);
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    const key = `${s.agentId}|${h}`;
    agentHour.set(key, (agentHour.get(key) ?? 0) + 1);
  }
  /* The dial and the grid read the same meetings; on the grid's hours they must agree. */
  for (const h of hourSums) same(`the ${h.id} column`, hourCounts[h.hour] ?? 0, h.v);
  const hours: DHourCount[] = hourCounts.map((count, hour) => ({
    hour,
    label: hourLabel(hour),
    count,
  }));
  const radialPeak = Math.max(0, ...hourCounts);
  const radial: DRadialCard = {
    hours,
    peak: radialPeak,
    total: sessions.length,
    facts: {
      note: `Every meeting ${period} by the hour it started, in the project's own time zone (${timeZone}), round all 24 hours. A bar's length is its count against the busiest hour; an hour with none has no bar.`,
      summary: `${meetings(sessions.length)} by starting hour: ${list(hours.filter((h) => h.count > 0).map((h) => `${hourSpan(h.hour)} ${n(h.count)}`))}; no meeting started in any other hour.`,
      figures: [
        figure("Meetings", n(sessions.length), `${periodLabel}, all 24 hours`),
        figure(
          "Meetings in the busiest hour",
          n(radialPeak),
          `${hourSpan(hourCounts.indexOf(radialPeak))}, every weekday together`,
        ),
      ],
      rankingTitle: "Busiest hours",
      ranking: topThree(
        hours,
        (h) => h.count,
        (h) => ({ id: h.label, label: hourSpan(h.hour), value: meetings(h.count) }),
      ),
      rankingNote: "Starting hour in the project's own time zone, every weekday together.",
    },
  };

  const used = hourCounts.flatMap((c, h) => (c > 0 ? [h] : []));
  const spanFrom = used.length === 0 ? 0 : Math.min(...used);
  const spanTo = used.length === 0 ? -1 : Math.max(...used);
  const punchHours = Array.from({ length: spanTo - spanFrom + 1 }, (_, i) => spanFrom + i).map(
    (hour) => ({ hour, label: hourLabel(hour) }),
  );
  const punchCells = byWorkload.flatMap((r) =>
    punchHours.map((h) => ({
      agentId: r.agentId,
      hour: h.hour,
      count: agentHour.get(`${r.agentId}|${h.hour}`) ?? 0,
    })),
  );
  same(
    "the punch card's meetings",
    punchCells.reduce((a, c) => a + c.count, 0),
    sessions.length,
  );
  /* The ranking's first row as a cell, so the figure can print the hour and the name apart. */
  const busiestCell = punchCells
    .filter((c) => c.count > 0)
    .reduce<(typeof punchCells)[number] | undefined>(
      (best, c) => (best === undefined || c.count > best.count ? c : best),
      undefined,
    );
  const busiestCells = topThree(
    punchCells,
    (c) => c.count,
    (c) => ({
      id: `${c.agentId}|${c.hour}`,
      label: `${nameOf.get(c.agentId) ?? c.agentId} · ${hourSpan(c.hour)}`,
      value: meetings(c.count),
    }),
  );
  const punch: DPunchCard = {
    agents: byWorkload.map((r) => ({ id: r.agentId, label: r.name, meetings: r.meetings })),
    hours: punchHours,
    cells: punchCells,
    peak: Math.max(0, ...punchCells.map((c) => c.count)),
    facts: {
      note: `Every meeting ${period} by the agent who presented it and the hour it started, in the project's own time zone. A dot's area is its count against the busiest agent-hour; a point is an hour with none. Rows run by workload, the busiest agent first.`,
      summary: `${byWorkload
        .map(
          (r) =>
            `${r.name}: ${list(
              punchCells
                .filter((c) => c.agentId === r.agentId && c.count > 0)
                .map((c) => `${hourSpan(c.hour)} ${n(c.count)}`),
            )}.`,
        )
        .join(" ")}`,
      figures: [
        figure("Meetings", n(sessions.length), `${n(byWorkload.length)} agents, ${period}`),
        figure(
          "Meetings in the busiest agent-hour",
          busiestCell === undefined ? "None" : n(busiestCell.count),
          busiestCell === undefined
            ? null
            : `${nameOf.get(busiestCell.agentId) ?? busiestCell.agentId}, ${hourSpan(busiestCell.hour)}`,
        ),
      ],
      rankingTitle: "Busiest agent-hours",
      ranking: busiestCells,
      rankingNote: "Workload by the hour. How a meeting ended plays no part in this order.",
    },
  };

  /* --- plan, composition, the project's weeks and the KPI panel -------------------- */

  const targets = projectCharts.targets;
  const firstTarget = targets[0];
  const bullet = {
    targets,
    facts: {
      note:
        targets.length === 0
          ? "The plan holds no target, so there is nothing to measure against."
          : `${targets.map((t) => `${t.label}: ${t.note}`).join(" ")} "Needed by now" is where a straight line from the plan's start to its target date stands today.`,
      summary:
        targets.length === 0
          ? "The plan holds no target."
          : `${targets
              .map(
                (t) =>
                  `${t.label}: ${t.actual === null ? "unavailable" : n(t.actual)} against a target of ${n(t.target)}, with ${n(Math.round(t.pace))} needed by now`,
              )
              .join("; ")}.`,
      figures: [
        firstTarget === undefined
          ? figure("Sold", "Unavailable", "the plan holds no target")
          : figure(
              firstTarget.label,
              firstTarget.actual === null ? "Unavailable" : n(firstTarget.actual),
              `against a target of ${n(firstTarget.target)}`,
            ),
        firstTarget === undefined
          ? figure("Needed by now", "Unavailable", null)
          : figure("Needed by now", n(Math.round(firstTarget.pace)), "on the plan's own schedule"),
      ] as const,
      rankingTitle: "The plan's targets",
      ranking: targets.slice(0, 3).map((t) => ({
        id: t.id,
        label: t.label,
        value:
          t.actual === null ? `Unavailable / ${n(t.target)}` : `${n(t.actual)} / ${n(t.target)}`,
      })),
      rankingNote:
        targets.length < 3
          ? `The plan holds ${n(targets.length)} ${targets.length === 1 ? "target" : "targets"}, in its own order.`
          : "In the plan's own order.",
    },
  };

  const composition = charts.composition;
  const compositionTotal = composition.columns.reduce((a, c) => a + c.total, 0);
  const stacked = {
    composition,
    facts: {
      note: `Every meeting ${period} by the calendar month it started in, in the project's own time zone, split by the outcome recorded at its end. "${composition.keys.find((k) => outcomeIsUnknown(k.id))?.label ?? "Outcome not recorded"}" is a part of its own, not a nought. A month with no meeting has no column, and the last column runs to today.`,
      summary: `${meetings(compositionTotal)} by month: ${list(composition.columns.map((c) => `${c.label} ${n(c.total)}`))}.`,
      figures: [
        figure("Meetings", n(compositionTotal), `across ${n(composition.columns.length)} columns`),
        figure("Columns", n(composition.columns.length), periodLabel),
      ] as const,
      rankingTitle: "Largest columns",
      ranking: topThree(
        composition.columns,
        (c) => c.total,
        (c) => ({ id: c.label, label: c.label, value: meetings(c.total) }),
      ),
      rankingNote: "Each column's own total; the colours are the outcome ladder.",
    },
  };

  const weekly = charts.trend;
  const weeklyTotal = weekly.points.reduce((a, p) => a + p.value, 0);
  same("the weekly series' meetings", weeklyTotal, flow.meetingCount);
  /*
   * The same weeks, as dates. `buildTrend` keeps each week's Monday as an
   * instant and prints only its day, and a week printed as an interval needs
   * the Monday as a date; so the weeks are counted again here, from the same
   * meetings in the same zone, and must match the read model's own week for
   * week: as many, each labelled as it labels it, each holding what it holds.
   */
  const perWeek = new Map<number, number>();
  for (const s of sessions) {
    const at = calendar(new Date(s.startedAt));
    const monday = at.day - at.weekday * DAY_MS;
    perWeek.set(monday, (perWeek.get(monday) ?? 0) + 1);
  }
  const mondays = [...perWeek.keys()].sort((a, b) => a - b);
  const weeks: { monday: number; count: number }[] = [];
  const firstMonday = mondays[0];
  const lastMonday = mondays[mondays.length - 1];
  if (firstMonday !== undefined && lastMonday !== undefined) {
    for (let monday = firstMonday; monday <= lastMonday; monday += 7 * DAY_MS) {
      weeks.push({ monday, count: perWeek.get(monday) ?? 0 });
    }
  }
  same("the weekly series' weeks", weeks.length, weekly.points.length);
  weeks.forEach((w, i) => {
    same(`week ${n(i + 1)}'s label`, dates.format(new Date(w.monday)), weekly.points[i]?.label);
    same(`week ${n(i + 1)}'s meetings`, w.count, weekly.points[i]?.value);
  });
  const firstWeek = weeks[0];
  const lastWeek = weeks[weeks.length - 1];
  const weekCounts = weeks.map((w) => w.count);
  const sparkline = {
    series: weekly,
    facts: {
      note: `Meetings started in each week ${period}, Monday to Sunday in the project's own time zone, from the first week with a meeting to the last; a week between them with none is drawn at nought. Every meeting counts once, whatever its outcome. A week is named by its ISO number and its dates, and where the period holds only part of it, by the days it holds.`,
      summary:
        firstWeek === undefined || lastWeek === undefined
          ? `No meeting ${period}.`
          : `${meetings(weeklyTotal)} over ${n(weeks.length)} weeks: ${n(firstWeek.count)} in ${weekSpan(firstWeek.monday)}, and ${n(lastWeek.count)} in ${weekSpan(lastWeek.monday)}. The busiest week held ${n(Math.max(...weekCounts))}, the quietest ${n(Math.min(...weekCounts))}.`,
      figures: [
        /* The series' own label is a rate ("per week"); its sum is a count, and says so. */
        figure("Meetings", n(weeklyTotal), `${periodLabel}, all ${n(weeks.length)} weeks`),
        figure(
          "Meetings in the latest week",
          n(lastWeek?.count ?? 0),
          lastWeek === undefined ? null : weekSpan(lastWeek.monday),
        ),
      ] as const,
      rankingTitle: "Busiest weeks",
      ranking: topThree(
        weeks,
        (w) => w.count,
        (w) => ({ id: String(w.monday), label: weekSpan(w.monday), value: meetings(w.count) }),
      ),
      rankingNote: "Monday to Sunday, in the project's own time zone.",
    },
  };

  const kpiFigures = charts.kpis.figures;
  const presentations = kpiFigures.find((f) => f.id === "presentations") ?? kpiFigures[0];
  if (presentations === undefined) refuse("a KPI figure to draw");
  const others = kpiFigures.filter((f) => f.id !== presentations.id);
  const asFigure = (f: KpiFigure | undefined): DFigure =>
    f === undefined
      ? figure("Not measured", "None", null)
      : figure(f.label, f.value, f.qualifier, f.delta, f.tone);
  /* The panel's own group definitions; a figure in no group is defined here, from how `buildKpis` measures it. */
  const kpiGroupWords = charts.kpis.groups
    .filter((g) => g.figureIds.length > 0)
    .map((g) => `${g.label}: ${g.definition}`);
  const kpiUngroupedWords: Readonly<Record<string, string>> = {
    duration: "Typical length: the median length of the meetings the source timed end to end.",
  };
  const kpi = {
    figure: presentations,
    facts: {
      note: [
        `${charts.kpis.windowLabel}, closing at the end of the project's own day; each figure is set against the same length of time just before it.`,
        ...kpiGroupWords,
        ...charts.kpis.ungrouped.map((id) => {
          const words = kpiUngroupedWords[id];
          if (words === undefined) refuse(`a KPI figure this gallery cannot define, "${id}"`);
          return words;
        }),
      ].join(" "),
      summary: `${charts.kpis.windowLabel}: ${kpiFigures.map((f) => `${f.label} ${f.value}${f.delta === null ? "" : ` (${f.delta} against the time before)`}`).join("; ")}.`,
      figures: [asFigure(others[0]), asFigure(others[1])] as const,
      rankingTitle: "The rest of the panel",
      ranking: others.slice(2, 5).map((f) => ({ id: f.id, label: f.label, value: f.value })),
      rankingNote: `${charts.kpis.windowLabel}. Different measures, in the panel's own order: they do not rank against each other.`,
    },
  };

  /* --- one presenter: their weeks and their running order ------------------------- */

  const lead = drawn[0];
  const detail = lead === undefined ? null : await repository.getAgentDetail(query, lead.id);
  const leadName = detail?.name ?? "No agent above the floor";
  const leadWeeks = detail?.sessionsOverTime.points ?? [];
  /*
   * The agent page's weeks are the Sales Flow's: `weeklyBuckets` cuts the
   * period on the project's Monday grid, as `buildTrend` does, cuts the first
   * week where the period starts and the last where it ends, and keeps the last
   * few. They are rebuilt here on the same grid, to print each as its dates,
   * and each must label as the read model labels it — by its first day inside
   * the period — or the gallery refuses. The agent's series ends where the
   * period does, not with today, so its last day is the period's own.
   */
  const spanDay = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone });
  const agentLastDay = calendar(new Date(Date.parse(periodTo) - 1)).day;
  const opening = calendar(new Date(periodFrom));
  const agentMondays: number[] = [];
  for (
    let monday = opening.day - opening.weekday * DAY_MS;
    monday <= agentLastDay;
    monday += 7 * DAY_MS
  ) {
    agentMondays.push(monday);
  }
  const leadSpans = (leadWeeks.length === 0 ? [] : agentMondays.slice(-leadWeeks.length)).map(
    (monday, i) => {
      const point = leadWeeks[i];
      same(
        `the trend's week ${n(i + 1)}`,
        dates.format(new Date(Math.max(monday, periodFirstDay))),
        point?.label,
      );
      const days = sevenDays(monday, agentLastDay);
      return {
        id: String(monday),
        label: days.part === null ? days.range : `${days.range} (${days.part})`,
        value: point?.value ?? 0,
      };
    },
  );
  same("the trend's weeks", leadSpans.length, leadWeeks.length);
  const periodCloses = spanDay.format(new Date(periodTo));
  const trendSeries = detail === null || detail.belowMinimum ? null : detail.sessionsOverTime;
  const trend = {
    agentLabel: leadName,
    series: trendSeries,
    note:
      detail === null
        ? `Nobody presented ${n(AGENT_MIN_SAMPLE)} meetings in ${period}.`
        : detail.suppressionNote,
    facts: {
      note: `Meetings ${leadName} presented in each of the period's last ${n(leadSpans.length)} weeks. They are calendar weeks, Monday to Sunday in the project's own time zone; the period's first week is cut where the period starts, and its last where it ends, at the start of ${periodCloses}. Every meeting counts once, whatever its outcome. The line is drawn only for an agent with ${n(AGENT_MIN_SAMPLE)} meetings or more.`,
      summary:
        trendSeries === null
          ? (detail?.suppressionNote ??
            `Nobody presented ${n(AGENT_MIN_SAMPLE)} meetings in ${period}.`)
          : `${leadName}, week by week: ${list(leadSpans.map((s) => `${s.label} ${n(s.value)}`))}.`,
      figures: [
        figure("Meetings", n(detail?.sampleSize ?? 0), `${leadName}, ${period}`),
        figure(
          "Weeks drawn",
          n(leadSpans.length),
          "Monday to Sunday; the first and last can be cut",
        ),
      ] as const,
      rankingTitle: "Their busiest weeks",
      ranking: topThree(
        leadSpans,
        (s) => s.value,
        (s) => ({ id: s.id, label: s.label, value: meetings(s.value) }),
      ),
      rankingNote: "The agent with the most meetings at or above the floor.",
    },
  };
  const sections = detail?.profile.sections ?? [];
  const sequence =
    detail === null
      ? null
      : {
          agentLabel: detail.name,
          sections,
          showTeam: !detail.belowMinimum,
          note: detail.belowMinimum ? detail.suppressionNote : null,
          facts: {
            note: `The sections in the order ${detail.name} usually opens them, from each section's mean position across their ${meetings(detail.sampleSize)} ${period}. A time is their median stay in that section, and its bar is set against their own longest stop.${detail.belowMinimum ? ` Below ${n(AGENT_MIN_SAMPLE)} meetings the team's median is not set beside it.` : ` "Team" is every agent's median stay in the same section.`}`,
            summary: `${detail.name}'s usual running order, with the median stay in each: ${sections.map((s) => `${s.label} (${s.dwellDisplay})`).join(", then ")}.`,
            figures: [
              figure("Meetings", n(detail.sampleSize), detail.name),
              figure("Sections", n(sections.length), "in their usual running order"),
            ] as const,
            rankingTitle: "Their longest stops",
            ranking: topThree(
              sections,
              (s) => s.medianDwellSeconds ?? 0,
              (s) => ({ id: s.sectionId, label: s.label, value: s.dwellDisplay }),
            ),
            rankingNote: "Median stay in each section, not the total.",
            /* The other end of the same question; a section the source could not time has no place on either. */
            alsoRanking: {
              title: "Their shortest stops",
              rows: sections
                .filter((s) => s.medianDwellSeconds !== null)
                .sort((a, b) => (a.medianDwellSeconds ?? 0) - (b.medianDwellSeconds ?? 0))
                .slice(0, 3)
                .map((s) => ({ id: s.sectionId, label: s.label, value: s.dwellDisplay })),
              note: "The shortest median stay first. A section the source could not time is in neither list.",
            },
          },
        };

  /* --- workload, as the product ranks it ---------------------------------------- */

  const rankedTotal = agentCharts.ranked.reduce((a, r) => a + r.value, 0);
  const ranked = {
    rows: agentCharts.ranked,
    facts: {
      note: `Presentations each agent gave ${period}, every meeting counted once whatever its outcome. Beside each name, the median length of their timed meetings, or, under ${n(AGENT_MIN_SAMPLE)} meetings, how far short they are. The order is workload, never a verdict on how the meetings went.`,
      summary: `${list(agentCharts.ranked.map((r) => `${r.label} ${r.display}`))}: ${n(rankedTotal)} presentations ${period}.`,
      figures: [
        figure("Agents", n(agentCharts.ranked.length), periodLabel),
        figure("Presentations", n(rankedTotal), "every agent together"),
      ] as const,
      rankingTitle: "Longest meetings",
      ranking: charts.longestMeetings
        .slice(0, 3)
        .map((r) => ({ id: r.id, label: r.label, value: r.display })),
      rankingNote: "Timed meetings only; a legacy import carries no duration.",
    },
  };

  return {
    projectName,
    period: D_PERIOD,
    periodLabel,
    windowLabel: charts.kpis.windowLabel,
    minimum: AGENT_MIN_SAMPLE,
    radarBasic: profileCard(drawn[0]),
    radarSimple: profileCard(drawn[1] ?? drawn[0]),
    radarMultiply,
    journeyFunnel,
    scatter,
    ring,
    funnelMultiply,
    heatmapBasic,
    heatmapGradient,
    bullet,
    stacked,
    trend,
    sparkline,
    ranked,
    kpi,
    sequence,
    parallel,
    radial,
    punch,
    dumbbell,
  };
}
