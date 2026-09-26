import {
  DEAL_STAGES,
  type CrmDeal,
  type DealStage,
  type ShowroomSession,
} from "@observer/contracts";
import type { IrisAssistPolicy } from "@observer/metrics";
import {
  DAYS,
  DEFAULT_LANGUAGE,
  plural,
  sentence,
  type Sentence,
  type AssistVerdict,
  type AssistedSale,
  type AssistedSales,
  type DealLadder,
  type DealLadderStage,
  type DeliveredDeals,
  type Language,
  type PluralForms,
  type StalledDeal,
} from "@observer/readmodels";
import { dayLabel, percent } from "./format";

/**
 * THE CRM'S DEALS, HELD FOR THE LADDER.
 *
 * Set by the repository before it builds a view, from the `DealSource` it
 * was composed with, the same way `provideCatalogue` holds a delivered
 * stock. Nothing synthetic stands in for them: the synthetic world has no
 * CRM, so a project no connector delivers deals for has a ladder that says
 * the CRM is not connected (ADR-0021 — the ladder is the CRM's, and this
 * product never puts its own opinion on a rung).
 */
const delivered = new Map<string, DeliveredDeals>();

export function provideDeals(projectId: string, deals: DeliveredDeals | null): void {
  if (deals === null) delivered.delete(projectId);
  else delivered.set(projectId, deals);
}

export function dealsFor(projectId: string): DeliveredDeals | null {
  return delivered.get(projectId) ?? null;
}

/** The rungs, in the order a deal climbs them. `lost` is terminal and is counted beside, not on, the ladder. */
export const LADDER_STAGES: readonly DealStage[] = DEAL_STAGES.filter((s) => s !== "lost");

const STAGE_LABELS: Readonly<Record<DealStage, string>> = {
  lead: "Lead",
  meeting: "Meeting",
  negotiation: "Negotiation",
  offer: "Offer",
  reservation: "Reservation",
  purchase: "Purchase",
  lost: "Lost",
};

/** How the note names the source. The connector id is an implementation word; the reader gets the name. */
const CONNECTOR_WORDS: Readonly<Record<DeliveredDeals["connector"], string>> = {
  realpad: "REALPAD",
  monday: "Monday",
  lomnio: "Lomnio",
  csv: "the deals sheet",
  synthetic: "the demonstration CRM",
};

const DAY_MS = 86_400_000;

/** Whole days from a stated instant to the fetch; null when the CRM stated no instant. */
export function daysBetween(from: string | null, to: string): number | null {
  if (from === null) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((b - a) / DAY_MS));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/*
 * The words this file counts in, each beside the sentences that use it. The
 * Slovak and Hungarian forms are the ones a count takes standing alone or as a
 * subject; a sentence that puts a count in another case keeps that case's
 * forms as its own, below. Days on a rung are the shared `DAYS`.
 */

export const DEAL_HOURS: PluralForms = {
  en: { one: "hour", other: "hours" },
  sk: { one: "hodina", few: "hodiny", other: "hodín" },
  hu: { one: "óra", other: "óra" },
};

export const DEAL_DEALS: PluralForms = {
  en: { one: "deal", other: "deals" },
  sk: { one: "obchod", few: "obchody", other: "obchodov" },
  hu: { one: "ügylet", other: "ügylet" },
};

export const DEAL_OPEN_DEALS: PluralForms = {
  en: { one: "open deal", other: "open deals" },
  sk: { one: "otvorený obchod", few: "otvorené obchody", other: "otvorených obchodov" },
  hu: { one: "nyitott ügylet", other: "nyitott ügylet" },
};

export const DEAL_SALES: PluralForms = {
  en: { one: "sale", other: "sales" },
  sk: { one: "predaj", few: "predaje", other: "predajov" },
  hu: { one: "eladás", other: "eladás" },
};

export const DEAL_SALES_NEEDED: PluralForms = {
  en: { one: "more dated sale is needed", other: "more dated sales are needed" },
  sk: {
    one: "ďalší datovaný predaj je potrebný",
    few: "ďalšie datované predaje sú potrebné",
    other: "ďalších datovaných predajov je potrebných",
  },
  hu: { one: "további datált eladás szükséges", other: "további datált eladás szükséges" },
};

