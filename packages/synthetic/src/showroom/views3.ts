import {
  AMENITIES,
  OUTCOME_LABELS,
  PLACE_CATEGORY_LABELS,
  SECTION_IDS,
  SURROUNDINGS,
  filterLabel,
  hasProgressed,
  outcomeIsUnknown,
  sectionLabel,
  type MeetingOutcome,
  type PlaceCategory,
  type SectionId,
  type ShowroomSession,
} from "@observer/contracts";
import type {
  AgentOutcomeRing,
  AgentProfile,
  AgentSectionUse,
  AgentsView,
  AudienceCriteria,
  AudienceView,
  FlowPeriod,
  HomeFigure,
  OutcomeSlice,
  PlaceInterest,
  ProjectView,
  RepeatDistribution,
  SalesFlowView,
  SegmentInterest,
  ShowroomFinding,
  ShowroomHome,
  ShowroomSignal,
  StatedDemand,
  ViewContext,
} from "@observer/readmodels";
import { RAW_CATALOGUE } from "../pulse";
import { count, evidenceRef, percent } from "../format";
import { SYNTHETIC_AGENTS, agentById } from "./sessions";

/**
 * The three views, projected.
 *
 * Split out from `project.ts` because they answer different questions and share
 * almost nothing: how the process performs, what buyers want, and how each
 * person presents. The opening screen is here too, because it is a summary of
 * all three and belongs beside them.
 */

const OBSERVED = ["IRIS_SHOWROOM_OBSERVED"] as const;
const DERIVED = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"] as const;
const WITH_OUTCOME = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
  "CRM_OUTCOME_CONTEXT",
] as const;

/** "1 meetings" is the kind of small wrongness that makes a product feel unfinished. */
export function meetings(n: number, locale: string): string {
  return `${count(n, locale)} meeting${n === 1 ? "" : "s"}`;
}

