import {
  NotFoundError,
  type ActionItem,
  type AiBriefing,
  type ChangeItem,
  type DataHealth,
  type ExecutiveOverview,
  type FunnelStep,
  type MetricValue,
  type Verdict,
  type DeliveredDeals,
  type ViewContext,
} from "@observer/readmodels";
import { hasProgressed, outcomeIsUnknown, type ShowroomSession } from "@observer/contracts";
import {
  DEFAULT_ATTRIBUTION_POLICY,
  attentionIndex,
  attentionIndexDisplay,
} from "@observer/metrics";
import { LADDER_STAGES, dealsFor } from "./deals";
import { catalogueFor, type ObservedMeetings, type RawUnit } from "./pulse";
import { sessionsForProject } from "./showroom/sessions";
import {
  comparison,
  compactMoney,
  count,
  dayLabel,
  days,
  evidenceRef,
  insufficient,
  NO_PAGE,
  money,
  ok,
  percent,
  unavailable,
} from "./format";

/**
 * Executive Overview, per project shape.
 *
 * Three projects, three different screens, all from the same builder:
 *
 *  - **Northgate** is complete and has a real problem to find. It is the
 *    screen the product is judged on.
 *  - **Riverside** has no CRM, so everything below the meeting must render its
 *    unavailable state rather than a smaller number.
 *  - **Kingsford** is three weeks old, so every verdict must be suppressed.
 *
 * Those are not three demos. They are the three states every customer passes
 * through, and building them together is what stops the empty and partial
 * cases being an afterthought.
 */

const POLICY = DEFAULT_ATTRIBUTION_POLICY.version;

/**
 * The rules that produce a verdict, versioned like any other policy.
 *
 * A changed threshold changes what "positive" means, and a reader comparing
 * two quarters has to be able to tell whether the project moved or the rule
 * did.
 */
const VERDICT_RULESET = "verdict-1.0.0";

function base(context: ViewContext) {
  const { project, tenant } = context;
  const root = `/${tenant.slug}/${project.slug}`;
  return {
    root,
    locale: project.locale,
    currency: project.currency,
  };
}

/* --- Northgate: the complete case ---------------------------------------- */

/**
 * A segment's attention index over some meetings: the registry's one
 * implementation, over the stock the period ends with unsold. The overviews were
 * hand-written scenarios, and their index was hand-written with them — 2.1 for
 * Northgate's two-room units, 1.7 for Riverside's high south-facing flats —
 * while `/project` computed another figure for the same units (decision
 * 2026-09-27). Null where there is nothing to index.
 */
function indexOver(
  projectId: string,
  sessions: readonly ShowroomSession[],
  inSegment: (unit: RawUnit) => boolean,
): number | null {
  return attentionIndex(
    catalogueFor(projectId),
    sessions.flatMap((s) => s.units),
    inSegment,
  ).index;
}

/** A relative change as the changes list prints it: "+34%", "−8%". */
function signedPercent(change: number): string {
  return `${change >= 0 ? "+" : "−"}${String(Math.round(Math.abs(change) * 100))}%`;
}

/* --- what every overview computes the same way ---------------------------- */

/**
 * The period as a sentence names it. The headline said "this quarter" on every
 * period, including last quarter and the year to date.
 */
function periodPhrase(context: ViewContext): string {
  switch (context.period.preset) {
    case "quarter_to_date":
      return "this quarter";
    case "last_quarter":
      return "last quarter";
    case "year_to_date":
      return "this year";
    case "last_28_days":
      return "in the last 28 days";
  }
}

const SOURCE_NAMES: Readonly<Record<string, string>> = {
  webiris: "WEBIRIS",
  showroom: "Showroom",
  crm: "CRM",
  catalogue: "Catalogue",
};

/** Which sources the project has, from its own configuration rather than a list per builder. */
function sourcesOf(context: ViewContext) {
  const connected = context.project.connectedSources as readonly string[];
  const names = Object.keys(SOURCE_NAMES);
  return {
    sourcesPresent: names.filter((s) => connected.includes(s)).map((s) => SOURCE_NAMES[s] ?? s),
    sourcesMissing: names.filter((s) => !connected.includes(s)).map((s) => SOURCE_NAMES[s] ?? s),
  };
}