export const DEAL_SHOWN_EARLIER: PluralForms = {
  en: { one: "more was shown earlier", other: "more were shown earlier" },
  sk: {
    one: "ďalší bol ukázaný skôr",
    few: "ďalšie boli ukázané skôr",
    other: "ďalších bolo ukázaných skôr",
  },
  hu: { one: "további korábban lett megmutatva", other: "további korábban lett megmutatva" },
};

export const DEAL_NOT_OPENED: PluralForms = {
  en: { one: "was not opened", other: "were not opened" },
  sk: { one: "nebol otvorený", few: "neboli otvorené", other: "nebolo otvorených" },
  hu: { one: "nem lett megnyitva", other: "nem lett megnyitva" },
};

/* Printed whole, so the form is chosen for the whole number. */
const days = (n: number, language: Language): string => {
  const whole = Math.round(n);
  return `${String(whole)} ${plural(language, whole, DAYS)}`;
};

/*
 * The sentences, each written once per language in that language's own order.
 * The English of three was a verb that did not agree with a count of one
 * ("1 open deal carry"); written whole, it does.
 */

/** "2 open deals carry no stage date and cannot be placed." */
export const DEAL_UNDATED_SENTENCE: Sentence = {
  en: {
    text: "{count} {deals|count} {carry|count} no stage date and cannot be placed.",
    words: { deals: DEAL_OPEN_DEALS.en, carry: { one: "carries", other: "carry" } },
  },
  sk: {
    text: "{count} {deals|count} {rest|count}.",
    words: {
      deals: DEAL_OPEN_DEALS.sk,
      rest: {
        one: "nemá dátum fázy a nedá sa zaradiť",
        few: "nemajú dátum fázy a nedajú sa zaradiť",
        other: "nemá dátum fázy a nedá sa zaradiť",
      },
    },
  },
  hu: { text: "{count} nyitott ügyletnek nincs szakaszdátuma, ezért nem helyezhető el." },
};

/** "Stated by the demonstration CRM: 3 deals as they stand now." */
export const DEAL_STATED_SENTENCE: Sentence = {
  en: {
    text: "Stated by {connector}: {count} {deals|count} {stand|count} now.",
    words: { deals: DEAL_DEALS.en, stand: { one: "as it stands", other: "as they stand" } },
  },
  sk: {
    text: "Podľa zdroja {connector}: {count} {deals|count} v aktuálnom stave.",
    words: { deals: DEAL_DEALS.sk },
  },
  hu: { text: "{count} ügylet a jelenlegi állapotában; forrás: {connector}." },
};

/** "2 deals carry a stage word not mapped yet and sit on no rung." */
export const DEAL_UNMAPPED_SENTENCE: Sentence = {
  en: {
    text: "{count} {deals|count} {rest|count} on no rung.",
    words: {
      deals: DEAL_DEALS.en,
      rest: {
        one: "carries a stage word not mapped yet and sits",
        other: "carry a stage word not mapped yet and sit",
      },
    },
  },
  sk: {
    text: "{count} {deals|count} {rest|count}.",
    words: {
      deals: DEAL_DEALS.sk,
      rest: {
        one: "má názov fázy, ktorý ešte nie je priradený, a nestojí na žiadnom stupni",
        few: "majú názov fázy, ktorý ešte nie je priradený, a nestoja na žiadnom stupni",
        other: "má názov fázy, ktorý ešte nie je priradený, a nestojí na žiadnom stupni",
      },
    },
  },
  hu: {
    text: "{count} ügylet olyan szakasznevet visel, amely még nincs hozzárendelve, ezért egyik fokon sem áll.",
  },
};

/** "5 hours before": a showing's lag behind the sale. */
export const DEAL_LAG_HOURS_SENTENCE: Sentence = {
  en: { text: "{count} {hours|count} before", words: { hours: DEAL_HOURS.en } },
  sk: {
    text: "{count} {hours|count} predtým",
    /* A span of time: the accusative. */
    words: { hours: { one: "hodinu", few: "hodiny", other: "hodín" } },
  },
  hu: { text: "{count} órával előtte" },
};

