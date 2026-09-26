import {
  OUTCOME_LABELS,
  outcomeIsUnknown,
  type EvidenceTier,
  type InsightSource,
  type ShowroomSession,
} from "@observer/contracts";
import { UNIT_MIN_SAMPLE } from "@observer/metrics";
import type {
  AlertItem,
  AlertSeverity,
  AttentionCheck,
  AttentionKind,
  AttentionState,
  AttentionSubject,
  AttentionView,
  ProjectSource,
  ViewContext,
} from "@observer/readmodels";
import {
  ATTENTION_KIND_DEFINITIONS,
  sentence,
  type PluralForms,
  type Sentence,
} from "@observer/readmodels";
import { catalogueFor } from "../pulse";
import { count, dayLabel, evidenceRef, percent } from "../format";

/*
 * The words the attention findings count in, beside the findings that use
 * them. The Slovak and Hungarian forms are the ones a count takes standing
 * alone or as a subject; a sentence that governs another case chooses its
 * forms when it is translated.
 */

export const ATTENTION_UNITS: PluralForms = {
  en: { one: "unit", other: "units" },
  sk: { one: "jednotka", few: "jednotky", other: "jednotiek" },
  hu: { one: "egység", other: "egység" },
};

export const ATTENTION_SOURCES_SILENT: PluralForms = {
  en: { one: "connected source has sent nothing", other: "connected sources have sent nothing" },
  sk: {
    one: "pripojený zdroj neposlal nič",
    few: "pripojené zdroje neposlali nič",
    other: "pripojených zdrojov neposlalo nič",
  },
  hu: {
    one: "csatlakoztatott forrás nem küldött semmit",
    other: "csatlakoztatott forrás nem küldött semmit",
  },
};

export const ATTENTION_SOURCES_LISTED: PluralForms = {
  en: { one: "source is listed", other: "sources are listed" },
  sk: { one: "zdroj je uvedený", few: "zdroje sú uvedené", other: "zdrojov je uvedených" },
  hu: { one: "forrás szerepel", other: "forrás szerepel" },
};

export const ATTENTION_NEVER_REPORTED: PluralForms = {
  en: { one: "has never reported", other: "have never reported" },
  sk: { one: "sa nikdy neozval", few: "sa nikdy neozvali", other: "sa nikdy neozvalo" },
  hu: { one: "soha nem jelentkezett", other: "soha nem jelentkezett" },
};

export const ATTENTION_NEVER_SHORTLISTED: PluralForms = {
  en: { one: "was never shortlisted", other: "were never shortlisted" },
  sk: {
    one: "nebola nikdy vybraná",
    few: "neboli nikdy vybrané",
    other: "nebolo nikdy vybraných",
  },
  hu: { one: "soha nem került kiválasztásra", other: "soha nem került kiválasztásra" },
};

/*
 * The findings' sentences, each written once per language in that language's
 * own order. A baseline label is given in parentheses, where it reads whatever
 * language it was written in.
 */

/** "3 units drew materially fewer views than in the previous quarter." */
export const ATTENTION_FALLING_SENTENCE: Sentence = {
  en: {
    text: "{count} {units|n} drew materially fewer views than in {baseline}.",
    words: { units: ATTENTION_UNITS.en },
  },
  sk: {
    text: "{count} {units|n} {drew|n} výrazne menej zobrazení než v porovnávacom období ({baseline}).",
    words: {
      units: ATTENTION_UNITS.sk,
      drew: { one: "pritiahla", few: "pritiahli", other: "pritiahlo" },
    },
  },
  hu: {
    text: "{count} egység lényegesen kevesebb megtekintést kapott, mint az összehasonlító időszakban ({baseline}).",
  },
};

/** "3 connected sources have sent nothing for more than 72 hours." */
export const ATTENTION_SILENT_SENTENCE: Sentence = {
  en: {
    text: "{count} {silent|n} for more than {hours} {hoursWord|hours}.",
    words: { silent: ATTENTION_SOURCES_SILENT.en, hoursWord: { one: "hour", other: "hours" } },
  },
  sk: {
    text: "{count} {silent|n} už viac ako {hours} {hoursWord|hours}.",
    words: {
      silent: ATTENTION_SOURCES_SILENT.sk,
      /* After "viac ako": the accusative. */
      hoursWord: { one: "hodinu", few: "hodiny", other: "hodín" },
    },
  },
  hu: { text: "{count} csatlakoztatott forrás nem küldött semmit több mint {hours} órája." },
};