const COMPLETENESS_RULE = "At least 80% of meetings carry a recorded outcome";

/**
 * Completeness, measured: the share of the period's meetings that carry a
 * recorded outcome. It was a typed 86%, 52% and 71% "of expected inputs", a
 * denominator nothing computes.
 */
function completenessOf(meetings: readonly ShowroomSession[]) {
  const unknown = meetings.filter((s) => outcomeIsUnknown(s.outcome)).length;
  const total = meetings.length;
  return { unknown, total, share: total === 0 ? null : (total - unknown) / total };
}

function completenessMetric(meetings: readonly ShowroomSession[], locale: string): MetricValue {
  const { total, share } = completenessOf(meetings);
  if (share === null) {
    return unavailable(
      "exec.data_completeness",
      "Data completeness",
      5,
      "No meeting in this period, so there is nothing to measure completeness over.",
    );
  }
  const input = {
    metricId: "exec.data_completeness",
    label: "Data completeness",
    display: percent(share, locale),
    raw: share,
    qualifier: "of meetings carry a recorded outcome",
    sampleSize: total,
    minimumSampleSize: 5,
  };
  return total < 5
    ? insufficient(input, "Fewer than 5 meetings — shown as a raw figure, not as a verdict.")
    : ok(input);
}

function completenessComponent(meetings: readonly ShowroomSession[], locale: string) {
  const { share } = completenessOf(meetings);
  return {
    metricId: "exec.data_completeness",
    label: "Data completeness",
    display: share === null ? "no meetings" : percent(share, locale),
    rule: COMPLETENESS_RULE,
    outcome:
      share === null ? ("unknown" as const) : share >= 0.8 ? ("pass" as const) : ("fail" as const),
  };
}

function completenessNote(meetings: readonly ShowroomSession[]): string | null {
  const { unknown, total } = completenessOf(meetings);
  if (total === 0) return null;
  if (unknown === 0)
    return `All ${String(total)} meetings in this period carry a recorded outcome.`;
  if (unknown === total)
    return `None of the ${String(total)} meetings in this period carries a recorded outcome.`;
  return `${String(unknown)} of ${String(total)} meetings have no recorded outcome, so conversion is a lower bound.`;
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/* --- Northgate: the complete case ---------------------------------------- */

const within = (iso: string | null, from: string, to: string): boolean => {
  if (iso === null) return false;
  const t = Date.parse(iso);
  return t >= Date.parse(from) && t < Date.parse(to);
};

/** The nearest-rank percentile; null for no values. */
function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] as number;
}

/**
 * What the CRM says about one window: the deals it dates to a purchase inside
 * it, and how far the deals opened inside it have climbed. The CRM's stage is
 * the authority on a sale (ADR-0021), so a sale is a deal the CRM moved to
 * purchase in the window — not the catalogue's undated "sold", not a meeting's
 * outcome, and not the scenario's typed seven.
 */
function crmWindow(deals: DeliveredDeals, from: string, to: string) {
  const rank = new Map<string, number>(LADDER_STAGES.map((s, i) => [s, i]));
  const reached = (stage: string) => (d: DeliveredDeals["deals"][number]) =>
    d.stage !== null && d.stage !== "lost" && (rank.get(d.stage) ?? -1) >= (rank.get(stage) ?? 99);
  const sales = deals.deals.filter(
    (d) => d.stage === "purchase" && within(d.stageEnteredAt, from, to),
  );
  const opened = deals.deals.filter((d) => within(d.openedAt, from, to));
  const daysToClose = sales
    .map((d) =>
      d.stageEnteredAt === null || d.openedAt === null
        ? null
        : (Date.parse(d.stageEnteredAt) - Date.parse(d.openedAt)) / 86_400_000,
    )
    .filter((n): n is number => n !== null);
  return {
    sold: sales.length,
    offers: opened.filter(reached("offer")).length,
    reservations: opened.filter(reached("reservation")).length,
    purchases: opened.filter(reached("purchase")).length,
    soldUnits: sales.map((d) => d.unitCode).filter((c): c is string => c !== null),
    medianDaysToClose: percentile(daysToClose, 0.5),
    p80DaysToClose: percentile(daysToClose, 0.8),
  };
}

