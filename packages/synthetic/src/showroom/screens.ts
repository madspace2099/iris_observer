import {
  CORE_SECTION_IDS,
  OUTCOME_LABELS,
  SESSION_CHANNELS,
  SESSION_CHANNEL_LABELS,
  hasProgressed,
  outcomeIsUnknown,
  type InsightSource,
  type MeetingOutcome,
  type SectionId,
  type SessionChannel,
  type ShowroomSession,
} from "@observer/contracts";
import {
  AGENT_MIN_SAMPLE,
  DEFAULT_IRIS_ASSIST_POLICY,
  UNIT_MIN_SAMPLE,
  NO_CRM,
  insufficient as shortOfSample,
} from "@observer/metrics";
import type {
  AgentBuyerInterest,
  AgentDetailView,
  AgentFollowUp,
  AgentProjectCoverage,
  AgentUnitInterest,
  AgentRecordedOutcome,
  FollowUpState,
  FunnelStep,
  MeetingFilterOption,
  MeetingFilters,
  MeetingListView,
  MeetingRow,
  MetricValue,
  ProjectSummary,
  ShowroomFinding,
  UnitAgentInterest,
  UnitAttentionRow,
  UnitAttributes,
  UnitDetailView,
  UnitFunnelStage,
  UnitInterestSignals,
  UnitInterestTrend,
  UnitTimelineEntry,
  ViewContext,
  VisitorLabelKind,
} from "@observer/readmodels";
import { areaWord, nothingReceivedYet, roomsWord, visitorLabel } from "@observer/readmodels";
import { catalogueFor, roomCounts, type RawUnit } from "../pulse";
import {
  clockLabel,
  count,
  dayLabel,
  empty,
  evidenceRef,
  insufficient,
  money,
  moneyOr,
  ok,
  percent,
  unavailable,
} from "../format";
import { assistedSaleOf, dealsFor } from "../deals";
import { presenterName, presentersIn, sessionsForProject, sessionsInPeriod } from "./sessions";
import { buildMeetingList, buildUnitAttention } from "./project";
import { buildAgentsView, meetings as meetingsWord, suppressionNoteFor } from "./views3";

/**
 * The drill-down surfaces, projected from the same session stream.
 *
 * Nothing here holds a figure of its own. The meeting list is `buildMeetingList`
 * with the fields a list needs; the unit page reads the row `buildUnitAttention`
 * already computed; the agent page reads the profile `buildAgentsView` already
 * computed. That is deliberate and it is the whole design: a detail page that
 * derives its own counts is a page that will disagree with the table the reader
 * arrived from, and the reader has no way to tell which of the two is right.
 *
 * The rules that run through the file are the ones the rest of the package
 * follows — association never cause, absence never zero, no verdict below the
 * minimum sample — with one addition that belongs to these screens in
 * particular: **no surface here names a person who is not staff.** Agents are
 * named because they are colleagues; a buyer is described by what the session
 * record itself carries and never by who they are (`docs/05-identity.md` §2).
 */

const OBSERVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED"];
const DERIVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"];
const WITH_OUTCOME: readonly InsightSource[] = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
  "CRM_OUTCOME_CONTEXT",
];
/*
 * A fact the unit catalogue states — a status of reserved or sold.
 *
 * `INSIGHT_SOURCES` has no word for the catalogue: showroom observed, showroom
 * derived, CRM outcome context, WEBIRIS, model. None of the five is where a
 * catalogue status comes from, and the two stages that carry it used to wear
 * the showroom's chips and the CRM's. So they wear none, rather than one that
 * is false; the stage's `verification` ("verified"), its basis sentence and its
 * qualifier ("stated by the unit catalogue") carry the provenance in words. The
 * vocabulary lives in `packages/contracts/src/provenance.ts`, which is frozen;
 * a `CATALOGUE` source is the contract change that would let a chip say it.
 */
const CATALOGUE_STATED: readonly InsightSource[] = [];