/** "2 more dated sales are needed before a share is stated." */
export const DEAL_SALES_NEEDED_SENTENCE: Sentence = {
  en: {
    text: "{count} {needed|count} before a share is stated.",
    words: { needed: DEAL_SALES_NEEDED.en },
  },
  sk: {
    text: "{count} {needed|count}, kým sa uvedie podiel.",
    words: { needed: DEAL_SALES_NEEDED.sk },
  },
  hu: { text: "{count} további datált eladás szükséges, mielőtt részarányt közölnénk." },
};

/** "2 more were shown earlier than that, a median of 3 days before the date." */
export const DEAL_SHOWN_EARLIER_SENTENCE: Sentence = {
  en: {
    text: "{count} {shown|count} than that, a median of {median} before the date.",
    words: { shown: DEAL_SHOWN_EARLIER.en },
  },
  sk: {
    text: "{count} {shown|count}, v mediáne {median} pred dátumom.",
    words: { shown: DEAL_SHOWN_EARLIER.sk },
  },
  hu: { text: "{count} további korábban lett megmutatva; a medián {median} volt a dátum előtt." },
};

/** "2 were not opened in IRIS before the date at all." */
export const DEAL_NOT_OPENED_SENTENCE: Sentence = {
  en: {
    text: "{count} {notOpened|count} in IRIS before the date at all.",
    words: { notOpened: DEAL_NOT_OPENED.en },
  },
  sk: {
    text: "{count} vôbec {notOpened|count} v IRIS pred dátumom.",
    words: { notOpened: DEAL_NOT_OPENED.sk },
  },
  hu: { text: "{count} egyáltalán nem lett megnyitva az IRIS-ben a dátum előtt." },
};

/** "2 sales carry no stage date Observer could use or name no unit, and cannot be placed." */
export const DEAL_UNPLACED_SENTENCE: Sentence = {
  en: {
    text: "{count} {sales|count} {rest|count}, and cannot be placed.",
    words: {
      sales: DEAL_SALES.en,
      rest: {
        one: "carries no stage date Observer could use or names no unit",
        other: "carry no stage date Observer could use or name no unit",
      },
    },
  },
  sk: {
    text: "{count} {sales|count} {rest|count}.",
    words: {
      sales: DEAL_SALES.sk,
      rest: {
        one: "nemá dátum fázy použiteľný pre Observer alebo neuvádza žiadnu jednotku a nedá sa zaradiť",
        few: "nemajú dátum fázy použiteľný pre Observer alebo neuvádzajú žiadnu jednotku a nedajú sa zaradiť",
        other:
          "nemá dátum fázy použiteľný pre Observer alebo neuvádza žiadnu jednotku a nedá sa zaradiť",
      },
    },
  },
  hu: {
    text: "{count} eladásnak nincs az Observer számára használható szakaszdátuma, vagy nem nevez meg egységet, ezért nem helyezhető el.",
  },
};

/** The stages a deal can be stuck on: not the terminal two. */
const OPEN_STAGES: ReadonlySet<DealStage> = new Set(
  DEAL_STAGES.filter((s) => s !== "lost" && s !== "purchase"),
);

/**
 * THE DEMONSTRATION CRM'S DEALS, FOR A PROJECT WHOSE SCENARIO DECLARES ONE.
 *
 * The synthetic world has no CRM, and a project it marks as CRM-connected
 * had a ladder that said "not connected" — true of the connector layer,
 * false of the scenario. This derives a deal from every meeting whose
 * recorded outcome is a deal-shaped fact, deterministically, so the ladder,
 * the time in stage and the stalled list can be reviewed on demonstration
 * data. The mapping is the scenario's own vocabulary (`docs/08-scenarios.md`),
 * fixed here rather than in a tenant's table, and the ladder's note names
 * the source as the demonstration CRM. Nothing here reaches a project a
 * real connector delivers deals for: the repository asks the connector
 * first and this only where it answered nothing.
 *
 * No buyer is keyed: the synthetic contact identifiers are not a person's
 * email or phone and never pass through the subject pepper, so
 * `subjectKey` is null on every deal.
 */