/** A rate step of the funnel, from counts, gated at its documented minimum. */
function funnelStep(
  label: string,
  metricId: string,
  from: number,
  to: number,
  minimum: number,
  unitWord: string,
  locale: string,
  root: string,
): FunnelStep {
  const input = {
    metricId,
    label,
    display: from === 0 ? "—" : percent(to / from, locale),
    raw: from === 0 ? 0 : to / from,
    qualifier: `${String(to)} of ${String(from)}`,
    sampleSize: from,
    minimumSampleSize: minimum,
    evidence: evidenceRef(`northgate.${metricId}`, "observed_sequence", `${root}/flow`, from),
    drillHref: `${root}/flow`,
    policyVersion: POLICY,
  };
  return {
    label,
    fromCount: from,
    toCount: to,
    metric:
      from < minimum
        ? insufficient(
            input,
            `Fewer than ${String(minimum)} ${unitWord} — shown as a raw figure, not as a verdict.`,
          )
        : ok(input),
  };
}

function northgate(context: ViewContext, meetings: ObservedMeetings): ExecutiveOverview {
  const { root, locale } = base(context);
  const { period } = context;
  const name = context.project.name;
  const when = periodPhrase(context);
  const deals = dealsFor(context.project.id as string);

  const twoRoom = (u: RawUnit) => u.rooms === 2;
  const twoRoomNow = indexOver(context.project.id as string, meetings.current, twoRoom);
  const twoRoomBefore = indexOver(context.project.id as string, meetings.previous, twoRoom);

  /*
   * Two-room conversion, the way `/project` reads it: decided meetings that
   * opened a two-room unit and progressed, against every decided meeting. The
   * sentence said "half the project average" while the figures said 41% against
   * 40% — the opposite reading, typed once and never measured.
   */
  const twoRoomCodes = new Set(
    catalogueFor(context.project.id as string)
      .filter(twoRoom)
      .map((u) => u.code),
  );
  const decided = meetings.current.filter((s) => !outcomeIsUnknown(s.outcome));
  const decidedTwoRoom = decided.filter((s) => s.units.some((u) => twoRoomCodes.has(u.unitCode)));
  const rate = (xs: readonly ShowroomSession[]) =>
    xs.length === 0 ? null : xs.filter((s) => hasProgressed(s.outcome)).length / xs.length;
  const twoRoomRate = rate(decidedTwoRoom);
  const projectRate = rate(decided);
  const comparable = decidedTwoRoom.length >= 20 && twoRoomRate !== null && projectRate !== null;
  const convertsBelow = comparable && (twoRoomRate as number) < (projectRate as number);
  const conversionClause = comparable
    ? `their decided meetings progress at ${percent(twoRoomRate as number, locale)} against the project's ${percent(projectRate as number, locale)}`
    : `${plural(decidedTwoRoom.length, "decided meeting", "decided meetings")} opened them, too few of 20 to compare their conversion`;
  const twoRoomReading =
    twoRoomNow === null
      ? "Two-room units have no attention index in this period"
      : `Two-room units draw ${attentionIndexDisplay(twoRoomNow)} their share of attention`;
  /* The reading stays only where the figure under it is true. */
  const twoRoomSentence = `${twoRoomReading}, and ${conversionClause}.${convertsBelow ? " The interest is real; the price probably is not." : ""}`;

  const now = deals === null ? null : crmWindow(deals, period.from, period.to);
  const before = deals === null ? null : crmWindow(deals, period.baselineFrom, period.baselineTo);
  const viewing = meetings.current.length;
  const viewingBefore = meetings.previous.length;
  const offerRate = now === null || viewing === 0 ? null : now.offers / viewing;
  const offerRateBefore =
    before === null || viewingBefore === 0 ? null : before.offers / viewingBefore;

  const NO_DEALS = "The CRM delivered no deals, so outcomes below the meeting are unknown.";
  const velocityChange =
    now === null || before === null || before.sold === 0 ? null : now.sold / before.sold - 1;

  /*
   * Revenue at list price. The registry's revenue is the contracted price and
   * falls back to the list price "only where the contracted price is absent, and
   * says so": this CRM states no contracted price, so every sale is valued at
   * the catalogue's list price and the qualifier says that. Units without a
   * price are excluded, as the registry excludes them.
   */
  const catalogue = catalogueFor(context.project.id as string);
  const priceOf = new Map(catalogue.map((u) => [u.code, u.price]));
  const soldPrices = (now?.soldUnits ?? [])
    .map((c) => priceOf.get(c) ?? null)
    .filter((p): p is number => p !== null);
  const inventory = catalogue.reduce((a, u) => a + (u.price ?? 0), 0);
  const revenue = soldPrices.reduce((a, p) => a + p, 0);

  const headline: MetricValue[] = [
    now === null
      ? unavailable("exec.units_sold", "Units Sold", 1, NO_DEALS)
      : ok({
          metricId: "exec.units_sold",
          label: "Units Sold",
          display: count(now.sold, locale),
          raw: now.sold,
          qualifier: "moved to purchase by the CRM in this period",
          sampleSize: now.sold,
          minimumSampleSize: 1,
          ...(velocityChange === null || before === null
            ? {}
            : {
                comparison: comparison(
                  period.baselineLabel,
                  signedPercent(velocityChange),
                  velocityChange >= 0 ? "up" : "down",
                  "up",
                ),
              }),
          evidence: evidenceRef(
            "northgate.units_sold",
            "observed_sequence",
            `${root}/flow`,
            now.sold,
          ),
          drillHref: `${root}/flow`,
        }),
    now === null
      ? unavailable("exec.revenue", "Revenue", 1, NO_DEALS)
      : now.sold > 0 && soldPrices.length === 0
        ? unavailable(
            "exec.revenue",
            "Revenue",
            1,
            "No unit sold in this period has a price in the catalogue.",
          )
        : ok({
            metricId: "exec.revenue",
            label: "Revenue",
            display: compactMoney(revenue, context.project.currency, locale),
            raw: revenue,
            qualifier: `of ${compactMoney(inventory, context.project.currency, locale)} inventory, at list price: the CRM states no contract price`,
            sampleSize: soldPrices.length,
            minimumSampleSize: 1,
            evidence: evidenceRef(
              "northgate.revenue",
              "observed_sequence",
              `${root}/flow`,
              soldPrices.length,
            ),
            drillHref: `${root}/flow`,
          }),
    now === null || now.medianDaysToClose === null
      ? unavailable(
          "exec.avg_days_to_close",
          "Average Days to Close",
          10,
          "No sale in this period carries both an opening and a purchase date.",
        )
      : insufficientBelow(
          {
            metricId: "exec.avg_days_to_close",
            label: "Average Days to Close",
            display: days(now.medianDaysToClose, context.language),
            raw: now.medianDaysToClose,
            qualifier: `median; 80th percentile ${days(now.p80DaysToClose ?? now.medianDaysToClose, context.language)}, over ${plural(now.sold, "sale", "sales")}`,
            sampleSize: now.sold,
            minimumSampleSize: 10,
            evidence: evidenceRef(
              "northgate.days_to_close",
              "observed_sequence",
              `${root}/flow`,
              now.sold,
            ),
            drillHref: `${root}/flow`,
          },
          "Fewer than 10 sales — shown as a raw figure, not as a verdict.",
        ),
    /*
     * Active buyers are contacts with an OPEN DEAL and a recent interaction
     * (registry: exec.active_buyers). This CRM's deals name no contact, so no
     * meeting can be tied to an open deal, and a count of contacts met would be
     * a different metric under this one's name.
     */
    unavailable(
      "exec.active_buyers",
      "Active Buyers",
      1,
      "The CRM's deals name no contact, so an open deal cannot be tied to a buyer.",
    ),
  ];

  const funnel: FunnelStep[] =
    now === null
      ? []
      : [
          funnelStep(
            "Viewing to Offer",
            "flow.viewing_to_offer",
            viewing,
            now.offers,
            20,
            "meetings",
            locale,
            root,
          ),
          funnelStep(
            "Offer to Reservation",
            "flow.offer_to_reservation",
            now.offers,
            now.reservations,
            15,
            "offers",
            locale,
            root,
          ),
          funnelStep(
            "Reservation to Sale",
            "flow.reservation_to_sale",
            now.reservations,
            now.purchases,
            10,
            "reservations",
            locale,
            root,
          ),
        ];

  /**
   * Deterministic, and shown with its workings: three rules, each a figure
   * computed above against a stated threshold. Any fail is attention needed;
   * all passing is positive; otherwise there is not enough to say.
   */
  const components: Verdict["components"] = [
    {
      metricId: "exec.units_sold",
      label: "Sales velocity",
      display: now === null ? "unknown" : plural(now.sold, "unit", "units"),
      rule:
        before === null
          ? "Requires the CRM"
          : `At least 90% of ${period.baselineLabel} (${String(before.sold)})`,
      outcome:
        now === null || before === null || before.sold === 0
          ? "unknown"
          : now.sold >= 0.9 * before.sold
            ? "pass"
            : "fail",
    },
    {
      metricId: "flow.viewing_to_offer",
      label: "Viewing to offer",
      display: offerRate === null ? "unknown" : percent(offerRate, locale),
      rule:
        offerRateBefore === null
          ? "Within 10% of the comparison period, which has no meetings"
          : `Within 10% of ${period.baselineLabel} (${percent(offerRateBefore, locale)})`,
      outcome:
        offerRate === null || offerRateBefore === null || viewing < 20 || viewingBefore < 20
          ? "unknown"
          : offerRate >= 0.9 * offerRateBefore
            ? "pass"
            : "fail",
    },
    completenessComponent(meetings.current, locale),
  ];
  const state: Verdict["state"] = components.some((c) => c.outcome === "fail")
    ? "attention_needed"
    : components.every((c) => c.outcome === "pass")
      ? "positive"
      : "insufficient_data";

  const velocitySentence =
    now === null || before === null
      ? `${name} has no CRM deals to count sales from.`
      : before.sold === 0
        ? `${name} sold ${plural(now.sold, "unit", "units")} ${when}; ${period.baselineLabel} has no dated sale to compare against.`
        : `${name} sold ${plural(now.sold, "unit", "units")} ${when} against ${String(before.sold)} in ${period.baselineLabel} (${signedPercent(now.sold / before.sold - 1)}).`;

  const verdict: Verdict = {
    state,
    headline: velocitySentence,
    supporting: twoRoomSentence,
    evidence: evidenceRef("northgate.verdict", "observed_sequence", `${root}/flow`, viewing),
    rulesetVersion: VERDICT_RULESET,
    components,
  };

  /*
   * The change in two-room attention, from the same implementation over the
   * baseline period's meetings. Where either end has no index, no change is stated.
   */
  const twoRoomChange: ChangeItem | null =
    twoRoomNow === null || twoRoomBefore === null
      ? null
      : {
          id: "two-room-attention",
          label: "Two-room attention",
          deltaDisplay: signedPercent(twoRoomNow / twoRoomBefore - 1),
          direction: twoRoomNow >= twoRoomBefore ? "up" : "down",
          better: "up",
          detail: `Attention index now ${attentionIndexDisplay(twoRoomNow)}; ${conversionClause}.`,
          evidence: evidenceRef(
            "northgate.tworoom",
            "observed_sequence",
            `${root}/project`,
            decidedTwoRoom.length,
          ),
          href: `${root}/project`,
        };

  const changes: ChangeItem[] = [
    ...(velocityChange === null || now === null || before === null
      ? []
      : [
          {
            id: "velocity",
            label: "Sales velocity",
            deltaDisplay: signedPercent(velocityChange),
            direction: velocityChange >= 0 ? ("up" as const) : ("down" as const),
            better: "up" as const,
            detail: `${plural(now.sold, "unit", "units")} ${when} against ${String(before.sold)} in ${period.baselineLabel}.`,
            evidence: evidenceRef(
              "northgate.velocity",
              "observed_sequence",
              `${root}/flow`,
              now.sold + before.sold,
            ),
            href: `${root}/flow`,
          },
        ]),
    ...(twoRoomChange === null ? [] : [twoRoomChange]),
  ];

  const briefing: AiBriefing = {
    heading: `What changed ${when}`,
    statements: [
      {
        text:
          now === null
            ? velocitySentence
            : `${velocitySentence} Of ${plural(viewing, "meeting", "meetings")} ${when}, ${String(now.offers)} became deals that reached an offer.`,
        tier: "observed_sequence",
        evidence: evidenceRef("northgate.brief.1", "observed_sequence", `${root}/flow`, viewing),
      },
      {
        text: twoRoomSentence,
        tier: "statistical_association",
        evidence: evidenceRef(
          "northgate.brief.2",
          "statistical_association",
          `${root}/project`,
          decidedTwoRoom.length,
        ),
      },
    ],
    generatorVersion: "briefing-1.0.0",
    generatedAt: context.generatedAt,
    caveat: null,
  };

  const actions: ActionItem[] = [
    {
      id: "review-two-room",
      label: "Open the two-room segment",
      description: "Its attention, its conversion and the units buyers compared.",
      href: `${root}/project`,
      emphasis: "primary",
    },
    {
      id: "review-stalled",
      label: "Review the longest-standing deals",
      description: "The open deals longest on their rung, by the stage date the CRM stated.",
      href: `${root}/flow`,
      emphasis: "secondary",
    },
  ];

  const dataHealth: DataHealth = {
    completeness: completenessMetric(meetings.current, locale),
    ...sourcesOf(context),
    note: completenessNote(meetings.current),
  };

  return {
    context,
    verdict,
    headline,
    funnel,
    briefing,
    changes,
    alerts: [],
    actions,
    dataHealth,
  };
}

