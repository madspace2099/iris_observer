import type { ConnectorKind, ShowroomSession } from "@observer/contracts";
import type { IrisAssistPolicy } from "@observer/metrics";
import {
  DAYS,
  plural,
  type AssistVerdict,
  type CatalogueStatusChange,
  type DeliveredDeals,
  type IrisLedAgent,
  type IrisLedFigure,
  type IrisLedSale,
  type IrisLedSalesView,
  type IrisLedShowing,
  type IrisLedSource,
  type UnitStatus,
  type ViewContext,
} from "@observer/readmodels";
import { CONNECTOR_WORDS, STAGE_LABELS, lagWords, median } from "./deals";
import { count as formatCount, dayLabel, percent } from "./format";
import { BUILDINGS, catalogueFor, hasDeliveredCatalogue } from "./pulse";

/**
 * IRIS-LED SALES (ADR-0049), FROM THE CRM'S SALES, THE CATALOGUE'S WITNESSED
 * AVAILABILITY CHANGES AND THE PROJECT'S MEETINGS.
 *
 * The owner asked which sales the showroom "contributed to". The product can
 * answer which sales it SHOWED FIRST, and no more: a sale is IRIS-led when a
 * meeting opened the flat before the status change the CRM states. Every
 * showing before it is counted — in the period or before it, and the row says
 * which — with how long before and by whom. ADR-0039's 72-hour verdict rides
 * along as one column, unchanged.
 *
 * Sales are the period's; showings are the project's whole history, for
 * ADR-0039 §8's reason: a showing in June belongs to a reservation in July.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The catalogue as this rule reads it. */
export interface IrisLedCatalogue {
  readonly units: readonly { readonly code: string; readonly status: UnitStatus }[];
  /** The connector that delivered it; null for the synthetic building, which is no CRM. */
  readonly connector: ConnectorKind | null;
  /** By unit code: the witnessed move off the market, between two syncs. */
  readonly statusChanges: Readonly<Record<string, CatalogueStatusChange>>;
  /** True where the flats' availability is the demonstration CRM's own holds. */
  readonly fromDemonstrationCrm: boolean;
}

export interface IrisLedInput {
  readonly context: ViewContext;
  readonly deals: DeliveredDeals | null;
  readonly catalogue: IrisLedCatalogue;
  /** Every meeting of the project, whatever the period. */
  readonly sessions: readonly ShowroomSession[];
  /** The period the sales are counted in: `from` inclusive, `to` exclusive. */
  readonly window: { readonly from: string; readonly to: string };
  readonly policy: IrisAssistPolicy;
  readonly unitHref: (unitCode: string) => string | null;
  readonly meetingHref: (meetingId: string) => string;
  readonly agentName: (agentId: string) => string;
  /** Null where the agent has no page in the reader's period. */
  readonly agentHref: (agentId: string) => string | null;
}

/* --- the catalogue's witnessed changes, held like the deals ------------------ */

type Witnessed = Pick<IrisLedCatalogue, "statusChanges"> & { readonly connector: ConnectorKind };

const witnessed = new Map<string, Witnessed>();

/** Set by the repository beside `provideCatalogue`, from the same delivered catalogue. */
export function provideCatalogueChanges(projectId: string, delivered: Witnessed | null): void {
  if (delivered === null) witnessed.delete(projectId);
  else witnessed.set(projectId, delivered);
}

/** The project's catalogue, as `buildIrisLedSales` reads it. */
export function irisLedCatalogue(projectId: string): IrisLedCatalogue {
  const delivered = hasDeliveredCatalogue(projectId) ? (witnessed.get(projectId) ?? null) : null;
  return {
    units: catalogueFor(projectId),
    connector: delivered?.connector ?? null,
    statusChanges: delivered?.statusChanges ?? {},
    fromDemonstrationCrm: delivered === null && BUILDINGS[projectId]?.statusFromCrm === true,
  };
}

/* --- the words ------------------------------------------------------------- */