const OUTCOME_STAGE: Readonly<Partial<Record<ShowroomSession["outcome"], DealStage>>> = {
  follow_up_needed: "meeting",
  interested: "negotiation",
  reservation: "reservation",
  purchase: "purchase",
  not_interested: "lost",
};

/** Days a deal-shaped outcome takes to reach its stage after the meeting, by stage. Fixed, so a re-run is byte-identical. */
const STAGE_LAG_DAYS: Readonly<Partial<Record<DealStage, number>>> = {
  reservation: 6,
  purchase: 21,
  lost: 3,
};

/**
 * The scenarios the demonstration CRM covers, by slug: the healthy project
 * with a CRM (`docs/08-scenarios.md` §3). Riverside declares none, Kingsford
 * is three weeks old, and ISTER TOWER is the control plane's twin whose deals
 * come from its own connector or from nobody.
 */
export const DEMONSTRATION_CRM_SLUGS: ReadonlySet<string> = new Set(["northgate"]);

export function syntheticDeals(
  sessions: readonly ShowroomSession[],
  fetchedAt: string,
): DeliveredDeals {
  const deals: CrmDeal[] = [];
  for (const session of sessions) {
    const stage = OUTCOME_STAGE[session.outcome];
    if (stage === undefined) continue;
    const lag = STAGE_LAG_DAYS[stage] ?? 0;
    const entered = new Date(Date.parse(session.startedAt) + lag * DAY_MS);
    if (entered.getTime() > Date.parse(fetchedAt)) continue;
    const unit = [...session.units].sort((a, b) => b.dwellSeconds - a.dwellSeconds)[0];
    deals.push({
      externalId: `D-${session.meetingId}`,
      unitCode: unit?.unitCode ?? null,
      subjectKey: null,
      stage,
      stageRaw: stage,
      stageEnteredAt: entered.toISOString().replace("Z", "+00:00"),
      openedAt: session.startedAt,
      updatedAt: null,
      won: stage === "purchase",
      lost: stage === "lost",
    });
  }
  return { connector: "synthetic", deals, fetchedAt };
}

export const NOT_CONNECTED_NOTE =
  "The CRM is not connected. The deal ladder is the CRM's, and no deal fact reaches this product until a connector delivers one.";

/**
 * The ladder from a snapshot of the CRM's deals.
 *
 * A rung counts the deals whose current stage is that rung or further
 * along: a deal the CRM has at Offer has been at least as far as Meeting.
 * That is survival read from where each deal stands now, not from a history
 * of moves, and the note says so. A deal whose stage word is not mapped
 * yet is on no rung and is counted beside the ladder for the mapping
 * table; a lost deal is terminal and counted beside it too.
 */