/** `insufficient` below the input's own minimum, `ok` at or above it. */
function insufficientBelow(input: Parameters<typeof ok>[0], message: string): MetricValue {
  return (input.sampleSize ?? 0) < input.minimumSampleSize
    ? insufficient(input, message)
    : ok(input);
}

/* --- Riverside and Kingsford: no CRM --------------------------------------- */

const NO_CRM = "The CRM is not connected, so outcomes below the meeting are unknown.";

/** The figures a project without a CRM cannot have, drawn as unavailable rather than as a smaller number. */
function withoutCrm(context: ViewContext, meetings: ObservedMeetings) {
  const { locale } = base(context);
  const held = meetings.current.length;
  return {
    held,
    components: [
      {
        metricId: "exec.units_sold",
        label: "Sales velocity",
        display: "unknown",
        rule: "Requires the CRM",
        outcome: "unknown" as const,
      },
      {
        metricId: "flow.viewing_to_offer",
        label: "Viewing to offer",
        display: "unknown",
        rule: "Requires the CRM",
        outcome: "unknown" as const,
      },
      completenessComponent(meetings.current, locale),
    ],
    headline: [
      unavailable("exec.units_sold", "Units Sold", 1, NO_CRM),
      unavailable("exec.revenue", "Revenue", 1, NO_CRM),
      unavailable("exec.avg_days_to_close", "Average Days to Close", 10, NO_CRM),
      unavailable("exec.active_buyers", "Active Buyers", 1, NO_CRM),
    ],
    funnel: [
      {
        label: "Viewing to Offer",
        fromCount: held,
        toCount: null,
        metric: unavailable("flow.viewing_to_offer", "Viewing to Offer", 20, NO_CRM),
      },
      {
        label: "Offer to Reservation",
        fromCount: null,
        toCount: null,
        metric: unavailable("flow.offer_to_reservation", "Offer to Reservation", 15, NO_CRM),
      },
      {
        label: "Reservation to Sale",
        fromCount: null,
        toCount: null,
        metric: unavailable("flow.reservation_to_sale", "Reservation to Sale", 10, NO_CRM),
      },
    ] satisfies FunnelStep[],
    dataHealth: {
      completeness: completenessMetric(meetings.current, locale),
      ...sourcesOf(context),
      note: completenessNote(meetings.current),
    } satisfies DataHealth,
  };
}