/** "3 sources are listed on this project and have never reported." */
export const ATTENTION_NEVER_REPORTED_SENTENCE: Sentence = {
  en: {
    text: "{count} {listed|n} on this project and {never|n}.",
    words: { listed: ATTENTION_SOURCES_LISTED.en, never: ATTENTION_NEVER_REPORTED.en },
  },
  sk: {
    text: "{count} {listed|n} na tomto projekte a {never|n}.",
    words: {
      listed: ATTENTION_SOURCES_LISTED.sk,
      /* After "a" the clitic follows the first stressed word: "a nikdy sa neozvali". */
      never: { one: "nikdy sa neozval", few: "nikdy sa neozvali", other: "nikdy sa neozvalo" },
    },
  },
  hu: { text: "{count} forrás szerepel ezen a projekten, és soha nem jelentkezett." },
};

/** "3 units with at least 10 observations were never shortlisted in this period." */
export const ATTENTION_NEVER_SHORTLISTED_SENTENCE: Sentence = {
  en: {
    text: "{count} {units|n} with at least {minimum} observations {never|n} in this period.",
    words: { units: ATTENTION_UNITS.en, never: ATTENTION_NEVER_SHORTLISTED.en },
  },
  sk: {
    text: "{count} {units|n} s aspoň {minimum} pozorovaniami {never|n} v tomto období.",
    words: { units: ATTENTION_UNITS.sk, never: ATTENTION_NEVER_SHORTLISTED.sk },
  },
  hu: {
    text: "{count} egység, amelyről legalább {minimum} megfigyelés van, soha nem került kiválasztásra ebben az időszakban.",
  },
};

/**
 * What is worth a person's attention, across every screen at once.
 *
 * Six questions, asked of the period, and **all six answers are returned**. A
 * panel that carries only the raised ones renders "nothing is wrong" and
 * "nothing was measured" identically — as empty space — and the second of those
 * is the more urgent of the two. `checks` is the answer to every question;
 * `states` is the subset that came back raised.
 *
 * Severity is bounded per kind rather than chosen per project. Red is reserved
 * for a fact going missing from the record, never for buyer behaviour: a unit
 * losing interest is a commercial situation, not an incident, and a product
 * that paints it red has no colour left for the day the showroom stops
 * reporting. `ATTENTION_KIND_DEFINITIONS` holds each kind's ceiling and
 * `clamp` enforces it, so no builder can raise the volume on its own.
 */

const OBSERVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED"];
const DERIVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"];
const WITH_OUTCOME: readonly InsightSource[] = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
  "CRM_OUTCOME_CONTEXT",
];

/** Quietest first, so `Math.max` of two indexes is the louder of two levels. */
const SEVERITY_ORDER: readonly AlertSeverity[] = ["info", "warning", "critical"];