const CATALOGUE_WORDS: Readonly<Record<ConnectorKind, string>> = {
  realpad: "REALPAD",
  monday: "Monday",
  lomnio: "Lomnio",
  csv: "the uploaded sheet",
};

const VERDICT_WORDS: Readonly<Record<AssistVerdict, (hours: number) => string>> = {
  shown_in_window: (hours) => `Shown within ${String(hours)} hours`,
  shown_earlier: () => "Shown earlier",
  not_shown: () => "Not shown",
};

/** The timeline's marks, in days before the change. */
const TICKS: readonly { readonly days: number; readonly label: string }[] = [
  { days: 0, label: "Change" },
  { days: 3, label: "72 h" },
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 91, label: "3 months" },
  { days: 182, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
];

const count = (n: number, one: string, other: string): string =>
  `${String(n)} ${n === 1 ? one : other}`;

/* --- the rule ----------------------------------------------------------------- */

interface Placed {
  readonly id: string;
  readonly unitCode: string;
  readonly source: IrisLedSale["source"];
  readonly changeLabel: string;
  /** "its reservation date", "Observer first saw it marked sold". */
  readonly dateWords: string;
  /** "the reservation", "the change to sold": what a showing came before. */
  readonly changeNoun: string;
  readonly at: number;
  /**
   * The latest start a showing may have and still certainly come first: the
   * date itself where the CRM states it, else the sync before the one that saw
   * the change. A showing between the two is of unknown order, and not counted.
   */
  readonly certainUntil: number;
  readonly dateBasis: IrisLedSale["dateBasis"];
}

