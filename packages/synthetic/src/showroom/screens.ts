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
import {
  AGENT_REGISTER_ROLES,
  DEFAULT_LANGUAGE,
  MEETINGS,
  OUTCOME_WORDS,
  TIMES,
  areaWord,
  duration,
  hungarianArticle,
  nothingReceivedYet,
  plural,
  roomsWord,
  sentence,
  slovakZForm,
  visitorLabel,
  type Language,
  type PluralForms,
  type Sentence,
} from "@observer/readmodels";
import { visitorNameFor } from "../contacts";
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
import { startOfWeekIn } from "../time";
import { presenterName, presentersIn, sessionsForProject, sessionsInPeriod } from "./sessions";
import { buildMeetingList, buildUnitAttention } from "./project";
import {
  buildAgentsView,
  meetings as meetingsWord,
  segmentName,
  suppressionNoteFor,
} from "./views3";

/*
 * The unit page's sentences, each written once per language in that
 * language's own order. Occasions are the shared `TIMES`; a count of meetings
 * after "in" is a locative in Slovak and a suffix in Hungarian, so those forms
 * are each sentence's own.
 */

/** "Opened 5 times": a timeline entry's title. */
export const SCREENS_OPENED_SENTENCE: Sentence = {
  en: { text: "Opened {count} {times|n}", words: { times: TIMES.en } },
  sk: { text: "Otvorená {count} {times|n}", words: { times: TIMES.sk } },
  hu: { text: "{count} alkalommal megnyitva" },
};

/** "B-302 was shortlisted in 3 meetings, none of which recorded a follow-up." */
export const SCREENS_SHORTLISTED_SENTENCE: Sentence = {
  en: {
    text: "{unit} was shortlisted in {count} {meetings|n}, none of which recorded a follow-up.",
    words: { meetings: MEETINGS.en },
  },
  sk: {
    text: "Jednotka {unit} bola zaradená do výberu v {count} {meetings|n} a {none|n}.",
    words: {
      /* After "v": the locative. */
      meetings: { one: "stretnutí", few: "stretnutiach", other: "stretnutiach" },
      none: {
        one: "pri ňom nebol zaznamenaný žiadny ďalší krok",
        few: "pri žiadnom z nich nebol zaznamenaný ďalší krok",
        other: "pri žiadnom z nich nebol zaznamenaný ďalší krok",
      },
    },
  },
  hu: {
    text: "{Az:unit} egység {count} találkozón került a kiválasztottak közé, és {none|n}.",
    words: {
      none: {
        one: "azon nem rögzítettek utánkövetést",
        other: "egyiken sem rögzítettek utánkövetést",
      },
    },
  },
};

/** "B-302 · 2 rooms · 63 m² · €240,000 · opened in 3 meetings": a unit's headline. */
export const SCREENS_UNIT_HEADLINE: Sentence = {
  en: {
    text: "{unit} · {rooms} · {area} · {price} · opened in {count} {meetings|n}",
    words: { meetings: MEETINGS.en },
  },
  sk: {
    text: "{unit} · {rooms} · {area} · {price} · otvorená v {count} {meetings|n}",
    words: { meetings: { one: "stretnutí", few: "stretnutiach", other: "stretnutiach" } },
  },
  hu: { text: "{unit} · {rooms} · {area} · {price} · {count} találkozón megnyitva" },
};

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

/** A week of the period: from its first instant inside the period (inclusive) to its last (exclusive). */
export interface Bucket {
  readonly from: number;
  readonly to: number;
  readonly label: string;
}

/**
 * The period, cut into calendar weeks.
 *
 * Weeks rather than days because a project running three appointments a week
 * produces a daily series that is mostly zeros, and a reader cannot tell a
 * genuinely quiet Tuesday from a series drawn at the wrong resolution. Capped at
 * the last twelve, so a year-to-date period stays readable and the label still
 * says which twelve.
 *
 * The weeks are `buildTrend`'s (`charts.ts`): Monday to Sunday, from the
 * project's own midnight. They used to be seven-day steps from the moment the
 * period opened, so a year opening on a Thursday ran Thursday to Wednesday,
 * every period put its boundary on a different weekday, and the agent and unit
 * pages filed a meeting under a different week than the Sales Flow did.
 *
 * The first week is cut where the period starts and the last where it ends.
 * Each is labelled with its first day inside the period — the start for the
 * first, the Monday for every other — so no label names a day the period does
 * not hold.
 */