/* --- small helpers --------------------------------------------------------- */

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, "0")}s`;
}

function reached(session: ShowroomSession, sectionId: SectionId): boolean {
  return session.steps.some((s) => s.sectionId === sectionId);
}

function crmConnected(context: ViewContext): boolean {
  return context.project.connectedSources.includes("crm");
}

function base(context: ViewContext): string {
  return `/${context.tenant.slug}/${context.project.slug}`;
}

/**
 * The unit identifier, spelled the way the Pulse spells it.
 *
 * Duplicated deliberately rather than imported: `buildProjectPulse` builds it
 * inline, and the two must agree or a link from a unit page reaches a cell that
 * does not exist. If a third caller appears it belongs in one place; two is the
 * point at which extracting it costs more clarity than it buys.
 */
function unitIdOf(code: string): string {
  return `unt_${code.toLowerCase().replaceAll("-", "")}`;
}

/* --- weekly buckets -------------------------------------------------------- */

interface Bucket {
  readonly from: number;
  readonly to: number;
  readonly label: string;
}

/**
 * The period, cut into weeks.
 *
 * Weeks rather than days because a project running three appointments a week
 * produces a daily series that is mostly zeros, and a reader cannot tell a
 * genuinely quiet Tuesday from a series drawn at the wrong resolution. Capped at
 * the last twelve, so a year-to-date period stays readable and the label still
 * says which twelve.
 */
function weeklyBuckets(
  fromIso: string,
  toIso: string,
  locale: string,
  timeZone: string,
): readonly Bucket[] {
  const week = 7 * 24 * 60 * 60 * 1000;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];

  const all: Bucket[] = [];
  for (let start = from; start < to; start += week) {
    const end = Math.min(start + week, to);
    all.push({ from: start, to: end, label: dayLabel(new Date(start), locale, timeZone) });
  }
  return all.slice(-12);
}

function seriesOver(
  sessions: readonly ShowroomSession[],
  buckets: readonly Bucket[],
): readonly { readonly label: string; readonly value: number }[] {
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: sessions.filter((s) => {
      const at = Date.parse(s.startedAt);
      return at >= bucket.from && at < bucket.to;
    }).length,
  }));
}

/* --- 1. the meeting list --------------------------------------------------- */

/**
 * Whether anybody is owed a call, as the recorded outcome says.
 *
 * The distinction that matters is between "the agent recorded that no follow-up
 * is needed" and "nobody recorded anything": two different sentences, two
 * different next actions, and a boolean would have collapsed both into
 * `false`. The outcome is the showroom's own record (`docs/06-ownership.md`),
 * so no CRM is consulted here; the `!crm → "unavailable"` branch that stood
 * first said the CRM produced a fact the room had recorded.
 */
function followUpFor(session: ShowroomSession): FollowUpState {
  if (outcomeIsUnknown(session.outcome)) return "not_recorded";
  return session.outcome === "follow_up_needed" || session.outcome === "interested"
    ? "required"
    : "not_required";
}

function visitorKindFor(session: ShowroomSession): VisitorLabelKind {
  if (session.contactId === null) return "unlinked";
  return session.priorMeetings > 0 ? "known_returning" : "known_first_meeting";
}

/**
 * Sessions to rows, once, for every surface that shows a meeting.
 *
 * Built on top of `buildMeetingList` rather than beside it. The summary fields —
 * the label, the duration, the outcome wording, the href — are computed in one
 * place, so the meeting list, a unit's related meetings and an agent's recent
 * meetings cannot render the same meeting three different ways.
 */
export function buildMeetingRows(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
): readonly MeetingRow[] {
  const byId = new Map(sessions.map((s) => [s.meetingId, s]));
  const root = base(context);
  /*
   * Which codes have a page. A session records whatever code the showroom
   * showed; the catalogue is what decides whether that code is a unit this
   * project can open — a legacy import, or a delivered catalogue that has
   * since withdrawn a flat, both leave codes with no page behind them.
   */
  const catalogueCodes = new Set(catalogueFor(context.project.id as string).map((u) => u.code));

  return buildMeetingList(context, sessions).flatMap<MeetingRow>((summary) => {
    const session = byId.get(summary.meetingId);
    if (session === undefined) return [];
    const followUp = followUpFor(session);

    return [
      {
        ...summary,
        channel: session.channel,
        channelLabel: SESSION_CHANNEL_LABELS[session.channel],
        visitor: visitorLabel(
          visitorKindFor(session),
          session.contactId === null ? null : session.priorMeetings,
        ),
        unitsViewed: session.units.map((u) => ({
          code: u.unitCode,
          href: catalogueCodes.has(u.unitCode)
            ? `${root}/units/${encodeURIComponent(u.unitCode)}`
            : null,
        })),
        favourites: session.units.filter((u) => u.favourited).length,
        followUp,
        followUpLabel:
          followUp === "not_recorded"
            ? "No outcome was recorded for this meeting."
            : followUp === "required"
              ? "The recorded outcome asks for a follow-up."
              : "The recorded outcome does not ask for a follow-up.",
        timingAvailable: !session.timingUnavailable,
      },
    ];
  });
}

function optionsFrom(
  label: (id: string) => string,
  ids: readonly string[],
  counts: Map<string, number>,
): readonly MeetingFilterOption[] {
  return ids
    .map((id) => ({ id, label: label(id), count: counts.get(id) ?? 0 }))
    .filter((o) => o.count > 0);
}

export function buildMeetings(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  filters: MeetingFilters,
): MeetingListView {
  const locale = context.project.locale;
  const root = base(context);
  const crm = crmConnected(context);

  /*
   * The options are counted over the period, before the filters run.
   *
   * A control whose options are derived from the filtered result can only ever
   * offer the reader more of what they already have: choose an agent, and every
   * other agent disappears from the list of agents. Counting first means a
   * reader can see that switching to Martin would give them 42 meetings without
   * having to switch to find out.
   */
  const agentCounts = new Map<string, number>();
  const channelCounts = new Map<string, number>();
  const outcomeCounts = new Map<string, number>();
  for (const s of sessions) {
    agentCounts.set(s.agentId, (agentCounts.get(s.agentId) ?? 0) + 1);
    channelCounts.set(s.channel, (channelCounts.get(s.channel) ?? 0) + 1);
    outcomeCounts.set(s.outcome, (outcomeCounts.get(s.outcome) ?? 0) + 1);
  }

  const matched = sessions.filter(
    (s) =>
      (filters.agentId === null || s.agentId === filters.agentId) &&
      (filters.channel === null || s.channel === filters.channel) &&
      (filters.outcome === null || s.outcome === filters.outcome),
  );

  const rows = buildMeetingRows(context, matched);

  const findings: ShowroomFinding[] = [];

  const webiris = channelCounts.get("webiris") ?? 0;
  const showroom = channelCounts.get("showroom") ?? 0;
  if (webiris > 0 && showroom > 0) {
    findings.push({
      id: "meetings-channel-split",
      statement: `${count(webiris, locale)} of ${count(sessions.length, locale)} presentations in this period ran on WEB IRIS rather than on the showroom installation.`,
      baseline: `${percent(share(webiris, sessions.length), locale)} of the period`,
      soWhat:
        "Time in a browser tab and time in front of a wall-sized render are two measurements. Any figure that mixes them is a mixed figure, and the channel filter separates them.",
      nextStep: { label: "Show WEB IRIS only", href: `${root}/meetings?channel=webiris` },
      evidence: evidenceRef(
        "meetings-channel",
        "observed_sequence",
        `${root}/meetings`,
        sessions.length,
      ),
      sampleSize: sessions.length,
      sources: OBSERVED,
      caveat: null,
    });
  }

  const legacy = sessions.filter((s) => s.timingUnavailable).length;
  if (legacy > 0) {
    findings.push({
      id: "meetings-legacy",
      statement: `${count(legacy, locale)} meetings in this period came from the legacy import.`,
      baseline: `${count(sessions.length, locale)} meetings in the period`,
      soWhat:
        "Those records carry the order of the presentation and not its timing. Their sequence can be read; their pacing cannot.",
      nextStep: null,
      evidence: evidenceRef("meetings-legacy", "observed_sequence", `${root}/meetings`, legacy),
      sampleSize: sessions.length,
      sources: OBSERVED,
      caveat: "Durations on these rows are the session's own, not a sum of timed steps.",
    });
  }

  if (!crm && sessions.length > 0) {
    /*
     * No CRM does not mean no outcome. The synthetic world's projects without a
     * CRM record none, and the sentence was written as if that were a law; a real
     * showroom's agent sets the outcome in the room, so a row read "Interested"
     * under a finding that said no meeting carried one. What a missing CRM takes
     * away is the verification, and that is what is said when outcomes exist.
     */
    const inRoom = sessions.filter((s) => !outcomeIsUnknown(s.outcome)).length;
    findings.push({
      id: "meetings-no-crm",
      statement:
        inRoom === 0
          ? `None of the ${count(sessions.length, locale)} meetings in this period carries a recorded outcome.`
          : `${count(inRoom, locale)} of the ${count(sessions.length, locale)} meetings in this period carry the outcome the agent recorded in the room, and none is verified by a CRM.`,
      baseline: "no CRM is connected to this project",
      soWhat:
        "The presentations are fully observed, and what the agent recorded in the room — a follow-up owed, a reservation, a purchase — stands as recorded. Whether any deal later closed has no source on this project and is shown as unavailable rather than as nil.",
      nextStep: null,
      evidence: evidenceRef(
        "meetings-no-crm",
        "observed_sequence",
        `${root}/meetings`,
        sessions.length,
      ),
      sampleSize: sessions.length,
      sources: OBSERVED,
      caveat: NO_CRM,
    });
  }

  const active = [
    filters.agentId === null ? null : presenterName(context.project.id as string, filters.agentId),
    filters.channel === null ? null : SESSION_CHANNEL_LABELS[filters.channel],
    filters.outcome === null ? null : OUTCOME_LABELS[filters.outcome],
  ].filter((x): x is string => x !== null);

  const emptyState =
    sessions.length === 0
      ? (nothingReceivedYet(context) ??
        `No presentations were recorded on ${context.project.name} in ${context.period.label.toLowerCase()}.`)
      : active.length === 0
        ? `No meetings to show in ${context.period.label.toLowerCase()}.`
        : `No meetings in ${context.period.label.toLowerCase()} match ${active.join(" · ")}. ${count(sessions.length, locale)} meetings are in the period.`;

  return {
    context,
    total: rows.length,
    periodTotal: sessions.length,
    rows,
    filters,
    options: {
      agents: optionsFrom(
        (id) => presenterName(context.project.id as string, id),
        presentersIn(sessions).map((a) => a.id),
        agentCounts,
      ),
      channels: optionsFrom(
        (id) => SESSION_CHANNEL_LABELS[id as SessionChannel],
        SESSION_CHANNELS,
        channelCounts,
      ),
      outcomes: optionsFrom(
        (id) => OUTCOME_LABELS[id as MeetingOutcome],
        Object.keys(OUTCOME_LABELS),
        outcomeCounts,
      ),
    },
    findings,
    emptyState,
    evidence: evidenceRef("meeting-list", "observed_sequence", `${root}/meetings`, sessions.length),
  };
}

/* --- 2. one unit ----------------------------------------------------------- */

const STATUS_LABELS: Record<RawUnit["status"], string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

/**
 * A count, as a metric.
 *
 * Zero here is `empty` rather than `unavailable`: the meetings were observed,
 * the unit was in the catalogue throughout, and nobody opened it. That is an
 * answer, and it is a different answer from "the source that would have told us
 * is not connected".
 */
function signal(
  metricId: string,
  label: string,
  value: number,
  qualifier: string,
  sampleSize: number,
  locale: string,
  drillHref: string,
): MetricValue {
  if (value === 0) {
    return empty(metricId, label, UNIT_MIN_SAMPLE, `Not once in ${qualifier}.`);
  }
  return ok({
    metricId,
    label,
    display: count(value, locale),
    raw: value,
    qualifier,
    sampleSize,
    minimumSampleSize: UNIT_MIN_SAMPLE,
    drillHref,
  });
}

/**
 * One stage of the unit funnel, and how well it is known.
 *
 * The verification is not decoration. `viewed` and `favourited` were observed
 * happening to this unit. `follow_up` rests on an outcome that belongs to a
 * meeting in which several units were opened, so assigning it to this one is an
 * association and it is marked as such. `reservation` and `purchase` are the
 * only stages a system of record states about the unit itself, and they are the
 * only ones a surface may style as verified.
 */
function stage(
  id: UnitFunnelStage["id"],
  step: FunnelStep,
  verification: UnitFunnelStage["verification"],
  basis: string,
  tier: UnitFunnelStage["tier"],
  sources: readonly InsightSource[],
): UnitFunnelStage {
  return { id, step, verification, basis, tier, sources };
}

export function buildUnitDetail(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  previous: readonly ShowroomSession[],
  unitCode: string,
): UnitDetailView | null {
  const locale = context.project.locale;
  const timeZone = context.project.timeZone;
  const currency = context.project.currency;
  const root = base(context);

  const raw = catalogueFor(context.project.id as string).find((u) => u.code === unitCode);
  if (raw === undefined) return null;

  /*
   * The row comes from the attention projection, not from a second count here.
   *
   * A unit page that recomputed its own views would be a second answer to the
   * same question, three inches from the table the reader clicked through from.
   * One projection, two surfaces.
   */
  const attentionView = buildUnitAttention(context, sessions, previous, unitCode);
  const row: UnitAttentionRow | undefined = attentionView.rows.find((r) => r.unitCode === unitCode);
  if (row === undefined) return null;

  const touchedBy = sessions.filter((s) => s.units.some((u) => u.unitCode === unitCode));
  const href = `${root}/units?unit=${unitCode}`;

  const unit: UnitAttributes = {
    unitId: unitIdOf(raw.code),
    unitCode: raw.code,
    block: raw.block,
    floor: raw.floor,
    rooms: raw.rooms,
    areaSqm: raw.areaSqm,
    orientation: raw.orientation,
    status: raw.status,
    statusLabel: STATUS_LABELS[raw.status],
    price: raw.price,
    priceDisplay: moneyOr(raw.price, currency, locale),
    /*
     * A rate needs both figures. With either unstated the rate is not
     * computed, and the word says which half the catalogue left out.
     */
    pricePerSqmDisplay:
      raw.price === null
        ? "Price not stated"
        : raw.areaSqm === null
          ? "Area not stated"
          : `${money(Math.round(raw.price / Math.max(1, raw.areaSqm)), currency, locale)} / m²`,
  };

  const inPeriod = `${context.period.label.toLowerCase()}`;
  const signals: UnitInterestSignals = {
    views: signal("unit.views", "Views", row.views, inPeriod, row.meetings, locale, href),
    uniqueSessions: signal(
      "unit.sessions",
      "Meetings",
      row.meetings,
      inPeriod,
      row.meetings,
      locale,
      `${root}/meetings`,
    ),
    favourites: signal(
      "unit.favourites",
      "Shortlisted",
      row.favourites,
      inPeriod,
      row.meetings,
      locale,
      href,
    ),
    documentOpens: signal(
      "unit.plans",
      "Floor plan opened",
      row.pdfOpens,
      inPeriod,
      row.meetings,
      locale,
      href,
    ),
    comparisons: signal(
      "unit.comparisons",
      "Placed in a comparison",
      row.comparisonAppearances,
      inPeriod,
      row.meetings,
      locale,
      href,
    ),
    shares: signal("unit.shares", "Shared", row.shares, inPeriod, row.meetings, locale, href),
  };

  /*
   * The timeline says what it knows and no more.
   *
   * Only a section entry carries a time. Everything that happened inside a
   * section — a unit opened, a plan taken, a flat shortlisted — is recorded as
   * having happened during that section, and the moment is not observed. So
   * every entry below except the outcome carries `at: null` and shows the day,
   * which is genuinely known, rather than a clock time inferred from the
   * section that was on screen.
   */
  const timeline: UnitTimelineEntry[] = [];
  for (const session of [...touchedBy].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  )) {
    const touch = session.units.find((u) => u.unitCode === unitCode);
    if (touch === undefined) continue;
    const agentName = presenterName(session.projectId, session.agentId);
    const meetingHref = `${root}/meetings/${session.meetingId}`;
    const channelLabel = SESSION_CHANNEL_LABELS[session.channel];
    const stamp = `${dayLabel(session.startedAt, locale, timeZone)} · ${clockLabel(session.startedAt, locale, timeZone)}`;

    const add = (
      kind: UnitTimelineEntry["kind"],
      label: string,
      detail: string | null,
      tier: UnitTimelineEntry["tier"],
      sources: readonly InsightSource[],
      at: string | null = null,
    ): void => {
      timeline.push({
        id: `${session.meetingId}-${kind}`,
        kind,
        label,
        detail,
        at,
        atDisplay: at === null ? dayLabel(session.startedAt, locale, timeZone) : stamp,
        channel: session.channel,
        channelLabel,
        tier,
        sources,
        meetingId: session.meetingId,
        agentName,
        href: meetingHref,
      });
    };

    add(
      "viewed",
      `Opened ${count(touch.views, locale)} time${touch.views === 1 ? "" : "s"}`,
      `${duration(touch.dwellSeconds)} in total, longest look ${duration(touch.longestViewSeconds)}`,
      "observed_sequence",
      OBSERVED,
    );
    if (touch.favourited) {
      add("favourited", "Shortlisted", null, "observed_sequence", OBSERVED);
    }
    if (touch.pdfOpened) {
      add("plan_opened", "Floor plan opened", null, "observed_sequence", OBSERVED);
    }
    if (touch.comparedWith.length > 0) {
      add(
        "compared",
        "Placed in a comparison",
        `against ${touch.comparedWith.join(", ")}${
          touch.keptFromComparison === true ? " · kept" : " · another unit was kept"
        }`,
        "observed_sequence",
        OBSERVED,
      );
    }
    if (touch.shared) add("shared", "Shared", null, "observed_sequence", OBSERVED);
    if (touch.balconyViews > 0) {
      add(
        "balcony_viewed",
        `Balcony view ${count(touch.balconyViews, locale)}×`,
        null,
        "observed_sequence",
        OBSERVED,
      );
    }
    if (touch.floorCutViews > 0) {
      add("floor_cut_viewed", "Floor cut opened", null, "observed_sequence", OBSERVED);
    }
    if (touch.screenshots > 0) {
      add(
        "screenshot",
        `Screenshot taken ${count(touch.screenshots, locale)}×`,
        null,
        "observed_sequence",
        OBSERVED,
      );
    }
    /*
     * The agent's own record, at the observed tier, from the showroom. It was
     * gated on a CRM and carried the attributed tier with the CRM's chip, which
     * said a system of record stood behind an entry the room had made.
     */
    if (!outcomeIsUnknown(session.outcome)) {
      add(
        "outcome_recorded",
        `Meeting ended: ${OUTCOME_LABELS[session.outcome]}`,
        `${count(session.units.length, locale)} units were open in this meeting, so the outcome is the meeting's rather than this unit's`,
        "observed_sequence",
        OBSERVED,
        session.endedAt,
      );
    }
  }

  /* --- the funnel ---------------------------------------------------------- */

  const favouritedIn = touchedBy.filter((s) =>
    s.units.some((u) => u.unitCode === unitCode && u.favourited),
  );
  const followUpIn = favouritedIn.filter(
    (s) => s.outcome === "follow_up_needed" || s.outcome === "interested",
  );

  const funnel: readonly UnitFunnelStage[] = [
    stage(
      "viewed",
      {
        label: "Opened in a meeting",
        metric: signals.uniqueSessions,
        fromCount: sessions.length,
        toCount: row.meetings,
      },
      "observed",
      "IRIS recorded this unit being opened inside the presentation.",
      "observed_sequence",
      OBSERVED,
    ),
    stage(
      "favourited",
      {
        label: "Shortlisted",
        metric: signals.favourites,
        fromCount: row.meetings,
        toCount: favouritedIn.length,
      },
      "observed",
      "IRIS recorded the shortlist action against this unit.",
      "observed_sequence",
      OBSERVED,
    ),
    stage(
      "follow_up",
      {
        label: "Meeting asked for a follow-up",
        /*
         * The recorded outcome of the meetings that shortlisted it. Neither
         * gated on a CRM nor credited to one: the outcome is the room's record.
         * The verification word stays "attributed" — the funnel's own
         * vocabulary for a meeting outcome joined to one of several units —
         * and the tier says what is claimed: the record, nothing beyond it.
         */
        metric:
          followUpIn.length === 0
            ? empty(
                "unit.followup",
                "Meeting asked for a follow-up",
                UNIT_MIN_SAMPLE,
                "No meeting that shortlisted this unit recorded a follow-up.",
              )
            : ok({
                metricId: "unit.followup",
                label: "Meeting asked for a follow-up",
                display: count(followUpIn.length, locale),
                raw: followUpIn.length,
                qualifier: `of ${count(favouritedIn.length, locale)} that shortlisted it`,
                sampleSize: favouritedIn.length,
                minimumSampleSize: UNIT_MIN_SAMPLE,
                drillHref: `${root}/meetings`,
              }),
        fromCount: favouritedIn.length,
        toCount: followUpIn.length,
      },
      "attributed",
      "The outcome belongs to the meeting, in which other units were also opened. It is an association with this unit, not a result of it.",
      "observed_sequence",
      OBSERVED,
    ),
    stage(
      "offer",
      {
        label: "Offer made",
        metric: unavailable(
          "unit.offer",
          "Offer made",
          UNIT_MIN_SAMPLE,
          "Observer holds no offer stage. The deal ladder is the CRM's, and no offer fact reaches this product (ADR-0021).",
        ),
        fromCount: null,
        toCount: null,
      },
      "unavailable",
      "No source in this product records an offer against a unit.",
      "attributed_conversion",
      WITH_OUTCOME,
    ),
    stage(
      "reservation",
      {
        label: "Reserved",
        metric:
          raw.status === "reserved" || raw.status === "sold"
            ? ok({
                metricId: "unit.reserved",
                label: "Reserved",
                display: "Yes",
                raw: 1,
                qualifier: "stated by the unit catalogue",
                minimumSampleSize: 1,
                sampleSize: 1,
              })
            : empty(
                "unit.reserved",
                "Reserved",
                1,
                "The catalogue lists this unit as available; it has not been reserved.",
              ),
        fromCount: null,
        toCount: raw.status === "available" ? 0 : 1,
      },
      "verified",
      "The unit catalogue is a system of record about this unit, so the status is stated rather than inferred from a meeting.",
      /*
       * The tier is the claim's strength, and the claim is a stated status:
       * recorded, nothing beyond the record. It wore "attributed_conversion",
       * a conversion assigned under a rule, which no rule had done.
       */
      "observed_sequence",
      CATALOGUE_STATED,
    ),
    stage(
      "purchase",
      {
        label: "Sold",
        metric:
          raw.status === "sold"
            ? ok({
                metricId: "unit.sold",
                label: "Sold",
                display: "Yes",
                raw: 1,
                qualifier: "stated by the unit catalogue",
                minimumSampleSize: 1,
                sampleSize: 1,
              })
            : empty("unit.sold", "Sold", 1, "The catalogue does not list this unit as sold."),
        fromCount: null,
        toCount: raw.status === "sold" ? 1 : 0,
      },
      "verified",
      "The unit catalogue is a system of record about this unit, so the status is stated rather than inferred from a meeting.",
      "observed_sequence",
      CATALOGUE_STATED,
    ),
  ];

  /* --- who showed it ------------------------------------------------------- */

  const relatedAgents: readonly UnitAgentInterest[] = presentersIn(sessions)
    .flatMap<UnitAgentInterest>((agent) => {
      const theirs = touchedBy.filter((s) => s.agentId === agent.id);
      if (theirs.length === 0) return [];
      const sampleSize = sessions.filter((s) => s.agentId === agent.id).length;
      return [
        {
          agentId: agent.id,
          name: agent.name,
          meetings: theirs.length,
          favourites: theirs.filter((s) =>
            s.units.some((u) => u.unitCode === unitCode && u.favourited),
          ).length,
          sampleSize,
          minimumSampleSize: AGENT_MIN_SAMPLE,
          belowMinimum: sampleSize < AGENT_MIN_SAMPLE,
          href: `${root}/agents/${agent.id}`,
        },
      ];
    })
    .sort((a, b) => b.meetings - a.meetings);

  /* --- the trend ----------------------------------------------------------- */

  const buckets = weeklyBuckets(
    context.period.from,
    context.period.to,
    locale,
    context.project.timeZone,
  );
  const observations = row.views;
  const belowUnitMinimum = observations < UNIT_MIN_SAMPLE;

  const trendMetric: MetricValue = belowUnitMinimum
    ? insufficient(
        {
          metricId: "unit.trend",
          label: "Interest trend",
          display: row.trendDisplay,
          raw: observations,
          qualifier: `${count(observations, locale)} of ${UNIT_MIN_SAMPLE} observations`,
          sampleSize: observations,
          minimumSampleSize: UNIT_MIN_SAMPLE,
        },
        shortOfSample(UNIT_MIN_SAMPLE, "observations"),
      )
    : ok({
        metricId: "unit.trend",
        label: "Interest trend",
        display: row.trendDisplay,
        raw: observations,
        qualifier: `against ${context.period.baselineLabel}`,
        sampleSize: observations,
        minimumSampleSize: UNIT_MIN_SAMPLE,
        drillHref: href,
      });

  const trend: UnitInterestTrend = {
    series: {
      points: seriesOver(touchedBy, buckets),
      annotation: null,
      valueLabel: "Meetings that opened this unit",
    },
    verdict: trendMetric,
    /*
     * No direction below the minimum. `docs/10-policies.md` §6 forbids a trend
     * on a thin sample, and "unknown" is what that looks like in a type: the
     * series is still drawn, and nothing tells the reader which way it points.
     */
    direction: belowUnitMinimum ? "unknown" : row.trend,
    baselineLabel: context.period.baselineLabel,
  };

  /* --- findings ------------------------------------------------------------ */

  const findings: ShowroomFinding[] = [...(attentionView.selected?.findings ?? [])];

  if (row.favourites > 0 && followUpIn.length === 0) {
    findings.push({
      id: `unit-${unitCode}-shortlist-no-follow-up`,
      statement: `${unitCode} was shortlisted in ${count(row.favourites, locale)} meeting${row.favourites === 1 ? "" : "s"}, none of which recorded a follow-up.`,
      baseline: `${count(row.meetings, locale)} meetings opened it`,
      soWhat:
        "Shortlisting is the strongest interest signal the showroom produces. A shortlist with nothing recorded after it is a call somebody may still owe.",
      nextStep: { label: "See those meetings", href: `${root}/meetings` },
      evidence: evidenceRef(
        `unit-${unitCode}-follow-up`,
        "observed_sequence",
        `${root}/meetings`,
        row.favourites,
      ),
      sampleSize: row.meetings,
      sources: OBSERVED,
      caveat: "A follow-up agreed but not recorded in the room would not appear here.",
    });
  }

  /*
   * IRIS-assisted sale (ADR-0039): whether the CRM's dated sale of THIS unit
   * followed a showing of it. Placed against every meeting of the project and
   * not the period's slice, because a showing in June belongs to a reservation
   * in July whatever period the reader chose.
   */
  const sale = assistedSaleOf(
    unitCode,
    dealsFor(context.project.id as string),
    sessionsForProject(context.project.id as string),
    DEFAULT_IRIS_ASSIST_POLICY,
    locale,
    timeZone,
    (meetingId) => `${root}/meetings/${encodeURIComponent(meetingId)}`,
  );
  if (sale !== null) {
    findings.push({
      id: `unit-${unitCode}-iris-assisted`,
      statement: sale.statement,
      baseline: `the ${sale.stageLabel.toLowerCase()} date the CRM states, ${sale.stageDateDisplay}`,
      soWhat:
        "It places the sale against the last time the showroom opened this unit. It is an order of events under a stated rule, the same rule for every sale on Sales Flow.",
      nextStep:
        sale.meetingHref === null
          ? { label: "See every dated sale", href: `${root}/flow` }
          : { label: "Open that meeting", href: sale.meetingHref },
      evidence: evidenceRef(
        `unit-${unitCode}-iris-assisted`,
        "observed_sequence",
        sale.meetingHref ?? `${root}/flow`,
        1,
      ),
      sampleSize: 1,
      sources: WITH_OUTCOME,
      caveat:
        "The buyer of the deal is not linked to the visitor in the room, so this says the unit was shown and when, not that the buyer saw it.",
    });
  }

  const headline =
    row.meetings === 0
      ? `${unit.unitCode} · ${roomsWord(unit.rooms)} · ${areaWord(unit.areaSqm)} · ${unit.priceDisplay}`
      : `${unit.unitCode} · ${roomsWord(unit.rooms)} · ${areaWord(unit.areaSqm)} · ${unit.priceDisplay} · opened in ${count(row.meetings, locale)} meeting${row.meetings === 1 ? "" : "s"}`;

  return {
    context,
    unit,
    headline,
    attention: row,
    signals,
    timeline: timeline.slice(0, 40),
    timelineNote:
      "Only section entries carry a time. Everything that happened inside a section is recorded as having happened during it, so these entries show the day and not the moment. The recorded outcome is the exception: it is stamped at the end of the meeting.",
    funnel,
    relatedMeetings: buildMeetingRows(context, touchedBy).slice(0, 8),
    relatedAgents,
    trend,
    findings,
    emptyState:
      row.meetings === 0
        ? `No meeting in ${context.period.label.toLowerCase()} opened ${unitCode}. The unit is in the catalogue and was available to be shown.`
        : null,
    evidence: evidenceRef(`unit-detail-${unitCode}`, "observed_sequence", href, row.views),
  };
}

/* --- 3. one agent ---------------------------------------------------------- */

/**
 * A rate an agent's sample may be too thin to support.
 *
 * Counts are counts and are shown plainly; a median, a share or a rate is a
 * verdict about how somebody works, and below `AGENT_MIN_SAMPLE` it is returned
 * as `insufficient` with the raw figure still in it. `docs/10-policies.md` §6:
 * show the number, say how far short it falls, draw no conclusion.
 */
function agentFigure(
  metricId: string,
  label: string,
  display: string,
  raw: number,
  qualifier: string,
  sampleSize: number,
): MetricValue {
  const input = {
    metricId,
    label,
    display,
    raw,
    qualifier,
    sampleSize,
    minimumSampleSize: AGENT_MIN_SAMPLE,
  };
  return sampleSize < AGENT_MIN_SAMPLE
    ? insufficient(input, shortOfSample(AGENT_MIN_SAMPLE, "meetings for this agent"))
    : ok(input);
}

export function buildAgentDetail(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  visibleProjects: readonly ProjectSummary[],
  agentId: string,
): AgentDetailView | null {
  const locale = context.project.locale;
  const root = base(context);

  /* The roster, or whoever this project's meetings name: a delivered project's agents are on no roster. */
  const agent = presentersIn(sessions).find((a) => a.id === agentId);
  if (agent === undefined) return null;

  const mine = sessions.filter((s) => s.agentId === agentId);
  /*
   * An agent with no meetings on this project is not found *here*.
   *
   * Not an empty page, and not a refusal either: the reader asked for somebody
   * who does not present on this development, and the honest answer says so
   * without confirming whether they exist on a development the reader cannot
   * see.
   */
  if (mine.length === 0) return null;

  const profile = buildAgentsView(
    context,
    sessions,
    context.viewer.role === "madspace_admin",
  ).agents.find((a) => a.agentId === agentId);
  if (profile === undefined) return null;

  const sampleSize = mine.length;
  const belowMinimum = sampleSize < AGENT_MIN_SAMPLE;

  /* --- activity ------------------------------------------------------------ */

  const timed = mine.filter((s) => !s.timingUnavailable).map((s) => s.durationSeconds);
  const unitsPerMeeting = share(
    mine.reduce((acc, s) => acc + s.units.length, 0),
    mine.length,
  );
  const coverage = share(
    mine.reduce((acc, s) => acc + CORE_SECTION_IDS.filter((id) => reached(s, id)).length, 0),
    mine.length * CORE_SECTION_IDS.length,
  );

  const activity: readonly MetricValue[] = [
    // A count is a count. It is never suppressed, because the sample size is
    // the thing the reader most needs to see when it is small.
    ok({
      metricId: "agent.meetings",
      label: "Presentations",
      display: count(mine.length, locale),
      raw: mine.length,
      qualifier: `of ${count(sessions.length, locale)} on this project`,
      sampleSize,
      minimumSampleSize: AGENT_MIN_SAMPLE,
      drillHref: `${root}/meetings?agent=${agentId}`,
    }),
    timed.length === 0
      ? unavailable(
          "agent.duration",
          "Median presentation",
          AGENT_MIN_SAMPLE,
          "Every meeting of theirs in this period came from the legacy import, which records order but not timing.",
        )
      : agentFigure(
          "agent.duration",
          "Median presentation",
          duration(Math.round(median(timed))),
          Math.round(median(timed)),
          `${count(timed.length, locale)} timed meetings`,
          sampleSize,
        ),
    agentFigure(
      "agent.units",
      "Units opened per meeting",
      unitsPerMeeting.toFixed(1),
      unitsPerMeeting,
      "mean across their meetings",
      sampleSize,
    ),
    agentFigure(
      "agent.coverage",
      "Core sections reached",
      percent(coverage, locale),
      coverage,
      `of ${CORE_SECTION_IDS.length} core sections`,
      sampleSize,
    ),
  ];

  /* --- where else they work ------------------------------------------------ */

  const projects: readonly AgentProjectCoverage[] = visibleProjects.flatMap<AgentProjectCoverage>(
    (project) => {
      const there = sessionsInPeriod(
        project.id as string,
        context.period.from,
        context.period.to,
      ).filter((s) => s.agentId === agentId);
      if (there.length === 0) return [];
      return [
        {
          projectId: project.id as string,
          projectName: project.name,
          meetings: there.length,
          isCurrent: project.id === context.project.id,
          href: `/${context.tenant.slug}/${project.slug}/agents/${agentId}`,
        },
      ];
    },
  );

  /* --- follow-up, and the half nobody records ------------------------------ */

  const followUpRecorded = mine.filter((s) => followUpFor(s) === "required").length;
  const followUp: AgentFollowUp = {
    /* The room's record, on every project; it was withheld without a CRM as though the CRM had made it. */
    recorded:
      followUpRecorded === 0
        ? empty(
            "agent.followup",
            "Follow-ups recorded as needed",
            AGENT_MIN_SAMPLE,
            "No meeting of theirs in this period recorded a follow-up as needed.",
          )
        : ok({
            metricId: "agent.followup",
            label: "Follow-ups recorded as needed",
            display: count(followUpRecorded, locale),
            raw: followUpRecorded,
            qualifier: `of ${count(mine.length, locale)} meetings`,
            sampleSize,
            minimumSampleSize: AGENT_MIN_SAMPLE,
            drillHref: `${root}/meetings?agent=${agentId}`,
          }),
    completed: unavailable(
      "agent.followup.completed",
      "Follow-ups completed",
      AGENT_MIN_SAMPLE,
      "No source records whether a follow-up happened. Observer holds the meeting; the activity after it belongs to the CRM.",
    ),
    note: "Recorded as needed and actually done are two questions. Observer can answer the first one only, and the second is shown as unavailable rather than assumed.",
  };

  /* --- the outcomes they recorded, by their commercial word ------------------ */

  /*
   * The agent's own entry, and nothing stands behind it but the record.
   *
   * The count is `session.outcome`, which the agent tapped in the last minute
   * of the meeting. It used to be gated on a CRM — `!crm ? unavailable(NO_CRM)`
   * — which said the CRM produced the number, and it carried the attributed
   * tier and `CRM_OUTCOME_CONTEXT`, which said a second source stood behind
   * it. Neither was true: no deal is linked to a meeting (ADR-0039), so a
   * per-agent CRM-confirmed outcome cannot exist. The record stands on every
   * project, at the observed tier, from the showroom alone.
   */
  const recordedOutcomes: readonly AgentRecordedOutcome[] = (
    ["purchase", "reservation"] as const
  ).map<AgentRecordedOutcome>((outcome) => {
    const n = mine.filter((s) => s.outcome === outcome).length;
    return {
      outcome,
      label: OUTCOME_LABELS[outcome],
      metric:
        n === 0
          ? empty(
              `agent.${outcome}`,
              OUTCOME_LABELS[outcome],
              AGENT_MIN_SAMPLE,
              `No meeting of theirs in this period was recorded as a ${OUTCOME_LABELS[outcome].toLowerCase()}.`,
            )
          : ok({
              metricId: `agent.${outcome}`,
              label: OUTCOME_LABELS[outcome],
              display: count(n, locale),
              raw: n,
              qualifier: `of ${count(mine.length, locale)} meetings`,
              sampleSize,
              minimumSampleSize: AGENT_MIN_SAMPLE,
              drillHref: `${root}/meetings?agent=${agentId}&outcome=${outcome}`,
            }),
      tier: "observed_sequence",
      sources: OBSERVED,
    };
  });

  /* --- the funnel ---------------------------------------------------------- */

  const openedUnit = mine.filter((s) => s.units.length > 0).length;
  const shortlisted = mine.filter((s) => s.units.some((u) => u.favourited)).length;
  const recorded = mine.filter((s) => !outcomeIsUnknown(s.outcome)).length;
  const progressed = mine.filter((s) => hasProgressed(s.outcome)).length;

  const funnelStep = (
    metricId: string,
    label: string,
    value: number,
    from: number | null,
  ): FunnelStep => ({
    label,
    metric:
      value === 0
        ? empty(
            metricId,
            label,
            AGENT_MIN_SAMPLE,
            `No meeting of theirs reached ${label.toLowerCase()}.`,
          )
        : ok({
            metricId,
            label,
            display: count(value, locale),
            raw: value,
            qualifier: from === null ? undefined : `of ${count(from, locale)}`,
            sampleSize,
            minimumSampleSize: AGENT_MIN_SAMPLE,
          }),
    fromCount: from,
    toCount: value,
  });

  /*
   * Five observed states. The last two are the recorded outcome, which is the
   * room's own record; they were gated on a CRM as though the CRM had made
   * them, and on a project without one the funnel drew its meetings dying at
   * the shortlist.
   */
  const funnel: readonly FunnelStep[] = [
    funnelStep("agent.funnel.meetings", "Presentations", mine.length, null),
    funnelStep("agent.funnel.units", "Opened a unit", openedUnit, mine.length),
    funnelStep("agent.funnel.shortlist", "Shortlisted a unit", shortlisted, openedUnit),
    funnelStep("agent.funnel.recorded", "Outcome recorded", recorded, mine.length),
    funnelStep("agent.funnel.progressed", "Progressed further", progressed, recorded),
  ];

  /* --- what their buyers were looking at ----------------------------------- */

  const catalogue = catalogueFor(context.project.id as string);
  /* Stated counts only; a unit with none belongs to no room bucket here. */
  const roomsPresent = roomCounts(catalogue);
  const codesByRooms = new Map<number, Set<string>>(
    roomsPresent.map((rooms) => [
      rooms,
      new Set(catalogue.filter((u) => u.rooms === rooms).map((u) => u.code)),
    ]),
  );

  const buyerInterest: readonly AgentBuyerInterest[] = roomsPresent.map<AgentBuyerInterest>(
    (rooms) => {
      const codes = codesByRooms.get(rooms) ?? new Set<string>();
      const touched = (list: readonly ShowroomSession[]): number =>
        list.filter((s) => s.units.some((u) => codes.has(u.unitCode))).length;
      return {
        id: `rooms-${rooms}`,
        label: `${rooms}-room`,
        meetings: touched(mine),
        share: share(touched(mine), mine.length),
        teamShare: share(touched(sessions), sessions.length),
      };
    },
  );

  /* --- the units they keep opening ----------------------------------------- */

  const unitCounts = new Map<string, { meetings: number; favourites: number }>();
  for (const session of mine) {
    for (const touch of session.units) {
      const entry = unitCounts.get(touch.unitCode) ?? { meetings: 0, favourites: 0 };
      entry.meetings += 1;
      if (touch.favourited) entry.favourites += 1;
      unitCounts.set(touch.unitCode, entry);
    }
  }
  const commonUnits: readonly AgentUnitInterest[] = [...unitCounts.entries()]
    .map<AgentUnitInterest>(([unitCode, v]) => ({
      unitCode,
      meetings: v.meetings,
      favourites: v.favourites,
      share: share(v.meetings, mine.length),
      href: `${root}/units?unit=${unitCode}`,
    }))
    .sort((a, b) => b.meetings - a.meetings)
    .slice(0, 6);

  /* --- findings ------------------------------------------------------------ */

  const findings: ShowroomFinding[] = [];

  if (belowMinimum) {
    findings.push({
      id: `agent-${agentId}-sample`,
      statement: `${agent.name} presented ${meetingsWord(mine.length, locale)} in ${context.period.label.toLowerCase()}, ${count(AGENT_MIN_SAMPLE - mine.length, locale)} short of the ${AGENT_MIN_SAMPLE} this product requires before it will read a figure as a verdict.`,
      baseline: `${count(sessions.length, locale)} meetings on the project`,
      soWhat:
        "The counts on this page are real and the rates are shown as raw figures. No rank, verdict or trend is drawn from them at this sample size.",
      nextStep: { label: "See their meetings", href: `${root}/meetings?agent=${agentId}` },
      evidence: evidenceRef(
        `agent-sample-${agentId}`,
        "observed_sequence",
        `${root}/meetings?agent=${agentId}`,
        mine.length,
      ),
      sampleSize: mine.length,
      sources: OBSERVED,
      caveat: "A small sample is a small sample. It is not a statement about the person.",
    });
  } else if (profile.signature !== null) {
    findings.push({
      id: `agent-${agentId}-signature`,
      statement: `${agent.name} spends ${profile.signature.overIndex.toFixed(1)}× the team's share of presentation time in ${profile.signature.label}.`,
      /* The set the share stands on, then the project it is set against. */
      baseline: `${count(profile.timedMeetings, locale)} of ${count(mine.length, locale)} meetings the source could time end to end, against ${count(sessions.length, locale)} on the project`,
      soWhat:
        "A habit is visible long before its result is. Whether it is worth copying or worth changing is a conversation this figure can open.",
      nextStep: { label: "Compare presentations", href: `${root}/presentation` },
      evidence: evidenceRef(
        `agent-signature-${agentId}`,
        "statistical_association",
        `${root}/agents/${agentId}`,
        mine.length,
      ),
      sampleSize: mine.length,
      sources: DERIVED,
      caveat: "An association across their meetings, not an account of any one of them.",
    });
  }

  const unrecorded = mine.length - recorded;
  if (unrecorded > 0) {
    findings.push({
      id: `agent-${agentId}-unrecorded`,
      statement: `${count(unrecorded, locale)} of their ${count(mine.length, locale)} meetings ended with no outcome recorded.`,
      baseline: `${percent(share(unrecorded, mine.length), locale)} of their meetings`,
      soWhat:
        "Every rate on this page that uses an outcome silently drops those meetings. The remedy is a habit at the end of the meeting rather than a change to the data.",
      nextStep: { label: "See their meetings", href: `${root}/meetings?agent=${agentId}` },
      evidence: evidenceRef(
        `agent-unrecorded-${agentId}`,
        "observed_sequence",
        `${root}/meetings?agent=${agentId}`,
        unrecorded,
      ),
      sampleSize: mine.length,
      sources: OBSERVED,
      caveat: null,
    });
  }

  const buckets = weeklyBuckets(
    context.period.from,
    context.period.to,
    locale,
    context.project.timeZone,
  );

  return {
    context,
    agentId,
    name: agent.name,
    organisationName: agent.organisationName,
    sampleSize,
    minimumSampleSize: AGENT_MIN_SAMPLE,
    belowMinimum,
    /* One builder for the floor's sentence, shared with the roster and the charts. */
    suppressionNote: belowMinimum ? suppressionNoteFor(mine.length, locale) : null,
    activity,
    profile,
    projects,
    recentMeetings: buildMeetingRows(context, mine).slice(0, 8),
    commonUnits,
    followUp,
    recordedOutcomes,
    outcomeMix: profile.ring.slices,
    sessionsOverTime: {
      points: seriesOver(mine, buckets),
      annotation: null,
      valueLabel: "Presentations",
    },
    funnel,
    buyerInterest,
    findings,
    evidence: evidenceRef(
      `agent-detail-${agentId}`,
      "observed_sequence",
      `${root}/agents/${agentId}`,
      mine.length,
    ),
  };
}