export function buildIrisLedSales(input: IrisLedInput): IrisLedSalesView {
  const { context, deals, catalogue, policy } = input;
  const locale = context.project.locale;
  const zone = context.project.timeZone;
  const language = context.language;
  const window = `${String(policy.windowHours)} hours`;

  /* Printed in the page's "How it is counted" panel: the rule, then what it cannot say, about fifty words each. */
  const definition = `A sale is IRIS-led when an IRIS presentation opened its flat before its status changed: before the reservation or purchase date the CRM states, or before a sync saw the flat turn reserved or sold. It is a rule about order. The ${window} column is the IRIS-assisted rule.`;
  const caveat = `Sequence, not cause. The CRM's buyer is not linked to the visitor in the room. A change only a sync dates is placed at that sync, so its gap reads longer, never shorter; a showing between two syncs is of unknown order and not counted. A sale with no date or flat is counted beside the figures.`;

  const connected = deals !== null || catalogue.connector !== null;
  const counts0 = {
    minimumSales: policy.minimumSales,
    windowHours: policy.windowHours,
    policyVersion: policy.version,
  };
  if (!connected) {
    return {
      context,
      source: null,
      headline:
        "No CRM is connected to this project, so there is no sale to place against a showing.",
      verdictMeetings: 0,
      definition,
      caveat,
      figures: [],
      sales: [],
      tableCaption: "",
      neverShown: [],
      neverShownNote: "",
      unplacedNote: null,
      frameNote: null,
      agents: [],
      axis: { ticks: [], windowStart: 1, caption: "" },
      counts: {
        ...counts0,
        sales: 0,
        shownBefore: 0,
        withinWindow: 0,
        shownEarlier: 0,
        notShown: 0,
        unplacedNoDate: 0,
        unplacedNoUnit: 0,
        catalogueUndated: 0,
      },
    };
  }

  const from = Date.parse(input.window.from);
  const to = Date.parse(input.window.to);
  const inPeriod = (at: number): boolean => at >= from && at < to;

  /* --- what changed, and when ------------------------------------------------ */

  const saleDeals = (deals?.deals ?? []).filter(
    (d) => d.stage === "reservation" || d.stage === "purchase",
  );
  const observed = deals?.stageObservedAt ?? {};
  const seenBefore = deals?.stageSeenBeforeAt ?? {};
  const placed: Placed[] = [];
  let unplacedNoDate = 0;
  let unplacedNoUnit = 0;
  for (const d of saleDeals) {
    if (d.stage === null) continue;
    const stated = d.stageEnteredAt;
    const dated = stated ?? observed[d.externalId] ?? null;
    const at = dated === null ? Number.NaN : Date.parse(dated);
    /* A sync's date needs the sync before it, or no showing can be put in order against it. */
    const certainUntil =
      stated === null ? Date.parse(seenBefore[d.externalId] ?? "") : Date.parse(stated);
    if (Number.isNaN(at) || Number.isNaN(certainUntil)) {
      unplacedNoDate += 1;
      continue;
    }
    if (!inPeriod(at)) continue;
    if (d.unitCode === null) {
      unplacedNoUnit += 1;
      continue;
    }
    const word = STAGE_LABELS[d.stage].toLowerCase();
    placed.push({
      id: d.externalId,
      unitCode: d.unitCode,
      source: "crm_deal",
      changeLabel: STAGE_LABELS[d.stage],
      dateWords: stated === null ? `Observer first saw its ${word}` : `its ${word} date`,
      changeNoun: `the ${word}`,
      at,
      certainUntil,
      dateBasis: stated === null ? "first_observed" : "crm_stated",
    });
  }

  /* A flat the CRM holds a sale for is the CRM's row; the catalogue adds only the rest. */
  const crmFlats = new Set(saleDeals.flatMap((d) => (d.unitCode === null ? [] : [d.unitCode])));
  let catalogueUndated = 0;
  for (const unit of catalogue.units) {
    if ((unit.status !== "reserved" && unit.status !== "sold") || crmFlats.has(unit.code)) continue;
    const move = catalogue.statusChanges[unit.code];
    const at = move === undefined ? Number.NaN : Date.parse(move.at);
    const certainUntil = move === undefined ? Number.NaN : Date.parse(move.seenBefore);
    if (move === undefined || Number.isNaN(at) || Number.isNaN(certainUntil)) {
      catalogueUndated += 1;
      continue;
    }
    if (!inPeriod(at)) continue;
    placed.push({
      id: `unit:${unit.code}`,
      unitCode: unit.code,
      source: "catalogue_availability",
      changeLabel:
        move.to === unit.status ? `Marked ${move.to}` : `Marked ${move.to}, now ${unit.status}`,
      dateWords: `Observer first saw it marked ${move.to}`,
      changeNoun: `the change to ${move.to}`,
      at,
      certainUntil,
      dateBasis: "first_observed",
    });
  }

  /* --- the showings before each change -------------------------------------- */

  const byFlat = new Map<string, ShowroomSession[]>();
  for (const s of [...input.sessions].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  )) {
    for (const code of new Set(s.units.map((u) => u.unitCode))) {
      const list = byFlat.get(code) ?? [];
      list.push(s);
      byFlat.set(code, list);
    }
  }
  const showingsOf = (p: Placed): readonly ShowroomSession[] =>
    (byFlat.get(p.unitCode) ?? []).filter((s) => Date.parse(s.startedAt) <= p.certainUntil);
  /* Between the sync before and the sync that saw the change: which came first is unknown. */
  const unorderedOf = (p: Placed): number =>
    (byFlat.get(p.unitCode) ?? []).filter((s) => {
      const start = Date.parse(s.startedAt);
      return start > p.certainUntil && start <= p.at;
    }).length;

  /* One colour per presenter, in name order, across the whole page. */
  const agentIds = [...new Set(placed.flatMap((p) => showingsOf(p).map((s) => s.agentId)))];
  const agents: IrisLedAgent[] = agentIds
    .map((id) => ({ id, name: input.agentName(id), href: input.agentHref(id) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((a, index) => ({ ...a, index }));
  const agentOf = new Map(agents.map((a) => [a.id, a]));

  /* The timeline: days before the change, stretched so the last three days stay legible. */
  const longest = Math.max(
    (policy.windowHours / 24) * 2,
    ...placed.flatMap((p) => showingsOf(p).map((s) => (p.at - Date.parse(s.startedAt)) / DAY_MS)),
  );
  const position = (days: number): number => 1 - Math.log1p(days) / Math.log1p(longest);

  const rows: IrisLedSale[] = placed.map((p) => {
    const shown = showingsOf(p);
    const showings: IrisLedShowing[] = shown.map((s) => {
      const start = Date.parse(s.startedAt);
      const hours = (p.at - start) / HOUR_MS;
      const agent = agentOf.get(s.agentId);
      const name = agent?.name ?? input.agentName(s.agentId);
      const dateDisplay = dayLabel(s.startedAt, locale, zone);
      const beforeDisplay = lagWords(hours, language);
      return {
        meetingId: s.meetingId,
        dateDisplay,
        agentId: s.agentId,
        agentName: name,
        agentIndex: agent?.index ?? 0,
        beforeDisplay,
        inPeriod: start >= from,
        meetingHref: input.meetingHref(s.meetingId),
        position: position(hours / 24),
        label: `${p.unitCode} shown ${dateDisplay} by ${name}, ${beforeDisplay} ${p.changeNoun}.`,
      };
    });
    const last = showings[showings.length - 1] ?? null;
    const lastStart = shown[shown.length - 1]?.startedAt ?? null;
    const lagHours = lastStart === null ? null : (p.at - Date.parse(lastStart)) / HOUR_MS;
    const verdict: AssistVerdict =
      lagHours === null
        ? "not_shown"
        : lagHours <= policy.windowHours
          ? "shown_in_window"
          : "shown_earlier";
    const n = showings.length;
    const within = showings.filter((s) => s.inPeriod).length;
    const unordered = unorderedOf(p);
    const unorderedWords =
      unordered === 0
        ? ""
        : ` ${n === 0 ? count(unordered, "meeting", "meetings") : count(unordered, "more meeting", "more meetings")} opened it after the sync before the change and by the one that saw it, so ${unordered === 1 ? "its" : "their"} order against the change is unknown and ${unordered === 1 ? "it is" : "they are"} not counted.`;
    const rowAgents = [...new Set(shown.map((s) => s.agentId))].flatMap((id) => {
      const a = agentOf.get(id);
      return a === undefined ? [] : [a];
    });
    return {
      id: p.id,
      unitCode: p.unitCode,
      unitHref: input.unitHref(p.unitCode),
      source: p.source,
      changeLabel: p.changeLabel,
      changeDisplay: dayLabel(new Date(p.at), locale, zone),
      dateBasis: p.dateBasis,
      dateWhose:
        p.source === "catalogue_availability"
          ? "first seen by a catalogue sync"
          : p.dateBasis === "crm_stated"
            ? "the CRM's date"
            : "first seen by a deals sync",
      showings,
      showingsDisplay: `${
        n === 0
          ? "None"
          : within === n
            ? `${String(n)}, all in the period`
            : within === 0
              ? `${String(n)}, all before the period`
              : `${String(n)}: ${String(within)} in the period, ${String(n - within)} before it`
      }${unordered === 0 ? "" : `; ${String(unordered)} of unknown order`}`,
      unorderedShowings: unordered,
      firstShownDisplay: showings[0]?.dateDisplay ?? null,
      lastShownDisplay: last?.dateDisplay ?? null,
      daysFromLastShowing: lagHours === null ? null : Math.floor(lagHours / 24),
      gapDisplay:
        lagHours === null ? "not shown" : lagWords(lagHours, language).replace(/ before$/, ""),
      lastPosition: last?.position ?? null,
      agents: rowAgents,
      verdict,
      verdictLabel: VERDICT_WORDS[verdict](policy.windowHours),
      statement: `${
        last === null
          ? `No IRIS presentation opened ${p.unitCode} before ${p.dateWords}.`
          : `${p.unitCode} was opened in ${count(n, "IRIS presentation", "IRIS presentations")} before ${p.dateWords}, the last ${last.beforeDisplay} it, by ${last.agentName}.`
      }${unorderedWords}`,
    };
  });

  /* Newest change first: the order of the CRM's own log. */
  const order = new Map(placed.map((p) => [p.id, p.at]));
  const newestFirst = (a: IrisLedSale, b: IrisLedSale): number =>
    (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0) || a.unitCode.localeCompare(b.unitCode);
  const led = rows.filter((r) => r.verdict !== "not_shown").sort(newestFirst);
  const neverShown = rows.filter((r) => r.verdict === "not_shown").sort(newestFirst);

  /* --- the figures, every one with its denominator ---------------------------- */

  const total = rows.length;
  const shownBefore = led.length;
  const withinWindow = led.filter((r) => r.verdict === "shown_in_window").length;
  const enough = total >= policy.minimumSales;
  const share = (n: number): string | null => (enough ? percent(n / total, locale) : null);
  const medianShowings = median(led.map((r) => r.showings.length));
  const medianGap = median(
    led.flatMap((r) => (r.daysFromLastShowing === null ? [] : [r.daysFromLastShowing])),
  );
  const acrossLed = `across ${count(shownBefore, "IRIS-led sale", "IRIS-led sales")}`;
  const floorWords = `no share below ${count(policy.minimumSales, "sale", "sales")}`;

  const figures: IrisLedFigure[] =
    total === 0
      ? []
      : [
          {
            id: "led",
            label: "Shown in IRIS before the change",
            value: `${String(shownBefore)} of ${String(total)}`,
            of:
              share(shownBefore) === null
                ? floorWords
                : `${share(shownBefore) ?? ""} of the period's sales`,
          },
          {
            id: "window",
            label: `Shown within ${window} of the change`,
            value: `${String(withinWindow)} of ${String(total)}`,
            /*
             * The same denominator as the card beside it, in the same words, so
             * the two 19s cannot read as two. A sale this period has with no
             * flat is in `unplacedNote`. Sales Flow's card takes the same rule
             * over every dated sale so far.
             */
            of:
              share(withinWindow) === null
                ? `the IRIS-assisted rule; ${floorWords}`
                : `${share(withinWindow) ?? ""} of the period's sales, the IRIS-assisted rule`,
          },
          {
            id: "showings",
            label: "Showings before a sale, median",
            /* The median of an even count is the mean of the middle two: "7.5", in the project's own figures. */
            value: medianShowings === null ? "No sale shown" : formatCount(medianShowings, locale),
            of: medianShowings === null ? "nothing to take a median of" : acrossLed,
          },
          {
            id: "gap",
            label: "Last showing to the change, median",
            value:
              medianGap === null
                ? "No sale shown"
                : `${String(Math.round(medianGap))} ${plural(language, Math.round(medianGap), DAYS)}`,
            of: medianGap === null ? "nothing to take a median of" : acrossLed,
          },
        ];

  /* "At some point": any showing before the change, against the 72 hours the IRIS-assisted figures count. */
  const said = `${String(shownBefore)} of ${String(total)} ${total === 1 ? "sale" : "sales"} in this period ${shownBefore === 1 ? "was" : "were"} shown in IRIS at some point before ${shownBefore === 1 ? "its" : "their"} status changed`;
  const headline =
    total === 0
      ? "No sale the CRM states is dated in this period, so there is nothing to place against a showing."
      : enough
        ? `${said} (${share(shownBefore) ?? ""}).`
        : `${said}. A share is stated from ${count(policy.minimumSales, "sale", "sales")}.`;

  /* The demonstration CRM makes its deals from meetings: a 100% here is how the data was made. */
  const byConstruction =
    deals?.connector === "synthetic"
      ? " The demonstration CRM makes each of its deals from a meeting that opened the flat, so every sale it states was shown in IRIS by construction; a real CRM lists sales the showroom never showed."
      : "";
  const neverShownNote =
    total === 0
      ? ""
      : `${
          neverShown.length === 0
            ? "Every sale in this period was shown in IRIS before its status changed."
            : `${String(neverShown.length)} of ${String(total)} ${total === 1 ? "sale" : "sales"} in this period had no IRIS presentation open the flat before the change. They are in the denominator above.`
        }${byConstruction}`;

  const unplaced = [
    unplacedNoDate === 0
      ? null
      : `${count(unplacedNoDate, "sale the CRM states carries", "sales the CRM states carry")} no date Observer could use, so no period holds ${unplacedNoDate === 1 ? "it" : "them"}.`,
    unplacedNoUnit === 0
      ? null
      : `${count(unplacedNoUnit, "sale dated in this period names", "sales dated in this period name")} no flat, so no showing can be placed against ${unplacedNoUnit === 1 ? "it" : "them"}.`,
    catalogueUndated === 0
      ? null
      : `The catalogue lists ${count(catalogueUndated, "more flat", "more flats")} as reserved or sold with no date for the change; ${catalogueUndated === 1 ? "it is" : "they are"} not counted.`,
  ].filter((w): w is string => w !== null);

  /* --- where it was read from --------------------------------------------------- */

  const name =
    deals !== null
      ? CONNECTOR_WORDS[deals.connector]
      : `the catalogue from ${CATALOGUE_WORDS[catalogue.connector ?? "csv"]}`;
  const readAtDisplay = deals === null ? null : dayLabel(deals.fetchedAt, locale, zone);
  const reads = [
    deals === null
      ? null
      : "deal stages, and the date the CRM states for each reservation and purchase",
    catalogue.connector !== null
      ? `unit availability from ${CATALOGUE_WORDS[catalogue.connector]}, a change dated by the sync that first saw it`
      : catalogue.fromDemonstrationCrm
        ? "unit availability, from the same deals"
        : null,
  ].filter((w): w is string => w !== null);
  const source: IrisLedSource = {
    connector: deals?.connector ?? null,
    name,
    readAtDisplay,
    reads,
    /*
     * Where it was read, and no more: the demonstration CRM's "by construction"
     * is said once, in `neverShownNote`, which the same card prints.
     */
    note: `Read from ${name}${readAtDisplay === null ? "" : `, last read ${readAtDisplay}`}: ${reads.join("; ")}. Showings are read from every IRIS meeting on this project, whatever the period.`,
  };
  /* The Sales Flow card this page sits beneath reads the same rule over a different frame (ADR-0039 §8). */
  const frameNote =
    deals === null || total === 0
      ? null
      : `The IRIS-assisted card on Sales Flow takes the same ${String(policy.windowHours)}-hour rule over every dated sale so far; these figures count this period's sales only.`;

  const windowStart = position(policy.windowHours / 24);
  return {
    context,
    source,
    headline,
    verdictMeetings: new Set(led.flatMap((r) => r.showings.map((s) => s.meetingId))).size,
    definition,
    caveat,
    figures,
    sales: led,
    tableCaption: `${count(shownBefore, "sale", "sales")} shown in IRIS before ${shownBefore === 1 ? "its" : "their"} status changed, newest change first. Each date is the CRM's where it states one, else the sync that first saw the change.`,
    neverShown,
    neverShownNote,
    unplacedNote: unplaced.length === 0 ? null : unplaced.join(" "),
    frameNote,
    agents,
    axis: {
      ticks: TICKS.filter((t) => t.days <= longest).map((t) => ({
        label: t.label,
        position: position(t.days),
      })),
      windowStart,
      caption: `Each row is one sale. A dot is a meeting that opened the flat, coloured by who presented it; the bar on the right is the status change. Days before the change run right to left on a stretched scale, so the last ${window} stay readable beside a showing months earlier.`,
    },
    counts: {
      ...counts0,
      sales: total,
      shownBefore,
      withinWindow,
      shownEarlier: shownBefore - withinWindow,
      notShown: neverShown.length,
      unplacedNoDate,
      unplacedNoUnit,
      catalogueUndated,
    },
  };
}
