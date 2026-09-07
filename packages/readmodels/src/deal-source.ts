import type { ConnectorKind, CrmDeal, DealStage } from "@observer/contracts";
import type { ProjectSummary } from "./context";

/**
 * Where a project's deals may come from when a CRM is connected.
 *
 * The same seam as `CatalogueSource`, asked before every view. A `null`
 * answer means no connector has delivered deals for this project, and the
 * ladder says the CRM is not connected rather than drawing rungs at zero.
 * Anything else is the CRM's current statement about its deals, in the
 * canonical stages the tenant's mapping produced (ADR-0021: the ladder is
 * the CRM's, authoritative; ADR-0036 decision 4: the words are mapped by a
 * person, never guessed).
 */
/**
 * Who delivered the deals. A connector, or the synthetic world standing in
 * for one on a demonstration project whose scenario declares a CRM — named
 * as such, so the ladder's note says "the demonstration CRM" and never a
 * vendor it did not read.
 */
export type DealConnector = ConnectorKind | "synthetic";

export interface DeliveredDeals {
  readonly connector: DealConnector;
  readonly deals: readonly CrmDeal[];
  /** When the connector last pulled them. */
  readonly fetchedAt: string;
}

export interface DealSource {
  dealsFor(project: ProjectSummary): Promise<DeliveredDeals | null>;
}

/**
 * One rung of the deal ladder, in the shape the Sales Flow surface draws.
 *
 * `count` is the deals whose current stage is this one or further along,
 * by the CRM's own word: a deal at Offer has been at least as far as
 * Meeting. That is survival read from a snapshot, not a history of moves,
 * and the note beside the ladder says so.
 */
export interface DealLadderStage {
  readonly id: DealStage;
  readonly label: string;
  readonly count: number;
  /** True: a system of record states this stage. Always true here; the CRM said it. */
  readonly verified: boolean;
  /** This rung against the first, already formatted. */
  readonly rate: string | null;
  readonly comparisonRate: string | null;
  /**
   * Time in stage: the median days the deals standing exactly on this rung
   * have been on it, from the stage date the CRM stated to the fetch. Null
   * where no deal on the rung carries a stage date, or none stands on it.
   */
  readonly medianDaysInStage: number | null;
  /** Ready to print: "34 days", or the words for why there is no figure. */
  readonly daysDisplay: string;
}

/**
 * One open deal, by how long it has stood where it is.
 *
 * The stalled list is the CRM's deals sorted by time stuck, drillable to the
 * unit each one is about (the meetings behind a deal are the CRM's to link,
 * and it does not). A won or lost deal is settled and never stalled; a deal
 * with no stage date cannot be placed and is counted beside the list.
 */
export interface StalledDeal {
  readonly externalId: string;
  readonly stage: DealStage;
  readonly stageLabel: string;
  readonly unitCode: string | null;
  readonly daysInStage: number;
  readonly daysDisplay: string;
  readonly enteredDisplay: string;
  readonly unitHref: string | null;
}

export type DealLadder =
  | {
      readonly source: "crm";
      readonly connector: DealConnector;
      readonly stages: readonly DealLadderStage[];
      /** Deals the CRM lists whose stage word is not mapped yet; not on any rung. */
      readonly unmapped: number;
      /** Deals the CRM marks lost; terminal, and not a rung. */
      readonly lost: number;
      readonly total: number;
      readonly fetchedAt: string;
      readonly note: string;
      /** Open deals by time stuck, longest first. Empty is a result: nothing is stuck. */
      readonly stalled: readonly StalledDeal[];
      /** Open deals with no stage date, which the list cannot place. */
      readonly undated: number;
      readonly stalledNote: string;
    }
  | {
      readonly source: "not_connected";
      readonly note: string;
    };