/* --- helpers ----------------------------------------------------------------- */

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
  const s = Math.round(seconds % 60);
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, "0")}s`;
}

function sectionSeconds(session: ShowroomSession, sectionId: SectionId): number {
  return session.steps
    .filter((s) => s.sectionId === sectionId)
    .reduce((a, s) => a + (s.dwellSeconds ?? 0), 0);
}

function totalSeconds(session: ShowroomSession): number {
  return session.steps.reduce((a, s) => a + (s.dwellSeconds ?? 0), 0);
}

/** The distinct sections a session touched, in the order it first touched them. */
function orderOf(session: ShowroomSession): SectionId[] {
  const seen: SectionId[] = [];
  for (const step of session.steps) if (!seen.includes(step.sectionId)) seen.push(step.sectionId);
  return seen;
}

/**
 * Where a section falls on average, 0 first and 1 last.
 *
 * A mean across meetings rather than one meeting's order: nobody presents in
 * exactly the same order twice, and a single sequence shown as "the" sequence
 * would be a claim the data does not support.
 */
function meanPosition(sessions: readonly ShowroomSession[], sectionId: SectionId): number {
  const positions = sessions
    .filter((s) => s.steps.some((x) => x.sectionId === sectionId))
    .map((s) => {
      const order = orderOf(s);
      return order.length <= 1 ? 0 : order.indexOf(sectionId) / (order.length - 1);
    });
  return positions.length === 0 ? 0 : positions.reduce((a, b) => a + b, 0) / positions.length;
}

/** Median seconds in one section, or null where no session could report timing. */
function sectionDwell(sessions: readonly ShowroomSession[], sectionId: SectionId): number | null {
  const dwells = sessions
    .flatMap((s) => s.steps.filter((x) => x.sectionId === sectionId))
    .map((x) => x.dwellSeconds)
    .filter((d): d is number => d !== null);
  return dwells.length === 0 ? null : Math.round(median(dwells));
}

/* --- time buckets ------------------------------------------------------------ */

/**
 * The named periods, resolved against a fixed "today".
 *
 * The synthetic world's today is 24 August 2026. Deriving the buckets from it
 * rather than from `Date.now()` keeps the dataset deterministic — a demo whose
 * figures change overnight cannot be screenshotted or asserted on.
 */
function bucketBounds(today: Date) {
  const day = 24 * 60 * 60 * 1000;
  const startOfDay = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const t0 = startOfDay(today).getTime();
  // Monday-based week, which is how Central European sales weeks are counted.
  const weekday = (startOfDay(today).getUTCDay() + 6) % 7;
  const thisWeek = t0 - weekday * day;
  const elapsedDays = weekday + 1;
  const thisMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const lastMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);

  return [
    { id: "today" as const, label: "Today", from: t0, to: t0 + day },
    { id: "yesterday" as const, label: "Yesterday", from: t0 - day, to: t0 },
    { id: "this_week" as const, label: "This week", from: thisWeek, to: t0 + day },
    /*
     * Last week is clipped to the same number of days.
     *
     * On a Monday "this week" is one day, and comparing it with a full seven
     * would report a collapse every Monday morning. The same clipping the
     * quarter-to-date period already uses.
     */
    {
      id: "last_week" as const,
      label:
        elapsedDays === 7
          ? "Last week"
          : `Last week, first ${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`,
      from: thisWeek - 7 * day,
      to: thisWeek - 7 * day + elapsedDays * day,
    },
    { id: "this_month" as const, label: "This month", from: thisMonth, to: t0 + day },
    { id: "last_month" as const, label: "Last month", from: lastMonth, to: thisMonth },
  ];
}

function buildPeriods(sessions: readonly ShowroomSession[], today: Date): FlowPeriod[] {
  return bucketBounds(today).map((b) => {
    const inside = sessions.filter((s) => {
      const at = Date.parse(s.startedAt);
      return at >= b.from && at < b.to;
    });
    const timed = inside.filter((s) => !s.timingUnavailable).map((s) => s.durationSeconds);
    const med = timed.length === 0 ? null : Math.round(median(timed));

    return {
      id: b.id,
      label: b.label,
      meetings: inside.length,
      medianDurationSeconds: med,
      // Never "0m 00s" for a period with no meetings: there is no duration to
      // report, which is a different statement from a duration of zero.
      medianDurationDisplay: med === null ? "—" : duration(med),
      outcomeRecorded: inside.filter((s) => !outcomeIsUnknown(s.outcome)).length,
      progressed: inside.filter((s) => hasProgressed(s.outcome)).length,
    } satisfies FlowPeriod;
  });
}

/* --- outcome rings ----------------------------------------------------------- */

function outcomeSlices(sessions: readonly ShowroomSession[]): OutcomeSlice[] {
  const counts = new Map<MeetingOutcome, number>();
  for (const s of sessions) counts.set(s.outcome, (counts.get(s.outcome) ?? 0) + 1);
  const order: MeetingOutcome[] = [
    "purchase",
    "reservation",
    "interested",
    "follow_up_needed",
    "presentation_only",
    "not_interested",
    "skipped",
  ];
  return order
    .filter((o) => (counts.get(o) ?? 0) > 0)
    .map((o) => ({
      outcome: o,
      label: OUTCOME_LABELS[o],
      count: counts.get(o) ?? 0,
      share: share(counts.get(o) ?? 0, sessions.length),
    }));
}

/**
 * A flag, not a score.
 *
 * Raised when a pattern is worth a conversation and stated as one. "Nine of
 * fourteen ended not interested" is a fact an agent can respond to; a rank out
 * of four is a verdict on the person, which is the league table this product
 * refuses to be.
 */
function outcomeFlag(
  sessions: readonly ShowroomSession[],
  teamProgressed: number,
): AgentOutcomeRing["flag"] {
  if (sessions.length < 8) return null;
  const decided = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  if (decided.length < 6) {
    return {
      severity: "watch",
      text: `${sessions.length - decided.length} of ${sessions.length} meetings ended with no outcome recorded, so most of these cannot be read at all.`,
    };
  }
  const notInterested = decided.filter((s) => s.outcome === "not_interested").length;
  const progressed = share(decided.filter((s) => hasProgressed(s.outcome)).length, decided.length);

  if (share(notInterested, decided.length) > 0.35) {
    return {
      severity: "concern",
      text: `${notInterested} of ${decided.length} recorded meetings ended "not interested" — worth watching the presentation itself, not only the pipeline.`,
    };
  }
  if (progressed < teamProgressed * 0.75) {
    return {
      severity: "watch",
      text: `${percent(progressed, "en-GB")} progressed against ${percent(teamProgressed, "en-GB")} for the team, over ${decided.length} recorded meetings.`,
    };
  }
  return null;
}

function buildRing(
  session: readonly ShowroomSession[],
  agentId: string,
  name: string,
  base: string,
  teamProgressed: number,
): AgentOutcomeRing {
  const decided = session.filter((s) => !outcomeIsUnknown(s.outcome));
  return {
    agentId,
    name,
    meetings: session.length,
    slices: outcomeSlices(session),
    progressedShare: share(decided.filter((s) => hasProgressed(s.outcome)).length, decided.length),
    flag: outcomeFlag(session, teamProgressed),
    href: `${base}/agents?agent=${agentId}`,
  };
}

/* --- 1. Sales Flow ----------------------------------------------------------- */

export function buildSalesFlow(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  today: Date,
): SalesFlowView {
  const locale = context.project.locale;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const periods = buildPeriods(sessions, today);
  const decided = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  const teamProgressed = share(
    decided.filter((s) => hasProgressed(s.outcome)).length,
    decided.length,
  );

  const rings = SYNTHETIC_AGENTS.map((a) =>
    buildRing(
      sessions.filter((s) => s.agentId === a.id),
      a.id,
      a.name,
      base,
      teamProgressed,
    ),
  ).filter((r) => r.meetings > 0);

  const unrecorded = sessions.length - decided.length;
  const findings: ShowroomFinding[] = [];

  const flagged = rings.filter((r) => r.flag !== null);
  if (flagged[0]?.flag != null) {
    findings.push({
      id: `flow-flag-${flagged[0].agentId}`,
      statement: `${flagged[0].name}: ${flagged[0].flag.text}`,
      baseline: `${percent(teamProgressed, locale)} of the team's recorded meetings progressed`,
      soWhat:
        "A pattern in how meetings end is a prompt to look at how they are run — the presentation, the pacing, what gets shown. It is not a judgement on the person.",
      nextStep: { label: `Open ${flagged[0].name.split(" ")[0]}`, href: flagged[0].href },
      evidence: evidenceRef(
        `flow-${flagged[0].agentId}`,
        "statistical_association",
        flagged[0].href,
        flagged[0].meetings,
      ),
      sampleSize: flagged[0].meetings,
      sources: [...WITH_OUTCOME],
      caveat: null,
    });
  }

  if (unrecorded > 0) {
    findings.push({
      id: "flow-unrecorded",
      statement: `${count(unrecorded, locale)} of ${count(sessions.length, locale)} meetings ended with no outcome recorded.`,
      baseline: `${percent(share(unrecorded, sessions.length), locale)} of the period`,
      soWhat:
        "Every comparison that uses outcome silently drops these. The fix is a habit at the end of the meeting, not a change to the data.",
      nextStep: { label: "See the meetings", href: `${base}/meetings` },
      evidence: evidenceRef("flow-unrecorded", "observed_sequence", `${base}/meetings`, unrecorded),
      sampleSize: sessions.length,
      sources: [...WITH_OUTCOME],
      caveat: null,
    });
  }

  const week = periods.find((p) => p.id === "this_week");
  const lastWeek = periods.find((p) => p.id === "last_week");
  const verdict =
    week === undefined || lastWeek === undefined
      ? `${count(sessions.length, locale)} meetings this period.`
      : `${meetings(week.meetings, locale)} this week against ${count(lastWeek.meetings, locale)} last week, and ${percent(teamProgressed, locale)} of recorded meetings are progressing.`;

  return {
    context,
    verdict,
    periods,
    outcomes: outcomeSlices(sessions),
    rings,
    findings,
    meetingCount: sessions.length,
    evidence: evidenceRef("sales-flow", "observed_sequence", `${base}/flow`, sessions.length),
  };
}