function clamp(kind: AttentionKind, proposed: AlertSeverity): AlertSeverity {
  const ceiling = ATTENTION_KIND_DEFINITIONS.find((d) => d.kind === kind)?.maxSeverity ?? "info";
  const index = Math.min(SEVERITY_ORDER.indexOf(proposed), SEVERITY_ORDER.indexOf(ceiling));
  return SEVERITY_ORDER[Math.max(0, index)] ?? "info";
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/**
 * How long a source may be silent before silence is the finding.
 *
 * Three days, and it is deliberately generous. A showroom closes at the
 * weekend and a CRM export runs nightly, so an hourly threshold would raise a
 * state every Monday morning and teach the reader to ignore the panel.
 */
const QUIET_AFTER_HOURS = 72;

/**
 * The kinds of source a silence is meaningful for.
 *
 * A catalogue is republished when the stock changes, which on a settled scheme
 * is monthly. Treating that as a source going quiet would report a healthy
 * project as broken, so staleness is asked only of the feeds that report
 * continuously.
 */
const CONTINUOUS_SOURCE_KINDS: readonly ProjectSource["kind"][] = ["showroom", "webiris", "crm"];

interface Raised {
  readonly kind: AttentionKind;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly detail: string;
  readonly subjects: readonly AttentionSubject[];
  readonly sampleSize: number;
  readonly minimumSampleSize: number;
  readonly belowMinimum: boolean;
  readonly tier: EvidenceTier;
  readonly sources: readonly InsightSource[];
  readonly actionLabel: string | null;
  readonly actionHref: string | null;
  readonly observationCount: number;
}

export function buildAttention(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  previous: readonly ShowroomSession[],
): AttentionView {
  const locale = context.project.locale;
  const language = context.language;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const crm = context.project.connectedSources.includes("crm");

  const raised: Raised[] = [];
  const checks: AttentionCheck[] = [];

  const clear = (kind: AttentionKind, reason: string): void => {
    checks.push({
      kind,
      label: ATTENTION_KIND_DEFINITIONS.find((d) => d.kind === kind)?.label ?? kind,
      state: "clear",
      reason,
    });
  };
  const cannotAsk = (kind: AttentionKind, reason: string): void => {
    checks.push({
      kind,
      label: ATTENTION_KIND_DEFINITIONS.find((d) => d.kind === kind)?.label ?? kind,
      state: "unavailable",
      reason,
    });
  };
  const raise = (item: Raised): void => {
    raised.push(item);
    checks.push({
      kind: item.kind,
      label: ATTENTION_KIND_DEFINITIONS.find((d) => d.kind === item.kind)?.label ?? item.kind,
      state: "raised",
      reason: item.detail,
    });
  };

  /* --- 1. shortlisted, and nothing recorded after it ----------------------- */

  if (!crm) {
    cannotAsk(
      "high_interest_no_follow_up",
      "No CRM is connected to this project, so no meeting carries an outcome to check a shortlist against.",
    );
  } else {
    const shortlisted = sessions.filter((s) => s.units.some((u) => u.favourited));
    const stranded = shortlisted.filter(
      (s) => s.outcome !== "follow_up_needed" && s.outcome !== "interested" && !hasCommercial(s),
    );
    if (stranded.length === 0) {
      clear(
        "high_interest_no_follow_up",
        `Every one of the ${count(shortlisted.length, locale)} meetings that shortlisted a unit recorded an outcome that accounts for it.`,
      );
    } else {
      raise({
        kind: "high_interest_no_follow_up",
        severity:
          share(stranded.length, Math.max(1, shortlisted.length)) > 0.15 ? "warning" : "info",
        title: "Units shortlisted with no follow-up recorded",
        detail: `${count(stranded.length, locale)} of ${count(shortlisted.length, locale)} meetings that shortlisted a unit ended without an outcome that asks for a follow-up.`,
        subjects: stranded.slice(0, 5).map((s) => ({
          id: s.meetingId,
          label: `${s.meetingId} · ${OUTCOME_LABELS[s.outcome]}`,
          href: `${root}/meetings/${s.meetingId}`,
        })),
        sampleSize: shortlisted.length,
        minimumSampleSize: UNIT_MIN_SAMPLE,
        belowMinimum: shortlisted.length < UNIT_MIN_SAMPLE,
        tier: "observed_sequence",
        sources: WITH_OUTCOME,
        actionLabel: "Open those meetings",
        actionHref: `${root}/meetings`,
        observationCount: stranded.length,
      });
    }
  }

  /* --- 2. demand falling --------------------------------------------------- */

  const catalogue = catalogueFor(context.project.id as string);
  if (previous.length === 0) {
    cannotAsk(
      "demand_dropping",
      "This project has no baseline period yet, so nothing here can be compared against anything.",
    );
  } else {
    const falling = catalogue
      .map((unit) => {
        const now = touches(sessions, unit.code);
        const before = touches(previous, unit.code);
        return { code: unit.code, now, before };
      })
      // The minimum is on the baseline, not on the period: a unit that was
      // opened twice last quarter and once this one has halved, and reporting
      // that as falling demand would be reporting noise as a finding.
      .filter((u) => u.before >= UNIT_MIN_SAMPLE && u.now < u.before * 0.7)
      .sort((a, b) => b.before - a.before);

    if (falling.length === 0) {
      clear(
        "demand_dropping",
        `No unit with at least ${UNIT_MIN_SAMPLE} observations in ${context.period.baselineLabel} is drawing materially less attention now.`,
      );
    } else {
      raise({
        kind: "demand_dropping",
        severity: falling.length >= 3 ? "warning" : "info",
        title: "Attention falling on units that used to draw it",
        detail: sentence(language, ATTENTION_FALLING_SENTENCE, {
          count: count(falling.length, locale),
          n: falling.length,
          baseline: context.period.baselineLabel,
        }),
        subjects: falling.slice(0, 5).map((u) => ({
          id: u.code,
          label: `${u.code} · ${count(u.before, locale)} → ${count(u.now, locale)}`,
          href: `${root}/units?unit=${u.code}`,
        })),
        sampleSize: falling.reduce((acc, u) => acc + u.before, 0),
        minimumSampleSize: UNIT_MIN_SAMPLE,
        belowMinimum: false,
        tier: "statistical_association",
        sources: DERIVED,
        actionLabel: "Open unit attention",
        actionHref: `${root}/units`,
        observationCount: falling.length,
      });
    }
  }

  /* --- 3. outcomes nothing verifies ---------------------------------------- */

  const unrecorded = sessions.filter((s) => outcomeIsUnknown(s.outcome)).length;
  if (sessions.length === 0) {
    cannotAsk(
      "crm_verification_missing",
      "No presentations were recorded in this period, so there is nothing to verify.",
    );
  } else if (!crm) {
    raise({
      kind: "crm_verification_missing",
      /*
       * Not red. A project with no CRM is a configuration state that every
       * surface already says out loud, and it is the same on the first day of
       * the period as on the last. Red is for a record that was arriving and
       * stopped.
       */
      severity: "warning",
      title: "No outcome can be verified on this project",
      /*
       * WHAT THE BRANCH KNOWS, AND NOT MORE.
       *
       * The condition here is `!crm`, and it establishes exactly one thing:
       * nothing can confirm what a presentation ended in. It used to add that
       * none of them HAS a recorded outcome, which is a different fact and one
       * this branch never tested — an agent records an outcome in the room, and
       * a project with a CRM still had eleven of eighty-two unrecorded. The two
       * coincide on the only fixture that reaches this branch, which is how a
       * sentence stronger than its condition survives being read.
       *
       * The title was already right: verification is what is missing.
       */
      detail: `No CRM is connected to this project, so nothing can confirm what the ${count(sessions.length, locale)} presentations in this period ended in.`,
      /*
       * The list is labelled "What this is about" and it held "Connect a CRM",
       * which is what to DO about it. Naming the remedy where the affected
       * thing belongs leaves a reader with one item and no idea what it is one
       * OF. The scope is every presentation in the period, so it says that.
       */
      subjects: [{ id: "crm", label: "Every presentation in this period", href: null }],
      sampleSize: sessions.length,
      minimumSampleSize: UNIT_MIN_SAMPLE,
      belowMinimum: false,
      tier: "observed_sequence",
      sources: OBSERVED,
      actionLabel: null,
      actionHref: null,
      observationCount: sessions.length,
    });
  } else if (unrecorded === 0) {
    clear(
      "crm_verification_missing",
      `Every one of the ${count(sessions.length, locale)} presentations in this period carries a recorded outcome.`,
    );
  } else {
    const rate = share(unrecorded, sessions.length);
    raise({
      kind: "crm_verification_missing",
      /*
       * Red here, and only here. The CRM is connected, the meetings happened,
       * and more than half of them left no record — the source exists and the
       * facts are being lost, which is the one situation on this surface that a
       * reader has to act on today.
       */
      severity: rate > 0.5 ? "critical" : rate > 0.25 ? "warning" : "info",
      title: "Meetings ending without a recorded outcome",
      detail: `${count(unrecorded, locale)} of ${count(sessions.length, locale)} presentations (${percent(rate, locale)}) ended with no outcome recorded.`,
      subjects: sessions
        .filter((s) => outcomeIsUnknown(s.outcome))
        .slice(0, 5)
        .map((s) => ({
          id: s.meetingId,
          label: s.meetingId,
          href: `${root}/meetings/${s.meetingId}`,
        })),
      sampleSize: sessions.length,
      minimumSampleSize: UNIT_MIN_SAMPLE,
      belowMinimum: false,
      tier: "observed_sequence",
      sources: WITH_OUTCOME,
      actionLabel: "See the meetings",
      actionHref: `${root}/meetings`,
      observationCount: unrecorded,
    });
  }

  /* --- 4. a source has gone quiet ------------------------------------------ */

  const now = Date.parse(context.generatedAt);
  const neverSeen = context.project.sources.filter((s) => !s.connected);
  const quiet = context.project.sources.filter((s) => {
    if (!s.connected || s.lastSeenAt === null) return false;
    if (!CONTINUOUS_SOURCE_KINDS.includes(s.kind)) return false;
    return now - Date.parse(s.lastSeenAt) > QUIET_AFTER_HOURS * 60 * 60 * 1000;
  });

  if (neverSeen.length === 0 && quiet.length === 0) {
    clear(
      "source_offline",
      `All ${count(context.project.sources.length, locale)} sources on this project are connected and have reported within ${QUIET_AFTER_HOURS} hours.`,
    );
  } else {
    raise({
      kind: "source_offline",
      /*
       * A source that stopped outranks a source that never started. The second
       * is a project that has not finished being set up, and everybody involved
       * knows it; the first is data going missing while somebody watches a
       * dashboard that still looks alive.
       */
      severity: quiet.length > 0 ? "critical" : "warning",
      title: quiet.length > 0 ? "A connected source has gone quiet" : "A source has never reported",
      detail:
        quiet.length > 0
          ? sentence(language, ATTENTION_SILENT_SENTENCE, {
              count: count(quiet.length, locale),
              n: quiet.length,
              hours: QUIET_AFTER_HOURS,
            })
          : sentence(language, ATTENTION_NEVER_REPORTED_SENTENCE, {
              count: count(neverSeen.length, locale),
              n: neverSeen.length,
            }),
      subjects: [...quiet, ...neverSeen].map((s) => ({
        id: s.id,
        label:
          s.lastSeenAt === null
            ? `${s.displayName} · never seen`
            : `${s.displayName} · last seen ${dayLabel(s.lastSeenAt, locale, context.project.timeZone)}`,
        href: null,
      })),
      sampleSize: context.project.sources.length,
      minimumSampleSize: 1,
      belowMinimum: false,
      tier: "observed_sequence",
      sources: OBSERVED,
      actionLabel: null,
      actionHref: null,
      observationCount: quiet.length + neverSeen.length,
    });
  }

  /* --- 5. ingestion delay -------------------------------------------------- */

  /*
   * Asked, and honestly unanswerable.
   *
   * Observer receives facts, not telemetry about their delivery: there is no
   * queue depth, no lag and no retry count anywhere in this product, and the
   * integration console that owns those is a separate surface with a separate
   * audience (`docs/01-foundation.md`). Inventing a plausible lag figure here
   * would be the single easiest way to make this panel untrustworthy, so the
   * check is declared and returned unanswerable rather than quietly dropped.
   */
  cannotAsk(
    "analytics_queue_pressure",
    "Observer holds no ingestion telemetry. Queue depth, lag and retries belong to the MADSPACE administration surface, and a figure invented here would look exactly like a measured one.",
  );

  /* --- 6. opened again and again, never kept ------------------------------- */

  const repeatedly = catalogue
    .map((unit) => ({
      code: unit.code,
      meetings: sessions.filter((s) => s.units.some((u) => u.unitCode === unit.code)).length,
      views: touches(sessions, unit.code),
      favourites: sessions.filter((s) =>
        s.units.some((u) => u.unitCode === unit.code && u.favourited),
      ).length,
    }))
    .filter((u) => u.views >= UNIT_MIN_SAMPLE);

  if (repeatedly.length === 0) {
    cannotAsk(
      "viewed_never_shortlisted",
      `No unit reached ${UNIT_MIN_SAMPLE} observations in this period, so none of them can be read this way yet.`,
    );
  } else {
    const never = repeatedly.filter((u) => u.favourites === 0).sort((a, b) => b.views - a.views);
    if (never.length === 0) {
      clear(
        "viewed_never_shortlisted",
        `Every unit with at least ${UNIT_MIN_SAMPLE} observations was shortlisted at least once.`,
      );
    } else {
      raise({
        kind: "viewed_never_shortlisted",
        severity: never.length >= 3 ? "warning" : "info",
        title: "Opened repeatedly, never shortlisted",
        detail: sentence(language, ATTENTION_NEVER_SHORTLISTED_SENTENCE, {
          count: count(never.length, locale),
          n: never.length,
          minimum: UNIT_MIN_SAMPLE,
        }),
        subjects: never.slice(0, 5).map((u) => ({
          id: u.code,
          label: `${u.code} · ${count(u.views, locale)} views, ${count(u.meetings, locale)} meetings`,
          href: `${root}/units?unit=${u.code}`,
        })),
        sampleSize: never.reduce((acc, u) => acc + u.views, 0),
        minimumSampleSize: UNIT_MIN_SAMPLE,
        belowMinimum: false,
        tier: "statistical_association",
        sources: DERIVED,
        actionLabel: "Open unit attention",
        actionHref: `${root}/units`,
        observationCount: never.length,
      });
    }
  }

  /* --- rank ---------------------------------------------------------------- */

  const states: readonly AttentionState[] = [...raised]
    .sort((a, b) => {
      const bySeverity =
        SEVERITY_ORDER.indexOf(clamp(b.kind, b.severity)) -
        SEVERITY_ORDER.indexOf(clamp(a.kind, a.severity));
      if (bySeverity !== 0) return bySeverity;
      return b.observationCount - a.observationCount;
    })
    .map((item, index) => {
      const severity = clamp(item.kind, item.severity);
      const alert: AlertItem = {
        id: `attention-${item.kind}`,
        severity,
        title: item.title,
        detail: item.detail,
        evidence: evidenceRef(
          `attention-${item.kind}-${context.project.slug}`,
          item.tier,
          item.actionHref ?? `${root}/overview`,
          item.observationCount,
        ),
        actionLabel: item.actionLabel,
        actionHref: item.actionHref,
      };
      return {
        kind: item.kind,
        alert,
        subjects: item.subjects,
        sampleSize: item.sampleSize,
        minimumSampleSize: item.minimumSampleSize,
        belowMinimum: item.belowMinimum,
        tier: item.tier,
        sources: item.sources,
        rank: index + 1,
      } satisfies AttentionState;
    });

  const unanswerable = checks.filter((c) => c.state === "unavailable").length;

  return {
    context,
    states,
    // The declaration order, not the order things were raised in: a panel whose
    // rows move about between periods is a panel nobody learns to read.
    checks: ATTENTION_KIND_DEFINITIONS.flatMap((definition) => {
      const found = checks.find((c) => c.kind === definition.kind);
      return found === undefined ? [] : [found];
    }),
    emptyState: `Nothing on ${context.project.name} needs attention in ${context.period.label.toLowerCase()}. ${count(unanswerable, locale)} of ${count(ATTENTION_KIND_DEFINITIONS.length, locale)} checks could not be evaluated, and each says why.`,
    meetingCount: sessions.length,
    evidence: evidenceRef("attention", "observed_sequence", `${root}/overview`, sessions.length),
  };
}

/** Views of one unit across a slice. Events, not meetings — the busier number. */
function touches(sessions: readonly ShowroomSession[], code: string): number {
  return sessions
    .flatMap((s) => s.units.filter((u) => u.unitCode === code))
    .reduce((acc, u) => acc + u.views, 0);
}

/** Whether the meeting ended in something a CRM would call a result. */
function hasCommercial(session: ShowroomSession): boolean {
  return session.outcome === "reservation" || session.outcome === "purchase";
}
