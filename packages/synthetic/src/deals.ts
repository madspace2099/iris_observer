import {
  DEAL_STAGES,
  type CrmDeal,
  type DealStage,
  type ShowroomSession,
} from "@observer/contracts";
import type {
  DealLadder,
  DealLadderStage,
  DeliveredDeals,
  StalledDeal,
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

const days = (n: number): string => (n === 1 ? "1 day" : `${String(Math.round(n))} days`);

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
          ? `${days(medianDaysInStage)} on this rung`
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
          daysDisplay: days(n),
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
          undated === 0
            ? null
            : `${String(undated)} open deal${undated === 1 ? "" : "s"} carry no stage date and cannot be placed.`,
        ]
          .filter((w): w is string => w !== null)
          .join(" ");

  const words = [
    `Stated by ${CONNECTOR_WORDS[deals.connector]}: ${String(deals.deals.length)} deal${deals.deals.length === 1 ? "" : "s"} as they stand now.`,
    "A rung counts the deals at that stage or further along; this is where each deal stands, not the path it took.",
    unmapped === 0
      ? null
      : `${String(unmapped)} deal${unmapped === 1 ? "" : "s"} carry a stage word not mapped yet and sit on no rung.`,
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