/* --- 2. Project -------------------------------------------------------------- */

const SEGMENTS = [
  { id: "rooms-2", label: "Two-room", rooms: 2 },
  { id: "rooms-3", label: "Three-room", rooms: 3 },
] as const;

function buildSegment(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  spec: (typeof SEGMENTS)[number],
): SegmentInterest {
  const locale = context.project.locale;
  const inSegment = new Set(RAW_CATALOGUE.filter((u) => u.rooms === spec.rooms).map((u) => u.code));
  const available = RAW_CATALOGUE.filter((u) => u.rooms === spec.rooms && u.status === "available");
  const allAvailable = RAW_CATALOGUE.filter((u) => u.status === "available");

  const touches = sessions.flatMap((s) => s.units);
  const mine = touches.filter((t) => inSegment.has(t.unitCode));

  const totalDwell = touches.reduce((a, t) => a + t.dwellSeconds, 0);
  const myDwell = mine.reduce((a, t) => a + t.dwellSeconds, 0);

  const favAll = touches.filter((t) => t.favourited).length;
  const cmpAll = touches.filter((t) => t.comparedWith.length > 0).length;
  const shrAll = touches.filter((t) => t.shared).length;

  const meetings = sessions.filter((s) => s.units.some((u) => inSegment.has(u.unitCode)));

  /* What did the people looking at this segment attend to? */
  const placeSeconds = new Map<string, { label: string; category: string; secs: number }>();
  for (const s of meetings) {
    for (const p of s.places) {
      const e = placeSeconds.get(p.placeId) ?? {
        label: p.placeName,
        category: p.category,
        secs: 0,
      };
      e.secs += p.dwellSeconds;
      placeSeconds.set(p.placeId, e);
    }
  }
  const placeTotal = [...placeSeconds.values()].reduce((a, e) => a + e.secs, 0);

  const sectionSecs = SECTION_IDS.map((id) => ({
    sectionId: id,
    label: sectionLabel(id),
    secs: meetings.reduce((a, s) => a + sectionSeconds(s, id), 0),
  }));
  const sectionTotal = sectionSecs.reduce((a, s) => a + s.secs, 0);

  const stockShare = share(available.length, allAvailable.length);
  const attentionShare = share(myDwell, totalDwell);
  const index = stockShare === 0 ? 0 : attentionShare / stockShare;

  const topPlace = [...placeSeconds.values()].sort((a, b) => b.secs - a.secs)[0];

  /* How they examined these units, against how they examined everything else. */
  const others = touches.filter((t) => !inSegment.has(t.unitCode));
  const rate = (xs: typeof touches, f: (t: (typeof touches)[number]) => boolean) =>
    share(xs.filter(f).length, xs.length);

  const examinedHow = [
    {
      id: "balcony",
      label: "Balcony view",
      f: (t: (typeof touches)[number]) => t.balconyViews > 0,
    },
    {
      id: "floor_cut",
      label: "Floor cut",
      f: (t: (typeof touches)[number]) => t.floorCutViews > 0,
    },
    { id: "plan", label: "Floor plan opened", f: (t: (typeof touches)[number]) => t.pdfOpened },
    {
      id: "screenshot",
      label: "Screenshot",
      f: (t: (typeof touches)[number]) => t.screenshots > 0,
    },
    { id: "shared", label: "Shared", f: (t: (typeof touches)[number]) => t.shared },
  ]
    .map((e) => ({ id: e.id, label: e.label, rate: rate(mine, e.f), otherRate: rate(others, e.f) }))
    .sort((a, b) => b.rate - a.rate);

  return {
    id: spec.id,
    label: spec.label,
    availableUnits: available.length,
    stockShare,
    attentionShare,
    favouriteShare: share(mine.filter((t) => t.favourited).length, favAll),
    compareShare: share(mine.filter((t) => t.comparedWith.length > 0).length, cmpAll),
    shareShare: share(mine.filter((t) => t.shared).length, shrAll),
    index,
    meetings: meetings.length,
    attendedTo: [...placeSeconds.values()]
      .sort((a, b) => b.secs - a.secs)
      .slice(0, 6)
      .map((e) => ({ label: e.label, category: e.category, share: share(e.secs, placeTotal) })),
    sections: sectionSecs
      .filter((s) => s.secs > 0)
      .sort((a, b) => b.secs - a.secs)
      .slice(0, 5)
      .map((s) => ({ sectionId: s.sectionId, label: s.label, share: share(s.secs, sectionTotal) })),
    /*
     * The sentence a marketer can act on.
     *
     * It names the segment, whether interest matches supply, and the single
     * thing those buyers spent most of their time on — which is the input to
     * "what should the next campaign show".
     */
    examinedHow,
    soWhat:
      topPlace === undefined
        ? `${spec.label} units are ${percent(stockShare, locale)} of available stock and take ${percent(attentionShare, locale)} of the time spent looking at units.`
        : `${spec.label} units take ${percent(attentionShare, locale)} of looking time on ${percent(stockShare, locale)} of the stock. The buyers who opened them spent longest on ${topPlace.label}, and ${percent(examinedHow[0]?.rate ?? 0, locale)} of the units they opened got a ${(examinedHow[0]?.label ?? "closer look").toLowerCase()}.`,
  };
}