export function buildDealLadder(
  deals: DeliveredDeals | null,
  locale: string,
  /** The project's zone: the day a deal entered its stage is the office's day. */
  timeZone: string,
  unitHref: (unitCode: string) => string | null = () => null,
  /** The words' language; `locale` still formats the figures. */
  language: Language = DEFAULT_LANGUAGE,
): DealLadder {
  if (deals === null) return { source: "not_connected", note: NOT_CONNECTED_NOTE };

  const rank = new Map<DealStage, number>(LADDER_STAGES.map((s, i) => [s, i]));
  const unmapped = deals.deals.filter((d) => d.stage === null).length;
  const lost = deals.deals.filter((d) => d.stage === "lost").length;
  const climbing = deals.deals.filter((d) => d.stage !== null && d.stage !== "lost");
  const first = climbing.length;

  const stages: DealLadderStage[] = LADDER_STAGES.map((stage, index) => {
    const count = climbing.filter((d) => (rank.get(d.stage as DealStage) ?? -1) >= index).length;
    const standing = climbing.filter((d) => d.stage === stage);
    const dated = standing
      .map((d) => daysBetween(d.stageEnteredAt, deals.fetchedAt))
      .filter((n): n is number => n !== null);
    const medianDaysInStage = median(dated);
    return {
      id: stage,
      label: STAGE_LABELS[stage],
      count,
      verified: true,
      rate: first === 0 ? null : percent(count / first, locale),
      comparisonRate: null,
      medianDaysInStage,
      daysDisplay:
        medianDaysInStage !== null
          ? `${days(medianDaysInStage, language)} on this rung`
          : standing.length === 0
            ? "none standing here"
            : "no stage date stated",
    };
  });

  /*
   * The stalled list: every open deal the CRM dated, longest stuck first.
   * Sorted by time and never by outcome; an undated deal is counted beside
   * it rather than placed at zero days.
   */
  const open = deals.deals.filter((d) => d.stage !== null && OPEN_STAGES.has(d.stage));
  const undated = open.filter(
    (d) => daysBetween(d.stageEnteredAt, deals.fetchedAt) === null,
  ).length;
  const stalled: StalledDeal[] = open
    .flatMap((d) => {
      const n = daysBetween(d.stageEnteredAt, deals.fetchedAt);
      if (n === null || d.stage === null || d.stageEnteredAt === null) return [];
      return [
        {
          externalId: d.externalId,
          stage: d.stage,
          stageLabel: STAGE_LABELS[d.stage],
          unitCode: d.unitCode,
          daysInStage: n,
          daysDisplay: days(n, language),
          enteredDisplay: dayLabel(d.stageEnteredAt, locale, timeZone),
          unitHref: d.unitCode === null ? null : unitHref(d.unitCode),
        },
      ];
    })
    .sort((a, b) => b.daysInStage - a.daysInStage || a.externalId.localeCompare(b.externalId))
    .slice(0, 12);
  const stalledNote =
    open.length === 0
      ? "No deal is open on any rung, so nothing is stuck."
      : [
          `${String(stalled.length)} of ${String(open.length)} open deals, longest on their rung first, by the stage date the CRM stated.`,
          undated === 0 ? null : sentence(language, DEAL_UNDATED_SENTENCE, { count: undated }),
        ]
          .filter((w): w is string => w !== null)
          .join(" ");

  const words = [
    sentence(language, DEAL_STATED_SENTENCE, {
      connector: CONNECTOR_WORDS[deals.connector],
      count: deals.deals.length,
    }),
    "A rung counts the deals at that stage or further along; this is where each deal stands, not the path it took.",
    unmapped === 0 ? null : sentence(language, DEAL_UNMAPPED_SENTENCE, { count: unmapped }),
    lost === 0 ? null : `${String(lost)} lost, counted beside the ladder.`,
  ].filter((w): w is string => w !== null);

  return {
    source: "crm",
    connector: deals.connector,
    stages,
    unmapped,
    lost,
    total: deals.deals.length,
    fetchedAt: deals.fetchedAt,
    note: words.join(" "),
    stalled,
    undated,
    stalledNote,
  };
}

/* --- IRIS-assisted sales ------------------------------------------------------ */

const HOUR_MS = 3_600_000;

const SALE_STAGES: ReadonlySet<DealStage> = new Set(["reservation", "purchase"]);

const VERDICT_LABELS: Readonly<Record<AssistVerdict, string>> = {
  shown_in_window: "IRIS-assisted sale",
  shown_earlier: "Shown earlier",
  not_shown: "Not shown in IRIS",
};

function lagWords(hours: number, language: Language): string {
  if (hours < 1) return "under an hour before";
  if (hours < 48) {
    return sentence(language, DEAL_LAG_HOURS_SENTENCE, { count: Math.floor(hours) });
  }
  return `${days(Math.floor(hours / 24), language)} before`;
}

type PlacedSale = AssistedSale & { readonly at: number };

/** `at` is the sort key only; the read model carries the formatted date. */
function withoutInstant({ at, ...sale }: PlacedSale): AssistedSale {
  void at;
  return sale;
}