function riverside(context: ViewContext, meetings: ObservedMeetings): ExecutiveOverview {
  const { root } = base(context);
  const shared = withoutCrm(context, meetings);
  const when = periodPhrase(context);
  /*
   * The scenario's high south-facing flats, at the index the period's meetings
   * give them. The catalogue has none — every Riverside unit faces east or north
   * — so the reading says that rather than printing the 1.7× the scenario was
   * written with.
   */
  const southHigh = attentionIndex(
    catalogueFor(context.project.id as string),
    meetings.current.flatMap((s) => s.units),
    (u) => u.orientation === "S" && u.floor !== null && u.floor >= 4,
  );

  return {
    context,
    verdict: {
      state: "insufficient_data",
      headline: `No verdict is possible for ${context.project.name}: without the CRM, Observer can see the meetings but not what came of them.`,
      supporting: `${plural(shared.held, "meeting is", "meetings are")} recorded ${when}. Connect the CRM to see offers, reservations and sales.`,
      evidence: evidenceRef("riverside.verdict", "observed_sequence", NO_PAGE, shared.held),
      rulesetVersion: VERDICT_RULESET,
      components: shared.components,
    },
    headline: shared.headline,
    funnel: shared.funnel,
    briefing: {
      heading: "What can be said without the CRM",
      statements: [
        {
          text: `${plural(shared.held, "meeting was", "meetings were")} held ${when}.`,
          tier: "observed_sequence",
          evidence: evidenceRef("riverside.brief.1", "observed_sequence", NO_PAGE, shared.held),
        },
        {
          text:
            southHigh.segmentUnits === 0
              ? "No unsold unit faces south above the third floor, so there is no attention index to state for them."
              : southHigh.index === null
                ? "Nobody looked at the unsold stock in this period, so there is no attention index to state."
                : `South-facing units above the third floor take ${attentionIndexDisplay(southHigh.index)} their share of attention. Whether that converts cannot be seen from here.`,
          tier: "statistical_association",
          evidence: evidenceRef(
            "riverside.brief.2",
            "statistical_association",
            `${root}/project`,
            shared.held,
          ),
        },
      ],
      generatorVersion: "briefing-1.0.0",
      generatedAt: context.generatedAt,
      caveat: "The CRM is disconnected. Nothing below the meeting is included in this summary.",
    },
    changes: [],
    alerts: [
      {
        id: "crm-missing",
        severity: "critical",
        title: "The CRM is not connected",
        detail:
          "Offers, reservations and sales are invisible, so this project has no funnel and no sell-out forecast.",
        evidence: null,
        actionLabel: "Connect a CRM",
        actionHref: "/madspace",
      },
    ],
    actions: [
      {
        id: "connect-crm",
        label: "Connect a CRM",
        description: "Unlocks the funnel, the forecast and every outcome metric.",
        href: "/madspace",
        emphasis: "primary",
      },
    ],
    dataHealth: shared.dataHealth,
  };
}