export function buildProjectView(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  selectedSegmentId: string | null,
): ProjectView {
  const locale = context.project.locale;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const segments = SEGMENTS.map((spec) => buildSegment(context, sessions, spec));
  const selected = segments.find((s) => s.id === selectedSegmentId) ?? null;

  /* Stated demand. */
  const demandMap = new Map<string, StatedDemand>();
  for (const s of sessions) {
    for (const f of s.filters) {
      const key = `${f.field}:${f.value}`;
      const existing = demandMap.get(key);
      demandMap.set(key, {
        field: f.field,
        label: filterLabel(f.field),
        value: f.value,
        applications: (existing?.applications ?? 0) + 1,
        matches: f.matches,
        availability: "requires_ue5_v2_event",
      });
    }
  }
  const demand = [...demandMap.values()].sort((a, b) => b.applications - a.applications);

  /* Places. */
  const placeMap = new Map<
    string,
    {
      name: string;
      category: PlaceCategory;
      section: "surroundings" | "amenities";
      secs: number[];
      meetings: Set<string>;
      availability: "legacy_available" | "requires_ue5_v2_event";
    }
  >();
  for (const s of sessions) {
    for (const p of s.places) {
      const e = placeMap.get(p.placeId) ?? {
        name: p.placeName,
        category: p.category as PlaceCategory,
        section: p.section,
        secs: [],
        meetings: new Set<string>(),
        availability:
          p.availability === "legacy_available"
            ? ("legacy_available" as const)
            : ("requires_ue5_v2_event" as const),
      };
      e.secs.push(p.dwellSeconds);
      e.meetings.add(s.meetingId);
      placeMap.set(p.placeId, e);
    }
  }
  const places: PlaceInterest[] = [...placeMap.entries()]
    .map(([placeId, e]) => ({
      placeId,
      name: e.name,
      category: e.category,
      section: e.section,
      meetings: e.meetings.size,
      totalDwellSeconds: e.secs.reduce((a, b) => a + b, 0),
      medianDwellSeconds: Math.round(median(e.secs)),
      availability: e.availability,
    }))
    .sort((a, b) => b.totalDwellSeconds - a.totalDwellSeconds);

  const categoryTotals = new Map<PlaceCategory, { secs: number; meetings: Set<string> }>();
  for (const s of sessions) {
    for (const p of s.places) {
      const c = p.category as PlaceCategory;
      const e = categoryTotals.get(c) ?? { secs: 0, meetings: new Set<string>() };
      e.secs += p.dwellSeconds;
      e.meetings.add(s.meetingId);
      categoryTotals.set(c, e);
    }
  }
  const categoryGrand = [...categoryTotals.values()].reduce((a, e) => a + e.secs, 0);
  const placeCategories = [...categoryTotals.entries()]
    .map(([category, e]) => ({
      category,
      label: PLACE_CATEGORY_LABELS[category],
      share: share(e.secs, categoryGrand),
      meetings: e.meetings.size,
    }))
    .sort((a, b) => b.share - a.share);

  const findings: ShowroomFinding[] = [];

  const twoRoom = segments.find((s) => s.id === "rooms-2");
  if (twoRoom !== undefined && twoRoom.meetings > 5) {
    findings.push({
      id: "project-segment",
      statement: `${twoRoom.label} units draw ${twoRoom.index.toFixed(2)}× their share of looking time, and ${percent(twoRoom.favouriteShare, locale)} of every shortlisting in the period.`,
      baseline: `${percent(twoRoom.stockShare, locale)} of available stock`,
      soWhat: twoRoom.soWhat,
      nextStep: { label: `Open ${twoRoom.label}`, href: `${base}/project?segment=${twoRoom.id}` },
      evidence: evidenceRef(
        "project-segment",
        "statistical_association",
        `${base}/project`,
        twoRoom.meetings,
      ),
      sampleSize: twoRoom.meetings,
      sources: [...DERIVED],
      caveat: null,
    });
  }

  const zeroResult = demand.filter((d) => d.matches === 0);
  if (zeroResult.length > 0) {
    const z = zeroResult[0] as StatedDemand;
    findings.push({
      id: "project-zero-result",
      statement: `Buyers asked for ${z.label.toLowerCase()} ${z.value} ${count(z.applications, locale)} times, and no available unit matched.`,
      baseline: "zero of the available stock",
      soWhat:
        "A search with no answer is the clearest demand signal a project gets, and the only one that names something the building does not have.",
      nextStep: null,
      evidence: evidenceRef(
        `demand-${z.field}`,
        "observed_sequence",
        `${base}/project`,
        z.applications,
      ),
      sampleSize: sessions.length,
      sources: [...OBSERVED],
      caveat:
        "Filter state is not emitted by the current showroom build. This is a demonstration of what the UE5 v2 event would answer.",
    });
  }

  const topCategory = placeCategories[0];
  if (topCategory !== undefined) {
    findings.push({
      id: "project-places",
      statement: `${topCategory.label} places take ${percent(topCategory.share, locale)} of all the time spent on the neighbourhood and the building.`,
      baseline: `${count(topCategory.meetings, locale)} meetings reached them`,
      soWhat:
        "What buyers linger on is the argument they are buying. It is also the sharpest way to pick who to contact when something in that category changes.",
      nextStep: {
        label: "Build an audience",
        href: `${base}/audience?category=${topCategory.category}`,
      },
      evidence: evidenceRef(
        "project-places",
        "observed_sequence",
        `${base}/project`,
        sessions.length,
      ),
      sampleSize: sessions.length,
      sources: [...OBSERVED],
      caveat:
        "Points of interest in Surroundings need a UE5 v2 event; amenities are recorded at item level today.",
    });
  }

  return {
    context,
    verdict:
      twoRoom === undefined
        ? `${meetings(sessions.length, locale)}.`
        : `Two-room units are ${percent(twoRoom.stockShare, locale)} of the stock and take ${percent(twoRoom.attentionShare, locale)} of the attention.`,
    segments,
    selectedSegment: selected,
    demand,
    places: places.slice(0, 18),
    placeCategories,
    findings,
    meetingCount: sessions.length,
    evidence: evidenceRef("project-view", "observed_sequence", `${base}/project`, sessions.length),
  };
}

