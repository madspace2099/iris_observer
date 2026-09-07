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
export interface DeliveredDeals {
  readonly connector: ConnectorKind;
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
}

export type DealLadder =
  | {
      readonly source: "crm";
      readonly connector: ConnectorKind;
      readonly stages: readonly DealLadderStage[];
      /** Deals the CRM lists whose stage word is not mapped yet; not on any rung. */
      readonly unmapped: number;
      /** Deals the CRM marks lost; terminal, and not a rung. */
      readonly lost: number;
      readonly total: number;
      readonly fetchedAt: string;
      readonly note: string;
    }
  | {
      readonly source: "not_connected";
      readonly note: string;
    };