function kingsford(context: ViewContext, meetings: ObservedMeetings): ExecutiveOverview {
  const { locale } = base(context);
  const shared = withoutCrm(context, meetings);
  const when = periodPhrase(context);
  /*
   * How long the project has been presenting, from its own first meeting —
   * the headline said "three weeks and 7 meetings" while 41 were on record.
   */
  const first = [...sessionsForProject(context.project.id as string)]
    .map((s) => s.startedAt)
    .sort()[0];
  const since =
    first === undefined
      ? "It has no meeting on record yet."
      : `Its first meeting was on ${dayLabel(first, locale, context.project.timeZone)}.`;

  return {
    context,
    verdict: {
      state: "insufficient_data",
      headline: `${context.project.name} has held ${plural(shared.held, "meeting", "meetings")} ${when}. ${since}`,
      supporting:
        "Without the CRM, Observer can see the meetings but not what came of them, so no verdict is formed.",
      evidence: evidenceRef("kingsford.verdict", "observed_sequence", NO_PAGE, shared.held),
      rulesetVersion: VERDICT_RULESET,
      components: shared.components,
    },
    headline: shared.headline,
    funnel: shared.funnel,
    briefing: {
      heading: "What can be said without the CRM",
      statements: [
        {
          text: `${plural(shared.held, "meeting is", "meetings are")} on record ${when}. No sale can be read without the CRM.`,
          tier: "observed_sequence",
          evidence: evidenceRef("kingsford.brief.1", "observed_sequence", NO_PAGE, shared.held),
        },
      ],
      generatorVersion: "briefing-1.0.0",
      generatedAt: context.generatedAt,
      caveat: "The CRM is disconnected. Nothing below the meeting is included in this summary.",
    },
    changes: [],
    alerts: [
      {
        id: "no-webiris",
        severity: "info",
        title: "WEBIRIS is not connected",
        detail: "Online behaviour and the cross-channel journey are unavailable for this project.",
        evidence: null,
        actionLabel: "Connect WEBIRIS",
        actionHref: "/madspace",
      },
    ],
    actions: [],
    dataHealth: shared.dataHealth,
  };
}

