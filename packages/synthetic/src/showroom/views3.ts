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
  AttentionView,
  AgentSectionUse,
  AgentsView,
  AudienceCriteria,
  AudienceView,
  DeliveredDeals,
  FlowPeriod,
  HomeFigure,
  OutcomeSlice,
  PlaceInterest,
  ProjectView,
  RepeatDistribution,
  SalesFlowView,
  SegmentConversion,
  SegmentInterest,
  ShowroomFinding,
  ShowroomHome,
  ShowroomSignal,
  StatedDemand,
  ViewContext,
} from "@observer/readmodels";
import { actionWorthTaking, nothingReceivedYet } from "@observer/readmodels";
import {
  UNSTATED_ROOMS_SEGMENT,
  catalogueFor,
  hasUnstatedRooms,
  roomCounts,
  roomLabel,
} from "../pulse";
import { AGENT_MIN_SAMPLE, DEFAULT_IRIS_ASSIST_POLICY } from "@observer/metrics";
import { buildAssistedSales, buildDealLadder } from "../deals";
import { count, dayLabel, evidenceRef, percent } from "../format";
import { startOfDayIn, startOfMonthIn, startOfWeekIn, zoneParts } from "../time";
import { agentById, presenterName, presentersIn } from "./sessions";

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

/**
 * Three states rather than a hard cutoff's two.
 *
 * A ratio a hair below `floor` and one a hair above it are not different
 * facts, but a bare `>=` treats them as opposites — enough to flip a verdict
 * on one extra meeting. Below `floor - DEADBAND` reads as `"down"`; at or
 * above `floor` reads as `"up"`; the gap between reads as `"flat"`, which is
 * not a decline and not yet a confirmed hold either.
 */
export type Trend = "down" | "flat" | "up";
export const DEADBAND = 0.05;
export function trend(ratio: number, floor: number): Trend {
  if (ratio < floor - DEADBAND) return "down";
  if (ratio >= floor) return "up";
  return "flat";
}