/* --- 3. Sales Agents --------------------------------------------------------- */

function repeatDistribution(sessions: readonly ShowroomSession[]): RepeatDistribution[] {
  const buckets = [0, 1, 2, 3];
  return buckets
    .map((visits) => {
      const inside = sessions.filter((s) =>
        visits === 3 ? s.priorMeetings >= 3 : s.priorMeetings === visits,
      );
      return {
        visits,
        label:
          visits === 0
            ? "First meeting"
            : visits === 3
              ? "Fourth or later"
              : `${visits + 1}${visits === 1 ? "nd" : "rd"} meeting`,
        meetings: inside.length,
        share: share(inside.length, sessions.length),
      };
    })
    .filter((b) => b.meetings > 0);
}

export function buildAgentsView(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  showRatings: boolean,
): AgentsView {
  const locale = context.project.locale;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const decided = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  const teamProgressed = share(
    decided.filter((s) => hasProgressed(s.outcome)).length,
    decided.length,
  );

  const teamSectionSecs = new Map<SectionId, number>();
  for (const s of sessions) {
    for (const id of SECTION_IDS) {
      teamSectionSecs.set(id, (teamSectionSecs.get(id) ?? 0) + sectionSeconds(s, id));
    }
  }
  const teamTotal = [...teamSectionSecs.values()].reduce((a, b) => a + b, 0);

  const agents: AgentProfile[] = SYNTHETIC_AGENTS.flatMap<AgentProfile>((a) => {
    const mine = sessions.filter((s) => s.agentId === a.id);
    if (mine.length === 0) return [];

    const myTotal = mine.reduce((acc, s) => acc + totalSeconds(s), 0);
    /*
     * One row per section, carrying the whole answer.
     *
     * Order, median time, reach, returns, and the team's figure beside each —
     * rather than a share-of-time chart here and an order-and-timing chart
     * somewhere else. Two views of the same measurement in two places is how a
     * reader ends up comparing a chart against itself.
     */
    const sections: AgentSectionUse[] = SECTION_IDS.map((id) => {
      const secs = mine.reduce((acc, s) => acc + sectionSeconds(s, id), 0);
      const dwell = sectionDwell(mine, id);
      const teamDwell = sectionDwell(sessions, id);
      return {
        sectionId: id,
        label: sectionLabel(id),
        order: 0,
        position: meanPosition(mine, id),
        medianDwellSeconds: dwell,
        // Null, never zero: a section nobody's session could time has no median,
        // and printing 0s would claim they passed through it instantly.
        dwellDisplay: dwell === null ? "—" : duration(dwell),
        timeShare: share(secs, myTotal),
        teamShare: share(teamSectionSecs.get(id) ?? 0, teamTotal),
        teamDwellDisplay: teamDwell === null ? "—" : duration(teamDwell),
        reachRate: share(
          mine.filter((s) => s.steps.some((x) => x.sectionId === id)).length,
          mine.length,
        ),
        returnRate: share(
          mine.filter((s) => s.steps.some((x) => x.sectionId === id && x.isReturn)).length,
          Math.max(1, mine.filter((s) => s.steps.some((x) => x.sectionId === id)).length),
        ),
        availability: dwell === null ? "requires_ue5_v2_event" : "legacy_available",
      } satisfies AgentSectionUse;
    })
      .filter((s) => s.reachRate > 0)
      // Running order, because the question is what they open and in what order.
      .sort((x, y) => x.position - y.position)
      .map((s, i) => ({ ...s, order: i + 1 }));

    const over = [...sections]
      .filter((s) => s.teamShare > 0.02)
      .sort((x, y) => y.timeShare / y.teamShare - x.timeShare / x.teamShare)[0];

    const rated = mine.filter((s) => s.irisRating !== null);
    const timed = mine.filter((s) => !s.timingUnavailable).map((s) => s.durationSeconds);

    return {
      agentId: a.id,
      name: a.name,
      meetings: mine.length,
      medianDurationDisplay: timed.length === 0 ? "—" : duration(Math.round(median(timed))),
      ring: buildRing(mine, a.id, a.name, base, teamProgressed),
      repeats: repeatDistribution(mine),
      sections,
      signature:
        over === undefined || over.teamShare === 0
          ? null
          : { label: over.label, overIndex: over.timeShare / over.teamShare },
      irisRating:
        showRatings && rated.length > 0
          ? {
              mean: rated.reduce((acc, s) => acc + (s.irisRating ?? 0), 0) / rated.length,
              responses: rated.length,
            }
          : null,
      href: `${base}/agents?agent=${a.id}`,
    } satisfies AgentProfile;
  });

  const findings: ShowroomFinding[] = [];
  const distinct = agents
    .filter((a) => a.signature !== null)
    .sort((x, y) => (y.signature?.overIndex ?? 0) - (x.signature?.overIndex ?? 0))[0];

  if (distinct?.signature != null) {
    findings.push({
      id: "agents-signature",
      statement: `${distinct.name} spends ${distinct.signature.overIndex.toFixed(1)}× the team's share of presentation time in ${distinct.signature.label}.`,
      baseline: `${count(distinct.meetings, locale)} meetings`,
      soWhat:
        "A presenter's habit is visible long before its result is. Whether it is worth copying or worth changing is a coaching conversation this figure can start.",
      nextStep: { label: `Open ${distinct.name.split(" ")[0]}`, href: distinct.href },
      evidence: evidenceRef(
        `agent-signature-${distinct.agentId}`,
        "observed_sequence",
        distinct.href,
        distinct.meetings,
      ),
      sampleSize: distinct.meetings,
      sources: [...DERIVED],
      caveat: null,
    });
  }

  const repeats = repeatDistribution(sessions);
  const first = repeats.find((r) => r.visits === 0);
  if (first !== undefined && first.share > 0.7) {
    findings.push({
      id: "agents-repeats",
      statement: `${percent(first.share, locale)} of meetings were a buyer's first.`,
      baseline: `${count(sessions.length, locale)} meetings`,
      soWhat:
        "A project whose meetings are almost all first meetings is filling the top of the pipeline and not yet working it.",
      nextStep: { label: "See the meetings", href: `${base}/meetings` },
      evidence: evidenceRef(
        "agents-repeats",
        "observed_sequence",
        `${base}/meetings`,
        sessions.length,
      ),
      sampleSize: sessions.length,
      sources: [...DERIVED],
      caveat:
        "Only a contact Observer already knows can be counted as returning; a walk-in has no history.",
    });
  }

  return {
    context,
    verdict: `${count(agents.length, locale)} agents presented ${meetings(sessions.length, locale)}, and they do not present alike.`,
    agents,
    repeats,
    findings,
    showRatings,
    meetingCount: sessions.length,
    evidence: evidenceRef("agents-view", "observed_sequence", `${base}/agents`, sessions.length),
  };
}