/** Every dated sale that names a unit, placed against the last showing before its date. Unsorted, uncapped. */
function placeSales(
  sold: readonly CrmDeal[],
  observed: Readonly<Record<string, string>>,
  sessions: readonly ShowroomSession[],
  policy: IrisAssistPolicy,
  locale: string,
  timeZone: string,
  unitHref: (unitCode: string) => string | null,
  meetingHref: (meetingId: string) => string,
  language: Language,
): PlacedSale[] {
  const window = `${String(policy.windowHours)} hours`;
  return sold.flatMap((d) => {
    /* The CRM's own instant where it states one; else the sync that witnessed the move; else unplaced. */
    const stated = d.stageEnteredAt;
    const dated = stated ?? observed[d.externalId] ?? null;
    const at = dated === null ? Number.NaN : Date.parse(dated);
    if (d.unitCode === null || d.stage === null || dated === null || Number.isNaN(at)) return [];
    const dateBasis = stated === null ? ("first_observed" as const) : ("crm_stated" as const);
    /* "its reservation date" is the CRM's word; an observed one is when Observer saw it. */
    const dateWords = (stageWord: string): string =>
      dateBasis === "crm_stated" ? `its ${stageWord} date` : `Observer first saw its ${stageWord}`;
    const code = d.unitCode;
    const stageLabel = STAGE_LABELS[d.stage];
    const stageWord = stageLabel.toLowerCase();
    const last = sessions
      .filter((s) => Date.parse(s.startedAt) <= at && s.units.some((u) => u.unitCode === code))
      .reduce<ShowroomSession | null>(
        (latest, s) =>
          latest === null || Date.parse(s.startedAt) > Date.parse(latest.startedAt) ? s : latest,
        null,
      );
    const lagHours = last === null ? null : (at - Date.parse(last.startedAt)) / HOUR_MS;
    const verdict: AssistVerdict =
      lagHours === null
        ? "not_shown"
        : lagHours <= policy.windowHours
          ? "shown_in_window"
          : "shown_earlier";
    const lagDisplay = lagHours === null ? "not shown in IRIS" : lagWords(lagHours, language);
    return [
      {
        at,
        externalId: d.externalId,
        unitCode: code,
        unitHref: unitHref(code),
        stage: d.stage,
        stageLabel,
        stageDateDisplay: dayLabel(dated, locale, timeZone),
        dateBasis,
        verdict,
        verdictLabel: VERDICT_LABELS[verdict],
        lagHours,
        lagDisplay,
        lagShort: lagHours === null ? "never" : lagDisplay.replace(/ before$/, ""),
        windowShare: lagHours === null ? 0 : Math.max(0, 1 - lagHours / policy.windowHours),
        meetingHref: last === null ? null : meetingHref(last.meetingId),
        statement:
          verdict === "shown_in_window"
            ? `IRIS-assisted sale. ${code} was opened in an IRIS presentation ${lagDisplay} ${dateWords(stageWord)}.`
            : verdict === "shown_earlier"
              ? `${code} was last opened in an IRIS presentation ${lagDisplay} ${dateWords(stageWord)}, outside the ${window} this counts.`
              : `No IRIS presentation opened ${code} before ${dateWords(stageWord)}.`,
      },
    ];
  });
}

/**
 * The CRM's dated sale of ONE unit, placed the same way — for the unit's own
 * page. The newest when the CRM holds more than one; null when it dates none.
 */
export function assistedSaleOf(
  unitCode: string,
  deals: DeliveredDeals | null,
  sessions: readonly ShowroomSession[],
  policy: IrisAssistPolicy,
  locale: string,
  timeZone: string,
  meetingHref: (meetingId: string) => string,
  language: Language = DEFAULT_LANGUAGE,
): AssistedSale | null {
  if (deals === null) return null;
  const sold = deals.deals.filter(
    (d) => d.unitCode === unitCode && d.stage !== null && SALE_STAGES.has(d.stage),
  );
  const [newest] = placeSales(
    sold,
    deals.stageObservedAt ?? {},
    sessions,
    policy,
    locale,
    timeZone,
    () => null,
    meetingHref,
    language,
  ).sort((a, b) => b.at - a.at);
  return newest === undefined ? null : withoutInstant(newest);
}

/**
 * IRIS-ASSISTED SALES, FROM THE CRM'S DATED SALES AND THE PROJECT'S MEETINGS.
 *
 * For every deal the CRM has at reservation or purchase, with a unit and a
 * stage date: the last meeting that opened that unit before the date, and how
 * long before. Inside the policy's window it is an IRIS-assisted sale; outside
 * it the lag is still stated; with no such meeting it says so.
 *
 * `sessions` is the WHOLE project's, never a period's slice — a showing in
 * June belongs to a reservation in July whatever period the reader chose.
 *
 * A rule about order and nothing else. The deal's buyer is not linked to the
 * meeting's visitor (ADR-0011), so every sentence says the unit was shown, not
 * that the buyer saw it, and none says the showing produced the sale.
 */