function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, "0")}s`;
}

/**
 * Seconds the source could time, and only those.
 *
 * `dwellSeconds` is null where the source cannot say — "never inferred", the
 * contract says at `packages/contracts/src/showroom.ts:168`. These two used to
 * read `?? 0`, which turned that null into a nought and added it to both the
 * numerator and the denominator of every share built on them. Measured before
 * the change: the fixtures' nulls are whole sessions (25 untimed across two
 * schemes), which contribute nought to both sides and move no share — but the
 * ingest path can deliver a session with SOME steps timed, and there a zeroed
 * unknown shrinks the denominator and inflates every section at once.
 *
 * A null step is skipped, not counted. What that leaves is "the time the
 * source could time", and the readers that publish a share of it now also
 * publish how many meetings that is — `AgentProfile.timedMeetings`,
 * `AgentsView.timedMeetingCount` — so "share of presentation time" is a claim
 * about a stated set rather than an implied whole.
 */
function sectionSeconds(session: ShowroomSession, sectionId: SectionId): number {
  return session.steps
    .filter((s) => s.sectionId === sectionId && s.dwellSeconds !== null)
    .reduce((a, s) => a + (s.dwellSeconds ?? 0), 0);
}

function totalSeconds(session: ShowroomSession): number {
  return session.steps
    .filter((s) => s.dwellSeconds !== null)
    .reduce((a, s) => a + (s.dwellSeconds ?? 0), 0);
}

/** A meeting every step of which the source could time. The set a share of time stands on. */
function fullyTimed(session: ShowroomSession): boolean {
  return session.steps.length > 0 && session.steps.every((s) => s.dwellSeconds !== null);
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
 *
 * The days are the PROJECT'S days. "Today" for a Bratislava sales office
 * starts at its own midnight, not at UTC midnight two hours later, so the
 * bounds are cut in `timeZone`. UTC is the default only so a caller that has
 * no project (the tests hand-place sessions at UTC midnights) keeps its
 * arithmetic literal.
 */
export function bucketBounds(today: Date, timeZone = "UTC") {
  const day = 24 * 60 * 60 * 1000;
  const t0 = startOfDayIn(today, timeZone).getTime();
  // Monday-based week, which is how Central European sales weeks are counted.
  const weekday = zoneParts(today, timeZone).weekday;
  const thisWeek = startOfWeekIn(today, timeZone).getTime();
  const elapsedDays = weekday + 1;
  const thisMonth = startOfMonthIn(today, timeZone).getTime();
  const lastMonth = startOfMonthIn(today, timeZone, -1).getTime();
  const elapsedDaysInMonth = Math.round((t0 - thisMonth) / day) + 1;
  /*
   * A shorter previous month cannot be clipped past its own length.
   *
   * "The first 30 days of March" against February only works when February
   * had 30 days to give — it never does. Clipping to whichever of the two is
   * shorter means a 31-day month in progress asks February for what it
   * actually has, not for a day count that does not exist there.
   */
  const lastMonthLength = Math.round((thisMonth - lastMonth) / day);
  const lastMonthElapsed = Math.min(elapsedDaysInMonth, lastMonthLength);

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
    /*
     * Last month gets the same clipping last week already has, above.
     *
     * 24 days of a month in progress against a complete 31-day prior month is
     * not a comparison, it is a guaranteed shortfall — the run rate could be
     * ahead and the raw totals would still say "down".
     */
    {
      id: "last_month" as const,
      label:
        lastMonthElapsed === lastMonthLength
          ? "Last month"
          : `Last month, first ${lastMonthElapsed} day${lastMonthElapsed === 1 ? "" : "s"}`,
      from: lastMonth,
      to: lastMonth + lastMonthElapsed * day,
    },
  ];
}

function buildPeriods(
  sessions: readonly ShowroomSession[],
  today: Date,
  timeZone: string,
): FlowPeriod[] {
  return bucketBounds(today, timeZone).map((b) => {
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
      sampleSize: sessions.length,
    };
  }
  const notInterested = decided.filter((s) => s.outcome === "not_interested").length;
  const progressed = share(decided.filter((s) => hasProgressed(s.outcome)).length, decided.length);

  if (share(notInterested, decided.length) > 0.35) {
    return {
      severity: "concern",
      text: `${notInterested} of ${decided.length} recorded meetings ended "not interested" — worth watching the presentation itself, not only the pipeline.`,
      sampleSize: decided.length,
    };
  }
  if (progressed < teamProgressed * 0.75) {
    return {
      severity: "watch",
      text: `${percent(progressed, "en-GB")} progressed against ${percent(teamProgressed, "en-GB")} for the team, over ${decided.length} recorded meetings.`,
      sampleSize: decided.length,
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
    href: `${base}/agents/${agentId}`,
  };
}

/**
 * The two figures a verdict compares, named.
 *
 * A subset of `FlowPeriod` -- every `FlowPeriod` already satisfies this
 * shape, so the recency buckets from `buildPeriods` pass straight in; the
 * whole-period case below builds one directly, with no bucket and no `id`,
 * because none of `verdictFrom`'s reasoning ever needs one.
 */
interface PeriodSummary {
  readonly label: string;
  readonly meetings: number;
  readonly outcomeRecorded: number;
  readonly progressed: number;
}

function summarizePeriod(sessions: readonly ShowroomSession[], label: string): PeriodSummary {
  return {
    label,
    meetings: sessions.length,
    outcomeRecorded: sessions.filter((s) => !outcomeIsUnknown(s.outcome)).length,
    progressed: sessions.filter((s) => hasProgressed(s.outcome)).length,
  };
}

/**
 * The verdict's own state machine, factored out so both the "period still
 * running" path (recency buckets: this week/month against last) and the
 * "closed period" path (the whole selected period against its own baseline)
 * produce it the same way, from the same two-summary shape, rather than
 * duplicating four states and a deadbanded signal twice.
 */
function verdictFrom(current: PeriodSummary, prior: PeriodSummary, locale: string): string {
  const outcomesRecorded = current.outcomeRecorded > 0;
  const hasBaseline = prior.meetings > 0;

  const volumeClause = hasBaseline
    ? `${meetings(current.meetings, locale)} ${current.label.toLowerCase()} against ${count(prior.meetings, locale)} ${prior.label.toLowerCase()}`
    : `${meetings(current.meetings, locale)} ${current.label.toLowerCase()}`;

  if (!outcomesRecorded) {
    /*
     * Same fact as the opening screen's equivalent state; same sentence. And the
     * same limit on it: a showroom is running only if meetings came.
     */
    return current.meetings === 0
      ? `No presentations were recorded ${current.label.toLowerCase()}.`
      : "The showroom is running; no outcomes are being recorded.";
  }
  if (!hasBaseline) {
    const currentProgressed = share(current.progressed, current.outcomeRecorded);
    return `Too early to call: ${volumeClause}, and ${percent(currentProgressed, locale)} of recorded meetings progressed ${current.label.toLowerCase()}. There's no earlier comparable period yet.`;
  }

  const currentProgressed = share(current.progressed, current.outcomeRecorded);
  const priorProgressed =
    prior.outcomeRecorded === 0 ? 0 : share(prior.progressed, prior.outcomeRecorded);
  const volumeTrend = trend(current.meetings / prior.meetings, 0.8);
  const progressTrend: Trend =
    prior.outcomeRecorded === 0
      ? currentProgressed > 0.3
        ? "up"
        : "flat"
      : trend(currentProgressed / priorProgressed, 0.9);
  const signal =
    volumeTrend === "up" && progressTrend === "up"
      ? "good"
      : volumeTrend === "down" && progressTrend === "down"
        ? "poor"
        : "attention";

  // "Against", never "up from" or "down from" -- see the docblock this
  // reasoning was moved from, immediately below in `buildSalesFlow`.
  return signal === "good"
    ? `Meetings are holding up and progressing well: ${volumeClause}, and ${percent(currentProgressed, locale)} of recorded meetings progressed, against ${percent(priorProgressed, locale)} before.`
    : signal === "poor"
      ? `Worth a look: ${volumeClause}, and ${percent(currentProgressed, locale)} of recorded meetings progressed, against ${percent(priorProgressed, locale)} before.`
      : `A mixed signal: ${volumeClause}, and ${percent(currentProgressed, locale)} of recorded meetings progressed, against ${percent(priorProgressed, locale)} before.`;
}

