import { DEAL_STAGES, type DealStage } from "@observer/contracts";
import type { DealLadder, DealLadderStage, DeliveredDeals } from "@observer/readmodels";
import { percent } from "./format";

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
};

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
export function buildDealLadder(deals: DeliveredDeals | null, locale: string): DealLadder {
  if (deals === null) return { source: "not_connected", note: NOT_CONNECTED_NOTE };

  const rank = new Map<DealStage, number>(LADDER_STAGES.map((s, i) => [s, i]));
  const unmapped = deals.deals.filter((d) => d.stage === null).length;
  const lost = deals.deals.filter((d) => d.stage === "lost").length;
  const climbing = deals.deals.filter((d) => d.stage !== null && d.stage !== "lost");
  const first = climbing.length;

  const stages: DealLadderStage[] = LADDER_STAGES.map((stage, index) => {
    const count = climbing.filter((d) => (rank.get(d.stage as DealStage) ?? -1) >= index).length;
    return {
      id: stage,
      label: STAGE_LABELS[stage],
      count,
      verified: true,
      rate: first === 0 ? null : percent(count / first, locale),
      comparisonRate: null,
    };
  });

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
  };
}