export function buildAssistedSales(
  deals: DeliveredDeals | null,
  sessions: readonly ShowroomSession[],
  policy: IrisAssistPolicy,
  locale: string,
  timeZone: string,
  unitHref: (unitCode: string) => string | null,
  meetingHref: (meetingId: string) => string,
  /** The words' language; `locale` still formats the figures. */
  language: Language = DEFAULT_LANGUAGE,
): AssistedSales {
  if (deals === null) return { source: "not_connected", note: NOT_CONNECTED_NOTE };

  const sold = deals.deals.filter((d) => d.stage !== null && SALE_STAGES.has(d.stage));
  const window = `${String(policy.windowHours)} hours`;
  const sales = placeSales(
    sold,
    deals.stageObservedAt ?? {},
    sessions,
    policy,
    locale,
    timeZone,
    unitHref,
    meetingHref,
    language,
  );

  const datedSales = sales.length;
  const assisted = sales.filter((s) => s.verdict === "shown_in_window").length;
  const earlier = sales.filter((s) => s.verdict === "shown_earlier");
  const notShown = sales.filter((s) => s.verdict === "not_shown").length;
  const unplaced = sold.length - datedSales;
  const observedCount = sales.filter((s) => s.dateBasis === "first_observed").length;
  const enough = datedSales >= policy.minimumSales;

  const headline =
    datedSales === 0
      ? "The CRM dates no reservation or purchase yet, so there is no sale to place against a showing."
      : enough
        ? `${String(assisted)} of ${String(datedSales)} dated sales (${percent(assisted / datedSales, locale)}) followed an IRIS showing of the unit within ${window}.`
        : `${String(assisted)} of ${String(datedSales)} dated sales followed an IRIS showing of the unit within ${window}. ${sentence(language, DEAL_SALES_NEEDED_SENTENCE, { count: policy.minimumSales - datedSales })}`;

  /* A duration is read by its median, never its mean. */
  const earlierMedian = median(earlier.map((s) => (s.lagHours ?? 0) / 24));
  const note = [
    `A sale counts when a meeting that opened the unit started no more than ${window} before the date ${CONNECTOR_WORDS[deals.connector]} states for its reservation or purchase.`,
    "It says the showing came first and by how long. The buyer of a deal is not linked to the visitor in the room, so it does not say the buyer saw the unit, and it does not say the showing produced the sale.",
    earlier.length === 0 || earlierMedian === null
      ? null
      : sentence(language, DEAL_SHOWN_EARLIER_SENTENCE, {
          count: earlier.length,
          median: days(earlierMedian, language),
        }),
    notShown === 0 ? null : sentence(language, DEAL_NOT_OPENED_SENTENCE, { count: notShown }),
    observedCount === 0
      ? null
      : `${String(observedCount)} of these carry no date in the CRM and are placed by the sync that first saw the change, up to one sync after it happened, so their lag reads longer than it was and never shorter.`,
    unplaced === 0 ? null : sentence(language, DEAL_UNPLACED_SENTENCE, { count: unplaced }),
  ]
    .filter((w): w is string => w !== null)
    .join(" ");

  return {
    source: "crm",
    windowHours: policy.windowHours,
    policyVersion: policy.version,
    datedSales,
    assisted,
    shownEarlier: earlier.length,
    notShown,
    unplaced,
    minimumSales: policy.minimumSales,
    shareDisplay: enough && datedSales > 0 ? percent(assisted / datedSales, locale) : null,
    headline,
    note,
    sales: [...sales]
      /* Soonest after a showing first, so the assisted sales lead; never shown last; then newest. */
      .sort(
        (a, b) =>
          (a.lagHours ?? Number.POSITIVE_INFINITY) - (b.lagHours ?? Number.POSITIVE_INFINITY) ||
          b.at - a.at ||
          a.externalId.localeCompare(b.externalId),
      )
      .slice(0, 12)
      .map(withoutInstant),
  };
}