/* --- 1. Sales Flow ----------------------------------------------------------- */

export function buildSalesFlow(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  today: Date,
  previous: readonly ShowroomSession[],
  /** The CRM's deals, when a connector delivered them; null draws "not connected". */
  deals: DeliveredDeals | null = null,
  /**
   * Every meeting of the project, whatever the period. A showing in June belongs
   * to a reservation in July, so IRIS-assisted sales are never read from a slice.
   */
  projectSessions: readonly ShowroomSession[] = sessions,
): SalesFlowView {
  const locale = context.project.locale;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const periods = buildPeriods(sessions, today, context.project.timeZone);
  const decided = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  const teamProgressed = share(
    decided.filter((s) => hasProgressed(s.outcome)).length,
    decided.length,
  );

  const rings = presentersIn(sessions)
    .map((a) =>
      buildRing(
        sessions.filter((s) => s.agentId === a.id),
        a.id,
        a.name,
        base,
        teamProgressed,
      ),
    )
    .filter((r) => r.meetings > 0);

  const unrecorded = sessions.length - decided.length;
  const findings: ShowroomFinding[] = [];

  const flagged = rings.filter((r) => r.flag !== null);
  if (flagged[0]?.flag != null) {
    // The evidence below cites `flag.sampleSize`, not `flagged[0].meetings` --
    // the flag's own text is stated over the population that number names
    // (usually the decided meetings, not every meeting the agent had), and
    // the evidence has to agree with the sentence it is evidence for.
    findings.push({
      id: `flow-flag-${flagged[0].agentId}`,
      statement: `${flagged[0].name}: ${flagged[0].flag.text}`,
      baseline: `${percent(teamProgressed, locale)} for the team`,
      soWhat:
        "A pattern in how meetings end is a prompt to look at how they are run — the presentation, the pacing, what gets shown. It is not a judgement on the person.",
      nextStep: { label: `Open ${flagged[0].name.split(" ")[0]}`, href: flagged[0].href },
      evidence: evidenceRef(
        `flow-${flagged[0].agentId}`,
        "statistical_association",
        flagged[0].href,
        flagged[0].flag.sampleSize,
      ),
      sampleSize: flagged[0].flag.sampleSize,
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
  const month = periods.find((p) => p.id === "this_month");
  const lastMonth = periods.find((p) => p.id === "last_month");

  /*
   * The verdict says which way things are moving, not only how many -- and
   * it has to move with whatever window is actually selected, or it drifts
   * out of sync with the ring and findings below it, which always read the
   * full selected period.
   *
   * `stillRunning` mirrors the repository's own `slices()` (the only other
   * place this product decides whether a period includes today), computed
   * locally rather than threaded through because `buildSalesFlow` already
   * receives both `context` and `today`. When the selected period is still
   * running, the verdict keeps drilling into week-vs-last-week (or
   * month-vs-last-month) recency buckets, because that finer window is a
   * genuinely more current signal than "this quarter so far" would be, and
   * disturbing that is out of scope here. When the period is closed --
   * "Last completed quarter" and similar -- those buckets are computed from
   * `sessions`, which is by then *already* filtered to that period, so
   * "this week" inside e.g. April-June read against an August `today` finds
   * nothing: not a quieter signal, an empty one, which the four-state
   * machine below reads as "no outcomes recorded" even when the ring two
   * sections down is showing dozens of them from the same `sessions` array.
   * A closed period instead compares its own whole span against its own
   * baseline (`previous`, `context.period.baselineFrom/To` -- the same
   * mechanism "What changed" already uses lower on this page), which needs
   * no recency bucket and is never empty merely because the period is over.
   *
   * Volume and progression share one window here rather than two either
   * way. The KPI row above answers to its own control (`charts.kpis`, a
   * separate figure over a separate window on purpose), but gluing a
   * quarter-scoped progression clause onto a week-scoped volume clause in
   * the SAME sentence would recreate the exact "two numbers, two scopes,
   * one claim" confusion that separation exists to avoid. `trend()`'s
   * deadband is the same one the opening screen uses, so the same
   * meeting's worth of noise cannot tip one screen's verdict and not the
   * other's. "Against", never "up from" or "down from": `signal` below is
   * deadbanded on purpose (a ratio that clears the floor reads as "up" even
   * when the raw percentage dipped slightly) — right for deciding which of
   * the three verdicts to print, wrong for a literal direction word next to
   * the actual figures. "Up from 46%" printed beside a true 42% is not a
   * rounding quirk, it is a false sentence — see `verdictFrom`, above.
   */
  const stillRunning =
    new Date(context.period.to).getTime() >= today.getTime() - 24 * 60 * 60 * 1000;
  let verdict: string;
  if (stillRunning) {
    if (
      week === undefined ||
      lastWeek === undefined ||
      month === undefined ||
      lastMonth === undefined
    ) {
      verdict = `${count(sessions.length, locale)} meetings this period.`;
    } else {
      const weekIsReadable = week.meetings + lastWeek.meetings >= 8;
      verdict = verdictFrom(
        weekIsReadable ? week : month,
        weekIsReadable ? lastWeek : lastMonth,
        locale,
      );
    }
  } else {
    verdict = verdictFrom(
      summarizePeriod(sessions, context.period.label),
      summarizePeriod(previous, context.period.baselineLabel),
      locale,
    );
  }
  verdict = nothingReceivedYet(context) ?? verdict;

  /*
   * Only a code the catalogue holds gets a link; a CRM can name a unit the
   * catalogue never stated, and a link to it would resolve to the product's own
   * "this isn't here". Encoded, because a CRM's code is free text and a space or
   * a slash in it is not a path.
   */
  const unitHref = (code: string): string | null =>
    catalogueFor(context.project.id as string).some((u) => u.code === code)
      ? `${base}/units/${encodeURIComponent(code)}`
      : null;

  return {
    context,
    verdict,
    periods,
    outcomes: outcomeSlices(sessions),
    rings,
    findings,
    meetingCount: sessions.length,
    evidence: evidenceRef("sales-flow", "observed_sequence", `${base}/flow`, sessions.length),
    ladder: buildDealLadder(deals, locale, context.project.timeZone, unitHref),
    assisted: buildAssistedSales(
      deals,
      projectSessions,
      DEFAULT_IRIS_ASSIST_POLICY,
      locale,
      context.project.timeZone,
      unitHref,
      (meetingId) => `${base}/meetings/${encodeURIComponent(meetingId)}`,
    ),
  };
}

/* --- 2. Project -------------------------------------------------------------- */

interface RoomSegmentSpec {
  readonly id: string;
  readonly label: string;
  /** `null` for the row that holds units whose room count is not stated. */
  readonly rooms: number | null;
}

/**
 * One segment per room count the catalogue contains, smallest first.
 *
 * There used to be a two-entry constant here — two-room and three-room — and
 * the parity scale built from it said "X% of looking time on Y% of stock"
 * while leaving every one-room and four-room flat out of both numbers. The
 * segments now follow the stock, so a catalogue that arrives from a CRM with
 * five counts gets five rows, and one with two still gets two.
 */
/*
 * One segment per stated count, and one more for the units whose count the
 * catalogue did not state — its own row, never folded into a guess, so the
 * scale still covers the stock (ADR-0036).
 */
function roomSegments(
  catalogue: ReadonlyArray<{ readonly rooms: number | null }>,
): RoomSegmentSpec[] {
  const stated = roomCounts(catalogue).map((rooms) => ({
    id: `rooms-${rooms}`,
    label: roomLabel(rooms),
    rooms,
  }));
  return hasUnstatedRooms(catalogue)
    ? [
        ...stated,
        { id: UNSTATED_ROOMS_SEGMENT.id, label: UNSTATED_ROOMS_SEGMENT.label, rooms: null },
      ]
    : stated;
}

/**
 * The segment a sentence may be built on: enough meetings behind it to say
 * something, and the furthest from parity among those. Below the floor the
 * page still shows every figure; it just does not lead with one.
 */
const SEGMENT_SENTENCE_FLOOR = 5;

function leadSegment(segments: readonly SegmentInterest[]): SegmentInterest | undefined {
  return [...segments]
    .filter((s) => s.meetings > SEGMENT_SENTENCE_FLOOR)
    .sort((a, b) => Math.abs(b.index - 1) - Math.abs(a.index - 1))[0];
}

function buildSegment(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  spec: RoomSegmentSpec,
): SegmentInterest {
  const locale = context.project.locale;
  /*
   * This project's units, not Northgate's.
   *
   * `RAW_CATALOGUE` is a module constant pinned to `prj_northgate01`, so every
   * project rendered Northgate's forty-eight apartments — including Beta
   * Development's Kingsford, which is a different developer's stock on a
   * competitor's screen.
   */
  const catalogue = catalogueFor(context.project.id as string);
  const inSegment = new Set(catalogue.filter((u) => u.rooms === spec.rooms).map((u) => u.code));
  const available = catalogue.filter((u) => u.rooms === spec.rooms && u.status === "available");
  const allAvailable = catalogue.filter((u) => u.status === "available");

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

  /*
   * THE ATTENTION × CONVERSION READING.
   *
   * Conversion is the share of decided meetings (an outcome recorded) that
   * progressed, among the meetings that opened a unit of this segment,
   * against the same share over every decided meeting. The documented
   * minimum (docs/02-views.md §3: n = 20) gates the quadrant, and a project
   * with no CRM has no outcome to read, so the quadrant is withheld with
   * the reason rather than drawn from nothing. High attention is above
   * parity; high conversion is at or above the project's own share.
   */
  const decidedMeetings = meetings.filter((s) => !outcomeIsUnknown(s.outcome));
  const decidedAll = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  const progressed = decidedMeetings.filter((s) => hasProgressed(s.outcome)).length;
  const crm = context.project.connectedSources.includes("crm");
  const conversionShare =
    decidedMeetings.length === 0 ? null : share(progressed, decidedMeetings.length);
  const projectShare =
    decidedAll.length === 0
      ? null
      : share(decidedAll.filter((s) => hasProgressed(s.outcome)).length, decidedAll.length);
  const withheld = !crm
    ? "No CRM is connected, so no outcome is recorded and conversion cannot be read."
    : decidedMeetings.length < AGENT_MIN_SAMPLE
      ? `Not enough decided meetings yet (${String(decidedMeetings.length)} of ${String(AGENT_MIN_SAMPLE)}).`
      : null;
  const conversion: SegmentConversion = {
    decided: decidedMeetings.length,
    progressed,
    share: conversionShare,
    projectShare,
    minimum: AGENT_MIN_SAMPLE,
    quadrant:
      withheld !== null || conversionShare === null || projectShare === null
        ? null
        : index >= 1
          ? conversionShare >= projectShare
            ? "hero"
            : "mispriced"
          : conversionShare >= projectShare
            ? "hidden_gem"
            : "dead_stock",
    withheld,
  };

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
    rooms: spec.rooms,
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
    conversion,
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
  const segments = roomSegments(catalogueFor(context.project.id as string)).map((spec) =>
    buildSegment(context, sessions, spec),
  );
  /*
   * No segment asked for opens the first one — the band below the tabs is
   * the point of the page, and "first" is the smallest count, the same
   * order the tab strip reads in. A segment asked for by name that the
   * catalogue does not have selects nothing, which the tabs show honestly.
   */
  const selected =
    selectedSegmentId === null
      ? (segments[0] ?? null)
      : (segments.find((s) => s.id === selectedSegmentId) ?? null);

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

  const lead = leadSegment(segments);
  if (lead !== undefined) {
    findings.push({
      id: "project-segment",
      statement: `${lead.label} units draw ${lead.index.toFixed(2)}× their share of looking time, and ${percent(lead.favouriteShare, locale)} of every shortlisting in the period.`,
      baseline: `${percent(lead.stockShare, locale)} of available stock`,
      soWhat: lead.soWhat,
      nextStep: { label: `Open ${lead.label}`, href: `${base}/project?segment=${lead.id}` },
      evidence: evidenceRef(
        "project-segment",
        "statistical_association",
        `${base}/project`,
        lead.meetings,
      ),
      sampleSize: lead.meetings,
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
      lead === undefined
        ? (nothingReceivedYet(context) ?? `${meetings(sessions.length, locale)}.`)
        : `${lead.label} units are ${percent(lead.stockShare, locale)} of the stock and take ${percent(lead.attentionShare, locale)} of the attention.`,
    segments,
    matrixNote: context.project.connectedSources.includes("crm")
      ? `Attention is the segment's share of looking time against its share of available stock; conversion is the share of decided meetings that progressed, against ${percent(
          share(
            sessions.filter((s) => !outcomeIsUnknown(s.outcome) && hasProgressed(s.outcome)).length,
            sessions.filter((s) => !outcomeIsUnknown(s.outcome)).length,
          ),
          locale,
        )} for the project. A segment is placed only with ${String(AGENT_MIN_SAMPLE)} or more decided meetings; the pattern is an association, never a cause.`
      : "No CRM is connected to this project, so no meeting carries an outcome and nothing can be placed on the conversion axis. Attention alone is on the scale above.",
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

  const agents: AgentProfile[] = presentersIn(sessions).flatMap<AgentProfile>((a) => {
    const mine = sessions.filter((s) => s.agentId === a.id);
    if (mine.length === 0) return [];

    const belowMinimum = mine.length < AGENT_MIN_SAMPLE;

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
      organisationName: a.organisationName,
      meetings: mine.length,
      /* The meetings the section shares stand on: every step timed. Stated, so the share is of a known set. */
      timedMeetings: mine.filter(fullyTimed).length,
      belowMinimum,
      suppressionNote: belowMinimum
        ? `${meetings(mine.length, locale)} in this period, ${count(AGENT_MIN_SAMPLE - mine.length, locale)} short of the ${String(AGENT_MIN_SAMPLE)} needed for a verdict. Figures are shown; no rank or trend is drawn.`
        : null,
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
      href: `${base}/agents/${a.id}`,
    } satisfies AgentProfile;
  });

  const findings: ShowroomFinding[] = [];
  const distinct = agents
    .filter((a) => a.signature !== null)
    .sort((x, y) => (y.signature?.overIndex ?? 0) - (x.signature?.overIndex ?? 0))[0];

  /*
   * A share of the TEAM's time needs a team. With one presenter the figure is
   * that person against themselves, 1.0× by construction, and printing it
   * would be a finding about arithmetic.
   */
  if (distinct?.signature != null && agents.length > 1) {
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
    /* "They do not present alike" is a claim about two people or more; one presenter is a count. */
    verdict:
      agents.length === 0
        ? /* "0 agents presented 0 meetings, and they do not present alike" was a sentence about nobody. */
          (nothingReceivedYet(context) ??
          `Nobody presented in ${context.period.label.toLowerCase()}.`)
        : agents.length === 1
          ? `One agent presented ${meetings(sessions.length, locale)}.`
          : `${count(agents.length, locale)} agents presented ${meetings(sessions.length, locale)}, and they do not present alike.`,
    agents,
    repeats,
    findings,
    showRatings,
    meetingCount: sessions.length,
    /* The team's section shares stand on these, not on `meetingCount`. */
    timedMeetingCount: sessions.filter(fullyTimed).length,
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
  const timeZone = context.project.timeZone;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const roomCodes =
    criteria.rooms === null
      ? null
      : new Set(
          catalogueFor(context.project.id as string)
            .filter((u) => u.rooms === criteria.rooms)
            .map((u) => u.code),
        );

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
        startedDisplay: dayLabel(s.startedAt, locale, timeZone),
        agentName: agent?.name ?? presenterName(s.projectId, s.agentId),
        outcomeLabel: OUTCOME_LABELS[s.outcome],
        because:
          places.length === 0
            ? `${units.join(", ")}`
            : `${units.join(", ")} · ${places.map((p) => `${p.placeName} ${p.dwellSeconds}s`).join(", ")}`,
        href: `${base}/meetings/${s.meetingId}`,
      };
    });

  const roomText =
    criteria.rooms === null ? "any unit" : `a ${roomLabel(criteria.rooms).toLowerCase()} unit`;
  const favText = criteria.favouritedOnly ? "shortlisted" : "opened";
  const roomChoices = roomCounts(catalogueFor(context.project.id as string)).map((rooms) => ({
    rooms,
    label: roomLabel(rooms),
  }));
  const placeText =
    criteria.placeCategory === null
      ? ""
      : ` and spent at least ${criteria.minimumPlaceSeconds} seconds on ${PLACE_CATEGORY_LABELS[criteria.placeCategory].toLowerCase()} places`;

  return {
    context,
    criteria,
    roomChoices,
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
  /**
   * The same view **What needs attention** renders, not a second reading of it.
   *
   * Passed in rather than built here: both are composed from the same slices in
   * the repository, so handing this one over costs no extra work and means the
   * two screens cannot disagree about what is raised. See `actionWorthTaking`.
   */
  attention: AttentionView,
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

  const periods = buildPeriods(sessions, today, context.project.timeZone);
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

  /*
   * Down, flat, or up — not a boolean.
   *
   * `trend()`'s deadband is what keeps one extra meeting from flipping the
   * whole verdict: a ratio that lands in the gap around the floor reads as
   * `"flat"`, which — like a genuine mix of one axis up and one down — can
   * only ever produce `"attention"` below, never tip the signal to `"good"`
   * or `"poor"` on its own.
   */
  const volumeTrend: Trend = weekIsReadable
    ? trend(week / lastWeek, 0.8)
    : lastMonth === 0
      ? month > 0
        ? "up"
        : "flat"
      : trend(month / lastMonth, 0.8);
  const progressTrend: Trend =
    previousProgressed === 0
      ? progressed > 0.3
        ? "up"
        : "flat"
      : trend(progressed / previousProgressed, 0.9);

  /*
   * Without outcomes the signal rests on volume alone, and says so.
   *
   * Grading a project on a rate it cannot measure would put a confident colour
   * on the screen with nothing behind it.
   */
  const signal: ShowroomSignal = !outcomesRecorded
    ? "attention"
    : volumeTrend === "up" && progressTrend === "up"
      ? "good"
      : volumeTrend === "down" && progressTrend === "down"
        ? "poor"
        : "attention";

  /*
   * "The showroom is running" is a claim, and with no meeting at all it was made
   * about a showroom nobody had heard from. It is true only when meetings came
   * and none carried an outcome.
   */
  const verdict = !outcomesRecorded
    ? (nothingReceivedYet(context) ??
      (sessions.length === 0
        ? `No presentations were recorded in ${context.period.label.toLowerCase()}.`
        : "The showroom is running; no outcomes are being recorded."))
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
    ? `. No meeting outcome has been recorded on this project, so no progression rate can be computed.${
        hasBaseline ? "" : " There is no earlier period to compare against either."
      }`
    : hasBaseline
      ? `, and ${percent(progressed, locale)} of recorded meetings progressing against ${percent(previousProgressed, locale)} before.`
      : `, and ${percent(progressed, locale)} of recorded meetings progressing. There is no earlier period to compare against.`;

  /*
   * A project with no history is not a project that did badly.
   *
   * Kingsford has been selling three weeks, so "last month" is a month in which
   * it did not exist. The sentence read "41 meetings this month against 0 last
   * month", which is arithmetically true and invites exactly the comparison it
   * should not: 41 against nothing is not growth, it is a first period. The
   * progression figure was already corrected for this; the volume figure beside
   * it was still making the claim.
   */
  const volumeClause = hasBaseline
    ? weekIsReadable
      ? `${meetings(week, locale)} this week against ${count(lastWeek, locale)} last week`
      : `${meetings(month, locale)} this month against ${count(lastMonth, locale)} last month`
    : `${meetings(weekIsReadable ? week : month, locale)} ${weekIsReadable ? "this week" : "this month"}`;

  const because = weekIsReadable
    ? `${volumeClause}${progressClause}`
    : `${volumeClause}${progressClause}` + " This week is too early to read on its own.";

  const figures: HomeFigure[] = [
    {
      id: "meetings",
      label: weekIsReadable ? "Meetings this week" : "Meetings this month",
      value: count(weekIsReadable ? week : month, locale),
      // Same rule as the sentence above: no baseline, no comparison, and no
      // arrow — an arrow is a claim about a direction there is nothing to move
      // from.
      against: !hasBaseline
        ? "no earlier period to compare"
        : weekIsReadable
          ? `${count(lastWeek, locale)} last week`
          : `${count(lastMonth, locale)} last month`,
      direction: !hasBaseline
        ? "flat"
        : weekIsReadable
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
      better: !hasBaseline ? "neither" : "up",
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

  /*
   * The one thing worth acting on — the SAME one the attention screen leads with.
   *
   * This used to scan presenters for an outcome flag of its own and take the
   * first with a "concern" severity. Nothing wrong with the arithmetic; the
   * problem was that it was a second arithmetic. Two screens answering "what
   * should I do about this period" from two computations agree until the day
   * they do not, and the day they do not is the day a reader stops believing
   * either. `actionWorthTaking` is now the only place that choice is made.
   */
  const leading = actionWorthTaking(attention);

  /*
   * LEAD WITH WHAT IS RAISED, WHETHER OR NOT IT CAN BE OPENED.
   *
   * The earlier version required the leading state to carry its own route, and
   * fell back to null when it did not. That is how Riverside came to print
   * "Nothing in this period is waiting on a decision from you" over four raised
   * states including a warning: the state with nowhere to send a reader — no
   * CRM connected, which is an administrator's job rather than this reader's —
   * silently became no state at all.
   *
   * A missing route is a fact about one state. It is not a fact about the
   * period, and it is the period the sentence is about. So "Clear" now means
   * the checks raised nothing, which is the only thing that was ever true of
   * it, and a state without its own action sends the reader to the register
   * where it sits in full. `StateList` already draws an unopenable subject as
   * text rather than a dead link; this is the same rule one level up, which is
   * the level it was missing from.
   */
  const alert =
    leading === null
      ? null
      : leading.alert.actionHref === null
        ? {
            text: leading.alert.title,
            href: `${base}/attention`,
            actionLabel: "Open what needs attention",
          }
        : {
            text: leading.alert.title,
            href: leading.alert.actionHref,
            actionLabel: "Look at it",
          };

  const project = buildProjectView(context, sessions, null);
  const lead = leadSegment(project.segments);
  const agents = new Set(sessions.map((s) => s.agentId)).size;

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
          lead === undefined
            ? "Segments, filters and places"
            : `${lead.label} units draw ${lead.index.toFixed(1)}× their share of attention`,
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