export function weeklyBuckets(
  fromIso: string,
  toIso: string,
  locale: string,
  timeZone: string,
): readonly Bucket[] {
  const day = 24 * 60 * 60 * 1000;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];

  const all: Bucket[] = [];
  for (let monday = startOfWeekIn(from, timeZone).getTime(); monday < to;) {
    // Seven days on, re-anchored to Monday midnight, as `buildTrend` steps: a
    // clock change inside the week cannot drift the next start by an hour.
    const next = startOfWeekIn(monday + 7 * day + 12 * 60 * 60 * 1000, timeZone).getTime();
    const start = Math.max(monday, from);
    all.push({
      from: start,
      to: Math.min(next, to),
      label: dayLabel(new Date(start), locale, timeZone),
    });
    monday = next;
  }
  return all.slice(-12);
}

/** Each bucket's meetings: closed at the bucket's start, open at its end, so a meeting counts once. */
export function seriesOver(
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
/* What each follow-up state means, as a register row's title says it; Slovak and Hungarian are drafts (P2-17). */
const FOLLOW_UP_SENTENCES: Readonly<Record<Language, Readonly<Record<FollowUpState, string>>>> = {
  en: {
    not_recorded: "No outcome was recorded for this meeting.",
    required: "The recorded outcome asks for a follow-up.",
    not_required: "The recorded outcome does not ask for a follow-up.",
  },
  sk: {
    not_recorded: "Na tomto stretnutí sa nezaznamenal žiadny výsledok.",
    required: "Zaznamenaný výsledok si vyžaduje ďalší kontakt.",
    not_required: "Zaznamenaný výsledok si nevyžaduje ďalší kontakt.",
  },
  hu: {
    not_recorded: "Ezen a találkozón nem rögzítettek eredményt.",
    required: "A rögzített eredmény utánkövetést kér.",
    not_required: "A rögzített eredmény nem kér utánkövetést.",
  },
};

export function buildMeetingRows(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  /*
   * Only an agent's register prints the buyer's name (docs/22 §5, B), so only
   * its rows carry one. The meetings list and a unit's related meetings are
   * open to every role and print the label alone; rows that never carry the
   * field cannot leak it through a component that forgets to withhold it.
   */
  naming: "agent-register" | "label-only" = "label-only",
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
  const language = context.language ?? DEFAULT_LANGUAGE;

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
          language,
        ),
        /*
         * The gate first, then the directory. A viewer outside the roles never
         * receives a name from the repository, so no screen has to remember to
         * withhold one; inside them, the directory's own rule applies —
         * consent, erasure, a name on record — per render, stored nowhere.
         */
        visitorName:
          naming === "agent-register" && AGENT_REGISTER_ROLES.includes(context.viewer.role)
            ? visitorNameFor(session.contactId)
            : null,
        unitsViewed: session.units.map((u) => ({
          code: u.unitCode,
          href: catalogueCodes.has(u.unitCode)
            ? `${root}/units/${encodeURIComponent(u.unitCode)}`
            : null,
        })),
        favourites: session.units.filter((u) => u.favourited).length,
        followUp,
        followUpLabel: FOLLOW_UP_SENTENCES[language][followUp],
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
  const language = context.language;
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
  /* Forty entries, newest meetings first; the note below says so and out of how many (P2-16). */
  const TIMELINE_SHOWN = 40;
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
      sentence(language, SCREENS_OPENED_SENTENCE, {
        count: count(touch.views, locale),
        n: touch.views,
      }),
      `${duration(touch.dwellSeconds, language)} in total, longest look ${duration(touch.longestViewSeconds, language)}`,
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
      statement: sentence(language, SCREENS_SHORTLISTED_SENTENCE, {
        unit: unitCode,
        count: count(row.favourites, locale),
        n: row.favourites,
      }),
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
    context.language,
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
      ? `${unit.unitCode} · ${roomsWord(unit.rooms, language)} · ${areaWord(unit.areaSqm)} · ${unit.priceDisplay}`
      : sentence(language, SCREENS_UNIT_HEADLINE, {
          unit: unit.unitCode,
          rooms: roomsWord(unit.rooms, language),
          area: areaWord(unit.areaSqm),
          price: unit.priceDisplay,
          count: count(row.meetings, locale),
          n: row.meetings,
        });

  return {
    context,
    unit,
    headline,
    attention: row,
    signals,
    timeline: timeline.slice(0, TIMELINE_SHOWN),
    timelineNote:
      "Only section entries carry a time. Everything that happened inside a section is recorded as having happened during it, so these entries show the day and not the moment. The recorded outcome is the exception: it is stamped at the end of the meeting." +
      (timeline.length > TIMELINE_SHOWN
        ? ` The ${TIMELINE_SHOWN} entries from the most recent meetings are shown, of ${count(timeline.length, locale)}.`
        : ""),
    funnel,
    /*
     * Every meeting in the period that opened this unit. It was the first eight
     * under a caption claiming all of them, and no other surface lists a unit's
     * meetings, so the rest were unreachable (P2-16).
     */
    relatedMeetings: buildMeetingRows(context, touchedBy),
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
/*
 * ONE AGENT'S SCREEN, IN EACH LANGUAGE A REPORT CAN BE PRINTED IN.
 *
 * English is what the agent's screen always said, and the screens stay
 * English; the printed summary is drawn from the same read model, so it
 * carries these words in the reader's language. Slovak avoids the past tense
 * and the possessive where either would name the agent's gender, which the
 * product does not hold. Slovak and Hungarian are drafts for review (P2-17).
 */
interface AgentDetailWords {
  readonly presentations: string;
  readonly ofProject: (total: string, n: number) => string;
  readonly median: string;
  readonly legacyOnly: string;
  readonly timed: (display: string, n: number) => string;
  readonly unitsPerMeeting: string;
  readonly mean: string;
  readonly coreReached: string;
  readonly ofCore: (n: number) => string;
  readonly followUpsRecorded: string;
  readonly noFollowUp: string;
  readonly ofMeetings: (display: string, n: number) => string;
  readonly followUpsCompleted: string;
  readonly completedWhy: string;
  readonly followUpNote: string;
  readonly noOutcome: (outcome: string) => string;
  readonly funnel: readonly [string, string, string, string, string];
  readonly funnelNone: (stage: string) => string;
  readonly funnelOf: (display: string, n: number) => string;
  readonly shortOfSample: string;
  readonly belowStatement: (
    name: string,
    meetings: string,
    period: string,
    short: string,
    minimum: string,
  ) => string;
  readonly projectMeetings: (display: string, n: number) => string;
  readonly belowSoWhat: string;
  readonly seeMeetings: string;
  readonly belowCaveat: string;
  readonly signatureStatement: (name: string, index: string, section: string) => string;
  readonly signatureBaseline: (timed: string, held: string, total: string, heldN: number) => string;
  readonly signatureSoWhat: string;
  readonly comparePresentations: string;
  readonly signatureCaveat: string;
  readonly unrecordedStatement: (unrecorded: string, total: string, totalN: number) => string;
  readonly unrecordedBaseline: (share: string) => string;
  readonly unrecordedSoWhat: string;
}

/* "22 timed meetings", in Slovak with the count's own form. */
const TIMED_MEETINGS: PluralForms = {
  en: { one: "timed meeting", other: "timed meetings" },
  sk: {
    one: "stretnutie s meraným časom",
    few: "stretnutia s meraným časom",
    other: "stretnutí s meraným časom",
  },
  hu: { one: "mért idejű találkozó", other: "mért idejű találkozó" },
};

const AGENT_DETAIL_WORDS: Readonly<Record<Language, AgentDetailWords>> = {
  en: {
    presentations: "Presentations",
    ofProject: (total) => `of ${total} on this project`,
    median: "Median presentation",
    legacyOnly:
      "Every meeting of theirs in this period came from the legacy import, which records order but not timing.",
    timed: (display) => `${display} timed meetings`,
    unitsPerMeeting: "Units opened per meeting",
    mean: "mean across their meetings",
    coreReached: "Core sections reached",
    ofCore: (n) => `of ${String(n)} core sections`,
    followUpsRecorded: "Follow-ups recorded as needed",
    noFollowUp: "No meeting of theirs in this period recorded a follow-up as needed.",
    ofMeetings: (display) => `of ${display} meetings`,
    followUpsCompleted: "Follow-ups completed",
    completedWhy:
      "No source records whether a follow-up happened. Observer holds the meeting; the activity after it belongs to the CRM.",
    followUpNote:
      "Recorded as needed and actually done are two questions. Observer can answer the first one only, and the second is shown as unavailable rather than assumed.",
    noOutcome: (outcome) =>
      `No meeting of theirs in this period was recorded as a ${outcome.toLowerCase()}.`,
    funnel: [
      "Presentations",
      "Opened a unit",
      "Shortlisted a unit",
      "Outcome recorded",
      "Progressed further",
    ],
    funnelNone: (stage) => `No meeting of theirs reached ${stage.toLowerCase()}.`,
    funnelOf: (display) => `of ${display}`,
    shortOfSample: shortOfSample(AGENT_MIN_SAMPLE, "meetings for this agent"),
    belowStatement: (name, meetings, period, short, minimum) =>
      `${name} presented ${meetings} in ${period.toLowerCase()}, ${short} short of the ${minimum} this product requires before it will read a figure as a verdict.`,
    projectMeetings: (display) => `${display} meetings on the project`,
    belowSoWhat:
      "The counts on this page are real and the rates are shown as raw figures. No rank, verdict or trend is drawn from them at this sample size.",
    seeMeetings: "See their meetings",
    belowCaveat: "A small sample is a small sample. It is not a statement about the person.",
    signatureStatement: (name, index, section) =>
      `${name} spends ${index}× the team's share of presentation time in ${section}.`,
    signatureBaseline: (timed, held, total) =>
      `${timed} of ${held} meetings the source could time end to end, against ${total} on the project`,
    signatureSoWhat:
      "A habit is visible long before its result is. Whether it is worth copying or worth changing is a conversation this figure can open.",
    comparePresentations: "Compare presentations",
    signatureCaveat: "An association across their meetings, not an account of any one of them.",
    unrecordedStatement: (unrecorded, total) =>
      `${unrecorded} of their ${total} meetings ended with no outcome recorded.`,
    unrecordedBaseline: (share) => `${share} of their meetings`,
    unrecordedSoWhat:
      "Every rate on this page that uses an outcome silently drops those meetings. The remedy is a habit at the end of the meeting rather than a change to the data.",
  },
  sk: {
    presentations: "Prezentácie",
    ofProject: (total, n) => `${slovakZForm(n)} ${total} na tomto projekte`,
    median: "Medián dĺžky prezentácie",
    legacyOnly:
      "Všetky stretnutia v tomto období pochádzajú zo staršieho importu, ktorý zaznamenáva poradie, nie čas.",
    timed: (display, n) => `${display} ${plural("sk", n, TIMED_MEETINGS)}`,
    unitsPerMeeting: "Otvorené byty na stretnutie",
    mean: "priemer zo stretnutí",
    coreReached: "Dosiahnuté základné sekcie",
    ofCore: (n) =>
      `${slovakZForm(n)} ${String(n)} ${n === 1 ? "základnej sekcie" : "základných sekcií"}`,
    followUpsRecorded: "Ďalšie kontakty zaznamenané ako potrebné",
    noFollowUp: "Žiadne stretnutie v tomto období nezaznamenalo potrebu ďalšieho kontaktu.",
    ofMeetings: (display, n) =>
      `${slovakZForm(n)} ${display} ${n === 1 ? "stretnutia" : "stretnutí"}`,
    followUpsCompleted: "Uskutočnené ďalšie kontakty",
    completedWhy:
      "Žiadny zdroj nezaznamenáva, či sa ďalší kontakt uskutočnil. Observer má stretnutie; činnosť po ňom patrí CRM.",
    followUpNote:
      "Zaznamenané ako potrebné a skutočne vykonané sú dve otázky. Observer vie odpovedať iba na prvú; druhá je uvedená ako nedostupná, nie domyslená.",
    noOutcome: (outcome) =>
      `Žiadne stretnutie v tomto období nemá zaznamenaný výsledok „${outcome}“.`,
    funnel: [
      "Prezentácie",
      "Otvorený byt",
      "Byt v obľúbených",
      "Zaznamenaný výsledok",
      "Pokročilo ďalej",
    ],
    funnelNone: (stage) => `Žiadne stretnutie nedosiahlo stav „${stage}“.`,
    funnelOf: (display, n) => `${slovakZForm(n)} ${display}`,
    shortOfSample: `Menej ako ${String(AGENT_MIN_SAMPLE)} stretnutí — zobrazené ako surové číslo, nie ako hodnotenie.`,
    belowStatement: (name, meetings, period, short, minimum) =>
      `${name}: ${meetings} (${period.toLowerCase()}), o ${short} menej ako ${minimum}, ktoré produkt vyžaduje, kým prečíta číslo ako hodnotenie.`,
    projectMeetings: (display, n) => `${display} ${plural("sk", n, MEETINGS)} na projekte`,
    belowSoWhat:
      "Počty na tejto stránke sú skutočné a miery sú uvedené ako surové čísla. Pri tejto veľkosti vzorky sa z nich neodvodzuje poradie, hodnotenie ani trend.",
    seeMeetings: "Zobraziť stretnutia",
    belowCaveat: "Malá vzorka je malá vzorka. Nie je to výrok o človeku.",
    signatureStatement: (name, index, section) =>
      `${name} venuje sekcii ${section} ${index}× väčší podiel času prezentácie ako tím.`,
    signatureBaseline: (timed, held, total, heldN) =>
      `${timed} ${slovakZForm(heldN)} ${held} stretnutí, ktoré zdroj dokázal zmerať od začiatku do konca, oproti ${total} na projekte`,
    signatureSoWhat:
      "Zvyk je viditeľný dávno pred svojím výsledkom. Či sa oplatí ho napodobniť, alebo zmeniť, je rozhovor, ktorý toto číslo môže otvoriť.",
    comparePresentations: "Porovnať prezentácie",
    signatureCaveat: "Súvislosť naprieč stretnutiami, nie opis ktoréhokoľvek z nich.",
    unrecordedStatement: (unrecorded, total, totalN) =>
      `Bez zaznamenaného výsledku: ${unrecorded} ${slovakZForm(totalN)} ${total} stretnutí.`,
    unrecordedBaseline: (share) => `${share} stretnutí`,
    unrecordedSoWhat:
      "Každá miera na tejto stránke, ktorá používa výsledok, tieto stretnutia potichu vynecháva. Náprava je zvyk na konci stretnutia, nie zmena údajov.",
  },
  hu: {
    presentations: "Bemutatók",
    ofProject: (total) => `${total} közül ezen a projekten`,
    median: "Bemutatók medián hossza",
    legacyOnly:
      "Az időszak minden találkozója a korábbi importból származik, amely a sorrendet rögzíti, az időzítést nem.",
    timed: (display) => `${display} mért idejű találkozó`,
    unitsPerMeeting: "Megnyitott lakások találkozónként",
    mean: "átlag a találkozói alapján",
    coreReached: "Elért alapszakaszok",
    ofCore: (n) => `${String(n)} alapszakasz közül`,
    followUpsRecorded: "Szükségesként rögzített utánkövetések",
    noFollowUp: "Az időszakban egyetlen találkozóján sem rögzítettek szükséges utánkövetést.",
    ofMeetings: (display) => `${display} találkozó közül`,
    followUpsCompleted: "Elvégzett utánkövetések",
    completedWhy:
      "Egyetlen forrás sem rögzíti, megtörtént-e az utánkövetés. Az Observer a találkozót látja; ami utána történik, az a CRM-hez tartozik.",
    followUpNote:
      "A szükségesként rögzített és a ténylegesen elvégzett két külön kérdés. Az Observer csak az elsőre tud felelni; a második nem elérhetőként szerepel, nem feltételezve.",
    noOutcome: (outcome) =>
      `Az időszakban egyetlen találkozóját sem rögzítették „${outcome}” eredménnyel.`,
    funnel: [
      "Bemutatók",
      "Lakást nyitottak meg",
      "Lakás a kedvencek között",
      "Rögzített eredmény",
      "Továbblépett",
    ],
    funnelNone: (stage) => `Egyetlen találkozója sem jutott el ide: „${stage}”.`,
    funnelOf: (display) => `${display} közül`,
    shortOfSample: `Kevesebb mint ${String(AGENT_MIN_SAMPLE)} találkozó — nyers számként látható, nem értékelésként.`,
    belowStatement: (name, meetings, period, short, minimum) =>
      `${name}: ${meetings} (${period.toLowerCase()}); a termék ${minimum} találkozót kér, mielőtt egy számot értékelésként olvasna, ebből ${short} hiányzik.`,
    projectMeetings: (display) => `${display} találkozó a projekten`,
    belowSoWhat:
      "Az oldalon szereplő darabszámok valósak, az arányok nyers számként szerepelnek. Ekkora mintából nem készül rangsor, értékelés vagy trend.",
    seeMeetings: "Találkozók megtekintése",
    belowCaveat: "A kis minta kis minta. Nem állítás az emberről.",
    signatureStatement: (name, index, section) =>
      `${name} a csapatnál ${index}× nagyobb arányban tölti a bemutatási idejét ${hungarianArticle(section)} ${section} szakaszban.`,
    signatureBaseline: (timed, held, total) =>
      `${held} találkozóból ${timed}, amelyet a forrás elejétől végéig mérni tudott, szemben a projekt ${total} találkozójával`,
    signatureSoWhat:
      "Egy szokás jóval előbb látszik, mint az eredménye. Hogy érdemes-e átvenni vagy változtatni rajta, arról ez a szám beszélgetést nyithat.",
    comparePresentations: "Bemutatók összehasonlítása",
    signatureCaveat: "Összefüggés a találkozói között, nem egyetlen találkozó leírása.",
    unrecordedStatement: (unrecorded, total) =>
      `Rögzített eredmény nélkül zárult: ${total} találkozóból ${unrecorded}.`,
    unrecordedBaseline: (share) => `${share} a találkozói közül`,
    unrecordedSoWhat:
      "Az oldal minden aránya, amely eredményt használ, csendben kihagyja ezeket a találkozókat. A megoldás egy szokás a találkozó végén, nem az adatok módosítása.",
  },
};

function agentFigure(
  metricId: string,
  label: string,
  display: string,
  raw: number,
  qualifier: string,
  sampleSize: number,
  shortfall: string = AGENT_DETAIL_WORDS.en.shortOfSample,
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
  return sampleSize < AGENT_MIN_SAMPLE ? insufficient(input, shortfall) : ok(input);
}

export function buildAgentDetail(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  visibleProjects: readonly ProjectSummary[],
  agentId: string,
): AgentDetailView | null {
  const locale = context.project.locale;
  const root = base(context);
  const language = context.language ?? DEFAULT_LANGUAGE;
  const words = AGENT_DETAIL_WORDS[language];

  /* The roster, or whoever this project's meetings name: a delivered project's agents are on no roster. */
  const agent = presentersIn(sessions, language).find((a) => a.id === agentId);
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
      label: words.presentations,
      display: count(mine.length, locale),
      raw: mine.length,
      qualifier: words.ofProject(count(sessions.length, locale), sessions.length),
      sampleSize,
      minimumSampleSize: AGENT_MIN_SAMPLE,
      drillHref: `${root}/meetings?agent=${agentId}`,
    }),
    timed.length === 0
      ? unavailable("agent.duration", words.median, AGENT_MIN_SAMPLE, words.legacyOnly)
      : agentFigure(
          "agent.duration",
          words.median,
          duration(Math.round(median(timed)), language),
          Math.round(median(timed)),
          words.timed(count(timed.length, locale), timed.length),
          sampleSize,
          words.shortOfSample,
        ),
    agentFigure(
      "agent.units",
      words.unitsPerMeeting,
      unitsPerMeeting.toFixed(1),
      unitsPerMeeting,
      words.mean,
      sampleSize,
      words.shortOfSample,
    ),
    agentFigure(
      "agent.coverage",
      words.coreReached,
      percent(coverage, locale),
      coverage,
      words.ofCore(CORE_SECTION_IDS.length),
      sampleSize,
      words.shortOfSample,
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
        ? empty("agent.followup", words.followUpsRecorded, AGENT_MIN_SAMPLE, words.noFollowUp)
        : ok({
            metricId: "agent.followup",
            label: words.followUpsRecorded,
            display: count(followUpRecorded, locale),
            raw: followUpRecorded,
            qualifier: words.ofMeetings(count(mine.length, locale), mine.length),
            sampleSize,
            minimumSampleSize: AGENT_MIN_SAMPLE,
            drillHref: `${root}/meetings?agent=${agentId}`,
          }),
    completed: unavailable(
      "agent.followup.completed",
      words.followUpsCompleted,
      AGENT_MIN_SAMPLE,
      words.completedWhy,
    ),
    note: words.followUpNote,
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
    const outcomeWord = OUTCOME_WORDS[language][outcome];
    return {
      outcome,
      label: outcomeWord,
      metric:
        n === 0
          ? empty(`agent.${outcome}`, outcomeWord, AGENT_MIN_SAMPLE, words.noOutcome(outcomeWord))
          : ok({
              metricId: `agent.${outcome}`,
              label: outcomeWord,
              display: count(n, locale),
              raw: n,
              qualifier: words.ofMeetings(count(mine.length, locale), mine.length),
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
        ? empty(metricId, label, AGENT_MIN_SAMPLE, words.funnelNone(label))
        : ok({
            metricId,
            label,
            display: count(value, locale),
            raw: value,
            qualifier: from === null ? undefined : words.funnelOf(count(from, locale), from),
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
    funnelStep("agent.funnel.meetings", words.funnel[0], mine.length, null),
    funnelStep("agent.funnel.units", words.funnel[1], openedUnit, mine.length),
    funnelStep("agent.funnel.shortlist", words.funnel[2], shortlisted, openedUnit),
    funnelStep("agent.funnel.recorded", words.funnel[3], recorded, mine.length),
    funnelStep("agent.funnel.progressed", words.funnel[4], progressed, recorded),
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
        label: language === "en" ? `${rooms}-room` : segmentName(rooms, language),
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
      statement: words.belowStatement(
        agent.name,
        meetingsWord(mine.length, locale, language),
        context.period.label,
        count(AGENT_MIN_SAMPLE - mine.length, locale),
        String(AGENT_MIN_SAMPLE),
      ),
      baseline: words.projectMeetings(count(sessions.length, locale), sessions.length),
      soWhat: words.belowSoWhat,
      nextStep: { label: words.seeMeetings, href: `${root}/meetings?agent=${agentId}` },
      evidence: evidenceRef(
        `agent-sample-${agentId}`,
        "observed_sequence",
        `${root}/meetings?agent=${agentId}`,
        mine.length,
      ),
      sampleSize: mine.length,
      sources: OBSERVED,
      caveat: words.belowCaveat,
    });
  } else if (profile.signature !== null) {
    findings.push({
      id: `agent-${agentId}-signature`,
      statement: words.signatureStatement(
        agent.name,
        profile.signature.overIndex.toFixed(1),
        profile.signature.label,
      ),
      /* The set the share stands on, then the project it is set against. */
      baseline: words.signatureBaseline(
        count(profile.timedMeetings, locale),
        count(mine.length, locale),
        count(sessions.length, locale),
        mine.length,
      ),
      soWhat: words.signatureSoWhat,
      nextStep: { label: words.comparePresentations, href: `${root}/presentation` },
      evidence: evidenceRef(
        `agent-signature-${agentId}`,
        "statistical_association",
        `${root}/agents/${agentId}`,
        mine.length,
      ),
      sampleSize: mine.length,
      sources: DERIVED,
      caveat: words.signatureCaveat,
    });
  }

  const unrecorded = mine.length - recorded;
  if (unrecorded > 0) {
    findings.push({
      id: `agent-${agentId}-unrecorded`,
      statement: words.unrecordedStatement(
        count(unrecorded, locale),
        count(mine.length, locale),
        mine.length,
      ),
      baseline: words.unrecordedBaseline(percent(share(unrecorded, mine.length), locale)),
      soWhat: words.unrecordedSoWhat,
      nextStep: { label: words.seeMeetings, href: `${root}/meetings?agent=${agentId}` },
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
    suppressionNote: belowMinimum
      ? suppressionNoteFor(mine.length, locale, "sentence", language)
      : null,
    activity,
    profile,
    projects,
    recentMeetings: buildMeetingRows(context, mine, "agent-register").slice(0, 8),
    commonUnits,
    followUp,
    recordedOutcomes,
    outcomeMix: profile.ring.slices,
    sessionsOverTime: {
      points: seriesOver(mine, buckets),
      annotation: null,
      valueLabel: words.presentations,
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