const BUILDERS: Record<
  string,
  (context: ViewContext, meetings: ObservedMeetings) => ExecutiveOverview
> = {
  prj_northgate01: northgate,
  prj_riversidew1: riverside,
  prj_beta0000001: kingsford,
};

/**
 * `context.project.id` decides, and nothing falls back to a HANDFUL of
 * bespoke fixtures written for three specific projects.
 *
 * It used to: `BUILDERS[context.project.id] ?? kingsford`. ISTER TOWER has no
 * entry here — it was added to the synthetic world after these three builders
 * were written, specifically to give a reviewer five things Northgate,
 * Riverside and Kingsford do not have together (`world.ts`'s own comment on
 * `prj_istertower1`) — so every request for its executive overview silently
 * fell through to Kingsford's, and Kingsford's is hand-typed: a fixed
 * headline naming Kingsford Yard, Kingsford's meeting count, Kingsford's
 * GBP figures re-labelled in whatever currency the REAL project uses. Opening
 * `/{tenant}/ister-tower/overview` showed a different developer's project
 * name, from a different tenant, under Alpha Estates' own currency label —
 * measured, not inferred: `dataHealth.sourcesMissing` claimed WEBIRIS and CRM
 * were absent on a project where both are connected.
 *
 * The honest fix is not a fourth hand-authored builder crammed into this
 * block — that is real analytical work, `/overview` is demoted (ADR-0023) and
 * reached only from the attention screen's evidence reference, with no
 * reviewer depending on its content today, and doctrine
 * §3 is explicit that fabricating a screen's data to keep it looking finished
 * is the one thing never to do. So an unmapped project's executive overview
 * is exactly what it is: not yet built. `NotFoundError` reaches this route's
 * existing `error.tsx` boundary, which already exists to say a screen could
 * not be produced — that is a true sentence here. A wrong one is not.
 */
export function buildExecutiveOverview(
  context: ViewContext,
  meetings: ObservedMeetings,
): ExecutiveOverview {
  const builder = BUILDERS[context.project.id];
  if (builder === undefined) {
    throw new NotFoundError(`an executive overview for ${context.project.name}`);
  }
  return builder(context, meetings);
}

/** Exposed for the money formatter used by the units read model. */
export { money };