/* --- the audience builder ---------------------------------------------------- */

export function buildAudience(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  criteria: AudienceCriteria,
): AudienceView {
  const locale = context.project.locale;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const roomCodes =
    criteria.rooms === null
      ? null
      : new Set(RAW_CATALOGUE.filter((u) => u.rooms === criteria.rooms).map((u) => u.code));

  const matches = sessions
    .filter((s) => {
      const units = criteria.favouritedOnly ? s.units.filter((u) => u.favourited) : s.units;
      const unitOk =
        roomCodes === null ? units.length > 0 : units.some((u) => roomCodes.has(u.unitCode));
      const placeOk =
        criteria.placeCategory === null ||
        s.places.some(
          (p) =>
            p.category === criteria.placeCategory && p.dwellSeconds >= criteria.minimumPlaceSeconds,
        );
      return unitOk && placeOk;
    })
    .map((s) => {
      const agent = agentById(s.agentId);
      const places = s.places
        .filter((p) => criteria.placeCategory === null || p.category === criteria.placeCategory)
        .sort((a, b) => b.dwellSeconds - a.dwellSeconds)
        .slice(0, 2);
      const units = (criteria.favouritedOnly ? s.units.filter((u) => u.favourited) : s.units)
        .filter((u) => roomCodes === null || roomCodes.has(u.unitCode))
        .map((u) => u.unitCode)
        .slice(0, 3);

      return {
        meetingId: s.meetingId,
        startedDisplay: new Date(s.startedAt).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
        }),
        agentName: agent?.name ?? s.agentId,
        outcomeLabel: OUTCOME_LABELS[s.outcome],
        because:
          places.length === 0
            ? `${units.join(", ")}`
            : `${units.join(", ")} · ${places.map((p) => `${p.placeName} ${p.dwellSeconds}s`).join(", ")}`,
        href: `${base}/meetings/${s.meetingId}`,
      };
    });

  const roomText = criteria.rooms === null ? "any unit" : `a ${criteria.rooms}-room unit`;
  const favText = criteria.favouritedOnly ? "shortlisted" : "opened";
  const placeText =
    criteria.placeCategory === null
      ? ""
      : ` and spent at least ${criteria.minimumPlaceSeconds} seconds on ${PLACE_CATEGORY_LABELS[criteria.placeCategory].toLowerCase()} places`;

  return {
    context,
    criteria,
    description: `Meetings where the buyer ${favText} ${roomText}${placeText}.`,
    matches,
    total: matches.length,
    ofMeetings: sessions.length,
    caveats: [
      "This selects meetings, not people. Open a meeting to reach the contact — identity stays on the surface that already governs it.",
      // A privacy guarantee, not a product-boundary note: it stays on screen.
      "Time spent on a category of place is a behaviour, not a fact about anyone's household. Family status is never inferred from it.",
      ...(criteria.placeCategory === null
        ? []
        : [
            "Points of interest in Surroundings need a UE5 v2 event. Amenity items are recorded today; both are shown here as a demonstration.",
          ]),
    ],
    evidence: evidenceRef(
      `audience-${criteria.rooms ?? "any"}-${criteria.placeCategory ?? "any"}`,
      "observed_sequence",
      `${base}/audience`,
      matches.length,
    ),
  };
}

/* --- the opening screen ------------------------------------------------------ */

export function buildHome(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  previous: readonly ShowroomSession[],
  today: Date,
): ShowroomHome {
  const locale = context.project.locale;
  const base = `/${context.tenant.slug}/${context.project.slug}`;

  const decided = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  const progressed = share(decided.filter((s) => hasProgressed(s.outcome)).length, decided.length);
  const previousDecided = previous.filter((s) => !outcomeIsUnknown(s.outcome));
  const previousProgressed = share(
    previousDecided.filter((s) => hasProgressed(s.outcome)).length,
    previousDecided.length,
  );

  const periods = buildPeriods(sessions, today);
  const week = periods.find((p) => p.id === "this_week")?.meetings ?? 0;
  const lastWeek = periods.find((p) => p.id === "last_week")?.meetings ?? 0;

  /*
   * The signal.
   *
   * Volume and progression together, because either alone misleads: a busy
   * period where nothing progresses is not good, and a quiet period where
   * everything progresses is not either.
   *
   * Volume falls back to the month when the week is too small to read. One
   * meeting against two is a difference of one meeting, and calling that a
   * downturn on the opening screen would train the reader to ignore the signal.
   */
  const month = periods.find((p) => p.id === "this_month")?.meetings ?? 0;
  const lastMonth = periods.find((p) => p.id === "last_month")?.meetings ?? 0;
  const weekIsReadable = week + lastWeek >= 8;
  /*
   * Three states, not two: better, worse, and *unknowable*.
   *
   * A project with no CRM connected records no outcome, so its progression rate
   * is undefined — and `0%` is the one rendering of undefined that reads as a
   * measured result. Riverside and Kingsford both reported "0% progressing"
   * against "0% before", which told the reader that nobody progressed when the
   * truth is that nothing recorded whether they did.
   */
  const outcomesRecorded = decided.length > 0;
  const hasBaseline = previous.length > 0;

  const volumeOk = weekIsReadable
    ? week >= lastWeek * 0.8
    : lastMonth === 0
      ? month > 0
      : month >= lastMonth * 0.8;
  const progressOk =
    previousProgressed === 0 ? progressed > 0.3 : progressed >= previousProgressed * 0.9;

  /*
   * Without outcomes the signal rests on volume alone, and says so.
   *
   * Grading a project on a rate it cannot measure would put a confident colour
   * on the screen with nothing behind it.
   */
  const signal: ShowroomSignal = !outcomesRecorded
    ? "attention"
    : volumeOk && progressOk
      ? "good"
      : !volumeOk && !progressOk
        ? "poor"
        : "attention";

  const verdict = !outcomesRecorded
    ? "The showroom is running; no outcomes are being recorded."
    : signal === "good"
      ? "The showroom is on course."
      : signal === "poor"
        ? "The showroom is going the wrong way."
        : "The showroom needs a look.";

  /*
   * The progression clause, or an honest statement that there is none.
   *
   * Returned with the joining punctuation it needs, because a clause that
   * sometimes continues the sentence and sometimes starts a new one cannot be
   * glued on with one fixed separator without producing ". and 40%".
   */
  const progressClause = !outcomesRecorded
    ? ". No meeting outcome has been recorded on this project, so no progression rate can be computed."
    : hasBaseline
      ? `, and ${percent(progressed, locale)} of recorded meetings progressing against ${percent(previousProgressed, locale)} before.`
      : `, and ${percent(progressed, locale)} of recorded meetings progressing. There is no earlier period to compare against.`;

  const because = weekIsReadable
    ? `${meetings(week, locale)} this week against ${count(lastWeek, locale)} last week${progressClause}`
    : `${meetings(month, locale)} this month against ${count(lastMonth, locale)} last month${progressClause}` +
      " This week is too early to read on its own.";

  const figures: HomeFigure[] = [
    {
      id: "meetings",
      label: weekIsReadable ? "Meetings this week" : "Meetings this month",
      value: count(weekIsReadable ? week : month, locale),
      against: weekIsReadable
        ? `${count(lastWeek, locale)} last week`
        : `${count(lastMonth, locale)} last month`,
      direction: weekIsReadable
        ? week > lastWeek
          ? "up"
          : week < lastWeek
            ? "down"
            : "flat"
        : month > lastMonth
          ? "up"
          : month < lastMonth
            ? "down"
            : "flat",
      better: "up",
      measurementId: "showroom.presentations",
    },
    {
      id: "progressed",
      label: "Progressing",
      // An em dash, not a zero. The figure is unavailable, not nil.
      value: outcomesRecorded ? percent(progressed, locale) : "—",
      against: !outcomesRecorded
        ? "no outcome recorded on this project"
        : hasBaseline
          ? `${percent(previousProgressed, locale)} in the previous period`
          : "no earlier period to compare",
      direction:
        !outcomesRecorded || !hasBaseline
          ? "flat"
          : progressed > previousProgressed
            ? "up"
            : progressed < previousProgressed
              ? "down"
              : "flat",
      // Nothing to grade when nothing was measured.
      better: outcomesRecorded && hasBaseline ? "up" : "neither",
      measurementId: null,
    },
    {
      id: "unrecorded",
      label: outcomesRecorded ? "Outcome not recorded" : "Awaiting a CRM connection",
      value: count(sessions.length - decided.length, locale),
      against: `of ${count(sessions.length, locale)} meetings`,
      direction: "flat",
      better: outcomesRecorded ? "down" : "neither",
      measurementId: null,
    },
  ];

  /* The one thing worth acting on. */
  const teamProgressed = progressed;
  const flagged = SYNTHETIC_AGENTS.map((a) => {
    const mine = sessions.filter((s) => s.agentId === a.id);
    return { agent: a, flag: outcomeFlag(mine, teamProgressed), meetings: mine.length };
  }).filter((f) => f.flag?.severity === "concern")[0];

  const alert =
    flagged?.flag == null
      ? null
      : {
          text: `${flagged.agent.name}: ${flagged.flag.text}`,
          href: `${base}/agents?agent=${flagged.agent.id}`,
        };

  const project = buildProjectView(context, sessions, "rooms-2");
  const twoRoom = project.segments.find((s) => s.id === "rooms-2");
  const agents = SYNTHETIC_AGENTS.filter((a) => sessions.some((s) => s.agentId === a.id)).length;

  return {
    context,
    signal,
    verdict,
    because,
    figures,
    alert,
    doors: [
      {
        id: "flow",
        label: "Sales Flow",
        question: "How is the process performing?",
        headline: `${meetings(sessions.length, locale)} · ${percent(progressed, locale)} progressing`,
        href: `${base}/flow`,
      },
      {
        id: "project",
        label: "Project",
        question: "What do buyers want, and what do they linger on?",
        headline:
          twoRoom === undefined
            ? "Segments, filters and places"
            : `Two-room units draw ${twoRoom.index.toFixed(1)}× their share of attention`,
        href: `${base}/project`,
      },
      {
        id: "agents",
        label: "Sales Agents",
        question: "How does each person present, and how do their meetings end?",
        headline: `${count(agents, locale)} agents · outcome mix side by side`,
        href: `${base}/agents`,
      },
    ],
    meetingCount: sessions.length,
    sources: [...WITH_OUTCOME],
    evidence: evidenceRef("home", "observed_sequence", `${base}/flow`, sessions.length),
  };
}

export { AMENITIES, SURROUNDINGS };
